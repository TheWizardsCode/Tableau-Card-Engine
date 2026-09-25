/**
 * Main Street hand capacity outline tests (CG-0MT6ER7YY003G680).
 *
 * Verifies that Main Street wires the HandView ghost position outlines:
 *  - outlines are ON by default and one slot exists per `maxHandSize`
 *    (the producer reported "outlines are not visible at all in Main
 *    Street", so this is the regression guard);
 *  - occupied outlines sit exactly on the card slots (same position and
 *    rotation — "positioned the same as the cards themselves");
 *  - outlines actually affect rendered pixels (visibility, not just
 *    display-object existence).
 *
 * Boots the real MainStreetScene (Phaser CANVAS) — keep boots per file low.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '@core-tests/helpers/waitForScene';

const SCENE_KEY = 'MainStreetScene';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container' });
  await waitForScene(game, SCENE_KEY);
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
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fallback = setTimeout(finish, fallbackMs);
    const tick = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) {
        clearTimeout(fallback);
        finish();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read a single canvas pixel (mirrors tests/main-street/HelpPanelLayering). */
async function readScenePixel(
  scene: any,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  try {
    const renderer: any = scene?.game?.renderer;
    if (renderer && typeof renderer.snapshotPixel === 'function') {
      const value = await new Promise<any>((resolve) => {
        renderer.snapshotPixel(x, y, (pixel: any) => resolve(pixel));
      });
      if (value && typeof value.r === 'number') {
        return [value.r, value.g, value.b, value.a ?? 255];
      }
    }
  } catch (_) {
    /* fall through to context read */
  }

  const ctx2d = canvas.getContext('2d');
  if (ctx2d) {
    const data = ctx2d.getImageData(x, y, 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  }

  const gl = (canvas.getContext('webgl') as WebGLRenderingContext | null)
    || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    || (canvas.getContext('webgl2') as WebGL2RenderingContext | null);
  if (!gl) throw new Error('No 2D/WebGL context available for pixel read');
  const pixels = new Uint8Array(4);
  const flippedY = canvas.height - 1 - y;
  gl.readPixels(x, flippedY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return [pixels[0], pixels[1], pixels[2], pixels[3]];
}

function luma(px: [number, number, number, number]): number {
  return px[0] + px[1] + px[2];
}

function handViewOf(scene: any): any {
  return scene?.msRenderer?.handView;
}

function outlineRectsOf(scene: any): any[] {
  return handViewOf(scene)?.outlineRects ?? [];
}

// ── Tests ───────────────────────────────────────────────────

describe('Main Street hand capacity outlines', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders one outline slot per maxHandSize, enabled by default', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    await waitFrames(20);
    await wait(200);

    const handView = handViewOf(scene);
    expect(handView).toBeDefined();
    expect(handView.getShowPositionOutlines()).toBe(true);

    const maxHandSize = scene.state?.maxHandSize ?? 3;
    const rects = outlineRectsOf(scene);

    expect(maxHandSize).toBeGreaterThan(0);
    expect(rects.length).toBe(maxHandSize);

    // Every slot is a live stroke-only rectangle sized to the hand card.
    for (const rect of rects) {
      expect(rect.active).toBe(true);
      expect(rect.width).toBe(scene.layout.handCardW - 4);
      expect(rect.height).toBe(scene.layout.handCardH - 4);
    }

    // Empty hand at boot: outlines must be visible where the hand will be,
    // even though no cards exist yet (the producer's repro).
    expect(handView.getCards().length).toBe(0);
  });

  it('occupied outlines align with the hand card slots (position and rotation)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    await waitFrames(20);
    await wait(200);

    const handView = handViewOf(scene);
    expect(handView).toBeDefined();

    // Populate the hand from real market cards so the render path is exercised.
    const marketCards: any[] = (scene.state?.market?.cards ?? []).filter(Boolean);
    expect(marketCards.length).toBeGreaterThanOrEqual(2);
    scene.state.hand = marketCards.slice(0, 2).map((c: any) => ({ ...c }));
    scene.msRenderer.refreshPlayerHand();
    await waitFrames(10);
    await wait(200);

    const sprites = handView.getSprites();
    const rects = outlineRectsOf(scene);
    expect(sprites.length).toBe(2);
    expect(rects.length).toBe(scene.state.maxHandSize);

    // Occupied slots ghost the cards exactly — same centre, same rotation.
    for (let i = 0; i < sprites.length; i++) {
      expect(rects[i].x).toBeCloseTo(sprites[i].x, 4);
      expect(rects[i].y).toBeCloseTo(sprites[i].y, 4);
      expect(rects[i].rotation).toBeCloseTo(sprites[i].rotation, 4);
    }

    // Occupied slots sit behind their card (index - 0.5); extra capacity
    // slots are below every card so they never draw over a card face.
    for (let i = 0; i < sprites.length; i++) {
      expect(rects[i].depth).toBe(i - 0.5);
    }
    for (let i = sprites.length; i < rects.length; i++) {
      expect(rects[i].depth).toBeLessThan(-0.5);
    }
  });

  it('outlines visibly affect rendered pixels over the game background', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    await waitFrames(20);
    await wait(250);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    const handView = handViewOf(scene);
    const rects = outlineRectsOf(scene);
    expect(rects.length).toBeGreaterThan(0);

    // Probe the top and left stroke edges of the first slot.
    const rect = rects[0];
    const leftX = Math.round(rect.x - rect.width / 2);
    const topY = Math.round(rect.y - rect.height / 2);
    const midY = Math.round(rect.y);
    const midX = Math.round(rect.x);

    const samples: Array<[number, number]> = [
      [leftX, midY],
      [midX, topY],
    ];

    const onPixels: Array<[number, number, number, number]> = [];
    for (const [x, y] of samples) {
      onPixels.push(await readScenePixel(scene, canvas, x, y));
    }

    // Toggle outlines off and re-probe the same pixels.
    handView.setShowPositionOutlines(false);
    await waitFrames(10);
    await wait(120);

    let maxDelta = 0;
    for (let i = 0; i < samples.length; i++) {
      const [x, y] = samples[i];
      const off = await readScenePixel(scene, canvas, x, y);
      maxDelta = Math.max(maxDelta, Math.abs(luma(onPixels[i]) - luma(off)));
    }

    expect(maxDelta).toBeGreaterThan(45);

    // Restore for cleanliness.
    handView.setShowPositionOutlines(true);
    await waitFrames(4);
  });
});
