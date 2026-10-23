/**
 * Unit tests for the shared load-tolerant `waitForCondition` helper.
 *
 * The helper must derive its timeout budget from the production cap it races
 * (`budget = max(round(capMs * starvationFactor), capMs + floorMs)`) so a
 * CPU-starved host cannot make a finished scene look like a hung test. These
 * tests pin the derivation, the `budget > capMs` invariant, the polling
 * behaviour and the timeout message shape.
 *
 * Fake timers keep every assertion deterministic (no wall-clock sleeps).
 *
 * @group unit
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveWaitBudget, waitForCondition } from './waitForCondition';

/**
 * Await a promise expected to reject and return its error.
 *
 * Resolves to an explicit `Error` (never `void`), so callers can read
 * `error.message` without a union narrowing, and fails the test loudly when
 * the promise unexpectedly resolves.
 */
async function captureRejection(settled: Promise<void>): Promise<Error> {
  try {
    await settled;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the wait to reject, but it resolved');
}

describe('resolveWaitBudget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives the proportional budget for the 16 000 ms income-collection cap', () => {
    expect(resolveWaitBudget({ capMs: 16_000 })).toBe(24_000);
  });

  it('applies the default floor margin to a small cap (1 500 ms → 6 500 ms)', () => {
    // max(round(1500 * 1.5) = 2250, 1500 + 5000 = 6500) — the floor dominates.
    expect(resolveWaitBudget({ capMs: 1_500 })).toBe(6_500);
  });

  it('honours a custom starvationFactor', () => {
    expect(resolveWaitBudget({ capMs: 10_000, starvationFactor: 2 })).toBe(
      20_000,
    );
  });

  it('honours a custom floorMs', () => {
    expect(
      resolveWaitBudget({ capMs: 1_000, starvationFactor: 1.2, floorMs: 4_000 }),
    ).toBe(5_000);
  });

  it('rounds the proportional term rather than truncating it', () => {
    // round(333 * 1.5) = round(499.5) = 500; the floor is disabled so the
    // proportional term is the deciding one.
    expect(
      resolveWaitBudget({ capMs: 333, starvationFactor: 1.5, floorMs: 0 }),
    ).toBe(500);
  });

  it('always returns a budget strictly greater than the cap it races', () => {
    for (const capMs of [1, 250, 1_500, 16_000]) {
      expect(resolveWaitBudget({ capMs })).toBeGreaterThan(capMs);
    }
  });

  it('throws when the derived budget is not strictly greater than capMs', () => {
    expect(() =>
      resolveWaitBudget({ capMs: 1_000, starvationFactor: 1, floorMs: 0 }),
    ).toThrow(/strictly greater/);
  });

  it('names both the derived budget and the cap in the invariant error', () => {
    expect(() =>
      resolveWaitBudget({ capMs: 1_000, starvationFactor: 1, floorMs: 0 }),
    ).toThrow(/1000ms/);
  });
});

describe('waitForCondition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the predicate is already true', async () => {
    vi.useFakeTimers();

    await expect(
      waitForCondition(() => true, { capMs: 1_000 }),
    ).resolves.toBeUndefined();
  });

  it('polls at intervalMs and resolves on the first truthy predicate', async () => {
    vi.useFakeTimers();
    const predicate = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const settled = waitForCondition(predicate, {
      capMs: 1_000,
      intervalMs: 20,
      label: 'flip',
    });

    // The first poll is immediate; the next ones happen one interval apart.
    expect(predicate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(19);
    expect(predicate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(predicate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20);

    await expect(settled).resolves.toBeUndefined();
    expect(predicate).toHaveBeenCalledTimes(3);
  });

  it('defaults to a 25 ms poll interval', async () => {
    vi.useFakeTimers();
    let polls = 0;

    const settled = waitForCondition(
      () => {
        polls += 1;
        return polls > 2;
      },
      { capMs: 1_000 },
    );

    expect(polls).toBe(1);
    await vi.advanceTimersByTimeAsync(49);
    expect(polls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(settled).resolves.toBeUndefined();
    expect(polls).toBe(3);
  });

  it('rejects with the label, the derived budget and the raced cap on timeout', async () => {
    vi.useFakeTimers();
    const settled = captureRejection(
      waitForCondition(() => false, {
        capMs: 1_000,
        starvationFactor: 2,
        floorMs: 500,
        intervalMs: 50,
        label: 'income collection deferral',
      }),
    );

    await vi.advanceTimersByTimeAsync(2_100);
    const error = await settled;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      'Timed out waiting for income collection deferral after 2000ms (cap 1000ms)',
    );
  });

  it('uses the default "condition" label in the timeout message', async () => {
    vi.useFakeTimers();
    const settled = captureRejection(
      waitForCondition(() => false, { capMs: 1_000, intervalMs: 1_000 }),
    );

    await vi.advanceTimersByTimeAsync(6_100);
    const error = await settled;

    expect(error.message).toBe(
      'Timed out waiting for condition after 6000ms (cap 1000ms)',
    );
  });

  it('resolves when the predicate turns true exactly at the budget boundary', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const settled = waitForCondition(() => Date.now() - start >= 6_000, {
      capMs: 1_000,
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(6_000);

    await expect(settled).resolves.toBeUndefined();
  });

  it('accepts a raw timeoutMs for callers that race no production cap', async () => {
    vi.useFakeTimers();
    const settled = captureRejection(
      waitForCondition(() => false, {
        timeoutMs: 300,
        intervalMs: 100,
        label: 'legacy condition',
      }),
    );

    await vi.advanceTimersByTimeAsync(400);
    const error = await settled;

    expect(error).toBeInstanceOf(Error);
    // Legacy message shape (no cap suffix) so existing triage greps keep matching.
    expect(error.message).toBe(
      'Timed out waiting for legacy condition after 300ms',
    );
  });

  it('resolves within a raw timeoutMs budget when the predicate becomes true', async () => {
    vi.useFakeTimers();
    let polls = 0;

    const settled = waitForCondition(
      () => {
        polls += 1;
        return polls === 2;
      },
      { timeoutMs: 300, intervalMs: 100 },
    );

    await vi.advanceTimersByTimeAsync(100);

    await expect(settled).resolves.toBeUndefined();
    expect(polls).toBe(2);
  });
});
