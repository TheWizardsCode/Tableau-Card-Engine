/**
 * LostCitiesGame.ts
 *
 * Pure game orchestration for Lost Cities — no Phaser dependency.
 * Manages session state, two-phase turns, 3-round match, scoring, and
 * visible-state views for AI.
 *
 * Lost Cities is a 2-player card game where players compete to form
 * profitable expeditions across 5 color lanes. Each turn has two
 * mandatory phases: play/discard, then draw. A round ends when the
 * draw pile is exhausted. A match consists of 3 rounds.
 */

import type {
  LostCitiesCard,
  ExpeditionColor,
} from './LostCitiesCards';
import {
  EXPEDITION_COLORS,
  HAND_SIZE,
  ROUND_COUNT,
  createLostCitiesDeck,
  shuffleDeck,
} from './LostCitiesCards';
import type {
  Phase1Action,
  Phase2Action,
  LostCitiesAction,
  RulesGameView,
  TurnPhase,
} from './LostCitiesRules';
import {
  checkPhase1Legality,
  checkPhase2Legality,
  getLegalPhase1Actions,
  getLegalPhase2Actions,
  isRoundOver,
} from './LostCitiesRules';
import { scoreRound, scoreRoundDetailed } from './LostCitiesScoring';

import type { MultiplayerSetupOptions } from '../../src/core-engine/SetupOptions';
import { resolveSetupOptions } from '../../src/core-engine/SetupOptions';
import type { ExpeditionScoreBreakdown } from './LostCitiesScoring';

// ---------------------------------------------------------------------------
// Player types
// ---------------------------------------------------------------------------

export type PlayerId = 0 | 1;

export interface LostCitiesPlayer {
  readonly name: string;
  readonly isAI: boolean;
  hand: LostCitiesCard[];
  /** Expedition lanes — each color maps to cards played in order. */
  expeditions: Map<ExpeditionColor, LostCitiesCard[]>;
}

// ---------------------------------------------------------------------------
// Round state
// ---------------------------------------------------------------------------

export interface RoundState {
  /** The draw pile (top = last element). */
  drawPile: LostCitiesCard[];
  /** Discard piles by color (top = last element). */
  discardPiles: Map<ExpeditionColor, LostCitiesCard[]>;
  /** Current player index (0 or 1). */
  currentPlayer: PlayerId;
  /** Current turn phase. */
  turnPhase: TurnPhase;
  /** After Phase 1 discard, records which color — prevents drawing from same pile. */
  justDiscardedColor: ExpeditionColor | null;
  /** Turn number within the current round (1-based). */
  turnNumber: number;
}

// ---------------------------------------------------------------------------
// Match / Session types
// ---------------------------------------------------------------------------

export type MatchPhase = 'playing' | 'round-over' | 'match-over';

export interface RoundScoreResult {
  /** Per-expedition breakdowns for each player. */
  details: [ExpeditionScoreBreakdown[], ExpeditionScoreBreakdown[]];
  /** Total score for each player this round. */
  totals: [number, number];
}

export interface LostCitiesSession {
  players: [LostCitiesPlayer, LostCitiesPlayer];
  round: RoundState;
  /** 1-based current round number. */
  roundNumber: number;
  /** Per-round scores (filled as rounds complete). */
  roundScores: RoundScoreResult[];
  /** Cumulative match scores. */
  cumulativeScores: [number, number];
  /** Overall match phase. */
  matchPhase: MatchPhase;
  /** Random number generator (injectable for tests). */
  rng: () => number;
  /** Which player starts each round (alternates). */
  startingPlayer: PlayerId;
}

// ---------------------------------------------------------------------------
// Visible state for AI
// ---------------------------------------------------------------------------

/** Information visible to one player (no opponent hand, no draw pile order). */
export interface VisibleState {
  /** The player's own hand. */
  hand: LostCitiesCard[];
  /** The player's own expeditions. */
  myExpeditions: Map<ExpeditionColor, LostCitiesCard[]>;
  /** Opponent's expeditions (fully visible on table). */
  opponentExpeditions: Map<ExpeditionColor, LostCitiesCard[]>;
  /** Discard pile tops (null if empty). */
  discardTops: Map<ExpeditionColor, LostCitiesCard | null>;
  /** Number of cards remaining in the draw pile. */
  drawPileSize: number;
  /** Current turn phase. */
  turnPhase: TurnPhase;
  /** Color just discarded to (for draw restriction). */
  justDiscardedColor: ExpeditionColor | null;
  /** Current round number (1-based). */
  roundNumber: number;
  /** Cumulative match scores [player0, player1]. */
  cumulativeScores: [number, number];
}

// ---------------------------------------------------------------------------
// Turn result
// ---------------------------------------------------------------------------

export interface TurnResult {
  /** The action that was executed. */
  action: LostCitiesAction;
  /** Whether the round ended after this action (draw pile exhausted). */
  roundEnded: boolean;
  /** Whether the match ended after this action (all 3 rounds done). */
  matchEnded: boolean;
  /** Round score result, if the round just ended. */
  roundScore: RoundScoreResult | null;
}

// ---------------------------------------------------------------------------
// Setup options
// ---------------------------------------------------------------------------

export type LostCitiesSetupOptions = MultiplayerSetupOptions;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function createEmptyExpeditions(): Map<ExpeditionColor, LostCitiesCard[]> {
  return new Map(EXPEDITION_COLORS.map((c) => [c, []]));
}

function createEmptyDiscardPiles(): Map<ExpeditionColor, LostCitiesCard[]> {
  return new Map(EXPEDITION_COLORS.map((c) => [c, []]));
}

function dealRound(
  session: LostCitiesSession,
): void {
  // Create and shuffle a new deck
  const deck = createLostCitiesDeck();
  shuffleDeck(deck, session.rng);

  // Reset player expeditions and hands
  for (const player of session.players) {
    player.expeditions = createEmptyExpeditions();
    player.hand = [];
  }

  // Deal HAND_SIZE cards to each player (alternating like real game)
  for (let i = 0; i < HAND_SIZE; i++) {
    for (const player of session.players) {
      const card = deck.pop()!;
      card.faceUp = true; // Cards in hand are visible to the holder
      player.hand.push(card);
    }
  }

  // Set up round state
  session.round = {
    drawPile: deck, // Remaining cards form the draw pile
    discardPiles: createEmptyDiscardPiles(),
    currentPlayer: session.startingPlayer,
    turnPhase: 'PlayOrDiscard',
    justDiscardedColor: null,
    turnNumber: 1,
  };
}

/**
 * Create and return a new Lost Cities session ready to play.
 */
export function setupLostCitiesGame(
  options?: LostCitiesSetupOptions,
): LostCitiesSession {
  const { players: playerInfos, rng } = resolveSetupOptions({
    ...options,
    playerCount: 2,
  });

  const players: [LostCitiesPlayer, LostCitiesPlayer] = [
    {
      name: playerInfos[0].name,
      isAI: playerInfos[0].isAI,
      hand: [],
      expeditions: createEmptyExpeditions(),
    },
    {
      name: playerInfos[1].name,
      isAI: playerInfos[1].isAI,
      hand: [],
      expeditions: createEmptyExpeditions(),
    },
  ];

  const session: LostCitiesSession = {
    players,
    round: {
      drawPile: [],
      discardPiles: createEmptyDiscardPiles(),
      currentPlayer: 0,
      turnPhase: 'PlayOrDiscard',
      justDiscardedColor: null,
      turnNumber: 1,
    },
    roundNumber: 1,
    roundScores: [],
    cumulativeScores: [0, 0],
    matchPhase: 'playing',
    rng,
    startingPlayer: 0,
  };

  dealRound(session);
  return session;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get the current active player.
 *
 * NOTE: This remains game-specific rather than using the shared
 * {@link import('../../src/core-engine/TurnSequencer').getCurrentPlayer}
 * because Lost Cities nests the current player index inside
 * `session.round.currentPlayer` (a `PlayerId`), whereas the shared
 * helper expects `currentPlayerIndex` at the top level of the state
 * object. Restructuring `LostCitiesSession` to move the index out of
 * `RoundState` would be a larger change affecting the entire game's
 * round-management logic.
 */
export function getCurrentPlayer(
  session: LostCitiesSession,
): LostCitiesPlayer {
  return session.players[session.round.currentPlayer];
}

/** Get the opponent of the current player. */
export function getOpponent(
  session: LostCitiesSession,
): LostCitiesPlayer {
  return session.players[session.round.currentPlayer === 0 ? 1 : 0];
}

/** Get the index of the opponent player. */
function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Build a RulesGameView for the current player. */
export function buildRulesGameView(
  session: LostCitiesSession,
): RulesGameView {
  const player = getCurrentPlayer(session);
  return {
    playerExpeditions: player.expeditions,
    discardPiles: session.round.discardPiles,
    drawPileSize: session.round.drawPile.length,
    justDiscardedColor: session.round.justDiscardedColor,
  };
}

/** Build a visible state for a specific player (used by AI). */
export function getVisibleState(
  session: LostCitiesSession,
  playerId: PlayerId,
): VisibleState {
  const player = session.players[playerId];
  const opponent = session.players[opponentOf(playerId)];

  const discardTops = new Map<ExpeditionColor, LostCitiesCard | null>();
  for (const color of EXPEDITION_COLORS) {
    const pile = session.round.discardPiles.get(color)!;
    discardTops.set(color, pile.length > 0 ? pile[pile.length - 1] : null);
  }

  return {
    hand: player.hand,
    myExpeditions: player.expeditions,
    opponentExpeditions: opponent.expeditions,
    discardTops,
    drawPileSize: session.round.drawPile.length,
    turnPhase: session.round.turnPhase,
    justDiscardedColor: session.round.justDiscardedColor,
    roundNumber: session.roundNumber,
    cumulativeScores: [...session.cumulativeScores],
  };
}

/** Check if the current round is over (draw pile exhausted). */
export function isCurrentRoundOver(session: LostCitiesSession): boolean {
  return isRoundOver(session.round.drawPile.length);
}

/** Check if the entire match is over. */
export function isMatchOver(session: LostCitiesSession): boolean {
  return session.matchPhase === 'match-over';
}

/** Get all legal actions for the current player in the current phase. */
export function getLegalActions(
  session: LostCitiesSession,
): (Phase1Action | Phase2Action)[] {
  const player = getCurrentPlayer(session);
  const view = buildRulesGameView(session);

  if (session.round.turnPhase === 'PlayOrDiscard') {
    return getLegalPhase1Actions(player.hand, view);
  }
  return getLegalPhase2Actions(view);
}

/** Determine the match winner: 0, 1, or null for tie. */
export function getMatchWinner(
  session: LostCitiesSession,
): PlayerId | null {
  if (session.matchPhase !== 'match-over') {
    return null;
  }
  const [s0, s1] = session.cumulativeScores;
  if (s0 > s1) return 0;
  if (s1 > s0) return 1;
  return null; // Tie
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

/**
 * Execute a Phase 1 action (play to expedition or discard).
 * Validates the action, mutates session state, advances to Phase 2.
 *
 * @throws Error if the action is illegal or if it's not Phase 1.
 */
function executePhase1(
  session: LostCitiesSession,
  action: Phase1Action,
): void {
  if (session.round.turnPhase !== 'PlayOrDiscard') {
    throw new Error('Not in PlayOrDiscard phase');
  }
  if (session.matchPhase !== 'playing') {
    throw new Error('Match is not in playing phase');
  }

  const player = getCurrentPlayer(session);
  const view = buildRulesGameView(session);
  const legality = checkPhase1Legality(action, player.hand, view);
  if (!legality.legal) {
    throw new Error(`Illegal action: ${legality.reason}`);
  }

  // Remove card from hand
  const cardIndex = player.hand.findIndex((c) => c.id === action.card.id);
  player.hand.splice(cardIndex, 1);

  if (action.kind === 'play-to-expedition') {
    // Add card to expedition lane
    const lane = player.expeditions.get(action.color)!;
    lane.push(action.card);
    session.round.justDiscardedColor = null;
  } else {
    // Discard: add card to discard pile
    const pile = session.round.discardPiles.get(action.color)!;
    pile.push(action.card);
    session.round.justDiscardedColor = action.color;
  }

  // Advance to draw phase
  session.round.turnPhase = 'Draw';
}

/**
 * Execute a Phase 2 action (draw from pile or discard).
 * Validates the action, mutates session state, advances turn.
 *
 * @throws Error if the action is illegal or if it's not Phase 2.
 * @returns Whether the round ended after this draw.
 */
function executePhase2(
  session: LostCitiesSession,
  action: Phase2Action,
): boolean {
  if (session.round.turnPhase !== 'Draw') {
    throw new Error('Not in Draw phase');
  }
  if (session.matchPhase !== 'playing') {
    throw new Error('Match is not in playing phase');
  }

  const view = buildRulesGameView(session);
  const legality = checkPhase2Legality(action, view);
  if (!legality.legal) {
    throw new Error(`Illegal action: ${legality.reason}`);
  }

  const player = getCurrentPlayer(session);

  if (action.kind === 'draw-from-pile') {
    const card = session.round.drawPile.pop()!;
    card.faceUp = true;
    player.hand.push(card);
  } else {
    // Draw from discard pile
    const pile = session.round.discardPiles.get(action.color)!;
    const card = pile.pop()!;
    card.faceUp = true;
    player.hand.push(card);
  }

  // Check if round is over (draw pile exhausted)
  if (isRoundOver(session.round.drawPile.length)) {
    return true;
  }

  // Advance to next player's turn
  session.round.currentPlayer = opponentOf(session.round.currentPlayer);
  session.round.turnPhase = 'PlayOrDiscard';
  session.round.justDiscardedColor = null;
  session.round.turnNumber++;

  return false;
}

/**
 * Score the current round and record results.
 */
function scoreCurrentRound(session: LostCitiesSession): RoundScoreResult {
  const p0Expeditions = session.players[0].expeditions;
  const p1Expeditions = session.players[1].expeditions;

  const p0Detailed = scoreRoundDetailed(p0Expeditions);
  const p1Detailed = scoreRoundDetailed(p1Expeditions);

  const p0Total = scoreRound(p0Expeditions);
  const p1Total = scoreRound(p1Expeditions);

  const result: RoundScoreResult = {
    details: [p0Detailed.breakdowns, p1Detailed.breakdowns],
    totals: [p0Total, p1Total],
  };

  session.roundScores.push(result);
  session.cumulativeScores[0] += p0Total;
  session.cumulativeScores[1] += p1Total;

  return result;
}

/**
 * Advance the match to the next round, or end the match if 3 rounds are done.
 */
function advanceMatch(session: LostCitiesSession): void {
  if (session.roundNumber >= ROUND_COUNT) {
    session.matchPhase = 'match-over';
  } else {
    session.roundNumber++;
    // Alternate starting player each round
    session.startingPlayer = opponentOf(session.startingPlayer);
    dealRound(session);
    session.matchPhase = 'playing';
  }
}

// ---------------------------------------------------------------------------
// Public action execution
// ---------------------------------------------------------------------------

/**
 * Execute a complete action (Phase 1 or Phase 2).
 *
 * Call this with a Phase1Action when in PlayOrDiscard phase,
 * or a Phase2Action when in Draw phase.
 *
 * @returns TurnResult with round/match status
 * @throws Error if the action is invalid for the current phase
 */
export function executeAction(
  session: LostCitiesSession,
  action: LostCitiesAction,
): TurnResult {
  if (session.matchPhase !== 'playing') {
    throw new Error('Match is not in playing phase');
  }

  const isPhase1Action = action.kind === 'play-to-expedition' || action.kind === 'discard';
  const isPhase2Action = action.kind === 'draw-from-pile' || action.kind === 'draw-from-discard';

  if (session.round.turnPhase === 'PlayOrDiscard') {
    if (!isPhase1Action) {
      throw new Error(
        `Expected Phase 1 action (play-to-expedition or discard), got: ${action.kind}`,
      );
    }
    executePhase1(session, action as Phase1Action);
    return {
      action,
      roundEnded: false,
      matchEnded: false,
      roundScore: null,
    };
  }

  if (session.round.turnPhase === 'Draw') {
    if (!isPhase2Action) {
      throw new Error(
        `Expected Phase 2 action (draw-from-pile or draw-from-discard), got: ${action.kind}`,
      );
    }
    const roundEnded = executePhase2(session, action as Phase2Action);

    if (roundEnded) {
      const roundScore = scoreCurrentRound(session);
      advanceMatch(session);
      return {
        action,
        roundEnded: true,
        matchEnded: isMatchOver(session),
        roundScore,
      };
    }

    return {
      action,
      roundEnded: false,
      matchEnded: false,
      roundScore: null,
    };
  }

  throw new Error(`Unknown turn phase: ${session.round.turnPhase}`);
}

/**
 * Start the next round manually (when the UI needs to show a round-over
 * screen before continuing). Only needed if match phase is 'round-over'.
 *
 * In the default flow, advanceMatch is called automatically after scoring.
 * This function is provided for cases where the caller wants to pause
 * between rounds.
 */
export function startNextRound(session: LostCitiesSession): void {
  if (session.matchPhase !== 'round-over') {
    throw new Error(
      `Cannot start next round: match phase is ${session.matchPhase}`,
    );
  }
  advanceMatch(session);
}
