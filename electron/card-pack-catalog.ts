/**
 * Card-pack DLC catalog loader (feature F5, CG-0MUZIS2B8005WG4S).
 *
 * A card pack (see `src/core-engine/CardPackManifest.ts`) may be gated on
 * Steam DLC ownership. The mapping from a pack to the Steam application id
 * that unlocks it is **configuration**, not code: this module loads
 * `card-pack-dlc-catalog.json` (next to the compiled module) and resolves a
 * pack reference to its app id. No game or pack title is ever hard-coded in
 * the entitlement logic — the catalog is the single data source.
 *
 * Packs absent from the catalog fall back to the `entitlement.steamAppId`
 * value declared on the pack's manifest entry, and a pack with neither is
 * free (base content). This keeps the operator-side catalog authoritative
 * while letting a pack ship its own declaration for development/testing.
 *
 * Pure Node (no Electron import) so it is unit-testable — it mirrors
 * `electron/bonus-catalog.ts`.
 *
 * @see electron/card-pack-entitlements.ts — the source/service that consumes
 *   the resolved app id.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Committed catalog filename; resolved relative to the compiled module. */
export const DEFAULT_CARD_PACK_CATALOG_FILE = 'card-pack-dlc-catalog.json';

/** One pack → Steam DLC mapping. */
export interface CardPackDlcCatalogEntry {
  /** Pack id (matches the manifest pack `id`). */
  readonly packId: string;
  /**
   * Game the pack extends. When present the entry only resolves a pack with
   * the same `gameId`; when absent it resolves any pack with that id.
   */
  readonly gameId?: string;
  /** Steam application id that unlocks the pack when owned. */
  readonly steamAppId: number;
}

/** Root document read from `card-pack-dlc-catalog.json`. */
export interface CardPackDlcCatalog {
  /** Catalog schema version. */
  readonly version: number;
  /** Pack → DLC mappings (order preserved from the file). */
  readonly packs: CardPackDlcCatalogEntry[];
}

/** Options for {@link loadCardPackCatalog}. */
export interface LoadCardPackCatalogOptions {
  /** Override the catalog path (tests); defaults to the module directory. */
  readonly catalogPath?: string;
}

/** Directory of the compiled/loaded module (works under ESM). */
function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Load the pack → DLC catalog.
 *
 * Returns `null` when the file is missing or malformed (wrong shape, or a
 * parse failure) — callers treat that as "no catalog configured" and fall
 * back to the manifest declaration / free. An empty but well-formed `packs`
 * array is a valid catalog (every pack is free). Never throws.
 */
export function loadCardPackCatalog(
  options: LoadCardPackCatalogOptions = {},
): CardPackDlcCatalog | null {
  const catalogPath =
    options.catalogPath ?? path.join(moduleDir(), DEFAULT_CARD_PACK_CATALOG_FILE);
  if (!fs.existsSync(catalogPath)) return null;

  try {
    const raw = fs.readFileSync(catalogPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CardPackDlcCatalog>;
    if (!Array.isArray(parsed.packs)) return null;

    const packs = parsed.packs.filter(isCardPackDlcEntry);
    const version =
      typeof parsed.version === 'number' &&
      Number.isInteger(parsed.version) &&
      parsed.version >= 1
        ? parsed.version
        : 1;

    return { version, packs };
  } catch {
    return null;
  }
}

/** Structural guard for a single catalog entry. */
export function isCardPackDlcEntry(value: unknown): value is CardPackDlcCatalogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.packId !== 'string' || entry.packId.trim() === '') return false;
  if (entry.gameId !== undefined && typeof entry.gameId !== 'string') return false;
  if (
    typeof entry.steamAppId !== 'number' ||
    !Number.isInteger(entry.steamAppId) ||
    entry.steamAppId <= 0
  ) {
    return false;
  }
  return true;
}

/** The subset of a pack the catalog resolver needs. */
export interface CatalogPackRef {
  /** Pack id (manifest pack `id`). */
  readonly id: string;
  /** Game the pack extends, when known. */
  readonly gameId?: string;
  /** Steam app id declared on the pack manifest entry, if any. */
  readonly steamAppId?: number | null;
}

/**
 * Resolve the Steam app id that gates *pack*, or `null` when the pack is not
 * gated (free / base content).
 *
 * Precedence (catalog first — the operator's authority wins over a pack's own
 * declaration):
 *   1. a catalog entry for `(pack.id, pack.gameId)`,
 *   2. a catalog entry for `pack.id` with no `gameId` (wildcard),
 *   3. the pack's own `steamAppId` when it is a positive integer.
 */
export function resolvePackSteamAppId(
  catalog: CardPackDlcCatalog | null,
  pack: CatalogPackRef,
): number | null {
  if (catalog) {
    const exact = catalog.packs.find(
      (entry) => entry.packId === pack.id && entry.gameId !== undefined && entry.gameId === pack.gameId,
    );
    const wildcard = catalog.packs.find(
      (entry) => entry.packId === pack.id && entry.gameId === undefined,
    );
    const entry = exact ?? wildcard;
    if (entry) return entry.steamAppId;
  }

  if (typeof pack.steamAppId === 'number' && Number.isInteger(pack.steamAppId) && pack.steamAppId > 0) {
    return pack.steamAppId;
  }
  return null;
}
