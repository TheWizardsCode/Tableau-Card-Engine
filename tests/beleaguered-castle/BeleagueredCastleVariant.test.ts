/**
 * Unit tests for Beleaguered Castle variant persistence
 * (`BeleagueredCastleVariant.ts`).
 *
 * Covers AC 2 (variant selection persists across page refreshes via
 * browser storage) and the storage-key contract (defaults to Classic
 * when nothing is stored or the stored value is invalid).
 */

import { describe, it, expect } from 'vitest';
import type { StorageLike } from '../../src/core-engine/SoundManager';
import {
  getBcVariant,
  setBcVariant,
  BC_VARIANTS,
} from '../../example-games/beleaguered-castle/BeleagueredCastleVariant';

/** Storage key used by the variant persistence module. */
const BC_VARIANT_STORAGE_KEY = 'tce-bc-variant';

/** Minimal in-memory StorageLike implementation for tests. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('BC variant storage key', () => {
  it('uses the tce-bc-variant key following the SettingsStore convention', () => {
    const storage = memoryStorage();
    setBcVariant('citadel', storage);
    expect(storage.getItem(BC_VARIANT_STORAGE_KEY)).toBe('citadel');
  });
});

describe('getBcVariant', () => {
  it('defaults to classic when nothing is stored', () => {
    expect(getBcVariant(memoryStorage())).toBe('classic');
  });

  it('defaults to classic when storage is null', () => {
    expect(getBcVariant(null)).toBe('classic');
  });

  it('returns the stored variant when valid', () => {
    expect(getBcVariant(memoryStorage({ 'tce-bc-variant': 'citadel' }))).toBe('citadel');
    expect(getBcVariant(memoryStorage({ 'tce-bc-variant': 'classic' }))).toBe('classic');
  });

  it('falls back to classic for an unknown stored value', () => {
    expect(getBcVariant(memoryStorage({ 'tce-bc-variant': 'hard-mode' }))).toBe('classic');
  });

  it('falls back to classic when storage access throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('storage unavailable');
      },
      setItem: () => {
        throw new Error('storage unavailable');
      },
    };
    expect(getBcVariant(throwing)).toBe('classic');
  });
});

describe('setBcVariant', () => {
  it('round-trips a variant through storage', () => {
    const storage = memoryStorage();
    setBcVariant('citadel', storage);
    expect(getBcVariant(storage)).toBe('citadel');
  });

  it('persists classic explicitly', () => {
    const storage = memoryStorage({ 'tce-bc-variant': 'citadel' });
    setBcVariant('classic', storage);
    expect(getBcVariant(storage)).toBe('classic');
  });

  it('is a no-op with null storage (does not throw)', () => {
    expect(() => setBcVariant('citadel', null)).not.toThrow();
  });

  it('swallows storage write failures', () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => setBcVariant('citadel', failing)).not.toThrow();
  });
});

describe('BC_VARIANTS registry', () => {
  it('contains exactly the supported variants', () => {
    expect(BC_VARIANTS).toEqual(['classic', 'citadel']);
  });
});
