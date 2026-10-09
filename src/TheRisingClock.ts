/**
 * 1916: The Rising — the Rising clock.
 *
 * The clock is a pure, renderer-free year counter. It starts at
 * {@link RISING_START_YEAR} (1169) and is clamped at
 * {@link RISING_FINAL_YEAR} (1916). After each completed turn it advances one
 * **decade-band** — a fixed number of years — so the player is always racing
 * the clock while they reconstruct the timeline. When the clock reaches 1916
 * with the timeline incomplete, the session is lost (evaluated by
 * {@link ./TheRisingRules}).
 *
 * The band width is derived from the difficulty preset so that each preset
 * reaches 1916 on its last affordable meet:
 *
 *   band = ceil(747 / (maxMemory / meetCost))
 *
 * giving easy `63`, normal `75` and hard `94` years per band with the default
 * one-Memory meet cost. A larger band therefore means a faster clock. Callers
 * may override the band explicitly for tuning and tests.
 *
 * @module TheRisingClock
 */

import { legalAction, type LegalityResult } from '@rule-engine';
import { SPIRIT_MEET_MEMORY_COST } from './TheRisingEconomy';
import {
  DIFFICULTY_SETTINGS,
  RISING_FINAL_YEAR,
  RISING_START_YEAR,
  transition,
  type Difficulty,
  type RisingState,
} from './TheRisingState';

/** The full span of the Rising clock, in years. */
export const RISING_CLOCK_SPAN_YEARS = RISING_FINAL_YEAR - RISING_START_YEAR;

/**
 * The default number of years one decade-band advances the clock.
 *
 * Derived from the `normal` preset so the band is meaningful when no explicit
 * step or difficulty is consulted.
 */
export const DEFAULT_CLOCK_BAND_YEARS = Math.max(
  1,
  Math.ceil(RISING_CLOCK_SPAN_YEARS / DIFFICULTY_SETTINGS.normal.maxMemory),
);

/** Options accepted by the clock helpers. */
export interface ClockOptions {
  /** Explicit band width in years, overriding the difficulty-derived band. */
  readonly step?: number;
}

/**
 * The number of years one decade-band advances the clock for a difficulty.
 *
 * @param difficulty The difficulty preset.
 * @param meetCost   The Memory cost of one meet (defaults to one).
 */
export function clockBandYearsForDifficulty(
  difficulty: Difficulty,
  meetCost: number = SPIRIT_MEET_MEMORY_COST,
): number {
  const cost = Number.isFinite(meetCost) && meetCost > 0 ? meetCost : 1;
  const maxMeets = Math.max(1, Math.floor(DIFFICULTY_SETTINGS[difficulty].maxMemory / cost));
  return Math.max(1, Math.ceil(RISING_CLOCK_SPAN_YEARS / maxMeets));
}

/** The band width (in years) that applies to a state. */
export function clockBandYears(state: RisingState, options: ClockOptions = {}): number {
  return options.step ?? clockBandYearsForDifficulty(state.difficulty);
}

/** The outcome of advancing the clock. */
export interface ClockAdvanceResult {
  /** The next state (with the advanced clock). */
  readonly state: RisingState;
  /** The clock before the advance. */
  readonly previousYear: number;
  /** The clock after the advance (clamped at {@link RISING_FINAL_YEAR}). */
  readonly newYear: number;
  /** The band width applied, in years. */
  readonly step: number;
  /** Whether the clock moved. */
  readonly advanced: boolean;
  /** Whether the clock has reached {@link RISING_FINAL_YEAR}. */
  readonly expired: boolean;
}

/**
 * Advance the clock one decade-band.
 *
 * Pure: returns a new state and never mutates the supplied one. The clock is
 * clamped at {@link RISING_FINAL_YEAR}, so advancing from the final year is a
 * no-op.
 */
export function advanceClock(state: RisingState, options: ClockOptions = {}): ClockAdvanceResult {
  const step = Math.max(1, Math.trunc(clockBandYears(state, options)));
  const previousYear = state.clock;
  const newYear = Math.min(previousYear + step, RISING_FINAL_YEAR);
  const advanced = newYear !== previousYear;
  const next = advanced ? { ...state, clock: newYear } : state;
  return {
    state: next,
    previousYear,
    newYear,
    step,
    advanced,
    expired: newYear >= RISING_FINAL_YEAR,
  };
}

/** The outcome of completing a turn. */
export interface TurnCompletion {
  /** The next state (unchanged when the turn could not be completed). */
  readonly state: RisingState;
  /** Whether the turn was completed. */
  readonly result: LegalityResult;
  /** The clock advance, or `null` when the turn was rejected. */
  readonly clock: ClockAdvanceResult | null;
}

/**
 * Complete the current turn and advance the clock.
 *
 * Composes the state machine's `end-turn` event (which resets the phase,
 * clears the active spirit and increments the turn counter) with a clock
 * advance. A turn can only be completed from the `resolved` phase; otherwise
 * the state is returned untouched. This is the single entry point the turn
 * controller uses to close a turn (AC3).
 */
export function completeTurn(state: RisingState, options: ClockOptions = {}): TurnCompletion {
  const ended = transition(state, { type: 'end-turn' });
  if (!ended.result.legal) {
    return { state, result: ended.result, clock: null };
  }
  const clock = advanceClock(ended.state, options);
  return { state: clock.state, result: legalAction(), clock };
}

/** Whether the clock has reached {@link RISING_FINAL_YEAR}. */
export function isClockExpired(state: RisingState): boolean {
  return state.clock >= RISING_FINAL_YEAR;
}

/** The clock's progress through its span, as a fraction in `[0, 1]`. */
export function clockProgress(state: RisingState): number {
  if (RISING_CLOCK_SPAN_YEARS <= 0) {
    return 1;
  }
  const fraction = (state.clock - RISING_START_YEAR) / RISING_CLOCK_SPAN_YEARS;
  return Math.max(0, Math.min(1, fraction));
}

/** The number of completed decade-bands (the clock's current band index). */
export function clockBandIndex(state: RisingState, options: ClockOptions = {}): number {
  const step = Math.max(1, Math.trunc(clockBandYears(state, options)));
  return Math.floor((state.clock - RISING_START_YEAR) / step);
}

/** The total number of decade-bands the clock spans. */
export function clockBandsTotal(state: RisingState, options: ClockOptions = {}): number {
  const step = Math.max(1, Math.trunc(clockBandYears(state, options)));
  return Math.ceil(RISING_CLOCK_SPAN_YEARS / step);
}

/** The number of further complete turns before the clock expires (`0` once expired). */
export function turnsUntilClockExpiry(state: RisingState, options: ClockOptions = {}): number {
  if (isClockExpired(state)) {
    return 0;
  }
  const step = Math.max(1, Math.trunc(clockBandYears(state, options)));
  return Math.ceil((RISING_FINAL_YEAR - state.clock) / step);
}
