import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { createTheMindGame } from '../../example-games/the-mind/createTheMindGame';

describe('TheMind browser smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    const el = document.getElementById('game-container');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    game = null;
  });

  it('renders at least one Mind card to the canvas', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = createTheMindGame({ parent: 'game-container', width: 900, height: 700 });

    // Wait for the scene to create and render some sprites. We poll until
    // a humanCard sprite appears or timeout.
    const scene = () => game?.scene.getScene('TheMindScene') as any | undefined;

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const s = scene();
        if (s && Array.isArray(s.humanCardSprites) && s.humanCardSprites.length > 0) {
          resolve();
          return;
        }
        if (Date.now() - start > 10_000) {
          reject(new Error('TheMindScene did not render human card sprites in time'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });

    const s = scene()!;
    expect(s).toBeTruthy();
    const sprite = s.humanCardSprites[0];
    expect(sprite).toBeTruthy();

    // Ensure the canvas has non-transparent pixels (basic rendering check).
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    const ctx = canvas!.getContext('2d');
    expect(ctx).toBeTruthy();

    const imgData = ctx!.getImageData(0, 0, canvas!.width, canvas!.height).data;
    let nonTransparent = false;
    for (let i = 3; i < imgData.length; i += 4) {
      if (imgData[i] !== 0) {
        nonTransparent = true;
        break;
      }
    }

    expect(nonTransparent).toBe(true);
  }, 30_000);
});
