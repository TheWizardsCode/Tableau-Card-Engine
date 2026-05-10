import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { SushiGoScene } from '../../example-games/sushi-go/scenes/SushiGoScene';
import { waitForScene } from '../helpers/waitForScene';

describe('SushiGoScene SVG icon rendering', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('renders sushi icons as non-solid images (not black squares)', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a3a',
      scene: [SushiGoScene],
    });

    await waitForScene(game, 'SushiGoScene');

    const scene = game!.scene.getScene('SushiGoScene') as any;
    expect(scene).toBeTruthy();

    // Ensure textures appear to be loaded
    const keys = [
      'icon-nigiri-salmon', 'icon-nigiri-egg', 'icon-nigiri-squid',
      'icon-maki-1', 'icon-maki-2', 'icon-maki-3',
      'icon-tempura', 'icon-sashimi', 'icon-dumpling',
      'icon-wasabi', 'icon-pudding', 'icon-chopsticks',
    ];
    for (const k of keys) {
      // textures.exists may throw if textures not ready; guard with try
      try {
        expect(scene.textures.exists(k)).toBe(true);
      } catch (e) {
        // If texture check throws, fail the test with helpful message
        throw new Error(`Expected texture ${k} to exist: ${String(e)}`);
      }
    }

    // Find the first hand card container and compute its bounds
    const handContainer = scene.handContainer as Phaser.GameObjects.Container;
    expect(handContainer).toBeTruthy();
    const firstChild = handContainer.list[0] as Phaser.GameObjects.Container;
    expect(firstChild).toBeTruthy();

    const bounds = firstChild.getBounds();

    // Obtain a PNG dataURL of the canvas and sample the region corresponding to the card
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();

    // Draw the canvas into an offscreen 2D canvas so we can read pixels
    const dataUrl = canvas!.toDataURL();
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (err) => reject(err);
      i.src = dataUrl;
    });

    const off = document.createElement('canvas');
    off.width = img.width;
    off.height = img.height;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('Unable to create 2d context for pixel sampling');
    ctx.drawImage(img, 0, 0);

    // Clamp bounds within canvas
    const x = Math.max(0, Math.floor(bounds.x));
    const y = Math.max(0, Math.floor(bounds.y));
    const w = Math.max(1, Math.min(off.width - x, Math.floor(bounds.width)));
    const h = Math.max(1, Math.min(off.height - y, Math.floor(bounds.height)));

    const imgData = ctx.getImageData(x, y, w, h).data;

    // Check whether all pixels are the same RGBA value (solid color)
    let allSame = true;
    if (imgData.length >= 4) {
      const r0 = imgData[0];
      const g0 = imgData[1];
      const b0 = imgData[2];
      const a0 = imgData[3];
      for (let i = 4; i < imgData.length; i += 4) {
        if (
          imgData[i] !== r0 ||
          imgData[i + 1] !== g0 ||
          imgData[i + 2] !== b0 ||
          imgData[i + 3] !== a0
        ) {
          allSame = false;
          break;
        }
      }
    }

    expect(allSame).toBe(false);
  }, 20000);
});
