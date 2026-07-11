/**
 * Tests for SushiGoCards -- card types, deck creation, and utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  createSushiGoDeck,
  shuffleDeck,
  cardsPerPlayer,
  cardLabel,
  DECK_SIZE,
  ROUND_COUNT,
} from '../../example-games/sushi-go/SushiGoCards';

describe('SushiGoCards', () => {
  describe('createSushiGoDeck', () => {
    it('creates a deck of 108 cards', () => {
      const deck = createSushiGoDeck();
      expect(deck).toHaveLength(DECK_SIZE);
      expect(DECK_SIZE).toBe(108);
    });

    it('has unique ids for every card', () => {
      const deck = createSushiGoDeck();
      const ids = new Set(deck.map((c) => c.id));
      expect(ids.size).toBe(108);
    });

    it('contains the correct number of tempura cards (14)', () => {
      const deck = createSushiGoDeck();
      expect(deck.filter((c) => c.type === 'tempura')).toHaveLength(14);
    });

    it('contains the correct number of sashimi cards (14)', () => {
      const deck = createSushiGoDeck();
      expect(deck.filter((c) => c.type === 'sashimi')).toHaveLength(14);
    });

    it('contains the correct number of dumpling cards (14)', () => {
      const deck = createSushiGoDeck();
      expect(deck.filter((c) => c.type === 'dumpling')).toHaveLength(14);
    });

    it('contains 26 maki roll cards (6x1 + 12x2 + 8x3)', () => {
      const deck = createSushiGoDeck();
      const maki = deck.filter((c) => c.type === 'maki');
      expect(maki).toHaveLength(26);

      const maki1 = maki.filter((c) => c.type === 'maki' && c.icons === 1);
      const maki2 = maki.filter((c) => c.type === 'maki' && c.icons === 2);
      const maki3 = maki.filter((c) => c.type === 'maki' && c.icons === 3);
      expect(maki1).toHaveLength(6);
      expect(maki2).toHaveLength(12);
      expect(maki3).toHaveLength(8);
    });

    it('contains 20 nigiri cards (5 egg + 10 salmon + 5 squid)', () => {
      const deck = createSushiGoDeck();
      const nigiri = deck.filter((c) => c.type === 'nigiri');
      expect(nigiri).toHaveLength(20);

      const eggs = nigiri.filter((c) => c.type === 'nigiri' && c.variant === 'egg');
      const salmon = nigiri.filter((c) => c.type === 'nigiri' && c.variant === 'salmon');
      const squid = nigiri.filter((c) => c.type === 'nigiri' && c.variant === 'squid');
      expect(eggs).toHaveLength(5);
      expect(salmon).toHaveLength(10);
      expect(squid).toHaveLength(5);
    });

    it('contains 6 wasabi cards', () => {
      const deck = createSushiGoDeck();
      expect(deck.filter((c) => c.type === 'wasabi')).toHaveLength(6);
    });

    it('contains 10 pudding cards', () => {
      const deck = createSushiGoDeck();
      expect(deck.filter((c) => c.type === 'pudding')).toHaveLength(10);
    });

    it('contains 4 chopsticks cards', () => {
      const deck = createSushiGoDeck();
      expect(deck.filter((c) => c.type === 'chopsticks')).toHaveLength(4);
    });
  });

  describe('shuffleDeck', () => {
    it('shuffles the deck in place', () => {
      const deck = createSushiGoDeck();
      const originalOrder = deck.map((c) => c.id);

      // Use a deterministic RNG
      let seed = 42;
      const rng = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };

      shuffleDeck(deck, rng);
      const shuffledOrder = deck.map((c) => c.id);

      // Should be same length
      expect(shuffledOrder).toHaveLength(108);
      // Should not be the same order
      expect(shuffledOrder).not.toEqual(originalOrder);
      // Should contain the same ids
      expect(new Set(shuffledOrder)).toEqual(new Set(originalOrder));
    });

    it('returns the same array reference', () => {
      const deck = createSushiGoDeck();
      const result = shuffleDeck(deck);
      expect(result).toBe(deck);
    });
  });

  describe('cardsPerPlayer', () => {
    it('returns 10 for 2 players', () => {
      expect(cardsPerPlayer(2)).toBe(10);
    });

    it('returns 9 for 3 players', () => {
      expect(cardsPerPlayer(3)).toBe(9);
    });

    it('returns 8 for 4 players', () => {
      expect(cardsPerPlayer(4)).toBe(8);
    });

    it('returns 7 for 5 players', () => {
      expect(cardsPerPlayer(5)).toBe(7);
    });

    it('throws for invalid player counts', () => {
      expect(() => cardsPerPlayer(1)).toThrow();
      expect(() => cardsPerPlayer(6)).toThrow();
    });
  });

  describe('cardLabel', () => {
    it('returns readable labels for all card types', () => {
      const deck = createSushiGoDeck();
      const labels = new Set(deck.map((c) => cardLabel(c)));

      expect(labels).toContain('Tempura');
      expect(labels).toContain('Sashimi');
      expect(labels).toContain('Dumpling');
      expect(labels).toContain('Maki x1');
      expect(labels).toContain('Maki x2');
      expect(labels).toContain('Maki x3');
      expect(labels).toContain('Egg Nigiri');
      expect(labels).toContain('Salmon Nigiri');
      expect(labels).toContain('Squid Nigiri');
      expect(labels).toContain('Wasabi');
      expect(labels).toContain('Pudding');
      expect(labels).toContain('Chopsticks');
    });
  });

  describe('constants', () => {
    it('has 3 rounds', () => {
      expect(ROUND_COUNT).toBe(3);
    });
  });
});
