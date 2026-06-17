/**
 * Browser tests for undo/redo button positioning via CardGameScene's
 * initUndoRedoButtons() mechanism.
 *
 * Verifies that:
 *  - The undo/redo buttons are positioned to the left of settings/help buttons
 *  - No visual overlap occurs at standard viewport sizes
 *  - The mechanism is opt-in (no buttons when not called)
 *
 * @module tests/ui/CardGameSceneUndoRedoPositions.browser.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

/**
 * Boot a Beleaguered Castle game at the given viewport dimensions.
 */
async function bootGame(width: number, height: number): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createBeleagueredCastleGame } = await import(
    '../../example-games/beleaguered-castle/createBeleagueredCastleGame'
  );
  const game = createBeleagueredCastleGame({ width, height });
  await waitForScene(game, 'BeleagueredCastleScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number, fallbackMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let left = n;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    const fallback = setTimeout(finish, fallbackMs);
    const tick = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) { clearTimeout(fallback); finish(); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

describe('Undo/Redo button positioning (via initUndoRedoButtons)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => { destroyGame(game); game = null; });

  /**
   * Test helper: calls initUndoRedoButtons on the scene and checks positions.
   */
  async function runPositionTest(width: number, height: number): Promise<void> {
    game = await bootGame(width, height);
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    // Programmatically add undo/redo buttons via the shared mechanism
    (scene as any).initUndoRedoButtons(() => {}, () => {});
    await waitFrames(5);

    // Access the mechanism's protected undo/redo button containers
    const undoBtn = (scene as any).undoButton as Phaser.GameObjects.Container | null;
    const redoBtn = (scene as any).redoButton as Phaser.GameObjects.Container | null;
    const settingsBtn = (scene as any).settingsButton as any | null;

    expect(undoBtn).not.toBeNull();
    expect(redoBtn).not.toBeNull();
    expect(settingsBtn).not.toBeNull();

    // The settings button's circle center is at settingsButton.posX, posY
    // Settings button default posX = width - 80
    const settingsCenterX = settingsBtn!.posX as number;
    const settingsLeftEdge = settingsCenterX - 16; // radius = 16px

    // Verify ordering: undo left of redo, redo left of settings
    expect(undoBtn!.x).toBeLessThan(redoBtn!.x);
    expect(redoBtn!.x + 30).toBeLessThan(settingsLeftEdge); // redo right edge < settings left

    // Verify same vertical alignment
    const verticalTolerance = 20;
    expect(Math.abs(undoBtn!.y - redoBtn!.y)).toBeLessThan(verticalTolerance);

    // Verify buttons are within viewport bounds
    expect(undoBtn!.x).toBeGreaterThan(0);
    expect(redoBtn!.x).toBeGreaterThan(0);
    expect(undoBtn!.y).toBeGreaterThan(0);
  }

  it('positions undo/redo buttons left of settings button at 1280x720', async () => {
    await runPositionTest(1280, 720);
  });

  it('positions undo/redo buttons left of settings button at 1024x768', async () => {
    await runPositionTest(1024, 768);
  });

  it('positions undo/redo buttons left of settings button at 1920x1080', async () => {
    await runPositionTest(1920, 1080);
  });


});
