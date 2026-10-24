/**
 * Unit tests for the vitest transient-failure retry mitigation
 * (scripts/vitest-run-with-retry.ts).
 *
 * Vitest has three distinct contention-induced failure signatures:
 *
 *   1. Worker RPC timeout — Vitest's worker RPC layer uses birpc with a
 *      hard-coded 60s timeout (DEFAULT_TIMEOUT = 6e4 in
 *      node_modules/vitest/dist/chunks/index.*.js). Under CPU contention a
 *      worker can miss the 60s window while reporting test results.
 *      See CG-0MS9M5UJP005PWD3.
 *   2. Browser WebSocket drop — vitest browser mode closes the browser RPC
 *      WebSocket under load, poisoning the run after all files completed.
 *      See CG-0MSCI73RH004VPCE.
 *   3. True hang — a browser test stalls indefinitely under CPU contention
 *      (e.g. a requestAnimationFrame loop starved of frames); the run never
 *      exits. The runner aborts it with a bounded wall-clock timeout and
 *      exit 124. See CG-0MT08R2QR0070F3N.
 *
 * These tests verify the masking guard: retry is ONLY allowed when the
 * run reports all files passed AND the sole error is a transient signature
 * above (a hang is never retried), and that the wall-clock timeout aborts a
 * hung run with exit 124.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WORKER_TIMEOUT_SIGNATURE,
  BROWSER_DROP_SIGNATURE,
  shouldRetryOnce,
  runWithRetry,
  runSummary,
  runVitestSync,
  parseTimeoutArgs,
  parseRunnerArgs,
  hangTimeoutMessage,
  listHangMessage,
  HANG_TIMEOUT_EXIT_CODE,
  DEFAULT_RUN_TIMEOUT_MS,
  LIST_TIMEOUT_MS,
  resolveVitestBin,
  deriveExpectedFiles,
  parseExpectedSet,
  normaliseFiles,
  looksLikeUnknownStaticParse,
  evaluateCoverage,
  coverageDiagnostic,
  coverageSuffix,
  coverageLabelFromReport,
  ExecutedSetCapture,
  defaultReadExecutedFiles,
  parseExecutedFromOutput,
  PreflightError,
  type VitestRunner,
  type VitestListRunner,
} from '../../scripts/vitest-run-with-retry';

// ── Output fixtures (match real vitest reporter output) ─────

/**
 * The recorded occurrence-1 failing-run output for CG-0MUIMM28K001W88F,
 * verbatim from `.worklog/cache/02f9a2ba391d1da4493ebafa1cc63d4c/stdout.txt`
 * (the last 20 lines the CI wrapper preserved via `tail -20`). This is the
 * incident this regression fixture locks down: the worker RPC timeout is the
 * *only* failure evidence, so the reported `1 failed` file/test is
 * attributable to the transient signature and must be recovered.
 */
const INCIDENT_FAILED_FILE_OUTPUT = [
  '=== Browser Test Env Pre-check ===',
  '',
  '=== Unit Tests ===',
  'Vitest caught 1 unhandled error during the test run.',
  'This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.',
  '',
  '\u2500\u2500\u2500\u2500\u2500\u2500\u2500 Unhandled Error \u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  'Error: [vitest-worker]: Timeout calling "onTaskUpdate"',
  ' \u276f Object.onTimeoutError node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10',
  ' \u276f Timeout._onTimeout node_modules/vitest/dist/chunks/index.B521nVV-.js:59:62',
  ' \u276f listOnTimeout node:internal/timers:585:17',
  ' \u276f processTimers node:internal/timers:521:7',
  '',
  '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  '',
  '',
  ' Test Files  1 failed | 416 passed (417)',
  '      Tests  1 failed | 7164 passed | 8 skipped (7173)',
  '     Errors  1 error',
  '   Start at  17:48:20',
  '   Duration  145.13s (transform 44.56s, setup 0ms, collect 371.18s, tests 665.35s, environment 865ms, prepare 242.29s)',
  '',
  '[vitest-runner] attempts=1 status=1 outcome=failed args="--project unit"',
].join('\n');

/**
 * A genuine assertion failure reported alongside the transient signature.
 * The `Failed Tests` block cannot be attributed to the worker timeout, so
 * the masking guard must refuse a retry (CG-0MUIMM28K001W88F approach (a)).
 */
const GENUINE_ASSERTION_AND_TIMEOUT_OUTPUT = [
  ' \u276f |unit| tests/foo.test.ts (2 tests | 1 failed) 65ms',
  '   \u00d7 does the thing',
  '     \u2192 expected 1 to be 2 // Object.is equality',
  '',
  '\u2500\u2500\u2500\u2500\u2500\u2500\u2500 Failed Tests 1 \u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  '',
  ' FAIL  |unit| tests/foo.test.ts > does the thing',
  'AssertionError: expected 1 to be 2 // Object.is equality',
  '',
  'Vitest caught 1 unhandled error during the test run.',
  '',
  '\u2500\u2500\u2500\u2500\u2500\u2500\u2500 Unhandled Error \u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  `Error: ${WORKER_TIMEOUT_SIGNATURE}`,
  '',
  ' Test Files  1 failed | 245 passed (246)',
  '      Tests  1 failed | 4662 passed (4663)',
  '',
  '[vitest-runner] attempts=1 status=1 outcome=failed args="--project unit"',
].join('\n');

/** A fully-passing run summary. */
const PASS_OUTPUT = [
  ' Test Files  246 passed (246)',
  '      Tests  4665 passed | 8 skipped (4673)',
  '   Start at  12:00:00',
  '   Duration  33.10s (transform 14.30s, setup 0ms, collect 60.22s, tests 68.89s)',
].join('\n');

/** A passing run whose exit was poisoned by the transient worker RPC timeout. */
const TRANSIENT_OUTPUT = `${PASS_OUTPUT}\nError: ${WORKER_TIMEOUT_SIGNATURE}`;

/** A passing run whose exit was poisoned by the transient browser WebSocket drop. */
const BROWSER_DROP_OUTPUT = `${PASS_OUTPUT}\nError: ${BROWSER_DROP_SIGNATURE}. Was the page closed unexpectedly?`;

/** A run with genuine test failures. */
const FAIL_OUTPUT = [
  ' Test Files  1 failed | 245 passed (246)',
  '      Tests  3 failed | 4662 passed (4673)',
].join('\n');

/** A run where every file failed. */
const ALL_FAIL_OUTPUT = [
  ' Test Files  246 failed (246)',
  '      Tests  4663 failed | 10 passed (4673)',
].join('\n');

// ── shouldRetryOnce ──────────────────────────────────────────

describe('shouldRetryOnce (masking-guarded transient detection)', () => {
  it('returns true when all files passed and the worker RPC timeout signature is present', () => {
    expect(shouldRetryOnce(TRANSIENT_OUTPUT)).toBe(true);
  });

  it('returns true when all files passed and the browser connection drop signature is present', () => {
    expect(shouldRetryOnce(BROWSER_DROP_OUTPUT)).toBe(true);
  });

  it('returns false when the run passed cleanly (no timeout signature)', () => {
    expect(shouldRetryOnce(PASS_OUTPUT)).toBe(false);
  });

  it('returns false when the timeout signature is present alongside genuine file failures', () => {
    expect(shouldRetryOnce(`${FAIL_OUTPUT}\n${WORKER_TIMEOUT_SIGNATURE}`)).toBe(false);
  });

  // ── Attribution-aware retry (CG-0MUIMM28K001W88F) ──────────

  it('returns true when the recorded incident output reports a failed file attributable only to the worker timeout', () => {
    expect(shouldRetryOnce(INCIDENT_FAILED_FILE_OUTPUT)).toBe(true);
  });

  it('returns false when a genuine assertion failure is reported alongside the timeout signature', () => {
    expect(shouldRetryOnce(GENUINE_ASSERTION_AND_TIMEOUT_OUTPUT)).toBe(false);
  });

  it('returns false when the browser drop signature is present alongside genuine file failures', () => {
    expect(shouldRetryOnce(`${FAIL_OUTPUT}\n${BROWSER_DROP_SIGNATURE}`)).toBe(false);
  });

  it('returns false when the browser drop signature is present and every file failed', () => {
    expect(shouldRetryOnce(`${ALL_FAIL_OUTPUT}\n${BROWSER_DROP_SIGNATURE}`)).toBe(false);
  });

  it('returns false when the timeout signature is present and every file failed', () => {
    expect(shouldRetryOnce(`${ALL_FAIL_OUTPUT}\n${WORKER_TIMEOUT_SIGNATURE}`)).toBe(false);
  });

  it('returns false when tests failed but the Test Files line still shows a passing file count', () => {
    // Guard against a malformed-but-close summary (e.g. "Test Files  246 passed (246)"
    // alongside a "Tests  N failed" line).
    expect(shouldRetryOnce(`${PASS_OUTPUT}\n      Tests  1 failed | 4664 passed (4673)\n${WORKER_TIMEOUT_SIGNATURE}`)).toBe(false);
  });

  it('returns false when the summary is missing entirely (cannot prove all passed)', () => {
    expect(shouldRetryOnce(`${WORKER_TIMEOUT_SIGNATURE}`)).toBe(false);
  });

  it('returns false when the browser drop signature appears without a passing summary', () => {
    expect(shouldRetryOnce(`${BROWSER_DROP_SIGNATURE}. Was the page closed unexpectedly?`)).toBe(false);
  });

  it('returns false on empty output', () => {
    expect(shouldRetryOnce('')).toBe(false);
  });
});

// ── runWithRetry ─────────────────────────────────────────────

describe('runWithRetry (retry-once orchestration)', () => {
  const warnSpy: (msg: string) => void = () => {};

  it('retries exactly once after a transient browser drop and returns the second run status', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1 ? { status: 1, output: BROWSER_DROP_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('retries exactly once after a transient timeout and returns the second run status', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1 ? { status: 1, output: TRANSIENT_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('accepts the run as green when BOTH attempts are all-passed transient failures', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: TRANSIENT_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('recovers the recorded failed-file transient (CG-0MUIMM28K001W88F): retries once and returns the clean second status', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1
        ? { status: 1, output: INCIDENT_FAILED_FILE_OUTPUT }
        : { status: 0, output: PASS_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('accepts the run as green when BOTH attempts are the recorded failed-file transient', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: INCIDENT_FAILED_FILE_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('refuses the retry when a genuine assertion failure accompanies the failed-file transient', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1
        ? { status: 1, output: INCIDENT_FAILED_FILE_OUTPUT }
        : { status: 1, output: GENUINE_ASSERTION_AND_TIMEOUT_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(1);
    expect(calls).toBe(2);
  });

  it('still fails when the retry reports genuine test failures (acceptance never masks a failure)', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1
        ? { status: 1, output: TRANSIENT_OUTPUT }
        : { status: 1, output: FAIL_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(1);
    expect(calls).toBe(2);
  });

  it('does not accept a retry that hangs (a hang must surface)', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1
        ? { status: 1, output: TRANSIENT_OUTPUT }
        : { status: HANG_TIMEOUT_EXIT_CODE, output: hangTimeoutMessage(60) };
    };
    expect(await runWithRetry([], runner, warnSpy, 60_000)).toBe(HANG_TIMEOUT_EXIT_CODE);
    expect(calls).toBe(2);
  });

  it('does not retry on a genuine failure', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: FAIL_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not retry when the first run passed', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 0, output: PASS_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(1);
  });

  it('passes the CLI arguments through to the runner on both attempts', async () => {
    const seenArgs: string[][] = [];
    let calls = 0;
    const runner: VitestRunner = (args) => {
      calls += 1;
      seenArgs.push(args);
      return calls === 1 ? { status: 1, output: TRANSIENT_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    const args = ['--project', 'unit'];
    expect(await runWithRetry(args, runner, warnSpy)).toBe(0);
    expect(seenArgs).toEqual([
      ['--project', 'unit'],
      ['--project', 'unit'],
    ]);
  });

  it('forwards the wall-clock timeout to the runner on both attempts', async () => {
    const seenTimeouts: number[] = [];
    let calls = 0;
    const runner: VitestRunner = (_args, timeoutMs) => {
      calls += 1;
      seenTimeouts.push(timeoutMs);
      return calls === 1 ? { status: 1, output: TRANSIENT_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy, 42_000)).toBe(0);
    expect(seenTimeouts).toEqual([42_000, 42_000]);
  });
});

// ── Final runner summary (attempt/outcome diagnostic) ────────

describe('runSummary (final diagnostic line)', () => {
  it('formats the attempt count, status, outcome and forwarded args', () => {
    expect(runSummary(['--project', 'unit'], 2, 0, 'accepted-transient')).toBe(
      '[vitest-runner] attempts=2 status=0 outcome=accepted-transient args="--project unit"',
    );
  });

  it('emits a clean summary after a single passing run', async () => {
    const messages: string[] = [];
    const runner: VitestRunner = () => ({ status: 0, output: PASS_OUTPUT });
    await runWithRetry(['--project', 'unit'], runner, (m) => messages.push(m));
    expect(messages.some((m) => m.includes('attempts=1 status=0 outcome=clean'))).toBe(true);
  });

  it('emits an accepted-transient summary when both attempts are poisoned but green', async () => {
    const messages: string[] = [];
    const runner: VitestRunner = () => ({ status: 1, output: TRANSIENT_OUTPUT });
    await runWithRetry(['--project', 'unit'], runner, (m) => messages.push(m));
    expect(messages.some((m) => m.includes('outcome=accepted-transient'))).toBe(true);
    expect(messages.some((m) => m.includes('[transient-accepted]'))).toBe(true);
  });
});

// ── Hang timeout (CG-0MT08R2QR0070F3N) ───────────────────────

describe('hang timeout (bounded wall-clock abort)', () => {
  const warnSpy: (msg: string) => void = () => {};

  it('reports exit code 124 and does NOT retry when a run hangs', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: HANG_TIMEOUT_EXIT_CODE, output: hangTimeoutMessage(600) };
    };
    expect(await runWithRetry([], runner, warnSpy, 60_000)).toBe(HANG_TIMEOUT_EXIT_CODE);
    expect(calls).toBe(1);
  });

  it('never retries a hang even if the output also contains a transient signature', async () => {
    // Defensive guard: a hang is a hang regardless of incidental signatures.
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: HANG_TIMEOUT_EXIT_CODE, output: TRANSIENT_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy, 60_000)).toBe(HANG_TIMEOUT_EXIT_CODE);
    expect(calls).toBe(1);
  });

  it('hang output does not satisfy the retry masking guard', () => {
    expect(shouldRetryOnce(hangTimeoutMessage(600))).toBe(false);
  });

  it('hangTimeoutMessage documents the elapsed bound, the exit code, and no-retry guidance', () => {
    const msg = hangTimeoutMessage(600);
    expect(msg).toContain('600s');
    expect(msg).toContain(String(HANG_TIMEOUT_EXIT_CODE));
    expect(msg).toContain('no retry');
    expect(msg).toContain('npx vitest run --project browser tests/<file>');
  });
});

// ── parseTimeoutArgs ─────────────────────────────────────────

describe('parseTimeoutArgs (--timeout-ms flag)', () => {
  it('uses the default timeout when the flag is absent', () => {
    expect(parseTimeoutArgs(['--project', 'browser'])).toEqual({
      timeoutMs: DEFAULT_RUN_TIMEOUT_MS,
      forwarded: ['--project', 'browser'],
    });
  });

  it('parses --timeout-ms <n> and forwards the remaining args', () => {
    expect(parseTimeoutArgs(['--project', 'browser', '--timeout-ms', '600000'])).toEqual({
      timeoutMs: 600_000,
      forwarded: ['--project', 'browser'],
    });
  });

  it('parses --timeout-ms=<n>', () => {
    expect(parseTimeoutArgs(['--timeout-ms=300000', '--project', 'unit'])).toEqual({
      timeoutMs: 300_000,
      forwarded: ['--project', 'unit'],
    });
  });

  it('throws on a non-numeric value', () => {
    expect(() => parseTimeoutArgs(['--timeout-ms', 'soon'])).toThrow(/Invalid --timeout-ms/);
  });

  it('throws on a non-positive value', () => {
    expect(() => parseTimeoutArgs(['--timeout-ms=0'])).toThrow(/Invalid --timeout-ms/);
  });

  it('throws when --timeout-ms is the last argument with no value', () => {
    expect(() => parseTimeoutArgs(['--timeout-ms'])).toThrow(/Invalid --timeout-ms/);
  });
});

// ── runVitestSync (real subprocess timeout wiring) ───────────

describe('runVitestSync (production runner)', () => {
  /** Write a throwaway "vitest" script into a temp dir and return its path. */
  function writeFakeBin(body: string): { dir: string; bin: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-run-fake-'));
    const bin = path.join(dir, 'fake-vitest.js');
    fs.writeFileSync(bin, body);
    return { dir, bin };
  }

  it('aborts a run that exceeds the wall-clock bound (exit 124 + diagnostic)', async () => {
    // A fake "vitest" script that sleeps forever; the runner must kill it
    // when the 300ms bound elapses. SIGTERM is left at its default handler
    // so the kill terminates it — exactly what the production path turns
    // into exit 124.
    const { dir, bin } = writeFakeBin('setInterval(() => {}, 1000);\n');

    const result = await runVitestSync([], 300, bin);

    expect(result.status).toBe(HANG_TIMEOUT_EXIT_CODE);
    expect(result.output).toContain('[hang-timeout]');
    // Elapsed rounds up to a positive number of seconds (>=1 under load).
    expect(result.output).toMatch(/\d+s/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    // A genuinely hung vitest may ignore SIGTERM; the runner must still
    // abort (SIGKILL after the short grace period) instead of stalling.
    const { dir, bin } = writeFakeBin(
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\n",
    );

    const result = await runVitestSync([], 300, bin, 200); // 200ms SIGTERM→SIGKILL grace

    expect(result.status).toBe(HANG_TIMEOUT_EXIT_CODE);
    expect(result.output).toContain('[hang-timeout]');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the child exit code when the run completes within the bound', async () => {
    const { dir, bin } = writeFakeBin("console.log('fake-vitest-ok');\n");

    const result = await runVitestSync(['--project', 'unit'], 30_000, bin);

    expect(result.status).toBe(0);
    expect(result.output).toContain('fake-vitest-ok');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('resolveVitestBin (local bin resolution)', () => {
  it('resolves an existing vitest entry under node_modules', () => {
    const bin = resolveVitestBin();
    expect(fs.existsSync(bin)).toBe(true);
  });
});

// ── Opt-in project-coverage gate (CG-0MVL21CVM003VK5H) ──────
//
// The runner previously decided acceptance purely from output text, so a run
// that silently dropped part of the suite could be accepted as green. The
// opt-in expectation makes any missing (or extra) executed file a genuine
// failure that neither retry nor `accepted-transient` can mask.

const CWD = process.cwd();

/** The incident shape: transient signature + all-passed summary + a dropped file. */
const INCIDENT_DROPPED_GROUP_OUTPUT = [
  `${PASS_OUTPUT}\nError: ${WORKER_TIMEOUT_SIGNATURE}`,
].join('\n');

describe('parseRunnerArgs (opt-in expectation flags)', () => {
  it('defaults to no expectation when the flags are absent', () => {
    expect(parseRunnerArgs(['--project', 'unit'])).toEqual({
      timeoutMs: DEFAULT_RUN_TIMEOUT_MS,
      forwarded: ['--project', 'unit'],
      expectedFiles: [],
      expectProjectCoverage: false,
    });
  });

  it('parses a repeatable --expected-file <path> in both spellings', () => {
    const parsed = parseRunnerArgs([
      '--expected-file',
      'tests/a.test.ts',
      '--expected-file=tests/b.test.ts',
      '--project',
      'unit',
    ]);
    expect(parsed.expectedFiles).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
    expect(parsed.forwarded).toEqual(['--project', 'unit']);
    expect(parsed.expectProjectCoverage).toBe(false);
  });

  it('parses --expect-project-coverage and keeps it out of the forwarded args', () => {
    const parsed = parseRunnerArgs(['--expect-project-coverage', '--project', 'browser']);
    expect(parsed.expectProjectCoverage).toBe(true);
    expect(parsed.expectedFiles).toEqual([]);
    expect(parsed.forwarded).toEqual(['--project', 'browser']);
  });

  it('combines --timeout-ms with the expectation flags', () => {
    const parsed = parseRunnerArgs([
      '--expect-project-coverage',
      '--timeout-ms=120000',
      '--expected-file',
      'tests/a.test.ts',
    ]);
    expect(parsed.timeoutMs).toBe(120_000);
    expect(parsed.expectProjectCoverage).toBe(true);
    expect(parsed.expectedFiles).toEqual(['tests/a.test.ts']);
    expect(parsed.forwarded).toEqual([]);
  });

  it('rejects a missing --expected-file value', () => {
    expect(() => parseRunnerArgs(['--expected-file'])).toThrow(/Invalid --expected-file/);
    expect(() => parseRunnerArgs(['--expected-file='])).toThrow(/Invalid --expected-file/);
  });

  it('still rejects an invalid --timeout-ms value', () => {
    expect(() => parseRunnerArgs(['--timeout-ms', 'soon'])).toThrow(/Invalid --timeout-ms/);
  });

  it('parseTimeoutArgs remains a forwarding subset parser', () => {
    expect(parseTimeoutArgs(['--expected-file', 'tests/a.test.ts', '--project', 'unit'])).toEqual({
      timeoutMs: DEFAULT_RUN_TIMEOUT_MS,
      forwarded: ['--project', 'unit'],
    });
  });
});

describe('expected-set normalisation and parsing', () => {
  it('normalises absolute and file:// paths to repo-relative POSIX', () => {
    expect(
      normaliseFiles(
        [
          path.join(CWD, 'tests', 'b.test.ts'),
          path.join(CWD, 'tests', 'a.test.ts'),
          path.join(CWD, 'tests', 'a.test.ts'),
          `file://${path.join(CWD, 'tests', 'c.test.ts')}`,
        ],
        CWD,
      ),
    ).toEqual(['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts']);
  });

  it('normalises browser-mode http(s) names via the /@fs/ Vite escape', () => {
    expect(
      normaliseFiles(
        [
          `http://localhost:5173/@fs${path.join(CWD, 'tests', 'a.test.ts')}`,
          `https://example.test/@fs${path.join(CWD, 'tests', 'b.test.ts')}?browser=1`,
        ],
        CWD,
      ),
    ).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
  });

  it('normalises a relative path with a leading ./', () => {
    expect(normaliseFiles(['./tests/a.test.ts'], CWD)).toEqual(['tests/a.test.ts']);
  });

  it('parses the Vitest 4.x vitest list array shape', () => {
    const stdout = JSON.stringify([
      { file: path.join(CWD, 'tests/b.test.ts'), projectName: 'unit' },
      { file: path.join(CWD, 'tests/a.test.ts'), projectName: 'unit' },
    ]);
    expect(parseExpectedSet(stdout, CWD)).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
  });

  it('parses plain string entries and the { testFiles } wrapper shape', () => {
    expect(parseExpectedSet(JSON.stringify(['tests/a.test.ts']), CWD)).toEqual([
      'tests/a.test.ts',
    ]);
    expect(
      parseExpectedSet(
        JSON.stringify({ testFiles: [{ file: path.join(CWD, 'tests/b.test.ts') }] }),
        CWD,
      ),
    ).toEqual(['tests/b.test.ts']);
  });

  it('throws on unparsable JSON so callers can fail closed', () => {
    expect(() => parseExpectedSet('not json')).toThrow();
  });

  it('detects only plausible --staticParse rejections', () => {
    expect(looksLikeUnknownStaticParse('CACError: Unknown option `--staticParse`')).toBe(true);
    expect(looksLikeUnknownStaticParse('error: option --staticParse is invalid')).toBe(true);
    expect(looksLikeUnknownStaticParse('Test Files  1 failed (1)')).toBe(false);
    expect(looksLikeUnknownStaticParse('')).toBe(false);
  });
});

describe('deriveExpectedFiles (pre-flight vitest list)', () => {
  const listOutput = JSON.stringify([
    { file: path.join(CWD, 'tests/b.test.ts'), projectName: 'unit' },
    { file: path.join(CWD, 'tests/a.test.ts'), projectName: 'unit' },
  ]);

  it('derives the normalised set from a successful collection', async () => {
    const seen: string[][] = [];
    const runList: VitestListRunner = (args) => {
      seen.push(args);
      return { status: 0, output: listOutput };
    };
    await expect(deriveExpectedFiles(['--project', 'unit'], runList, CWD)).resolves.toEqual([
      'tests/a.test.ts',
      'tests/b.test.ts',
    ]);
    // Collection-only: --filesOnly --json --staticParse + forwarded filters,
    // and no browser launch flags.
    expect(seen[0]).toEqual(['--staticParse', '--filesOnly', '--json', '--project', 'unit']);
  });

  it('retries once without --staticParse when the consumer rejects the flag', async () => {
    const seen: string[][] = [];
    const runList: VitestListRunner = (args) => {
      seen.push(args);
      return seen.length === 1
        ? { status: 1, output: 'CACError: Unknown option `--staticParse`' }
        : { status: 0, output: listOutput };
    };
    await expect(deriveExpectedFiles(['--project', 'unit'], runList, CWD)).resolves.toEqual([
      'tests/a.test.ts',
      'tests/b.test.ts',
    ]);
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toContain('--staticParse');
  });

  it('fails closed on a non-zero collection that is not a --staticParse rejection', async () => {
    const runList: VitestListRunner = () => ({ status: 1, output: 'boom: cannot load config' });
    await expect(deriveExpectedFiles([], runList, CWD)).rejects.toBeInstanceOf(PreflightError);
  });

  it('fails closed on a collection hang (exit 124)', async () => {
    const runList: VitestListRunner = () => ({
      status: HANG_TIMEOUT_EXIT_CODE,
      output: listHangMessage(120),
    });
    await expect(deriveExpectedFiles([], runList, CWD)).rejects.toThrow(/exit 124/);
  });

  it('fails closed on an empty file set', async () => {
    const runList: VitestListRunner = () => ({ status: 0, output: '[]' });
    await expect(deriveExpectedFiles([], runList, CWD)).rejects.toThrow(/empty file set/);
  });

  it('fails closed on unparsable collection output', async () => {
    const runList: VitestListRunner = () => ({ status: 0, output: '<html>oops</html>' });
    await expect(deriveExpectedFiles([], runList, CWD)).rejects.toThrow(/unparsable JSON/);
  });

  it('bounds the collection with the list timeout', async () => {
    const timeouts: number[] = [];
    const runList: VitestListRunner = (_args, timeoutMs) => {
      timeouts.push(timeoutMs);
      return { status: 0, output: listOutput };
    };
    await deriveExpectedFiles([], runList, CWD);
    expect(timeouts).toEqual([LIST_TIMEOUT_MS]);
  });
});

describe('evaluateCoverage / coverageDiagnostic', () => {
  it('passes when the sets match (order and duplicates ignored)', () => {
    const report = evaluateCoverage(
      ['tests/a.test.ts', 'tests/b.test.ts'],
      ['tests/b.test.ts', 'tests/a.test.ts', 'tests/a.test.ts'],
      CWD,
    );
    expect(report).toEqual({
      ok: true,
      expected: 2,
      ran: 2,
      missing: [],
      extra: [],
      indeterminate: false,
    });
  });

  it('fails and names a missing file', () => {
    const report = evaluateCoverage(['tests/a.test.ts', 'tests/b.test.ts'], ['tests/a.test.ts'], CWD);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['tests/b.test.ts']);
    expect(report.extra).toEqual([]);
    expect(report).toMatchObject({ expected: 2, ran: 1 });
  });

  it('fails and names an extra file', () => {
    const report = evaluateCoverage(['tests/a.test.ts'], ['tests/a.test.ts', 'tests/z.test.ts'], CWD);
    expect(report.ok).toBe(false);
    expect(report.extra).toEqual(['tests/z.test.ts']);
    expect(report.missing).toEqual([]);
  });

  it('fails closed as indeterminate when the executed set is unreadable', () => {
    const report = evaluateCoverage(['tests/a.test.ts'], null, CWD);
    expect(report.ok).toBe(false);
    expect(report.indeterminate).toBe(true);
    expect(report.missing).toEqual(['tests/a.test.ts']);
    expect(coverageDiagnostic(report)).toContain('indeterminate');
  });

  it('diagnostic names every missing/extra file and states expected=N ran=M', () => {
    const report = evaluateCoverage(
      ['tests/a.test.ts', 'tests/b.test.ts'],
      ['tests/a.test.ts', 'tests/z.test.ts'],
      CWD,
    );
    const diagnostic = coverageDiagnostic(report);
    expect(diagnostic).toContain('expected=2 ran=2');
    expect(diagnostic).toContain('tests/b.test.ts');
    expect(diagnostic).toContain('tests/z.test.ts');
    expect(diagnostic).toContain('Missing files');
    expect(diagnostic).toContain('Extra files');
  });

  it('records the expectation state for the summary line', () => {
    expect(coverageSuffix({ kind: 'unset' })).toBe(' expected=unset');
    expect(coverageSuffix({ kind: 'set', expected: 3, ran: 2 })).toBe(' expected=3 ran=2');
    expect(coverageLabelFromReport(evaluateCoverage(['a.test.ts'], ['a.test.ts'], CWD))).toEqual({
      kind: 'set',
      expected: 1,
      ran: 1,
    });
    expect(coverageLabelFromReport(evaluateCoverage(['a.test.ts'], null, CWD)).kind).toBe(
      'set-indeterminate',
    );
  });
});

describe('ExecutedSetCapture (attempt file-set capture)', () => {
  function tmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-capture-'));
  }

  it('appends the JSON reporter alongside the default reporter', () => {
    const dir = tmpDir();
    const capture = new ExecutedSetCapture({ workDir: dir, cwd: CWD });
    const augmented = capture.augmentArgs(['--project', 'unit']);
    expect(augmented[0]).toBe('--project');
    expect(augmented).toContain('--reporter=default');
    expect(augmented).toContain('--reporter=json');
    expect(augmented).toContain(`--outputFile.json=${capture.artefactPath}`);
    expect(capture.artefactPath.startsWith(dir)).toBe(true);
    capture.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the executed set from the JSON artifact and cleans it up', () => {
    const dir = tmpDir();
    const capture = new ExecutedSetCapture({ workDir: dir, cwd: CWD });
    fs.writeFileSync(
      capture.artefactPath,
      JSON.stringify({
        testResults: [
          { name: path.join(CWD, 'tests', 'b.test.ts'), status: 'passed' },
          { name: path.join(CWD, 'tests', 'a.test.ts'), status: 'failed' },
        ],
      }),
    );
    expect(capture.executedFiles({ status: 1, output: '' })).toEqual([
      'tests/a.test.ts',
      'tests/b.test.ts',
    ]);
    capture.cleanup();
    expect(fs.existsSync(capture.artefactPath)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to default-reporter per-file lines when the artifact is absent', () => {
    const dir = tmpDir();
    const capture = new ExecutedSetCapture({ workDir: dir, cwd: CWD });
    const output = [
      ' ✓ |unit| tests/scripts/a.test.ts (18 tests) 55ms',
      ' ❯ |unit| tests/scripts/b.test.ts (3 tests | 1 failed) 8ms',
      ' Test Files  1 failed | 1 passed (2)',
    ].join('\n');
    expect(capture.executedFiles({ status: 1, output })).toEqual([
      'tests/scripts/a.test.ts',
      'tests/scripts/b.test.ts',
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null (indeterminable) when neither source yields a set', () => {
    const dir = tmpDir();
    const capture = new ExecutedSetCapture({ workDir: dir, cwd: CWD });
    expect(capture.executedFiles({ status: 1, output: 'Test Files  1 passed (1)' })).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a hang regardless of any artifact', () => {
    const dir = tmpDir();
    const capture = new ExecutedSetCapture({ workDir: dir, cwd: CWD });
    expect(
      capture.executedFiles({ status: HANG_TIMEOUT_EXIT_CODE, output: '[hang-timeout]' }),
    ).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('parseExecutedFromOutput returns null when no per-file lines exist', () => {
    expect(parseExecutedFromOutput(PASS_OUTPUT, CWD)).toBeNull();
  });

  it('defaultReadExecutedFiles prefers the artifact over per-file lines', () => {
    const dir = tmpDir();
    const artefact = path.join(dir, 'report.json');
    fs.writeFileSync(artefact, JSON.stringify({ testResults: [{ name: '/repo/tests/art.test.ts' }] }));
    expect(defaultReadExecutedFiles(' ✓ |unit| tests/line.test.ts (1 test) 3ms', artefact, '/repo')).toEqual([
      'tests/art.test.ts',
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('runWithRetry (opt-in coverage gate)', () => {
  const warnSpy: (msg: string) => void = () => {};
  const expected = ['tests/a.test.ts', 'tests/b.test.ts'];

  /** An injected reader returning a fixed executed set for every attempt. */
  const readerFor =
    (ran: string[] | null) =>
    (): string[] | null =>
      ran;

  it('parity: with no expectation, decisions and exit codes match the legacy runner', async () => {
    const fixtures = [PASS_OUTPUT, TRANSIENT_OUTPUT, BROWSER_DROP_OUTPUT, FAIL_OUTPUT];
    for (const fixture of fixtures) {
      const legacy = await runWithRetry([], () => ({ status: 1, output: fixture }), warnSpy);
      const withEmptyOptions = await runWithRetry(
        [],
        () => ({ status: 1, output: fixture }),
        warnSpy,
        DEFAULT_RUN_TIMEOUT_MS,
        {},
      );
      const withEmptyExpected = await runWithRetry(
        [],
        () => ({ status: 1, output: fixture }),
        warnSpy,
        DEFAULT_RUN_TIMEOUT_MS,
        { expectedFiles: [] },
      );
      expect(withEmptyOptions).toBe(legacy);
      expect(withEmptyExpected).toBe(legacy);
    }
  });

  it('parity: expectation-free summaries record expected=unset', async () => {
    const messages: string[] = [];
    await runWithRetry([], () => ({ status: 0, output: PASS_OUTPUT }), (m) => messages.push(m));
    expect(messages.some((m) => m.includes('outcome=clean'))).toBe(true);
    expect(messages.some((m) => m.includes('expected=unset'))).toBe(true);
  });

  it('AC5 incident shape: transient + all-passed summary + one missing file fails, names the file, never accepted', async () => {
    const warnings: string[] = [];
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: INCIDENT_DROPPED_GROUP_OUTPUT };
    };
    const status = await runWithRetry([], runner, (m) => warnings.push(m), DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(['tests/a.test.ts']),
    });
    expect(status).not.toBe(0);
    expect(calls).toBe(2);
    const joined = warnings.join('\n');
    expect(joined).toContain('tests/b.test.ts');
    expect(joined).toContain('expected=2 ran=1');
    expect(joined).not.toContain('outcome=accepted-transient');
    expect(joined).toContain('outcome=coverage-failed');
  });

  it('fails on an extra file (any set difference is a defect)', async () => {
    const warnings: string[] = [];
    const status = await runWithRetry([], () => ({ status: 0, output: PASS_OUTPUT }), (m) => warnings.push(m), DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(['tests/a.test.ts', 'tests/b.test.ts', 'tests/z.test.ts']),
    });
    expect(status).toBe(1);
    expect(warnings.join('\n')).toContain('tests/z.test.ts');
    expect(warnings.join('\n')).toContain('outcome=coverage-failed');
  });

  it('fails closed when an expectation is supplied but the executed set is indeterminable', async () => {
    const warnings: string[] = [];
    const status = await runWithRetry([], () => ({ status: 0, output: PASS_OUTPUT }), (m) => warnings.push(m), DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(null),
    });
    expect(status).toBe(1);
    expect(warnings.join('\n')).toContain('indeterminate');
    expect(warnings.join('\n')).toContain('outcome=coverage-failed');
  });

  it('never converts a coverage violation to green via the retry', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1
        ? { status: 1, output: INCIDENT_DROPPED_GROUP_OUTPUT }
        : { status: 0, output: PASS_OUTPUT };
    };
    const status = await runWithRetry([], runner, warnSpy, DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(['tests/a.test.ts']),
    });
    expect(status).toBe(1);
    expect(calls).toBe(2);
  });

  it('accepts a transient run when both attempts executed exactly the expected set', async () => {
    const warnings: string[] = [];
    const runner: VitestRunner = () => ({ status: 1, output: TRANSIENT_OUTPUT });
    const status = await runWithRetry([], runner, (m) => warnings.push(m), DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(expected),
    });
    expect(status).toBe(0);
    const joined = warnings.join('\n');
    expect(joined).toContain('outcome=accepted-transient');
    expect(joined).toContain('expected=2 ran=2');
  });

  it('records expected=N ran=M in the summary of a clean covered run', async () => {
    const warnings: string[] = [];
    const status = await runWithRetry([], () => ({ status: 0, output: PASS_OUTPUT }), (m) => warnings.push(m), DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(expected),
    });
    expect(status).toBe(0);
    expect(warnings.join('\n')).toContain('outcome=clean');
    expect(warnings.join('\n')).toContain('expected=2 ran=2');
  });

  it('injects the JSON reporter args only when an expectation is active', async () => {
    const seen: string[][] = [];
    const runner: VitestRunner = (args) => {
      seen.push(args);
      return { status: 0, output: PASS_OUTPUT };
    };
    await runWithRetry(['--project', 'unit'], runner, warnSpy);
    await runWithRetry(['--project', 'unit'], runner, warnSpy, DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(expected),
    });
    expect(seen[0]).toEqual(['--project', 'unit']);
    expect(seen[1]).toContain('--reporter=json');
    expect(seen[1]).toContain('--reporter=default');
    expect(seen[1].some((a) => a.startsWith('--outputFile.json='))).toBe(true);
    // The forwarded filters survive alongside the injected capture flags.
    expect(seen[1].slice(0, 2)).toEqual(['--project', 'unit']);
  });

  it('checks coverage on the second attempt before accepting it', async () => {
    const warnings: string[] = [];
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1
        ? { status: 1, output: INCIDENT_DROPPED_GROUP_OUTPUT }
        : { status: 1, output: TRANSIENT_OUTPUT };
    };
    const status = await runWithRetry([], runner, (m) => warnings.push(m), DEFAULT_RUN_TIMEOUT_MS, {
      expectedFiles: expected,
      readExecutedFiles: readerFor(['tests/a.test.ts']),
    });
    expect(status).toBe(1);
    expect(calls).toBe(2);
    expect(warnings.join('\n')).toContain('outcome=coverage-failed');
    expect(warnings.join('\n')).not.toContain('outcome=accepted-transient');
  });

  it('hang precedence: a hang returns 124 and is never reported as a coverage failure', async () => {
    const warnings: string[] = [];
    const status = await runWithRetry(
      [],
      () => ({ status: HANG_TIMEOUT_EXIT_CODE, output: hangTimeoutMessage(60) }),
      (m) => warnings.push(m),
      DEFAULT_RUN_TIMEOUT_MS,
      { expectedFiles: expected, readExecutedFiles: readerFor(['tests/a.test.ts']) },
    );
    expect(status).toBe(HANG_TIMEOUT_EXIT_CODE);
    const joined = warnings.join('\n');
    expect(joined).toContain('outcome=hang');
    expect(joined).not.toContain('coverage-failed');
  });
});
