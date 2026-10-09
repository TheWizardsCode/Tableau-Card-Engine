/**
 * 1916: The Rising — transcript recording.
 *
 * Extends the shared {@link TranscriptRecorderBase} with The Rising's event
 * vocabulary so a session can be replayed, debugged or validated headlessly.
 * Every significant action is recorded as a structured, JSON-serialisable
 * event:
 *
 *   - `spirit-met` — a Spirit Row card was met (Memory spent);
 *   - `question-chosen` — a conversation question / testimony was chosen;
 *   - `placement-attempted` — a timeline placement was attempted (legal or
 *     illegal, with the rejection reason when illegal);
 *   - `insight-awarded` — Insight was awarded for a placement;
 *   - `clock-advanced` — the Rising clock advanced one decade-band;
 *   - `game-end` — the session was won or lost.
 *
 * The recorder is renderer-free and deterministic, so it can be exercised in
 * Node. When a {@link TranscriptStore} is attached the transcript is
 * auto-saved (via {@link autoSaveTranscript}) on every recorded key event.
 *
 * @module src/TheRisingTranscript
 */

import {
  TranscriptRecorderBase,
  autoSaveTranscript,
  type BaseTranscript,
  type TranscriptStore,
} from '@core-engine/transcript';
import type { Difficulty, RisingState } from './TheRisingState';
import type { RisingOutcome, RisingOutcomeReason } from './TheRisingRules';

/** The game-type identifier used for transcripts and save games. */
export const THERISING_GAME_TYPE = 'the-rising';

/** The transcript format version. */
export const THERISING_TRANSCRIPT_VERSION = 1;

/** The board snapshot captured before any action (the transcript's initial state). */
export interface RisingTranscriptSnapshot {
  /** The session seed. */
  readonly seed: number;
  /** The chosen difficulty preset. */
  readonly difficulty: Difficulty;
  /** Starting Memory. */
  readonly memory: number;
  /** Starting (and maximum) Memory. */
  readonly maxMemory: number;
  /** Insight required to win. */
  readonly insightTarget: number;
  /** The starting clock year. */
  readonly clock: number;
  /** Spirit ids required to complete the timeline. */
  readonly targetSpiritIds: readonly string[];
}

/** A spirit was met from the Spirit Row. */
export interface RisingSpiritMetEvent {
  readonly type: 'spirit-met';
  readonly turn: number;
  readonly spiritId: string;
  readonly spiritName: string;
  readonly memoryCost: number;
  readonly memoryRemaining: number;
}

/** A conversation question (testimony) was chosen. */
export interface RisingQuestionChosenEvent {
  readonly type: 'question-chosen';
  readonly turn: number;
  readonly spiritId: string;
  readonly optionIndex: number;
  readonly testimonyIndex: number;
  readonly question: string;
  readonly insightAwarded: number;
}

/** A timeline placement was attempted. */
export interface RisingPlacementAttemptedEvent {
  readonly type: 'placement-attempted';
  readonly turn: number;
  readonly spiritId: string;
  readonly slotIndex: number;
  readonly legal: boolean;
  /** The rejection reason when the placement was illegal. */
  readonly reason?: string;
}

/** Insight was awarded for a placement. */
export interface RisingInsightAwardedEvent {
  readonly type: 'insight-awarded';
  readonly turn: number;
  readonly spiritId: string;
  readonly base: number;
  readonly eraBonus: number;
  readonly total: number;
  /** The running Insight total after the award. */
  readonly insightTotal: number;
  readonly completedEraId: string | null;
}

/** The Rising clock advanced one decade-band. */
export interface RisingClockAdvancedEvent {
  readonly type: 'clock-advanced';
  readonly turn: number;
  readonly previousYear: number;
  readonly newYear: number;
  readonly step: number;
}

/** The session ended (win or loss). */
export interface RisingGameEndEvent {
  readonly type: 'game-end';
  readonly turn: number;
  readonly outcome: RisingOutcome;
  readonly reason: RisingOutcomeReason | null;
  readonly insight: number;
  readonly insightTarget: number;
  readonly memory: number;
  readonly clock: number;
}

/** Every event The Rising records. */
export type TheRisingTranscriptEvent =
  | RisingSpiritMetEvent
  | RisingQuestionChosenEvent
  | RisingPlacementAttemptedEvent
  | RisingInsightAwardedEvent
  | RisingClockAdvancedEvent
  | RisingGameEndEvent;

/** The final result recorded when the transcript is finalized. */
export interface RisingTranscriptResult {
  readonly outcome: RisingOutcome;
  readonly reason: RisingOutcomeReason | null;
  readonly insight: number;
  readonly insightTarget: number;
  readonly memory: number;
  readonly clock: number;
  readonly turn: number;
  readonly spiritsPlaced: number;
  readonly spiritsTargeted: number;
}

/** The Rising's concrete transcript shape. */
export interface TheRisingTranscript
  extends BaseTranscript<RisingTranscriptSnapshot, TheRisingTranscriptEvent, RisingTranscriptResult> {}

/** Snapshot the serialisable fields of a state for the transcript's initial board. */
export function snapshotRisingState(state: RisingState): RisingTranscriptSnapshot {
  return {
    seed: state.seed,
    difficulty: state.difficulty,
    memory: state.memory,
    maxMemory: state.maxMemory,
    insightTarget: state.insightTarget,
    clock: state.clock,
    targetSpiritIds: [...state.targetSpiritIds],
  };
}

/** The outcome evaluation shape accepted by {@link TheRisingTranscriptRecorder.recordGameEnd}. */
export interface RisingOutcomeEvaluation {
  readonly outcome: RisingOutcome;
  readonly reason: RisingOutcomeReason | null;
}

/**
 * Records a The Rising session's events.
 *
 * The recorder owns a mutable transcript object (the base class's protected
 * field) and exposes typed `record*` helpers. Attach a {@link TranscriptStore}
 * with {@link attachAutoSave} to persist the transcript on every key event — a
 * completed turn (`clock-advanced`) and the finalized game end.
 */
export class TheRisingTranscriptRecorder extends TranscriptRecorderBase<TheRisingTranscript> {
  /** Event types that trigger an auto-save (the significant milestones). */
  private static readonly AUTO_SAVE_EVENT_TYPES: ReadonlySet<TheRisingTranscriptEvent['type']> =
    new Set<TheRisingTranscriptEvent['type']>(['clock-advanced']);

  private store: TranscriptStore | null = null;
  private storeGameType: string = THERISING_GAME_TYPE;
  private autoSaveEnabled = true;

  constructor(initialState: RisingState) {
    super({
      version: THERISING_TRANSCRIPT_VERSION,
      gameType: THERISING_GAME_TYPE,
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: snapshotRisingState(initialState),
      events: [],
      results: null,
    });
  }

  /**
   * Attach a {@link TranscriptStore} so the transcript is auto-saved on every
   * recorded key event (via {@link autoSaveTranscript}).
   *
   * Passing `null` detaches auto-save.
   */
  attachAutoSave(store: TranscriptStore | null, gameType: string = THERISING_GAME_TYPE): void {
    this.store = store;
    this.storeGameType = gameType;
  }

  /** Enable or disable auto-save without detaching the store. */
  setAutoSaveEnabled(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /** Append a raw event, auto-saving when it is a key milestone. */
  recordEvent(event: TheRisingTranscriptEvent): TheRisingTranscriptEvent {
    this.transcript.events.push(event);
    if (TheRisingTranscriptRecorder.AUTO_SAVE_EVENT_TYPES.has(event.type)) {
      this.persistIfEnabled();
    }
    return event;
  }

  /** Record that a spirit was met (Memory spent). */
  recordSpiritMet(
    turn: number,
    spiritId: string,
    spiritName: string,
    memoryCost: number,
    memoryRemaining: number,
  ): RisingSpiritMetEvent {
    return this.recordEvent({
      type: 'spirit-met',
      turn,
      spiritId,
      spiritName,
      memoryCost,
      memoryRemaining,
    }) as RisingSpiritMetEvent;
  }

  /** Record that a conversation question / testimony was chosen. */
  recordQuestionChosen(
    turn: number,
    spiritId: string,
    optionIndex: number,
    testimonyIndex: number,
    question: string,
    insightAwarded: number,
  ): RisingQuestionChosenEvent {
    return this.recordEvent({
      type: 'question-chosen',
      turn,
      spiritId,
      optionIndex,
      testimonyIndex,
      question,
      insightAwarded,
    }) as RisingQuestionChosenEvent;
  }

  /** Record a placement attempt (legal or illegal). */
  recordPlacementAttempted(
    turn: number,
    spiritId: string,
    slotIndex: number,
    legal: boolean,
    reason?: string,
  ): RisingPlacementAttemptedEvent {
    const event: RisingPlacementAttemptedEvent = {
      type: 'placement-attempted',
      turn,
      spiritId,
      slotIndex,
      legal,
      ...(reason ? { reason } : {}),
    };
    return this.recordEvent(event) as RisingPlacementAttemptedEvent;
  }

  /** Record an Insight award for a placement. */
  recordInsightAwarded(
    turn: number,
    spiritId: string,
    base: number,
    eraBonus: number,
    total: number,
    insightTotal: number,
    completedEraId: string | null,
  ): RisingInsightAwardedEvent {
    return this.recordEvent({
      type: 'insight-awarded',
      turn,
      spiritId,
      base,
      eraBonus,
      total,
      insightTotal,
      completedEraId,
    }) as RisingInsightAwardedEvent;
  }

  /** Record a clock advance. */
  recordClockAdvanced(
    turn: number,
    previousYear: number,
    newYear: number,
    step: number,
  ): RisingClockAdvancedEvent {
    return this.recordEvent({
      type: 'clock-advanced',
      turn,
      previousYear,
      newYear,
      step,
    }) as RisingClockAdvancedEvent;
  }

  /** Record the session's end (win or loss). */
  recordGameEnd(state: RisingState, evaluation: RisingOutcomeEvaluation): RisingGameEndEvent {
    return this.recordEvent({
      type: 'game-end',
      turn: state.turn,
      outcome: evaluation.outcome,
      reason: evaluation.reason,
      insight: state.insight,
      insightTarget: state.insightTarget,
      memory: state.memory,
      clock: state.clock,
    }) as RisingGameEndEvent;
  }

  /**
   * Finalize the transcript: stamp the end time and record the result.
   *
   * Auto-saves one last time so the finalized transcript is persisted.
   */
  finalize(result: RisingTranscriptResult): TheRisingTranscript {
    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = result;
    this.persistIfEnabled();
    return this.getTranscript();
  }

  /** Build the finalized result record for a state and outcome evaluation. */
  buildResult(state: RisingState, evaluation: RisingOutcomeEvaluation): RisingTranscriptResult {
    return {
      outcome: evaluation.outcome,
      reason: evaluation.reason,
      insight: state.insight,
      insightTarget: state.insightTarget,
      memory: state.memory,
      clock: state.clock,
      turn: state.turn,
      spiritsPlaced: state.timeline.length,
      spiritsTargeted: state.targetSpiritIds.length,
    };
  }

  private persistIfEnabled(): void {
    if (!this.autoSaveEnabled || !this.store) return;
    autoSaveTranscript(this.store, this.storeGameType, this.getTranscript());
  }
}
