import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import {
  markSceneValid,
  markSceneInvalid,
  getOrCreateTexture,
} from '../../src/core-engine/SvgHelpers';

describe('SvgHelpers (browser integration)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) {
      game.destroy(true, false);
    }
    game = null;

    const container = document.getElementById('game-container');
    if (container) {
      container.remove();
    }
  });

  it('creates a Phaser texture from SVG via getOrCreateTexture', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const created = new Promise<void>((resolve, reject) => {
      class SvgTestScene extends Phaser.Scene {
        constructor() {
          super('SvgTestScene');
        }

        create() {
          markSceneValid(this);
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="2" width="28" height="28" fill="#f97316"/><circle cx="16" cy="16" r="8" fill="#1d4ed8"/></svg>';
          const result = getOrCreateTexture(this, 'svg-helper-integration', svg, 32, 32);

          const finalize = () => {
            try {
              expect(this.textures.exists(result.key)).toBe(true);
              const image = this.add.image(40, 40, result.key);
              expect(image.texture.key).toBe(result.key);
              markSceneInvalid(this);
              resolve();
            } catch (error) {
              reject(error);
            }
          };

          if (result.ready) {
            finalize();
          } else if (result.promise) {
            result.promise.then(finalize).catch(reject);
          } else {
            reject(new Error('Texture generation did not return a promise.'));
          }
        }
      }

      game = new Phaser.Game({ type: Phaser.CANVAS,
        width: 128,
        height: 128,
        parent: 'game-container',
        scene: [SvgTestScene],
      });
    });

    await created;
  }, 10000);
});
