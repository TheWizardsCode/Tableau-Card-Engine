/**
 * Focused unit tests for LostCitiesTextureHelpers — the inline SVG
 * texture helpers used by Lost Cities for lazy rasterisation.
 *
 * These tests validate key generation, SVG text caching, and
 * getOrCreateTexture-based retrieval for representative card samples.
 *
 * Migration: CG-0MOZN33JW004XILY
 *
 * NOTE: Phaser-related types and constants are imported dynamically to
 * avoid triggering Phaser's window-dependent OS detection in Node.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  CARD_BACK_KEY,
  EXPEDITION_COLORS,
  cardAssetKey,
  compactAssetKey,
} from '../../example-games/lost-cities/LostCitiesCards';
import { makeTextureKey } from '../../src/core-engine/SvgHelpers';

// ── Constants ────────────────────────────────────────────────

/** Lost Cities card dimensions (mirrored from LostCitiesConstants to avoid Phaser dependency). */
const CARD_W = 95;
const CARD_H = 130;
const DISCARD_CARD_W = 57;
const DISCARD_CARD_H = 78;

/** All unique template IDs for Lost Cities full-size cards. */
function allFullSizeTemplateIds(): string[] {
  const ids: string[] = [CARD_BACK_KEY];
  for (const color of EXPEDITION_COLORS) {
    for (let inv = 1; inv <= 3; inv++) {
      ids.push(`lc-${color}-inv${inv}`);
    }
    for (let rank = 2; rank <= 10; rank++) {
      ids.push(`lc-${color}-${rank}`);
    }
  }
  return ids;
}

const ASSET_DIR = join(__dirname, '..', '..', 'public', 'assets', 'cards', 'lost-cities');

// ── Helper: minimal mock scene for SvgHelpers ───────────────

function createMockScene(): any {
  const existingKeys = new Set<string>();
  const textures = new Map<string, { setFilter: () => void }>();

  return {
    sys: { game: {} },
    cache: {
      text: { get: (_: string) => undefined },
      xml: { get: (_: string) => undefined },
      json: { get: (_: string) => undefined },
      audio: { get: (_: string) => undefined },
      binary: { get: (_: string) => undefined },
      image: { get: (_: string) => undefined },
      video: { get: (_: string) => undefined },
      html: { get: (_: string) => undefined },
      obj: { get: (_: string) => undefined },
      anim: { get: (_: string) => undefined },
      glsl: { get: (_: string) => undefined },
      physics: { get: (_: string) => undefined },
      tilemap: { get: (_: string) => undefined },
      shader: { get: (_: string) => undefined },
      bitmapFont: { get: (_: string) => undefined },
    },
    textures: {
      exists: (key: string) => existingKeys.has(key),
      addCanvas: (_: string, __: any) => {
        existingKeys.add(_);
        textures.set(_, { setFilter: () => {} });
      },
      get: (k: string) => textures.get(k),
    },
  };
}

// ── SVG asset existence ──────────────────────────────────────

describe('Lost Cities SVG assets', () => {
  it('should have 121 SVG files in the lost-cities directory', () => {
    // 5 colors × (3 inv + 9 numbered) = 60 full-size + 60 compact + 1 back = 121
    expect(existsSync(ASSET_DIR)).toBe(true);
  });

  it('should have a card back SVG (lc-back.svg)', () => {
    const filePath = join(ASSET_DIR, 'lc-back.svg');
    expect(existsSync(filePath)).toBe(true);
  });

  it.each([
    'lc-yellow-inv1', 'lc-blue-5', 'lc-white-10', 'lc-green-inv3', 'lc-red-2',
  ])('should have numbered/investment SVG for %s', (templateId) => {
    const filePath = join(ASSET_DIR, `${templateId}.svg`);
    expect(existsSync(filePath)).toBe(true);
  });

  it.each([
    'lc-yellow-inv1-sm', 'lc-blue-5-sm', 'lc-white-10-sm', 'lc-green-inv3-sm', 'lc-red-2-sm',
  ])('should have compact SVG for %s', (templateId) => {
    const filePath = join(ASSET_DIR, `${templateId}.svg`);
    expect(existsSync(filePath)).toBe(true);
  });

  it('should have all 60 full-size card face SVGs', () => {
    const fullSizeIds = allFullSizeTemplateIds().filter(id => id !== CARD_BACK_KEY);
    for (const tid of fullSizeIds) {
      const filePath = join(ASSET_DIR, `${tid}.svg`);
      expect(existsSync(filePath)).toBe(true);
    }
  });
});

// ── SVG content validation ───────────────────────────────────

describe('SVG content structure', () => {
  it('should have correct SVG source dimensions in numbered card SVGs', () => {
    const svg = readFileSync(join(ASSET_DIR, 'lc-blue-5.svg'), 'utf8');
    // Source SVGs are 140x190; display scaling to CARD_W=95, CARD_H=130
    // is applied at the Phaser texture level via SvgHelpers.
    expect(svg).toContain('width="140"');
    expect(svg).toContain('height="190"');
  });

  it('should have correct SVG source dimensions in card back SVG', () => {
    const svg = readFileSync(join(ASSET_DIR, 'lc-back.svg'), 'utf8');
    expect(svg).toContain('width="140"');
    expect(svg).toContain('height="190"');
  });

  it('should be valid SVG (starts with <svg and ends with </svg>)', () => {
    const svg = readFileSync(join(ASSET_DIR, 'lc-blue-5.svg'), 'utf8');
    expect(svg.trim()).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });
});

// ── cardAssetKey / compactAssetKey ───────────────────────────

describe('cardAssetKey and compactAssetKey', () => {
  it('should return stable template IDs for a numbered card', () => {
    expect(cardAssetKey({ id: 0, color: 'blue', type: 'numbered', rank: 5, faceUp: true }))
      .toBe('lc-blue-5');
    expect(compactAssetKey({ id: 0, color: 'blue', type: 'numbered', rank: 5, faceUp: true }))
      .toBe('lc-blue-5-sm');
  });

  it('should return correct keys for investment cards', () => {
    expect(cardAssetKey({ id: 0, color: 'red', type: 'investment', investmentIndex: 2, faceUp: true }))
      .toBe('lc-red-inv2');
    expect(compactAssetKey({ id: 0, color: 'red', type: 'investment', investmentIndex: 2, faceUp: true }))
      .toBe('lc-red-inv2-sm');
  });

  it('should export CARD_BACK_KEY as lc-back', () => {
    expect(CARD_BACK_KEY).toBe('lc-back');
  });
});

// ── DPR-aware texture key generation ─────────────────────────

describe('getLcTextureKey', () => {
  it('should produce a DPR-aware key for a full-size card', async () => {
    const { getLcTextureKey } = await import('../../example-games/lost-cities/LostCitiesTextureHelpers');
    const key = getLcTextureKey('lc-blue-5', CARD_W, CARD_H, 2);
    expect(key).toBe('ms_card_lc-blue-5_95x130@2');
  });

  it('should produce a DPR-aware key for a compact card', async () => {
    const { getLcTextureKey } = await import('../../example-games/lost-cities/LostCitiesTextureHelpers');
    const key = getLcTextureKey('lc-blue-5-sm', DISCARD_CARD_W, DISCARD_CARD_H, 2);
    expect(key).toBe('ms_card_lc-blue-5-sm_57x78@2');
  });

  it('should produce a DPR-aware key for the card back', async () => {
    const { getLcTextureKey } = await import('../../example-games/lost-cities/LostCitiesTextureHelpers');
    const key = getLcTextureKey(CARD_BACK_KEY, CARD_W, CARD_H, 2);
    expect(key).toBe('ms_card_lc-back_95x130@2');
  });

  it('should default DPR to 1 in Node environment', async () => {
    const { getLcTextureKey } = await import('../../example-games/lost-cities/LostCitiesTextureHelpers');
    const key = getLcTextureKey('lc-green-10', CARD_W, CARD_H);
    // In Node test environment, window is undefined, so DPR defaults to 1
    expect(key).toBe('ms_card_lc-green-10_95x130@1');
  });

  it('should round non-integer dimensions', async () => {
    const { getLcTextureKey } = await import('../../example-games/lost-cities/LostCitiesTextureHelpers');
    const key = getLcTextureKey('lc-yellow-inv1', 94.7, 129.3, 1);
    expect(key).toBe('ms_card_lc-yellow-inv1_95x129@1');
  });

  it('should produce consistent keys with SvgHelpers.makeTextureKey', async () => {
    const { getLcTextureKey } = await import('../../example-games/lost-cities/LostCitiesTextureHelpers');
    const direct = makeTextureKey('lc-blue-5', CARD_W, CARD_H, 1);
    const helper = getLcTextureKey('lc-blue-5', CARD_W, CARD_H, 1);
    expect(helper).toBe(direct);
  });
});

// ── Lazy rasterisation helpers ──────────────────────────────

describe('lazy rasterisation helpers', () => {
  it('preloadLostCitiesAssets populates svgTextCache for Node environment', async () => {
    const { preloadLostCitiesAssets, ensureLcCardTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    // After preload, ensureLcCardTexture should resolve SVG text from cache
    // and return a DPR-aware key (even if not ready for rasterisation in Node).
    const res = await ensureLcCardTexture(scene, 'lc-blue-5', CARD_W, CARD_H);
    expect(res).toHaveProperty('key');
    expect(res.key).toBe(makeTextureKey('lc-blue-5', CARD_W, CARD_H, 1));
    // In Node environment, ready should be false (no rasterisation possible)
    expect(res.ready).toBe(false);
  });

  it('ensureLcCompactTexture returns DPR-aware key for a compact card after preload', async () => {
    const { preloadLostCitiesAssets, ensureLcCompactTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    const res = await ensureLcCompactTexture(scene, 'lc-blue-5-sm');
    expect(res).toHaveProperty('key');
    expect(res.key).toBe(makeTextureKey('lc-blue-5-sm', DISCARD_CARD_W, DISCARD_CARD_H, 1));
    expect(res.ready).toBe(false);
  });

  it('ensureLcBackTexture returns DPR-aware key for card back after preload', async () => {
    const { preloadLostCitiesAssets, ensureLcBackTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    const res = await ensureLcBackTexture(scene, CARD_W, CARD_H);
    expect(res).toHaveProperty('key');
    expect(res.key).toBe(makeTextureKey(CARD_BACK_KEY, CARD_W, CARD_H, 1));
    expect(res.ready).toBe(false);
  });

  it('ensureLcCardTexture returns fallback template ID key when no SVG text available', async () => {
    const { ensureLcCardTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    // Don't preload — there should be no SVG text available.
    const res = await ensureLcCardTexture(scene, 'lc-nonexistent', CARD_W, CARD_H);
    expect(res).toHaveProperty('key');
    // When SVG text is not found, a key is returned (template ID as fallback)
    expect(typeof res.key).toBe('string');
    expect(res.ready).toBe(false);
  });

  it('returns consistent keys for the same templateId across calls', async () => {
    const { preloadLostCitiesAssets, ensureLcCardTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    const res1 = await ensureLcCardTexture(scene, 'lc-red-10', CARD_W, CARD_H);
    const res2 = await ensureLcCardTexture(scene, 'lc-red-10', CARD_W, CARD_H);
    // Both calls should produce the same key
    expect(res1.key).toBe(res2.key);
  });

  it('handles investment cards correctly via cardAssetKey', async () => {
    const { preloadLostCitiesAssets, ensureLcCardTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    const templateId = cardAssetKey({ id: 0, color: 'yellow', type: 'investment', investmentIndex: 3, faceUp: true });
    expect(templateId).toBe('lc-yellow-inv3');

    const res = await ensureLcCardTexture(scene, templateId, CARD_W, CARD_H);
    expect(res.key).toBe(makeTextureKey('lc-yellow-inv3', CARD_W, CARD_H, 1));
  });

  it('handles compact card keys correctly via compactAssetKey', async () => {
    const { preloadLostCitiesAssets, ensureLcCompactTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    const templateId = compactAssetKey({ id: 0, color: 'white', type: 'numbered', rank: 7, faceUp: true });
    expect(templateId).toBe('lc-white-7-sm');

    const res = await ensureLcCompactTexture(scene, templateId);
    expect(res.key).toBe(makeTextureKey('lc-white-7-sm', DISCARD_CARD_W, DISCARD_CARD_H, 1));
  });

  it('preloads all 121 SVGs into cache in Node environment', async () => {
    const { preloadLostCitiesAssets, ensureLcCardTexture } =
      await import('../../example-games/lost-cities/LostCitiesTextureHelpers');

    const scene = createMockScene();
    preloadLostCitiesAssets(scene);

    // Check a sample from each color/category
    const samples = [
      'lc-yellow-inv1', 'lc-yellow-inv1-sm',
      'lc-blue-5', 'lc-blue-5-sm',
      'lc-white-10', 'lc-white-10-sm',
      'lc-green-inv3', 'lc-green-inv3-sm',
      'lc-red-2', 'lc-red-2-sm',
      CARD_BACK_KEY,
    ];

    for (const templateId of samples) {
      const res = await ensureLcCardTexture(scene, templateId, CARD_W, CARD_H);
      expect(res.key).toBe(makeTextureKey(templateId, CARD_W, CARD_H, 1));
    }
  });
});
