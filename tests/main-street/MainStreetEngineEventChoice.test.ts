/**
 * Engine: Dual-Choice Event Resolution (CG-0MTT7E4FX007QCUR / parent
 * CG-0MTSHG8RP008E128)
 *
 * Unit tests for the core engine slice of the story-driven event-chain
 * feature: resolveIncident interception, the typed `pendingEventChoice`
 * state, processEndOfTurn pause/deferral, Accept/Reject paths, escalation
 * deck pushes, transcript recording, and the deferred-turn finish.
 *
 * The shipped card-data.csv has no `hasChoices` cards yet (that is content
 * child CG-0MTT7FC7A000AA58), so tests inject a synthetic choice template
 * via `loadTemplatesFromCsv` AFTER setup (decks are built from the bundled
 * data; only template lookups for chain escalation are synthetic).
 *
 * @module
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  processEndOfTurn,
  resolveIncident,
  resolveEventChoice,
  finishDeferredEndOfTurn,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';
import {
  type EventCard,
  getEventTemplates,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
  getBaseTypeId,
} from '../../example-games/main-street/MainStreetCards';
import {
  MainStreetTranscriptRecorder,
  setMainStreetRecorder,
} from '../../example-games/main-street/MainStreetTranscript';

// ── Synthetic CSV (choice + escalation templates) ───────────

const SYNTHETIC_CSV =
  `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,hasChoices,acceptNextCardId,rejectNextCardId
event,evt-choice-test,Test Choice Event,0,,,,,,,,,1,Incident,Lose 300 coins,All,,-300,-100,,,,,,,,,,,,,,,,true,evt-esc-audit,evt-esc-worse
event,evt-esc-audit,Audit Escalation,0,,,,,,,,,1,Incident,Lose 400 coins,All,,-400,0,,,,,,,,,,,,,,,,,,
event,evt-esc-worse,Worse Escalation,0,,,,,,,,,1,Incident,Lose 500 coins,All,,-500,0,,,,,,,,,,,,,,,,,,
event,evt-plain-test,Plain Incident,0,,,,,,,,,1,Incident,Lose 100 coins,All,,-100,0,,,,,,,,,,,,,,,,,,
event,evt-dur-choice,Duration Choice,100,,,,,,,,,1,Incident,80% income for 5 turns,All,,0,0,5,income-multiplier,0.8,,,,,,,,,,,,,true,,evt-esc-dur
event,evt-esc-dur,Duration Escalation,100,,,,,,,,,1,Incident,60% income for 6 turns,All,,0,0,6,income-multiplier,0.6,,,,,,,,,,,,,,,`;

// ── Helpers ─────────────────────────────────────────────────

function makeIncident(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event' as const,
    id: overrides.id ?? 'evt-test-incident',
    name: overrides.name ?? 'Test Incident',
    trigger: 'Incident' as const,
    cost: 0,
    effect: 'test effect',
    target: 'All' as const,
    coinDelta: overrides.coinDelta ?? -100,
    reputationDelta: overrides.reputationDelta ?? 0,
    hasChoices: overrides.hasChoices ?? false,
    acceptNextCardId: overrides.acceptNextCardId ?? undefined,
    rejectNextCardId: overrides.rejectNextCardId ?? undefined,
  };
}

/** Fresh game (bundled CSV) with the synthetic choice templates registered. */
function createChoiceAwareState(seed = 'choice-engine-seed'): MainStreetState {
  const state = setupMainStreetGame({ seed, difficulty: 'Medium' });
  loadTemplatesFromCsv(SYNTHETIC_CSV);
  state.phase = 'MarketPhase';
  return state;
}

/**
 * Force the next incident draw to be the given (already choice-flagged)
 * template: clears the incident deck and places a single instance so the
 * constrained selector deterministically picks it.
 */
function forceNextIncident(state: MainStreetState, templateId: string): void {
  const template = loadTemplate(templateId);
  state.incidentDeck.length = 0;
  state.incidentDeck.push({ ...template, id: `${templateId}-0` });
}

function loadTemplate(id: string): EventCard {
  // getEventTemplates is module state (CSV reloaded); read it dynamically to
  // stay aligned with the engine's pushChainCard lookups.
  const t = getEventTemplates().find((c) => c.id === id);
  if (!t) throw new Error(`Template ${id} missing — is it in the synthetic CSV?`);
  return t;
}

function coins(state: MainStreetState): number { return state.resourceBank.coins; }
function rep(state: MainStreetState): number { return state.resourceBank.reputation; }

function assertTurnPaused(result: TurnResult, state: MainStreetState): void {
  expect(result.choicePending).toBe(true);
  expect(result.incident).toBeNull();
  expect(state.phase).toBe('IncidentPhase');
  expect(state.turn).toBe(1); // not advanced
  expect(state.pendingEventChoice).not.toBeNull();
  expect(state.pendingEventChoice!.resolved).toBe(false);
  expect(state.pendingEventChoice!.chosenOption).toBeNull();
}

afterEach(() => {
  setMainStreetRecorder(null);
  resetTemplatesToDefault();
});

// ── resolveIncident interception (AC1 engine) ───────────────

describe('resolveIncident intercepts choice events', () => {
  it('defers a choice event: sets pendingEventChoice, applies nothing, returns null', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    const beforeCoins = coins(state);

    const drawn = resolveIncident(state);

    expect(drawn).toBeNull(); // deferred resolution (AC5 parent)
    expect(coins(state)).toBe(beforeCoins); // no effect applied
    expect(state.pendingEventChoice).not.toBeNull();
    expect(getBaseTypeId(state.pendingEventChoice!.event.id)).toBe('evt-choice-test');
    expect(state.pendingEventChoice!.resolved).toBe(false);
    // The card was removed from the deck (it is now "in play" pending choice)
    expect(state.incidentDeck.some((c) => c.id === 'evt-choice-test-0')).toBe(false);
  });

  it('resolves a non-choice event immediately (unchanged behaviour)', () => {
    const state = createChoiceAwareState();
    state.incidentDeck.length = 0;
    state.incidentDeck.push(makeIncident({ id: 'evt-plain-test', hasChoices: false, coinDelta: -100 }));
    const beforeCoins = coins(state);

    const drawn = resolveIncident(state);

    expect(drawn).not.toBeNull();
    expect(coins(state)).toBe(beforeCoins - 100); // applied normally
    expect(state.pendingEventChoice).toBeNull();
  });

  it('handles missing hasChoices field as a non-choice (backward compat)', () => {
    const state = createChoiceAwareState();
    state.incidentDeck.length = 0;
    const noFlag = makeIncident({ id: 'evt-no-flag', coinDelta: -50 });
    delete (noFlag as { hasChoices?: boolean }).hasChoices;
    state.incidentDeck.push(noFlag);
    const beforeCoins = coins(state);

    const drawn = resolveIncident(state);

    expect(drawn).not.toBeNull();
    expect(coins(state)).toBe(beforeCoins - 50);
    expect(state.pendingEventChoice).toBeNull();
  });
});

// ── processEndOfTurn pause / deferral (AC3, AC7) ────────────

describe('processEndOfTurn defers when a choice event is drawn', () => {
  it('pauses before EndCheck with choicePending when an incident requires a choice', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');

    const result = processEndOfTurn(state);

    assertTurnPaused(result, state);
    // No EndCheck ran: challenges not evaluated, gameResult still playing.
    expect(result.gameResult).toBe('playing');
    expect(result.newlyCompletedChallenges).toEqual([]);
  });

  it('returns choicePending (no throw, no double income) if end-turn is retried while unresolved', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    processEndOfTurn(state); // pauses with pending choice (phase IncidentPhase)
    const coinsAfterPause = coins(state);

    const retry = processEndOfTurn(state); // phase is NOT MarketPhase

    expect(retry.choicePending).toBe(true);
    expect(coins(state)).toBe(coinsAfterPause); // no additional income applied
    expect(state.turn).toBe(1);
  });
});

// ── Accept path (AC4 engine) ────────────────────────────────

describe('resolveEventChoice — Accept path', () => {
  it('applies the event effect and pushes acceptNextCardId to the deck top', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    const coinsBefore = coins(state);
    const repBefore = rep(state);
    processEndOfTurn(state); // pause

    const res = resolveEventChoice(state, 'accept');

    // Effect applied (regular EventCard: coin delta -300, rep delta -100)
    expect(coins(state)).toBe(coinsBefore - 300);
    expect(rep(state)).toBe(repBefore - 100);
    // Escalation pushed to deck TOP (next to be drawn)
    expect(res.pushedCard).not.toBeNull();
    expect(getBaseTypeId(res.pushedCard!.id)).toBe('evt-esc-audit');
    expect(getBaseTypeId(state.incidentDeck[state.incidentDeck.length - 1].id)).toBe('evt-esc-audit');
    // Pending choice resolved
    expect(state.pendingEventChoice!.chosenOption).toBe('accept');
    expect(state.pendingEventChoice!.resolved).toBe(true);
  });

  it('ends the chain cleanly when acceptNextCardId is absent', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    processEndOfTurn(state); // pause — pendingEventChoice is now set
    // Strip the accept path to simulate a chain end (no escalation).
    state.pendingEventChoice!.event = { ...state.pendingEventChoice!.event, acceptNextCardId: undefined };
    const deckLen = state.incidentDeck.length;

    const res = resolveEventChoice(state, 'accept');

    expect(res.pushedCard).toBeNull();
    expect(state.incidentDeck.length).toBe(deckLen); // nothing added
  });
});

// ── Reject path (AC5 engine) ────────────────────────────────

describe('resolveEventChoice — Reject path', () => {
  it('skips the event effect entirely and pushes rejectNextCardId', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    const coinsBefore = coins(state);
    const repBefore = rep(state);
    processEndOfTurn(state); // pause

    const res = resolveEventChoice(state, 'reject');

    // Reject = refuse the consequence: NO coins/rep change.
    expect(coins(state)).toBe(coinsBefore);
    expect(rep(state)).toBe(repBefore);
    // But the escalation (worse card) is added to the deck.
    expect(res.pushedCard).not.toBeNull();
    expect(getBaseTypeId(res.pushedCard!.id)).toBe('evt-esc-worse');
    expect(getBaseTypeId(state.incidentDeck[state.incidentDeck.length - 1].id)).toBe('evt-esc-worse');
    expect(state.pendingEventChoice!.chosenOption).toBe('reject');
    expect(state.pendingEventChoice!.resolved).toBe(true);
  });

  it('rejecting an event with no rejectNextCardId adds nothing to the deck', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    processEndOfTurn(state); // pause — pendingEventChoice is now set
    state.pendingEventChoice!.event = { ...state.pendingEventChoice!.event, rejectNextCardId: undefined };
    const deckLen = state.incidentDeck.length;
    const coinsBefore = coins(state);

    const res = resolveEventChoice(state, 'reject');

    expect(res.pushedCard).toBeNull();
    expect(state.incidentDeck.length).toBe(deckLen);
    expect(coins(state)).toBe(coinsBefore); // no effect applied
  });
});

// ── Duration events (AC2 parent — DurationEventCard inherits) ─

describe('Duration choice events', () => {
  it('accept pushes a duration active effect and chains via acceptNextCardId', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-dur-choice');
    const effectsBefore = state.activeEffects.length;
    processEndOfTurn(state); // pause

    const res = resolveEventChoice(state, 'accept');

    // Accept applied the duration effect (board-wide active effect).
    expect(state.activeEffects.length).toBe(effectsBefore + 1);
    expect(state.activeEffects[state.activeEffects.length - 1].effectType).toBe('income-multiplier');
    // acceptNextCardId absent → chain ends.
    expect(res.pushedCard).toBeNull();
  });

  it('reject skips the duration effect but adds the rejectNextCardId escalation', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-dur-choice');
    const effectsBefore = state.activeEffects.length;
    processEndOfTurn(state); // pause

    const res = resolveEventChoice(state, 'reject');

    expect(state.activeEffects.length).toBe(effectsBefore); // NOT applied
    expect(res.pushedCard).not.toBeNull();
    expect(getBaseTypeId(res.pushedCard!.id)).toBe('evt-esc-dur');
  });
});

// ── finishDeferredEndOfTurn (deferred closing) ──────────────

describe('finishDeferredEndOfTurn completes the paused turn', () => {
  it('clears the pending choice, runs EndCheck and advances to the next day', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    const paused = processEndOfTurn(state);
    assertTurnPaused(paused, state);
    resolveEventChoice(state, 'accept');

    const result = finishDeferredEndOfTurn(state);

    expect(state.pendingEventChoice).toBeNull(); // consumed
    expect(state.phase).toBe('DayStart'); // next day
    expect(state.turn).toBe(2);
    expect(result.choicePending).toBe(false);
    expect(result.gameResult).toBe('playing');
  });

  it('throws when called without a resolved pending choice', () => {
    const state = createChoiceAwareState();
    expect(() => finishDeferredEndOfTurn(state)).toThrow(/resolved pending event choice/);
  });

  it('throws when the pending choice is still unresolved', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    processEndOfTurn(state); // pending but UNRESOLVED
    expect(() => finishDeferredEndOfTurn(state)).toThrow(/resolved pending event choice/);
  });

  it('resolveEventChoice throws when no choice is pending', () => {
    const state = createChoiceAwareState();
    expect(() => resolveEventChoice(state, 'accept')).toThrow(/No pending event choice/);
  });

  it('resolveEventChoice throws when the choice was already resolved', () => {
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    processEndOfTurn(state);
    resolveEventChoice(state, 'accept');
    expect(() => resolveEventChoice(state, 'reject')).toThrow(/already resolved/);
  });
});

// ── Transcript recording (AC6/AC12) ─────────────────────────

describe('transcript recording for event choices', () => {
  it('records an event-choice event with option + both next-card ids', () => {
    const recorder = new MainStreetTranscriptRecorder({ seed: 'x' });
    setMainStreetRecorder(recorder);
    const state = createChoiceAwareState();
    forceNextIncident(state, 'evt-choice-test');
    processEndOfTurn(state);

    resolveEventChoice(state, 'reject');

    const events = recorder.getTranscript().events;
    const choiceEvent = events.find((e) => e.type === 'event-choice');
    expect(choiceEvent).toBeDefined();
    if (!choiceEvent || choiceEvent.type !== 'event-choice') return;
    expect(choiceEvent.eventId).toContain('evt-choice-test'); // instance id carries the base template id
    expect(choiceEvent.cardName).toBe('Test Choice Event');
    expect(choiceEvent.option).toBe('reject');
    expect(choiceEvent.acceptNextCardId).toBe('evt-esc-audit');
    expect(choiceEvent.rejectNextCardId).toBe('evt-esc-worse');
  });
});
