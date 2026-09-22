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
  mapBounds,
  mapCellOrigin,
  mapCellStepX,
  mapSlotCenter,
  mapSlotCount,
  mapRoadBands,
  roadBandX,
  screenToLocal,
  localToScreen,
  containerTransform,
  panStreetCamera,
  streetPixelWidth,
  streetViewportRect,
  visibleLocalRect,
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
  it('clips the map to the street band (street + road ring) without covering the HUD', () => {
    const viewport = streetViewportRect(layout);
    // The band is the street's plot area plus one road band on every side, so
    // the whole road ring is visible at the default zoom (CG-0MT5Y1X5T001M4S6).
    expect(viewport.w).toBe(
      layout.streetCols * layout.slotW + (layout.streetCols - 1) * layout.slotGap + 2 * roadBandX(layout),
    );
    expect(viewport.x).toBe(layout.streetX - roadBandX(layout));
    // The whole band is on-canvas...
    expect(viewport.x).toBeGreaterThanOrEqual(0);
    expect(viewport.y).toBeGreaterThanOrEqual(0);
    expect(viewport.x + viewport.w).toBeLessThanOrEqual(layout.gameW);
    expect(viewport.y + viewport.h).toBeLessThanOrEqual(layout.gameH);
    // ...and never reaches the HUD: above the hand row, below the market, and
    // clear of the right-hand column.
    expect(viewport.y + viewport.h).toBeLessThanOrEqual(layout.handY);
    expect(viewport.y).toBeGreaterThan(layout.marketTop);
    expect(viewport.x + viewport.w).toBeLessThanOrEqual(layout.logX);
  });

  it('shows the whole road ring around the street at the default 1× framing', () => {
    const camera = defaultStreetCamera(layout);
    const viewport = streetViewportRect(layout);
    const bands = mapRoadBands(layout, SINGLE);
    expect(bands).toHaveLength(4); // left/right + top/bottom for a 1×1 lattice

    // With the identity 1× transform, every road band lies fully inside the
    // clipped street band — so a whole road (grey + dashed centre line) is
    // visible on each of the four edges.
    const transform = containerTransform(camera, layout);
    expect(transform).toEqual({ scale: 1, x: 0, y: 0 });
    for (const band of bands) {
      expect(band.x).toBeGreaterThanOrEqual(viewport.x - 0.001);
      expect(band.y).toBeGreaterThanOrEqual(viewport.y - 0.001);
      expect(band.x + band.w).toBeLessThanOrEqual(viewport.x + viewport.w + 0.001);
      expect(band.y + band.h).toBeLessThanOrEqual(viewport.y + viewport.h + 0.001);
    }

    // The street's own plot area is still framed exactly as before.
    const nodes = visibleMapSlots(camera, layout, SINGLE);
    expect(nodes).toHaveLength(10);
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
  it('reports the plot count of a lattice (ten plots per street, nothing shared)', () => {
    expect(mapSlotCount(SINGLE)).toBe(10);
    // 3 streets × 5 columns = 15 world columns; 3 streets × 2 rows = 6 world rows.
    expect(mapSlotCount({ cols: 3, rows: 3 })).toBe(15 * 6);
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

  it('renders every street-owned plot once — nothing is shared or de-duplicated', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, RING);
    const nodes = visibleMapSlots(camera, layout, RING);
    const keys = nodes.map((n) => `${n.localX},${n.localY}`);
    expect(new Set(keys).size).toBe(keys.length);

    // The centre street's east-edge column and the east neighbour's west-edge
    // column are now DIFFERENT plots (they used to be one shared seam column).
    const centreEdge = nodes.filter((n) => n.cellX === 1 && n.cellY === 1 && n.slotIndex === 4);
    const eastEdge = nodes.filter((n) => n.cellX === 2 && n.cellY === 1 && n.slotIndex === 0);
    expect(centreEdge).toHaveLength(1);
    expect(eastEdge).toHaveLength(1);
    expect(eastEdge[0].localX).not.toBe(centreEdge[0].localX);
  });

  it('separates neighbouring street cells by a road band (city-block grid)', () => {
    const east = mapCellOrigin(2, 1, layout, RING);
    const centre = mapCellOrigin(1, 1, layout, RING);
    // Streets step by a full street width plus the road band — they do not touch.
    expect(east.x - centre.x).toBeCloseTo(streetPixelWidth(layout) + roadBandX(layout), 5);
    expect(east.x - centre.x).toBeCloseTo(mapCellStepX(layout), 5);
    // The step is strictly wider than a street block (there is a visible gap).
    expect(east.x - centre.x).toBeGreaterThan(streetPixelWidth(layout));
  });
});

describe('panning and clamping', () => {
  it('leaves a single-street map untouched when zoomed out (map fits the viewport)', () => {
    const camera = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, SINGLE);
    const viewport = streetViewportRect(layout);
    expect(camera.focusX).toBeCloseTo(viewport.x + viewport.w / 2, 5);
    expect(camera.focusY).toBeCloseTo(viewport.y + viewport.h / 2, 5);
  });

  it('clamps panning at 1× so the street stays framed (outer road band included)', () => {
    const camera = panStreetCamera(defaultStreetCamera(layout), 500, 300, layout, SINGLE);
    const bounds = mapBounds(layout, SINGLE);
    const viewport = streetViewportRect(layout);
    const halfW = viewport.w / 2; // scale 1 at zoom level 1
    expect(camera.focusX).toBeLessThanOrEqual(bounds.right - halfW + 0.001);
    expect(camera.focusX).toBeGreaterThanOrEqual(bounds.left + halfW - 0.001);
    // The street's plot area is still inside the visible window.
    const visible = visibleLocalRect(camera, layout);
    expect(visible.right).toBeGreaterThan(layout.streetX);
    expect(visible.left).toBeLessThan(layout.streetX + streetPixelWidth(layout));
  });

  it('pans a zoomed-out lattice and clamps the focus inside the map bounds', () => {
    // At zoom level 2 the 3×3 map is larger than the viewport, so horizontal
    // panning is allowed but clamped to the map (roads included).
    const start = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, RING);
    const panned = panStreetCamera(start, 10_000, -10_000, layout, RING);
    const bounds = mapBounds(layout, RING);
    const halfW = streetViewportRect(layout).w / (2 * zoomScale(2));
    expect(panned.focusX).toBeLessThanOrEqual(bounds.right - halfW + 0.001);
    // The camera actually moved from its clamped start position.
    expect(panned.focusX).toBeGreaterThan(start.focusX);
    // The map is taller than the viewport too (streets plus road bands), so the
    // vertical focus is clamped inside the map rather than left centred.
    const halfH = streetViewportRect(layout).h / (2 * zoomScale(2));
    expect(panned.focusY).toBeGreaterThanOrEqual(bounds.top + halfH - 0.001);
    expect(panned.focusY).toBeLessThanOrEqual(bounds.bottom - halfH + 0.001);
  });

  it('clamps vertical panning for a tall lattice', () => {
    const TALL = { cols: 1, rows: 5 };
    const start = clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 2 }, layout, TALL);
    const panned = panStreetCamera(start, 0, 10_000, layout, TALL);
    const bounds = mapBounds(layout, TALL);
    const halfH = streetViewportRect(layout).h / (2 * zoomScale(2));
    expect(panned.focusY).toBeLessThanOrEqual(bounds.bottom - halfH + 0.001);
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
