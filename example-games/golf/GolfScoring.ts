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
import type { AiVisibleGrid, AiVisibleCardSlot } from './GolfGame';
import type { GolfMove } from './GolfRules';
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

// ── AI-fair scoring ─────────────────────────────────────────

/**
 * Average point value across all 13 ranks, used as the expected
 * value for face-down (unknown) cards in AI scoring.
 *
 * Computed from: A(1) + 2(-2) + 3(3) + 4(4) + 5(5) + 6(6) +
 *   7(7) + 8(8) + 9(9) + 10(10) + J(10) + Q(10) + K(0) = 71
 * Average: 71 / 13 ≈ 5.46
 */
export const AVERAGE_CARD_VALUE = 71 / 13;

/**
 * Score an AI-visible grid fairly.
 *
 * Face-up cards are scored normally. Face-down cards (represented as
 * `{ faceUp: false }` without rank/suit) are assigned the average
 * card point value as an estimate, since the AI cannot know their
 * actual value.
 *
 * Column-of-three matching only applies when all 3 cards in a column
 * are face-up (the AI cannot know if face-down cards would match).
 *
 * This function is used by AI strategies to evaluate moves without
 * cheating by accessing hidden card data.
 */
export function scoreAiVisibleGrid(grid: AiVisibleGrid): number {
  let total = 0;

  for (let col = 0; col < GRID_COLS; col++) {
    const colSlots: AiVisibleCardSlot[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      colSlots.push(grid[row * GRID_COLS + col]);
    }

    const allFaceUp = colSlots.every(
      (s): s is Card => s.faceUp === true,
    );

    if (
      allFaceUp &&
      (colSlots[0] as Card).rank === (colSlots[1] as Card).rank &&
      (colSlots[1] as Card).rank === (colSlots[2] as Card).rank
    ) {
      // Column of three matching ranks scores 0
      total += 0;
    } else {
      for (const slot of colSlots) {
        if (slot.faceUp && 'rank' in slot) {
          total += cardPointValue(slot.rank);
        } else {
          // Face-down: use average card value as estimate
          total += AVERAGE_CARD_VALUE;
        }
      }
    }
  }

  return total;
}

/**
 * Simulate applying a move to an AI-visible grid copy and return
 * the resulting score.
 *
 * This is the fair counterpart to the old `simulateMoveScore()` that
 * used `scoreGrid()` (which saw face-down cards). This version:
 * - Only scores face-up cards at their actual value.
 * - Uses the average card value for face-down cards.
 * - After a swap, the new card is face-up (known).
 * - After a discard-and-flip, the flipped card becomes face-up
 *   but its value is unknown to the AI beforehand, so we use the
 *   average card value estimate for the flipped position.
 */
export function simulateAiMoveScore(
  grid: AiVisibleGrid,
  drawnCard: Card,
  move: GolfMove,
): number {
  // Deep-copy the grid
  const gridCopy = grid.map((slot) => ({ ...slot })) as AiVisibleGrid;
  const idx = move.row * GRID_COLS + move.col;

  if (move.kind === 'swap') {
    // Replace the slot with the drawn card (now face-up and known)
    gridCopy[idx] = { ...drawnCard, faceUp: true };
  }
  // For discard-and-flip: the drawn card is discarded, the grid card
  // is flipped face-up. Since we don't know the hidden card's value,
  // the slot stays as { faceUp: false } with average-value estimate.

  return scoreAiVisibleGrid(gridCopy);
}
