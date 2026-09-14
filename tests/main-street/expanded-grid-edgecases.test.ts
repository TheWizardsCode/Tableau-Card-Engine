/**
 * Expanded street lattice — edge cases & hardening (CG-0MTH9OWT3001JJ9D).
 *
 * Covers the boundary conditions that the earlier expanded-grid slices do not:
 *
 *  - AC3a: 3×3 and 5×5 world sizes — planar coverage and the `worldSlotCount`
 *           formula at the maximum supported lattice.
 *  - AC3b: selling a shared-corner card preserves the sold-anchor behaviour
 *           (the sold card earns nothing, its neighbours keep its synergy).
 *  - AC3c: a card placed **from hand** onto a shared corner earns the correct
 *           cross-street synergy bonus.
 *  - AC3d: layout / SLL bounds at minimum and maximum zoom.
 *
 * @module tests/main-street/expanded-grid-edgecases
 */

import { describe, it, expect } from 'vitest';

import {
  computeBusinessIncome,
  computeSynergyBonus,
  streetSlotToWorldIndex,
  toWorldPosition,
  worldIndexToPosition,
  worldSlotCount,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  clampStreetCamera,
  containerTransform,
  defaultStreetCamera,
  mapBounds,
  panStreetCamera,
  streetViewportRect,
  visibleLocalRect,
  zoomScale,
} from '../../example-games/main-street/MainStreetMapView';
import {
  setStreetGridLattice,
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { playBusinessFromHand } from '../../example-games/main-street/MainStreetMarket';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';
import type { SceneLayout } from '../../example-games/main-street/scenes/MainStreetConstants';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

const layout: SceneLayout = computeMainStreetLayoutWithSll();

type AnyCard = BusinessCard | CommunitySpaceCard | null;

function mkCard(
  id: string,
  synergyTypes: string[],
  baseIncome = 10,
  synergyCoinBonus = 0.5,
  synergyRepBonus = 0,
): BusinessCard {
  return {
    family: 'business',
    id,
    name: id,
    cost: 1,
    baseIncome,
    incomeBonus: 0,
    synergyTypes,
    synergyCoinBonus,
    synergyRepBonus,
    synergyRangeBonus: 0,
    reputationPerTurn: 0,
    reputationBonus: 0,
    maxLevel: 1,
    description: '',
    level: 0,
    ongoingCost: 0,
  } as BusinessCard;
}

/** Four-street neighbour set of the 2×2 shared corner (world 4,1 → index 13). */
const CORNER = 13;
const CORNER_NEIGHBOURS = [3, 5, 21, 23]; // streets (0,0), (1,0), (0,1), (1,1)

describe('3×3 and 5×5 world sizes (AC3a)', () => {
  it('uses the documented worldSlotCount formula at both sizes', () => {
    expect(worldSlotCount(3, 3)).toBe(13 * 4); // 52
    expect(worldSlotCount(5, 5)).toBe(21 * 6); // 126 — the maximum supported lattice
  });

  it('covers a solid rectangle for 3×3 (no holes, no duplicates)', () => {
    const seen = new Set<string>();
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        for (let slot = 0; slot < 10; slot++) {
          const { worldX, worldY } = toWorldPosition(sx, sy, slot);
          seen.add(`${worldX},${worldY}`);
        }
      }
    }
    expect(seen.size).toBe(worldSlotCount(3, 3));
    expect(seen.size).toBe(13 * 4);
    for (let worldY = 0; worldY < 4; worldY++) {
      for (let worldX = 0; worldX < 13; worldX++) {
        expect(seen.has(`${worldX},${worldY}`)).toBe(true);
      }
    }
  });

  it('maps every 5×5 world slot to a distinct position and back', () => {
    const dims = { cols: 5, rows: 5 };
    const total = worldSlotCount(5, 5);
    const positions = new Set<string>();
    for (let i = 0; i < total; i++) {
      const pos = worldIndexToPosition(i, dims);
      expect(pos).not.toBeNull();
      positions.add(`${pos!.worldX},${pos!.worldY}`);
    }
    expect(positions.size).toBe(total);

    // A corner street slot round-trips through the world index.
    const idx = streetSlotToWorldIndex(4, 4, 9, dims);
    expect(idx).toBe(worldSlotCount(5, 5) - 1);
  });
});

describe('selling a shared-corner card (AC3b)', () => {
  function cornerScenario(): {
    grid: AnyCard[];
    sold: boolean[];
  } {
    const grid: AnyCard[] = new Array(worldSlotCount(2, 2)).fill(null);
    const sold = new Array<boolean>(worldSlotCount(2, 2)).fill(false);
    grid[CORNER] = mkCard('cafe-1', ['retail'], 10, 0.5);
    CORNER_NEIGHBOURS.forEach((idx, i) => {
      grid[idx] = mkCard(`neighbour-${i + 1}`, ['retail'], 10, 0.5);
    });
    return { grid, sold };
  }

  it('gives the sold shared-corner card zero income but keeps it a synergy anchor', () => {
    const { grid, sold } = cornerScenario();
    const dims = { cols: 2, rows: 2 };

    const neighbourBefore = computeBusinessIncome(grid as never, CORNER_NEIGHBOURS[0], 1, sold, dims);
    const cornerBefore = computeBusinessIncome(grid as never, CORNER, 1, sold, dims);
    expect(cornerBefore).toBe(30); // 10 base + roundInt(10 × 0.5 × 4 neighbours) = 30

    sold[CORNER] = true;

    // The sold card itself earns nothing…
    expect(computeBusinessIncome(grid as never, CORNER, 1, sold, dims)).toBe(0);
    // …but a neighbour keeps receiving its synergy (sold cards remain anchors).
    expect(computeBusinessIncome(grid as never, CORNER_NEIGHBOURS[0], 1, sold, dims)).toBe(neighbourBefore);
    expect(computeSynergyBonus(grid as never, CORNER_NEIGHBOURS[0], 1, sold, dims)).toBeGreaterThan(0);

    // Every neighbour across all four streets keeps the anchor's synergy.
    for (const idx of CORNER_NEIGHBOURS) {
      expect(computeSynergyBonus(grid as never, idx, 1, sold, dims)).toBeGreaterThan(0);
    }
  });
});

describe('hand placement on a shared corner (AC3c)', () => {
  function expandedStateWithCornerNeighbour(): MainStreetState {
    const state = setupMainStreetGame({ seed: 'shared-corner-hand-place' });
    setStreetGridLattice(state, 2, 2);
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1000;
    // A matching neighbour in the (0,0) street (world 3,0 → index 3).
    state.streetGrid[3] = mkCard('bakery-1', ['retail'], 10, 0.5);
    // A hand card sharing the synergy type but a different base type.
    state.hand = [mkCard('cafe-1', ['retail'], 10, 0.5)];
    return state;
  }

  it('applies the cross-street synergy bonus to the card placed from hand', () => {
    // Control: the same card placed with no neighbour earns base income only.
    const alone = expandedStateWithCornerNeighbour();
    alone.streetGrid[3] = null;
    playBusinessFromHand(alone, 0, CORNER);
    const plain = alone.streetGrid[CORNER]!.currentIncome!;
    expect(plain).toBe(10); // base income, no synergy

    // With a matching neighbour across the seam the placed card gains synergy.
    const state = expandedStateWithCornerNeighbour();
    const card = playBusinessFromHand(state, 0, CORNER);

    expect(card.card.id).toBe('cafe-1');
    expect(state.streetGrid[CORNER]?.id).toBe('cafe-1');
    const boosted = state.streetGrid[CORNER]!.currentIncome!;
    expect(boosted).toBeGreaterThan(plain);
    // The neighbour is adjacent to the new corner card, so it gains synergy too.
    expect(state.streetGrid[3]!.currentIncome!).toBeGreaterThan(10);
  });
});

describe('layout / SLL bounds at minimum and maximum zoom (AC3d)', () => {
  const viewport = streetViewportRect(layout);

  it('frames the legacy street exactly at minimum zoom for a 1×1 lattice', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: MIN_ZOOM_LEVEL }, layout, { cols: 1, rows: 1 });
    const transform = containerTransform(camera, layout);
    expect(zoomScale(MIN_ZOOM_LEVEL)).toBe(1);
    expect(transform).toEqual({ scale: 1, x: 0, y: 0 });

    // The street band fully contains the 1×1 map (framing shows the whole street).
    const visible = visibleLocalRect(camera, layout);
    const bounds = mapBounds(layout, { cols: 1, rows: 1 });
    expect(visible.left).toBeLessThanOrEqual(bounds.left + 0.001);
    expect(visible.right).toBeGreaterThanOrEqual(bounds.right - 0.001);
    expect(visible.top).toBeLessThanOrEqual(bounds.top + 0.001);
    expect(visible.bottom).toBeGreaterThanOrEqual(bounds.bottom - 0.001);
  });

  it('contains a small map at maximum zoom and keeps the transform finite', () => {
    const dims = { cols: 1, rows: 1 };
    const camera = clampStreetCamera(
      { ...defaultStreetCamera(layout), zoomLevel: MAX_ZOOM_LEVEL },
      layout,
      dims,
    );
    expect(Number.isFinite(camera.focusX)).toBe(true);
    expect(Number.isFinite(camera.focusY)).toBe(true);
    expect(zoomScale(MAX_ZOOM_LEVEL)).toBeCloseTo(1 / MAX_ZOOM_LEVEL, 5);

    const transform = containerTransform(camera, layout);
    expect(Number.isFinite(transform.scale)).toBe(true);
    expect(Number.isFinite(transform.x)).toBe(true);
    expect(Number.isFinite(transform.y)).toBe(true);
    expect(transform.scale).toBeGreaterThan(0);

    // A map smaller than the viewport is centred and fully framed.
    const visible = visibleLocalRect(camera, layout);
    const bounds = mapBounds(layout, dims);
    expect(visible.left).toBeLessThanOrEqual(bounds.left + 0.001);
    expect(visible.right).toBeGreaterThanOrEqual(bounds.right - 0.001);
  });

  it('clamps panning inside the map bounds at maximum zoom for 5×5', () => {
    const dims = { cols: 5, rows: 5 };
    const scale = zoomScale(MAX_ZOOM_LEVEL);
    const halfW = viewport.w / (2 * scale);
    const bounds = mapBounds(layout, dims);

    const start = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: MAX_ZOOM_LEVEL }, layout, dims);
    const panned = panStreetCamera(start, 100_000, 100_000, layout, dims);

    expect(Number.isFinite(panned.focusX)).toBe(true);
    expect(panned.focusX).toBeLessThanOrEqual(bounds.right - halfW + 0.001);
    expect(panned.focusX).toBeGreaterThanOrEqual(bounds.left + halfW - 0.001);

    // With the map wider than the street band, the visible window never escapes
    // the map horizontally.
    const visible = visibleLocalRect(panned, layout);
    expect(visible.left).toBeGreaterThanOrEqual(bounds.left - 0.001);
    expect(visible.right).toBeLessThanOrEqual(bounds.right + 0.001);
  });
});
