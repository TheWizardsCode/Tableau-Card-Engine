/**
 * Beleaguered Castle state types.
 *
 * Defines the game-specific state for Beleaguered Castle solitaire,
 * following the same architecture as Golf (state separated from rules
 * and Phaser UI).
 */

import type { Suit } from '../../src/card-system/Card';
import { Pile } from '../../src/card-system/Pile';

// ── Constants ───────────────────────────────────────────────

/** Number of foundation piles (one per suit). */
export const FOUNDATION_COUNT = 4;

/** Number of tableau columns. */
export const TABLEAU_COUNT = 8;

/** Cards per tableau column in the classic deal. */
export const CARDS_PER_COLUMN = 6;

/** Foundation suit order (matches SUITS from card-system). */
export const FOUNDATION_SUITS: readonly Suit[] = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
] as const;

// ── Move types ──────────────────────────────────────────────

/**
 * Move a card from one tableau column to another.
 */
export interface TableauToTableauMove {
  readonly kind: 'tableau-to-tableau';
  /** Source column index (0-7). */
  readonly fromCol: number;
  /** Destination column index (0-7). */
  readonly toCol: number;
}

/**
 * Move a card from a tableau column to a foundation.
 */
export interface TableauToFoundationMove {
  readonly kind: 'tableau-to-foundation';
  /** Source column index (0-7). */
  readonly fromCol: number;
  /** Foundation index (0-3, corresponds to suit in FOUNDATION_SUITS). */
  readonly toFoundation: number;
}

/**
 * Any legal move in Beleaguered Castle.
 */
export type BCMove = TableauToTableauMove | TableauToFoundationMove;

// ── Game state ──────────────────────────────────────────────

/**
 * Complete Beleaguered Castle game state.
 *
 * All cards are face-up in Beleaguered Castle (open information).
 */
export interface BeleagueredCastleState {
  /**
   * Four foundation piles, indexed by suit
   * (0=clubs, 1=diamonds, 2=hearts, 3=spades).
   * Built up from Ace to King.
   */
  readonly foundations: readonly [Pile, Pile, Pile, Pile];

  /**
   * Eight tableau columns.
   * Top of pile = last card pushed = the card available to move.
   */
  readonly tableau: readonly Pile[];

  /** The RNG seed used for this deal. */
  readonly seed: number;

  /** Number of moves the player has made. */
  moveCount: number;
}
