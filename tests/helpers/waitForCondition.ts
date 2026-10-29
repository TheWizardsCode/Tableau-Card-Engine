/**
 * Shared, load-tolerant poll helper for browser tests (and node unit tests).
 *
 * ## Budget model: nominal production cap + starvation margin
 *
 * A test that waits on work paced by a *production* timing cap (the 16 000 ms
 * income-collection deferral, `DRAG_TRANSFER_DURATION_MAX_MS`, …) must not use
 * a hand-guessed poll timeout. On a CPU-starved host the production work
 * legitimately finishes later than its nominal cap, and a hand-picked budget
 * equal to (or barely above) that cap turns a green scene into a red test.
 *
 * The budget is therefore *derived from the cap it races*:
 *
 * ```
 * budget = max(round(capMs * starvationFactor), capMs + floorMs)
 * ```
 *
 * - `capMs` — the **nominal production cap** the wait races. Pass the real
 *   production constant, not a guess: the budget then tracks the production
 *   pacing change automatically.
 * - `starvationFactor` (default `1.5`) — widens the cap proportionally, so the
 *   wait survives rAF starvation when the host is loaded.
 * - `floorMs` (default `5_000`) — guarantees a fixed scheduling margin even
 *   for very small caps (where the proportional widening alone is negligible).
 *
 * The invariant **`budget > capMs`** is enforced in code (`resolveWaitBudget`
 * throws otherwise), so a caller can never configure a poll shorter than the
 * cap it documents as racing. With the defaults a 16 000 ms cap derives a
 * 24 000 ms budget and a 1 500 ms cap derives 6 500 ms — both comfortably
 * inside the browser project's 60 s `testTimeout`.
 *
 * Raw `timeoutMs` remains accepted for callers that wait on something that is
 * **not** paced by a production cap; passing `capMs` takes precedence.
 *
 * The helper is pure `Date.now()` + `setTimeout` polling (no Phaser import),
 * so it runs unchanged in both the browser and the node `unit` projects.
 *
 * The module is a sibling of `waitForScene.ts`; existing per-file
 * `waitForCondition` copies can migrate onto it without changing their
 * timeout-message shape (`Timed out waiting for <label> after <budget>ms
 * (cap <capMs>ms)`), keeping triage greps working.
 *
 * @module tests/helpers/waitForCondition
 */

/** Default widening applied to the nominal production cap. */
export const DEFAULT_STARVATION_FACTOR = 1.5;

/** Default fixed scheduling margin added to the nominal production cap. */
export const DEFAULT_FLOOR_MS = 5_000;

/** Default poll interval (matches the per-file copies this replaces). */
export const DEFAULT_INTERVAL_MS = 25;

/** Default label used when a caller passes none. */
export const DEFAULT_LABEL = 'condition';

/**
 * Default raw budget for callers that pass `timeoutMs`/nothing at all
 * (matches the per-file copies this replaces).
 */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Options for {@link resolveWaitBudget}. */
export interface WaitBudgetOptions {
  /** Nominal production cap (ms) the wait races. */
  capMs: number;
  /** Proportional widening for rAF starvation (default 1.5). */
  starvationFactor?: number;
  /** Fixed scheduling margin added to the cap (default 5 000). */
  floorMs?: number;
}

/**
 * Derive a load-tolerant wait budget from the production cap it races.
 *
 * `budget = max(round(capMs * starvationFactor), capMs + floorMs)`
 *
 * @throws {Error} when the derived budget is not strictly greater than
 *   `capMs` — the invariant that stops a caller configuring a poll shorter
 *   than the cap it races.
 */
export function resolveWaitBudget({
  capMs,
  starvationFactor = DEFAULT_STARVATION_FACTOR,
  floorMs = DEFAULT_FLOOR_MS,
}: WaitBudgetOptions): number {
  const budgetMs = Math.max(
    Math.round(capMs * starvationFactor),
    capMs + floorMs,
  );

  // Written as a negated `>` so a non-finite cap or factor (NaN) also throws
  // instead of silently deriving a budget that is not a number.
  if (!(budgetMs > capMs)) {
    throw new Error(
      `Wait budget ${budgetMs}ms is not strictly greater than the ${capMs}ms ` +
        `cap it races — raise starvationFactor or floorMs.`,
    );
  }

  return budgetMs;
}

/** Options for {@link waitForCondition}. */
export interface WaitForConditionOptions {
  /** Nominal production cap (ms) the wait races; enables budget derivation. */
  capMs?: number;
  /** Proportional widening for rAF starvation (default 1.5). */
  starvationFactor?: number;
  /** Fixed scheduling margin added to the cap (default 5 000). */
  floorMs?: number;
  /** Raw budget (ms) for waits that race no production cap. */
  timeoutMs?: number;
  /** Poll interval in ms (default 25). */
  intervalMs?: number;
  /** Human-readable label used in the timeout message (default `condition`). */
  label?: string;
}

/**
 * Poll `predicate` until it returns true, or reject once the derived budget
 * elapses.
 *
 * The predicate is polled immediately and then every `intervalMs`. When
 * `capMs` is supplied the budget is derived via {@link resolveWaitBudget};
 * otherwise `timeoutMs` (default 10 000 ms) is used verbatim.
 *
 * @returns a promise that resolves (with `undefined`) on the first truthy
 *   predicate.
 * @throws {Error} `Timed out waiting for <label> after <budget>ms
 *   (cap <capMs>ms)` — the `(cap …)` suffix appears only when a cap was
 *   supplied, so legacy callers keep the original message shape.
 */
export async function waitForCondition(
  predicate: () => boolean,
  options: WaitForConditionOptions = {},
): Promise<void> {
  const {
    capMs,
    starvationFactor,
    floorMs,
    timeoutMs,
    intervalMs = DEFAULT_INTERVAL_MS,
    label = DEFAULT_LABEL,
  } = options;

  const racesProductionCap = capMs !== undefined;
  const budgetMs = racesProductionCap
    ? resolveWaitBudget({ capMs, starvationFactor, floorMs })
    : (timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const capDetail = racesProductionCap ? ` (cap ${capMs}ms)` : '';
  const startedAt = Date.now();

  while (Date.now() - startedAt < budgetMs) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  // Boundary re-check: the predicate may have become true while the final
  // interval elapsed, so a scene that just finished is never reported as a
  // timeout. (The derived budget makes this rare, not impossible.)
  if (predicate()) return;

  throw new Error(
    `Timed out waiting for ${label} after ${budgetMs}ms${capDetail}`,
  );
}
