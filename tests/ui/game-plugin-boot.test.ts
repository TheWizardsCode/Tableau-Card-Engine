/**
 * Unit tests for the Electron launcher boot wiring
 * (`src/ui/game-plugin-boot.ts`, feature F6 / CG-0MUG2ZLGI006Y20G).
 *
 * The helpers are deliberately Electron-free: `buildGameBootPayload` is a pure
 * merge, and `discoverRuntimeGames` takes an injectable loader/logger. The
 * invariants under test:
 *
 *  - with no content directory (browser / core-only build) runtime discovery
 *    is skipped and the catalogue is exactly the static one;
 *  - a successful loader result is merged (games + scenes) and incompatible
 *    games are forwarded to the selector;
 *  - any loader failure — structured or thrown — degrades to the static
 *    catalogue without rejecting.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  buildGameBootPayload,
  discoverRuntimeGames,
  readContentDirFromWindow,
  type BootSceneClass,
} from '../../src/ui/game-plugin-boot';
import type { GameEntry } from '../../src/ui/GameSelectorScene';
import type {
  GamePluginLoadResult,
  LoadedGame,
} from '../../src/ui/GamePluginLoader';
import type { IncompatibleGame } from '../../src/ui/game-manifest';

// ── Test fixtures ──────────────────────────────────────────

class StaticScene {}
class DynamicScene {}

const STATIC_GAMES: GameEntry[] = [
  { sceneKey: 'StaticScene', title: 'Static Game', description: 'static' },
];
const STATIC_SCENES: BootSceneClass[] = [StaticScene];

function loadedGame(
  id: string,
  sceneKey: string,
  scene: BootSceneClass = DynamicScene,
): LoadedGame {
  return {
    entry: {
      sceneKey,
      title: `Dynamic ${id}`,
      description: 'dynamic',
      runtimeGameId: id,
      thumbnail: `tce-games://${id}/assets/thumbnail.png`,
    },
    scene,
    manifest: {
      id,
      sceneKey,
      title: `Dynamic ${id}`,
      description: 'dynamic',
      coreEngineVersion: '^0.1.0',
      entry: 'entry.js',
    },
    info: undefined,
  };
}

const INCOMPATIBLE: IncompatibleGame = {
  entry: {
    id: 'future',
    sceneKey: 'FutureScene',
    title: 'Future Game',
    description: 'needs a newer core',
    coreEngineVersion: '^9.0.0',
    entry: 'entry.js',
  },
  reason: 'requires core v^9.0.0 (launcher is v0.1.0)',
};

function emptyResult(): GamePluginLoadResult {
  return { games: [], incompatible: [], errors: [], skipped: [] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── buildGameBootPayload ───────────────────────────────────

describe('buildGameBootPayload', () => {
  it('returns the static catalogue unchanged when discovery was skipped', () => {
    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: STATIC_SCENES,
      pluginResult: null,
    });

    expect(payload.games).toEqual(STATIC_GAMES);
    expect(payload.scenes).toEqual([StaticScene]);
    expect(payload.incompatible).toEqual([]);
    expect(payload.pluginsLoaded).toBe(0);
  });

  it('appends dynamic games and scenes after the static ones', () => {
    const pluginResult: GamePluginLoadResult = {
      games: [
        loadedGame('game-a', 'SceneA'),
        loadedGame('game-b', 'SceneB'),
      ],
      incompatible: [INCOMPATIBLE],
      errors: [],
      skipped: [],
    };

    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: STATIC_SCENES,
      pluginResult,
    });

    expect(payload.games.map((game) => game.sceneKey)).toEqual([
      'StaticScene',
      'SceneA',
      'SceneB',
    ]);
    expect(payload.scenes).toEqual([StaticScene, DynamicScene, DynamicScene]);
    // Runtime entries keep the artifact id the selector activates for asset
    // resolution; static entries have none.
    expect(payload.games.map((game) => game.runtimeGameId)).toEqual([
      undefined,
      'game-a',
      'game-b',
    ]);
    expect(payload.incompatible).toEqual([INCOMPATIBLE]);
    expect(payload.pluginsLoaded).toBe(2);
  });

  it('does not mutate the supplied arrays', () => {
    const staticGames = [...STATIC_GAMES];
    buildGameBootPayload({
      staticGames,
      staticScenes: STATIC_SCENES,
      pluginResult: { games: [loadedGame('g', 'G')], incompatible: [], errors: [], skipped: [] },
    });

    expect(staticGames).toHaveLength(1);
    expect(STATIC_SCENES).toHaveLength(1);
  });
});

// ── discoverRuntimeGames ───────────────────────────────────

describe('discoverRuntimeGames', () => {
  it('skips discovery (and never calls the loader) without a content dir', async () => {
    for (const contentDir of [undefined, null, '']) {
      const loader = vi.fn(async () => emptyResult());
      const result = await discoverRuntimeGames({ contentDir, loader });

      expect(result).toBeNull();
      expect(loader).not.toHaveBeenCalled();
    }
  });

  it('passes the content dir and engine version to the loader', async () => {
    const loader = vi.fn(async () => emptyResult());

    await discoverRuntimeGames({
      contentDir: '/tmp/content',
      engineVersion: '0.1.0',
      loader,
    });

    expect(loader).toHaveBeenCalledWith({
      contentDir: '/tmp/content',
      engineVersion: '0.1.0',
    });
  });

  it('returns the loader result and logs each structured error', async () => {
    const result: GamePluginLoadResult = {
      games: [loadedGame('ok', 'OkScene')],
      incompatible: [],
      errors: [{ id: 'broken', reason: 'boom' }],
      skipped: [],
    };
    const loader = vi.fn(async () => result);
    const logger = { error: vi.fn() };

    const discovered = await discoverRuntimeGames({
      contentDir: '/tmp/content',
      loader,
      logger,
    });

    expect(discovered).toEqual(result);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('broken'),
    );
    expect(logger.error.mock.calls[0][0]).toContain('boom');
  });

  it('degrades to an empty result (and logs) when the loader throws', async () => {
    const loader = vi.fn(async () => {
      throw new Error('unexpected');
    });
    const logger = { error: vi.fn() };

    const discovered = await discoverRuntimeGames({
      contentDir: '/tmp/content',
      loader,
      logger,
    });

    expect(discovered).not.toBeNull();
    expect(discovered!.games).toEqual([]);
    expect(discovered!.incompatible).toEqual([]);
    expect(discovered!.errors[0].reason).toContain('unexpected');
    expect(logger.error).toHaveBeenCalled();
  });
});

// ── readContentDirFromWindow ───────────────────────────────

describe('readContentDirFromWindow', () => {
  it('returns null when there is no window (Node / SSR)', () => {
    expect(typeof window).toBe('undefined');
    expect(readContentDirFromWindow()).toBeNull();
  });

  it('returns the content dir exposed by the preload bridge', () => {
    vi.stubGlobal('window', { tce: { contentDir: '/resolved/content' } });
    expect(readContentDirFromWindow()).toBe('/resolved/content');
  });

  it('returns null when the bridge omits the content dir', () => {
    vi.stubGlobal('window', { tce: {} });
    expect(readContentDirFromWindow()).toBeNull();
  });

  it('returns null when there is no bridge at all (plain browser)', () => {
    vi.stubGlobal('window', {});
    expect(readContentDirFromWindow()).toBeNull();
  });
});

// ── Integration: merge from a real loader result ───────────

describe('discoverRuntimeGames + buildGameBootPayload (integration)', () => {
  it('produces a merged catalogue from an injected loader result', async () => {
    const loader = vi.fn(async () => ({
      games: [loadedGame('game-a', 'SceneA')],
      incompatible: [INCOMPATIBLE],
      errors: [],
      skipped: [],
    }));

    const pluginResult = await discoverRuntimeGames({
      contentDir: '/tmp/content',
      loader,
      logger: { error: vi.fn() },
    });

    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: STATIC_SCENES,
      pluginResult,
    });

    expect(payload.pluginsLoaded).toBe(1);
    expect(payload.games.map((game) => game.sceneKey)).toEqual([
      'StaticScene',
      'SceneA',
    ]);
    expect(payload.incompatible).toEqual([INCOMPATIBLE]);
  });
});
