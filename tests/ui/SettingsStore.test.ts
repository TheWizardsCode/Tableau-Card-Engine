import { describe, it, expect, vi } from 'vitest';
import {
  getReducedMotion,
  getSelectedDifficulty,
  setReducedMotion,
  setSelectedDifficulty,
} from '../../src/ui/SettingsStore';
import type { StorageLike } from '../../src/core-engine/SoundManager';

function createMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => map.has(k) ? map.get(k)! : null),
    setItem: vi.fn((k: string, v: string) => map.set(k, v)),
  };
}

describe('SettingsStore persistence', () => {
  it('returns null when storage is null', () => {
    expect(getSelectedDifficulty(null)).toBeNull();
  });

  it('persists and restores a difficulty', () => {
    const storage = createMockStorage();
    setSelectedDifficulty('Hard', storage);
    // ensure setItem was called when persisting
    // @ts-ignore access underlying mock setItem spy
    expect(storage.setItem).toHaveBeenCalled();
    const restored = getSelectedDifficulty(storage);
    expect(restored).toBe('Hard');
  });

  it('validates allowed names when provided', () => {
    const storage = createMockStorage();
    setSelectedDifficulty('Impossible', storage);
    const restored = getSelectedDifficulty(storage, ['Easy', 'Medium', 'Hard']);
    expect(restored).toBeNull();
  });

  it('returns false for reduced motion when storage is null', () => {
    expect(getReducedMotion(null)).toBe(false);
  });

  it('persists and restores reduced motion preference', () => {
    const storage = createMockStorage();
    setReducedMotion(true, storage);
    expect(storage.setItem).toHaveBeenCalledWith('tce-ui-reduced-motion', 'true');
    expect(getReducedMotion(storage)).toBe(true);

    setReducedMotion(false, storage);
    expect(storage.setItem).toHaveBeenCalledWith('tce-ui-reduced-motion', 'false');
    expect(getReducedMotion(storage)).toBe(false);
  });
});
