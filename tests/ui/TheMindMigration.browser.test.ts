/**
 * The Mind migration smoke test.
 *
 * Boots the The Mind scene, captures a screenshot, and verifies that
 * key UI regions (human hand, AI hand, pile, status text) contain
 * non-trivial rendered content (i.e. not a single solid colour).
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

  const { createTheMindGame } = await import(
    '../../example-games/the-mind/createTheMindGame'
  );
  const game = createTheMindGame({ type: Phaser.CANVAS, parent: 'game-container', width: 1280, height: 720 });
  await waitForScene(game, 'TheMindScene');
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
  const path = await page.screenshot({ path: `__screenshots__/TheMindMigration.browser.test.ts/${name}.png` });
  return path;
}

// ── Tests ──────────────────────────────────────────────────

describe('The Mind migration smoke (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('human hand (Your Hand) renders non-trivial content', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('TheMindScene') as Phaser.Scene;
    await waitFrames(24);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'the-mind-human-hand');

    // Your Hand region is at the bottom of the screen.
    const handY = 520;
    const handH = 180;
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      100, handY, canvas.width - 200, handH,
      12,
    );
    // Human hand has cards with textures and a "Your Hand" label.
    expect(distinctColours).toBeGreaterThan(4);
  }, 30_000);

  it('AI hand renders non-trivial content', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('TheMindScene') as Phaser.Scene;
    await waitFrames(24);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'the-mind-ai-hand');

    // AI Hand region is near the top, below the title.
    const aiHandY = 50;
    const aiHandH = 160;
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      100, aiHandY, canvas.width - 200, aiHandH,
      12,
    );
    // AI hand has card-back images and an "AI Hand" label.
    // Card-backs are visually similar so we accept a lower threshold.
    expect(distinctColours).toBeGreaterThan(2);
  }, 30_000);

  it('pile renders non-trivial content', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('TheMindScene') as Phaser.Scene;
    await waitFrames(48);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'the-mind-pile');

    // Pile is centred in the middle of the screen.
    // PileView sprite at (640, 360), count text at y=360+82=442.
    const pileX = Math.floor(canvas.width / 2) - 50;
    const pileY = Math.floor(canvas.height / 2) - 60;
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      pileX, pileY, 100, 200,
      8,
    );
    // Pile has card-back textures, a "Pile: N" count, and a slot background.
    expect(distinctColours).toBeGreaterThan(3);
  }, 30_000);

  it('status text renders non-trivial content', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('TheMindScene') as Phaser.Scene;
    await waitFrames(48);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    await saveScreenshot(canvas, 'the-mind-status-text');

    // Status text (level/lives) is at top-right corner (x~1180, y~55-80).
    const statusX = Math.floor(canvas.width * 0.8);
    const statusY = Math.floor(canvas.height * 0.03);
    const distinctColours = await countDistinctColoursInRegion(
      scene, canvas,
      statusX, statusY, 220, 100,
      8,
    );
    // Status area has level text, lives hearts, and background elements.
    expect(distinctColours).toBeGreaterThan(3);
  }, 30_000);

  it('scene contains expected display objects (labels, images)', async () => {
    await withSeededRandom(TEST_SEED, async () => {
      game = await bootGame();
    });
    const scene = game!.scene.getScene('TheMindScene') as Phaser.Scene;
    await waitFrames(16);

    const texts = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    const images = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Image,
    ) as Phaser.GameObjects.Image[];

    // Verify the scene header exists.
    const headerLabel = texts.find((t) => t.text === 'The Mind');
    expect(headerLabel).toBeDefined();

    // Verify status text objects exist (level and lives).
    const levelLabel = texts.find((t) => t.text.startsWith('Level '));
    expect(levelLabel).toBeDefined();
    const livesLabel = texts.find((t) => t.text.includes('Lives'));
    expect(livesLabel).toBeDefined();

    // HandViews use showLabels: false, so no "Your Hand" / "AI Hand" text.
    // We verify card-back image objects exist (AI hand cards use face-down textures).
    const cardBackImages = images.filter((img) => img.texture.key.includes('mind-back'));
    expect(cardBackImages.length).toBeGreaterThan(0);
  }, 30_000);
});
