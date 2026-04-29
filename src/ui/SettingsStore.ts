import type { StorageLike } from '../core-engine/SoundManager';

const STORAGE_KEY = 'tce-selected-difficulty';

/**
 * Read selected difficulty from storage. Returns null when not set or invalid.
 */
export function getSelectedDifficulty(storage: StorageLike | null = null, allowedNames?: readonly string[]): string | null {
  // Resolve storage fallback to global localStorage when available
  let backend = storage;
  if (backend === null) return null;
  if (backend === undefined) {
    try {
      backend = typeof globalThis !== 'undefined' && (globalThis as any).localStorage ? (globalThis as any).localStorage : null;
    } catch {
      backend = null;
    }
  }

  if (!backend) return null;
  try {
    const raw = backend.getItem(STORAGE_KEY);
    if (raw === null) return null;
    if (allowedNames && !allowedNames.includes(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function setSelectedDifficulty(name: string, storage: StorageLike | null = null): void {
  let backend = storage;
  if (backend === undefined) {
    try {
      backend = typeof globalThis !== 'undefined' && (globalThis as any).localStorage ? (globalThis as any).localStorage : null;
    } catch {
      backend = null;
    }
  }
  if (!backend) return;
  try {
    backend.setItem(STORAGE_KEY, name);
  } catch {
    // ignore storage failures
  }
}
