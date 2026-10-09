import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/TheRisingContent';
import {
  DIFFICULTY_SETTINGS,
  RISING_FINAL_YEAR,
  RISING_START_YEAR,
  RISING_STATE_VERSION,
  createInitialState,
  deserializeRisingState,
  isRisingState,
  serializeRisingState,
  transition,
  type RisingState,
  type SpiritPlacement,
} from '../../src/TheRisingState';

const SPIRIT_ID = 'diarmait-mac-murchada';
const OTHER_SPIRIT_ID = 'ruaidri-ua-conchobair';

function placement(spiritId: string, year: number, slotIndex: number): SpiritPlacement {
  const spirit = ROSTER.spirits.find((candidate) => candidate.id === spiritId);
  return { spiritId, eraId: spirit?.eraId ?? 'unknown', year, slotIndex };
}

/** Drive a fresh state to the `conversing` phase for `spiritId`. */
function conversingState(spiritId = SPIRIT_ID): RisingState {
  const met = transition(createInitialState(), { type: 'meet', spiritId });
  expect(met.result.legal).toBe(true);
  const talking = transition(met.state, { type: 'begin-conversation' });
  expect(talking.result.legal).toBe(true);
  return talking.state;
}

describe('TheRisingState — initial state (AC2)', () => {
  it('creates a serialisable idle state for the normal preset', () => {
    const state = createInitialState();
    expect(state.version).toBe(RISING_STATE_VERSION);
    expect(state.phase).toBe('idle');
    expect(state.difficulty).toBe('normal');
    expect(state.memory).toBe(DIFFICULTY_SETTINGS.normal.maxMemory);
    expect(state.maxMemory).toBe(DIFFICULTY_SETTINGS.normal.maxMemory);
    expect(state.insight).toBe(0);
    expect(state.insightTarget).toBe(DIFFICULTY_SETTINGS.normal.insightTarget);
    expect(state.clock).toBe(RISING_START_YEAR);
    expect(state.turn).toBe(0);
    expect(state.timeline).toEqual([]);
    expect(state.hand).toEqual([]);
    expect(state.spiritRow).toHaveLength(ROSTER.spirits.length);
    expect(state.targetSpiritIds).toHaveLength(ROSTER.spirits.length);
  });

  it('honours difficulty overrides and explicit values', () => {
    const easy = createInitialState({ difficulty: 'easy', seed: 'alpha' });
    expect(easy.maxMemory).toBe(DIFFICULTY_SETTINGS.easy.maxMemory);
    expect(easy.insightTarget).toBe(DIFFICULTY_SETTINGS.easy.insightTarget);
    expect(easy.seed).toBe(createInitialState({ seed: 'alpha' }).seed);

    const custom = createInitialState({ memory: 0, insightTarget: 3, clock: RISING_FINAL_YEAR });
    expect(custom.memory).toBe(0);
    expect(custom.insightTarget).toBe(3);
    expect(custom.clock).toBe(RISING_FINAL_YEAR);
  });
});

describe('TheRisingState — phase state machine (AC2)', () => {
  it('runs the full turn chain idle → meeting → conversing → placing → resolved → idle', () => {
    const initial = createInitialState();

    const met = transition(initial, { type: 'meet', spiritId: SPIRIT_ID });
    expect(met.result.legal).toBe(true);
    expect(met.state.phase).toBe('meeting');
    expect(met.state.activeSpiritId).toBe(SPIRIT_ID);
    // The met spirit leaves the row and joins the hand.
    expect(met.state.spiritRow).not.toContain(SPIRIT_ID);
    expect(met.state.hand).toContain(SPIRIT_ID);

    const talking = transition(met.state, { type: 'begin-conversation' });
    expect(talking.result.legal).toBe(true);
    expect(talking.state.phase).toBe('conversing');

    const chosen = transition(talking.state, { type: 'choose-testimony', testimonyIndex: 1 });
    expect(chosen.result.legal).toBe(true);
    expect(chosen.state.phase).toBe('placing');
    expect(chosen.state.activeTestimonyIndex).toBe(1);

    const placed = transition(chosen.state, {
      type: 'place-spirit',
      placement: placement(SPIRIT_ID, 1110, 0),
    });
    expect(placed.result.legal).toBe(true);
    expect(placed.state.phase).toBe('resolved');
    expect(placed.state.timeline).toHaveLength(1);
    expect(placed.state.placedSpiritIds).toEqual([SPIRIT_ID]);
    expect(placed.state.hand).not.toContain(SPIRIT_ID);
    expect(placed.state.lastPlacedSpiritId).toBe(SPIRIT_ID);

    const ended = transition(placed.state, { type: 'end-turn' });
    expect(ended.result.legal).toBe(true);
    expect(ended.state.phase).toBe('idle');
    expect(ended.state.turn).toBe(1);
    expect(ended.state.activeSpiritId).toBeNull();
    expect(ended.state.activeTestimonyIndex).toBeNull();
    expect(ended.state.lastPlacedSpiritId).toBeNull();
  });

  it('rejects out-of-phase events without mutating the state', () => {
    const idle = createInitialState();
    const badCases: Array<Parameters<typeof transition>[1]> = [
      { type: 'begin-conversation' },
      { type: 'choose-testimony', testimonyIndex: 0 },
      { type: 'place-spirit', placement: placement(SPIRIT_ID, 1110, 0) },
      { type: 'end-turn' },
    ];
    for (const event of badCases) {
      const result = transition(idle, event);
      expect(result.result.legal, event.type).toBe(false);
      expect(result.state).toBe(idle);
    }
  });

  it('rejects meeting an unknown spirit and a second spirit in the same turn', () => {
    const unknown = transition(createInitialState(), { type: 'meet', spiritId: 'not-a-spirit' });
    expect(unknown.result.legal).toBe(false);
    expect(unknown.state.phase).toBe('idle');

    const met = transition(createInitialState(), { type: 'meet', spiritId: SPIRIT_ID });
    const second = transition(met.state, { type: 'meet', spiritId: OTHER_SPIRIT_ID });
    expect(second.result.legal).toBe(false);
    expect(second.state).toBe(met.state);
  });

  it('rejects an invalid testimony index', () => {
    const result = transition(conversingState(), { type: 'choose-testimony', testimonyIndex: -1 });
    expect(result.result.legal).toBe(false);
    expect(result.state.phase).toBe('conversing');
  });

  it('rejects placing a spirit that does not match the active spirit', () => {
    const placing = transition(conversingState(), { type: 'choose-testimony', testimonyIndex: 0 }).state;
    const result = transition(placing, {
      type: 'place-spirit',
      placement: placement(OTHER_SPIRIT_ID, 1116, 0),
    });
    expect(result.result.legal).toBe(false);
    expect(result.state).toBe(placing);
  });

  it('rejects an out-of-order placement and a duplicate placement', () => {
    const placing = transition(conversingState(), { type: 'choose-testimony', testimonyIndex: 0 }).state;
    const unordered: RisingState = {
      ...placing,
      timeline: [placement(OTHER_SPIRIT_ID, 1198, 0)],
      placedSpiritIds: [OTHER_SPIRIT_ID],
    };
    // The active spirit (1110) cannot go after a 1198 entry.
    const outOfOrder = transition(unordered, {
      type: 'place-spirit',
      placement: placement(SPIRIT_ID, 1110, 1),
    });
    expect(outOfOrder.result.legal).toBe(false);
    expect(outOfOrder.state).toBe(unordered);

    const duplicateBase = transition(conversingState(), { type: 'choose-testimony', testimonyIndex: 0 }).state;
    const duplicate: RisingState = {
      ...duplicateBase,
      timeline: [placement(SPIRIT_ID, 1110, 0)],
      placedSpiritIds: [SPIRIT_ID],
    };
    const duplicateResult = transition(duplicate, {
      type: 'place-spirit',
      placement: placement(SPIRIT_ID, 1110, 1),
    });
    expect(duplicateResult.result.legal).toBe(false);
    expect(duplicateResult.state).toBe(duplicate);
  });
});

describe('TheRisingState — serialisation (AC2)', () => {
  it('round-trips a mid-turn state', () => {
    const state = transition(conversingState(), { type: 'choose-testimony', testimonyIndex: 2 }).state;
    const restored = deserializeRisingState(serializeRisingState(state));
    expect(restored).toEqual(state);
    expect(isRisingState(restored)).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeRisingState('not json')).toThrow(/not valid JSON/);
    expect(() => deserializeRisingState('{"phase":"idle"}')).toThrow(/structure does not match/);
    expect(isRisingState(null)).toBe(false);
    expect(isRisingState({ ...createInitialState(), phase: 'teleporting' })).toBe(false);
  });
});
