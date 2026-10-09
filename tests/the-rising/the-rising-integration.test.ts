import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/TheRisingContent';
import {
  applyPlacement,
  evaluateOutcome,
  isTimelineComplete,
  type PlacementScore,
} from '../../src/TheRisingRules';
import {
  RISING_FINAL_YEAR,
  createInitialState,
  transition,
  type RisingState,
} from '../../src/TheRisingState';
import { chooseTestimony, meetSpirit } from '../../src/TheRisingEconomy';
import { advanceClock, completeTurn } from '../../src/TheRisingClock';

// Three real, same-era spirits, all in the Norman-Lordship chapter and listed
// here in chronological order (1110, 1116, 1145).
const EARLIEST = 'diarmait-mac-murchada';
const MIDDLE = 'ruaidri-ua-conchobair';
const LATEST = 'aoife-mac-murrough';
const TARGETS = [EARLIEST, MIDDLE, LATEST] as const;

function spiritById(id: string) {
  const spirit = ROSTER.spirits.find((candidate) => candidate.id === id);
  if (!spirit) {
    throw new Error(`Unknown spirit ${id}`);
  }
  return spirit;
}

/** A small, controllable session: 5 Memory, a 3-spirit target and a low Insight bar. */
function sessionState(overrides: Partial<RisingState> = {}): RisingState {
  return {
    ...createInitialState({
      seed: 'integration-seed',
      difficulty: 'normal',
      memory: 5,
      insightTarget: 5,
      rowSpiritIds: [...TARGETS],
      targetSpiritIds: [...TARGETS],
    }),
    ...overrides,
  };
}

/** Play one complete turn: meet → converse → place → clock. */
function playTurn(
  state: RisingState,
  spiritId: string,
  { optionIndex = 0 }: { optionIndex?: number } = {},
): {
  state: RisingState;
  testimonyAnswer: string;
  placement: PlacementScore;
  clockAdvanced: number;
} {
  const met = meetSpirit(state, spiritId);
  expect(met.result.legal).toBe(true);

  const talking = transition(met.state, { type: 'begin-conversation' });
  expect(talking.result.legal).toBe(true);

  const choice = chooseTestimony(talking.state, optionIndex);
  expect(choice.result.legal).toBe(true);
  expect(choice.testimony).not.toBeNull();

  const placed = applyPlacement(choice.state, spiritById(spiritId));
  expect(placed.result.legal).toBe(true);
  expect(placed.score).not.toBeNull();

  const completed = completeTurn(placed.state);
  expect(completed.result.legal).toBe(true);

  return {
    state: completed.state,
    testimonyAnswer: choice.testimony!.answer,
    placement: placed.score!,
    clockAdvanced: completed.clock!.newYear - completed.clock!.previousYear,
  };
}

describe('The Rising — full-turn integration (AC4)', () => {
  it('runs meet → converse → place → clock in one turn', () => {
    const initial = sessionState();
    const result = playTurn(initial, EARLIEST);

    // Economy: one Memory spent.
    expect(result.state.memory).toBe(initial.memory - 1);
    // Conversation + placement Insight awarded.
    expect(result.placement.total).toBeGreaterThan(0);
    expect(result.state.insight).toBe(1 + result.placement.total);
    // Placement committed to the timeline.
    expect(result.state.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
    // Clock and turn advanced; the turn returned to idle.
    expect(result.state.turn).toBe(1);
    expect(result.state.phase).toBe('idle');
    expect(result.state.activeSpiritId).toBeNull();
    expect(result.clockAdvanced).toBeGreaterThan(0);
    expect(result.state.clock).toBe(initial.clock + result.clockAdvanced);
  });

  it('advances the clock by one decade-band each completed turn', () => {
    const initial = sessionState();
    const afterOne = playTurn(initial, EARLIEST);
    const afterTwo = playTurn(afterOne.state, MIDDLE);

    const expectedBand = advanceClock(initial).step;
    expect(afterOne.clockAdvanced).toBe(expectedBand);
    // The second turn advances from the already-advanced clock.
    expect(afterTwo.state.clock).toBe(afterOne.state.clock + expectedBand);
    expect(afterTwo.state.turn).toBe(2);
  });

  it('runs a multi-turn session and reaches a win', () => {
    let state = sessionState();
    state = playTurn(state, EARLIEST).state;
    state = playTurn(state, MIDDLE).state;
    state = playTurn(state, LATEST).state;

    expect(isTimelineComplete(state)).toBe(true);
    expect(state.insight).toBeGreaterThanOrEqual(state.insightTarget);
    expect(evaluateOutcome(state)).toMatchObject({ outcome: 'won', reason: 'timeline-complete' });
  });

  it('loses when Memory is depleted with spirits still unplaced', () => {
    // Only two meets are affordable for a three-spirit target.
    let state = sessionState({ memory: 2 });
    state = playTurn(state, EARLIEST).state;
    state = playTurn(state, MIDDLE).state;

    expect(state.memory).toBe(0);
    expect(isTimelineComplete(state)).toBe(false);

    const third = meetSpirit(state, LATEST);
    expect(third.result.legal).toBe(false);
    expect(evaluateOutcome(state)).toMatchObject({ outcome: 'lost', reason: 'memory-depleted' });
  });

  it('loses when the Rising clock expires with the timeline incomplete', () => {
    // Near-final clock: a single completed turn pushes the clock to 1916.
    let state = sessionState({ clock: RISING_FINAL_YEAR - 5 });
    state = playTurn(state, EARLIEST).state;

    expect(state.clock).toBe(RISING_FINAL_YEAR);
    expect(isTimelineComplete(state)).toBe(false);
    expect(evaluateOutcome(state)).toMatchObject({ outcome: 'lost', reason: 'clock-expired' });
  });
});

describe('The Rising — deterministic conversation sequence (AC4)', () => {
  it('produces the same testimony sequence for the same seed', () => {
    const run = (): { answers: string[]; final: RisingState } => {
      let state = sessionState();
      const answers: string[] = [];
      for (const spiritId of TARGETS) {
        const turn = playTurn(state, spiritId, { optionIndex: 1 });
        answers.push(turn.testimonyAnswer);
        state = turn.state;
      }
      return { answers, final: state };
    };

    const first = run();
    const second = run();

    expect(first.answers).toHaveLength(TARGETS.length);
    expect(second.answers).toEqual(first.answers);
    // The full final state is reproducible (same seed, same choices).
    expect(second.final).toEqual(first.final);
  });

  it('records the chosen testimony index on the state for transcript replay', () => {
    const state = sessionState();
    const met = meetSpirit(state, EARLIEST);
    const talking = transition(met.state, { type: 'begin-conversation' });
    const choice = chooseTestimony(talking.state, 0);
    expect(choice.state.activeTestimonyIndex).toBe(choice.testimonyIndex);
  });
});
