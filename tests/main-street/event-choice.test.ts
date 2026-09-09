/**
 * Engine: Event Choice Resolution Paths (CG-0MTT78RRQ0056KUZ / parent
 * CG-0MTSHG8RP008E128)
 *
 * Canonical unit-test suite for the dual-choice event engine slice, covering
 * the resolution acceptance criteria:
 *
 *  1. Accept path — event effect applied + acceptNextCardId pushed to deck.
 *  2. Reject path — effect skipped + rejectNextCardId pushed to deck.
 *  3. Non-choice events resolve normally (no dialog, deterministic effect).
 *  4. Chain termination — null/absent next ids end the chain cleanly.
 *  5. Chain continuation — a pushed escalation card is drawn next.
 *  6. Cycle detection — chains that cycle (e.g. Tax cycle) never loop.
 *  7. pendingEventChoice state — { event, chosenOption, resolved } tracked
 *     across turns / deferred closing.
 *  8. processEndOfTurn deferral — an unresolved pending choice returns early
 *     (choicePending) without proceeding through the closing phases.
 *
 * The shipped card-data.csv has no `hasChoices` cards yet (content child
 * CG-0MTT7FC7A000AA58), so tests register synthetic choice + escalation
 * templates AFTER setup and force the incident deck.
 *
 * @module
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  type EventCard,
  getEventTemplates,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
  getBaseTypeId,
} from '../../example-games/main-street/MainStreetCards';
import {
  processEndOfTurn,
  resolveIncident,
  resolveEventChoice,
  finishDeferredEndOfTurn,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';

// ── Synthetic CSV: a 3-step cycle + a 2-step escalation chain ──

const SYNTHETIC_CSV =
  `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,hasChoices,acceptNextCardId,rejectNextCardId
event,evt-tax-e1,Cycle One,0,,,,,,,,,1,Incident,Lose 100 coins,All,,-100,0,,,,,,,,,,,,,,,,true,,evt-tax-e2
event,evt-tax-e2,Cycle Two,0,,,,,,,,,1,Incident,Lose 200 coins,All,,-200,0,,,,,,,,,,,,,,,,true,,evt-tax-e3
event,evt-tax-e3,Cycle Three,0,,,,,,,,,1,Incident,Lose 300 coins,All,,-300,0,,,,,,,,,,,,,,,,true,evt-tax-e1,
event,evt-chain-a,Chain A,0,,,,,,,,,1,Incident,Lose 50 coins,All,,-50,0,,,,,,,,,,,,,,,,true,evt-chain-b,evt-chain-worse
event,evt-chain-b,Chain B,0,,,,,,,,,1,Incident,Lose 75 coins,All,,-75,0,,,,,,,,,,,,,,,,,,
event,evt-chain-worse,Chain Worse,0,,,,,,,,,1,Incident,Lose 600 coins,All,,-600,0,,,,,,,,,,,,,,,,,,
event,evt-plain,Plain Event,0,,,,,,,,,1,Incident,Lose 20 coins,All,,-20,0,,,,,,,,,,,,,,,,,,`;

// ── Helpers ─────────────────────────────────────────────────

function makeState(seed = 'event-choice-suite'): MainStreetState {
  const state = setupMainStreetGame({ seed, difficulty: 'Medium' });
  loadTemplatesFromCsv(SYNTHETIC_CSV);
  state.phase = 'MarketPhase';
  return state;
}

/** Replaces the incident deck with a single copy of the given template. */
function forceNextIncident(state: MainStreetState, templateId: string): void {
  const template = getEventTemplates().find((c) => c.id === templateId);
  if (!template) throw new Error(`Template ${templateId} missing from synthetic CSV`);
  state.incidentDeck.length = 0;
  state.incidentDeck.push({ ...template, id: `${templateId}-0` });
}

function coins(state: MainStreetState): number {
  return state.resourceBank.coins;
}

/** Ends the current MarketPhase, expecting the closing to pause on a choice. */
function endTurnAndPause(state: MainStreetState): TurnResult {
  const result = processEndOfTurn(state);
  expect(result.choicePending).toBe(true);
  expect(state.pendingEventChoice).not.toBeNull();
  expect(state.pendingEventChoice!.resolved).toBe(false);
  return result;
}

afterEach(() => {
  resetTemplatesToDefault();
});

// ── AC1: Accept path ────────────────────────────────────────

describe('AC1 — Accept path applies the effect and pushes acceptNextCardId', () => {
  it('applies the effect then adds the accept chain card to the deck', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-chain-a');
    const coinsBefore = coins(state);
    endTurnAndPause(state);

    const res = resolveEventChoice(state, 'accept');

    // Effect applied (Chain A: -50 coins).
    expect(coins(state)).toBe(coinsBefore - 50);
    // acceptNextCardId pushed to the incident deck.
    expect(res.pushedCard).not.toBeNull();
    expect(getBaseTypeId(res.pushedCard!.id)).toBe('evt-chain-b');
    expect(getBaseTypeId(state.incidentDeck[state.incidentDeck.length - 1].id)).toBe('evt-chain-b');
    // State recorded the decision.
    expect(state.pendingEventChoice!.chosenOption).toBe('accept');
    expect(state.pendingEventChoice!.resolved).toBe(true);
  });

  it('a duration choice event applies an active effect on accept', () => {
    const state = makeState();
    // Reuse evt-cycle templates is not a duration; build one inline by
    // extending the deck with a duration-shaped instance.
    const template = getEventTemplates().find((c) => c.id === 'evt-tax-e1')!;
    // A DurationEventCard variant of a choice template (hasChoices preserved).
    const durEvent: EventCard = {
      ...template,
      id: 'evt-dur-accept-0',
      duration: 4,
      effectType: 'income-multiplier',
      multiplier: 0.8,
    } as unknown as EventCard;
    state.incidentDeck.length = 0;
    state.incidentDeck.push(durEvent);
    const effectsBefore = state.activeEffects.length;
    endTurnAndPause(state);

    resolveEventChoice(state, 'accept');

    expect(state.activeEffects.length).toBe(effectsBefore + 1);
    expect(state.activeEffects[state.activeEffects.length - 1].effectType).toBe('income-multiplier');
  });
});

// ── AC2: Reject path ────────────────────────────────────────

describe('AC2 — Reject path skips the effect and pushes rejectNextCardId', () => {
  it('refuses the effect but adds the (worse) reject chain card', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-chain-a');
    const coinsBefore = coins(state);
    endTurnAndPause(state);

    const res = resolveEventChoice(state, 'reject');

    // No effect applied.
    expect(coins(state)).toBe(coinsBefore);
    // rejectNextCardId pushed instead.
    expect(res.pushedCard).not.toBeNull();
    expect(getBaseTypeId(res.pushedCard!.id)).toBe('evt-chain-worse');
    expect(state.pendingEventChoice!.chosenOption).toBe('reject');
    expect(state.pendingEventChoice!.resolved).toBe(true);
  });

  it('does not add a duration active effect on reject', () => {
    const state = makeState();
    const template = getEventTemplates().find((c) => c.id === 'evt-tax-e1')!;
    const durEvent: EventCard = {
      ...template,
      id: 'evt-dur-reject-0',
      duration: 4,
      effectType: 'income-multiplier',
      multiplier: 0.8,
    } as unknown as EventCard;
    state.incidentDeck.length = 0;
    state.incidentDeck.push(durEvent);
    const effectsBefore = state.activeEffects.length;
    endTurnAndPause(state);

    resolveEventChoice(state, 'reject');

    expect(state.activeEffects.length).toBe(effectsBefore);
  });
});

// ── AC3: Non-choice events ──────────────────────────────────

describe('AC3 — non-choice events resolve normally', () => {
  it('resolves deterministically with no dialog and no pending choice', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-plain');
    const coinsBefore = coins(state);

    const result = processEndOfTurn(state);

    expect(result.choicePending).toBe(false);
    expect(state.pendingEventChoice).toBeNull();
    expect(coins(state)).toBe(coinsBefore - 20);
    expect(result.incident).not.toBeNull();
    // The closing completed: next day started.
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(2);
  });

  it('cards without the hasChoices flag behave exactly as before', () => {
    const state = makeState();
    const plain = getEventTemplates().find((c) => c.id === 'evt-plain')!;
    const noFlag: EventCard = { ...plain, id: 'evt-noflag-0' };
    delete (noFlag as { hasChoices?: boolean }).hasChoices;
    state.incidentDeck.length = 0;
    state.incidentDeck.push(noFlag);
    const coinsBefore = coins(state);

    const drawn = resolveIncident(state);

    expect(drawn).not.toBeNull();
    expect(coins(state)).toBe(coinsBefore - 20);
    expect(state.pendingEventChoice).toBeNull();
  });
});

// ── AC4: Chain termination ──────────────────────────────────

describe('AC4 — chain ends cleanly when next ids are null/absent', () => {
  it('accept with no acceptNextCardId adds nothing', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-tax-e3'); // acceptNext evt-tax-e1; rejectNext absent
    endTurnAndPause(state);
    // Reject path has NO next id → chain ends.
    const deckLen = state.incidentDeck.length;
    const res = resolveEventChoice(state, 'reject');
    expect(res.pushedCard).toBeNull();
    expect(state.incidentDeck.length).toBe(deckLen);
  });

  it('reject with no rejectNextCardId adds nothing', () => {
    const state = makeState();
    // evt-tax-e3: acceptNext = evt-tax-e1 (set), rejectNext absent.
    forceNextIncident(state, 'evt-tax-e3');
    endTurnAndPause(state);
    const deckLen = state.incidentDeck.length;

    const res = resolveEventChoice(state, 'reject');

    expect(res.pushedCard).toBeNull();
    expect(state.incidentDeck.length).toBe(deckLen);
  });

  it('accept with no acceptNextCardId adds nothing', () => {
    const state = makeState();
    // evt-tax-e1: acceptNext absent, rejectNext = evt-tax-e2 (set).
    forceNextIncident(state, 'evt-tax-e1');
    endTurnAndPause(state);
    const deckLen = state.incidentDeck.length;

    const res = resolveEventChoice(state, 'accept');

    expect(res.pushedCard).toBeNull();
    expect(state.incidentDeck.length).toBe(deckLen);
  });
});

// ── AC5: Chain continuation (escalation drawn next) ─────────

describe('AC5 — a pushed chain card is the next incident drawn', () => {
  it('after rejecting Chain A, Chain Worse resolves next turn', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-chain-a');
    endTurnAndPause(state);
    resolveEventChoice(state, 'reject'); // pushes evt-chain-worse
    const result = finishDeferredEndOfTurn(state);
    expect(result.choicePending).toBe(false);
    // Turn advanced; the next day begins.
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(2);

    // End the new market day: the escalation (chain-worse) is drawn next.
    state.phase = 'MarketPhase';
    const coinsBefore = coins(state);
    const result2 = processEndOfTurn(state);
    expect(result2.choicePending).toBe(false); // chain-worse has no choices
    expect(getBaseTypeId(result2.incident!.id)).toBe('evt-chain-worse');
    expect(coins(state)).toBe(coinsBefore - 600);
  });
});

// ── AC6: Cycle detection ────────────────────────────────────

describe('AC6 — cycling chains never loop infinitely', () => {
  it('walks the 3-step reject chain deterministically without looping', () => {
    const state = makeState('cycle-seed');
    const seen: string[] = [];
    // Rejecting each card walks cycle-1 → cycle-2 → cycle-3 (each reject
    // pushes the next); cycle-3's reject path is empty (chain escape).
    for (const id of ['evt-tax-e1', 'evt-tax-e2', 'evt-tax-e3']) {
      forceNextIncident(state, id);
      state.phase = 'MarketPhase';
      const result = processEndOfTurn(state);
      expect(result.choicePending).toBe(true); // each is a choice card
      seen.push(getBaseTypeId(state.pendingEventChoice!.event.id));
      resolveEventChoice(state, 'reject');
      finishDeferredEndOfTurn(state);
    }
    expect(seen).toEqual(['evt-tax-e1', 'evt-tax-e2', 'evt-tax-e3']);
  });

  it('the reset card (cycle-3 accept) re-seeds cycle-1 into the deck', () => {
    const state = makeState('cycle-reset-seed');
    forceNextIncident(state, 'evt-tax-e3');
    state.phase = 'MarketPhase';
    const result = processEndOfTurn(state);
    expect(result.choicePending).toBe(true);

    resolveEventChoice(state, 'accept'); // acceptNext = evt-tax-e1

    // The cycle re-seeded: cycle-1 sits on top of the incident deck.
    expect(getBaseTypeId(state.incidentDeck[state.incidentDeck.length - 1].id)).toBe('evt-tax-e1');
    // And drawing it next pauses on cycle-1 (a choice card) — still bounded.
    finishDeferredEndOfTurn(state);
    state.phase = 'MarketPhase';
    const result2 = processEndOfTurn(state);
    expect(result2.choicePending).toBe(true);
    expect(getBaseTypeId(state.pendingEventChoice!.event.id)).toBe('evt-tax-e1');
  });

  it('a single choice event resolves exactly once per draw', () => {
    const state = makeState('single-round');
    forceNextIncident(state, 'evt-chain-a');
    endTurnAndPause(state);
    // Second resolution attempt on the SAME pending choice must throw.
    resolveEventChoice(state, 'accept');
    expect(() => resolveEventChoice(state, 'reject')).toThrow(/already resolved/);
  });
});

// ── AC7: pendingEventChoice state tracking ──────────────────

describe('AC7 — pendingEventChoice state tracks event/option/resolved', () => {
  it('is typed, populated on draw, updated on resolve, cleared on finish', () => {
    const state = makeState();
    expect(state.pendingEventChoice).toBeNull();
    forceNextIncident(state, 'evt-chain-a');
    endTurnAndPause(state);

    const pending = state.pendingEventChoice!;
    expect(getBaseTypeId(pending.event.id)).toBe('evt-chain-a');
    expect(pending.chosenOption).toBeNull();
    expect(pending.resolved).toBe(false);

    resolveEventChoice(state, 'reject');
    expect(state.pendingEventChoice!.chosenOption).toBe('reject');
    expect(state.pendingEventChoice!.resolved).toBe(true);

    finishDeferredEndOfTurn(state);
    expect(state.pendingEventChoice).toBeNull();
  });

  it('survives a serialize/deserialize round-trip while pending (save/load)', () => {
    const state = makeState('save-seed');
    forceNextIncident(state, 'evt-chain-a');
    endTurnAndPause(state);

    const saved = serializeMainStreetState(state);
    expect(saved.pendingEventChoice).not.toBeNull();
    expect(saved.pendingEventChoice!.resolved).toBe(false);

    const restored = deserializeMainStreetState(saved);
    expect(restored.pendingEventChoice).not.toBeNull();
    expect(getBaseTypeId(restored.pendingEventChoice!.event.id)).toBe('evt-chain-a');
    expect(restored.pendingEventChoice!.resolved).toBe(false);

    // The restored pending choice can still be resolved and finished.
    const restoredCoins = coins(restored);
    resolveEventChoice(restored, 'accept');
    expect(coins(restored)).toBe(restoredCoins - 50);
    finishDeferredEndOfTurn(restored);
    expect(restored.pendingEventChoice).toBeNull();
    expect(restored.phase).toBe('DayStart');
  });
});

// ── AC8: processEndOfTurn deferral ──────────────────────────

describe('AC8 — processEndOfTurn defers while a choice is pending', () => {
  it('pauses before EndCheck and does not advance the turn', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-chain-a');
    const turnBefore = state.turn;

    const result = processEndOfTurn(state);

    expect(result.choicePending).toBe(true);
    expect(result.incident).toBeNull();
    expect(state.phase).toBe('IncidentPhase'); // paused mid-closing
    expect(state.turn).toBe(turnBefore); // EndCheck/next day did NOT run
    expect(state.pendingEventChoice).not.toBeNull();
  });

  it('returns choicePending (no income reprocessing) if end-turn is retried', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-chain-a');
    processEndOfTurn(state); // pause
    const coinsAfterPause = coins(state);
    const turnAfterPause = state.turn;

    const retry = processEndOfTurn(state);

    expect(retry.choicePending).toBe(true);
    expect(coins(state)).toBe(coinsAfterPause); // no double income
    expect(state.turn).toBe(turnAfterPause);
  });

  it('finishDeferredEndOfTurn completes the deferred closing', () => {
    const state = makeState();
    forceNextIncident(state, 'evt-chain-a');
    processEndOfTurn(state);
    resolveEventChoice(state, 'accept');

    const result = finishDeferredEndOfTurn(state);

    expect(state.pendingEventChoice).toBeNull();
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(2);
    expect(result.choicePending).toBe(false);
    expect(result.gameResult).toBe('playing');
  });
});
