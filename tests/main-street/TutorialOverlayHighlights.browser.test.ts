/**
 * Tutorial overlay highlight alignment visual regression test.
 *
 * Boots the Main Street game, triggers each action-gated tutorial step,
 * and captures a screenshot that shows:
 *   - The green highlight rectangle (depth 199) as drawn by the overlay
 *   - A red reference rectangle drawn by this test showing where the
 *     actual UI element should be
 *
 * Unified step mapping for screenshot tests:
 *   T2 (hud, index 1)  T3 (marketBusinessRow, index 2)
 *   T4 (streetGrid, index 3)  T5 (incidentQueue, index 4)
 *   T6 (endTurnButton, index 5)  T12 (investmentsRow, index 11)
 *   T10 (helpButton, index 9)  T13 (completionModal, index 12)
 *
 * This allows visual verification that the highlights are correctly
 * aligned with their target UI elements.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { page } from '@vitest/browser/context';
import { MARKET_BUSINESS_SLOTS } from '../../example-games/main-street/MainStreetCards';
import {
  UNIFIED_TUTORIAL_STEPS,
  type TutorialHighlightZone,
} from '../../example-games/main-street/TutorialFlow';

// ── Helpers ──────────────────────────────────────────────────

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
  const game = createMainStreetGame({ parent: 'game-container', width: 1280, height: 720 });
  await waitForScene(game, 'MainStreetScene');

  const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
  expect(scene).toBeTruthy();
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
 * Draw a reference rectangle onto the scene's graphics layer.
 * Uses depth 250 (above the highlight at depth 199) so it's clearly visible.
 */
function drawReferenceRect(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Graphics {
  const ref = scene.add.graphics();
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
 * Helper: trigger a specific tutorial step and return the highlight graphics.
 */
function triggerStepAndGetHighlight(
  scene: Phaser.Scene & Record<string, unknown>,
  stepIndex: number,
): Promise<Phaser.GameObjects.Graphics | null> {
  const mgr = scene.tutorialOverlay as {
    showActionGatedStep?: (controller: unknown) => void;
    dismiss?: () => void;
    objects?: Phaser.GameObjects.GameObject[];
  };

  if (!mgr || typeof mgr.showActionGatedStep !== 'function') {
    return Promise.resolve(null);
  }

  // Clear existing objects
  if (typeof mgr.dismiss === 'function') {
    mgr.dismiss();
  }

  // Wait a frame for cleanup
  return new Promise<Phaser.GameObjects.Graphics | null>((resolve) => {
    setTimeout(() => {
      // Create a minimal controller state
      const controller = {
        isActive: true,
        currentStepIndex: stepIndex,
        lastCompletedStepId: null,
        exited: false,
      };

      (mgr as { showActionGatedStep: (c: unknown) => void }).showActionGatedStep(controller);

      // Wait one frame for the highlight to be drawn
      requestAnimationFrame(() => {
        // Find highlight graphics at depth 199
        const highlights = scene.children.list.filter(
          (obj): obj is Phaser.GameObjects.Graphics =>
            obj instanceof Phaser.GameObjects.Graphics && (obj as any).depth === 199,
        );

        if (highlights.length > 0) {
          resolve(highlights[0]);
        } else {
          resolve(null);
        }
      });
    }, 50);
  }).catch(() => null);
}

// ── Tests ────────────────────────────────────────────────────

describe('Tutorial overlay highlight alignment (screenshot)', () => {
  let game: Phaser.Game | null = null;
  let scene: Phaser.Scene & Record<string, unknown>;
  let refRects: Phaser.GameObjects.Graphics[] = [];

  afterEach(() => {
    for (const rect of refRects) {
      try { rect.destroy(); } catch (_) { /* ignore */ }
    }
    refRects = [];
    destroyGame(game);
    game = null;
  });

  /**
   * Capture a screenshot showing the highlight overlay for a given step index.
   */
  async function captureStepScreenshot(
    stepIndex: number,
    name: string,
    expectedRef?: { x: number; y: number; w: number; h: number },
  ): Promise<Phaser.GameObjects.Graphics | null> {
    // Clear previous reference rectangles
    for (const rect of refRects) {
      try { rect.destroy(); } catch (_) { /* ignore */ }
    }
    refRects = [];

    const highlight = await triggerStepAndGetHighlight(scene, stepIndex);
    expect(highlight).toBeTruthy();

    // Draw a reference rectangle at the expected position if provided
    if (expectedRef) {
      const ref = drawReferenceRect(scene, expectedRef.x, expectedRef.y, expectedRef.w, expectedRef.h);
      refRects.push(ref);
    }

    await saveScreenshot(name);
    return highlight;
  }

  it('screenshot: HUD highlight (step T2)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as { hudY: number } | undefined;
    expect(layout).toBeTruthy();

    const hudY = layout!.hudY; // 50
    const expectedRef = {
      x: 0,
      y: hudY - 14, // HUD strip top (rectangle center at hudY, height 28)
      w: 1280,
      h: 28,        // Actual HUD strip height
    };

    const highlight = await captureStepScreenshot(1, 'hud-highlight', expectedRef);

    // Log the actual highlight bounds for debugging
    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) { // FILL_RECT
          console.log(
            `[screenshot:hud-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Market highlight (step T3)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
      marketLabelW: number;
      marketCardW: number;
      marketCardGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const marketTop = layout!.marketTop;
    const totalH = 2 * layout!.marketRowH + layout!.marketRowGap + 20;

    // Calculate correct market width from card layout
    const marketStartX = layout!.marketLabelW + 50;
    const marketRight = marketStartX + (MARKET_BUSINESS_SLOTS - 1) * (layout!.marketCardW + layout!.marketCardGap) + layout!.marketCardW + 20;
    const expectedRef = {
      x: 20,
      y: marketTop - 10,
      w: marketRight - 20,
      h: totalH,
    };

    const highlight = await captureStepScreenshot(2, 'market-highlight', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:market-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Street grid highlight (step T4)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      streetTop: number;
      slotH: number;
      streetRowGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const expectedRef = {
      x: 0,
      y: layout!.streetTop - 6,
      w: layout!.gameW,
      h: 2 * layout!.slotH + layout!.streetRowGap + 12,
    };

    const highlight = await captureStepScreenshot(3, 'street-highlight', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:street-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: End turn button highlight (step T6)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      actionButtonW: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const rightX = layout!.gameW - 24;
    const expectedRef = {
      x: rightX - layout!.actionButtonW - 20,
      y: layout!.actionY - 4,
      w: layout!.actionButtonW + 20,
      h: layout!.actionButtonH + 8,
    };

    const highlight = await captureStepScreenshot(5, 'end-turn-highlight', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:end-turn-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Incident queue highlight (step T5)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      queueTop: number;
      queueCardH: number;
      queueLabelW: number;
      queueCardW: number;
      queueCardGap: number;
      gameW: number;
      logX: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const expectedRef = {
      x: 20,
      y: layout!.queueTop - 6,
      w: layout!.queueLabelW + 2 * (layout!.queueCardW + layout!.queueCardGap) + 32,
      h: layout!.queueCardH + 16,
    };

    const highlight = await captureStepScreenshot(4, 'incident-queue-highlight', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:incident-queue-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Investments row highlight (step T7)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
      marketLabelW: number;
      marketCardW: number;
      marketCardGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    // Calculate correct investments row width (same as business row)
    const invMarketStartX = layout!.marketLabelW + 50;
    const invMarketRight = invMarketStartX + (MARKET_BUSINESS_SLOTS - 1) * (layout!.marketCardW + layout!.marketCardGap) + layout!.marketCardW + 20;
    const expectedRef = {
      x: 20,
      y: layout!.marketTop + layout!.marketRowH + layout!.marketRowGap,
      w: invMarketRight - 20,
      h: layout!.marketRowH,
    };

    const highlight = await captureStepScreenshot(6, 'investments-highlight', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:investments-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Help button highlight (step T10)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const expectedRef = {
      x: layout!.gameW - 120,
      y: layout!.actionY - 4,
      w: 100,
      h: layout!.actionButtonH + 8,
    };

    const highlight = await captureStepScreenshot(9, 'help-button-highlight', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:help-button-highlight] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  // ── Additional unified step screenshots (T12, T13) ──────────

  it('screenshot: Investments row highlight (step T12)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
      marketLabelW: number;
      marketCardW: number;
      marketCardGap: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    // Calculate correct investments row width (same as business row)
    const invMarketStartX = layout!.marketLabelW + 50;
    const invMarketRight = invMarketStartX + (MARKET_BUSINESS_SLOTS - 1) * (layout!.marketCardW + layout!.marketCardGap) + layout!.marketCardW + 20;
    const expectedRef = {
      x: 20,
      y: layout!.marketTop + layout!.marketRowH + layout!.marketRowGap,
      w: invMarketRight - 20,
      h: layout!.marketRowH,
    };

    // T12 is index 11 in the unified steps (confirm gate, investmentsRow zone)
    const highlight = await captureStepScreenshot(11, 'investments-highlight-t12', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:investments-highlight-t12] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Completion modal (step T13) draws no highlight', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const mgr = scene.tutorialOverlay as {
      showActionGatedStep?: (controller: unknown) => void;
      dismiss?: () => void;
    };

    if (mgr && typeof mgr.showActionGatedStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      // T13 is index 12 in the unified steps (confirm gate, completionModal zone)
      const controller = {
        isActive: true,
        currentStepIndex: 12,
        lastCompletedStepId: null,
        exited: false,
      };

      (mgr as { showActionGatedStep: (c: unknown) => void }).showActionGatedStep(controller);

      // Wait a frame for rendering
      await new Promise((r) => setTimeout(r, 50));

      // completionModal should not draw any highlight graphics at depth 199
      const highlights = scene.children.list.filter(
        (obj): obj is Phaser.GameObjects.Graphics =>
          obj instanceof Phaser.GameObjects.Graphics && (obj as any).depth === 199,
      );
      expect(highlights.length).toBe(0);
    }

    // Save screenshot showing no highlight (for visual regression)
    await saveScreenshot('completion-modal-no-highlight');
  }, 30_000);

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
        'completionModal',
      ];
      expect(validZones).toContain(zone);
    },
  );
});
