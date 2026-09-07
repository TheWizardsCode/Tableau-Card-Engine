/**
 * Main Street: Hand Cards Never Contribute Synergy
 *
 * Producer rule (2026-09-07): cards in the hand are NOT in play and must have
 * no effect on street income. Only businesses placed on the street contribute
 * to synergy (board adjacency, baked into `currentIncome` / `baseIncome`).
 *
 * This suite replaced the old hand-card-synergy feature tests
 * (CG-0MQRXN2CT0076OW7) after the hand-synergy path was removed
 * (CG-0MTRDX0DN004EECN, parent CG-0MTR317Q2003YCDN). Each case asserts that
 * holding cards — matching or not — leaves income unchanged.
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
  recalculateCard,
} from '../../example-games/main-street/MainStreetAdjacency';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'hand-synergy-removal'): MainStreetState {
  return setupMainStreetGame({ seed });
}

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business' as const,
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
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

/** Sets `state.hand` to exactly the provided cards. */
function setHand(state: MainStreetState, hand: BusinessCard[]): void {
  state.hand.splice(0, state.hand.length, ...hand);
}

// ── Tests ───────────────────────────────────────────────────

describe('Hand cards never contribute street synergy (CG-0MTRDX0DN004EECN)', () => {
  it('empty hand yields zero hand synergy', () => {
    const state = createTestState();
    placeGrid(state, 0, makeBiz({ id: 'biz-a', baseIncome: 3, synergyTypes: ['Food'] }));
    setHand(state, []);

    const result = applyIncome(state);
    expect(result.handSynergyTotal).toBe(0);
    for (const slot of result.phaseBreakdown.perSlotBreakdown) {
      expect(slot.synergyBonus).toBe(0);
    }
  });

  it('a hand card sharing a synergy type with the street adds nothing', () => {
    const state = createTestState();
    placeGrid(state, 0, makeBiz({ id: 'biz-bakery', baseIncome: 3, synergyTypes: ['Food'] }));
    // A Food hand card would have granted floor(3/3)=1 per matching slot
    // under the removed hand-synergy feature; now it must add nothing.
    setHand(state, [makeBiz({ id: 'hand-food-1', baseIncome: 3, synergyTypes: ['Food'] })]);

    const result = applyIncome(state);
    expect(result.handSynergyTotal).toBe(0);
    const slot0 = result.breakdown.find(s => s.slotIndex === 0);
    expect(slot0!.total).toBe(3); // board income only
  });

  it('multiple matching hand cards and multiple businesses still add nothing', () => {
    const state = createTestState();
    placeGrid(state, 0, makeBiz({ id: 'biz-a', baseIncome: 0, synergyTypes: ['Food'] }));
    placeGrid(state, 1, makeBiz({ id: 'biz-b', baseIncome: 0, synergyTypes: ['Food'] }));

    const many: BusinessCard[] = [];
    for (let i = 0; i < 5; i++) {
      many.push(makeBiz({ id: `hand-food-${i}`, baseIncome: 3, synergyTypes: ['Food'] }));
    }
    setHand(state, many);

    const result = applyIncome(state);
    expect(result.handSynergyTotal).toBe(0);
    for (const slot of result.breakdown) {
      expect(slot.total).toBe(0); // zero base income, zero synergy from hand
    }
  });

  it('disjoint-type hand cards add nothing to matching-type neighbours', () => {
    const state = createTestState();
    placeGrid(state, 0, makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }));
    placeGrid(state, 1, makeBiz({ id: 'biz-culture', baseIncome: 0, synergyTypes: ['Culture'] }));
    setHand(state, [makeBiz({ id: 'hand-ent', baseIncome: 6, synergyTypes: ['Entertainment'] })]);

    const result = applyIncome(state);
    expect(result.total).toBe(0);
    expect(result.handSynergyTotal).toBe(0);
  });

  it('multi-synergy hand card does not boost multiple business types', () => {
    const state = createTestState();
    placeGrid(state, 0, makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }));
    placeGrid(state, 1, makeBiz({ id: 'biz-culture', baseIncome: 0, synergyTypes: ['Culture'] }));
    setHand(state, [makeBiz({ id: 'hand-cafe', baseIncome: 3, synergyTypes: ['Food', 'Culture'] })]);

    const result = applyIncome(state);
    expect(result.total).toBe(0);
    expect(result.handSynergyTotal).toBe(0);
  });

  it('placing the held card onto the grid makes it contribute as a placed business', () => {
    const state = createTestState();
    placeGrid(state, 0, makeBiz({ id: 'biz-other', baseIncome: 0, synergyTypes: ['Food'] }));
    const held = makeBiz({ id: 'biz-new', baseIncome: 3, synergyTypes: ['Food'] });
    setHand(state, [held]);
    // Holding yields nothing...
    expect(applyIncome(state).handSynergyTotal).toBe(0);

    // ...but once placed on the street it earns its own base income.
    placeGrid(state, 1, held);
    setHand(state, []);
    const result = applyIncome(state);
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.handSynergyTotal).toBe(0);
  });

  it('board adjacency synergy between placed businesses is unaffected by the hand', () => {
    const state = createTestState();
    // Two adjacent Food businesses (no same-type penalty: different ids).
    placeGrid(state, 0, makeBiz({ id: 'biz-a', baseIncome: 1, synergyTypes: ['Food'] }));
    placeGrid(state, 1, makeBiz({ id: 'biz-b', baseIncome: 1, synergyTypes: ['Food'] }));
    setHand(state, [makeBiz({ id: 'hand-food', baseIncome: 9, synergyTypes: ['Food'] })]);

    const withHand = applyIncome(state);
    setHand(state, []);
    const withoutHand = applyIncome(state);

    expect(withHand.total).toBe(withoutHand.total);
    // Medium synergy multiplier (0.35) at rep 0 (1×): base 1 + round(1*0.5*0.35)=0 → 1 each
    expect(withHand.total).toBe(2);
    expect(withHand.handSynergyTotal).toBe(0);
  });
});

/**
 * Places a business on the grid and syncs its cached income so applyIncome
 * sees the same values a real placement would produce.
 */
function placeGrid(
  state: MainStreetState,
  index: number,
  card: BusinessCard,
): void {
  state.streetGrid[index] = card;
  recalculateCard(state, index);
}
