/**
 * Main Street: Adjacency & Income Tests
 *
 * Validates grid-based (2x5) 8-way (Chebyshev) adjacency: diagonally
 * adjacent slots count at every range (max(|dx|,|dy|) <= range).
 *
 * CG-0MSP1HCAS00785MP: the adjacency metric was changed from Manhattan
 * (orthogonal-only at range 1) to Chebyshev (8-way at every range). These
 * tests define the 8-way contract consumed by F3's neighbors() change.
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

describe('MainStreetAdjacency (2x5 grid, percentage-based synergy)', () => {
  describe('neighbors (8-way / Chebyshev)', () => {
    it('returns 8-way neighbors for a corner (index 0)', () => {
      expect(neighbors(0, 1)).toEqual([1, 5, 6]);
    });

    it('returns 8-way neighbors for top-row interior (index 2)', () => {
      expect(neighbors(2, 1)).toEqual([1, 3, 6, 7, 8]);
    });

    it('returns 8-way neighbors for bottom-row interior (index 7)', () => {
      expect(neighbors(7, 1)).toEqual([1, 2, 3, 6, 8]);
    });

    it('returns 8-way neighbors for corner (index 9)', () => {
      expect(neighbors(9, 1)).toEqual([3, 4, 8]);
    });

    it('returns Chebyshev-square neighbors for range 2 (corner, in-grid square)', () => {
      // Slot 0 is a corner: the Chebyshev square of radius 2, clipped to the
      // 2x5 grid, spans columns 0-2 x rows 0-1 (CG-0MSP1HCAS00785MP AC3).
      expect(neighbors(0, 2)).toEqual([1, 2, 5, 6, 7]);
    });

    it('range 2 from a middle-column slot covers the whole grid', () => {
      // Slot 2 (top-row middle): the 5x5 Chebyshev square covers the entire
      // 2x5 grid, so every other slot is a neighbor.
      expect(neighbors(2, 2)).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('range 2 uses a square (Chebyshev), not a Manhattan diamond', () => {
      // Bottom-row edge slot 7: Manhattan radius 2 gives [1, 2, 3, 5, 6, 8, 9];
      // Chebyshev additionally includes the row-0 corners 0 and 4 (max|dx|<=2
      // with dy=1). This is the square vs diamond distinction.
      expect(neighbors(7, 2)).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9]);
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

    it('counts multiple matching neighbors', () => {
      const grid = emptyGrid();
      grid[6] = makeBiz({ id: 'center', synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'left', synergyTypes: ['Food'] });
      grid[7] = makeBiz({ id: 'right', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'up', synergyTypes: ['Food'] });

      expect(computeSynergyBonus(grid, 6)).toBe(3 * SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('counts diagonal-only matches (8-way adjacency)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'origin', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'diag', synergyTypes: ['Food'] }); // diagonal from index 0
      // Each gains its 50% synergy bonus from the diagonal partner.
      expect(computeSynergyBonus(grid, 0)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
      expect(computeSynergyBonus(grid, 6)).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('respects extended range from upgrades', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'origin', synergyTypes: ['Food'], synergyRangeBonus: 1 }); // range=2
      grid[2] = makeBiz({ id: 'far', synergyTypes: ['Food'] }); // Chebyshev distance 2 (same row)
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

    it('adds base + upgrade income bonus + percentage synergy bonus', () => {
      const grid = emptyGrid();
      grid[1] = makeBiz({ id: 'target', baseIncome: 2, incomeBonus: 1, synergyTypes: ['Food'] });
      grid[0] = makeBiz({ id: 'n1', baseIncome: 1, synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'n2', baseIncome: 1, synergyTypes: ['Food'] });
      // base=3, rate=0.5, N=2, synergy=3*0.5*2=3, total=3+3=6
      expect(computeBusinessIncome(grid, 1)).toBe(6);
    });

    it('Pawn Shop generates only base income with no synergy', () => {
      const grid = emptyGrid();
      // Pawn Shop with Commerce neighbors — should only get base income
      grid[0] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', baseIncome: 1, synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      grid[1] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', baseIncome: 1, synergyTypes: ['Commerce'] });
      expect(computeBusinessIncome(grid, 0)).toBe(1); // base only, no synergy
    });

    it('triggers the same-type 60% penalty via diagonal-only adjacency', () => {
      const grid = emptyGrid();
      // Two same-type businesses placed diagonally (slots 0 and 6).
      grid[0] = makeBiz({ id: 'biz-diner-0', name: 'Diner', baseIncome: 2, synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'biz-diner-1', name: 'Diner', baseIncome: 2, synergyTypes: ['Food'] });
      // Same-type neighbor (diagonal) reduces base income to 60%; same-type
      // neighbors are not counted toward synergy N, so synergy is 0.
      expect(computeBusinessIncome(grid, 0)).toBeCloseTo(2 * 0.6, 5);
      expect(computeBusinessIncome(grid, 6)).toBeCloseTo(2 * 0.6, 5);
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

      // Percentage-based formula:
      // slot 0: base 2, rate=0.5, N=1, synergy=2*0.5=1, total=3
      // slot 1: base 3, rate=0.5, N=1, synergy=3*0.5=1.5, total=4.5
      // slot 5: base 1, N=0, synergy=0, total=1
      expect(result.total).toBe(8.5);
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

      // Percentage-based formula (Medium synergy multiplier re-tuned 1.0 → 0.35
      // by CG-0MSP26Q5N002EH8P):
      // slot 0: base=3, rate=0.5, N=1, synergy=0.525, total=3.525
      // slot 1: base=2, rate=0.5, N=1, synergy=0.35, total=2.35
      expect(result.total).toBeCloseTo(5.875); // 3.525 + 2.35 pre-multiplier
      // CG-0MRER3RE300418SG: Math.floor removed; fractional values preserved.
      // 5.875 * 1.15 = 6.75625
      expect(state.resourceBank.coins).toBeCloseTo(coinsBefore + 6.75625);
    });
  });
});
