import { describe, it, expect } from 'vitest';
import { createCard } from '../../src/card-system/Card';
import { createGolfGrid } from '../../example-games/golf/GolfGrid';
import type { GolfGrid } from '../../example-games/golf/GolfGrid';
import {
  cardPointValue,
  scoreGrid,
  scoreVisibleCards,
} from '../../example-games/golf/GolfScoring';

/** Helper: build a grid from rank strings for easy test setup. */
function gridFromRanks(
  ranks: [string, string, string, string, string, string, string, string, string],
  allFaceUp: boolean = true,
): GolfGrid {
  const suit = 'spades' as const;
  return createGolfGrid(
    ranks.map((r) => createCard(r as any, suit, allFaceUp)),
  );
}

describe('GolfScoring', () => {
  describe('cardPointValue', () => {
    it('A = 1', () => expect(cardPointValue('A')).toBe(1));
    it('2 = -2', () => expect(cardPointValue('2')).toBe(-2));
    it('3 = 3', () => expect(cardPointValue('3')).toBe(3));
    it('5 = 5', () => expect(cardPointValue('5')).toBe(5));
    it('10 = 10', () => expect(cardPointValue('10')).toBe(10));
    it('J = 10', () => expect(cardPointValue('J')).toBe(10));
    it('Q = 10', () => expect(cardPointValue('Q')).toBe(10));
    it('K = 0', () => expect(cardPointValue('K')).toBe(0));
  });

  describe('scoreGrid', () => {
    it('should score a grid with no column matches', () => {
      // Col 0: A(1), 4(4), 7(7) = 12
      // Col 1: 2(-2), 5(5), 8(8) = 11
      // Col 2: 3(3), 6(6), 9(9) = 18
      // Total: 41
      const grid = gridFromRanks(['A', '2', '3', '4', '5', '6', '7', '8', '9']);
      expect(scoreGrid(grid)).toBe(41);
    });

    it('should score column-of-three-of-a-kind as 0', () => {
      // Col 0: K, K, K = 0 (three-of-a-kind)
      // Col 1: A(1), A(1), A(1) = 0 (three-of-a-kind)
      // Col 2: 5(5), 5(5), 5(5) = 0 (three-of-a-kind)
      // Total: 0
      const grid = gridFromRanks(['K', 'A', '5', 'K', 'A', '5', 'K', 'A', '5']);
      expect(scoreGrid(grid)).toBe(0);
    });

    it('should score mixed columns (some matching, some not)', () => {
      // Col 0: K, K, K = 0 (three-of-a-kind)
      // Col 1: 2(-2), 3(3), 4(4) = 5
      // Col 2: J(10), Q(10), A(1) = 21
      // Total: 26
      const grid = gridFromRanks(['K', '2', 'J', 'K', '3', 'Q', 'K', '4', 'A']);
      expect(scoreGrid(grid)).toBe(26);
    });

    it('should handle all Kings (best possible score)', () => {
      const grid = gridFromRanks(['K', 'K', 'K', 'K', 'K', 'K', 'K', 'K', 'K']);
      expect(scoreGrid(grid)).toBe(0);
    });

    it('should handle worst-case high cards', () => {
      // All Queens: Q=10 each, no column matches (same rank means match!)
      // Actually all Q means each column IS a match -> score 0
      const grid = gridFromRanks(['Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q']);
      expect(scoreGrid(grid)).toBe(0); // all columns are three-of-a-kind
    });

    it('should score 2s as -2 points', () => {
      // Col 0: 2(-2), 2(-2), 2(-2) = 0 (three-of-a-kind)
      // Col 1: 2(-2), 3(3), 4(4) = 5
      // Col 2: 2(-2), 3(3), 4(4) = 5
      // Total: 10
      const grid = gridFromRanks(['2', '2', '2', '2', '3', '3', '2', '4', '4']);
      expect(scoreGrid(grid)).toBe(10);
    });

    it('should score only column 0 as match when ranks differ across columns', () => {
      // Col 0: 5, 5, 5 = 0 (match)
      // Col 1: 5(5), 6(6), 7(7) = 18
      // Col 2: 8(8), 9(9), 10(10) = 27
      // Total: 45
      const grid = gridFromRanks(['5', '5', '8', '5', '6', '9', '5', '7', '10']);
      expect(scoreGrid(grid)).toBe(45);
    });
  });

  describe('scoreVisibleCards', () => {
    it('should score 0 when no cards are face-up', () => {
      const grid = gridFromRanks(
        ['A', '2', '3', '4', '5', '6', '7', '8', '9'],
        false,
      );
      expect(scoreVisibleCards(grid)).toBe(0);
    });

    it('should score only face-up cards', () => {
      const grid = gridFromRanks(
        ['A', '2', '3', '4', '5', '6', '7', '8', '9'],
        false,
      );
      // Flip just column 0 top card (A=1)
      grid[0].faceUp = true;
      expect(scoreVisibleCards(grid)).toBe(1);
    });

    it('should apply column matching only when all 3 are face-up', () => {
      const grid = gridFromRanks(
        ['K', 'A', '5', 'K', 'A', '5', 'K', 'A', '5'],
        false,
      );
      // Flip only 2 of 3 Ks in column 0
      grid[0].faceUp = true; // K = 0
      grid[3].faceUp = true; // K = 0
      // Column not fully revealed, no three-of-a-kind bonus
      expect(scoreVisibleCards(grid)).toBe(0);

      // Flip the third K
      grid[6].faceUp = true; // K = 0
      // Now column 0 is fully revealed and all match -> 0
      expect(scoreVisibleCards(grid)).toBe(0);
    });
  });
});
