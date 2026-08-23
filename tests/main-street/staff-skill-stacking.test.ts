/**
 * Main Street: Staff specialization — multi-skill stack interaction tests
 * (T3, CG-0MT4WXLN7002A85T; parent CG-0MT1CIWSD003VBPK).
 *
 * Validates that staff members holding 2–3 specialization skills across
 * effect categories compose correctly:
 * - AC1: multi-category stacks interact without runaway compounding (each
 *   buff applies independently; percentage skills never multiply each other
 *   or the flat bonuses).
 * - AC2: the per-member stacking constraint (max 1 income-boost AND max 1
 *   reputation-boost) holds in stacked scenarios.
 * - AC3: synergy-enhancement skills (Tech Guru +1 Entertainment range)
 *   compose with income/reputation skills.
 * - Fixtures use seeded RNG for deterministic multi-skill stacks.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { createSeededRng } from '../../src/core-engine/SeededRng';
import {
  assignSkillsToApplicants,
  getSkill,
} from '../../example-games/main-street/MainStreetStaffSkills';
import {
  computePerBusinessSkillBuffs,
  computeStreetOngoingCostReductionPct,
  computeRefreshCostDiscount,
  computeStaffSalaryCost,
  computeEntertainmentSynergyRangeBoost,
  computeAdjacencyCoinBonus,
} from '../../example-games/main-street/MainStreetStaffBuffs';
import type { BusinessBuffProfile } from '../../example-games/main-street/MainStreetStaffBuffs';

// ── Helpers ─────────────────────────────────────────────────

/** Resolves skill ids to catalog entries. */
function skills(...ids: string[]) {
  return ids.map(getSkill);
}

/** Food-focused business profile (2 income, 0.5 ongoing). */
function foodProfile(extra: BusinessBuffProfile['synergyTypes'] = []): BusinessBuffProfile {
  return { synergyTypes: ['Food', ...extra], baseIncome: 2, ongoingCost: 0.5 };
}

/** Counts skills in a category for the stacking-constraint checks. */
function categoryCount(ids: readonly string[], category: string): number {
  return ids.filter(id => getSkill(id).category === category).length;
}

// ── AC1: stacks compose without runaway compounding ─────────

describe('AC1: multi-category stacks compose additively, without runaway compounding', () => {
  it('income + cost-reduction stack: both effects apply and stay independent', () => {
    // Chef (+20% Food income) + Cost Cutter (-15% ongoing) on one member.
    const buffs = computePerBusinessSkillBuffs(skills('skill-chef', 'skill-cost-cutter'), foodProfile());
    expect(buffs.income.percent).toBeCloseTo(0.2);
    expect(buffs.ongoingCosts.reductionPct).toBeCloseTo(0.15);

    // No cross-category multiplier: buffed income is base × (1 + 0.2), and
    // the cost reduction is independent of the income change.
    const buffedIncome = foodProfile().baseIncome * (1 + buffs.income.percent) + buffs.income.flat;
    expect(buffedIncome).toBeCloseTo(2.4);
    expect(computeStreetOngoingCostReductionPct(skills('skill-chef', 'skill-cost-cutter'))).toBeCloseTo(0.15);
  });

  it('reputation + incident-mitigation stack: both effects apply independently', () => {
    // Community Builder (+0.1 rep all) + Quality Inspector (-30% coin damage).
    const buffs = computePerBusinessSkillBuffs(
      skills('skill-community-builder', 'skill-quality-inspector'),
      foodProfile(),
    );
    expect(buffs.reputation.flat).toBeCloseTo(0.1);
    expect(buffs.incidents.coinDamageReductionPct).toBeCloseTo(0.3);
  });

  it('three-category stack (income + cost-reduction + reputation) applies all three', () => {
    const buffs = computePerBusinessSkillBuffs(
      skills('skill-chef', 'skill-cost-cutter', 'skill-community-builder'),
      foodProfile(),
    );
    expect(buffs.income.percent).toBeCloseTo(0.2);
    expect(buffs.ongoingCosts.reductionPct).toBeCloseTo(0.15);
    expect(buffs.reputation.flat).toBeCloseTo(0.1);
  });

  it('percentage income skills never compound onto each other (additive, not multiplicative)', () => {
    // Chef + DJ on a Food+Entertainment business: 0.2 + 0.2 = 0.4 additive.
    const buffs = computePerBusinessSkillBuffs(
      skills('skill-chef', 'skill-dj'),
      foodProfile(['Entertainment']),
    );
    expect(buffs.income.percent).toBeCloseTo(0.4);
    // Not 1.2 × 1.2 - 1 = 0.44 multiplicative runaway.
    expect(buffs.income.percent).not.toBeCloseTo(0.44);
  });

  it('percent skills never multiply flat bonuses (no interaction term)', () => {
    // Chef + Sales Champion on a Food+Commerce business.
    const buffs = computePerBusinessSkillBuffs(skills('skill-chef', 'skill-sales-champion'), foodProfile(['Commerce']));
    const expected = foodProfile().baseIncome * (1 + buffs.income.percent) + buffs.income.flat;
    expect(expected).toBeCloseTo(2 * 1.2 + 0.5);
    expect(buffs.income.percent).toBeCloseTo(0.2);
    expect(buffs.income.flat).toBeCloseTo(0.5);
  });

  it('cost-reduction and incident-mitigation skills stack with income on a full member', () => {
    // Chef + Negotiator + Risk Manager: income %, refresh discount, incident
    // probability all present; each helper reports its own contribution.
    const stack = skills('skill-chef', 'skill-negotiator', 'skill-risk-manager');
    const buffs = computePerBusinessSkillBuffs(stack, foodProfile());
    expect(buffs.income.percent).toBeCloseTo(0.2);
    expect(buffs.incidents.probabilityReductionPct).toBeCloseTo(0.15);
    expect(computeRefreshCostDiscount(stack)).toBe(1);
  });

  it('multi-staff stacks add up across members (allowed — constraint is per member)', () => {
    // Staff A: Chef. Staff B: DJ. Both employed; an Entertainment+Food
    // business receives +20% + +20%.
    const streetSkills = [...skills('skill-chef'), ...skills('skill-dj')];
    const buffs = computePerBusinessSkillBuffs(streetSkills, foodProfile(['Entertainment']));
    expect(buffs.income.percent).toBeCloseTo(0.4);
  });
});

// ── AC2: stacking constraint holds in stacked scenarios ──────

describe('AC2: max 1 income-boost + 1 reputation-boost per staff in stacked scenarios', () => {
  it('seeded 3-skill members never exceed 1 income-boost or 1 reputation-boost', () => {
    for (let seed = 0; seed < 400; seed += 1) {
      const members = assignSkillsToApplicants(createSeededRng(seed), 20);
      for (const member of members) {
        const ids = member.map(s => s.id);
        expect(categoryCount(ids, 'income-boost')).toBeLessThanOrEqual(1);
        // Baseline Town Gossip is exempt; the cap applies to skills drawn
        // beyond the baseline (design decision documented in T1).
        const beyondBaseline = ids.filter(id => id !== 'skill-town-gossip');
        expect(categoryCount(beyondBaseline, 'reputation-boost')).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a seeded three-slot member can hold the full balanced combo (income + rep)', () => {
    // Deterministic fixture: find a seed whose first member holds 3 skills
    // including one income-boost and one reputation-boost beyond baseline.
    let combo: string[] | null = null;
    for (let seed = 0; seed < 4000 && !combo; seed += 1) {
      const member = assignSkillsToApplicants(createSeededRng(seed), 1)[0];
      const ids = member.map(s => s.id);
      if (
        ids.length === 3 &&
        categoryCount(ids, 'income-boost') === 1 &&
        categoryCount(ids.filter(id => id !== 'skill-town-gossip'), 'reputation-boost') === 1
      ) {
        combo = ids;
      }
    }
    expect(combo, 'a 3-skill member with 1 income + 1 rep must be reachable').not.toBeNull();
  });

  it('duplicate assignment of the same income skill is impossible within a member', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const member of assignSkillsToApplicants(createSeededRng(seed), 10)) {
        const ids = member.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

// ── AC3: synergy-enhancement composes with income/reputation ─

describe('AC3: synergy-enhancement skills compose with income/reputation skills', () => {
  it('Tech Guru unlocks +1 Entertainment synergy range alongside an income buff', () => {
    const stack = skills('skill-tech-guru', 'skill-chef');
    expect(computeEntertainmentSynergyRangeBoost(stack)).toBe(1);
    // The income buff for the Entertainment+Food business still applies.
    const buffs = computePerBusinessSkillBuffs(stack, foodProfile(['Entertainment']));
    expect(buffs.income.percent).toBeCloseTo(0.2);
  });

  it('Tech Guru range boost applies whether or not the business gets an income buff', () => {
    const pureRange = skills('skill-tech-guru');
    expect(computeEntertainmentSynergyRangeBoost(pureRange)).toBe(1);
    const buffs = computePerBusinessSkillBuffs(pureRange, foodProfile(['Entertainment']));
    expect(buffs.income.percent).toBe(0); // no income skill present
  });

  it('Networker adjacency bonus composes with a per-business income buff', () => {
    const stack = skills('skill-networker', 'skill-dj');
    expect(computeAdjacencyCoinBonus(stack)).toBeCloseTo(0.2);
    const buffs = computePerBusinessSkillBuffs(stack, foodProfile(['Entertainment']));
    expect(buffs.income.percent).toBeCloseTo(0.2);
  });

  it('Operations Manager salary discount composes with the staff salary cost', () => {
    const stack = skills('skill-operations-manager', 'skill-community-builder');
    expect(computeStaffSalaryCost(stack, 2.5)).toBeCloseTo(2);
    // The rep buff is unrelated to the salary discount.
    const buffs = computePerBusinessSkillBuffs(stack, foodProfile());
    expect(buffs.reputation.flat).toBeCloseTo(0.1);
  });
});

// ── Seeded determinism of multi-skill fixtures ──────────────

describe('seeded RNG fixtures are deterministic', () => {
  it('the same seed yields identical 3-skill stacks across a roster', () => {
    const first = assignSkillsToApplicants(createSeededRng(5), 30);
    const replay = assignSkillsToApplicants(createSeededRng(5), 30);
    expect(replay.map(m => m.map(s => s.id))).toEqual(first.map(m => m.map(s => s.id)));
  });

  it('different seeds produce different stacked rosters', () => {
    const a = assignSkillsToApplicants(createSeededRng(1), 15);
    const b = assignSkillsToApplicants(createSeededRng(2), 15);
    const key = (roster: { id: string }[][]) => roster.map(m => m.map(s => s.id).sort().join('+')).join('|');
    // Extremely unlikely to collide over 15 members × 2 seeds; a collision
    // would indicate the RNG was not consumed between rosters.
    expect(key(b)).not.toBe(key(a));
  });
});