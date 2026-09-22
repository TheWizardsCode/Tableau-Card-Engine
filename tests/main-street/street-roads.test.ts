/**
 * City-block road layout (CG-0MT5Y1X5T001M4S6).
 *
 * The producer asked for a city-block grid: streets arranged in rows and
 * columns with a road between them, the roads drawn as grey rectangles with a
 * dashed white centre line, and the pattern growing as the camera zooms out.
 *
 * These headless tests pin the geometry contract:
 *  - street blocks are separated by a road band (they no longer touch);
 *  - one road band exists between every pair of adjacent streets, plus a band
 *    around the outside, so the grid reads as a city map;
 *  - road bands never overlap a plot;
 *  - the band count grows with the lattice (and therefore with zoom).
 *
 * @module tests/main-street/street-roads
 */

import { describe, it, expect } from 'vitest';

import {
  mapBounds,
  mapCellStepX,
  mapCellStepY,
  mapRoadBands,
  roadBandX,
  roadBandY,
  streetPixelHeight,
  streetPixelWidth,
  visibleMapSlots,
  worldIndexToMapCenter,
  defaultStreetCamera,
  clampStreetCamera,
  type RoadBand,
} from '../../example-games/main-street/MainStreetMapView';
import { worldSlotCount } from '../../example-games/main-street/MainStreetAdjacency';
import type { SceneLayout } from '../../example-games/main-street/scenes/MainStreetConstants';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

const layout: SceneLayout = computeMainStreetLayoutWithSll();

function overlaps(a: RoadBand, b: { x: number; y: number; w: number; h: number }): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y
  );
}

describe('street blocks are separated by roads (city-block grid)', () => {
  it('steps one full street width plus a road band between street origins', () => {
    expect(mapCellStepX(layout)).toBeCloseTo(streetPixelWidth(layout) + roadBandX(layout), 5);
    expect(mapCellStepY(layout)).toBeCloseTo(streetPixelHeight(layout) + roadBandY(layout), 5);
    // The step is strictly wider/taller than a street block — streets do not touch.
    expect(mapCellStepX(layout)).toBeGreaterThan(streetPixelWidth(layout));
    expect(mapCellStepY(layout)).toBeGreaterThan(streetPixelHeight(layout));
  });

  it('separates horizontally adjacent streets by the full road band', () => {
    const dims = { cols: 2, rows: 1 };
    // Street 0's east-edge plot centre and street 1's west-edge plot centre.
    const westEdge = worldIndexToMapCenter(4, layout, dims);   // world (4,0)
    const eastEdge = worldIndexToMapCenter(5, layout, dims);   // world (5,0)
    // Centre-to-centre distance is one plot width plus the road band, i.e. the
    // clear gap between the two street blocks is exactly the road band.
    expect(eastEdge.x - westEdge.x).toBeCloseTo(layout.slotW + roadBandX(layout), 5);
  });

  it('separates vertically adjacent streets by the full road band', () => {
    const dims = { cols: 1, rows: 2 };
    const northEdge = worldIndexToMapCenter(5, layout, dims); // street (0,0) row 1
    const southEdge = worldIndexToMapCenter(10, layout, dims); // street (0,1) row 0
    expect(southEdge.y - northEdge.y).toBeCloseTo(layout.slotH + roadBandY(layout), 5);
  });
});

describe('road bands', () => {
  it('places one band between every pair of adjacent streets plus one on each outer edge', () => {
    const dims = { cols: 3, rows: 2 };
    const bands = mapRoadBands(layout, dims);
    const vertical = bands.filter((b) => b.orientation === 'vertical');
    const horizontal = bands.filter((b) => b.orientation === 'horizontal');
    // cols + 1 vertical bands, rows + 1 horizontal bands.
    expect(vertical).toHaveLength(dims.cols + 1);
    expect(horizontal).toHaveLength(dims.rows + 1);
    expect(bands).toHaveLength(dims.cols + dims.rows + 2);
  });

  it('sizes each band to the road width and spans the whole grid across it', () => {
    const dims = { cols: 2, rows: 2 };
    const bands = mapRoadBands(layout, dims);
    for (const band of bands) {
      if (band.orientation === 'vertical') {
        expect(band.w).toBeCloseTo(roadBandX(layout), 5);
        expect(band.h).toBeGreaterThan(streetPixelHeight(layout));
      } else {
        expect(band.h).toBeCloseTo(roadBandY(layout), 5);
        expect(band.w).toBeGreaterThan(streetPixelWidth(layout));
      }
    }
  });

  it('never overlaps a plot of the lattice', () => {
    const dims = { cols: 2, rows: 2 };
    const bands = mapRoadBands(layout, dims);
    const nodes = visibleMapSlots(
      clampStreetCamera({ ...defaultStreetCamera(layout), zoomLevel: 4 }, layout, dims),
      layout,
      dims,
      dims,
    );
    expect(nodes).toHaveLength(worldSlotCount(dims.cols, dims.rows));
    for (const band of bands) {
      for (const node of nodes) {
        const plot = { x: node.localX, y: node.localY, w: layout.slotW, h: layout.slotH };
        expect(overlaps(band, plot)).toBe(false);
      }
    }
  });

  it('grows the number of bands as the lattice grows (zoom reveals more roads)', () => {
    const small = mapRoadBands(layout, { cols: 1, rows: 1 });
    const large = mapRoadBands(layout, { cols: 3, rows: 3 });
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('keeps every band inside the map bounds (so the camera can frame them)', () => {
    const dims = { cols: 3, rows: 3 };
    const bounds = mapBounds(layout, dims);
    for (const band of mapRoadBands(layout, dims)) {
      expect(band.x).toBeGreaterThanOrEqual(bounds.left - 0.001);
      expect(band.y).toBeGreaterThanOrEqual(bounds.top - 0.001);
      expect(band.x + band.w).toBeLessThanOrEqual(bounds.right + 0.001);
      expect(band.y + band.h).toBeLessThanOrEqual(bounds.bottom + 0.001);
    }
  });
});
