/**
 * AI: Difficulty-Based Choice Evaluation (CG-0MTT7EQZP005NWGQ / parent
 * CG-0MTSHG8RP008E128)
 *
 * Unit tests for the AI's accept/reject decision when it encounters a
 * dual-choice incident during simulation:
 *
 * - Easy   always accepts (avoids escalation risk).
 * - Medium accepts when the effect is affordable (coins > 0 after), rejects
 *   otherwise.
 * - Hard   static full-chain evaluation (registry lookup, no turn simulation
 *   — producer decision 2026-09-08 Q1): accepts when accepting ends the
 *   chain and is manageable / when the reject escalation is significantly
 *   worse; rejects when rejecting is cheaper or free.
 * - resolveAiEventChoice completes the deferred closing so sims never stall.
 *
 * The shipped card-data.csv has no choice cards yet (content child
 * CG-0MTT7FC7A000AA58), so tests build events directly and register chain
 * templates via loadTemplatesFromCsv AFTER setup (decks are built from the
 * bundled data; only registry lookups are synthetic).
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
import {
  processEndOfTurn,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';
import {
  decideEventChoice,
  resolveAiEventChoice,
  projectEventCoinDelta,
} from '../../example-games/main-street/MainStreetAiStrategy';

// ── Synthetic chain templates (registry for Hard lookups) ──

const CHAIN_CSV =
  `family,id,name,cost,baseIncome,synergyTypes,upgradePath,maxLevel,reputationPerTurn,synergyCoinBonus,synergyRepBonus,description,tier,trigger,effect,target,targetSynergy,coinDelta,reputationDelta,duration,effectType,multiplier,targetBusiness,incomeBonus,synergyRangeBonus,requiredLevel,reputationBonus,newDisplayName,ongoingCost,handSlotsAdded,refreshCostDiscount,actionsPerTurn,peekOncePerTurn,art_notes,hasChoices,acceptNextCardId,rejectNextCardId
event,evt-chain-bad,Bad Escalation,0,,,,,,,,,1,Incident,Very bad,All,,-1000,0,,,,,,,,,,,,,,,,,,,
event,evt-chain-mid,Mid Escalation,0,,,,,,,,,1,Incident,Mid,All,,-200,0,,,,,,,,,,,,,,,,,,,
event,evt-chain-small,Small Escalation,0,,,,,,,,,1,Incident,Small,All,,-50,0,,,,,,,,,,,,,,,,,,,
event,evt-chain-positive,Positive Esc,0,,,,,,,,,1,Incident,Positive,All,,50,0,,,,,,,,,,,,,,,,,,,`;

// ── Helpers ─────────────────────────────────────────────────

function makeNegativeEvent(overrides: Partial<EventCard> = {}): EventCard {
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

function makeState(difficulty: 'Easy' | 'Medium' | 'Hard', coins = 600): MainStreetState {
  const state = setupMainStreetGame({ seed: `ai-choice-${difficulty}`, difficulty });
  loadTemplatesFromCsv(CHAIN_CSV); // register escalation templates for Hard lookups
  state.resourceBank.coins = coins;
  return state;
}

afterEach(() => {
  resetTemplatesToDefault();
});

// ── Easy: always accept ─────────────────────────────────────

describe('Easy difficulty always accepts', () => {
  it('accepts an unaffordable negative event', () => {
    const state = makeState('Easy', 100);
    expect(decideEventChoice(state, makeNegativeEvent({ coinDelta: -300 }), 'Easy')).toBe('accept');
  });

  it('accepts a negative event with a worse reject escalation', () => {
    const state = makeState('Easy', 600);
    const evt = makeNegativeEvent({ rejectNextCardId: 'evt-chain-bad' });
    expect(decideEventChoice(state, evt, 'Easy')).toBe('accept');
  });

  it('accepts a positive event', () => {
    const state = makeState('Easy');
    const evt = makeNegativeEvent({ coinDelta: 200, reputationDelta: 100 });
    expect(decideEventChoice(state, evt, 'Easy')).toBe('accept');
  });
});

// ── Medium: accept iff affordable ───────────────────────────

describe('Medium difficulty affordability', () => {
  it('accepts when coins stay above zero after the effect', () => {
    const state = makeState('Medium', 600);
    const evt = makeNegativeEvent({ coinDelta: -300 });
    expect(decideEventChoice(state, evt, 'Medium')).toBe('accept');
  });

  it('rejects when the effect would bankrupt the player', () => {
    const state = makeState('Medium', 100);
    const evt = makeNegativeEvent({ coinDelta: -300 });
    expect(decideEventChoice(state, evt, 'Medium')).toBe('reject');
  });

  it('accepts a positive event (always affordable)', () => {
    const state = makeState('Medium');
    const evt = makeNegativeEvent({ coinDelta: 200 });
    expect(decideEventChoice(state, evt, 'Medium')).toBe('accept');
  });
});

// ── Hard: static full-chain evaluation ──────────────────────

describe('Hard difficulty chain evaluation', () => {
  it('accepts when accepting ends the chain and the effect is manageable', () => {
    const state = makeState('Hard', 600);
    const evt = makeNegativeEvent({ coinDelta: -300, acceptNextCardId: null, rejectNextCardId: 'evt-chain-bad' });
    expect(decideEventChoice(state, evt, 'Hard')).toBe('accept');
  });

  it('accepts when rejecting would pull a significantly worse card', () => {
    const state = makeState('Hard', 600);
    // Accept: -300 now + small card (-50) later = 350. Reject: bad card (-1000).
    // 1000 > 350 * 1.5 → rejecting is significantly worse → accept.
    const evt = makeNegativeEvent({ coinDelta: -300, acceptNextCardId: 'evt-chain-small', rejectNextCardId: 'evt-chain-bad' });
    expect(decideEventChoice(state, evt, 'Hard')).toBe('accept');
  });

  it('rejects when rejecting is free (no reject-next card)', () => {
    const state = makeState('Hard', 600);
    const evt = makeNegativeEvent({ coinDelta: -300, acceptNextCardId: 'evt-chain-bad', rejectNextCardId: null });
    // Accept would apply -300 now AND chain the bad card later; rejecting
    // skips both (nothing added) → reject.
    expect(decideEventChoice(state, evt, 'Hard')).toBe('reject');
  });

  it('rejects when the reject path is cheaper than accepting', () => {
    const state = makeState('Hard', 600);
    // Accept: -300 + mid (-200) = 500. Reject: small (-50). → reject.
    const evt = makeNegativeEvent({ coinDelta: -300, acceptNextCardId: 'evt-chain-mid', rejectNextCardId: 'evt-chain-small' });
    expect(decideEventChoice(state, evt, 'Hard')).toBe('reject');
  });

  it('rejects an unaffordable effect when rejecting avoids the immediate loss', () => {
    const state = makeState('Hard', 100);
    const evt = makeNegativeEvent({ coinDelta: -300, acceptNextCardId: 'evt-chain-small', rejectNextCardId: 'evt-chain-mid' });
    // -300 with 100 coins bankrupts; rejecting costs only the mid card later.
    expect(decideEventChoice(state, evt, 'Hard')).toBe('reject');
  });

  it('accepts positive events', () => {
    const state = makeState('Hard');
    const evt = makeNegativeEvent({ coinDelta: 150, reputationDelta: 50 });
    expect(decideEventChoice(state, evt, 'Hard')).toBe('accept');
  });

  it('handles missing/unknown chain templates without crashing (severity 0 → reject is free)', () => {
    const state = makeState('Hard', 600);
    const evt = makeNegativeEvent({ coinDelta: -300, acceptNextCardId: 'evt-does-not-exist', rejectNextCardId: 'evt-missing-too' });
    // Unknown reject template behaves like no reject-next card → rejecting is
    // free (refuse the -300 now) → reject.
    expect(decideEventChoice(state, evt, 'Hard')).toBe('reject');
  });
});

// ── projection helper ───────────────────────────────────────

describe('projectEventCoinDelta mirrors engine deltas (static)', () => {
  it('returns the raw delta for an All-target loss', () => {
    const state = makeState('Medium', 600);
    expect(projectEventCoinDelta(state, makeNegativeEvent({ coinDelta: -300, target: 'All' }))).toBe(-300);
  });

  it('scales SpecificSynergy by the number of matching businesses', () => {
    const state = makeState('Medium', 600);
    // Place two Food businesses on the grid.
    const biz = {
      family: 'business' as const, id: 'biz-f', name: 'Food', cost: 1, baseIncome: 1,
      synergyTypes: ['Food'] as never[], maxLevel: 0, description: '', level: 0, incomeBonus: 0,
      synergyRangeBonus: 0, reputationBonus: 0, ongoingCost: 0,
    };
    state.streetGrid[0] = biz;
    state.streetGrid[1] = biz;
    const evt = makeNegativeEvent({ coinDelta: -50, target: 'SpecificSynergy', targetSynergy: 'Food' as never });
    expect(projectEventCoinDelta(state, evt)).toBe(-100);
  });
});

// ── resolveAiEventChoice integration ────────────────────────

describe('resolveAiEventChoice resolves a paused sim turn', () => {
  function pauseWithChoice(difficulty: 'Easy' | 'Medium' | 'Hard'): MainStreetState {
    const state = makeState(difficulty);
    // Queue a choice incident and end the turn: income runs, then the
    // incident draw pauses the closing with choicePending.
    const evt = makeNegativeEvent({
      id: 'evt-sim-choice',
      coinDelta: -100, // small manageable loss
      rejectNextCardId: 'evt-chain-mid',
    });
    state.incidentDeck.length = 0;
    state.incidentDeck.push({ ...evt, id: 'evt-sim-choice-0' });
    state.phase = 'MarketPhase';
    const result: TurnResult = processEndOfTurn(state);
    expect(result.choicePending).toBe(true); // sanity: paused
    return state;
  }

  it('decides per difficulty and completes the deferred closing', () => {
    const state = pauseWithChoice('Easy');
    const turnBefore = state.turn;
    const coinsBefore = state.resourceBank.coins;

    resolveAiEventChoice(state);

    expect(state.pendingEventChoice).toBeNull();
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(turnBefore + 1);
    // Easy accepted → the -100 effect applied during resolution.
    expect(state.resourceBank.coins).toBe(coinsBefore - 100);
  });

  it('Hard AI rejecting keeps resources unchanged and advances the day', () => {
    const state = makeState('Hard', 600);
    // Harsh event: accepting chains a -1000 card; rejecting adds nothing →
    // Hard rejects (refusing the -300 now is free).
    const evt = makeNegativeEvent({
      id: 'evt-sim-choice2',
      coinDelta: -300,
      acceptNextCardId: 'evt-chain-bad',
      rejectNextCardId: null,
    });
    state.incidentDeck.length = 0;
    state.incidentDeck.push({ ...evt, id: 'evt-sim-choice2-0' });
    state.phase = 'MarketPhase';
    processEndOfTurn(state); // pause
    const coinsBefore = state.resourceBank.coins;

    resolveAiEventChoice(state);

    expect(state.pendingEventChoice).toBeNull();
    expect(state.phase).toBe('DayStart');
    // Reject skipped the -300 effect.
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });
});
