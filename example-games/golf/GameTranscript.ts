/**
 * Game transcript types and recorder for 9-Card Golf.
 *
 * Records a replay-ready JSON transcript capturing all turns,
 * actions, and board states for debugging, regression testing,
 * and the Visual Replay Dev Tool.
 *
 * The recorder hooks into the game loop: call `recordTurn()`
 * after each `executeTurn()`, and `finalize()` after the game ends.
 */

import type { GolfGrid } from './GolfGrid';
import type { DrawSource, GolfMove } from './GolfRules';
import type { GolfSession, TurnResult } from './GolfGame';
import { scoreGrid, scoreVisibleCards } from './GolfScoring';
import { snapshotCard } from '../../src/core-engine/TranscriptTypes';
import type { CardSnapshot } from '../../src/core-engine/TranscriptTypes';

// Re-export so existing consumers that import from this module still work.
export { snapshotCard };
export type { CardSnapshot };

// ── Snapshot types ──────────────────────────────────────────

/** Snapshot of a player's board state at a point in time. */
export interface BoardSnapshot {
  /** The player's 3x3 grid (9 cards, row-major). */
  grid: CardSnapshot[];
  /** Number of face-up cards. */
  faceUpCount: number;
  /** Score of face-up cards only. */
  visibleScore: number;
  /** Total score (including hidden cards). */
  totalScore: number;
}

/** Record of a single turn. */
export interface TurnRecord {
  /** Turn number (0-based). */
  turnNumber: number;
  /** Index of the player who acted. */
  playerIndex: number;
  /** Player name. */
  playerName: string;
  /** Where the card was drawn from. */
  drawSource: DrawSource;
  /** The card that was drawn. */
  drawnCard: CardSnapshot;
  /** The move that was applied. */
  move: GolfMove;
  /** The card that went to the discard pile. */
  discardedCard: CardSnapshot;
  /** Board state of all players AFTER the move. */
  boardStates: BoardSnapshot[];
  /** Top card of the discard pile after the move. */
  discardTop: CardSnapshot | null;
  /** Number of cards remaining in the stock pile. */
  stockRemaining: number;
  /** Whether the round ended after this turn. */
  roundEnded: boolean;
}

/** Metadata about the game. */
export interface GameMetadata {
  /** ISO 8601 timestamp of game start. */
  startedAt: string;
  /** ISO 8601 timestamp of game end (set on finalize). */
  endedAt: string;
  /** Player info. */
  players: Array<{
    name: string;
    isAI: boolean;
    strategy?: string;
  }>;
}

/** Final results after the game ends. */
export interface GameResults {
  /** Final scores per player. */
  scores: number[];
  /** Index of the winning player (lowest score). */
  winnerIndex: number;
  /** Name of the winning player. */
  winnerName: string;
}

/** A complete game transcript. */
export interface GameTranscript {
  /** Format version for future compatibility. */
  version: 1;
  /** Game metadata. */
  metadata: GameMetadata;
  /** Board state at the start (after deal + initial reveal, before first turn). */
  initialState: {
    boardStates: BoardSnapshot[];
    discardTop: CardSnapshot | null;
    stockRemaining: number;
  };
  /** All turns in order. */
  turns: TurnRecord[];
  /** Final results (set on finalize). */
  results: GameResults | null;
}

// ── Helpers ─────────────────────────────────────────────────

/** Create a board snapshot for a player's grid. */
export function snapshotBoard(grid: GolfGrid): BoardSnapshot {
  return {
    grid: grid.map(snapshotCard),
    faceUpCount: grid.filter((c) => c.faceUp).length,
    visibleScore: scoreVisibleCards(grid),
    totalScore: scoreGrid(grid),
  };
}

// ── TranscriptRecorder ──────────────────────────────────────

/**
 * Records a game transcript by capturing state after each turn.
 *
 * Usage:
 *   const recorder = new TranscriptRecorder(session, playerStrategies);
 *   // ... game loop ...
 *   recorder.recordTurn(turnResult, action.drawSource);
 *   // ... after game ends ...
 *   const transcript = recorder.finalize();
 */
export class TranscriptRecorder {
  private readonly transcript: GameTranscript;
  private readonly session: GolfSession;

  constructor(
    session: GolfSession,
    playerStrategies?: Array<string | undefined>,
  ) {
    this.session = session;

    const players = session.gameState.players.map((p, i) => ({
      name: p.name,
      isAI: p.isAI,
      strategy: playerStrategies?.[i],
    }));

    this.transcript = {
      version: 1,
      metadata: {
        startedAt: new Date().toISOString(),
        endedAt: '',
        players,
      },
      initialState: {
        boardStates: session.gameState.playerStates.map((ps) =>
          snapshotBoard(ps.grid),
        ),
        discardTop: session.shared.discardPile.peek()
          ? snapshotCard(session.shared.discardPile.peek()!)
          : null,
        stockRemaining: session.shared.stockPile.length,
      },
      turns: [],
      results: null,
    };
  }

  /**
   * Record a turn that was just executed.
   *
   * Call this immediately after `executeTurn()`.
   */
  recordTurn(turnResult: TurnResult, drawSource: DrawSource): void {
    const { gameState, shared } = this.session;

    const boardStates = gameState.playerStates.map((ps) =>
      snapshotBoard(ps.grid),
    );

    const discardTop = shared.discardPile.peek()
      ? snapshotCard(shared.discardPile.peek()!)
      : null;

    const record: TurnRecord = {
      turnNumber: this.transcript.turns.length,
      playerIndex: turnResult.playerIndex,
      playerName: gameState.players[turnResult.playerIndex].name,
      drawSource,
      drawnCard: snapshotCard(turnResult.drawnCard),
      move: turnResult.move,
      discardedCard: snapshotCard(turnResult.discardedCard),
      boardStates,
      discardTop,
      stockRemaining: shared.stockPile.length,
      roundEnded: turnResult.roundEnded,
    };

    this.transcript.turns.push(record);
  }

  /**
   * Finalize the transcript after the game ends.
   * Sets end timestamp and computes final results.
   *
   * @returns The complete transcript.
   */
  finalize(): GameTranscript {
    this.transcript.metadata.endedAt = new Date().toISOString();

    const scores = this.session.gameState.playerStates.map((ps) =>
      scoreGrid(ps.grid),
    );

    // Lowest score wins
    const minScore = Math.min(...scores);
    const winnerIndex = scores.indexOf(minScore);

    this.transcript.results = {
      scores,
      winnerIndex,
      winnerName: this.session.gameState.players[winnerIndex].name,
    };

    return this.transcript;
  }

  /**
   * Get the transcript in its current state (may not be finalized).
   */
  getTranscript(): GameTranscript {
    return this.transcript;
  }
}
