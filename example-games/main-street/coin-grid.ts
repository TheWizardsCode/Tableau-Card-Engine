/**
 * On-card coin grid component (CG-0MTDE9H0C0061D51).
 *
 * Renders a card's accumulated income as a packed grid of coin sprites on the
 * card face, and provides the pure, Phaser-free packing algorithm
 * (`packCoins`) used by the phased income animation (child 3) to fit any
 * number of coins into a bounded area.
 *
 * Packing policy (per the epic):
 *  - the grid starts at 5 columns per row; when space runs out it grows to
 *    10 columns, then 15 columns, and beyond that continues scaling (more
 *    rows, then shrinking coin size, then overlap as a last resort);
 *  - economy is integer-only: each coin represents 1 whole coin;
 *  - overflow is always visible: the layout is fit inside the available
 *    region so coins are never clipped.
 *
 * The Phaser bits (`createCoinGrid`) are deliberately thin: a lazy texture
 * pair (full/half coin) and a small container parented to the card container,
 * so the grid moves and scales with the card automatically.
 */

import type Phaser from 'phaser';

/** One coin icon within a layout (position is relative to the grid centre). */
export interface CoinPlacement {
  x: number;
  y: number;
  /** True for a half-coin icon (integer economy: always false, kept for API compatibility). */
  half: boolean;
}

/** Result of the pure `packCoins` computation. */
export interface CoinGridLayout {
  /** Whole coins (each represents 1.0 of value). */
  fullCoins: number;
  /** True when a half coin is shown (integer economy: always false). */
  halfCoin: boolean;
  /** Total icons rendered (`fullCoins`; integer-only). */
  iconCount: number;
  columns: number;
  rows: number;
  /** Effective (possibly shrunken) coin diameter in px. */
  coinSize: number;
  /** Effective horizontal gap between coins in px (negative ⇒ overlap). */
  spacing: number;
  /** True when coins were shrunk below the requested size to fit. */
  shrinkApplied: boolean;
  /** True when spacing went negative (coins overlap) to fit. */
  overlapApplied: boolean;
  /** Icon positions, row-major, relative to the grid centre. */
  placements: CoinPlacement[];
}

export interface PackCoinsOptions {
  /** Requested coin diameter in px (default 10). */
  coinSize?: number;
  /** Requested gap between coins in px (default 2). */
  spacing?: number;
}

/** Default coin diameter used by `packCoins`. */
export const COIN_GRID_SIZE = 10;
/** Default gap between coins, used before any width tightening. */
export const COIN_GRID_SPACING = 2;
/** Smallest acceptable coin diameter before overlap kicks in. */
export const MIN_COIN_SIZE = 4;

/** Texture keys generated lazily by `createCoinGrid`. */
export const COIN_GRID_FULL_KEY = 'ms-coin-grid-full';
export const COIN_GRID_HALF_KEY = 'ms-coin-grid-half';

/** Round to the nearest integer — shared integer-economy primitive for the coin grid.
 *  Kept as `roundHalf` for API compatibility; new code should prefer `Math.round` / `roundInt`. */
export function roundHalf(x: number): number {
  return Math.round(x);
}

/** Split an integer coin amount into whole coins (halfCoin is always false in integer economy). */
export function splitCoins(count: number): { fullCoins: number; halfCoin: boolean } {
  const fullCoins = Math.max(0, Math.round(count));
  return { fullCoins, halfCoin: false };
}

/**
 * Column count for a given icon count: 5 → 10 → 15 as the icon count grows.
 * Beyond 15 the grid keeps 15 columns and grows rows instead.
 */
export function gridColumns(iconCount: number): number {
  if (iconCount <= 5) return 5;
  if (iconCount <= 10) return 10;
  return 15;
}

/**
 * Pure packing computation: lays `count` integer coins into a grid that always fits inside
 * the available region, so no coin is ever clipped.
 *
 * The returned placements are relative to the grid centre; the caller anchors
 * that centre on the card. `availableWidth`/`availableHeight` bound the grid
 * footprint; if the natural grid is too big the layout first tightens the
 * horizontal spacing, then shrinks the coin size, and only if that would make
 * coins illegible (< `MIN_COIN_SIZE`) lets spacing go negative (overlap).
 */
export function packCoins(
  count: number,
  availableWidth: number,
  availableHeight: number,
  options?: PackCoinsOptions,
): CoinGridLayout {
  const coinSize = options?.coinSize ?? COIN_GRID_SIZE;
  const spacing = options?.spacing ?? COIN_GRID_SPACING;
  const { fullCoins, halfCoin } = splitCoins(count);
  const iconCount = fullCoins + (halfCoin ? 1 : 0);

  const empty = (): CoinGridLayout => ({
    fullCoins,
    halfCoin,
    iconCount: 0,
    columns: 5,
    rows: 0,
    coinSize,
    spacing,
    shrinkApplied: false,
    overlapApplied: false,
    placements: [],
  });

  if (iconCount === 0 || availableWidth <= 0 || availableHeight <= 0) {
    return empty();
  }

  const columns = gridColumns(iconCount);
  let rows = Math.ceil(iconCount / columns);

  let w = coinSize;
  let s = spacing;
  let shrinkApplied = false;
  let overlapApplied = false;

  // 1. Width fit: tighten horizontal spacing first, then shrink coins, and
  //    only overlap (negative spacing) when coins would get too small.
  const naturalGridW = columns * w + (columns - 1) * s;
  if (naturalGridW > availableWidth && columns > 1) {
    // How much room is left after the coins themselves?
    const tightestSpacing = (availableWidth - columns * w) / (columns - 1);
    if (tightestSpacing >= s) {
      s = tightestSpacing; // no change, width already fits after tightening
    } else if (tightestSpacing >= 0) {
      s = tightestSpacing; // tighten spacing part-way
    } else {
      // Even zero spacing is too wide → shrink the coins.
      let fitWidth = availableWidth / columns;
      if (fitWidth >= MIN_COIN_SIZE) {
        w = fitWidth;
        s = 0;
      } else {
        // Coins would get too small → keep MIN and overlap them.
        w = MIN_COIN_SIZE;
        s = (availableWidth - columns * w) / (columns - 1);
        overlapApplied = s < 0;
        shrinkApplied = w < coinSize;
      }
      shrinkApplied = shrinkApplied || w < coinSize;
    }
  }

  // 2. Height fit: shrink everything uniformly so all rows fit.
  const gridH = rows * w + (rows - 1) * s;
  if (gridH > availableHeight && rows > 0) {
    const scale = availableHeight / gridH;
    w *= scale;
    s *= scale;
    shrinkApplied = true;
  }

  const finalGridW = columns * w + (columns - 1) * s;
  const finalGridH = rows * w + (rows - 1) * s;

  const placements: CoinPlacement[] = [];
  for (let i = 0; i < iconCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    placements.push({
      x: col * (w + s) - finalGridW / 2 + w / 2,
      y: row * (w + s) - finalGridH / 2 + w / 2,
      // The half coin is the final icon in the row-major order.
      half: halfCoin && i === iconCount - 1,
    });
  }

  return {
    fullCoins,
    halfCoin,
    iconCount,
    columns,
    rows,
    coinSize: w,
    spacing: s,
    shrinkApplied,
    overlapApplied,
    placements,
  };
}

// ---------------------------------------------------------------------------
// Phaser rendering wrapper
// ---------------------------------------------------------------------------

export interface CoinGridOptions {
  /** Region the grid must fit within (defaults to the bottom-right quadrant). */
  availableWidth?: number;
  availableHeight?: number;
  /** Requested coin diameter in px (default `COIN_GRID_SIZE`). */
  coinSize?: number;
  /** Requested gap between coins in px (default `COIN_GRID_SPACING`). */
  spacing?: number;
  /** Depth of the grid container within the card (default 1). */
  depth?: number;
}

export interface CoinGridHandle {
  /** Re-pack the grid to show `count` coins (clears previous icons). */
  addCoins(count: number): CoinGridLayout;
  /** Remove all coin icons from the grid. */
  clear(): void;
  /** The layout from the most recent `addCoins` call, or null. */
  getLayout(): CoinGridLayout | null;
  /** The container holding the coin icons (parented to the card). */
  container: Phaser.GameObjects.Container;
}

/** Fallback card size when `card.getBounds()` cannot resolve dimensions. */
const FALLBACK_CARD_W = 140;
const FALLBACK_CARD_H = 80;

function ensureCoinTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(COIN_GRID_FULL_KEY)) return;

  const g = scene.add.graphics();
  // Full coin: gold disc with a darker inner ring and a light highlight.
  g.fillStyle(0xffcc44, 1);
  g.fillCircle(8, 8, 7);
  g.fillStyle(0xd9a02d, 1);
  g.fillCircle(8, 8, 4.5);
  g.fillStyle(0xffe089, 1);
  g.fillCircle(8, 8, 1.8);
  g.generateTexture(COIN_GRID_FULL_KEY, 16, 16);
  g.clear();

  // Half coin: right semicircle with matching inner ring/highlight.
  g.fillStyle(0xffcc44, 1);
  g.beginPath();
  g.arc(8, 8, 7, -Math.PI / 2, Math.PI / 2);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xd9a02d, 1);
  g.beginPath();
  g.arc(8, 8, 4.5, -Math.PI / 2, Math.PI / 2);
  g.closePath();
  g.fillPath();
  g.generateTexture(COIN_GRID_HALF_KEY, 16, 16);
  g.destroy();
}

/**
 * Create a coin grid anchored to a card container. The grid's centre is
 * placed at (`anchorX`, `anchorY`) in the card's local coordinates; because
 * the grid container is parented to the card it moves and scales with the
 * card automatically.
 *
 * Defaults: the grid occupies the bottom-right quadrant of the card
 * (`availableWidth`/`availableHeight` default to half the card's bounds, and
 * the anchor defaults to that quadrant's centre).
 */
export function createCoinGrid(
  scene: Phaser.Scene,
  card: Phaser.GameObjects.Container,
  anchorX?: number,
  anchorY?: number,
  options?: CoinGridOptions,
): CoinGridHandle {
  ensureCoinTextures(scene);

  const bounds = card.getBounds();
  const cardW = bounds.width > 0 ? bounds.width : FALLBACK_CARD_W;
  const cardH = bounds.height > 0 ? bounds.height : FALLBACK_CARD_H;

  // Default region: the bottom-right quadrant of the card face.
  const availableWidth = options?.availableWidth ?? cardW / 2;
  const availableHeight = options?.availableHeight ?? cardH / 2;
  const anchorXPos = anchorX ?? cardW / 4;
  const anchorYPos = anchorY ?? cardH / 4;
  const coinSize = options?.coinSize ?? COIN_GRID_SIZE;
  const spacing = options?.spacing ?? COIN_GRID_SPACING;

  const grid = scene.add.container(anchorXPos, anchorYPos);
  grid.setDepth(options?.depth ?? 1);
  card.add(grid);

  let lastLayout: CoinGridLayout | null = null;

  const handle: CoinGridHandle = {
    addCoins(count: number): CoinGridLayout {
      const layout = packCoins(count, availableWidth, availableHeight, { coinSize, spacing });
      lastLayout = layout;
      grid.removeAll(true);
      for (const p of layout.placements) {
        const icon = scene.add
          .image(p.x, p.y, p.half ? COIN_GRID_HALF_KEY : COIN_GRID_FULL_KEY)
          .setOrigin(0.5, 0.5);
        icon.setDisplaySize(layout.coinSize, layout.coinSize);
        grid.add(icon);
      }
      return layout;
    },
    clear(): void {
      grid.removeAll(true);
      lastLayout = null;
    },
    getLayout(): CoinGridLayout | null {
      return lastLayout;
    },
    container: grid,
  };

  return handle;
}