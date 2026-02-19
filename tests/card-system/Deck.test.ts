import { describe, it, expect } from 'vitest';
import {
  createStandardDeck,
  createDeckFrom,
  shuffle,
  draw,
  drawOrThrow,
} from '../../src/card-system/Deck';
import type { Card } from '../../src/card-system/Card';

describe('Deck', () => {
  describe('createStandardDeck', () => {
    it('should create a deck of 52 cards', () => {
      const deck = createStandardDeck();
      expect(deck).toHaveLength(52);
    });

    it('should contain no duplicate cards', () => {
      const deck = createStandardDeck();
      const keys = deck.map((c) => `${c.rank}-${c.suit}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(52);
    });

    it('should have all cards face-down', () => {
      const deck = createStandardDeck();
      expect(deck.every((c) => c.faceUp === false)).toBe(true);
    });

    it('should contain every rank for every suit', () => {
      const deck = createStandardDeck();
      const suits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
      const ranks = [
        'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
      ] as const;

      for (const suit of suits) {
        for (const rank of ranks) {
          const found = deck.find(
            (c) => c.rank === rank && c.suit === suit,
          );
          expect(found).toBeDefined();
        }
      }
    });
  });

  describe('createDeckFrom', () => {
    it('should create a deck from specific cards', () => {
      const deck = createDeckFrom([
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts', faceUp: true },
      ]);
      expect(deck).toHaveLength(2);
      expect(deck[0].rank).toBe('A');
      expect(deck[0].faceUp).toBe(false);
      expect(deck[1].rank).toBe('K');
      expect(deck[1].faceUp).toBe(true);
    });
  });

  describe('shuffle', () => {
    it('should change the order of cards', () => {
      const deck = createStandardDeck();
      const originalOrder = deck.map((c) => `${c.rank}-${c.suit}`);

      // Use a deterministic RNG that produces varied output
      let seed = 42;
      const rng = (): number => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      shuffle(deck, rng);
      const shuffledOrder = deck.map((c) => `${c.rank}-${c.suit}`);

      // The shuffled order should differ from the original
      expect(shuffledOrder).not.toEqual(originalOrder);
    });

    it('should retain all 52 cards after shuffling', () => {
      const deck = createStandardDeck();
      shuffle(deck);
      expect(deck).toHaveLength(52);

      const keys = deck.map((c) => `${c.rank}-${c.suit}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(52);
    });

    it('should return the same array reference', () => {
      const deck = createStandardDeck();
      const result = shuffle(deck);
      expect(result).toBe(deck);
    });

    it('should produce deterministic results with the same RNG', () => {
      const makeDeck = (): Card[] => createStandardDeck();
      const makeRng = (): (() => number) => {
        let seed = 123;
        return () => {
          seed = (seed * 16807) % 2147483647;
          return (seed - 1) / 2147483646;
        };
      };

      const deck1 = shuffle(makeDeck(), makeRng());
      const deck2 = shuffle(makeDeck(), makeRng());

      const order1 = deck1.map((c) => `${c.rank}-${c.suit}`);
      const order2 = deck2.map((c) => `${c.rank}-${c.suit}`);
      expect(order1).toEqual(order2);
    });
  });

  describe('draw', () => {
    it('should remove and return the top card (last element)', () => {
      const deck = createDeckFrom([
        { rank: '2', suit: 'clubs' },
        { rank: 'A', suit: 'spades' },
      ]);

      const card = draw(deck);
      expect(card).toBeDefined();
      expect(card!.rank).toBe('A');
      expect(card!.suit).toBe('spades');
      expect(deck).toHaveLength(1);
    });

    it('should return undefined from an empty deck', () => {
      const deck: Card[] = [];
      const card = draw(deck);
      expect(card).toBeUndefined();
    });

    it('should draw all cards until empty', () => {
      const deck = createDeckFrom([
        { rank: '3', suit: 'hearts' },
        { rank: '7', suit: 'diamonds' },
      ]);

      const first = draw(deck);
      expect(first!.rank).toBe('7');

      const second = draw(deck);
      expect(second!.rank).toBe('3');

      const third = draw(deck);
      expect(third).toBeUndefined();
    });
  });

  describe('drawOrThrow', () => {
    it('should return the top card from a non-empty deck', () => {
      const deck = createDeckFrom([{ rank: 'Q', suit: 'clubs' }]);
      const card = drawOrThrow(deck);
      expect(card.rank).toBe('Q');
      expect(deck).toHaveLength(0);
    });

    it('should throw when drawing from an empty deck', () => {
      const deck: Card[] = [];
      expect(() => drawOrThrow(deck)).toThrow(
        'Cannot draw from an empty deck',
      );
    });
  });
});
