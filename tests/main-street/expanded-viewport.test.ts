/**
 * Expanded-viewport rendering & cross-street interaction
 * (CG-0MTH9OW0H0005VKE; re-modelled as a city-block grid in CG-0MT5Y1X5T001M4S6).
 *
 * Headless tests for the geometry that makes expanded street lattices
 * *playable* (not just view-only):
 *
 *  - AC1: every visible slot of the playable lattice carries a gameplay index,
 *    each street owns its own plots (nothing is shared or de-duplicated), and
 *    every rendered plot resolves to a unique world index.
 *  - AC2: a corner plot's neighbours span the adjacent streets across the road,
 *    and synergy-line geometry can be resolved from explicit world-index
 *    centres so lines cross street boundaries (and the road).
 *  - AC4: slots outside the camera viewport are not instantiated.
 *
 * @module tests/main-street/expanded-viewport
 */

import { describe, it, expect } from 'vitest';

import {
  clampStreetCamera,
  defaultStreetCamera,
  latticeWorldHeight,
  latticeWorldWidth,
  playableIndexToMapCenter,
  roadBandX,
  roadBandY,
  visibleMapSlots,
  worldIndexToMapCenter,
} from '../../example-games/main-street/MainStreetMapView';
import { worldSlotCount } from '../../example-games/main-street/MainStreetAdjacency';
import type { SceneLayout } from '../../example-games/main-street/scenes/MainStreetConstants';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

const layout: SceneLayout = computeMainStreetLayoutWithSll();

/** A camera zoomed out far enough that the whole lattice fits the viewport. */
function framingTheWholeLattice(cols: number, rows: number) {
  return clampStreetCamera(
    { ...defaultStreetCamera(layout), zoomLevel: 4 },
    layout,
    { cols, rows },
  );
}

describe('city-block lattice dimensions (map view agrees with the adjacency model)', () => {
  it('derives the same world dimensions as worldSlotCount', () => {
    for (const [cols, rows] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 3]]) {
      expect(latticeWorldWidth(cols) * latticeWorldHeight(rows)).toBe(
        worldSlotCount(cols, rows),
      );
    }
  });

  it('maps the world index grid to unique pixel centres (no two plots coincide)', () => {
    const dims = { cols: 2, rows: 2 };
    const seen = new Set<string>();
    for (let i = 0; i < worldSlotCount(dims.cols, dims.rows); i++) {
      const centre = worldIndexToMapCenter(i, layout, dims);
      seen.add(`${centre.x},${centre.y}`);
    }
    expect(seen.size).toBe(worldSlotCount(dims.cols, dims.rows));
  });
});

describe('playable lattice rendering (AC1)', () => {
  it('assigns a unique gameplay index to every visible slot of a playable 2×1 lattice', () => {
    const dims = { cols: 2, rows: 1 };
    const nodes = visibleMapSlots(framingTheWholeLattice(2, 1), layout, dims, dims);
    expect(nodes.length).toBe(worldSlotCount(2, 1));

    const indices = nodes.map((n) => n.gameplayIndex);
    expect(indices.every((i) => i !== null)).toBe(true);
    const unique = new Set(indices);
    expect(unique.size).toBe(nodes.length);
    // World indices are contiguous 0..N-1 (nothing dropped).
    expect([...unique].sort((a, b) => (a as number) - (b as number))).toEqual(
      Array.from({ length: nodes.length }, (_, i) => i),
    );
  });

  it('renders every street-owned plot exactly once — no plot is shared or de-duplicated', () => {
    const dims = { cols: 2, rows: 1 };
    const nodes = visibleMapSlots(framingTheWholeLattice(2, 1), layout, dims, dims);

    // Cell (0,0) slot 4 and cell (1,0) slot 0 are DIFFERENT plots now: world
    // (4,0) and world (5,0). Both must be rendered.
    const fromWest = nodes.filter((n) => n.cellX === 0 && n.slotIndex === 4);
    const fromEast = nodes.filter((n) => n.cellX === 1 && n.slotIndex === 0);
    expect(fromWest).toHaveLength(1);
    expect(fromEast).toHaveLength(1);
    expect(fromWest[0].gameplayIndex).toBe(4); // world (4,0) → 0*10 + 4
    expect(fromEast[0].gameplayIndex).toBe(5); // world (5,0) → 0*10 + 5
    // The east street starts one plot width plus the road band to the right.
    expect(fromEast[0].localX - fromWest[0].localX).toBeCloseTo(layout.slotW + roadBandX(layout), 5);
  });

  it('keeps the four meeting-point corners as four distinct plots (2×2)', () => {
    const dims = { cols: 2, rows: 2 };
    const nodes = visibleMapSlots(framingTheWholeLattice(2, 2), layout, dims, dims);
    expect(nodes.length).toBe(worldSlotCount(2, 2));

    // The four street corners nearest the meeting point are separate plots with
    // separate world indices (14, 15, 24, 25) — nothing collapses.
    const cornerOwners: Array<[number, number, number, number]> = [
      [0, 0, 9, 14],
      [1, 0, 5, 15],
      [0, 1, 4, 24],
      [1, 1, 0, 25],
    ];
    const cornerNodes = nodes.filter((n) =>
      cornerOwners.some(([cx, cy, slot]) => n.cellX === cx && n.cellY === cy && n.slotIndex === slot),
    );
    expect(cornerNodes).toHaveLength(4);
    expect(new Set(cornerNodes.map((n) => n.gameplayIndex)).size).toBe(4);
    expect(cornerNodes.map((n) => n.gameplayIndex).sort((a, b) => (a as number) - (b as number)))
      .toEqual([14, 15, 24, 25]);
  });

  it('resolves explicit world-index centres across a road so synergy lines can cross streets (AC2)', () => {
    const dims = { cols: 2, rows: 2 };
    // Corner of street (0,0): world (4,1) → index 1*10 + 4 = 14.
    const corner = worldIndexToMapCenter(14, layout, dims);
    // A neighbour in the street below: world (3,2) → index 2*10 + 3 = 23.
    const far = worldIndexToMapCenter(23, layout, dims);
    expect(far.x).toBeLessThan(corner.x);
    expect(far.y).toBeGreaterThan(corner.y);
    // Vertical separation spans the road band, so it is LARGER than the
    // within-street row pitch — the synergy line crosses the road.
    const rowPitch = layout.slotH + layout.streetRowGap;
    expect(far.y - corner.y).toBeCloseTo(layout.slotH + roadBandY(layout), 5);
    expect(far.y - corner.y).toBeGreaterThan(rowPitch);
    // The horizontal separation is one plain plot pitch (same street column).
    expect(Math.abs(corner.x - far.x)).toBeCloseTo(layout.slotW + layout.slotGap, 5);
  });
});

describe('viewport culling (AC4)', () => {
  it('does not instantiate slots outside the visible rect', () => {
    const dims = { cols: 3, rows: 3 };
    // At 1× only the playable centre cell is framed.
    const nodes = visibleMapSlots(defaultStreetCamera(layout), layout, dims, { cols: 1, rows: 1 });
    expect(nodes).toHaveLength(10);
    expect(nodes.every((n) => n.cellX === 1 && n.cellY === 1)).toBe(true);
  });

  it('reveals more plots as the map zooms out', () => {
    const dims = { cols: 3, rows: 3 };
    const at1x = visibleMapSlots(defaultStreetCamera(layout), layout, dims, dims);
    const at2x = visibleMapSlots(
      clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, dims),
      layout,
      dims,
    );
    expect(at2x.length).toBeGreaterThan(at1x.length);
  });
});

describe('cross-street hit-testing geometry', () => {
  it('keeps a playable index inside the displayed map for every lattice size', () => {
    const view = { cols: 3, rows: 3 };
    const gameplay = { cols: 2, rows: 2 };
    // The playable sub-lattice sits at the map's gameplay origin cell.
    for (let i = 0; i < worldSlotCount(gameplay.cols, gameplay.rows); i++) {
      const centre = playableIndexToMapCenter(i, layout, view, gameplay);
      expect(Number.isFinite(centre.x)).toBe(true);
      expect(Number.isFinite(centre.y)).toBe(true);
    }
  });

  it('places the 1×1 playable board in the centre cell of a 3×3 view', () => {
    const view = { cols: 3, rows: 3 };
    const gameplay = { cols: 1, rows: 1 };
    // Index 0 is the top-left of the centre street cell.
    const origin = playableIndexToMapCenter(0, layout, view, gameplay);
    expect(origin.x).toBe(layout.streetX + layout.slotW / 2);
    expect(origin.y).toBe(layout.streetTop + layout.slotH / 2);
  });
});
