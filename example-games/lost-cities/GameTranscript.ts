/**
 * Game transcript types and recorder for Lost Cities.
 *
 * Records a replay-ready JSON transcript capturing all 3 rounds,
 * turns (both phases), actions, and board states for debugging,
 * regression testing, and the Visual Replay Dev Tool.
 *
 * The recorder hooks into the game loop: call `recordAction()`
 * after each `executeAction()`, and `finalize()` after the match ends.
 *
 * Lost Cities specifics vs. Golf:
 *  - Multi-round match (3 rounds per match)
 *  - Two-phase turns (PlayOrDiscard then Draw)
 *  - Per-color expedition lanes instead of grids
 *  - Per-expedition score breakdowns
 */

import type {
  LostCitiesCard,
  ExpeditionColor,
} from './LostCitiesCards';
import { EXPEDITION_COLORS } from './LostCitiesCards';
import type {
  LostCitiesSession,
  RoundScoreResult,
  TurnResult,
  PlayerId,
} from './LostCitiesGame';
import type {
  LostCitiesAction,
} from './LostCitiesRules';
import { TranscriptRecorderBase } from '../../src/core-engine/TranscriptRecorder';

// ── Card snapshot ──────────────────────────────────────────

/**
 * Serializable snapshot of a Lost Cities card.
 *
 * Uses the card's own properties rather than the engine's
 * CardSnapshot (which assumes rank/suit from standard decks).
 */
export interface LCCardSnapshot {
  /** Unique card ID within the deck. */
  id: number;
  /** Expedition color. */
  color: ExpeditionColor;
  /** Card type: 'investment' or 'numbered'. */
  type: 'investment' | 'numbered';
  /** Rank (2-10) for numbered cards, or investment index (1-3). */
  rank: number;
  /** Whether the card is face-up. */
  faceUp: boolean;
}

/** Create a serializable snapshot of a Lost Cities card. */
export function snapshotLCCard(card: LostCitiesCard): LCCardSnapshot {
  return {
    id: card.id,
    color: card.color,
    type: card.type,
    rank: card.type === 'numbered' ? card.rank : card.investmentIndex,
    faceUp: card.faceUp,
  };
}

// ── Board snapshot ─────────────────────────────────────────

/** Snapshot of a single player's board state. */
export interface PlayerBoardSnapshot {
  /** Cards in hand (visible only to the player). */
  hand: LCCardSnapshot[];
  /** Expedition lanes: cards played per color (in play order). */
  expeditions: Record<string, LCCardSnapshot[]>;
}

/** Snapshot of the shared table state. */
export interface TableSnapshot {
  /** Discard pile top card per color (null if empty). */
  discardTops: Record<string, LCCardSnapshot | null>;
  /** Number of cards remaining in the draw pile. */
  drawPileSize: number;
}

/** Create a player board snapshot from session state. */
function snapshotPlayerBoard(
  hand: LostCitiesCard[],
  expeditions: Map<ExpeditionColor, LostCitiesCard[]>,
): PlayerBoardSnapshot {
  const expSnapshot: Record<string, LCCardSnapshot[]> = {};
  for (const color of EXPEDITION_COLORS) {
    expSnapshot[color] = (expeditions.get(color) ?? []).map(snapshotLCCard);
  }
  return {
    hand: hand.map(snapshotLCCard),
    expeditions: expSnapshot,
  };
}

/** Create a table snapshot from session state. */
function snapshotTable(session: LostCitiesSession): TableSnapshot {
  const discardTops: Record<string, LCCardSnapshot | null> = {};
  for (const color of EXPEDITION_COLORS) {
    const pile = session.round.discardPiles.get(color)!;
    discardTops[color] = pile.length > 0
      ? snapshotLCCard(pile[pile.length - 1])
      : null;
  }
  return {
    discardTops,
    drawPileSize: session.round.drawPile.length,
  };
}

// ── Action snapshot ────────────────────────────────────────

/** Serializable record of an action taken during a turn. */
export interface ActionRecord {
  /** Action kind. */
  kind: string;
  /** The card involved (played, discarded, or drawn). */
  card?: LCCardSnapshot;
  /** The expedition color (for play-to-expedition, discard, draw-from-discard). */
  color?: string;
}

function snapshotAction(action: LostCitiesAction): ActionRecord {
  const record: ActionRecord = { kind: action.kind };
  if (action.kind === 'play-to-expedition' || action.kind === 'discard') {
    record.card = snapshotLCCard(action.card);
    record.color = action.color;
  } else if (action.kind === 'draw-from-discard') {
    record.color = action.color;
  }
  // draw-from-pile: no extra fields needed
  return record;
}

// ── Turn record ────────────────────────────────────────────

/** Record of a single action within a turn (Phase 1 or Phase 2). */
export interface TurnActionRecord {
  /** Sequential action number within the round (0-based). */
  actionNumber: number;
  /** Player who acted (0 or 1). */
  playerIndex: PlayerId;
  /** Player name. */
  playerName: string;
  /** Turn phase when the action was taken. */
  phase: 'PlayOrDiscard' | 'Draw';
  /** The action that was taken. */
  action: ActionRecord;
  /** Board state of both players AFTER the action. */
  boardStates: [PlayerBoardSnapshot, PlayerBoardSnapshot];
  /** Table state AFTER the action. */
  tableState: TableSnapshot;
  /** Whether the round ended after this action. */
  roundEnded: boolean;
  /** Whether the match ended after this action. */
  matchEnded: boolean;
}

// ── Round record ───────────────────────────────────────────

/** Record of a complete round. */
export interface RoundRecord {
  /** Round number (1-based). */
  roundNumber: number;
  /** All actions in this round, in order. */
  actions: TurnActionRecord[];
  /** Score result for this round (set when round completes). */
  scores: RoundScoreResult | null;
}

// ── Match transcript ───────────────────────────────────────

/** Metadata about the match. */
export interface MatchMetadata {
  /** ISO 8601 timestamp of match start. */
  startedAt: string;
  /** ISO 8601 timestamp of match end (set on finalize). */
  endedAt: string;
  /** Player info. */
  players: Array<{
    name: string;
    isAI: boolean;
    strategy?: string;
  }>;
}

/** Final match results. */
export interface MatchResults {
  /** Per-round score totals. */
  roundTotals: [number, number][];
  /** Cumulative final scores. */
  finalScores: [number, number];
  /** Index of the winning player (highest score), or null for tie. */
  winnerIndex: PlayerId | null;
  /** Name of the winning player, or 'Tie' for tie. */
  winnerName: string;
}

/** A complete Lost Cities match transcript. */
export interface LostCitiesTranscript {
  /** Format version. */
  version: 1;
  /** Game identifier for the replay system. */
  gameType: 'lost-cities';
  /** Match metadata. */
  metadata: MatchMetadata;
  /** Initial state of round 1 (after deal, before first action). */
  initialState: {
    boardStates: [PlayerBoardSnapshot, PlayerBoardSnapshot];
    tableState: TableSnapshot;
  };
  /** All rounds in order. */
  rounds: RoundRecord[];
  /** Final match results (set on finalize). */
  results: MatchResults | null;
}

// ── TranscriptRecorder ─────────────────────────────────────

/**
 * Records a Lost Cities match transcript by capturing state
 * after each action.
 *
 * Usage:
 *   const recorder = new LCTranscriptRecorder(session, strategies);
 *   // after each executeAction():
 *   recorder.recordAction(session, turnResult, originalAction, phase);
 *   // after match ends:
 *   const transcript = recorder.finalize(session);
 */
export class LCTranscriptRecorder extends TranscriptRecorderBase<LostCitiesTranscript> {
  private currentRound: RoundRecord;
  private actionCounter = 0;

  constructor(
    session: LostCitiesSession,
    playerStrategies?: Array<string | undefined>,
  ) {
    const players = session.players.map((p, i) => ({
      name: p.name,
      isAI: p.isAI,
      strategy: playerStrategies?.[i],
    }));

    super({
      version: 1,
      gameType: 'lost-cities',
      metadata: {
        startedAt: new Date().toISOString(),
        endedAt: '',
        players,
      },
      initialState: {
        boardStates: [
          snapshotPlayerBoard(session.players[0].hand, session.players[0].expeditions),
          snapshotPlayerBoard(session.players[1].hand, session.players[1].expeditions),
        ],
        tableState: snapshotTable(session),
      },
      rounds: [],
      results: null,
    });

    this.currentRound = {
      roundNumber: 1,
      actions: [],
      scores: null,
    };
  }

  /**
   * Record an action that was just executed.
   *
   * Call this immediately after `executeAction()`.
   *
   * @param session - The session AFTER the action was applied
   * @param turnResult - The result returned by executeAction
   * @param action - The original action that was passed to executeAction
   * @param phase - The turn phase BEFORE the action was executed
   */
  recordAction(
    session: LostCitiesSession,
    turnResult: TurnResult,
    action: LostCitiesAction,
    phase: 'PlayOrDiscard' | 'Draw',
  ): void {
    // Determine player index from the action context.
    // After Phase 1, session is still on the same player (moved to Draw).
    // After Phase 2, session has moved to the next player or a new round.
    // We derive the acting player from the turnResult's action context.
    // Since the session may have advanced, we need to track it ourselves.
    const playerIndex = this.inferPlayerIndex(session, phase, turnResult);

    const record: TurnActionRecord = {
      actionNumber: this.actionCounter++,
      playerIndex,
      playerName: session.players[playerIndex].name,
      phase,
      action: snapshotAction(action),
      boardStates: [
        snapshotPlayerBoard(session.players[0].hand, session.players[0].expeditions),
        snapshotPlayerBoard(session.players[1].hand, session.players[1].expeditions),
      ],
      tableState: snapshotTable(session),
      roundEnded: turnResult.roundEnded,
      matchEnded: turnResult.matchEnded,
    };

    this.currentRound.actions.push(record);

    if (turnResult.roundEnded) {
      this.currentRound.scores = turnResult.roundScore;
      this.transcript.rounds.push(this.currentRound);

      if (!turnResult.matchEnded) {
        // Prepare for next round
        this.actionCounter = 0;
        this.currentRound = {
          roundNumber: this.transcript.rounds.length + 1,
          actions: [],
          scores: null,
        };
      }
    }
  }

  /**
   * Infer which player acted based on the phase and session state.
   *
   * After Phase 1 (PlayOrDiscard), the session is still on the same
   * player (now in Draw phase). After Phase 2 (Draw), the session has
   * advanced to the next player (or a new round started).
   */
  private inferPlayerIndex(
    session: LostCitiesSession,
    phase: 'PlayOrDiscard' | 'Draw',
    turnResult: TurnResult,
  ): PlayerId {
    if (phase === 'PlayOrDiscard') {
      // After Phase 1, session.round.currentPlayer is still the same
      return session.round.currentPlayer;
    }
    // After Phase 2 (Draw), the current player has advanced
    if (turnResult.roundEnded) {
      // Round ended — the acting player was the one who drew the last card.
      // After round end, the session may have started a new round with
      // a different starting player. We use the last action's player
      // from Phase 1 of this turn.
      const actions = this.currentRound.actions;
      for (let i = actions.length - 1; i >= 0; i--) {
        if (actions[i].phase === 'PlayOrDiscard') {
          return actions[i].playerIndex;
        }
      }
      return 0;
    }
    // Normal case: session has advanced to the next player
    return session.round.currentPlayer === 0 ? 1 : 0;
  }

  /**
   * Finalize the transcript after the match ends.
   *
   * @param session - The session after the match ended
   * @returns The complete transcript
   */
  finalize(session: LostCitiesSession): LostCitiesTranscript {
    this.transcript.metadata.endedAt = new Date().toISOString();

    const [s0, s1] = session.cumulativeScores;
    const roundTotals = session.roundScores.map(
      rs => rs.totals as [number, number],
    );

    let winnerIndex: PlayerId | null = null;
    let winnerName = 'Tie';
    if (s0 > s1) {
      winnerIndex = 0;
      winnerName = session.players[0].name;
    } else if (s1 > s0) {
      winnerIndex = 1;
      winnerName = session.players[1].name;
    }

    this.transcript.results = {
      roundTotals,
      finalScores: [s0, s1],
      winnerIndex,
      winnerName,
    };

    return this.transcript;
  }

}
