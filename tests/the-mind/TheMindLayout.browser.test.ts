/**
 * TheMindLayout — regression tests verifying The Mind scene layout.
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They boot the The Mind scene and verify that the pile
 * and hands are correctly positioned within the viewport.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { createTheMindGame } from '../../example-games/the-mind/createTheMindGame';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = createTheMindGame({ type: Phaser.CANVAS, parent: 'game-container', width: 1280, height: 720 });
  await waitForScene(game, 'TheMindScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

describe('TheMind layout regression', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('centers pile and hands within the viewport', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('TheMindScene') as Phaser.Scene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    // Find key display objects
    const images = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Image,
    ) as Phaser.GameObjects.Image[];

    const texts = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    // HUD text should exist (level and/or lives)
    const hudTexts = texts.filter((t) => {
      const txt = typeof t.text === 'string' ? t.text : '';
      return txt.includes('Level') || txt.includes('Lives');
    });
    expect(hudTexts.length).toBeGreaterThanOrEqual(1);

    // Pile sprite should be centred horizontally
    const pileSprite = images.find((img) => img.texture.key.includes('mind-back'));
    expect(pileSprite).toBeDefined();
    expect(pileSprite!.x).toBeGreaterThan(w * 0.45);
    expect(pileSprite!.x).toBeLessThan(w * 0.55);

    // No image should extend below the viewport by more than a few pixels
    for (const img of images) {
      const halfH = (img.displayHeight || img.height || 0) / 2;
      expect(img.y + halfH).toBeLessThanOrEqual(h + 2);
      expect(img.y - halfH).toBeGreaterThanOrEqual(-2);
    }
  });
});
