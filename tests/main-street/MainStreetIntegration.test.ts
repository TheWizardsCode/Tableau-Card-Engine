/**
 * Main Street: Multi-Use Card Economy Integration Tests
 *
 * Validates all five subsystems work together in a full game loop:
 * hand management, synergy bonuses, card placement/sell, market cycling,
 * and staff cards.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
  type MainStreetSerializedState,
} from '../../example-games/main-street/MainStreetState';
import {
  type BusinessCard,
  MARKET_TOTAL_SLOTS,
} from '../../example-games/main-street/MainStreetCards';
import {
  applyIncome,
  recalculateCard,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  executeDayStart,
  processEndOfTurn,
  applyStaffOngoingCosts,
  layoffStaffCard,
} from '../../example-games/main-street/MainStreetEngine';
import {
  purchaseBusiness,
  moveToHand,
  purchaseStaffCard,
} from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'integration-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
  };
}

function setUpTableauAndHand(
  state: MainStreetState,
): void {
  // Place a Food business on the tableau
  state.streetGrid[0] = makeBiz({ id: 'biz-bakery', name: 'Bakery', baseIncome: 3, synergyTypes: ['Food'] });
  state.streetGrid[1] = makeBiz({ id: 'biz-cafe', name: 'Cafe', baseIncome: 0, synergyTypes: ['Food', 'Culture'] });

  // Add a Food hand card for synergy
  state.hand.push(makeBiz({ id: 'hand-food', name: 'Hand Food', baseIncome: 3, synergyTypes: ['Food'] }));
}

// ── Tests ───────────────────────────────────────────────────

describe('Multi-Use Card Economy Integration', () => {
  // ── Full Game Loop ────────────────────────────────────────

  describe('Full game loop with hand management', () => {
    it('should complete a full turn with purchase-to-hand and income', () => {
      const state = createTestState();
      executeDayStart(state);

      // Buy a card to hand
      const card = state.market.cards.find(c => c.cost <= state.resourceBank.coins);
      if (!card) return;

      moveToHand(state, card.id);
      expect(state.hand.length).toBe(1);
      expect(state.market.cards.length).toBe(MARKET_TOTAL_SLOTS - 1);

      // End turn - should process income, cycling, etc.
      const result = processEndOfTurn(state);
      expect(result).toBeDefined();
      expect(['playing', 'win', 'loss']).toContain(result.gameResult);
    });

    it('should accumulate synergy bonuses over multiple turns with hand cards', () => {
      const state = createTestState();
      setUpTableauAndHand(state);

      // Apply income with hand synergy
      const result = applyIncome(state);
      expect(result.total).toBeGreaterThan(0);

      // Hand synergy should be reported
      expect(result.handSynergyTotal).toBeGreaterThanOrEqual(0);
    });

    it('should include diagonal-only synergy in income (8-way adjacency)', () => {
      const state = createTestState();
      // Two Food businesses placed diagonally (slots 0 and 6).
      state.streetGrid[0] = makeBiz({ id: 'biz-bakery-0', name: 'Bakery', baseIncome: 2, synergyTypes: ['Food'], synergyCoinBonus: 0.5 });
      state.streetGrid[6] = makeBiz({ id: 'biz-diner-0', name: 'Diner', baseIncome: 2, synergyTypes: ['Food'], synergyCoinBonus: 0.5 });
      recalculateCard(state, 0);
      recalculateCard(state, 6);

      const result = applyIncome(state);

      // Each gains 50% of base income as synergy from the diagonal partner,
      // scaled by the Medium multiplier (0.35 after CG-0MSP26Q5N002EH8P):
      // 2 + (2*0.5*0.35) = 2.35 each → 4.7 total.
      expect(result.total).toBeCloseTo(4.7, 5);
    });

    it('should complete multiple turns with mixed tableau and hand purchases', () => {
      const state = createTestState();
      // Coin cushion so buying the first affordable card never bankrupts the
      // player mid-test (the expanded pool shifted which card that is).
      state.resourceBank.coins = 50;

      for (let turn = 0; turn < 3 && state.gameResult === 'playing'; turn++) {
        executeDayStart(state);

        // Buy to hand if possible
        const card = state.market.cards.find(c => c.cost <= state.resourceBank.coins);
        if (card && state.hand.length < state.maxHandSize) {
          moveToHand(state, card.id);
        } else if (card) {
          // Buy to tableau if hand is full
          const slot = state.streetGrid.findIndex(s => s === null);
          if (slot >= 0) {
            purchaseBusiness(state, card.id, slot);
          }
        }

        processEndOfTurn(state);
      }

      // Game should still be valid after 3 turns
      expect(['playing', 'win', 'loss']).toContain(state.gameResult);
      expect(state.turn).toBeGreaterThanOrEqual(3);
    });
  });

  // ── IncomePhase with Synergy + Staff Costs ────────────────

  describe('IncomePhase net income (base + synergy - staff costs)', () => {
    it('should calculate net income correctly with synergy and staff costs', () => {
      const state = createTestState();
      setUpTableauAndHand(state);

      // Hire a staff card (staff are in the market row or deck, CG-0MT3KZNQB0053K55)
      const staffInMarket = state.market.cards.find(c => c.family === 'staff');
      const staffInDeck = state.decks.staff.find(c => c.family === 'staff');
      const staffCard = staffInMarket ?? staffInDeck ?? null;
      if (staffCard) {
        state.resourceBank.coins = staffCard.cost + 10;

        purchaseStaffCard(state, staffCard.id);
        expect(state.staffCards.length).toBe(1);
      }

      // Apply income (includes hand synergy)
      const incomeResult = applyIncome(state);

      // Record coins after income
      const coinsAfterIncome = state.resourceBank.coins;

      // Apply staff costs
      applyStaffOngoingCosts(state);

      // After staff costs, coins should be <= after-income amount
      expect(state.resourceBank.coins).toBeLessThanOrEqual(coinsAfterIncome);

      // Hand synergy should be present
      if (state.hand.length > 0) {
        expect(incomeResult.handSynergyTotal).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle staff costs with insufficient coins gracefully', () => {
      const state = createTestState();
      setUpTableauAndHand(state);

      // Set very low coins
      state.resourceBank.coins = 1;

      // Add a staff card with ongoing cost
      state.staffCards.push({
        family: 'staff',
        id: 'staff-tester',
        name: 'Tester',
        cost: 3,
        ongoingCost: 5,
        handSlotsAdded: 1,
        description: 'Test staff',
      });

      // Apply costs - should not crash
      expect(() => applyStaffOngoingCosts(state)).not.toThrow();
    });
  });

  // ── Market Cycling ─────────────────────────────────────────

  describe('Market cycling over multiple turns', () => {
    it('should cycle market cards over 3+ turns', () => {
      const state = createTestState();

      for (let turn = 0; turn < 3 && state.gameResult === 'playing'; turn++) {
        executeDayStart(state);

        // Buy a card to stimulate cycling
        const card = state.market.cards.find(c => c.cost <= state.resourceBank.coins);
        if (card && state.hand.length < state.maxHandSize) {
          moveToHand(state, card.id);
        } else if (card) {
          const slot = state.streetGrid.findIndex(s => s === null);
          if (slot >= 0) {
            purchaseBusiness(state, card.id, slot);
          }
        }

        processEndOfTurn(state);
      }

      // Market should be refilled each turn
      expect(state.market.cards.length).toBeGreaterThan(0);
      expect(state.gameResult).toBeDefined();
    });
  });

  // ── Staff Card Lifecycle ──────────────────────────────────

  describe('Staff card lifecycle', () => {
    it('should purchase staff, apply ongoing cost, and lay off', () => {
      const state = createTestState();
      executeDayStart(state);

      // Purchase a staff card (staff are in the market row or deck, CG-0MT3KZNQB0053K55)
      const staffInMarket2 = state.market.cards.find(c => c.family === 'staff');
      const staffInDeck2 = state.decks.staff.find(c => c.family === 'staff');
      const staffCard2 = staffInMarket2 ?? staffInDeck2;
      if (!staffCard2) return;

      const staffCard = staffCard2;
      state.resourceBank.coins = staffCard.cost + 20;
      const maxBefore = state.maxHandSize;

      purchaseStaffCard(state, staffCard.id);
      expect(state.staffCards.length).toBe(1);
      expect(state.maxHandSize).toBe(maxBefore + staffCard.handSlotsAdded);

      // Apply ongoing cost
      applyStaffOngoingCosts(state);

      // Add some hand cards for layoff test
      for (let i = 0; i < 3; i++) {
        state.hand.push(makeBiz({ id: `hand-${i}`, baseIncome: 1, synergyTypes: ['Food'] }));
      }

      // Lay off the staff card
      const staffToLayoff = state.staffCards[0];
      const maxBeforeLayoff = state.maxHandSize;
      const handBeforeLayoff = state.hand.length;

      layoffStaffCard(state, staffToLayoff.id);
      expect(state.staffCards.length).toBe(0);
      expect(state.maxHandSize).toBe(maxBeforeLayoff - staffToLayoff.handSlotsAdded);
      expect(state.hand.length).toBe(Math.max(0, handBeforeLayoff - staffToLayoff.handSlotsAdded));
    });

    it('should handle layoff with fewer hand cards than slots to remove', () => {
      const state = createTestState();
      executeDayStart(state);

      // Add staff with empty hand
      state.staffCards.push({
        family: 'staff',
        id: 'staff-test',
        name: 'Test Staff',
        cost: 5,
        ongoingCost: 2,
        handSlotsAdded: 3,
        description: 'Test staff',
      });
      state.maxHandSize = 5;

      // Hand is empty
      expect(state.hand.length).toBe(0);

      // Layoff should remove no cards (hand is empty) and not crash
      expect(() => layoffStaffCard(state, 'staff-test')).not.toThrow();
      expect(state.staffCards.length).toBe(0);
    });
  });

  // ── Save/Load Migration ───────────────────────────────────

  describe('Save/load migration with all fields', () => {
    it('should round-trip full multi-use economy state', () => {
      const state = createTestState();
      executeDayStart(state);

      // Set up hand, staff, discard
      state.hand.push(makeBiz({ id: 'hand-test', baseIncome: 1, synergyTypes: ['Food'] }));
      state.staffCards.push({
        family: 'staff',
        id: 'staff-test',
        name: 'Test Staff',
        cost: 5,
        ongoingCost: 2,
        handSlotsAdded: 2,
        description: 'Test staff',
      });
      state.discardPile.push(makeBiz({ id: 'discard-test', baseIncome: 1, synergyTypes: ['Food'] }));

      const serialized = serializeMainStreetState(state);
      const restored = deserializeMainStreetState(serialized);

      expect(restored.hand).toHaveLength(1);
      expect(restored.hand[0].id).toBe('hand-test');
      expect(restored.staffCards).toHaveLength(1);
      expect(restored.staffCards[0].id).toBe('staff-test');
      expect(restored.discardPile).toHaveLength(1);
      expect(restored.maxHandSize).toBe(state.maxHandSize);
    });

    it('should handle old-format saves (missing all multi-use fields)', () => {
      const state = createTestState();
      const serialized = serializeMainStreetState(state) as any;

      // Remove all multi-use fields
      delete serialized.hand;
      delete serialized.maxHandSize;
      delete serialized.discardPile;
      delete serialized.staffCards;
      // staffCardMarket removed by CG-0MT3KZNQB0053K55 — staff live in decks.staff

      // Should not throw
      const restored = deserializeMainStreetState(serialized as MainStreetSerializedState);

      // Should have defaults
      expect(restored.hand).toEqual([]);
      expect(restored.maxHandSize).toBe(3);
      expect(restored.discardPile).toEqual([]);
      expect(restored.staffCards).toEqual([]);
      // decks.staff is a required field in the new model (CG-0MT3KZNQB0053K55)
      expect(restored.decks.staff).toEqual(state.decks.staff);
    });

    it('should preserve deterministic RNG after migration round-trip', () => {
      const state = createTestState();
      const serialized = serializeMainStreetState(state);
      const restored = deserializeMainStreetState(serialized);

      // Same seed, same RNG state
      expect(restored.seed).toBe(state.seed);
      expect(restored.rngCalls).toBe(state.rngCalls);

      const v1 = state.rng();
      const v2 = restored.rng();
      expect(v1).toBe(v2);
    });
  });

  // ── Full Multi-System Game ────────────────────────────────

  describe('Full multi-system game (hand + synergy + cycling + staff)', () => {
    it('should handle combined gameplay without errors', () => {
      const state = createTestState();

      // Turn 1: hand purchase
      executeDayStart(state);
      const card1 = state.market.cards.find(c => c.cost <= state.resourceBank.coins);
      if (card1 && state.hand.length < state.maxHandSize) {
        moveToHand(state, card1.id);
      }
      processEndOfTurn(state);

      // Turn 2: tableau purchase
      if (state.gameResult === 'playing') {
        executeDayStart(state);
        const card2 = state.market.cards.find(c => c.cost <= state.resourceBank.coins);
        if (card2) {
          const slot = state.streetGrid.findIndex(s => s === null);
          if (slot >= 0) {
            purchaseBusiness(state, card2.id, slot);
          }
        }
        processEndOfTurn(state);
      }

      // Turn 3: staff purchase
      if (state.gameResult === 'playing') {
        executeDayStart(state);
        // Staff cards are in the market row or deck (CG-0MT3KZNQB0053K55)
        const staffInMarket3 = state.market.cards.find(c => c.family === 'staff');
        const staffInDeck3 = state.decks.staff.find(c => c.family === 'staff');
        const staffCard3 = staffInMarket3 ?? staffInDeck3;
        if (staffCard3) {
          const staffCard = staffCard3;
          if (state.resourceBank.coins >= staffCard.cost) {
            purchaseStaffCard(state, staffCard.id);
          }
        }
        processEndOfTurn(state);
      }

      // Game should be in valid state after 3 turns
      expect(state.gameResult).toBeDefined();
      expect(state.market.cards.length).toBeGreaterThan(0);
    });
  });
});
