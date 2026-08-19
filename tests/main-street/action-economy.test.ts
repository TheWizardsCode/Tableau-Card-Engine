/**
 * Main Street: Action Economy Tests (CG-0MSTOF1N5005PK2R)
 *
 * Validates the single-daily-action budget:
 * - Initial value and DayStart reset (1 action; 2 with a General Manager employed)
 * - Action-type operations spend the budget; free operations do not
 * - Budget-spent enforcement (rejects further action-type operations)
 * - Buy-and-place premium pricing (+50%, rounded up to nearest 0.5)
 * - Serialization round-trip / legacy-save migration of actionsRemaining
 * - General Manager card template stats
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import {
  getStaffCardTemplates,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Builds a minimal business card with a known cost. */
function makeBiz(id: string, name: string, cost: number): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 0.5,
    synergyTypes: [],
    maxLevel: 1,
    description: 'test card',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
}

/** Builds a minimal Investment-trigger event card. */
function makeEvent(id: string, name: string, cost: number) {
  return {
    family: 'event' as const,
    id,
    name,
    trigger: 'Investment' as const,
    cost,
    effect: 'test effect',
    target: 'All' as const,
    coinDelta: 1,
    reputationDelta: 0,
  };
}

/** Finds the General Manager staff template (must exist post-CSV update). */
function gmTemplate() {
  const gm = getStaffCardTemplates().find(t => t.id === 'staff-general-manager');
  if (!gm) throw new Error('staff-general-manager template missing from card-data.csv');
  return gm;
}

// ── General Manager Card ────────────────────────────────────

describe('General Manager staff card', () => {
  it('exists in the CSV with cost 20, ongoing 5, +4 hand slots, +1 action/turn', () => {
    const gm = gmTemplate();
    expect(gm.cost).toBe(20);
    expect(gm.ongoingCost).toBe(5);
    expect(gm.handSlotsAdded).toBe(4);
    expect(gm.actionsPerTurn).toBe(1);
  });

  it('is present in the staff card market of a new game', () => {
    const state = setupMainStreetGame({ seed: 'gm-market' });
    const inMarket = state.staffCardMarket.some(c => c.id.startsWith('staff-general-manager'));
    expect(inMarket).toBe(true);
  });
});

// ── Budget State & Reset ────────────────────────────────────

describe('actionsRemaining budget', () => {
  it('starts at 1 for a fresh game state', () => {
    const state = setupMainStreetGame({ seed: 'fresh' });
    expect(state.actionsRemaining).toBe(1);
  });

  it('resets to 1 at DayStart when no action-boosting staff are employed', () => {
    const state = setupMainStreetGame({ seed: 'reset-basic' });
    state.phase = 'DayStart';
    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(1);
  });

  it('resets to 2 at DayStart while a General Manager is employed (+1 action)', () => {
    const state = setupMainStreetGame({ seed: 'reset-gm' });
    state.staffCards.push({ ...gmTemplate() });
    state.phase = 'DayStart';
    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(2);
  });

  it('is refreshed each new day after processEndOfTurn', () => {
    const state = setupMainStreetGame({ seed: 'day-cycle' });
    state.resourceBank.coins = 100;
    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(1);

    // Spend the single action
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);

    processEndOfTurn(state);
    expect(state.phase).toBe('DayStart');

    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(1);
  });
});

// ── Action Spend ────────────────────────────────────────────

describe('action spend', () => {
  it('move-to-hand consumes the single daily action', () => {
    const state = setupMainStreetGame({ seed: 'spend-move' });
    executeDayStart(state, true);
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);
  });

  it('buy-business consumes the single daily action', () => {
    const state = setupMainStreetGame({ seed: 'spend-buy' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[0]).not.toBeNull();
  });

  it('play-business-from-hand consumes the single daily action', () => {
    const state = setupMainStreetGame({ seed: 'spend-play' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.hand.push(makeBiz('biz-play', 'Play Me', 3));
    executeAction(state, { type: 'play-business-from-hand', handIndex: 0, slotIndex: 0 });
    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[0]).not.toBeNull();
  });

  it('buy-and-place consumes the single daily action', () => {
    const state = setupMainStreetGame({ seed: 'spend-bap' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.market.cards = [makeBiz('biz-bap', 'BAP', 3)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-bap', slotIndex: 0 });
    expect(state.actionsRemaining).toBe(0);
  });

  it('hire-staff consumes the single daily action', () => {
    const state = setupMainStreetGame({ seed: 'spend-hire' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const gm = state.staffCardMarket.find(c => c.id.startsWith('staff-general-manager'));
    if (!gm) throw new Error('GM not in staff market');
    executeAction(state, { type: 'hire-staff', cardId: gm.id });
    expect(state.actionsRemaining).toBe(0);
    expect(state.staffCards.length).toBe(1);
    expect(state.staffCards[0].actionsPerTurn).toBe(1);
    expect(state.maxHandSize).toBe(3 + 4);
  });
});

// ── Free Operations ─────────────────────────────────────────

describe('free (non-action) operations', () => {
  it('discard-from-hand does not consume an action', () => {
    const state = setupMainStreetGame({ seed: 'free-discard' });
    executeDayStart(state, true);
    state.hand.push(makeBiz('biz-discard', 'Discard Me', 3));
    executeAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.length).toBe(0);
  });

  it('buy-event does not consume an action', () => {
    const state = setupMainStreetGame({ seed: 'free-event' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.market.cards.push(makeEvent('evt-test', 'Test Event', 2) as never);
    executeAction(state, { type: 'buy-event', cardId: 'evt-test' });
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.some(c => c.id === 'evt-test')).toBe(true);
  });

  it('play-event-from-hand does not consume an action', () => {
    const state = setupMainStreetGame({ seed: 'free-play-event' });
    executeDayStart(state, true);
    state.hand.push(makeEvent('evt-play', 'Play Event', 2) as never);
    executeAction(state, { type: 'play-event-from-hand', handIndex: 0 });
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.some(c => c.id === 'evt-play')).toBe(false);
  });

  it('end-turn is allowed even with the budget spent', () => {
    const state = setupMainStreetGame({ seed: 'free-end' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);
    expect(executeAction(state, { type: 'end-turn' })).toBeNull();
  });
});

// ── Budget-Spent Enforcement ────────────────────────────────

describe('budget enforcement', () => {
  it('rejects action-type operations when the budget is spent', () => {
    const state = setupMainStreetGame({ seed: 'enforce' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);

    expect(() => executeAction(state, { type: 'move-to-hand', cardId: state.market.cards[0].id }))
      .toThrow(/No actions remaining/);
    expect(() => executeAction(state, { type: 'buy-business', cardId: state.market.cards[0].id, slotIndex: 0 }))
      .toThrow(/No actions remaining/);
    expect(() => executeAction(state, { type: 'hire-staff', cardId: state.staffCardMarket[0].id }))
      .toThrow(/No actions remaining/);
  });
});

// ── Buy-and-Place Premium ───────────────────────────────────

describe('buy-and-place premium pricing', () => {
  it('charges cost × 1.5 rounded up to nearest 0.5 (3 → 4.5)', () => {
    const state = setupMainStreetGame({ seed: 'premium-3' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.market.cards = [makeBiz('biz-prem3', 'Premium 3', 3)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-prem3', slotIndex: 0 });
    expect(state.resourceBank.coins).toBe(100 - 4.5);
    expect(state.streetGrid[0]).not.toBeNull();
  });

  it('charges cost × 1.5 rounded up to nearest 0.5 (7 → 10.5)', () => {
    const state = setupMainStreetGame({ seed: 'premium-7' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.market.cards = [makeBiz('biz-prem7', 'Premium 7', 7)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-prem7', slotIndex: 0 });
    expect(state.resourceBank.coins).toBe(100 - 10.5);
    expect(state.streetGrid[0]).not.toBeNull();
  });

  it('rejects buy-and-place when the player cannot afford the premium', () => {
    const state = setupMainStreetGame({ seed: 'premium-poor' });
    executeDayStart(state, true);
    state.resourceBank.coins = 5;
    state.market.cards = [makeBiz('biz-prem7', 'Premium 7', 7)];
    expect(() => executeAction(state, { type: 'buy-and-place', cardId: 'biz-prem7', slotIndex: 0 }))
      .toThrow(/Not enough coins/);
  });
});

// ── Serialization ───────────────────────────────────────────

describe('serialization of the action budget', () => {
  it('round-trips actionsRemaining through save/load', () => {
    const state = setupMainStreetGame({ seed: 'save-roundtrip' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);

    const saved = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(saved);
    expect(restored.actionsRemaining).toBe(0);
  });

  it('derives actionsRemaining = 1 for legacy saves without the field', () => {
    const state = setupMainStreetGame({ seed: 'legacy-save' });
    const saved = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete saved.actionsRemaining;
    const restored = deserializeMainStreetState(saved as never);
    expect(restored.actionsRemaining).toBe(1);
  });
});
