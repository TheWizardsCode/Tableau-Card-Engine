/**
 * Browser integration test for the Main Street card-art bitmap
 * (CG-0MUCM36EQ008YP4R).
 *
 * The card-art bitmap is embedded in the card SVG as a `data:image/webp`
 * URI and rasterised by Phaser via `rasteriseSvgToTexture`. The unit tests
 * can only assert the data URI's shape and its decoded 256×256 dimensions —
 * they cannot prove the browser actually *draws* it. If WebP decoding
 * regressed (or the `<image href>` were ignored), the art zone would silently
 * fall back to the flat synergy-coloured backing rect, so no assertion on the
 * URI alone would notice.
 *
 * This test rasterises the same card twice in Chromium — once as generated
 * (with art) and once with the `<image>` element stripped (no art) — and
 * asserts that the 64×64 art zone differs materially between the two. That
 * difference can only come from the embedded bitmap being rendered.
 *
 * @module
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  getOrCreateTexture,
  markSceneInvalid,
  markSceneValid,
} from '@core-engine/SvgHelpers';
import { generateBusinessCardSvg } from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

/** Card SVG layout: 140×80 with a 64×64 art zone at (8, 8). */
const SVG_W = 140;
const SVG_H = 80;
const ART_X = 8;
const ART_Y = 8;
const ART_W = 64;
const ART_H = 64;

/**
 * Minimum mean absolute per-channel difference (0–255) in the art zone between
 * the with-art and no-art renders. Measured difference for the real art is
 * ~44; a flat backing rect alone yields ~0.
 */
const MIN_ART_DIFFERENCE = 20;

function makeBusiness(): BusinessCard {
  return {
    family: 'business',
    id: 'biz-bakery',
    name: 'Bakery',
    cost: 300,
    baseIncome: 230,
    synergyTypes: ['Food'],
    maxLevel: 2,
    description: 'Provides warm pastries.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    reputationPerTurn: 5,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

/**
 * Read a rasterised texture back and return the RGBA bytes of its art zone
 * (inset by a few device pixels to skip the rounded clip border). The texture
 * is rasterised at `qualityScale` times the logical SVG size, so the zone
 * bounds are scaled to match.
 */
function sampleArtZone(scene: Phaser.Scene, key: string): number[] {
  const texture = scene.textures.get(key) as any;
  const source = texture?.source?.[0]?.image as HTMLCanvasElement | undefined;
  if (!source) throw new Error(`Texture ${key} has no source image`);

  const texW = (source as any).width || 0;
  const texH = (source as any).height || 0;
  if (!texW || !texH) throw new Error(`Texture ${key} has zero dimensions`);

  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not acquire a 2D context');

  context.drawImage(source as any, 0, 0, texW, texH);

  const scale = texW / SVG_W;
  const inset = Math.max(1, Math.round(4 * scale));
  const x = Math.round(ART_X * scale) + inset;
  const y = Math.round(ART_Y * scale) + inset;
  const w = Math.max(1, Math.round(ART_W * scale) - inset * 2);
  const h = Math.max(1, Math.round(ART_H * scale) - inset * 2);

  return Array.from(context.getImageData(x, y, w, h).data);
}

/** Mean absolute per-channel difference between two equal-length RGBA buffers. */
function meanAbsoluteDifference(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Cannot compare buffers of length ${a.length} and ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}

describe('MainStreet card art (browser integration)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('rasterises the embedded 256×256 WebP art into the 64×64 art zone', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const withArt = generateBusinessCardSvg(makeBusiness());
    // The generated `<image … />` is self-closing; removing it leaves the
    // flat synergy-coloured backing rect that the no-art path would draw.
    const withoutArt = withArt.replace(/<image\s[^>]*\/>/g, '');

    expect(withArt).toContain('data:image/webp;base64,');
    expect(withoutArt).not.toContain('data:image/webp;base64,');

    const zones = await new Promise<{ withArt: number[]; withoutArt: number[] }>(
      (resolve, reject) => {
        class CardArtScene extends Phaser.Scene {
          constructor() {
            super('CardArtScene');
          }

          create() {
            markSceneValid(this);
            const a = getOrCreateTexture(this, 'card-art-with', withArt, SVG_W, SVG_H);
            const b = getOrCreateTexture(this, 'card-art-without', withoutArt, SVG_W, SVG_H);

            Promise.all([a.promise, b.promise])
              .then(() => {
                try {
                  expect(this.textures.exists(a.key)).toBe(true);
                  expect(this.textures.exists(b.key)).toBe(true);
                  const zones = {
                    withArt: sampleArtZone(this, a.key),
                    withoutArt: sampleArtZone(this, b.key),
                  };
                  markSceneInvalid(this);
                  resolve(zones);
                } catch (error) {
                  reject(error);
                }
              })
              .catch(reject);
          }
        }

        game = new Phaser.Game({
          type: Phaser.CANVAS,
          width: 320,
          height: 200,
          parent: 'game-container',
          scene: [CardArtScene],
        });
      },
    );

    const difference = meanAbsoluteDifference(zones.withArt, zones.withoutArt);
    expect(difference).toBeGreaterThan(MIN_ART_DIFFERENCE);
  }, 15000);
});
