/**
 * Main Street layout geometry helpers — test-side source of truth.
 *
 * This module derives HUD, market-box, favour-button and action-cluster
 * rectangles from the SLL layout document via `computeMainStreetLayoutWithSll()`
 * and the shared `anchorPoint()` / `getZoneRect()` helpers.
 *
 * **Single source of truth for test geometry assertions.**  All values come
 * from the layout contract — no duplicated literal `320` / `640` / `gameW * 0.5`
 * strip maths.
 *
 * @module tests/main-street/helpers/mainStreetLayoutGeometry
 * @see {@link https://github.com/TheWizardsCode/Tableau-Card-Engine/issues/CG-0MT5UO47U0047UKA}
 *   — parent work item: "Turn and resource management UI improvements"
 * @see AC2 (HUD strip aligned to market box), AC3 (favour buttons in HUD strip)
 */

import { computeMainStreetLayoutWithSll } from '../../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import { BASE_MARKET_CARD_H, BASE_MARKET_ROW_GAP, HUD_BAR_HEIGHT_PX } from '../../../example-games/main-street/scenes/MainStreetConstants';

// ── Types ───────────────────────────────────────────────────────

/** A simple axis-aligned rectangle in pixel space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The collection of derived geometry rectangles. */
export interface MainStreetLayoutGeometry {
  /** Market background box: left=20, right=logX-20. */
  marketBox: Rect;
  /** HUD strip (target: aligned to market box edges). */
  hudStrip: Rect;
  /** Favour button — coins→reputation (left edge). */
  favourCoinsToRepButton: Rect;
  /** Favour button — reputation→coins (left edge). */
  favourRepToCoinsButton: Rect;
  /** Action cluster: End Turn button area. */
  endTurnButton: Rect;
  /** Action cluster: Hint button area. */
  hintButton: Rect;
  /** Action counter area (right-aligned above End Turn). */
  actionCounter: Rect;
  /** Peek / small button area. */
  peekButton: Rect;
}

// ── Constants (used by the adapter; imported from constants) ──────

/** HUD strip height (shared with the renderer). */
const HUD_STRIP_H = HUD_BAR_HEIGHT_PX;

// ── Private helpers ──────────────────────────────────────────────

/**
 * Derive the market-box edges.  The renderer uses `bgLeft = 20` and
 * `bgRight = logX - 20` where `logX` comes from the activity-log panel.
 *
 * **Target contract (post-geometry child):** the HUD strip will share
 * these edges exactly (`hudLeft === marketLeft`, `hudRight === marketRight`).
 */
function deriveMarketBox(layout: ReturnType<typeof computeMainStreetLayoutWithSll>): Rect {
  // Edges come from the layout contract (`marketLeft`/`marketRight`), which
  // the adapter derives from the SLL zones — never recomputed here.
  const marketLeft = layout.marketLeft;
  const marketRight = layout.marketRight;
  const marketTop = layout.marketTop - 10;
  const marketRowH = BASE_MARKET_CARD_H + 14;
  const bothRowsH = 2 * marketRowH + BASE_MARKET_ROW_GAP + 20;
  return { x: marketLeft, y: marketTop, width: marketRight - marketLeft, height: bothRowsH };
}

/**
 * Derive the HUD strip geometry (market-aligned, CG-0MUFAIS8W0011LGQ).
 *
 * `y` is the strip's TOP edge: the 28px strip is centred on `hudY`, so it
 * spans `[hudY - 14, hudY + 14]`.
 */
function deriveHudStrip(layout: ReturnType<typeof computeMainStreetLayoutWithSll>): Rect {
  return {
    x: layout.hudLeft,
    y: layout.hudY - HUD_STRIP_H / 2,
    width: layout.hudWidth,
    height: HUD_STRIP_H,
  };
}

/**
 * Derive the Community Favour buttons in their HUD-strip position
 * (CG-0MUFAITED0088AGN). Both buttons sit inside the HUD strip between the
 * Coins and Reputation elements, ordered left-to-right `[rep→coins][coins→rep]`.
 *
 * All values come from the adapter (`favourRepToCoinsX` / `favourCoinsToRepX` /
 * `favourButtonW` / `favourButtonH`) — no duplicated pixel maths.
 */
function deriveFavourButtons(
  layout: ReturnType<typeof computeMainStreetLayoutWithSll>,
): { coinsToRep: Rect; repToCoins: Rect } {
  const y = layout.hudY - layout.favourButtonH / 2;
  return {
    repToCoins: {
      x: layout.favourRepToCoinsX,
      y,
      width: layout.favourButtonW,
      height: layout.favourButtonH,
    },
    coinsToRep: {
      x: layout.favourCoinsToRepX,
      y,
      width: layout.favourButtonW,
      height: layout.favourButtonH,
    },
  };
}

/**
 * Derive the action-cluster rectangles.
 *
 * The action cluster is the bottom-right area containing:
 * - End Turn button (right-aligned)
 * - Hint button (to the left of End Turn)
 * - Peek / small buttons (to the left of Hint)
 * - Action counter (right-aligned, above End Turn)
 */
function deriveActionCluster(layout: ReturnType<typeof computeMainStreetLayoutWithSll>): {
  endTurnButton: Rect;
  hintButton: Rect;
  peekButton: Rect;
  actionCounter: Rect;
} {
  const rightX = layout.gameW - 24;
  const by = layout.actionY + 4;
  return {
    endTurnButton: {
      x: rightX - layout.actionButtonW,
      y: by,
      width: layout.actionButtonW,
      height: layout.actionButtonH,
    },
    hintButton: {
      x: rightX - layout.actionButtonW - 12 - layout.hintButtonW,
      y: by,
      width: layout.hintButtonW,
      height: layout.actionButtonH,
    },
    peekButton: {
      x: rightX - layout.actionButtonW - 12 - layout.hintButtonW - layout.smallButtonW,
      y: by,
      width: layout.smallButtonW,
      height: layout.actionButtonH,
    },
    actionCounter: {
      // Right-aligned with the End Turn button's right edge. The renderer draws
      // the text at (rightX, actionY - 22) with origin (1, 1), so its bounding
      // box bottom sits at actionY - 22 and it is stacked above the
      // "Can buy: ..." summary line and the End Turn button (CG-0MUFAITX70081W41).
      x: rightX - 180,
      y: layout.actionY - 38,
      width: 180,
      height: 16,
    },
  };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Compute the full set of layout-derived geometry rectangles.
 *
 * Pure function — no Phaser / browser dependency — so it is unit-testable
 * in Node.
 *
 * @param viewportOverride — optional viewport override (defaults to 1280×720).
 * @returns derived geometry for market box, HUD strip, favour buttons, and action cluster.
 */
export function computeMainStreetLayoutGeometry(
  _viewportOverride?: { width: number; height: number },
): MainStreetLayoutGeometry {
  const layout = computeMainStreetLayoutWithSll();
  const marketBox = deriveMarketBox(layout);
  const hudStrip = deriveHudStrip(layout);
  const favour = deriveFavourButtons(layout);
  const cluster = deriveActionCluster(layout);

  return {
    marketBox,
    hudStrip,
    favourCoinsToRepButton: favour.coinsToRep,
    favourRepToCoinsButton: favour.repToCoins,
    endTurnButton: cluster.endTurnButton,
    hintButton: cluster.hintButton,
    peekButton: cluster.peekButton,
    actionCounter: cluster.actionCounter,
  };
}

/**
 * Assert that the HUD strip shares the same left/right edges as the market box.
 * This is the **target contract** (AC2) that the geometry source-of-truth
 * child (CG-0MUFAIS8W0011LGQ) must enforce in production code.
 *
 * This helper exists so the harness can assert the contract independently
 * of the production renderer — the harness drives the implementation,
 * not the reverse.
 *
 * @throws AssertionError if `hudLeft !== marketLeft` or `hudRight !== marketRight`.
 */
export function assertMarketAlignedHud(geom: MainStreetLayoutGeometry): void {
  const hudLeft = geom.hudStrip.x;
  const hudRight = geom.hudStrip.x + geom.hudStrip.width;
  const marketLeft = geom.marketBox.x;
  const marketRight = geom.marketBox.x + geom.marketBox.width;
  if (hudLeft !== marketLeft) {
    throw new Error(
      `HUD strip left (${hudLeft}) does not match market box left (${marketLeft})`,
    );
  }
  if (hudRight !== marketRight) {
    throw new Error(
      `HUD strip right (${hudRight}) does not match market box right (${marketRight})`,
    );
  }
}

/**
 * Assert that the two favour buttons are adjacent (reading left-to-right
 * `[rep→coins][coins→rep]`) and sit inside the HUD strip.
 *
 * @throws AssertionError if adjacency or containment is violated.
 */
export function assertFavourButtonsAdjacent(geom: MainStreetLayoutGeometry): void {
  const repToCoinsRight = geom.favourRepToCoinsButton.x + geom.favourRepToCoinsButton.width;
  const coinsToRepLeft = geom.favourCoinsToRepButton.x;
  if (repToCoinsRight !== coinsToRepLeft) {
    throw new Error(
      `Favour buttons are not adjacent: rep→coins right (${repToCoinsRight}) !== coins→rep left (${coinsToRepLeft})`,
    );
  }
  // Both must be inside the HUD strip.
  const strip = geom.hudStrip;
  const btns = [geom.favourRepToCoinsButton, geom.favourCoinsToRepButton];
  for (const btn of btns) {
    if (btn.x < strip.x || btn.x + btn.width > strip.x + strip.width) {
      throw new Error(
        `Favour button outside HUD strip: ${btn.x}..${btn.x + btn.width} not in ${strip.x}..${strip.x + strip.width}`,
      );
    }
    if (btn.y < strip.y || btn.y + btn.height > strip.y + strip.height) {
      throw new Error(
        `Favour button vertically outside HUD strip: ${btn.y}..${btn.y + btn.height} not in ${strip.y}..${strip.y + strip.height}`,
      );
    }
  }
}
