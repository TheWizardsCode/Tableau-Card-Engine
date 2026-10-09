/**
 * 1916: The Rising — pure game state and phase state machine.
 *
 * This module is deliberately renderer-free. It defines the serialisable
 * {@link RisingState} record, the deterministic {@link RisingPhase} state
 * machine, and the pure timeline helpers the rules layer composes.
 *
 * Turn flow (one turn per spirit met):
 *   `idle` → `meeting` → `conversing` → `placing` → `resolved` → `idle`
 *
 * Transitions are driven by {@link RisingEvent}s through the pure
 * {@link transition} reducer. Invalid transitions are rejected with a
 * structured {@link LegalityResult} and leave the state untouched.
 *
 * @module TheRisingState
 */

import { ROSTER, seedToNumber, type Roster, type Seed } from './TheRisingContent';
import type { LegalityResult } from '@rule-engine';
import { illegalAction, legalAction } from '@rule-engine';

/** Version tag persisted alongside a serialised state. */
export const RISING_STATE_VERSION = 1;

/** The phase of a single turn. */
export type RisingPhase = 'idle' | 'meeting' | 'conversing' | 'placing' | 'resolved';

/** All phases, in turn order. */
export const RISING_PHASES: readonly RisingPhase[] = [
  'idle',
  'meeting',
  'conversing',
  'placing',
  'resolved',
];

/** Type guard for {@link RisingPhase}. */
export function isRisingPhase(value: unknown): value is RisingPhase {
  return typeof value === 'string' && (RISING_PHASES as readonly string[]).includes(value);
}

/** Difficulty presets. */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** The initial state values a difficulty preset controls. */
export interface DifficultySettings {
  /** Starting (and maximum) Memory. */
  readonly maxMemory: number;
  /** Insight required to win once the timeline is complete. */
  readonly insightTarget: number;
}

/**
 * Difficulty presets.
 *
 * The clock step (how many years the Rising clock advances per turn) is owned
 * by the clock module; these presets cover the state-level values only.
 */
export const DIFFICULTY_SETTINGS: Readonly<Record<Difficulty, DifficultySettings>> = {
  easy: { maxMemory: 12, insightTarget: 30 },
  normal: { maxMemory: 10, insightTarget: 45 },
  hard: { maxMemory: 8, insightTarget: 60 },
};

/** Type guard for {@link Difficulty}. */
export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

/** The year the Rising clock starts at. */
export const RISING_START_YEAR = 1169;

/** The year the Rising clock reaches its final chapter (the Easter Rising). */
export const RISING_FINAL_YEAR = 1916;

/** A spirit card placed on the timeline. */
export interface SpiritPlacement {
  /** The spirit's stable id. */
  readonly spiritId: string;
  /** The spirit's era chapter id. */
  readonly eraId: string;
  /** The chronological ordering key (the spirit's `dateRange.from`). */
  readonly year: number;
  /** The timeline slot the card occupies (informational; slot order is the timeline). */
  readonly slotIndex: number;
}

/** The complete, serialisable game state. */
export interface RisingState {
  /** Serialisation version. */
  readonly version: number;
  /** The current turn phase. */
  readonly phase: RisingPhase;
  /** Deterministic seed the session was created with (as an integer). */
  readonly seed: number;
  /** The chosen difficulty preset. */
  readonly difficulty: Difficulty;
  /** Remaining Memory. */
  readonly memory: number;
  /** Starting Memory (the cap). */
  readonly maxMemory: number;
  /** Accumulated Insight. */
  readonly insight: number;
  /** Insight required to win once the timeline is complete. */
  readonly insightTarget: number;
  /** The Rising clock, as a year. */
  readonly clock: number;
  /** Completed turns so far. */
  readonly turn: number;
  /** Spirit ids still offered by the Spirit Row (market). */
  readonly spiritRow: readonly string[];
  /** Spirit ids met and awaiting placement. */
  readonly hand: readonly string[];
  /** Placed spirits, oldest first. */
  readonly timeline: readonly SpiritPlacement[];
  /** Ids of every placed spirit (kept alongside {@link timeline}). */
  readonly placedSpiritIds: readonly string[];
  /** Spirit ids that must be placed to complete the timeline. */
  readonly targetSpiritIds: readonly string[];
  /** Spirit ids sent to the Clouded recovery area. */
  readonly cloudedSpiritIds: readonly string[];
  /** The spirit currently being met / conversed with / placed, if any. */
  readonly activeSpiritId: string | null;
  /** The testimony chosen this turn, if any. */
  readonly activeTestimonyIndex: number | null;
  /** The spirit placed most recently (for resolved-phase feedback), if any. */
  readonly lastPlacedSpiritId: string | null;
}

/** Options for {@link createInitialState}. */
export interface CreateInitialStateOptions {
  /** Session seed (integer or string). Defaults to `0`. */
  readonly seed?: Seed;
  /** Difficulty preset. Defaults to `normal`. */
  readonly difficulty?: Difficulty;
  /** Override the starting Memory (defaults to the preset's `maxMemory`). */
  readonly memory?: number;
  /** Override the Insight target (defaults to the preset's `insightTarget`). */
  readonly insightTarget?: number;
  /** Override the starting clock year (defaults to {@link RISING_START_YEAR}). */
  readonly clock?: number;
  /** Spirit ids offered by the row (defaults to every roster spirit). */
  readonly rowSpiritIds?: readonly string[];
  /** Spirit ids required to complete the timeline (defaults to every roster spirit). */
  readonly targetSpiritIds?: readonly string[];
  /** The roster to derive defaults from (defaults to {@link ROSTER}). */
  readonly roster?: Roster;
}

/**
 * Create a fresh, serialisable game state.
 *
 * The returned state is always in the `idle` phase. The row and the win
 * target default to the full roster so a headless session can be driven
 * without any dealing logic.
 */
export function createInitialState(options: CreateInitialStateOptions = {}): RisingState {
  const difficulty = options.difficulty ?? 'normal';
  const settings = DIFFICULTY_SETTINGS[difficulty];
  const roster = options.roster ?? ROSTER;
  const allSpiritIds = roster.spirits.map((spirit) => spirit.id);
  const rowSpiritIds = options.rowSpiritIds ?? allSpiritIds;
  const targetSpiritIds = options.targetSpiritIds ?? allSpiritIds;

  return {
    version: RISING_STATE_VERSION,
    phase: 'idle',
    seed: seedToNumber(options.seed ?? 0),
    difficulty,
    memory: options.memory ?? settings.maxMemory,
    maxMemory: settings.maxMemory,
    insight: 0,
    insightTarget: options.insightTarget ?? settings.insightTarget,
    clock: options.clock ?? RISING_START_YEAR,
    turn: 0,
    spiritRow: [...rowSpiritIds],
    hand: [],
    timeline: [],
    placedSpiritIds: [],
    targetSpiritIds: [...targetSpiritIds],
    cloudedSpiritIds: [],
    activeSpiritId: null,
    activeTestimonyIndex: null,
    lastPlacedSpiritId: null,
  };
}

// ── Pure timeline helpers ───────────────────────────────────

/**
 * Whether a timeline preserves non-decreasing chronological order.
 *
 * The timeline is ordered by each entry's `year` (a spirit's `dateRange.from`).
 * Equal years are permitted (non-decreasing order).
 */
export function isTimelineOrdered(timeline: readonly SpiritPlacement[]): boolean {
  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index - 1].year > timeline[index].year) {
      return false;
    }
  }
  return true;
}

/**
 * The canonical slot a spirit with `year` should occupy in a timeline: after
 * every already-placed entry with an earlier or equal year.
 */
export function resolvePlacementSlot(timeline: readonly SpiritPlacement[], year: number): number {
  let index = 0;
  while (index < timeline.length && timeline[index].year <= year) {
    index += 1;
  }
  return index;
}

/**
 * Whether inserting a spirit with `year` at `slotIndex` preserves the
 * timeline's non-decreasing order.
 */
export function isSlotLegal(
  timeline: readonly SpiritPlacement[],
  year: number,
  slotIndex: number,
): boolean {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > timeline.length) {
    return false;
  }
  const left = slotIndex > 0 ? timeline[slotIndex - 1] : undefined;
  if (left && left.year > year) {
    return false;
  }
  const right = slotIndex < timeline.length ? timeline[slotIndex] : undefined;
  if (right && right.year < year) {
    return false;
  }
  return true;
}

// ── State machine ───────────────────────────────────────────

/** Events that drive the phase state machine. */
export type RisingEvent =
  | { readonly type: 'meet'; readonly spiritId: string }
  | { readonly type: 'begin-conversation' }
  | { readonly type: 'choose-testimony'; readonly testimonyIndex: number }
  | { readonly type: 'place-spirit'; readonly placement: SpiritPlacement }
  | { readonly type: 'end-turn' };

/** The outcome of applying a {@link RisingEvent}. */
export interface TransitionResult {
  /** The next state (unchanged when the event is rejected). */
  readonly state: RisingState;
  /** Whether the event was accepted. */
  readonly result: LegalityResult;
}

function reject(state: RisingState, reason: string): TransitionResult {
  return { state, result: illegalAction(reason) };
}

function accept(state: RisingState): TransitionResult {
  return { state, result: legalAction() };
}

/**
 * Apply a game event to the state machine.
 *
 * Pure: never mutates `state`; returns the next state and a structured
 * {@link LegalityResult}. A rejected event returns the original state with an
 * illegal result and a human-readable reason.
 */
export function transition(state: RisingState, event: RisingEvent): TransitionResult {
  switch (event.type) {
    case 'meet': {
      if (state.phase !== 'idle') {
        return reject(state, `Cannot meet a spirit while in phase "${state.phase}".`);
      }
      if (!state.spiritRow.includes(event.spiritId)) {
        return reject(state, `Spirit "${event.spiritId}" is not available in the row.`);
      }
      if (state.hand.includes(event.spiritId)) {
        return reject(state, `Spirit "${event.spiritId}" has already been met.`);
      }
      return accept({
        ...state,
        phase: 'meeting',
        activeSpiritId: event.spiritId,
        spiritRow: state.spiritRow.filter((id) => id !== event.spiritId),
        hand: [...state.hand, event.spiritId],
      });
    }

    case 'begin-conversation': {
      if (state.phase !== 'meeting') {
        return reject(state, `Cannot converse while in phase "${state.phase}".`);
      }
      if (state.activeSpiritId === null) {
        return reject(state, 'No spirit is being met.');
      }
      return accept({ ...state, phase: 'conversing' });
    }

    case 'choose-testimony': {
      if (state.phase !== 'conversing') {
        return reject(state, `Cannot choose a testimony while in phase "${state.phase}".`);
      }
      if (state.activeSpiritId === null) {
        return reject(state, 'No spirit is being conversed with.');
      }
      if (!Number.isInteger(event.testimonyIndex) || event.testimonyIndex < 0) {
        return reject(state, `Invalid testimony index ${event.testimonyIndex}.`);
      }
      return accept({
        ...state,
        phase: 'placing',
        activeTestimonyIndex: event.testimonyIndex,
      });
    }

    case 'place-spirit': {
      if (state.phase !== 'placing') {
        return reject(state, `Cannot place a spirit while in phase "${state.phase}".`);
      }
      const { placement } = event;
      if (state.activeSpiritId !== null && state.activeSpiritId !== placement.spiritId) {
        return reject(state, `Cannot place "${placement.spiritId}" while meeting "${state.activeSpiritId}".`);
      }
      if (state.timeline.some((entry) => entry.spiritId === placement.spiritId)) {
        return reject(state, `Spirit "${placement.spiritId}" is already on the timeline.`);
      }
      if (!isSlotLegal(state.timeline, placement.year, placement.slotIndex)) {
        return reject(
          state,
          `Placing "${placement.spiritId}" at slot ${placement.slotIndex} breaks chronological order.`,
        );
      }
      const timeline = [...state.timeline];
      timeline.splice(placement.slotIndex, 0, placement);
      return accept({
        ...state,
        phase: 'resolved',
        timeline,
        placedSpiritIds: [...state.placedSpiritIds, placement.spiritId],
        hand: state.hand.filter((id) => id !== placement.spiritId),
        lastPlacedSpiritId: placement.spiritId,
      });
    }

    case 'end-turn': {
      if (state.phase !== 'resolved') {
        return reject(state, `Cannot end a turn while in phase "${state.phase}".`);
      }
      return accept({
        ...state,
        phase: 'idle',
        turn: state.turn + 1,
        activeSpiritId: null,
        activeTestimonyIndex: null,
        lastPlacedSpiritId: null,
      });
    }

    default:
      return reject(state, 'Unknown event.');
  }
}

// ── Serialisation ───────────────────────────────────────────

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSpiritPlacement(value: unknown): value is SpiritPlacement {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const placement = value as Record<string, unknown>;
  return (
    typeof placement.spiritId === 'string' &&
    typeof placement.eraId === 'string' &&
    typeof placement.year === 'number' &&
    typeof placement.slotIndex === 'number'
  );
}

/** Structural type guard for a deserialised {@link RisingState}. */
export function isRisingState(value: unknown): value is RisingState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    typeof state.version === 'number' &&
    isRisingPhase(state.phase) &&
    typeof state.seed === 'number' &&
    isDifficulty(state.difficulty) &&
    typeof state.memory === 'number' &&
    typeof state.maxMemory === 'number' &&
    typeof state.insight === 'number' &&
    typeof state.insightTarget === 'number' &&
    typeof state.clock === 'number' &&
    typeof state.turn === 'number' &&
    isStringArray(state.spiritRow) &&
    isStringArray(state.hand) &&
    Array.isArray(state.timeline) &&
    state.timeline.every(isSpiritPlacement) &&
    isStringArray(state.placedSpiritIds) &&
    isStringArray(state.targetSpiritIds) &&
    isStringArray(state.cloudedSpiritIds) &&
    (state.activeSpiritId === null || typeof state.activeSpiritId === 'string') &&
    (state.activeTestimonyIndex === null || typeof state.activeTestimonyIndex === 'number') &&
    (state.lastPlacedSpiritId === null || typeof state.lastPlacedSpiritId === 'string')
  );
}

/** Serialise a state to a JSON string. */
export function serializeRisingState(state: RisingState): string {
  return JSON.stringify(state);
}

/**
 * Parse a serialised state.
 *
 * @throws {Error} When the payload is not valid JSON or fails the structural
 *   {@link isRisingState} guard.
 */
export function deserializeRisingState(serialized: string): RisingState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Invalid Rising state: not valid JSON.');
  }
  if (!isRisingState(parsed)) {
    throw new Error('Invalid Rising state: structure does not match RisingState.');
  }
  return parsed;
}
