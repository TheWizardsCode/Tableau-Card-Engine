/**
 * Main Street: Preferences store
 *
 * Persistent player preferences for Main Street, mirroring the
 * `SettingsStore` (src/ui/SettingsStore.ts) localStorage patterns. Uses an
 * injectable storage adapter so unit tests run in Node without a browser
 * localStorage.
 *
 * Preference keys:
 *   - `tce-main-street-buy-and-place-premium-dialog-dismissed` — when
 *     'true', the same-turn buy-and-play premium explainer dialog no longer
 *     fires (CG-0MT24X0SX007RLHN).
 *
 * @module
 */

/** Minimal subset of the Storage API needed by the preferences store. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** Storage key for the buy-and-play premium dialog dismissal preference. */
export const PREMIUM_DIALOG_DISMISSED_KEY = 'tce-main-street-buy-and-place-premium-dialog-dismissed';

/** Resolves the storage backend (browser localStorage when available). */
function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  try {
    return typeof globalThis !== 'undefined' && (globalThis as any).localStorage
      ? (globalThis as any).localStorage
      : null;
  } catch {
    return null;
  }
}

/**
 * Returns true when the player has permanently dismissed the buy-and-play
 * premium explainer dialog ("Don't show this again").
 *
 * @param storage Optional storage backend. When omitted, falls back to the
 *   browser localStorage (safe no-op in headless/Node contexts).
 */
export function isBuyAndPlacePremiumDialogDismissed(storage?: StorageLike | null): boolean {
  const backend = resolveStorage(storage);
  if (!backend) return false;
  try {
    return backend.getItem(PREMIUM_DIALOG_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists (or clears) the buy-and-play premium dialog dismissal preference.
 *
 * @param dismissed When true, the dialog will not fire on future premium
 *   buy-and-play. When false, the preference is cleared.
 * @param storage   Optional storage backend (defaults to browser localStorage).
 */
export function setBuyAndPlacePremiumDialogDismissed(
  dismissed: boolean,
  storage?: StorageLike | null,
): void {
  const backend = resolveStorage(storage);
  if (!backend) return;
  try {
    if (dismissed) {
      backend.setItem(PREMIUM_DIALOG_DISMISSED_KEY, 'true');
    } else if (backend.removeItem) {
      backend.removeItem(PREMIUM_DIALOG_DISMISSED_KEY);
    } else {
      backend.setItem(PREMIUM_DIALOG_DISMISSED_KEY, 'false');
    }
  } catch {
    // ignore storage failures — the preference is best-effort persistence
  }
}