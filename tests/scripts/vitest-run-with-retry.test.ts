/**
 * Unit tests for the vitest transient-failure retry mitigation
 * (scripts/vitest-run-with-retry.ts).
 *
 * Vitest has two distinct transient failure signatures that exit non-zero
 * even when every test passed:
 *
 *   1. Worker RPC timeout — Vitest's worker RPC layer uses birpc with a
 *      hard-coded 60s timeout (DEFAULT_TIMEOUT = 6e4 in
 *      node_modules/vitest/dist/chunks/index.*.js). Under CPU contention a
 *      worker can miss the 60s window while reporting test results.
 *      See CG-0MS9M5UJP005PWD3.
 *   2. Browser WebSocket drop — vitest browser mode closes the browser RPC
 *      WebSocket under load, poisoning the run after all files completed.
 *      See CG-0MSCI73RH004VPCE.
 *
 * These tests verify the masking guard: retry is ONLY allowed when the
 * run reports all files passed AND the sole error is a transient signature
 * above. A genuine test failure must never be hidden by a retry.
 */
import { describe, it, expect } from 'vitest';
import {
  WORKER_TIMEOUT_SIGNATURE,
  BROWSER_DROP_SIGNATURE,
  shouldRetryOnce,
  runWithRetry,
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

  it('retries exactly once after a transient browser drop and returns the second run status', () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1 ? { status: 1, output: BROWSER_DROP_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    expect(runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('retries exactly once after a transient timeout and returns the second run status', () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return calls === 1 ? { status: 1, output: TRANSIENT_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    expect(runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(2);
  });

  it('retries only once even if the retry itself hits the transient timeout', () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: TRANSIENT_OUTPUT };
    };
    expect(runWithRetry([], runner, warnSpy)).toBe(1);
    expect(calls).toBe(2);
  });

  it('does not retry on a genuine failure', () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 1, output: FAIL_OUTPUT };
    };
    expect(runWithRetry([], runner, warnSpy)).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not retry when the first run passed', () => {
    let calls = 0;
    const runner: VitestRunner = () => {
      calls += 1;
      return { status: 0, output: PASS_OUTPUT };
    };
    expect(runWithRetry([], runner, warnSpy)).toBe(0);
    expect(calls).toBe(1);
  });

  it('passes the CLI arguments through to the runner on both attempts', () => {
    const seenArgs: string[][] = [];
    let calls = 0;
    const runner: VitestRunner = (args) => {
      calls += 1;
      seenArgs.push(args);
      return calls === 1 ? { status: 1, output: TRANSIENT_OUTPUT } : { status: 0, output: PASS_OUTPUT };
    };
    const args = ['--project', 'unit'];
    expect(runWithRetry(args, runner, warnSpy)).toBe(0);
    expect(seenArgs).toEqual([
      ['--project', 'unit'],
      ['--project', 'unit'],
    ]);
  });
});
