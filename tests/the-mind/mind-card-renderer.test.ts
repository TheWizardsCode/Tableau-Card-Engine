import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { MindCard } from '../../example-games/the-mind/MindCard';
import {
  CARD_BACK_KEY,
  MIN_VALUE,
  MAX_VALUE,
} from '../../example-games/the-mind/MindCard';
import {
  getMindCardTexture,
  mindCardTextureKey,
  MIND_CARD_W,
  MIND_CARD_H,
  makeMindCardTextureKey,
} from '../../example-games/the-mind/MindCardRenderer';
import {
  resolveTemplateId,
  resolveBackTemplateId,
  getCanonicalTextureKey,
} from '../../example-games/the-mind/MindCardTextureAdapter';

// ── Constants ────────────────────────────────────────────────

const ASSETS_DIR = join(__dirname, '..', '..', 'public', 'assets', 'cards', 'the-mind');

// ── Helper ───────────────────────────────────────────────────

function makeMindCard(value: number, faceUp: boolean): MindCard {
  return { value, faceUp };
}

// ── getMindCardTexture ───────────────────────────────────────

describe('getMindCardTexture', () => {
  it('should return card back key for a face-down card', () => {
    const card = makeMindCard(42, false);
    expect(getMindCardTexture(card)).toBe(CARD_BACK_KEY);
  });

  it('should return the correct template ID for a face-up card', () => {
    const card = makeMindCard(42, true);
    expect(getMindCardTexture(card)).toBe('mind-42');
  });

  it('should return correct key for value 1', () => {
    const card = makeMindCard(1, true);
    expect(getMindCardTexture(card)).toBe('mind-1');
  });

  it('should return correct key for value 100', () => {
    const card = makeMindCard(100, true);
    expect(getMindCardTexture(card)).toBe('mind-100');
  });

  it('should return card back when faceUp is toggled to false', () => {
    const card = makeMindCard(50, true);
    expect(getMindCardTexture(card)).toBe('mind-50');
    card.faceUp = false;
    expect(getMindCardTexture(card)).toBe(CARD_BACK_KEY);
  });

  it('should throw for value 0', () => {
    const card = makeMindCard(0, true);
    expect(() => getMindCardTexture(card)).toThrow('Invalid Mind card value: 0');
  });

  it('should throw for value 101', () => {
    const card = makeMindCard(101, true);
    expect(() => getMindCardTexture(card)).toThrow('Invalid Mind card value: 101');
  });

  it('should throw for negative values', () => {
    const card = makeMindCard(-5, true);
    expect(() => getMindCardTexture(card)).toThrow('Invalid Mind card value: -5');
  });

  it('should throw for non-integer values', () => {
    const card = makeMindCard(3.5, true);
    expect(() => getMindCardTexture(card)).toThrow('Invalid Mind card value: 3.5');
  });

  it('should NOT throw for face-down cards with invalid values (back key returned before validation)', () => {
    const card = makeMindCard(0, false);
    expect(getMindCardTexture(card)).toBe(CARD_BACK_KEY);
  });
});

// ── mindCardTextureKey ───────────────────────────────────────

describe('mindCardTextureKey', () => {
  it('should return mind-1 for value 1', () => {
    expect(mindCardTextureKey(1)).toBe('mind-1');
  });

  it('should return mind-50 for value 50', () => {
    expect(mindCardTextureKey(50)).toBe('mind-50');
  });

  it('should return mind-100 for value 100', () => {
    expect(mindCardTextureKey(100)).toBe('mind-100');
  });

  it('should throw for value 0', () => {
    expect(() => mindCardTextureKey(0)).toThrow('Invalid Mind card value');
  });

  it('should throw for value 101', () => {
    expect(() => mindCardTextureKey(101)).toThrow('Invalid Mind card value');
  });

  it('should throw for NaN', () => {
    expect(() => mindCardTextureKey(NaN)).toThrow('Invalid Mind card value');
  });

  it('should throw for Infinity', () => {
    expect(() => mindCardTextureKey(Infinity)).toThrow('Invalid Mind card value');
  });
});

// ── DPR-aware texture keys ────────────────────────────────────

describe('makeMindCardTextureKey', () => {
  it('should produce a DPR-aware key using SvgHelpers.makeTextureKey', () => {
    const key = makeMindCardTextureKey('mind-42', 48, 65, 2);
    expect(key).toBe('ms_card_mind-42_48x65@2');
  });

  it('should default DPR to 1 when not provided and no window', () => {
    const key = makeMindCardTextureKey('mind-42', 48, 65);
    // In Node test environment, window is undefined, so DPR defaults to 1
    expect(key).toBe('ms_card_mind-42_48x65@1');
  });

  it('should produce a key for the card back', () => {
    const key = makeMindCardTextureKey('mind-back', 48, 65, 2);
    expect(key).toBe('ms_card_mind-back_48x65@2');
  });

  it('should round non-integer dimensions', () => {
    const key = makeMindCardTextureKey('mind-1', 47.7, 64.3, 1);
    expect(key).toBe('ms_card_mind-1_48x64@1');
  });
});

// ── MindCardTextureAdapter ────────────────────────────────────

describe('MindCardTextureAdapter', () => {
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
  });

  describe('resolveBackTemplateId', () => {
    it('should return mind-back', () => {
      expect(resolveBackTemplateId()).toBe('mind-back');
    });
  });

  describe('getCanonicalTextureKey', () => {
    it('should produce a DPR-aware key for a template ID', () => {
      const key = getCanonicalTextureKey('mind-42', 48, 65, 2);
      expect(key).toBe('ms_card_mind-42_48x65@2');
    });

    it('should default width and height to MIND_CARD_W and MIND_CARD_H', () => {
      const key = getCanonicalTextureKey('mind-42', undefined, undefined, 1);
      expect(key).toBe(`ms_card_mind-42_${MIND_CARD_W}x${MIND_CARD_H}@1`);
    });

    it('should default DPR to 1 in Node environment', () => {
      const key = getCanonicalTextureKey('mind-back');
      expect(key).toBe(`ms_card_mind-back_${MIND_CARD_W}x${MIND_CARD_H}@1`);
    });
  });
});

// ── Constants exports ────────────────────────────────────────

describe('MindCardRenderer constants', () => {
  it('should export MIND_CARD_W as 48', () => {
    expect(MIND_CARD_W).toBe(48);
  });

  it('should export MIND_CARD_H as 65', () => {
    expect(MIND_CARD_H).toBe(65);
  });
});

// ── SVG asset file existence ─────────────────────────────────

describe('generated SVG assets', () => {
  it('should have generated 101 SVG files in the-mind directory', () => {
    expect(existsSync(ASSETS_DIR)).toBe(true);
  });

  it('should have a card back SVG (mind-back.svg)', () => {
    const filePath = join(ASSETS_DIR, 'mind-back.svg');
    expect(existsSync(filePath)).toBe(true);
  });

  it.each([1, 2, 10, 42, 50, 99, 100])(
    'should have numbered card SVG for value %d',
    (value) => {
      const filePath = join(ASSETS_DIR, `mind-${value}.svg`);
      expect(existsSync(filePath)).toBe(true);
    },
  );

  it('should have all 100 numbered card SVGs (1-100)', () => {
    for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
      const filePath = join(ASSETS_DIR, `mind-${v}.svg`);
      expect(existsSync(filePath)).toBe(true);
    }
  });
});

// ── SVG content validation ───────────────────────────────────

describe('SVG content structure', () => {
  it('should have correct dimensions (140x190) in numbered card SVGs', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-42.svg'), 'utf8');
    expect(svg).toContain('width="140"');
    expect(svg).toContain('height="190"');
    expect(svg).toContain('viewBox="0 0 140 190"');
  });

  it('should have correct dimensions (140x190) in card back SVG', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-back.svg'), 'utf8');
    expect(svg).toContain('width="140"');
    expect(svg).toContain('height="190"');
  });

  it('should contain the card value as text in a numbered card SVG', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-42.svg'), 'utf8');
    expect(svg).toContain('>42<');
  });

  it('should contain the value 100 in the 3-digit card SVG', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-100.svg'), 'utf8');
    expect(svg).toContain('>100<');
  });

  it('should contain the value 1 in the single-digit card SVG', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-1.svg'), 'utf8');
    expect(svg).toContain('>1<');
  });

  it('should contain a "?" in the card back SVG', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-back.svg'), 'utf8');
    expect(svg).toContain('>?<');
  });

  it('should be valid SVG (starts with <svg and ends with </svg>)', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-42.svg'), 'utf8');
    expect(svg.trim()).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });

  it('should use rounded corners (rx attribute)', () => {
    const svg = readFileSync(join(ASSETS_DIR, 'mind-42.svg'), 'utf8');
    expect(svg).toContain('rx="10"');
  });
});

// ── Lazy rasterisation helpers ─────────────────────────────

describe('lazy rasterisation helpers', () => {
  it('ensureMindCardTexture returns a getOrCreateTexture-like result when preloaded in Node', async () => {
    const { preloadMindCardAssets, ensureMindCardTexture } = await import('../../example-games/the-mind/MindCardRenderer');
    const { makeTextureKey } = await import('../../src/core-engine/SvgHelpers');

    // Minimal mock scene compatible with SvgHelpers expectations used in tests.
    const existingKeys = new Set<string>();
    const textures = new Map<string, { setFilter: () => void }>();

    const scene = {
      sys: { game: {} },
      cache: { text: { get: (_: string) => undefined } },
      textures: {
        exists: (key: string) => existingKeys.has(key),
        addCanvas: (_: string, __: any) => undefined,
        get: (k: string) => textures.get(k),
      },
    } as any;

    // Preload (Node path will read files into module cache if available).
    preloadMindCardAssets(scene, 48, 65);

    // Call ensureMindCardTexture for a known card value. We expect a result
    // with a DPR-aware texture key and an object that may include a promise
    // for async rasterisation.
    const res = await ensureMindCardTexture(scene, 42, 48, 65);

    expect(res).toHaveProperty('key');
    // Key should follow the DPR-aware format from SvgHelpers.makeTextureKey
    expect(res.key).toBe(makeTextureKey('mind-42', 48, 65, 1));
    // In Node environment, ready should be false (no rasterisation possible)
    expect(res.ready).toBe(false);
  });

  it('ensureMindCardTexture throws for invalid card values', async () => {
    const { ensureMindCardTexture } = await import('../../example-games/the-mind/MindCardRenderer');

    const scene = {
      sys: { game: {} },
      textures: { exists: () => false, addCanvas: () => undefined, get: () => undefined },
    } as any;

    await expect(ensureMindCardTexture(scene, 0, 48, 65)).rejects.toThrow('Invalid Mind card value');
    await expect(ensureMindCardTexture(scene, 101, 48, 65)).rejects.toThrow('Invalid Mind card value');
  });
});