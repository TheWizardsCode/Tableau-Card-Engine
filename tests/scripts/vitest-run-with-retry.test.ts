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
  runVitestSync,
  parseTimeoutArgs,
  hangTimeoutMessage,
  HANG_TIMEOUT_EXIT_CODE,
  DEFAULT_RUN_TIMEOUT_MS,
  resolveVitestBin,
  type VitestRunner,
} from '../../scripts/vitest-run-with-retry';

// ── Output fixtures (match real vitest reporter output) ─────

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

  it('retries only once even if the retry itself hits the transient timeout', async () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: TRANSIENT_OUTPUT };
    };
    expect(await runWithRetry([], runner, warnSpy)).toBe(1);
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
