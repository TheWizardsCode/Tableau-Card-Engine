import { describe, it, expect } from 'vitest';
import { createCard } from '../../src/card-system/Card';
import type { Card } from '../../src/card-system/Card';
import {
  createGolfGrid,
  gridIndex,
  gridPosition,
  getGridCard,
  isGridFullyRevealed,
  countFaceUp,
} from '../../example-games/golf/GolfGrid';
import type { GolfGrid } from '../../example-games/golf/GolfGrid';

/** Helper: create a 9-card grid, all face-down by default. */
function makeGrid(faceUp: boolean = false): GolfGrid {
  return createGolfGrid([
    createCard('A', 'spades', faceUp),
    createCard('2', 'hearts', faceUp),
    createCard('3', 'diamonds', faceUp),
    createCard('4', 'clubs', faceUp),
    createCard('5', 'spades', faceUp),
    createCard('6', 'hearts', faceUp),
    createCard('7', 'diamonds', faceUp),
    createCard('8', 'clubs', faceUp),
    createCard('9', 'spades', faceUp),
  ]);
}

describe('GolfGrid', () => {
  describe('createGolfGrid', () => {
    it('should create a grid from 9 cards', () => {
      const grid = makeGrid();
      expect(grid).toHaveLength(9);
    });

    it('should throw if not exactly 9 cards', () => {
      expect(() => createGolfGrid([])).toThrow('exactly 9');
      expect(() =>
        createGolfGrid([createCard('A', 'spades')]),
      ).toThrow('exactly 9');
    });

    it('should copy the source array', () => {
      const source: Card[] = [];
      for (let i = 0; i < 9; i++) {
        source.push(createCard('A', 'spades'));
      }
      const grid = createGolfGrid(source);
      source[0] = createCard('K', 'hearts');
      expect(grid[0].rank).toBe('A'); // not mutated
    });
  });

  describe('gridIndex', () => {
    it('should convert (0,0) to index 0', () => {
      expect(gridIndex(0, 0)).toBe(0);
    });

    it('should convert (2,2) to index 8', () => {
      expect(gridIndex(2, 2)).toBe(8);
    });

    it('should convert (1,2) to index 5', () => {
      expect(gridIndex(1, 2)).toBe(5);
    });

    it('should throw on out-of-bounds row', () => {
      expect(() => gridIndex(3, 0)).toThrow('out of bounds');
      expect(() => gridIndex(-1, 0)).toThrow('out of bounds');
    });

    it('should throw on out-of-bounds col', () => {
      expect(() => gridIndex(0, 3)).toThrow('out of bounds');
      expect(() => gridIndex(0, -1)).toThrow('out of bounds');
    });
  });

  describe('gridPosition', () => {
    it('should convert index 0 to (0,0)', () => {
      expect(gridPosition(0)).toEqual({ row: 0, col: 0 });
    });

    it('should convert index 8 to (2,2)', () => {
      expect(gridPosition(8)).toEqual({ row: 2, col: 2 });
    });

    it('should convert index 5 to (1,2)', () => {
      expect(gridPosition(5)).toEqual({ row: 1, col: 2 });
    });
  });

  describe('getGridCard', () => {
    it('should return the card at the given position', () => {
      const grid = makeGrid();
      const card = getGridCard(grid, 0, 0);
      expect(card.rank).toBe('A');
      expect(card.suit).toBe('spades');
    });

    it('should return the correct card at (2,2)', () => {
      const grid = makeGrid();
      const card = getGridCard(grid, 2, 2);
      expect(card.rank).toBe('9');
    });
  });

  describe('isGridFullyRevealed', () => {
    it('should return false when all face-down', () => {
      expect(isGridFullyRevealed(makeGrid(false))).toBe(false);
    });

    it('should return true when all face-up', () => {
      expect(isGridFullyRevealed(makeGrid(true))).toBe(true);
    });

    it('should return false when partially revealed', () => {
      const grid = makeGrid(false);
      grid[0].faceUp = true;
      grid[4].faceUp = true;
      expect(isGridFullyRevealed(grid)).toBe(false);
    });
  });

  describe('countFaceUp', () => {
    it('should return 0 when all face-down', () => {
      expect(countFaceUp(makeGrid(false))).toBe(0);
    });

    it('should return 9 when all face-up', () => {
      expect(countFaceUp(makeGrid(true))).toBe(9);
    });

    it('should count correctly for partial reveal', () => {
      const grid = makeGrid(false);
      grid[0].faceUp = true;
      grid[3].faceUp = true;
      grid[6].faceUp = true;
      expect(countFaceUp(grid)).toBe(3);
    });
  });
});
