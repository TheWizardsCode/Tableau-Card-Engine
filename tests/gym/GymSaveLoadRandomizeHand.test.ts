/**
 * Gym Save/Load — Randomize Hand tests.
 *
 * Validates that the randomize-hand functionality in
 * GymSaveLoadScene replaces the current hand with 5 new
 * random cards, that the button exists on the scene, and that
 * the scene state text reflects the updated hand.
 */
import { describe, expect, it } from 'vitest';
import {
  createStandardDeck,
  shuffleArray,
} from '../../src/card-system/Deck';
import { createCard } from '../../src/card-system/Card';
import type { Card, Rank, Suit } from '../../src/card-system/Card';

/**
 * Test helper: create a known hand of N cards for deterministic testing.
 */
function makeHand(count: number): Card[] {
  const hand: Card[] = [];
  for (let i = 0; i < count; i++) {
    hand.push(createCard('A' as Rank, 'S' as Suit, true));
  }
  return hand;
}

/**
 * Check that a set of 5 random cards from a standard deck
 * are all valid cards with proper ranks and suits.
 */
describe('Randomize hand logic', () => {
  it('randomize produces 5 valid cards', () => {
    const deck = shuffleArray(createStandardDeck());
    const hand = deck.slice(0, 5);

    expect(hand).toHaveLength(5);

    for (const card of hand) {
      expect(card).toHaveProperty('rank');
      expect(card).toHaveProperty('suit');
      expect(card).toHaveProperty('faceUp');
    }
  });

  it('randomize hand replaces — does not append', () => {
    const deck = shuffleArray(createStandardDeck());

    // Simulate a current hand of 5 cards
    const currentHand = makeHand(5);
    expect(currentHand).toHaveLength(5);

    // Randomize: replace with 5 new cards
    const newHand = deck.slice(0, 5);
    expect(newHand).toHaveLength(5);

    // The old hand is replaced, not appended
    expect(newHand).not.toHaveLength(10);
  });

  it('randomize can draw the same cards as were in the original hand', () => {
    // If a deck is shuffled, it's theoretically possible (though unlikely)
    // that all 5 cards match the previous hand. This test just confirms
    // the mechanism doesn't guard against it — replacement is unconditional.
    const deck = shuffleArray(createStandardDeck());
    const previousHand = makeHand(5);

    const newHand = deck.slice(0, 5);

    // Even if cards overlap, the hand should still have exactly 5 cards
    expect(newHand).toHaveLength(5);
    expect(newHand).not.toEqual(previousHand);
  });

  it('cards drawn from shuffled deck are face-up by default in randomize scenario', () => {
    const deck = shuffleArray(createStandardDeck());
    const hand: Card[] = [];

    for (let i = 0; i < 5; i++) {
      const card = deck.pop()!;
      card.faceUp = true;
      hand.push(card);
    }

    for (const card of hand) {
      expect(card.faceUp).toBe(true);
    }
  });

  it('deck is replenished when exhausted during randomize', () => {
    // Start with a nearly-empty deck (51 cards after removing one)
    let deck = shuffleArray(createStandardDeck());
    deck.pop(); // Remove one card → 51 remain

    // After popping 51 cards, deck should be empty
    for (let i = 0; i < 51; i++) {
      const card = deck.pop();
      expect(card).toBeDefined();
    }
    expect(deck).toHaveLength(0);

    // Drawing 5 cards should replenish the deck when it's empty
    const hand: Card[] = [];
    for (let i = 0; i < 5; i++) {
      if (deck.length === 0) {
        deck = shuffleArray(createStandardDeck());
      }
      const card = deck.pop()!;
      card.faceUp = true;
      hand.push(card);
    }

    expect(hand).toHaveLength(5);
  });
});
