import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import {
  markSceneValid,
  markSceneInvalid,
  makeTextureKey,
  rasteriseSvgToTexture,
  getOrCreateTexture,
  SVG_TEXTURE_FILTER_MODE,
} from '../../src/core-engine/SvgHelpers';
import { createCardGame } from '../../src/ui/createCardGame';

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

  it('rasterises SVG textures with linear filtering even when antialias is disabled', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const scaleMode = await new Promise<number>((resolve, reject) => {
      class FilterProbeScene extends Phaser.Scene {
        constructor() {
          super('FilterProbeScene');
        }

        create() {
          markSceneValid(this);
          const key = makeTextureKey('filter-probe', 16, 16, 2, 'probe_');
          rasteriseSvgToTexture(
            this,
            key,
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ffffff"/></svg>',
            16,
            16,
            2,
          )
            .then(() => {
              const source = this.textures.get(key).source[0] as unknown as {
                scaleMode: number;
              };
              markSceneInvalid(this);
              resolve(source.scaleMode);
            })
            .catch(reject);
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 64,
        height: 64,
        parent: 'game-container',
        // The config that previously forced NEAREST on every texture.
        antialias: false,
        antialiasGL: false,
        scene: [FilterProbeScene],
      });
    });

    expect(SVG_TEXTURE_FILTER_MODE).toBe(0);
    expect(scaleMode).toBe(SVG_TEXTURE_FILTER_MODE);
  }, 15000);

  it('renders minified SVG textures with smoothing (no hard pixel edges)', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    // Hard black/white vertical boundary at x=2 (logical). Rasterised at 2x
    // (8x8) and displayed at 5x5 — a non-integer scale, so the boundary falls
    // between display pixels: linear filtering blends it to grey, nearest
    // leaves only pure black/white pixels.
    const edgeSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" viewBox="0 0 4 4">' +
      '<rect x="0" y="0" width="2" height="4" fill="#000000"/>' +
      '<rect x="2" y="0" width="2" height="4" fill="#ffffff"/>' +
      '</svg>';

    const blended = await new Promise<boolean>((resolve, reject) => {
      class SmoothProbeScene extends Phaser.Scene {
        constructor() {
          super('SmoothProbeScene');
        }

        create() {
          markSceneValid(this);
          const key = makeTextureKey('smooth-probe', 4, 4, 2, 'probe_');
          rasteriseSvgToTexture(this, key, edgeSvg, 4, 4, 2)
            .then(() => {
              this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(5, 5);

              let frames = 0;
              const onPostRender = () => {
                frames += 1;
                if (frames < 3) return;
                this.game.events.off('postrender', onPostRender);
                try {
                  const ctx = (this.game.canvas as HTMLCanvasElement).getContext('2d');
                  if (!ctx) {
                    reject(new Error('no 2d context on game canvas'));
                    return;
                  }
                  const data = ctx.getImageData(0, 0, 5, 5).data;
                  let foundGrey = false;
                  for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    if (r > 40 && r < 215 && g > 40 && g < 215 && b > 40 && b < 215) {
                      foundGrey = true;
                    }
                  }
                  markSceneInvalid(this);
                  resolve(foundGrey);
                } catch (error) {
                  reject(error);
                }
              };
              this.game.events.on('postrender', onPostRender);
            })
            .catch(reject);
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 16,
        height: 16,
        parent: 'game-container',
        backgroundColor: '#00ff00',
        scene: [SmoothProbeScene],
      });
    });

    expect(blended).toBe(true);
  }, 15000);

  it('does not force nearest filtering on textures created via createCardGame', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const scaleMode = await new Promise<number>((resolve) => {
      class ConfigProbeScene extends Phaser.Scene {
        constructor() {
          super('ConfigProbeScene');
        }

        create() {
          const canvas = document.createElement('canvas');
          canvas.width = 4;
          canvas.height = 4;
          this.textures.addCanvas('config-probe', canvas);
          const source = this.textures.get('config-probe').source[0] as unknown as {
            scaleMode: number;
          };
          resolve(source.scaleMode);
        }
      }

      game = createCardGame({ backgroundColor: '#000000', scenes: [ConfigProbeScene] });
    });

    expect(scaleMode).toBe(0);
  }, 15000);
});
