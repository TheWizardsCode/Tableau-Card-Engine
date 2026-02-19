/**
 * Card types and factory functions for the Tableau Card Engine.
 *
 * Defines Rank, Suit, and Card as the foundational data model
 * consumed by all game spikes and engine modules.
 */

/** Standard playing card ranks. */
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

/** All ranks in order (Ace low). */
export const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

/** Standard playing card suits. */
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

/** All suits in alphabetical order. */
export const SUITS: readonly Suit[] = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
] as const;

/**
 * A playing card with rank, suit, and face-up/face-down state.
 *
 * Cards are mutable only in their `faceUp` property; rank and suit
 * are fixed at creation and should not be changed.
 */
export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
  faceUp: boolean;
}

/**
 * Create a single card, face-down by default.
 */
export function createCard(
  rank: Rank,
  suit: Suit,
  faceUp: boolean = false,
): Card {
  return { rank, suit, faceUp };
}
