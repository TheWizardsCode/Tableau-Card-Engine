/**
 * ReducedMotion – centralized utilities for checking reduced motion preferences.
 *
 * Provides `getEffectiveReducedMotion()` which checks:
 * 1. The in-game SettingsPanel preference (stored in localStorage via SettingsStore)
 * 2. The CSS `prefers-reduced-motion: reduce` media query (fallback)
 *
 * The in-game setting takes precedence when explicitly set. The CSS media query
 * is used as fallback when no explicit setting exists.
 *
 * @module ui/ReducedMotion
 */

import type { StorageLike } from '../core-engine/SoundManager';
import { getReducedMotion } from './SettingsStore';

/**
 * Resolve storage backend.
 * If `storage` is provided, use it directly.
 * If `null`, storage is explicitly disabled.
 * If `undefined`, try to use `globalThis.localStorage`.
 */
function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage === null) return null;
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
 * Check the CSS `prefers-reduced-motion: reduce` media query.
 * Returns false when `window.matchMedia` is unavailable.
 * Falls back to `globalThis.matchMedia` for test environments.
 */
function matchMediaReducedMotion(): boolean {
  try {
    const mm =
      (typeof window !== 'undefined' && window.matchMedia) ||
      ((typeof globalThis !== 'undefined') && (globalThis as any).matchMedia);
    if (typeof mm === 'function') {
      return mm('(prefers-reduced-motion: reduce)').matches;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Determine the effective reduced-motion preference.
 *
 * Priority order:
 * 1. In-game setting (SettingsStore preference from localStorage) — when explicitly set
 * 2. CSS `prefers-reduced-motion: reduce` media query — fallback
 * 3. `false` — default when neither indicates reduced motion
 *
 * @param storage Optional StorageLike instance for testing.
 *   Pass `null` to explicitly disable storage checks (use media query only).
 *   Pass a mock Storage to simulate different persisted preferences.
 *   Leave undefined to use `globalThis.localStorage`.
 */
export function getEffectiveReducedMotion(storage?: StorageLike | null): boolean {
  const resolved = resolveStorage(storage);

  // Check explicit in-game setting first (takes precedence)
  if (resolved !== null) {
    const stored = getReducedMotion(resolved);
    // If preference is explicitly set (either true or false), respect it
    if (stored) return true;
    // If the stored value is 'false', check if it was explicitly set
    try {
      const raw = resolved.getItem('tce-ui-reduced-motion');
      if (raw === 'false') return false;
    } catch {
      // ignore read errors; fall through to media query
    }
  }

  // Fallback to CSS media query
  return matchMediaReducedMotion();
}
