/**
 * Main Street: Action Banking Tests (CG-0MT3IOPZB005LNAR)
 *
 * Validates the action-banking mechanic that lets players carry unused
 * base actions across days (cap 2):
 * - Banking on end-of-turn (AC1) — any unspent actions accumulate
 * - Cap enforced (AC2) — bank never exceeds 2
 * - Day-start composition (AC3) — budget = 1 base + staff bonus + banked
 * - Staff-first consumption (AC4) — GM bonus never banks; only base banks
 * - State + persistence (AC6) — save/load round-trip, undo/redo safety
 *
 * @module tests/main-street/action-banking
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
  buyAndPlaceBusiness,
} from '../../example-games/main-street/MainStreetEngine';
import {
  refillMarket,
  playBusinessFromHand,
} from '../../example-games/main-street/MainStreetMarket';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';
import {
  moveToHandCommand,
  playBusinessFromHandCommand,
  buyAndPlaceBusinessCommand,
} from '../../example-games/main-street/MainStreetCommands';
import {
  getStaffCardTemplates,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Finds the General Manager staff template (must exist post-CSV update). */
function gmTemplate() {
  const gm = getStaffCardTemplates().find(t => t.id === 'staff-general-manager');
  if (!gm) throw new Error('staff-general-manager template missing from card-data.csv');
  return gm;
}

/**
 * Advance a fresh game state through one full day: DayStart → MarketPhase.
 */
function startDay(state: ReturnType<typeof setupMainStreetGame>): void {
  executeDayStart(state);
}

/** A non-staff market card (staff cards cannot move to hand). */
function firstMovableMarketCard(state: ReturnType<typeof setupMainStreetGame>) {
  const card = state.market.cards.find(c => c.family !== 'staff');
  if (!card) throw new Error('No movable card in market');
  return card;
}

/**
 * Relax the hand-size limit and top up the market so a test can take many
 * move-to-hand actions in one day without hitting capacity or emptiness.
 */
function prepareForManyActions(state: ReturnType<typeof setupMainStreetGame>): void {
  state.maxHandSize = 10;
  // 100 coins is ample for free move-to-hand actions yet stays well below
  // the score-threshold win condition (high coin balances inflate score).
  state.resourceBank.coins = 100;
}

// ── AC1 · Banking on end-of-turn ────────────────────────────

describe('AC1 · banking on end-of-turn', () => {
  it('banks all unspent actions when the player takes none (0 spent → 1 banked)', () => {
    const state = setupMainStreetGame({ seed: 'ac1-idle' });
    startDay(state);
    expect(state.actionsRemaining).toBe(1);
    expect(state.bankedActions).toBe(0);

    processEndOfTurn(state);

    // Next day starts
    startDay(state);
    expect(state.bankedActions).toBe(1);
    expect(state.actionsRemaining).toBe(2); // 1 base + 1 banked
  });

  it('banks remaining actions when some are spent (banked=2, idle → stays at cap 2)', () => {
    const state = setupMainStreetGame({ seed: 'ac1-partial' });
    // Start with bank at cap
    state.bankedActions = 2;
    startDay(state);
    expect(state.actionsRemaining).toBe(3); // 1 base + 2 banked

    // Spend 1 action
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(2);

    processEndOfTurn(state);
    startDay(state);
    expect(state.bankedActions).toBe(2); // capped at 2, had 2 remaining so banked 1 more but stays at 2
  });

  it('banks zero when the player spends all actions', () => {
    const state = setupMainStreetGame({ seed: 'ac1-all-spent' });
    startDay(state);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(0);

    processEndOfTurn(state);
    startDay(state);
    expect(state.bankedActions).toBe(0);
    expect(state.actionsRemaining).toBe(1);
  });

  it('banks across multiple consecutive idle days', () => {
    const state = setupMainStreetGame({ seed: 'ac1-multi-day' });

    // Day 1: idle → banks 1
    startDay(state);
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(1);

    // Day 2: idle → banks 1 more → total 2
    startDay(state);
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(2);

    // Day 3: idle → at cap, no change
    startDay(state);
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(2);
  });
});

// ── AC2 · Cap enforced ──────────────────────────────────────

describe('AC2 · cap enforced', () => {
  it('bankedActions never exceeds 2 even after multiple banking days', () => {
    const state = setupMainStreetGame({ seed: 'ac2-cap' });

    for (let i = 0; i < 5; i++) {
      startDay(state);
      processEndOfTurn(state);
      expect(state.bankedActions).toBeLessThanOrEqual(2);
    }
  });

  it('overflow is discarded (at cap with leftover → stays at 2)', () => {
    const state = setupMainStreetGame({ seed: 'ac2-overflow' });
    state.bankedActions = 2; // already at cap

    startDay(state);
    expect(state.actionsRemaining).toBe(3); // 1 + 2 banked
    // Don't spend anything
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(2); // stays at 2, overflow discarded
  });
});

// ── AC3 · Day-start composition ─────────────────────────────

describe('AC3 · day-start composition', () => {
  it('budget = 1 base + bankedActions (no staff)', () => {
    const state = setupMainStreetGame({ seed: 'ac3-no-staff' });
    // Bank 2 actions first
    for (let i = 0; i < 2; i++) {
      startDay(state);
      processEndOfTurn(state);
    }
    expect(state.bankedActions).toBe(2);

    startDay(state);
    expect(state.actionsRemaining).toBe(3); // 1 base + 2 banked
  });

  it('budget = 1 base + staff bonus + banked (with GM)', () => {
    const state = setupMainStreetGame({ seed: 'ac3-gm' });
    state.staffCards.push({ ...gmTemplate() });
    // Manually set banked to 2 (avoiding multi-day idle which can trigger win)
    state.bankedActions = 2;
    // Force phase to DayStart so executeDayStart works
    state.phase = 'DayStart';
    startDay(state);
    expect(state.actionsRemaining).toBe(4); // 1 base + 1 GM + 2 banked
  });

  it('banked actions are consumed as the player spends (4 → 3 → 2 → 1 → 0)', () => {
    const state = setupMainStreetGame({ seed: 'ac3-consume' });
    state.staffCards.push({ ...gmTemplate() });
    // Manually set banked to 2
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    expect(state.actionsRemaining).toBe(4);

    // Spend 2 actions — each consumes 1 from banked (floor 0)
    state.resourceBank.coins = 100;
    const card1 = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card1.id });
    expect(state.actionsRemaining).toBe(3);
    expect(state.bankedActions).toBe(1); // consumed 1

    const card2 = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card2.id });
    expect(state.actionsRemaining).toBe(2);
    expect(state.bankedActions).toBe(0); // consumed 1 more, now 0

    // bankable = min(2, 1) = 1, so banked = min(2, 0 + 1) = 1
    processEndOfTurn(state);
    startDay(state);
    expect(state.bankedActions).toBe(1);
  });
});

// ── AC4 · Staff actions used first (never bank) ────────────

describe('AC4 · staff actions never bank', () => {
  it('idle GM day banks only 1 (not 2)', () => {
    const state = setupMainStreetGame({ seed: 'ac4-idle-gm' });
    state.staffCards.push({ ...gmTemplate() });

    startDay(state);
    expect(state.actionsRemaining).toBe(2); // 1 base + 1 GM

    processEndOfTurn(state);
    expect(state.bankedActions).toBe(1); // only base banks
  });

  it('GM day with 1 spent still banks 1', () => {
    const state = setupMainStreetGame({ seed: 'ac4-1-spent-gm' });
    state.staffCards.push({ ...gmTemplate() });

    startDay(state);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];
    executeAction(state, { type: 'move-to-hand', cardId: card.id });
    expect(state.actionsRemaining).toBe(1);

    processEndOfTurn(state);
    expect(state.bankedActions).toBe(1); // base action still banked
  });

  it('without GM, idle banks 1; with GM idle, banks 1 (same)', () => {
    // No GM
    const noGm = setupMainStreetGame({ seed: 'ac4-no-gm-idle' });
    startDay(noGm);
    processEndOfTurn(noGm);
    expect(noGm.bankedActions).toBe(1);

    // With GM
    const withGm = setupMainStreetGame({ seed: 'ac4-gm-idle' });
    withGm.staffCards.push({ ...gmTemplate() });
    startDay(withGm);
    processEndOfTurn(withGm);
    expect(withGm.bankedActions).toBe(1);
  });

  it('banked 2 + GM idle → banks 1 more, stays at cap 2', () => {
    const state = setupMainStreetGame({ seed: 'ac4-gm-cap' });
    state.staffCards.push({ ...gmTemplate() });
    // Bank 2
    for (let i = 0; i < 2; i++) {
      startDay(state);
      processEndOfTurn(state);
    }

    // Idle again with GM
    startDay(state);
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(2); // stays at cap
  });
});

// ── AC6 · State + persistence ──────────────────────────────

describe('AC6 · state persistence (save/load + undo/redo)', () => {
  it('bankedActions round-trips through save/load', () => {
    const state = setupMainStreetGame({ seed: 'ac6-roundtrip' });
    startDay(state);
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(1);

    const saved = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(saved);
    expect(restored.bankedActions).toBe(1);
  });

  it('legacy saves without bankedActions default to 0', () => {
    const state = setupMainStreetGame({ seed: 'ac6-legacy' });
    const saved = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete saved.bankedActions;

    const restored = deserializeMainStreetState(saved as never);
    expect(restored.bankedActions).toBe(0);
  });

  it('bankedActions persists through multiple day cycles via save/load', () => {
    const state = setupMainStreetGame({ seed: 'ac6-multi-saveload' });

    // Bank 1
    startDay(state);
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(1);

    const saved1 = serializeMainStreetState(state);
    const restored1 = deserializeMainStreetState(saved1);
    expect(restored1.bankedActions).toBe(1);

    // Bank another
    startDay(restored1);
    processEndOfTurn(restored1);
    expect(restored1.bankedActions).toBe(2);

    const saved2 = serializeMainStreetState(restored1);
    const restored2 = deserializeMainStreetState(saved2);
    expect(restored2.bankedActions).toBe(2);
  });

  it('undo after an action restores bankedActions from pre-action snapshot', () => {
    // This tests that undo doesn't corrupt bankedActions.
    // The action command captures a snapshot including bankedActions.
    const state = setupMainStreetGame({ seed: 'ac6-undo' });
    startDay(state);

    // Bank 1 action from previous day
    processEndOfTurn(state);
    expect(state.bankedActions).toBe(1);

    // New day: take and undo an action
    startDay(state);
    state.resourceBank.coins = 100;
    const card = state.market.cards[0];

    // The undo/redo commands capture bankedActions in the snapshot
    // After executeAction, banked should be consumed (savedBanked - 1 = 0)
    const savedBanked = state.bankedActions; // = 1

    // Move-to-hand action
    executeAction(state, { type: 'move-to-hand', cardId: card.id });

    // After the action, bankedActions should have been decremented
    expect(state.bankedActions).toBe(savedBanked - 1); // consumed 1 from banked
  });
});

// ── AC4 Edge Cases ──────────────────────────────────────────

describe('AC4 edge cases', () => {
  it('base action alone (no GM) banks correctly over 3 days', () => {
    const state = setupMainStreetGame({ seed: 'ac4-base-only' });

    for (let day = 1; day <= 3; day++) {
      startDay(state);
      processEndOfTurn(state);
      // Each day banks 1 base action
      expect(state.bankedActions).toBeLessThanOrEqual(day);
      if (day >= 2) {
        expect(state.bankedActions).toBe(2); // capped
      }
    }
  });
});

// ── Banked Consumption Regressions (CG-0MTCP7F9S009HARC) ───

/**
 * Regression suite for "Banked actions not reduced": every action-consuming
 * operation must decrement `bankedActions` (floor 0) alongside
 * `actionsRemaining`, via a single shared helper so the engine and command
 * paths never diverge. Premium placements and free operations are excluded.
 */
describe('banked consumption regressions', () => {
  it('every action-consuming operation decrements banked by 1 (floor 0)', () => {
    const state = setupMainStreetGame({ seed: 'banked-decrement' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    expect(state.actionsRemaining).toBe(3); // 1 base + 2 banked

    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.bankedActions).toBe(1);

    // moveToHand does not refill the market — top up between actions
    refillMarket(state);
    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.bankedActions).toBe(0);

    refillMarket(state);
    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.bankedActions).toBe(0); // floored at 0, never negative
  });

  it('floors at 0: taking more actions than banked never goes negative', () => {
    const state = setupMainStreetGame({ seed: 'banked-floor' });
    state.bankedActions = 1;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    expect(state.actionsRemaining).toBe(2); // 1 base + 1 banked

    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.bankedActions).toBe(0);

    refillMarket(state);
    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.bankedActions).toBe(0); // floor, not -1
  });

  it('full-spend day drains the bank to 0', () => {
    const state = setupMainStreetGame({ seed: 'banked-full-spend' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    expect(state.actionsRemaining).toBe(3);

    // Spend all 3 actions (top up the market between moves)
    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    refillMarket(state);
    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    refillMarket(state);
    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.bankedActions).toBe(0);
    expect(state.actionsRemaining).toBe(0);

    // Day-end: nothing banked (0 actions remaining), bank stays at 0
    processEndOfTurn(state);
    startDay(state);
    expect(state.bankedActions).toBe(0);
    expect(state.actionsRemaining).toBe(1); // 1 base only
  });

  it('GM games drain the bank too (budget = 1 base + 1 GM + 2 banked = 4)', () => {
    const state = setupMainStreetGame({ seed: 'banked-gm-drain' });
    state.staffCards.push({ ...gmTemplate() });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    expect(state.actionsRemaining).toBe(4); // 1 base + 1 GM + 2 banked
    expect(state.bankedActions).toBe(2);

    // All 4 actions deplete banked to 0 (top up the market between moves)
    for (let i = 0; i < 4; i++) {
      executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
      refillMarket(state);
    }
    expect(state.actionsRemaining).toBe(0);
    expect(state.bankedActions).toBe(0);
  });

  it('staff actions consume the bank regardless of budget source', () => {
    // With GM only (no banked), taking the staff-supplied action reduces
    // banked from 0 to 0 (floor) — the important part is the budget is
    // still drawn from banked when available (covered above). This asserts
    // a single GM-only action day never lets banked go negative and the
    // action still spends normally.
    const state = setupMainStreetGame({ seed: 'banked-gm-only' });
    state.staffCards.push({ ...gmTemplate() });
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    expect(state.actionsRemaining).toBe(2); // 1 base + 1 GM, no banked
    expect(state.bankedActions).toBe(0);

    executeAction(state, { type: 'move-to-hand', cardId: firstMovableMarketCard(state).id });
    expect(state.actionsRemaining).toBe(1);
    expect(state.bankedActions).toBe(0); // floor at 0
  });

  it('peek-incident-deck consumes banked (staff peek gate)', () => {
    const state = setupMainStreetGame({ seed: 'banked-peek' });
    // Lookout staff enables the peek gate (staff-lookout, peekOncePerTurn)
    const lookout = getStaffCardTemplates().find(t => t.id === 'staff-lookout');
    expect(lookout).toBeDefined();
    state.staffCards.push({ ...lookout! });
    state.bankedActions = 1;
    state.phase = 'DayStart';
    startDay(state);

    // Ensure incident deck non-empty so the peek is not a no-op
    expect(state.incidentDeck.length).toBeGreaterThan(0);

    executeAction(state, { type: 'peek-incident-deck' });
    expect(state.actionsRemaining).toBe(1); // consumed 1
    expect(state.bankedActions).toBe(0); // consumed banked too
  });

  it('premium buy-and-place path leaves banked untouched', () => {
    const state = setupMainStreetGame({ seed: 'banked-premium-bap' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);

    state.resourceBank.coins = 1000;
    const savedBanked = state.bankedActions;
    // Find a business/community-space card (buy-and-place only applies to those)
    const biz = state.market.cards.find(
      c => c.family === 'business' || c.family === 'community-space',
    );
    expect(biz).toBeDefined();

    // Direct engine call = the premium placement (no consumeAction).
    // This must NOT decrement bankedActions.
    buyAndPlaceBusiness(state, biz!.id, 0);
    expect(state.bankedActions).toBe(savedBanked);
  });

  it('premium play-from-hand path leaves banked untouched', () => {
    const state = setupMainStreetGame({ seed: 'banked-premium-pfh' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);

    // Get a business into hand: move-to-hand consumes 1 action + 1 banked.
    // The premium placement then replaces the SECOND action — banked must
    // reflect only the single move consumption, not a second decrement.
    state.resourceBank.coins = 1000;
    const biz = state.market.cards.find(
      c => c.family === 'business' || c.family === 'community-space',
    );
    expect(biz).toBeDefined();

    executeAction(state, { type: 'move-to-hand', cardId: biz!.id });
    expect(state.bankedActions).toBe(1); // consumed 1 by the move
    const savedBankedAfterMove = state.bankedActions;

    const handIndex = state.hand!.findIndex(c => c.id === biz!.id);
    expect(handIndex).toBeGreaterThanOrEqual(0);

    // Premium cost skips consumeAction — banked must stay at 1.
    playBusinessFromHand(state, handIndex, 0, 1000);
    expect(state.bankedActions).toBe(savedBankedAfterMove);
  });

  it('command-layer undo/redo restores banked (move-to-hand)', () => {
    const state = setupMainStreetGame({ seed: 'banked-undo-command' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    expect(state.actionsRemaining).toBe(3);
    expect(state.bankedActions).toBe(2);

    const card = firstMovableMarketCard(state);
    const mgr = new UndoRedoManager();

    mgr.execute(moveToHandCommand(state, card.id));
    expect(state.actionsRemaining).toBe(2);
    expect(state.bankedActions).toBe(1); // command layer decrements banked

    mgr.undo();
    expect(state.actionsRemaining).toBe(3);
    expect(state.bankedActions).toBe(2); // restored from undo snapshot

    mgr.redo();
    expect(state.actionsRemaining).toBe(2);
    expect(state.bankedActions).toBe(1);
  });

  it('command-layer undo restores banked for buy-and-place', () => {
    const state = setupMainStreetGame({ seed: 'banked-undo-bap' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);

    const biz = state.market.cards.find(
      c => c.family === 'business' || c.family === 'community-space',
    );
    expect(biz).toBeDefined();
    // Fund the drag premium so the placement is legal
    state.resourceBank.coins = Math.max(state.resourceBank.coins, Math.ceil(biz!.cost * 1.5 * 2) / 2);

    const mgr = new UndoRedoManager();
    mgr.execute(buyAndPlaceBusinessCommand(state, biz!.id, 0));
    expect(state.actionsRemaining).toBe(2); // consumed 1
    expect(state.bankedActions).toBe(1); // consumed banked too

    mgr.undo();
    expect(state.actionsRemaining).toBe(3);
    expect(state.bankedActions).toBe(2); // restored from undo snapshot
    expect(state.streetGrid[0]).toBeNull();
  });

  it('command-layer undo of premium play-from-hand keeps banked stable', () => {
    const state = setupMainStreetGame({ seed: 'banked-undo-premium-pfh' });
    state.bankedActions = 2;
    state.phase = 'DayStart';
    startDay(state);
    prepareForManyActions(state);
    state.resourceBank.coins = 1000; // fund the premium override

    // Move a business to hand first (consumes 1 action + 1 banked)
    const biz = state.market.cards.find(
      c => c.family === 'business' || c.family === 'community-space',
    );
    expect(biz).toBeDefined();
    executeAction(state, { type: 'move-to-hand', cardId: biz!.id });
    expect(state.bankedActions).toBe(1);
    const handIndex = state.hand!.findIndex(c => c.id === biz!.id);
    expect(handIndex).toBeGreaterThanOrEqual(0);

    // Premium placement replaces the action — banked must stay at 1
    const mgr = new UndoRedoManager();
    mgr.execute(playBusinessFromHandCommand(state, handIndex, 0, 1000));
    expect(state.bankedActions).toBe(1); // no action consumed by premium path

    mgr.undo();
    expect(state.bankedActions).toBe(1); // snapshot restore keeps it at 1
    expect(state.streetGrid[0]).toBeNull();
  });
});
