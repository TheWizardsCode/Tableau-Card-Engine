/**
 * Blackjack Game Logic
 *
 * Core game logic for a standard single-player Blackjack game
 * (player vs. dealer).  Provides scoring, dealing, hit/stand,
 * dealer AI, and winner determination.
 *
 * Uses the shared card-system types for card representation and
 * the core-engine's seeded RNG for reproducible shuffles.
 *
 * @module example-games/blackjack/BlackjackGame
 */

import type { Card } from '../../src/card-system/Card';
import { createStandardDeck } from '../../src/card-system/Deck';
import { createSeededRng } from '../../src/core-engine/SeededRng';
import { shuffle } from '../../src/card-system/Deck';

// ── Types ──────────────────────────────────────────────────

/** A hand of cards in Blackjack. */
export interface BlackjackHand {
  cards: Card[];
}

/**
 * Game phase for the Blackjack round state machine.
 * - IDLE: Waiting for the deal to begin
 * - PLAYER_TURN: Player can hit or stand
 * - DEALER_TURN: Dealer AI is playing
 * - ROUND_OVER: Round concluded, winner determined
 */
export type BlackjackPhase = 'IDLE' | 'PLAYER_TURN' | 'DEALER_TURN' | 'ROUND_OVER';

/** Full game state for a single round of Blackjack. */
export interface BlackjackGameState {
  /** The remaining deck (cards not yet dealt). */
  deck: Card[];
  /** The player's hand. */
  playerHand: BlackjackHand;
  /** The dealer's hand (first card face-down until dealer turn). */
  dealerHand: BlackjackHand;
  /** Current phase of the round. */
  phase: BlackjackPhase;
  /** Whether the dealer's first card is hidden. */
  dealerHoleCardHidden: boolean;
  /** Result message displayed at round end. */
  message: string;
  /** Seeded RNG for reproducibility. */
  rng: () => number;
}

/** Result of winner determination. */
export interface WinnerResult {
  winner: 'player' | 'dealer' | 'push';
  reason: string;
}

/** Configuration options for creating a Blackjack game state. */
export interface BlackjackGameOptions {
  /** Number of decks to combine (default: 1). */
  deckCount?: number;
  /** Seed for reproducible shuffles (default: Date.now()). */
  seed?: number;
}

// ── Constants ──────────────────────────────────────────────

/** Standard Blackjack: dealer hits on 16 or less. */
const DEALER_HIT_THRESHOLD = 16;

// ── Rank value mapping ────────────────────────────────────

/** Map card rank to Blackjack score value. */
function rankToValue(rank: string): number {
  if (rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

// ── Scoring ────────────────────────────────────────────────

/**
 * Calculate the best Blackjack score for a hand.
 *
 * Aces count as 11 unless that would bust, in which case they
 * count as 1.  Returns 0 for an empty hand.
 */
export function getScore(hand: BlackjackHand): number {
  if (!hand.cards.length) return 0;

  let score = 0;
  let aceCount = 0;

  for (const card of hand.cards) {
    const value = rankToValue(card.rank);
    score += value;
    if (card.rank === 'A') {
      aceCount++;
    }
  }

  // Convert Aces from 11 to 1 if bust
  while (score > 21 && aceCount > 0) {
    score -= 10;
    aceCount--;
  }

  return score;
}

/**
 * Check whether a hand is bust (score > 21).
 * An empty hand is never bust.
 */
export function isBust(hand: BlackjackHand): boolean {
  if (!hand.cards.length) return false;
  return getScore(hand) > 21;
}

/**
 * Check whether a hand is a natural Blackjack (exactly 2 cards,
 * an Ace and a 10-value card, totalling 21).
 */
export function isBlackjack(hand: BlackjackHand): boolean {
  if (hand.cards.length !== 2) return false;
  return getScore(hand) === 21;
}

// ── State Factory ──────────────────────────────────────────

/**
 * Create a fresh Blackjack game state.
 *
 * @param options  Configuration options (deck count, seed).
 * @returns A new game state ready for dealing.
 */
export function createBlackjackGameState(options: BlackjackGameOptions = {}): BlackjackGameState {
  const {
    deckCount = 1,
    seed = Date.now(),
  } = options;

  const rng = createSeededRng(seed);
  let deck: Card[] = [];

  for (let i = 0; i < deckCount; i++) {
    const singleDeck = createStandardDeck();
    deck = deck.concat(singleDeck);
  }

  shuffle(deck, rng);

  return {
    deck,
    playerHand: { cards: [] },
    dealerHand: { cards: [] },
    phase: 'IDLE',
    dealerHoleCardHidden: true,
    message: '',
    rng,
  };
}

// ── Dealing ────────────────────────────────────────────────

/**
 * Deal the initial two-card hands to player and dealer.
 * Cards are dealt alternately: player, dealer, player, dealer.
 *
 * @param state  The game state to modify.
 */
export function dealInitialHands(state: BlackjackGameState): void {
  // Verify we have enough cards
  if (state.deck.length < 4) {
    throw new Error('Not enough cards in the deck to deal');
  }

  // Deal: player, dealer, player, dealer
  const p1 = state.deck.pop()!;
  const d1 = state.deck.pop()!;
  const p2 = state.deck.pop()!;
  const d2 = state.deck.pop()!;
  p1.faceUp = true;
  p2.faceUp = true;
  d2.faceUp = true; // dealer's second card face-up
  // d1 stays faceDown (hole card)
  state.playerHand.cards.push(p1, p2);
  state.dealerHand.cards.push(d1, d2);

  state.dealerHoleCardHidden = true;
  state.phase = 'PLAYER_TURN';
  state.message = '';

  // Check for immediate blackjack
  if (isBlackjack(state.playerHand) && !isBlackjack(state.dealerHand)) {
    state.phase = 'ROUND_OVER';
    state.message = 'Blackjack! You win!';
  } else if (isBlackjack(state.playerHand) && isBlackjack(state.dealerHand)) {
    state.phase = 'ROUND_OVER';
    state.message = 'Push! Both have Blackjack!';
  }
}

// ── Player Actions ────────────────────────────────────────

/**
 * Player takes a hit (draws one card from the deck).
 * If the player busts, the round ends immediately.
 *
 * @param state  The game state to modify.
 */
export function playerHit(state: BlackjackGameState): void {
  if (state.phase !== 'PLAYER_TURN') return;
  if (state.deck.length === 0) return;

  const hitCard = state.deck.pop()!;
  hitCard.faceUp = true;
  state.playerHand.cards.push(hitCard);

  if (isBust(state.playerHand)) {
    state.phase = 'ROUND_OVER';
    state.message = 'Bust! Dealer wins.';
  }
}

/**
 * Player stands (ends their turn, begins dealer turn).
 *
 * @param state  The game state to modify.
 */
export function playerStand(state: BlackjackGameState): void {
  if (state.phase !== 'PLAYER_TURN') return;

  state.dealerHoleCardHidden = false;
  if (state.dealerHand.cards[0]) {
    state.dealerHand.cards[0].faceUp = true; // reveal hole card
  }
  state.phase = 'DEALER_TURN';
}

// ── Dealer AI ─────────────────────────────────────────────

/**
 * Dealer plays according to standard Blackjack rules:
 * hits on 16 or below, stands on 17 or above (including soft 17).
 *
 * @param state  The game state to modify.
 */
export function dealerPlay(state: BlackjackGameState): void {
  if (state.phase !== 'DEALER_TURN') return;

  state.dealerHoleCardHidden = false;

  // Safety: limit iterations to prevent infinite loops
  let iterations = 0;
  const MAX_ITERATIONS = 20;

  while (getScore(state.dealerHand) <= DEALER_HIT_THRESHOLD && !isBust(state.dealerHand)) {
    if (state.deck.length === 0 || iterations >= MAX_ITERATIONS) break;
    const dealerCard = state.deck.pop()!;
    dealerCard.faceUp = true;
    state.dealerHand.cards.push(dealerCard);
    iterations++;
  }

  state.phase = 'ROUND_OVER';

  // Determine result message
  const result = determineWinner(state);
  if (result.winner === 'player') {
    state.message = `You win! ${result.reason}`;
  } else if (result.winner === 'dealer') {
    state.message = `Dealer wins. ${result.reason}`;
  } else {
    state.message = `Push! ${result.reason}`;
  }
}

// ── Winner Determination ──────────────────────────────────

/**
 * Determine the winner of a completed Blackjack round.
 *
 * @param state  The game state (must be in ROUND_OVER phase).
 * @returns The winner and a human-readable reason.
 */
export function determineWinner(state: BlackjackGameState): WinnerResult {
  const playerScore = getScore(state.playerHand);
  const dealerScore = getScore(state.dealerHand);
  const playerHasBlackjack = isBlackjack(state.playerHand);
  const dealerHasBlackjack = isBlackjack(state.dealerHand);

  // Check for blackjack wins
  if (playerHasBlackjack && !dealerHasBlackjack) {
    return { winner: 'player', reason: 'Blackjack!' };
  }
  if (dealerHasBlackjack && !playerHasBlackjack) {
    return { winner: 'dealer', reason: 'Dealer has Blackjack.' };
  }

  // Check for busts
  if (isBust(state.playerHand)) {
    return { winner: 'dealer', reason: 'Player Bust.' };
  }
  if (isBust(state.dealerHand)) {
    return { winner: 'player', reason: 'Dealer Bust.' };
  }

  // Compare scores
  if (playerScore > dealerScore) {
    return { winner: 'player', reason: `${playerScore} vs ${dealerScore}` };
  }
  if (dealerScore > playerScore) {
    return { winner: 'dealer', reason: `${dealerScore} vs ${playerScore}` };
  }

  return { winner: 'push', reason: `Both have ${playerScore}` };
}
