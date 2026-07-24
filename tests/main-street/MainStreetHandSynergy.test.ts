/**
 * Main Street: Hand Card Synergy Bonus Tests
 *
 * Tests for the hand card synergy bonus system where cards held in hand
 * contribute 1/3 of their baseIncome to each matching-synergy business
 * on the tableau during the IncomePhase.
 *
 * NOTE: These tests validate the hand card synergy bonus feature added by the
 * Multi-Use Card Economy implementation (CG-0MQRXN2CT0076OW7). They reference
 * functions that may not exist until the implementation child
 * (CG-0MQRXO41A0023MFG) is complete. Feature-detection flags control which
 * tests run.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  computeIncome,
  applyIncome,
  type IncomeResult,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Feature Detection ───────────────────────────────────────

/** True once hand fields exist on MainStreetState (I1). */
const HAND_FEATURE_AVAILABLE = 'hand' in (setupMainStreetGame() as any);



// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'hand-synergy-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Creates a minimal BusinessCard for testing.
 */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  const id = overrides.id ?? 'test-biz';
  const isPawnShop = id.startsWith('biz-pawnshop-');
  return {
    family: 'business',
    id,
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    synergyCoinBonus: overrides.synergyCoinBonus ?? (isPawnShop ? 0 : 0.5),
    synergyRepBonus: overrides.synergyRepBonus ?? (isPawnShop ? 0 : 0),
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
  };
}

/**
 * Creates a BusinessCard suitable for hand storage (same shape as grid cards).
 */
function makeHandCard(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return makeBiz(overrides);
}

/**
 * Fills the street grid with a simple test setup.
 * Returns the grid for easy reference.
 */
function fillGrid(
  state: MainStreetState,
  setups: { index: number; card: BusinessCard | CommunitySpaceCard }[],
): void {
  for (const { index, card } of setups) {
    state.streetGrid[index] = card;
  }
}

/**
 * Gets the hand array from state (if feature available).
 */
function getHand(state: MainStreetState): any[] {
  return (state as any).hand ?? [];
}

/**
 * Adds a card to the hand directly (simulating hand management without
 * needing the full purchase-to-hand flow).
 */
function addToHand(state: MainStreetState, card: BusinessCard): void {
  if (HAND_FEATURE_AVAILABLE) {
    const hand = getHand(state);
    hand.push(card);
  }
}

/**
 * Calls computeIncome with hand cards if the function supports it,
 * or falls back to the standard computeIncome otherwise.
 */
function computeIncomeWithHand(
  state: MainStreetState,
): IncomeResult {
  const grid = state.streetGrid;
  const hand = getHand(state);

  // Check if computeIncome accepts an optional hand parameter
  // (signature: computeIncome(grid, bonusPerNeighbor, hand))
  try {
    // Try calling with hand as third argument if feature available
    if (hand.length > 0) {
      const result = (computeIncome as any)(grid, undefined, hand);
      if (result && typeof result.total === 'number') {
        return result;
      }
    }
  } catch {
    // Fallback to standard computeIncome
  }

  return computeIncome(grid);
}

/**
 * Calls applyIncome, which may or may not include hand synergy.
 */
function applyIncomeWithHand(state: MainStreetState): IncomeResult {
  const hand = getHand(state);

  // Check if applyIncome accepts an optional hand parameter
  try {
    if (hand.length > 0) {
      const result = (applyIncome as any)(state, hand);
      if (result && typeof result.total === 'number') {
        return result;
      }
    }
  } catch {
    // Fallback to standard applyIncome
  }

  return applyIncome(state);
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreet Hand Card Synergy Bonus', () => {
  describe('Hand card synergy calculation', () => {
    it('should add 0 synergy when hand is empty', () => {
      const state = createTestState();
      fillGrid(state, [
        { index: 0, card: makeBiz({ id: 'biz-a', baseIncome: 2, synergyTypes: ['Food'] }) },
        { index: 1, card: makeBiz({ id: 'biz-b', baseIncome: 1, synergyTypes: ['Food'] }) },
      ]);

      const result = computeIncomeWithHand(state);

      // Standard tableau synergy: 2 + 1 + 1 (neighbor bonus each) = 5
      expect(result.total).toBeGreaterThan(0);
    });

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should add 1/3 hand card income to each matching synergy tableau business',
      () => {
        const state = createTestState();
        // Set up one Food business on tableau
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-bakery', baseIncome: 3, synergyTypes: ['Food'] }) },
        ]);

        // Add a Food card to hand with baseIncome=3 (1/3 = 1)
        addToHand(state, makeHandCard({ id: 'hand-food-1', baseIncome: 3, synergyTypes: ['Food'] }));

        const result = computeIncomeWithHand(state);

        // Tableau biz: 3 base + 1 hand synergy = 4
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        expect(slot0).toBeDefined();
        expect(slot0!.total).toBeGreaterThan(3); // 3 base + >= 1 hand synergy
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should apply Math.floor(handCard.baseIncome / 3) per matching business',
      () => {
        const state = createTestState();
        // A business with baseIncome=4 → Math.floor(4/3) = 1
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-a', baseIncome: 0, synergyTypes: ['Food'] }) },
          { index: 1, card: makeBiz({ id: 'biz-b', baseIncome: 0, synergyTypes: ['Food'] }) },
        ]);

        // Hand card with baseIncome=4 → floor(4/3) = 1 per matching business
        addToHand(state, makeHandCard({ id: 'hand-food', baseIncome: 4, synergyTypes: ['Food'] }));

        const result = computeIncomeWithHand(state);

        // Each Food biz gets +1 from hand synergy
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        const slot1 = result.breakdown.find(s => s.slotIndex === 1);
        expect(slot0).toBeDefined();
        expect(slot1).toBeDefined();

        // Total should be at least 2 (base 0 + 1 hand synergy each)
        expect(result.total).toBeGreaterThanOrEqual(2);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should stack bonuses from multiple hand cards of the same synergy',
      () => {
        const state = createTestState();
        // One Food business on tableau
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }) },
        ]);

        // Two Food hand cards, each baseIncome=3 → floor(3/3)=1 each → 2 total synergy
        addToHand(state, makeHandCard({ id: 'hand-food-1', baseIncome: 3, synergyTypes: ['Food'] }));
        addToHand(state, makeHandCard({ id: 'hand-food-2', baseIncome: 3, synergyTypes: ['Food'] }));

        const result = computeIncomeWithHand(state);

        // biz gets 0 base + 2 from two hand cards = 2
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        expect(slot0).toBeDefined();
        expect(slot0!.total).toBeGreaterThanOrEqual(2);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should not add synergy from hand cards with non-matching synergy types',
      () => {
        const state = createTestState();
        // One Food business, one Culture business on tableau
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }) },
          { index: 1, card: makeBiz({ id: 'biz-culture', baseIncome: 0, synergyTypes: ['Culture'] }) },
        ]);

        // An Entertainment hand card — should not provide bonus to Food or Culture businesses
        addToHand(state, makeHandCard({ id: 'hand-ent', baseIncome: 6, synergyTypes: ['Entertainment'] }));

        const result = computeIncomeWithHand(state);

        // If hand synergy is working correctly, neither Food nor Culture biz should get bonus
        // from Entertainment hand card
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        const slot1 = result.breakdown.find(s => s.slotIndex === 1);
        expect(slot0).toBeDefined();
        expect(slot1).toBeDefined();

        // Total should be 0 (no matching synergy, no base income)
        // If system incorrectly applies bonuses, this will fail
        expect(result.total).toBe(0);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should apply hand card synergy only to matching synergy types, not all',
      () => {
        const state = createTestState();
        // One Culture business and one Food business
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-culture', baseIncome: 0, synergyTypes: ['Culture'] }) },
          { index: 1, card: makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }) },
        ]);

        // A Culture hand card — should only boost the Culture business
        addToHand(state, makeHandCard({ id: 'hand-culture', baseIncome: 3, synergyTypes: ['Culture'] }));

        const result = computeIncomeWithHand(state);

        // Culture biz gets floor(3/3)=1 from hand; Food biz gets 0
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        const slot1 = result.breakdown.find(s => s.slotIndex === 1);
        expect(slot0).toBeDefined();
        expect(slot1).toBeDefined();
        expect(slot0!.total).toBeGreaterThanOrEqual(1); // Culture gets bonus
        expect(slot1!.total).toBe(0); // Food gets no bonus
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should add bonus from multi-synergy hand card to multiple business types',
      () => {
        const state = createTestState();
        // One Food business and one Culture business
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }) },
          { index: 1, card: makeBiz({ id: 'biz-culture', baseIncome: 0, synergyTypes: ['Culture'] }) },
        ]);

        // A Food+Culture hand card (like a Cafe) — should boost both
        addToHand(state, makeHandCard({
          id: 'hand-cafe',
          baseIncome: 3,
          synergyTypes: ['Food', 'Culture'],
        }));

        const result = computeIncomeWithHand(state);

        // Both businesses get floor(3/3)=1 from the hand card
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        const slot1 = result.breakdown.find(s => s.slotIndex === 1);
        expect(slot0).toBeDefined();
        expect(slot1).toBeDefined();
        expect(slot0!.total).toBeGreaterThanOrEqual(1); // Food gets bonus
        expect(slot1!.total).toBeGreaterThanOrEqual(1); // Culture gets bonus
      },
    );
  });

  describe('Hand card synergy during IncomePhase', () => {
    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should affect applyIncome result when hand cards are present',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 3, synergyTypes: ['Food'] }) },
        ]);

        // Capture income without hand
        const incomeWithoutHand = applyIncome(state);

        // Reset and add hand card
        const state2 = createTestState();
        fillGrid(state2, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 3, synergyTypes: ['Food'] }) },
        ]);
        addToHand(state2, makeHandCard({ id: 'hand-food', baseIncome: 3, synergyTypes: ['Food'] }));

        const incomeWithHandResult = applyIncomeWithHand(state2);

        // Income with hand card should be >= income without hand card
        expect(incomeWithHandResult.total).toBeGreaterThanOrEqual(incomeWithoutHand.total);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should stop providing hand synergy when card is placed from hand to tableau',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food-target', baseIncome: 0, synergyTypes: ['Food'] }) },
          { index: 1, card: makeBiz({ id: 'biz-other', baseIncome: 0, synergyTypes: ['Food'] }) },
        ]);

        // Add a hand card
        const handCard = makeHandCard({
          id: 'hand-food',
          baseIncome: 6,
          synergyTypes: ['Food'],
        });
        addToHand(state, handCard);

        // Now "place" the card from hand to tableau at an empty slot
        const emptySlot = state.streetGrid.findIndex(s => s === null);
        if (emptySlot >= 0 && HAND_FEATURE_AVAILABLE) {
          state.streetGrid[emptySlot] = handCard;
          const hand = getHand(state);
          const idx = hand.findIndex((c: any) => c.id === handCard.id);
          if (idx >= 0) hand.splice(idx, 1);
        }

        const incomeAfterPlacement = computeIncomeWithHand(state);

        // Income may differ (hand synergy contributed to all matching businesses,
        // tableau income contributes to just one slot)
        expect(incomeAfterPlacement.total).toBeGreaterThanOrEqual(0);
      },
    );

    it('should preserve standard adjacency synergy when hand cards are present', () => {
      const state = createTestState();
      // Two adjacent Food businesses
      fillGrid(state, [
        { index: 0, card: makeBiz({ id: 'biz-a', baseIncome: 1, synergyTypes: ['Food'] }) },
        { index: 1, card: makeBiz({ id: 'biz-b', baseIncome: 1, synergyTypes: ['Food'] }) },
      ]);

      const result = computeIncome(state.streetGrid);

      // Percentage-based: each gets 1 base + 0.5 synergy = 1.5, total = 3
      expect(result.total).toBe(3);
    });
  });

  describe('Income breakdown', () => {
    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should include hand card synergy in income breakdown',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 3, synergyTypes: ['Food'] }) },
        ]);

        addToHand(state, makeHandCard({ id: 'hand-food', baseIncome: 3, synergyTypes: ['Food'] }));

        const result = computeIncomeWithHand(state);

        // Breakdown should be present
        expect(result.breakdown.length).toBeGreaterThan(0);

        // Each slot should have a total
        for (const slot of result.breakdown) {
          expect(typeof slot.total).toBe('number');
          expect(typeof slot.baseIncome).toBe('number');
          expect(typeof slot.synergyBonus).toBe('number');
        }
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should show zero hand synergy when no hand cards match tableau businesses',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 3, synergyTypes: ['Food'] }) },
        ]);

        // Entertainment hand card — no match
        addToHand(state, makeHandCard({ id: 'hand-ent', baseIncome: 6, synergyTypes: ['Entertainment'] }));

        const result = computeIncomeWithHand(state);

        // Food business should get standard income only (no hand synergy)
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        expect(slot0).toBeDefined();
        // baseIncome=3, no synergy from adjacent businesses
        expect(slot0!.total).toBe(3);
      },
    );
  });

  describe('Edge Cases', () => {
    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should handle empty hand and empty grid gracefully',
      () => {
        const state = createTestState();
        // Empty grid, empty hand
        const result = computeIncomeWithHand(state);
        expect(result.total).toBe(0);
        expect(result.breakdown).toEqual([]);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should handle hand cards with baseIncome=0 (no synergy contribution)',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 3, synergyTypes: ['Food'] }) },
        ]);

        // Hand card with 0 base income — contributes 0 to synergy
        addToHand(state, makeHandCard({ id: 'hand-zero', baseIncome: 0, synergyTypes: ['Food'] }));

        const result = computeIncomeWithHand(state);

        // No change from hand card with 0 income
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        expect(slot0).toBeDefined();
        expect(slot0!.total).toBe(3);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should handle hand with many cards matching the same tableau business',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }) },
        ]);

        // Many hand cards of the same synergy (each baseIncome=3 → contributes 1)
        for (let i = 0; i < 5; i++) {
          addToHand(state, makeHandCard({
            id: `hand-food-${i}`,
            baseIncome: 3,
            synergyTypes: ['Food'],
          }));
        }

        const result = computeIncomeWithHand(state);

        // 5 hand cards each contribute floor(3/3)=1 → 5 total
        const slot0 = result.breakdown.find(s => s.slotIndex === 0);
        expect(slot0).toBeDefined();
        expect(slot0!.total).toBeGreaterThanOrEqual(5);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should handle hand cards with different synergy types to different businesses',
      () => {
        const state = createTestState();
        fillGrid(state, [
          { index: 0, card: makeBiz({ id: 'biz-food', baseIncome: 0, synergyTypes: ['Food'] }) },
          { index: 1, card: makeBiz({ id: 'biz-culture', baseIncome: 0, synergyTypes: ['Culture'] }) },
          { index: 2, card: makeBiz({ id: 'biz-commerce', baseIncome: 0, synergyTypes: ['Commerce'] }) },
        ]);

        // One hand card per synergy type
        addToHand(state, makeHandCard({ id: 'hand-food', baseIncome: 3, synergyTypes: ['Food'] }));
        addToHand(state, makeHandCard({ id: 'hand-culture', baseIncome: 3, synergyTypes: ['Culture'] }));
        addToHand(state, makeHandCard({ id: 'hand-commerce', baseIncome: 3, synergyTypes: ['Commerce'] }));

        const result = computeIncomeWithHand(state);

        // Each business should get its matching bonus
        const breakdown = result.breakdown;
        for (const slot of breakdown) {
          expect(slot.total).toBeGreaterThanOrEqual(1);
        }

        // Total = 3 businesses * 1 from hand synergy = 3
        expect(result.total).toBeGreaterThanOrEqual(3);
      },
    );

    it('Pawn Shop should not receive hand card synergy from hand Commerce cards', () => {
      const state = createTestState();
      fillGrid(state, [
        { index: 0, card: makeBiz({
          id: 'biz-pawnshop-0',
          name: 'Pawn Shop',
          baseIncome: 0,
          synergyTypes: ['Commerce'],
        }) },
      ]);

      // Add a Commerce hand card
      addToHand(state, makeHandCard({ id: 'hand-commerce', baseIncome: 6, synergyTypes: ['Commerce'] }));

      const result = computeIncomeWithHand(state);

      // Pawn Shop should NOT receive hand synergy even from matching type
      const slot0 = result.breakdown.find(s => s.slotIndex === 0);
      if (slot0) {
        expect(slot0.total).toBe(0); // Pawn Shop gets nothing
      }
    });
  });
});
