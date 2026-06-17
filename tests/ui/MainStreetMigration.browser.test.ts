/**
 * Main Street migration smoke test.
 *
 * Boots the Main Street scene with a deterministic seed, captures a
 * screenshot, and verifies that key UI regions (HUD strip, street grid,
 * market UI) contain non-trivial rendered content (i.e. not a single
 * solid colour).
 *
 * This test guards against visual regressions caused by the shared
 * Renderer migration (CG-0MP12VWO1003YL55).
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { createSeededRng } from '../../src/core-engine/SeededRng';
import { page } from '@vitest/browser/context';

// ── Deterministic seed ─────────────────────────────────────

/** Fixed seed for reproducible rendering across test runs. */
const TEST_SEED = 42;

/**
 * Temporarily replace `Math.random` with a seeded RNG, execute
 * `fn`, then restore the original `Math.random`.
 */
async function withSeededRandom<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const original = Math.random;
  const seeded = createSeededRng(seed);
  Math.random = seeded;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

// ── Boot helper ────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container', width: 1280, height: 720 });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Wait N animation frames with a timeout fallback. */
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
    const tick = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) { clearTimeout(fallback); finish(); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ── Screenshot / pixel helpers ─────────────────────────────

/**
 * Read a single pixel from the game canvas at (x, y).
 * Returns [r, g, b, a].
 */
async function readPixel(
  scene: Phaser.Scene,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  try {
    const renderer: unknown = (scene.game as Phaser.Game).renderer;
    const r = renderer as { snapshotPixel?: (x: number, y: number, cb: (p: { r: number; g: number; b: number; a?: number }) => void) => void };
    if (r && typeof r.snapshotPixel === 'function') {
      const value = await new Promise<{ r: number; g: number; b: number; a?: number }>((resolve) => {
        r.snapshotPixel!(x, y, (pixel) => resolve(pixel));
      });
      if (value && typeof value.r === 'number') {
        return [value.r, value.g, value.b, value.a ?? 255];
      }
    }
  } catch (_) { /* fall back */ }

  const ctx2d = canvas.getContext('2d');
  if (ctx2d) {
    const data = ctx2d.getImageData(x, y, 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  }
  throw new Error('No render context available for pixel read');
}

/**
 * Sample multiple pixels from a rectangular region and check that
 * they are NOT all the same solid colour. Returns the number of
 * distinct colours found.
 */
async function countDistinctColoursInRegion(
  scene: Phaser.Scene,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  step = 8,
): Promise<number> {
  const colours = new Set<string>();
  for (let px = x; px < x + w; px += step) {
    for (let py = y; py < y + h; py += step) {
      const sx = Math.max(0, Math.min(px, canvas.width - 1));
      const sy = Math.max(0, Math.min(py, canvas.height - 1));
      const [r, g, b] = await readPixel(scene, canvas, sx, sy);
      colours.add(`${r},${g},${b}`);
    }
  }
  return colours.size;
}

/**
 * Save a canvas screenshot to the __screenshots__ directory via Vitest's
 * browser page API. Returns the path to the saved PNG.
 */
async function saveScreenshot(canvas: HTMLCanvasElement, name: string): Promise<string> {
  // eslint-disable-next-line no-console
  console.log(`[screenshot:${name}] canvas=${canvas.width}x${canvas.height}`);
  const path = await page.screenshot({ path: `__screenshots__/MainStreetMigration.browser.test.ts/${name}.png` });
  return path;
}

// ── Tests ──────────────────────────────────────────────────

describe('Main Street migration smoke (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('HUD strip renders non-trivial content (not solid colour)', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await waitFrames(24);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'main-street-hud');

    // HUD strip is at the top of the screen. Sample a region across it.
    const hudY = 5;
    const hudH = 40;
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      100, hudY, canvas.width - 200, hudH,
      12,
    );
    // The HUD contains text labels (Coins, Rep, Score) and the header bar,
    // so we expect multiple distinct colours.
    expect(distinctColours).toBeGreaterThan(3);
  }, 30_000);

  it('street grid renders non-trivial content (not solid colour)', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await waitFrames(24);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'main-street-street-grid');

    // Street grid is in the center-left area. Sample a region.
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      200, 120, 400, 300,
      12,
    );
    // Street grid has slot rectangles, card textures, and labels.
    expect(distinctColours).toBeGreaterThan(4);
  }, 30_000);

  it('market UI renders non-trivial content (not solid colour)', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await waitFrames(24);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'main-street-market');

    // Market area is on the right side of the screen.
    const marketX = Math.floor(canvas.width * 0.55);
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      marketX, 80, canvas.width - marketX - 50, 350,
      12,
    );
    // Market has card images, labels, and the market panel background.
    expect(distinctColours).toBeGreaterThan(5);
  }, 30_000);

  it('scene exposes expected container accessors after migration', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // These accessors should still work after the Renderer migration.
    expect(typeof scene.getStreetContainer).toBe('function');
    expect(typeof scene.getMarketContainer).toBe('function');
    expect(typeof scene.getHandContainer).toBe('function');
    expect(typeof scene.getActionContainer).toBe('function');

    const street = (scene.getStreetContainer as () => Phaser.GameObjects.Container)();
    const market = (scene.getMarketContainer as () => Phaser.GameObjects.Container)();
    expect(street).toBeInstanceOf(Phaser.GameObjects.Container);
    expect(market).toBeInstanceOf(Phaser.GameObjects.Container);
  }, 30_000);
});
