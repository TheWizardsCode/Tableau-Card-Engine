#!/usr/bin/env node

/**
 * Main Street Card Art Map Generator
 *
 * Builds `example-games/main-street/card-art-map.json` from the committed
 * 64×64 card sprites (`example-games/main-street/sprites/<Name>_64_x_64.png`).
 * The map is consumed by both the runtime TS generator
 * (`MainStreetCardArt.ts`) and the static SVG generator
 * (`scripts/generate-main-street-card-svgs.mjs`).
 *
 * CG-0MTORJ5FS006B0UN (producer manual review): every card's 64×64 art zone
 * shows the art PNG from the sprites folder, named as the card with a
 * "_64_x_64" suffix (width x height).
 *
 * Why a base64 map? The card SVGs are rasterised by Phaser from a `data:` URI,
 * where external image references do not resolve — so the art must travel
 * inline with the SVG. The map keeps the generated SVGs self-contained.
 *
 * To keep the base64 map (and therefore the bundled app) small, each sprite is
 * re-encoded as a 256-colour indexed PNG before embedding. Measured against
 * the committed sources this is visually near-lossless (per-channel RMSE ~1.9
 * of 255) while roughly halving the raw art bytes; the committed full-colour
 * sprites remain the source of truth.
 *
 * Inputs:
 *   example-games/main-street/sprites/<Name>_64_x_64.png
 *
 * Outputs:
 *   example-games/main-street/card-art-map.json
 *
 * Usage:
 *   node scripts/generate-main-street-card-art.mjs
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SPRITES_DIR = path.join(ROOT, 'example-games', 'main-street', 'sprites');
const MAP_PATH = path.join(ROOT, 'example-games', 'main-street', 'card-art-map.json');

const SOURCE_SUFFIX = '_64_x_64.png';
const ART_SIZE = 64;

/**
 * CSV card-name -> sprite base-name overrides for spelling variants that
 * differ between the content CSV and the art files. Everything else falls
 * back to an exact name match (or the Fallback sprite).
 */
export const CARD_ART_ALIASES = {
  'Community Renovation': 'Community Rennovation',
  'Labor Shortage': 'Labour Shortage',
  'Neighborhood Watch': 'Neighbourhood Watch',
  'Physiotherapy': 'Physiotherapist',
  'Graffiti': 'Graffiti Art',
};

/** Sprite used when a card has no dedicated art. */
export const CARD_ART_FALLBACK = 'Fallback';

/** Base names of every committed 64×64 sprite, sorted for deterministic output. */
export function listSpriteNames() {
  return fs
    .readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith(SOURCE_SUFFIX))
    .map((f) => f.slice(0, -SOURCE_SUFFIX.length))
    .sort();
}

/**
 * Re-encode a committed 64×64 sprite as a small 256-colour indexed PNG.
 *
 * @param {string} filePath - Absolute path to the source sprite.
 * @returns {Promise<Buffer>} The indexed PNG bytes.
 */
export async function encode64(filePath) {
  return sharp(filePath)
    .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0 })
    .toBuffer();
}

/**
 * Regenerate `card-art-map.json` from the committed 64×64 sprites.
 *
 * Each sprite is re-encoded as a near-lossless 256-colour indexed PNG (see
 * {@link encode64}) to keep the inline base64 map small; the committed
 * full-colour sprites remain the source of truth.
 *
 * @returns {Promise<{ sprites: number, mapPath: string, totalBytes: number }>}
 */
export async function regenerateCardArt() {
  const names = listSpriteNames();
  const art = {};

  for (const name of names) {
    const png = await encode64(path.join(SPRITES_DIR, `${name}${SOURCE_SUFFIX}`));
    art[name] = `data:image/png;base64,${png.toString('base64')}`;
  }

  const map = {
    version: 1,
    artSize: ART_SIZE,
    fallback: CARD_ART_FALLBACK,
    aliases: CARD_ART_ALIASES,
    art,
  };

  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');

  const totalBytes = Object.values(art).reduce((n, uri) => n + uri.length, 0);

  return { sprites: names.length, mapPath: MAP_PATH, totalBytes };
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  regenerateCardArt()
    .then((r) => {
      console.log(
        `Generated art map for ${r.sprites} x ${ART_SIZE}x${ART_SIZE} sprites; ` +
          `map: ${path.relative(ROOT, r.mapPath)} (${Math.round(r.totalBytes / 1024)} KB of base64)`,
      );
    })
    .catch((err) => {
      console.error('Card art generation failed:', err);
      process.exit(1);
    });
}
