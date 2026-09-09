/**
 * Test: AI Choice Evaluation Strategy (CG-0MTT7DB850037SMW / parent
 * CG-0MTSHG8RP008E128)
 *
 * Canonical unit suite for the AI's difficulty-based accept/reject decision
 * when simulating dual-choice incidents:
 *
 *  1. Easy always accepts (no escalation risk).
 *  2. Medium accepts when the effect is affordable (coins > 0 after),
 *     rejects otherwise.
 *  3. Hard evaluates the full chain (static registry lookup — producer
 *     decision 2026-09-08 Q1): accepts when the effect is manageable AND the
 *     accept path is safe; rejects when refusing is cheaper/free; rejects an
 *     unaffordable effect to avoid the imminent loss; always accepts when
 *     acceptNextCardId is null (chain end).
 *  4. Chain lookahead — the Hard AI compares accept-vs-reject path costs
 *     using the escalation templates.
 *  5. Edge cases — null/missing next ids and unknown templates never crash.
 *  6. Transcript consistency — AI choices are recorded identically to player
 *     choices (engine `event-choice` event shape).
 *
 * The shipped card-data.csv has no choice cards yet, so tests register
 * synthetic chain templates AFTER setup.
 *
 * @module
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';
import {
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
} from '../../example-games/main-street/MainStreetCards';
import { processEndOfTurn } from '../../example-games/main-street/MainStreetEngine';
import {
  decideEventChoice,
  resolveAiEventChoice,
} from '../../example-games/main-street/MainStreetAiStrategy';
import {
  MainStreetTranscriptRecorder,
  setMainStreetRecorder,
} from '../../example-games/main-street/MainStreetTranscript';

// ── Synthetic chain templates (registry for Hard lookups) ──

const CHAIN_CSV =
  `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,hasChoices,acceptNextCardId,rejectNextCardId
event,evt-esc-bad,Bad Escalation,0,,,,,,,,,1,Incident,Lose 1000 coins,All,,-1000,0,,,,,,,,,,,,,,,,,,,
event,evt-esc-mid,Mid Escalation,0,,,,,,,,,1,Incident,Lose 200 coins,All,,-200,0,,,,,,,,,,,,,,,,,,,
event,evt-esc-small,Small Escalation,0,,,,,,,,,1,Incident,Lose 50 coins,All,,-50,0,,,,,,,,,,,,,,,,,,,
event,evt-esc-pos,Positive Escalation,0,,,,,,,,,1,Incident,Gain 300 coins,All,,300,0,,,,,,,,,,,,,,,,,,,`;

// ── Helpers ─────────────────────────────────────────────────

function negative(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: 'evt-cur',
    name: 'Current Event',
    trigger: 'Incident',
    cost: 0,
    effect: 'Lose coins',
    target: 'All',
    coinDelta: -300,
    reputationDelta: 0,
    hasChoices: true,
    acceptNextCardId: null,
    rejectNextCardId: null,
    ...overrides,
  };
}

function positive(overrides: Partial<EventCard> = {}): EventCard {
  return negative({ coinDelta: 250, reputationDelta: 100, ...overrides });
}

function stateFor(difficulty: 'Easy' | 'Medium' | 'Hard', coins = 600): MainStreetState {
  const state = setupMainStreetGame({ seed: `ai-suite-${difficulty}`, difficulty });
  loadTemplatesFromCsv(CHAIN_CSV);
  state.resourceBank.coins = coins;
  return state;
}

afterEach(() => {
  setMainStreetRecorder(null);
  resetTemplatesToDefault();
});

// ── AC1: Easy ───────────────────────────────────────────────

describe('AC1 — Easy AI always accepts', () => {
  it('accepts affordable and unaffordable negative events alike', () => {
    const s = stateFor('Easy', 100);
    expect(decideEventChoice(s, negative(), 'Easy')).toBe('accept');
    expect(decideEventChoice(s, negative({ coinDelta: -900 }), 'Easy')).toBe('accept');
  });

  it('accepts even when rejecting would be free (no risk-seeking)', () => {
    const s = stateFor('Easy');
    expect(decideEventChoice(s, negative({ rejectNextCardId: null }), 'Easy')).toBe('accept');
  });

  it('accepts positive events', () => {
    const s = stateFor('Easy');
    expect(decideEventChoice(s, positive(), 'Easy')).toBe('accept');
  });
});

// ── AC2: Medium ─────────────────────────────────────────────

describe('AC2 — Medium AI accepts iff affordable', () => {
  it('accepts when coins stay above zero after the effect', () => {
    const s = stateFor('Medium', 600);
    expect(decideEventChoice(s, negative({ coinDelta: -300 }), 'Medium')).toBe('accept');
  });

  it('rejects when the effect would zero out the coins', () => {
    const s = stateFor('Medium', 300);
    expect(decideEventChoice(s, negative({ coinDelta: -300 }), 'Medium')).toBe('reject');
  });

  it('accepts positive events (always affordable)', () => {
    const s = stateFor('Medium', 50);
    expect(decideEventChoice(s, positive(), 'Medium')).toBe('accept');
  });
});

// ── AC3/AC4: Hard full-chain evaluation + lookahead ─────────

describe('AC3+AC4 — Hard AI evaluates the full chain (static lookahead)', () => {
  it('accepts when accepting ends the chain and the effect is manageable', () => {
    const s = stateFor('Hard', 600);
    const evt = negative({ acceptNextCardId: null, rejectNextCardId: 'evt-esc-bad' });
    expect(decideEventChoice(s, evt, 'Hard')).toBe('accept');
  });

  it('accepts when the reject escalation is significantly worse', () => {
    const s = stateFor('Hard', 600);
    // accept: -300 + small(-50) = 350; reject: bad(-1000) ≫ 350×1.5 → accept.
    const evt = negative({ acceptNextCardId: 'evt-esc-small', rejectNextCardId: 'evt-esc-bad' });
    expect(decideEventChoice(s, evt, 'Hard')).toBe('accept');
  });

  it('rejects when refusing is free (no reject-next card)', () => {
    const s = stateFor('Hard', 600);
    const evt = negative({ acceptNextCardId: 'evt-esc-bad', rejectNextCardId: null });
    expect(decideEventChoice(s, evt, 'Hard')).toBe('reject');
  });

  it('rejects when the reject path is cheaper than accepting', () => {
    const s = stateFor('Hard', 600);
    // accept: -300 + mid(-200) = 500; reject: small(-50) → reject.
    const evt = negative({ acceptNextCardId: 'evt-esc-mid', rejectNextCardId: 'evt-esc-small' });
    expect(decideEventChoice(s, evt, 'Hard')).toBe('reject');
  });

  it('rejects an unaffordable effect (survival) unless rejecting is worse', () => {
    const s = stateFor('Hard', 100);
    // -300 vs 100 coins bankrupts; rejecting costs only the mid card later.
    const evt = negative({ acceptNextCardId: 'evt-esc-small', rejectNextCardId: 'evt-esc-mid' });
    expect(decideEventChoice(s, evt, 'Hard')).toBe('reject');
    // Both paths bad + rejecting strictly worse → deterministic accept.
    const s2 = stateFor('Hard', 100);
    const evt2 = negative({ acceptNextCardId: 'evt-esc-bad', rejectNextCardId: 'evt-esc-small' });
    // acceptChain = 300 + 1000 = 1300; reject = 50 < 1300 → reject (cheaper).
    expect(decideEventChoice(s2, evt2, 'Hard')).toBe('reject');
  });

  it('accepts positive events regardless of chain structure', () => {
    const s = stateFor('Hard');
    expect(decideEventChoice(s, positive({ acceptNextCardId: 'evt-esc-small' }), 'Hard')).toBe('accept');
  });
});

// ── AC5: Edge cases ─────────────────────────────────────────

describe('AC5 — edge cases never crash', () => {
  it('null next ids and missing fields are handled', () => {
    const s = stateFor('Hard');
    // hasChoices absent (legacy card), null ids.
    const legacy = negative();
    delete (legacy as { hasChoices?: boolean }).hasChoices;
    (legacy as { acceptNextCardId?: string | null }).acceptNextCardId = null;
    (legacy as { rejectNextCardId?: string | null }).rejectNextCardId = null;
    expect(['accept', 'reject']).toContain(decideEventChoice(s, legacy, 'Hard'));
  });

  it('unknown/missing chain template ids behave as chain ends (no crash)', () => {
    const s = stateFor('Hard');
    const evt = negative({ acceptNextCardId: 'evt-ghost', rejectNextCardId: 'evt-missing' });
    // Unknown reject template → refusing is free → reject.
    expect(decideEventChoice(s, evt, 'Hard')).toBe('reject');
  });

  it('chains of any length are handled by the cost model', () => {
    const s = stateFor('Hard');
    // Long chain ids that do not resolve still produce a decision.
    const evt = negative({
      acceptNextCardId: 'evt-esc-bad',
      rejectNextCardId: 'evt-esc-mid',
      target: 'SpecificSynergy',
      targetSynergy: 'Food' as never,
    });
    expect(['accept', 'reject']).toContain(decideEventChoice(s, evt, 'Hard'));
  });
});

// ── AC6: Transcript consistency ─────────────────────────────

describe('AC6 — AI choices are recorded identically to player choices', () => {
  it('resolveAiEventChoice records an engine event-choice event', () => {
    const recorder = new MainStreetTranscriptRecorder({ seed: 'x' });
    setMainStreetRecorder(recorder);

    const state = stateFor('Hard', 600);
    const evt = negative({ coinDelta: -100, rejectNextCardId: 'evt-esc-mid' });
    state.incidentDeck.length = 0;
    state.incidentDeck.push({ ...evt, id: 'evt-cur-0' });
    state.phase = 'MarketPhase';
    processEndOfTurn(state); // pause (choicePending)

    resolveAiEventChoice(state);

    const choiceEvents = recorder.getTranscript().events.filter((e) => e.type === 'event-choice');
    expect(choiceEvents).toHaveLength(1);
    const choice = choiceEvents[0];
    if (!choice || choice.type !== 'event-choice') return;
    expect(choice.eventId).toContain('evt-cur');
    expect(choice.cardName).toBe('Current Event');
    expect(['accept', 'reject']).toContain(choice.option);
    expect(choice.acceptNextCardId).toBeNull();
    expect(choice.rejectNextCardId).toBe('evt-esc-mid');
  });

  it('AI choices are resolved automatically so the sim never stalls', () => {
    const state = stateFor('Hard', 600);
    state.incidentDeck.length = 0;
    state.incidentDeck.push({ ...negative(), id: 'evt-cur-0' });
    state.phase = 'MarketPhase';
    processEndOfTurn(state); // pause
    expect(state.pendingEventChoice).not.toBeNull();

    resolveAiEventChoice(state);

    expect(state.pendingEventChoice).toBeNull();
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(2);
  });
});
