/**
 * Runtime game manifest parsing and core-engine version compatibility.
 *
 * Part of the Electron runtime game plugin loader (CG-0MTRO7VMI000F3A5,
 * feature F2 / CG-0MUG2ZIYN0026WHV). This module is deliberately
 * browser/Electron-agnostic and side-effect free so the launcher (and its
 * tests) can validate a `<contentDir>/games/manifest.json` document and
 * decide, per entry, whether the game is compatible with the running core.
 *
 * Contract:
 *   - `parseGameManifest()` never throws on malformed input; it returns a
 *     discriminated result so the caller degrades gracefully (AC4).
 *   - `splitByCompatibility()` keeps incompatible games visible to the
 *     caller (id + human-readable reason) so the Game Selector can note
 *     their presence without rendering them (AC2/AC4).
 *
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 */

import semver from 'semver';

import { ENGINE_VERSION } from '@core-engine';

/**
 * The core-engine version the launcher is running.
 *
 * Re-exported from `@core-engine` so there is a single source of truth; the
 * compatibility check must consume this constant, never a hardcoded copy.
 */
export const DEFAULT_ENGINE_VERSION = ENGINE_VERSION;

/** One game entry in `<contentDir>/games/manifest.json`. */
export interface GameManifestEntry {
  /** Stable game identifier (also the artifact directory name). */
  readonly id: string;
  /** Phaser scene key the launcher registers the game's scene under. */
  readonly sceneKey: string;
  /** Display name shown in the Game Selector. */
  readonly title: string;
  /** Short description shown in the Game Selector. */
  readonly description: string;
  /** Optional relative path to a thumbnail inside the artifact directory. */
  readonly thumbnail?: string;
  /** Semver range of core-engine versions this game supports. */
  readonly coreEngineVersion: string;
  /** Relative path to the game's ESM entry module. */
  readonly entry: string;
}

/** Root document read from `<contentDir>/games/manifest.json`. */
export interface GameManifest {
  /** Manifest schema version. */
  readonly version: number;
  /** Game entries declared by the distribution operator. */
  readonly games: GameManifestEntry[];
}

/** Successful parse result. */
export interface GameManifestParseSuccess {
  readonly ok: true;
  readonly manifest: GameManifest;
}

/** Failed parse result — `errors` explains every problem found. */
export interface GameManifestParseFailure {
  readonly ok: false;
  readonly errors: string[];
}

/** Discriminated result of {@link parseGameManifest}. */
export type GameManifestParseResult =
  | GameManifestParseSuccess
  | GameManifestParseFailure;

/** An entry the launcher cannot run, with the reason it was rejected. */
export interface IncompatibleGame {
  readonly entry: GameManifestEntry;
  /** Human-readable reason naming the required range and launcher version. */
  readonly reason: string;
}

/** Result of {@link splitByCompatibility}. */
export interface CompatibilitySplit {
  readonly compatible: GameManifestEntry[];
  readonly incompatible: IncompatibleGame[];
}

/** Fields every entry must declare as a non-empty string. */
const REQUIRED_STRING_FIELDS = [
  'id',
  'sceneKey',
  'title',
  'description',
  'coreEngineVersion',
  'entry',
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

/**
 * Parse and validate a manifest document.
 *
 * Accepts either the raw JSON string (as read from disk / `fetch`) or an
 * already-parsed value. Never throws: malformed JSON, a wrong document shape,
 * missing fields, invalid semver ranges, and duplicate ids/sceneKeys are all
 * reported as `{ ok: false, errors }`.
 */
export function parseGameManifest(
  input: string | unknown,
): GameManifestParseResult {
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

  const rawGames = document.games;
  if (!Array.isArray(rawGames)) {
    errors.push('games: expected an array.');
    return { ok: false, errors };
  }

  const entries: GameManifestEntry[] = [];
  const seenIds = new Set<string>();
  const seenSceneKeys = new Set<string>();

  rawGames.forEach((rawEntry, index) => {
    const prefix = `games[${index}]`;
    const errorsBeforeEntry = errors.length;
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
      errors.push(`${prefix}: expected an object.`);
      return;
    }
    const game = rawEntry as Record<string, unknown>;

    for (const field of REQUIRED_STRING_FIELDS) {
      const fieldValue = game[field];
      if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
        errors.push(`${prefix}.${field}: expected a non-empty string.`);
      }
    }

    const coreEngineVersion = game.coreEngineVersion;
    if (
      typeof coreEngineVersion === 'string' &&
      coreEngineVersion.trim() !== '' &&
      semver.validRange(coreEngineVersion) === null
    ) {
      errors.push(
        `${prefix}.coreEngineVersion: "${coreEngineVersion}" is not a valid semver range.`,
      );
    }

    const id = game.id;
    if (typeof id === 'string' && id.trim() !== '') {
      if (seenIds.has(id)) {
        errors.push(`${prefix}.id: duplicate id "${id}".`);
      }
      seenIds.add(id);
    }

    const sceneKey = game.sceneKey;
    if (typeof sceneKey === 'string' && sceneKey.trim() !== '') {
      if (seenSceneKeys.has(sceneKey)) {
        errors.push(`${prefix}.sceneKey: duplicate sceneKey "${sceneKey}".`);
      }
      seenSceneKeys.add(sceneKey);
    }

    const thumbnail = game.thumbnail;
    if (
      thumbnail !== undefined &&
      (typeof thumbnail !== 'string' || thumbnail.trim() === '')
    ) {
      errors.push(`${prefix}.thumbnail: expected a non-empty string when present.`);
    }

    if (errors.length === errorsBeforeEntry) {
      entries.push({
        id: id as string,
        sceneKey: sceneKey as string,
        title: game.title as string,
        description: game.description as string,
        ...(typeof thumbnail === 'string' ? { thumbnail } : {}),
        coreEngineVersion: coreEngineVersion as string,
        entry: game.entry as string,
      });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    manifest: { version: version as number, games: entries },
  };
}

/**
 * Partition entries into those compatible with *engineVersion* and those
 * that are not. Each incompatible item carries a reason naming the game's
 * required range and the launcher version so the Game Selector can surface
 * e.g. "Incompatible game: Foo — requires core v^9.0.0 (launcher v0.1.0)".
 */
export function splitByCompatibility(
  entries: GameManifestEntry[],
  engineVersion: string = DEFAULT_ENGINE_VERSION,
): CompatibilitySplit {
  const compatible: GameManifestEntry[] = [];
  const incompatible: IncompatibleGame[] = [];

  for (const entry of entries) {
    if (semver.satisfies(engineVersion, entry.coreEngineVersion)) {
      compatible.push(entry);
    } else {
      incompatible.push({
        entry,
        reason:
          `requires core v${entry.coreEngineVersion} ` +
          `(launcher is v${engineVersion})`,
      });
    }
  }

  return { compatible, incompatible };
}
