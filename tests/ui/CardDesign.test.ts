/**
 * Tests for card design selection system.
 *
 * These tests verify:
 * - Card design storage helpers work correctly
 * - Available designs are registered properly
 * - Asset paths resolve correctly per design
 * - The default design remains the current one
 * - Design selection can be persisted and restored
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getCardDesign,
  setCardDesign,
  getAvailableCardDesigns,
  getCardDesignAssetPath,
  getCardDesignDisplayName,
  CARD_DESIGN_DEFAULT,
} from '../../src/ui/SettingsStore';
import { cardTextureKey } from '../../src/ui/CardTextureHelpers';
import type { StorageLike } from '../../src/core-engine/SoundManager';

function createMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => map.has(k) ? map.get(k)! : null),
    setItem: vi.fn((k: string, v: string) => map.set(k, v)),
  };
}

describe('CardDesign registry', () => {
  it('should export the default design key as "default"', () => {
    expect(CARD_DESIGN_DEFAULT).toBe('default');
  });

  it('should return available designs with key and displayName', () => {
    const designs = getAvailableCardDesigns();
    expect(designs.length).toBeGreaterThanOrEqual(2);

    // The default design must always be present
    const defaultDesign = designs.find(d => d.key === 'default');
    expect(defaultDesign).toBeDefined();
    expect(defaultDesign!.displayName).toBe('Classic');

    // At least one alternative design
    const altDesigns = designs.filter(d => d.key !== 'default');
    expect(altDesigns.length).toBeGreaterThanOrEqual(1);
  });

  it('each design should have a non-empty asset path', () => {
    const designs = getAvailableCardDesigns();
    for (const d of designs) {
      expect(d.assetPath).toBeTruthy();
      expect(d.assetPath.endsWith('/')).toBe(true);
    }
  });
});

describe('CardDesign asset path resolution', () => {
  it('should return the default asset path for default design', () => {
    const path = getCardDesignAssetPath('default');
    expect(path).toBe('assets/cards/');
  });

  it('should return the correct asset path for each registered design', () => {
    const designs = getAvailableCardDesigns();
    for (const d of designs) {
      const path = getCardDesignAssetPath(d.key);
      expect(path).toBe(d.assetPath);
    }
  });

  it('should fall back to default path for unknown design keys', () => {
    const path = getCardDesignAssetPath('nonexistent-design');
    expect(path).toBe('assets/cards/');
  });
});

describe('CardDesign persistence', () => {
  it('should return default design when storage is null', () => {
    expect(getCardDesign(null)).toBe(CARD_DESIGN_DEFAULT);
  });

  it('should return default design when nothing stored', () => {
    const storage = createMockStorage();
    expect(getCardDesign(storage)).toBe(CARD_DESIGN_DEFAULT);
  });

  it('should persist and restore a design selection', () => {
    const storage = createMockStorage();
    setCardDesign('webisso', storage);
    expect(storage.setItem).toHaveBeenCalledWith('tce-card-design', 'webisso');
    expect(getCardDesign(storage)).toBe('webisso');
  });

  it('should fall back to default when stored key is not in available designs', () => {
    const storage = createMockStorage();
    storage.setItem('tce-card-design', 'extinct-design');
    expect(getCardDesign(storage)).toBe(CARD_DESIGN_DEFAULT);
  });

  it('should round-trip design selection correctly', () => {
    const storage = createMockStorage();
    const designs = getAvailableCardDesigns();

    for (const d of designs) {
      setCardDesign(d.key, storage);
      expect(getCardDesign(storage)).toBe(d.key);
    }
  });
});

describe('CardDesign display name lookup', () => {
  it('should return the display name for a known design', () => {
    const designs = getAvailableCardDesigns();
    for (const d of designs) {
      expect(getCardDesignDisplayName(d.key)).toBe(d.displayName);
    }
  });

  it('should return the key itself for unknown designs', () => {
    expect(getCardDesignDisplayName('unknown')).toBe('unknown');
  });
});

describe('CardTextureHelpers design integration', () => {
  // Texture keys are derived solely from rank and suit, not from the design.
  // This ensures game scenes don't need to change when switching designs.
  it('texture keys should be the same regardless of design', () => {
    expect(cardTextureKey('A', 'spades')).toBe('ace_of_spades');
    expect(cardTextureKey('K', 'hearts')).toBe('king_of_hearts');
    expect(cardTextureKey('10', 'diamonds')).toBe('10_of_diamonds');
    expect(cardTextureKey('7', 'clubs')).toBe('7_of_clubs');
  });
});
