/**
 * Tests for CardMemoryTracker — probabilistic recall based on skill rating.
 *
 * The memory model tracks cards seen on the discard pile. When queried,
 * each rank has a P(correct) = skill/100 chance of being recalled with
 * its exact count; otherwise, a random count (0–4) is returned.
 *
 * Note: "accuracy" in the statistical tests means the observed proportion
 * of trials where the recalled count matches the true count. This includes
 * both truly correct recalls and lucky coincidences (when a misremembered
 * random count happens to equal the true count — 1/5 chance per rank).
 */

import { describe, it, expect } from 'vitest';
import { CardMemoryTracker } from '../../src/ai/CardMemoryTracker';
import { createCard } from '../../src/card-system/Card';

// ---------------------------------------------------------------------------
// Deterministic PRNG for testing
// ---------------------------------------------------------------------------

/**
 * A simple LCG-based seeded RNG.
 *
 * Each call to the returned function advances the internal state and
 * returns a value in [0, 1). The sequence is reproducible from the seed.
 */
function createTestRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    // Convert to unsigned 32-bit and normalize
    return ((s >>> 0) % 2147483648) / 2147483648;
  };
}

/**
 * Run many trials using a **single persistent RNG** and return the
 * approximate accuracy rate.
 *
 * A single RNG is used across all trials so that the sequence of values
 * explored includes the full LCG cycle, not just the first-call values
 * (which cluster ~0.236 for this LCG).
 *
 * At skill = S, with true count = T, the expected accuracy over many
 * trials is:
 *   accuracy ≈ S/100                  (correct recall proportion)
 *           + (100-S)/100 * 1/5       (wrong recall, but random count
 *                                      happens to be T — 1 out of 5
 *                                      possible values 0–4)
 *
 * Examples:
 *   skill=100 → ≈ 1.0 + 0     = 1.0
 *   skill=80  → ≈ 0.8 + 0.04 = 0.84
 *   skill=50  → ≈ 0.5 + 0.10 = 0.60
 *   skill=25  → ≈ 0.25 + 0.15 = 0.40
 *   skill=1   → ≈ 0.01 + 0.198 = 0.208
 *   skill=0   → ≈ 0 + 0.20   = 0.20
 */
function estimateAccuracy(
  tracker: CardMemoryTracker,
  trials: number = 2000,
  seed: number = 42,
): number {
  const rng = createTestRng(seed);
  let correctCount = 0;
  for (let t = 0; t < trials; t++) {
    const ranks = tracker.getVisibleRanks(rng);
    const queenCount = ranks['Q'] || 0;
    // True count is 2, so correct = queenCount === 2
    if (queenCount === 2) {
      correctCount++;
    }
  }
  return correctCount / trials;
}

describe('CardMemoryTracker', () => {
  describe('recordCard', () => {
    it('records a single card', () => {
      const tracker = new CardMemoryTracker(100);
      const card = createCard('Q', 'hearts', true);
      tracker.recordCard(card);

      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(ranks['Q']).toBe(1);
    });

    it('delegates to recordKey with the card rank as the key', () => {
      const tracker = new CardMemoryTracker(100);
      const card = createCard('7', 'diamonds', true);
      tracker.recordCard(card);

      const ranks = tracker.getVisibleRanks(createTestRng());
      // The rank string '7' is the grouping key
      expect(ranks['7']).toBe(1);
    });

    it('records multiple cards of the same rank', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));

      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(ranks['Q']).toBe(2);
    });

    it('records cards of different ranks', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('K', 'clubs', true));
      tracker.recordCard(createCard('A', 'spades', true));

      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(ranks['Q']).toBe(1);
      expect(ranks['K']).toBe(1);
      expect(ranks['A']).toBe(1);
    });

    it('increments count when same rank is recorded multiple times', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('10', 'hearts', true));
      tracker.recordCard(createCard('10', 'clubs', true));
      tracker.recordCard(createCard('10', 'spades', true));
      tracker.recordCard(createCard('10', 'diamonds', true));

      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(ranks['10']).toBe(4);
    });

    it('tracks cards regardless of suit', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('5', 'hearts', true));
      tracker.recordCard(createCard('5', 'clubs', true));

      const ranks = tracker.getVisibleRanks(createTestRng());
      // Only rank matters, not suit
      expect(ranks['5']).toBe(2);
    });
  });

  describe('recordKey', () => {
    it('records a card by arbitrary string key', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordKey('yellow');

      const counts = tracker.getVisibleRanks(createTestRng());
      expect(counts['yellow']).toBe(1);
    });

    it('increments counts for duplicate keys', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordKey('yellow');
      tracker.recordKey('yellow');
      tracker.recordKey('red');

      const counts = tracker.getVisibleRanks(createTestRng());
      expect(counts['yellow']).toBe(2);
      expect(counts['red']).toBe(1);
    });

    it('supports non-Card grouping keys (e.g. custom card models)', () => {
      const tracker = new CardMemoryTracker(100);
      // Simulate a Lost Cities custom card model: group by expedition color
      tracker.recordKey('blue');
      tracker.recordKey('blue');
      tracker.recordKey('green');

      const counts = tracker.getVisibleRanks(createTestRng());
      expect(counts['blue']).toBe(2);
      expect(counts['green']).toBe(1);
    });

    it('is equivalent to recordCard for rank-based grouping', () => {
      const byKey = new CardMemoryTracker(100);
      const byCard = new CardMemoryTracker(100);

      byKey.recordKey('Q');
      byKey.recordKey('K');
      byCard.recordCard(createCard('Q', 'hearts', true));
      byCard.recordCard(createCard('K', 'clubs', true));

      const keyCounts = byKey.getVisibleRanks(createTestRng());
      const cardCounts = byCard.getVisibleRanks(createTestRng());
      expect(keyCounts).toEqual(cardCounts);
    });

    it('respects maxCopies when misremembering', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 12 });
      tracker.recordKey('yellow');

      const rng = createTestRng(42);
      for (let t = 0; t < 1000; t++) {
        const counts = tracker.getVisibleRanks(rng);
        const count = counts['yellow'] ?? 0;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('skill = 100 (perfect recall)', () => {
    it('recalls exact counts for all recorded ranks', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));
      tracker.recordCard(createCard('K', 'spades', true));
      tracker.recordCard(createCard('A', 'diamonds', true));

      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(ranks['Q']).toBe(2);
      expect(ranks['K']).toBe(1);
      expect(ranks['A']).toBe(1);
    });

    it('recalls no cards when none have been recorded', () => {
      const tracker = new CardMemoryTracker(100);
      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(Object.keys(ranks)).toHaveLength(0);
    });

    it('is deterministic for a given RNG seed', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('K', 'clubs', true));

      const ranks1 = tracker.getVisibleRanks(createTestRng(42));
      const ranks2 = tracker.getVisibleRanks(createTestRng(42));
      expect(ranks1).toEqual(ranks2);
    });
  });

  describe('skill = 50 (chance level)', () => {
    it('returns approximately 50-60% observed accuracy over many trials', () => {
      const tracker = new CardMemoryTracker(50);
      // Record 2 Queens
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));

      const accuracy = estimateAccuracy(tracker, 2000, 42);

      // Expected: 0.5 (correct) + 0.5 * 0.2 (wrong but lucky) = 0.60
      expect(accuracy).toBeGreaterThan(0.50);
      expect(accuracy).toBeLessThan(0.72);
    });

    it('misremembered ranks return counts in range 0-4', () => {
      const tracker = new CardMemoryTracker(50);
      tracker.recordCard(createCard('Q', 'hearts', true));

      // Use a single persistent RNG to get varied outcomes
      const rng = createTestRng(42);
      const countsSeen = new Set<number>();
      for (let t = 0; t < 500; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        const queenCount = ranks['Q'] ?? 0;
        expect(queenCount).toBeGreaterThanOrEqual(0);
        expect(queenCount).toBeLessThanOrEqual(4);
        countsSeen.add(queenCount);
      }
      // With 500 trials and a good RNG, we should see more than one distinct count
      expect(countsSeen.size).toBeGreaterThan(1);
    });
  });

  describe('skill = 1 (nearly always wrong)', () => {
    it('returns approximately 20% observed accuracy (lucky coincidences)', () => {
      const tracker = new CardMemoryTracker(1);
      // Record 2 Queens
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));

      const accuracy = estimateAccuracy(tracker, 2000, 42);

      // At skill=1, nearly always wrong, but random count matches with p=0.2
      // Expected: ~0.208. Allow margin: [0.12, 0.32]
      expect(accuracy).toBeGreaterThan(0.10);
      expect(accuracy).toBeLessThan(0.32);
    });
  });

  describe('skill = 80 (default)', () => {
    it('returns approximately 80-84% observed accuracy over many trials', () => {
      const tracker = new CardMemoryTracker(80);
      // Record 2 Queens
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));

      const accuracy = estimateAccuracy(tracker, 2000, 42);

      // Expected: 0.8 (correct) + 0.2 * 0.2 (wrong but lucky) = 0.84
      expect(accuracy).toBeGreaterThan(0.72);
      expect(accuracy).toBeLessThan(0.95);
    });
  });

  describe('skill = 25', () => {
    it('returns approximately 25-40% observed accuracy over many trials', () => {
      const tracker = new CardMemoryTracker(25);
      // Record 2 Queens
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));

      const accuracy = estimateAccuracy(tracker, 2000, 42);

      // Expected: 0.25 (correct) + 0.75 * 0.2 (wrong but lucky) = 0.40
      expect(accuracy).toBeGreaterThan(0.28);
      expect(accuracy).toBeLessThan(0.52);
    });
  });

  describe('skill = 75', () => {
    it('returns approximately 75-80% observed accuracy over many trials', () => {
      const tracker = new CardMemoryTracker(75);
      // Record 2 Queens
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));

      const accuracy = estimateAccuracy(tracker, 2000, 42);

      // Expected: 0.75 (correct) + 0.25 * 0.2 (wrong but lucky) = 0.80
      expect(accuracy).toBeGreaterThan(0.68);
      expect(accuracy).toBeLessThan(0.90);
    });
  });

  describe('Misremembered rank counts', () => {
    it('misremembered counts are always between 0 and 4 inclusive', () => {
      // Use skill=0 to guarantee always-misremember behavior
      const tracker = new CardMemoryTracker(0);
      tracker.recordCard(createCard('Q', 'hearts', true));

      // Since skill=0, the AI always misremembers, returning random 0-4
      const rng = createTestRng(42);
      for (let t = 0; t < 1000; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        const queenCount = ranks['Q'] ?? 0;
        expect(queenCount).toBeGreaterThanOrEqual(0);
        expect(queenCount).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles skill = 0 gracefully (always misremembers)', () => {
      const tracker = new CardMemoryTracker(0);
      tracker.recordCard(createCard('Q', 'hearts', true));

      // With skill=0, P(correct) = 0, so the AI always misremembers.
      // But misremembered count can still be 1 by coincidence (p=1/5).
      // Use a strict test: over many trials, the mean should be close to
      // the expected random mean of (0+1+2+3+4)/5 = 2.0, not always 1.
      const rng = createTestRng(42);
      let sum = 0;
      const trials = 1000;
      for (let t = 0; t < trials; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        sum += ranks['Q'] ?? 0;
      }
      const mean = sum / trials;
      // Random count 0-4 has mean 2.0, so observed mean should be near 2
      expect(mean).toBeGreaterThan(1.0);
      expect(mean).toBeLessThan(3.5);
    });

    it('handles empty recorded cards at any skill level', () => {
      for (const skill of [0, 1, 50, 80, 100]) {
        const tracker = new CardMemoryTracker(skill);
        const ranks = tracker.getVisibleRanks(createTestRng());
        expect(Object.keys(ranks)).toHaveLength(0);
      }
    });

    it('recorded counts are independent between different ranks', () => {
      const tracker = new CardMemoryTracker(100);
      tracker.recordCard(createCard('Q', 'hearts', true));
      tracker.recordCard(createCard('Q', 'clubs', true));
      tracker.recordCard(createCard('K', 'spades', true));

      const ranks = tracker.getVisibleRanks(createTestRng());
      expect(ranks['Q']).toBe(2);
      expect(ranks['K']).toBe(1);
      expect(ranks['A']).toBeUndefined();
    });
  });

  describe('Constructor', () => {
    it('defaults to skill 80 when no skill rating is provided', () => {
      const tracker = new CardMemoryTracker();
      expect(tracker.getSkill()).toBe(80);
    });

    it('accepts a custom skill rating between 0 and 100', () => {
      expect(new CardMemoryTracker(100).getSkill()).toBe(100);
      expect(new CardMemoryTracker(50).getSkill()).toBe(50);
      expect(new CardMemoryTracker(1).getSkill()).toBe(1);
    });

    it('clamps skill rating to valid range [0, 100]', () => {
      expect(new CardMemoryTracker(-10).getSkill()).toBe(0);
      expect(new CardMemoryTracker(150).getSkill()).toBe(100);
    });

    it('accepts a configuration object with skill only', () => {
      const tracker = new CardMemoryTracker({ skill: 60 });
      expect(tracker.getSkill()).toBe(60);
    });

    it('accepts a configuration object with maxCopies only', () => {
      const tracker = new CardMemoryTracker({ maxCopies: 8 });
      expect(tracker.getSkill()).toBe(80);
      // maxCopies behavior is verified in the maxCopies tests below
    });

    it('accepts a configuration object with both skill and maxCopies', () => {
      const tracker = new CardMemoryTracker({ skill: 90, maxCopies: 12 });
      expect(tracker.getSkill()).toBe(90);
    });

    it('defaults maxCopies to 4 when not specified', () => {
      // At skill=0, always misremembers. With maxCopies=4 (default),
      // the range should be 0-4, which is the same as the original behavior.
      const tracker = new CardMemoryTracker(0);
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      let sum = 0;
      const trials = 1000;
      for (let t = 0; t < trials; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        sum += ranks['Q'] ?? 0;
      }
      const mean = sum / trials;
      // Random 0-4 has mean 2.0
      expect(mean).toBeGreaterThan(1.0);
      expect(mean).toBeLessThan(3.5);
    });

    it('accepts empty configuration object with defaults', () => {
      const tracker = new CardMemoryTracker({});
      expect(tracker.getSkill()).toBe(80);
    });
  });

  describe('Configurable maxCopies', () => {
    it('with maxCopies=1 at skill=0 always returns 0 or 1', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 1 });
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      for (let t = 0; t < 1000; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        const count = ranks['Q'] ?? 0;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(1);
      }
    });

    it('with maxCopies=4 at skill=0 returns 0-4 (default behavior)', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 4 });
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      for (let t = 0; t < 1000; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        const count = ranks['Q'] ?? 0;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(4);
      }
    });

    it('with maxCopies=8 at skill=0 returns 0-8 (double deck)', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 8 });
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      for (let t = 0; t < 1000; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        const count = ranks['Q'] ?? 0;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(8);
      }
    });

    it('with maxCopies=52 at skill=0 returns 0-52', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 52 });
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      for (let t = 0; t < 1000; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        const count = ranks['Q'] ?? 0;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(52);
      }
    });

    it('misremembered mean with maxCopies=8 approximates expected random mean', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 8 });
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      let sum = 0;
      const trials = 2000;
      for (let t = 0; t < trials; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        sum += ranks['Q'] ?? 0;
      }
      const mean = sum / trials;
      // Random 0-8 has mean 4.0
      expect(mean).toBeGreaterThan(2.5);
      expect(mean).toBeLessThan(6.0);
    });

    it('misremembered mean with maxCopies=52 approximates expected random mean', () => {
      const tracker = new CardMemoryTracker({ skill: 0, maxCopies: 52 });
      tracker.recordCard(createCard('Q', 'hearts', true));

      const rng = createTestRng(42);
      let sum = 0;
      const trials = 2000;
      for (let t = 0; t < trials; t++) {
        const ranks = tracker.getVisibleRanks(rng);
        sum += ranks['Q'] ?? 0;
      }
      const mean = sum / trials;
      // Random 0-52 has mean 26.0
      expect(mean).toBeGreaterThan(18);
      expect(mean).toBeLessThan(35);
    });
  });
});
