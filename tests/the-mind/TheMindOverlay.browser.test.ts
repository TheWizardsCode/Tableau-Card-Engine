/**
 * TheMindScene overlay button browser tests -- verify that game-over overlay
 * buttons respond to real pointer events routed through Phaser's input
 * pipeline, and that scene.restart() works correctly after clicking
 * "Try Again".
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They dispatch actual DOM MouseEvents on the canvas
 * element so the full Phaser input system (hit-testing, depth sorting,
 * topOnly filtering) is exercised.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * Browsers limit concurrent WebGL contexts (~8-16). We keep total boots
 * per file <= 4 to stay well within that budget.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createTheMindGame } = await import(
    '../../example-games/the-mind/createTheMindGame'
  );
  const game = createTheMindGame();
  await waitForScene(game, 'TheMindScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const step = () => {
      count++;
      if (count >= n) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
}

/**
 * Get scene private properties via type-safe cast.
 */
function getSceneInternals(scene: Phaser.Scene) {
  return scene as any;
}

/**
 * Collect display objects from scene children and the HUD container.
 * Phaser 4 containers store children in .list (not .children).
 */
function collectFromSceneAndHud<T extends Phaser.GameObjects.GameObject>(
  scene: Phaser.Scene,
  predicate: (obj: Phaser.GameObjects.GameObject) => obj is T,
): T[] {
  const result: T[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (predicate(child)) result.push(child);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud && hud.list) walk(hud.list);
  return result;
}

/**
 * Dispatch a real DOM MouseEvent on the game canvas at the given
 * game-world coordinates. This routes through Phaser's full input
 * pipeline: InputManager -> InputPlugin -> hit-test -> sortGameObjects.
 *
 * IMPORTANT: Phaser 3.x listens for 'mousedown'/'mouseup' (NOT
 * 'pointerdown'/'pointerup'). Synthetic `dispatchEvent(new PointerEvent(...))`
 * does NOT trigger the browser's automatic mousedown compatibility event,
 * so we must dispatch MouseEvent directly.
 */
function clickAtGameCoords(
  game: Phaser.Game,
  gameX: number,
  gameY: number,
): void {
  const canvas = game.canvas;
  const scale = game.scale;

  // Ensure ScaleManager bounds are up to date before computing coords
  scale.refresh();

  const pageX =
    gameX / scale.displayScale.x + scale.canvasBounds.left;
  const pageY =
    gameY / scale.displayScale.y + scale.canvasBounds.top;

  const eventInit: MouseEventInit = {
    clientX: pageX,
    clientY: pageY,
    screenX: pageX,
    screenY: pageY,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
  };

  const down = new MouseEvent('mousedown', eventInit);
  Object.defineProperty(down, 'pageX', { value: pageX });
  Object.defineProperty(down, 'pageY', { value: pageY });
  canvas.dispatchEvent(down);

  const up = new MouseEvent('mouseup', { ...eventInit, buttons: 0 });
  Object.defineProperty(up, 'pageX', { value: pageX });
  Object.defineProperty(up, 'pageY', { value: pageY });
  canvas.dispatchEvent(up);
}

/**
 * Force the TheMindScene into game-over (loss) state and show the
 * loss overlay. Manipulates session state directly so handleGameOver()
 * sees outcome='loss'.
 */
function forceLossOverlay(scene: Phaser.Scene): void {
  const internals = getSceneInternals(scene);
  // Set session to loss state
  internals.session.lives = 0;
  internals.session.outcome = 'loss';
  // Call handleGameOver which shows the loss overlay
  internals.handleGameOver();
}

/**
 * Force the TheMindScene into game-over (win) state and show the
 * win overlay. Manipulates session state directly so handleGameOver()
 * sees outcome='win'.
 */
function forceWinOverlay(scene: Phaser.Scene): void {
  const internals = getSceneInternals(scene);
  // Set session to win state
  internals.session.outcome = 'win';
  // Call handleGameOver which shows the win overlay
  internals.handleGameOver();
}

// ── Tests ───────────────────────────────────────────────────

describe('The Mind overlay button tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('should show loss overlay buttons that are interactive', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('TheMindScene')!;

    forceLossOverlay(scene);
    await waitFrames(3);

    // Find text objects with overlay button labels
    const texts = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text,
      );

    const tryAgainBtn = texts.find((t) => t.text === '[ Try Again ]');
    const menuBtn = texts.find((t) => t.text === '[ Menu ]');

    expect(tryAgainBtn).toBeDefined();
    expect(menuBtn).toBeDefined();
    expect(tryAgainBtn!.input?.enabled).toBe(true);
    expect(menuBtn!.input?.enabled).toBe(true);
  });

  it('should restart the scene when "Try Again" is clicked via DOM pointer event', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('TheMindScene')!;

    // Record original session to verify it changes after restart
    const originalSession = getSceneInternals(scene).session;

    forceLossOverlay(scene);
    // Wait for the overlay to render and Phaser to process the frame
    await waitFrames(5);

    // Find the "Try Again" button to get its coordinates
    const texts = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text,
      );
    const tryAgainBtn = texts.find((t) => t.text === '[ Try Again ]');
    expect(tryAgainBtn).toBeDefined();

    // Click at the button's game-world position through the DOM
    clickAtGameCoords(game, tryAgainBtn!.x, tryAgainBtn!.y);

    // Wait for restart: Phaser queues scene restart for next frame
    await waitFrames(3);
    // scene.restart() destroys and recreates; wait for re-activation
    await waitForScene(game, 'TheMindScene');
    await waitFrames(3);

    // Verify: new session was created (different object reference)
    const newScene = game.scene.getScene('TheMindScene')!;
    const newSession = getSceneInternals(newScene).session;
    expect(newSession).not.toBe(originalSession);

    // Verify: the scene is in 'playing' or 'dealing' phase (not game-lost)
    const newPhase = getSceneInternals(newScene).phase;
    expect(newPhase).not.toBe('game-lost');
    expect(newPhase).not.toBe('game-won');

    // Verify: overlay buttons no longer exist
    const newTexts = collectFromSceneAndHud(newScene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text,
    );
    const tryAgainAfterRestart = newTexts.find(
      (t) => t.text === '[ Try Again ]',
    );
    expect(tryAgainAfterRestart).toBeUndefined();
  });

  it('should show win overlay buttons that respond to DOM clicks', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('TheMindScene')!;

    const originalSession = getSceneInternals(scene).session;

    forceWinOverlay(scene);
    await waitFrames(5);

    // Find the "Play Again" button
    const texts = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text,
      );
    const playAgainBtn = texts.find((t) => t.text === '[ Play Again ]');
    expect(playAgainBtn).toBeDefined();
    expect(playAgainBtn!.input?.enabled).toBe(true);

    // Click at the button's game-world position through the DOM
    clickAtGameCoords(game, playAgainBtn!.x, playAgainBtn!.y);

    // Wait for restart
    await waitFrames(3);
    await waitForScene(game, 'TheMindScene');
    await waitFrames(3);

    // Verify: new session was created
    const newScene = game.scene.getScene('TheMindScene')!;
    const newSession = getSceneInternals(newScene).session;
    expect(newSession).not.toBe(originalSession);
  });

  it('should have an interactive input blocker at overlay depth', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('TheMindScene')!;

    forceLossOverlay(scene);
    await waitFrames(3);

    // Find interactive rectangles at depth 2000 (the overlay background)
    const rects = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        (child as Phaser.GameObjects.Rectangle).depth === 2000,
      );

    // Should have at least 2 rectangles: the full-screen blocker and the visible overlay box
    expect(rects.length).toBeGreaterThanOrEqual(2);

    // The full-screen blocker should be interactive (1280x720 viewport)
    const fullScreenBlocker = rects.find(
      (r) => r.width === 1280 && r.height === 720 && r.input?.enabled,
    );
    expect(fullScreenBlocker).toBeDefined();
  });
});
