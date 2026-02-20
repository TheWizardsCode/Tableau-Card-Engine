/**
 * Game transcript types and recorder for Beleaguered Castle.
 *
 * Records a replay-ready JSON transcript capturing the deal, every move,
 * undo/redo actions, and the final outcome for debugging, regression
 * testing, and the Visual Replay Dev Tool.
 *
 * Usage:
 *   const recorder = new BCTranscriptRecorder(seed, state);
 *   // ... after each player move ...
 *   recorder.recordMove(move);
 *   // ... after auto-moves ...
 *   recorder.recordAutoMove(move);
 *   // ... on undo/redo ...
 *   recorder.recordUndo();
 *   recorder.recordRedo();
 *   // ... after game ends ...
 *   const transcript = recorder.finalize('win', moveCount, elapsedSeconds);
 */

import type { Rank, Suit } from '../../src/card-system/Card';
import type {
  BeleagueredCastleState,
  BCMove,
} from './BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from './BeleagueredCastleState';
import { snapshotCard } from '../../src/core-engine/TranscriptTypes';
import type { CardSnapshot } from '../../src/core-engine/TranscriptTypes';

// Re-export so existing consumers that import from this module still work.
export { snapshotCard };
export type { CardSnapshot };

// ── Snapshot types ──────────────────────────────────────────

/** Snapshot of a single foundation pile. */
export interface FoundationSnapshot {
  /** Suit this foundation builds (clubs, diamonds, hearts, spades). */
  suit: Suit;
  /** Number of cards on the foundation (0-13). */
  size: number;
  /** Rank of the top card, or null if empty. */
  topRank: Rank | null;
}

/** Snapshot of a single tableau column. */
export interface ColumnSnapshot {
  /** Cards in the column, bottom to top. */
  cards: CardSnapshot[];
}

/** Complete board snapshot at a point in time. */
export interface BoardSnapshot {
  foundations: FoundationSnapshot[];
  tableau: ColumnSnapshot[];
}

// ── Move record types ───────────────────────────────────────

/** A player-initiated move. */
export interface PlayerMoveRecord {
  kind: 'player-move';
  /** The move that was applied. */
  move: BCMove;
  /** Player's move count AFTER this move. */
  moveCount: number;
}

/** An auto-move to a foundation (triggered by the engine). */
export interface AutoMoveRecord {
  kind: 'auto-move';
  /** The move that was applied. */
  move: BCMove;
}

/** An undo action. */
export interface UndoRecord {
  kind: 'undo';
  /** Player's move count AFTER the undo. */
  moveCount: number;
}

/** A redo action. */
export interface RedoRecord {
  kind: 'redo';
  /** Player's move count AFTER the redo. */
  moveCount: number;
}

/** Any action recorded in the transcript. */
export type TranscriptEntry =
  | PlayerMoveRecord
  | AutoMoveRecord
  | UndoRecord
  | RedoRecord;

// ── Game outcome ────────────────────────────────────────────

export type GameOutcome = 'win' | 'loss' | 'in-progress';

export interface GameResult {
  outcome: GameOutcome;
  /** Total player moves at game end. */
  moveCount: number;
  /** Elapsed time in seconds. */
  elapsedSeconds: number;
}

// ── Transcript ──────────────────────────────────────────────

/** A complete Beleaguered Castle game transcript. */
export interface BCGameTranscript {
  /** Format version for future compatibility. */
  version: 1;
  /** Game identifier. */
  game: 'beleaguered-castle';
  /** The RNG seed used for the deal. */
  seed: number;
  /** ISO 8601 timestamp when the game started. */
  startedAt: string;
  /** ISO 8601 timestamp when the game ended (set on finalize). */
  endedAt: string;
  /** Board state after the deal, before any moves. */
  initialState: BoardSnapshot;
  /** All actions in order. */
  moves: TranscriptEntry[];
  /** Final result (set on finalize). */
  result: GameResult | null;
}

// ── Helpers ─────────────────────────────────────────────────

/** Create a board snapshot from the current game state. */
export function snapshotBoard(state: BeleagueredCastleState): BoardSnapshot {
  const foundations: FoundationSnapshot[] = [];
  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    const pile = state.foundations[fi];
    const top = pile.peek();
    foundations.push({
      suit: (['clubs', 'diamonds', 'hearts', 'spades'] as Suit[])[fi],
      size: pile.size(),
      topRank: top ? top.rank : null,
    });
  }

  const tableau: ColumnSnapshot[] = [];
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    tableau.push({
      cards: state.tableau[col].toArray().map(snapshotCard),
    });
  }

  return { foundations, tableau };
}

// ── BCTranscriptRecorder ────────────────────────────────────

/**
 * Records a game transcript by capturing actions as they happen.
 *
 * Usage:
 *   const recorder = new BCTranscriptRecorder(seed, state);
 *   recorder.recordMove(move, state.moveCount);
 *   recorder.recordAutoMove(move);
 *   recorder.recordUndo(state.moveCount);
 *   recorder.recordRedo(state.moveCount);
 *   const transcript = recorder.finalize('win', moveCount, elapsed);
 */
export class BCTranscriptRecorder {
  private readonly transcript: BCGameTranscript;

  constructor(seed: number, initialState: BeleagueredCastleState) {
    this.transcript = {
      version: 1,
      game: 'beleaguered-castle',
      seed,
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: snapshotBoard(initialState),
      moves: [],
      result: null,
    };
  }

  /** Record a player-initiated move. */
  recordMove(move: BCMove, moveCount: number): void {
    this.transcript.moves.push({
      kind: 'player-move',
      move,
      moveCount,
    });
  }

  /** Record an auto-move to a foundation. */
  recordAutoMove(move: BCMove): void {
    this.transcript.moves.push({
      kind: 'auto-move',
      move,
    });
  }

  /** Record an undo action. */
  recordUndo(moveCount: number): void {
    this.transcript.moves.push({
      kind: 'undo',
      moveCount,
    });
  }

  /** Record a redo action. */
  recordRedo(moveCount: number): void {
    this.transcript.moves.push({
      kind: 'redo',
      moveCount,
    });
  }

  /**
   * Finalize the transcript with the game outcome.
   *
   * @returns The complete transcript.
   */
  finalize(
    outcome: GameOutcome,
    moveCount: number,
    elapsedSeconds: number,
  ): BCGameTranscript {
    this.transcript.endedAt = new Date().toISOString();
    this.transcript.result = {
      outcome,
      moveCount,
      elapsedSeconds,
    };
    return this.transcript;
  }

  /**
   * Get the transcript in its current state (may not be finalized).
   */
  getTranscript(): BCGameTranscript {
    return this.transcript;
  }
}
