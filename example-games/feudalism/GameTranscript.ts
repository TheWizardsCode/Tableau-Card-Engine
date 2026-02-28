/**
 * GameTranscript.ts
 *
 * Transcript types and recorder for Feudalism.
 *
 * Records a replay-ready JSON transcript capturing every turn action,
 * patron visits, token discards, and the final game outcome.  The
 * transcript stores full board-state snapshots after each turn so that
 * the replay adapter can inject any state without reconstruction.
 *
 * Feudalism cards and patrons are already plain serializable objects
 * (readonly properties with `id`, `tier`, `cost`, `bonus`, `points`
 * etc.) so they can be snapshot directly without transformation.
 *
 * The recorder follows the engine's TranscriptRecorderBase<T> pattern.
 * Call `recordTurn()` after each completed turn (action + optional
 * discard) and `finalize()` when the game ends.
 *
 * @module
 */

import { TranscriptRecorderBase } from '../../src/core-engine/TranscriptRecorder';
import type { DevelopmentCard, PatronTile, ResourceTokens, Tier } from './FeudalismCards';
import type {
  FeudalismSession,
  FeudalismPhase,
  TurnAction,
  TurnResult,
  TokenDiscard,
} from './FeudalismGame';
import { getInfluence, getBonuses } from './FeudalismGame';

// ── Market snapshot ────────────────────────────────────────

/** Snapshot of a single market tier's visible cards and remaining deck size. */
export interface MarketTierSnapshot {
  readonly tier: Tier;
  /** Visible cards in the market (null = empty slot). */
  readonly visible: (DevelopmentCard | null)[];
  /** Number of cards remaining in the deck (don't serialize the full deck). */
  readonly deckCount: number;
}

/** Snapshot of the full market (all 3 tiers). */
export type MarketSnapshot = MarketTierSnapshot[];

/** Create a serializable snapshot of the market. */
export function snapshotMarket(session: FeudalismSession): MarketSnapshot {
  return ([1, 2, 3] as Tier[]).map((tier) => ({
    tier,
    visible: session.market[tier].visible.map((c) => (c ? { ...c } : null)),
    deckCount: session.market[tier].deck.length,
  }));
}

// ── Player state snapshot ──────────────────────────────────

/** Snapshot of a single player's state at a point in time. */
export interface PlayerSnapshot {
  readonly name: string;
  readonly isAI: boolean;
  readonly tokens: ResourceTokens;
  readonly purchasedCards: DevelopmentCard[];
  readonly reservedCards: DevelopmentCard[];
  readonly patrons: PatronTile[];
  readonly influence: number;
  readonly bonuses: Record<string, number>;
}

/** Create a serializable snapshot of a player's state. */
export function snapshotPlayer(
  player: { name: string; isAI: boolean; tokens: ResourceTokens; purchasedCards: DevelopmentCard[]; reservedCards: DevelopmentCard[]; patrons: PatronTile[] },
): PlayerSnapshot {
  // Calculate influence and bonuses using the game helpers
  const influence = getInfluence(player as Parameters<typeof getInfluence>[0]);
  const bonuses = getBonuses(player as Parameters<typeof getBonuses>[0]);

  return {
    name: player.name,
    isAI: player.isAI,
    tokens: { ...player.tokens },
    purchasedCards: player.purchasedCards.map((c) => ({ ...c })),
    reservedCards: player.reservedCards.map((c) => ({ ...c })),
    patrons: player.patrons.map((n) => ({ ...n })),
    influence,
    bonuses: { ...bonuses },
  };
}

// ── Turn record ────────────────────────────────────────────

/** Record of a single turn in a Feudalism game. */
export interface FeudalismTurnRecord {
  /** Global turn number (0-based). */
  readonly turnNumber: number;
  /** Index of the player who took this turn. */
  readonly playerIndex: number;
  /** The action that was executed. */
  readonly action: TurnAction;
  /** Patron that visited as a result of this turn, if any. */
  readonly patronVisit: PatronTile | null;
  /** Tokens discarded if the player was over the limit. */
  readonly tokenDiscard: TokenDiscard | null;
  /** Game phase after this turn. */
  readonly phase: FeudalismPhase;
  /** Whether the game ended after this turn. */
  readonly gameOver: boolean;
  /** Full player state snapshots AFTER the turn. */
  readonly playerStates: PlayerSnapshot[];
  /** Market snapshot AFTER the turn. */
  readonly market: MarketSnapshot;
  /** Token supply AFTER the turn. */
  readonly tokenSupply: ResourceTokens;
  /** Remaining patrons AFTER the turn. */
  readonly patrons: PatronTile[];
}

// ── Transcript ─────────────────────────────────────────────

/** Initial state snapshot (after setup, before first turn). */
export interface FeudalismInitialState {
  /** Player state snapshots after setup. */
  readonly playerStates: PlayerSnapshot[];
  /** Market snapshot after setup. */
  readonly market: MarketSnapshot;
  /** Token supply after setup. */
  readonly tokenSupply: ResourceTokens;
  /** Patron tiles available. */
  readonly patrons: PatronTile[];
  /** Number of players. */
  readonly playerCount: number;
}

/** Final game results. */
export interface FeudalismGameResults {
  /** Final influence per player. */
  readonly finalInfluence: number[];
  /** Final card counts per player. */
  readonly finalCardCounts: number[];
  /** Index of the winning player. */
  readonly winnerIndex: number;
  /** Name of the winning player. */
  readonly winnerName: string;
}

/** A complete Feudalism game transcript. */
export interface FeudalismTranscript {
  /** Format version. */
  readonly version: 1;
  /** Game type identifier for adapter matching. */
  readonly gameType: 'feudalism';
  /** ISO 8601 timestamp when the game started. */
  startedAt: string;
  /** ISO 8601 timestamp when the game ended (empty until finalized). */
  endedAt: string;
  /** Initial state snapshot. */
  readonly initialState: FeudalismInitialState;
  /** All turn records in chronological order. */
  readonly turns: FeudalismTurnRecord[];
  /** Final results (null until finalized). */
  results: FeudalismGameResults | null;
}

// ── Recorder ───────────────────────────────────────────────

/**
 * Records a Feudalism game transcript by capturing state after each turn.
 *
 * Usage:
 * 1. Create after `setupFeudalismGame()`.
 * 2. Call `recordTurn(action, result, tokenDiscard?)` after each
 *    completed turn (including any discard step).
 * 3. Call `finalize(winnerIndex)` when the game ends.
 */
export class FeudalismTranscriptRecorder extends TranscriptRecorderBase<FeudalismTranscript> {
  private readonly session: FeudalismSession;
  private sealed = false;
  private turnCounter = 0;

  constructor(session: FeudalismSession) {
    super({
      version: 1,
      gameType: 'feudalism',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: {
        playerStates: session.players.map(snapshotPlayer),
        market: snapshotMarket(session),
        tokenSupply: { ...session.tokenSupply },
        patrons: session.patrons.map((n) => ({ ...n })),
        playerCount: session.players.length,
      },
      turns: [],
      results: null,
    });

    this.session = session;
  }

  /**
   * Record a completed turn.
   *
   * Call after the action has been executed (and any discard resolved).
   * The session should reflect the post-turn state.
   *
   * @param playerIndex - Index of the player who took the turn.
   * @param action - The turn action that was executed.
   * @param result - The TurnResult from executeTurn().
   * @param tokenDiscard - Tokens discarded if over limit (null if none).
   */
  recordTurn(
    playerIndex: number,
    action: TurnAction,
    result: TurnResult,
    tokenDiscard: TokenDiscard | null = null,
  ): void {
    if (this.sealed) return;

    const turnRecord: FeudalismTurnRecord = {
      turnNumber: this.turnCounter++,
      playerIndex,
      action: { ...action } as TurnAction,
      patronVisit: result.patronVisit ? { ...result.patronVisit } : null,
      tokenDiscard: tokenDiscard ? { tokens: { ...tokenDiscard.tokens } } : null,
      phase: this.session.phase,
      gameOver: result.gameOver,
      playerStates: this.session.players.map(snapshotPlayer),
      market: snapshotMarket(this.session),
      tokenSupply: { ...this.session.tokenSupply },
      patrons: this.session.patrons.map((n) => ({ ...n })),
    };

    this.transcript.turns.push(turnRecord);
  }

  /**
   * Finalize the transcript and seal it.
   *
   * @param winnerIndex - Index of the winning player.
   * @returns The sealed transcript.
   */
  finalize(winnerIndex: number): FeudalismTranscript {
    if (this.sealed) return this.transcript;

    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = {
      finalInfluence: this.session.players.map((p) => getInfluence(p)),
      finalCardCounts: this.session.players.map((p) => p.purchasedCards.length),
      winnerIndex,
      winnerName: this.session.players[winnerIndex].name,
    };

    this.sealed = true;
    return this.transcript;
  }

  /** Check whether the transcript has been sealed. */
  isSealed(): boolean {
    return this.sealed;
  }
}
