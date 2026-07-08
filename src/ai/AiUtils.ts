/**
 * AI decision-making utilities
 *
 * Common helper functions extracted from game-specific AI strategies.
 * These eliminate repeated logic for random selection and greedy
 * best-pick-with-tiebreaker patterns.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Random selection
// ---------------------------------------------------------------------------

/**
 * Pick a uniformly random element from a non-empty array.
 *
 * This is the fundamental building block of every `RandomStrategy`:
 * enumerate legal actions, then `pickRandom(actions, rng)`.
 *
 * @throws Error if `items` is empty.
 *
 * @example
 * ```ts
 * const action = pickRandom(getLegalActions(state), rng);
 * ```
 */
export function pickRandom<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from empty array');
  }
  return items[Math.floor(rng() * items.length)];
}

// ---------------------------------------------------------------------------
// Greedy / scored selection
// ---------------------------------------------------------------------------

/**
 * Evaluate each candidate with a scoring function and return the
 * highest-scoring one.  Ties are broken uniformly at random.
 *
 * This is the fundamental building block of every `GreedyStrategy`:
 * enumerate candidates, provide a domain-specific scoring function,
 * and let `pickBest` handle the comparison and tie-breaking.
 *
 * @param candidates - Non-empty array of candidates.
 * @param scoreFn    - Returns a numeric score (higher is better).
 * @param rng        - RNG for tie-breaking.
 * @throws Error if `candidates` is empty.
 *
 * @example
 * ```ts
 * const best = pickBest(
 *   getLegalMoves(state),
 *   move => evaluateMove(state, move),
 *   rng,
 * );
 * ```
 */
export function pickBest<T>(
  candidates: readonly T[],
  scoreFn: (candidate: T) => number,
  rng: () => number,
): T {
  if (candidates.length === 0) {
    throw new Error('No candidates to evaluate');
  }

  let bestScore = -Infinity;
  const scored: Array<{ candidate: T; score: number }> = [];

  for (const candidate of candidates) {
    const score = scoreFn(candidate);
    scored.push({ candidate, score });
    if (score > bestScore) bestScore = score;
  }

  const tied = scored.filter(s => s.score === bestScore);
  return tied[Math.floor(rng() * tied.length)].candidate;
}
