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
 *     AND the sole error is one of the transient signatures above — OR when
 *     the summary reports failed files/tests but every reported error is
 *     attributable to the transient signature itself (the failed-file
 *     variant of the same contention transient, CG-0MUIMM28K001W88F).
 *   - If the retry ALSO reports a pure transient failure, accept the run
 *     as green: there is no test failure to mask, and the non-zero exit is
 *     purely a post-completion teardown RPC artefact. This keeps the gate
 *     resilient when CPU contention persists across both attempts
 *     (CG-0MUF0LU4X006IXXU).
 *   - Never retry or accept on genuine test failures — the masking guard
 *     (shouldRetryOnce) attributes every reported failure to the transient
 *     signature before a retry is allowed.
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
 * Op-in project-coverage gate (CG-0MVL21CVM003VK5H):
 *
 *   The retry/acceptance logic above reasons purely about the run's output
 *   text. That leaves a residual gap: a run that silently dropped part of
 *   the suite (e.g. Vitest 3.2.7's `executeTests` group loop aborts when an
 *   earlier `sequence.groupOrder` group's pool run rejects, dropping every
 *   later group while still summarising the executed files as green) can
 *   still be accepted — the summary reads `Test Files N passed (N)` with the
 *   transient signature present. This runner therefore supports an OPTO-IN
 *   expectation of the test-file set the run is supposed to execute:
 *
 *     npx tsx scripts/vitest-run-with-retry.ts --expect-project-coverage \
 *       --project unit [--timeout-ms 300000] ...
 *     npx tsx scripts/vitest-run-with-retry.ts \
 *       --expected-file tests/a.test.ts --expected-file tests/b.test.ts ...
 *
 *   - `--expect-project-coverage` derives the expected set from a pre-flight
 *     collection-only `vitest list --filesOnly --json` over the forwarded
 *     project/args (no browser launch; `--staticParse` is used and retried
 *     once without it for Vitest 3.x consumers that reject the flag).
 *   - `--expected-file <path>` (repeatable) pins an explicit expected set —
 *     the low-level, deterministic seam for tests and non-standard layouts.
 *   - When an expectation is active, the executed file set is captured per
 *     attempt (an injected `--reporter=json --outputFile.json=<tmp>` is
 *     appended so the set is exact and independent of the caller's
 *     reporters), and any set difference — missing OR extra files — is a
 *     genuine failure: non-zero exit, never `accepted-transient`, never
 *     converted to green by the retry, regardless of the run's own exit
 *     code. A pre-flight collection failure, timeout or empty set fails
 *     closed with a diagnostic (exit 2). Hang semantics are unchanged
 *     (exit 124, never retried, reported before any coverage check).
 *   - Without the flags the runner is byte-for-byte identical to its
 *     pre-coverage behaviour (regression-pinned by the fixtures in
 *     tests/scripts/vitest-run-with-retry.test.ts).
 *
 * Usage (mirrors `npx vitest run ...`):
 *   npx tsx scripts/vitest-run-with-retry.ts --project unit
 *   npx tsx scripts/vitest-run-with-retry.ts --project browser
 *   npx tsx scripts/vitest-run-with-retry.ts --project browser --timeout-ms 600000
 *   npx tsx scripts/vitest-run-with-retry.ts --expect-project-coverage --project unit
 *
 * The spawned vitest output is streamed straight through; the process exit
 * code is vitest's exit code (after the optional single retry), 124 (hang
 * timeout) when the wall-clock bound is hit, or 1 (coverage failure) /
 * 2 (pre-flight failure) under the opt-in coverage gate.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
 * Wall-clock bound for the pre-flight `vitest list` collection (ms). A
 * static-parse list adds a few seconds; the bound only guarantees the
 * pre-flight can never hang the gate.
 */
export const LIST_TIMEOUT_MS = 120_000;

/**
 * Exit code reported when the opt-in pre-flight (expected-set derivation)
 * fails or times out. Distinct from a genuine test failure (1) and a hang
 * (124) so a gate operator can tell a collection problem from a red run.
 */
export const PREFLIGHT_FAILURE_EXIT_CODE = 2;

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

/**
 * Abbreviated hang diagnostic for the pre-flight `vitest list` collection —
 * enough to surface + fail closed without the full browser-stage essay.
 */
export function listHangMessage(elapsedSecs: number): string {
  return `\n[hang-timeout] vitest list did not complete within ${elapsedSecs}s — aborting (exit ${HANG_TIMEOUT_EXIT_CODE}).`;
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
 * A single pre-flight `vitest list` collection. `args` are the collection
 * CLI arguments (subcommand `list` is appended by the production runner);
 * `timeoutMs` is the wall-clock bound for the collection. Injectable so
 * unit tests never need a real vitest process.
 */
export type VitestListRunner = (
  args: string[],
  timeoutMs: number,
) => Promise<VitestRunResult> | VitestRunResult;

/** Thrown by the opt-in expected-set derivation; `main` exits with 2. */
export class PreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreflightError';
  }
}

// ── Argument parsing ─────────────────────────────────────────

export interface ParsedRunnerArgs {
  /** Wall-clock bound for each vitest attempt. */
  timeoutMs: number;
  /** Every argument forwarded to vitest itself. */
  forwarded: string[];
  /** Explicit expected-file values (`--expected-file <path>`, repeatable). */
  expectedFiles: string[];
  /** True when `--expect-project-coverage` was passed. */
  expectProjectCoverage: boolean;
}

/**
 * Parse the runner's own flags out of the CLI arguments, forwarding
 * everything else to vitest:
 *
 *   --timeout-ms <n> | --timeout-ms=<n>          run wall-clock bound
 *   --expected-file <path> | --expected-file=<p> explicit expected file
 *                                                (repeatable)
 *   --expect-project-coverage                    derive the expected set via
 *                                                vitest list pre-flight
 *
 * Throws on an invalid value so `main` can exit 2 with a clear message.
 */
export function parseRunnerArgs(rawArgs: string[]): ParsedRunnerArgs {
  let timeoutMs = DEFAULT_RUN_TIMEOUT_MS;
  const forwarded: string[] = [];
  const expectedFiles: string[] = [];
  let expectProjectCoverage = false;

  const parsePositiveInt = (raw: string | undefined, flag: string): number => {
    const parsed = Number(raw);
    if (raw === undefined || raw === '' || !Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `Invalid ${flag} value: "${raw}". Expected a positive number of milliseconds.`,
      );
    }
    return parsed;
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--timeout-ms') {
      const raw = rawArgs[++i];
      timeoutMs = parsePositiveInt(raw, '--timeout-ms');
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      const raw = arg.slice('--timeout-ms='.length);
      timeoutMs = parsePositiveInt(raw, '--timeout-ms');
      continue;
    }
    if (arg === '--expected-file') {
      const raw = rawArgs[++i];
      if (raw === undefined || raw === '') {
        throw new Error('Invalid --expected-file: missing value. Expected a test-file path.');
      }
      expectedFiles.push(raw);
      continue;
    }
    if (arg.startsWith('--expected-file=')) {
      const raw = arg.slice('--expected-file='.length);
      if (raw === '') {
        throw new Error('Invalid --expected-file: missing value. Expected a test-file path.');
      }
      expectedFiles.push(raw);
      continue;
    }
    if (arg === '--expect-project-coverage') {
      expectProjectCoverage = true;
      continue;
    }
    forwarded.push(arg);
  }
  return { timeoutMs, forwarded, expectedFiles, expectProjectCoverage };
}

/** Backwards-compatible subset parser kept for imports that referenced it. */
export function parseTimeoutArgs(args: string[]): {
  timeoutMs: number;
  forwarded: string[];
} {
  const parsed = parseRunnerArgs(args);
  return { timeoutMs: parsed.timeoutMs, forwarded: parsed.forwarded };
}

// ── Expected-set derivation (pre-flight `vitest list`) ───────

/**
 * Normalise a single file reference to a repo-relative POSIX path.
 *
 * Browser mode reports modules with URL-ish names, so besides plain paths
 * this accepts `file:///…`, `http(s)://<host>/@fs/<abs path>` (Vite's
 * filesystem escape used by Vitest browser modules) and a trailing
 * `?query`/`#hash` on any of them.
 */
export function toRepoRelativePosix(file: string, cwd: string = process.cwd()): string {
  let resolved = file.trim().replace(/[?#].*$/, '');
  if (resolved.startsWith('file://')) {
    resolved = fileURLToPath(resolved);
  } else if (/^https?:\/\//.test(resolved)) {
    const pathname = new URL(resolved).pathname;
    // Vite serves out-of-root files under /@fs/<absolute path>.
    resolved = pathname.startsWith('/@fs/') ? pathname.slice('/@fs'.length) : pathname;
  } else if (resolved.startsWith('/@fs/')) {
    resolved = resolved.slice('/@fs'.length);
  }
  let rel: string;
  if (path.isAbsolute(resolved)) {
    rel = path.relative(cwd, resolved);
  } else {
    // Already relative — strip a leading ./ and normalise separators.
    rel = resolved;
  }
  return rel.split(path.sep).join('/').replace(/^\.\//, '');
}

/** Normalise, de-duplicate and sort a file list to repo-relative POSIX paths. */
export function normaliseFiles(
  files: Iterable<string>,
  cwd: string = process.cwd(),
): string[] {
  const set = new Set<string>();
  for (const file of files) {
    set.add(toRepoRelativePosix(file, cwd));
  }
  return [...set].sort();
}

/**
 * Parse `vitest list --filesOnly --json` stdout into a normalised
 * repo-relative POSIX set. Accepts both the array shape
 * `[{ file, projectName }, …]` / `["path", …]` (Vitest 4.x) and a
 * `{ testFiles: [...] }` wrapper for older consumers. Throws on JSON that
 * is neither.
 */
export function parseExpectedSet(
  stdout: string,
  cwd: string = process.cwd(),
): string[] {
  const data: unknown = JSON.parse(stdout);
  const files: string[] = [];
  const collect = (entry: unknown): string | null => {
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object' && entry !== null) {
      const rec = entry as { file?: unknown };
      if (typeof rec.file === 'string') return rec.file;
    }
    return null;
  };
  if (Array.isArray(data)) {
    for (const entry of data) {
      const file = collect(entry);
      if (file !== null) files.push(file);
    }
  } else if (typeof data === 'object' && data !== null) {
    const wrapper = data as { testFiles?: unknown };
    if (Array.isArray(wrapper.testFiles)) {
      for (const entry of wrapper.testFiles) {
        const file = collect(entry);
        if (file !== null) files.push(file);
      }
    }
  }
  return normaliseFiles(files, cwd);
}

/**
 * True when a failed `vitest list` invocation most plausibly rejected the
 * `--staticParse` flag (Vitest 3.x consumers) rather than some other error.
 * Deliberately tolerant — a false positive merely triggers one extra
 * collection attempt without the flag, which fails closed identically.
 */
export function looksLikeUnknownStaticParse(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    /unknown option/i.test(lower) ||
    (lower.includes('staticparse') && /error|invalid|unexpected|not a valid|option/i.test(lower))
  );
}

/**
 * Derive the expected repo-relative test-file set from a collection-only
 * `vitest list --filesOnly --json` over the forwarded args. Uses
 * `--staticParse` (no test imports, so the browser stage pays no second
 * Chromium start); if the consumer's vitest version rejects the flag it is
 * retried once without it before failing closed.
 *
 * Fails closed on every failure mode (PreflightError): non-zero status
 * after the degradation retry, hang (exit 124), an empty file set, or
 * unparsable JSON. Callers must treat the error as "expectation unknown ⇒
 * refuse to run the gate" — they must never silently downgrade to no
 * expectation (AC 9 of CG-0MVL21CVM003VK5H).
 */
export async function deriveExpectedFiles(
  forwarded: string[],
  runList: VitestListRunner,
  cwd: string = process.cwd(),
  timeoutMs: number = LIST_TIMEOUT_MS,
): Promise<string[]> {
  const collectionArgs = (withStaticParse: boolean): string[] => {
    const base = ['--filesOnly', '--json'];
    const args = withStaticParse ? ['--staticParse', ...base] : base;
    return [...args, ...forwarded];
  };

  let result = await runList(collectionArgs(true), timeoutMs);
  if (result.status !== 0 && looksLikeUnknownStaticParse(result.output)) {
    // Degradation for Vitest 3.x consumers that reject --staticParse.
    result = await runList(collectionArgs(false), timeoutMs);
  }

  if (result.status === HANG_TIMEOUT_EXIT_CODE) {
    throw new PreflightError(
      `vitest list did not complete within ${Math.round(timeoutMs / 1000)}s (exit ${HANG_TIMEOUT_EXIT_CODE})`,
    );
  }
  if (result.status !== 0) {
    const tail = result.output.trim().split('\n').slice(-6).join('\n');
    throw new PreflightError(
      `vitest list exited ${result.status}${tail ? `:\n${tail}` : ''}`,
    );
  }
  let files: string[];
  try {
    files = parseExpectedSet(result.output, cwd);
  } catch (err) {
    throw new PreflightError(
      `vitest list produced unparsable JSON (${(err as Error).message})`,
    );
  }
  if (files.length === 0) {
    throw new PreflightError(
      'vitest list returned an empty file set — failing closed (an empty project cannot be ' +
        'distinguished from a broken collection, so no expectation is assumed)',
    );
  }
  return files;
}

/** Human-readable diagnostic for a failed pre-flight collection. */
export function preflightFailureMessage(problem: string): string {
  return [
    `[preflight-failed] Could not derive the expected test-file set (vitest list --filesOnly --json): ${problem}`,
    'The coverage gate fails closed: without a trustworthy expectation it cannot prove the run',
    'executed the intended suite, so no test run is attempted.',
  ].join('\n');
}

// ── Executed-set capture ─────────────────────────────────────

/**
 * Captures the set of test files a vitest attempt actually executed.
 *
 * The preferred mechanism injects the JSON reporter alongside the default
 * reporter: `--reporter=default --reporter=json --outputFile.json=<tmp>`,
 * so the executed set is exact (it records every file that completed,
 * passing or failing) and independent of the caller's own reporters, while
 * the default reporter output (which the masking guard and the `Test Files
 * N passed (N)` summary detection rely on) is preserved. The temp artifact
 * is removed after the attempt.
 *
 * `readExecutedFiles` is injectable so unit tests can supply the set
 * without touching the filesystem; when it is absent the produced JSON
 * artifact is parsed, falling back to default-reporter per-file lines only
 * if the artifact is missing/unreadable.
 */
export class ExecutedSetCapture {
  private static counter = 0;
  readonly artefactPath: string;
  private readonly cwd: string;
  private readonly reader:
    | ((result: VitestRunResult, artefactPath: string) => string[] | null)
    | undefined;

  constructor(options: {
    /** Directory for the JSON artifact; defaults to os.tmpdir(). */
    workDir?: string;
    cwd?: string;
    readExecutedFiles?: (result: VitestRunResult, artefactPath: string) => string[] | null;
  }) {
    this.cwd = options.cwd ?? process.cwd();
    this.artefactPath = path.join(
      options.workDir ?? os.tmpdir(),
      `vitest-executed-${process.pid}-${ExecutedSetCapture.counter++}.json`,
    );
    this.reader = options.readExecutedFiles;
  }

  /** Append the capture flags to the forwarded vitest args. */
  augmentArgs(args: string[]): string[] {
    return [
      ...args,
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${this.artefactPath}`,
    ];
  }

  /**
   * The repo-relative POSIX set of files executed by a finished attempt,
   * or `null` when the set is indeterminable (hang, missing artifact and
   * no parseable per-file lines). A caller that supplied an expectation
   * must treat `null` as a coverage failure.
   */
  executedFiles(result: VitestRunResult): string[] | null {
    if (result.status === HANG_TIMEOUT_EXIT_CODE) return null;
    if (this.reader) return this.reader(result, this.artefactPath);
    return defaultReadExecutedFiles(result.output, this.artefactPath, this.cwd);
  }

  /** Best-effort removal of the temp JSON artifact. */
  cleanup(): void {
    try {
      fs.rmSync(this.artefactPath, { force: true });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Default executed-file-set reader: parse the injected JSON reporter
 * artifact first (exact), then fall back to default-reporter per-file lines
 * only if the artifact is missing or yields an empty set. Returns `null`
 * when neither source yields a set — "expectation supplied but executed set
 * indeterminable".
 */
export function defaultReadExecutedFiles(
  output: string,
  artefactPath: string,
  cwd: string = process.cwd(),
): string[] | null {
  try {
    if (fs.existsSync(artefactPath)) {
      const data = JSON.parse(fs.readFileSync(artefactPath, 'utf8')) as {
        testResults?: Array<{ name?: unknown }>;
      };
      const names = (data.testResults ?? [])
        .map((r) => r.name)
        .filter((n): n is string => typeof n === 'string');
      if (names.length > 0) return normaliseFiles(names, cwd);
    }
  } catch {
    /* fall through to per-file line parsing */
  }
  const fromLines = parseExecutedFromOutput(output, cwd);
  return fromLines;
}

/**
 * Fallback executed-set parser for default-reporter per-file lines:
 *
 *   ✓ |unit| tests/foo.test.ts (2 tests) 65ms
 *   ❯ |unit| tests/foo.test.ts (1 test | 1 failed) 8ms
 *
 * Returns `null` when no per-file lines are found (weaker than the JSON
 * artifact; sufficient only when the output still shows each executed file).
 */
export function parseExecutedFromOutput(
  output: string,
  cwd: string = process.cwd(),
): string[] | null {
  const files = new Set<string>();
  const re = /^\s*[✓×❯✗↓]\s+(?:\|[^|\r\n]+\|\s+)?(\S+)\s+\(\d+ tests?/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(output)) !== null) {
    const file = match[1];
    if (file) files.add(toRepoRelativePosix(file, cwd));
  }
  return files.size > 0 ? [...files].sort() : null;
}

// ── Coverage evaluation ──────────────────────────────────────

export interface CoverageReport {
  ok: boolean;
  /** Size of the expected set. */
  expected: number;
  /** Size of the executed set; `null` when indeterminable. */
  ran: number | null;
  /** Expected files that never ran (repo-relative POSIX, sorted). */
  missing: string[];
  /** Files that ran beyond the expected set (repo-relative POSIX, sorted). */
  extra: string[];
  /** True when an expectation was supplied but the executed set was unreadable. */
  indeterminate: boolean;
}

/**
 * Compare the executed file set against the expectation. Any difference —
 * missing OR extra — fails; an unreadable executed set (`ran === null`)
 * fails closed as `indeterminate`. Lists are normalized/deduplicated so the
 * comparison is set-based, not order-dependent.
 */
export function evaluateCoverage(
  expected: string[],
  ran: string[] | null,
  cwd: string = process.cwd(),
): CoverageReport {
  const normalisedRan = ran ? normaliseFiles(ran, cwd) : null;
  const expectedN = normaliseFiles(expected, cwd);
  if (normalisedRan === null) {
    return {
      ok: false,
      expected: expectedN.length,
      ran: null,
      missing: [...expectedN],
      extra: [],
      indeterminate: true,
    };
  }
  const missing = expectedN.filter((f) => !normalisedRan.includes(f));
  const extra = normalisedRan.filter((f) => !expectedN.includes(f));
  return {
    ok: missing.length === 0 && extra.length === 0,
    expected: expectedN.length,
    ran: normalisedRan.length,
    missing,
    extra,
    indeterminate: false,
  };
}

/**
 * Multi-line coverage failure diagnostic (written to stderr alongside the
 * non-zero exit): names every missing and every extra file, and states
 * `expected=N ran=M` (AC 3 of CG-0MVL21CVM003VK5H).
 */
export function coverageDiagnostic(report: CoverageReport): string {
  const ranLabel = report.indeterminate ? 'indeterminate' : String(report.ran);
  const lines = [
    `[coverage-failed] Vitest run's executed file set differs from the expected project set (expected=${report.expected} ran=${ranLabel}).`,
  ];
  if (report.indeterminate) {
    lines.push(
      'The executed file set could not be determined from the attempt (the JSON reporter',
      'artifact and per-file report lines were both unavailable). An expectation was',
      'supplied, so an unverifiable run is treated as a genuine coverage failure.',
    );
  }
  if (report.missing.length > 0) {
    lines.push(`Missing files (never executed; ${report.missing.length}):`);
    for (const file of report.missing) lines.push(`  - ${file}`);
  }
  if (report.extra.length > 0) {
    lines.push(`Extra files (executed but not expected; ${report.extra.length}):`);
    for (const file of report.extra) lines.push(`  - ${file}`);
  }
  return lines.join('\n');
}

// ── Coverage-aware runWithRetry ──────────────────────────────

export interface RunWithRetryOptions {
  /**
   * Expected repo-relative POSIX test-file set. Absent or empty = no
   * expectation (legacy behaviour, byte-identical decisions).
   */
  expectedFiles?: string[];
  /** Injectable executed-set reader (see ExecutedSetCapture). */
  readExecutedFiles?: (result: VitestRunResult, artefactPath: string) => string[] | null;
  /** Directory for the captured JSON artifact (defaults to os.tmpdir()). */
  workDir?: string;
}

/** How the `[vitest-runner]` summary line records the expectation. */
export type RunCoverageLabel =
  | { kind: 'unset' }
  | { kind: 'set'; expected: number; ran: number }
  | { kind: 'set-indeterminate'; expected: number };

export function coverageLabelFromReport(report: CoverageReport): RunCoverageLabel {
  if (report.indeterminate || report.ran === null) {
    return { kind: 'set-indeterminate', expected: report.expected };
  }
  return { kind: 'set', expected: report.expected, ran: report.ran };
}

/** The auditable expectation suffix for the summary line. */
export function coverageSuffix(label: RunCoverageLabel): string {
  switch (label.kind) {
    case 'unset':
      return ' expected=unset';
    case 'set':
      return ` expected=${label.expected} ran=${label.ran}`;
    case 'set-indeterminate':
      return ` expected=${label.expected} ran=indeterminate`;
  }
}

/**
 * True when a retry is allowed.
 *
 * Two shapes qualify (CG-0MUF0LU4X006IXXU, CG-0MUIMM28K001W88F):
 *
 *   1. An all-passed transient failure — every test file passed and the sole
 *      error is a transient signature.
 *   2. An *attributable* failed-file transient — the summary reports failed
 *      files/tests, but every error block in the output is the transient
 *      signature itself (`failuresAreTransientOnly`). This is the failed-file
 *      variant of the same contention transient that previously defeated the
 *      all-passed-only guard and failed the gate spuriously.
 *
 * Anything else — a genuine assertion/original error, a missing summary, or a
 * failure whose errors cannot be attributed to the signature — returns false,
 * so a retry can never mask a real failure.
 */
export function shouldRetryOnce(output: string): boolean {
  if (!hasTransientSignature(output)) return false;
  const hasFailedFiles = /Test Files\s+\d+\s+failed/.test(output);
  const hasFailedTests = /Tests\s+\d+\s+failed/.test(output);
  if (hasFailedFiles || hasFailedTests) {
    return failuresAreTransientOnly(output);
  }
  return /Test Files\s+\d+\s+passed \(\d+\)/.test(output);
}

/** True when the output contains either transient contention signature. */
export function hasTransientSignature(output: string): boolean {
  return (
    output.includes(WORKER_TIMEOUT_SIGNATURE) ||
    output.includes(BROWSER_DROP_SIGNATURE)
  );
}

/**
 * Split the run output into error blocks — each is the text from an error
 * line up to (but not including) the next error line. Vitest prints one such
 * block per unhandled error and per failed test/suite, so attributing each
 * block independently tells us whether the reported failures are the
 * transient signature itself or a genuine assertion/original error.
 */
export function errorBlocks(output: string): string[] {
  const starts: number[] = [];
  const re = /^(?:[A-Za-z][\w.]*)?Error(?:\s*\[[^\]]*\])?:/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(output)) !== null) {
    starts.push(match.index);
  }
  return starts.map((start, i) => output.slice(start, starts[i + 1] ?? output.length));
}

/**
 * True when the run's failure evidence consists *only* of the transient
 * signature: at least one error block is present, and every error block
 * contains a transient signature. This is the attribution step that lets the
 * masking guard recover a `1 failed` worker-timeout run (the poisoned file's
 * only error is the timeout itself) while still refusing a genuine assertion
 * failure that merely coincides with the signature
 * (CG-0MUIMM28K001W88F approach (a)).
 *
 * Requiring at least one transient block keeps a bare failed summary with the
 * signature string elsewhere (no attributable error) from being accepted.
 */
export function failuresAreTransientOnly(output: string): boolean {
  const blocks = errorBlocks(output);
  if (blocks.length === 0) return false;
  return blocks.every(
    (block) =>
      block.includes(WORKER_TIMEOUT_SIGNATURE) ||
      block.includes(BROWSER_DROP_SIGNATURE),
  );
}

/**
 * Run vitest (with retry-once) and return the final exit code.
 * `run` is injectable for tests; the production runner is `runVitestAsync`.
 *
 * A wall-clock bound is applied to every attempt via `timeoutMs` (default
 * `DEFAULT_RUN_TIMEOUT_MS`). When an attempt exceeds the bound it reports
 * `HANG_TIMEOUT_EXIT_CODE` (124) and is NEVER retried — a genuine hang must
 * surface, not be masked.
 *
 * Transient recovery, in two stages. First, `shouldRetryOnce` decides whether
 * the run is recoverable: either an all-passed transient failure, or a
 * failed-file summary whose every reported error is the transient signature
 * itself (CG-0MUF0LU4X006IXXU, CG-0MUIMM28K001W88F):
 *
 *   1. Retry once after an attributable transient failure.
 *   2. If the retry is ALSO an attributable transient failure, accept the run
 *      as green (exit 0). No test failure was masked — the guard attributed
 *      every reported failure to the transient signature.
 *
 * Opt-in coverage gate (AC 2/4 of CG-0MVL21CVM003VK5H): when `options.
 * expectedFiles` is supplied, every attempt's executed file set is captured
 * and compared against the expectation — on the first attempt before the
 * retry decision and again on the second before any acceptance. A set
 * difference (missing OR extra files) is a genuine failure: non-zero exit
 * (1), never `accepted-transient`, never converted to green by the retry,
 * regardless of the attempt's own exit code (a dropped group can exit 0
 * with an all-passed summary). "Expectation supplied but executed set
 * indeterminable" fails identically. When no expectation is supplied every
 * decision and exit code is identical to the pre-coverage runner.
 *
 * A final `[vitest-runner] attempts=N status=S outcome=... args="..."` line
 * is emitted via `warn` after every run, so the attempt count and outcome
 * stay visible without parsing the whole captured output. When an
 * expectation is active the line additionally records `expected=N ran=M`
 * (or `expected=unset` when none), making the acceptance decision auditable.
 * (`scripts/run-ci-tests.sh` no longer truncates stage output, but the
 * one-line summary remains the canonical machine-readable diagnostic;
 * CG-0MUIMM28K001W88F.)
 */
export async function runWithRetry(
  args: string[],
  run: VitestRunner,
  warn: (msg: string) => void = console.warn,
  timeoutMs: number = DEFAULT_RUN_TIMEOUT_MS,
  options: RunWithRetryOptions = {},
): Promise<number> {
  const { expectedFiles, readExecutedFiles, workDir } = options;
  const hasExpectation = (expectedFiles?.length ?? 0) > 0;

  /** One attempt; when an expectation is active, capture the executed set. */
  const attemptOnce = async (): Promise<{
    result: VitestRunResult;
    ran: string[] | null;
  }> => {
    if (!hasExpectation) return { result: await run(args, timeoutMs), ran: null };
    const capture = new ExecutedSetCapture({ workDir, readExecutedFiles });
    try {
      const result = await run(capture.augmentArgs(args), timeoutMs);
      return { result, ran: capture.executedFiles(result) };
    } finally {
      capture.cleanup();
    }
  };

  const coverageReport = (ran: string[] | null): CoverageReport | null =>
    hasExpectation ? evaluateCoverage(expectedFiles!, ran) : null;

  const summary = (
    attempts: number,
    status: number,
    outcome: string,
    label: RunCoverageLabel,
  ): string => runSummary(args, attempts, status, outcome, label);

  const first = await attemptOnce();

  // Hang semantics are unchanged and take precedence over any coverage
  // check (AC 8): a hang is reported, never retried.
  if (first.result.status === HANG_TIMEOUT_EXIT_CODE) {
    warn(
      summary(
        1,
        first.result.status,
        'hang',
        hasExpectation ? { kind: 'set-indeterminate', expected: expectedFiles!.length } : { kind: 'unset' },
      ),
    );
    return first.result.status;
  }

  const firstCoverage = coverageReport(first.ran);

  // Coverage violation on the first attempt: never accepted. With an
  // attributable transient excuse, retry once (the drop may have been a
  // one-off contention artefact); otherwise fail now.
  if (firstCoverage && !firstCoverage.ok) {
    if (!shouldRetryOnce(first.result.output)) {
      warn(coverageDiagnostic(firstCoverage) + '\n');
      warn(summary(1, 1, 'coverage-failed', coverageLabelFromReport(firstCoverage)));
      return 1;
    }
  } else if (first.result.status === 0) {
    // Clean run: no retry, no coverage issue.
    warn(summary(1, 0, 'clean', firstCoverage ? coverageLabelFromReport(firstCoverage) : { kind: 'unset' }));
    return 0;
  } else if (!shouldRetryOnce(first.result.output)) {
    // Genuine failure (non-zero, not attributable to the transient) — no retry.
    warn(summary(1, first.result.status, 'failed', firstCoverage ? coverageLabelFromReport(firstCoverage) : { kind: 'unset' }));
    return first.result.status;
  }

  // Recoverable: attributable transient failure, or a coverage violation
  // with a transient excuse. Retry exactly once.
  warn(
    '\n[retry] Vitest transient failure (worker RPC timeout or browser connection drop) ' +
      'detected with no attributable test failure. Retrying once...\n',
  );

  const second = await attemptOnce();

  if (second.result.status === HANG_TIMEOUT_EXIT_CODE) {
    warn(
      summary(
        2,
        second.result.status,
        'hang',
        hasExpectation ? { kind: 'set-indeterminate', expected: expectedFiles!.length } : { kind: 'unset' },
      ),
    );
    return second.result.status;
  }

  const secondCoverage = coverageReport(second.ran);

  // Coverage is checked before any acceptance — a violation on the second
  // attempt is a genuine failure even if the run looks transient-recoverable.
  if (secondCoverage && !secondCoverage.ok) {
    warn(coverageDiagnostic(secondCoverage) + '\n');
    warn(summary(2, 1, 'coverage-failed', coverageLabelFromReport(secondCoverage)));
    return 1;
  }

  if (second.result.status === 0) {
    warn(summary(2, 0, 'retry-clean', secondCoverage ? coverageLabelFromReport(secondCoverage) : { kind: 'unset' }));
    return second.result.status;
  }
  if (shouldRetryOnce(second.result.output)) {
    // Both attempts completed with every test file passing (and, when an
    // expectation is active, the executed set matched it); the only error is
    // the post-completion teardown RPC timeout (or browser WebSocket drop).
    // There is no test failure to mask, so accept the run as green rather
    // than failing the gate on a runner artefact.
    warn(
      '\n[transient-accepted] Vitest transient teardown failure on BOTH attempts, ' +
        'but no attributable test failure in either — treating the run as green. ' +
        'No genuine failure was masked (the masking guard attributed every error ' +
        'to the transient signature).\n',
    );
    warn(summary(2, 0, 'accepted-transient', secondCoverage ? coverageLabelFromReport(secondCoverage) : { kind: 'unset' }));
    return 0;
  }
  warn(summary(2, second.result.status, 'retry-failed', secondCoverage ? coverageLabelFromReport(secondCoverage) : { kind: 'unset' }));
  return second.result.status;
}

/**
 * Final one-line diagnostic emitted after every run. Kept at the very end of
 * the runner's output so the attempt count and outcome are easy to locate
 * (and were preserved under the CI wrapper's former `tail -20` truncation,
 * now removed; CG-0MUF0LU4X006IXXU / CG-0MUIMM28K001W88F).
 *
 * `coverage` (optional) records the expectation state for auditability:
 * `expected=N ran=M` when a set was evaluated, `expected=N ran=indeterminate`
 * when it existed but could not be read, or `expected=unset` when no
 * expectation was supplied. Omitting it keeps the output byte-identical for
 * callers that invoke runSummary directly.
 */
export function runSummary(
  args: string[],
  attempts: number,
  status: number,
  outcome: string,
  coverage?: RunCoverageLabel,
): string {
  const suffix = coverage ? coverageSuffix(coverage) : '';
  return `[vitest-runner] attempts=${attempts} status=${status} outcome=${outcome} args="${args.join(' ')}"${suffix}`;
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

// ── Process spawning with a wall-clock bound ─────────────────

interface SpawnOptions {
  /** Stream the child's stdout/stderr to the parent as it is produced. */
  streamToParent: boolean;
  /** Bounded tail retained in `output` ('tail') or full capture ('full'). */
  mode: 'tail' | 'full';
  timeoutMs: number;
  /** SIGTERM → SIGKILL grace period when the bound elapses. */
  killGraceMs: number;
}

const MAX_CAPTURED_TAIL = 8 * 1024 * 1024;

/**
 * Shared spawn core: run `process.execPath <argv[0]...>` in its own process
 * group with a bounded wall-clock timer. On timeout the whole group is
 * SIGTERMed and SIGKILLed after `killGraceMs` if it survives; a timed-out
 * return carries `HANG_TIMEOUT_EXIT_CODE`. Full capture is bounded for
 * 'tail' mode only.
 */
interface VitestProcessResult extends VitestRunResult {
  timedOut: boolean;
  /** Wall time in whole seconds before the attempt returned. */
  elapsedSecs: number;
}

async function runVitestProcess(
  argv: string[],
  opts: SpawnOptions,
): Promise<VitestProcessResult> {
  const startedAt = Date.now();
  let captured = '';
  const child = spawn(process.execPath, argv, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: true,
  });

  const sink = (stream: NodeJS.ReadableStream, target?: NodeJS.WriteStream) => {
    stream.on('data', (chunk: Buffer) => {
      if (target) target.write(chunk);
      captured += chunk.toString();
      if (opts.mode === 'tail' && captured.length > MAX_CAPTURED_TAIL) {
        captured = captured.slice(-MAX_CAPTURED_TAIL);
      }
    });
  };
  if (opts.streamToParent) {
    sink(child.stdout, process.stdout);
    sink(child.stderr, process.stderr);
  } else {
    sink(child.stdout);
    sink(child.stderr);
  }

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
    }, opts.killGraceMs);
    escalation.unref?.();
  }, opts.timeoutMs);
  killTimer.unref?.();

  const status = await new Promise<number>((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => {
      resolve(timedOut ? HANG_TIMEOUT_EXIT_CODE : code ?? 1);
    });
  });
  clearTimeout(killTimer);

  const elapsedSecs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  return { status, output: captured, timedOut, elapsedSecs };
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
  const attempted = await runVitestProcess([binPath, 'run', ...args], {
    streamToParent: true,
    mode: 'tail',
    timeoutMs,
    killGraceMs,
  });
  if (attempted.timedOut) {
    const message = hangTimeoutMessage(attempted.elapsedSecs);
    process.stderr.write(message + '\n');
    return { status: HANG_TIMEOUT_EXIT_CODE, output: attempted.output + message };
  }
  return { status: attempted.status, output: attempted.output };
}

/** Backwards-compatible alias kept for imports that referenced the sync name. */
export const runVitestSync = runVitestAsync;

/**
 * Production pre-flight collector: spawn
 * `node <vitest-bin> list <args>` in its own process group with the same
 * wall-clock bound and SIGTERM/SIGKILL escalation as a run. Output is fully
 * captured (not streamed — the collection is a quiet pre-check) and an
 * overrun reports exit 124 with the abbreviated hang diagnostic.
 *
 * `binPath` and `killGraceMs` are injectable for tests.
 */
export async function runVitestListAsync(
  args: string[],
  timeoutMs: number,
  binPath: string = resolveVitestBin(),
  killGraceMs: number = KILL_GRACE_MS,
): Promise<VitestRunResult> {
  const attempted = await runVitestProcess([binPath, 'list', ...args], {
    streamToParent: false,
    mode: 'full',
    timeoutMs,
    killGraceMs,
  });
  if (attempted.timedOut) {
    const message = listHangMessage(attempted.elapsedSecs);
    process.stderr.write(message + '\n');
    return { status: HANG_TIMEOUT_EXIT_CODE, output: attempted.output + message };
  }
  return { status: attempted.status, output: attempted.output };
}

async function main(): Promise<void> {
  let parsed: ParsedRunnerArgs;
  try {
    parsed = parseRunnerArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(2);
  }

  // Opt-in expectation (AC 1): derive from the project, or pin explicitly.
  let expectedFiles: string[] | undefined;
  if (parsed.expectProjectCoverage) {
    try {
      expectedFiles = await deriveExpectedFiles(parsed.forwarded, runVitestListAsync);
    } catch (err) {
      if (err instanceof PreflightError) {
        process.stderr.write(preflightFailureMessage(err.message) + '\n');
        process.exit(PREFLIGHT_FAILURE_EXIT_CODE);
      }
      throw err;
    }
  } else if (parsed.expectedFiles.length > 0) {
    expectedFiles = normaliseFiles(parsed.expectedFiles);
  }

  process.exit(
    await runWithRetry(parsed.forwarded, runVitestAsync, console.warn, parsed.timeoutMs, {
      expectedFiles,
    }),
  );
}

// Entry-point guard: run main() only when executed as a script, so the
// pure helpers can be imported by tests without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
