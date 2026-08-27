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

import type { BusinessCard, CommunitySpaceCard } from '../MainStreetCards';

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
  /** Horizontal origin offset (0=left, 0.5=center, 1=right). Default 0. */
  originX?: number;
  /** Vertical origin offset (0=top, 0.5=center, 1=bottom). Default 0. */
  originY?: number;
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
  /** Per-turn income text (e.g. "Income: +3/turn"), null when total income is 0. */
  incomeText: OverlayTextSpec | null;
  /** Per-turn reputation text (e.g. "+0.2/turn"), null when total reputation is 0. */
  reputationText: OverlayTextSpec | null;
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
  biz: BusinessCard | CommunitySpaceCard,
  width: number,
  height: number,
): UpgradeOverlaySpec {
  const isUpgraded = biz.level > 0;
  const totalIncome = biz.baseIncome + biz.incomeBonus;
  const totalReputation = (biz.reputationPerTurn ?? 0) + biz.reputationBonus;

  // Level badge: top-right corner, only for upgraded cards
  // Container origin is at card centre, so subtract width/2 and height/2
  // to convert from absolute-card to container-local coordinates.
  const levelBadge: OverlayTextSpec | null = isUpgraded
    ? {
        text: `Lvl ${biz.level}`,
        x: Math.round(width / 2 - 4),
        y: Math.round(4 - height / 2),
        fontSize: '10px',
        color: '#ffdd44',
        fontStyle: 'bold',
      }
    : null;

  // Income text: centred on the card, shown for any card with income > 0
  // Uses "Income: +X/turn" format for clarity
  // Container origin is at card centre, so x=0 is horizontal centre
  // and a small negative y offset centres the label slightly above middle.
  const incomeText: OverlayTextSpec | null = totalIncome > 0
    ? {
        text: `Income: +${totalIncome}/turn`,
        x: 0,
        y: Math.round(-height * 0.06),
        fontSize: '11px',
        color: '#44ff44',
        fontStyle: 'bold',
        originX: 0.5,
        originY: 0.5,
      }
    : null;

  // Reputation text: centred below income, shown for any card with reputation > 0
  // Container origin is at card centre, so x=0 is horizontal centre
  // and a small positive y offset places it below the income label.

  // Format to at most 1 decimal place, stripping trailing zeros (e.g. 0.2, 0.3, 1.0 -> 1)
  const repFormatted = totalReputation > 0
    ? (Number.isInteger(totalReputation) ? `${totalReputation}` : totalReputation.toFixed(1))
    : '0';
  const reputationText: OverlayTextSpec | null = totalReputation > 0
    ? {
        text: `+${repFormatted}/turn`,
        x: 0,
        y: Math.round(height * 0.1),
        fontSize: '11px',
        color: '#88bbff',
        fontStyle: 'bold',
        originX: 0.5,
        originY: 0.5,
      }
    : null;

  // Name overlay: top centre, only for upgraded cards to highlight the new name
  // Container origin is at card centre, so x=0 is horizontal centre
  // and y = -height/2 + 16 places the top edge near the card's top.
  // Uses displayName (set by purchaseUpgrade/playUpgradeFromHand) when present,
  // falling back to the base name for legacy/uncleaned state.
  const nameText: OverlayTextSpec | null = isUpgraded
    ? {
        text: biz.displayName ?? biz.name,
        x: 0,
        y: Math.round(-height / 2 + 16),
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

  return { levelBadge, incomeText, reputationText, nameText, upgradeBorder };
}
