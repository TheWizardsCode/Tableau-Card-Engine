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

  const game = createTheMindGame({ parent: 'game-container', width: 1280, height: 720 });
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

    // Find key display objects by checking all children
    const images = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Image,
    ) as Phaser.GameObjects.Image[];

    const texts = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    // PILE label should exist
    const pileLabel = texts.find((t) => t.text === 'PILE');
    expect(pileLabel).toBeDefined();

    // "Your Hand" label should exist
    const yourHandLabel = texts.find((t) => t.text === 'Your Hand');
    expect(yourHandLabel).toBeDefined();

    // "AI Hand" label should exist
    const aiHandLabel = texts.find((t) => t.text === 'AI Hand');
    expect(aiHandLabel).toBeDefined();

    // Pile sprite should be roughly centered horizontally
    const pileSprite = images.find((img) => img.texture.key.includes('mind-back'));
    expect(pileSprite).toBeDefined();
    expect(pileSprite!.x).toBeGreaterThan(600);
    expect(pileSprite!.x).toBeLessThan(680);

    // AI Hand label should be below the title (title is at y≈14) but on-screen
    expect(aiHandLabel!.y).toBeGreaterThan(30);
    expect(aiHandLabel!.y).toBeLessThan(60);

    // Your Hand label should be well above the bottom
    expect(yourHandLabel!.y).toBeGreaterThan(480);
    expect(yourHandLabel!.y).toBeLessThan(530);

    // No image should extend below the viewport (720px) by more than a few pixels
    for (const img of images) {
      const halfH = (img.displayHeight || img.height || 0) / 2;
      expect(img.y + halfH).toBeLessThanOrEqual(720);
      expect(img.y - halfH).toBeGreaterThanOrEqual(-2);
    }
  });
});
