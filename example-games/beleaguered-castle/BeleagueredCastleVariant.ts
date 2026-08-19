/**
 * Beleaguered Castle variant persistence.
 *
 * Stores the player's chosen deal variant (Classic or Citadel) in browser
 * storage so the selection survives page refreshes, following the same
 * `STORAGE_KEY_*` get/set pattern as `SettingsStore` (difficulty,
 * reduced-motion, tooltips).
 *
 * The variant only affects how a fresh game is dealt — the in-game state
 * itself is variant-implicit (empty foundations == Citadel), so save/load
 * checkpoints need no schema changes.
 */

import type { StorageLike } from '../../src/core-engine/SoundManager';
import { BC_VARIANTS, type BCVariant } from './BeleagueredCastleRules';

// Re-export the supported-variants registry so consumers of the persistence
// module can enumerate the available choices without importing Rules.
export { BC_VARIANTS };
export type { BCVariant };

/** localStorage key for the Beleaguered Castle deal variant. */
const STORAGE_KEY_BC_VARIANT = 'tce-bc-variant';

/** The variant used when nothing is stored or the stored value is invalid. */
export const DEFAULT_BC_VARIANT: BCVariant = 'classic';

/**
 * Resolve the storage backend, mirroring `SettingsStore.resolveStorage`.
 * Returns null when storage is explicitly disabled or unavailable.
 */
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
 * Read the persisted deal variant from storage.
 *
 * Returns the default variant (`classic`) when nothing is stored, the
 * stored value is not a supported variant, or storage is unavailable.
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access.
 */
export function getBcVariant(storage?: StorageLike | null): BCVariant {
  const backend = resolveStorage(storage);
  if (!backend) return DEFAULT_BC_VARIANT;

  try {
    const raw = backend.getItem(STORAGE_KEY_BC_VARIANT);
    if (raw === null) return DEFAULT_BC_VARIANT;
    if (!(BC_VARIANTS as readonly string[]).includes(raw)) return DEFAULT_BC_VARIANT;
    return raw as BCVariant;
  } catch {
    return DEFAULT_BC_VARIANT;
  }
}

/**
 * Persist the chosen deal variant to storage.
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access (no-op).
 */
export function setBcVariant(variant: BCVariant, storage?: StorageLike | null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_BC_VARIANT, variant);
  } catch {
    // ignore storage failures
  }
}
