/**
 * Main Street: Preferences store tests
 *
 * Verifies the persisted \"Don't show this again\" preference backing the
 * buy-and-play premium explainer dialog (CG-0MT24X0SX007RLHN).
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isBuyAndPlacePremiumDialogDismissed,
  setBuyAndPlacePremiumDialogDismissed,
  PREMIUM_DIALOG_DISMISSED_KEY,
} from '../../example-games/main-street/MainStreetPrefs';
import type { StorageLike } from '../../example-games/main-street/MainStreetPrefs';

function createMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (map.has(k) ? map.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => map.set(k, v)),
    removeItem: vi.fn((k: string) => map.delete(k)),
  };
}

describe('MainStreetPrefs premium dialog dismissal', () => {
  it('returns false when storage is null (never dismissed)', () => {
    expect(isBuyAndPlacePremiumDialogDismissed(null)).toBe(false);
  });

  it('returns false when storage has no entry', () => {
    const storage = createMockStorage();
    expect(isBuyAndPlacePremiumDialogDismissed(storage)).toBe(false);
  });

  it('persists and restores the dismissal preference', () => {
    const storage = createMockStorage();
    expect(isBuyAndPlacePremiumDialogDismissed(storage)).toBe(false);

    setBuyAndPlacePremiumDialogDismissed(true, storage);
    expect(storage.setItem).toHaveBeenCalledWith(PREMIUM_DIALOG_DISMISSED_KEY, 'true');
    expect(isBuyAndPlacePremiumDialogDismissed(storage)).toBe(true);
  });

  it('clears the preference when un-dismissed', () => {
    const storage = createMockStorage();
    setBuyAndPlacePremiumDialogDismissed(true, storage);
    expect(isBuyAndPlacePremiumDialogDismissed(storage)).toBe(true);

    setBuyAndPlacePremiumDialogDismissed(false, storage);
    expect(storage.removeItem).toHaveBeenCalledWith(PREMIUM_DIALOG_DISMISSED_KEY);
    expect(isBuyAndPlacePremiumDialogDismissed(storage)).toBe(false);
  });

  it('handles storage fallback without removeItem (getItem/setItem only)', () => {
    const map = new Map<string, string>();
    const minimal: StorageLike = {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => map.set(k, v),
    };
    setBuyAndPlacePremiumDialogDismissed(false, minimal);
    // without removeItem, the preference is written as 'false'
    expect(minimal.getItem(PREMIUM_DIALOG_DISMISSED_KEY)).toBe('false');
    expect(isBuyAndPlacePremiumDialogDismissed(minimal)).toBe(false);
  });

  it('is best-effort under storage exceptions (no throw)', () => {
    const throwing: StorageLike = {
      getItem: vi.fn(() => { throw new Error('boom'); }),
      setItem: vi.fn(() => { throw new Error('boom'); }),
      removeItem: vi.fn(() => { throw new Error('boom'); }),
    };
    expect(isBuyAndPlacePremiumDialogDismissed(throwing)).toBe(false);
    expect(() => setBuyAndPlacePremiumDialogDismissed(true, throwing)).not.toThrow();
  });
});