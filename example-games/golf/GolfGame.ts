/**
 * Golf game orchestration -- ties together the grid, deck, discard pile,
 * scoring, rules, and turn sequencer into a playable game.
 *
 * Provides:
 *   - GolfPlayerState: per-player state (grid)
 *   - GolfGameState: full game state type alias
 *   - Game setup (deal, initial reveal)
 *   - Legal move enumeration
 *   - Turn execution (draw + move + round-end check)
 */

import type { Card } from '../../src/card-system/Card';
import type { GameState } from '../../src/core-engine/GameState';
import { createGameState } from '../../src/core-engine/GameState';
import {
  advanceTurn,
  startGame,
  endGame,
} from '../../src/core-engine/TurnSequencer';
import { createStandardDeck, shuffle, drawOrThrow } from '../../src/card-system/Deck';
import { Pile } from '../../src/card-system/Pile';
import type { GolfGrid } from './GolfGrid';
import { createGolfGrid, GRID_SIZE } from './GolfGrid';
import type {
  GolfMove,
  DrawSource,
  RoundEndState,
} from './GolfRules';
import {
  applyMove,
  applyInitialReveal,
  checkRoundEnd,
  createRoundEndState,
  isLegalMove,
} from './GolfRules';

// ── Per-player state ────────────────────────────────────────

/** Per-player state in a Golf game. */
export interface GolfPlayerState {
  grid: GolfGrid;
}

// ── Full game state ─────────────────────────────────────────

/** The full game state type for Golf. */
export type GolfGameState = GameState<GolfPlayerState>;

/** All shared (non-per-player) state for a Golf round. */
export interface GolfSharedState {
  stockPile: Card[];
  discardPile: Pile;
  roundEnd: RoundEndState;
}

/** A complete Golf game session. */
export interface GolfSession {
  gameState: GolfGameState;
  shared: GolfSharedState;
}

// ── Action types ────────────────────────────────────────────

/**
 * A complete player action: draw source + move choice.
 * This is what the AI strategy produces.
 */
export interface GolfAction {
  drawSource: DrawSource;
  move: GolfMove;
}

// ── Setup ───────────────────────────────────────────────────

export interface GolfSetupOptions {
  /** Number of players (default 2). */
  playerCount?: number;
  /** Player names (defaults to "Player 1", "Player 2", etc.). */
  playerNames?: string[];
  /** Which players are AI-controlled (defaults to [false, true]). */
  isAI?: boolean[];
  /** RNG for shuffling (default Math.random). */
  rng?: () => number;
  /**
   * Initial reveal positions per player (each must be 3 positions).
   * If omitted, the first 3 grid positions are revealed by default.
   */
  initialReveals?: Array<Array<{ row: number; col: number }>>;
}

/**
 * Set up a new Golf game session: deal cards, do initial reveals,
 * transition to playing phase.
 */
export function setupGolfGame(options: GolfSetupOptions = {}): GolfSession {
  const {
    playerCount = 2,
    playerNames,
    isAI,
    rng = Math.random,
    initialReveals,
  } = options;

  // Create and shuffle a standard deck
  const deck = createStandardDeck();
  shuffle(deck, rng);

  // Deal 9 cards per player
  const playerGridCards: Card[][] = [];
  for (let p = 0; p < playerCount; p++) {
    const cards: Card[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      cards.push(drawOrThrow(deck));
    }
    playerGridCards.push(cards);
  }

  // First discard card (face-up)
  const firstDiscard = drawOrThrow(deck);
  firstDiscard.faceUp = true;
  const discardPile = new Pile([firstDiscard]);

  // Create game state
  const names = playerNames ?? Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`);
  const aiFlags = isAI ?? Array.from({ length: playerCount }, (_, i) => i > 0);

  const gameState = createGameState<GolfPlayerState>({
    players: names.map((name, i) => ({ name, isAI: aiFlags[i] })),
    createPlayerState: (i) => ({
      grid: createGolfGrid(playerGridCards[i]),
    }),
  });

  // Initial reveal: each player flips 3 cards
  const defaultReveal = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ];

  for (let p = 0; p < playerCount; p++) {
    const positions = initialReveals?.[p] ?? defaultReveal;
    applyInitialReveal(gameState.playerStates[p].grid, positions);
  }

  // Transition to playing
  startGame(gameState);

  const shared: GolfSharedState = {
    stockPile: deck,
    discardPile,
    roundEnd: createRoundEndState(playerCount),
  };

  return { gameState, shared };
}

// ── Legal move enumeration ──────────────────────────────────

/**
 * Enumerate all legal moves for the current player given the drawn card.
 * This is used by AI strategies to choose a move.
 */
export function enumerateLegalMoves(grid: GolfGrid): GolfMove[] {
  const moves: GolfMove[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Swap is always legal at any position
      const swap: GolfMove = { kind: 'swap', row, col };
      if (isLegalMove(grid, swap)) {
        moves.push(swap);
      }

      // Discard-and-flip is only legal at face-down positions
      const daf: GolfMove = { kind: 'discard-and-flip', row, col };
      if (isLegalMove(grid, daf)) {
        moves.push(daf);
      }
    }
  }

  return moves;
}

/**
 * Enumerate possible draw sources.
 * Stock is always available (in a well-formed game).
 * Discard is available when the discard pile is not empty.
 */
export function enumerateDrawSources(shared: GolfSharedState): DrawSource[] {
  const sources: DrawSource[] = ['stock'];
  if (!shared.discardPile.isEmpty()) {
    sources.push('discard');
  }
  return sources;
}

// ── Turn execution ──────────────────────────────────────────

/** Result of executing a turn. */
export interface TurnResult {
  /** The card that was drawn. */
  drawnCard: Card;
  /** The move that was applied. */
  move: GolfMove;
  /** The card that went to the discard pile. */
  discardedCard: Card;
  /** Whether the round ended after this turn. */
  roundEnded: boolean;
  /** The player index who took this turn. */
  playerIndex: number;
}

/**
 * Execute a complete turn for the current player.
 *
 * Steps:
 *   1. Draw a card from the chosen source.
 *   2. Apply the chosen move.
 *   3. Place the discarded card on the discard pile.
 *   4. Check for round end.
 *   5. Advance to the next player (unless the round ended).
 *
 * @returns The result of the turn.
 */
export function executeTurn(
  session: GolfSession,
  action: GolfAction,
): TurnResult {
  const { gameState, shared } = session;
  const playerIndex = gameState.currentPlayerIndex;
  const playerState = gameState.playerStates[playerIndex];

  // 1. Draw
  let drawnCard: Card;
  if (action.drawSource === 'stock') {
    drawnCard = drawOrThrow(shared.stockPile);
  } else {
    drawnCard = shared.discardPile.popOrThrow();
  }

  // 2. Apply move
  const { discardedCard } = applyMove(playerState.grid, drawnCard, action.move);

  // 3. Discard
  shared.discardPile.push(discardedCard);

  // 4. Check round end
  const roundEnded = checkRoundEnd(shared.roundEnd, playerIndex, playerState.grid);

  if (roundEnded) {
    endGame(gameState);
  } else {
    advanceTurn(gameState);
  }

  return {
    drawnCard,
    move: action.move,
    discardedCard,
    roundEnded,
    playerIndex,
  };
}
