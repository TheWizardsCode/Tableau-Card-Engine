/**
 * Main Street: Same-Type Synergy Nullification Tests
 *
 * Tests for the rule that synergy only applies between businesses of
 * *different* base types (template IDs). Same-type adjacent businesses:
 * - Receive 0 synergy from each other (coin and reputation)
 * - Have their base income reduced to 60%
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  computeSynergyBonus,
  computeSynergyRepBonus,
  computeBusinessIncome,
  computeIncome,
  computeReputationPerTurn,
  computeSynergyPairs,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  GRID_SIZE,
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ──────────────────────────────────────────────────

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz-0',
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
    ...overrides,
  };
}

function makeCommunitySpace(overrides: Partial<CommunitySpaceCard> = {}): CommunitySpaceCard {
  return {
    family: 'community-space',
    id: overrides.id ?? 'cs-test-0',
    name: overrides.name ?? 'Test Community Space',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
    ongoingCost: overrides.ongoingCost ?? 0,
    synergyTypes: overrides.synergyTypes ?? ['Culture'],
    synergyCoinBonus: overrides.synergyCoinBonus ?? 0.5,
    synergyRepBonus: overrides.synergyRepBonus ?? 0,
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test community space',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ...overrides,
  };
}

function emptyGrid(): (BusinessCard | CommunitySpaceCard | null)[] {
  return new Array<BusinessCard | CommunitySpaceCard | null>(GRID_SIZE).fill(null);
}

// ── Same-Base-Type Helper ────────────────────────────────────

/**
 * Strips the serial suffix (`-N`) from a card ID to get the template ID.
 * E.g., 'biz-bakery-0' → 'biz-bakery', 'biz-bakery' → 'biz-bakery'.
 */
function getBaseTypeId(id: string): string {
  return id.replace(/-\d+$/, '');
}

// ── Tests ─────────────────────────────────────────────────────

describe('Same-type synergy nullification', () => {
  describe('getBaseTypeId helper requirement', () => {
    it('strips serial suffix from deck-created card IDs', () => {
      expect(getBaseTypeId('biz-bakery-0')).toBe('biz-bakery');
      expect(getBaseTypeId('biz-diner-2')).toBe('biz-diner');
      expect(getBaseTypeId('cs-park-1')).toBe('cs-park');
    });

    it('returns the same string for IDs without a serial suffix', () => {
      expect(getBaseTypeId('biz-bakery')).toBe('biz-bakery');
      expect(getBaseTypeId('cs-library')).toBe('cs-library');
    });
  });

  describe('computeSynergyBonus — same-type nullification', () => {
    // AC #1: Synergy is nullified between same-type adjacent businesses
    it('returns 0 synergy between two adjacent same-type Food businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'] });

      // Both should get 0 synergy because they're the same base type (biz-bakery)
      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 1)).toBe(0);
    });

    // AC #2: Different-type businesses still get full synergy
    it('returns full synergy between two different-type Food businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-diner-0', synergyTypes: ['Food'] });

      // Different base types (biz-bakery vs biz-diner), so full synergy
      // effectiveBase=2, rate=0.5, N=1, synergy=2*0.5*1*1=1
      expect(computeSynergyBonus(grid, 0)).toBe(1);
      expect(computeSynergyBonus(grid, 1)).toBe(1);
    });

    // AC #5: Same-type non-adjacent — no penalty
    it('does not nullify synergy for same-type businesses that are not adjacent', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'] });
      // Both only have range-1 adjacency; index 0 and 2 are not adjacent (distance 2)
      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 2)).toBe(0);
    });

    // AC: 8-way adjacency — same-type diagonal neighbors nullify synergy
    it('nullifies synergy between same-type businesses placed diagonally (8-way)', () => {
      const grid = emptyGrid();
      // index 6 is diagonal from index 0 (row 1, col 1) - Chebyshev distance 1
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'] });

      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 6)).toBe(0);
    });

    // AC #5: Mixed scenario — same-type and different-type neighbors
    it('gets synergy only from different-type neighbor when both same-type and different-type are adjacent', () => {
      const grid = emptyGrid();
      // Slot 0: Bakery (Food), Slot 1: Bakery (Food) same-type, Slot 2: Diner (Food) different-type
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyCoinBonus: 0.5 });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'], synergyCoinBonus: 0.5 });
      grid[2] = makeBiz({ id: 'biz-diner-0', synergyTypes: ['Food'], synergyCoinBonus: 0.5 });

      // Bakery at slot 1 has same-type neighbor (slot 0) and diff-type neighbor (slot 2).
      // Same-type penalty reduces base to 60%: effectiveBase = 2 * 0.6 = 1.2
      // Only the Diner (diff-type) counts: N=1
      // synergy = 1.2 * 0.5 * 1 * 1 = 0.6
      expect(computeSynergyBonus(grid, 1)).toBe(0.6);
    });

    // AC #5: Upgraded business next to base same-type business
    it('applies same-type rule to upgraded businesses (upgrades do not change base type)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], level: 0 });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'], level: 1, incomeBonus: 2 });

      // Even though one is upgraded, they're the same base type
      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 1)).toBe(0);
    });

    // Same-type check with CommunitySpaceCard
    it('nullifies synergy between same-type Community Spaces', () => {
      const grid = emptyGrid();
      grid[0] = makeCommunitySpace({ id: 'cs-park-0', synergyTypes: ['Culture'] });
      grid[1] = makeCommunitySpace({ id: 'cs-park-1', synergyTypes: ['Culture'] });

      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 1)).toBe(0);
    });

    // Mixed Business and Community Space — same type check
    it('applies same-type rule across Business and Community Space cards with matching template IDs', () => {
      // A biz-cafe and a cs-park have different template IDs, so they synergize
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-cafe-0', synergyTypes: ['Culture'] });
      grid[1] = makeCommunitySpace({ id: 'cs-park-0', synergyTypes: ['Culture'] });

      // Different base types (biz-cafe vs cs-park), so synergy applies
      // effectiveBase=2, rate=0.5, N=1, synergy=2*0.5*1*1=1
      expect(computeSynergyBonus(grid, 0)).toBe(1);
      expect(computeSynergyBonus(grid, 1)).toBe(1);
    });

    // Pawn Shop synergyCoinBonus=0 behavior is preserved alongside same-type rule
    it('preserves Pawn Shop zero-synergy behavior alongside same-type rule', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-pawnshop-0', synergyTypes: ['Commerce'], synergyCoinBonus: 0 });
      grid[1] = makeBiz({ id: 'biz-hardware-0', synergyTypes: ['Commerce'] });

      // Pawn Shop has rate=0, so receives 0 synergy.
      // Hardware Store has rate=0.5, but Pawn Shop is synergy-neutral (synergyCoinBonus=0, synergyRepBonus=0),
      // so it's skipped in neighbor counting → N=0 → synergy=0.
      expect(computeSynergyBonus(grid, 0)).toBe(0); // Pawn Shop receives 0 from hardware
      expect(computeSynergyBonus(grid, 1)).toBe(0); // Hardware receives 0 from pawn
    });

    // Synergy with same-type but same card has synergyCoinBonus=2 — same-type rule overrides
    it('same-type rule overrides non-zero synergyCoinBonus', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyCoinBonus: 2 });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'], synergyCoinBonus: 2 });

      // Even though synergyCoinBonus=2 (200%), same-type rule overrides to 0
      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeSynergyBonus(grid, 1)).toBe(0);
    });
  });

  describe('computeSynergyRepBonus — same-type nullification', () => {
    // AC #3: Reputation synergy is nullified for same-type neighbors
    it('returns 0 reputation synergy between same-type neighbors', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyRepBonus: 0.5 });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'], synergyRepBonus: 0.5 });

      expect(computeSynergyRepBonus(grid, 0)).toBe(0);
      expect(computeSynergyRepBonus(grid, 1)).toBe(0);
    });

    it('returns reputation synergy for different-type neighbors', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyRepBonus: 0.5 });
      grid[1] = makeBiz({ id: 'biz-diner-0', synergyTypes: ['Food'], synergyRepBonus: 0.5 });

      expect(computeSynergyRepBonus(grid, 0)).toBe(0.5);
      expect(computeSynergyRepBonus(grid, 1)).toBe(0.5);
    });

    it('preserves own reputationPerTurn and reputationBonus for same-type businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({
        id: 'biz-clinic-0',
        synergyTypes: ['Health'],
        synergyRepBonus: 0.1,
        reputationPerTurn: 0.2,
        reputationBonus: 0.1,
      });
      grid[1] = makeBiz({
        id: 'biz-clinic-1',
        synergyTypes: ['Health'],
        synergyRepBonus: 0.1,
        reputationPerTurn: 0.2,
        reputationBonus: 0.1,
      });

      // computeReputationPerTurn adds: reputationPerTurn + reputationBonus + synergyRepBonus
      // Each clinic: 0.2 + 0.1 + 0 (synergy nullified) = 0.3
      // Total: 0.3 + 0.3 = 0.6
      const total = computeReputationPerTurn(grid);
      expect(total).toBe(0.6);
    });
  });

  describe('computeBusinessIncome — 60% base income for same-type adjacent', () => {
    // AC #2: Base income reduced to 60% for same-type adjacent businesses
    it('applies 0.6 multiplier to base income when adjacent to same-type business', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });

      // baseIncome = 2, 60% = 1.2, synergy = 0 (same-type nullified)
      // total = 1.2 + 0 = 1.2
      expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1.2);
      expect(computeBusinessIncome(grid, 1)).toBeCloseTo(1.2);
    });

    it('does not apply 0.6 multiplier for different-type adjacent businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 2, synergyTypes: ['Food'] });

      // base = 2, synergy = 1, total = 3 (no 0.6 multiplier)
      expect(computeBusinessIncome(grid, 0)).toBe(3);
      expect(computeBusinessIncome(grid, 1)).toBe(3);
    });

    // AC #5: Same-type non-adjacent — no multiplier
    it('does not apply 0.6 multiplier to same-type businesses that are not adjacent', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });

      // Not adjacent, so no penalty
      expect(computeBusinessIncome(grid, 0)).toBe(2);
      expect(computeBusinessIncome(grid, 2)).toBe(2);
    });

    // AC: 8-way adjacency — diagonal-only same-type placement triggers the penalty
    it('triggers the 0.6 multiplier via diagonal-only same-type adjacency', () => {
      const grid = emptyGrid();
      // index 6 is diagonal from index 0 (row 1, col 1) - Chebyshev distance 1
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });

      // Same-type diagonal neighbor -> base = 2 * 0.6 = 1.2, synergy = 0
      expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1.2);
      expect(computeBusinessIncome(grid, 6)).toBeCloseTo(1.2);
    });

    // AC #5: Mixed same-type and different-type — 0.6 multiplier applies
    it('applies 0.6 multiplier when a business has both same-type and different-type neighbors', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'biz-diner-0', baseIncome: 2, synergyTypes: ['Food'] });

      // Slot 1 has: same-type neighbor (slot 0) + diff-type neighbor (slot 2)
      // effectiveBase = 2 * 0.6 = 1.2, rate=0.5, N=1, synergy = 1.2 * 0.5 * 1 * 1 = 0.6, total = 1.2 + 0.6 = 1.8
      expect(computeBusinessIncome(grid, 1)).toBeCloseTo(1.8);
    });

    // AC #5: Income bonus from upgrades is included in the base before 0.6 multiplier
    it('includes incomeBonus in the base before applying 0.6 multiplier', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, incomeBonus: 1, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, incomeBonus: 1, synergyTypes: ['Food'] });

      // base = 2 + 1 = 3, 60% = 1.8, synergy = 0, total = 1.8
      expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1.8);
      expect(computeBusinessIncome(grid, 1)).toBeCloseTo(1.8);
    });

    // Multiplier is applied once, not stacked multiplicatively with multiple same-type neighbors
    it('does not stack the 0.6 multiplier multiplicatively for multiple same-type neighbors', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });
      // Slot 5 is also a Bakery adjacent to slot 0 (distance 1 on 2x5 grid)
      grid[5] = makeBiz({ id: 'biz-bakery-2', baseIncome: 2, synergyTypes: ['Food'] });

      // Slot 0 has two same-type neighbors (slot 1 and slot 5)
      // base = 2 * 0.6 = 1.2 (once, not 2 * 0.6 * 0.6 = 0.72)
      // synergy = 0 (both are same-type)
      expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1.2);
    });

    // CommunitySpaceCard same-type 0.6 multiplier
    it('applies 0.6 multiplier to Community Space cards with adjacent same-type', () => {
      const grid = emptyGrid();
      grid[0] = makeCommunitySpace({ id: 'cs-park-0', baseIncome: 2, synergyTypes: ['Culture'] });
      grid[1] = makeCommunitySpace({ id: 'cs-park-1', baseIncome: 2, synergyTypes: ['Culture'] });

      // base = 2 * 0.6 = 1.2, synergy = 0, total = 1.2
      expect(computeBusinessIncome(grid, 0)).toBeCloseTo(1.2);
      expect(computeBusinessIncome(grid, 1)).toBeCloseTo(1.2);
    });
  });

  describe('computeIncome breakdown — 60% base income', () => {
    it('shows the reduced base income in the breakdown for same-type adjacent businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });

      const result = computeIncome(grid);

      expect(result.breakdown).toHaveLength(2);
      const slot0 = result.breakdown.find(s => s.slotIndex === 0)!;
      const slot1 = result.breakdown.find(s => s.slotIndex === 1)!;

      // baseIncome should reflect the 0.6 multiplier: 2 * 0.6 = 1.2
      expect(slot0.baseIncome).toBeCloseTo(1.2);
      expect(slot1.baseIncome).toBeCloseTo(1.2);
      // synergyBonus should be 0 (same-type)
      expect(slot0.synergyBonus).toBe(0);
      expect(slot1.synergyBonus).toBe(0);
      // total = 1.2
      expect(slot0.total).toBeCloseTo(1.2);
    });

    it('shows standard base income in breakdown for different-type businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-diner-0', baseIncome: 2, synergyTypes: ['Food'] });

      const result = computeIncome(grid);

      const slot0 = result.breakdown.find(s => s.slotIndex === 0)!;
      expect(slot0.baseIncome).toBe(2);
      expect(slot0.synergyBonus).toBe(1);
      expect(slot0.total).toBe(3);
    });
  });

  describe('computeSynergyPairs — visual line rendering', () => {
    it('does not include same-type pairs in synergy pairs for visual lines', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyCoinBonus: 1 });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'], synergyCoinBonus: 1 });

      const pairs = computeSynergyPairs(grid);
      // No pairs should be reported because both are same-type
      expect(pairs).toHaveLength(0);
    });

    it('includes different-type pairs in synergy pairs', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyCoinBonus: 1 });
      grid[1] = makeBiz({ id: 'biz-diner-0', synergyTypes: ['Food'], synergyCoinBonus: 1 });

      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].fromIndex).toBe(0);
      expect(pairs[0].toIndex).toBe(1);
    });

    it('excludes same-type pairs when mixed with different-type pairs', () => {
      const grid = emptyGrid();
      // Slots 0 and 1: Bakeries (same-type), Slot 2: Diner (diff-type from Bakery)
      grid[0] = makeBiz({ id: 'biz-bakery-0', synergyTypes: ['Food'], synergyCoinBonus: 1 });
      grid[1] = makeBiz({ id: 'biz-bakery-1', synergyTypes: ['Food'], synergyCoinBonus: 1 });
      grid[2] = makeBiz({ id: 'biz-diner-0', synergyTypes: ['Food'], synergyCoinBonus: 1 });

      const pairs = computeSynergyPairs(grid);
      // Only the (1,2) pair should exist; (0,1) is same-type
      expect(pairs).toHaveLength(1);
      expect(pairs[0].fromIndex).toBe(1);
      expect(pairs[0].toIndex).toBe(2);
    });
  });

  describe('computeReputationPerTurn — unaffected by same-type rule for base values', () => {
    it('still counts own reputationPerTurn and reputationBonus for same-type businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({
        id: 'biz-clinic-0',
        synergyTypes: ['Health'],
        synergyRepBonus: 0.1,
        reputationPerTurn: 0.2,
      });
      grid[1] = makeBiz({
        id: 'biz-clinic-1',
        synergyTypes: ['Health'],
        synergyRepBonus: 0.1,
        reputationPerTurn: 0.2,
      });

      // reputationPerTurn: 0.2 + 0.2 = 0.4
      // synergyRepBonus: 0 for both (same-type nullified)
      // total: 0.4
      const total = computeReputationPerTurn(grid);
      expect(total).toBe(0.4);
    });
  });

  describe('Edge cases', () => {
    it('handles sold slots correctly — sold same-type neighbor does not trigger penalty', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-bakery-0', baseIncome: 2, synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-bakery-1', baseIncome: 2, synergyTypes: ['Food'] });

      // Slot 1 is sold
      const soldSlots = new Array(GRID_SIZE).fill(false);
      soldSlots[1] = true;

      // Sold slots are skipped, so slot 0 has no neighbors, no penalty
      expect(computeSynergyBonus(grid, 0, 1, soldSlots)).toBe(0);
      // Sold slots produce no income
      expect(computeBusinessIncome(grid, 1, 1, soldSlots)).toBe(0);
    });

    it('handles empty grid gracefully', () => {
      const grid = emptyGrid();
      expect(computeSynergyBonus(grid, 0)).toBe(0);
      expect(computeBusinessIncome(grid, 0)).toBe(0);
      expect(computeSynergyRepBonus(grid, 0)).toBe(0);
    });
  });
});
