/**
 * Contract tests for the tracked tableau-emblem source SVG
 * (`public/favicon.svg`) — CG-0MUTTXRWZ009NUB9 / CG-0MUU3Q2UV003F1H2.
 *
 * The emblem is the single source of truth for every web and desktop icon
 * variant, so this suite pins the properties the whole icon pipeline depends
 * on: it is a well-formed, self-contained square SVG that rasterises with
 * `sharp` to a square, non-empty PNG at both extremes (16x16 for the browser
 * tab and 1024x1024 for packaging). If the emblem stops rasterising or loses
 * its square aspect, the generated favicons and application icons would break.
 *
 * These assertions exercise observable behaviour of the artefact (does it
 * rasterise? is it square? is it non-empty?) rather than re-implementing the
 * generator.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EMBLEM_PATH = path.join(REPO_ROOT, 'public', 'favicon.svg');
const EMBLEM_SVG = fs.readFileSync(EMBLEM_PATH, 'utf8');

/** Rasterise the emblem to a square PNG at the requested pixel size. */
async function rasterise(size: number) {
  // Render at a density that keeps the SVG crisp at the target size instead of
  // upscaling a 72-dpi raster of the 64x64 intrinsic viewBox.
  const density = Math.max(72, Math.round((size / 64) * 72));
  return sharp(Buffer.from(EMBLEM_SVG), { density })
    .resize(size, size)
    .png()
    .toBuffer({ resolveWithObject: true });
}

describe('tableau emblem (public/favicon.svg)', () => {
  it('is well-formed enough for sharp to parse and rasterise', async () => {
    // A malformed SVG makes sharp/librsvg throw — this is the well-formedness
    // gate the rest of the icon pipeline relies on.
    const { info } = await rasterise(64);
    expect(info.format).toBe('png');
    expect(info.width).toBe(64);
    expect(info.height).toBe(64);
  });

  it('declares a square viewBox so every icon variant stays square', () => {
    const match = /viewBox\s*=\s*"([^"]+)"/i.exec(EMBLEM_SVG);
    expect(match, 'emblem must declare a viewBox').not.toBeNull();
    const [, viewBox] = match as RegExpExecArray;
    const [, , width, height] = viewBox.split(/[\s,]+/).map(Number);
    expect(width).toBeGreaterThan(0);
    expect(width).toBe(height);
  });

  it('is self-contained: no scripts, external images, or remote references', () => {
    expect(EMBLEM_SVG).not.toMatch(/<script[\s>]/i);
    expect(EMBLEM_SVG).not.toMatch(/<image[\s>]/i);
    // No href/xlink references (the xmlns namespace is an attribute, not a ref).
    expect(EMBLEM_SVG).not.toMatch(/\b(?:xlink:)?href\s*=/i);
    // No CSS url() references and no remote style imports.
    expect(EMBLEM_SVG).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(EMBLEM_SVG).not.toMatch(/@import/i);
  });

  it('carries a provenance/licence header comment for maintainers', () => {
    const header = EMBLEM_SVG.slice(0, EMBLEM_SVG.indexOf('<svg'));
    expect(header).toMatch(/Provenance/i);
    expect(header).toMatch(/CC0/i);
  });

  it.each([16, 1024])(
    'rasterises to a square, non-empty PNG at %ipx',
    async (size) => {
      const { data, info } = await rasterise(size);
      expect(info.width).toBe(size);
      expect(info.height).toBe(size);
      expect(data.length).toBeGreaterThan(0);

      const stats = await sharp(data).stats();
      const alpha = stats.channels[3];
      // The rounded badge is opaque (content is drawn) …
      expect(alpha.max).toBe(255);
      // … while the corners are transparent (a real emblem, not a flat block).
      expect(alpha.min).toBe(0);
    },
  );
});
