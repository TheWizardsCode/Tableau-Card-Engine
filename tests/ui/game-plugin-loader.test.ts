/**
 * Unit tests for the runtime game plugin loader
 * (`src/ui/GamePluginLoader.ts`, feature F4 / CG-0MUG2ZK91003JCLC).
 *
 * The loader reads `<contentDir>/games/manifest.json`, dynamically imports each
 * compatible game's ESM entry, and returns a merged, Phaser-ready catalogue.
 * The invariants under test:
 *
 *  - a valid artifact loads (real dynamic import of the F1 fixture);
 *  - incompatible games are reported and never imported;
 *  - the manifest and each failure degrade structurally — the function never
 *    throws;
 *  - a dynamic `sceneKey` colliding with the static catalogue is skipped
 *    (static wins);
 *  - thumbnail URLs are resolved to the game's own artifact directory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadGamePlugins,
  GAMES_DIRNAME,
  MANIFEST_FILENAME,
  MANIFEST_ERROR_ID,
} from '../../src/ui/GamePluginLoader';
import { GAME_ASSET_URL_SCHEME } from '../../src/ui/game-asset-url';
import { DEFAULT_ENGINE_VERSION } from '../../src/ui/game-manifest';
import {
  makeManifestJson,
  PLUGIN_GAME_DIR,
} from '../fixtures/plugin-game/helpers';

let contentDir: string;

/** Create an isolated content directory for a test. */
function createContentDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-plugin-loader-'));
  // Node resolves `.js` as ESM only when the nearest package.json says so; the
  // temp dir has no parent package.json, so mark it explicitly.
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}', 'utf-8');
  return dir;
}

/** Install the F1 fixture artifact under `<contentDir>/games/<id>/`. */
function installFixtureGame(dir: string, id = 'fixture-game'): void {
  const gameDir = path.join(dir, GAMES_DIRNAME, id);
  fs.mkdirSync(path.join(gameDir, 'assets'), { recursive: true });
  fs.copyFileSync(
    path.join(PLUGIN_GAME_DIR, 'entry.js'),
    path.join(gameDir, 'entry.js'),
  );
  fs.copyFileSync(
    path.join(PLUGIN_GAME_DIR, 'assets', 'thumbnail.png'),
    path.join(gameDir, 'assets', 'thumbnail.png'),
  );
}

/** Write a manifest document to `<contentDir>/games/manifest.json`. */
function writeManifest(dir: string, json: string): void {
  const gamesDir = path.join(dir, GAMES_DIRNAME);
  fs.mkdirSync(gamesDir, { recursive: true });
  fs.writeFileSync(path.join(gamesDir, MANIFEST_FILENAME), json, 'utf-8');
}

/** Injected manifest transport that reads from the temp content directory. */
function diskManifestFetcher(dir: string) {
  return async (): Promise<string> =>
    fs.readFileSync(path.join(dir, GAMES_DIRNAME, MANIFEST_FILENAME), 'utf-8');
}

/** A `file://` base URL for the temp content directory (trailing slash). */
function contentUrl(dir: string): string {
  return pathToFileURL(`${dir}${path.sep}`).href;
}

beforeEach(() => {
  contentDir = createContentDir();
});

afterEach(() => {
  fs.rmSync(contentDir, { recursive: true, force: true });
});

describe('loadGamePlugins — successful discovery', () => {
  it('loads the fixture artifact through a real dynamic import', async () => {
    installFixtureGame(contentDir);
    writeManifest(contentDir, makeManifestJson([{}]));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: diskManifestFetcher(contentDir),
    });

    expect(result.errors).toEqual([]);
    expect(result.incompatible).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.games).toHaveLength(1);

    const loaded = result.games[0];
    expect(loaded.manifest.id).toBe('fixture-game');
    expect(loaded.entry).toEqual({
      sceneKey: 'FixtureGameScene',
      title: 'Fixture Game',
      description: 'Synthetic runtime game used by plugin loader tests.',
      runtimeGameId: 'fixture-game',
      thumbnail: `${GAME_ASSET_URL_SCHEME}://fixture-game/assets/thumbnail.png`,
    });
    expect(typeof loaded.scene).toBe('function');
    const Scene = loaded.scene as unknown as new () => { sceneKey: string };
    expect(new Scene().sceneKey).toBe('FixtureGameScene');
    expect(loaded.info).toMatchObject({ id: 'fixture-game' });
  });

  it('resolves each entry against <contentDir>/games/<id>/', async () => {
    const json = makeManifestJson([{ id: 'my-game', sceneKey: 'MyScene' }]);
    const importer = vi.fn(async () => ({ MyScene: class {} }));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
    });

    expect(result.games).toHaveLength(1);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith(
      new URL(`${GAMES_DIRNAME}/my-game/entry.js`, contentUrl(contentDir)).href,
    );
  });

  it('accepts a plain filesystem path as the content directory', async () => {
    const json = makeManifestJson([{ id: 'path-game', sceneKey: 'PathScene' }]);
    const importer = vi.fn(async (url: string) => {
      expect(url.startsWith('file://')).toBe(true);
      expect(url.endsWith(`/${GAMES_DIRNAME}/path-game/entry.js`)).toBe(true);
      return { PathScene: class {} };
    });

    const result = await loadGamePlugins({
      contentDir,
      fetchManifest: async () => json,
      importer,
    });

    expect(result.games).toHaveLength(1);
  });

  it('omits the thumbnail when the entry declares none', async () => {
    const json = makeManifestJson([
      {
        id: 'nothumb',
        sceneKey: 'NoThumbScene',
        thumbnail: undefined as unknown as string,
      },
    ]);

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer: async () => ({ NoThumbScene: class {} }),
    });

    expect(result.games).toHaveLength(1);
    expect(result.games[0].entry.thumbnail).toBeUndefined();
  });
});

describe('loadGamePlugins — version compatibility', () => {
  it('splits compatible and incompatible games, importing only compatible ones', async () => {
    const json = makeManifestJson([
      { id: 'good', sceneKey: 'GoodScene' },
      { id: 'future', sceneKey: 'FutureScene', coreEngineVersion: '^9.0.0' },
    ]);
    const importer = vi.fn(async () => ({ GoodScene: class {} }));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
    });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(result.games.map((game) => game.manifest.id)).toEqual(['good']);
    expect(result.incompatible).toHaveLength(1);
    expect(result.incompatible[0].entry.id).toBe('future');
    expect(result.incompatible[0].reason).toContain('^9.0.0');
    expect(result.incompatible[0].reason).toContain(DEFAULT_ENGINE_VERSION);
  });

  it('does not import any game when none are compatible', async () => {
    const json = makeManifestJson([
      { id: 'future', sceneKey: 'FutureScene', coreEngineVersion: '^9.0.0' },
    ]);
    const importer = vi.fn(async () => ({}));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
    });

    expect(importer).not.toHaveBeenCalled();
    expect(result.games).toEqual([]);
    expect(result.incompatible).toHaveLength(1);
  });

  it('honours a supplied engineVersion', async () => {
    const json = makeManifestJson([
      { id: 'future', sceneKey: 'FutureScene', coreEngineVersion: '^0.2.0' },
    ]);

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      engineVersion: '0.2.5',
      fetchManifest: async () => json,
      importer: async () => ({ FutureScene: class {} }),
    });

    expect(result.incompatible).toEqual([]);
    expect(result.games).toHaveLength(1);
  });
});

describe('loadGamePlugins — graceful degradation', () => {
  it('reports a missing manifest without throwing', async () => {
    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => {
        throw new Error('ENOENT: no such file');
      },
    });

    expect(result.games).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe(MANIFEST_ERROR_ID);
    expect(result.errors[0].reason).toContain('ENOENT');
  });

  it('reports a malformed manifest without throwing', async () => {
    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => '{ "version": 1, "games": [ }',
    });

    expect(result.games).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe(MANIFEST_ERROR_ID);
    expect(result.errors[0].reason).toMatch(/Invalid manifest/i);
  });

  it('captures a failed import without preventing other games loading', async () => {
    const json = makeManifestJson([
      { id: 'broken', sceneKey: 'BrokenScene' },
      { id: 'ok', sceneKey: 'OkScene' },
    ]);
    const importer = vi.fn(async (url: string) => {
      if (url.includes('broken')) throw new Error('boom');
      return { OkScene: class {} };
    });

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
    });

    expect(result.games.map((game) => game.manifest.id)).toEqual(['ok']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe('broken');
    expect(result.errors[0].reason).toContain('boom');
  });

  it('reports a module without the declared scene export', async () => {
    const json = makeManifestJson([
      { id: 'no-scene', sceneKey: 'ExpectedScene' },
    ]);

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer: async () => ({ somethingElse: 1 }),
    });

    expect(result.games).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe('no-scene');
    expect(result.errors[0].reason).toContain('ExpectedScene');
  });

  it('falls back to the module default export for the scene class', async () => {
    const json = makeManifestJson([
      { id: 'default-scene', sceneKey: 'DefaultScene' },
    ]);

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer: async () => ({ default: class {} }),
    });

    expect(result.games).toHaveLength(1);
    expect(typeof result.games[0].scene).toBe('function');
  });

  it('rejects an entry path that escapes the game directory', async () => {
    const json = makeManifestJson([
      { id: 'escape', sceneKey: 'EscapeScene', entry: '../../evil.js' },
    ]);
    const importer = vi.fn(async () => ({ EscapeScene: class {} }));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
    });

    expect(result.games).toEqual([]);
    expect(result.errors[0].id).toBe('escape');
    expect(importer).not.toHaveBeenCalled();
  });

  it('reports an invalid thumbnail path instead of producing an entry', async () => {
    const json = makeManifestJson([
      { id: 'escape', sceneKey: 'EscapeScene', thumbnail: '../secret.png' },
    ]);
    const importer = vi.fn(async () => ({ EscapeScene: class {} }));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
    });

    expect(result.games).toEqual([]);
    expect(result.errors[0].id).toBe('escape');
    expect(importer).not.toHaveBeenCalled();
  });
});

describe('loadGamePlugins — static collision handling', () => {
  it('skips a dynamic game whose sceneKey collides with the static catalogue', async () => {
    const json = makeManifestJson([
      { id: 'dup', sceneKey: 'SharedScene' },
    ]);
    const importer = vi.fn(async () => ({ SharedScene: class {} }));

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer,
      staticSceneKeys: ['SharedScene'],
    });

    expect(result.games).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe('dup');
    expect(result.skipped[0].reason).toContain('SharedScene');
    expect(importer).not.toHaveBeenCalled();
  });

  it('does not skip a dynamic game when the static catalogue does not collide', async () => {
    const json = makeManifestJson([
      { id: 'ok', sceneKey: 'OkScene' },
    ]);

    const result = await loadGamePlugins({
      contentDir: contentUrl(contentDir),
      fetchManifest: async () => json,
      importer: async () => ({ OkScene: class {} }),
      staticSceneKeys: ['OtherScene'],
    });

    expect(result.skipped).toEqual([]);
    expect(result.games).toHaveLength(1);
  });
});
