/**
 * Browser tests for MainStreetTutorialOverlayManager highlight zones.
 *
 * Validates that the highlight rectangles drawn by showActionGatedStep
 * cover the correct UI areas for each TutorialHighlightZone.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

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
  const game = createMainStreetGame();
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
   * Helper: show an action-gated step and return the highlight graphics.
   */
  function showStepAndGetHighlight(stepIndex: number): Phaser.GameObjects.Graphics | null {
    const mgr = scene.tutorialOverlay as { showActionGatedStep?: (controller: unknown) => void; dismiss?: () => void };
    if (!mgr || typeof mgr.showActionGatedStep !== 'function') {
      return null;
    }

    // Clear existing highlights first
    if (typeof mgr.dismiss === 'function') {
      mgr.dismiss();
    }

    // Create a minimal controller state
    const controller = {
      isActive: true,
      currentStepIndex: stepIndex,
      lastCompletedStepId: null,
      exited: false,
    };

    mgr.showActionGatedStep(controller);

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

  it('HUD highlight starts at hudY and covers the HUD strip', async () => {
    const layout = scene.layout as { hudY: number; gameW: number } | undefined;
    expect(layout).toBeTruthy();
    expect(layout!.hudY).toBeGreaterThan(0);

    const highlight = showStepAndGetHighlight(1); // T2 = HUD
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    const hudY = layout!.hudY;
    // The highlight should start at hudY - 14 (top of the 28px HUD strip)
    expect(bounds!.y).toBeLessThanOrEqual(hudY + 2);
    expect(bounds!.y).toBeGreaterThanOrEqual(hudY - 16);

    // Width should cover most of the screen
    expect(bounds!.w).toBeGreaterThan(layout!.gameW * 0.6);

    // Height should be reasonable for a single HUD row (28px strip + padding = ~34px)
    // Should NOT be the full screen height or more than 60px
    expect(bounds!.h).toBeLessThan(60);
    expect(bounds!.h).toBeGreaterThan(20);
  });

  // ── AC 2: Market rows highlight ─────────────────────────────

  it('Market rows highlight covers BOTH business and investments rows', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight(2); // T3 = market-business-row
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

  it('Street grid highlight covers the 2x5 grid area', async () => {
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

    const highlight = showStepAndGetHighlight(3); // T4 = street-grid
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

  it('End turn button highlight covers the action button area', async () => {
    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      actionButtonW: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight(5); // T6 = end-turn-button
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should be in the bottom-right area
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.actionY - 10);
    expect(bounds!.h).toBeGreaterThan(layout!.actionButtonH - 10);
  });

  // ── AC 5: Incident queue highlight ──────────────────────────

  it('Incident queue highlight covers the queue area', async () => {
    const layout = scene.layout as {
      queueTop: number;
      queueCardH: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight(4); // T5 = incident-queue
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should start near queueTop
    const tolerance = 10;
    expect(bounds!.y).toBeLessThanOrEqual(layout!.queueTop + tolerance);

    // Height should cover at least one card
    expect(bounds!.h).toBeGreaterThanOrEqual(layout!.queueCardH - 5);
  });

  // ── AC 6: Investments row highlight ─────────────────────────

  it('Investments row highlight covers the bottom market row', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight(6); // T7 = investments-row
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

  it('Help button highlight covers the help button area', async () => {
    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight(8); // T9 = help-button
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Help button is in the bottom-left action area
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.actionY - 10);
  });

  // ── AC 8: center-modal zone (null anchor, no highlight) ─────

  it('center-modal zone returns null anchor (no highlight graphics drawn)', async () => {
    const mgr = scene.tutorialOverlay as { showActionGatedStep?: (controller: unknown) => void; dismiss?: () => void };

    if (mgr && typeof mgr.showActionGatedStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      const controller = {
        isActive: true,
        currentStepIndex: 0,
        lastCompletedStepId: null,
        exited: false,
      };
      mgr.showActionGatedStep(controller);

      // center-modal should not draw any highlight graphics at depth 199
      const highlights = findHighlightGraphics(scene);
      expect(highlights.length).toBe(0);
    }
  });
});
