#!/usr/bin/env node
/**
 * Vitest runner with a retry-once strategy for Vitest's transient worker
 * RPC timeout.
 *
 * Problem (see CG-0MS9M5UJP005PWD3): Vitest's worker RPC layer uses birpc
 * with a hard-coded 60s timeout (DEFAULT_TIMEOUT = 6e4 in
 * node_modules/vitest/dist/chunks/index.*.js). Under CPU contention a
 * worker can miss the 60s window while reporting test results back to the
 * main process (`onTaskUpdate`), and Vitest exits non-zero even though
 * every test file passed. The 60s timeout is not configurable via a
 * supported Vitest option, so the mitigation is at the runner level:
 *
 *   - Retry the run exactly once when the output shows ALL files passed
 *     AND the sole error is the transient `[vitest-worker]: Timeout
 *     calling "onTaskUpdate"` signature.
 *   - Never retry on genuine test failures — the masking guard
 *     (shouldRetryOnce) proves "all passed" from the reporter summary
 *     before a retry is allowed.
 *
 * Usage (mirrors `npx vitest run ...`):
 *   npx tsx scripts/vitest-run-with-retry.ts --project unit
 *
 * The spawned vitest output is streamed straight through; the process exit
 * code is vitest's exit code (after the optional single retry).
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The exact error signature Vitest's worker RPC layer emits on timeout. */
export const WORKER_TIMEOUT_SIGNATURE =
  '[vitest-worker]: Timeout calling "onTaskUpdate"';

export interface VitestRunResult {
  /** Process exit code (non-zero on failure or timeout). */
  status: number;
  /** Combined stdout+stderr captured from the run. */
  output: string;
}

export type VitestRunner = (args: string[]) => VitestRunResult;

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
  return allFilesPassed && !hasFailedFiles && !hasFailedTests && output.includes(WORKER_TIMEOUT_SIGNATURE);
}

/**
 * Run vitest (with retry-once) and return the final exit code.
 * `run` is injectable for tests; the production runner spawns
 * `npx vitest run <args>`.
 */
export function runWithRetry(
  args: string[],
  run: VitestRunner,
  warn: (msg: string) => void = console.warn,
): number {
  const first = run(args);
  if (first.status !== 0 && shouldRetryOnce(first.output)) {
    warn(
      '\n[retry] Vitest worker RPC timeout (onTaskUpdate) detected with all tests passing. Retrying once...\n',
    );
    return run(args).status;
  }
  return first.status;
}

/**
 * Production runner: spawn `npx vitest run <args>`, streaming combined
 * output to the parent process while capturing it for the signature check.
 */
const spawnVitestRunner: VitestRunner = (args) => {
  const result = spawnSync('npx', ['vitest', 'run', ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env },
    // Full-suite output can exceed the 1MB spawnSync default; the captured
    // output must be complete for the masking-guard signature check.
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { status: result.status ?? 1, output };
};

function main(): void {
  const args = process.argv.slice(2);
  process.exit(runWithRetry(args, spawnVitestRunner));
}

// Entry-point guard: run main() only when executed as a script, so the
// pure helpers can be imported by tests without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
