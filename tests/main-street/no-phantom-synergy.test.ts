/**
 * Main Street: Regression — No phantom synergy when none exists
 *
 * Reproduces the reporter's scenario: two businesses of different base types
 * with disjoint `synergyTypes` placed on the street grid.  Proves that
 * hand cards — whether empty, disjoint, or sharing synergyTypes with board
 * businesses — contribute 0 to street income.
 *
 * Intended product rule (producer clarification, 2026-09-07): cards in the
 * hand are not in play — only businesses placed on the street contribute to
 * synergy.  Before the fix the matching-hand variant fails deterministically
 * (synergyBonus ≈ 1.33 instead of 0).  After CG-0MTRDX0DN004EECN removes the
 * hand-synergy path this suite should pass with the `.fails` modifier removed.
 *
 * Parent: CG-0MTR317Q2003YCDN
 * Child:  CG-0MTRDRPYV001971H
 */

import { describe, it, expect } from 'vitest';

import {
  applyIncome,
  computeSynergyPairs,
  recalculateCard,
} from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ───────────────────────────────────────────────────────

/** Build a minimal BusinessCard for tests. */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business' as const,
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    synergyCoinBonus: overrides.synergyCoinBonus ?? (overrides.id?.startsWith('biz-pawnshop-') ? 0 : 0.5),
    synergyRepBonus: overrides.synergyRepBonus ?? 0,
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
    ...overrides,
  };
}

/** Place a card at `index` on the grid and recalculate. */
function place(
  state: ReturnType<typeof setupMainStreetGame>,
  index: number,
  card: BusinessCard | CommunitySpaceCard,
): void {
  state.streetGrid[index] = card;
  recalculateCard(state, index);
}

function setupTwoDisjoint(overrides: { hand?: BusinessCard[] } = {}) {
  const state = setupMainStreetGame({ seed: 'no-phantom-test' });
  place(state, 0, makeBiz({ id: 'biz-cafe-0', name: 'Cafe', baseIncome: 2, synergyTypes: ['Food'] }));
  place(state, 1, makeBiz({ id: 'biz-clinic-0', name: 'Clinic', baseIncome: 1, synergyTypes: ['Service'] }));
  if (overrides.hand !== undefined) {
    state.hand.splice(0, state.hand.length, ...overrides.hand);
  } else {
    state.hand.splice(0, state.hand.length);
  }
  return state;
}

function expectNoPhantomSynergy(state: ReturnType<typeof setupMainStreetGame>) {
  const coinsBefore = state.resourceBank.coins;
  const income = applyIncome(state);

  for (const slot of income.phaseBreakdown.perSlotBreakdown) {
    expect(slot.synergyBonus).toBe(0);
  }
  expect(income.handSynergyTotal).toBe(0);
  expect(income.phaseBreakdown.handSynergyTotal).toBe(0);
  expect(computeSynergyPairs(state.streetGrid)).toEqual([]);

  const coinsCredited = state.resourceBank.coins - coinsBefore;
  const sumBase = income.phaseBreakdown.perSlotBreakdown.reduce((acc, s) => acc + s.baseIncome, 0);
  expect(income.total).toBe(sumBase);
  expect(income.total).toBe(coinsCredited);
}

// ── AC1: No phantom synergy when none exists ─────────────────────

describe('AC1 — no phantom synergy when none exists', () => {
  it('empty hand: synergyBonus=0, handSynergyTotal=0, no synergy pairs, credited==total', () => {
    const state = setupTwoDisjoint({ hand: [] });
    expectNoPhantomSynergy(state);
  });

  it('disjoint hand (no synergy match): synergyBonus=0', () => {
    const state = setupTwoDisjoint({
      hand: [makeBiz({ id: 'hand-other', name: 'Other', baseIncome: 3, synergyTypes: ['Entertainment'] })],
    });
    expectNoPhantomSynergy(state);
  });

  // FIXME (CG-0MTRDX0DN004EECN): before the hand-synergy removal this
  // deterministically yields synergyBonus ≈ 1.33; marked `.fails` so the
  // suite stays green while the regression is tracked.  Remove `.fails`
  // once that item lands.
  it.fails('matching hand (shares Food/Service with street) must still yield 0', () => {
    const state = setupTwoDisjoint({
      hand: [makeBiz({ id: 'hand-match', name: 'Match', baseIncome: 3, synergyTypes: ['Food', 'Service'] })],
    });
    expectNoPhantomSynergy(state);
  });

  it('control — board adjacency synergy still tracked correctly', () => {
    const state = setupMainStreetGame({ seed: 'no-phantom-control' });
    place(state, 0, makeBiz({ id: 'biz-a', name: 'A', baseIncome: 2, synergyTypes: ['Food'] }));
    place(state, 1, makeBiz({ id: 'biz-b', name: 'B', baseIncome: 1, synergyTypes: ['Food'] }));
    state.hand.splice(0, state.hand.length);

    const pairs = computeSynergyPairs(state.streetGrid);
    expect(pairs.length).toBe(1);
    expect(pairs[0]).toEqual({ fromIndex: 0, toIndex: 1, sharedSynergy: 'Food' });
  });
});
