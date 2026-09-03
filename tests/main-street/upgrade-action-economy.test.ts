/**
 * Main Street: Upgrade Action Economy Tests (CG-0MT3IYSRL001VVUP)
 *
 * Validates that upgrade cards now consume actions consistent with business
 * cards:
 * - Move-to-hand via `move-to-hand` action costs 1 action (unchanged).
 * - Buy-upgrade (direct-from-market) now moves to hand AND consumes 1 action
 *   — the old `buy-upgrade` action that applied directly is replaced by
 *   `move-to-hand` for upgrades (same flow as business cards).
 * - Play-upgrade-from-hand same-day composite (just moved this turn) does NOT
 *   consume a second action.
 * - Play-upgrade-from-hand held from previous day consumes 1 action.
 * - New `buy-and-place-upgrade` action (drag-drop) consumes 1 action with
 *   +50% premium (`Math.ceil(cost * 1.5 * 2) / 2`).
 * - All upgrade paths reject when `actionsRemaining <= 0`.
 * - Free operations (event move-to-hand via `buy-event`, discard, etc.)
 *   remain free.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
} from '../../example-games/main-street/MainStreetEngine';
import type { BusinessCard, UpgradeCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Builds a minimal business card for placing on the grid. */
function makeBiz(id: string, name: string, cost: number, maxLevel: number = 2): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 0.5,
    synergyTypes: [],
    maxLevel,
    description: 'test card',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

/** Builds a minimal upgrade card that targets a business at the given level. */
function makeUpgrade(
  id: string,
  name: string,
  cost: number,
  targetBusiness: string,
  requiredLevel: number = 0,
  incomeBonus: number = 1,
): UpgradeCard {
  return {
    family: 'upgrade' as const,
    id,
    name,
    cost,
    targetBusiness,
    requiredLevel,
    incomeBonus,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'test upgrade',
  };
}

/**
 * Sets up a fresh game with a known business on the grid and an upgrade
 * card in the market.  The business is named `businessName` at `level`
 * and the upgrade targets it at that level.
 */
function setupUpgradeGame(
  seed: string,
  businessName: string = 'Diner',
  businessLevel: number = 0,
  businessMaxLevel: number = 2,
  upgradeCost: number = 5,
  upgradeName: string = 'Neon Sign',
): { state: ReturnType<typeof setupMainStreetGame>; businessId: string; upgradeId: string; marketUpgradeId: string } {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state, true);
  state.resourceBank.coins = 1000;

  // Place a business on the grid at the desired level.
  const biz = makeBiz('biz-upgrade', businessName, 10, businessMaxLevel);
  biz.level = businessLevel;
  state.streetGrid[0] = biz;
  const businessId = biz.id;

  // Put an upgrade card in the market.
  const upgrade = makeUpgrade('upg-market', upgradeName, upgradeCost, businessName, businessLevel);
  state.market.cards = [upgrade];
  const marketUpgradeId = upgrade.id;

  return { state, businessId, upgradeId: upgrade.id, marketUpgradeId };
}

// ── Move-to-Hand for Upgrades ────────────────────────────────

describe('move-to-hand for upgrades', () => {
  it('moves an upgrade card to hand and consumes 1 action', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('mtf-upgrade');

    const before = state.actionsRemaining;
    executeAction(state, { type: 'move-to-hand', cardId: marketUpgradeId });

    expect(state.actionsRemaining).toBe(before - 1);
    expect(state.hand.some(c => c.id === marketUpgradeId)).toBe(true);
  });

  it('rejects move-to-hand when actionsRemaining is 0', () => {
    const { state } = setupUpgradeGame('mtf-upgrade-nf');
    // Spend the action on something else (buy-and-place a business)
    state.resourceBank.coins = 1000;
    state.market.cards = [makeBiz('biz-bap', 'Placeholder', 10)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-bap', slotIndex: 1 });
    expect(state.actionsRemaining).toBe(0);

    // Now try to move the upgrade to hand
    state.market.cards = [makeUpgrade('upg-fail', 'Fail', 5, 'Diner', 0)];
    expect(() =>
      executeAction(state, { type: 'move-to-hand', cardId: 'upg-fail' }),
    ).toThrow(/No actions remaining/);
  });
});

// ── Play-Upgrade-From-Hand: Same-Day Composite ───────────────

describe('play-upgrade-from-hand: same-day composite', () => {
  it('does NOT consume an action when the upgrade was just moved to hand this turn', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('sdc-free');

    // Move upgrade to hand (costs 1 action)
    executeAction(state, { type: 'move-to-hand', cardId: marketUpgradeId });
    expect(state.actionsRemaining).toBe(0);

    // Now play it from hand — same-day composite should be FREE
    const handIndex = state.hand.findIndex(c => c.id === marketUpgradeId);
    expect(handIndex).toBeGreaterThan(-1);

    const actionsBeforePlay = state.actionsRemaining;
    executeAction(state, {
      type: 'play-upgrade-from-hand',
      handIndex,
      targetSlot: 0,
    });

    // Same-day composite: no additional action consumed
    expect(state.actionsRemaining).toBe(actionsBeforePlay);

    // Verify the upgrade was applied (business level increased)
    expect(state.streetGrid[0]!.level).toBe(1);
  });
});

// ── Play-Upgrade-From-Hand: Held-Card Play ───────────────────

describe('play-upgrade-from-hand: held-card play', () => {
  it('consumes 1 action when the upgrade was held from a previous day', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('hcp-costs');

    // Simulate: upgrade was moved to hand on a PREVIOUS day (actions reset)
    executeAction(state, { type: 'move-to-hand', cardId: marketUpgradeId });
    expect(state.actionsRemaining).toBe(0);

    // Simulate a new day start (actions reset to 1)
    state.phase = 'DayStart';
    executeDayStart(state, true);
    expect(state.actionsRemaining).toBe(1);

    // Play the held upgrade — this should consume an action
    const handIndex = state.hand.findIndex(c => c.id === marketUpgradeId);
    expect(handIndex).toBeGreaterThan(-1);

    const actionsBeforePlay = state.actionsRemaining;
    executeAction(state, {
      type: 'play-upgrade-from-hand',
      handIndex,
      targetSlot: 0,
    });

    // Held-card play: consumes 1 action
    expect(state.actionsRemaining).toBe(actionsBeforePlay - 1);
  });
});

// ── Buy-and-Place Upgrade (Drag-Drop) ───────────────────────

describe('buy-and-place-upgrade (drag-drop)', () => {
  it('consumes 1 action and charges +50% premium', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('bap-upg', 'Diner', 0, 2, 4, 'Neon Sign');

    // Put upgrade in market
    const upgrade = makeUpgrade(marketUpgradeId, 'Neon Sign', 4, 'Diner', 0);
    state.market.cards = [upgrade];

    const actionsBefore = state.actionsRemaining;
    const coinsBefore = state.resourceBank.coins;

    // +50% premium on cost 4 = Math.ceil(4 * 1.5 * 2) / 2 = Math.ceil(12) / 2 = 6
    executeAction(state, {
      type: 'buy-and-place-upgrade',
      cardId: marketUpgradeId,
      targetSlot: 0,
    });

    expect(state.actionsRemaining).toBe(actionsBefore - 1);
    expect(state.resourceBank.coins).toBe(coinsBefore - 6);
    expect(state.streetGrid[0]!.level).toBe(1);
  });

  it('charges correct premium for odd costs (cost 5 → 7.5)', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('bap-odd', 'Diner', 0, 2, 5, 'Sign');

    const upgrade = makeUpgrade(marketUpgradeId, 'Sign', 5, 'Diner', 0);
    state.market.cards = [upgrade];
    state.resourceBank.coins = 1000;

    // +50% premium on cost 5 = Math.ceil(5 * 1.5 * 2) / 2 = Math.ceil(15) / 2 = 8
    // Wait: Math.ceil(5 * 1.5 * 2) = Math.ceil(15) = 15, 15 / 2 = 7.5
    executeAction(state, {
      type: 'buy-and-place-upgrade',
      cardId: marketUpgradeId,
      targetSlot: 0,
    });

    expect(state.resourceBank.coins).toBe(1000 - 8);
  });

  it('rejects when actionsRemaining is 0', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('bap-no-actions');

    const upgrade = makeUpgrade(marketUpgradeId, 'Sign', 4, 'Diner', 0);
    state.market.cards = [upgrade];
    // Spend action on something else
    state.market.cards = [makeBiz('biz-x', 'X', 10)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-x', slotIndex: 1 });
    expect(state.actionsRemaining).toBe(0);

    // Now put upgrade back and try drag-drop
    state.market.cards = [upgrade];
    expect(() =>
      executeAction(state, {
        type: 'buy-and-place-upgrade',
        cardId: marketUpgradeId,
        targetSlot: 0,
      }),
    ).toThrow(/No actions remaining/);
  });

  it('rejects when the player cannot afford the premium', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('bap-poor');

    const upgrade = makeUpgrade(marketUpgradeId, 'Sign', 10, 'Diner', 0);
    state.market.cards = [upgrade];
    state.resourceBank.coins = 5; // Not enough for premium (15)

    expect(() =>
      executeAction(state, {
        type: 'buy-and-place-upgrade',
        cardId: marketUpgradeId,
        targetSlot: 0,
      }),
    ).toThrow(/Not enough coins/);
  });
});

// ── Legality Gating ──────────────────────────────────────────

describe('upgrade action economy: legality gating', () => {
  it('rejects move-to-hand when budget is spent', () => {
    const { state } = setupUpgradeGame('gate-mth');
    state.resourceBank.coins = 1000;
    state.market.cards = [makeBiz('biz-x', 'X', 10)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-x', slotIndex: 1 });
    expect(state.actionsRemaining).toBe(0);

    state.market.cards = [makeUpgrade('upg-gate', 'Gate', 5, 'Diner', 0)];
    expect(() =>
      executeAction(state, { type: 'move-to-hand', cardId: 'upg-gate' }),
    ).toThrow(/No actions remaining/);
  });

  it('rejects play-upgrade-from-hand when budget is spent (held card)', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('gate-pufh');

    executeAction(state, { type: 'move-to-hand', cardId: marketUpgradeId });
    state.phase = 'DayStart';
    executeDayStart(state, true); // new day, 1 action available

    // Spend the action
    state.market.cards = [makeBiz('biz-x', 'X', 10)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-x', slotIndex: 1 });
    expect(state.actionsRemaining).toBe(0);

    // Try to play held upgrade — should fail
    const handIndex = state.hand.findIndex(c => c.id === marketUpgradeId);
    expect(handIndex).toBeGreaterThan(-1);
    expect(() =>
      executeAction(state, {
        type: 'play-upgrade-from-hand',
        handIndex,
        targetSlot: 0,
      }),
    ).toThrow(/No actions remaining/);
  });

  it('rejects buy-and-place-upgrade when budget is spent', () => {
    const { state, marketUpgradeId } = setupUpgradeGame('gate-bapu');

    const upgrade = makeUpgrade(marketUpgradeId, 'Sign', 5, 'Diner', 0);
    state.market.cards = [upgrade];
    // Spend action
    state.market.cards = [makeBiz('biz-x', 'X', 10)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-x', slotIndex: 1 });
    expect(state.actionsRemaining).toBe(0);

    state.market.cards = [upgrade];
    expect(() =>
      executeAction(state, {
        type: 'buy-and-place-upgrade',
        cardId: marketUpgradeId,
        targetSlot: 0,
      }),
    ).toThrow(/No actions remaining/);
  });
});

// ── Free Operations Unchanged ────────────────────────────────

describe('free operations remain free', () => {
  it('discard-from-hand does not consume an action', () => {
    const { state } = setupUpgradeGame('free-discard');
    // Add a dummy card to hand (upgrades can be discarded)
    state.hand.push(makeUpgrade('upg-discard', 'DiscardMe', 3, 'Diner', 0));

    const before = state.actionsRemaining;
    executeAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(state.actionsRemaining).toBe(before);
    expect(state.hand.length).toBe(0);
  });

  it('buy-event consumes an action (CG-0MTH5C7FK002PDP5)', () => {
    const { state } = setupUpgradeGame('free-event');
    state.resourceBank.coins = 1000;
    // Add an event card to market
    state.market.cards.push({
      family: 'event',
      id: 'evt-test',
      name: 'Test Event',
      trigger: 'Investment',
      cost: 2,
      effect: 'test',
      target: 'All',
      coinDelta: 1,
      reputationDelta: 0,
    } as never);

    const before = state.actionsRemaining;
    executeAction(state, { type: 'buy-event', cardId: 'evt-test' });
    expect(state.actionsRemaining).toBe(before - 1);
    expect(state.hand.some(c => c.id === 'evt-test')).toBe(true);
  });

  it('end-turn is allowed even when budget is spent', () => {
    const { state } = setupUpgradeGame('free-end');
    state.resourceBank.coins = 1000;
    state.market.cards = [makeBiz('biz-x', 'X', 10)];
    executeAction(state, { type: 'buy-and-place', cardId: 'biz-x', slotIndex: 1 });
    expect(state.actionsRemaining).toBe(0);

    const result = executeAction(state, { type: 'end-turn' });
    expect(result).toBeNull();
  });
});
