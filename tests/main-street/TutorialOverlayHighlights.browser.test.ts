/**
 * Tutorial overlay highlight alignment regression test.
 *
 * Boots the Main Street game, triggers each tutorial step, and asserts that
 * the green highlight rectangle (depth 199) drawn by the overlay ALIGNS with
 * the actual rendered geometry of its target UI element (within a small
 * per-edge tolerance).
 *
 * The target rect for each zone is computed from the renderer's source of
 * truth — `scene.layout` (from `computeMainStreetLayoutWithSll()`) + shared
 * constants + the same renderer math used in `MainStreetRenderer` (e.g.
 * `marketTop + 6`, `streetTop`, `handCenterX`, `actionY + 4`). The tutorial
 * highlight zones must match these targets, otherwise the highlights land on
 * empty space instead of on their target element.
 *
 * Unified step mapping for the alignment checks (17 steps):
 *   T2 (developmentRow, index 1)  T3 (laundromatCard, index 2)
 *   T4 (hand, index 3)  T5 (streetGrid, index 4)
 *   T6 (incidentQueue, index 5)  T7 (endTurnButton, index 6)
 *   T8 (investmentsRow, index 7)  T9 (festivalCard, index 8)  ← T8's
 *     investmentsRow highlight now aliases the SINGLE market row
 *     (CG-0MSTOATDT009BRX2 — the two market rows were merged)
 *   T10 (developmentRow, index 9)  T11 (endTurnButton, index 10)
 *   T12 (developmentRow, index 11)  T13 (developmentRow, index 12)
 *   T14 (hand, index 13)  T15 (hud, index 14)
 *   T16 (challengePanel, index 15)  T17 (completionModal, index 16)
 *
 * Screenshots are still captured for visual regression review (red reference
 * rects are drawn at depth 250 as diagnostics), but geometry is now asserted.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { page } from '@vitest/browser/context';

import {
  UNIFIED_TUTORIAL_STEPS,
  type TutorialHighlightZone,
} from '../../example-games/main-street/TutorialFlow';
import { STANDARD_TUTORIAL_SCENARIO } from '../../example-games/main-street/TutorialScenario';
import { MARKET_TOTAL_SLOTS } from '../../example-games/main-street/MainStreetCards';
import {
  CHALLENGE_LINE_H,
  CHALLENGE_PAD,
  CHALLENGE_TITLE_H,
} from '../../example-games/main-street/scenes/MainStreetConstants';

// ── Constants ───────────────────────────────────────────────

/**
 * Per-edge alignment tolerance (px). AC 2 allows ≤ 4–6 px per edge; 6 px
 * gives headroom for layout rounding while still catching the multi-pixel
 * misalignments this test was written to prevent (hand 152px, street 17px,
 * dev row 16px, ...).
 */
const TOLERANCE_PX = 6;

/** Zones that must NOT draw a highlight bounding box. */
const NULL_ZONES: ReadonlySet<TutorialHighlightZone> = new Set([
  'centerModal',
  'completionModal',
]);

/** Card-level zones resolved through the deterministic tutorial scenario. */
const CARD_LEVEL_TEMPLATES: Partial<Record<TutorialHighlightZone, string>> = {
  laundromatCard: 'biz-laundromat',
  festivalCard: 'evt-festival',
};

// ── Shared game (single boot — Phaser 4 ~8 create/destroy cycles per process) ──

let game: Phaser.Game | null = null;
let scene: Phaser.Scene & Record<string, unknown>;
let refRects: Phaser.GameObjects.Graphics[] = [];

async function bootGame(): Promise<void> {
  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container', width: 1280, height: 720 });
  await waitForScene(game, 'MainStreetScene');

  scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
  expect(scene).toBeTruthy();
}

function destroyGame(): void {
  if (game) {
    game.destroy(true, false);
  }
  game = null;
  const container = document.getElementById('game-container');
  if (container) container?.remove();
}

// ── Target-rect computation (renderer geometry is the source of truth) ──

/**
 * Compute the development row's card startX, mirroring
 * MainStreetRenderer.refreshMarket()/drawMarketRow() exactly.
 */
function computeDevStartX(layout: Record<string, number>): number {
  const boxLeft = 20;
  const boxRight = (layout.logX ?? 0) - 20;
  const boxCenter = (boxLeft + boxRight) / 2;
  const devTotalCardsW =
    MARKET_TOTAL_SLOTS * layout.marketCardW +
    (MARKET_TOTAL_SLOTS - 1) * layout.marketCardGap;
  return Math.round(boxCenter - devTotalCardsW / 2);
}

/**
 * Compute the actual rendered rect of the UI element a tutorial highlight
 * zone points at, from `scene.layout` + shared constants + live state —
 * mirroring MainStreetRenderer / MainStreetLayoutAdapter math.
 */
function computeTargetRect(
  zone: TutorialHighlightZone,
  sceneObj: Phaser.Scene & Record<string, unknown>,
): { x: number; y: number; w: number; h: number } | null {
  const layout = sceneObj.layout as Record<string, number> | undefined;
  if (!layout) return null;
  const gameW = layout.gameW;
  const s = sceneObj as any;

  switch (zone) {
    case 'hud': {
      // HUD strip: 50% screen width centred at (gameW/2, hudY), 28px tall
      const stripW = Math.round(gameW * 0.5);
      return { x: Math.round((gameW - stripW) / 2), y: layout.hudY - 14, w: stripW, h: 28 };
    }
    case 'developmentRow': {
      // Dev row: market background strip (bgLeft=20 → logX-20), top at marketTop + 6
      return { x: 20, y: layout.marketTop + 6, w: layout.logX - 40, h: layout.marketRowH };
    }
    case 'investmentsRow': {
      // Single-row market (CG-0MSTOATDT009BRX2): upgrade/event steps alias
      // the developmentRow zone — both highlight the one market row strip.
      return { x: 20, y: layout.marketTop + 6, w: layout.logX - 40, h: layout.marketRowH };
    }
    case 'streetGrid': {
      // Street slots: 5×140 + 4×20 wide, 2 rows of 80 + 12 gap
      const gridW = layout.streetCols * layout.slotW + (layout.streetCols - 1) * layout.slotGap;
      const gridH = 2 * layout.slotH + layout.streetRowGap;
      return { x: layout.streetX, y: layout.streetTop, w: gridW, h: gridH };
    }
    case 'endTurnButton': {
      // End Turn button: right-aligned at gameW-24, top at actionY + 4
      const rightX = gameW - 24;
      return {
        x: rightX - layout.actionButtonW,
        y: layout.actionY + 4,
        w: layout.actionButtonW,
        h: layout.actionButtonH,
      };
    }
    case 'helpButton': {
      // Hint button: to the left of End Turn with a 12px gap
      const rightX = gameW - 24;
      return {
        x: rightX - layout.actionButtonW - 12 - layout.hintButtonW,
        y: layout.actionY + 4,
        w: layout.hintButtonW,
        h: layout.actionButtonH,
      };
    }
    case 'incidentQueue': {
      // Incident queue panel — mirror refreshIncidentQueue() panel math with
      // the LIVE state (boot: single face-down deck stack + count, 0 effects
      // → 125px, CG-0MSXOWLHU0099QF6).
      const effects = s?.state?.activeEffects ?? [];
      const titleH = 22;
      const pad = 8;
      const cardAreaH = layout.queueCardH + 6 + 12;
      const extraH = effects.length > 0 ? 16 + effects.length * 16 : 0;
      const panelH = titleH + pad + cardAreaH + extraH + pad;
      return { x: layout.logX, y: layout.queueTop, w: layout.logW, h: panelH };
    }
    case 'challengePanel': {
      // Challenge panel — mirror refreshChallengeTracker() panel math with the
      // LIVE challenge count (Easy tutorial: 2 → 72px; Medium boot: 3 → 92px).
      const challenges = s?.state?.activeChallenges;
      if (!Array.isArray(challenges) || challenges.length === 0) return null;
      const panelH = CHALLENGE_TITLE_H + challenges.length * CHALLENGE_LINE_H + CHALLENGE_PAD * 2;
      return { x: layout.challengeX, y: layout.challengeY, w: layout.challengeW, h: panelH };
    }
    case 'hand': {
      // HandView row centred on handCenterX, covering up to maxHandSize (2)
      // cards: width = 2×handCardW + 8 (spacing gap), top at handY.
      const handW = 2 * layout.handCardW + 8;
      return {
        x: layout.handCenterX - Math.round(handW / 2),
        y: layout.handY,
        w: handW,
        h: layout.handCardH,
      };
    }
    case 'laundromatCard':
    case 'festivalCard': {
      // Card-level zones: deterministic single-row scenario slots, same math
      // as resolveMarketCardAnchor() — every card sits on the one market row.
      const templateId = CARD_LEVEL_TEMPLATES[zone];
      if (!templateId) return null;
      const rowIndex = STANDARD_TUTORIAL_SCENARIO.market.cards.indexOf(templateId);
      if (rowIndex < 0) return null;
      const devStartX = computeDevStartX(layout);
      return {
        x: devStartX + rowIndex * (layout.marketCardW + layout.marketCardGap),
        y: layout.marketTop + 6,
        w: layout.marketCardW,
        h: layout.marketCardH,
      };
    }
    case 'actionButtons': {
      // Community Favour action-bar band (CG-0MSTOATDQ005XDET): the two
      // favour buttons span the SLL zone in the main-street-tutorial layout
      // (x 0.365625..0.639063 at y 0.905556..0.952778 → px at 1280×720).
      // Mirror the tutorial layout JSON used by resolveZoneToAnchor.
      const x = Math.round(0.365625 * gameW);
      const w = Math.round(0.273438 * gameW);
      return {
        x,
        y: layout.actionY + 4,
        w,
        h: layout.actionButtonH,
      };
    }
    default:
      return null;
  }
}

// ── Highlight extraction helpers ────────────────────────────

/**
 * Extract the filled rectangle bounds from a Graphics object's commandBuffer.
 * Phaser.Graphics does not implement getBounds(), so we parse the raw
 * commands (FILL_RECT = command 3): [FILL_RECT, x, y, width, height].
 */
function getHighlightBounds(
  g: Phaser.GameObjects.Graphics,
): { x: number; y: number; w: number; h: number } | null {
  const commandBuffer = (g as any).commandBuffer as unknown[];
  if (!Array.isArray(commandBuffer) || commandBuffer.length === 0) return null;

  for (let i = 0; i < commandBuffer.length - 4; i++) {
    if (commandBuffer[i] === 3) {
      const x = commandBuffer[i + 1] as number;
      const y = commandBuffer[i + 2] as number;
      const w = commandBuffer[i + 3] as number;
      const h = commandBuffer[i + 4] as number;
      if (typeof x === 'number' && typeof y === 'number' && typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
        return { x, y, w, h };
      }
    }
  }
  return null;
}

/**
 * Assert the highlight rect aligns with the target rect: every edge within
 * TOLERANCE_PX of the corresponding target edge.
 */
function assertAligned(
  actual: { x: number; y: number; w: number; h: number },
  target: { x: number; y: number; w: number; h: number },
  label: string,
): void {
  const dxLeft = Math.abs(actual.x - target.x);
  const dyTop = Math.abs(actual.y - target.y);
  const dxRight = Math.abs(actual.x + actual.w - (target.x + target.w));
  const dyBottom = Math.abs(actual.y + actual.h - (target.y + target.h));
  // Keep the logged diagnostic (actual-vs-target) for manual review.
  console.log(
    `[align:${label}] actual={x:${actual.x},y:${actual.y},w:${actual.w},h:${actual.h}} ` +
    `target={x:${target.x},y:${target.y},w:${target.w},h:${target.h}} ` +
    `dxLeft=${dxLeft} dyTop=${dyTop} dxRight=${dxRight} dyBottom=${dyBottom} (tol=${TOLERANCE_PX}px)`,
  );
  expect(dxLeft, `${label}: left edge within ${TOLERANCE_PX}px`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(dyTop, `${label}: top edge within ${TOLERANCE_PX}px`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(dxRight, `${label}: right edge within ${TOLERANCE_PX}px`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(dyBottom, `${label}: bottom edge within ${TOLERANCE_PX}px`).toBeLessThanOrEqual(TOLERANCE_PX);
}

/**
 * Draw a reference rectangle onto the scene's graphics layer.
 * Uses depth 250 (above the highlight at depth 199) so it's clearly visible
 * in the diagnostic screenshot.
 */
function drawReferenceRect(
  sceneObj: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Graphics {
  const ref = sceneObj.add.graphics();
  (ref as any).setDepth(250);
  ref.lineStyle(2, 0xff0000, 1.0);
  ref.strokeRect(x, y, w, h);
  return ref;
}

/**
 * Save a screenshot of the game canvas.
 */
async function saveScreenshot(name: string): Promise<void> {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
  expect(canvas).toBeTruthy();
  if (canvas) {
    console.log(`[screenshot:${name}] canvas=${canvas.width}x${canvas.height}`);
    await page.screenshot({ path: `__screenshots__/TutorialOverlayHighlights.browser.test.ts/${name}.png` });
  }
}

/**
 * Trigger a specific tutorial step and return the highlight graphics.
 */
function triggerStepAndGetHighlight(
  sceneObj: Phaser.Scene & Record<string, unknown>,
  stepIndex: number,
): Promise<Phaser.GameObjects.Graphics | null> {
  const mgr = sceneObj.tutorialOverlay as {
    showStep?: (index: number) => void;
    dismiss?: () => void;
    objects?: Phaser.GameObjects.GameObject[];
  };

  if (!mgr || typeof mgr.showStep !== 'function') {
    return Promise.resolve(null);
  }

  // Clear existing objects
  if (typeof mgr.dismiss === 'function') {
    mgr.dismiss();
  }

  // Wait a frame for cleanup
  return new Promise<Phaser.GameObjects.Graphics | null>((resolve) => {
    setTimeout(() => {
      if (typeof mgr.showStep !== 'function') {
        resolve(null);
        return;
      }
      mgr.showStep(stepIndex);

      // Wait one frame for the highlight to be drawn
      requestAnimationFrame(() => {
        // Find highlight graphics at depth 199
        const highlights = sceneObj.children.list.filter(
          (obj): obj is Phaser.GameObjects.Graphics =>
            obj instanceof Phaser.GameObjects.Graphics && (obj as any).depth === 199,
        );

        resolve(highlights.length > 0 ? highlights[0] : null);
      });
    }, 50);
  }).catch(() => null);
}

// ── Tests ────────────────────────────────────────────────────

describe('Tutorial overlay highlight alignment (renderer geometry)', () => {
  beforeAll(async () => {
    await bootGame();
    // Allow the first day phase / state to settle before stepping through.
    await new Promise((r) => setTimeout(r, 200));
  });

  afterEach(() => {
    for (const rect of refRects) {
      try { rect.destroy(); } catch (_) { /* ignore */ }
    }
    refRects = [];
  });

  afterAll(() => {
    destroyGame();
  });

  /** All 17 steps with their highlight zones (null zones have no rect). */
  const alignmentSteps = UNIFIED_TUTORIAL_STEPS
    .map((step, index) => ({ id: step.id, stepIndex: index, zone: step.highlightZone }))
    .filter((s) => !NULL_ZONES.has(s.zone));

  /**
   * Show the step, resolve the actual highlight rect and the target element
   * rect (renderer geometry), assert per-edge alignment, and keep the
   * screenshot (with a red reference rect) as a diagnostic.
   */
  async function verifyStepAlignment(
    id: string,
    stepIndex: number,
    zone: TutorialHighlightZone,
  ): Promise<void> {
    const label = `${id} (${zone})`;
    const target = computeTargetRect(zone, scene);
    expect(target, `${label}: target rect from renderer geometry`).toBeTruthy();

    const highlight = await triggerStepAndGetHighlight(scene, stepIndex);
    expect(highlight, `${label}: highlight graphics drawn`).toBeTruthy();

    const actual = getHighlightBounds(highlight!);
    expect(actual, `${label}: highlight rect present`).toBeTruthy();

    assertAligned(actual!, target!, label);

    // Draw the reference rect and capture the screenshot as a diagnostic.
    const ref = drawReferenceRect(scene, target!.x, target!.y, target!.w, target!.h);
    refRects.push(ref);
    await saveScreenshot(`${id}-${zone}`);
  }

  it.each(alignmentSteps.map((s) => [s.id, s.stepIndex, s.zone] as const))(
    'step %s highlight (%s) aligns with its target element (≤ 6px per edge)',
    async (id, stepIndex, zone) => {
      await verifyStepAlignment(id, stepIndex, zone);
    },
    60_000,
  );

  it('completionModal (T18) draws no highlight', async () => {
    const mgr = scene.tutorialOverlay as {
      showStep?: (index: number) => void;
      dismiss?: () => void;
    };
    expect(mgr).toBeTruthy();
    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }
      mgr.showStep(17); // T18 = completionModal (confirm gate)
      await new Promise((r) => setTimeout(r, 50));

      const highlights = scene.children.list.filter(
        (obj): obj is Phaser.GameObjects.Graphics =>
          obj instanceof Phaser.GameObjects.Graphics && (obj as any).depth === 199,
      );
      expect(highlights.length).toBe(0);
    }
    await saveScreenshot('completion-modal-no-highlight');
  }, 30_000);

  it.each(UNIFIED_TUTORIAL_STEPS.map((s) => [s.id, s.highlightZone] as const))(
    'step %s has a valid highlightZone: %s',
    (_stepId, zone) => {
      const validZones: TutorialHighlightZone[] = [
        'centerModal',
        'hud',
        'marketBusinessRow',
        'developmentRow',
        'streetGrid',
        'endTurnButton',
        'incidentQueue',
        'investmentsRow',
        'challengePanel',
        'helpButton',
        'completionModal',
        'hand',
        'actionButtons',
        'laundromatCard',
        'festivalCard',
      ];
      expect(validZones).toContain(zone);
    },
  );
});
