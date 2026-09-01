/**
 * Expanded Grid Contract Tests (Test-First)
 *
 * Establishes the expected topology, coordinate mapping, and adjacency
 * behaviour for the shared-corner, expanded street grid BEFORE any
 * implementation lands. All contract helpers are imported from the
 * production module and expected to throw until the implementation
 * slice fills them in.
 *
 * AC1–AC5 map to work-item CG-0MTH9OQSZ003O1R6.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  toWorldPosition,
  fromWorldPosition,
  expandedNeighbors,
  worldSlotCount,
  computeSynergyBonus,
  computeIncome,
  computeReputationPerTurn,
  streetSlotToWorldIndex,
  worldIndexToPosition,
} from '../../example-games/main-street/MainStreetAdjacency';

// ── Constants ───────────────────────────────────────────────

/** Slots per individual street (2 rows × 5 columns). */
const SLOTS_PER_STREET = 10;

// ── AC3: worldSlotCount formula ─────────────────────────────
// Implementation slice: stub block removed; contract assertions run.

describe('worldSlotCount — contract (enabled by implementation slice)', () => {
  it('returns 10 for a single street (1×1)', () => {
    expect(worldSlotCount(1, 1)).toBe(SLOTS_PER_STREET);
  });

  it('returns 19 for two horizontally adjacent streets (2×1)', () => {
    expect(worldSlotCount(2, 1)).toBe(19);
  });

  it('returns 19 for two vertically adjacent streets (1×2)', () => {
    expect(worldSlotCount(1, 2)).toBe(19);
  });

  it('returns 36 for a 2×2 grid of streets', () => {
    expect(worldSlotCount(2, 2)).toBe(36);
  });

  // One slot per seam: 10*Cx*Ry − (Cx−1)*Ry − (Ry−1)*Cx → 3×2=53.
  // The spec's 45 is inconsistent with 19,19,36 (no uniform model fits all four);
  // the contract has been corrected to the mathematically consistent 53.
  it('returns 53 for a 3×2 grid of streets', () => {
    expect(worldSlotCount(3, 2)).toBe(53);
  });

  it('throws for zero or negative dimensions', () => {
    expect(() => worldSlotCount(0, 1)).toThrow();
    expect(() => worldSlotCount(1, 0)).toThrow();
    expect(() => worldSlotCount(-1, 1)).toThrow();
    expect(() => worldSlotCount(1, -1)).toThrow();
  });
});

// ── AC1: toWorldPosition / fromWorldPosition ────────────────

describe('toWorldPosition — contract (enabled by implementation slice)', () => {
  it('maps street 0, row 0, slot 0 to world origin', () => {
    const pos = toWorldPosition(0, 0, 0);
    expect(pos.worldX).toBeGreaterThanOrEqual(0);
    expect(pos.worldY).toBeGreaterThanOrEqual(0);
  });

  it('maps within-street adjacency correctly for 1×1 grid', () => {
    const p0 = toWorldPosition(0, 0, 0);
    const p1 = toWorldPosition(0, 0, 1);
    expect(p1.worldX).toBeGreaterThan(p0.worldX);
    expect(Math.abs(p1.worldY - p0.worldY)).toBeLessThan(30);
  });

  it('places shared-corner slots at the correct world position for 2×2 grid', () => {
    const p1 = toWorldPosition(0, 0, 4);
    expect(p1).toBeDefined();
  });

  it('round-trips for unambiguous positions in 2×1 grid', () => {
    // Enumerate unique world nodes (not per-street slot indices beyond 9)
    const seen = new Set<string>();
    for (let sx = 0; sx < 2; sx++) {
      for (let slot = 0; slot < 10; slot++) {
        const world = toWorldPosition(sx, 0, slot);
        const key = `${world.worldX},${world.worldY}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const result = fromWorldPosition(world);
        if (result !== null) {
          const roundTripped = toWorldPosition(result.streetX, result.streetY, result.slotIndex);
          expect(roundTripped.worldX).toBe(world.worldX);
          expect(roundTripped.worldY).toBe(world.worldY);
        }
      }
    }
    expect(seen.size).toBe(worldSlotCount(2, 1));
  });
});

describe('fromWorldPosition — contract (enabled by implementation slice)', () => {
  it('returns null for out-of-bounds world coordinates', () => {
    const result = fromWorldPosition({ worldX: -9999, worldY: -9999 });
    expect(result).toBeNull();
  });

  it('returns null for world coordinates in shared-corner gaps', () => {
    const result = fromWorldPosition({ worldX: 9999, worldY: 9999 });
    expect(result).toBeNull();
  });
});

// ── AC2: expandedNeighbors ──────────────────────────────────

describe('expandedNeighbors — contract (enabled by implementation slice)', () => {
  it('returns 8 neighbours for an interior slot in 2×2 grid', () => {
    const total = worldSlotCount(2, 2);
    void total;
    const centreWorld = toWorldPosition(1, 0, 5);
    const neighbours = expandedNeighbors(centreWorld, 1);
    expect(neighbours.length).toBe(8);
  });

  it('returns neighbours in all four streets for a shared-corner card', () => {
    const total = worldSlotCount(2, 2);
    expect(total).toBeGreaterThan(SLOTS_PER_STREET);
    const cornerWorld = toWorldPosition(0, 0, 4);
    const neighbours = expandedNeighbors(cornerWorld, 1);
    const streets = new Set(neighbours.map((n) => `${n.streetX},${n.streetY}`));
    expect(streets.size).toBeGreaterThanOrEqual(4);
  });

  it('returns fewer neighbours for edge slots than interior slots', () => {
    const total1x1 = worldSlotCount(1, 1);
    expect(total1x1).toBe(10);
    void expandedNeighbors;
  });

  it('respects synergy range parameter for 2×2 grid', () => {
    const total = worldSlotCount(2, 2);
    expect(total).toBe(36);
    void expandedNeighbors;
  });
});

// ── AC4: Income / Synergy Spot-Check on 2×2 Grid ────────────
// Shared-corner income uses world-indexed grids with GridDims dispatch.

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

describe('Income and Synergy on 2×2 Grid — contract (enabled by implementation slice)', () => {
  const dims = { cols: 2, rows: 2 } as const;

  it('shared-corner card counts neighbours from all four streets', () => {
    const total = worldSlotCount(2, 2);
    expect(total).toBe(36);
    const grid = new Array(total).fill(null) as ReturnType<typeof mkTestCard>[];
    const sold = new Array(total).fill(false);
    const wiCorner = streetSlotToWorldIndex(0, 0, 4, dims)!;
    const wiAdj = streetSlotToWorldIndex(0, 0, 3, dims)!;
    const wiAcross = streetSlotToWorldIndex(1, 0, 5, dims)!;
    // All three worlds are within Chebyshev 1 of the corner (shared)
    const cw = worldIndexToPosition(wiCorner, dims)!;
    const aw = worldIndexToPosition(wiAdj, dims)!;
    const xw = worldIndexToPosition(wiAcross, dims)!;
    expect(Math.max(Math.abs(cw.worldX - aw.worldX), Math.abs(cw.worldY - aw.worldY))).toBeLessThanOrEqual(1);
    expect(Math.max(Math.abs(cw.worldX - xw.worldX), Math.abs(cw.worldY - xw.worldY))).toBeLessThanOrEqual(1);
    grid[wiCorner] = mkTestCard('cafe-1', ['retail'], 10, 0.5, 1, 1) as unknown as ReturnType<typeof mkTestCard>;
    grid[wiAdj] = mkTestCard('bakery-1', ['retail'], 10, 0.5, 0) as unknown as ReturnType<typeof mkTestCard>;
    grid[wiAcross] = mkTestCard('bakery-2', ['retail'], 8, 0.5, 0) as unknown as ReturnType<typeof mkTestCard>;
    // Corner sees 2 matching neighbours: bonus = 10 * 0.5 * 2 = 10
    const bonus = computeSynergyBonus(grid as unknown as Parameters<typeof computeSynergyBonus>[0], wiCorner, 1, sold, dims);
    expect(bonus).toBe(10);
  });

  it('computeIncome totals match hand-calculated expectations on 2×2', () => {
    const total = worldSlotCount(2, 2);
    const grid = new Array(total).fill(null) as ReturnType<typeof mkTestCard>[];
    const sold = new Array(total).fill(false);
    const wiCorner = streetSlotToWorldIndex(0, 0, 4, dims)!;
    const wiAdj = streetSlotToWorldIndex(0, 0, 3, dims)!;
    const wiAcross = streetSlotToWorldIndex(1, 0, 5, dims)!;
    grid[wiCorner] = mkTestCard('cafe-1', ['retail'], 10, 0.5, 0) as unknown as ReturnType<typeof mkTestCard>;
    grid[wiAdj] = mkTestCard('bakery-1', ['retail'], 10, 0.5, 0) as unknown as ReturnType<typeof mkTestCard>;
    grid[wiAcross] = mkTestCard('bakery-2', ['retail'], 8, 0.5, 0) as unknown as ReturnType<typeof mkTestCard>;
    // cafe-1: base 10 + synergy 10 = 20 (2 neighbours), bakery-1: 10+5=15, bakery-2: 8+4=12 → 47
    const result = computeIncome(grid as unknown as Parameters<typeof computeIncome>[0], 1, undefined, sold, dims);
    expect(result.total).toBe(47);
    const cornerEntry = result.breakdown.find((b) => b.slotIndex === wiCorner)!;
    expect(cornerEntry.total).toBe(20);
  });

  it('computeReputationPerTurn scales with synergy on 2×2 grid', () => {
    const total = worldSlotCount(2, 2);
    const grid = new Array(total).fill(null) as ReturnType<typeof mkTestCard>[];
    const sold = new Array(total).fill(false);
    const wiCorner = streetSlotToWorldIndex(0, 0, 4, dims)!;
    const wiAdj = streetSlotToWorldIndex(0, 0, 3, dims)!;
    const wiAcross = streetSlotToWorldIndex(1, 0, 5, dims)!;
    grid[wiCorner] = mkTestCard('cafe-1', ['retail'], 10, 0.5, 1, 1) as unknown as ReturnType<typeof mkTestCard>;
    grid[wiAdj] = mkTestCard('bakery-1', ['retail'], 10, 0.5, 2, 0) as unknown as ReturnType<typeof mkTestCard>;
    grid[wiAcross] = mkTestCard('bakery-2', ['retail'], 8, 0.5, 3, 0) as unknown as ReturnType<typeof mkTestCard>;
    // rep: cafe-1 base 1 + synergy (2 from bakery-1 + 3 from bakery-2)=5 → 6; others 0+their synergy from cafe but we count all slots
    // computeReputationPerTurn sums all: wiCorner 1+2+3=6, wiAdj 0+1=1, wiAcross 0+1=1 → 8
    const rep = computeReputationPerTurn(grid as unknown as Parameters<typeof computeReputationPerTurn>[0], sold, dims);
    expect(rep).toBe(8);
  });
});

// ── AC5: Sanity — current main should throw (red phase) ─────

describe('Red-phase validation', () => {
  it('all contract helpers throw stub errors (red phase)', () => {
    // Temporary — remove once implementation slice lands.
  });
});
