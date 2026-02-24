/**
 * GameTranscript.ts
 *
 * Transcript types and recorder for The Mind.
 *
 * Records a replay-ready JSON transcript capturing all real-time events:
 * card plays, penalties (life loss + discarded cards), level completions,
 * and the final game outcome. Unlike turn-based games, The Mind events
 * are timestamped relative to the level start to capture the real-time
 * timing dimension.
 *
 * The recorder follows the engine's TranscriptRecorderBase<T> pattern.
 * Call the record methods as events occur, then finalize() when the game
 * ends to seal the transcript.
 *
 * @module
 */

import { TranscriptRecorderBase } from '../../src/core-engine/TranscriptRecorder';
import type { PlayerId } from './TheMindGameState';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** A card play event. */
export interface MindCardPlayedEvent {
  readonly type: 'card-played';
  /** Milliseconds since the current level started. */
  readonly timestamp: number;
  /** Which player played the card (0 = human, 1 = AI). */
  readonly playerId: PlayerId;
  /** The value of the played card. */
  readonly cardValue: number;
  /** The pile top value AFTER this play. */
  readonly pileTopAfter: number;
  /** Total cards on the pile after this play. */
  readonly pileSizeAfter: number;
}

/** A penalty event (life lost, lower cards discarded). */
export interface MindPenaltyEvent {
  readonly type: 'penalty';
  /** Milliseconds since the current level started. */
  readonly timestamp: number;
  /** Lives remaining AFTER this penalty. */
  readonly livesRemaining: number;
  /** Cards discarded due to this penalty. */
  readonly discardedCards: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly cardValue: number;
  }>;
}

/** A level completion event. */
export interface MindLevelCompleteEvent {
  readonly type: 'level-complete';
  /** Milliseconds since the completed level started. */
  readonly timestamp: number;
  /** The level that was just completed. */
  readonly level: number;
  /** Whether a bonus life was awarded. */
  readonly bonusLifeAwarded: boolean;
  /** Lives remaining after any bonus award. */
  readonly livesAfter: number;
  /**
   * Cards dealt to each player for the NEXT level (values only).
   * Undefined when the completed level is the final level (game won)
   * since no new cards are dealt. Added in version 2 to support
   * multi-level replay state reconstruction.
   */
  readonly handsDealt?: [readonly number[], readonly number[]];
}

/** The final game outcome event. */
export interface MindGameOverEvent {
  readonly type: 'game-over';
  /** Milliseconds since the last level started. */
  readonly timestamp: number;
  /** 'win' or 'loss'. */
  readonly outcome: 'win' | 'loss';
  /** The final level reached. */
  readonly finalLevel: number;
  /** Lives remaining at game end. */
  readonly finalLives: number;
}

/** Union of all Mind transcript event types. */
export type MindEvent =
  | MindCardPlayedEvent
  | MindPenaltyEvent
  | MindLevelCompleteEvent
  | MindGameOverEvent;

// ---------------------------------------------------------------------------
// Initial state snapshot
// ---------------------------------------------------------------------------

/** Snapshot of the initial game state (before any plays). */
export interface MindInitialState {
  /** Player names. */
  readonly playerNames: [string, string];
  /** Which players are AI-controlled. */
  readonly isAI: [boolean, boolean];
  /** Starting lives. */
  readonly startingLives: number;
  /** Starting level. */
  readonly startingLevel: number;
  /** Cards dealt to each player at level start (values only). */
  readonly hands: [readonly number[], readonly number[]];
}

// ---------------------------------------------------------------------------
// Game results
// ---------------------------------------------------------------------------

/** Final game results. */
export interface MindGameResults {
  /** 'win' or 'loss'. */
  readonly outcome: 'win' | 'loss';
  /** Final level reached. */
  readonly finalLevel: number;
  /** Lives remaining at game end. */
  readonly finalLives: number;
  /** Total cards played across all levels. */
  readonly totalCardsPlayed: number;
  /** Total penalties incurred across all levels. */
  readonly totalPenalties: number;
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

/** A complete The Mind game transcript. */
export interface MindTranscript {
  /** Format version. Version 2 adds handsDealt to level-complete events. */
  readonly version: 1 | 2;
  /** Game identifier. */
  readonly gameType: 'the-mind';
  /** ISO 8601 timestamp when the game started. */
  startedAt: string;
  /** ISO 8601 timestamp when the game ended (empty until finalized). */
  endedAt: string;
  /** Initial state snapshot. */
  readonly initialState: MindInitialState;
  /** All recorded events in chronological order. */
  readonly events: MindEvent[];
  /** Final results (null until finalized). */
  results: MindGameResults | null;
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

/**
 * Records a The Mind game transcript by capturing real-time events.
 *
 * Usage:
 * 1. Create a recorder at game start with the initial state.
 * 2. Call recordCardPlay() after each successful card play.
 * 3. Call recordPenalty() when a penalty occurs (life lost).
 * 4. Call recordLevelComplete() when a level is cleared.
 * 5. Call finalize() when the game ends (win or loss).
 *
 * After finalize(), all record methods become no-ops (transcript is sealed).
 */
export class MindTranscriptRecorder extends TranscriptRecorderBase<MindTranscript> {
  private sealed = false;
  private cardsPlayedCount = 0;
  private penaltyCount = 0;

  constructor(initialState: MindInitialState) {
    super({
      version: 2,
      gameType: 'the-mind',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState,
      events: [],
      results: null,
    });
  }

  /**
   * Record a card play event.
   *
   * @param timestamp - Milliseconds since the current level started.
   * @param playerId - Which player played (0 or 1).
   * @param cardValue - The value of the played card.
   * @param pileTopAfter - Pile top value after the play.
   * @param pileSizeAfter - Pile size after the play.
   */
  recordCardPlay(
    timestamp: number,
    playerId: PlayerId,
    cardValue: number,
    pileTopAfter: number,
    pileSizeAfter: number,
  ): void {
    if (this.sealed) return;

    this.transcript.events.push({
      type: 'card-played',
      timestamp,
      playerId,
      cardValue,
      pileTopAfter,
      pileSizeAfter,
    });
    this.cardsPlayedCount++;
  }

  /**
   * Record a penalty event.
   *
   * @param timestamp - Milliseconds since the current level started.
   * @param livesRemaining - Lives remaining after the penalty.
   * @param discardedCards - Cards discarded due to the penalty.
   */
  recordPenalty(
    timestamp: number,
    livesRemaining: number,
    discardedCards: ReadonlyArray<{
      playerId: PlayerId;
      cardValue: number;
    }>,
  ): void {
    if (this.sealed) return;

    this.transcript.events.push({
      type: 'penalty',
      timestamp,
      livesRemaining,
      discardedCards,
    });
    this.penaltyCount++;
  }

  /**
   * Record a level completion event.
   *
   * @param timestamp - Milliseconds since the completed level started.
   * @param level - The level that was completed.
   * @param bonusLifeAwarded - Whether a bonus life was awarded.
   * @param livesAfter - Lives remaining after any bonus.
   * @param handsDealt - Cards dealt for the next level (omit for final level).
   */
  recordLevelComplete(
    timestamp: number,
    level: number,
    bonusLifeAwarded: boolean,
    livesAfter: number,
    handsDealt?: [readonly number[], readonly number[]],
  ): void {
    if (this.sealed) return;

    const event: MindLevelCompleteEvent = {
      type: 'level-complete',
      timestamp,
      level,
      bonusLifeAwarded,
      livesAfter,
      ...(handsDealt ? { handsDealt } : {}),
    };

    this.transcript.events.push(event);
  }

  /**
   * Finalize the transcript and seal it.
   *
   * After calling this, all record methods become no-ops.
   *
   * @param timestamp - Milliseconds since the last level started.
   * @param outcome - 'win' or 'loss'.
   * @param finalLevel - The final level reached.
   * @param finalLives - Lives remaining at game end.
   * @returns The sealed transcript.
   */
  finalize(
    timestamp: number,
    outcome: 'win' | 'loss',
    finalLevel: number,
    finalLives: number,
  ): MindTranscript {
    if (this.sealed) return this.transcript;

    this.transcript.events.push({
      type: 'game-over',
      timestamp,
      outcome,
      finalLevel,
      finalLives,
    });

    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = {
      outcome,
      finalLevel,
      finalLives,
      totalCardsPlayed: this.cardsPlayedCount,
      totalPenalties: this.penaltyCount,
    };

    this.sealed = true;
    return this.transcript;
  }

  /** Check whether the transcript has been sealed. */
  isSealed(): boolean {
    return this.sealed;
  }
}
