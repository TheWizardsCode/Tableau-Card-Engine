/**
 * Browser tests for MainStreetTutorialOverlayManager highlight zones.
 *
 * Validates that the highlight rectangles drawn by showStep
 * cover the correct UI areas for each TutorialHighlightZone in the
 * unified T1–T13 tutorial system.
 *
 * Unified step mapping:
 *   0=T1 centerModal(confirm)  1=T2 hud(confirm)  2=T3 marketBusinessRow(action)
 *   3=T4 streetGrid(action)  4=T5 incidentQueue(confirm)  5=T6 endTurnButton(action)
 *   6=T7 investmentsRow(action)  7=T8 investmentsRow(confirm)  8=T9 centerModal(confirm)
 *   9=T10 endTurnButton(confirm)  10=T11 challengePanel(confirm)  11=T12 hud(confirm)
 *   12=T13 completionModal(confirm)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import {
  UNIFIED_TUTORIAL_STEPS,
  type TutorialHighlightZone,
} from '../../example-games/main-street/TutorialFlow';

/**
 * Bootstrap a Main Street game and return the scene.
 */
async function bootGame(): Promise<{
  game: Phaser.Game;
  scene: Phaser.Scene & Record<string, unknown>;
}> {
  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'MainStreetScene');

  const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
  expect(scene).toBeTruthy();
  expect((scene.sys as any).isActive()).toBe(true);

  return { game, scene };
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container?.remove();
}

/**
 * Find highlight graphics (green semi-transparent rectangles) in the scene.
 * Filter by the expected TOOLTIP_DEPTH - 1 = 199.
 */
function findHighlightGraphics(
  scene: Phaser.Scene,
): Phaser.GameObjects.Graphics[] {
  return (
    scene.children.list.filter(
      (obj): obj is Phaser.GameObjects.Graphics =>
        obj instanceof Phaser.GameObjects.Graphics && (obj as any).depth === 199,
    ) as Phaser.GameObjects.Graphics[]
  );
}

describe('TutorialOverlayManager highlight zones', () => {
  let game: Phaser.Game | null = null;
  let scene: Phaser.Scene & Record<string, unknown>;

  beforeEach(async () => {
    ({ game, scene } = await bootGame());
  });

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  /**
   * Resolve a step ID to its index in UNIFIED_TUTORIAL_STEPS.
   */
  function stepIdToIndex(stepId: string): number {
    const idx = UNIFIED_TUTORIAL_STEPS.findIndex((s) => s.id === stepId);
    expect(idx >= 0, `Step ${stepId} not found in unified steps`).toBe(true);
    return idx;
  }

  /**
   * Show a tutorial step (by step ID) and return the highlight graphics,
   * or null if this step has a null highlight zone.
   */
  function showStepAndGetHighlight(stepId: string): Phaser.GameObjects.Graphics | null {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };
    if (!mgr || typeof mgr.showStep !== 'function') {
      return null;
    }

    // Clear existing highlights first
    if (typeof mgr.dismiss === 'function') {
      mgr.dismiss();
    }

    const stepIndex = stepIdToIndex(stepId);
    mgr.showStep(stepIndex);

    // Find highlight graphics at depth 199
    const highlights = findHighlightGraphics(scene);
    if (highlights.length === 0) return null;

    return highlights[0];
  }

  /**
   * Extract the filled rectangle bounds from a Graphics object's commandBuffer.
   * Phaser.Graphics does not implement getBounds(), so we parse the raw commands.
   */
  function getHighlightBounds(
    g: Phaser.GameObjects.Graphics,
  ): { x: number; y: number; w: number; h: number } | null {
    const commandBuffer = (g as any).commandBuffer as unknown[];
    if (!Array.isArray(commandBuffer) || commandBuffer.length === 0) {
      return null;
    }

    // FILL_RECT command is the number 3 (from Phaser Commands enum)
    // Structure: [FILL_RECT, x, y, width, height]
    for (let i = 0; i < commandBuffer.length - 4; i++) {
      const cmd = commandBuffer[i];
      if (cmd === 3) { // FILL_RECT
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

  // ── AC 1: HUD highlight ────────────────────────────────────

  it('HUD highlight (T2) starts at hudY and covers the HUD strip', async () => {
    const layout = scene.layout as { hudY: number; gameW: number } | undefined;
    expect(layout).toBeTruthy();
    expect(layout!.hudY).toBeGreaterThan(0);

    const highlight = showStepAndGetHighlight('T2'); // T2 = confirm, hud zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    const hudY = layout!.hudY;
    // The highlight should start at hudY - 14 (top of the 28px HUD strip)
    expect(bounds!.y).toBeLessThanOrEqual(hudY + 2);
    expect(bounds!.y).toBeGreaterThanOrEqual(hudY - 16);

    // HUD strip is now 50% screen width (centered) after the layout refinement
    expect(bounds!.w).toBeLessThan(layout!.gameW * 0.55);
    expect(bounds!.w).toBeGreaterThan(layout!.gameW * 0.45);

    // Height should be reasonable for a single HUD row (28px strip + padding = ~34px)
    // Should NOT be the full screen height or more than 60px
    expect(bounds!.h).toBeLessThan(60);
    expect(bounds!.h).toBeGreaterThan(20);
  });

  // ── AC 2: Market rows highlight ─────────────────────────────

  it('Market rows highlight (T3) covers BOTH business and investments rows', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T3'); // T3 = action, marketBusinessRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // The market has TWO rows: business (top) + investments (bottom)
    // The highlight height should cover both rows
    const expectedMinH = 2 * layout!.marketRowH + layout!.marketRowGap;

    expect(bounds!.h).toBeGreaterThanOrEqual(expectedMinH);

    // The highlight should start near marketTop (within ~10px for padding)
    const tolerance = 10;
    expect(bounds!.y).toBeLessThanOrEqual(layout!.marketTop + tolerance);
  });

  // ── AC 3: Street grid highlight ─────────────────────────────

  it('Street grid highlight (T4) covers the 2x5 grid area', async () => {
    const layout = scene.layout as {
      streetTop: number;
      streetX: number;
      slotW: number;
      slotH: number;
      slotGap: number;
      streetCols: number;
      streetRowGap: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T4'); // T4 = action, streetGrid zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Width should cover the full street grid width
    const expectedW = layout!.streetCols * layout!.slotW + (layout!.streetCols - 1) * layout!.slotGap;
    expect(bounds!.w).toBeGreaterThanOrEqual(expectedW - 10); // small tolerance

    // Height should cover both rows
    const expectedH = 2 * layout!.slotH + layout!.streetRowGap;
    expect(bounds!.h).toBeGreaterThanOrEqual(expectedH - 10);
  });

  // ── AC 4: End turn button highlight ─────────────────────────

  it('End turn button highlight (T6) covers the action button area', async () => {
    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      actionButtonW: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T6'); // T6 = action, endTurnButton zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should be in the bottom-right area
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.actionY - 10);
    expect(bounds!.h).toBeGreaterThan(layout!.actionButtonH - 10);
  });

  // ── AC 5: Incident queue highlight ──────────────────────────

  it('Incident queue highlight (T5) covers the queue area', async () => {
    const layout = scene.layout as {
      queueTop: number;
      queueCardH: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T5'); // T5 = confirm, incidentQueue zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should start near queueTop
    const tolerance = 10;
    expect(bounds!.y).toBeLessThanOrEqual(layout!.queueTop + tolerance);

    // Height should cover at least one card
    expect(bounds!.h).toBeGreaterThanOrEqual(layout!.queueCardH - 5);
  });

  // ── AC 6: Investments row highlight (T7/T8/T12) ─────────────

  it('Investments row highlight (T7) covers the bottom market row', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T7'); // T7 = action, investmentsRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // The investments row is the second (bottom) market row
    // Source code positions it at: marketTop + marketRowH + marketRowGap
    const expectedTopY = layout!.marketTop + layout!.marketRowH + layout!.marketRowGap;
    expect(bounds!.y).toBeLessThanOrEqual(expectedTopY + 4); // small tolerance for rendering
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 7: Help button highlight ─────────────────────────────

  it('Help button highlight (T10) covers the help button area', async () => {
    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T10'); // T10 = action, helpButton zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Help button is in the bottom-left action area
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.actionY - 10);
  });

  // ── AC 9: centerModal zone (null anchor, no highlight) ──────

  it('centerModal zone (T1) returns null anchor (no highlight graphics drawn)', async () => {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };

    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      mgr.showStep(stepIdToIndex('T1'));

      // centerModal should not draw any highlight graphics at depth 199
      const highlights = findHighlightGraphics(scene);
      expect(highlights.length).toBe(0);
    }
  });

  // ── AC 10: centerModal zone for T9 (non-gated, confirm) ─────

  it('centerModal zone (T9) returns null anchor (no highlight graphics drawn)', async () => {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };

    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      mgr.showStep(stepIdToIndex('T9'));

      // centerModal should not draw any highlight graphics at depth 199
      const highlights = findHighlightGraphics(scene);
      expect(highlights.length).toBe(0);
    }
  });

  // ── AC 11: completionModal zone (null anchor, no highlight) ──

  it('completionModal zone (T13) returns null anchor (no highlight graphics drawn)', async () => {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };

    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      mgr.showStep(stepIdToIndex('T13'));

      // completionModal should not draw any highlight graphics at depth 199
      const highlights = findHighlightGraphics(scene);
      expect(highlights.length).toBe(0);
    }
  });

  // ── AC 12: T8 investments row highlight (action-gated upgrade) ──

  it('investmentsRow highlight (T8) covers the investments row for upgrade action', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T8'); // T8 = action, investmentsRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // The investments row is the second (bottom) market row
    const expectedTopY = layout!.marketTop + layout!.marketRowH + layout!.marketRowGap;
    expect(bounds!.y).toBeLessThanOrEqual(expectedTopY + 4);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 13: T11 challengePanel highlight (confirm, challenges info) ──

  it('challengePanel highlight (T11) covers the challenge panel area', async () => {
    const layout = scene.layout as {
      challengeX: number;
      challengeY: number;
      challengeW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T11'); // T11 = confirm, challengePanel zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should be in the right sidebar area
    expect(bounds!.x).toBeGreaterThanOrEqual(layout!.challengeX - 5);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.challengeY - 5);
    expect(bounds!.w).toBeGreaterThan(0);
    expect(bounds!.h).toBeGreaterThan(0);
  });

  // ── AC 14: T12 HUD highlight (confirm, challenges info) ──

  it('HUD highlight (T12) covers the HUD area for challenges info', async () => {
    const layout = scene.layout as { hudY: number; gameW: number } | undefined;
    expect(layout).toBeTruthy();
    expect(layout!.hudY).toBeGreaterThan(0);

    const highlight = showStepAndGetHighlight('T12'); // T12 = confirm, hud zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    const hudY = layout!.hudY;
    // The highlight should cover the HUD strip (28px tall, centered at hudY)
    expect(bounds!.y).toBeLessThanOrEqual(hudY + 2);
    expect(bounds!.y).toBeGreaterThanOrEqual(hudY - 16);

    // HUD strip is now 50% screen width (centered) after the layout refinement
    expect(bounds!.w).toBeLessThan(layout!.gameW * 0.55);
    expect(bounds!.w).toBeGreaterThan(layout!.gameW * 0.45);

    // Height should be reasonable for a HUD strip
    expect(bounds!.h).toBeLessThan(60);
    expect(bounds!.h).toBeGreaterThan(20);
  });

  // ── Coverage: all 13 unified steps have valid highlight zones ─

  it.each(UNIFIED_TUTORIAL_STEPS.map((s) => [s.id, s.highlightZone]))(
    'step %s has valid highlightZone: %s',
    (_stepId, zone) => {
      const validZones: TutorialHighlightZone[] = [
        'centerModal',
        'hud',
        'marketBusinessRow',
        'streetGrid',
        'endTurnButton',
        'incidentQueue',
        'investmentsRow',
        'helpButton',
        'challengePanel',
        'completionModal',
      ];
      expect(validZones).toContain(zone);
    },
  );
});
