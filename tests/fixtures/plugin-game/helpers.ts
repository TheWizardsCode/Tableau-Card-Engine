/**
 * Shared access points for the runtime game plugin loader fixtures.
 *
 * Tests must not hand-roll manifest JSON. Use {@link makeManifest} /
 * {@link makeManifestJson} to build documents in memory, and the
 * {@link PLUGIN_GAME_MANIFESTS} paths when a test needs a committed on-disk
 * variant (e.g. to exercise `fetch()`/`fs` reading).
 *
 * Fixture layout (`tests/fixtures/plugin-game/`):
 *   entry.js                 — importable ESM artifact (scene class + GAME_INFO)
 *   assets/thumbnail.png     — deterministic 1×1 PNG (< 1 KB)
 *   manifest*.json           — valid + invalid manifest variants
 *
 * See `README.md` in this directory for provenance and licensing.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the fixture game's root artifact directory. */
export const PLUGIN_GAME_DIR = HERE;

/** Absolute path to the artifact's ESM entry module. */
export const PLUGIN_GAME_ENTRY_PATH = path.join(HERE, 'entry.js');

/** Absolute path to the artifact's thumbnail. */
export const PLUGIN_GAME_THUMBNAIL_PATH = path.join(
  HERE,
  'assets',
  'thumbnail.png',
);

/** One manifest entry from the runtime game plugin contract. */
export interface FixtureManifestEntry {
  id: string;
  sceneKey: string;
  title: string;
  description: string;
  thumbnail: string;
  coreEngineVersion: string;
  entry: string;
}

/** Root manifest document read from `<contentDir>/games/manifest.json`. */
export interface FixtureManifest {
  version: number;
  games: FixtureManifestEntry[];
}

/** Committed manifest variants, keyed by the scenario each exercises. */
export const PLUGIN_GAME_MANIFESTS = {
  /** Valid: one compatible entry pointing at the on-disk artifact. */
  valid: path.join(HERE, 'manifest.json'),
  /** Malformed JSON (trailing comma) — parser must not throw. */
  malformed: path.join(HERE, 'manifest-malformed.json'),
  /** Valid shape, `coreEngineVersion` outside the launcher's range. */
  incompatible: path.join(HERE, 'manifest-incompatible.json'),
  /** Two entries sharing both `id` and `sceneKey`. */
  duplicate: path.join(HERE, 'manifest-duplicate.json'),
  /** Valid metadata but `entry` points to a file that is not on disk. */
  missingFile: path.join(HERE, 'manifest-missing-file.json'),
  /** `coreEngineVersion` is not a valid semver range. */
  invalidRange: path.join(HERE, 'manifest-invalid-range.json'),
  /** Entry omits the required `coreEngineVersion` and `entry` fields. */
  missingFields: path.join(HERE, 'manifest-missing-fields.json'),
} as const;

/** Name of a committed manifest variant. */
export type FixtureManifestVariant = keyof typeof PLUGIN_GAME_MANIFESTS;

/** The engine version the fixture manifest's valid entry is compatible with. */
export const FIXTURE_COMPATIBLE_VERSION = '0.1.0';

/** A `coreEngineVersion` range the launcher must reject. */
export const FIXTURE_INCOMPATIBLE_RANGE = '^9.0.0';

/**
 * Build a fully-populated fixture manifest entry, overriding only what a test
 * cares about.
 */
export function defaultManifestEntry(
  overrides: Partial<FixtureManifestEntry> = {},
): FixtureManifestEntry {
  return {
    id: 'fixture-game',
    sceneKey: 'FixtureGameScene',
    title: 'Fixture Game',
    description: 'Synthetic runtime game used by plugin loader tests.',
    thumbnail: 'assets/thumbnail.png',
    coreEngineVersion: '^0.1.0',
    entry: 'entry.js',
    ...overrides,
  };
}

/**
 * Build a manifest document. Pass an array of entries (each optionally a
 * partial override) and optional top-level overrides.
 */
export function makeManifest(
  games: Partial<FixtureManifestEntry>[] = [{}],
  document: Partial<Omit<FixtureManifest, 'games'>> = {},
): FixtureManifest {
  return {
    version: 1,
    ...document,
    games: games.map((game) => defaultManifestEntry(game)),
  };
}

/** Serialise {@link makeManifest} to a JSON string. */
export function makeManifestJson(
  games: Partial<FixtureManifestEntry>[] = [{}],
  document: Partial<Omit<FixtureManifest, 'games'>> = {},
): string {
  return JSON.stringify(makeManifest(games, document), null, 2);
}

/** Read a committed manifest variant as raw text (unparsed). */
export function readManifestVariant(variant: FixtureManifestVariant): string {
  return readFileSync(PLUGIN_GAME_MANIFESTS[variant], 'utf-8');
}
