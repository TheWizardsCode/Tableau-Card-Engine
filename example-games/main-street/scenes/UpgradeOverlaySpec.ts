/**
 * Upgrade Overlay Spec – describes what visual overlays to render on top of
 * a BusinessCard when it has been upgraded (level > 0).
 *
 * This is a **pure data module** with no Phaser/runtime dependencies so it can
 * be unit-tested in a Node environment. It defines the contract between game
 * state (BusinessCard) and the rendering layer (MainStreetRenderer).
 *
 * ## How it fits into the rendering pipeline
 *
 * 1. `MainStreetRenderer.drawBusinessSlot()` renders the base SVG card texture
 *    via `mainStreetRenderCardSvg()`.
 * 2. It then calls `applyUpgradeOverlays()`, which invokes
 *    `buildUpgradeOverlaySpec()` to get overlay specifications.
 * 3. The renderer creates Phaser Text/Graphics objects from the spec and adds
 *    them as children of the card's container.
 *
 * ## Extending
 *
 * To add a new overlay element:
 * 1. Add a field to `UpgradeOverlaySpec` and compute it in `buildUpgradeOverlaySpec()`.
 * 2. Handle the new field in `MainStreetRenderer.applyUpgradeOverlays()`.
 * 3. Add unit tests for the spec builder (no Phaser needed).
 *
 * @module UpgradeOverlaySpec
 */

import type { BusinessCard } from '../MainStreetCards';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a text overlay to be rendered on top of a card. */
export interface OverlayTextSpec {
  text: string;
  x: number;
  y: number;
  fontSize?: string;
  color?: string;
  fontStyle?: string;
}

/** Describes a border/glow overlay for upgraded cards. */
export interface OverlayBorderSpec {
  color: number;
  strokeWidth: number;
}

/** Complete overlay specification for a BusinessCard. */
export interface UpgradeOverlaySpec {
  /** Level badge text (e.g. "Lvl 2"), null for base cards. */
  levelBadge: OverlayTextSpec | null;
  /** Combined income text (e.g. "+8"), null for base cards, always shown for upgraded. */
  incomeText: OverlayTextSpec | null;
  /** Upgraded name text, null for base cards. */
  nameText: OverlayTextSpec | null;
  /** Border/glow for upgraded cards, null for base cards. */
  upgradeBorder: OverlayBorderSpec | null;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build an overlay specification for a BusinessCard based on its current
 * upgrade state. Returns specs for level badge, income display, name overlay,
 * and border styling.
 *
 * Base cards (level === 0) get `null` for all overlay fields — the renderer
 * skips overlay creation entirely. Upgraded cards (level > 0) get all four
 * overlays populated for visual distinction.
 *
 * @param biz - The BusinessCard to generate overlays for.
 * @param width - Card display width in pixels.
 * @param height - Card display height in pixels.
 * @returns An UpgradeOverlaySpec describing all overlays to render.
 */
export function buildUpgradeOverlaySpec(
  biz: BusinessCard,
  width: number,
  height: number,
): UpgradeOverlaySpec {
  const isUpgraded = biz.level > 0;
  const totalIncome = biz.baseIncome + biz.incomeBonus;

  // Level badge: top-right corner, only for upgraded cards
  const levelBadge: OverlayTextSpec | null = isUpgraded
    ? {
        text: `Lvl ${biz.level}`,
        x: Math.round(width - 4),
        y: 4,
        fontSize: '10px',
        color: '#ffdd44',
        fontStyle: 'bold',
      }
    : null;

  // Income text: bottom center, only shown for upgraded cards to keep
  // base cards looking clean (the SVG already shows base income)
  const incomeText: OverlayTextSpec | null = isUpgraded
    ? {
        text: `+${totalIncome}`,
        x: Math.round(width / 2),
        y: Math.round(height - 8),
        fontSize: '12px',
        color: '#44ff44',
        fontStyle: 'bold',
      }
    : null;

  // Name overlay: top center, only for upgraded cards to highlight the new name
  const nameText: OverlayTextSpec | null = isUpgraded
    ? {
        text: biz.name,
        x: Math.round(width / 2),
        y: 16,
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      }
    : null;

  // Upgrade border: golden glow for upgraded cards
  const upgradeBorder: OverlayBorderSpec | null = isUpgraded
    ? {
        color: 0xffaa22,
        strokeWidth: 3,
      }
    : null;

  return { levelBadge, incomeText, nameText, upgradeBorder };
}
