/**
 * Expanded Grid Contract Tests
 *
 * Pins the expanded street-grid topology: coordinate mapping, world ordering,
 * 8-way Chebyshev adjacency (including across street boundaries), and the
 * income/synergy totals a cross-street placement produces.
 *
 * The model under test is the **city-block grid** (CG-0MT5Y1X5T001M4S6): street
 * cells are tiled at a stride of exactly (STREET_COLS, STREET_ROWS) = (5, 2) and
 * each street **owns** its own ten plots, so the world grid is the solid
 * rectangle `(5·cols) × (2·rows)` with no shared plots. Roads are a purely
 * visual layer drawn between the street blocks (see `street-roads.test.ts`).
 *
 * This replaced the earlier "planar seam-sharing" lattice
 * (CG-0MTYMD2Q5008UXB9), in which adjacent streets shared their touching
 * column/row and a four-way intersection was a single card slot. That model
 * rendered as one solid block of plots, which the producer rejected; the
 * shared-seam model was removed rather than kept for compatibility.
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

/** The four street cells of a 2×2 lattice. */
const TWO_BY_TWO: GridDims = { cols: 2, rows: 2 };

/**
 * World index of a street's bottom-right corner plot.
 *
 * In the city-block model this is the plot nearest the four-way meeting point
 * of four streets — but it is a plot owned solely by street (0,0), NOT a node
 * shared with its neighbours.
 */
function cornerPlotIndex(dims: GridDims = TWO_BY_TWO): number {
  return streetSlotToWorldIndex(0, 0, 9, dims)!;
}

// ── AC3: worldSlotCount — ten plots per street, no sharing ──

describe('worldSlotCount — city-block grid (ten plots per street)', () => {
  it('returns 10 for a single street (1×1)', () => {
    expect(worldSlotCount(1, 1)).toBe(SLOTS_PER_STREET);
  });

  it('returns 20 for two horizontally adjacent streets (2×1)', () => {
    // 10 world columns × 2 world rows: each street owns its own 5 columns.
    expect(worldSlotCount(2, 1)).toBe(20);
  });

  it('returns 20 for two vertically adjacent streets (1×2)', () => {
    // 5 world columns × 4 world rows.
    expect(worldSlotCount(1, 2)).toBe(20);
  });

  it('returns 40 for a 2×2 grid of streets', () => {
    expect(worldSlotCount(2, 2)).toBe(40);
  });

  it('returns 60 for a 3×2 grid and 90 for 3×3', () => {
    expect(worldSlotCount(3, 2)).toBe(60);
    expect(worldSlotCount(3, 3)).toBe(90);
  });

  it('agrees with the map geometry used by the renderer', () => {
    // MainStreetMapView.mapSlotCount uses (5·cols)·(2·rows).
    for (const [cols, rows] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [3, 3]]) {
      expect(worldSlotCount(cols, rows)).toBe((5 * cols) * (2 * rows));
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

describe('toWorldPosition — city-block coordinate mapping', () => {
  it('maps street 0, row 0, slot 0 to the world origin', () => {
    expect(toWorldPosition(0, 0, 0)).toEqual({ worldX: 0, worldY: 0 });
  });

  it('maps within-street adjacency to horizontally adjacent world columns', () => {
    const p0 = toWorldPosition(0, 0, 0);
    const p1 = toWorldPosition(0, 0, 1);
    expect(p1.worldX).toBe(p0.worldX + 1);
    expect(p1.worldY).toBe(p0.worldY);
  });

  it('gives every street its own plots — neighbouring streets never co-locate', () => {
    // West street's rightmost column is world 4; east street's leftmost is world 5.
    expect(toWorldPosition(0, 0, 4)).toEqual({ worldX: 4, worldY: 0 });
    expect(toWorldPosition(1, 0, 0)).toEqual({ worldX: 5, worldY: 0 });
    expect(toWorldPosition(0, 0, 4)).not.toEqual(toWorldPosition(1, 0, 0));

    // North street's bottom row is world 1; south street's top row is world 2.
    expect(toWorldPosition(0, 0, 5)).toEqual({ worldX: 0, worldY: 1 });
    expect(toWorldPosition(0, 1, 0)).toEqual({ worldX: 0, worldY: 2 });
    expect(toWorldPosition(0, 0, 5)).not.toEqual(toWorldPosition(0, 1, 0));
  });

  it('keeps the four plots at a four-way meeting point distinct but mutually adjacent', () => {
    // The four street corners nearest the (0,0)/(1,0)/(0,1)/(1,1) meeting point.
    const west = toWorldPosition(0, 0, 9);  // world (4,1)
    const east = toWorldPosition(1, 0, 5);  // world (5,1)
    const southWest = toWorldPosition(0, 1, 4); // world (4,2)
    const southEast = toWorldPosition(1, 1, 0); // world (5,2)

    expect(west).toEqual({ worldX: 4, worldY: 1 });
    expect(east).toEqual({ worldX: 5, worldY: 1 });
    expect(southWest).toEqual({ worldX: 4, worldY: 2 });
    expect(southEast).toEqual({ worldX: 5, worldY: 2 });

    // All four positions are distinct (no shared corner plot)…
    expect(new Set([west, east, southWest, southEast].map((p) => `${p.worldX},${p.worldY}`)).size).toBe(4);
    // …but each is Chebyshev-1 adjacent to the others, so cross-street synergy
    // still works at the meeting point.
    const others = [east, southWest, southEast];
    for (const other of others) {
      expect(Math.max(Math.abs(west.worldX - other.worldX), Math.abs(west.worldY - other.worldY))).toBeLessThanOrEqual(1);
    }
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

  it('maps each world node back to exactly one owning street (no multi-owner nodes)', () => {
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        for (let slot = 0; slot < SLOTS_PER_STREET; slot++) {
          const world = toWorldPosition(sx, sy, slot);
          const owner = fromWorldPosition(world)!;
          expect(owner.streetX).toBe(sx);
          expect(owner.streetY).toBe(sy);
          expect(owner.slotIndex).toBe(slot);
        }
      }
    }
  });

  it('produces a solid rectangle with no holes or shear for a 2×2 lattice', () => {
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
    // Every cell of the 10×4 bounding rectangle is owned — no holes.
    for (let worldY = 0; worldY < 4; worldY++) {
      for (let worldX = 0; worldX < 10; worldX++) {
        expect(seen.has(`${worldX},${worldY}`)).toBe(true);
      }
    }
  });
});

// ── AC2: world indexing & adjacency ────────────────────────

describe('world indexing', () => {
  it('maps each of the four meeting-point corners to its own world index', () => {
    // Four distinct plots, each owned by one street — no shared index.
    const indices = [
      streetSlotToWorldIndex(0, 0, 9, TWO_BY_TWO),
      streetSlotToWorldIndex(1, 0, 5, TWO_BY_TWO),
      streetSlotToWorldIndex(0, 1, 4, TWO_BY_TWO),
      streetSlotToWorldIndex(1, 1, 0, TWO_BY_TWO),
    ];
    expect(indices.every((i) => i !== null)).toBe(true);
    expect(new Set(indices).size).toBe(4);
    // world (4,1) → row 1 of a 10-wide grid → index 14.
    expect(indices[0]).toBe(14);
  });

  it('round-trips world index ↔ world position for a 2×2 lattice', () => {
    const total = worldSlotCount(2, 2);
    const positions: Array<{ worldX: number; worldY: number }> = [];
    for (let index = 0; index < total; index++) {
      const pos = worldIndexToPosition(index, TWO_BY_TWO);
      expect(pos).not.toBeNull();
      positions.push(pos!);
    }
    // Row-major ordering over the 10×4 rectangle, every cell visited once.
    expect(new Set(positions.map((p) => `${p.worldX},${p.worldY}`)).size).toBe(total);
    expect(positions[0]).toEqual({ worldX: 0, worldY: 0 });
    expect(positions[total - 1]).toEqual({ worldX: 9, worldY: 3 });
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

  it('reaches across a street boundary (cross-street adjacency)', () => {
    // world (4,0) is street (0,0) slot 4; its east neighbour world (5,0) is
    // street (1,0) slot 0 — a different street, still Chebyshev-adjacent.
    const eastEdge = toWorldPosition(0, 0, 4);
    const neighbours = expandedNeighbors(eastEdge, 1).map((n) => toWorldPosition(n.streetX, n.streetY, n.slotIndex));
    expect(neighbours.some((p) => p.worldX === 5 && p.worldY === 0)).toBe(true);
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
 * Places a corner card at street (0,0)'s bottom-right plot (world 4,1) plus one
 * matching neighbour in each of the three *other* streets that meet there:
 *
 *   street (1,0) slot 0 → world (5,0)   [east]
 *   street (0,1) slot 3 → world (3,2)   [south]
 *   street (1,1) slot 0 → world (5,2)   [diagonal]
 *
 * Every neighbour is Chebyshev-1 adjacent to the corner, and no two neighbours
 * are adjacent to each other, so the corner's synergy count isolates the
 * cross-street contribution (the city-block equivalent of the old shared-corner
 * fixture).
 */
function placeCrossStreetCorner(
  grid: TestCard[],
  opts: { cornerRepBonus?: number; neighbourRepBonus?: number; cornerRep?: number } = {},
): void {
  grid[cornerPlotIndex()] = mkTestCard('cafe-1', ['retail'], 10, 0.5, opts.cornerRepBonus ?? 0, opts.cornerRep ?? 0) as TestCard;
  const neighbourSlots: Array<[number, number, number]> = [
    [1, 0, 0], // world (5,0) — east street
    [0, 1, 3], // world (3,2) — south street
    [1, 1, 0], // world (5,2) — diagonal street
  ];
  const ids = ['bakery-1', 'bookshop-1', 'gym-1'];
  neighbourSlots.forEach(([sx, sy, slot], i) => {
    const index = streetSlotToWorldIndex(sx, sy, slot, TWO_BY_TWO)!;
    grid[index] = mkTestCard(ids[i], ['retail'], 10, 0.5, opts.neighbourRepBonus ?? 0) as TestCard;
  });
}

describe('income and synergy on a 2×2 grid', () => {
  it('a corner card counts matching neighbours from three other streets', () => {
    const total = worldSlotCount(2, 2);
    const grid: TestCard[] = new Array(total).fill(null);
    const sold = new Array(total).fill(false);
    placeCrossStreetCorner(grid);

    // Corner cafe: 3 matching different-type neighbours across street
    // boundaries, 50% synergy → 3 · 10 · 0.5 = 15.
    const bonus = computeSynergyBonus(grid as unknown as Parameters<typeof computeSynergyBonus>[0], cornerPlotIndex(), 1, sold, TWO_BY_TWO);
    expect(bonus).toBe(15);
  });

  it('computeIncome totals match hand-calculated expectations on 2×2', () => {
    const total = worldSlotCount(2, 2);
    const grid: TestCard[] = new Array(total).fill(null);
    const sold = new Array(total).fill(false);
    placeCrossStreetCorner(grid);

    // Corner: 10 + 15 = 25. Each neighbour: 10 + (10·0.5·1) = 15. Total 25 + 3·15 = 70.
    const result = computeIncome(grid as unknown as Parameters<typeof computeIncome>[0], 1, undefined, sold, TWO_BY_TWO);
    expect(result.total).toBe(70);
    const cornerEntry = result.breakdown.find((b) => b.slotIndex === cornerPlotIndex())!;
    expect(cornerEntry.total).toBe(25);
    expect(result.breakdown).toHaveLength(4);
  });

  it('computeReputationPerTurn scales with synergy on 2×2 grid', () => {
    const total = worldSlotCount(2, 2);
    const grid: TestCard[] = new Array(total).fill(null);
    const sold = new Array(total).fill(false);
    placeCrossStreetCorner(grid, { cornerRepBonus: 2, neighbourRepBonus: 1, cornerRep: 3 });

    // Corner: 3 reputation/turn + 3 neighbours × 1 synergy rep = 6.
    // Each of the 3 neighbours: 0 + corner's 2 synergy rep = 2 → 6.
    // Total 6 + 6 = 12.
    const rep = computeReputationPerTurn(grid as unknown as Parameters<typeof computeReputationPerTurn>[0], sold, TWO_BY_TWO);
    expect(rep).toBe(12);
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
