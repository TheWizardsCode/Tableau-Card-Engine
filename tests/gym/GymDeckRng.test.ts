/**
 * Gym Deck & RNG scene - unit tests for deterministic scenarios.
 *
 * Validates that:
 *  - createSeededRng with same seed produces identical sequences
 *  - Deck shuffle operations work correctly with seeded RNG
 *  - Full-deck display and shuffle visual behavior (scene-level tests)
 */
import { describe, expect, it } from 'vitest';
import {
  createSeededRng,
} from '../../src/core-engine/SeededRng';
import {
  createStandardDeck,
  shuffleArray,
} from '../../src/card-system/Deck';

describe('Gym Deck & RNG deterministic scenarios', () => {
  it('same seed produces identical shuffle sequences', () => {
    const rng1 = createSeededRng(42);
    const deck1 = createStandardDeck();
    shuffleArray(deck1, rng1);

    const rng2 = createSeededRng(42);
    const deck2 = createStandardDeck();
    shuffleArray(deck2, rng2);

    // After shuffling with the same seed, decks should be identical
    expect(deck1.length).toBe(deck2.length);
    for (let i = 0; i < deck1.length; i++) {
      expect(deck1[i].rank).toBe(deck2[i].rank);
      expect(deck1[i].suit).toBe(deck2[i].suit);
    }
  });

  it('different seeds produce different shuffle sequences', () => {
    const rng1 = createSeededRng(42);
    const deck1 = createStandardDeck();
    shuffleArray(deck1, rng1);

    const rng2 = createSeededRng(123);
    const deck2 = createStandardDeck();
    shuffleArray(deck2, rng2);

    // Very unlikely that two different seeds produce the same shuffle
    let same = 0;
    for (let i = 0; i < deck1.length; i++) {
      if (deck1[i].rank === deck2[i].rank && deck1[i].suit === deck2[i].suit) {
        same++;
      }
    }
    expect(same).toBeLessThan(deck1.length);
  });

  it('shuffled deck contains all 52 cards', () => {
    const rng = createSeededRng(42);
    const deck = createStandardDeck();
    shuffleArray(deck, rng);

    expect(deck.length).toBe(52);

    // Verify all ranks and suits are present exactly once
    const seen = new Set<string>();
    for (const card of deck) {
      const key = `${card.rank}${card.suit}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(52);
  });

  it('seeds of 0 and 1 produce different sequences', () => {
    const rng0 = createSeededRng(0);
    const rng1 = createSeededRng(1);
    const vals0 = Array.from({ length: 10 }, () => rng0());
    const vals1 = Array.from({ length: 10 }, () => rng1());
    expect(vals0).not.toEqual(vals1);
  });

  it('shuffling produces a different order from an unshuffled deck', () => {
    const unshuffled = createStandardDeck();
    const shuffled = createStandardDeck();
    const rng = createSeededRng(99);
    shuffleArray(shuffled, rng);

    // At least some cards should be in different positions
    let different = 0;
    for (let i = 0; i < unshuffled.length; i++) {
      if (unshuffled[i].rank !== shuffled[i].rank || unshuffled[i].suit !== shuffled[i].suit) {
        different++;
      }
    }
    expect(different).toBeGreaterThan(0);
  });

  it('multiple shuffles with the same seed produce the same result', () => {
    const deck1 = createStandardDeck();
    shuffleArray(deck1, createSeededRng(7));

    const deck2 = createStandardDeck();
    shuffleArray(deck2, createSeededRng(7));

    const deck3 = createStandardDeck();
    shuffleArray(deck3, createSeededRng(7));

    for (let i = 0; i < 52; i++) {
      expect(deck1[i].rank).toBe(deck2[i].rank);
      expect(deck1[i].suit).toBe(deck2[i].suit);
      expect(deck2[i].rank).toBe(deck3[i].rank);
      expect(deck2[i].suit).toBe(deck3[i].suit);
    }
  });
});
