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
import {
  synergyLineEndpoints,
  type SynergyLineLayout,
} from '../../example-games/main-street/scenes/synergyLineEndpoints';

// ── Helpers ─────────────────────────────────────────────────

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
    synergyCoinBonus: overrides.synergyCoinBonus ?? (isPawnShop ? 0 : 1),
    synergyRepBonus: overrides.synergyRepBonus ?? (isPawnShop ? 0 : 0),
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

    it('returns a pair for vertically adjacent businesses', () => {
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

    it('includes diagonal-only pairs (8-way adjacency)', () => {
      const grid = emptyGrid();
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'] });
      // index 6 is diagonal from index 0 (row 1, col 1) - Chebyshev distance 1
      grid[6] = makeBiz({ id: 'biz-b', synergyTypes: ['Food'] });
      const pairs = computeSynergyPairs(grid);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toEqual({
        fromIndex: 0,
        toIndex: 6,
        sharedSynergy: 'Food',
      });
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
        ongoingCost: 0,
        synergyTypes: ['Culture'],
        synergyCoinBonus: 1,
        synergyRepBonus: 0,
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
      // Card at index 0 has range bonus so it sees Chebyshev distance 2
      grid[0] = makeBiz({ id: 'biz-a', synergyTypes: ['Food'], synergyRangeBonus: 1 });
      // Index 2 is Chebyshev distance 2 from index 0 (same row)
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
      // Expected pairs (8-way / Chebyshev):
      // Row 0 horizontal: (0,1), (2,3) = 2
      // Row 1 horizontal: (5,6), (7,8) = 2
      // Vertical: (0,5), (1,6), (2,7), (3,8), (4,9) = 5
      // Diagonal (Chebyshev 1): (0,6), (1,5), (2,8), (3,7) = 4
      // Total = 13 (orthogonal 9 + diagonal 4)
      expect(pairs).toHaveLength(13);
    });
  });
});

// ── synergyLineEndpoints geometry (CG-0MSVM3WCD007BRQP) ─────

/**
 * Layout fixture mirroring the real Main Street layout math
 * (BASE_SLOT_W=140, BASE_SLOT_H=80, BASE_SLOT_GAP=20,
 * STREET_ROW_GAP=12, STREET_COLS=5) — "slot centres from the same layout
 * math" as the renderer/animator use.
 */
const LINE_LAYOUT: SynergyLineLayout = {
  streetX: 20,
  streetTop: 100,
  slotW: 140,
  slotGap: 20,
  slotH: 80,
  streetRowGap: 12,
  streetCols: 5,
};

/** Slot centres under LINE_LAYOUT: x = 20 + col*160 + 70, y = 100 + row*92 + 40. */
const slotCentre = (idx: number): { x: number; y: number } => {
  const col = idx % LINE_LAYOUT.streetCols;
  const row = Math.floor(idx / LINE_LAYOUT.streetCols);
  return {
    x: LINE_LAYOUT.streetX + col * (LINE_LAYOUT.slotW + LINE_LAYOUT.slotGap) + LINE_LAYOUT.slotW / 2,
    y: LINE_LAYOUT.streetTop + row * (LINE_LAYOUT.slotH + LINE_LAYOUT.streetRowGap) + LINE_LAYOUT.slotH / 2,
  };
};

describe('synergyLineEndpoints', () => {
  it('clips horizontally-adjacent pairs edge-to-edge (slot rects, not centres)', () => {
    const { p1, p2, mid } = synergyLineEndpoints(
      { fromIndex: 0, toIndex: 1, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    // Slot 0 rect: x∈[20,160], y∈[100,180]; slot 1 rect: x∈[180,320], y∈[100,180].
    // p1 on slot 0's RIGHT edge, p2 on slot 1's LEFT edge, both at the row centre.
    expect(p1.x).toBeCloseTo(160, 6);
    expect(p1.y).toBeCloseTo(140, 6);
    expect(p2.x).toBeCloseTo(180, 6);
    expect(p2.y).toBeCloseTo(140, 6);

    // NOT the slot centres.
    expect(p1).not.toEqual(slotCentre(0));
    expect(p2).not.toEqual(slotCentre(1));

    // Midpoint of the clipped segment = centre-to-centre midpoint.
    expect(mid.x).toBeCloseTo(170, 6);
    expect(mid.y).toBeCloseTo(140, 6);
  });

  it('clips vertically-adjacent pairs edge-to-edge (top/bottom edges)', () => {
    const { p1, p2 } = synergyLineEndpoints(
      { fromIndex: 0, toIndex: 5, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    // Slot 0 rect y∈[100,180]; slot 5 rect y∈[192,272]. p1 on slot 0's BOTTOM
    // edge, p2 on slot 5's TOP edge, both at the column centre.
    expect(p1.x).toBeCloseTo(90, 6);
    expect(p1.y).toBeCloseTo(180, 6);
    expect(p2.x).toBeCloseTo(90, 6);
    expect(p2.y).toBeCloseTo(192, 6);
  });

  it('clips diagonally-adjacent pairs to the facing corners of the slot rects', () => {
    const { p1, p2, mid } = synergyLineEndpoints(
      { fromIndex: 0, toIndex: 6, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    // Centre-to-centre (90,140)→(250,232) exits slot 0 through its bottom edge
    // within a sub-pixel of the bottom-RIGHT corner (160,180) and enters slot 6
    // through its top edge within a sub-pixel of the top-LEFT corner (180,192).
    // (The first boundary hit is the bottom edge: t_y = 40/92 < t_x = 70/160.)
    expect(p1.x).toBeCloseTo(90 + (40 / 92) * 160, 3);
    expect(p1.y).toBeCloseTo(180, 6);
    expect(p2.x).toBeCloseTo(250 - (40 / 92) * 160, 3);
    expect(p2.y).toBeCloseTo(192, 6);

    // Definitely not at the slot centres.
    expect(p1).not.toEqual(slotCentre(0));
    expect(p2).not.toEqual(slotCentre(6));

    // Midpoint of the clipped segment = centre-to-centre midpoint.
    expect(mid.x).toBeCloseTo((90 + 250) / 2, 6);
    expect(mid.y).toBeCloseTo((140 + 232) / 2, 6);
  });

  it('clips extended-range pairs (range 2, same row) edge-to-edge', () => {
    // Slots 0 and 2 (synergyRangeBonus >= 1): Chebyshev distance 2, same row.
    const { p1, p2 } = synergyLineEndpoints(
      { fromIndex: 0, toIndex: 2, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    // Still pure horizontal → p1 on slot 0's right edge, p2 on slot 2's left edge,
    // at the row centre (slot 2 rect x∈[340,480]).
    expect(p1.x).toBeCloseTo(160, 6);
    expect(p1.y).toBeCloseTo(140, 6);
    expect(p2.x).toBeCloseTo(340, 6);
    expect(p2.y).toBeCloseTo(140, 6);
  });

  it('clips extended-range diagonal pairs to the card boundaries (straight line crossing intermediate cells)', () => {
    // Slots 0 and 7 (row 1, col 2): dx=320, dy=92. First boundary hit for slot 0
    // is the RIGHT edge (t_x = 70/320 < t_y = 40/92), so the segment exits the
    // side, not the corner — still clipped to the rect boundaries.
    const { p1, p2 } = synergyLineEndpoints(
      { fromIndex: 0, toIndex: 7, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    expect(p1.x).toBeCloseTo(160, 6); // slot 0 right edge
    expect(p1.y).toBeCloseTo(140 + (70 / 320) * 92, 3); // towards the bottom of the edge
    expect(p2.x).toBeCloseTo(340, 6); // slot 7 left edge (340 = 20 + 2*160)
    expect(p2.y).toBeCloseTo(232 - (70 / 320) * 92, 3);
  });

  it('returns identical endpoints for both adjacent slots of a horizontal pair (symmetric clip)', () => {
    const { p1, p2 } = synergyLineEndpoints(
      { fromIndex: 1, toIndex: 2, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    // Symmetric about the gap: slot 1 right edge (320,140) → slot 2 left edge (340,140).
    expect(p1.x).toBeCloseTo(320, 6);
    expect(p1.y).toBeCloseTo(140, 6);
    expect(p2.x).toBeCloseTo(340, 6);
    expect(p2.y).toBeCloseTo(140, 6);
  });

  it('guards the degenerate self-pair (fromIndex === toIndex) by returning the centre', () => {
    const { p1, p2 } = synergyLineEndpoints(
      { fromIndex: 3, toIndex: 3, sharedSynergy: 'Food' },
      LINE_LAYOUT,
    );

    expect(p1).toEqual(slotCentre(3));
    expect(p2).toEqual(slotCentre(3));
  });
});
