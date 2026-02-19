/**
 * Scoring logic for 9-Card Golf.
 *
 * Rules (from Wikipedia / the epic spec):
 *   A  = 1 point
 *   2  = -2 points
 *   3-10 = face value
 *   J/Q = 10 points
 *   K  = 0 points
 *   Column of three matching ranks = 0 points (overrides individual values)
 *
 * Face-down cards are scored by their rank (they still count).
 */

import type { Card, Rank } from '../../src/card-system/Card';
import type { GolfGrid } from './GolfGrid';
import { GRID_COLS, GRID_ROWS } from './GolfGrid';

/**
 * Get the point value of a single card's rank.
 */
export function cardPointValue(rank: Rank): number {
  switch (rank) {
    case 'A':
      return 1;
    case '2':
      return -2;
    case '3':
      return 3;
    case '4':
      return 4;
    case '5':
      return 5;
    case '6':
      return 6;
    case '7':
      return 7;
    case '8':
      return 8;
    case '9':
      return 9;
    case '10':
      return 10;
    case 'J':
      return 10;
    case 'Q':
      return 10;
    case 'K':
      return 0;
  }
}

/**
 * Score a complete 3x3 golf grid.
 *
 * For each column, if all three cards share the same rank, that
 * column scores 0 regardless of individual card values. Otherwise,
 * each card in the column scores its individual value.
 *
 * Lower scores are better.
 */
export function scoreGrid(grid: GolfGrid): number {
  let total = 0;

  for (let col = 0; col < GRID_COLS; col++) {
    const colCards: Card[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      colCards.push(grid[row * GRID_COLS + col]);
    }

    // Check if all three cards in the column have the same rank
    const allSameRank =
      colCards[0].rank === colCards[1].rank &&
      colCards[1].rank === colCards[2].rank;

    if (allSameRank) {
      // Column of three-of-a-kind scores 0
      total += 0;
    } else {
      // Sum individual card values
      for (const card of colCards) {
        total += cardPointValue(card.rank);
      }
    }
  }

  return total;
}

/**
 * Score only the visible (face-up) cards in a grid.
 * Face-down cards are treated as 0 for this calculation.
 * Column-of-three matching only applies if all 3 in the column are face-up.
 */
export function scoreVisibleCards(grid: GolfGrid): number {
  let total = 0;

  for (let col = 0; col < GRID_COLS; col++) {
    const colCards: Card[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      colCards.push(grid[row * GRID_COLS + col]);
    }

    const allFaceUp = colCards.every((c) => c.faceUp);
    const allSameRank =
      allFaceUp &&
      colCards[0].rank === colCards[1].rank &&
      colCards[1].rank === colCards[2].rank;

    if (allSameRank) {
      total += 0;
    } else {
      for (const card of colCards) {
        if (card.faceUp) {
          total += cardPointValue(card.rank);
        }
      }
    }
  }

  return total;
}
