import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ parent: 'game-container' });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readScenePixel(scene: any, canvas: HTMLCanvasElement, x: number, y: number): Promise<[number, number, number, number]> {
  // Prefer Phaser renderer snapshot API when available.
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
  } catch (_) { /* fall back */ }

  // Fallback path: read from 2D or WebGL context.
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

function colorDistance(a: [number, number, number, number], b: [number, number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

describe('MainStreet Help panel layering (visual)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders help panel above market cards and HUD strip when opened', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    await waitFrames(6);

    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    if (!canvas) throw new Error('Canvas not found');

    const l = scene.layout;

    // Repro point requested by operator: first card in first market row.
    const firstCardX = Math.floor((l.marketLabelW + 50) + l.marketCardW * 0.5);
    const firstCardY = Math.floor((l.marketTop + 6) + l.marketCardH * 0.5);
    const samplePoint: [number, number] = [
      Math.max(2, Math.min(firstCardX, canvas.width - 3)),
      Math.max(2, Math.min(firstCardY, canvas.height - 3)),
    ];

    const beforePixel = await readScenePixel(scene, canvas, samplePoint[0], samplePoint[1]);
    scene.helpPanel.open();
    await waitFrames(24);

    expect(scene.helpPanel.isOpen).toBe(true);
    // DOM-rendered card images should be hidden while the panel is open.
    const domImages = Array.from(document.querySelectorAll('#game-container img')) as HTMLImageElement[];
    if (domImages.length > 0) {
      expect(domImages[0].style.visibility).toBe('hidden');
    }
    const panelContainer = (scene.helpPanel as any).container as Phaser.GameObjects.Container;
    expect(panelContainer.visible).toBe(true);
    expect(panelContainer.x).toBeGreaterThanOrEqual(-1);

    const afterOpenPixel = await readScenePixel(scene, canvas, samplePoint[0], samplePoint[1]);

    // Help panel background is dark blue-ish: 0x1a1a2e => (26,26,46)
    const panelColor: [number, number, number, number] = [26, 26, 46, 255];

    // Open panel should visibly affect sampled pixel and match panel tint.
    expect(colorDistance(beforePixel, afterOpenPixel)).toBeGreaterThan(40);
    expect(colorDistance(afterOpenPixel, panelColor)).toBeLessThan(220);

    // Closing should restore underlying first-card pixel.
    scene.helpPanel.close();
    await waitFrames(24);
    const afterClosePixel = await readScenePixel(scene, canvas, samplePoint[0], samplePoint[1]);

    if (domImages.length > 0) {
      expect(domImages[0].style.visibility).toBe('visible');
    }
    expect(colorDistance(afterOpenPixel, afterClosePixel)).toBeGreaterThan(40);
  });
});
