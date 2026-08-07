/**
 * Tests for ColorettoCards -- deck composition and player-count config.
 *
 * Covers acceptance criteria:
 *   - Deck composition: 7 colors, 3x single + 3x double per color,
 *     exactly one Last Round card.
 *   - Player-count configuration: rows (3/4/5) and rounds (7/5/4/3).
 */

import { describe, it, expect } from 'vitest';
import {
  COLORS,
  DECK_SIZE,
  SINGLE_PER_COLOR,
  DOUBLE_PER_COLOR,
  JOKER_COUNT,
  BONUS_COUNT,
  createColorettoDeck,
  rowsForPlayerCount,
  roundsForPlayerCount,
  colorLabel,
  colorHex,
  cardLabel,
  ROW_CAPACITY,
} from '../../example-games/coloretto/ColorettoCards';

describe('ColorettoCards', () => {
  describe('deck composition', () => {
    it('has exactly 49 cards (42 chameleons + 1 Last Round + 3 jokers + 3 bonus)', () => {
      const deck = createColorettoDeck();
      expect(deck).toHaveLength(DECK_SIZE);
      expect(DECK_SIZE).toBe(49);
    });

    it('contains the 7 canonical chameleon colors', () => {
      expect(COLORS).toHaveLength(7);
      expect(COLORS).toEqual([
        'red', 'yellow', 'green', 'blue', 'purple', 'orange', 'brown',
      ]);
    });

    it('has 3 single and 3 double chameleon cards per color', () => {
      const deck = createColorettoDeck();
      for (const color of COLORS) {
        const singles = deck.filter(
          (c) => c.type === 'chameleon' && c.color === color && c.count === 1,
        );
        const doubles = deck.filter(
          (c) => c.type === 'chameleon' && c.color === color && c.count === 2,
        );
        expect(singles).toHaveLength(SINGLE_PER_COLOR);
        expect(doubles).toHaveLength(DOUBLE_PER_COLOR);
      }
    });

    it('has exactly one Last Round card', () => {
      const deck = createColorettoDeck();
      const lastRound = deck.filter((c) => c.type === 'last-round');
      expect(lastRound).toHaveLength(1);
      expect(lastRound[0]).toMatchObject({ type: 'last-round' });
    });

    it('gives every card a unique sequential id', () => {
      const deck = createColorettoDeck();
      const ids = deck.map((c) => c.id);
      expect(new Set(ids).size).toBe(deck.length);
      expect(ids[0]).toBe(0);
      expect(ids[ids.length - 1]).toBe(DECK_SIZE - 1);
    });

    it('has exactly 3 joker (wild) cards', () => {
      const deck = createColorettoDeck();
      const jokers = deck.filter((c) => c.type === 'joker');
      expect(jokers).toHaveLength(JOKER_COUNT);
      expect(JOKER_COUNT).toBe(3);
      for (const joker of jokers) {
        expect(joker).toMatchObject({ type: 'joker' });
      }
    });

    it('has exactly 3 +2 bonus cards', () => {
      const deck = createColorettoDeck();
      const bonus = deck.filter((c) => c.type === 'bonus');
      expect(bonus).toHaveLength(BONUS_COUNT);
      expect(BONUS_COUNT).toBe(3);
      for (const card of bonus) {
        expect(card).toMatchObject({ type: 'bonus' });
      }
    });

    it('places the Last Round card last in the unshuffled base order', () => {
      const deck = createColorettoDeck();
      expect(deck[deck.length - 1]).toMatchObject({ type: 'last-round' });
    });
  });

  describe('card display helpers', () => {
    it('capitalizes color labels', () => {
      expect(colorLabel('red')).toBe('Red');
      expect(colorLabel('orange')).toBe('Orange');
      expect(colorLabel('brown')).toBe('Brown');
    });

    it('returns a CSS hex for every color', () => {
      for (const color of COLORS) {
        expect(colorHex(color)).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('labels chameleon cards with count and color', () => {
      const card = { id: 0, type: 'chameleon' as const, color: 'blue' as const, count: 2 as const };
      expect(cardLabel(card)).toBe('2× Blue');
    });

    it('labels the Last Round card', () => {
      const card = { id: 42, type: 'last-round' as const };
      expect(cardLabel(card)).toBe('Last Round');
    });

    it('labels joker and +2 bonus cards', () => {
      expect(cardLabel({ id: 43, type: 'joker' as const })).toBe('Joker');
      expect(cardLabel({ id: 44, type: 'bonus' as const })).toBe('+2');
    });
  });

  describe('player-count configuration', () => {
    it('returns 3 rows for 2-3 players', () => {
      expect(rowsForPlayerCount(2)).toBe(3);
      expect(rowsForPlayerCount(3)).toBe(3);
    });

    it('returns 4 rows for 4 players', () => {
      expect(rowsForPlayerCount(4)).toBe(4);
    });

    it('returns 5 rows for 5 players', () => {
      expect(rowsForPlayerCount(5)).toBe(5);
    });

    it('throws for invalid player counts', () => {
      expect(() => rowsForPlayerCount(1)).toThrow();
      expect(() => rowsForPlayerCount(6)).toThrow();
    });

    it('returns canonical round counts: 2p=7, 3p=5, 4p=4, 5p=3', () => {
      expect(roundsForPlayerCount(2)).toBe(7);
      expect(roundsForPlayerCount(3)).toBe(5);
      expect(roundsForPlayerCount(4)).toBe(4);
      expect(roundsForPlayerCount(5)).toBe(3);
    });

    it('throws for invalid player counts in roundsForPlayerCount', () => {
      expect(() => roundsForPlayerCount(1)).toThrow();
      expect(() => roundsForPlayerCount(6)).toThrow();
    });

    it('uses a row capacity of 3', () => {
      expect(ROW_CAPACITY).toBe(3);
    });
  });
});
