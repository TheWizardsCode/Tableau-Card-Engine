/**
 * Main Street: Synergy Visuals Tests
 *
 * Validates the synergy pair computation used for drawing visual lines
 * between adjacent synergistic businesses on the street grid.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  computeSynergyPairs,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  GRID_SIZE,
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

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

function emptyGrid(): (BusinessCard | CommunitySpaceCard | null)[] {
  return new Array<BusinessCard | CommunitySpaceCard | null>(GRID_SIZE).fill(null);
}

describe('Synergy Pairs for Visual Lines', () => {
  describe('computeSynergyPairs', () => {
    it('returns empty array for an empty grid', () => {
      const pairs = computeSynergyPairs(emptyGrid());
      expect(pairs).toEqual([]);
    });

    it('returns empty array when no synergistic neighbors exist', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-b', synergyTypes: ['Culture'] });
      grid[5] = makeBiz({ id: 'biz-c', synergyTypes: ['Commerce'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toEqual([]);
    });

    it('returns a pair for two adjacent Food businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toEqual({
        fromIndex: 0,
        toIndex: 1,
        sharedSynergy: 'Food',
      });
    });

    it('returns a pair for diagonally adjacent businesses (within Manhattan range 1)', () => {
      // index 0 (row 0, col 0) and index 5 (row 1, col 0) are vertical neighbors
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      grid[5] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toEqual({
        fromIndex: 0,
        toIndex: 5,
        sharedSynergy: 'Food',
      });
    });

    it('returns pairs for a chain of three Food businesses', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'biz-c', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      // Adjacent pairs: (0,1) and (1,2)
      expect(pairs).toHaveLength(2);
      expect(pairs).toContainEqual({ fromIndex: 0, toIndex: 1, sharedSynergy: 'Food' });
      expect(pairs).toContainEqual({ fromIndex: 1, toIndex: 2, sharedSynergy: 'Food' });
    });

    it('uses the first shared synergy type when multiple types match', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-cafe', synergyTypes: ['Food', 'Culture'] });
      grid[1] = makeBiz({ id: 'biz-gallery', synergyTypes: ['Culture', 'Entertainment'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      // Both share 'Culture' - that should be the shared synergy
      expect(pairs[0].sharedSynergy).toBe('Culture');
    });

    it('does not include diagonal-only pairs (Manhattan distance > 1)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      // index 6 is diagonal from index 0 (row 1, col 1) - Manhattan distance 2
      grid[6] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(0);
    });

    it('excludes Pawn Shop from contributing to synergy pairs', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-hardware-0', name: 'Hardware Store', synergyTypes: ['Commerce'] });
      grid[1] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', synergyTypes: ['Commerce'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toEqual([]);
    });

    it('excludes disconnected Pawn Shop pairs (no line from/to Pawn Shop)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-pawnshop-0', name: 'Pawn Shop', synergyTypes: ['Commerce'] });
      grid[1] = makeBiz({ id: 'biz-pawnshop-1', name: 'Pawn Shop', synergyTypes: ['Commerce'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toEqual([]);
    });

    it('includes community-space cards in synergy pairs', () => {
      const grid = emptyGrid() as (BusinessCard | CommunitySpaceCard | null)[];
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Culture'] });
      grid[1] = {
        family: 'community-space',
        id: 'cs-park-0',
        name: 'Park',
        cost: 4,
        baseIncome: 0,
        synergyTypes: ['Culture'],
        maxLevel: 1,
        description: 'A park',
        level: 0,
        incomeBonus: 0,
        synergyRangeBonus: 0,
        reputationBonus: 0,
      };
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].sharedSynergy).toBe('Culture');
    });

    it('respects extended range from upgrades (range >= 2 pairs)', () => {
      const grid = emptyGrid();
      // Card at index 0 has range bonus so it sees Manhattan distance 2
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'], synergyRangeBonus: 1 });
      // Index 2 is Manhattan distance 2 from index 0
      grid[2] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toEqual({
        fromIndex: 0,
        toIndex: 2,
        sharedSynergy: 'Food',
      });
    });

    it('asymmetric range: only the upgraded card sees the distant one', () => {
      const grid = emptyGrid();
      // Card at index 0 has range bonus (range=2)
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'], synergyRangeBonus: 1 });
      // Card at index 2 has no range bonus (range=1)
      grid[2] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      // When one card sees the other but not vice-versa, they are still connected
      expect(pairs[0]).toEqual({
        fromIndex: 0,
        toIndex: 2,
        sharedSynergy: 'Food',
      });
    });

    it('avoids duplicate pairs (only smaller index first)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      // Should only have (0,1), not (1,0)
      expect(pairs[0].fromIndex).toBeLessThan(pairs[0].toIndex);
    });

    it('handles complex grid with multiple synergy types', () => {
      const grid = emptyGrid();
      // Row 0: Food-Food-Culture-Culture-Entertainment
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      grid[1] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      grid[2] = makeBiz({ id: 'biz-c', synergyTypes: ['Culture'] });
      grid[3] = makeBiz({ id: 'biz-d', synergyTypes: ['Culture'] });
      grid[4] = makeBiz({ id: 'biz-e', synergyTypes: ['Entertainment'] });
      // Row 1: same layout
      grid[5] = makeBiz({ id: 'biz-f', synergyTypes: ['Food'] });
      grid[6] = makeBiz({ id: 'biz-g', synergyTypes: ['Food'] });
      grid[7] = makeBiz({ id: 'biz-h', synergyTypes: ['Culture'] });
      grid[8] = makeBiz({ id: 'biz-i', synergyTypes: ['Culture'] });
      grid[9] = makeBiz({ id: 'biz-j', synergyTypes: ['Entertainment'] });

      const pairs = computeSynergyPairs(grid);
      // Expected pairs:
      // Row 0 horizontal: (0,1), (2,3) = 2
      // Row 1 horizontal: (5,6), (7,8) = 2
      // Vertical: (0,5), (1,6), (2,7), (3,8), (4,9) = 5
      // Total = 9
      expect(pairs).toHaveLength(9);
    });
  });
});
