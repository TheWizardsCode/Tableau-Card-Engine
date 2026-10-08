/**
 * IPC surface for card-pack entitlements (feature F5, CG-0MUZIS2B8005WG4S).
 *
 * The renderer never imports the Steamworks SDK; it reads pack entitlement
 * status over `window.tce.cardPacks` (exposed by `electron/preload.cjs`).
 *
 * The channel names and handler factories are pure (no Electron import) so
 * they are unit-testable; `main.ts` wires them to `ipcMain.handle`.
 *
 * **Totality contract.** Every handler is total: a missing service, a throwing
 * service, and a malformed renderer-supplied pack reference all degrade to a
 * documented safe value (`false` / `[]` / a `locked` status) and never throw.
 * A pack gate that cannot read entitlement state must never crash a game.
 */
import {
  PACK_LOCK_REASON_STEAM_UNAVAILABLE,
  normaliseSteamAppId,
  type CardPackEntitlementService,
  type EntitlementPackRef,
  type PackEntitlementStatus,
} from './card-pack-entitlements.js';
import type { CardPackDlcCatalog } from './card-pack-catalog.js';

/** Channel names — must stay in sync with `preload.cjs` (plain CJS). */
export const CARD_PACK_CHANNELS = {
  isAvailable: 'cardPacks:isAvailable',
  hasCatalog: 'cardPacks:hasCatalog',
  supportsDlcCheck: 'cardPacks:supportsDlcCheck',
  getCatalog: 'cardPacks:getCatalog',
  getStatus: 'cardPacks:getStatus',
  listStatus: 'cardPacks:listStatus',
} as const;

/** The handler table registered on `ipcMain`. */
export interface CardPackHandlers {
  /** Whether Steam is currently usable. */
  isAvailable(): Promise<boolean>;
  /** Whether a pack → DLC catalog was loaded. */
  hasCatalog(): Promise<boolean>;
  /** Whether the source exposes a real DLC-ownership capability call. */
  supportsDlcCheck(): Promise<boolean>;
  /** The loaded catalog (for the renderer listing), or `null`. */
  getCatalog(): Promise<CardPackDlcCatalog | null>;
  /** Resolve one pack's entitlement status. Never throws. */
  getStatus(pack: unknown): Promise<PackEntitlementStatus>;
  /** Resolve many packs' statuses, preserving input order. Never throws. */
  listStatus(packs: unknown): Promise<PackEntitlementStatus[]>;
}

/** Status returned for a malformed renderer payload — a safe deny. */
const INVALID_PACK_STATUS: PackEntitlementStatus = Object.freeze({
  packId: '',
  gameId: null,
  state: 'locked',
  steamAppId: null,
  reason: 'Invalid pack reference.',
});

/** Reason shown when the entitlement service is not wired. */
export const PACK_LOCK_REASON_SERVICE_UNAVAILABLE = 'Entitlement service unavailable.';

/**
 * Normalise a renderer-supplied unknown into a well-formed pack reference, or
 * `null` when it is unusable. Accepts `id` (manifest shape) or `packId`
 * (defensive), an optional string `gameId`, and an optional positive-integer
 * `steamAppId`; a malformed app id is dropped rather than rejecting the ref.
 */
export function normaliseEntitlementPackRef(value: unknown): EntitlementPackRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const id =
    typeof record.id === 'string' && record.id.trim() !== ''
      ? record.id
      : typeof record.packId === 'string' && record.packId.trim() !== ''
        ? record.packId
        : null;
  if (id === null) return null;

  const ref: { id: string; gameId?: string; steamAppId?: number } = { id };
  if (typeof record.gameId === 'string' && record.gameId.trim() !== '') {
    ref.gameId = record.gameId;
  }
  const steamAppId = normaliseSteamAppId(record.steamAppId);
  if (steamAppId !== null) ref.steamAppId = steamAppId;
  return ref;
}

/** Type guard wrapper over {@link normaliseEntitlementPackRef}. */
export function isEntitlementPackRef(value: unknown): value is EntitlementPackRef {
  return normaliseEntitlementPackRef(value) !== null;
}

/** A total locked status for *ref* when entitlement cannot be resolved. */
function lockedStatus(ref: EntitlementPackRef, reason: string): PackEntitlementStatus {
  return {
    packId: ref.id,
    gameId: ref.gameId ?? null,
    state: 'locked',
    steamAppId: normaliseSteamAppId(ref.steamAppId),
    reason,
  };
}

/**
 * Build the IPC handlers from a wired `CardPackEntitlementService`.
 *
 * Every handler is total (never throws) — a missing service or a failure in
 * the entitlement source degrades to `false` / `[]` / `locked`, so the
 * renderer's pack gate can never crash the owning game.
 */
export function createCardPackHandlers(
  service: CardPackEntitlementService | null | undefined,
): CardPackHandlers {
  const entitlement = service ?? null;

  return {
    isAvailable: async () => {
      if (!entitlement) return false;
      try {
        return entitlement.isSteamAvailable() === true;
      } catch {
        return false;
      }
    },
    hasCatalog: async () => {
      if (!entitlement) return false;
      try {
        return entitlement.hasCatalog() === true;
      } catch {
        return false;
      }
    },
    supportsDlcCheck: async () => {
      if (!entitlement) return false;
      try {
        return entitlement.supportsDlcCheck() === true;
      } catch {
        return false;
      }
    },
    getCatalog: async () => {
      if (!entitlement) return null;
      try {
        return entitlement.getCatalog();
      } catch {
        return null;
      }
    },
    getStatus: async (pack: unknown) => {
      const ref = normaliseEntitlementPackRef(pack);
      if (!ref) return INVALID_PACK_STATUS;
      if (!entitlement) return lockedStatus(ref, PACK_LOCK_REASON_SERVICE_UNAVAILABLE);
      try {
        return await entitlement.getStatus(ref);
      } catch {
        return lockedStatus(ref, PACK_LOCK_REASON_STEAM_UNAVAILABLE);
      }
    },
    listStatus: async (packs: unknown) => {
      if (!Array.isArray(packs)) return [];
      const refs = packs
        .map(normaliseEntitlementPackRef)
        .filter((ref): ref is EntitlementPackRef => ref !== null);
      if (refs.length === 0) return [];
      if (!entitlement) {
        return refs.map((ref) => lockedStatus(ref, PACK_LOCK_REASON_SERVICE_UNAVAILABLE));
      }
      try {
        return await entitlement.listStatus(refs);
      } catch {
        return refs.map((ref) => lockedStatus(ref, PACK_LOCK_REASON_STEAM_UNAVAILABLE));
      }
    },
  };
}
