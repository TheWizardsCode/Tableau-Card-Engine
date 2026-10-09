import { describe, expect, it } from 'vitest';
import { ROSTER } from '../../src/TheRisingContent';
import { createInitialState, transition, type RisingState } from '../../src/TheRisingState';
import {
  CONVERSATION_INSIGHT,
  CONVERSATION_OPTION_COUNT,
  SPIRIT_MEET_MEMORY_COST,
  canMeetSpirit,
  chooseTestimony,
  conversationOptions,
  conversationSeed,
  meetSpirit,
  testimonyOrder,
} from '../../src/TheRisingEconomy';

const SPIRIT_ID = 'diarmait-mac-murchada';
const OTHER_SPIRIT_ID = 'ruaidri-ua-conchobair';

/** Drive a fresh state to the `conversing` phase for `spiritId`. */
function conversingState(
  spiritId = SPIRIT_ID,
  { seed = 'alpha', memory = 10 }: { seed?: string; memory?: number } = {},
): RisingState {
  const met = meetSpirit(createInitialState({ seed, memory }), spiritId);
  expect(met.result.legal).toBe(true);
  const talking = transition(met.state, { type: 'begin-conversation' });
  expect(talking.result.legal).toBe(true);
  return talking.state;
}

describe('TheRisingEconomy — Memory economy (AC1)', () => {
  it('deducts the fixed Memory cost when a spirit is met', () => {
    const initial = createInitialState({ memory: 5 });
    const met = meetSpirit(initial, SPIRIT_ID);

    expect(met.result.legal).toBe(true);
    expect(met.cost).toBe(SPIRIT_MEET_MEMORY_COST);
    expect(met.state.memory).toBe(initial.memory - SPIRIT_MEET_MEMORY_COST);
    expect(met.state.maxMemory).toBe(initial.maxMemory);
    // The meet also drives the state machine and moves the spirit to hand.
    expect(met.state.phase).toBe('meeting');
    expect(met.state.hand).toContain(SPIRIT_ID);
    // The source state is never mutated.
    expect(initial.memory).toBe(5);
    expect(initial.hand).toEqual([]);
  });

  it('rejects a meet when Memory is insufficient and leaves the state untouched', () => {
    const broke = createInitialState({ memory: 0 });
    const met = meetSpirit(broke, SPIRIT_ID);

    expect(met.result.legal).toBe(false);
    if (!met.result.legal) {
      expect(met.result.reason.toLowerCase()).toContain('memory');
    }
    expect(met.state).toBe(broke);
    expect(met.state.phase).toBe('idle');
    expect(met.state.hand).toEqual([]);
  });

  it('mirrors meetSpirit in canMeetSpirit across affordable and unaffordable states', () => {
    const rich = createInitialState({ memory: 2 });
    expect(canMeetSpirit(rich, SPIRIT_ID).legal).toBe(true);
    expect(meetSpirit(rich, SPIRIT_ID).result.legal).toBe(true);

    const poor = createInitialState({ memory: 0 });
    expect(canMeetSpirit(poor, SPIRIT_ID).legal).toBe(false);
    expect(meetSpirit(poor, SPIRIT_ID).result.legal).toBe(false);
  });

  it('honours a configurable meet cost', () => {
    const state = createInitialState({ memory: 2 });
    expect(meetSpirit(state, SPIRIT_ID, { meetCost: 3 }).result.legal).toBe(false);

    const affordable = meetSpirit(state, SPIRIT_ID, { meetCost: 2 });
    expect(affordable.result.legal).toBe(true);
    expect(affordable.state.memory).toBe(0);
  });

  it('rejects unknown or unavailable spirits and wrong-phase meets', () => {
    const initial = createInitialState({ memory: 5 });
    expect(canMeetSpirit(initial, 'not-a-spirit').legal).toBe(false);

    const met = meetSpirit(initial, SPIRIT_ID);
    // Cannot meet again while already in a turn.
    expect(canMeetSpirit(met.state, OTHER_SPIRIT_ID).legal).toBe(false);
    expect(meetSpirit(met.state, OTHER_SPIRIT_ID).state).toBe(met.state);
  });

  it('does not let Memory go below the zero floor even with a fractional cost', () => {
    const state = createInitialState({ memory: 1 });
    expect(meetSpirit(state, SPIRIT_ID, { meetCost: 2 }).result.legal).toBe(false);
    expect(state.memory).toBe(1);
  });
});

describe('TheRisingEconomy — Conversation mechanic (AC2)', () => {
  it('offers between two and three questions with non-empty text', () => {
    const state = conversingState();
    const options = conversationOptions(state);

    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(CONVERSATION_OPTION_COUNT);
    for (const option of options) {
      expect(option.question.trim().length).toBeGreaterThan(0);
      expect(option.index).toBe(options.indexOf(option));
    }
  });

  it('presents the questions in a deterministic order for a seed and spirit', () => {
    const first = conversationOptions(conversingState(SPIRIT_ID, { seed: 'alpha' }));
    const second = conversationOptions(conversingState(SPIRIT_ID, { seed: 'alpha' }));
    expect(second.map((option) => option.question)).toEqual(
      first.map((option) => option.question),
    );

    // The underlying order is a permutation of every testimony index.
    const spirit = ROSTER.spirits.find((candidate) => candidate.id === SPIRIT_ID)!;
    const order = testimonyOrder(spirit, 123);
    expect([...order].sort((a, b) => a - b)).toEqual(
      spirit.testimonies.map((_t, index) => index),
    );
  });

  it('derives the option seed from the session seed and spirit id', () => {
    expect(conversationSeed(7, SPIRIT_ID)).toBe(conversationSeed(7, SPIRIT_ID));
    expect(conversationSeed(7, SPIRIT_ID)).not.toBe(conversationSeed(8, SPIRIT_ID));
    expect(conversationSeed(7, SPIRIT_ID)).not.toBe(conversationSeed(7, OTHER_SPIRIT_ID));
  });

  it('awards Insight and yields the testimony for the chosen option', () => {
    const state = conversingState();
    const options = conversationOptions(state);
    const chosen = chooseTestimony(state, 0);

    expect(chosen.result.legal).toBe(true);
    expect(chosen.insightAwarded).toBe(CONVERSATION_INSIGHT);
    expect(chosen.state.insight).toBe(state.insight + CONVERSATION_INSIGHT);
    expect(chosen.state.phase).toBe('placing');
    expect(chosen.testimony).not.toBeNull();
    expect(chosen.testimony!.question).toBe(options[0].question);
    expect(chosen.testimonyIndex).toBe(options[0].testimonyIndex);
    expect(chosen.state.activeTestimonyIndex).toBe(options[0].testimonyIndex);
    // Every testimony carries a resolvable source citation.
    expect(chosen.testimony!.source.id.length).toBeGreaterThan(0);
  });

  it('is deterministic: same seed + same chosen index → same testimony', () => {
    const first = chooseTestimony(conversingState(SPIRIT_ID, { seed: 'beta' }), 1);
    const second = chooseTestimony(conversingState(SPIRIT_ID, { seed: 'beta' }), 1);

    expect(first.testimony!.answer).toBe(second.testimony!.answer);
    expect(first.testimonyIndex).toBe(second.testimonyIndex);
    expect(first.state.insight).toBe(second.state.insight);
  });

  it('rejects an out-of-range or non-integer question index without mutating state', () => {
    const state = conversingState();
    const offered = conversationOptions(state).length;
    for (const index of [-1, offered, offered + 5, 1.5, Number.NaN]) {
      const choice = chooseTestimony(state, index);
      expect(choice.result.legal).toBe(false);
      expect(choice.state).toBe(state);
      expect(choice.testimony).toBeNull();
    }
  });

  it('rejects a testimony choice outside the conversing phase', () => {
    const idle = createInitialState();
    const choice = chooseTestimony(idle, 0);
    expect(choice.result.legal).toBe(false);
    expect(choice.state).toBe(idle);
    if (!choice.result.legal) {
      expect(choice.result.reason).toContain('Cannot choose a testimony');
    }
  });

  it('returns no options when no spirit is active', () => {
    expect(conversationOptions(createInitialState())).toEqual([]);
  });
});

describe('TheRisingEconomy — economy + conversation flow (AC1, AC2)', () => {
  it('runs meet → converse within the Memory budget', () => {
    const initial = createInitialState({ memory: 3 });
    const met = meetSpirit(initial, SPIRIT_ID);
    expect(met.state.memory).toBe(2);

    const talking = transition(met.state, { type: 'begin-conversation' });
    expect(talking.result.legal).toBe(true);

    const choice = chooseTestimony(talking.state, 0);
    expect(choice.result.legal).toBe(true);
    expect(choice.state.phase).toBe('placing');
    expect(choice.state.activeSpiritId).toBe(SPIRIT_ID);
    expect(choice.state.activeTestimonyIndex).not.toBeNull();
  });
});
