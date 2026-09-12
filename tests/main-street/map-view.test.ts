/**
 * Unit tests for the Main Street street-map camera view
 * (CG-0MTH9OVMC001V44E — "Camera zoom controls (map-like)").
 *
 * The map view is a pure geometry/camera module: it maps the 2×5 street
 * lattice to pixels, computes which street cells/slots are inside the
 * viewport at the current zoom/pan, and converts between map-local and
 * screen coordinates for input hit-testing. These tests pin the two
 * acceptance criteria that are testable headless:
 *
 *  - AC2: zoom level 1 reproduces the legacy 10-slot framing exactly;
 *          zoom level 2 reveals at least one ring of neighbouring streets.
 *  - AC3: map ↔ screen conversion round-trips so pointer hit-testing can be
 *          mapped through the camera transform.
 *
 * @module tests/main-street/map-view
 */

import { describe, it, expect } from 'vitest';

import {
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  clampStreetCamera,
  clampZoomLevel,
  defaultStreetCamera,
  mapCellOrigin,
  mapSlotCenter,
  mapSlotCount,
  screenToLocal,
  localToScreen,
  containerTransform,
  panStreetCamera,
  streetPixelHeight,
  streetPixelWidth,
  streetViewportRect,
  visibleMapSlots,
  zoomInLevel,
  zoomOutLevel,
  zoomScale,
} from '../../example-games/main-street/MainStreetMapView';
import type { SceneLayout } from '../../example-games/main-street/scenes/MainStreetConstants';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

const layout: SceneLayout = computeMainStreetLayoutWithSll();

/** Legacy framing reference: row-major 2×5 slot rects (pre-camera layout). */
function legacySlotRect(slotIndex: number): { x: number; y: number } {
  const col = slotIndex % layout.streetCols;
  const row = Math.floor(slotIndex / layout.streetCols);
  return {
    x: layout.streetX + col * (layout.slotW + layout.slotGap),
    y: layout.streetTop + row * (layout.slotH + layout.streetRowGap),
  };
}

const SINGLE: { cols: number; rows: number } = { cols: 1, rows: 1 };
const RING: { cols: number; rows: number } = { cols: 3, rows: 3 };

describe('zoom levels', () => {
  it('starts at 1× and is always adjustable (never gated)', () => {
    expect(clampZoomLevel(MIN_ZOOM_LEVEL)).toBe(1);
    expect(zoomScale(1)).toBe(1);
    expect(zoomOutLevel(1)).toBe(2);
    expect(zoomInLevel(2)).toBe(1);
  });

  it('clamps zoom to the supported range', () => {
    expect(clampZoomLevel(0)).toBe(MIN_ZOOM_LEVEL);
    expect(clampZoomLevel(-5)).toBe(MIN_ZOOM_LEVEL);
    expect(clampZoomLevel(MAX_ZOOM_LEVEL + 3)).toBe(MAX_ZOOM_LEVEL);
    // Fractional requests round to the nearest level.
    expect(clampZoomLevel(2.4)).toBe(2);
    expect(clampZoomLevel(NaN)).toBe(MIN_ZOOM_LEVEL);
  });

  it('never zooms past the ends of the range', () => {
    expect(zoomOutLevel(MAX_ZOOM_LEVEL)).toBe(MAX_ZOOM_LEVEL);
    expect(zoomInLevel(MIN_ZOOM_LEVEL)).toBe(MIN_ZOOM_LEVEL);
  });

  it('derives a map scale that shrinks as the level grows (map zoom-out)', () => {
    expect(zoomScale(2)).toBeCloseTo(0.5, 5);
    expect(zoomScale(3)).toBeCloseTo(1 / 3, 5);
  });
});

describe('viewport and 1× framing (AC2)', () => {
  it('clips the map to the street band without covering the HUD', () => {
    const viewport = streetViewportRect(layout);
    expect(viewport.w).toBe(layout.streetCols * layout.slotW + (layout.streetCols - 1) * layout.slotGap);
    expect(viewport.x).toBe(layout.streetX);
    // The viewport bottom must sit above the player hand row.
    expect(viewport.y + viewport.h).toBeLessThanOrEqual(layout.handY);
    // ...and must not reach into the market row above.
    expect(viewport.y).toBeGreaterThan(layout.marketTop);
  });

  it('produces an identity container transform at 1× for a single street', () => {
    const camera = defaultStreetCamera(layout);
    const transform = containerTransform(camera, layout);
    expect(transform.scale).toBe(1);
    expect(transform.x).toBe(0);
    expect(transform.y).toBe(0);
  });

  it('renders the same 10 slot rects as the pre-camera layout at 1×', () => {
    const camera = defaultStreetCamera(layout);
    const nodes = visibleMapSlots(camera, layout, SINGLE);
    expect(nodes).toHaveLength(10);
    nodes.forEach((node, i) => {
      expect(node.gameplayIndex).toBe(i);
      const legacy = legacySlotRect(i);
      expect(node.localX).toBe(legacy.x);
      expect(node.localY).toBe(legacy.y);
    });
  });
});

describe('multi-street lattice and zoom-out reveal (AC2)', () => {
  it('reports the unique slot count of a lattice (shared seam de-duplicated)', () => {
    expect(mapSlotCount(SINGLE)).toBe(10);
    // 3 streets wide share 2 seam columns; 3 streets tall share 2 seam rows.
    expect(mapSlotCount({ cols: 3, rows: 3 })).toBe(13 * 4);
  });

  it('keeps neighbouring streets hidden at 1× (culling)', () => {
    const camera = defaultStreetCamera(layout);
    const nodes = visibleMapSlots(camera, layout, RING);
    expect(nodes).toHaveLength(10);
    expect(nodes.every((n) => n.cellX === 1 && n.cellY === 1)).toBe(true);
    expect(nodes.every((n) => n.gameplayIndex !== null)).toBe(true);
  });

  it('reveals at least one ring of neighbouring streets at zoom level 2', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, RING);
    const nodes = visibleMapSlots(camera, layout, RING);
    expect(nodes.length).toBeGreaterThan(10);

    const neighbourCells = new Set(
      nodes.filter((n) => n.cellX !== 1 || n.cellY !== 1).map((n) => `${n.cellX},${n.cellY}`),
    );
    // A full ring of 8 neighbouring street cells is at least partially visible.
    expect(neighbourCells.size).toBe(8);
    // Neighbouring streets are view-only: they carry no gameplay slot yet.
    expect(nodes.some((n) => n.gameplayIndex === null)).toBe(true);
  });

  it('de-duplicates shared seam slots and lets the gameplay street own them', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, RING);
    const nodes = visibleMapSlots(camera, layout, RING);
    const keys = nodes.map((n) => `${n.localX},${n.localY}`);
    expect(new Set(keys).size).toBe(keys.length);

    // The centre street's right-hand column is shared with its east
    // neighbour; the playable owner must win the de-duplication.
    const sharedColumn = nodes.filter(
      (n) =>
        (n.localX === layout.streetX + (layout.streetCols - 1) * (layout.slotW + layout.slotGap)) &&
        n.gameplayIndex !== null,
    );
    expect(sharedColumn).toHaveLength(2);
  });

  it('anchors neighbouring street cells to the shared seam (no gaps)', () => {
    const east = mapCellOrigin(2, 1, layout, RING);
    const centre = mapCellOrigin(1, 1, layout, RING);
    // Neighbouring streets share one slot column, so they step by
    // (STREET_COLS - 1) columns rather than a full street width.
    expect(east.x - centre.x).toBe((layout.streetCols - 1) * (layout.slotW + layout.slotGap));
    const south = mapCellOrigin(1, 2, layout, RING);
    expect(south.y - centre.y).toBe((2 - 1) * (layout.slotH + layout.streetRowGap));
  });
});

describe('panning and clamping', () => {
  it('leaves a single-street map untouched when zoomed out (map fits the viewport)', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, SINGLE);
    const viewport = streetViewportRect(layout);
    expect(camera.focusX).toBeCloseTo(viewport.x + viewport.w / 2, 5);
    expect(camera.focusY).toBeCloseTo(viewport.y + viewport.h / 2, 5);
  });

  it('cannot pan a fitted map off the viewport', () => {
    const camera = panStreetCamera(defaultStreetCamera(layout), 500, 300, layout, SINGLE);
    const transform = containerTransform(camera, layout);
    expect(transform.x).toBe(0);
    expect(transform.y).toBe(0);
  });

  it('pans a zoomed-out lattice and clamps the focus inside the map bounds', () => {
    // At zoom level 2 the 3×3 map (≈2060px wide) is larger than the
    // viewport, so horizontal panning is allowed but clamped to the map.
    const start = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, RING);
    const panned = panStreetCamera(start, 10_000, -10_000, layout, RING);
    const maxX = mapCellOrigin(2, 2, layout, RING).x + streetPixelWidth(layout);
    const halfW = streetViewportRect(layout).w / (2 * zoomScale(2));
    expect(panned.focusX).toBeLessThanOrEqual(maxX - halfW + 0.001);
    // The camera actually moved from its clamped start position.
    expect(panned.focusX).toBeGreaterThan(start.focusX);
    // Vertically the map fits the viewport, so the focus stays centred.
    const viewport = streetViewportRect(layout);
    expect(panned.focusY).toBeCloseTo(viewport.y + viewport.h / 2, 5);
  });

  it('clamps vertical panning for a tall lattice', () => {
    const TALL = { cols: 1, rows: 5 };
    const start = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, TALL);
    const panned = panStreetCamera(start, 0, 10_000, layout, TALL);
    const maxY = mapCellOrigin(0, 4, layout, TALL).y + streetPixelHeight(layout);
    const halfH = streetViewportRect(layout).h / (2 * zoomScale(2));
    expect(panned.focusY).toBeLessThanOrEqual(maxY - halfH + 0.001);
    expect(panned.focusY).toBeGreaterThan(start.focusY);
  });
});

describe('screen ↔ map conversion (AC3)', () => {
  it('maps a zoomed and panned slot centre to screen and back', () => {
    const camera = clampStreetCamera(
      panStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, 120, 40, layout, RING),
      layout,
      RING,
    );
    const local = mapSlotCenter(1, 1, 7, layout, RING);
    const screen = localToScreen(local, camera, layout);
    const back = screenToLocal(screen, camera, layout);
    expect(back.x).toBeCloseTo(local.x, 5);
    expect(back.y).toBeCloseTo(local.y, 5);
  });

  it('keeps slot hit-testing inside the slot rect after zooming out', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, SINGLE);
    const viewport = streetViewportRect(layout);
    const centre = mapSlotCenter(0, 0, 4, layout, SINGLE);
    const screen = localToScreen(centre, camera, layout);
    const scale = zoomScale(camera.zoomLevel);
    const halfSlotW = (layout.slotW / 2) * scale;
    const halfSlotH = (layout.slotH / 2) * scale;
    expect(screen.x).toBeGreaterThanOrEqual(viewport.x);
    expect(screen.x).toBeLessThanOrEqual(viewport.x + viewport.w);
    // The slot is scaled about the viewport centre, so its screen half-size scales too.
    const local = screenToLocal({ x: screen.x + halfSlotW * 0.9, y: screen.y + halfSlotH * 0.9 }, camera, layout);
    expect(Math.abs(local.x - centre.x)).toBeLessThan(layout.slotW / 2);
    expect(Math.abs(local.y - centre.y)).toBeLessThan(layout.slotH / 2);
  });
});
