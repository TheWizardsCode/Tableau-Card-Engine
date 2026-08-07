/**
 * Tests for ColorettoScoring -- canonical point table, positive/negative
 * color selection, and the <3 colors edge case.
 *
 * Covers acceptance criteria:
 *   - All scoring table buckets: 1=1, 2=3, 3=6, 4=10, 5=15, 6+=21.
 *   - Positive/negative color selection logic.
 *   - <3 colors edge case (all colors positive).
 */

import { describe, it, expect } from 'vitest';
import {
  COLOR_POINTS,
  pointsForCount,
  countChameleonsOfColor,
  colorCounts,
  presentColors,
  scoreColors,
  scorePlayerRound,
  selectBestPositiveColors,
  positiveColorsForPlayer,
  countJokers,
  countBonusCards,
  optimalJokerAssignment,
  BONUS_POINTS,
} from '../../example-games/coloretto/ColorettoScoring';
import type { ChameleonColor, ColorettoCard } from '../../example-games/coloretto/ColorettoCards';

/** Build a chameleon card quickly. */
function ch(color: ChameleonColor, count: 1 | 2, id: number): ColorettoCard {
  return { id, type: 'chameleon', color, count };
}

/** Build a chameleon card with an arbitrary count (for aggregate-count tests). */
function chN(color: ChameleonColor, count: number, id: number): ColorettoCard {
  return { id, type: 'chameleon', color, count: count as 1 | 2 };
}

describe('ColorettoScoring', () => {
  describe('pointsForCount (canonical table)', () => {
    it('defines the canonical table [0,1,3,6,10,15,21]', () => {
      expect([...COLOR_POINTS]).toEqual([0, 1, 3, 6, 10, 15, 21]);
    });

    it('scores every bucket: 1=1, 2=3, 3=6, 4=10, 5=15', () => {
      expect(pointsForCount(1)).toBe(1);
      expect(pointsForCount(2)).toBe(3);
      expect(pointsForCount(3)).toBe(6);
      expect(pointsForCount(4)).toBe(10);
      expect(pointsForCount(5)).toBe(15);
    });

    it('caps 6+ cards at 21', () => {
      expect(pointsForCount(6)).toBe(21);
      expect(pointsForCount(8)).toBe(21);
      expect(pointsForCount(12)).toBe(21);
    });

    it('scores zero or negative counts as 0', () => {
      expect(pointsForCount(0)).toBe(0);
      expect(pointsForCount(-3)).toBe(0);
    });
  });

  describe('colorCounts', () => {
    it('counts single and double chameleon cards', () => {
      const collection = [
        chN('red', 1, 0),
        chN('red', 2, 1),
        chN('blue', 1, 2),
      ];
      const counts = colorCounts(collection);
      expect(counts.red).toBe(3);
      expect(counts.blue).toBe(1);
      expect(counts.green).toBe(0);
    });

    it('ignores the Last Round card', () => {
      const collection: ColorettoCard[] = [
        chN('red', 1, 0),
        { id: 99, type: 'last-round' },
      ];
      const counts = colorCounts(collection);
      expect(counts.red).toBe(1);
      expect(presentColors(counts)).toEqual(['red']);
    });

    it('countChameleonsOfColor returns per-color totals', () => {
      const collection = [chN('yellow', 2, 0), chN('yellow', 2, 1)];
      expect(countChameleonsOfColor(collection, 'yellow')).toBe(4);
      expect(countChameleonsOfColor(collection, 'blue')).toBe(0);
    });
  });

  describe('scoreColors (positive/negative)', () => {
    it('scores positive colors with their points', () => {
      const collection = [chN('red', 3, 0)]; // 3 red = 6 pts
      expect(scoreColors(collection, new Set(['red']))).toBe(6);
    });

    it('scores non-positive colors negatively', () => {
      const collection = [chN('red', 3, 0)]; // 3 red = 6 pts, negative → -6
      expect(scoreColors(collection, new Set([]))).toBe(-6);
    });

    it('combines positive and negative colors', () => {
      // 4 red (10) + 2 blue (3) positive, 3 green (6) negative → 7
      const collection = [
        chN('red', 2, 0), chN('red', 2, 1),
        chN('blue', 2, 2),
        chN('green', 3, 3),
      ];
      expect(scoreColors(collection, new Set(['red', 'blue']))).toBe(10 + 3 - 6);
    });
  });

  describe('scorePlayerRound', () => {
    it('returns total and per-color breakdown', () => {
      const collection = [ch('red', 2, 0), ch('blue', 1, 1)];
      const result = scorePlayerRound(collection, ['red', 'blue']);
      expect(result.total).toBe(3 + 1);
      expect(result.details).toHaveLength(2);
      expect(result.details[0]).toMatchObject({ color: 'red', count: 2, points: 3, positive: true });
      expect(result.details[1]).toMatchObject({ color: 'blue', count: 1, points: 1, positive: true });
      expect(result.positiveColors).toEqual(['red', 'blue']);
    });

    it('marks unselected colors as negative', () => {
      const collection = [ch('red', 1, 0), ch('blue', 1, 1)];
      const result = scorePlayerRound(collection, ['red']);
      const blue = result.details.find((d) => d.color === 'blue');
      expect(blue?.positive).toBe(false);
      expect(blue?.points).toBe(-1);
      expect(result.total).toBe(1 - 1);
    });

    it('produces a negative round total when an unselected strong color outweighs the positives', () => {
      // A player who accumulated cards in 4 colors (only possible once
      // collections persist across rounds): 1 card each of red/yellow/green
      // and 6 brown (21 pts). Choosing the 3 weak colors positively leaves
      // brown scoring −21 → a negative round score.
      const collection = [
        chN('red', 1, 0), chN('yellow', 1, 1), chN('green', 1, 2),
        chN('brown', 2, 3), chN('brown', 2, 4), chN('brown', 2, 5),
      ];
      const result = scorePlayerRound(collection, ['red', 'yellow', 'green']);
      const brown = result.details.find((d) => d.color === 'brown');
      expect(brown?.positive).toBe(false);
      expect(brown?.points).toBe(-21);
      expect(result.total).toBe(1 + 1 + 1 - 21); // -18
      expect(result.total).toBeLessThan(0);
    });
  });

  describe('selectBestPositiveColors', () => {
    it('selects all colors when fewer than 3 are present (all positive)', () => {
      const collection = [ch('red', 2, 0), ch('blue', 1, 1)];
      expect(selectBestPositiveColors(collection)).toEqual(['red', 'blue']);
    });

    it('selects all present colors with exactly 3 colors', () => {
      const collection = [
        ch('red', 1, 0), ch('blue', 1, 1), ch('green', 1, 2),
      ];
      // Order follows the canonical COLORS constant (red, yellow, green, ...).
      expect(selectBestPositiveColors(collection)).toEqual(['red', 'green', 'blue']);
    });

    it('selects the optimal 3 of 4 colors', () => {
      // 5 red (15), 4 blue (10), 3 yellow (6), 1 green (1)
      // Best 3: red + blue + yellow = 15+10+6-1 = 30
      // (leaving green negative beats leaving any strong color negative)
      const collection = [
        chN('red', 2, 0), chN('red', 2, 1), chN('red', 1, 2),   // 5 red
        chN('blue', 2, 3), chN('blue', 2, 4),                   // 4 blue
        chN('yellow', 2, 5), chN('yellow', 1, 6),               // 3 yellow
        chN('green', 1, 7),                                     // 1 green
      ];
      // Present order follows COLORS: red, yellow, green, blue.
      // Best 3 = red (15) + yellow (6) + blue (10), leaving green negative.
      expect(selectBestPositiveColors(collection)).toEqual(['red', 'yellow', 'blue']);
    });

    it('leaves the weakest color negative', () => {
      // 1 red, 1 blue, 1 green, 1 yellow: any 3 positive, the 4th negative.
      // Scoring is symmetric, so the first combination wins deterministically.
      const collection = [
        chN('red', 1, 0), chN('blue', 1, 1), chN('green', 1, 2), chN('yellow', 1, 3),
      ];
      const selected = selectBestPositiveColors(collection);
      expect(selected).toHaveLength(3);
      // Total with any 3 positive = 3 - 1 = 2
      expect(scoreColors(collection, new Set(selected))).toBe(2);
    });
  });

  describe('positiveColorsForPlayer', () => {
    it('uses the provided selection when given', () => {
      const collection = [chN('red', 3, 0), chN('blue', 3, 1)];
      const provided: ChameleonColor[] = ['red'];
      expect(positiveColorsForPlayer(collection, provided)).toEqual(['red']);
    });

    it('falls back to the optimal selection when not provided', () => {
      const collection = [chN('red', 3, 0), chN('blue', 3, 1)];
      expect(positiveColorsForPlayer(collection)).toEqual(['red', 'blue']);
    });
  });

  describe('joker and bonus cards', () => {
    it('counts joker and bonus cards in a collection', () => {
      const collection: ColorettoCard[] = [
        ch('red', 1, 0),
        { id: 43, type: 'joker' },
        { id: 44, type: 'joker' },
        { id: 45, type: 'bonus' },
      ];
      expect(countJokers(collection)).toBe(2);
      expect(countBonusCards(collection)).toBe(1);
    });

    it('declares jokers to colors in colorCounts (per-joker assignment)', () => {
      const collection: ColorettoCard[] = [ch('red', 2, 0), { id: 43, type: 'joker' }];
      const counts = colorCounts(collection, ['red']);
      expect(counts.red).toBe(3);
      expect(countChameleonsOfColor(collection, 'red', ['red'])).toBe(3);
      expect(countChameleonsOfColor(collection, 'blue', ['red'])).toBe(0);
    });

    it('adds a flat +2 per bonus card to the round total', () => {
      expect(BONUS_POINTS).toBe(2);
      const collection: ColorettoCard[] = [
        ch('red', 1, 0),
        { id: 44, type: 'bonus' },
        { id: 45, type: 'bonus' },
      ];
      const result = scorePlayerRound(collection, ['red']);
      expect(result.bonusPoints).toBe(4);
      expect(result.total).toBe(1 + 4);
    });

    it('counts declared jokers toward color counts when scoring', () => {
      const collection: ColorettoCard[] = [ch('red', 2, 0), { id: 43, type: 'joker' }];
      // Joker declared red → 3 red = 6 pts.
      const result = scorePlayerRound(collection, ['red'], ['red']);
      expect(result.total).toBe(6);
      const red = result.details.find((d) => d.color === 'red');
      expect(red?.count).toBe(3);
      expect(result.jokerAssignment).toEqual(['red']);
    });

    it('ignores jokers when no assignment is given (zero-count default)', () => {
      const collection: ColorettoCard[] = [ch('red', 2, 0), { id: 43, type: 'joker' }];
      expect(scorePlayerRound(collection, ['red']).total).toBe(3);
      expect(scoreColors(collection, new Set(['red']))).toBe(3);
    });
  });

  describe('optimalJokerAssignment', () => {
    it('assigns jokers to the color that maximizes the score', () => {
      // 2 red + 2 jokers: both on red → 4 red = 10 beats 3 red + 1 blue = 7.
      const collection: ColorettoCard[] = [
        ch('red', 2, 0),
        { id: 43, type: 'joker' },
        { id: 44, type: 'joker' },
      ];
      const assignment = optimalJokerAssignment(collection);
      expect(assignment).toEqual(['red', 'red']);
      expect(scorePlayerRound(collection, ['red'], assignment).total).toBe(10);
    });

    it('respects a fixed positive-color set when optimizing', () => {
      // 1 red + 1 blue + 2 jokers, positives fixed to red+blue: both jokers
      // on red → 3 red (6) + 1 blue (1) = 7 beats spreading them (6).
      const collection: ColorettoCard[] = [
        ch('red', 1, 0),
        ch('blue', 1, 1),
        { id: 43, type: 'joker' },
        { id: 44, type: 'joker' },
      ];
      const assignment = optimalJokerAssignment(collection, ['red', 'blue']);
      expect(assignment).toEqual(['red', 'red']);
    });

    it('returns an empty assignment for a jokerless collection', () => {
      expect(optimalJokerAssignment([ch('red', 2, 0)])).toEqual([]);
    });
  });

  describe('selectBestPositiveColors with jokers', () => {
    it('selects positives from the joint joker-assignment optimum', () => {
      // 3 base colors (1 each) + 1 joker: the best play declares the joker
      // on an existing color (5 pts) rather than creating a 4th color that
      // would score negatively (2 pts).
      const collection: ColorettoCard[] = [
        ch('red', 1, 0),
        ch('blue', 1, 1),
        ch('green', 1, 2),
        { id: 43, type: 'joker' },
      ];
      const positives = selectBestPositiveColors(collection);
      // Present colors follow COLORS order (red, green, blue); all three
      // stay positive when the joker boosts an existing color.
      expect(positives).toEqual(['red', 'green', 'blue']);
      const assignment = optimalJokerAssignment(collection);
      expect(assignment).toEqual(['red']);
      expect(scorePlayerRound(collection, positives, assignment).total).toBe(5);
    });
  });
});
