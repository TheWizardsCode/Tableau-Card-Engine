import { describe, it, expect } from 'vitest';
import {
  resolveTemplateId,
  resolveBackTemplateId,
  getCanonicalTextureKey,
  ensureTexture,
  ensureBackTexture,
  getTextureKey,
} from '../../example-games/the-mind/MindCardTextureAdapter';
import {
  MIND_CARD_W,
  MIND_CARD_H,
} from '../../example-games/the-mind/MindCardRenderer';
import {
  CARD_BACK_KEY,
} from '../../example-games/the-mind/MindCard';

// ── resolveTemplateId ────────────────────────────────────────

describe('resolveTemplateId', () => {
  it('should return mind-1 for value 1', () => {
    expect(resolveTemplateId(1)).toBe('mind-1');
  });

  it('should return mind-50 for value 50', () => {
    expect(resolveTemplateId(50)).toBe('mind-50');
  });

  it('should return mind-100 for value 100', () => {
    expect(resolveTemplateId(100)).toBe('mind-100');
  });

  it('should throw for value 0', () => {
    expect(() => resolveTemplateId(0)).toThrow('Invalid Mind card value');
  });

  it('should throw for value 101', () => {
    expect(() => resolveTemplateId(101)).toThrow('Invalid Mind card value');
  });

  it('should throw for non-integer values', () => {
    expect(() => resolveTemplateId(3.5)).toThrow('Invalid Mind card value');
  });

  it('should throw for negative values', () => {
    expect(() => resolveTemplateId(-1)).toThrow('Invalid Mind card value');
  });

  it('should throw for NaN', () => {
    expect(() => resolveTemplateId(NaN)).toThrow('Invalid Mind card value');
  });

  it('should throw for Infinity', () => {
    expect(() => resolveTemplateId(Infinity)).toThrow('Invalid Mind card value');
  });
});

// ── resolveBackTemplateId ─────────────────────────────────────

describe('resolveBackTemplateId', () => {
  it('should return mind-back', () => {
    expect(resolveBackTemplateId()).toBe('mind-back');
  });

  it('should match CARD_BACK_KEY', () => {
    expect(resolveBackTemplateId()).toBe(CARD_BACK_KEY);
  });
});

// ── getCanonicalTextureKey ───────────────────────────────────

describe('getCanonicalTextureKey', () => {
  it('should produce a DPR-aware key using mind-42 template ID', () => {
    const key = getCanonicalTextureKey('mind-42', 48, 65, 2);
    expect(key).toBe('ms_card_mind-42_48x65@2');
  });

  it('should produce a key for the card back', () => {
    const key = getCanonicalTextureKey('mind-back', 48, 65, 1);
    expect(key).toBe('ms_card_mind-back_48x65@1');
  });

  it('should default width/height to MIND_CARD_W and MIND_CARD_H', () => {
    const key = getCanonicalTextureKey('mind-42', undefined, undefined, 1);
    expect(key).toBe(`ms_card_mind-42_${MIND_CARD_W}x${MIND_CARD_H}@1`);
  });

  it('should default DPR to 1 in Node (no window.devicePixelRatio)', () => {
    const key = getCanonicalTextureKey('mind-42');
    // In Node, window is undefined so DPR defaults to 1
    expect(key).toBe(`ms_card_mind-42_${MIND_CARD_W}x${MIND_CARD_H}@1`);
  });

  it('should use explicit DPR when provided', () => {
    const key = getCanonicalTextureKey('mind-1', 48, 65, 3);
    expect(key).toBe('ms_card_mind-1_48x65@3');
  });

  it('should round non-integer dimensions in the key', () => {
    const key = getCanonicalTextureKey('mind-42', 47.7, 64.3, 1);
    expect(key).toBe('ms_card_mind-42_48x64@1');
  });
});

// ── getTextureKey ────────────────────────────────────────────

describe('getTextureKey', () => {
  it('should return DPR-aware key for a face-up card', () => {
    const card = { value: 42, faceUp: true };
    const key = getTextureKey(card, 48, 65, 1);
    expect(key).toBe('ms_card_mind-42_48x65@1');
  });

  it('should return DPR-aware key for a face-down card', () => {
    const card = { value: 42, faceUp: false };
    const key = getTextureKey(card, 48, 65, 1);
    expect(key).toBe('ms_card_mind-back_48x65@1');
  });

  it('should use default dimensions when not specified', () => {
    const card = { value: 1, faceUp: true };
    const key = getTextureKey(card, undefined, undefined, 1);
    expect(key).toBe(`ms_card_mind-1_${MIND_CARD_W}x${MIND_CARD_H}@1`);
  });

  it('should use default DPR in Node environment', () => {
    const card = { value: 50, faceUp: true };
    const key = getTextureKey(card);
    expect(key).toBe(`ms_card_mind-50_${MIND_CARD_W}x${MIND_CARD_H}@1`);
  });
});

// ── ensureTexture and ensureBackTexture ──────────────────────

describe('ensureTexture family', () => {
  it('ensureTexture returns consistent DPR-aware key with ensureMindCardTexture', async () => {
    const { ensureMindCardTexture, preloadMindCardAssets } = await import('../../example-games/the-mind/MindCardRenderer');

    // Minimal mock scene
    const existingKeys = new Set<string>();
    const scene = {
      sys: { game: {} },
      cache: { text: { get: () => undefined } },
      textures: {
        exists: (key: string) => existingKeys.has(key),
        addCanvas: (_key: string, _canvas: unknown) => { existingKeys.add(_key); },
        get: () => undefined,
      },
    } as any;

    preloadMindCardAssets(scene, 48, 65);

    // Both should return the same DPR-aware key
    const directResult = await ensureMindCardTexture(scene, 42, 48, 65);
    const adapterResult = await ensureTexture(scene, 42, 48, 65);

    expect(adapterResult).toHaveProperty('key');
    expect(adapterResult.key).toBe(directResult.key);
    expect(adapterResult.ready).toBe(directResult.ready);
  });

  it('ensureBackTexture returns DPR-aware key for card back', async () => {
    const { preloadMindCardAssets } = await import('../../example-games/the-mind/MindCardRenderer');
    const { makeTextureKey } = await import('../../src/core-engine/SvgHelpers');

    // Minimal mock scene
    const existingKeys = new Set<string>();
    const scene = {
      sys: { game: {} },
      cache: { text: { get: () => undefined } },
      textures: {
        exists: (key: string) => existingKeys.has(key),
        addCanvas: (_key: string, _canvas: unknown) => { existingKeys.add(_key); },
        get: () => undefined,
      },
    } as any;

    preloadMindCardAssets(scene, 48, 65);

    const adapterResult = await ensureBackTexture(scene, 48, 65);

    expect(adapterResult).toHaveProperty('key');
    expect(adapterResult.key).toBe(makeTextureKey('mind-back', 48, 65, 1));
    expect(adapterResult.ready).toBe(false); // Node environment: no rasterisation
  });
});