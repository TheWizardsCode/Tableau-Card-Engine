/**
 * bootTestGame — Centralised boot helper for browser tests.
 *
 * Every browser test file needs to boot a Phaser game. This helper:
 *
 * 1. Pins **Canvas2D rendering** (`TEST_RENDER_TYPE` = `Phaser.CANVAS`), which
 *    is ~10x faster than WebGL software emulation (SwiftShader) in headless
 *    CI runners. This is a deliberate, tested exception to the shipped
 *    launcher default of `Phaser.AUTO` (CG-0MVTQ3WPV003ZECA): a browser test
 *    asserting GPU behaviour must opt in explicitly via
 *    `tests/helpers/bootRendererScene.ts`, never by flipping this default.
 * 2. Configures a clean DOM container before each boot.
 * 3. Waits for the specified scene to become active.
 *
 * Usage:
 * ```ts
 * import { withTestRenderer } from '../../src/core-engine/TestGamePool';
 * import { waitForScene } from '../../tests/helpers/waitForScene';
 *
 * async function bootMyGame(): Promise<Phaser.Game> {
 *   const game = createMyGame(withTestRenderer({ backgroundColor: '#2d572c' }));
 *   await waitForScene(game, 'MyScene');
 *   return game;
 * }
 * ```
 *
 * @module @core-engine/TestGamePool
 */

import Phaser from 'phaser';

const CONTAINER_ID = 'game-container';

/**
 * The renderer every browser-test boot uses: Canvas2D.
 *
 * Pinned by `tests/core-engine/TestGamePool.test.ts` so a later
 * "unification" with the launcher's `Phaser.AUTO` default cannot quietly
 * force WebGL (and its SwiftShader slow path) onto the whole CI suite.
 */
export const TEST_RENDER_TYPE: number = Phaser.CANVAS;

/**
 * Prepare a fresh DOM container for a new test game, removing any
 * previous container left over from a prior (possibly failed) test.
 */
function ensureContainer(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.remove();
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  return container;
}

/**
 * Remove the game container from the DOM.
 */
export function removeContainer(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (container) container.remove();
}

// ── Game cache (per-file, since Vitest browser mode isolates files) ──

const gameCache = new Map<string, Phaser.Game>();

/**
 * Acquire or create a Phaser game for the given `gameId`.
 *
 * If a game already exists for this ID in the current worker, it is
 * returned (the caller is responsible for any scene restart). Otherwise
 * a new game is created.
 *
 * @param gameId   Logical identifier e.g. `'beleaguered-castle'`.
 * @param factory  Factory that returns a new Phaser.Game.
 * @param forceNew When true, always create a fresh game (ignore cache).
 */
export function getOrCreateGame(
  gameId: string,
  factory: () => Phaser.Game,
  forceNew = false,
): Phaser.Game {
  if (!forceNew) {
    const existing = gameCache.get(gameId);
    if (existing) {
      try { existing.scene.start(existing.scene.getScenes(true)[0]?.scene.key ?? ''); } catch { /* ok */ }
      return existing;
    }
  }

  ensureContainer();
  const game = factory();
  gameCache.set(gameId, game);
  return game;
}

/**
 * Apply {@link TEST_RENDER_TYPE} to a Phaser game-creation options object.
 *
 * Any `type` the caller supplied (`AUTO`, `WEBGL`) is replaced, so a test
 * harness cannot accidentally opt the suite into WebGL. GPU/renderer-parity
 * tests that genuinely need WebGL bypass this helper and boot through
 * `tests/helpers/bootRendererScene.ts`.
 *
 * ```ts
 * const game = createGolfGame(withTestRenderer({ backgroundColor: '#2d572c' }));
 * ```
 */
export function withTestRenderer<T extends object>(
  options: T,
): T & { type: number } {
  return { ...options, type: TEST_RENDER_TYPE } as T & { type: number };
}

/**
 * Destroy a cached test game and remove its DOM container.
 * Safe to call multiple times.
 *
 * @param gameId  The logical identifier passed to `getOrCreateGame`.
 */
export function destroyGame(gameId: string): void {
  const game = gameCache.get(gameId);
  if (game) {
    try { game.destroy(true, false); } catch { /* ignore */ }
  }
  gameCache.delete(gameId);
  removeContainer();
}

/**
 * Destroy ALL cached games. Useful for Vitest `afterAll` suites
 * that clean up multiple game types.
 */
export function destroyAllGames(): void {
  for (const key of [...gameCache.keys()]) {
    destroyGame(key);
  }
}
