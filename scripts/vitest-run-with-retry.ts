#!/usr/bin/env node
/**
 * Vitest runner with a retry-once strategy for Vitest's transient
 * contention-induced failures that exit non-zero even when every test
 * file passed, plus a bounded wall-clock timeout that turns a true hang
 * into a diagnosable failure instead of an infinite stall.
 *
 * Problem (see CG-0MS9M5UJP005PWD3, CG-0MSCI73RH004VPCE,
 * CG-0MT08R2QR0070F3N): Vitest has three distinct contention-induced
 * failure signatures:
 *
 *   1. Worker RPC timeout — Vitest's worker RPC layer uses birpc with a
 *      hard-coded 60s timeout (DEFAULT_TIMEOUT = 6e4 in
 *      node_modules/vitest/dist/chunks/index.*.js). Under CPU contention a
 *      worker can miss the 60s window while reporting test results back to
 *      the main process (`onTaskUpdate`).
 *   2. Browser WebSocket drop — Vitest browser mode closes the browser RPC
 *      WebSocket when the page is dropped under load
 *      (`[vitest] Browser connection was closed while running tests.`),
 *      poisoning the run with an RPC error after all files completed.
 *   3. True hang — under heavy CPU contention (load avg 14-35 on 16 cores),
 *      a browser test can stall indefinitely (e.g. a `requestAnimationFrame`
 *      loop starved of frames, or a Phaser game destroy in afterEach that
 *      never completes). Vitest's per-test `testTimeout` eventually fires,
 *      but a hung test can still leave the run in a broken state and, in
 *      the worst case, the whole run never exits. Unlike signatures 1 and 2,
 *      a hang never produces an exit code on its own — the runner needs a
 *      bounded wall-clock timeout to detect and abort it.
 *
 * The mitigation is at the runner level:
 *
 *   - Retry the run exactly once when the output shows ALL files passed
 *     AND the sole error is one of the transient signatures above.
 *   - Never retry on genuine test failures — the masking guard
 *     (shouldRetryOnce) proves "all passed" from the reporter summary
 *     before a retry is allowed.
 *   - Bound every vitest attempt with a wall-clock timeout (tunable via
 *     `--timeout-ms`, default 10 minutes). When the bound is exceeded the
 *     vitest process tree is SIGTERMed (graceful), then SIGKILLed after a
 *     short grace period if it survives — a hung process that ignores
 *     SIGTERM must not stall the runner (a plain `spawnSync` timeout hangs
 *     forever on a SIGTERM-ignoring child, so this uses an async `spawn`
 *     into its own process group). The attempt reports exit code 124 with
 *     a hang diagnostic. Hangs are NEVER retried — a genuine hang must
 *     surface, not be masked.
 *
 * Usage (mirrors `npx vitest run ...`):
 *   npx tsx scripts/vitest-run-with-retry.ts --project unit
 *   npx tsx scripts/vitest-run-with-retry.ts --project browser
 *   npx tsx scripts/vitest-run-with-retry.ts --project browser --timeout-ms 600000
 *
 * The spawned vitest output is streamed straight through; the process exit
 * code is vitest's exit code (after the optional single retry), or 124
 * (hang timeout) when the wall-clock bound is hit.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The exact error signature Vitest's worker RPC layer emits on timeout. */
export const WORKER_TIMEOUT_SIGNATURE =
  '[vitest-worker]: Timeout calling "onTaskUpdate"';

/**
 * The error signature Vitest's browser mode emits when the browser RPC
 * WebSocket is closed mid-run (page dropped under load).
 */
export const BROWSER_DROP_SIGNATURE =
  '[vitest] Browser connection was closed while running tests';

/**
 * Wall-clock bound for a single vitest run (milliseconds). When a run
 * exceeds this bound it is treated as a hang and aborted
 * (CG-0MT08R2QR0070F3N). Default: 10 minutes — ample for the browser stage
 * (~24 files at 8-10s each) with headroom for CPU contention, while still
 * failing fast on a true hang. Override with `--timeout-ms <n>`.
 */
export const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Exit code reported when a run exceeds the wall-clock bound. 124 is the
 * conventional "timeout" exit code (same as GNU timeout) and is never
 * produced by vitest itself (vitest exits 0 or 1).
 */
export const HANG_TIMEOUT_EXIT_CODE = 124;

/**
 * Grace period (ms) between the SIGTERM and SIGKILL escalation when a run
 * exceeds the wall-clock bound: SIGTERM gives vitest a chance to shut its
 * workers/browser down cleanly; SIGKILL guarantees the abort completes
 * even if the process ignores the signal.
 */
export const KILL_GRACE_MS = 5000;

/**
 * Message emitted when the wall-clock bound is exceeded and the run is
 * aborted. `elapsedSecs` is the wall time before the abort.
 */
export function hangTimeoutMessage(elapsedSecs: number): string {
  return [
    `\n[hang-timeout] Vitest run did not complete within ${elapsedSecs}s — aborting (exit ${HANG_TIMEOUT_EXIT_CODE}).`,
    'The browser stage can stall indefinitely under CPU contention (e.g. a',
    'requestAnimationFrame loop starved of frames, or a Phaser game destroy',
    'that never completes). This is treated as a hang, NOT a transient',
    'failure: no retry is performed. Re-run the suite (ideally without other',
    'CPU-heavy processes competing), or run the suspected file(s) in',
    'isolation via `npx vitest run --project browser tests/<file>` to diagnose.',
  ].join('\n');
}

export interface VitestRunResult {
  /** Process exit code (non-zero on failure or timeout). */
  status: number;
  /** Combined stdout+stderr captured from the run. */
  output: string;
}

/**
 * A single vitest attempt. `args` are the forwarded vitest CLI arguments
 * (never includes `--timeout-ms` — that is consumed by this runner);
 * `timeoutMs` is the wall-clock bound for the attempt.
 */
export type VitestRunner = (
  args: string[],
  timeoutMs: number,
) => Promise<VitestRunResult> | VitestRunResult;

/**
 * True only when the run output proves every test file passed AND contains
 * the transient worker RPC timeout signature. This is the masking guard:
 * a retry must never hide a genuine test failure, so any "failed" entry in
 * the reporter summary (or a missing summary) blocks the retry.
 */
export function shouldRetryOnce(output: string): boolean {
  const hasFailedFiles = /Test Files\s+\d+\s+failed/.test(output);
  const hasFailedTests = /Tests\s+\d+\s+failed/.test(output);
  const allFilesPassed = /Test Files\s+\d+\s+passed \(\d+\)/.test(output);
  const transient =
    output.includes(WORKER_TIMEOUT_SIGNATURE) ||
    output.includes(BROWSER_DROP_SIGNATURE);
  return allFilesPassed && !hasFailedFiles && !hasFailedTests && transient;
}

/**
 * Run vitest (with retry-once) and return the final exit code.
 * `run` is injectable for tests; the production runner is `runVitestAsync`.
 *
 * A wall-clock bound is applied to every attempt via `timeoutMs` (default
 * `DEFAULT_RUN_TIMEOUT_MS`). When an attempt exceeds the bound it reports
 * `HANG_TIMEOUT_EXIT_CODE` (124) and is NEVER retried — a genuine hang must
 * surface, not be masked.
 */
export async function runWithRetry(
  args: string[],
  run: VitestRunner,
  warn: (msg: string) => void = console.warn,
  timeoutMs: number = DEFAULT_RUN_TIMEOUT_MS,
): Promise<number> {
  const first = await run(args, timeoutMs);
  if (first.status === HANG_TIMEOUT_EXIT_CODE) {
    // A hang is already reported by the runner; retrying would only
    // double the wall-clock cost. Surface it.
    return first.status;
  }
  if (first.status !== 0 && shouldRetryOnce(first.output)) {
    warn(
      '\n[retry] Vitest transient failure (worker RPC timeout or browser connection drop) ' +
        'detected with all tests passing. Retrying once...\n',
    );
    return (await run(args, timeoutMs)).status;
  }
  return first.status;
}

/**
 * Resolve the vitest binary shipped in the local `node_modules` (the
 * worktree symlinks the main checkout's `node_modules`, so this works in
 * worktrees too). Spawning vitest directly (instead of via `npx`) means
 * the wall-clock timeout can kill vitest itself, not an npx wrapper that
 * would orphan the vitest process tree.
 */
export function resolveVitestBin(cwd: string = process.cwd()): string {
  const candidates = [
    path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(cwd, 'node_modules', '.bin', 'vitest'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `vitest binary not found under ${path.join(cwd, 'node_modules')} — run \`npm install\` first.`,
  );
}

/**
 * Production runner: spawn `node <vitest-bin> run <args>` asynchronously in
 * its own process group, streaming combined output to the parent process
 * while capturing a bounded tail for the masking-guard signature check.
 *
 * The wall-clock bound is enforced with an async timer: when it elapses the
 * whole process group is SIGTERMed (graceful), and SIGKILLed after
 * `killGraceMs` if it survives. An async `spawn` is required here — a
 * `spawnSync` with a `timeout` hangs forever if the child ignores SIGTERM
 * (a genuinely hung vitest would stall the runner instead of aborting).
 *
 * `binPath` and `killGraceMs` are injectable for tests.
 */
export async function runVitestAsync(
  args: string[],
  timeoutMs: number,
  binPath: string = resolveVitestBin(),
  killGraceMs: number = KILL_GRACE_MS,
): Promise<VitestRunResult> {
  const startedAt = Date.now();
  // Spawn into its own process group so the timeout can signal the whole
  // tree (vitest + tinypool workers + Playwright Chromium), not just the
  // direct child.
  const child = spawn(process.execPath, [binPath, 'run', ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: true,
  });

  // Bounded captured tail (the transient signatures and the reporter
  // summary — the only things the masking guard reads — appear at the END
  // of a run's output). Keeps memory bounded for a full suite (~10s of MB).
  const MAX_CAPTURE = 8 * 1024 * 1024;
  let captured = '';
  const sink = (stream: NodeJS.ReadableStream, target: NodeJS.WriteStream) => {
    stream.on('data', (chunk: Buffer) => {
      target.write(chunk);
      captured += chunk.toString();
      if (captured.length > MAX_CAPTURE) {
        captured = captured.slice(-MAX_CAPTURE);
      }
    });
  };
  sink(child.stdout, process.stdout);
  sink(child.stderr, process.stderr);

  // Signal the whole process group. Negative pid = the group led by the
  // detached child.
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      if (child.pid !== undefined) {
        process.kill(-child.pid, signal);
      }
    } catch {
      /* child already exited */
    }
  };

  let timedOut = false;
  const killTimer = setTimeout(() => {
    timedOut = true;
    signalGroup('SIGTERM');
    // Escalate to SIGKILL (unignorable) after the grace period so a hung
    // process that ignores SIGTERM cannot stall the runner.
    const escalation = setTimeout(() => {
      signalGroup('SIGKILL');
    }, killGraceMs);
    escalation.unref?.();
  }, timeoutMs);
  killTimer.unref?.();

  const status = await new Promise<number>((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => {
      resolve(timedOut ? HANG_TIMEOUT_EXIT_CODE : code ?? 1);
    });
  });
  clearTimeout(killTimer);

  if (timedOut) {
    const elapsedSecs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const message = hangTimeoutMessage(elapsedSecs);
    process.stderr.write(message + '\n');
    return { status: HANG_TIMEOUT_EXIT_CODE, output: captured + message };
  }
  return { status, output: captured };
}

/** Backwards-compatible alias kept for imports that referenced the sync name. */
export const runVitestSync = runVitestAsync;

/**
 * Parse the runner's own `--timeout-ms <n>` / `--timeout-ms=<n>` flag out
 * of the CLI arguments, forwarding everything else to vitest. Throws on an
 * invalid value so `main` can exit 2 with a clear message.
 */
export function parseTimeoutArgs(args: string[]): {
  timeoutMs: number;
  forwarded: string[];
} {
  let timeoutMs = DEFAULT_RUN_TIMEOUT_MS;
  const forwarded: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let raw: string | undefined;
    if (arg === '--timeout-ms') {
      raw = args[++i];
    } else if (arg.startsWith('--timeout-ms=')) {
      raw = arg.split('=')[1];
    } else {
      forwarded.push(arg);
      continue;
    }
    const parsed = Number(raw);
    if (raw === undefined || !Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `Invalid --timeout-ms value: "${raw}". Expected a positive number of milliseconds.`,
      );
    }
    timeoutMs = parsed;
  }
  return { timeoutMs, forwarded };
}

async function main(): Promise<void> {
  let parsed: { timeoutMs: number; forwarded: string[] };
  try {
    parsed = parseTimeoutArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(2);
  }
  process.exit(await runWithRetry(parsed.forwarded, runVitestAsync, console.warn, parsed.timeoutMs));
}

// Entry-point guard: run main() only when executed as a script, so the
// pure helpers can be imported by tests without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
