/**
 * Main Street: Branching & Multi-Level Upgrade Tests
 *
 * Validates the full upgrade lifecycle introduced by the branching /
 * multi-level feature:
 *
 *  - `requiredLevel` enforcement (canPurchaseUpgrade / purchaseUpgrade)
 *  - Branching upgrades: multiple level-0 paths for the same business
 *  - Multi-level chains: applying a level-1 upgrade after a level-0 one
 *  - State persistence: appliedUpgrades tracking, income/range accumulation
 *  - getUpgradeBranchesForBusiness helper returns correct branch sets
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  canPurchaseUpgrade,
  purchaseUpgrade,
  getUpgradeBranchesForBusiness,
} from '../../example-games/main-street/MainStreetMarket';
import type { BusinessCard, UpgradeCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'upgrades-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Builds a minimal BusinessCard with all required mutable fields set
 * to their starting values.
 */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: 'biz-bakery-test',
    name: 'Bakery',
    cost: 3,
    baseIncome: 2,
    synergyTypes: ['Food'],
    upgradePath: 'Bakery',
    maxLevel: 2,
    description: 'Test bakery.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

/**
 * Builds a minimal UpgradeCard fixture.
 */
function makeUpg(overrides: Partial<UpgradeCard> = {}): UpgradeCard {
  return {
    family: 'upgrade',
    id: 'upg-patisserie-test',
    name: 'Upgrade to Patisserie',
    targetBusiness: 'Bakery',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Test upgrade.',
    ...overrides,
  };
}

/** Injects an upgrade card into the investments row of state. */
function injectUpgrade(state: MainStreetState, card: UpgradeCard): void {
  state.market.investments.push(card);
}

// Helper to clear any pre-existing upgrades from the investments row to
// ensure tests inject an isolated set of upgrade cards and don't get
// surprised by setup-populated market contents (deterministic but irrelevant
// to the unit test intent).
function clearInvestmentsUpgrades(state: MainStreetState): void {
  state.market.investments = state.market.investments.filter(c => c.family !== 'upgrade');
}

// ── requiredLevel enforcement ─────────────────────────────────

describe('requiredLevel enforcement', () => {
  it('allows a level-0 upgrade on a base (level 0) business', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ requiredLevel: 0 });
    injectUpgrade(state, upg);

    const result = canPurchaseUpgrade(state, upg.id);
    expect(result.legal).toBe(true);
  });

  it('rejects a level-1 upgrade on a base (level 0) business', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ id: 'upg-grand-bakehouse-test', requiredLevel: 1, name: 'Grand Bakehouse' });
    injectUpgrade(state, upg);

    const result = canPurchaseUpgrade(state, upg.id);
    expect(result.legal).toBe(false);
    if (!result.legal) {
      expect(result.reason).toContain('requires level 1');
    }
  });

  it('allows a level-1 upgrade after the business has been upgraded once', () => {
    const state = createTestState();
    // Business already at level 1 (from a prior upgrade)
    const biz = makeBiz({ level: 1 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ id: 'upg-grand-bakehouse-test', requiredLevel: 1, name: 'Grand Bakehouse' });
    injectUpgrade(state, upg);

    const result = canPurchaseUpgrade(state, upg.id);
    expect(result.legal).toBe(true);
  });

  it('rejects any upgrade when business is already at maxLevel', () => {
    const state = createTestState();
    // Business already at maxLevel
    const biz = makeBiz({ level: 2, maxLevel: 2 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ requiredLevel: 2, id: 'upg-level2-test' });
    injectUpgrade(state, upg);

    // business.level === requiredLevel but business.level >= maxLevel
    const result = canPurchaseUpgrade(state, upg.id);
    expect(result.legal).toBe(false);
  });
});

// ── Upgrade application & state persistence ──────────────────

describe('purchaseUpgrade state persistence', () => {
  it('increments level, applies incomeBonus and synergyRangeBonus', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0 });
    state.streetGrid[3] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ incomeBonus: 1, synergyRangeBonus: 1 });
    injectUpgrade(state, upg);

    purchaseUpgrade(state, upg.id);

    expect(state.streetGrid[3]!.level).toBe(1);
    expect(state.streetGrid[3]!.incomeBonus).toBe(1);
    expect(state.streetGrid[3]!.synergyRangeBonus).toBe(1);
  });

  it('records the upgrade ID in appliedUpgrades', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ id: 'upg-patisserie-persist' });
    injectUpgrade(state, upg);

    purchaseUpgrade(state, upg.id);

    expect(state.streetGrid[0]!.appliedUpgrades).toContain('upg-patisserie-persist');
  });

  it('accumulates bonuses across multiple upgrade levels', () => {
    const state = createTestState();
    // Level 0 → 1
    const biz = makeBiz({ level: 0, maxLevel: 2 });
    state.streetGrid[5] = biz;
    state.resourceBank.coins = 200;

    const upg0 = makeUpg({ id: 'upg-lvl0', requiredLevel: 0, incomeBonus: 1, synergyRangeBonus: 1 });
    injectUpgrade(state, upg0);
    purchaseUpgrade(state, upg0.id);

    expect(state.streetGrid[5]!.level).toBe(1);
    expect(state.streetGrid[5]!.incomeBonus).toBe(1);

    // Level 1 → 2
    const upg1 = makeUpg({ id: 'upg-lvl1', requiredLevel: 1, incomeBonus: 2, synergyRangeBonus: 1 });
    injectUpgrade(state, upg1);
    purchaseUpgrade(state, upg1.id);

    expect(state.streetGrid[5]!.level).toBe(2);
    expect(state.streetGrid[5]!.incomeBonus).toBe(3);   // 1 + 2
    expect(state.streetGrid[5]!.synergyRangeBonus).toBe(2); // 1 + 1
    expect(state.streetGrid[5]!.appliedUpgrades).toEqual(['upg-lvl0', 'upg-lvl1']);
  });

  it('deducts coins for each upgrade applied', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 50;

    const upg = makeUpg({ cost: 4 });
    injectUpgrade(state, upg);

    purchaseUpgrade(state, upg.id);

    expect(state.resourceBank.coins).toBe(46);
  });

  it('targets a specific slot when targetSlot is provided', () => {
    const state = createTestState();
    const biz2 = makeBiz({ id: 'biz-bakery-slot2', level: 0 });
    const biz7 = makeBiz({ id: 'biz-bakery-slot7', level: 0 });
    state.streetGrid[2] = biz2;
    state.streetGrid[7] = biz7;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ id: 'upg-slot-test' });
    injectUpgrade(state, upg);

    purchaseUpgrade(state, upg.id, 7);

    expect(state.streetGrid[7]!.level).toBe(1);
    expect(state.streetGrid[2]!.level).toBe(0);
  });

  it('throws when targetSlot does not meet requiredLevel', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0 }); // level 0, but upgrade requires level 1
    state.streetGrid[1] = biz;
    state.resourceBank.coins = 100;

    const upg = makeUpg({ id: 'upg-bad-req', requiredLevel: 1 });
    injectUpgrade(state, upg);

    expect(() => purchaseUpgrade(state, upg.id, 1)).toThrow();
  });
});

// ── Branching upgrades ────────────────────────────────────────

describe('branching upgrades', () => {
  it('getUpgradeBranchesForBusiness returns all eligible branches for a slot', () => {
    const state = createTestState();
    // Ensure the investments row has no pre-existing upgrade cards so our
    // injected fixtures are the only ones considered.
    clearInvestmentsUpgrades(state);
    const biz = makeBiz({ level: 0 });
    state.streetGrid[4] = biz;
    state.resourceBank.coins = 100;

    // Inject two competing level-0 upgrades for Bakery
    const branch1 = makeUpg({ id: 'upg-branch-a', name: 'Branch A', requiredLevel: 0 });
    const branch2 = makeUpg({ id: 'upg-branch-b', name: 'Branch B', requiredLevel: 0 });
    injectUpgrade(state, branch1);
    injectUpgrade(state, branch2);

    const branches = getUpgradeBranchesForBusiness(state, 4);
    expect(branches).toHaveLength(2);
    const ids = branches.map(b => b.id);
    expect(ids).toContain('upg-branch-a');
    expect(ids).toContain('upg-branch-b');
  });

  it('getUpgradeBranchesForBusiness returns empty array for an empty slot', () => {
    const state = createTestState();
    // slot 9 is empty
    const branches = getUpgradeBranchesForBusiness(state, 9);
    expect(branches).toHaveLength(0);
  });

  it('getUpgradeBranchesForBusiness returns empty array when business is at maxLevel', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 1, maxLevel: 1 });
    state.streetGrid[0] = biz;

    // Clear any pre-existing upgrades and inject a matching upgrade so the
    // test focuses on requiredLevel behaviour only.
    clearInvestmentsUpgrades(state);
    const upg = makeUpg({ requiredLevel: 1 });
    injectUpgrade(state, upg);

    // level === maxLevel so no upgrade should be offered
    const branches = getUpgradeBranchesForBusiness(state, 0);
    expect(branches).toHaveLength(0);
  });

  it('only returns branches whose requiredLevel matches business level', () => {
    const state = createTestState();
    clearInvestmentsUpgrades(state);
    const biz = makeBiz({ level: 0 });
    state.streetGrid[2] = biz;

    const level0Upg = makeUpg({ id: 'upg-l0', requiredLevel: 0 });
    const level1Upg = makeUpg({ id: 'upg-l1', requiredLevel: 1 });
    injectUpgrade(state, level0Upg);
    injectUpgrade(state, level1Upg);

    const branches = getUpgradeBranchesForBusiness(state, 2);
    // Only the level-0 upgrade should be returned since business is at level 0
    expect(branches).toHaveLength(1);
    expect(branches[0].id).toBe('upg-l0');
  });

  it('applying one branch prevents the other from being applied to same business', () => {
    const state = createTestState();
    const biz = makeBiz({ level: 0, maxLevel: 1 });
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 100;

    const branch1 = makeUpg({ id: 'upg-branch-x', requiredLevel: 0 });
    const branch2 = makeUpg({ id: 'upg-branch-y', requiredLevel: 0 });
    injectUpgrade(state, branch1);
    injectUpgrade(state, branch2);

    // Apply branch1
    purchaseUpgrade(state, branch1.id, 0);

    // Business is now at level 1 (== maxLevel), so branch2 should be illegal
    const result = canPurchaseUpgrade(state, branch2.id);
    expect(result.legal).toBe(false);
  });
});

// ── Multi-level chain: real card pool templates ───────────────

describe('multi-level chain with real upgrade templates', () => {
  it('Bakery can receive a level-0 then level-1 upgrade from the template pool', () => {
    const state = createTestState();
    const bakeryTemplate = state.decks.business.find(b => b.name === 'Bakery');
    expect(bakeryTemplate).toBeDefined();

    const biz: BusinessCard = { ...bakeryTemplate!, id: 'biz-bakery-chain', level: 0, incomeBonus: 0, synergyRangeBonus: 0, appliedUpgrades: [] };
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 200;

    // Find a level-0 upgrade for Bakery in the full upgrade deck
    const level0Upg = state.decks.upgrade.find(
      u => u.targetBusiness === 'Bakery' && u.requiredLevel === 0,
    );
    expect(level0Upg).toBeDefined();
    injectUpgrade(state, level0Upg!);

    purchaseUpgrade(state, level0Upg!.id, 0);
    expect(state.streetGrid[0]!.level).toBe(1);

    // Find a level-1 upgrade for Bakery in the full upgrade deck
    const level1Upg = state.decks.upgrade.find(
      u => u.targetBusiness === 'Bakery' && u.requiredLevel === 1,
    );
    expect(level1Upg).toBeDefined();
    injectUpgrade(state, level1Upg!);

    purchaseUpgrade(state, level1Upg!.id, 0);
    expect(state.streetGrid[0]!.level).toBe(2);

    // Both upgrades should be tracked
    expect(state.streetGrid[0]!.appliedUpgrades).toHaveLength(2);
  });

  it('Cinema supports two branching level-0 upgrades (IMAX vs Drive-In)', () => {
    const state = createTestState();

    const imax = state.decks.upgrade.find(u => u.id.startsWith('upg-imax'));
    const driveIn = state.decks.upgrade.find(u => u.id.startsWith('upg-drive-in'));
    expect(imax).toBeDefined();
    expect(driveIn).toBeDefined();

    // Both should be at requiredLevel 0
    expect(imax!.requiredLevel).toBe(0);
    expect(driveIn!.requiredLevel).toBe(0);

    // Both target 'Cinema'
    expect(imax!.targetBusiness).toBe('Cinema');
    expect(driveIn!.targetBusiness).toBe('Cinema');

    // They offer different trade-offs
    expect(imax!.incomeBonus).toBeGreaterThan(driveIn!.incomeBonus);
    expect(driveIn!.synergyRangeBonus).toBeGreaterThan(imax!.synergyRangeBonus);
  });

  it('Day Spa level-2 upgrade (Luxury Retreat) requires level 1', () => {
    const state = createTestState();
    const luxuryRetreat = state.decks.upgrade.find(u => u.id.startsWith('upg-luxury-retreat'));
    expect(luxuryRetreat).toBeDefined();
    expect(luxuryRetreat!.requiredLevel).toBe(1);
    expect(luxuryRetreat!.targetBusiness).toBe('Day Spa');
  });
});

// ── US-18 / US-19: Template Pool Assertions ──────────────────

describe('branching & multi-level template pool (US-18, US-19)', () => {
  const state = createTestState('template-pool');
  const allUpgrades = state.decks.upgrade;

  it('Bakery has at least 2 level-0 upgrade options (US-18 AC#1)', () => {
    const bakeryL0 = allUpgrades.filter(
      u => u.targetBusiness === 'Bakery' && (u.requiredLevel ?? 0) === 0,
    );
    expect(bakeryL0.length).toBeGreaterThanOrEqual(2);
  });

  it('Diner has at least 2 level-0 upgrade options (US-18 AC#1)', () => {
    const dinerL0 = allUpgrades.filter(
      u => u.targetBusiness === 'Diner' && (u.requiredLevel ?? 0) === 0,
    );
    expect(dinerL0.length).toBeGreaterThanOrEqual(2);
  });

  it('at least 2 businesses support multi-level chains (maxLevel >= 2) (US-19 AC#1)', () => {
    const businesses = state.decks.business;
    const multiLevel = businesses.filter(b => b.maxLevel >= 2);
    expect(multiLevel.length).toBeGreaterThanOrEqual(2);
  });

  it('at least 2 upgrade templates require level >= 1 (US-19 AC#2)', () => {
    const advanced = allUpgrades.filter(u => (u.requiredLevel ?? 0) >= 1);
    expect(advanced.length).toBeGreaterThanOrEqual(2);
  });
});
