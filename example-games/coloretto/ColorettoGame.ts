/**
 * Coloretto game orchestration -- row placement, take-a-row mechanics,
 * round management, and multi-round cumulative scoring.
 *
 * Game flow:
 *   1. Setup: create a shuffled deck and N shared rows (3-5 based on
 *      player count). Play 7/5/4/3 rounds depending on player count.
 *   2. Each round, players take turns either drawing the top card and
 *      placing it face-up onto any non-full row, or taking an entire
 *      row into their collection (then sitting out for the round).
 *   3. When the Last Round card is drawn and placed, every player who
 *      has not yet taken a row gets exactly one final turn, then the
 *      round ends.
 *   4. Each round is scored (3 colors positive, rest negative) and
 *      scores accumulate across rounds. Player collections also
 *      accumulate across rounds, so once a player holds cards in more
 *      than 3 colors some of their colors score negatively. Highest
 *      total wins.
 *
 * Pure TypeScript -- no Phaser dependencies (pattern from Sushi Go!).
 */

import type { ChameleonColor, ColorettoCard } from './ColorettoCards';
import {
  createColorettoDeck,
  rowsForPlayerCount,
  roundsForPlayerCount,
  ROW_CAPACITY,
} from './ColorettoCards';
import { shuffleArray } from '../../src/card-system/Deck';
import type { MultiplayerSetupOptions } from '../../src/core-engine/SetupOptions';
import { resolveSetupOptions } from '../../src/core-engine/SetupOptions';
import type { LegalityResult } from '../../src/rule-engine/index';
import {
  positiveColorsForPlayer,
  scorePlayerRound,
} from './ColorettoScoring';
import type { PlayerRoundScore } from './ColorettoScoring';

// ── Player state ────────────────────────────────────────────

/** Per-player round participation state. */
export type ColorettoRoundState = 'active' | 'taken-row' | 'final-turn-done';

export interface ColorettoPlayerState {
  readonly name: string;
  readonly isAI: boolean;
  /** Cards collected from taken rows, accumulated across ALL rounds. */
  collection: ColorettoCard[];
  /** Whether the player still acts this round. */
  roundState: ColorettoRoundState;
  /** Score per round (index = round number, 0-based). */
  roundScores: number[];
  /** Total score across all rounds (updated after each round). */
  totalScore: number;
}

// ── Shared tableau ──────────────────────────────────────────

/** A shared row that accepts up to {@link ROW_CAPACITY} face-up cards. */
export interface ColorettoRow {
  cards: ColorettoCard[];
}

// ── Game phases ─────────────────────────────────────────────

export type ColorettoPhase =
  | 'setup'
  | 'playing'          // Players are placing cards / taking rows
  | 'round-scoring'    // Round just ended, scoring in progress
  | 'game-over';       // All rounds complete

// ── Session state ───────────────────────────────────────────

export interface ColorettoSession {
  players: ColorettoPlayerState[];
  /** Draw pile; the top card is the last element. */
  deck: ColorettoCard[];
  /** Shared tableau rows (index = row number). */
  rows: ColorettoRow[];
  phase: ColorettoPhase;
  /** Current round number (0-based). */
  currentRound: number;
  /** Total rounds for this player count. */
  readonly totalRounds: number;
  /** Whether the Last Round card has been drawn and placed. */
  lastRoundTriggered: boolean;
  /**
   * Index of the player whose turn it currently is, or -1 before the
   * first turn of a round (resolve via {@link getCurrentPlayerIndex}).
   */
  currentTurnIndex: number;
  /** RNG for shuffling. */
  readonly rng: () => number;
}

// ── Actions ─────────────────────────────────────────────────

export type ColorettoAction =
  | { type: 'place'; rowIndex: number }
  | { type: 'take'; rowIndex: number };

/** Result of executing a single action. */
export interface ActionResult {
  readonly action: ColorettoAction;
  /** The card drawn and placed (place actions only). */
  readonly drawnCard?: ColorettoCard;
  /** True if the Last Round card was just drawn and placed. */
  readonly lastRoundTriggered: boolean;
  /** True if this action ended the round. */
  readonly roundOver: boolean;
}

// ── Setup options ───────────────────────────────────────────

export type ColorettoSetupOptions = MultiplayerSetupOptions;

// ── Setup ───────────────────────────────────────────────────

/**
 * Create a new Coloretto game session and deal the first round.
 *
 * Supports 2-5 players. Rows and round counts follow canonical rules.
 */
export function setupColorettoGame(
  options: ColorettoSetupOptions = {},
): ColorettoSession {
  const { players: playerInfos, rng } = resolveSetupOptions(options);
  if (playerInfos.length < 2 || playerInfos.length > 5) {
    throw new Error(
      `Coloretto requires 2-5 players, got ${playerInfos.length}`,
    );
  }

  const players: ColorettoPlayerState[] = playerInfos.map((info) => ({
    name: info.name,
    isAI: info.isAI,
    collection: [],
    roundState: 'active',
    roundScores: [],
    totalScore: 0,
  }));

  const session: ColorettoSession = {
    players,
    deck: [],
    rows: [],
    phase: 'setup',
    currentRound: 0,
    totalRounds: roundsForPlayerCount(playerInfos.length),
    lastRoundTriggered: false,
    currentTurnIndex: -1,
    rng,
  };

  dealRound(session);
  return session;
}

// ── Deal ────────────────────────────────────────────────────

/**
 * Deal the current round: fresh shuffled deck, empty rows, reset
 * player round participation. Player collections are NOT cleared --
 * per canonical Coloretto rules they accumulate for the whole game,
 * which is what makes negative color scoring possible from round 2.
 */
export function dealRound(session: ColorettoSession): void {
  const deck = createColorettoDeck();
  shuffleArray(deck, session.rng);

  session.deck = deck;
  session.rows = Array.from(
    { length: rowsForPlayerCount(session.players.length) },
    (): ColorettoRow => ({ cards: [] }),
  );
  session.lastRoundTriggered = false;
  session.currentTurnIndex = -1;
  session.phase = 'playing';

  for (const player of session.players) {
    player.roundState = 'active';
  }
}

// ── Turn flow ───────────────────────────────────────────────

/** Top card of the draw pile (undefined when the deck is empty). */
export function topCard(session: ColorettoSession): ColorettoCard | undefined {
  return session.deck.length > 0
    ? session.deck[session.deck.length - 1]
    : undefined;
}

/**
 * Index of the player whose turn it currently is, or -1 when the
 * round is over (no active players remain).
 */
export function getCurrentPlayerIndex(session: ColorettoSession): number {
  if (session.currentTurnIndex >= 0) {
    if (session.players[session.currentTurnIndex]?.roundState === 'active') {
      return session.currentTurnIndex;
    }
  }
  // Fall back to the first active player (round start, or stale index).
  return session.players.findIndex((p) => p.roundState === 'active');
}

/** Index of the next active player after `afterIndex` (wrapping), or -1. */
function nextActivePlayerIndex(
  session: ColorettoSession,
  afterIndex: number,
): number {
  const n = session.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (afterIndex + step) % n;
    if (session.players[idx].roundState === 'active') return idx;
  }
  return -1;
}

// ── Validation ──────────────────────────────────────────────

/**
 * Validate an action for a player.
 *
 * Place: the row must exist, be non-full, and the deck must not be
 * empty. Take: the row must exist and contain at least one card.
 * The action is only legal when it is the player's turn and they have
 * not yet taken a row.
 */
export function validateAction(
  session: ColorettoSession,
  playerIndex: number,
  action: ColorettoAction,
): LegalityResult {
  if (session.phase !== 'playing') {
    return { legal: false, reason: `Cannot act in phase: ${session.phase}` };
  }
  const player = session.players[playerIndex];
  if (!player) {
    return { legal: false, reason: `Unknown player index: ${playerIndex}` };
  }
  if (getCurrentPlayerIndex(session) !== playerIndex) {
    return { legal: false, reason: 'Not this player\'s turn' };
  }
  if (player.roundState !== 'active') {
    return {
      legal: false,
      reason: `Player ${player.name} has already taken a row this round`,
    };
  }
  if (
    action.rowIndex < 0 ||
    action.rowIndex >= session.rows.length
  ) {
    return { legal: false, reason: `Row index ${action.rowIndex} out of bounds` };
  }

  const row = session.rows[action.rowIndex];

  if (action.type === 'place') {
    if (row.cards.length >= ROW_CAPACITY) {
      return { legal: false, reason: `Row ${action.rowIndex} is full` };
    }
    if (session.deck.length === 0) {
      return { legal: false, reason: 'Deck is empty -- take a row instead' };
    }
    return { legal: true };
  }

  // take
  if (row.cards.length === 0) {
    return { legal: false, reason: `Row ${action.rowIndex} is empty` };
  }
  return { legal: true };
}

/** All legal actions for a player (place on non-full rows, take non-empty rows). */
export function legalActions(
  session: ColorettoSession,
  playerIndex: number,
): ColorettoAction[] {
  if (
    session.phase !== 'playing' ||
    getCurrentPlayerIndex(session) !== playerIndex ||
    session.players[playerIndex]?.roundState !== 'active'
  ) {
    return [];
  }

  const actions: ColorettoAction[] = [];
  for (let rowIndex = 0; rowIndex < session.rows.length; rowIndex++) {
    const row = session.rows[rowIndex];
    if (row.cards.length < ROW_CAPACITY && session.deck.length > 0) {
      actions.push({ type: 'place', rowIndex });
    }
    if (row.cards.length > 0) {
      actions.push({ type: 'take', rowIndex });
    }
  }
  return actions;
}

// ── Execution ───────────────────────────────────────────────

/**
 * Execute an action for the current player.
 *
 * Throws when the action is illegal. After the action, advances the
 * turn to the next active player. When the Last Round card is drawn,
 * the player's placement counts as their final turn.
 */
export function executeAction(
  session: ColorettoSession,
  playerIndex: number,
  action: ColorettoAction,
): ActionResult {
  const validation = validateAction(session, playerIndex, action);
  if (!validation.legal) {
    throw new Error(
      `Illegal action for ${session.players[playerIndex]?.name}: ${validation.reason}`,
    );
  }

  const player = session.players[playerIndex];
  const row = session.rows[action.rowIndex];
  let drawnCard: ColorettoCard | undefined;
  let lastRoundTriggered = false;

  if (action.type === 'place') {
    drawnCard = session.deck.pop();
    if (!drawnCard) {
      throw new Error('Deck is empty -- cannot place a card');
    }
    if (drawnCard.type === 'last-round') {
      session.lastRoundTriggered = true;
      lastRoundTriggered = true;
    }
    row.cards.push(drawnCard);
    // Once the Last Round card appears, every remaining player gets
    // exactly one final turn -- this placement was this player's.
    if (session.lastRoundTriggered) {
      player.roundState = 'final-turn-done';
    }
  } else {
    player.collection.push(...row.cards);
    row.cards = [];
    player.roundState = 'taken-row';
  }

  session.currentTurnIndex = nextActivePlayerIndex(session, playerIndex);

  return {
    action,
    drawnCard,
    lastRoundTriggered,
    roundOver: isRoundOver(session),
  };
}

// ── Round end ───────────────────────────────────────────────

/** Whether the round is over (no active players remain). */
export function isRoundOver(session: ColorettoSession): boolean {
  return session.players.every((p) => p.roundState !== 'active');
}

/** Transition to the round-scoring phase. */
export function beginRoundScoring(session: ColorettoSession): void {
  if (session.phase !== 'playing') {
    throw new Error(`Cannot score in phase: ${session.phase}`);
  }
  if (!isRoundOver(session)) {
    throw new Error('Cannot score a round that is still in progress');
  }
  session.phase = 'round-scoring';
}

// ── Round scoring ───────────────────────────────────────────

export interface RoundResult {
  /** Round number (0-based). */
  readonly round: number;
  /** Per-player round scores (positive/negative color totals). */
  readonly roundScores: number[];
  /** Per-player cumulative totals after this round. */
  readonly cumulativeScores: number[];
  /** Per-player positive color selections. */
  readonly positiveColors: ChameleonColor[][];
  /** Per-player score breakdowns. */
  readonly playerScores: PlayerRoundScore[];
  /** Whether this was the final round of the game. */
  readonly isLastRound: boolean;
}

/**
 * Score the current round for all players and advance the game.
 *
 * Each player's positive colors are resolved via
 * {@link positiveColorsForPlayer}: an explicit selection wins, otherwise
 * the optimal 3 (or all, when fewer than 3 colors are present).
 *
 * After scoring, either the next round is dealt or the game ends.
 */
export function scoreRound(
  session: ColorettoSession,
  providedPositives: (readonly ChameleonColor[] | undefined)[] = [],
): RoundResult {
  if (session.phase !== 'round-scoring') {
    throw new Error(`Cannot score in phase: ${session.phase}`);
  }

  const playerScores = session.players.map((player, i) => {
    const positive = positiveColorsForPlayer(
      player.collection,
      providedPositives[i],
    );
    return scorePlayerRound(player.collection, positive);
  });

  const roundScores = playerScores.map((s) => s.total);
  const positiveColors = playerScores.map((s) => [...s.positiveColors]);

  for (let i = 0; i < session.players.length; i++) {
    session.players[i].roundScores.push(roundScores[i]);
    session.players[i].totalScore += roundScores[i];
  }

  const isLastRound = session.currentRound >= session.totalRounds - 1;
  const result: RoundResult = {
    round: session.currentRound,
    roundScores,
    cumulativeScores: session.players.map((p) => p.totalScore),
    positiveColors,
    playerScores,
    isLastRound,
  };

  if (isLastRound) {
    session.phase = 'game-over';
  } else {
    session.currentRound++;
    dealRound(session);
  }

  return result;
}

// ── Game state queries ──────────────────────────────────────

/** Whether the game is over. */
export function isGameOver(session: ColorettoSession): boolean {
  return session.phase === 'game-over';
}

/** Get the winning player index (highest total score; ties broken by index). */
export function getWinnerIndex(session: ColorettoSession): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < session.players.length; i++) {
    if (session.players[i].totalScore > bestScore) {
      bestScore = session.players[i].totalScore;
      best = i;
    }
  }
  return best;
}
