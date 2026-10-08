/**
 * Card-pack renderer loader (feature F6, CG-0MUZIS2VF006NY3T).
 *
 * Discovers the packs installed for one game from
 * `<contentDir>/packs/manifest.json`, filters them by `gameId`, core-engine
 * compatibility and entitlement, reads each entitled pack's CSV fragment
 * through the scoped `tce-packs://` scheme, and returns a merged,
 * game-consumable result. This is the renderer half of the card-pack DLC
 * channel (CG-0MUZFD1WR0031QTB); it mirrors `src/ui/GamePluginLoader.ts` for
 * whole-game DLC.
 *
 * Contract:
 *   - **Never throws.** A missing/malformed manifest, an unavailable
 *     entitlement bridge, a failed CSV fetch, and a hostile asset path are all
 *     reported structurally in the returned `errors` / `incompatible` /
 *     `locked` arrays, so a game always boots (on base content if necessary).
 *   - **Game-scoped.** Only packs whose `gameId` matches the requested game are
 *     considered; the rest are ignored.
 *   - **Entitlement-gated.** A compatible pack the player is not entitled to is
 *     reported in `locked` with a human-readable reason and never fetched.
 *     Entitled (free or unlocked) packs land in `packs` with `enabled: true` by
 *     default.
 *   - **Environment-injected.** Every dependency on the environment
 *     (`fetchManifest`, `fetchCsv`, `importer`, entitlement resolution) is
 *     injectable, so the loader is unit-testable without Electron, a network,
 *     or a real content directory — see `tests/ui/card-pack-loader.test.ts`.
 *
 * Each loaded pack carries the fetched CSV text (for
 * {@link mergeCardPackCsv}) and its declared assets as resolved `tce-packs://`
 * URLs — the game's asset loader (Phaser) fetches the binaries through the
 * scoped protocol, so this module never loads image/audio bytes itself.
 *
 * @see src/ui/card-pack-client.ts — the entitlement read client (F6).
 * @see src/ui/card-pack-url.ts — the `tce-packs://` URL builder (F4).
 * @see src/core-engine/CardPackManifest.ts — manifest parse/compatibility (F2).
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import {
  DEFAULT_ENGINE_VERSION,
  filterPacksByGameId,
  parseCardPackManifest,
  splitPacksByCompatibility,
} from '@core-engine';
import type {
  CardPackManifest,
  CardPackManifestEntry,
  IncompatiblePack,
} from '@core-engine';
import { resolveCardPackAssetUrl } from './card-pack-url';
import {
  PACK_LOCK_REASON_BRIDGE_UNAVAILABLE,
  PACK_LOCK_REASON_STEAM_UNAVAILABLE,
  type CardPackStatusRef,
  type PackEntitlementStatusLike,
} from './card-pack-client';

/** Subdirectory of the content directory that holds installed card packs. */
export const PACKS_DIRNAME = 'packs';

/** Relative path, under {@link PACKS_DIRNAME}, of the manifest document. */
export const MANIFEST_FILENAME = 'manifest.json';

/**
 * Identifier used on {@link CardPackLoadError}s that describe the manifest
 * document itself rather than one pack.
 */
export const MANIFEST_ERROR_ID = '<manifest>';

/**
 * Reads the raw manifest text from a URL.
 *
 * Injected so tests (and Electron) can supply their own transport. The default
 * uses the renderer's global `fetch`.
 */
export type CardPackManifestFetcher = (url: string) => Promise<string>;

/**
 * Reads a pack CSV fragment's text from a `tce-packs://` URL.
 *
 * Injected so tests can serve fixture text instead of hitting the protocol.
 */
export type CardPackCsvFetcher = (url: string) => Promise<string>;

/**
 * Dynamically imports a module from a URL — the fallback text transport when
 * {@link CardPackLoaderOptions.fetchCsv} is not supplied (e.g. a Vite
 * `?raw` dynamic import). Returns the imported value; a bare string, a module
 * with a `default` string, or `{ default: { default: string } }` are all
 * accepted.
 */
export type CardPackModuleImporter = (url: string) => Promise<unknown>;

/**
 * Resolves the entitlement status of a batch of packs.
 *
 * The renderer passes the client's `listStatus` (a thin adapter over
 * {@link CardPackClient.listStatus}) so the loader tests need no Electron
 * bridge. The loader builds one {@link CardPackStatusRef} per compatible pack
 * and maps the returned statuses back by index. Absent → every compatible pack
 * is treated as free base content.
 */
export type CardPackEntitlementResolver = (
  packs: readonly CardPackStatusRef[],
) => Promise<PackEntitlementStatusLike[]>;

/** Options accepted by {@link loadCardPacks}. */
export interface CardPackLoaderOptions {
  /**
   * The content directory the launcher resolved. Either a URL string
   * (`file://…`, `https://…`) or an absolute filesystem path.
   */
  readonly contentDir: string;
  /** The game the packs must extend (manifest `gameId`). */
  readonly gameId: string;
  /** Core-engine version for compatibility; defaults to {@link DEFAULT_ENGINE_VERSION}. */
  readonly engineVersion?: string;
  /** Manifest transport; defaults to `fetch`. */
  readonly fetchManifest?: CardPackManifestFetcher;
  /** CSV transport; takes precedence over {@link importer}. Defaults to `fetch`. */
  readonly fetchCsv?: CardPackCsvFetcher;
  /** Fallback text transport via dynamic import; used when `fetchCsv` is absent. */
  readonly importer?: CardPackModuleImporter;
  /** Entitlement resolver; absent treats every compatible pack as free. */
  readonly resolveEntitlement?: CardPackEntitlementResolver;
}

/** An entitled (free or unlocked) pack with its fetched content. */
export interface LoadedCardPack {
  /** The manifest entry that produced this pack. */
  readonly manifest: CardPackManifestEntry;
  /** Raw CSV fragment text, ready for {@link mergeCardPackCsv}. */
  readonly csv: string;
  /** Resolved `tce-packs://` asset URLs declared by the pack. */
  readonly assetUrls: readonly string[];
  /** The player's entitlement status for the pack. */
  readonly status: PackEntitlementStatusLike;
  /** Whether the pack is active; entitled packs are enabled by default. */
  readonly enabled: boolean;
}

/** A compatible pack the player is not entitled to (never fetched). */
export interface LockedCardPack {
  /** The manifest entry that produced this pack. */
  readonly manifest: CardPackManifestEntry;
  /** The (locked) entitlement status. */
  readonly status: PackEntitlementStatusLike;
  /** Human-readable reason shown in the listing. */
  readonly reason: string;
}

/** A pack (or the manifest) that could not be loaded, with the reason. */
export interface CardPackLoadError {
  /** Pack id from the manifest; {@link MANIFEST_ERROR_ID} for the document. */
  readonly id: string;
  /** Human-readable, actionable reason. */
  readonly reason: string;
}

/** Outcome of {@link loadCardPacks}. Never thrown — always returned. */
export interface CardPackLoadResult {
  /** Entitled, compatible packs with CSV text, enabled by default. */
  readonly packs: LoadedCardPack[];
  /** Compatible-range failures, for the listing's incompatibility note. */
  readonly incompatible: IncompatiblePack[];
  /** Compatible but unentitled packs, with a lock reason. */
  readonly locked: LockedCardPack[];
  /** Pack-level and manifest-level load failures. */
  readonly errors: CardPackLoadError[];
}

/** Default manifest transport: the renderer's global `fetch`. */
async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

/**
 * Extract text from an imported module value.
 *
 * Accepts a bare string, an ESM module with a string `default`, a nested
 * default (`{ default: { default } }`), or a `raw` export. Returns `null` when
 * no text can be recovered.
 */
function textFromImported(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.raw === 'string') return record.raw;
  const fallback = record.default;
  if (typeof fallback === 'string') return fallback;
  if (typeof fallback === 'object' && fallback !== null) {
    const nested = (fallback as Record<string, unknown>).default;
    if (typeof nested === 'string') return nested;
  }
  return null;
}

/**
 * Turn a content directory (URL string or filesystem path) into a base URL
 * safe for relative resolution. Ensures a trailing slash so
 * `new URL('packs/…', base)` appends to — rather than replaces — the final
 * path segment.
 */
function resolveContentBaseUrl(contentDir: string): URL {
  let base: URL;
  try {
    base = new URL(contentDir);
  } catch {
    const normalised = contentDir.replace(/\\/g, '/');
    const absolute = normalised.startsWith('/') ? normalised : `/${normalised}`;
    base = new URL(`file://${absolute}`);
  }
  if (!base.pathname.endsWith('/')) {
    base.pathname = `${base.pathname}/`;
  }
  return base;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A pack ref for the default (free) status. */
function defaultPackStatus(pack: CardPackManifestEntry): PackEntitlementStatusLike {
  const steamAppId = pack.entitlement?.steamAppId ?? null;
  return {
    packId: pack.id,
    gameId: pack.gameId,
    state: 'free',
    steamAppId,
    reason: null,
  };
}

/** A locked status for *pack* with the supplied *reason*. */
function lockedPackStatus(
  pack: CardPackManifestEntry,
  reason: string,
): PackEntitlementStatusLike {
  return {
    packId: pack.id,
    gameId: pack.gameId,
    state: 'locked',
    steamAppId: pack.entitlement?.steamAppId ?? null,
    reason,
  };
}

/**
 * Resolve entitlement for *packs*, total: a missing resolver yields free
 * statuses, a throwing resolver yields locked statuses, and a malformed/short
 * result falls back per-pack. Always returns one status per input pack, in
 * order.
 */
async function resolveEntitlements(
  packs: readonly CardPackManifestEntry[],
  resolver: CardPackEntitlementResolver | undefined,
): Promise<PackEntitlementStatusLike[]> {
  if (!resolver) return packs.map(defaultPackStatus);
  const refs: CardPackStatusRef[] = packs.map((pack) => ({
    id: pack.id,
    gameId: pack.gameId,
    steamAppId: pack.entitlement?.steamAppId ?? null,
  }));
  let statuses: PackEntitlementStatusLike[];
  try {
    statuses = await resolver(refs);
  } catch {
    return packs.map((pack) => lockedPackStatus(pack, PACK_LOCK_REASON_STEAM_UNAVAILABLE));
  }
  if (!Array.isArray(statuses)) {
    return packs.map((pack) => lockedPackStatus(pack, PACK_LOCK_REASON_BRIDGE_UNAVAILABLE));
  }
  return packs.map((pack, index) => {
    const status = statuses[index];
    if (
      typeof status !== 'object' ||
      status === null ||
      typeof status.packId !== 'string'
    ) {
      return defaultPackStatus(pack);
    }
    return status;
  });
}

/**
 * Discover, filter and read the card packs installed for *gameId*.
 *
 * Never rejects: every failure is captured in the returned
 * {@link CardPackLoadResult} so the caller can continue booting with base
 * content. A compatible, entitled pack contributes its CSV text; an
 * unentitled pack is reported (with a reason) in `locked` and never fetched.
 */
export async function loadCardPacks(
  options: CardPackLoaderOptions,
): Promise<CardPackLoadResult> {
  const packs: LoadedCardPack[] = [];
  const incompatible: IncompatiblePack[] = [];
  const locked: LockedCardPack[] = [];
  const errors: CardPackLoadError[] = [];

  const base = resolveContentBaseUrl(options.contentDir);
  const manifestUrl = new URL(
    `${PACKS_DIRNAME}/${MANIFEST_FILENAME}`,
    base,
  ).href;

  const fetchManifest = options.fetchManifest ?? defaultFetchText;

  let manifestText: string;
  try {
    manifestText = await fetchManifest(manifestUrl);
  } catch (error) {
    errors.push({
      id: MANIFEST_ERROR_ID,
      reason: `Could not read ${manifestUrl}: ${errorMessage(error)}`,
    });
    return { packs, incompatible, locked, errors };
  }

  const parsed = parseCardPackManifest(manifestText);
  if (!parsed.ok) {
    errors.push({
      id: MANIFEST_ERROR_ID,
      reason: `Invalid manifest at ${manifestUrl}: ${parsed.errors.join('; ')}`,
    });
    return { packs, incompatible, locked, errors };
  }

  const gamePacks = filterPacksByGameId(parsed.manifest.packs, options.gameId);
  const engineVersion = options.engineVersion ?? DEFAULT_ENGINE_VERSION;
  const split = splitPacksByCompatibility(gamePacks, engineVersion);
  incompatible.push(...split.incompatible);

  // Entitlement is resolved for the whole compatible batch at once so the
  // bridge is consulted a single time and per-pack results keep their order.
  const statuses = await resolveEntitlements(split.compatible, options.resolveEntitlement);

  const loadCsv = resolveCsvLoader(options);

  for (let index = 0; index < split.compatible.length; index += 1) {
    const pack = split.compatible[index];
    const status = statuses[index];

    if (status.state === 'locked') {
      locked.push({
        manifest: pack,
        status,
        reason: status.reason ?? PACK_LOCK_REASON_STEAM_UNAVAILABLE,
      });
      continue;
    }

    let csv: string;
    try {
      const csvUrl = resolveCardPackAssetUrl(pack.gameId, pack.id, pack.cards);
      csv = await loadCsv(csvUrl);
    } catch (error) {
      errors.push({
        id: pack.id,
        reason: `Failed to read cards "${pack.cards}": ${errorMessage(error)}`,
      });
      continue;
    }

    const assetUrls: string[] = [];
    for (const asset of pack.assets ?? []) {
      try {
        assetUrls.push(resolveCardPackAssetUrl(pack.gameId, pack.id, asset));
      } catch (error) {
        errors.push({
          id: pack.id,
          reason: `Invalid asset "${asset}": ${errorMessage(error)}`,
        });
      }
    }

    packs.push({
      manifest: pack,
      csv,
      assetUrls,
      status,
      enabled: true,
    });
  }

  return { packs, incompatible, locked, errors };
}

/** Resolve the CSV transport: explicit fetcher, else importer, else `fetch`. */
function resolveCsvLoader(options: CardPackLoaderOptions): CardPackCsvFetcher {
  if (options.fetchCsv) return options.fetchCsv;
  if (options.importer) {
    const importer = options.importer;
    return async (url: string): Promise<string> => {
      const text = textFromImported(await importer(url));
      if (text === null) {
        throw new Error(`Imported module from ${url} exposed no text.`);
      }
      return text;
    };
  }
  return defaultFetchText;
}

export type {
  CardPackManifest,
  CardPackManifestEntry,
  PackEntitlementStatusLike,
};
