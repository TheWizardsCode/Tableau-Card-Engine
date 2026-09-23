/**
 * Shared Phaser canvas-pool teardown for browser tests.
 *
 * Extracted from `tests/helpers/main-street-tutorial-e2e.ts` (which carries
 * the original, validated implementation) so that Main Street browser test
 * files that boot one Phaser game per test can release their canvas contexts
 * deterministically.
 *
 * Phaser 4's global `CanvasPool` keeps an internal `pool` array of canvas
 * containers. After `game.destroy()` some internal canvases (textures, render
 * targets, …) remain in the pool with stale parent references; across repeated
 * create/destroy cycles they accumulate and consume the browser's per-origin
 * canvas-context budget. `drainPhaserCanvasPool()` removes every pooled canvas,
 * detaches it from the DOM, clears the pool, and force-releases the context by
 * resetting the canvas dimensions to 0.
 *
 * @module tests/helpers/phaserCanvasPool
 */

import Phaser from 'phaser';

/**
 * Force-release a canvas element's rendering context by resizing it to 0 and
 * removing it from the DOM. This triggers the browser to release the
 * underlying `CanvasRenderingContext2D` resource.
 */
export function releaseCanvasContext(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch { /* ignore */ }
  try {
    (canvas as any).getContext = null;
  } catch { /* ignore */ }
  if (canvas.parentNode) {
    try { canvas.parentNode.removeChild(canvas); } catch { /* ignore */ }
  }
}

/**
 * Drain Phaser's `CanvasPool` completely: free all canvases, remove them from
 * the DOM, clear the pool, and force-release canvas contexts.
 *
 * Safe to call when no pool exists (e.g. a non-Phaser test) or when the pool is
 * already empty.
 */
export function drainPhaserCanvasPool(): void {
  const canvasPool = (Phaser as any).Display?.Canvas?.CanvasPool;
  if (!canvasPool) return;

  const poolArray: Array<{ parent: any; canvas: HTMLCanvasElement }> | undefined =
    (canvasPool as any).pool;

  if (poolArray) {
    // Iterate backwards to avoid skipping entries when canvasPool.remove
    // mutates the array by splicing out the current index.
    for (let i = poolArray.length - 1; i >= 0; i--) {
      const container = poolArray[i];
      try { canvasPool.remove(container.canvas); } catch { /* ignore */ }
      releaseCanvasContext(container.canvas);
    }
    poolArray.length = 0;
  }

  // Also clear any orphaned canvases from the DOM.
  document.querySelectorAll('canvas').forEach((el) => {
    releaseCanvasContext(el);
  });
}

/**
 * Deterministically tear down a Phaser game booted by a browser test.
 *
 * `game.destroy()` only sets `pendingDestroy`; the real teardown runs on the
 * next game-loop frame. Under CPU contention (many concurrent browser test
 * suites) that frame can be delayed for seconds, so a previous test's game
 * — renderer, tweens, input, and game loop — lingers in the shared browser
 * context and competes with the current test's loop for animation frames.
 * That starvation is what stops Phaser's `InputPlugin.preUpdate` from
 * processing synthetic pointer events, so drag gestures never engage
 * (CG-0MUE2U21C0007BKL, recurrence of CG-0MUCERZVO00236D2).
 *
 * Running the deferred destroy synchronously closes that window, and
 * {@link drainPhaserCanvasPool} then frees the canvas contexts.
 *
 * @param game - The game to destroy (may be `null`).
 * @param containerId - DOM id of the game's parent container (default
 *   `game-container`).
 */
export function destroyPhaserGame(
  game: Phaser.Game | null,
  containerId = 'game-container',
): void {
  if (game) {
    // `game.destroy()` sets `removeCanvas` + `pendingDestroy`; run the
    // deferred teardown now if the loop has not already done so.
    game.destroy(true, false);
    if ((game as any).pendingDestroy) {
      try { (game as any).runDestroy(); } catch { /* already torn down */ }
    }
  }

  const container = document.getElementById(containerId);
  if (container) container.remove();

  drainPhaserCanvasPool();
}
