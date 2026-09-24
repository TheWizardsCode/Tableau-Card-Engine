#!/usr/bin/env node

/**
 * Main Street Card Art Map Generator
 *
 * Builds `example-games/main-street/card-art-map.json` from the committed
 * high-resolution card sprites
 * (`example-games/main-street/sprites/<Name>_1024_x_1024.png`).
 * The map is consumed by both the runtime TS generator
 * (`MainStreetCardArt.ts`) and the static SVG generator
 * (`scripts/generate-main-street-card-svgs.mjs`).
 *
 * CG-0MTORJ5FS006B0UN (producer manual review): every card's 64×64 art zone
 * shows the card's art from the sprites folder.
 *
 * CG-0MUCM36EQ008YP4R: the *embedded* bitmap is now 256×256, downscaled from
 * the 1024×1024 source art, instead of a 64×64 thumbnail. The 64×64 art zone
 * is a layout dimension expressed in SVG user units — it is *not* the render
 * resolution. Because Phaser rasterises the card SVG at up to 4× quality
 * scale (`rasteriseSvgToTexture`, `qualityScale = Math.max(4, dpr)`), a 64×64
 * bitmap was stretched to 256×256 device pixels and appeared pixelated. A
 * 256×256 source fills the zone at 1:1 and stays crisp.
 *
 * Why a base64 map? The card SVGs are rasterised by Phaser from a `data:` URI,
 * where external image references do not resolve — so the art must travel
 * inline with the SVG. The map keeps the generated SVGs self-contained.
 *
 * Why WebP rather than PNG? At 256×256 the source art is detailed enough that
 * a 256-colour indexed PNG costs ~5.3 MB of base64 across all 63 sprites,
 * which would more than double the bundled app. Lossy WebP at quality 90
 * costs ~0.5 MB — smaller than the previous 64×64 PNG map (~0.34 MB) despite
 * carrying 16× the pixels — and Chromium (browser + Electron), Firefox and
 * Safari all decode WebP inside SVG `<image>`. The committed 1024×1024 sprites
 * remain the source of truth.
 *
 * Inputs:
 *   example-games/main-street/sprites/<Name>_1024_x_1024.png
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
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SPRITES_DIR = path.join(ROOT, 'example-games', 'main-street', 'sprites');
const MAP_PATH = path.join(ROOT, 'example-games', 'main-street', 'card-art-map.json');

/** Source sprite suffix — the committed high-resolution art is the truth. */
const SOURCE_SUFFIX = '_1024_x_1024.png';

/**
 * Side length (in SVG user units) of the square card-art *zone* on a card
 * face. This is a layout dimension and must stay in sync with
 * `GRAPHIC_W`/`GRAPHIC_H` in `MainStreetCardSvgGenerator.ts` and
 * `scripts/generate-main-street-card-svgs.mjs`.
 */
const ART_SIZE = 64;

/**
 * Side length (px) of the embedded art *bitmap*. Independent of the 64×64
 * zone: the bitmap is drawn into the zone and downsampled by the SVG
 * rasteriser. 256 covers the 4× quality scale (`Math.max(4, dpr)`) at 1:1.
 */
const ART_RESOLUTION = 256;

/** Lossy WebP quality for the embedded art (see module docs for the rationale). */
const ART_WEBP_QUALITY = 90;

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

/** Base names of every committed 1024×1024 sprite, sorted for deterministic output. */
export function listSpriteNames() {
  return fs
    .readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith(SOURCE_SUFFIX))
    .map((f) => f.slice(0, -SOURCE_SUFFIX.length))
    .sort();
}

/**
 * Downscale a committed 1024×1024 sprite to the embedded art resolution and
 * re-encode it as lossy WebP.
 *
 * @param {string} filePath - Absolute path to the source sprite.
 * @returns {Promise<Buffer>} The WebP bytes.
 */
export async function encodeArt(filePath) {
  return sharp(filePath)
    .resize(ART_RESOLUTION, ART_RESOLUTION, { fit: 'cover', kernel: 'lanczos3' })
    .webp({ quality: ART_WEBP_QUALITY })
    .toBuffer();
}

/**
 * Regenerate `card-art-map.json` from the committed 1024×1024 sprites.
 *
 * Each sprite is downscaled to {@link ART_RESOLUTION} and re-encoded as lossy
 * WebP (see {@link encodeArt}) to keep the inline base64 map small; the
 * committed 1024×1024 sprites remain the source of truth.
 *
 * @returns {Promise<{ sprites: number, mapPath: string, totalBytes: number }>}
 */
export async function regenerateCardArt() {
  const names = listSpriteNames();
  const art = {};

  for (const name of names) {
    const artBytes = await encodeArt(path.join(SPRITES_DIR, `${name}${SOURCE_SUFFIX}`));
    art[name] = `data:image/webp;base64,${artBytes.toString('base64')}`;
  }

  const map = {
    version: 2,
    artSize: ART_SIZE,
    artResolution: ART_RESOLUTION,
    format: 'webp',
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
        `Generated art map for ${r.sprites} sprites at ${ART_RESOLUTION}x${ART_RESOLUTION} ` +
          `(drawn into a ${ART_SIZE}x${ART_SIZE} zone); ` +
          `map: ${path.relative(ROOT, r.mapPath)} (${Math.round(r.totalBytes / 1024)} KB of base64)`,
      );
    })
    .catch((err) => {
      console.error('Card art generation failed:', err);
      process.exit(1);
    });
}
