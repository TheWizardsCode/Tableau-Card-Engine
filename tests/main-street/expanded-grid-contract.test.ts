/**
 * Expanded Grid Contract Tests
 *
 * Pins the expanded street-grid topology: coordinate mapping, canonical world
 * ordering, 8-way Chebyshev adjacency across street seams, and the
 * income/synergy totals a shared-corner placement produces.
 *
 * The model under test is the **planar seam-sharing lattice**
 * (CG-0MTYMD2Q5008UXB9): street cells are tiled with a stride of
 * (STREET_COLS−1, STREET_ROWS−1) = (4, 1) so adjacent streets share their whole
 * touching column/row and the lattice occupies a solid, hole-free rectangle of
 * world positions. A four-way intersection is a single shared card slot.
 *
 * AC1–AC5 map to work-item CG-0MTH9OQSZ003O1R6; the model was reconciled with
 * the planar rendering geometry in CG-0MTYMD2Q5008UXB9.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  toWorldPosition,
  fromWorldPosition,
  expandedNeighbors,
  worldSlotCount,
  worldIndexToPosition,
  streetSlotToWorldIndex,
  computeSynergyBonus,
  computeIncome,
  computeReputationPerTurn,
  type GridDims,
} from '../../example-games/main-street/MainStreetAdjacency';

// ── Constants ───────────────────────────────────────────────

/** Slots per individual street (2 rows × 5 columns). */
const SLOTS_PER_STREET = 10;

/** The four street cells that meet at a 2×2 lattice's four-way intersection. */
const TWO_BY_TWO: GridDims = { cols: 2, rows: 2 };

/** World index of the 2×2-lattice four-way intersection (world 4,1). */
function sharedCornerIndex(dims: GridDims = TWO_BY_TWO): number {
  return streetSlotToWorldIndex(0, 0, 9, dims)!;
}

// ── AC3: worldSlotCount — planar rectangle ──────────────────

describe('worldSlotCount — planar seam-sharing model', () => {
  it('returns 10 for a single street (1×1)', () => {
    expect(worldSlotCount(1, 1)).toBe(SLOTS_PER_STREET);
  });

  it('returns 18 for two horizontally adjacent streets (2×1)', () => {
    // 9 world columns × 2 world rows: the two streets share a 2-slot seam column.
    expect(worldSlotCount(2, 1)).toBe(18);
  });

  it('returns 15 for two vertically adjacent streets (1×2)', () => {
    // 5 world columns × 3 world rows: the two streets share a 5-slot seam row.
    expect(worldSlotCount(1, 2)).toBe(15);
  });

  it('returns 27 for a 2×2 grid of streets', () => {
    // 9 × 3 rectangle.
    expect(worldSlotCount(2, 2)).toBe(27);
  });

  it('returns 39 for a 3×2 grid and 52 for 3×3', () => {
    expect(worldSlotCount(3, 2)).toBe(13 * 3);
    expect(worldSlotCount(3, 3)).toBe(13 * 4);
  });

  it('agrees with the planar map geometry used by the renderer', () => {
    // MainStreetMapView.mapSlotCount uses (cols·(COLS−1)+1)·(rows·(ROWS−1)+1).
    for (const [cols, rows] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [3, 3]]) {
      expect(worldSlotCount(cols, rows)).toBe((4 * cols + 1) * (1 * rows + 1));
    }
  });

  it('throws for zero or negative dimensions', () => {
    expect(() => worldSlotCount(0, 1)).toThrow();
    expect(() => worldSlotCount(1, 0)).toThrow();
    expect(() => worldSlotCount(-1, 1)).toThrow();
    expect(() => worldSlotCount(1, -1)).toThrow();
  });
});

// ── AC1: toWorldPosition / fromWorldPosition ────────────────

describe('toWorldPosition — planar coordinate mapping', () => {
  it('maps street 0, row 0, slot 0 to the world origin', () => {
    expect(toWorldPosition(0, 0, 0)).toEqual({ worldX: 0, worldY: 0 });
  });

  it('maps within-street adjacency to horizontally adjacent world columns', () => {
    const p0 = toWorldPosition(0, 0, 0);
    const p1 = toWorldPosition(0, 0, 1);
    expect(p1.worldX).toBe(p0.worldX + 1);
    expect(p1.worldY).toBe(p0.worldY);
  });

  it('co-locates a horizontally shared seam column', () => {
    // West street's rightmost column overlaps east street's leftmost column.
    expect(toWorldPosition(0, 0, 4)).toEqual(toWorldPosition(1, 0, 0));
    expect(toWorldPosition(0, 0, 9)).toEqual(toWorldPosition(1, 0, 5));
  });

  it('co-locates a vertically shared seam row', () => {
    // North street's bottom row overlaps south street's top row.
    for (let lx = 0; lx < 5; lx++) {
      expect(toWorldPosition(0, 0, 5 + lx)).toEqual(toWorldPosition(0, 1, lx));
    }
  });

  it('collapses a four-way intersection to one world node owned by four streets', () => {
    const intersection = toWorldPosition(0, 0, 9);
    expect(intersection).toEqual({ worldX: 4, worldY: 1 });
    expect(toWorldPosition(1, 0, 5)).toEqual(intersection);
    expect(toWorldPosition(0, 1, 4)).toEqual(intersection);
    expect(toWorldPosition(1, 1, 0)).toEqual(intersection);
  });

  it('rejects out-of-range slot indices', () => {
    expect(() => toWorldPosition(0, 0, -1)).toThrow();
    expect(() => toWorldPosition(0, 0, SLOTS_PER_STREET)).toThrow();
  });
});

describe('fromWorldPosition — world → owner round-trip', () => {
  it('returns null for out-of-bounds world coordinates', () => {
    expect(fromWorldPosition({ worldX: -9999, worldY: -9999 })).toBeNull();
    expect(fromWorldPosition({ worldX: 9999, worldY: 9999 })).toBeNull();
  });

  it('round-trips every distinct world node of a 2×1 lattice', () => {
    const seen = new Set<string>();
    for (let sx = 0; sx < 2; sx++) {
      for (let slot = 0; slot < SLOTS_PER_STREET; slot++) {
        const world = toWorldPosition(sx, 0, slot);
        seen.add(`${world.worldX},${world.worldY}`);
        const owner = fromWorldPosition(world);
        expect(owner).not.toBeNull();
        expect(toWorldPosition(owner!.streetX, owner!.streetY, owner!.slotIndex)).toEqual(world);
      }
    }
    expect(seen.size).toBe(worldSlotCount(2, 1));
  });

  it('produces a solid plan rectangle with no holes or shear for a 2×2 lattice', () => {
    const seen = new Set<string>();
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        for (let slot = 0; slot < SLOTS_PER_STREET; slot++) {
          const { worldX, worldY } = toWorldPosition(sx, sy, slot);
          seen.add(`${worldX},${worldY}`);
        }
      }
    }
    expect(seen.size).toBe(worldSlotCount(2, 2));
    // Every cell of the 9×3 bounding rectangle is owned — planarity (no holes).
    for (let worldY = 0; worldY < 3; worldY++) {
      for (let worldX = 0; worldX < 9; worldX++) {
        expect(seen.has(`${worldX},${worldY}`)).toBe(true);
      }
    }
  });
});

// ── AC2: shared-corner identity, adjacency & indexing ───────

describe('shared-corner world indexing', () => {
  it('maps every owner of the four-way intersection to one world index', () => {
    const corner = sharedCornerIndex();
    expect(streetSlotToWorldIndex(1, 0, 5, TWO_BY_TWO)).toBe(corner);
    expect(streetSlotToWorldIndex(0, 1, 4, TWO_BY_TWO)).toBe(corner);
    expect(streetSlotToWorldIndex(1, 1, 0, TWO_BY_TWO)).toBe(corner);
  });

  it('round-trips world index ↔ world position for a 2×2 lattice', () => {
    const total = worldSlotCount(2, 2);
    const positions: Array<{ worldX: number; worldY: number }> = [];
    for (let index = 0; index < total; index++) {
      const pos = worldIndexToPosition(index, TWO_BY_TWO);
      expect(pos).not.toBeNull();
      positions.push(pos!);
    }
    // Row-major ordering over the 9×3 rectangle, every cell visited once.
    expect(new Set(positions.map((p) => `${p.worldX},${p.worldY}`)).size).toBe(total);
    expect(positions[0]).toEqual({ worldX: 0, worldY: 0 });
    expect(positions[total - 1]).toEqual({ worldX: 8, worldY: 2 });
  });

  it('returns null for indices outside the lattice', () => {
    expect(worldIndexToPosition(-1, TWO_BY_TWO)).toBeNull();
    expect(worldIndexToPosition(worldSlotCount(2, 2), TWO_BY_TWO)).toBeNull();
    expect(streetSlotToWorldIndex(2, 0, 0, TWO_BY_TWO)).toBeNull();
    expect(streetSlotToWorldIndex(0, 0, SLOTS_PER_STREET, TWO_BY_TWO)).toBeNull();
  });
});

describe('expandedNeighbors — Chebyshev adjacency on world coordinates', () => {
  it('returns 8 distinct neighbours for an interior node', () => {
    const centre = toWorldPosition(1, 0, 5);
    const neighbours = expandedNeighbors(centre, 1);
    expect(neighbours).toHaveLength(8);
    const positions = neighbours.map((n) => toWorldPosition(n.streetX, n.streetY, n.slotIndex));
    expect(new Set(positions.map((p) => `${p.worldX},${p.worldY}`)).size).toBe(8);
  });

  it('returns fewer neighbours at the lattice edge', () => {
    expect(expandedNeighbors(toWorldPosition(0, 0, 0), 1)).toHaveLength(3);
  });

  it('respects the range parameter', () => {
    // A node with 2 cells of headroom in every direction has 25−1 = 24 neighbours.
    expect(expandedNeighbors(toWorldPosition(2, 3, 2), 2)).toHaveLength(24);
  });

  it('is disabled for a non-positive range', () => {
    expect(expandedNeighbors(toWorldPosition(1, 0, 5), 0)).toEqual([]);
  });
});

// ── AC4: income / synergy behaviour on a 2×2 grid ───────────

function mkTestCard(
  id: string,
  synergyTypes: string[],
  baseIncome = 10,
  synergyCoinBonus = 0.5,
  synergyRepBonus = 0,
  reputationPerTurn = 0,
): { id: string; name: string; baseIncome: number; incomeBonus: number; synergyTypes: string[]; synergyCoinBonus: number; synergyRepBonus: number; synergyRangeBonus: number; reputationPerTurn: number; reputationBonus: number; family: string; ongoingCost: number } {
  return {
    id,
    name: id,
    baseIncome,
    incomeBonus: 0,
    synergyTypes,
    synergyCoinBonus,
    synergyRepBonus,
    synergyRangeBonus: 0,
    reputationPerTurn,
    reputationBonus: 0,
    family: 'business',
    ongoingCost: 0,
  } as unknown as ReturnType<typeof mkTestCard> & { currentIncome?: number; currentReputationPerTurn?: number };
}

type TestCard = ReturnType<typeof mkTestCard> | null;

/**
 * Places a shared-corner card (different base type per neighbour, all sharing
 * the `retail` synergy) plus one matching neighbour in each of the four streets
 * that meet at the 2×2 four-way intersection:
 *
 *   index 3  → street (0,0)   index 5  → street (1,0)
 *   index 21 → street (0,1)   index 23 → street (1,1)
 *
 * Every neighbour is Chebyshev-1 adjacent to the corner (index 13, world 4,1)
 * and no two neighbours are adjacent to each other, so the corner's synergy
 * count isolates the cross-street contribution.
 */
function placeCornerPlusFourStreets(
  grid: TestCard[],
  opts: { cornerRepBonus?: number; neighbourRepBonus?: number; cornerRep?: number } = {},
): void {
  const corner = sharedCornerIndex();
  grid[corner] = mkTestCard('cafe-1', ['retail'], 10, 0.5, opts.cornerRepBonus ?? 0, opts.cornerRep ?? 0) as TestCard;
  const neighbourSlots: Array<[number, number, number]> = [
    [0, 0, 3], // world (3,0)
    [1, 0, 1], // world (5,0)
    [0, 1, 8], // world (3,2)
    [1, 1, 6], // world (5,2)
  ];
  const ids = ['bakery-1', 'bookshop-1', 'gym-1', 'cinema-1'];
  neighbourSlots.forEach(([sx, sy, slot], i) => {
    const index = streetSlotToWorldIndex(sx, sy, slot, TWO_BY_TWO)!;
    grid[index] = mkTestCard(ids[i], ['retail'], 10, 0.5, opts.neighbourRepBonus ?? 0) as TestCard;
  });
}

describe('income and synergy on a 2×2 grid', () => {
  it('a shared-corner card counts matching neighbours from all four streets', () => {
    const total = worldSlotCount(2, 2);
    const grid: TestCard[] = new Array(total).fill(null);
    const sold = new Array(total).fill(false);
    placeCornerPlusFourStreets(grid);

    // Corner cafe: 10 base, 4 matching different-type neighbours, 50% synergy.
    const bonus = computeSynergyBonus(grid as unknown as Parameters<typeof computeSynergyBonus>[0], sharedCornerIndex(), 1, sold, TWO_BY_TWO);
    expect(bonus).toBe(20);
  });

  it('computeIncome totals match hand-calculated expectations on 2×2', () => {
    const total = worldSlotCount(2, 2);
    const grid: TestCard[] = new Array(total).fill(null);
    const sold = new Array(total).fill(false);
    placeCornerPlusFourStreets(grid);

    // Corner: 10 + 20 = 30. Each neighbour: 10 + (10·0.5·1) = 15. Total 30 + 4·15 = 90.
    const result = computeIncome(grid as unknown as Parameters<typeof computeIncome>[0], 1, undefined, sold, TWO_BY_TWO);
    expect(result.total).toBe(90);
    const cornerEntry = result.breakdown.find((b) => b.slotIndex === sharedCornerIndex())!;
    expect(cornerEntry.total).toBe(30);
    expect(result.breakdown).toHaveLength(5);
  });

  it('computeReputationPerTurn scales with synergy on 2×2 grid', () => {
    const total = worldSlotCount(2, 2);
    const grid: TestCard[] = new Array(total).fill(null);
    const sold = new Array(total).fill(false);
    placeCornerPlusFourStreets(grid, { cornerRepBonus: 2, neighbourRepBonus: 1, cornerRep: 3 });

    // Corner: 3 reputation/turn + 4 neighbours × 1 synergy rep = 7.
    // Each of the 4 neighbours: 0 + corner's 2 synergy rep = 2 → 8.
    // Total 7 + 8 = 15.
    const rep = computeReputationPerTurn(grid as unknown as Parameters<typeof computeReputationPerTurn>[0], sold, TWO_BY_TWO);
    expect(rep).toBe(15);
  });

  it('keeps the 1×1 legacy totals unchanged (no gridDims)', () => {
    const grid: TestCard[] = new Array(SLOTS_PER_STREET).fill(null);
    const sold = new Array(SLOTS_PER_STREET).fill(false);
    grid[0] = mkTestCard('cafe-1', ['retail'], 10, 0.5, 0) as TestCard;
    grid[1] = mkTestCard('bakery-1', ['retail'], 10, 0.5, 0) as TestCard;

    const result = computeIncome(grid as unknown as Parameters<typeof computeIncome>[0], 1, undefined, sold);
    // cafe: 10 + (10·0.5·1) = 15; bakery: 10 + 5 = 15 → 30.
    expect(result.total).toBe(30);
  });
});
