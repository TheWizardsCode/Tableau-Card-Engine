/**
 * Main Street: Staff specialization — per-business buff application tests
 * (T2, CG-0MT4WXJDQ007H19S, parent CG-0MT1CIWSD003VBPK).
 *
 * Validates that each specialization skill's buff is applied correctly
 * per-business across all four effect categories, and that the buff module is
 * side-effect free with respect to MainStreetAdjacency's incremental-update
 * caches (applyIncome / currentIncome) — buffs are folded in at call time by
 * the adjacency wiring (I4, CG-0MT4WXV2J000M35M), never by mutating state.
 *
 * ACs:
 * - Each skill's buff applied correctly per-business in income / reputation /
 *   cost computations.
 * - No conflicts with existing applyIncome / applyCommunitySpaceOngoingCosts
 *   caching in MainStreetAdjacency.
 * - Income boost, reputation boost, cost reduction, and incident mitigation
 *   categories covered.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { createStaffDeck, type BusinessCard } from '../../example-games/main-street/MainStreetCards';
import {
  computePerBusinessSkillBuffs,
  computeStreetOngoingCostReductionPct,
  computeRefreshCostDiscount,
  computeStaffSalaryDiscount,
  computeStaffSalaryCost,
  computeReputationGainMultiplier,
  getEmployedSpecializationSkills,
  getEmployedSpecializationSkillsForBusiness,
  type BusinessBuffProfile,
} from '../../example-games/main-street/MainStreetStaffBuffs';
import { getSkill, BASELINE_SKILL_ID } from '../../example-games/main-street/MainStreetStaffSkills';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import { applyIncome, syncCardCurrentIncome, computeBusinessIncome } from '../../example-games/main-street/MainStreetAdjacency';

// ── Helpers ─────────────────────────────────────────────────

/** Builds a profile for a business with the given synergy types and income. */
function profile(
  synergyTypes: BusinessBuffProfile['synergyTypes'],
  baseIncome = 2,
  ongoingCost = 0.5,
): BusinessBuffProfile {
  return { synergyTypes, baseIncome, ongoingCost };
}

/** Resolves skill ids to their catalog entries. */
function skills(...ids: string[]) {
  return ids.map(getSkill);
}

/** Places a known business on a fresh game grid slot 0 and returns its state. */
function stateWithBusiness(synergyTypes: readonly string[] = ['Food'], baseIncome = 2) {
  const state = setupMainStreetGame({ seed: 'staff-buffs-integration' });
  executeDayStart(state);
  const business: BusinessCard = {
    family: 'business',
    id: 'test-bistro',
    name: 'Test Bistro',
    cost: 3,
    baseIncome,
    synergyTypes: [...synergyTypes] as BusinessCard['synergyTypes'],
    maxLevel: 0,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'Test fixture business.',
    ongoingCost: 0.5,
  };
  state.streetGrid[0] = business;
  syncCardCurrentIncome(state.streetGrid, 0);
  return state;
}

// ── Income boosts (Category A) ──────────────────────────────

describe('income-boost skills apply per-business', () => {
  it("Chef de Cuisine adds +20% income to Food businesses only", () => {
    const food = computePerBusinessSkillBuffs(skills('skill-chef'), profile(['Food']));
    expect(food.income.percent).toBeCloseTo(0.2);
    expect(food.income.flat).toBe(0);

    const commerce = computePerBusinessSkillBuffs(skills('skill-chef'), profile(['Commerce']));
    expect(commerce.income.percent).toBe(0);
  });

  it('DJ adds +20% income to Entertainment businesses only', () => {
    const ent = computePerBusinessSkillBuffs(skills('skill-dj'), profile(['Entertainment']));
    expect(ent.income.percent).toBeCloseTo(0.2);

    const health = computePerBusinessSkillBuffs(skills('skill-dj'), profile(['Health']));
    expect(health.income.percent).toBe(0);
  });

  it('Sales Champion adds +0.5 flat coins per turn to Commerce businesses only', () => {
    const commerce = computePerBusinessSkillBuffs(skills('skill-sales-champion'), profile(['Commerce']));
    expect(commerce.income.flat).toBeCloseTo(0.5);

    const service = computePerBusinessSkillBuffs(skills('skill-sales-champion'), profile(['Service']));
    expect(service.income.flat).toBe(0);
  });

  it('a Food+Entertainment business receives both Chef and DJ percentages', () => {
    const buffs = computePerBusinessSkillBuffs(
      skills('skill-chef', 'skill-dj'),
      profile(['Food', 'Entertainment']),
    );
    expect(buffs.income.percent).toBeCloseTo(0.4);
  });

  it('adjacency-scoped income skills (Networker / Tech Guru) do not leak into per-business income', () => {
    for (const id of ['skill-networker', 'skill-tech-guru']) {
      const buffs = computePerBusinessSkillBuffs(skills(id), profile(['Food', 'Entertainment']));
      expect(buffs.income.flat).toBe(0);
      expect(buffs.income.percent).toBe(0);
    }
  });
});

// ── Reputation boosts (Category B) ──────────────────────────

describe('reputation-boost skills apply per-business', () => {
  it('Community Builder adds +0.1 reputation per turn to every business', () => {
    const commerce = computePerBusinessSkillBuffs(skills('skill-community-builder'), profile(['Commerce']));
    expect(commerce.reputation.flat).toBeCloseTo(0.1);
    const health = computePerBusinessSkillBuffs(skills('skill-community-builder'), profile(['Health']));
    expect(health.reputation.flat).toBeCloseTo(0.1);
  });

  it('PR Strategist adds +0.15 reputation per turn to Service businesses only', () => {
    const service = computePerBusinessSkillBuffs(skills('skill-pr-strategist'), profile(['Service']));
    expect(service.reputation.flat).toBeCloseTo(0.15);
    const food = computePerBusinessSkillBuffs(skills('skill-pr-strategist'), profile(['Food']));
    expect(food.reputation.flat).toBe(0);
  });

  it('Town Gossip (baseline) produces no reputation buff at computation time', () => {
    const buffs = computePerBusinessSkillBuffs(skills(BASELINE_SKILL_ID), profile(['Food']));
    expect(buffs.reputation.flat).toBe(0);
    expect(buffs.income.flat).toBe(0);
  });

  it('Brand Ambassador is exposed as an event-source reputation multiplier (+50%)', () => {
    expect(computeReputationGainMultiplier(skills('skill-brand-ambassador'))).toBeCloseTo(1.5);
    expect(computeReputationGainMultiplier(skills(BASELINE_SKILL_ID))).toBe(1);
  });
});

// ── Cost reductions (Category C) ────────────────────────────

describe('cost-reduction skills apply to ongoing / refresh / salary costs', () => {
  it('Cost Cutter removes 15% of a business ongoing cost (per-business and street level agree)', () => {
    const business = computePerBusinessSkillBuffs(skills('skill-cost-cutter'), profile(['Food'], 2, 1));
    expect(business.ongoingCosts.reductionPct).toBeCloseTo(0.15);
    expect(computeStreetOngoingCostReductionPct(skills('skill-cost-cutter'))).toBeCloseTo(0.15);
  });

  it('Negotiator discounts business-card refreshes by 1', () => {
    expect(computeRefreshCostDiscount(skills('skill-negotiator'))).toBe(1);
    expect(computeRefreshCostDiscount(skills(BASELINE_SKILL_ID))).toBe(0);
  });

  it('Operations Manager discounts this staff member salary by 0.5 (clamped at 0)', () => {
    expect(computeStaffSalaryDiscount(skills('skill-operations-manager'))).toBeCloseTo(0.5);
    expect(computeStaffSalaryCost(skills('skill-operations-manager'), 2.5)).toBeCloseTo(2);
    expect(computeStaffSalaryCost(skills('skill-operations-manager'), 0.25)).toBe(0);
    expect(computeStaffSalaryCost(skills(BASELINE_SKILL_ID), 2.5)).toBeCloseTo(2.5);
  });
});

// ── Incident mitigation (Category D) ────────────────────────

describe('incident-mitigation skills apply to incident damage / probability', () => {
  it('Quality Inspector removes 30% of incident coin damage', () => {
    const buffs = computePerBusinessSkillBuffs(skills('skill-quality-inspector'), profile(['Food']));
    expect(buffs.incidents.coinDamageReductionPct).toBeCloseTo(0.3);
  });

  it('Compliance Officer removes 0.5 incident reputation damage', () => {
    const buffs = computePerBusinessSkillBuffs(skills('skill-compliance'), profile(['Food']));
    expect(buffs.incidents.reputationDamageReductionFlat).toBeCloseTo(0.5);
  });

  it('Risk Manager reduces incident probability by 15%', () => {
    const buffs = computePerBusinessSkillBuffs(skills('skill-risk-manager'), profile(['Food']));
    expect(buffs.incidents.probabilityReductionPct).toBeCloseTo(0.15);
  });

  it('Security Consultant grants theft/loss immunity on the home business', () => {
    const immune = computePerBusinessSkillBuffs(skills('skill-security-consultant'), profile(['Food']));
    expect(immune.incidents.immuneToTheftLoss).toBe(true);
    const normal = computePerBusinessSkillBuffs(skills('skill-chef'), profile(['Food']));
    expect(normal.incidents.immuneToTheftLoss).toBe(false);
  });
});

// ── No conflicts with adjacency caching / purity ────────────

describe('buff module is side-effect free w.r.t. adjacency caches', () => {
  it('does not mutate the profile it reads', () => {
    const p = profile(['Food'], 2, 1);
    const snapshot = JSON.stringify(p);
    computePerBusinessSkillBuffs(skills('skill-chef', 'skill-cost-cutter', 'skill-quality-inspector'), p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('leaves the engine currentIncome cache untouched when buffs are computed', () => {
    const state = stateWithBusiness(['Food'], 3);
    applyIncome(state);
    const cachedBefore = state.streetGrid[0]!.currentIncome;

    // Compute buffs against a profile derived from the same business — the
    // module must not touch the state or its caches.
    const card = state.streetGrid[0] as BusinessCard;
    computePerBusinessSkillBuffs(
      skills('skill-chef', 'skill-community-builder', 'skill-cost-cutter'),
      { synergyTypes: card.synergyTypes, baseIncome: card.baseIncome + card.incomeBonus, ongoingCost: 0.5 },
    );

    expect(state.streetGrid[0]!.currentIncome).toBe(cachedBefore);
    // Re-invoking applyIncome yields the same total (cache still authoritative).
    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);
    expect(state.resourceBank.coins).toBeGreaterThanOrEqual(coinsBefore); // income applied
    expect(state.streetGrid[0]!.currentIncome).toBe(cachedBefore);
  });

  it('buffed income math is consistent with the engine baseline income', () => {
    const state = stateWithBusiness(['Food', 'Commerce'], 4);
    const card = state.streetGrid[0] as BusinessCard;
    const baseline = computeBusinessIncome(state.streetGrid, 0);

    const buffs = computePerBusinessSkillBuffs(
      skills('skill-chef', 'skill-sales-champion'),
      { synergyTypes: card.synergyTypes, baseIncome: card.baseIncome + card.incomeBonus, ongoingCost: 0.5 },
    );

    const buffed = baseline * (1 + buffs.income.percent) + buffs.income.flat;
    // Chef +20% of pre-skill income plus Sales Champion +0.5 flat:
    expect(buffed).toBeCloseTo(baseline * 1.2 + 0.5);
    // The engine's cached value remains the unbuffed baseline until wiring
    // folds the buffs in (I4) — proving no premature mutation.
    expect(card.currentIncome).toBeCloseTo(baseline);
  });
});

// ── Per-business employment scoping (CG-0MSTOATDU006UGAX) ────

/** Builds an employed staff member (employedAtSlot) with a forced skill roster. */
function employedMember(name: string, skillIds: string[], slotIndex: number) {
  const base = createStaffDeck(1)[0];
  return { ...base, id: `${base.id}-${name}`, name, specializationSkillIds: [...skillIds], employedAtSlot: slotIndex };
}

describe('per-business employment scoping (CG-0MSTOATDU006UGAX)', () => {
  it('getEmployedSpecializationSkillsForBusiness returns only skills of staff employed AT that slot', () => {
    const state = setupMainStreetGame({ seed: 'scope-helper' });
    state.staffCards.push(employedMember('chef', ['skill-chef'], 3));
    state.staffCards.push(employedMember('dj', ['skill-dj'], 7));

    expect(getEmployedSpecializationSkillsForBusiness(state, 3).map(s => s.id)).toEqual(['skill-chef']);
    expect(getEmployedSpecializationSkillsForBusiness(state, 7).map(s => s.id)).toEqual(['skill-dj']);
    // Slots with no employees (and empty slots) contribute nothing.
    expect(getEmployedSpecializationSkillsForBusiness(state, 0)).toHaveLength(0);
    expect(getEmployedSpecializationSkillsForBusiness(state, 5)).toHaveLength(0);
  });

  it('hand-slot market staff (no employedAtSlot) contribute NO per-business skills', () => {
    const state = setupMainStreetGame({ seed: 'scope-hand' });
    state.staffCards.push({ ...createStaffDeck(1)[0], id: 'staff-hand', name: 'Hand Chef', specializationSkillIds: ['skill-chef'] });

    // The hand-slot member's Chef must never reach any business's buff pool.
    expect(getEmployedSpecializationSkillsForBusiness(state, 0)).toHaveLength(0);
    expect(getEmployedSpecializationSkillsForBusiness(state, 4)).toHaveLength(0);
  });

  it('street-wide aggregation still includes hand-slot + employed staff', () => {
    const state = setupMainStreetGame({ seed: 'scope-street' });
    state.staffCards.push(employedMember('cutter', ['skill-cost-cutter'], 2));
    state.staffCards.push({ ...createStaffDeck(1)[0], id: 'staff-hand', name: 'Hand Negotiator', specializationSkillIds: ['skill-negotiator'] });

    const allIds = getEmployedSpecializationSkills(state).map(s => s.id);
    expect(allIds).toContain('skill-cost-cutter');
    expect(allIds).toContain('skill-negotiator');

    // Street-wide skills on an employed member stay street-wide: them appearing
    // in the business's per-business pool must not reshape the business income
    // profile (cost-cutter is a % reduction, computed separately).
    const buffs = computePerBusinessSkillBuffs(
      getEmployedSpecializationSkillsForBusiness(state, 2),
      profile(['Food']),
    );
    expect(buffs.income.percent).toBe(0);
    expect(buffs.reputation.flat).toBe(0);
    expect(buffs.ongoingCosts.reductionPct).toBeCloseTo(0.15);
  });
});