/**
 * Electron launcher boot wiring for runtime game plugins
 * (feature F6, CG-0MUG2ZLGI006Y20G).
 *
 * `main.ts` uses these helpers to discover runtime games before Phaser boots,
 * merge them with the statically-registered catalogue, and register their
 * scenes. Everything Electron- or window-specific is behind a small seam so
 * the merge/degradation logic is unit-testable in Node:
 *
 *   - {@link discoverRuntimeGames} — resolve the launcher's content directory,
 *     call the plugin loader, and log failures without ever throwing.
 *   - {@link buildGameBootPayload} — pure merge of the static catalogue with
 *     the loader result.
 *   - {@link readContentDirFromWindow} — read `window.tce.contentDir`.
 *
 * Graceful degradation (AC4): no `contentDir` (browser / core-only build), a
 * missing/malformed manifest, or a partially-failing loader all leave the
 * launcher booting with the static catalogue — there is no unhandled rejection
 * and no blank screen.
 *
 * @see src/ui/GamePluginLoader.ts — the loader itself (F4)
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 */

import type { GameEntry } from './GameSelectorScene';
import {
  loadGamePlugins,
  type GamePluginLoaderOptions,
  type GamePluginLoadResult,
} from './GamePluginLoader';
import type { IncompatibleGame } from './game-manifest';

/** A Phaser scene class that can be registered with the game config. */
export type BootSceneClass = new (...args: never[]) => object;

/** The merged catalogue + scene list the launcher boots with. */
export interface GameBootPayload {
  /** Static entries followed by successfully-loaded runtime entries. */
  readonly games: GameEntry[];
  /** Static scene classes followed by runtime scene classes. */
  readonly scenes: BootSceneClass[];
  /** Runtime games that were discovered but are incompatible. */
  readonly incompatible: IncompatibleGame[];
  /** Number of runtime games merged in (0 when none loaded). */
  readonly pluginsLoaded: number;
}

export interface BuildGameBootPayloadOptions {
  /** Static catalogue from `virtual:game-registry`. */
  readonly staticGames: readonly GameEntry[];
  /** Static scene classes from `virtual:game-registry`. */
  readonly staticScenes: readonly BootSceneClass[];
  /** Loader result, or `null` when runtime discovery was skipped/failed. */
  readonly pluginResult: GamePluginLoadResult | null;
}

/**
 * Merge the static catalogue with a plugin-loader result.
 *
 * Pure and total: a `null` result simply yields the static catalogue with no
 * incompatible games, so callers can use it unconditionally.
 */
export function buildGameBootPayload(
  options: BuildGameBootPayloadOptions,
): GameBootPayload {
  const { staticGames, staticScenes, pluginResult } = options;
  const loaded = pluginResult?.games ?? [];

  return {
    games: [...staticGames, ...loaded.map((game) => game.entry)],
    scenes: [...staticScenes, ...loaded.map((game) => game.scene)],
    incompatible: pluginResult ? [...pluginResult.incompatible] : [],
    pluginsLoaded: loaded.length,
  };
}

/** Minimal logger seam (defaults to `console`). */
export interface GamePluginBootLogger {
  error(message: string, ...args: unknown[]): void;
}

/** The subset of the preload bridge the boot path reads. */
interface TceWindow {
  tce?: { contentDir?: string | null };
}

/**
 * Read the launcher's content directory from the preload bridge.
 *
 * Returns `null` in a plain browser (no bridge) or when the bridge omits the
 * directory — callers must skip runtime discovery in that case.
 */
export function readContentDirFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  const tce = (window as unknown as TceWindow).tce;
  return tce?.contentDir ?? null;
}

/** Injectable loader signature (defaults to {@link loadGamePlugins}). */
export type GamePluginLoaderFn = (
  options: GamePluginLoaderOptions,
) => Promise<GamePluginLoadResult>;

export interface DiscoverRuntimeGamesOptions {
  /** Launcher content directory; falsy skips discovery entirely. */
  readonly contentDir?: string | null;
  /** Launcher core-engine version passed to the loader. */
  readonly engineVersion?: string;
  /** Override the loader (tests). */
  readonly loader?: GamePluginLoaderFn;
  /** Error sink (tests); defaults to `console`. */
  readonly logger?: GamePluginBootLogger;
}

/**
 * Discover runtime games, or return `null` when discovery does not apply.
 *
 * Returns `null` immediately when there is no content directory (browser /
 * core-only build). Otherwise it runs the loader and logs every structured
 * error it reports. It never rejects: an unexpected loader throw is logged and
 * converted into an empty result so the launcher still boots.
 */
export async function discoverRuntimeGames(
  options: DiscoverRuntimeGamesOptions = {},
): Promise<GamePluginLoadResult | null> {
  const { contentDir } = options;
  if (!contentDir) return null;

  const logger = options.logger ?? console;
  const loader = options.loader ?? loadGamePlugins;

  try {
    const result = await loader({
      contentDir,
      ...(options.engineVersion !== undefined
        ? { engineVersion: options.engineVersion }
        : {}),
    });

    for (const error of result.errors) {
      logger.error(`[runtime-plugins] ${error.id}: ${error.reason}`);
    }

    return result;
  } catch (error) {
    logger.error(
      '[runtime-plugins] Unexpected loader failure — continuing with the static catalogue.',
      error,
    );
    return {
      games: [],
      incompatible: [],
      errors: [
        {
          id: '<loader>',
          reason: error instanceof Error ? error.message : String(error),
        },
      ],
      skipped: [],
    };
  }
}
