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
  await waitForCondition(() => {
    const scene = game.scene.getScene('GolfScene');
    return Boolean(scene && getSceneInternals(scene).phaseManager);
  }, 20_000);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number, fallbackMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let left = n;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const fallback = setTimeout(finish, fallbackMs);

    const step = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) {
        clearTimeout(fallback);
        finish();
      } else {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 10_000,
  pollMs = 25,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
}

/**
 * Get scene private properties via type-safe cast.
 */
function getSceneInternals(scene: Phaser.Scene) {
  return scene as any;
}

/**
 * Collect display objects from scene children and the HUD container.
 * Phaser 4 containers store children in .list.
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

  // Convert game-world coords to page/screen coords using Phaser's scale
  // transform methods which handle all DPR and viewport scaling.
  // transformX/Y converts page coords to game coords, so we need the
  // inverse. For a scale that maps page→game via:
  //   gameX = (pageX - canvasBounds.left) * displayScale.x
  // The inverse is:
  //   pageX = gameX / displayScale.x + canvasBounds.left
  const pageX =
    gameX / scale.displayScale.x + scale.canvasBounds.left;
  const pageY =
    gameY / scale.displayScale.y + scale.canvasBounds.top;

  // Phaser 4 RC7's MouseManager natively listens for native DOM `mousedown`
  // and `mouseup` events (not `pointerdown`/`pointerup`). Synthetic
  // PointerEvents dispatched via dispatchEvent do NOT auto-generate the
  // corresponding MouseEvent, so we must dispatch MouseEvent directly.
  const dispatch = (type: string, buttons: number) => {
    const e = new MouseEvent(type, {
      clientX: Math.round(pageX),
      clientY: Math.round(pageY),
      screenX: Math.round(pageX),
      screenY: Math.round(pageY),
      button: 0,
      buttons,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(e);
  };

  dispatch('mousedown', 1);
  dispatch('mouseup', 0);
}

/**
 * Force the Golf scene into game-over state and show the end screen.
 * We finalize the recorder first so transcript.results is available.
 */
function forceEndScreen(scene: Phaser.Scene): void {
  const internals = getSceneInternals(scene);
  // Calling phaseManager.set('round-ended') triggers showEndScreen() internally
  internals.phaseManager.set('round-ended');
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

    // Helper: find a container that contains a Text child with the given label.
    // Search both scene children and HUD container (Phaser 4 uses .list)
    const findContainerByText = (
      label: string,
    ): Phaser.GameObjects.Container | undefined => {
      const findInList = (items: Phaser.GameObjects.GameObject[]) => {
        const found = items.find(
          (child: Phaser.GameObjects.GameObject) =>
            child instanceof Phaser.GameObjects.Container &&
            (child as any).list.some(
              (c: Phaser.GameObjects.GameObject) =>
                c instanceof Phaser.GameObjects.Text && c.text === label,
            ),
        );
        return found as Phaser.GameObjects.Container | undefined;
      };
      const found = findInList(scene.children.list);
      if (found) return found;
      const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
      if (hud && hud.list) return findInList(hud.list);
      return undefined;
    };

    const playAgainBtn = findContainerByText('[ Play Again ]');
    const menuBtn = findContainerByText('Menu');

    expect(playAgainBtn).toBeDefined();
    expect(menuBtn).toBeDefined();
    // Buttons are interactive containers (the container itself is the hit target)
    const playBg = (playAgainBtn!.list as Phaser.GameObjects.GameObject[]).find(
      (c) => c instanceof Phaser.GameObjects.Rectangle,
    );
    const menuBg = (menuBtn!.list as Phaser.GameObjects.GameObject[]).find(
      (c) => c instanceof Phaser.GameObjects.Rectangle,
    );
    expect(playBg).toBeDefined();
    expect(menuBg).toBeDefined();
    expect((playBg as Phaser.GameObjects.Rectangle).input?.enabled).toBe(true);
    expect((menuBg as Phaser.GameObjects.Rectangle).input?.enabled).toBe(true);
  });

  it('should restart the scene when "Play Again" is clicked via DOM pointer event', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;

    // Record original session to verify it changes after restart
    const originalSession = getSceneInternals(scene).session;

    forceEndScreen(scene);
    // Wait for the end screen to render and Phaser to process the frame
    await waitFrames(5);

    // Helper: find a container that contains a Text child with the given label
    // and return the interactive Rectangle (background) inside it.
    // Search both scene children and HUD container (OverlayManager.add now
    // parents content to hudContainer for correct z-ordering).
    const findButtonContainer = (
      label: string,
    ): Phaser.GameObjects.Container | undefined => {
      const findIn = (items: Phaser.GameObjects.GameObject[]) => {
        return items.find(
          (child: Phaser.GameObjects.GameObject) =>
            child instanceof Phaser.GameObjects.Container &&
            (child as Phaser.GameObjects.Container).list.some(
              (c: Phaser.GameObjects.GameObject) =>
                c instanceof Phaser.GameObjects.Text && c.text === label,
            ),
        ) as Phaser.GameObjects.Container | undefined;
      };
      let result = findIn(scene.children.list);
      if (result) return result;
      const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
      if (hud && hud.list) result = findIn(hud.list);
      return result;
    };

    // Find the "Play Again" button container.
    // createActionButton places the container at (x + width/2, y + height/2)
    // with the Rectangle at local (0, 0) — world pos = container pos.
    const playAgainBtn = findButtonContainer('[ Play Again ]');
    expect(playAgainBtn).toBeDefined();

    // Click at the button's world position through the DOM.
    // This routes through Phaser's full input pipeline (hit-testing, depth
    // sorting, topOnly filtering) so the full system is exercised.
    clickAtGameCoords(game, playAgainBtn!.x, playAgainBtn!.y);

    // Wait for restart: scene.restart() destroys the old scene and creates
    // a new one. We wait for the session object to change as proof that
    // a fresh scene was created.
    await waitForCondition(() => {
      const activeScene = game!.scene.getScene('GolfScene');
      const maybeSession = getSceneInternals(activeScene).session;
      return Boolean(maybeSession && maybeSession !== originalSession);
    }, 15_000);
    await waitFrames(2);

    // Verify: the scene is in initial state, not in round-ended
    const newScene = game.scene.getScene('GolfScene')!;
    expect(getSceneInternals(newScene).phaseManager.current).toBe('waiting-for-draw');

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
    // The overlay system parents objects into the HUD container in Phaser 4
    const allRects = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle,
    );
    const rects = allRects.filter((r) => r.depth === 10);

    // Should have at least 2 rectangles at depth 10: the full-screen blocker and the visible overlay
    expect(rects.length).toBeGreaterThanOrEqual(2);

    // The full-screen blocker should be interactive (1280x720 viewport)
    const fullScreenBlocker = rects.find(
      (r) => r.width === 1280 && r.height === 720 && r.input?.enabled,
    );
    expect(fullScreenBlocker).toBeDefined();
  });

  it('should show an Export Transcript button on the end-of-round overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;

    forceEndScreen(scene);
    await waitFrames(3);

    // Helper: find a container that contains a Text child with the given label
    const findButtonContainer = (
      label: string,
    ): Phaser.GameObjects.Container | undefined => {
      const findIn = (items: Phaser.GameObjects.GameObject[]) => {
        return items.find(
          (child: Phaser.GameObjects.GameObject) =>
            child instanceof Phaser.GameObjects.Container &&
            (child as Phaser.GameObjects.Container).list.some(
              (c: Phaser.GameObjects.GameObject) =>
                c instanceof Phaser.GameObjects.Text && c.text === label,
            ),
        ) as Phaser.GameObjects.Container | undefined;
      };
      let result = findIn(scene.children.list);
      if (result) return result;
      const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
      if (hud && hud.list) result = findIn(hud.list);
      return result;
    };

    const exportBtn = findButtonContainer('[ Export Transcript ]');
    expect(exportBtn).toBeDefined();

    // The button should be interactive
    const exportBg = (exportBtn!.list as Phaser.GameObjects.GameObject[]).find(
      (c) => c instanceof Phaser.GameObjects.Rectangle,
    );
    expect(exportBg).toBeDefined();
    expect((exportBg as Phaser.GameObjects.Rectangle).input?.enabled).toBe(true);
  });

});
