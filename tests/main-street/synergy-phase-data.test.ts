/**
 * Main Street: synergy/base phase-data separation (CG-0MTV6LZEA003YS3E).
 *
 * The phased income animation routes synergy coins along the synergy lines, so
 * `applyIncome` must report board adjacency synergy as a non-zero
 * `SlotPhaseBreakdown.synergyBonus` per slot and exclude it from `baseIncome`,
 * while the per-slot phase sum still equals the credited total (and
 * `SlotIncome.total` is unchanged).
 *
 * Scenarios (AC1): single pair, multi-neighbour, extended range
 * (`synergyRangeBonus`), zero-synergy (opt-out), sold-slot anchor, and the
 * same-type base-income penalty.
 *
 * Uses the Easy preset (`synergyBonusPerNeighbor = 0.5`) so the default 0.5
 * card synergy rate yields clean 25% shares.
 */
import { describe, it, expect } from 'vitest';

import {
  applyIncome,
  recalculateCard,
  computeSynergyPairs,
} from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ───────────────────────────────────────────────────────

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'biz-test-0',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 200,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    synergyCoinBonus: overrides.synergyCoinBonus ?? 0.5,
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

type State = ReturnType<typeof setupMainStreetGame>;

/** Places cards and resyncs every occupied slot's cached income. */
function setup(cards: Array<{ index: number; card: BusinessCard }>, sold: number[] = []): State {
  const state = setupMainStreetGame({ seed: 'synergy-phase-data', difficulty: 'Easy' });
  // Pin the reputation coin multiplier to 1.0 so credited values are exact.
  state.resourceBank.reputation = 0;
  for (const { index, card } of cards) {
    state.streetGrid[index] = card;
  }
  for (const index of sold) state.soldSlots[index] = true;
  for (let i = 0; i < state.streetGrid.length; i++) recalculateCard(state, i);
  return state;
}

function phase(state: State, index: number) {
  const result = applyIncome(state);
  const pd = result.phaseBreakdown.perSlotBreakdown.find((s) => s.slotIndex === index);
  expect(pd, `phase slot ${index}`).toBeDefined();
  return { result, pd: pd! };
}

/** Sums every phase field for a slot (integer/rounding-safe via toBeCloseTo). */
function phaseSum(pd: { baseIncome: number; synergyBonus: number; repBonus: number; eventDeltas: Array<{ delta: number }>; upcomingDeltas: Array<{ delta: number }> }): number {
  return pd.baseIncome + pd.synergyBonus + pd.repBonus
    + pd.eventDeltas.reduce((acc, d) => acc + d.delta, 0)
    + pd.upcomingDeltas.reduce((acc, d) => acc + d.delta, 0);
}

// ── Single pair ───────────────────────────────────────────────────

describe('synergy/base phase-data separation (CG-0MTV6LZEA003YS3E)', () => {
  it('separates the single-pair synergy from base income (both directions)', () => {
    const state = setup([
      { index: 0, card: makeBiz({ id: 'biz-cafe-0', baseIncome: 200 }) },
      { index: 1, card: makeBiz({ id: 'biz-bakery-0', baseIncome: 200 }) },
    ]);

    // effectiveBase 200 × rate 0.5 × 0.5 (Easy) × 1 neighbour = 50.
    // `currentIncome` (250) is base 200 + synergy 50; the phase data reports
    // base = 200 and synergy = 50.
    const s0 = phase(state, 0);
    expect(s0.pd.baseIncome).toBe(200);
    expect(s0.pd.synergyBonus).toBe(50);

    const state2 = setup([
      { index: 0, card: makeBiz({ id: 'biz-cafe-1', baseIncome: 200 }) },
      { index: 1, card: makeBiz({ id: 'biz-bakery-1', baseIncome: 200 }) },
    ]);
    const s1 = phase(state2, 1);
    expect(s1.pd.baseIncome).toBe(200);
    expect(s1.pd.synergyBonus).toBe(50);

    // SlotIncome also separates while `total` is unchanged.
    expect(s0.result.breakdown.find((b) => b.slotIndex === 0)!.baseIncome).toBe(200);
    expect(s0.result.breakdown.find((b) => b.slotIndex === 0)!.synergyBonus).toBe(50);
    expect(s0.result.breakdown.find((b) => b.slotIndex === 0)!.total).toBe(250);
  });

  it('keeps the phase sum equal to the credited coins', () => {
    const state = setup([
      { index: 0, card: makeBiz({ id: 'biz-cafe-2', baseIncome: 200 }) },
      { index: 1, card: makeBiz({ id: 'biz-bakery-2', baseIncome: 200 }) },
    ]);
    const coinsBefore = state.resourceBank.coins;
    const result = applyIncome(state);
    const credited = state.resourceBank.coins - coinsBefore;

    const summed = result.phaseBreakdown.perSlotBreakdown.reduce((acc, pd) => acc + phaseSum(pd), 0);
    expect(summed).toBe(credited);
    expect(credited).toBe(500);
  });

  // ── Multi-neighbour ─────────────────────────────────────────────

  it('attributes a multi-neighbour bonus across each matching neighbour', () => {
    const state = setup([
      // Slot 0 has two synergistic neighbours (1 and 5).
      { index: 0, card: makeBiz({ id: 'biz-cafe-3', baseIncome: 200 }) },
      { index: 1, card: makeBiz({ id: 'biz-bakery-3', baseIncome: 200 }) },
      { index: 5, card: makeBiz({ id: 'biz-diner-3', baseIncome: 200 }) },
    ]);

    // effectiveBase 200 × 0.5 × 0.5 × 2 = 100
    const s0 = phase(state, 0);
    expect(s0.pd.synergyBonus).toBe(100);
    expect(s0.pd.baseIncome).toBe(200);

    // The visual pair set matches the neighbours used by the formula.
    const pairs = computeSynergyPairs(state.streetGrid, state.soldSlots);
    const fromZero = pairs.filter((p) => p.fromIndex === 0 || p.toIndex === 0);
    expect(fromZero.length).toBe(2);
  });

  // ── Extended range ──────────────────────────────────────────────

  it('reports extended-range (synergyRangeBonus) synergy as synergyBonus', () => {
    const state = setup([
      { index: 0, card: makeBiz({ id: 'biz-cafe-4', baseIncome: 200, synergyRangeBonus: 1 }) },
      { index: 2, card: makeBiz({ id: 'biz-bakery-4', baseIncome: 200 }) },
    ]);

    const s0 = phase(state, 0);
    expect(s0.pd.synergyBonus).toBe(50);
    expect(s0.pd.baseIncome).toBe(200);
    // The extended-range partner is reported as a pair.
    expect(computeSynergyPairs(state.streetGrid, state.soldSlots)).toContainEqual({
      fromIndex: 0,
      toIndex: 2,
      sharedSynergy: 'Food',
    });
  });

  it('a range-0 card earns no synergy from a distance-2 partner', () => {
    const state = setup([
      { index: 0, card: makeBiz({ id: 'biz-cafe-5', baseIncome: 200 }) },
      { index: 2, card: makeBiz({ id: 'biz-bakery-5', baseIncome: 200 }) },
    ]);

    const s0 = phase(state, 0);
    expect(s0.pd.synergyBonus).toBe(0);
    expect(s0.pd.baseIncome).toBe(200);
  });

  // ── Zero-synergy opt-out ────────────────────────────────────────

  it('a zero-synergy opt-out card reports baseIncome only', () => {
    const state = setup([
      // Pawn Shop-style opt-out (synergyCoinBonus = 0).
      { index: 0, card: makeBiz({ id: 'biz-pawnshop-0', baseIncome: 200, synergyCoinBonus: 0 }) },
      { index: 1, card: makeBiz({ id: 'biz-bakery-6', baseIncome: 200 }) },
    ]);

    const s0 = phase(state, 0);
    expect(s0.pd.synergyBonus).toBe(0);
    expect(s0.pd.baseIncome).toBe(200);
  });

  // ── Sold-slot anchor ────────────────────────────────────────────

  it('a sold neighbour still contributes synergy to the surviving slot', () => {
    const state = setup(
      [
        { index: 0, card: makeBiz({ id: 'biz-cafe-6', baseIncome: 200 }) },
        { index: 1, card: makeBiz({ id: 'biz-bakery-7', baseIncome: 200 }) },
      ],
      [1],
    );

    // The sold card is skipped entirely; the surviving slot still earns its
    // bonus because sold neighbours remain synergy anchors.
    const s0 = phase(state, 0);
    expect(s0.pd.synergyBonus).toBe(50);
    expect(s0.pd.baseIncome).toBe(200);
    expect(s0.result.phaseBreakdown.perSlotBreakdown.some((s) => s.slotIndex === 1)).toBe(false);
  });

  // ── Same-type penalty ───────────────────────────────────────────

  it('same-type neighbours get the 60% base penalty with zero synergy', () => {
    const state = setup([
      { index: 0, card: makeBiz({ id: 'biz-bakery-8', baseIncome: 200 }) },
      { index: 1, card: makeBiz({ id: 'biz-bakery-9', baseIncome: 200 }) },
    ]);

    // 200 × 0.6 = 120, no synergy (same base type).
    const s0 = phase(state, 0);
    expect(s0.pd.baseIncome).toBe(120);
    expect(s0.pd.synergyBonus).toBe(0);
  });
});
