/**
 * Main Street: Action restore on failure (CG-0MTW1KAD4003XGLU)
 *
 * Ensures that executeAction does NOT consume a daily action when the
 * underlying operation throws an error.  Every action type that calls
 * consumeAction before the operation must be tested here.
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeAction } from '../../example-games/main-street/MainStreetEngine';
import { type BusinessCard, type StaffCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ────────────────────────────────────────────────────────

function createState(seed = 'action-restore-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

function placeBusiness(state: MainStreetState, slotIndex: number): BusinessCard {
  const card = state.decks.business[0]!;
  state.streetGrid[slotIndex] = { ...card, level: 0 };
  return state.streetGrid[slotIndex]!;
}

// ── move-to-hand ───────────────────────────────────────────────────

describe('move-to-hand', () => {
  it('restores action when card is not found in market', () => {
    const state = createState('mth-nofound');
    state.phase = 'MarketPhase';
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    expect(() =>
      executeAction(state, { type: 'move-to-hand', cardId: 'nonexistent' }),
    ).toThrow('not found');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });

  it('restores action when trying to move a staff card to hand', () => {
    const state = createState('mth-staff');
    state.phase = 'MarketPhase';
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    // Place a staff card in the market
    const staff = { ...state.decks.staff[0]!, family: 'staff' as const } as StaffCard;
    state.market.cards = [staff];

    expect(() =>
      executeAction(state, { type: 'move-to-hand', cardId: staff.id }),
    ).toThrow('cannot be moved to hand');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });
});

// ── buy-business ───────────────────────────────────────────────────

describe('buy-business', () => {
  it('restores action when card is not found in market', () => {
    const state = createState('bb-nofound');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1000;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    expect(() =>
      executeAction(state, { type: 'buy-business', cardId: 'nonexistent', slotIndex: 0 }),
    ).toThrow('not found');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });

  it('restores action when slot is occupied', () => {
    const state = createState('bb-occupied');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1000;
    // Provide enough coins for the business (cost 1400 at start)
    state.resourceBank.coins = 1400;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    // Pre-fill a slot
    placeBusiness(state, 0);
    const card = state.market.cards[0]!;

    expect(() =>
      executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 }),
    ).toThrow('occupied');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });

  it('restores action when insufficient funds', () => {
    const state = createState('bb-insufficient');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 0;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    const card = state.market.cards[0]!;

    expect(() =>
      executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 1 }),
    ).toThrow();

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });
});

// ── play-business-from-hand ────────────────────────────────────────

describe('play-business-from-hand', () => {
  it('restores action when hand index is out of bounds', () => {
    const state = createState('pbh-index');
    state.phase = 'MarketPhase';
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    expect(() =>
      executeAction(state, { type: 'play-business-from-hand', handIndex: 99, slotIndex: 1 }),
    ).toThrow('No card at hand index');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });

  it('restores action when slot is occupied', () => {
    const state = createState('pbh-occupied');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1000;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    // Put a business card in hand
    const biz = state.decks.business[0]!;
    state.hand = [{ ...biz }];
    // Pre-fill the slot
    placeBusiness(state, 0);

    expect(() =>
      executeAction(state, { type: 'play-business-from-hand', handIndex: 0, slotIndex: 0 }),
    ).toThrow('occupied');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });
});

// ── buy-and-place ──────────────────────────────────────────────────

describe('buy-and-place', () => {
  it('restores action when slot is occupied', () => {
    const state = createState('bap-occupied');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1000;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    // Pre-fill the slot
    placeBusiness(state, 0);
    const card = state.market.cards[0]!;

    expect(() =>
      executeAction(state, { type: 'buy-and-place', cardId: card.id, slotIndex: 0 }),
    ).toThrow();

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });
});

// ── hire-staff ─────────────────────────────────────────────────────

describe('hire-staff', () => {
  it('restores action when card not found', () => {
    const state = createState('hs-nofound');
    state.phase = 'MarketPhase';
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    expect(() =>
      executeAction(state, { type: 'hire-staff', cardId: 'nonexistent' }),
    ).toThrow('not found');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });

  it('restores action when insufficient funds', () => {
    const state = createState('hs-insufficient');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 0;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    const staff = state.market.cards.find(c => c.family === 'staff');
    if (staff) {
      expect(() =>
        executeAction(state, { type: 'hire-staff', cardId: staff.id }),
      ).toThrow();

      expect(state.actionsRemaining).toBe(beforeActions);
      expect(state.bankedActions).toBe(beforeBanked);
    }
  });
});

// ── buy-event ──────────────────────────────────────────────────────

describe('buy-event', () => {
  it('restores action when card not found', () => {
    const state = createState('be-nofound');
    state.phase = 'MarketPhase';
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    expect(() =>
      executeAction(state, { type: 'buy-event', cardId: 'nonexistent' }),
    ).toThrow('not found');

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });
});

// ── play-upgrade-from-hand (same-week composite) ────────────────────

describe('play-upgrade-from-hand', () => {
  it('restores action when target business not found on street', () => {
    const state = createState('puh-target');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1000;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    // Put an upgrade in hand
    const upgrade = state.decks.upgrade[0]!;
    state.hand = [{ ...upgrade }];
    // No businesses on the street — target will not be found

    expect(() =>
      executeAction(state, { type: 'play-upgrade-from-hand', handIndex: 0, targetSlot: 0 }),
    ).toThrow();

    expect(state.actionsRemaining).toBe(beforeActions);
    expect(state.bankedActions).toBe(beforeBanked);
  });
});

// ── Action budget is NOT incremented on success ────────────────────

describe('action budget integrity on success', () => {
  it('does NOT restore actions on successful move-to-hand', () => {
    const state = createState('success-mth');
    state.phase = 'MarketPhase';
    const beforeActions = state.actionsRemaining;

    const card = state.market.cards[0]!;
    executeAction(state, { type: 'move-to-hand', cardId: card.id });

    expect(state.actionsRemaining).toBe(beforeActions - 1);
  });

  it('does NOT restore actions on successful buy-business', () => {
    const state = createState('success-bb');
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1600;
    const beforeActions = state.actionsRemaining;
    const beforeBanked = state.bankedActions;

    const card = state.market.cards[0]!;
    const result = executeAction(state, {
      type: 'buy-business', cardId: card.id, slotIndex: 1,
    });

    expect(result).not.toBeNull();
    expect(state.actionsRemaining).toBe(beforeActions - 1);
    expect(state.bankedActions).toBe(Math.max(0, beforeBanked - 1));
  });
});
