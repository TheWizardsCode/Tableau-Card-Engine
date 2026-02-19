/**
 * Golf game rules -- turn legality, move application, and
 * end-of-round detection for 9-Card Golf.
 *
 * Turn flow:
 *   1. Player draws one card from the stock pile OR the discard pile.
 *   2. Player either:
 *      a. Swaps the drawn card with any card in their grid
 *         (the replaced card goes to the discard pile, face-up), OR
 *      b. Discards the drawn card (face-up) to the discard pile
 *         and then flips one face-down grid card face-up.
 *
 * Round ending:
 *   - When a player's grid becomes fully face-up after their turn,
 *     every OTHER player gets exactly one more turn.
 *   - After those final turns, the round ends.
 *
 * Initial reveal:
 *   - At the start of the round, each player flips exactly 3 of
 *     their 9 cards face-up before the first turn.
 */

import type { Card } from '../../src/card-system/Card';
import type { GolfGrid } from './GolfGrid';
import { gridIndex, isGridFullyRevealed } from './GolfGrid';

// ── Draw source ─────────────────────────────────────────────

/** Where the player draws from. */
export type DrawSource = 'stock' | 'discard';

// ── Move types ──────────────────────────────────────────────

/**
 * Player swaps the drawn card with a card in their grid.
 * The replaced card goes face-up to the discard pile.
 */
export interface SwapMove {
  kind: 'swap';
  /** Grid position (row, col) of the card to replace. */
  row: number;
  col: number;
}

/**
 * Player discards the drawn card and flips a face-down
 * grid card face-up.
 */
export interface DiscardAndFlipMove {
  kind: 'discard-and-flip';
  /** Grid position (row, col) of the face-down card to flip. */
  row: number;
  col: number;
}

/** A player's action after drawing a card. */
export type GolfMove = SwapMove | DiscardAndFlipMove;

// ── Legality checks ─────────────────────────────────────────

/**
 * Result of a legality check: either legal or illegal with a reason.
 */
export type LegalityResult =
  | { legal: true }
  | { legal: false; reason: string };

/**
 * Check whether a move is legal given the current grid state.
 *
 * Rules enforced:
 * - Grid position must be in bounds (0-2 for row and col).
 * - For discard-and-flip: the target card must be face-down.
 * - Swap moves are always legal if the position is valid.
 */
export function checkMoveLegality(
  grid: GolfGrid,
  move: GolfMove,
): LegalityResult {
  // Validate grid position (gridIndex throws on out-of-bounds)
  let idx: number;
  try {
    idx = gridIndex(move.row, move.col);
  } catch {
    return {
      legal: false,
      reason: `Grid position (${move.row}, ${move.col}) is out of bounds`,
    };
  }

  if (move.kind === 'discard-and-flip') {
    const card = grid[idx];
    if (card.faceUp) {
      return {
        legal: false,
        reason: `Card at (${move.row}, ${move.col}) is already face-up; cannot flip`,
      };
    }
  }

  return { legal: true };
}

/**
 * Convenience: returns true if the move is legal.
 */
export function isLegalMove(grid: GolfGrid, move: GolfMove): boolean {
  return checkMoveLegality(grid, move).legal;
}

// ── Move application ────────────────────────────────────────

/**
 * Result of applying a move.
 */
export interface MoveResult {
  /** The card that goes to the discard pile (face-up). */
  discardedCard: Card;
}

/**
 * Apply a move to the grid, mutating it in place.
 *
 * @param grid       The player's 3x3 grid (mutated).
 * @param drawnCard  The card the player drew this turn.
 * @param move       The move to apply.
 * @returns          The card to place on the discard pile.
 * @throws           If the move is illegal.
 */
export function applyMove(
  grid: GolfGrid,
  drawnCard: Card,
  move: GolfMove,
): MoveResult {
  const legality = checkMoveLegality(grid, move);
  if (!legality.legal) {
    throw new Error(`Illegal move: ${legality.reason}`);
  }

  const idx = gridIndex(move.row, move.col);

  if (move.kind === 'swap') {
    // Replace grid card with drawn card; old card goes to discard
    const replacedCard = grid[idx];
    drawnCard.faceUp = true;
    grid[idx] = drawnCard;
    replacedCard.faceUp = true; // discarded cards are always face-up
    return { discardedCard: replacedCard };
  } else {
    // Discard the drawn card and flip the grid card face-up
    drawnCard.faceUp = true;
    grid[idx].faceUp = true;
    return { discardedCard: drawnCard };
  }
}

// ── Initial reveal ──────────────────────────────────────────

/**
 * Validate that exactly 3 positions are selected for the initial reveal.
 *
 * @param positions  Array of {row, col} positions to flip face-up.
 * @returns          LegalityResult.
 */
export function checkInitialReveal(
  grid: GolfGrid,
  positions: Array<{ row: number; col: number }>,
): LegalityResult {
  if (positions.length !== 3) {
    return {
      legal: false,
      reason: `Must flip exactly 3 cards, got ${positions.length}`,
    };
  }

  // Validate all positions are in bounds
  for (const pos of positions) {
    try {
      gridIndex(pos.row, pos.col);
    } catch {
      return {
        legal: false,
        reason: `Position (${pos.row}, ${pos.col}) is out of bounds`,
      };
    }
  }

  // Check for duplicates
  const indices = positions.map((p) => gridIndex(p.row, p.col));
  const unique = new Set(indices);
  if (unique.size !== 3) {
    return { legal: false, reason: 'Duplicate positions in initial reveal' };
  }

  // All positions must be face-down
  for (const idx of indices) {
    if (grid[idx].faceUp) {
      const { row, col } = positions[indices.indexOf(idx)];
      return {
        legal: false,
        reason: `Card at (${row}, ${col}) is already face-up`,
      };
    }
  }

  return { legal: true };
}

/**
 * Apply the initial reveal, flipping 3 cards face-up.
 *
 * @throws If the reveal is not legal.
 */
export function applyInitialReveal(
  grid: GolfGrid,
  positions: Array<{ row: number; col: number }>,
): void {
  const legality = checkInitialReveal(grid, positions);
  if (!legality.legal) {
    throw new Error(`Illegal initial reveal: ${legality.reason}`);
  }

  for (const pos of positions) {
    grid[gridIndex(pos.row, pos.col)].faceUp = true;
  }
}

// ── Round ending ────────────────────────────────────────────

/**
 * State tracking for end-of-round detection.
 */
export interface RoundEndState {
  /**
   * The index of the player who first revealed all cards,
   * or null if no player has done so yet.
   */
  triggeringPlayerIndex: number | null;
  /**
   * Set of player indices who have taken their final turn
   * after the triggering player revealed all cards.
   */
  finalTurnsTaken: Set<number>;
  /** Total number of players. */
  playerCount: number;
}

/**
 * Create initial round-end tracking state.
 */
export function createRoundEndState(playerCount: number): RoundEndState {
  return {
    triggeringPlayerIndex: null,
    finalTurnsTaken: new Set(),
    playerCount,
  };
}

/**
 * Check whether a player's grid has triggered end-of-round,
 * and update the round-end state accordingly.
 *
 * Call this after each player's turn.
 *
 * @returns true if the round has now ended.
 */
export function checkRoundEnd(
  roundEnd: RoundEndState,
  currentPlayerIndex: number,
  grid: GolfGrid,
): boolean {
  if (roundEnd.triggeringPlayerIndex === null) {
    // Check if this player just revealed all cards
    if (isGridFullyRevealed(grid)) {
      roundEnd.triggeringPlayerIndex = currentPlayerIndex;
    }
    return false;
  }

  // A player already triggered end-of-round.
  // Record that the current player (if not the trigger) has taken their final turn.
  if (currentPlayerIndex !== roundEnd.triggeringPlayerIndex) {
    roundEnd.finalTurnsTaken.add(currentPlayerIndex);
  }

  // Round ends when all non-triggering players have had their final turn.
  const expectedFinalTurns = roundEnd.playerCount - 1;
  return roundEnd.finalTurnsTaken.size >= expectedFinalTurns;
}

/**
 * Whether the round is currently in the "final turns" phase
 * (a player has revealed all cards, others are taking last turns).
 */
export function isInFinalTurns(roundEnd: RoundEndState): boolean {
  return roundEnd.triggeringPlayerIndex !== null;
}

/**
 * Whether a specific player still needs to take their final turn.
 */
export function needsFinalTurn(
  roundEnd: RoundEndState,
  playerIndex: number,
): boolean {
  if (roundEnd.triggeringPlayerIndex === null) return false;
  if (playerIndex === roundEnd.triggeringPlayerIndex) return false;
  return !roundEnd.finalTurnsTaken.has(playerIndex);
}
