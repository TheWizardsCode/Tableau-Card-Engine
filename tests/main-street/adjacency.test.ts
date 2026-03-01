/**
 * Main Street: Adjacency & Income Tests
 *
 * Tests for neighbors(), computeSynergyBonus(), computeBusinessIncome(),
 * computeIncome(), and applyIncome(). Covers edge cases for grid boundaries,
 * extended range from upgrades, and various synergy configurations.
 */
import { describe, it, expect } from 'vitest';

import {
  neighbors,
  computeSynergyBonus,
  computeBusinessIncome,
  computeIncome,
  applyIncome,
} from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  GRID_SIZE,
  SYNERGY_BONUS_PER_NEIGHBOR,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Creates a minimal business card for testing. */
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
  };
}

/** Creates an empty grid. */
function emptyGrid(): (BusinessCard | null)[] {
  return new Array<BusinessCard | null>(GRID_SIZE).fill(null);
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAdjacency', () => {
  // ── neighbors() ────────────────────────────────────────────

  describe('neighbors', () => {
    it('should return both neighbors for a middle slot (range 1)', () => {
      const n = neighbors(5, 1);
      expect(n).toEqual([4, 6]);
    });

    it('should return only the right neighbor for slot 0', () => {
      const n = neighbors(0, 1);
      expect(n).toEqual([1]);
    });

    it('should return only the left neighbor for the last slot', () => {
      const n = neighbors(GRID_SIZE - 1, 1);
      expect(n).toEqual([GRID_SIZE - 2]);
    });

    it('should return extended neighbors for range 2', () => {
      const n = neighbors(5, 2);
      expect(n).toEqual([3, 4, 6, 7]);
    });

    it('should clamp to grid boundaries for range 2 at slot 0', () => {
      const n = neighbors(0, 2);
      expect(n).toEqual([1, 2]);
    });

    it('should clamp to grid boundaries for range 2 at last slot', () => {
      const n = neighbors(GRID_SIZE - 1, 2);
      expect(n).toEqual([GRID_SIZE - 3, GRID_SIZE - 2]);
    });

    it('should return all other slots for very large range', () => {
      const n = neighbors(5, 100);
      expect(n).toHaveLength(GRID_SIZE - 1); // all except self
      expect(n).not.toContain(5);
    });

    it('should return empty array for range 0', () => {
      const n = neighbors(5, 0);
      expect(n).toEqual([]);
    });

    it('should default to range 1', () => {
      const n = neighbors(5);
      expect(n).toEqual([4, 6]);
    });
  });

  // ── computeSynergyBonus() ──────────────────────────────────

  describe('computeSynergyBonus', () => {
    it('should return 0 for an empty slot', () => {
      const grid = emptyGrid();
      expect(computeSynergyBonus(grid, 5)).toBe(0);
    });

    it('should return 0 for a business with no neighbors', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ synergyTypes: ['Food'] });
      expect(computeSynergyBonus(grid, 5)).toBe(0);
    });

    it('should return 0 when neighbor has different synergy type', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ id: 'food-biz', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'culture-biz', synergyTypes: ['Culture'] });
      expect(computeSynergyBonus(grid, 5)).toBe(0);
    });

    it('should return SYNERGY_BONUS_PER_NEIGHBOR for one matching neighbor', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ id: 'food-1', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'food-2', synergyTypes: ['Food'] });
      expect(computeSynergyBonus(grid, 5)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('should return bonus for two matching neighbors', () => {
      const grid = emptyGrid();
      grid[4] = makeBiz({ id: 'food-1', synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'food-2', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'food-3', synergyTypes: ['Food'] });
      expect(computeSynergyBonus(grid, 5)).toBe(2 * SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('should consider extended range from upgrades', () => {
      const grid = emptyGrid();
      grid[3] = makeBiz({ id: 'food-far', synergyTypes: ['Food'] });
      // Business at 5 with synergyRangeBonus = 1 (range becomes 2)
      grid[5] = makeBiz({ id: 'food-upgraded', synergyTypes: ['Food'], synergyRangeBonus: 1 });
      // food-far at index 3 is 2 slots away, within range 2
      expect(computeSynergyBonus(grid, 5)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('should not consider out-of-range businesses', () => {
      const grid = emptyGrid();
      grid[2] = makeBiz({ id: 'food-far', synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'food-center', synergyTypes: ['Food'] });
      // food-far at index 2 is 3 slots away, default range is 1
      expect(computeSynergyBonus(grid, 5)).toBe(0);
    });

    it('should handle edge slot (slot 0) with one matching neighbor', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'food-edge', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'food-next', synergyTypes: ['Food'] });
      expect(computeSynergyBonus(grid, 0)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('should handle last slot with one matching neighbor', () => {
      const grid = emptyGrid();
      grid[GRID_SIZE - 1] = makeBiz({ id: 'food-last', synergyTypes: ['Food'] });
      grid[GRID_SIZE - 2] = makeBiz({ id: 'food-prev', synergyTypes: ['Food'] });
      expect(computeSynergyBonus(grid, GRID_SIZE - 1)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('should count only once even if neighbor shares multiple synergy types', () => {
      const grid = emptyGrid();
      // Both businesses share Food — should still only count +1 per neighbor
      grid[5] = makeBiz({ id: 'multi-1', synergyTypes: ['Food', 'Culture'] });
      grid[6] = makeBiz({ id: 'multi-2', synergyTypes: ['Food', 'Culture'] });
      expect(computeSynergyBonus(grid, 5)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });
  });

  // ── computeBusinessIncome() ────────────────────────────────

  describe('computeBusinessIncome', () => {
    it('should return 0 for an empty slot', () => {
      const grid = emptyGrid();
      expect(computeBusinessIncome(grid, 5)).toBe(0);
    });

    it('should return baseIncome for isolated business', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ baseIncome: 3 });
      expect(computeBusinessIncome(grid, 5)).toBe(3);
    });

    it('should include incomeBonus from upgrades', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ baseIncome: 2, incomeBonus: 1 });
      expect(computeBusinessIncome(grid, 5)).toBe(3);
    });

    it('should include synergy bonus', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ id: 'food-1', baseIncome: 2, synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'food-2', baseIncome: 1, synergyTypes: ['Food'] });
      // base 2 + synergy 1 = 3
      expect(computeBusinessIncome(grid, 5)).toBe(3);
    });

    it('should stack incomeBonus and synergy bonus', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({ id: 'food-1', baseIncome: 2, incomeBonus: 1, synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'food-2', baseIncome: 1, synergyTypes: ['Food'] });
      // (base 2 + bonus 1) + synergy 1 = 4
      expect(computeBusinessIncome(grid, 5)).toBe(4);
    });
  });

  // ── computeIncome() ───────────────────────────────────────

  describe('computeIncome', () => {
    it('should return 0 total for empty grid', () => {
      const grid = emptyGrid();
      const result = computeIncome(grid);
      expect(result.total).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });

    it('should compute total across all businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-1', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-2', baseIncome: 3, synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'biz-3', baseIncome: 1, synergyTypes: ['Culture'] });

      const result = computeIncome(grid);

      // biz-1: base 2 + synergy 1 (from biz-2) = 3
      // biz-2: base 3 + synergy 1 (from biz-1) = 4
      // biz-3: base 1 + synergy 0 = 1
      expect(result.total).toBe(8);
      expect(result.breakdown).toHaveLength(3);
    });

    it('should provide accurate per-slot breakdown', () => {
      const grid = emptyGrid();
      grid[3] = makeBiz({ id: 'food-1', baseIncome: 2, synergyTypes: ['Food'] });
      grid[4] = makeBiz({ id: 'food-2', baseIncome: 3, synergyTypes: ['Food'] });

      const result = computeIncome(grid);

      const slot3 = result.breakdown.find(b => b.slotIndex === 3)!;
      expect(slot3.baseIncome).toBe(2);
      expect(slot3.synergyBonus).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
      expect(slot3.total).toBe(3);

      const slot4 = result.breakdown.find(b => b.slotIndex === 4)!;
      expect(slot4.baseIncome).toBe(3);
      expect(slot4.synergyBonus).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
      expect(slot4.total).toBe(4);
    });

    it('should include business name in breakdown', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-1', name: 'Bakery', baseIncome: 2 });

      const result = computeIncome(grid);
      expect(result.breakdown[0].businessName).toBe('Bakery');
    });
  });

  // ── applyIncome() ─────────────────────────────────────────

  describe('applyIncome', () => {
    it('should add computed income to player coins', () => {
      const state = setupMainStreetGame({ seed: 'income-test' });
      state.streetGrid[0] = makeBiz({ id: 'food-1', baseIncome: 3, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'food-2', baseIncome: 2, synergyTypes: ['Food'] });

      const coinsBefore = state.resourceBank.coins;
      const result = applyIncome(state);

      // food-1: 3 + 1 synergy = 4
      // food-2: 2 + 1 synergy = 3
      expect(result.total).toBe(7);
      expect(state.resourceBank.coins).toBe(coinsBefore + 7);
    });

    it('should not change coins for empty grid', () => {
      const state = setupMainStreetGame({ seed: 'empty-income' });
      const coinsBefore = state.resourceBank.coins;
      const result = applyIncome(state);

      expect(result.total).toBe(0);
      expect(state.resourceBank.coins).toBe(coinsBefore);
    });

    it('should return the income breakdown', () => {
      const state = setupMainStreetGame({ seed: 'breakdown-test' });
      state.streetGrid[5] = makeBiz({ id: 'solo', baseIncome: 4 });

      const result = applyIncome(state);

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].slotIndex).toBe(5);
      expect(result.breakdown[0].total).toBe(4);
    });
  });

  // ── Extended Range (Upgrades) ─────────────────────────────

  describe('extended synergy range', () => {
    it('should reach businesses 2 slots away with synergyRangeBonus = 1', () => {
      const grid = emptyGrid();
      // Upgraded business at slot 5 can reach 2 slots away
      grid[5] = makeBiz({
        id: 'upgraded',
        baseIncome: 2,
        synergyTypes: ['Food'],
        synergyRangeBonus: 1,
      });
      grid[3] = makeBiz({ id: 'far-food', baseIncome: 1, synergyTypes: ['Food'] });

      const income = computeBusinessIncome(grid, 5);
      // base 2 + synergy 1 (from far-food at distance 2, within range 2)
      expect(income).toBe(3);
    });

    it('should reach businesses 3 slots away with synergyRangeBonus = 2', () => {
      const grid = emptyGrid();
      grid[5] = makeBiz({
        id: 'super-upgraded',
        baseIncome: 2,
        synergyTypes: ['Commerce'],
        synergyRangeBonus: 2,
      });
      grid[2] = makeBiz({ id: 'far-commerce', baseIncome: 1, synergyTypes: ['Commerce'] });

      const income = computeBusinessIncome(grid, 5);
      expect(income).toBe(3);
    });

    it('should not affect the neighbor business range (only the upgraded one)', () => {
      const grid = emptyGrid();
      // Upgraded at 5 can see 2 slots away
      grid[5] = makeBiz({
        id: 'upgraded',
        baseIncome: 2,
        synergyTypes: ['Food'],
        synergyRangeBonus: 1,
      });
      // Non-upgraded at 3 can only see 1 slot away (default)
      grid[3] = makeBiz({ id: 'basic', baseIncome: 1, synergyTypes: ['Food'] });

      // upgraded at 5 sees basic at 3 (distance 2, range 2) -> +1 synergy
      expect(computeSynergyBonus(grid, 5)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
      // basic at 3 does NOT see upgraded at 5 (distance 2, range 1) -> 0 synergy
      expect(computeSynergyBonus(grid, 3)).toBe(0);
    });
  });
});
