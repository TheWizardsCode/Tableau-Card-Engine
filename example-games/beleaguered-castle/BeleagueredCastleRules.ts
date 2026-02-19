/**
 * Beleaguered Castle game rules.
 *
 * All functions are pure (or minimal mutation on state passed in),
 * following the Golf rules architecture. No Phaser dependency.
 *
 * Classic Beleaguered Castle rules:
 * - 52-card deck, no jokers.
 * - Aces are pre-placed on 4 foundations (one per suit).
 * - 48 remaining cards are dealt into 8 columns of 6, all face-up.
 * - Foundations build up by suit: A, 2, 3, ..., K.
 * - Tableau columns build down regardless of suit.
 * - Only the top card of each column is available to move.
 * - Empty columns accept any card.
 * - Win: all 52 cards on foundations (13 each).
 * - Loss: no legal moves remain.
 */

import type { Card, Rank, Suit } from '../../src/card-system/Card';
import { RANKS } from '../../src/card-system/Card';
import { createStandardDeck, shuffle } from '../../src/card-system/Deck';
import { Pile } from '../../src/card-system/Pile';
import type {
  BeleagueredCastleState,
  BCMove,
} from './BeleagueredCastleState';
import {
  FOUNDATION_COUNT,
  TABLEAU_COUNT,
  CARDS_PER_COLUMN,
  FOUNDATION_SUITS,
} from './BeleagueredCastleState';

// ── Rank utilities ──────────────────────────────────────────

/** Map of rank -> numeric value for ordering (A=0, 2=1, ..., K=12). */
const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i]),
) as Record<Rank, number>;

/**
 * Get the numeric value of a rank (A=0, K=12).
 */
export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank];
}

/**
 * Return the next rank in the foundation build sequence,
 * or undefined if the rank is King (sequence complete).
 */
export function nextRank(rank: Rank): Rank | undefined {
  const idx = RANK_VALUE[rank];
  return idx < 12 ? RANKS[idx + 1] : undefined;
}

/**
 * Get the foundation index for a given suit.
 */
export function foundationIndex(suit: Suit): number {
  return FOUNDATION_SUITS.indexOf(suit);
}

// ── Seeded RNG ──────────────────────────────────────────────

/**
 * Create a deterministic RNG from a numeric seed.
 * Uses a simple linear congruential generator (LCG) compatible
 * with the shuffle() function's () => number contract.
 */
export function createSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ── Deal ────────────────────────────────────────────────────

/**
 * Deal a new Beleaguered Castle game.
 *
 * 1. Create and shuffle a standard 52-card deck with seeded RNG.
 * 2. Remove the 4 aces and place them on their respective foundations.
 * 3. Deal the remaining 48 cards into 8 columns of 6, all face-up.
 *
 * @param seed  Numeric seed for deterministic shuffling.
 * @returns     A fresh BeleagueredCastleState.
 */
export function deal(seed: number): BeleagueredCastleState {
  const rng = createSeededRng(seed);
  const deck = shuffle(createStandardDeck(), rng);

  // All cards face-up in Beleaguered Castle
  for (const card of deck) {
    card.faceUp = true;
  }

  // Separate aces from the rest
  const aces: Card[] = [];
  const remaining: Card[] = [];
  for (const card of deck) {
    if (card.rank === 'A') {
      aces.push(card);
    } else {
      remaining.push(card);
    }
  }

  // Place aces on foundations (indexed by suit)
  const foundations: [Pile, Pile, Pile, Pile] = [
    new Pile(),
    new Pile(),
    new Pile(),
    new Pile(),
  ];
  for (const ace of aces) {
    const idx = foundationIndex(ace.suit);
    foundations[idx].push(ace);
  }

  // Deal remaining 48 cards into 8 columns of 6
  if (remaining.length !== 48) {
    throw new Error(
      `Expected 48 non-ace cards after removing aces, got ${remaining.length}`,
    );
  }

  const tableau: Pile[] = [];
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const columnCards = remaining.slice(
      col * CARDS_PER_COLUMN,
      (col + 1) * CARDS_PER_COLUMN,
    );
    tableau.push(new Pile(columnCards));
  }

  return {
    foundations,
    tableau,
    seed,
    moveCount: 0,
  };
}

// ── Move validation ─────────────────────────────────────────

/**
 * Check whether moving the top card from a tableau column to a
 * foundation is legal.
 *
 * Legal when:
 * - Source column is not empty.
 * - The card's suit matches the foundation suit.
 * - The card's rank is the next expected rank on that foundation.
 */
export function isLegalFoundationMove(
  state: BeleagueredCastleState,
  fromCol: number,
  toFoundation: number,
): boolean {
  if (fromCol < 0 || fromCol >= TABLEAU_COUNT) return false;
  if (toFoundation < 0 || toFoundation >= FOUNDATION_COUNT) return false;

  const sourceCol = state.tableau[fromCol];
  const card = sourceCol.peek();
  if (!card) return false;

  const foundation = state.foundations[toFoundation];
  const expectedSuit = FOUNDATION_SUITS[toFoundation];

  if (card.suit !== expectedSuit) return false;

  const topFoundationCard = foundation.peek();
  if (!topFoundationCard) {
    // Foundation is empty; only Ace goes here (but aces are pre-placed)
    return card.rank === 'A';
  }

  const expected = nextRank(topFoundationCard.rank);
  return expected !== undefined && card.rank === expected;
}

/**
 * Check whether moving the top card from one tableau column to
 * another is legal.
 *
 * Legal when:
 * - Source column is not empty.
 * - Source and destination are different columns.
 * - Destination column is empty (any card accepted), OR
 * - The card's rank is exactly one less than the destination top card's rank
 *   (regardless of suit).
 */
export function isLegalTableauMove(
  state: BeleagueredCastleState,
  fromCol: number,
  toCol: number,
): boolean {
  if (fromCol < 0 || fromCol >= TABLEAU_COUNT) return false;
  if (toCol < 0 || toCol >= TABLEAU_COUNT) return false;
  if (fromCol === toCol) return false;

  const sourceCol = state.tableau[fromCol];
  const card = sourceCol.peek();
  if (!card) return false;

  const destCol = state.tableau[toCol];
  if (destCol.isEmpty()) return true; // Any card on empty column

  const destTop = destCol.peek()!;
  return rankValue(card.rank) === rankValue(destTop.rank) - 1;
}

// ── Move application ────────────────────────────────────────

/**
 * Apply a foundation move: pop the top card from the source column
 * and push it onto the foundation.
 *
 * @throws If the move is illegal.
 * @returns The card that was moved.
 */
export function applyFoundationMove(
  state: BeleagueredCastleState,
  fromCol: number,
  toFoundation: number,
): Card {
  if (!isLegalFoundationMove(state, fromCol, toFoundation)) {
    const card = state.tableau[fromCol]?.peek();
    const foundationSuit = FOUNDATION_SUITS[toFoundation];
    throw new Error(
      `Illegal foundation move: column ${fromCol} ` +
        `(${card?.rank ?? 'empty'} of ${card?.suit ?? '?'}) ` +
        `to foundation ${toFoundation} (${foundationSuit})`,
    );
  }

  const card = state.tableau[fromCol].popOrThrow();
  state.foundations[toFoundation].push(card);
  state.moveCount++;
  return card;
}

/**
 * Apply a tableau-to-tableau move: pop the top card from the
 * source column and push it onto the destination column.
 *
 * @throws If the move is illegal.
 * @returns The card that was moved.
 */
export function applyTableauMove(
  state: BeleagueredCastleState,
  fromCol: number,
  toCol: number,
): Card {
  if (!isLegalTableauMove(state, fromCol, toCol)) {
    const card = state.tableau[fromCol]?.peek();
    const destTop = state.tableau[toCol]?.peek();
    throw new Error(
      `Illegal tableau move: column ${fromCol} ` +
        `(${card?.rank ?? 'empty'} of ${card?.suit ?? '?'}) ` +
        `to column ${toCol} ` +
        `(top: ${destTop?.rank ?? 'empty'} of ${destTop?.suit ?? '?'})`,
    );
  }

  const card = state.tableau[fromCol].popOrThrow();
  state.tableau[toCol].push(card);
  state.moveCount++;
  return card;
}

/**
 * Apply any BCMove to the game state.
 *
 * @throws If the move is illegal.
 * @returns The card that was moved.
 */
export function applyMove(
  state: BeleagueredCastleState,
  move: BCMove,
): Card {
  switch (move.kind) {
    case 'tableau-to-foundation':
      return applyFoundationMove(state, move.fromCol, move.toFoundation);
    case 'tableau-to-tableau':
      return applyTableauMove(state, move.fromCol, move.toCol);
  }
}

/**
 * Undo a foundation move: pop the card from the foundation and
 * push it back onto the tableau column.
 */
export function undoFoundationMove(
  state: BeleagueredCastleState,
  fromCol: number,
  toFoundation: number,
): void {
  const card = state.foundations[toFoundation].popOrThrow();
  state.tableau[fromCol].push(card);
  state.moveCount--;
}

/**
 * Undo a tableau-to-tableau move: pop the card from the destination
 * column and push it back onto the source column.
 */
export function undoTableauMove(
  state: BeleagueredCastleState,
  fromCol: number,
  toCol: number,
): void {
  const card = state.tableau[toCol].popOrThrow();
  state.tableau[fromCol].push(card);
  state.moveCount--;
}

/**
 * Undo any BCMove.
 */
export function undoMove(
  state: BeleagueredCastleState,
  move: BCMove,
): void {
  switch (move.kind) {
    case 'tableau-to-foundation':
      undoFoundationMove(state, move.fromCol, move.toFoundation);
      break;
    case 'tableau-to-tableau':
      undoTableauMove(state, move.fromCol, move.toCol);
      break;
  }
}

// ── Win / Loss detection ────────────────────────────────────

/**
 * Check if the game is won (all 52 cards on foundations).
 */
export function isWon(state: BeleagueredCastleState): boolean {
  return state.foundations.every((f) => f.size() === 13);
}

/**
 * Get all legal moves from the current state.
 */
export function getLegalMoves(state: BeleagueredCastleState): BCMove[] {
  const moves: BCMove[] = [];

  for (let fromCol = 0; fromCol < TABLEAU_COUNT; fromCol++) {
    if (state.tableau[fromCol].isEmpty()) continue;

    // Check foundation moves
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      if (isLegalFoundationMove(state, fromCol, fi)) {
        moves.push({
          kind: 'tableau-to-foundation',
          fromCol,
          toFoundation: fi,
        });
      }
    }

    // Check tableau-to-tableau moves
    for (let toCol = 0; toCol < TABLEAU_COUNT; toCol++) {
      if (isLegalTableauMove(state, fromCol, toCol)) {
        moves.push({
          kind: 'tableau-to-tableau',
          fromCol,
          toCol,
        });
      }
    }
  }

  return moves;
}

/**
 * Check if no legal moves remain (game is stuck).
 */
export function hasNoMoves(state: BeleagueredCastleState): boolean {
  return getLegalMoves(state).length === 0;
}
