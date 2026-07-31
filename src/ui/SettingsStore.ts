import type { StorageLike } from '../core-engine/SoundManager';

const STORAGE_KEY_SELECTED_DIFFICULTY = 'tce-selected-difficulty';
const STORAGE_KEY_REDUCED_MOTION = 'tce-ui-reduced-motion';
const STORAGE_KEY_END_TURN_KEYBIND = 'tce-endturn-keybind';
const STORAGE_KEY_TOOLTIPS = 'tce-show-tooltips';
const STORAGE_KEY_CARD_DESIGN = 'tce-card-design';

// ── Card Design system ─────────────────────────────────

/** Descriptor for an available card design. */
export interface CardDesign {
  /** Unique key used for storage lookup (e.g. "default", "webisso"). */
  key: string;
  /** Human-readable name shown in the settings panel (e.g. "Classic", "Modern"). */
  displayName: string;
  /** Relative asset path where card SVGs are stored (e.g. "assets/cards/"). */
  assetPath: string;
}

/** The key used for the default (built-in) card design. */
export const CARD_DESIGN_DEFAULT = 'default';

/** Registry of all available card designs. */
const CARD_DESIGNS: CardDesign[] = [
  {
    key: CARD_DESIGN_DEFAULT,
    displayName: 'Classic',
    assetPath: 'assets/cards/',
  },
  {
    key: 'webisso',
    displayName: 'Modern',
    assetPath: 'assets/cards/alternative/webisso/',
  },
];

/**
 * Returns the list of all available card designs.
 */
export function getAvailableCardDesigns(): readonly CardDesign[] {
  return CARD_DESIGNS;
}

/**
 * Looks up the asset path for a given design key.
 * Falls back to the default design path when the key is unknown.
 */
export function getCardDesignAssetPath(designKey: string): string {
  const design = CARD_DESIGNS.find(d => d.key === designKey);
  return design ? design.assetPath : CARD_DESIGNS[0].assetPath;
}

/**
 * Looks up the display name for a given design key.
 * Falls back to the key itself when unknown.
 */
export function getCardDesignDisplayName(designKey: string): string {
  const design = CARD_DESIGNS.find(d => d.key === designKey);
  return design ? design.displayName : designKey;
}

/**
 * Read the selected card design from storage.
 * Returns the default design key when nothing is stored or the stored
 * key is not in the available designs registry.
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access (returns the default design).
 */
export function getCardDesign(storage?: StorageLike | null): string {
  const backend = resolveStorage(storage);
  if (!backend) return CARD_DESIGN_DEFAULT;

  try {
    const raw = backend.getItem(STORAGE_KEY_CARD_DESIGN);
    if (raw === null) return CARD_DESIGN_DEFAULT;
    // Validate against available designs
    if (!CARD_DESIGNS.some(d => d.key === raw)) return CARD_DESIGN_DEFAULT;
    return raw;
  } catch {
    return CARD_DESIGN_DEFAULT;
  }
}

/**
 * Persist the selected card design key to storage.
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access (no-op).
 */
export function setCardDesign(designKey: string, storage?: StorageLike | null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_CARD_DESIGN, designKey);
  } catch {
    // ignore storage failures
  }
}


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
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access.
 */
export function getSelectedDifficulty(storage?: StorageLike | null, allowedNames?: readonly string[]): string | null {
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

export function setSelectedDifficulty(name: string, storage?: StorageLike | null): void {
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
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access.
 */
export function getReducedMotion(storage?: StorageLike | null): boolean {
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
export function setReducedMotion(enabled: boolean, storage?: StorageLike | null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_REDUCED_MOTION, enabled ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
}

// ── Tooltip helpers ────────────────────────────────────

/**
 * Read tooltip preference from storage. Returns true when not set or
 * storage is unavailable (tooltips shown by default).
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access.
 */
export function getTooltips(storage?: StorageLike | null): boolean {
  const backend = resolveStorage(storage);
  if (!backend) return true;

  try {
    const raw = backend.getItem(STORAGE_KEY_TOOLTIPS);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

/**
 * Persist tooltip preference to storage.
 */
export function setTooltips(enabled: boolean, storage?: StorageLike | null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_TOOLTIPS, enabled ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
}

// ── End Turn keybind helpers ───────────────────────────

/**
 * Read the configured End Turn keybind from storage. Returns the key name
 * (e.g. 'Enter'). If not set, returns the default 'Enter'.
 *
 * @param storage Optional storage backend. When omitted (undefined), falls
 *   back to `globalThis.localStorage`. Pass `null` to explicitly disable
 *   storage access.
 */
export function getEndTurnKeybind(storage?: StorageLike | null): string {
  const backend = resolveStorage(storage);
  if (!backend) return 'Enter';

  try {
    const raw = backend.getItem(STORAGE_KEY_END_TURN_KEYBIND);
    if (!raw) return 'Enter';
    return raw;
  } catch {
    return 'Enter';
  }
}

/**
 * Persist the End Turn keybind name to storage.
 */
export function setEndTurnKeybind(keyName: string, storage?: StorageLike | null): void {
  const backend = resolveStorage(storage);
  if (!backend) return;

  try {
    backend.setItem(STORAGE_KEY_END_TURN_KEYBIND, keyName);
  } catch {
    // ignore storage failures
  }
}
