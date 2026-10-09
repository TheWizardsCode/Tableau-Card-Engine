import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOCK_BAND_YEARS,
  RISING_CLOCK_SPAN_YEARS,
  advanceClock,
  clockBandIndex,
  clockBandYears,
  clockBandYearsForDifficulty,
  clockBandsTotal,
  clockProgress,
  completeTurn,
  isClockExpired,
  turnsUntilClockExpiry,
} from '../../src/TheRisingClock';
import {
  RISING_FINAL_YEAR,
  RISING_START_YEAR,
  createInitialState,
  type RisingState,
} from '../../src/TheRisingState';

/** A resolved state ready to close its turn. */
function resolvedState(overrides: Partial<RisingState> = {}): RisingState {
  return {
    ...createInitialState(),
    phase: 'resolved',
    activeSpiritId: 'diarmait-mac-murchada',
    activeTestimonyIndex: 0,
    ...overrides,
  };
}

describe('TheRisingClock — difficulty bands (AC3)', () => {
  it('derives a faster band for a harder difficulty', () => {
    const easy = clockBandYearsForDifficulty('easy');
    const normal = clockBandYearsForDifficulty('normal');
    const hard = clockBandYearsForDifficulty('hard');

    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
    // Calibrated so each preset reaches 1916 on its last affordable meet.
    expect(easy).toBe(63);
    expect(normal).toBe(75);
    expect(hard).toBe(94);
    expect(DEFAULT_CLOCK_BAND_YEARS).toBe(normal);
  });

  it('scales the band with a larger meet cost (fewer meets available)', () => {
    // normal has 10 Memory; at a cost of 2 there are only 5 meets.
    expect(clockBandYearsForDifficulty('normal', 2)).toBe(Math.ceil(747 / 5));
    expect(clockBandYearsForDifficulty('normal', 2)).toBeGreaterThan(
      clockBandYearsForDifficulty('normal', 1),
    );
  });

  it('falls back to the difficulty-derived band and honours an explicit step', () => {
    const state = createInitialState({ difficulty: 'normal' });
    expect(clockBandYears(state)).toBe(75);
    expect(clockBandYears(state, { step: 10 })).toBe(10);
  });
});

describe('TheRisingClock — advancement (AC3)', () => {
  it('starts at 1169 and advances one band per call', () => {
    const state = createInitialState({ difficulty: 'normal' });
    expect(state.clock).toBe(RISING_START_YEAR);

    const advanced = advanceClock(state);
    expect(advanced.previousYear).toBe(RISING_START_YEAR);
    expect(advanced.newYear).toBe(1169 + DEFAULT_CLOCK_BAND_YEARS);
    expect(advanced.state.clock).toBe(1169 + DEFAULT_CLOCK_BAND_YEARS);
    expect(advanced.advanced).toBe(true);
    expect(advanced.expired).toBe(false);
    // The source state is not mutated.
    expect(state.clock).toBe(RISING_START_YEAR);
  });

  it('advances by an explicit step override', () => {
    const advanced = advanceClock(createInitialState(), { step: 100 });
    expect(advanced.state.clock).toBe(1269);
  });

  it('clamps at 1916 and becomes a no-op once expired', () => {
    const nearFinal = createInitialState({ clock: RISING_FINAL_YEAR - 5 });
    const clamped = advanceClock(nearFinal);
    expect(clamped.newYear).toBe(RISING_FINAL_YEAR);
    expect(clamped.expired).toBe(true);

    const atFinal = createInitialState({ clock: RISING_FINAL_YEAR });
    const stopped = advanceClock(atFinal);
    expect(stopped.advanced).toBe(false);
    expect(stopped.newYear).toBe(RISING_FINAL_YEAR);
    expect(stopped.state).toBe(atFinal);
  });

  it('never advances by less than one year', () => {
    const advanced = advanceClock(createInitialState(), { step: 0 });
    expect(advanced.state.clock).toBe(RISING_START_YEAR + 1);
  });
});

describe('TheRisingClock — completing a turn (AC3)', () => {
  it('closes the turn and advances the clock in one step', () => {
    const state = resolvedState({ turn: 2, clock: 1169 });
    const completed = completeTurn(state);

    expect(completed.result.legal).toBe(true);
    expect(completed.clock).not.toBeNull();
    expect(completed.state.phase).toBe('idle');
    expect(completed.state.turn).toBe(3);
    expect(completed.state.activeSpiritId).toBeNull();
    expect(completed.state.activeTestimonyIndex).toBeNull();
    expect(completed.state.clock).toBe(1169 + DEFAULT_CLOCK_BAND_YEARS);
  });

  it('does not advance the clock when the turn cannot be completed', () => {
    const idle = createInitialState();
    const completed = completeTurn(idle);

    expect(completed.result.legal).toBe(false);
    expect(completed.clock).toBeNull();
    expect(completed.state).toBe(idle);
    expect(completed.state.clock).toBe(RISING_START_YEAR);
    expect(completed.state.turn).toBe(0);
  });

  it('reaches 1916 after the calibrated number of turns for the normal preset', () => {
    let state: RisingState = createInitialState({ difficulty: 'normal' });
    const expectedTurns = turnsUntilClockExpiry(state);
    expect(expectedTurns).toBe(10);

    for (let turn = 0; turn < expectedTurns; turn += 1) {
      state = completeTurn(resolvedState({ ...state, phase: 'resolved' })).state;
    }

    expect(state.clock).toBe(RISING_FINAL_YEAR);
    expect(isClockExpired(state)).toBe(true);
    expect(turnsUntilClockExpiry(state)).toBe(0);
  });
});

describe('TheRisingClock — progress accessors (AC3)', () => {
  it('reports progress as a fraction of the 1169–1916 span', () => {
    expect(clockProgress(createInitialState())).toBe(0);
    expect(clockProgress(createInitialState({ clock: RISING_FINAL_YEAR }))).toBe(1);
    expect(RISING_CLOCK_SPAN_YEARS).toBe(RISING_FINAL_YEAR - RISING_START_YEAR);

    const mid = createInitialState({ clock: RISING_START_YEAR + Math.floor(RISING_CLOCK_SPAN_YEARS / 2) });
    expect(clockProgress(mid)).toBeGreaterThan(0.49);
    expect(clockProgress(mid)).toBeLessThan(0.51);
  });

  it('tracks the current band index and the total number of bands', () => {
    const state = createInitialState({ difficulty: 'normal' });
    expect(clockBandIndex(state)).toBe(0);
    expect(clockBandsTotal(state)).toBe(Math.ceil(RISING_CLOCK_SPAN_YEARS / 75));

    const advanced = advanceClock(state);
    expect(clockBandIndex(advanced.state)).toBe(1);
  });

  it('counts the turns remaining before the clock expires', () => {
    const state = createInitialState({ clock: 1916 - 100 });
    expect(turnsUntilClockExpiry(state)).toBe(Math.ceil(100 / 75));
    expect(turnsUntilClockExpiry(createInitialState({ clock: RISING_FINAL_YEAR }))).toBe(0);
  });
});
