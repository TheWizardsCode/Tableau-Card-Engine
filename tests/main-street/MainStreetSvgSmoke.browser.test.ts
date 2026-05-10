import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame();
  await waitForScene(game, 'MainStreetScene');
  return game;
}

async function waitForCondition(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

function isTextureNonSolid(scene: Phaser.Scene, key: string): boolean {
  const texture = scene.textures.get(key) as any;
  const source = texture?.source?.[0]?.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!source) return false;

  const width = (source as any).width || 1;
  const height = (source as any).height || 1;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return false;

  context.drawImage(source as any, 0, 0, width, height);

  const sampleW = Math.max(1, Math.floor(width * 0.5));
  const sampleH = Math.max(1, Math.floor(height * 0.5));
  const sampleX = Math.floor((width - sampleW) / 2);
  const sampleY = Math.floor((height - sampleH) / 2);
  const data = context.getImageData(sampleX, sampleY, sampleW, sampleH).data;

  if (data.length < 4) return false;

  const r0 = data[0];
  const g0 = data[1];
  const b0 = data[2];
  const a0 = data[3];

  for (let i = 4; i < data.length; i += 4) {
    if (
      data[i] !== r0 ||
      data[i + 1] !== g0 ||
      data[i + 2] !== b0 ||
      data[i + 3] !== a0
    ) {
      return true;
    }
  }

  return false;
}

describe('MainStreetScene SVG smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('renders at least one rasterized SVG card texture that is non-solid', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene;

    await waitForCondition(() => {
      const keys = (scene.textures.getTextureKeys?.() ?? []).filter((k) => k.startsWith('ms_card_'));
      return keys.length > 0;
    }, 3000);

    const cardKeys = (scene.textures.getTextureKeys?.() ?? []).filter((k) => k.startsWith('ms_card_')).sort();
    expect(cardKeys.length).toBeGreaterThan(0);

    const hasVariation = cardKeys.some((key) => isTextureNonSolid(scene, key));
    expect(hasVariation).toBe(true);
  }, 10000);
});
