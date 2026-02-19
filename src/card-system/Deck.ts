/**
 * Deck operations for the Tableau Card Engine.
 *
 * A Deck is represented as a plain Card array. This module provides
 * factory functions and operations (shuffle, draw) that work on
 * Card arrays, keeping the data model simple and composable.
 */

import { Card, Rank, Suit, RANKS, SUITS, createCard } from './Card';

/**
 * Create a standard 52-card deck (no jokers), all cards face-down.
 *
 * Cards are ordered by suit (alphabetical) then rank (A through K).
 */
export function createStandardDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

/**
 * Create a deck from a specific list of rank/suit pairs.
 * All cards are created face-down by default.
 */
export function createDeckFrom(
  cards: ReadonlyArray<{ rank: Rank; suit: Suit; faceUp?: boolean }>,
): Card[] {
  return cards.map((c) => createCard(c.rank, c.suit, c.faceUp ?? false));
}

/**
 * Shuffle a deck in place using the Fisher-Yates algorithm.
 *
 * An optional random number generator can be supplied for
 * deterministic testing. The generator must return a value
 * in [0, 1) (same contract as Math.random).
 *
 * @returns The same array reference (mutated).
 */
export function shuffle(
  deck: Card[],
  rng: () => number = Math.random,
): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Draw the top card (last element) from a deck.
 *
 * @returns The drawn card, or `undefined` if the deck is empty.
 *          The card is removed from the deck array.
 */
export function draw(deck: Card[]): Card | undefined {
  return deck.pop();
}

/**
 * Draw the top card from a deck, throwing if the deck is empty.
 *
 * Use this when an empty deck indicates a logic error (e.g.
 * dealing should never exhaust the deck).
 */
export function drawOrThrow(deck: Card[]): Card {
  const card = deck.pop();
  if (card === undefined) {
    throw new Error('Cannot draw from an empty deck');
  }
  return card;
}
