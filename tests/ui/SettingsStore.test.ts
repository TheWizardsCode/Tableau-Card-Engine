
// <!-- REFACTOR-CG-0MTP6KUL80008VMR
// smell: ban_ts_comment
// severity: low
// description: Stale test disables + ban-ts-comment: SettingsStore 29 @ts-ignore→@ts-expect-error, 4 unused @typescript-eslint disables (Applicant 44, community-space-types 226, LegalityResult 43,50), 8 no-console console.log in tests/screenshots; FeudalismAudioResilience 144 no-direct-sound-play is intentional throw proof not filed.
// -->
import { describe, it, expect, vi } from 'vitest';
import {
  getReducedMotion,
  getSelectedDifficulty,
  getTooltips,
  setReducedMotion,
  setSelectedDifficulty,
  setTooltips,
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

  // ── Tooltip helpers ─────────────────────────────────────

  it('returns true for tooltips when storage is null', () => {
    expect(getTooltips(null)).toBe(true);
  });

  it('returns true for tooltips when nothing stored', () => {
    const storage = createMockStorage();
    expect(getTooltips(storage)).toBe(true);
  });

  it('persists and restores tooltip preference', () => {
    const storage = createMockStorage();
    setTooltips(false, storage);
    expect(storage.setItem).toHaveBeenCalledWith('tce-show-tooltips', 'false');
    expect(getTooltips(storage)).toBe(false);

    setTooltips(true, storage);
    expect(storage.setItem).toHaveBeenCalledWith('tce-show-tooltips', 'true');
    expect(getTooltips(storage)).toBe(true);
  });

  it('returns false when stored value is not the string true', () => {
    const storage = createMockStorage();
    (storage as any).setItem('tce-show-tooltips', 'not-a-boolean');
    expect(getTooltips(storage)).toBe(false);
  });
});
