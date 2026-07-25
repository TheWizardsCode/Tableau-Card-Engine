/**
 * GameTranscript.ts
 *
 * Transcript types and recorder for Sushi Go!
 *
 * Records a replay-ready JSON transcript capturing every simultaneous
 * pick (turn) within each round, round-scoring results, and the final
 * game outcome.  The transcript stores full board-state snapshots after
 * each turn so that the replay adapter can inject any state without
 * reconstruction.
 *
 * Unlike standard playing-card games, Sushi Go! uses a discriminated
 * union of custom card types (tempura, sashimi, maki, etc.) so the
 * card snapshot preserves the `type` field and type-specific properties
 * (e.g. `icons` for maki, `variant` for nigiri).
 *
 * The recorder follows the engine's TranscriptRecorderBase<T> pattern.
 * Call `recordTurn()` after each `executeAllPicks()`, `recordRoundResult()`
 * after each `scoreRound()`, and `finalize()` when the game ends.
 *
 * @module
 */

import { TranscriptRecorderBase } from '../../src/core-engine/transcript';
import type { SushiGoCard } from './SushiGoCards';
import type { SushiGoSession, PickAction, RoundResult } from './SushiGoGame';

// ── Card snapshot ──────────────────────────────────────────

/**
 * Serializable snapshot of a Sushi Go! card.
 *
 * Preserves the discriminated union's `type` field and any
 * type-specific properties so the card can be fully reconstructed
 * for display or scoring.
 */
export interface SushiGoCardSnapshot {
  readonly id: number;
  readonly type: string;
  /** Maki roll icon count (1, 2, or 3). Present only for maki cards. */
  readonly icons?: 1 | 2 | 3;
  /** Nigiri variant. Present only for nigiri cards. */
  readonly variant?: string;
}

/** Create a serializable snapshot of a SushiGoCard. */
export function snapshotCard(card: SushiGoCard): SushiGoCardSnapshot {
  const snap: SushiGoCardSnapshot = { id: card.id, type: card.type };
  if (card.type === 'maki') {
    (snap as { icons: number }).icons = card.icons;
  }
  if (card.type === 'nigiri') {
    (snap as { variant: string }).variant = card.variant;
  }
  return snap;
}

// ── Player state snapshot ──────────────────────────────────

/** Snapshot of a single player's state at a point in time. */
export interface PlayerSnapshot {
  readonly name: string;
  readonly isAI: boolean;
  readonly hand: SushiGoCardSnapshot[];
  readonly tableau: SushiGoCardSnapshot[];
  readonly puddingCount: number;
  readonly roundScores: number[];
  readonly totalScore: number;
}

/** Create a serializable snapshot of a player's state. */
export function snapshotPlayer(
  player: { name: string; isAI: boolean; hand: SushiGoCard[]; tableau: SushiGoCard[]; puddingCount: number; roundScores: number[]; totalScore: number },
): PlayerSnapshot {
  return {
    name: player.name,
    isAI: player.isAI,
    hand: player.hand.map(snapshotCard),
    tableau: player.tableau.map(snapshotCard),
    puddingCount: player.puddingCount,
    roundScores: [...player.roundScores],
    totalScore: player.totalScore,
  };
}

// ── Turn record ────────────────────────────────────────────

/** Record of a single simultaneous-pick turn. */
export interface SushiGoTurnRecord {
  /** Turn number within the round (0-based). */
  readonly turnInRound: number;
  /** Round number (0-based). */
  readonly round: number;
  /** Global turn number across all rounds (0-based). */
  readonly globalTurn: number;
  /** Pick actions for each player (index = player index). */
  readonly picks: PickAction[];
  /** Full player state snapshots AFTER the picks. */
  readonly playerStates: PlayerSnapshot[];
}

// ── Transcript ─────────────────────────────────────────────

/** Initial state snapshot (after deal, before first pick). */
export interface SushiGoInitialState {
  /** Player state snapshots after initial deal. */
  readonly playerStates: PlayerSnapshot[];
  /** Current round (always 0 at start). */
  readonly currentRound: number;
  /** Cards per player for this game. */
  readonly cardsPerPlayer: number;
}

/** Final game results. */
export interface SushiGoGameResults {
  /** Final scores per player. */
  readonly finalScores: number[];
  /** Index of the winning player (highest score). */
  readonly winnerIndex: number;
  /** Name of the winning player. */
  readonly winnerName: string;
  /** Round-by-round scores per player. */
  readonly roundScores: number[][];
}

/** A complete Sushi Go! game transcript. */
export interface SushiGoTranscript {
  /** Format version. */
  readonly version: 1;
  /** Game type identifier for adapter matching. */
  readonly gameType: 'sushi-go';
  /** ISO 8601 timestamp when the game started. */
  startedAt: string;
  /** ISO 8601 timestamp when the game ended (empty until finalized). */
  endedAt: string;
  /** Initial state snapshot. */
  readonly initialState: SushiGoInitialState;
  /** All turn records in chronological order. */
  readonly turns: SushiGoTurnRecord[];
  /** Round results, indexed by round number. */
  readonly roundResults: RoundResult[];
  /** Final results (null until finalized). */
  results: SushiGoGameResults | null;
}

// ── Recorder ───────────────────────────────────────────────

/**
 * Records a Sushi Go! game transcript by capturing state after each
 * simultaneous pick.
 *
 * Usage:
 * 1. Create after `setupSushiGoGame()`.
 * 2. Call `recordTurn(picks)` after each `executeAllPicks()`.
 * 3. Call `recordRoundResult(result)` after each `scoreRound()`.
 * 4. Call `finalize()` when the game ends.
 */
export class SushiGoTranscriptRecorder extends TranscriptRecorderBase<SushiGoTranscript> {
  private readonly session: SushiGoSession;
  private sealed = false;
  private globalTurnCounter = 0;

  constructor(session: SushiGoSession) {
    super({
      version: 1,
      gameType: 'sushi-go',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: {
        playerStates: session.players.map(snapshotPlayer),
        currentRound: session.currentRound,
        cardsPerPlayer: session.cardsPerPlayer,
      },
      turns: [],
      roundResults: [],
      results: null,
    });

    this.session = session;
  }

  /**
   * Record a turn that was just executed.
   *
   * Call immediately after `executeAllPicks()`.
   *
   * @param picks - The pick actions that were applied.
   */
  recordTurn(picks: PickAction[]): void {
    if (this.sealed) return;

    const turnRecord: SushiGoTurnRecord = {
      turnInRound: this.session.currentTurn - 1, // currentTurn was incremented by executeAllPicks
      round: this.session.currentRound,
      globalTurn: this.globalTurnCounter++,
      picks: picks.map((p) => ({ ...p })),
      playerStates: this.session.players.map(snapshotPlayer),
    };

    this.transcript.turns.push(turnRecord);
  }

  /**
   * Record a round scoring result.
   *
   * Call immediately after `scoreRound()`.
   *
   * @param result - The round result from `scoreRound()`.
   */
  recordRoundResult(result: RoundResult): void {
    if (this.sealed) return;
    this.transcript.roundResults.push(result);
  }

  /**
   * Finalize the transcript and seal it.
   *
   * @param winnerIndex - Index of the winning player.
   * @returns The sealed transcript.
   */
  finalize(winnerIndex: number): SushiGoTranscript {
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
