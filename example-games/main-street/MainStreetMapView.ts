/**
 * MainStreetMapView — street-map camera geometry for Main Street
 * (CG-0MTH9OVMC001V44E, "Camera zoom controls (map-like)").
 *
 * The street board is a lattice of 2×5 street cells. Adjacent streets share
 * their touching slot column / row (the shared corner plots), so a lattice of
 * `cols × rows` streets collapses to
 * `(cols·(STREET_COLS−1)+1) × (rows·(STREET_ROWS−1)+1)` unique slot positions.
 *
 * This module is deliberately Phaser-free so the geometry and camera maths are
 * unit-testable headless. It provides:
 *
 *  - zoom levels (1× = the legacy single-street framing, higher = zoomed out)
 *    and the derived container scale;
 *  - the street viewport band used to clip/cull the map so the HUD chrome
 *    (market, hand, log, challenges) never moves or gets overdrawn;
 *  - map-local ↔ screen conversion used to map pointer input through the
 *    camera transform (Phaser applies container transforms to input hit
 *    testing automatically, so this is the shared reference the renderer and
 *    the animation helpers use);
 *  - `visibleMapSlots()`, the culled + de-duplicated list of slots that should
 *    be rendered for the current zoom/pan.
 *
 * Scope note: a 1×1 lattice (the shipping board) reproduces the pre-camera
 * layout exactly. Larger lattices reveal neighbouring streets as view-only
 * cells; making those cells playable (cards, adjacency, save/load) is the
 * viewport-rendering / save-load slices of the same epic.
 *
 * @module example-games/main-street/MainStreetMapView
 */

import type { SceneLayout } from './scenes/MainStreetConstants';
import { STREET_COLS, STREET_ROWS } from './scenes/MainStreetConstants';

/** Dimensions (in street cells) of the street lattice to display. */
export interface StreetLatticeDims {
  cols: number;
  rows: number;
}

/** Playable sub-lattice of the displayed lattice (currently the 1×1 board). */
export interface StreetGameplayDims {
  cols: number;
  rows: number;
}

/**
 * Street-map camera state.
 *
 * `zoomLevel` 1 is the legacy framing (scale 1); each level up zooms the map
 * out by the inverse (`scale = 1 / zoomLevel`). `focusX`/`focusY` are the
 * map-local pixel coordinates shown at the centre of the street viewport.
 */
export interface StreetCameraState {
  zoomLevel: number;
  focusX: number;
  focusY: number;
}

/** Canvas-space rectangle the street map may occupy. */
export interface StreetViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A single renderable slot of the street map. */
export interface MapSlotNode {
  /** Street-cell coordinate within the displayed lattice. */
  cellX: number;
  cellY: number;
  /** Slot index within the street cell (0..9, row-major). */
  slotIndex: number;
  /** Map-local top-left corner of the slot rectangle. */
  localX: number;
  localY: number;
  /**
   * Index into `state.streetGrid` when the slot belongs to the playable
   * board, or `null` for a revealed-but-unplayable neighbouring street.
   */
  gameplayIndex: number | null;
}

/** Slots per street cell (2 rows × 5 columns). */
export const SLOTS_PER_STREET = STREET_COLS * STREET_ROWS;

/** Zoom level of the legacy framing (no scale change). */
export const MIN_ZOOM_LEVEL = 1;
/**
 * Maximum map zoom-out level. Level 4 (scale 1/4) comfortably fits a 3×3
 * lattice inside the street viewport band.
 */
export const MAX_ZOOM_LEVEL = 4;

const DEFAULT_LATTICE: StreetLatticeDims = { cols: 1, rows: 1 };
const DEFAULT_GAMEPLAY: StreetGameplayDims = { cols: 1, rows: 1 };

/** Clamp a zoom level into the supported range (invalid values → 1×). */
export function clampZoomLevel(zoomLevel: number): number {
  if (!Number.isFinite(zoomLevel)) return MIN_ZOOM_LEVEL;
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, Math.round(zoomLevel)));
}

/**
 * Map scale for a zoom level: `1 / level`, so zooming out shows more streets.
 * The zoom control is always available — there is no milestone/turn gating.
 */
export function zoomScale(zoomLevel: number): number {
  return 1 / clampZoomLevel(zoomLevel);
}

/** Next zoom level when zooming out (map grows). */
export function zoomOutLevel(zoomLevel: number): number {
  return clampZoomLevel(clampZoomLevel(zoomLevel) + 1);
}

/** Next zoom level when zooming in (back toward the legacy framing). */
export function zoomInLevel(zoomLevel: number): number {
  return clampZoomLevel(clampZoomLevel(zoomLevel) - 1);
}

/** Horizontal distance between the origins of adjacent street cells. */
export function mapCellStepX(layout: SceneLayout): number {
  return (STREET_COLS - 1) * (layout.slotW + layout.slotGap);
}

/** Vertical distance between the origins of adjacent street cells. */
export function mapCellStepY(layout: SceneLayout): number {
  return (STREET_ROWS - 1) * (layout.slotH + layout.streetRowGap);
}

/** Width of one street cell in map-local pixels. */
export function streetPixelWidth(layout: SceneLayout): number {
  return STREET_COLS * layout.slotW + (STREET_COLS - 1) * layout.slotGap;
}

/** Height of one street cell in map-local pixels. */
export function streetPixelHeight(layout: SceneLayout): number {
  return STREET_ROWS * layout.slotH + (STREET_ROWS - 1) * layout.streetRowGap;
}

/**
 * Canvas-space rectangle the street map is drawn in. Sized to the street
 * panel (plus the section-label strip) so the map never overlaps the HUD.
 */
export function streetViewportRect(layout: SceneLayout): StreetViewportRect {
  const labelStrip = 12;
  return {
    x: layout.streetX,
    y: layout.streetTop - labelStrip,
    w: streetPixelWidth(layout),
    h: streetPixelHeight(layout) + labelStrip,
  };
}

/** Street cell of `lattice` that holds the playable board's origin cell. */
export function latticeOriginCell(lattice: StreetLatticeDims): { x: number; y: number } {
  return {
    x: Math.floor((lattice.cols - 1) / 2),
    y: Math.floor((lattice.rows - 1) / 2),
  };
}

/** Street cell of `lattice` that holds the gameplay sub-lattice's origin. */
export function gameplayOriginCell(
  lattice: StreetLatticeDims,
  gameplay: StreetGameplayDims = DEFAULT_GAMEPLAY,
): { x: number; y: number } {
  return {
    x: Math.floor((lattice.cols - gameplay.cols) / 2),
    y: Math.floor((lattice.rows - gameplay.rows) / 2),
  };
}

/**
 * Map-local top-left pixel of a street cell. The playable board's origin cell
 * always maps to `(layout.streetX, layout.streetTop)`, so zoom level 1 with a
 * centred camera reproduces the pre-camera layout exactly.
 */
export function mapCellOrigin(
  cellX: number,
  cellY: number,
  layout: SceneLayout,
  lattice: StreetLatticeDims = DEFAULT_LATTICE,
): { x: number; y: number } {
  const origin = latticeOriginCell(lattice);
  return {
    x: layout.streetX + (cellX - origin.x) * mapCellStepX(layout),
    y: layout.streetTop + (cellY - origin.y) * mapCellStepY(layout),
  };
}

/** Map-local centre of a slot within a street cell. */
export function mapSlotCenter(
  cellX: number,
  cellY: number,
  slotIndex: number,
  layout: SceneLayout,
  lattice: StreetLatticeDims = DEFAULT_LATTICE,
): { x: number; y: number } {
  const origin = mapCellOrigin(cellX, cellY, layout, lattice);
  const col = slotIndex % STREET_COLS;
  const row = Math.floor(slotIndex / STREET_COLS);
  return {
    x: origin.x + col * (layout.slotW + layout.slotGap) + layout.slotW / 2,
    y: origin.y + row * (layout.slotH + layout.streetRowGap) + layout.slotH / 2,
  };
}

/**
 * Number of unique slot positions in a lattice: adjacent streets share their
 * touching column/row, so the lattice collapses by one seam per adjacency.
 */
export function mapSlotCount(lattice: StreetLatticeDims): number {
  return (
    (lattice.cols * (STREET_COLS - 1) + 1) * (lattice.rows * (STREET_ROWS - 1) + 1)
  );
}

/** Map-local bounds of the whole displayed lattice. */
export function mapBounds(
  layout: SceneLayout,
  lattice: StreetLatticeDims = DEFAULT_LATTICE,
): { left: number; top: number; right: number; bottom: number } {
  const topLeft = mapCellOrigin(0, 0, layout, lattice);
  const bottomRight = mapCellOrigin(lattice.cols - 1, lattice.rows - 1, layout, lattice);
  return {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x + streetPixelWidth(layout),
    bottom: bottomRight.y + streetPixelHeight(layout),
  };
}

/** Camera framing the playable board at the legacy 1× view. */
export function defaultStreetCamera(layout: SceneLayout): StreetCameraState {
  const viewport = streetViewportRect(layout);
  return {
    zoomLevel: MIN_ZOOM_LEVEL,
    focusX: viewport.x + viewport.w / 2,
    focusY: viewport.y + viewport.h / 2,
  };
}

/**
 * Clamp the camera focus so the map stays anchored in the viewport: a map that
 * fits at the current scale is centred, a larger map cannot be panned past its
 * own bounds. Zoom level is clamped to the supported range.
 */
export function clampStreetCamera(
  camera: StreetCameraState,
  layout: SceneLayout,
  lattice: StreetLatticeDims = DEFAULT_LATTICE,
): StreetCameraState {
  const zoomLevel = clampZoomLevel(camera.zoomLevel);
  const scale = zoomScale(zoomLevel);
  const viewport = streetViewportRect(layout);
  const bounds = mapBounds(layout, lattice);
  const halfW = viewport.w / (2 * scale);
  const halfH = viewport.h / (2 * scale);
  const viewportCentreX = viewport.x + viewport.w / 2;
  const viewportCentreY = viewport.y + viewport.h / 2;

  const mapW = bounds.right - bounds.left;
  const mapH = bounds.bottom - bounds.top;

  const focusX = mapW <= 2 * halfW
    ? viewportCentreX
    : clampTo(bounds.left + halfW, bounds.right - halfW, camera.focusX);
  const focusY = mapH <= 2 * halfH
    ? viewportCentreY
    : clampTo(bounds.top + halfH, bounds.bottom - halfH, camera.focusY);

  return { zoomLevel, focusX, focusY };
}

/**
 * Pan the camera by a screen-pixel delta (converted to map-local pixels
 * through the current scale) and clamp the result.
 */
export function panStreetCamera(
  camera: StreetCameraState,
  dxScreen: number,
  dyScreen: number,
  layout: SceneLayout,
  lattice: StreetLatticeDims = DEFAULT_LATTICE,
): StreetCameraState {
  const scale = zoomScale(camera.zoomLevel);
  return clampStreetCamera(
    {
      zoomLevel: camera.zoomLevel,
      focusX: camera.focusX + dxScreen / scale,
      focusY: camera.focusY + dyScreen / scale,
    },
    layout,
    lattice,
  );
}

/**
 * Container transform for the street layer: scale about the viewport centre
 * plus the pan offset. At 1× with a centred camera this is the identity, which
 * is what keeps the legacy framing pixel-identical.
 */
export function containerTransform(
  camera: StreetCameraState,
  layout: SceneLayout,
): { scale: number; x: number; y: number } {
  const scale = zoomScale(camera.zoomLevel);
  const viewport = streetViewportRect(layout);
  const centreX = viewport.x + viewport.w / 2;
  const centreY = viewport.y + viewport.h / 2;
  return {
    scale,
    x: centreX - scale * camera.focusX,
    y: centreY - scale * camera.focusY,
  };
}

/** Convert a map-local point to canvas coordinates. */
export function localToScreen(
  point: { x: number; y: number },
  camera: StreetCameraState,
  layout: SceneLayout,
): { x: number; y: number } {
  const transform = containerTransform(camera, layout);
  return {
    x: transform.x + point.x * transform.scale,
    y: transform.y + point.y * transform.scale,
  };
}

/** Convert canvas coordinates back into map-local space (input hit-testing). */
export function screenToLocal(
  point: { x: number; y: number },
  camera: StreetCameraState,
  layout: SceneLayout,
): { x: number; y: number } {
  const transform = containerTransform(camera, layout);
  return {
    x: (point.x - transform.x) / transform.scale,
    y: (point.y - transform.y) / transform.scale,
  };
}

/** Map-local rectangle currently visible through the street viewport. */
export function visibleLocalRect(
  camera: StreetCameraState,
  layout: SceneLayout,
): { left: number; top: number; right: number; bottom: number } {
  const scale = zoomScale(camera.zoomLevel);
  const viewport = streetViewportRect(layout);
  const halfW = viewport.w / (2 * scale);
  const halfH = viewport.h / (2 * scale);
  return {
    left: camera.focusX - halfW,
    top: camera.focusY - halfH,
    right: camera.focusX + halfW,
    bottom: camera.focusY + halfH,
  };
}

/**
 * Slots to render for the current camera: only slots intersecting the visible
 * map rect (unrevealed streets are never instantiated) and only one entry per
 * unique slot position (shared seam plots render exactly once). When a shared
 * plot is owned by both a playable and a view-only street, the playable slot
 * wins so its card stays interactive.
 */
export function visibleMapSlots(
  camera: StreetCameraState,
  layout: SceneLayout,
  lattice: StreetLatticeDims = DEFAULT_LATTICE,
  gameplay: StreetGameplayDims = DEFAULT_GAMEPLAY,
): MapSlotNode[] {
  const visible = visibleLocalRect(camera, layout);
  const gameplayOrigin = gameplayOriginCell(lattice, gameplay);
  const byPosition = new Map<string, MapSlotNode>();
  const order: string[] = [];

  for (let cellY = 0; cellY < lattice.rows; cellY++) {
    for (let cellX = 0; cellX < lattice.cols; cellX++) {
      const origin = mapCellOrigin(cellX, cellY, layout, lattice);
      const inGameplay =
        cellX >= gameplayOrigin.x && cellX < gameplayOrigin.x + gameplay.cols &&
        cellY >= gameplayOrigin.y && cellY < gameplayOrigin.y + gameplay.rows;

      for (let slotIndex = 0; slotIndex < SLOTS_PER_STREET; slotIndex++) {
        const col = slotIndex % STREET_COLS;
        const row = Math.floor(slotIndex / STREET_COLS);
        const localX = origin.x + col * (layout.slotW + layout.slotGap);
        const localY = origin.y + row * (layout.slotH + layout.streetRowGap);

        if (
          localX + layout.slotW <= visible.left ||
          localX >= visible.right ||
          localY + layout.slotH <= visible.top ||
          localY >= visible.bottom
        ) {
          continue;
        }

        const node: MapSlotNode = {
          cellX,
          cellY,
          slotIndex,
          localX,
          localY,
          gameplayIndex: inGameplay
            ? ((cellY - gameplayOrigin.y) * gameplay.cols + (cellX - gameplayOrigin.x)) *
                SLOTS_PER_STREET + slotIndex
            : null,
        };

        const key = `${localX},${localY}`;
        const existing = byPosition.get(key);
        if (existing === undefined) {
          byPosition.set(key, node);
          order.push(key);
        } else if (existing.gameplayIndex === null && node.gameplayIndex !== null) {
          byPosition.set(key, node);
        }
      }
    }
  }

  return order.map((key) => byPosition.get(key)!);
}

function clampTo(min: number, max: number, value: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
