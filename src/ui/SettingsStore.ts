import type { StorageLike } from '../core-engine/SoundManager';

const STORAGE_KEY_SELECTED_DIFFICULTY = 'tce-selected-difficulty';
const STORAGE_KEY_REDUCED_MOTION = 'tce-ui-reduced-motion';

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  let backend = storage;
  if (backend === null) return null;
  if (backend === undefined) {
    try {
      backend = typeof globalThis !== 'undefined' && (globalThis as any).localStorage
        ? (globalThis as any).localStorage
        : null;
    } catch {
      backend = null;
    }
  }
  return backend ?? null;
}

/**
 * Read selected difficulty from storage. Returns null when not set or invalid.
 */
export function getSelectedDifficulty(storage: StorageLike | null = null, allowedNames?: readonly string[]): string | null {
  const backend = resolveStorage(storage);
  if (!backend) return null;

  try {
    const raw = backend.getItem(STORAGE_KEY_SELECTED_DIFFICULTY);
    if (raw === null) return null;
    if (allowedNames && !allowedNames.includes(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function setSelectedDifficulty(name: string, storage: StorageLike | null = null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_SELECTED_DIFFICULTY, name);
  } catch {
    // ignore storage failures
  }
}

/**
 * Read reduced motion preference from storage.
 * Returns false when not set or storage is unavailable.
 */
export function getReducedMotion(storage: StorageLike | null = null): boolean {
  const backend = resolveStorage(storage);
  if (!backend) return false;

  try {
    return backend.getItem(STORAGE_KEY_REDUCED_MOTION) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist reduced motion preference to storage.
 */
export function setReducedMotion(enabled: boolean, storage: StorageLike | null = null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_REDUCED_MOTION, enabled ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
}
