/**
 * Main Street: Action Economy Tests (CG-0MSTOF1N5005PK2R, CG-0MTFWBNL30043ZBM)
 *
 * Validates the single-daily-action budget:
 * - Initial value and DayStart reset (1 action; 2 with a General Manager employed)
 * - Action-type operations spend the budget; free operations do not
 * - Budget-spent enforcement (rejects further action-type operations)
 * - Buy-and-place premium pricing (+50%, rounded up to nearest 0.5)
 * - Event action economy: move-to-hand and play-from-hand each cost 1 action,
 *   same-day composite costs 1 total, coins model unchanged, undo/redo
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
import {
  moveEventToHandCommand,
  playEventCommand,
} from '../../example-games/main-street/MainStreetCommands';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';

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
    ongoingCost: 0,
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

  it('is present in the staff deck (general market) of a new game', () => {
    const state = setupMainStreetGame({ seed: 'gm-market' });
    const inDeck = state.decks.staff.some((c: any) => c.id.startsWith('staff-general-manager'));
    expect(inDeck).toBe(true);
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
    // Staff are hired from the general market row (CG-0MT3KZOBZ005IRYE);
    // if the seeded row lacks the GM, move one from the staff deck into it.
    let gm = state.market.cards.find(c => c.id.startsWith('staff-general-manager'));
    if (!gm) {
      const deckGm = state.decks.staff.find(c => c.id.startsWith('staff-general-manager'));
      if (deckGm) state.market.cards.push({ ...deckGm });
      gm = state.market.cards.find(c => c.id.startsWith('staff-general-manager'));
    }
    if (!gm) throw new Error('GM not in market row');
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

// ── Event Action Economy (CG-0MTFWBNL30043ZBM) ───────────────

describe('event action economy', () => {
  // move-to-hand consumes 1 action via engine
  it('buy-event (move event to hand) consumes 1 action via executeAction', () => {
    const state = setupMainStreetGame({ seed: 'evt-move-engine' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.market.cards.push(makeEvent('evt-test', 'Test Event', 2) as never);
    executeAction(state, { type: 'buy-event', cardId: 'evt-test' });
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-test')).toBe(true);
  });

  it('buy-event via moveEventToHandCommand consumes 1 action', () => {
    const state = setupMainStreetGame({ seed: 'evt-move-cmd' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-cmd', 'Cmd Event', 3) as never;
    state.market.cards.push(evt);
    const mgr = new UndoRedoManager();
    mgr.execute(moveEventToHandCommand(state, 'evt-cmd'));
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-cmd')).toBe(true);
  });

  // play consumes 1 action + cost via engine
  it('play-event-from-hand consumes 1 action and deducts event.cost via executeAction', () => {
    const state = setupMainStreetGame({ seed: 'evt-play-engine' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-play', 'Play Event', 7) as never;
    state.hand.push(evt);
    const coinsBefore = state.resourceBank.coins;
    executeAction(state, { type: 'play-event-from-hand', handIndex: 0 });
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-play')).toBe(false);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });

  it('play-event (implicit hand index) consumes 1 action and deducts cost', () => {
    const state = setupMainStreetGame({ seed: 'evt-play-implicit' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-impl', 'Impl Event', 4) as never;
    state.hand.push(evt);
    const coinsBefore = state.resourceBank.coins;
    executeAction(state, { type: 'play-event', handIndex: 0 });
    expect(state.actionsRemaining).toBe(0);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });

  it('playEventCommand consumes 1 action and deducts event.cost', () => {
    const state = setupMainStreetGame({ seed: 'evt-play-cmd' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-pcmd', 'PCmd Event', 5) as never;
    state.hand.push(evt);
    const coinsBefore = state.resourceBank.coins;
    const mgr = new UndoRedoManager();
    mgr.execute(playEventCommand(state, 0));
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-pcmd')).toBe(false);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });

  // same-day composite = 1 total (move charges, same-day play free)
  it('same-day composite move→play costs exactly 1 action total via engine', () => {
    const state = setupMainStreetGame({ seed: 'evt-composite-engine' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-comp', 'Composite', 6) as never;
    state.market.cards.push(evt);
    const coinsBefore = state.resourceBank.coins;

    // Move consumes the single action
    executeAction(state, { type: 'buy-event', cardId: 'evt-comp' });
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-comp')).toBe(true);
    expect(state.resourceBank.coins).toBe(coinsBefore); // move costs 0 coins

    // Same-day play of the just-moved event is free (composite = 1 total)
    const handIdx = state.hand.findIndex(c => c.id === 'evt-comp');
    executeAction(state, { type: 'play-event-from-hand', handIndex: handIdx });
    expect(state.actionsRemaining).toBe(0); // still 0, not -1
    expect(state.hand.some(c => c.id === 'evt-comp')).toBe(false);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore); // cost deducted at play
  });

  it('same-day composite move→play costs exactly 1 action total via commands', () => {
    const state = setupMainStreetGame({ seed: 'evt-composite-cmd' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-cc', 'CC Event', 9) as never;
    state.market.cards.push(evt);
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(moveEventToHandCommand(state, 'evt-cc'));
    expect(state.actionsRemaining).toBe(0);
    expect(state.resourceBank.coins).toBe(coinsBefore);

    const handIdx = state.hand.findIndex(c => c.id === 'evt-cc');
    mgr.execute(playEventCommand(state, handIdx));
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-cc')).toBe(false);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });

  // prior-day held play costs 1
  it('playing a held event from a prior day costs 1 action', () => {
    const state = setupMainStreetGame({ seed: 'evt-held-prior' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-held', 'Held Event', 8) as never;
    state.market.cards.push(evt);

    // Day 1: move to hand
    executeAction(state, { type: 'buy-event', cardId: 'evt-held' });
    expect(state.actionsRemaining).toBe(0);

    // End day 1, start day 2
    processEndOfTurn(state);
    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.some(c => c.id === 'evt-held')).toBe(true);
    const coinsBeforePlay = state.resourceBank.coins;

    // Day 2: play held event costs 1 action
    const handIdx = state.hand.findIndex(c => c.id === 'evt-held');
    executeAction(state, { type: 'play-event-from-hand', handIndex: handIdx });
    expect(state.actionsRemaining).toBe(0);
    expect(state.resourceBank.coins).toBeLessThan(coinsBeforePlay);
  });

  // coins model unchanged
  it('move costs 0 coins, cost deducted at play', () => {
    const state = setupMainStreetGame({ seed: 'evt-coins' });
    executeDayStart(state, true);
    state.resourceBank.coins = 50;
    const evt = makeEvent('evt-coin', 'Coin Event', 12) as never;
    state.market.cards.push(evt);
    const coinsBefore = state.resourceBank.coins;

    executeAction(state, { type: 'buy-event', cardId: 'evt-coin' });
    expect(state.resourceBank.coins).toBe(coinsBefore); // move free

    // Need fresh action for play — simulate next day
    processEndOfTurn(state);
    executeDayStart(state, true);
    state.resourceBank.coins = coinsBefore; // restore for clear assertion
    // hand still has event from prior day
    const handIdx = state.hand.findIndex(c => c.id === 'evt-coin');
    executeAction(state, { type: 'play-event-from-hand', handIndex: handIdx });
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });

  // GM 2-action day still respects composite (leaves 1 remaining)
  it('General Manager 2-action day: same-day composite leaves 1 action remaining', () => {
    const state = setupMainStreetGame({ seed: 'evt-gm-composite' });
    state.staffCards.push({ ...gmTemplate() });
    state.phase = 'DayStart';
    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(2);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-gm', 'GM Event', 3) as never;
    state.market.cards.push(evt);

    executeAction(state, { type: 'buy-event', cardId: 'evt-gm' });
    expect(state.actionsRemaining).toBe(1);

    const handIdx = state.hand.findIndex(c => c.id === 'evt-gm');
    executeAction(state, { type: 'play-event-from-hand', handIndex: handIdx });
    expect(state.actionsRemaining).toBe(1); // play was free (composite), 1 left from GM
  });

  // undo/redo
  it('undo restores the action spent for moveEventToHandCommand', () => {
    const state = setupMainStreetGame({ seed: 'evt-undo-move' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-um', 'Undo Move', 5) as never;
    state.market.cards.push(evt);
    const mgr = new UndoRedoManager();
    mgr.execute(moveEventToHandCommand(state, 'evt-um'));
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-um')).toBe(true);

    mgr.undo();
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.some(c => c.id === 'evt-um')).toBe(false);
    expect(state.market.cards.some(c => c.id === 'evt-um')).toBe(true);
  });

  it('undo restores the action and coins for playEventCommand', () => {
    const state = setupMainStreetGame({ seed: 'evt-undo-play' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-up', 'Undo Play', 11) as never;
    state.hand.push(evt);
    const coinsBefore = state.resourceBank.coins;
    const mgr = new UndoRedoManager();
    mgr.execute(playEventCommand(state, 0));
    expect(state.actionsRemaining).toBe(0);
    // Event effects may adjust coins beyond the flat cost (e.g. reputation bonus
    // priced into coins), so snapshot restore is the meaningful assertion.
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);

    mgr.undo();
    expect(state.actionsRemaining).toBe(1);
    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.hand.some(c => c.id === 'evt-up')).toBe(true);
  });

  it('new action after undo invalidates the redo stack', () => {
    const state = setupMainStreetGame({ seed: 'evt-undo-redo-invalidate' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const e1 = makeEvent('evt-r1', 'R1', 2) as never;
    const e2 = makeEvent('evt-r2', 'R2', 3) as never;
    state.market.cards.push(e1, e2);
    const mgr = new UndoRedoManager();
    mgr.execute(moveEventToHandCommand(state, 'evt-r1'));
    expect(mgr.canRedo()).toBe(false);
    mgr.undo();
    expect(mgr.canRedo()).toBe(true);
    // New action should clear redo
    mgr.execute(moveEventToHandCommand(state, 'evt-r2'));
    expect(mgr.canRedo()).toBe(false);
    expect(state.hand.some(c => c.id === 'evt-r2')).toBe(true);
  });

  it('composite undo/redo restores the single action correctly', () => {
    const state = setupMainStreetGame({ seed: 'evt-composite-undo' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const evt = makeEvent('evt-cu', 'CU Event', 4) as never;
    state.market.cards.push(evt);
    const mgr = new UndoRedoManager();
    mgr.execute(moveEventToHandCommand(state, 'evt-cu'));
    expect(state.actionsRemaining).toBe(0);
    const handIdx = state.hand.findIndex(c => c.id === 'evt-cu');
    mgr.execute(playEventCommand(state, handIdx));
    // Composite: play was free, still 0
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-cu')).toBe(false);

    // Undo play restores the held state but not an extra action (play was free)
    mgr.undo();
    expect(state.hand.some(c => c.id === 'evt-cu')).toBe(true);
    expect(state.actionsRemaining).toBe(0);

    // Undo move restores the action
    mgr.undo();
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.some(c => c.id === 'evt-cu')).toBe(false);
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
    // Staff are in the market row or deck (CG-0MT3KZNQB0053K55)
    const firstStaff = state.market.cards.find(c => c.family === 'staff')
      ?? state.decks.staff.find(c => c.family === 'staff');
    expect(() => executeAction(state, { type: 'hire-staff', cardId: firstStaff!.id }))
      .toThrow(/No actions remaining/);
  });

  it('rejects buy-event when the budget is spent', () => {
    const state = setupMainStreetGame({ seed: 'enforce-evt-move' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    // Spend the action first
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);

    state.market.cards.push(makeEvent('evt-enforce', 'Enforce', 5) as never);
    expect(() => executeAction(state, { type: 'buy-event', cardId: 'evt-enforce' }))
      .toThrow(/No actions remaining/);
    // Command path also rejects
    const mgr = new UndoRedoManager();
    expect(() => mgr.execute(moveEventToHandCommand(state, 'evt-enforce')))
      .toThrow(/No actions remaining/);
  });

  it('rejects play-event-from-hand when the budget is spent (not same-day)', () => {
    const state = setupMainStreetGame({ seed: 'enforce-evt-play' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    const held = makeEvent('evt-held-enforce', 'Held Enforce', 6) as never;
    state.hand.push(held);
    // Spend action on a business move
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);

    expect(() => executeAction(state, { type: 'play-event-from-hand', handIndex: 0 }))
      .toThrow(/No actions remaining/);
    const mgr = new UndoRedoManager();
    // Need to reset hand for command path (previous throw left state unchanged)
    expect(() => mgr.execute(playEventCommand(state, 0)))
      .toThrow(/No actions remaining/);
  });

  it('same-day composite play is allowed even when budget is spent', () => {
    const state = setupMainStreetGame({ seed: 'enforce-composite-allowed' });
    executeDayStart(state, true);
    state.resourceBank.coins = 100;
    state.market.cards.push(makeEvent('evt-free-play', 'Free Play', 7) as never);

    executeAction(state, { type: 'buy-event', cardId: 'evt-free-play' });
    expect(state.actionsRemaining).toBe(0);
    const handIdx = state.hand.findIndex(c => c.id === 'evt-free-play');
    // Should NOT throw — same-day composite is free
    expect(() => executeAction(state, { type: 'play-event-from-hand', handIndex: handIdx }))
      .not.toThrow();
    expect(state.actionsRemaining).toBe(0);
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
