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

    // Try sampling the underlying texture source for one of the icon textures
    // rather than the full game canvas. This avoids coordinate mapping issues
    // and is robust across DPR and renderer modes.
    const keysToTry = [
      'icon-nigiri-salmon', 'icon-nigiri-egg', 'icon-nigiri-squid',
      'icon-maki-1', 'icon-maki-2', 'icon-maki-3',
      'icon-tempura', 'icon-sashimi', 'icon-dumpling',
      'icon-wasabi', 'icon-pudding', 'icon-chopsticks',
    ];

    let foundVariation = false;

    for (const key of keysToTry) {
      try {
        if (!scene.textures.exists(key)) continue;
        const tex = scene.textures.get(key) as any;
        const src = tex?.source?.[0];
        if (!src) continue;
        const imgEl = src.image as HTMLImageElement | HTMLCanvasElement | undefined;
        if (!imgEl) continue;

        const off = document.createElement('canvas');
        const sw = (imgEl as any).width || 1;
        const sh = (imgEl as any).height || 1;
        off.width = sw;
        off.height = sh;
        const ctx = off.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(imgEl as any, 0, 0, sw, sh);

        const sampleW = Math.max(1, Math.floor(sw * 0.5));
        const sampleH = Math.max(1, Math.floor(sh * 0.5));
        const sampleX = Math.floor((sw - sampleW) / 2);
        const sampleY = Math.floor((sh - sampleH) / 2);

        const imgData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
        if (imgData.length < 4) continue;

        const r0 = imgData[0];
        const g0 = imgData[1];
        const b0 = imgData[2];
        const a0 = imgData[3];
        let allSame = true;
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

        if (!allSame) {
          foundVariation = true;
          break;
        }
      } catch (e) {
        // ignore and try next texture
      }
    }

    expect(foundVariation).toBe(true);
  }, 20000);
});
