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
  recalculateCard,
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

  it('should have reputationPerTurn of 40 (×100 integer economy)', () => {
    // reputationPerTurn is optional; if undefined, treat as 0
    // Raised 0.2 → 0.4 by CG-0MSVYPEZ90085SHE: clinic is the 0-income
    // reputation anchor — reduced ongoing cost (2.25 → 0.5) + boosted rep so
    // it pays off via late-game income multipliers.
    // ×100: 0.4 → 40
    expect((clinic as any).reputationPerTurn).toBe(40);
  });

  it('should still have cost 900 (×100), maxLevel 1, upgradePath Clinic', () => {
    // ×100: 9 → 900
    expect(clinic!.cost).toBe(900);
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

  it('should have reputationBonus of 10 (×100 integer economy)', () => {
    // ×100: 0.1 → 10
    expect((upg as any).reputationBonus).toBe(10);
  });

  it('should keep synergyRangeBonus of 1', () => {
    expect(upg!.synergyRangeBonus).toBe(1);
  });

  it('should still target Clinic with cost 300 (×100 integer economy)', () => {
    // ×100: 3 → 300
    expect(upg!.targetBusiness).toBe('Clinic');
    expect(upg!.cost).toBe(300);
  });
});

// ── Private Clinic (New Card) ───────────────────────────────

describe('Private Clinic (biz-private-clinic)', () => {
  const card = findBizTemplate('biz-private-clinic');

  it('should exist in the deck', () => {
    expect(card).toBeDefined();
  });

  it('should have cost 1400, baseIncome 1090, Health synergy (×100)', () => {
    // ×100: 14 → 1400, 10.9 → 1090
    expect(card!.cost).toBe(1400);
    expect(card!.baseIncome).toBe(1090);
    expect(card!.synergyTypes).toEqual(['Health']);
  });

  it('should have maxLevel 1 and upgradePath "Private Clinic"', () => {
    expect(card!.maxLevel).toBe(1);
    expect(card!.upgradePath).toBe('Private Clinic');
  });

  it('should have reputationPerTurn of 25 (CG-0MSVYPEZ90085SHE tiered rep, ×100)', () => {
    // ×100: 0.25 → 25
    const rep = (card as any).reputationPerTurn;
    expect(rep).toBe(25);
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

  it('should have cost 900, incomeBonus 450, synergyRangeBonus 1 (×100)', () => {
    // ×100: 9 → 900, 4.5 → 450
    expect(upg!.cost).toBe(900);
    expect(upg!.incomeBonus).toBe(450);
    expect(upg!.synergyRangeBonus).toBe(1);
  });

  it('should have requiredLevel 0 (base upgrade)', () => {
    expect(upg!.requiredLevel).toBe(0);
  });

  it('should have a reputationBonus', () => {
    expect((upg as any).reputationBonus).toBeTruthy();
  });
});

// ── Pharmacy (New Card) ─────────────────────────────────────

describe('Pharmacy (biz-pharmacy)', () => {
  const card = findBizTemplate('biz-pharmacy');

  it('should exist in the deck', () => {
    expect(card).toBeDefined();
  });

  it('should have cost 700, baseIncome 520, Health synergy (×100)', () => {
    // ×100: 7 → 700, 5.2 → 520
    expect(card!.cost).toBe(700);
    expect(card!.baseIncome).toBe(520);
    expect(card!.synergyTypes).toEqual(['Health']);
  });

  it('should have maxLevel 0 (standalone, no upgrade)', () => {
    expect(card!.maxLevel).toBe(0);
  });

  it('should have no upgradePath', () => {
    expect(card!.upgradePath).toBeUndefined();
  });

  it('should have reputationPerTurn of 10 (CG-0MSVYPEZ90085SHE tiered rep, ×100)', () => {
    // ×100: 0.1 → 10
    const rep = (card as any).reputationPerTurn;
    expect(rep).toBe(10);
  });
});

// ── Tier Registration (12-tier expansion CG-0MT3C744B009DS84) ────────

// Clinic-family cards sit in the late tiers (T8-T12) in the 12-tier design:
// pharmacy T8, clinic + medical-center T10, private-clinic + private-medical
// center T12. Each card's tier >= its synergy-family business tier and the
// upgrade tiers follow their clinic targets.
describe('Tier Registration (12-tier)', () => {
  it('should register biz-pharmacy at tier-8', () => {
    expect(TIER_DEFINITIONS['tier-8'].newCardIds).toContain('biz-pharmacy');
  });

  it('should register biz-clinic and upg-medical-center at tier-10', () => {
    const t10 = TIER_DEFINITIONS['tier-10'].newCardIds;
    expect(t10).toContain('biz-clinic');
    expect(t10).toContain('upg-medical-center');
  });

  it('should register biz-private-clinic + upg-private-medical-center at tier-12', () => {
    const t12 = TIER_DEFINITIONS['tier-12'].newCardIds;
    expect(t12).toContain('biz-private-clinic');
    expect(t12).toContain('upg-private-medical-center');
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
    expect(computeBusinessIncome(grid, 0)).toBe(1090); // ×100: 10.9 → 1090
  });

  it('Pharmacy should generate income from baseIncome', () => {
    const grid = emptyGrid();
    grid[0] = { ...findBizTemplate('biz-pharmacy')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    expect(computeBusinessIncome(grid, 0)).toBe(520); // ×100: 5.2 → 520
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
    // Percentage-based formula (×100):
    // Private Clinic: base=1090, synergyCoinBonus=0.5, N=1, synergy=545, total=1635
    expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1635, 5);
    // Pharmacy: base=520, synergyCoinBonus=0.5, N=1, synergy=260, total=780
    expect(computeBusinessIncome(grid, 1)).toBeCloseTo(780, 5);
  });

  it('Health synergy counts diagonal neighbors (8-way adjacency)', () => {
    const grid = emptyGrid();
    // index 6 is diagonal from index 0 (row 1, col 1) - Chebyshev distance 1
    grid[0] = { ...findBizTemplate('biz-private-clinic')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    grid[6] = { ...findBizTemplate('biz-pharmacy')!, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    // Same values as the orthogonal case (×100): diagonal Health neighbors synergize.
    expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1635, 5);
    expect(computeBusinessIncome(grid, 6)).toBeCloseTo(780, 5);
  });

  it('applyIncome should add reputation from Clinic reputationPerTurn', () => {
    // Create a state with a Clinic on the grid
    const state = setupMainStreetGame({ seed: 'rep-test' });
    // Place a Clinic at slot 0
    const clinicTemplate = findBizTemplate('biz-clinic')!;
    state.streetGrid[0] = { ...clinicTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    recalculateCard(state, 0);

    const repBefore = state.resourceBank.reputation;
    const result = applyIncome(state);

    // Income (coin) should be 0 since Clinic has baseIncome=0 and no neighbors
    expect(result.total).toBe(0);
    // Reputation should have increased by 40 (CG-0MSVYPEZ90085SHE clinic rep raise, ×100)
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 40);
  });

  it('applying Medical Center upgrade should add additional 10 reputation per turn (×100)', () => {
    const state = setupMainStreetGame({ seed: 'rep-upgrade-test' });
    const clinicTemplate = findBizTemplate('biz-clinic')!;
    state.streetGrid[0] = {
      ...clinicTemplate,
      level: 1,
      incomeBonus: 0,
      synergyRangeBonus: 1,
      reputationBonus: 10, // ×100: 0.1 → 10
      appliedUpgrades: ['upg-medical-center'],
    };
    recalculateCard(state, 0);

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);

    // Clinic reputationPerTurn=40 + Medical Center reputationBonus=10 = 50 (×100)
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 50);
  });

  it('multiple clinics should each contribute reputation per turn', () => {
    const state = setupMainStreetGame({ seed: 'multi-clinic-test' });
    const clinicTemplate = findBizTemplate('biz-clinic')!;
    state.streetGrid[0] = { ...clinicTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    recalculateCard(state, 0);
    state.streetGrid[5] = { ...clinicTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    recalculateCard(state, 5);

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);

    // 2 clinics * 40 each (synergyRepBonus nullified by same-type rule) = 80 (×100)
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 80);
  });

  it('Private Clinic and Pharmacy should add reputation per turn (CG-0MSVYPEZ90085SHE tiered rep)', () => {
    const state = setupMainStreetGame({ seed: 'no-rep-test' });
    const pcTemplate = findBizTemplate('biz-private-clinic')!;
    const pharmTemplate = findBizTemplate('biz-pharmacy')!;
    state.streetGrid[0] = { ...pcTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    recalculateCard(state, 0);
    state.streetGrid[1] = { ...pharmTemplate, level: 0, incomeBonus: 0, synergyRangeBonus: 0 };
    recalculateCard(state, 1);

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);

    // Tiered rep (CG-0MSVYPEZ90085SHE, ×100): Private Clinic 25 + Pharmacy 20
    // (10 base + 10 Health synergy rep from the adjacent Private Clinic) = 45
    expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 45);
  });
});
