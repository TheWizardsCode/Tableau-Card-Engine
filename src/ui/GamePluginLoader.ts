/**
 * Runtime game plugin loader (feature F4, CG-0MUG2ZK91003JCLC).
 *
 * Discovers compatible runtime games from `<contentDir>/games/manifest.json`,
 * dynamically imports each game's ESM entry point in the renderer, and returns
 * a merged, Phaser-ready catalogue. This is the heart of the Electron runtime
 * game plugin system (CG-0MTRO7VMI000F3A5):
 *
 *   - The launcher keeps its statically-registered catalogue; this loader
 *     *augments* it with games dropped into the content directory after the
 *     launcher was built (AC1).
 *   - Each game declares a `coreEngineVersion` range; incompatible games are
 *     reported to the caller (for the Game Selector notice) and never
 *     imported (AC2).
 *   - Thumbnails are resolved relative to the game's artifact directory via
 *     the scoped `tce-games://` scheme (AC3).
 *   - The loader never throws: a missing/malformed manifest, a failed import
 *     or a missing scene export is reported structurally so the launcher can
 *     degrade to its static catalogue (AC4).
 *
 * Every dependency on the environment is injected (`fetchManifest`,
 * `importer`) so the module is unit-testable without Electron, a browser or a
 * real network — see `tests/ui/game-plugin-loader.test.ts`.
 *
 * @see src/ui/game-manifest.ts — manifest parsing + compatibility split (F2)
 * @see src/ui/game-asset-url.ts — `tce-games://` asset URL builder (F3)
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 */

import type { GameEntry } from './GameSelectorScene';
import { resolveGameAssetUrl } from './game-asset-url';
import {
  DEFAULT_ENGINE_VERSION,
  parseGameManifest,
  splitByCompatibility,
  type GameManifestEntry,
  type IncompatibleGame,
} from './game-manifest';

/** Subdirectory of the content directory that holds runtime game artifacts. */
export const GAMES_DIRNAME = 'games';

/** Relative path, under {@link GAMES_DIRNAME}, of the manifest document. */
export const MANIFEST_FILENAME = 'manifest.json';

/**
 * Identifier used on {@link PluginLoadError}s that describe the manifest
 * document itself rather than one game.
 */
export const MANIFEST_ERROR_ID = '<manifest>';

/**
 * A constructable Phaser scene class exported by a game artifact.
 *
 * Structural on purpose: the loader must not import Phaser at runtime (it is
 * loaded in a plain Node/Vitest context in tests), so callers register the
 * class with `scene.add(key, Class)` themselves.
 */
export type GameSceneConstructor = new (...args: never[]) => object;

/** Metadata a game artifact may export alongside its scene class. */
export interface GameInfo {
  readonly id?: string;
  readonly sceneKey?: string;
  readonly title?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

/** A compatible runtime game that was discovered and imported successfully. */
export interface LoadedGame {
  /** Ready-to-merge selector entry (thumbnail already `tce-games://`). */
  readonly entry: GameEntry;
  /** The scene class to register with Phaser under `entry.sceneKey`. */
  readonly scene: GameSceneConstructor;
  /** The manifest entry that produced this game. */
  readonly manifest: GameManifestEntry;
  /** The artifact's optional `GAME_INFO` metadata export. */
  readonly info: GameInfo | undefined;
}

/** A game (or the manifest) that could not be loaded, with the reason. */
export interface PluginLoadError {
  /** Game id from the manifest; {@link MANIFEST_ERROR_ID} for the document. */
  readonly id: string;
  /** Human-readable, actionable reason. */
  readonly reason: string;
}

/**
 * Reads the raw manifest text from a URL.
 *
 * Injected so tests (and Electron) can supply their own transport. The default
 * uses the renderer's global `fetch`.
 */
export type ManifestFetcher = (url: string) => Promise<string>;

/**
 * Dynamically imports an ESM module from a URL.
 *
 * Injected so tests can assert call counts and URLs, and so an alternative
 * transport can be supplied.
 */
export type GameModuleImporter = (url: string) => Promise<unknown>;

/** Options accepted by {@link loadGamePlugins}. */
export interface GamePluginLoaderOptions {
  /**
   * The content directory the launcher resolved. Either a URL string
   * (`file://…`, `https://…`) or an absolute filesystem path.
   */
  readonly contentDir: string;
  /** The launcher's core-engine version; defaults to {@link DEFAULT_ENGINE_VERSION}. */
  readonly engineVersion?: string;
  /**
   * Scene keys already registered by the static catalogue. A dynamic game
   * whose `sceneKey` collides is skipped (static wins) and reported in
   * {@link GamePluginLoadResult.skipped}.
   */
  readonly staticSceneKeys?: Iterable<string>;
  /** Manifest transport; defaults to `fetch`. */
  readonly fetchManifest?: ManifestFetcher;
  /** Module loader; defaults to dynamic `import()`. */
  readonly importer?: GameModuleImporter;
}

/** Outcome of {@link loadGamePlugins}. Never thrown — always returned. */
export interface GamePluginLoadResult {
  /** Compatible games that imported successfully, ready to merge. */
  readonly games: LoadedGame[];
  /** Compatible-range failures, for the Game Selector's incompatibility notice. */
  readonly incompatible: IncompatibleGame[];
  /** Per-game load failures (bad import / missing scene export). */
  readonly errors: PluginLoadError[];
  /** Games that were valid but skipped (e.g. a static `sceneKey` collision). */
  readonly skipped: PluginLoadError[];
}

/** Default manifest transport: the renderer's global `fetch`. */
async function defaultFetchManifest(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

/**
 * Default module loader. `@vite-ignore` keeps Vite from trying to statically
 * analyse the specifier: the URL is resolved at runtime (including under the
 * Electron renderer's `file://` protocol).
 */
const defaultImporter: GameModuleImporter = (url) =>
  import(/* @vite-ignore */ url);

/**
 * Turn a content directory (URL string or filesystem path) into a base URL
 * safe for relative resolution. Ensures a trailing slash so
 * `new URL('games/…', base)` appends to — rather than replaces — the final
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

/** Resolve `<contentDir>/games/<id>/` as a base for the game's entry module. */
function resolveGameDirUrl(base: URL, gameId: string): URL {
  return new URL(`${GAMES_DIRNAME}/${gameId}/`, base);
}

/** Extract the exported scene class (by `sceneKey`, else `default`). */
function findSceneClass(
  module: unknown,
  sceneKey: string,
): GameSceneConstructor | undefined {
  if (typeof module !== 'object' || module === null) return undefined;
  const record = module as Record<string, unknown>;
  const named = record[sceneKey];
  if (typeof named === 'function') return named as GameSceneConstructor;
  const fallback = record.default;
  if (typeof fallback === 'function') return fallback as GameSceneConstructor;
  return undefined;
}

/** Extract the optional `GAME_INFO` metadata export. */
function findGameInfo(module: unknown): GameInfo | undefined {
  if (typeof module !== 'object' || module === null) return undefined;
  const info = (module as Record<string, unknown>).GAME_INFO;
  if (typeof info !== 'object' || info === null) return undefined;
  return info as GameInfo;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Discover, import and validate runtime games declared in the launcher's
 * content directory.
 *
 * Never rejects: every failure is captured in the returned
 * {@link GamePluginLoadResult} so the caller can continue booting with its
 * statically-registered catalogue.
 */
export async function loadGamePlugins(
  options: GamePluginLoaderOptions,
): Promise<GamePluginLoadResult> {
  const games: LoadedGame[] = [];
  const incompatible: IncompatibleGame[] = [];
  const errors: PluginLoadError[] = [];
  const skipped: PluginLoadError[] = [];

  const base = resolveContentBaseUrl(options.contentDir);
  const manifestUrl = new URL(
    `${GAMES_DIRNAME}/${MANIFEST_FILENAME}`,
    base,
  ).href;

  let manifestText: string;
  try {
    manifestText = await (options.fetchManifest ?? defaultFetchManifest)(
      manifestUrl,
    );
  } catch (error) {
    errors.push({
      id: MANIFEST_ERROR_ID,
      reason: `Could not read ${manifestUrl}: ${errorMessage(error)}`,
    });
    return { games, incompatible, errors, skipped };
  }

  const parsed = parseGameManifest(manifestText);
  if (!parsed.ok) {
    errors.push({
      id: MANIFEST_ERROR_ID,
      reason: `Invalid manifest at ${manifestUrl}: ${parsed.errors.join('; ')}`,
    });
    return { games, incompatible, errors, skipped };
  }

  const engineVersion = options.engineVersion ?? DEFAULT_ENGINE_VERSION;
  const split = splitByCompatibility(parsed.manifest.games, engineVersion);
  incompatible.push(...split.incompatible);

  const staticKeys = new Set(options.staticSceneKeys ?? []);
  const seenSceneKeys = new Set<string>();
  const importer = options.importer ?? defaultImporter;

  for (const entry of split.compatible) {
    if (staticKeys.has(entry.sceneKey)) {
      skipped.push({
        id: entry.id,
        reason: `sceneKey "${entry.sceneKey}" is already registered by a static game.`,
      });
      continue;
    }
    if (seenSceneKeys.has(entry.sceneKey)) {
      skipped.push({
        id: entry.id,
        reason: `sceneKey "${entry.sceneKey}" is already registered by another runtime game.`,
      });
      continue;
    }

    let thumbnail: string | undefined;
    if (entry.thumbnail !== undefined) {
      try {
        thumbnail = resolveGameAssetUrl(entry.id, entry.thumbnail);
      } catch (error) {
        errors.push({
          id: entry.id,
          reason: `Invalid thumbnail "${entry.thumbnail}": ${errorMessage(error)}`,
        });
        continue;
      }
    }

    const gameDirUrl = resolveGameDirUrl(base, entry.id);
    let entryUrl: URL;
    try {
      entryUrl = new URL(entry.entry, gameDirUrl);
      if (!entryUrl.href.startsWith(gameDirUrl.href)) {
        throw new Error('entry path escapes the game directory');
      }
    } catch (error) {
      errors.push({
        id: entry.id,
        reason: `Invalid entry "${entry.entry}": ${errorMessage(error)}`,
      });
      continue;
    }

    let module: unknown;
    try {
      module = await importer(entryUrl.href);
    } catch (error) {
      errors.push({
        id: entry.id,
        reason: `Failed to import "${entry.entry}": ${errorMessage(error)}`,
      });
      continue;
    }

    const scene = findSceneClass(module, entry.sceneKey);
    if (!scene) {
      errors.push({
        id: entry.id,
        reason:
          `Entry "${entry.entry}" does not export a scene class named ` +
          `"${entry.sceneKey}" (or a default export).`,
      });
      continue;
    }

    seenSceneKeys.add(entry.sceneKey);
    games.push({
      entry: {
        sceneKey: entry.sceneKey,
        title: entry.title,
        description: entry.description,
        // The selector activates this id before starting the scene so the
        // game's own assets resolve through `tce-games://<id>/…`
        // (CG-0MUVJWSZO004KZTA).
        runtimeGameId: entry.id,
        ...(thumbnail !== undefined ? { thumbnail } : {}),
      },
      scene,
      manifest: entry,
      info: findGameInfo(module),
    });
  }

  return { games, incompatible, errors, skipped };
}

export type { GameManifestEntry, IncompatibleGame };
