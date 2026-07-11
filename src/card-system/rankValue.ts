/**
 * Rank value utility for the Tableau Card Engine.
 *
 * Provides a numeric mapping for standard playing card ranks
 * using Ace-low ordering: A=0, 2=1, ..., K=12.
 *
 * The mapping is derived from the canonical {@link RANKS} array
 * in Card.ts, ensuring consistency across the engine.
 */

import type { Rank } from './Card';
import { RANKS } from './Card';

/** Map of rank -> numeric value for ordering (A=0, 2=1, ..., K=12). */
const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i]),
) as Record<Rank, number>;

/**
 * Get the numeric value of a rank (A=0, K=12).
 *
 * Uses Ace-low ordering derived from the {@link RANKS} array.
 * Games requiring Ace-high or custom orderings should define
 * their own mapping function.
 *
 * @param rank  The rank to convert to a numeric value.
 * @returns     The zero-based index of the rank (0 for Ace, 12 for King).
 */
export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank];
}
