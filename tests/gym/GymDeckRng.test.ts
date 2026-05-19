/**
 * Gym Deck & RNG scene - unit tests for deterministic scenarios.
 *
 * Validates that:
 *  - createSeededRng with same seed produces identical sequences
 *  - Deck and Pile operations work correctly
 *  - Seed input and adjustment is handled correctly
 */
import { describe, expect, it } from 'vitest';
import {
  createSeededRng,
} from '../../src/core-engine/SeededRng';
import {
  createStandardDeck,
  shuffleArray,
  drawOrThrow,
} from '../../src/card-system/Deck';
import { Pile } from '../../src/card-system/Pile';

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

  it('draw cards from deck and verify state', () => {
    const deck = createStandardDeck();
    const drawn: ReturnType<typeof createStandardDeck> = [];
    for (let i = 0; i < 5; i++) {
      const card = drawOrThrow(deck);
      drawn.push(card);
    }

    expect(drawn.length).toBe(5);
    expect(deck.length).toBe(47);
  });

  it('Pile push/pop operations', () => {
    const deck = createStandardDeck();
    const pile = new Pile(deck);

    expect(pile.size()).toBe(52);
    expect(pile.isEmpty()).toBe(false);

    const topCard = pile.pop()!;
    expect(topCard).toBeDefined();
    expect(pile.size()).toBe(51);

    pile.push(topCard);
    expect(pile.size()).toBe(52);

    pile.clear();
    expect(pile.isEmpty()).toBe(true);
    expect(pile.size()).toBe(0);
  });

  it('seeds of 0 and 1 produce different sequences', () => {
    const rng0 = createSeededRng(0);
    const rng1 = createSeededRng(1);
    const vals0 = Array.from({ length: 10 }, () => rng0());
    const vals1 = Array.from({ length: 10 }, () => rng1());
    expect(vals0).not.toEqual(vals1);
  });
});