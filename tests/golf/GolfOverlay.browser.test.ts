/**
 * GolfScene overlay button browser tests -- verify that game-over overlay
 * buttons respond to real pointer events routed through Phaser's input
 * pipeline, and that scene.restart() works correctly after clicking
 * "Play Again".
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They dispatch actual DOM PointerEvents on the canvas
 * element so the full Phaser input system (hit-testing, depth sorting,
 * topOnly filtering) is exercised.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * Browsers limit concurrent WebGL contexts (~8-16). We keep total boots
 * per file <= 4 to stay well within that budget.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createGolfGame } = await import(
    '../../example-games/golf/createGolfGame'
  );
  const game = createGolfGame();
  await waitForScene(game, 'GolfScene', 10_000);
  return game;
}

function waitForScene(
  game: Phaser.Game,
  sceneKey: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const scene = game.scene.getScene(sceneKey);
      if (
        scene &&
        (scene as Phaser.Scene & { sys: Phaser.Scenes.Systems }).sys.isActive()
      ) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `Scene "${sceneKey}" did not become active within ${timeoutMs}ms`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return scene as any;
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
 *
 * Phaser reads `event.pageX`/`event.pageY` for coordinate transforms, so
 * we set both pageX and clientX explicitly (they are equal when scroll
 * offset is zero, which is typical in game canvases).
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

  // Convert game coords to page coords (inverse of ScaleManager.transformX/Y)
  // transformX(pageX) = (pageX - canvasBounds.left) * displayScale.x
  // => pageX = gameX / displayScale.x + canvasBounds.left
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

  // Dispatch mousedown, then patch pageX/pageY (not in MouseEventInit typedef
  // but Phaser reads event.pageX; browsers auto-compute it from clientX but
  // we set it explicitly for robustness in synthetic events).
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
 * Force the Golf scene into game-over state and show the end screen.
 * We finalize the recorder first so transcript.results is available.
 */
function forceEndScreen(scene: Phaser.Scene): void {
  const internals = getSceneInternals(scene);
  // Calling setPhase('round-ended') triggers showEndScreen() internally
  internals.setPhase('round-ended');
}

// ── Tests ───────────────────────────────────────────────────

describe('Golf overlay button tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('should show overlay buttons that exist in the scene children list', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;

    forceEndScreen(scene);
    await waitFrames(3);

    // Find text objects with overlay button labels
    const texts = scene.children.list.filter(
      (child: Phaser.GameObjects.GameObject) =>
        child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    const playAgainBtn = texts.find((t) => t.text === '[ Play Again ]');
    const menuBtn = texts.find((t) => t.text === '[ Menu ]');

    expect(playAgainBtn).toBeDefined();
    expect(menuBtn).toBeDefined();
    expect(playAgainBtn!.input?.enabled).toBe(true);
    expect(menuBtn!.input?.enabled).toBe(true);
  });

  it('should restart the scene when "Play Again" is clicked via DOM pointer event', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;

    // Record original session to verify it changes after restart
    const originalSession = getSceneInternals(scene).session;

    forceEndScreen(scene);
    // Wait for the end screen to render and Phaser to process the frame
    await waitFrames(5);

    // Find the "Play Again" button to get its coordinates
    const texts = scene.children.list.filter(
      (child: Phaser.GameObjects.GameObject) =>
        child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const playAgainBtn = texts.find((t) => t.text === '[ Play Again ]');
    expect(playAgainBtn).toBeDefined();

    // Click at the button's game-world position through the DOM
    clickAtGameCoords(game, playAgainBtn!.x, playAgainBtn!.y);

    // Wait for restart: Phaser queues scene restart for next frame
    await waitFrames(3);
    // scene.restart() destroys and recreates; wait for re-activation
    await waitForScene(game, 'GolfScene', 10_000);
    await waitFrames(3);

    // Verify: new session was created (different object reference)
    const newScene = game.scene.getScene('GolfScene')!;
    const newSession = getSceneInternals(newScene).session;
    expect(newSession).not.toBe(originalSession);

    // Verify: the scene is in initial state, not in round-ended
    expect(getSceneInternals(newScene).turnPhase).toBe('waiting-for-draw');

    // Verify: overlay buttons no longer exist
    const newTexts = newScene.children.list.filter(
      (child: Phaser.GameObjects.GameObject) =>
        child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const playAgainAfterRestart = newTexts.find(
      (t) => t.text === '[ Play Again ]',
    );
    expect(playAgainAfterRestart).toBeUndefined();
  });

  it('should have an interactive input blocker behind the overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;

    forceEndScreen(scene);
    await waitFrames(3);

    // Find interactive rectangles at depth 10 (the input blocker)
    const rects = scene.children.list.filter(
      (child: Phaser.GameObjects.GameObject) =>
        child instanceof Phaser.GameObjects.Rectangle &&
        (child as Phaser.GameObjects.Rectangle).depth === 10,
    ) as Phaser.GameObjects.Rectangle[];

    // Should have at least 2 rectangles at depth 10: the full-screen blocker and the visible overlay
    expect(rects.length).toBeGreaterThanOrEqual(2);

    // The full-screen blocker should be interactive
    const fullScreenBlocker = rects.find(
      (r) => r.width === 800 && r.height === 600 && r.input?.enabled,
    );
    expect(fullScreenBlocker).toBeDefined();
  });
});
