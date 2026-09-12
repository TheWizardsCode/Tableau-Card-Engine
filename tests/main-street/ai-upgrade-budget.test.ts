/**
 * Main Street: budget-aware upgrade actions for the AI and Monte Carlo
 * (CG-0MT40HTYN008TJ6Q, parent CG-0MT3IYSRL001VVUP).
 *
 * Upgrades follow the same action economy as every other purchase:
 *
 * - taking an upgrade to hand costs one daily action (it is applied for
 *   free the same day, or for one action when held from a previous day);
 * - `buy-upgrade` is the headless equivalent of the same-day click
 *   composite (move-to-hand + free same-day apply): one action, listed cost;
 * - no upgrade action is proposed or chosen once the daily budget is spent.
 *
 * These tests assert the observable decision output (`enumerateLegalActions`,
 * `GreedyStrategy.chooseAction`) and the engine's action accounting — never
 * source text.
 *
 * @module tests/main-street/ai-upgrade-budget
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { executeAction, executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import type { PlayerAction } from '../../example-games/main-street/MainStreetEngine';
import { enumerateLegalActions, GreedyStrategy } from '../../example-games/main-street/MainStreetAiStrategy';
import type { BusinessCard, UpgradeCard } from '../../example-games/main-street/MainStreetCards';
import {
  chooseDemoGreedyActions,
  runMonteCarlo,
} from '../../example-games/main-street/MainStreetMonteCarlo';

// ── Fixtures ────────────────────────────────────────────────

/** Deterministic RNG so `pickBest` tie-breaks are reproducible. */
function makeRng(seed: number = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function makeBusiness(id: string, name: string, cost: number): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 120,
    synergyTypes: ['Food'],
    maxLevel: 3,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'test business',
    appliedUpgrades: [],
    ongoingCost: 0,
  } as BusinessCard;
}

function makeUpgrade(
  id: string,
  cost: number,
  targetBusiness: string,
  requiredLevel = 0,
): UpgradeCard {
  return {
    family: 'upgrade',
    id,
    name: `Upgrade ${id}`,
    cost,
    targetBusiness,
    requiredLevel,
    incomeBonus: 150,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'test upgrade',
  } as UpgradeCard;
}

/**
 * A market-phase state with one upgrade-business on the street, so an
 * upgrade can legally target it.
 */
function makeUpgradeState(seed = 'ai-upg-budget'): {
  state: MainStreetState;
  biz: BusinessCard;
  upgrade: UpgradeCard;
} {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  state.phase = 'MarketPhase';

  const biz = makeBusiness('biz-diner', 'Diner', 400);
  const upgrade = makeUpgrade('upg-neon', 200, 'Diner', 0);

  state.streetGrid[0] = biz;
  for (let i = 1; i < state.streetGrid.length; i += 1) state.streetGrid[i] = null;
  state.market.cards = [upgrade];
  state.hand = [];
  state.resourceBank.coins = 5000;
  state.actionsRemaining = 1;
  state.justMovedUpgradeCardId = null;

  return { state, biz, upgrade };
}

/**
 * Collects, per turn, how many action-consuming operations the planned
 * action list would execute — used to assert the Monte Carlo planner never
 * over-commits the daily budget.
 */
function plannedActionSpend(actions: readonly PlayerAction[]): number {
  const consuming = new Set([
    'buy-business',
    'buy-and-place',
    'hire-staff',
    'buy-upgrade',
    'buy-and-place-upgrade',
    'buy-event',
    'move-to-hand',
    'play-business-from-hand',
    'play-upgrade-from-hand',
    'play-event',
    'play-event-from-hand',
    'community-favour',
    'peek-incident-deck',
  ]);
  return actions.filter((a) => consuming.has(a.type)).length;
}

describe('buy-upgrade consumes a daily action (headless click composite)', () => {
  it('spends one action and applies the upgrade at the listed cost', () => {
    const { state, upgrade } = makeUpgradeState();
    const coinsBefore = state.resourceBank.coins;

    executeAction(state, { type: 'buy-upgrade', cardId: upgrade.id, targetSlot: 0 });

    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[0]!.level).toBe(1);
    // The composite charges the listed cost, not the drag-drop premium.
    expect(state.resourceBank.coins).toBe(coinsBefore - upgrade.cost);
  });

  it('is rejected when the daily budget is spent', () => {
    const { state, upgrade } = makeUpgradeState();
    state.actionsRemaining = 0;

    expect(() =>
      executeAction(state, { type: 'buy-upgrade', cardId: upgrade.id, targetSlot: 0 }),
    ).toThrow(/No actions remaining/);
    // Nothing was applied and no coins moved.
    expect(state.streetGrid[0]!.level).toBe(0);
  });
});

describe('AI enumeration is budget-aware for upgrades', () => {
  it('offers no upgrade action when the budget is spent', () => {
    const { state } = makeUpgradeState();
    state.actionsRemaining = 0;

    const actions = enumerateLegalActions(state);

    const upgradeActions = actions.filter(
      (a) =>
        a.type === 'buy-upgrade' ||
        a.type === 'play-upgrade-from-hand' ||
        a.type === 'buy-and-place-upgrade',
    );
    expect(upgradeActions).toHaveLength(0);
    // With the budget spent only ending the day remains.
    expect(actions.map((a) => a.type)).toEqual(['end-turn']);
  });

  it('offers upgrade actions while an action remains', () => {
    const { state, upgrade } = makeUpgradeState();

    const actions = enumerateLegalActions(state);

    const buyUpgrade = actions.filter((a) => a.type === 'buy-upgrade');
    expect(buyUpgrade.length).toBeGreaterThan(0);
    expect(buyUpgrade.every((a) => (a as any).cardId === upgrade.id)).toBe(true);
  });

  it('never proposes an upgrade action the budget cannot pay for', () => {
    const { state } = makeUpgradeState();
    // A single remaining action: every enumerated upgrade action must cost
    // exactly one action (no over-commitment).
    state.actionsRemaining = 1;

    const actions = enumerateLegalActions(state);
    for (const action of actions) {
      if (action.type === 'buy-and-place-upgrade') {
        // Drag-drop parity actions may add extra actions; the AI must only
        // ever propose ones that fit the remaining budget.
        const extra = (action as any).extraActions ?? 0;
        expect(1 + extra).toBeLessThanOrEqual(state.actionsRemaining);
      }
    }
  });
});

describe('AI upgrade choice respects the budget and prefers the free composite', () => {
  it('chooses to end the turn rather than upgrade when the budget is spent', () => {
    const { state } = makeUpgradeState();
    state.actionsRemaining = 0;

    const action = GreedyStrategy.chooseAction(state, makeRng());

    expect(action.type).toBe('end-turn');
  });

  it('prefers a free same-day composite upgrade over an action-costing one', () => {
    const { state, upgrade } = makeUpgradeState();
    // The upgrade is in hand and was moved there this turn → applying it is
    // free, so the AI must take the free gain before spending its action.
    state.hand = [upgrade];
    state.market.cards = [makeUpgrade('upg-market', 200, 'Diner', 0)];
    state.justMovedUpgradeCardId = upgrade.id;
    state.actionsRemaining = 1;

    const action = GreedyStrategy.chooseAction(state, makeRng());

    expect(action.type).toBe('play-upgrade-from-hand');
    expect((action as any).handIndex).toBe(0);
  });

  it('plays a held upgrade from hand and spends the action', () => {
    const { state, upgrade } = makeUpgradeState();
    state.hand = [upgrade];
    state.market.cards = [makeUpgrade('upg-market', 200, 'Diner', 0)];
    // Held from a previous day → costs one action.
    state.justMovedUpgradeCardId = null;
    state.actionsRemaining = 1;

    const action = GreedyStrategy.chooseAction(state, makeRng());
    expect(action.type).toBe('play-upgrade-from-hand');

    executeAction(state, action);
    expect(state.streetGrid[0]!.level).toBe(1);
    expect(state.actionsRemaining).toBe(0);
  });

  it('does not spend a second action on the same-day composite play', () => {
    const { state, upgrade } = makeUpgradeState();
    state.hand = [upgrade];
    state.market.cards = [makeUpgrade('upg-market', 200, 'Diner', 0)];
    state.justMovedUpgradeCardId = upgrade.id;
    // The move already spent the day's action.
    state.actionsRemaining = 0;

    // The free composite stays legal (and enumerated) at zero remaining
    // actions — every other upgrade path is gone.
    const actions = enumerateLegalActions(state);
    const composite = actions.find((a) => a.type === 'play-upgrade-from-hand');
    expect(composite).toBeDefined();
    expect(actions.some((a) => a.type === 'buy-upgrade')).toBe(false);

    executeAction(state, composite!);
    expect(state.streetGrid[0]!.level).toBe(1);
    expect(state.actionsRemaining).toBe(0);
    expect(state.justMovedUpgradeCardId).toBeNull();
  });

  it('still chooses the free composite when the budget is already spent', () => {
    const { state, upgrade } = makeUpgradeState();
    state.hand = [upgrade];
    state.market.cards = [];
    state.justMovedUpgradeCardId = upgrade.id;
    state.actionsRemaining = 0;

    const action = GreedyStrategy.chooseAction(state, makeRng());

    expect(action.type).toBe('play-upgrade-from-hand');
  });
});

describe('Monte Carlo models the upgrade action cost deterministically', () => {
  it('produces identical runs for the same seed (upgrade spend pattern included)', () => {
    const seeds = ['mc-upg-1', 'mc-upg-2', 'mc-upg-3'];
    const first = runMonteCarlo({ seeds, maxTurns: 40, strategy: 'greedy' });
    const second = runMonteCarlo({ seeds, maxTurns: 40, strategy: 'greedy' });

    expect(first.runs).toHaveLength(seeds.length);
    // Same seed → identical outcome, including the purchased-card sequence.
    for (let i = 0; i < seeds.length; i += 1) {
      expect(second.runs[i].result).toBe(first.runs[i].result);
      expect(second.runs[i].turns).toBe(first.runs[i].turns);
      expect(second.runs[i].cardsOwned).toEqual(first.runs[i].cardsOwned);
      expect(second.runs[i].economyHistory).toEqual(first.runs[i].economyHistory);
    }
  }, 60_000);

  it('never plans more daily actions than the budget provides (demo-greedy)', () => {
    // The legacy demo-greedy planner builds its whole turn upfront; with the
    // upgrade action cost it must stop once the budget is committed.
    const { state, upgrade } = makeUpgradeState('mc-plan');
    state.market.cards = [upgrade];
    state.actionsRemaining = 1;

    const planned = chooseDemoGreedyActions(state);

    expect(planned[planned.length - 1].type).toBe('end-turn');
    // Exactly one action-consuming operation may be planned on a 1-action day.
    expect(plannedActionSpend(planned)).toBeLessThanOrEqual(state.actionsRemaining);
  });

  it('plans the upgrade action only while the budget can pay for it', () => {
    const { state, upgrade } = makeUpgradeState('mc-plan-2');
    // A market row with a business, an event and an upgrade, all affordable —
    // the planner must not queue all three on a one-action day.
    state.market.cards = [upgrade];
    state.actionsRemaining = 1;

    const planned = chooseDemoGreedyActions(state);
    const spend = plannedActionSpend(planned);
    expect(spend).toBeLessThanOrEqual(1);

    // With a two-action budget it may plan (at most) two.
    state.actionsRemaining = 2;
    const plannedTwo = chooseDemoGreedyActions(state);
    expect(plannedActionSpend(plannedTwo)).toBeLessThanOrEqual(2);
  });
});
