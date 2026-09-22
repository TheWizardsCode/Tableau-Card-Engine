/**
 * Main Street: Adjacency Grid Geometry
 *
 * World-lattice geometry (dimensions, coordinate conversions, grid result
 * types) and neighbor-index resolution (8-way Chebyshev over world slots),
 * including the legacy 1x1 `neighbors()` shim.
 *
 * Import graph: leaf within the Adjacency split (imports Cards geometry
 * helpers only).
 *
 * @module
 */

import type { BusinessCard, CommunitySpaceCard } from './MainStreetCards';
import { getBaseTypeId } from './MainStreetCards';
import { GRID_SIZE, STREET_COLS, STREET_ROWS, WORLD_STRIDE_X, WORLD_STRIDE_Y, worldWidth, worldHeight, worldSlotCount } from './MainStreetCards';

// Re-exported so existing consumers keep importing world geometry from here.
export { worldWidth, worldHeight, worldSlotCount };
/**
 * Returns the indices of neighboring slots within a given range on the
 * legacy 1×1 (2x5, 10-slot) Main Street grid.
 *
 * Slot indices are row-major:
 *   row 0: 0..4
 *   row 1: 5..9
 *
 * Adjacency is 8-way (Chebyshev distance: max(|dx|, |dy|) <= range), so
 * diagonally adjacent slots count at every range. Default range is 1 (the 8
 * surrounding slots); upgrades extend this radius as larger 8-way squares.
 *
 * This is a 1×1 convenience wrapper over the single world-coordinate resolver
 * (`resolveNeighbors`), which also handles expanded lattices — there is only
 * one adjacency implementation (CG-0MTYMD2Q5008UXB9).
 *
 * @param index  The slot index to find neighbors for.
 * @param range  How far to look in each direction (default 1).
 * @returns Ascending array of neighbor indices (excluding the slot itself).
 */
export function neighbors(index: number, range: number = 1): number[] {
  return resolveNeighbors(index, range);
}

/**
 * Returns true if the given business has at least one adjacent neighbor with the
 * same base type (template ID). Used to determine when synergy is nullified and
 * the 60% base-income penalty applies.
 *
 * Sold neighbours still count (they remain on the grid and contribute to the
 * same-type penalty for non-sold neighbours).
 */
export function hasAdjacentSameType(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  soldSlots: boolean[] = [],
  gridDims?: GridDims,
): boolean {
  const card = grid[index];
  if (!card) return false;
  if (soldSlots[index]) return false;

  const baseType = getBaseTypeId(card.id);
  // Use range 1 (default) for same-type check; upgrades don't affect this penalty
  const neighborIndices = resolveNeighbors(index, 1, gridDims);

  for (const ni of neighborIndices) {
    const neighbor = grid[ni];
    if (!neighbor) continue;
    if (getBaseTypeId(neighbor.id) === baseType) {
      return true;
    }
  }

  return false;
}

const MAX_GRID_COLS = 5;

const MAX_GRID_ROWS = 5;

/** Grid dimensions for expanded street layouts (cols × rows of 5×2 street cells). */

export interface GridDims {
  cols: number;
  rows: number;
}

function slotToLocal(slot: number): { lx: number; ly: number } {
  return { lx: slot % STREET_COLS, ly: Math.floor(slot / STREET_COLS) };
}

/**
 * Base world position of street (streetX,streetY) slot `slotIndex`.
 *
 * Each street owns its own plots, so every (street, slot) pair maps to a
 * distinct world position: `(streetX·STREET_COLS + lx, streetY·STREET_ROWS + ly)`.
 */
function baseWorld(
  streetX: number,
  streetY: number,
  slotIndex: number,
): { worldX: number; worldY: number } {
  const { lx, ly } = slotToLocal(slotIndex);
  return {
    worldX: streetX * WORLD_STRIDE_X + lx,
    worldY: streetY * WORLD_STRIDE_Y + ly,
  };
}

/**
 * The single (streetX, streetY, slotIndex) owner of a world node, or null when
 * the position falls outside a `cols`×`rows` lattice.
 *
 * In the city-block model every world position has exactly one owner (streets
 * never share plots), so this is a pure coordinate decode.
 */
function worldOwner(
  worldX: number,
  worldY: number,
  cols: number,
  rows: number,
): { streetX: number; streetY: number; slotIndex: number } | null {
  if (!Number.isInteger(worldX) || !Number.isInteger(worldY)) return null;
  const sx = Math.floor(worldX / WORLD_STRIDE_X);
  const sy = Math.floor(worldY / WORLD_STRIDE_Y);
  if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) return null;
  const lx = worldX - sx * WORLD_STRIDE_X;
  const ly = worldY - sy * WORLD_STRIDE_Y;
  if (lx < 0 || lx >= STREET_COLS || ly < 0 || ly >= STREET_ROWS) return null;
  return { streetX: sx, streetY: sy, slotIndex: ly * STREET_COLS + lx };
}

/**
 * Maps (streetX, streetY, slotIndex) to integer world coordinates.
 *
 * The world position is `(streetX·STREET_COLS + lx, streetY·STREET_ROWS + ly)`
 * where `(lx, ly)` is the slot's local (column, row). Every street/slot pair
 * maps to a distinct world position — no two streets share a plot.
 */
export function toWorldPosition(
  streetX: number,
  streetY: number,
  slotIndex: number,
): { worldX: number; worldY: number } {
  if (!Number.isInteger(streetX) || !Number.isInteger(streetY) || !Number.isInteger(slotIndex)) {
    throw new Error(`toWorldPosition: integer coordinates required, got ${streetX},${streetY},${slotIndex}`);
  }
  if (streetX < 0 || streetY < 0 || slotIndex < 0 || slotIndex >= GRID_SIZE) {
    throw new Error(`toWorldPosition: out of bounds ${streetX},${streetY},${slotIndex}`);
  }
  return baseWorld(streetX, streetY, slotIndex);
}

/**
 * Inverse of toWorldPosition: world → its (street, slot) owner, or null if the
 * world coordinate is not part of the supported MAX_GRID lattice.
 */
export function fromWorldPosition(
  worldPos: { worldX: number; worldY: number },
): { streetX: number; streetY: number; slotIndex: number } | null {
  return worldOwner(worldPos.worldX, worldPos.worldY, MAX_GRID_COLS, MAX_GRID_ROWS);
}

/**
 * Chebyshev (8-way) neighbours of a world position within the supported
 * MAX_GRID lattice, each returned as its (street, slot) owner.
 *
 * An interior node yields 8 entries at range 1 and `(2·range+1)² − 1` entries
 * where the lattice has room.
 */
export function expandedNeighbors(
  worldPos: { worldX: number; worldY: number },
  range: number = 1,
): { streetX: number; streetY: number; slotIndex: number }[] {
  if (!Number.isInteger(range) || range <= 0) return [];
  if (!Number.isInteger(worldPos.worldX) || !Number.isInteger(worldPos.worldY)) return [];
  const xMax = worldWidth(MAX_GRID_COLS) - 1;
  const yMax = worldHeight(MAX_GRID_ROWS) - 1;
  const result: { streetX: number; streetY: number; slotIndex: number }[] = [];
  for (let y = Math.max(0, worldPos.worldY - range); y <= Math.min(yMax, worldPos.worldY + range); y++) {
    for (let x = Math.max(0, worldPos.worldX - range); x <= Math.min(xMax, worldPos.worldX + range); x++) {
      if (x === worldPos.worldX && y === worldPos.worldY) continue;
      const owner = worldOwner(x, y, MAX_GRID_COLS, MAX_GRID_ROWS);
      if (owner) result.push(owner);
    }
  }
  return result;
}

/**
 * Translates a flat world-slot index back to its (worldX, worldY) position.
 * Returns null when `index` is out of range for `gridDims`.
 */
export function worldIndexToPosition(
  index: number,
  gridDims: GridDims,
): { worldX: number; worldY: number } | null {
  if (!gridDims) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  const total = worldSlotCount(gridDims.cols, gridDims.rows);
  if (index >= total) return null;
  const width = worldWidth(gridDims.cols);
  return { worldX: index % width, worldY: Math.floor(index / width) };
}

/**
 * Translates (streetX, streetY, slot) to its flat world-slot index within a
 * `gridDims` lattice. Returns null when the street is outside the lattice or
 * the slot index is invalid.
 *
 * Shared nodes map to a single index: for a 2×2 lattice,
 * `streetSlotToWorldIndex(0,0,9)`, `(1,0,5)`, `(0,1,4)` and `(1,1,0)` all
 * return the same index (the four-way intersection is one card slot).
 */
export function streetSlotToWorldIndex(
  streetX: number,
  streetY: number,
  slotIndex: number,
  gridDims: GridDims,
): number | null {
  if (!gridDims) return null;
  if (
    !Number.isInteger(streetX) || !Number.isInteger(streetY) || !Number.isInteger(slotIndex) ||
    streetX < 0 || streetY < 0 || streetX >= gridDims.cols || streetY >= gridDims.rows ||
    slotIndex < 0 || slotIndex >= GRID_SIZE
  ) {
    return null;
  }
  const { worldX, worldY } = baseWorld(streetX, streetY, slotIndex);
  const width = worldWidth(gridDims.cols);
  const total = worldSlotCount(gridDims.cols, gridDims.rows);
  const index = worldY * width + worldX;
  return index >= 0 && index < total ? index : null;
}

/**
 * Resolve neighbors for a given grid slot index.
 *
 * World slots form a solid rectangle, so adjacency is plain 8-way (Chebyshev)
 * distance over world coordinates — no special-casing of street boundaries.
 * A 1×1 lattice (or omitted `gridDims`) reproduces the legacy 10-slot
 * behaviour exactly.
 *
 * @param index    The world slot index to find neighbors for.
 * @param range    How far to look in each direction (default 1).
 * @param gridDims Optional grid dimensions for expanded layouts.
 * @returns Ascending array of neighbor indices.
 */
export function resolveNeighbors(
  index: number,
  range: number,
  gridDims?: GridDims,
): number[] {
  if (range <= 0) return [];
  const dims: GridDims = gridDims ?? { cols: 1, rows: 1 };
  const total = worldSlotCount(dims.cols, dims.rows);
  if (!Number.isInteger(index) || index < 0 || index >= total) return [];
  const width = worldWidth(dims.cols);
  const originX = index % width;
  const originY = Math.floor(index / width);
  const result: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i === index) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    if (Math.max(Math.abs(originX - x), Math.abs(originY - y)) <= range) {
      result.push(i);
    }
  }
  return result;
}

