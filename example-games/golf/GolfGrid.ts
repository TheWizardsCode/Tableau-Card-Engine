/**
 * GolfGrid -- a 3x3 arrangement of cards for 9-Card Golf.
 *
 * The grid is stored as a flat 9-element array in row-major order:
 *   [0][1][2]   (row 0)
 *   [3][4][5]   (row 1)
 *   [6][7][8]   (row 2)
 *
 * Columns are indices {0,3,6}, {1,4,7}, {2,5,8}.
 */

import type { Card } from '../../src/card-system/Card';

export const GRID_ROWS = 3;
export const GRID_COLS = 3;
export const GRID_SIZE = GRID_ROWS * GRID_COLS; // 9

/**
 * A 3x3 grid of cards. Stored as a 9-element tuple in row-major order.
 */
export type GolfGrid = [Card, Card, Card, Card, Card, Card, Card, Card, Card];

/**
 * Convert (row, col) to a flat index.
 * @throws If row or col is out of bounds.
 */
export function gridIndex(row: number, col: number): number {
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) {
    throw new Error(
      `Grid position (${row}, ${col}) is out of bounds (valid: 0-${GRID_ROWS - 1}, 0-${GRID_COLS - 1})`,
    );
  }
  return row * GRID_COLS + col;
}

/**
 * Convert a flat index to (row, col).
 */
export function gridPosition(index: number): { row: number; col: number } {
  return {
    row: Math.floor(index / GRID_COLS),
    col: index % GRID_COLS,
  };
}

/**
 * Get the card at a specific grid position.
 */
export function getGridCard(grid: GolfGrid, row: number, col: number): Card {
  return grid[gridIndex(row, col)];
}

/**
 * Whether all 9 cards in the grid are face-up.
 */
export function isGridFullyRevealed(grid: GolfGrid): boolean {
  return grid.every((card) => card.faceUp);
}

/**
 * Count how many cards are face-up.
 */
export function countFaceUp(grid: GolfGrid): number {
  return grid.filter((card) => card.faceUp).length;
}

/**
 * Create a GolfGrid from an array of exactly 9 cards.
 * @throws If the array does not have exactly 9 elements.
 */
export function createGolfGrid(cards: Card[]): GolfGrid {
  if (cards.length !== GRID_SIZE) {
    throw new Error(
      `GolfGrid requires exactly ${GRID_SIZE} cards, got ${cards.length}`,
    );
  }
  return [...cards] as GolfGrid;
}
