/**
 * Main Street: Adjacency & Income Tests
 *
 * Validates grid-based (2x5) Manhattan-distance adjacency.
 */
import { describe, it, expect } from 'vitest';

import {
  neighbors,
  computeSynergyBonus,
  computeBusinessIncome,
  computeIncome,
  applyIncome,
  recalculateCard,
} from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  GRID_SIZE,
  SYNERGY_BONUS_PER_NEIGHBOR,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';

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
    ...overrides,
  };
}

function emptyGrid(): (BusinessCard | null)[] {
  return new Array<BusinessCard | null>(GRID_SIZE).fill(null);
}

describe('MainStreetAdjacency (2x5 grid)', () => {
  describe('neighbors', () => {
    it('returns orthogonal neighbors for a corner (index 0)', () => {
      expect(neighbors(0, 1)).toEqual([1, 5]);
    });

    it('returns orthogonal neighbors for top-row edge (index 2)', () => {
      expect(neighbors(2, 1)).toEqual([1, 3, 7]);
    });

    it('returns orthogonal neighbors for bottom-row edge (index 7)', () => {
      expect(neighbors(7, 1)).toEqual([2, 6, 8]);
    });

    it('returns orthogonal neighbors for corner (index 9)', () => {
      expect(neighbors(9, 1)).toEqual([4, 8]);
    });

    it('returns Manhattan-radius neighbors for range 2', () => {
      expect(neighbors(0, 2)).toEqual([1, 2, 5, 6]);
    });

    it('returns all other slots for very large range', () => {
      const result = neighbors(4, 100);
      expect(result).toHaveLength(GRID_SIZE - 1);
      expect(result).not.toContain(4);
    });

    it('returns empty for range 0', () => {
      expect(neighbors(5, 0)).toEqual([]);
    });
  });

  describe('computeSynergyBonus', () => {
    it('returns 0 for an empty slot', () => {
      const grid = emptyGrid();
      expect(computeSynergyBonus(grid, 5)).toBe(0);
    });

    it('returns 0 with no matching neighbors', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ synergyTypes: ['Food'] });
      grid[1] = makeBiz({ synergyTypes: ['Culture'] });
      grid[5] = makeBiz({ synergyTypes: ['Service'] });
      expect(computeSynergyBonus(grid, 0)).toBe(0);
    });

    it('counts one matching neighbor at range 1', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'a', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'b', synergyTypes: ['Food'] });
      expect(computeSynergyBonus(grid, 0)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('counts multiple matching neighbors on orthogonal cells', () => {
      const grid = emptyGrid();
      grid[6] = makeBiz({ id: 'center', synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'left', synergyTypes: ['Food'] });
      grid[7] = makeBiz({ id: 'right', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'up', synergyTypes: ['Food'] });

      expect(computeSynergyBonus(grid, 6)).toBe(3 * SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('does not count diagonal-only matches', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'origin', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'diag', synergyTypes: ['Food'] }); // diagonal from index 0
      expect(computeSynergyBonus(grid, 0)).toBe(0);
    });

    it('respects extended range from upgrades', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'origin', synergyTypes: ['Food'], synergyRangeBonus: 1 }); // range=2
      grid[2] = makeBiz({ id: 'far', synergyTypes: ['Food'] }); // manhattan distance 2
      expect(computeSynergyBonus(grid, 0)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('keeps range asymmetry (upgraded card sees farther, basic card does not)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'upgraded', synergyTypes: ['Food'], synergyRangeBonus: 1 });
      grid[2] = makeBiz({ id: 'basic', synergyTypes: ['Food'] });

      expect(computeSynergyBonus(grid, 0)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
      expect(computeSynergyBonus(grid, 2)).toBe(0);
    });

    it('Pawn Shop does not contribute synergy to adjacent Commerce businesses', () => {
      const grid = emptyGrid();
      // Hardware Store (Commerce) adjacent to Pawn Shop (Commerce)
      grid[0] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', synergyTypes: ['Commerce'] });
      grid[1] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      // Hardware Store should NOT receive synergy from Pawn Shop
      expect(computeSynergyBonus(grid, 0)).toBe(0);
    });

    it('Pawn Shop does not receive synergy from adjacent Commerce businesses', () => {
      const grid = emptyGrid();
      // Pawn Shop next to Hardware Store
      grid[0] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      grid[1] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', synergyTypes: ['Commerce'] });
      // Pawn Shop should NOT receive synergy from Hardware Store
      expect(computeSynergyBonus(grid, 0)).toBe(0);
    });

    it('multiple Pawn Shops do not contribute synergy to each other', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      grid[1] = makeBiz({ id: 'biz-pawnshop-1', name: 'Pawn Shop', synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      // Neither Pawn Shop contributes synergy to the other
      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 1)).toBe(0);
    });

    it('Pawn Shop with upgraded Vintage Shop status still does not contribute or receive synergy', () => {
      const grid = emptyGrid();
      // Pawn Shop with upgrade applied (level=1, incomeBonus=1)
      grid[0] = makeBiz({
        id: 'biz-pawnshop-0',
        name: 'Pawn Shop',
        synergyTypes: ['Commerce'],
        synergyCoinBonus: 0,
        level: 1,
        incomeBonus: 1,
        appliedUpgrades: ['upg-vintage-shop-0'],
      });
      grid[1] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', synergyTypes: ['Commerce'] });
      // Hardware Store should NOT receive synergy from upgraded Pawn Shop
      expect(computeSynergyBonus(grid, 1)).toBe(0);
      // Upgraded Pawn Shop also does NOT receive synergy from Hardware Store
      expect(computeSynergyBonus(grid, 0)).toBe(0);
    });
  });

  describe('computeBusinessIncome', () => {
    it('returns 0 for empty slot', () => {
      const grid = emptyGrid();
      expect(computeBusinessIncome(grid, 3)).toBe(0);
    });

    it('adds base + upgrade income bonus + synergy bonus', () => {
      const grid = emptyGrid();
      grid[1] = makeBiz({ id: 'target', baseIncome: 2, incomeBonus: 1, synergyTypes: ['Food'] });
      grid[0] = makeBiz({ id: 'n1', baseIncome: 1, synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'n2', baseIncome: 1, synergyTypes: ['Food'] });
      // base 3 + two matching neighbors
      expect(computeBusinessIncome(grid, 1)).toBe(5);
    });

    it('Pawn Shop generates only base income with no synergy', () => {
      const grid = emptyGrid();
      // Pawn Shop with Commerce neighbors — should only get base income
      grid[0] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', baseIncome: 1, synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      grid[1] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', baseIncome: 1, synergyTypes: ['Commerce'] });
      expect(computeBusinessIncome(grid, 0)).toBe(1); // base only, no synergy
    });
  });

  describe('computeIncome', () => {
    it('returns zero total on empty grid', () => {
      const result = computeIncome(emptyGrid());
      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it('returns per-slot breakdown and aggregate total', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'a', name: 'A', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'b', name: 'B', baseIncome: 3, synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'c', name: 'C', baseIncome: 1, synergyTypes: ['Culture'] });

      const result = computeIncome(grid);

      // slot 0: base 2 + synergy with slot 1 = 3
      // slot 1: base 3 + synergy with slot 0 = 4
      // slot 5: base 1 + no matching neighbors = 1
      expect(result.total).toBe(8);
      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown.find((b) => b.slotIndex === 0)?.businessName).toBe('A');
    });

    it('Pawn Shop shows 0 synergy bonus in income breakdown', () => {
      const grid = emptyGrid();
      // Pawn Shop adjacent to two Commerce businesses
      grid[5] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', baseIncome: 1, synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      grid[4] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', baseIncome: 1, synergyTypes: ['Commerce'] });
      grid[6] = makeBiz({ id: 'biz-boutique-0', name: 'Boutique', baseIncome: 1, synergyTypes: ['Commerce'] });

      const result = computeIncome(grid);
      const pawnEntry = result.breakdown.find((b) => b.slotIndex === 5);
      expect(pawnEntry).toBeDefined();
      expect(pawnEntry!.businessName).toBe('Pawn Shop');
      expect(pawnEntry!.synergyBonus).toBe(0);
      expect(pawnEntry!.total).toBe(1); // base income only
    });
  });

  describe('applyIncome', () => {
    it('applies computed income (with reputation multiplier) to coins', () => {
      const state = setupMainStreetGame({ seed: 'income-grid-test' });
      state.streetGrid[0] = makeBiz({ id: 'a', baseIncome: 3, synergyTypes: ['Food'] });
      state.streetGrid[1] = makeBiz({ id: 'b', baseIncome: 2, synergyTypes: ['Food'] });
      recalculateCard(state, 0);
      recalculateCard(state, 1);

      const coinsBefore = state.resourceBank.coins;
      const result = applyIncome(state);

      expect(result.total).toBe(7); // 4 + 3 pre-multiplier
      // CG-0MRER3RE300418SG: Math.floor removed; fractional values preserved.
      // 7 * 1.15 = 8.05 (was floor(8.05)=8 before fix)
      expect(state.resourceBank.coins).toBeCloseTo(coinsBefore + 8.05);
    });
  });
});
