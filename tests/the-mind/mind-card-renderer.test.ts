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
} from '../../example-games/the-mind/MindCardRenderer';

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

  it('should return the correct texture key for a face-up card', () => {
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
