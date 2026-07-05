/**
 * Main Street: Clinic Health Synergy Tests
 *
 * Validates the Clinic rework, Health synergy type, new Health cards,
 * reputation-per-turn mechanics, and tier registration.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  type SynergyType,
  type BusinessCard,
  type UpgradeCard,
  createBusinessDeck,
  createUpgradeDeck,
  synergyColor,
  CARD_TEMPLATE_NAMES,
} from '../../example-games/main-street/MainStreetCards';
import {
  TIER_DEFINITIONS,
} from '../../example-games/main-street/MainStreetTiers';
import {
  computeBusinessIncome,
  applyIncome,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  GRID_SIZE,
} from '../../example-games/main-street/MainStreetCards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';

// ── Helpers ─────────────────────────────────────────────────

function emptyGrid(): (BusinessCard | null)[] {
  return new Array<BusinessCard | null>(GRID_SIZE).fill(null);
}

// Single-copy decks for template validation
const singleBizDeck = createBusinessDeck(1);
const singleUpgDeck = createUpgradeDeck(1);

/** Returns the first (template) card with a given base ID (sans -N suffix). */
function findBizTemplate(baseId: string): BusinessCard | undefined {
  return singleBizDeck.find(c => c.id.replace(/-\d+$/, '') === baseId);
}

function findUpgTemplate(baseId: string): UpgradeCard | undefined {
  return singleUpgDeck.find(c => c.id.replace(/-\d+$/, '') === baseId);
}

// ── Health Synergy Type ─────────────────────────────────────

describe('Health Synergy Type', () => {
  it('should include "Health" in the SynergyType (checked via template usage)', () => {
    // Verify that cards can be created with 'Health' synergy
    const clinic = findBizTemplate('biz-clinic');
    expect(clinic).toBeDefined();
    expect(clinic!.synergyTypes).toContain('Health' as SynergyType);
  });

  it('synergyColor("Health") should return teal/cyan (0x1ABC9C)', () => {
    const color = synergyColor('Health' as SynergyType);
    expect(color).toBe(0x1ABC9C);
  });

  it('CARD_TEMPLATE_NAMES should include new Health card IDs', () => {
    expect(CARD_TEMPLATE_NAMES.has('biz-clinic')).toBe(true);
    expect(CARD_TEMPLATE_NAMES.has('biz-private-clinic')).toBe(true);
    expect(CARD_TEMPLATE_NAMES.has('biz-pharmacy')).toBe(true);
    expect(CARD_TEMPLATE_NAMES.has('upg-private-medical-center')).toBe(true);
  });
});

// ── Clinic (Reworked) ───────────────────────────────────────

describe('Reworked Clinic (biz-clinic)', () => {
  const clinic = findBizTemplate('biz-clinic');

  it('should exist in the deck', () => {
    expect(clinic).toBeDefined();
  });

  it('should have synergy Health instead of Service', () => {
    expect(clinic!.synergyTypes).toEqual(['Health']);
  });

  it('should have baseIncome of 0', () => {
    expect(clinic!.baseIncome).toBe(0);
  });

  it('should have reputationPerTurn of 0.2', () => {
    // reputationPerTurn is optional; if undefined, treat as 0
    expect((clinic as any).reputationPerTurn).toBe(0.2);
  });

  it('should still have cost 10, maxLevel 1, upgradePath Clinic', () => {
    expect(clinic!.cost).toBe(10);
    expect(clinic!.maxLevel).toBe(1);
    expect(clinic!.upgradePath).toBe('Clinic');
  });
});

// ── Medical Center Upgrade (Reworked) ───────────────────────

describe('Reworked Medical Center Upgrade (upg-medical-center)', () => {
  const upg = findUpgTemplate('upg-medical-center');

  it('should exist in the deck', () => {
    expect(upg).toBeDefined();
  });

  it('should have incomeBonus of 0', () => {
    expect(upg!.incomeBonus).toBe(0);
  });

  it('should have reputationBonus of 0.1', () => {
    expect((upg as any).reputationBonus).toBe(0.1);
  });

  it('should keep synergyRangeBonus of 1', () => {
    expect(upg!.synergyRangeBonus).toBe(1);
  });

  it('should still target Clinic with cost 5', () => {
    expect(upg!.targetBusiness).toBe('Clinic');
    expect(upg!.cost).toBe(5);
  });
});

// ── Private Clinic (New Card) ───────────────────────────────

describe('Private Clinic (biz-private-clinic)', () => {
  const card = findBizTemplate('biz-private-clinic');

  it('should exist in the deck', () => {
    expect(card).toBeDefined();
  });

  it('should have cost 8, baseIncome 2, Health synergy', () => {
    expect(card!.cost).toBe(8);
    expect(card!.baseIncome).toBe(2);
    expect(card!.synergyTypes).toEqual(['Health']);
  });

  it('should have maxLevel 1 and upgradePath "Private Clinic"', () => {
    expect(card!.maxLevel).toBe(1);
    expect(card!.upgradePath).toBe('Private Clinic');
  });

  it('should have no reputationPerTurn (undefined or 0)', () => {
    const rep = (card as any).reputationPerTurn;
    expect(rep === undefined || rep === 0).toBe(true);
  });
});

// ── Private Medical Center Upgrade (New Card) ───────────────

describe('Private Medical Center Upgrade (upg-private-medical-center)', () => {
  const upg = findUpgTemplate('upg-private-medical-center');

  it('should exist in the deck', () => {
    expect(upg).toBeDefined();
  });

  it('should target Private Clinic', () => {
    expect(upg!.targetBusiness).toBe('Private Clinic');
  });

  it('should have cost 4, incomeBonus 2, synergyRangeBonus 0', () => {
    expect(upg!.cost).toBe(4);
    expect(upg!.incomeBonus).toBe(2);
    expect(upg!.synergyRangeBonus).toBe(0);
  });

  it('should have requiredLevel 0 (base upgrade)', () => {
    expect(upg!.requiredLevel).toBe(0);
  });

  it('should have no reputationBonus', () => {
    const rep = (upg as any).reputationBonus;
    expect(rep === undefined || rep === 0).toBe(true);
  });
});

// ── Pharmacy (New Card) ─────────────────────────────────────

describe('Pharmacy (biz-pharmacy)', () => {
  const card = findBizTemplate('biz-pharmacy');

  it('should exist in the deck', () => {
    expect(card).toBeDefined();
  });

  it('should have cost 6, baseIncome 1, Health synergy', () => {
    expect(card!.cost).toBe(6);
    expect(card!.baseIncome).toBe(1);
    expect(card!.synergyTypes).toEqual(['Health']);
  });

  it('should have maxLevel 0 (standalone, no upgrade)', () => {
    expect(card!.maxLevel).toBe(0);
  });

  it('should have no upgradePath', () => {
    expect(card!.upgradePath).toBeUndefined();
  });

  it('should have no reputationPerTurn', () => {
    const rep = (card as any).reputationPerTurn;
    expect(rep === undefined || rep === 0).toBe(true);
  });
});

// ── Tier Registration ───────────────────────────────────────

describe('Tier 4 Registration', () => {
  const tier4CardIds = TIER_DEFINITIONS['tier-4'].newCardIds;

  it('should include biz-clinic (reworked)', () => {
    expect(tier4CardIds).toContain('biz-clinic');
  });

  it('should include biz-private-clinic (new)', () => {
    expect(tier4CardIds).toContain('biz-private-clinic');
  });

  it('should include biz-pharmacy (new)', () => {
    expect(tier4CardIds).toContain('biz-pharmacy');
  });

  it('should include upg-medical-center (reworked)', () => {
    expect(tier4CardIds).toContain('upg-medical-center');
  });

  it('should include upg-private-medical-center (new)', () => {
    expect(tier4CardIds).toContain('upg-private-medical-center');
  });
});

// ── Reputation Per Turn ─────────────────────────────────────

describe('Reputation Per Turn (Income Phase)', () => {
  it('Clinic should generate 0 coin income (baseIncome=0, no synergy bonus)', () => {
    const grid = emptyGrid();
    grid[0] = { ...findBizTemplate('biz-clinic')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    // No neighbors, baseIncome=0 -> total=0
    expect(computeBusinessIncome(grid, 0)).toBe(0);
  });

  it('Private Clinic should generate income from baseIncome', () => {
    const grid = emptyGrid();
    grid[0] = { ...findBizTemplate('biz-private-clinic')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    expect(computeBusinessIncome(grid, 0)).toBe(2);
  });

  it('Pharmacy should generate income from baseIncome', () => {
    const grid = emptyGrid();
    grid[0] = { ...findBizTemplate('biz-pharmacy')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    expect(computeBusinessIncome(grid, 0)).toBe(1);
  });

  it('Clinic with Medical Center upgrade should still generate 0 coin income', () => {
    const grid = emptyGrid();
    grid[0] = { ...findBizTemplate('biz-clinic')!, level: 0, incomeBonus: 0, synergyRangeBonus: 1 };
    expect(computeBusinessIncome(grid, 0)).toBe(0);
  });

  it('Health synergy businesses should earn adjacency bonuses with each other', () => {
    const grid = emptyGrid();
    grid[0] = { ...findBizTemplate('biz-private-clinic')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    grid[1] = { ...findBizTemplate('biz-pharmacy')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    // Private Clinic: base 2 + 1 synergy from Pharmacy
    expect(computeBusinessIncome(grid, 0)).toBe(3);
    // Pharmacy: base 1 + 1 synergy from Private Clinic
    expect(computeBusinessIncome(grid, 1)).toBe(2);
  });

  it('applyIncome should add reputation from Clinic reputationPerTurn', () => {
    // Create a state with a Clinic on the grid
    const state = setupMainStreetGame({ seed: 'rep-test' });
    // Place a Clinic at slot 0
    const clinicTemplate = findBizTemplate('biz-clinic')!;
    state.streetGrid[0] = { ...clinicTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };

    const repBefore = state.resourceBank.reputation;
    const result = applyIncome(state);

    // Income (coin) should be 0 since Clinic has baseIncome=0 and no neighbors
    expect(result.total).toBe(0);
    // Reputation should have increased by 0.2
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 0.2);
  });

  it('applying Medical Center upgrade should add additional 0.1 reputation per turn', () => {
    const state = setupMainStreetGame({ seed: 'rep-upgrade-test' });
    const clinicTemplate = findBizTemplate('biz-clinic')!;
    state.streetGrid[0] = {
      ...clinicTemplate,
      level: 1,
      incomeBonus: 0,
      synergyRangeBonus: 1,
      reputationBonus: 0.1,
      appliedUpgrades: ['upg-medical-center'],
    };

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);

    // Clinic reputationPerTurn=0.2 + Medical Center reputationBonus=0.1 = 0.3
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 0.3);
  });

  it('multiple clinics should each contribute reputation per turn', () => {
    const state = setupMainStreetGame({ seed: 'multi-clinic-test' });
    const clinicTemplate = findBizTemplate('biz-clinic')!;
    state.streetGrid[0] = { ...clinicTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    state.streetGrid[5] = { ...clinicTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);

    // 2 clinics * 0.2 each = 0.4
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 0.4);
  });

  it('Private Clinic and Pharmacy should not add reputation per turn', () => {
    const state = setupMainStreetGame({ seed: 'no-rep-test' });
    const pcTemplate = findBizTemplate('biz-private-clinic')!;
    const pharmTemplate = findBizTemplate('biz-pharmacy')!;
    state.streetGrid[0] = { ...pcTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    state.streetGrid[1] = { ...pharmTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);

    // Neither card has reputationPerTurn, so rep should be unchanged
    expect(state.resourceBank.reputation).toBe(repBefore);
  });
});
