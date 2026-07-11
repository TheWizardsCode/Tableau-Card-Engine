/**
 * Seeded RNG Factory
 *
 * Provides a deterministic pseudo-random number generator (PRNG) using a
 * linear congruential generator (LCG). Useful for reproducible shuffling,
 * AI decision-making, and testing.
 *
 * The returned function has the same `() => number` contract as
 * `Math.random` -- values in [0, 1).
 *
 * @module
 */

/**
 * Create a deterministic RNG from a numeric seed.
 *
 * Uses a linear congruential generator (LCG) with constants from
 * Numerical Recipes (period 2^32). Each call returns a value in [0, 1),
 * compatible with the `rng` parameter accepted by `shuffleArray()` and
 * other engine utilities.
 *
 * The generator runs 5 warm-up iterations before returning the first
 * value.  This decorrelates sequential integer seeds (e.g. 1, 2, 3 …)
 * so that the first output is well-distributed across [0, 1).
 *
 * @param seed  Numeric seed for the generator (defaults to 42).
 * @returns A function `() => number` producing deterministic values in [0, 1).
 *
 * @example
 * ```ts
 * import { createSeededRng } from '@core-engine/SeededRng';
 *
 * const rng = createSeededRng(42);
 * console.log(rng()); // always the same first value for seed 42
 * ```
 */
export function createSeededRng(seed: number = 42): () => number {
  let s = seed | 0; // ensure integer

  // Advance the state 5 times to decorrelate sequential seeds.
  // Without this, seeds 1–681 all produce a first value < 0.5 because
  // the first LCG output is nearly linear in the seed.
  for (let i = 0; i < 5; i++) {
    s = (s * 1664525 + 1013904223) | 0;
  }

  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}
