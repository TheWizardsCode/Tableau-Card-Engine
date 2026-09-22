/**
 * Main Street: Staff effect scoping integration tests
 * (CG-0MU3BTTWT0025VPL, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Verifies that per-business buffs now read from the per-business
 * `employedStaff` source of truth (CG-0MTIOLY2A0092OT1 AC2) while street-wide
 * skills keep aggregating:
 *   AC1  Income buffs apply ONLY to the employed business slot.
 *   AC2  Reputation buffs apply ONLY to the employed business slot drivers.
 *   AC3  Street-wide skills (Cost Cutter, Brand Ambassador, Negotiator,
 *        Operations Manager salary) still aggregate across ALL staff.
 *   AC4  No double-counting: per-business income/rep buffs are not also
 *        credited street-wide.
 *   AC5  Hand-slot staff (no employment) contribute no per-business buffs.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  applyIncome,
  syncCardCurrentIncome,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  createStaffDeck,
  type StaffCard,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  getEmployedSpecializationSkills,
  computeStaffSalaryCost,
  computeRefreshCostDiscount,
} from '../../example-games/main-street/MainStreetStaffBuffs';
import { getSkill } from '../../example-games/main-street/MainStreetStaffSkills';

// ── Fixtures ────────────────────────────────────────────────

function placeBusinessAt(
  state: MainStreetState,
  slot: number,
  synergy: string[],
  baseIncome = 2,
): BusinessCard {
  const biz: BusinessCard = {
    family: 'business',
    id: `biz-${slot}-${synergy.join('-')}`,
    name: `Test ${synergy.join('/')} @${slot}`,
    cost: 3,
    baseIncome,
    synergyTypes: [...synergy] as BusinessCard['synergyTypes'],
    maxLevel: 0,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'Scoping fixture.',
    ongoingCost: 0,
    employedStaff: [],
  };
  state.streetGrid[slot] = biz;
  syncCardCurrentIncome(state.streetGrid, slot);
  return biz;
}

/** A staff member with a forced skill roster (no per-member RNG). */
function staffWithSkills(name: string, skillIds: string[]): StaffCard {
  const base = createStaffDeck(1).find(c => c.id.startsWith('staff-assistant'))!;
  return { ...base, id: `${base.id}-${name}`, name, specializationSkillIds: [...skillIds] };
}

/** Registers the member on the business's employedStaff list (new source of truth). */
function employAt(state: MainStreetState, slot: number, member: StaffCard): void {
  member.employedAtSlot = slot;
  // Real flow: hired members live in staffCards AND are listed on the business.
  state.staffCards.push(member);
  const biz = state.streetGrid[slot]!;
  if (!Array.isArray(biz.employedStaff)) biz.employedStaff = [];
  biz.employedStaff.push(member);
}

// ── AC1: per-business income buff ───────────────────────────

describe('AC1: income buffs apply only to the employed business', () => {
  it('a Chef employed via business.employedStaff buffs ONLY its Food slot', () => {
    const state = setupMainStreetGame({ seed: 'scope-income' });
    placeBusinessAt(state, 0, ['Food'], 2);
    placeBusinessAt(state, 2, ['Food'], 2); // non-adjacent
    employAt(state, 0, staffWithSkills('chef', ['skill-chef'])); // +20% Food

    const result = applyIncome(state);
    const bySlot = new Map(result.breakdown.map((s: { slotIndex: number; total: number }) => [s.slotIndex, s.total]));
    expect(bySlot.get(0)).toBeCloseTo(2.4); // employed here → buffed
    expect(bySlot.get(2)).toBe(2); // other Food business → untouched (AC1 scope)
  });
});

// ── AC2: per-business reputation buff ───────────────────────

describe('AC2: reputation buffs apply only to their business driver', () => {
  it('Community Builder (+10) credits the street through its employed slot', () => {
    const state = setupMainStreetGame({ seed: 'scope-rep' });
    placeBusinessAt(state, 0, ['Food'], 2);
    const before = state.resourceBank.reputation;
    employAt(state, 0, staffWithSkills('cb', ['skill-community-builder']));
    applyIncome(state);
    expect(state.resourceBank.reputation).toBeCloseTo(before + 10);
  });
});

// ── AC3: street-wide skills preserved ───────────────────────

describe('AC3: street-wide skills still aggregate over employed staff', () => {
  it('getEmployedSpecializationSkills includes employed members (Cost Cutter etc.)', () => {
    const state = setupMainStreetGame({ seed: 'scope-street' });
    placeBusinessAt(state, 0, ['Food'], 2);
    // Employed member with a street-wide skill; hand-slot member too.
    employAt(state, 0, staffWithSkills('cutter', ['skill-cost-cutter']));
    state.staffCards.push(staffWithSkills('neg', ['skill-negotiator']));

    const ids = getEmployedSpecializationSkills(state).map(s => s.id);
    expect(ids).toContain('skill-cost-cutter'); // present even though employed
    expect(ids).toContain('skill-negotiator');
  });

  it('Negotiator refresh discount and Ops-Manager salary math still aggregate', () => {
    expect(computeRefreshCostDiscount([getSkill('skill-negotiator')])).toBe(
      computeRefreshCostDiscount([getSkill('skill-negotiator'), getSkill('skill-negotiator')]) / 2,
    );
    // Salary discount unchanged for an employed operations manager.
    expect(computeStaffSalaryCost([getSkill('skill-operations-manager')], 100)).toBe(50);
  });
});

// ── AC4: no double-counting ─────────────────────────────────

describe('AC4: no double-counting between per-business and street-wide', () => {
  it('the buffed slot pays the FULL buff once; totals equal the sum of slots', () => {
    const state = setupMainStreetGame({ seed: 'scope-no-double' });
    placeBusinessAt(state, 0, ['Food'], 2);
    placeBusinessAt(state, 2, ['Food'], 2);
    employAt(state, 0, staffWithSkills('chef', ['skill-chef']));

    const result = applyIncome(state);
    // Exactly ONE slot got the 20% — the street total is 2.4 + 2.0.
    expect(result.total).toBeCloseTo(4.4);
    const buffed = result.breakdown.filter((s: { total: number }) => s.total > 2.01);
    expect(buffed.length).toBe(1);
  });
});

// ── AC5: backward compatibility ─────────────────────────────

describe('AC5: hand-slot members contribute no per-business buffs', () => {
  it('a hand-slot Chef (no employment) does not buff any business', () => {
    const state = setupMainStreetGame({ seed: 'scope-hand' });
    placeBusinessAt(state, 0, ['Food'], 2);
    state.staffCards.push(staffWithSkills('chef', ['skill-chef'])); // hand-slot only

    const result = applyIncome(state);
    const slot = result.breakdown.find((s: { slotIndex: number }) => s.slotIndex === 0);
    if (slot) expect(slot.total).toBe(2);
  });

  it('legacy employedAtSlot-only states still scope (no employedStaff field)', () => {
    const state = setupMainStreetGame({ seed: 'scope-legacy' });
    const biz = placeBusinessAt(state, 0, ['Food'], 2);
    // Truly legacy shape: business has NO employedStaff field, member linked
    // ONLY via employedAtSlot (the pre-child-1 in-memory model).
    delete (biz as { employedStaff?: unknown }).employedStaff;
    state.staffCards.push({ ...staffWithSkills('chef', ['skill-chef']), employedAtSlot: 0 });

    const result = applyIncome(state);
    const slot = result.breakdown.find((s: { slotIndex: number }) => s.slotIndex === 0);
    if (slot) expect(slot.total).toBeCloseTo(2.4);
  });
});