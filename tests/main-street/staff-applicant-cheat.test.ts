/**
 * Staff Application cheat — unit tests (CG-0MTY9PB51008OG5A).
 *
 * Validates the dev-only `forcedStaffApplicant` flag and the public
 * `computeApplicantChance` helper:
 * - AC2: forced flag makes `resolveStaffApplicant` trigger deterministically
 * - AC3: chance = min(income + reputation, 15)
 * - AC4: eligible-business and zero-chance constraints still apply; the
 *   tutorial/headless `suppressApplicant` call-site gate still suppresses
 * - Flag is not serialized (dev-only)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  resolveStaffApplicant,
  computeApplicantChance,
  executeDayStart,
} from '../../example-games/main-street/MainStreetEngine';
import { createStaffDeck, type BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Places a business at the given street slot (mirrors MainStreetApplicant.test.ts). */
function placeBusiness(
  state: MainStreetState,
  slotIndex = 0,
  overrides: Partial<BusinessCard> = {},
): BusinessCard {
  const base: BusinessCard = {
    family: 'business',
    id: `biz-${slotIndex}`,
    name: `Biz ${slotIndex}`,
    cost: 3,
    baseIncome: 2,
    synergyTypes: ['Food'],
    maxLevel: 4,
    description: 'A test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    ...overrides,
  } as BusinessCard;
  state.streetGrid[slotIndex] = base;
  (base as any).currentIncome = base.baseIncome;
  (base as any).currentReputationPerTurn = base.reputationPerTurn ?? 0;
  return base;
}

/** Employs a synthetic staff member at the given slot (no market purchase). */
function employStaffAt(state: MainStreetState, slotIndex: number): void {
  const tpl = createStaffDeck(1)[0];
  state.staffCards.push({
    ...tpl,
    id: `${tpl.id}-${slotIndex}-${state.staffCards.length}`,
    employedAtSlot: slotIndex,
    specializationSkillIds: [],
  });
}

// ── AC3: computeApplicantChance ─────────────────────────────

describe('computeApplicantChance (AC3)', () => {
  it('returns 0 when no businesses are placed', () => {
    const state = setupMainStreetGame({ seed: 'no-biz' });
    expect(computeApplicantChance(state)).toBe(0);
  });

  it('returns baseIncome when only one business is placed', () => {
    const state = setupMainStreetGame({ seed: 'low-income' });
    placeBusiness(state, 0, { baseIncome: 3 });
    expect(computeApplicantChance(state)).toBe(3);
  });

  it('sums baseIncome across multiple placed businesses', () => {
    const state = setupMainStreetGame({ seed: 'multi-biz' });
    placeBusiness(state, 0, { baseIncome: 2 });
    placeBusiness(state, 1, { baseIncome: 4 });
    expect(computeApplicantChance(state)).toBe(6);
  });

  it('includes reputationPerTurn on businesses', () => {
    const state = setupMainStreetGame({ seed: 'rep-biz' });
    placeBusiness(state, 0, { baseIncome: 2, reputationPerTurn: 3 });
    expect(computeApplicantChance(state)).toBe(5);
  });

  it('caps at 15 when income + reputation exceeds the cap', () => {
    const state = setupMainStreetGame({ seed: 'high-income' });
    placeBusiness(state, 0, { baseIncome: 20 });
    expect(computeApplicantChance(state)).toBe(15);
  });
});

// ── AC2: forcedStaffApplicant bypasses the RNG roll ─────────

describe('resolveStaffApplicant with forcedStaffApplicant (AC2)', () => {
  it('triggers an applicant when forced, even when the RNG roll would fail', () => {
    const state = setupMainStreetGame({ seed: 'forced-on' });
    placeBusiness(state, 0, { baseIncome: 1 });
    // 1% chance — this roll would always fail a normal trigger.
    state.rng = () => 0.99;
    state.forcedStaffApplicant = true;

    resolveStaffApplicant(state);

    expect(state.pendingApplicant).not.toBeNull();
    expect(state.pendingApplicant!.targetSlotIndex).toBe(0);
  });

  it('does NOT trigger when forced is off and the RNG roll fails', () => {
    const state = setupMainStreetGame({ seed: 'forced-off' });
    placeBusiness(state, 0, { baseIncome: 1 });
    state.rng = () => 0.99;
    state.forcedStaffApplicant = false;

    resolveStaffApplicant(state);

    expect(state.pendingApplicant).toBeNull();
  });

  it('still triggers normally (unforced) when the RNG roll succeeds', () => {
    const state = setupMainStreetGame({ seed: 'unforced-success' });
    placeBusiness(state, 0, { baseIncome: 5 });
    state.rng = () => 0.0; // roll 0 < chance
    state.forcedStaffApplicant = false;

    resolveStaffApplicant(state);

    expect(state.pendingApplicant).not.toBeNull();
  });

  it('can be toggled on and off between resolutions', () => {
    const state = setupMainStreetGame({ seed: 'toggle' });
    placeBusiness(state, 0, { baseIncome: 5 });
    state.rng = () => 0.99; // would always fail normally

    state.forcedStaffApplicant = false;
    resolveStaffApplicant(state);
    expect(state.pendingApplicant).toBeNull();

    state.forcedStaffApplicant = true;
    resolveStaffApplicant(state);
    expect(state.pendingApplicant).not.toBeNull();

    state.pendingApplicant = null;
    state.forcedStaffApplicant = false;
    resolveStaffApplicant(state);
    expect(state.pendingApplicant).toBeNull();
  });
});

// ── AC4: existing constraints still respected ───────────────

describe('resolveStaffApplicant constraints with forced flag (AC4)', () => {
  it('does not trigger when no eligible business exists, even when forced', () => {
    const state = setupMainStreetGame({ seed: 'no-biz-forced' });
    state.forcedStaffApplicant = true;

    resolveStaffApplicant(state);

    expect(state.pendingApplicant).toBeNull();
  });

  it('does not trigger when the only business has no free employment slot, even when forced', () => {
    const state = setupMainStreetGame({ seed: 'full-forced' });
    placeBusiness(state, 0, { baseIncome: 5, level: 0 }); // capacity = 1
    employStaffAt(state, 0); // now fully staffed
    state.forcedStaffApplicant = true;

    resolveStaffApplicant(state);

    expect(state.pendingApplicant).toBeNull();
  });

  it('does not trigger when chance is 0, even when forced', () => {
    const state = setupMainStreetGame({ seed: 'zero-chance-forced' });
    placeBusiness(state, 0, { baseIncome: 0 });
    state.forcedStaffApplicant = true;

    resolveStaffApplicant(state);

    expect(state.pendingApplicant).toBeNull();
  });

  it('executeDayStart suppresses the forced applicant when suppressApplicant is true', () => {
    const state = setupMainStreetGame({ seed: 'suppressed' });
    placeBusiness(state, 0, { baseIncome: 5 });
    state.suppressApplicant = true;
    state.forcedStaffApplicant = true;

    executeDayStart(state);

    expect(state.pendingApplicant).toBeNull();
  });

  it('executeDayStart triggers the forced applicant when not suppressed', () => {
    const state = setupMainStreetGame({ seed: 'not-suppressed' });
    placeBusiness(state, 0, { baseIncome: 5 });
    state.suppressApplicant = false;
    state.forcedStaffApplicant = true;

    executeDayStart(state);

    expect(state.pendingApplicant).not.toBeNull();
  });
});

// ── Dev-only flag semantics ─────────────────────────────────

describe('forcedStaffApplicant dev-only semantics', () => {
  it('defaults to undefined/false after setup (no persistence)', () => {
    const state = setupMainStreetGame({ seed: 'default-flag' });
    expect(state.forcedStaffApplicant).toBeFalsy();
  });
});
