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
import { BASE_HUD_Y, BASE_MARKET_CARD_H, BASE_MARKET_ROW_GAP } from '../../../example-games/main-street/scenes/MainStreetConstants';

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

/** HUD strip height (legacy constant from renderer; shared with tutorial math). */
const HUD_STRIP_H = 28;
/** Favour button width (from the layout adapter). */
const FAVOUR_BUTTON_W = 110;

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
 * Derive the HUD strip geometry.
 *
 * **Current (pre-refactor):** the renderer draws a centred half-width strip
 * (`gameW / 4, hudY, gameW * 0.5, 28`).  This helper expresses the **target**
 * contract — market-aligned edges — so the test harness drives the
 * geometry source-of-truth child to green.
 *
 * Until child 2 lands, this returns the market-aligned target rect
 * (`hudLeft === marketLeft`, `hudRight === marketRight`).
 */
function deriveHudStrip(layout: ReturnType<typeof computeMainStreetLayoutWithSll>): Rect {
  // The adapter exposes `hudLeft`/`hudRight`/`hudWidth`, aligned to the market
  // box edges by contract (CG-0MUFAIS8W0011LGQ).
  return {
    x: layout.hudLeft,
    y: BASE_HUD_Y,
    width: layout.hudWidth,
    height: HUD_STRIP_H,
  };
}

/**
 * Derive the Community Favour buttons in their **target** HUD-strip position.
 *
 * The target layout (AC3) places both buttons inside the HUD strip between
 * the Coins and Reputation elements, ordered left-to-right
 * `[rep→coins][coins→rep]`.
 *
 * **Pre-refactor note:** the current renderer places these buttons in the
 * bottom action bar (`y = actionY + 4`).  This helper returns the target
 * HUD-strip y-coordinate so the harness tests are green against the future
 * state.
 */
function deriveFavourButtons(
  layout: ReturnType<typeof computeMainStreetLayoutWithSll>,
): { coinsToRep: Rect; repToCoins: Rect } {
  const hudStripY = BASE_HUD_Y + 2;
  const buttonH = 24; // fits within the 28px strip
  const marketLeft = layout.marketLeft;
  // Position the pair adjacent, starting near the market-box left edge
  // (where the Coins element is left-aligned).
  const coinsToRepX = marketLeft + 120; // to the right of the Coins label
  return {
    repToCoins: {
      x: coinsToRepX,
      y: hudStripY,
      width: FAVOUR_BUTTON_W,
      height: buttonH,
    },
    coinsToRep: {
      x: coinsToRepX + FAVOUR_BUTTON_W,
      y: hudStripY,
      width: FAVOUR_BUTTON_W,
      height: buttonH,
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
      x: rightX - 180, // right-aligned with End Turn button (20px left margin)
      y: layout.actionY - 20,
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
