/**
 * Tutorial overlay highlight alignment visual regression test.
 *
 * Boots the Main Street game, triggers each tutorial step,
 * and captures a screenshot that shows:
 *   - The green highlight rectangle (depth 199) as drawn by the overlay
 *   - A red reference rectangle drawn by this test showing where the
 *     actual UI element should be
 *
 * Unified step mapping for screenshot tests (16 steps):
 *   T2 (developmentRow, index 1)  T3 (laundromatCard, index 2)
 *   T4 (hand, index 3)  T5 (streetGrid, index 4)
 *   T6 (incidentQueue, index 5)  T7 (endTurnButton, index 6)
 *   T8 (investmentsRow, index 7)  T9 (festivalCard, index 8)
 *   T10 (developmentRow, index 9)  T11 (endTurnButton, index 10)
 *   T12 (developmentRow, index 11)  T13 (hand, index 12)
 *   T14 (hud, index 13)  T15 (challengePanel, index 14)
 *   T16 (completionModal, index 15)
 *
 * This allows visual verification that the highlights are correctly
 * aligned with their target UI elements.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { page } from '@vitest/browser/context';

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
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container', width: 1280, height: 720 });
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

  it('screenshot: HUD highlight (step T14, Success and Failure)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as { hudY: number; gameW: number } | undefined;
    expect(layout).toBeTruthy();

    const hudY = layout!.hudY; // 50
    const gameW = layout!.gameW; // 1280
    const hudW = Math.round(gameW * 0.5); // 50% screen width (centered)
    const hudX = Math.round((gameW - hudW) / 2);
    const expectedRef = {
      x: hudX,
      y: hudY - 14, // HUD strip top (rectangle center at hudY, height 28)
      w: hudW,
      h: 28,        // Actual HUD strip height
    };

    const highlight = await captureStepScreenshot(13, 'hud-highlight-t14', expectedRef);

    // Log the actual highlight bounds for debugging
    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) { // FILL_RECT
          console.log(
            `[screenshot:hud-highlight-t14] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Development Row highlight (step T2)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      gameW: number;
      logX: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const logX = layout!.logX;
    const bgRight = logX - 20; // 940
    const expectedRef = {
      x: 20,
      y: layout!.marketTop, // dev row top
      w: bgRight - 20,
      h: layout!.marketRowH,
    };

    const highlight = await captureStepScreenshot(1, 'dev-row-highlight-t2', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:dev-row-highlight-t2] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Street grid highlight (step T5)', async () => {
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

    const highlight = await captureStepScreenshot(4, 'street-highlight-t5', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:street-highlight-t5] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: End turn button highlight (step T7)', async () => {
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

    const highlight = await captureStepScreenshot(6, 'end-turn-highlight-t7', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:end-turn-highlight-t7] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Incident queue highlight (step T6)', async () => {
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
      logW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const expectedRef = {
      x: layout!.logX,
      y: layout!.queueTop - 6,
      w: layout!.logW,
      h: layout!.queueCardH + 16,
    };

    const highlight = await captureStepScreenshot(5, 'incident-queue-highlight-t6', expectedRef);

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:incident-queue-highlight-t6] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}} ref={x:${expectedRef.x},y:${expectedRef.y},w:${expectedRef.w},h:${expectedRef.h}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Investments row highlight (step T8)', async () => {
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
      logX: number;
    } | undefined;
    expect(layout).toBeTruthy();

    // Investments row width matches the market background box (extends to logX-20)
    const logX = layout!.logX;
    const bgRight = logX - 20; // 940
    const expectedRef = {
      x: 20,
      y: layout!.marketTop + layout!.marketRowH + layout!.marketRowGap,
      w: bgRight - 20,
      h: layout!.marketRowH,
    };

    const highlight = await captureStepScreenshot(7, 'investments-highlight-t8', expectedRef);

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



  // ── Additional unified step screenshots (T12, T15, T16) ──

  it('screenshot: Challenge panel highlight (step T15)', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    // T15 is index 14 in the unified steps (confirm gate, challengePanel zone)
    // The challengePanel zone is defined in the SLL layout.
    const highlight = await captureStepScreenshot(14, 'challenge-panel-highlight-t15');

    const cmdBuf = (highlight as any)?.commandBuffer as unknown[];
    if (cmdBuf && Array.isArray(cmdBuf)) {
      for (let i = 0; i < cmdBuf.length - 4; i++) {
        if (cmdBuf[i] === 3) {
          console.log(
            `[screenshot:challenge-panel-highlight-t15] actual={x:${cmdBuf[i+1]},y:${cmdBuf[i+2]},w:${cmdBuf[i+3]},h:${cmdBuf[i+4]}}`,
          );
          break;
        }
      }
    }
  }, 30_000);

  it('screenshot: Completion modal (step T16) draws no highlight', async () => {
    ({ game, scene } = await bootGame());
    await new Promise((r) => setTimeout(r, 200));

    const mgr = scene.tutorialOverlay as {
      showStep?: (index: number) => void;
      dismiss?: () => void;
    };

    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      // T16 is index 15 in the unified steps (confirm gate, completionModal zone)
      mgr.showStep(15);

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

  // ── Coverage: all 16 unified steps have valid highlight zones ─

  it.each(UNIFIED_TUTORIAL_STEPS.map((s) => [s.id, s.highlightZone]))(
    'step %s has valid highlightZone: %s',
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
        'laundromatCard',
        'festivalCard',
      ];
      expect(validZones).toContain(zone);
    },
  );
});
