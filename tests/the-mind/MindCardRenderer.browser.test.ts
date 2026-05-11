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

    // Wait for the Phaser texture manager to contain at least one Mind card
    // texture (e.g. 'mind-1'). The loader's svg registered textures should
    // be available before `create()` finishes; wait up to 10s.
    const textures = () => game?.scene.getScene('TheMindScene')?.textures as Phaser.Textures.TextureManager | undefined;

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const t = textures();
        if (t && (t.exists('mind-1') || t.exists('mind-42') || t.exists('mind-100'))) {
          resolve();
          return;
        }
        if (Date.now() - start > 10_000) {
          reject(new Error('Mind textures were not available in time'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });

    // Basic rendering check: ensure the canvas contains non-transparent pixels.
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
