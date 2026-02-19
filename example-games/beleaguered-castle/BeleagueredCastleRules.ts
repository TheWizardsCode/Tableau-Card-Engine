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

// ── Auto-move heuristic ─────────────────────────────────────

/**
 * Get the rank value of the top card on a foundation (0=A, 12=K).
 * Returns -1 if the foundation is empty (shouldn't happen in classic deal
 * since aces are pre-placed, but handled for safety).
 */
export function foundationTopRank(state: BeleagueredCastleState, fi: number): number {
  const top = state.foundations[fi].peek();
  return top ? rankValue(top.rank) : -1;
}

/**
 * Find all cards that are safe to auto-move to their foundations.
 *
 * **Heuristic:** A card of rank R on top of a tableau column is safe to
 * auto-move to its foundation if the minimum foundation rank across all
 * four foundations is >= R - 1.
 *
 * Rationale: tableau columns build *down regardless of suit*. A card of
 * rank R could be a build target for a card of rank R + 1 in any column.
 * However, if every foundation already has at least rank R - 1 (meaning
 * all cards of rank R - 1 and below are on foundations), then no card
 * remaining in the tableau needs this card as a build target, because
 * any card that could build on it (rank R + 1) would itself have lower
 * ranked cards already on foundations.
 *
 * This is intentionally conservative: it will never auto-move a card
 * that the player might need for tableau building.
 *
 * @returns An array of tableau-to-foundation moves that are safe to execute.
 */
export function findSafeAutoMoves(
  state: BeleagueredCastleState,
): BCMove[] {
  const safeMovs: BCMove[] = [];

  // Compute minimum foundation rank across all 4 foundations
  let minFoundationRank = Infinity;
  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    const topRank = foundationTopRank(state, fi);
    if (topRank < minFoundationRank) {
      minFoundationRank = topRank;
    }
  }

  // Check each tableau column's top card
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const topCard = state.tableau[col].peek();
    if (!topCard) continue;

    const fi = foundationIndex(topCard.suit);

    // Check if this card is the next expected on its foundation
    if (!isLegalFoundationMove(state, col, fi)) continue;

    const cardRank = rankValue(topCard.rank);

    // Safe if min foundation rank >= cardRank - 1
    // (i.e., all cards of rank below this one are already on foundations)
    if (minFoundationRank >= cardRank - 1) {
      safeMovs.push({
        kind: 'tableau-to-foundation',
        fromCol: col,
        toFoundation: fi,
      });
    }
  }

  return safeMovs;
}

// ── Auto-complete detection ─────────────────────────────────

/**
 * Check if the game is trivially winnable from the current state.
 *
 * **Heuristic:** The remaining game is trivially winnable when every
 * non-empty tableau column has its cards in descending rank order
 * (top card has the lowest rank, bottom card has the highest rank)
 * AND each column's top card can eventually reach its foundation
 * given the current foundation tops.
 *
 * More specifically:
 * 1. Every non-empty column must have cards in strictly descending rank
 *    order from bottom to top (bottom = highest rank, top = lowest rank).
 * 2. For each card in each column, its rank must be > the current top of
 *    its foundation (i.e. it hasn't already been passed over).
 *
 * If both conditions are met, all cards can be played to foundations by
 * repeatedly taking the lowest-ranked available card for each foundation.
 */
export function isTriviallyWinnable(state: BeleagueredCastleState): boolean {
  // If there are no cards left in the tableau, the game is already won (or about to be)
  const allEmpty = state.tableau.every((col) => col.isEmpty());
  if (allEmpty) return true;

  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const cards = state.tableau[col].toArray(); // bottom-to-top order
    if (cards.length === 0) continue;

    // Check that cards are in strictly descending rank order (bottom = highest)
    for (let i = 1; i < cards.length; i++) {
      if (rankValue(cards[i].rank) >= rankValue(cards[i - 1].rank)) {
        // Not strictly descending: this column blocks auto-complete
        return false;
      }
    }

    // Check that every card in this column is above its foundation top rank
    // (meaning the foundation hasn't already passed this card's rank)
    for (const card of cards) {
      const fi = foundationIndex(card.suit);
      const fTopRank = foundationTopRank(state, fi);
      if (rankValue(card.rank) <= fTopRank) {
        // Foundation has already passed this rank -- impossible to place
        return false;
      }
    }
  }

  return true;
}

/**
 * Compute the complete sequence of foundation moves to finish the game,
 * assuming the game is trivially winnable.
 *
 * Iteratively finds the lowest-ranked card across all tableau column tops
 * that is the next expected card on its foundation, and adds it to the
 * move sequence. Repeats until all columns are empty.
 *
 * This function does NOT mutate the state -- it works on a snapshot of
 * column arrays and foundation rank trackers.
 *
 * @returns An ordered array of tableau-to-foundation moves, or an empty
 *          array if the state is not trivially winnable.
 */
export function getAutoCompleteMoves(
  state: BeleagueredCastleState,
): BCMove[] {
  if (!isTriviallyWinnable(state)) return [];

  const moves: BCMove[] = [];

  // Create mutable copies of column card arrays (as stacks: last = top)
  const columns: { rank: number; suit: Suit }[][] = [];
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    columns.push(
      state.tableau[col].toArray().map((c) => ({
        rank: rankValue(c.rank),
        suit: c.suit,
      })),
    );
  }

  // Track current foundation top ranks
  const fRanks: number[] = [];
  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    fRanks.push(foundationTopRank(state, fi));
  }

  // Repeatedly find and move the next playable card
  let moved = true;
  while (moved) {
    moved = false;
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      if (columns[col].length === 0) continue;

      const top = columns[col][columns[col].length - 1];
      const fi = foundationIndex(top.suit);

      if (top.rank === fRanks[fi] + 1) {
        // This card is next on its foundation
        moves.push({
          kind: 'tableau-to-foundation',
          fromCol: col,
          toFoundation: fi,
        });
        columns[col].pop();
        fRanks[fi] = top.rank;
        moved = true;
      }
    }
  }

  return moves;
}
