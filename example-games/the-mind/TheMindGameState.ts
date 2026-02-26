/**
 * TheMindGameState.ts
 *
 * Pure game state and cooperative mechanics for The Mind -- no Phaser dependency.
 * Manages the shared ascending pile, player hands, lives system with bonus
 * awards, penalty logic (discard lower cards on out-of-order play), and level
 * progression (1-8, cards per player = level number).
 *
 * The Mind is a cooperative card game where 2 players (1 human + 1 AI) play
 * numbered cards (1-100) onto a single shared ascending pile. There are no
 * turns -- either player can play at any moment. When a card is played while
 * any player holds a lower-valued card, a life is lost and all lower cards
 * are discarded.
 */

import { Pile } from '../../src/card-system/Pile';
import type { MindCard } from './MindCard';
import { createMindDeck, shuffleDeck } from './MindCard';

import type { MultiplayerSetupOptions } from '../../src/core-engine/SetupOptions';
import { resolveSetupOptions } from '../../src/core-engine/SetupOptions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of levels in a complete game. */
export const MAX_LEVEL = 8;

/** Number of starting lives. */
export const STARTING_LIVES = 2;

/** Maximum number of lives a team can hold. */
export const MAX_LIVES = 3;

/** Levels at which a bonus life is awarded (after clearing). */
export const BONUS_LIFE_LEVELS: ReadonlyArray<number> = [3, 6];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Player identifier: 0 = human, 1 = AI. */
export type PlayerId = 0 | 1;

/** Possible game outcomes. */
export type GameOutcome = 'in-progress' | 'win' | 'loss';

/** Result of attempting to play a card. */
export interface PlayResult {
  /** Whether the play was accepted. */
  readonly success: boolean;
  /** If a penalty occurred, the cards discarded from both players. */
  readonly penaltyCards: ReadonlyArray<{ playerId: PlayerId; card: MindCard }>;
  /** Whether a life was lost on this play. */
  readonly lifeLost: boolean;
  /** Whether the level was completed by this play. */
  readonly levelComplete: boolean;
  /** Whether a bonus life was awarded after level completion. */
  readonly bonusLifeAwarded: boolean;
  /** Error message if the play was rejected. */
  readonly error?: string;
}

/** Setup options for creating a new game session. */
export type TheMindSetupOptions = MultiplayerSetupOptions;

/** Per-player state. */
export interface MindPlayerState {
  readonly name: string;
  readonly isAI: boolean;
  /** Cards in hand, kept sorted ascending by value. */
  hand: MindCard[];
}

/** The full game session state. */
export interface TheMindSession {
  /** The two players (index 0 = human, index 1 = AI by default). */
  players: [MindPlayerState, MindPlayerState];
  /** The shared ascending play pile. */
  pile: Pile<MindCard>;
  /** Current level (1-8). */
  currentLevel: number;
  /** Remaining lives. */
  lives: number;
  /** Current game outcome. */
  outcome: GameOutcome;
  /** Random number generator. */
  rng: () => number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Create a new The Mind game session, ready to play level 1.
 */
export function setupTheMindGame(
  options?: TheMindSetupOptions,
): TheMindSession {
  const { players: playerInfos, rng } = resolveSetupOptions({
    ...options,
    playerCount: 2,
  });

  const session: TheMindSession = {
    players: [
      { name: playerInfos[0].name, isAI: playerInfos[0].isAI, hand: [] },
      { name: playerInfos[1].name, isAI: playerInfos[1].isAI, hand: [] },
    ],
    pile: new Pile<MindCard>(),
    currentLevel: 0, // Will be set by dealLevel
    lives: STARTING_LIVES,
    outcome: 'in-progress',
    rng,
  };

  dealLevel(session, 1);
  return session;
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

/**
 * Deal cards for the specified level.
 *
 * Creates a fresh shuffled 100-card deck and deals `level` cards to each
 * player. The pile is cleared for the new level.
 *
 * @param session - The game session to deal into.
 * @param level - The level number (1-8).
 * @throws Error if level is outside the valid range [1, MAX_LEVEL].
 */
export function dealLevel(
  session: TheMindSession,
  level: number,
): void {
  if (level < 1 || level > MAX_LEVEL) {
    throw new Error(
      `Invalid level ${level}: must be between 1 and ${MAX_LEVEL}`,
    );
  }

  // Create and shuffle a fresh deck
  const deck = createMindDeck();
  shuffleDeck(deck, session.rng);

  // Clear the pile for the new level
  session.pile.clear();

  // Deal `level` cards to each player
  for (const player of session.players) {
    player.hand = [];
  }

  for (let i = 0; i < level; i++) {
    for (const player of session.players) {
      const card = deck.pop()!;
      card.faceUp = false; // Cards start face-down (hidden from other player)
      player.hand.push(card);
    }
  }

  // Sort each player's hand ascending by value
  for (const player of session.players) {
    player.hand.sort((a, b) => a.value - b.value);
  }

  session.currentLevel = level;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get the top card value of the pile, or 0 if the pile is empty. */
export function getPileTopValue(session: TheMindSession): number {
  const top = session.pile.peek();
  return top ? top.value : 0;
}

/** Check whether the game is over (win or loss). */
export function isGameOver(session: TheMindSession): boolean {
  return session.outcome !== 'in-progress';
}

/** Check whether all cards have been played for the current level. */
export function isLevelComplete(session: TheMindSession): boolean {
  return session.players.every((p) => p.hand.length === 0);
}

/**
 * Get all cards held by both players that are lower than the given value,
 * across both hands.
 */
function getLowerCards(
  session: TheMindSession,
  value: number,
): Array<{ playerId: PlayerId; card: MindCard }> {
  const result: Array<{ playerId: PlayerId; card: MindCard }> = [];

  for (let i = 0; i < 2; i++) {
    const playerId = i as PlayerId;
    for (const card of session.players[playerId].hand) {
      if (card.value < value) {
        result.push({ playerId, card });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------

/**
 * Attempt to play a card from a player's hand onto the shared pile.
 *
 * Rules:
 * - The card must be in the player's hand.
 * - The card value must be higher than the pile top.
 * - If the game is already over, the play is rejected.
 * - If any player holds a card with a lower value than the played card,
 *   a penalty occurs: a life is lost and all lower cards are discarded.
 * - If lives reach 0 after a penalty, the game ends in a loss.
 * - If the level is completed (both hands empty), the level advances.
 * - If the final level is completed, the game ends in a win.
 *
 * @param session - The game session.
 * @param playerId - Which player is playing (0 or 1).
 * @param cardValue - The value of the card to play.
 * @returns A PlayResult describing the outcome.
 */
export function playCard(
  session: TheMindSession,
  playerId: PlayerId,
  cardValue: number,
): PlayResult {
  // --- Guard: game already over ---
  if (session.outcome !== 'in-progress') {
    return {
      success: false,
      penaltyCards: [],
      lifeLost: false,
      levelComplete: false,
      bonusLifeAwarded: false,
      error: 'Game is already over',
    };
  }

  // --- Guard: card not in hand ---
  const player = session.players[playerId];
  const cardIndex = player.hand.findIndex((c) => c.value === cardValue);
  if (cardIndex === -1) {
    return {
      success: false,
      penaltyCards: [],
      lifeLost: false,
      levelComplete: false,
      bonusLifeAwarded: false,
      error: `Card with value ${cardValue} is not in player ${playerId}'s hand`,
    };
  }

  // --- Guard: card value must be higher than pile top ---
  const topValue = getPileTopValue(session);
  if (cardValue <= topValue) {
    return {
      success: false,
      penaltyCards: [],
      lifeLost: false,
      levelComplete: false,
      bonusLifeAwarded: false,
      error: `Card value ${cardValue} is not higher than pile top ${topValue}`,
    };
  }

  // --- Check for penalty: any player holds a lower card? ---
  // First remove the played card from hand so it isn't counted as "held"
  const [playedCard] = player.hand.splice(cardIndex, 1);

  // Find all lower cards held by either player (excluding the just-played card)
  const lowerCards = getLowerCards(session, cardValue);
  const lifeLost = lowerCards.length > 0;

  // Apply penalty if needed
  if (lifeLost) {
    session.lives -= 1;

    // Discard all lower cards from both hands
    for (const { playerId: pid, card } of lowerCards) {
      const hand = session.players[pid].hand;
      const idx = hand.findIndex((c) => c.value === card.value);
      if (idx !== -1) {
        hand.splice(idx, 1);
      }
    }
  }

  // Place the card on the pile
  playedCard.faceUp = true;
  session.pile.push(playedCard);

  // Check for game loss (lives exhausted)
  if (session.lives <= 0) {
    session.outcome = 'loss';
    return {
      success: true,
      penaltyCards: lowerCards,
      lifeLost: true,
      levelComplete: false,
      bonusLifeAwarded: false,
    };
  }

  // Check for level completion
  const levelDone = isLevelComplete(session);
  let bonusLifeAwarded = false;

  if (levelDone) {
    // Award bonus life if applicable
    if (
      BONUS_LIFE_LEVELS.includes(session.currentLevel) &&
      session.lives < MAX_LIVES
    ) {
      session.lives += 1;
      bonusLifeAwarded = true;
    }

    // Check for game win
    if (session.currentLevel >= MAX_LEVEL) {
      session.outcome = 'win';
    } else {
      // Auto-advance to next level
      dealLevel(session, session.currentLevel + 1);
    }
  }

  return {
    success: true,
    penaltyCards: lowerCards,
    lifeLost,
    levelComplete: levelDone,
    bonusLifeAwarded,
  };
}
