/**
 * Renderer-side client for the card-pack entitlement bridge
 * (feature F6, CG-0MUZIS2VF006NY3T).
 *
 * The renderer never imports the Steamworks SDK or a Node API; it reads pack
 * entitlement status through `window.tce.cardPacks` (exposed by
 * `electron/preload.cjs`, wired in F5 / CG-0MUZIS2B8005WG4S). This tiny typed
 * wrapper is the read source the renderer pack loader
 * (`src/ui/CardPackLoader.ts`) and the in-game listing
 * (`src/ui/CardPackListing.ts`) consume.
 *
 * **Totality contract.** The client is total and never returns `null`: in a
 * plain browser (no Electron bridge) it reports "no packs / base content" —
 * `isAvailable()`/`hasCatalog()`/`supportsDlcCheck()` are `false`, the catalog
 * is `null`, and a pack that declares no entitlement is `free` while a gated
 * pack is `locked` with a Steam-unavailable reason. Every call catches a
 * throwing or malformed bridge and degrades safely, so content that cannot be
 * read is treated as *locked*, never as a crash.
 *
 * **Structural types.** The status/catalog shapes mirror
 * `electron/card-pack-entitlements` / `electron/card-pack-catalog` at the UI
 * boundary (the same `*Like` convention as `steam-lock.ts`), so `src/ui` never
 * imports from `electron/`. The bridge is injectable so the client can be
 * unit-tested without Electron.
 *
 * @see electron/card-pack-ipc.ts — the IPC handlers behind the bridge.
 * @see src/ui/CardPackLoader.ts — consumes the client's status list.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

/** Entitlement state of one pack (mirrors `PackEntitlementState`). */
export type PackEntitlementStateLike = 'free' | 'unlocked' | 'locked';

/** Status of one pack (mirrors `PackEntitlementStatus`). */
export interface PackEntitlementStatusLike {
  /** Pack id (manifest `id`). */
  readonly packId: string;
  /** Game the pack extends, when known. */
  readonly gameId: string | null;
  /** Entitlement state. */
  readonly state: PackEntitlementStateLike;
  /** Steam app id that gates the pack, or `null` when the pack is free. */
  readonly steamAppId: number | null;
  /** Human-readable lock reason; `null` when the pack is playable. */
  readonly reason: string | null;
}

/** One pack → Steam DLC mapping (mirrors `CardPackDlcCatalogEntry`). */
export interface CardPackDlcCatalogEntryLike {
  readonly packId: string;
  readonly gameId?: string;
  readonly steamAppId: number;
}

/** The operator's pack → DLC catalog (mirrors `CardPackDlcCatalog`). */
export interface CardPackDlcCatalogLike {
  readonly version: number;
  readonly packs: CardPackDlcCatalogEntryLike[];
}

/**
 * The pack reference a status query forwards to the bridge.
 *
 * Shaped as the manifest-entry subset the renderer already holds, so a client
 * can forward a pack without a translation layer.
 */
export interface CardPackStatusRef {
  /** Pack id (manifest `id`). */
  readonly id: string;
  /** Game the pack extends (manifest `gameId`), when known. */
  readonly gameId?: string;
  /** Steam app id declared on the manifest entry, when present. */
  readonly steamAppId?: number | null;
}

/** The subset of `window.tce.cardPacks` the client needs. */
export interface CardPackBridge {
  isAvailable(): Promise<boolean>;
  hasCatalog(): Promise<boolean>;
  supportsDlcCheck(): Promise<boolean>;
  getCatalog(): Promise<CardPackDlcCatalogLike | null>;
  getStatus(pack: CardPackStatusRef): Promise<PackEntitlementStatusLike>;
  listStatus(packs: CardPackStatusRef[]): Promise<PackEntitlementStatusLike[]>;
}

/** Total read API over the launcher's card-pack entitlement bridge. */
export interface CardPackClient {
  /** Whether Steam is usable. Missing/erroring bridge → `false`. */
  isAvailable(): Promise<boolean>;
  /** Whether a pack → DLC catalog was loaded. Missing bridge → `false`. */
  hasCatalog(): Promise<boolean>;
  /** Whether the source exposes a real DLC-ownership check. Missing → `false`. */
  supportsDlcCheck(): Promise<boolean>;
  /** The loaded catalog, or `null`. Missing/erroring bridge → `null`. */
  getCatalog(): Promise<CardPackDlcCatalogLike | null>;
  /** Resolve one pack's status. Never throws. Missing bridge → free/locked. */
  getStatus(pack: CardPackStatusRef): Promise<PackEntitlementStatusLike>;
  /** Resolve many packs' statuses, preserving input order. Never throws. */
  listStatus(packs: readonly CardPackStatusRef[]): Promise<PackEntitlementStatusLike[]>;
}

/** Lock reason shown when Steam is unavailable (mirrors the main-process text). */
export const PACK_LOCK_REASON_STEAM_UNAVAILABLE = 'Steam is unavailable.';

/** Lock reason shown when the bridge could not be reached. */
export const PACK_LOCK_REASON_BRIDGE_UNAVAILABLE = 'Pack bridge unavailable.';

/** Coerce a possibly-malformed app id to a positive integer, or `null`. */
function normaliseSteamAppId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

/**
 * The status assumed when there is no bridge (or a pack is absent from a
 * resolver result): an ungated pack is base content (`free`), a gated pack is
 * locked because its entitlement cannot be verified.
 */
function defaultStatus(pack: CardPackStatusRef): PackEntitlementStatusLike {
  const steamAppId = normaliseSteamAppId(pack.steamAppId);
  return {
    packId: pack.id,
    gameId: pack.gameId ?? null,
    state: steamAppId === null ? 'free' : 'locked',
    steamAppId,
    reason: steamAppId === null ? null : PACK_LOCK_REASON_STEAM_UNAVAILABLE,
  };
}

/** A locked status for *pack* with the supplied *reason*. */
function lockedStatus(pack: CardPackStatusRef, reason: string): PackEntitlementStatusLike {
  return {
    packId: pack.id,
    gameId: pack.gameId ?? null,
    state: 'locked',
    steamAppId: normaliseSteamAppId(pack.steamAppId),
    reason,
  };
}

/** Structural guard for a status object returned by the bridge. */
function isStatusLike(value: unknown): value is PackEntitlementStatusLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.packId !== 'string') return false;
  return (
    candidate.state === 'free' ||
    candidate.state === 'unlocked' ||
    candidate.state === 'locked'
  );
}

/**
 * Wrap a bridge (or `null`) in a total read client.
 *
 * With no bridge the client is a safe no-op that reports entitlement as free
 * for ungated packs and locked for gated packs, so a plain-browser build needs
 * no branching at the call site.
 */
export function createCardPackClient(
  bridge: CardPackBridge | null | undefined,
): CardPackClient {
  return {
    async isAvailable(): Promise<boolean> {
      if (!bridge) return false;
      try {
        return (await bridge.isAvailable()) === true;
      } catch {
        return false;
      }
    },
    async hasCatalog(): Promise<boolean> {
      if (!bridge) return false;
      try {
        return (await bridge.hasCatalog()) === true;
      } catch {
        return false;
      }
    },
    async supportsDlcCheck(): Promise<boolean> {
      if (!bridge) return false;
      try {
        return (await bridge.supportsDlcCheck()) === true;
      } catch {
        return false;
      }
    },
    async getCatalog(): Promise<CardPackDlcCatalogLike | null> {
      if (!bridge) return null;
      try {
        const catalog = await bridge.getCatalog();
        return typeof catalog === 'object' && catalog !== null ? catalog : null;
      } catch {
        return null;
      }
    },
    async getStatus(pack: CardPackStatusRef): Promise<PackEntitlementStatusLike> {
      if (!bridge) return defaultStatus(pack);
      try {
        const status = await bridge.getStatus(pack);
        return isStatusLike(status) ? status : lockedStatus(pack, PACK_LOCK_REASON_BRIDGE_UNAVAILABLE);
      } catch {
        return lockedStatus(pack, PACK_LOCK_REASON_STEAM_UNAVAILABLE);
      }
    },
    async listStatus(packs: readonly CardPackStatusRef[]): Promise<PackEntitlementStatusLike[]> {
      if (!Array.isArray(packs) || packs.length === 0) return [];
      if (!bridge) return packs.map(defaultStatus);
      try {
        const statuses = await bridge.listStatus(packs);
        if (!Array.isArray(statuses)) {
          return packs.map(defaultStatus);
        }
        return packs.map((pack, index) => {
          const status = statuses[index];
          if (!isStatusLike(status)) {
            return defaultStatus(pack);
          }
          return status;
        });
      } catch {
        return packs.map((pack) => lockedStatus(pack, PACK_LOCK_REASON_STEAM_UNAVAILABLE));
      }
    },
  };
}

/** The subset of `window.tce` the client needs. */
interface TceWindow {
  tce?: { cardPacks?: CardPackBridge };
}

/**
 * Return a total client bound to the preload bridge.
 *
 * Always returns a client — in a plain browser (no `window` / no
 * `window.tce.cardPacks`) it reports base content / no packs rather than
 * `null`, so callers never branch on the runtime.
 */
export function cardPackClientFromWindow(): CardPackClient {
  if (typeof window === 'undefined') return createCardPackClient(null);
  return createCardPackClient((window as unknown as TceWindow).tce?.cardPacks);
}
