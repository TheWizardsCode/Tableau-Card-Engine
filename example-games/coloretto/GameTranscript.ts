/**
 * GameTranscript.ts
 *
 * Transcript types and recorder for Coloretto.
 *
 * Records a replay-ready JSON transcript capturing every action (turn)
 * within each round, round-scoring results, and the final game outcome.
 * Row states and player collections are snapshotted after each turn so
 * the transcript records the sequence of turns, row states, and final
 * scores required by the game's acceptance criteria.
 *
 * The recorder follows the engine's TranscriptRecorderBase<T> pattern.
 * Call `recordTurn()` after each `executeAction()`, `recordRoundResult()`
 * after each `scoreRound()`, and `finalize()` when the game ends.
 *
 * @module
 */

import { TranscriptRecorderBase } from '../../src/core-engine/transcript';
import type { ChameleonColor, ColorettoCard } from './ColorettoCards';
import type {
  ColorettoAction,
  ColorettoSession,
  RoundResult,
} from './ColorettoGame';

// ── Card snapshot ──────────────────────────────────────────

/** Serializable snapshot of a Coloretto card. */
export interface ColorettoCardSnapshot {
  readonly id: number;
  readonly type: string;
  /** Chameleon color. Present only for chameleon cards. */
  readonly color?: ChameleonColor;
  /** Number of chameleons (1 or 2). Present only for chameleon cards. */
  readonly count?: number;
}

/** Create a serializable snapshot of a Coloretto card. */
export function snapshotCard(card: ColorettoCard): ColorettoCardSnapshot {
  if (card.type === 'last-round') {
    return { id: card.id, type: 'last-round' };
  }
  if (card.type === 'joker') {
    return { id: card.id, type: 'joker' };
  }
  if (card.type === 'bonus') {
    return { id: card.id, type: 'bonus' };
  }
  return { id: card.id, type: 'chameleon', color: card.color, count: card.count };
}

// ── Row snapshot ───────────────────────────────────────────

/** Serializable snapshot of a single shared row. */
export interface RowSnapshot {
  readonly cards: ColorettoCardSnapshot[];
}

// ── Player snapshot ────────────────────────────────────────

/** Snapshot of a single player's state at a point in time. */
export interface ColorettoPlayerSnapshot {
  readonly name: string;
  readonly isAI: boolean;
  readonly collection: ColorettoCardSnapshot[];
  readonly roundScores: number[];
  readonly totalScore: number;
}

/** Create a serializable snapshot of a player's state. */
export function snapshotPlayer(player: ColorettoSession['players'][number]): ColorettoPlayerSnapshot {
  return {
    name: player.name,
    isAI: player.isAI,
    collection: player.collection.map(snapshotCard),
    roundScores: [...player.roundScores],
    totalScore: player.totalScore,
  };
}

// ── Turn record ────────────────────────────────────────────

/** Record of a single action (turn). */
export interface ColorettoTurnRecord {
  /** Turn number within the round (0-based). */
  readonly turnInRound: number;
  /** Round number (0-based). */
  readonly round: number;
  /** Global turn number across all rounds (0-based). */
  readonly globalTurn: number;
  /** Index of the acting player. */
  readonly playerIndex: number;
  /** Name of the acting player. */
  readonly playerName: string;
  /** The action taken. */
  readonly action: ColorettoAction;
  /** Card drawn and placed (place actions only). */
  readonly drawnCard?: ColorettoCardSnapshot;
  /** Whether this action triggered the Last Round. */
  readonly lastRoundTriggered: boolean;
  /** Full row states AFTER the action. */
  readonly rows: RowSnapshot[];
  /** Full player state snapshots AFTER the action. */
  readonly playerStates: ColorettoPlayerSnapshot[];
  /** Deck size AFTER the action. */
  readonly deckSize: number;
}

// ── Transcript ─────────────────────────────────────────────

/** Initial state snapshot (after deal, before first turn). */
export interface ColorettoInitialState {
  readonly playerStates: ColorettoPlayerSnapshot[];
  readonly rows: RowSnapshot[];
  readonly deckSize: number;
  readonly currentRound: number;
  readonly totalRounds: number;
}

/** Final game results. */
export interface ColorettoGameResults {
  /** Final scores per player. */
  readonly finalScores: number[];
  /** Index of the winning player (highest score). */
  readonly winnerIndex: number;
  /** Name of the winning player. */
  readonly winnerName: string;
  /** Round-by-round scores per player. */
  readonly roundScores: number[][];
}

/** A complete Coloretto game transcript. */
export interface ColorettoTranscript {
  /** Format version. */
  readonly version: 1;
  /** Game type identifier for adapter matching. */
  readonly gameType: 'coloretto';
  /** ISO 8601 timestamp when the game started. */
  startedAt: string;
  /** ISO 8601 timestamp when the game ended (empty until finalized). */
  endedAt: string;
  /** Initial state snapshot. */
  readonly initialState: ColorettoInitialState;
  /** All turn records in chronological order. */
  readonly turns: ColorettoTurnRecord[];
  /** Round results, indexed by round number. */
  readonly roundResults: RoundResult[];
  /** Final results (null until finalized). */
  results: ColorettoGameResults | null;
}

// ── Recorder ───────────────────────────────────────────────

/**
 * Records a Coloretto game transcript by capturing state after each
 * action.
 *
 * Usage:
 * 1. Create after `setupColorettoGame()`.
 * 2. Call `recordTurn(playerIndex, action, drawnCard)` after each
 *    `executeAction()`.
 * 3. Call `recordRoundResult(result)` after each `scoreRound()`.
 * 4. Call `finalize()` when the game ends.
 */
export class ColorettoTranscriptRecorder extends TranscriptRecorderBase<ColorettoTranscript> {
  private readonly session: ColorettoSession;
  private sealed = false;
  private globalTurnCounter = 0;
  private turnInRoundCounter = 0;

  constructor(session: ColorettoSession) {
    super({
      version: 1,
      gameType: 'coloretto',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: {
        playerStates: session.players.map(snapshotPlayer),
        rows: session.rows.map((row) => ({ cards: row.cards.map(snapshotCard) })),
        deckSize: session.deck.length,
        currentRound: session.currentRound,
        totalRounds: session.totalRounds,
      },
      turns: [],
      roundResults: [],
      results: null,
    });

    this.session = session;
  }

  /**
   * Record an action that was just executed.
   *
   * Call immediately after `executeAction()`.
   */
  recordTurn(
    playerIndex: number,
    action: ColorettoAction,
    drawnCard?: ColorettoCard,
  ): void {
    if (this.sealed) return;

    const turnRecord: ColorettoTurnRecord = {
      turnInRound: this.turnInRoundCounter++,
      round: this.session.currentRound,
      globalTurn: this.globalTurnCounter++,
      playerIndex,
      playerName: this.session.players[playerIndex].name,
      action: { ...action },
      drawnCard: drawnCard ? snapshotCard(drawnCard) : undefined,
      lastRoundTriggered: this.session.lastRoundTriggered,
      rows: this.session.rows.map((row) => ({
        cards: row.cards.map(snapshotCard),
      })),
      playerStates: this.session.players.map(snapshotPlayer),
      deckSize: this.session.deck.length,
    };

    this.transcript.turns.push(turnRecord);
  }

  /**
   * Record a round scoring result.
   *
   * Call immediately after `scoreRound()`.
   */
  recordRoundResult(result: RoundResult): void {
    if (this.sealed) return;
    this.transcript.roundResults.push(result);
    // A new round resets the in-round turn counter.
    this.turnInRoundCounter = 0;
  }

  /**
   * Finalize the transcript and seal it.
   *
   * @param winnerIndex - Index of the winning player.
   * @returns The sealed transcript.
   */
  finalize(winnerIndex: number): ColorettoTranscript {
    if (this.sealed) return this.transcript;

    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = {
      finalScores: this.session.players.map((p) => p.totalScore),
      winnerIndex,
      winnerName: this.session.players[winnerIndex].name,
      roundScores: this.session.players.map((p) => [...p.roundScores]),
    };

    this.sealed = true;
    return this.transcript;
  }

  /** Check whether the transcript has been sealed. */
  isSealed(): boolean {
    return this.sealed;
  }
}
