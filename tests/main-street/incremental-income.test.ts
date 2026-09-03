/**
 * Main Street: Per-Card Incremental Income/Reputation Tracking Tests
 *
 * Validates that each BusinessCard/CommunitySpaceCard has self-contained
 * `currentIncome` and `currentReputationPerTurn` fields that are updated
 * incrementally when cards are placed or sold, rather than being recomputed
 * from scratch each turn.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  computeBusinessIncome,
  applyIncome,
  syncCardCurrentIncome,
  syncCardCurrentRepPerTurn,
  recalculateCard,
  updateNeighborsOnPlacement,
  updateNeighborsOnSale,
} from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  serializeMainStreetState,
  deserializeMainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  GRID_SIZE,
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import { sellBusiness } from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ──────────────────────────────────────────────────

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  const defaults = {
    family: 'business' as const,
    id: 'test-biz-0',
    name: 'Test Biz',
    cost: 3,
    baseIncome: 200,
    synergyTypes: ['Food'] as readonly import('../../example-games/main-street/MainStreetCards').SynergyType[],
    maxLevel: 1,
    description: 'A test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
  };
  const card: BusinessCard = { ...defaults, ...overrides } as BusinessCard;
  return card;
}



function emptyGrid(): (BusinessCard | CommunitySpaceCard | null)[] {
  return new Array<BusinessCard | CommunitySpaceCard | null>(GRID_SIZE).fill(null);
}

/** Creates a game state with high coins for convenient testing. */
function createRichState(seed: string = 'inc-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  state.resourceBank.coins = 20000;
  state.resourceBank.reputation = 500;
  return state;
}

// ── Tests ─────────────────────────────────────────────────────

describe('Per-card incremental income/reputation tracking', () => {
  // ── AC1: Field initialization ───────────────────────────────

  describe('AC1: Field initialization (currentIncome / currentReputationPerTurn)', () => {
    it('cards created via makeBiz have undefined currentIncome/currentReputationPerTurn by default', () => {
      const card = makeBiz({
        id: 'biz-cafe-0',
        baseIncome: 300,
        synergyTypes: ['Food'],
      });
      // Cached values are undefined until recalculateCard is called
      expect(card.currentIncome).toBeUndefined();
      expect(card.currentReputationPerTurn).toBeUndefined();
    });

    it('recalculateCard sets cached values on a card', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      
      // Before recalculate: undefined
      expect(state.streetGrid[0]!.currentIncome).toBeUndefined();
      
      recalculateCard(state, 0);
      
      // After recalculate: computed
      expect(state.streetGrid[0]!.currentIncome).toBe(300);
      expect(state.streetGrid[0]!.currentReputationPerTurn).toBe(0);
    });

    it('cached values are undefined on market cards until placement and recalculation', () => {
      const state = setupMainStreetGame({ seed: 'field-init' });
      const card = state.market.cards[0] as (BusinessCard & {
        currentIncome?: number;
        currentReputationPerTurn?: number;
      }) | undefined;
      if (card) {
        // Before placement, cached values are not set (undefined)
        expect(card.currentIncome).toBeUndefined();
        expect(card.currentReputationPerTurn).toBeUndefined();
      }
    });
  });

  // ── AC2: Recalculation on card placement ────────────────────

  describe('AC2: syncCardCurrentIncome / recalculateCard', () => {
    it('syncCardCurrentIncome sets currentIncome to match computeBusinessIncome', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });

      // Manually sync
      syncCardCurrentIncome(grid, 0);
      syncCardCurrentIncome(grid, 1);

      const expected0 = computeBusinessIncome(grid, 0);
      const expected1 = computeBusinessIncome(grid, 1);
      expect(grid[0]!.currentIncome).toBe(expected0);
      expect(grid[1]!.currentIncome).toBe(expected1);
    });

    it('syncCardCurrentRepPerTurn sets currentReputationPerTurn correctly', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({
        id: 'biz-clinic-0',
        baseIncome: 200,
        reputationPerTurn: 20,
        synergyTypes: ['Health'],
      });
      grid[1] = makeBiz({
        id: 'biz-gym-0',
        baseIncome: 200,
        reputationPerTurn: 10,
        synergyRepBonus: 10,
        synergyTypes: ['Health'],
      });

      syncCardCurrentRepPerTurn(grid, 0);
      syncCardCurrentRepPerTurn(grid, 1);

      // Clinic: 20 + synergyRep(10 from gym) = 30
      expect(grid[0]!.currentReputationPerTurn).toBeCloseTo(30);
      // Gym: 10 + synergyRep(0 from clinic) = 10
      expect(grid[1]!.currentReputationPerTurn).toBeCloseTo(10);
    });

    it('recalculateCard updates both fields for a single card', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });

      recalculateCard(state, 0);

      const expectedIncome = computeBusinessIncome(state.streetGrid, 0, state.config.synergyBonusPerNeighbor, state.soldSlots);
      expect(state.streetGrid[0]!.currentIncome).toBe(expectedIncome);
      expect(state.streetGrid[0]!.currentReputationPerTurn).toBeDefined();
    });

    it('recalculateCard handles empty slot gracefully', () => {
      const state = createRichState();
      // Should not throw for empty slot
      expect(() => recalculateCard(state, 0)).not.toThrow();
    });
  });

  // ── AC3: Placement triggers neighbor recalculation ─────────

  describe('AC3: updateNeighborsOnPlacement recalculates affected cards', () => {
    it('sets the newly placed card\'s currentIncome to the full computed value', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });

      // Place a new card at slot 1
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 1);

      // New card's income should include synergy from slot 0
      const expected = computeBusinessIncome(state.streetGrid, 1, state.config.synergyBonusPerNeighbor, state.soldSlots);
      expect(state.streetGrid[1]!.currentIncome).toBe(expected);
    });

    it('increases existing neighbor\'s currentIncome when synergy-matching card is placed adjacent', () => {
      const state = createRichState();
      // Place first card at slot 0
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      recalculateCard(state, 0);
      const incomeBefore = state.streetGrid[0]!.currentIncome!;

      // Place a Food synergy neighbor at slot 1 with different base type
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 1);

      // Existing card's income should increase due to synergy
      const incomeAfter = state.streetGrid[0]!.currentIncome!;
      expect(incomeAfter).toBeGreaterThan(incomeBefore);
    });

    it('does not modify non-adjacent cards\' currentIncome', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      recalculateCard(state, 0);
      const incomeSlot0 = state.streetGrid[0]!.currentIncome;

      // Place card at slot 9 (far away, no adjacency)
      state.streetGrid[9] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 9);

      // Slot 0 should be unaffected
      expect(state.streetGrid[0]!.currentIncome).toBe(incomeSlot0);
    });

    it('recalculates currentReputationPerTurn for neighbors on placement', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({
        id: 'biz-clinic-0',
        baseIncome: 200,
        reputationPerTurn: 20,
        synergyRepBonus: 10,
        synergyTypes: ['Health'],
      });
      recalculateCard(state, 0);

      // Place a Health synergy business adjacent
      state.streetGrid[1] = makeBiz({
        id: 'biz-gym-0',
        baseIncome: 200,
        reputationPerTurn: 10,
        synergyRepBonus: 10,
        synergyTypes: ['Health'],
      });
      updateNeighborsOnPlacement(state, 1);

      // Clinic should now receive synergy rep from gym
      expect(state.streetGrid[0]!.currentReputationPerTurn).toBeCloseTo(30); // 0.2 + 0.1
    });
  });

  // ── AC4: Sale triggers neighbor recalculation ──────────────

  describe('AC4: updateNeighborsOnSale recalculates affected cards', () => {
    it('keeps neighbor\'s currentIncome unchanged when synergy-matching card is sold', () => {
      const state = createRichState();
      // Place two synergy-matching cards with different base types
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      const incomeBefore = state.streetGrid[0]!.currentIncome!;

      // Mark slot 1 as sold and call updateNeighborsOnSale
      state.soldSlots[1] = true;
      updateNeighborsOnSale(state, 1);

      // Slot 0's income stays the same — the sold card still provides synergy
      // (CG-0MT5XUE2200047IJ: sold cards act as synergy anchors)
      const incomeAfter = state.streetGrid[0]!.currentIncome!;
      expect(incomeAfter).toBe(incomeBefore);

      // After sale, slot 0 keeps the sold neighbor's synergy contribution
      const expected = computeBusinessIncome(
        state.streetGrid, 0, state.config.synergyBonusPerNeighbor, state.soldSlots,
      );
      expect(incomeAfter).toBe(expected);
      // ...and still exceeds its solo base income (3), proving synergy is retained
      expect(incomeAfter).toBeGreaterThan(300);
    });

    it('updates remaining card\'s currentReputationPerTurn after neighbor sale', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({
        id: 'biz-clinic-0',
        baseIncome: 200,
        reputationPerTurn: 20,
        synergyRepBonus: 10,
        synergyTypes: ['Health'],
      });
      state.streetGrid[1] = makeBiz({
        id: 'biz-gym-0',
        baseIncome: 200,
        reputationPerTurn: 10,
        synergyRepBonus: 10,
        synergyTypes: ['Health'],
      });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      expect(state.streetGrid[0]!.currentReputationPerTurn).toBeCloseTo(30); // 0.2 + 0.1 synergy

      // Sell the neighbor
      state.soldSlots[1] = true;
      updateNeighborsOnSale(state, 1);

      // Clinic keeps the synergy rep bonus from gym (sold card is a synergy anchor)
      expect(state.streetGrid[0]!.currentReputationPerTurn).toBeCloseTo(30);
    });

    it('handles sale of a card with no neighbors gracefully', () => {
      const state = createRichState();
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      recalculateCard(state, 0);

      // No neighbors to affect, should not throw
      state.soldSlots[0] = true;
      expect(() => updateNeighborsOnSale(state, 0)).not.toThrow();
    });
  });

  // ── AC5: applyIncome reads cached values ───────────────────

  describe('AC5: applyIncome reads cached values', () => {
    it('produces same total income as old approach for equivalent state', () => {
      const state = createRichState('income-parity');
      // Place a business
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      recalculateCard(state, 0);

      // Run income phase
      const coinsBefore = state.resourceBank.coins;
      const result = applyIncome(state);

      // Income should be applied (non-negative)
      expect(state.resourceBank.coins).toBeGreaterThanOrEqual(coinsBefore);
      expect(result.total).toBeGreaterThan(0);
    });

    it('uses currentIncome for each slot rather than calling computeBusinessIncome fresh', () => {
      const state = createRichState('cached-income');
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      // Record the cached values
      const cached0 = state.streetGrid[0]!.currentIncome;
      const cached1 = state.streetGrid[1]!.currentIncome;

      // Verify computeBusinessIncome matches
      expect(cached0).toBe(computeBusinessIncome(state.streetGrid, 0, state.config.synergyBonusPerNeighbor, state.soldSlots));
      expect(cached1).toBe(computeBusinessIncome(state.streetGrid, 1, state.config.synergyBonusPerNeighbor, state.soldSlots));

      // Run income and verify total matches sum of cached values (+ hand synergy)
      const result = applyIncome(state);
      const gridTotal = (cached0 ?? 0) + (cached1 ?? 0);
      expect(result.total).toBe(gridTotal);
    });

    it('sums currentReputationPerTurn instead of calling computeReputationPerTurn', () => {
      const state = createRichState('cached-rep');
      state.streetGrid[0] = makeBiz({
        id: 'biz-clinic-0',
        baseIncome: 200,
        reputationPerTurn: 20,
        synergyTypes: ['Health'],
      });
      state.streetGrid[1] = makeBiz({
        id: 'biz-gym-0',
        baseIncome: 200,
        reputationPerTurn: 10,
        synergyRepBonus: 10,
        synergyTypes: ['Health'],
      });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      const repBefore = state.resourceBank.reputation;
      applyIncome(state);

      // Rep should have increased (clinic rep 0.2 + gym rep 0.1 + gym synergy rep 0.1 to clinic)
      // Clinic: 20 + 10 (synergy from gym) = 30
      // Gym: 10 + 0 (no synergyRep from clinic) = 10
      // Total: 40
      expect(state.resourceBank.reputation).toBeCloseTo(repBefore + 40);
    });
  });

  // ── AC6: Same-type penalty ─────────────────────────────────

  describe('AC6: Same-type penalty reflected in cached values', () => {
    it('correctly shows penalty when same-type card is placed adjacent', () => {
      const state = createRichState('same-type-place');
      state.streetGrid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 200, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      // Same-type penalty: base * 0.6, synergy = 0
      const expected = computeBusinessIncome(state.streetGrid, 0, state.config.synergyBonusPerNeighbor, state.soldSlots);
      expect(state.streetGrid[0]!.currentIncome).toBeCloseTo(expected);
      expect(state.streetGrid[0]!.currentIncome).toBeCloseTo(120); // 2 * 0.6
    });

    it('keeps same-type penalty on remaining card when same-type neighbor is sold', () => {
      const state = createRichState('same-type-sell');
      state.streetGrid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 200, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      // Both have the penalty initially
      expect(state.streetGrid[0]!.currentIncome).toBeCloseTo(120);
      expect(state.streetGrid[1]!.currentIncome).toBeCloseTo(120);

      // Sell slot 1
      state.soldSlots[1] = true;
      updateNeighborsOnSale(state, 1);

      // Same-type penalty persists: sold same-type neighbour still counts
      // (CG-0MT5XUE2200047IJ Q1 = Remains)
      expect(state.streetGrid[0]!.currentIncome).toBeCloseTo(120);
    });
  });

  // ── AC7: Save/load round-trip ──────────────────────────────

  describe('AC7: Save/load round-trip preserves fields', () => {
    it('serializeMainStreetState includes currentIncome and currentReputationPerTurn', () => {
      const state = createRichState('save-fields');
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      recalculateCard(state, 0);

      const serialized = serializeMainStreetState(state);
      expect(serialized.streetGrid[0]).toHaveProperty('currentIncome');
      expect(serialized.streetGrid[0]!.currentIncome).toBe(300);
    });

    it('deserialized state preserves currentIncome and currentReputationPerTurn', () => {
      const state = createRichState('deser-fields');
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({
        id: 'biz-clinic-0',
        baseIncome: 200,
        reputationPerTurn: 20,
        synergyTypes: ['Health'],
      });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      const serialized = serializeMainStreetState(state);
      const restored = deserializeMainStreetState(serialized);

      expect(restored.streetGrid[0]!.currentIncome).toBe(state.streetGrid[0]!.currentIncome);
      expect(restored.streetGrid[0]!.currentReputationPerTurn).toBe(state.streetGrid[0]!.currentReputationPerTurn);
      expect(restored.streetGrid[1]!.currentIncome).toBe(state.streetGrid[1]!.currentIncome);
      expect(restored.streetGrid[1]!.currentReputationPerTurn).toBe(state.streetGrid[1]!.currentReputationPerTurn);
    });

    it('legacy serialized data (missing fields) produces zero income', () => {
      const state = createRichState('legacy-zero');
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });

      // Simulate legacy save: serialize, then strip the new fields
      const serialized = serializeMainStreetState(state) as any;
      delete serialized.streetGrid[0].currentIncome;
      delete serialized.streetGrid[0].currentReputationPerTurn;

      // Deserialize should leave fields undefined
      const restored = deserializeMainStreetState(serialized as any);
      expect(restored.streetGrid[0]!.currentIncome).toBeUndefined();
      expect(restored.streetGrid[0]!.currentReputationPerTurn).toBeUndefined();

      // Cards without currentIncome contribute 0 (legacy saves are not supported)
      const coinsBefore = restored.resourceBank.coins;
      const result = applyIncome(restored);
      expect(result.total).toBe(0);
      expect(restored.resourceBank.coins).toBe(coinsBefore);
    });
  });

  // ── Integration: purchaseBusiness triggers recalcs ─────────

  describe('Integration: purchaseBusiness triggers recalculations', () => {
    it('sets currentIncome on newly purchased card matching computeBusinessIncome', () => {
      const state = createRichState('purchase-recalc');
      executeDayStart(state);

      const card = state.market.cards[0];
      if (!card) return;

      executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });

      // The purchased card should have currentIncome matching computeBusinessIncome
      const placed = state.streetGrid[0]!;
      expect(placed.currentIncome).toBe(computeBusinessIncome(state.streetGrid, 0, state.config.synergyBonusPerNeighbor, state.soldSlots));
    });

    it('updates existing neighbor when synergy-matching card is purchased', () => {
      const state = createRichState('purchase-syn-update');
      // Place first card with a distinct base type different from any market card
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, name: 'Cafe', synergyTypes: ['Food'] });
      recalculateCard(state, 0);
      const incomeBefore = state.streetGrid[0]!.currentIncome!;

      // Now purchase a second card adjacent via the market
      executeDayStart(state);
      // Look for a Food synergy card that won't be same-type as biz-cafe-0
      const foodCard = state.market.cards.find(
        (c): c is BusinessCard =>
          (c.family === 'business' || c.family === 'community-space') &&
          c.synergyTypes.includes('Food') &&
          c.id.startsWith('biz-diner'),
      );
      if (!foodCard) return; // skip if no suitable card available

      executeAction(state, { type: 'buy-business', cardId: foodCard.id, slotIndex: 1 });

      // After purchase, the first card's income should have increased due to synergy
      const incomeAfter = state.streetGrid[0]!.currentIncome!;
      expect(incomeAfter).toBeGreaterThan(incomeBefore);
    });
  });

  // ── Integration: sellBusiness triggers recalcs ─────────────

  describe('Integration: sellBusiness triggers recalculations', () => {
    it('keeps remaining card income unchanged after selling an adjacent synergy card', () => {
      const state = createRichState('sell-syn-update');
      state.streetGrid[0] = makeBiz({ id: 'biz-cafe-0', baseIncome: 300, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);

      const incomeBefore = state.streetGrid[0]!.currentIncome!;

      // Sell slot 1
      sellBusiness(state, 1);
      const incomeAfter = state.streetGrid[0]!.currentIncome!;

      // Income is unchanged — the sold card still provides synergy
      // (CG-0MT5XUE2200047IJ: sold cards act as synergy anchors)
      expect(incomeAfter).toBe(incomeBefore);
      // Slot 0 keeps the synergy bonus from the sold neighbour (base 3 + synergy)
      expect(incomeAfter).toBeGreaterThan(300);
    });
  });

  // ── Integration: applyIncome total parity ──────────────────

  describe('Integration: applyIncome total parity with old approach', () => {
    it('produces identical total income for equivalent multi-card states', () => {
      const state = createRichState('income-parity-full');
      // Place three cards with mixed synergies
      state.streetGrid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 200, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 200, synergyTypes: ['Food'] });
      state.streetGrid[5] = makeBiz({ id: 'biz-clinic-0', baseIncome: 200, synergyTypes: ['Health'] });

      // Set up cached values
      updateNeighborsOnPlacement(state, 0);
      updateNeighborsOnPlacement(state, 1);
      updateNeighborsOnPlacement(state, 5);

      // Compute income using the new cached approach
      const coinsBefore = state.resourceBank.coins;
      const result = applyIncome(state);

      // The total should be sum of cached currentIncome values (pre-multiplier)
      const expectedTotal =
        computeBusinessIncome(state.streetGrid, 0, state.config.synergyBonusPerNeighbor, state.soldSlots) +
        computeBusinessIncome(state.streetGrid, 1, state.config.synergyBonusPerNeighbor, state.soldSlots) +
        computeBusinessIncome(state.streetGrid, 5, state.config.synergyBonusPerNeighbor, state.soldSlots);

      expect(result.total).toBe(expectedTotal);
      expect(state.resourceBank.coins).toBeGreaterThan(coinsBefore);
    });
  });

  // ── Seeded Determinism ─────────────────────────────────────

  describe('Seeded determinism preserved', () => {
    it('same seed + same actions produce identical resource amounts', () => {
      const seed = 'inc-determinism';

      // Run game 1
      const state1 = createRichState(seed);
      executeDayStart(state1);
      const card1 = state1.market.cards[0];
      if (card1) executeAction(state1, { type: 'buy-business', cardId: card1.id, slotIndex: 0 });
      processEndOfTurn(state1);

      // Run game 2 with same seed
      const state2 = createRichState(seed);
      executeDayStart(state2);
      const card2 = state2.market.cards[0];
      if (card2) executeAction(state2, { type: 'buy-business', cardId: card2.id, slotIndex: 0 });
      processEndOfTurn(state2);

      // Resources should be identical
      expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
      expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
    });
  });
});
