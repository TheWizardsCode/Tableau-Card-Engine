/**
 * CardMemoryTracker — probabilistic recall of observed discard-pile cards.
 *
 * The AI uses this tracker to remember cards it has seen on the discard
 * pile. When queried via {@link getVisibleRanks}, each rank has a
 * P(correct) = skill/100 chance of being recalled with its exact count;
 * otherwise a uniformly random count in [0, MAX_RANK_COPIES] is returned.
 *
 * Memory scope: The tracker records **all** cards passed to {@link recordCard}.
 * In the Golf AI, only discard-pile cards are recorded — face-up grid cards
 * are always visible and do not need memory. This means the AI perfectly
 * knows its own grid at all times but may misremember historical discards.
 *
 * @module ai
 */

import type { Card } from '../../src/card-system/Card';

/**
 * Maximum copies of any rank in a standard 52-card deck.
 */
const MAX_RANK_COPIES = 4;

/**
 * Default skill rating used when none is provided.
 * 80 = strong but slightly imperfect recall.
 */
const DEFAULT_SKILL = 80;

/**
 * Stateful tracker that records cards seen on the discard pile and returns
 * probabilistically recalled rank counts based on a configurable skill rating.
 *
 * @example
 * ```ts
 * const memory = new CardMemoryTracker(80);
 * memory.recordCard(createCard('Q', 'hearts', true));
 * const ranks = memory.getVisibleRng(rng);
 * // ranks['Q'] is either 1 (correct) or a random 0-4 (misremembered)
 * ```
 */
export class CardMemoryTracker {
  private readonly skill: number;
  private readonly trueCounts: Record<string, number> = {};

  /**
   * @param skill - Skill rating 0–100. Controls recall accuracy:
   *   100 = perfect recall, 50 = chance level, 0 = always wrong.
   *   Clamped to [0, 100]. Defaults to 80.
   */
  constructor(skill: number = DEFAULT_SKILL) {
    this.skill = Math.max(0, Math.min(100, Math.round(skill)));
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Record a card that the AI has observed on the discard pile.
   *
   * Duplicate ranks increment the count. Suit is ignored — only rank
   * matters for memory.
   *
   * @param card - The card to record (must have a `rank` property).
   */
  recordCard(card: Card): void {
    const rank = card.rank.toString();
    this.trueCounts[rank] = (this.trueCounts[rank] || 0) + 1;
  }

  /**
   * Return rank counts with probabilistic recall based on the skill rating.
   *
   * Each recorded rank has a P(correct) = skill / 100 chance of being
   * recalled with its exact true count. When the AI misremembers a rank,
   * a uniformly random integer between 0 and {@link MAX_RANK_COPIES} is
   * returned instead.
   *
   * The caller must provide an RNG so that test code can use a
   * deterministic source and the game loop can use Math.random
   * (or a seeded game RNG when fairness/replayability matters).
   *
   * @param rng - A function returning a pseudo-random number in [0, 1).
   * @returns A map from rank string to the recalled count (0–4).
   */
  getVisibleRanks(rng: () => number): Record<string, number> {
    const result: Record<string, number> = {};

    for (const [rank, trueCount] of Object.entries(this.trueCounts)) {
      const recallCorrectly = rng() < this.skill / 100;
      if (recallCorrectly) {
        result[rank] = trueCount;
      } else {
        // Misremember: return a random count from 0 to MAX_RANK_COPIES
        result[rank] = Math.floor(rng() * (MAX_RANK_COPIES + 1));
      }
    }

    return result;
  }

  /**
   * Return the current skill rating (0–100).
   */
  getSkill(): number {
    return this.skill;
  }
}
