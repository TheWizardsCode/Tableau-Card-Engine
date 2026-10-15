/**
 * Card-pack manifest contract and core-engine version compatibility.
 *
 * Part of the card-pack DLC feature (CG-0MUZFD1WR0031QTB, feature F2 /
 * CG-0MUZIS0K7006C5WU). A distribution operator drops a
 * `<contentDir>/packs/manifest.json` document describing the card packs that
 * extend an already-installed game; this module is the renderer-safe,
 * side-effect-free contract that validates that document and decides, per
 * pack, whether it is compatible with the running core engine.
 *
 * Mirror of `src/ui/game-manifest.ts` (`parseGameManifest` /
 * `splitByCompatibility`) for the card-pack channel. The same never-throw
 * discipline applies: a malformed or hostile pack document degrades
 * gracefully instead of breaking the launcher or a game.
 *
 * Notes:
 *   - This module imports no Node builtins, so it is safe to bundle into the
 *     renderer as well as the Electron main process.
 *   - `ENGINE_VERSION` is read from the leaf `./engine-version` module rather
 *     than the `@core-engine` barrel to avoid a circular initialisation.
 *
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import semver from 'semver';

import { ENGINE_VERSION } from './engine-version';

/**
 * The core-engine version the launcher is running.
 *
 * Re-exported from the leaf version module so there is a single source of
 * truth; the compatibility check must consume this constant, never a
 * hardcoded copy.
 */
export const DEFAULT_ENGINE_VERSION = ENGINE_VERSION;

/**
 * Optional entitlement gate on a pack entry. Absent means the pack is free.
 *
 * The only gate understood today is Steam DLC ownership; additional fields
 * may be added additively in future.
 */
export interface CardPackEntitlement {
  /** Steam application id that unlocks the pack when owned. */
  readonly steamAppId?: number;
}

/** One pack entry in `<contentDir>/packs/manifest.json`. */
export interface CardPackManifestEntry {
  /** Stable pack identifier (the pack directory name under `<gameId>/`). */
  readonly id: string;
  /** Game the pack extends. */
  readonly gameId: string;
  /** Display name shown in the in-game pack listing. */
  readonly title: string;
  /** Short description shown in the pack listing. */
  readonly description: string;
  /** Pack content version (independent of the game/engine version). */
  readonly version: string;
  /** Semver range of core-engine versions this pack supports. */
  readonly coreEngineVersion: string;
  /** Relative path (inside the pack directory) to the CSV fragment. */
  readonly cards: string;
  /** Optional relative asset paths inside the pack directory. */
  readonly assets?: string[];
  /** Optional entitlement gate; absent means the pack is free. */
  readonly entitlement?: CardPackEntitlement;
}

/** Root document read from `<contentDir>/packs/manifest.json`. */
export interface CardPackManifest {
  /** Manifest schema version. */
  readonly version: number;
  /** Pack entries declared by the distribution operator. */
  readonly packs: CardPackManifestEntry[];
}

/** Successful parse result. */
export interface CardPackManifestParseSuccess {
  readonly ok: true;
  readonly manifest: CardPackManifest;
}

/** Failed parse result — `errors` explains every problem found. */
export interface CardPackManifestParseFailure {
  readonly ok: false;
  readonly errors: string[];
}

/** Discriminated result of {@link parseCardPackManifest}. */
export type CardPackManifestParseResult =
  | CardPackManifestParseSuccess
  | CardPackManifestParseFailure;

/** A pack the launcher cannot run, with the reason it was rejected. */
export interface IncompatiblePack {
  readonly pack: CardPackManifestEntry;
  /** Human-readable reason naming the required range and launcher version. */
  readonly reason: string;
}

/** Result of {@link splitPacksByCompatibility}. */
export interface PackCompatibilitySplit {
  readonly compatible: CardPackManifestEntry[];
  readonly incompatible: IncompatiblePack[];
}

/** Fields every pack must declare as a non-empty string. */
const REQUIRED_STRING_FIELDS = [
  'id',
  'gameId',
  'title',
  'description',
  'version',
  'coreEngineVersion',
  'cards',
] as const;

function parseInput(input: string | unknown): { value?: unknown; error?: string } {
  if (typeof input === 'string') {
    if (input.trim() === '') {
      return { error: 'Manifest is empty.' };
    }
    try {
      return { value: JSON.parse(input) };
    } catch (err) {
      return { error: `Malformed JSON: ${(err as Error).message}` };
    }
  }
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return { value: input };
  }
  return {
    error: 'Manifest must be a JSON string or a plain object.',
  };
}

/** Validate and normalise an optional `assets` array. */
function parseAssets(
  rawAssets: unknown,
  prefix: string,
  errors: string[],
): string[] | undefined {
  if (rawAssets === undefined) return undefined;
  if (!Array.isArray(rawAssets)) {
    errors.push(`${prefix}.assets: expected an array of non-empty strings.`);
    return undefined;
  }
  const assets: string[] = [];
  rawAssets.forEach((asset, assetIndex) => {
    if (typeof asset !== 'string' || asset.trim() === '') {
      errors.push(
        `${prefix}.assets[${assetIndex}]: expected a non-empty string.`,
      );
      return;
    }
    assets.push(asset);
  });
  return assets;
}

/** Validate and normalise an optional `entitlement` object. */
function parseEntitlement(
  rawEntitlement: unknown,
  prefix: string,
  errors: string[],
): CardPackEntitlement | undefined {
  if (rawEntitlement === undefined) return undefined;
  if (
    typeof rawEntitlement !== 'object' ||
    rawEntitlement === null ||
    Array.isArray(rawEntitlement)
  ) {
    errors.push(`${prefix}.entitlement: expected an object when present.`);
    return undefined;
  }
  const entitlement = rawEntitlement as Record<string, unknown>;
  const steamAppId = entitlement.steamAppId;
  if (steamAppId !== undefined) {
    if (
      typeof steamAppId !== 'number' ||
      !Number.isInteger(steamAppId) ||
      steamAppId <= 0
    ) {
      errors.push(
        `${prefix}.entitlement.steamAppId: expected a positive integer.`,
      );
      return undefined;
    }
    return { steamAppId };
  }
  return {};
}

/**
 * Parse and validate a card-pack manifest document.
 *
 * Accepts either the raw JSON string (as read from disk / `fetch`) or an
 * already-parsed value. Never throws: malformed JSON, a wrong document shape,
 * missing or empty fields, invalid semver ranges, duplicate pack ids, and
 * duplicate `(gameId, id)` pairs are all reported as
 * `{ ok: false, errors }`.
 */
export function parseCardPackManifest(
  input: string | unknown,
): CardPackManifestParseResult {
  const { value, error } = parseInput(input);
  if (error) {
    return { ok: false, errors: [error] };
  }

  const errors: string[] = [];
  const document = value as Record<string, unknown>;

  const version = document.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    errors.push('version: expected a positive integer.');
  }

  const rawPacks = document.packs;
  if (!Array.isArray(rawPacks)) {
    errors.push('packs: expected an array.');
    return { ok: false, errors };
  }

  const entries: CardPackManifestEntry[] = [];
  const seenIds = new Set<string>();
  const seenGamePackKeys = new Set<string>();

  rawPacks.forEach((rawEntry, index) => {
    const prefix = `packs[${index}]`;
    const errorsBeforeEntry = errors.length;
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
      errors.push(`${prefix}: expected an object.`);
      return;
    }
    const pack = rawEntry as Record<string, unknown>;

    for (const field of REQUIRED_STRING_FIELDS) {
      const fieldValue = pack[field];
      if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
        errors.push(`${prefix}.${field}: expected a non-empty string.`);
      }
    }

    const coreEngineVersion = pack.coreEngineVersion;
    if (
      typeof coreEngineVersion === 'string' &&
      coreEngineVersion.trim() !== '' &&
      semver.validRange(coreEngineVersion) === null
    ) {
      errors.push(
        `${prefix}.coreEngineVersion: "${coreEngineVersion}" is not a valid semver range.`,
      );
    }

    const id = pack.id;
    if (typeof id === 'string' && id.trim() !== '') {
      if (seenIds.has(id)) {
        errors.push(`${prefix}.id: duplicate pack id "${id}".`);
      }
      seenIds.add(id);
    }

    const gameId = pack.gameId;
    if (
      typeof id === 'string' &&
      id.trim() !== '' &&
      typeof gameId === 'string' &&
      gameId.trim() !== ''
    ) {
      // Identity on disk is (`<contentDir>/packs/<gameId>/<packId>/`), so the
      // compound key is the authoritative uniqueness constraint. A duplicate
      // pack id is also reported above because a flat manifest list cannot
      // distinguish two packs that share one id.
      const compoundKey = `${gameId}\u0000${id}`;
      if (seenGamePackKeys.has(compoundKey)) {
        errors.push(
          `${prefix}: duplicate pack (gameId, id) ("${gameId}", "${id}").`,
        );
      }
      seenGamePackKeys.add(compoundKey);
    }

    const assets = parseAssets(pack.assets, prefix, errors);
    const entitlement = parseEntitlement(pack.entitlement, prefix, errors);

    if (errors.length === errorsBeforeEntry) {
      entries.push({
        id: id as string,
        gameId: gameId as string,
        title: pack.title as string,
        description: pack.description as string,
        version: pack.version as string,
        coreEngineVersion: coreEngineVersion as string,
        cards: pack.cards as string,
        ...(assets !== undefined ? { assets } : {}),
        ...(entitlement !== undefined ? { entitlement } : {}),
      });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    manifest: { version: version as number, packs: entries },
  };
}

/**
 * Partition packs into those compatible with *engineVersion* and those that
 * are not. Each incompatible item carries a reason naming the pack's required
 * range and the launcher version so the pack listing can surface e.g.
 * "Incompatible pack: Foo — requires core v^9.0.0 (launcher is v0.1.0)".
 */
export function splitPacksByCompatibility(
  packs: CardPackManifestEntry[],
  engineVersion: string = DEFAULT_ENGINE_VERSION,
): PackCompatibilitySplit {
  const compatible: CardPackManifestEntry[] = [];
  const incompatible: IncompatiblePack[] = [];

  for (const pack of packs) {
    if (semver.satisfies(engineVersion, pack.coreEngineVersion)) {
      compatible.push(pack);
    } else {
      incompatible.push({
        pack,
        reason:
          `requires core v${pack.coreEngineVersion} ` +
          `(launcher is v${engineVersion})`,
      });
    }
  }

  return { compatible, incompatible };
}

/**
 * Select the packs that extend one game, preserving manifest order.
 *
 * A manifest may describe packs for several games; the renderer loader uses
 * this to take only the packs belonging to the game it is booting.
 */
export function filterPacksByGameId(
  packs: CardPackManifestEntry[],
  gameId: string,
): CardPackManifestEntry[] {
  return packs.filter((pack) => pack.gameId === gameId);
}
