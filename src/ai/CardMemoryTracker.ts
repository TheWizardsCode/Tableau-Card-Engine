/**
 * CardMemoryTracker — probabilistic recall of observed discard-pile cards.
 *
 * The AI uses this tracker to remember cards it has seen on the discard
 * pile. When queried via {@link getVisibleRanks}, each key has a
 * P(correct) = skill/100 chance of being recalled with its exact count;
 * otherwise a uniformly random count in [0, maxCopies] is returned.
 *
 * Memory scope: The tracker records **all** cards passed to
 * {@link recordCard} or {@link recordKey}. In the Golf AI, only
 * discard-pile cards are recorded — face-up grid cards are always visible
 * and do not need memory. This means the AI perfectly knows its own grid
 * at all times but may misremember historical discards.
 *
 * @module ai
 */

import type { Card } from '../../src/card-system/Card';

/**
 * Configuration options for {@link CardMemoryTracker}.
 *
 * All properties are optional. When constructing with a plain number,
 * it is treated as the `skill` value (backward compatible).
 *
 * @example
 * ```ts
 * // Full config
 * const config: CardMemoryTrackerConfig = { skill: 90, maxCopies: 8 };
 *
 * // Minimal (uses defaults)
 * const config: CardMemoryTrackerConfig = {};
 * ```
 */
export interface CardMemoryTrackerConfig {
  /**
   * Skill rating 0–100. Controls recall accuracy:
   * 100 = perfect recall, 50 = chance level, 0 = always wrong.
   * Clamped to [0, 100]. Default: 80.
   */
  skill?: number;

  /**
   * Maximum number of copies of a single group key (usually rank) that
   * can appear in the game. Used as the upper bound (inclusive) for the
   * uniform random count returned when the AI misremembers.
   *
   * Set to 4 for a standard 52-card deck, 8 for a double deck, etc.
   * Default: 4.
   */
  maxCopies?: number;
}

/**
 * Default skill rating used when none is provided.
 * 80 = strong but slightly imperfect recall.
 */
const DEFAULT_SKILL = 80;

/**
 * Default maximum copies per rank (standard 52-card deck).
 */
const DEFAULT_MAX_COPIES = 4;

/**
 * Stateful tracker that records cards seen on the discard pile and returns
 * probabilistically recalled rank counts based on a configurable skill rating
 * and maximum copies per rank.
 *
 * The tracker is fully generic: it accepts a configuration object with
 * `skill` and `maxCopies` properties, or a plain number for backward
 * compatibility with the original positional `skill` parameter.
 *
 * @example
 * ```ts
 * // Default config (skill=80, maxCopies=4)
 * const memory = new CardMemoryTracker();
 *
 * // Positional skill (backward compatible)
 * const memory = new CardMemoryTracker(90);
 *
 * // Full configuration object
 * const memory = new CardMemoryTracker({ skill: 90, maxCopies: 8 });
 *
 * memory.recordCard(createCard('Q', 'hearts', true));
 * const ranks = memory.getVisibleRng(rng);
 * // ranks['Q'] is either 1 (correct) or a random 0-maxCopies (misremembered)
 * ```
 *
 * For custom card models that do not implement the engine {@link Card}
 * interface (e.g. Lost Cities' `LostCitiesCard` with `color`/`type`),
 * use {@link recordKey} with a game-specific grouping key instead:
 *
 * ```ts
 * const memory = new CardMemoryTracker({ skill: 80, maxCopies: 12 });
 * memory.recordKey('yellow'); // Lost Cities: group by expedition color
 * const counts = memory.getVisibleRanks(rng);
 * ```
 */
export class CardMemoryTracker {
  private skill: number;
  private readonly maxCopies: number;
  private readonly trueCounts: Record<string, number> = {};

  /**
   * @param options - Configuration object, or a plain skill number (backward
   *   compatible).
   *
   *   When a number is passed, it is treated as `{ skill: <number> }`
   *   with all other options using their defaults.
   *
   *   When an object is passed, each field is optional and defaults to
   *   the documented value.
   */
  constructor(options: number | CardMemoryTrackerConfig = DEFAULT_SKILL) {
    const config: CardMemoryTrackerConfig =
      typeof options === 'number' ? { skill: options } : options;

    this.skill = Math.max(
      0,
      Math.min(100, Math.round(config.skill ?? DEFAULT_SKILL)),
    );
    this.maxCopies = config.maxCopies ?? DEFAULT_MAX_COPIES;
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Record a card that the AI has observed on the discard pile.
   *
   * Duplicate ranks increment the count. Suit is ignored — only rank
   * matters for memory. This is a convenience wrapper around
   * {@link recordKey} that derives the grouping key from the card's
   * rank.
   *
   * @param card - The card to record (must have a `rank` property).
   */
  recordCard(card: Card): void {
    this.recordKey(card.rank.toString());
  }

  /**
   * Record an observed card identified by an arbitrary string key.
   *
   * This is the generic entry point that supports custom card models
   * which do not implement the engine's {@link Card} interface (e.g.
   * Lost Cities' `LostCitiesCard` with `color`/`type` fields). The key
   * can be any stable string — a rank, an expedition color, or a
   * combination — and counts are tracked per unique key.
   *
   * @param key - The grouping key for the observed card.
   */
  recordKey(key: string): void {
    this.trueCounts[key] = (this.trueCounts[key] || 0) + 1;
  }

  /**
   * Return key counts with probabilistic recall based on the skill rating.
   *
   * Each recorded key (rank string, expedition color, etc.) has a
   * P(correct) = skill / 100 chance of being recalled with its exact true
   * count. When the AI misremembers a key, a uniformly random integer
   * between 0 and {@link maxCopies} is returned instead.
   *
   * The caller must provide an RNG so that test code can use a
   * deterministic source and the game loop can use Math.random
   * (or a seeded game RNG when fairness/replayability matters).
   *
   * @param rng - A function returning a pseudo-random number in [0, 1).
   * @returns A map from key string to the recalled count (0–maxCopies).
   */
  getVisibleRanks(rng: () => number): Record<string, number> {
    const result: Record<string, number> = {};

    for (const [key, trueCount] of Object.entries(this.trueCounts)) {
      const recallCorrectly = rng() < this.skill / 100;
      if (recallCorrectly) {
        result[key] = trueCount;
      } else {
        // Misremember: return a random count from 0 to maxCopies
        result[key] = Math.floor(rng() * (this.maxCopies + 1));
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

  /**
   * Update the skill rating dynamically.
   * Affects all subsequent calls to {@link getVisibleRanks}.
   * Clamped to [0, 100].
   */
  setSkill(skill: number): void {
    this.skill = Math.max(0, Math.min(100, Math.round(skill)));
  }
}
