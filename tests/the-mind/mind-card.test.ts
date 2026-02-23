import { describe, it, expect } from 'vitest';
import {
  type MindCard,
  DECK_SIZE,
  MIN_VALUE,
  MAX_VALUE,
  createMindDeck,
  shuffleDeck,
  cardLabel,
  cardAssetKey,
  CARD_BACK_KEY,
} from '../../example-games/the-mind/MindCard';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Constants ──────────────────────────────────────────────

describe('Constants', () => {
  it('has a deck size of 100', () => {
    expect(DECK_SIZE).toBe(100);
  });

  it('has minimum value of 1', () => {
    expect(MIN_VALUE).toBe(1);
  });

  it('has maximum value of 100', () => {
    expect(MAX_VALUE).toBe(100);
  });

  it('card back key is defined', () => {
    expect(CARD_BACK_KEY).toBe('mind-back');
  });
});

// ── Deck creation ──────────────────────────────────────────

describe('createMindDeck', () => {
  const deck = createMindDeck();

  it('creates exactly 100 cards', () => {
    expect(deck).toHaveLength(100);
  });

  it('has cards with values 1 through 100', () => {
    const values = deck.map((c) => c.value).sort((a, b) => a - b);
    const expected = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(values).toEqual(expected);
  });

  it('has no duplicate values', () => {
    const valueSet = new Set(deck.map((c) => c.value));
    expect(valueSet.size).toBe(100);
  });

  it('creates all cards face-down', () => {
    expect(deck.every((c) => c.faceUp === false)).toBe(true);
  });

  it('creates cards in ascending order (1, 2, 3, ..., 100)', () => {
    const values = deck.map((c) => c.value);
    const expected = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(values).toEqual(expected);
  });

  it('returns a new array on each call', () => {
    const deck1 = createMindDeck();
    const deck2 = createMindDeck();
    expect(deck1).not.toBe(deck2);
  });

  it('all values are within the valid range [1, 100]', () => {
    for (const card of deck) {
      expect(card.value).toBeGreaterThanOrEqual(MIN_VALUE);
      expect(card.value).toBeLessThanOrEqual(MAX_VALUE);
    }
  });

  it('all values are integers', () => {
    for (const card of deck) {
      expect(Number.isInteger(card.value)).toBe(true);
    }
  });
});

// ── Card property access ───────────────────────────────────

describe('Card property access', () => {
  it('faceUp can be mutated', () => {
    const card = createMindDeck()[0];
    expect(card.faceUp).toBe(false);
    card.faceUp = true;
    expect(card.faceUp).toBe(true);
  });

  it('value is readonly (structurally enforced by TypeScript)', () => {
    // We verify that the value property exists and is a number.
    // TypeScript enforces readonly at compile time.
    const card: MindCard = { value: 42, faceUp: false };
    expect(card.value).toBe(42);
    expect(typeof card.value).toBe('number');
  });
});

// ── Card labels ────────────────────────────────────────────

describe('cardLabel', () => {
  it('returns the card value as a string', () => {
    const card: MindCard = { value: 1, faceUp: false };
    expect(cardLabel(card)).toBe('1');
  });

  it('handles two-digit values', () => {
    const card: MindCard = { value: 42, faceUp: false };
    expect(cardLabel(card)).toBe('42');
  });

  it('handles the maximum value', () => {
    const card: MindCard = { value: 100, faceUp: false };
    expect(cardLabel(card)).toBe('100');
  });
});

// ── Card asset keys ────────────────────────────────────────

describe('cardAssetKey', () => {
  it('returns correct key for single-digit value', () => {
    const card: MindCard = { value: 7, faceUp: false };
    expect(cardAssetKey(card)).toBe('mind-7');
  });

  it('returns correct key for two-digit value', () => {
    const card: MindCard = { value: 42, faceUp: false };
    expect(cardAssetKey(card)).toBe('mind-42');
  });

  it('returns correct key for maximum value', () => {
    const card: MindCard = { value: 100, faceUp: false };
    expect(cardAssetKey(card)).toBe('mind-100');
  });

  it('returns correct key for minimum value', () => {
    const card: MindCard = { value: 1, faceUp: false };
    expect(cardAssetKey(card)).toBe('mind-1');
  });
});

// ── Shuffle ────────────────────────────────────────────────

describe('shuffleDeck', () => {
  it('returns the same array reference', () => {
    const deck = createMindDeck();
    const result = shuffleDeck(deck);
    expect(result).toBe(deck);
  });

  it('preserves all 100 cards (no loss or duplication)', () => {
    const deck = createMindDeck();
    shuffleDeck(deck);
    expect(deck).toHaveLength(100);
    const values = new Set(deck.map((c) => c.value));
    expect(values.size).toBe(100);
  });

  it('produces deterministic results with seeded RNG', () => {
    const rng1 = createSeededRng(42);
    const deck1 = shuffleDeck(createMindDeck(), rng1);

    const rng2 = createSeededRng(42);
    const deck2 = shuffleDeck(createMindDeck(), rng2);

    expect(deck1.map((c) => c.value)).toEqual(deck2.map((c) => c.value));
  });

  it('different seeds produce different orders', () => {
    const rng1 = createSeededRng(42);
    const deck1 = shuffleDeck(createMindDeck(), rng1);

    const rng2 = createSeededRng(99);
    const deck2 = shuffleDeck(createMindDeck(), rng2);

    // Extremely unlikely that two different seeds produce the same order
    const values1 = deck1.map((c) => c.value);
    const values2 = deck2.map((c) => c.value);
    expect(values1).not.toEqual(values2);
  });

  it('changes the order of cards (with high probability)', () => {
    const original = createMindDeck().map((c) => c.value);
    const deck = createMindDeck();
    shuffleDeck(deck);
    const shuffled = deck.map((c) => c.value);

    // At least some positions should have changed
    const changedPositions = original.filter((v, i) => v !== shuffled[i]);
    expect(changedPositions.length).toBeGreaterThan(0);
  });

  it('uses Math.random by default when no RNG is provided', () => {
    // Just verify it doesn't throw and produces a valid shuffled deck
    const deck = createMindDeck();
    const result = shuffleDeck(deck);
    expect(result).toHaveLength(100);
    const values = new Set(result.map((c) => c.value));
    expect(values.size).toBe(100);
  });
});
