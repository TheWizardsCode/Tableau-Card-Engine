/**
 * End-to-end verification of the runtime game plugin flow
 * (`tests/ui/game-plugin-e2e.test.ts`, feature F8 / CG-0MUG2ZMPA002BBXM).
 *
 * Exercises the complete chain without Electron:
 *
 *   build-game-artifact (F7)  →  games/manifest.json + games/<id>/entry.js
 *        ↓
 *   discoverRuntimeGames + loadGamePlugins (F4/F6)  →  merged catalogue
 *        ↓
 *   buildGameBootPayload (F6)  →  scenes to register + incompatible notice
 *
 * Three scenarios mirror the packaged runbook
 * (`docs/dev/runtime-game-plugins-runbook.md`):
 *   1. a compatible artifact loads and is merged into the catalogue;
 *   2. an incompatible artifact is hidden but reported;
 *   3. a missing/malformed manifest degrades to the static catalogue.
 *
 * The importer is injected (a "stub host") because a full Electron launch is
 * impractical under Vitest; the built fixture scene is dependency-free so the
 * real `entry.js` can be imported to prove the builder↔loader contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildGameArtifact } from '../../scripts/build-game-artifact.mjs';
import {
  buildGameBootPayload,
  discoverRuntimeGames,
} from '../../src/ui/game-plugin-boot';
import { loadGamePlugins } from '../../src/ui/GamePluginLoader';
import { handleGameAssetRequest } from '../../electron/game-protocol.js';
import type { GameEntry } from '../../src/ui/GameSelectorScene';

const GAME_ID = 'e2e-game';
const SCENE_CLASS = 'E2eGameScene';

/** Dependency-free scene so the emitted `entry.js` imports cleanly in Node. */
const SCENE_SOURCE = `export const GAME_INFO = {
  sceneKey: '${SCENE_CLASS}',
  title: 'E2E Game',
  description: 'A synthetic runtime game for end-to-end verification.',
  thumbnail: 'games/${GAME_ID}/thumbnail',
};

export class ${SCENE_CLASS} {
  create() {
    return 'created';
  }
}
`;

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

/** Distinctive bytes so the protocol test can prove the artifact copy is served. */
const WAV_BYTES = Buffer.from('RIFF-e2e-game-audio');

const STATIC_GAMES: GameEntry[] = [
  { sceneKey: 'StaticScene', title: 'Static Game', description: 'static' },
];

let root: string;
let fixtureRepo: string;
let contentDir: string;

function createFixture(): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-plugin-e2e-'));
  // Make the (temp) tree ESM so the emitted `entry.js` is importable.
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fixtureRepo = path.join(root, 'fixture-repo');
  contentDir = path.join(root, 'content');

  const gameDir = path.join(fixtureRepo, 'e2e-game');
  const sceneDir = path.join(gameDir, 'src', 'scenes');
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(path.join(sceneDir, `${SCENE_CLASS}.ts`), SCENE_SOURCE);

  const thumbDir = path.join(gameDir, 'public', 'assets', 'games', GAME_ID);
  fs.mkdirSync(thumbDir, { recursive: true });
  fs.writeFileSync(path.join(thumbDir, 'thumbnail.png'), PNG_BYTES);

  // Game-owned audio, packaged into the artifact and served via tce-games://.
  const audioDir = path.join(gameDir, 'public', 'assets', 'audio', GAME_ID);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(path.join(audioDir, 'card-draw.wav'), WAV_BYTES);
}

function fixtureConfig() {
  return {
    games: [
      {
        id: GAME_ID,
        path: path.join(fixtureRepo, 'e2e-game'),
        scenePath: `src/scenes/${SCENE_CLASS}.ts`,
      },
    ],
  };
}

/** Build the artifact into `<contentDir>/games/` and return its manifest path. */
async function buildIntoContentDir(coreEngineVersion?: string): Promise<string> {
  const result = await buildGameArtifact({
    gameId: GAME_ID,
    projectRoot: fixtureRepo,
    config: fixtureConfig(),
    outRoot: path.join(contentDir, 'games'),
    ...(coreEngineVersion ? { coreEngineVersion } : {}),
  });
  return result.manifestPath;
}

/** Real dynamic import of the built artifact (dependency-free fixture). */
const realImporter = (url: string): Promise<unknown> => import(url);

function manifestFetcher(manifestPath: string) {
  return async (): Promise<string> => fs.readFileSync(manifestPath, 'utf-8');
}

beforeEach(() => {
  createFixture();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runtime game plugins — end-to-end', () => {
  it('scenario 1: a compatible artifact loads and is merged into the catalogue', async () => {
    const manifestPath = await buildIntoContentDir();

    const loaded = await loadGamePlugins({
      contentDir,
      engineVersion: '0.1.0',
      fetchManifest: manifestFetcher(manifestPath),
      importer: realImporter,
    });

    expect(loaded.errors).toEqual([]);
    expect(loaded.incompatible).toEqual([]);
    expect(loaded.games).toHaveLength(1);
    expect(loaded.games[0].manifest.id).toBe(GAME_ID);
    expect(loaded.games[0].entry).toEqual({
      sceneKey: SCENE_CLASS,
      title: 'E2E Game',
      description: 'A synthetic runtime game for end-to-end verification.',
      runtimeGameId: GAME_ID,
      thumbnail: `tce-games://${GAME_ID}/assets/thumbnail.png`,
    });

    // The real artifact's scene class is importable and constructable.
    const Scene = loaded.games[0].scene as unknown as new () => {
      create(): string;
    };
    expect(new Scene().create()).toBe('created');

    // The F6 boot payload registers the dynamic scene alongside the static one.
    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: [
        class {
          static readonly key = 'StaticScene';
        },
      ],
      pluginResult: loaded,
    });
    expect(payload.games.map((game) => game.sceneKey)).toEqual([
      'StaticScene',
      SCENE_CLASS,
    ]);
    expect(payload.scenes).toHaveLength(2);
    expect(payload.pluginsLoaded).toBe(1);
  }, 60_000);

  it('scenario 2: an incompatible artifact is hidden but reported', async () => {
    const manifestPath = await buildIntoContentDir('^9.0.0');

    const loaded = await loadGamePlugins({
      contentDir,
      engineVersion: '0.1.0',
      fetchManifest: manifestFetcher(manifestPath),
      importer: realImporter,
    });

    // Hidden from the playable catalogue, present in the notice list.
    expect(loaded.games).toEqual([]);
    expect(loaded.incompatible).toHaveLength(1);
    expect(loaded.incompatible[0].entry.id).toBe(GAME_ID);
    expect(loaded.incompatible[0].reason).toContain('^9.0.0');
    expect(loaded.incompatible[0].reason).toContain('0.1.0');

    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: [],
      pluginResult: loaded,
    });
    expect(payload.games).toEqual(STATIC_GAMES);
    expect(payload.incompatible).toHaveLength(1);
    expect(payload.pluginsLoaded).toBe(0);
  }, 60_000);

  it('scenario 4: the artifact\'s game audio is served through tce-games://', async () => {
    await buildIntoContentDir();

    const result = await handleGameAssetRequest(
      `tce-games://${GAME_ID}/assets/audio/${GAME_ID}/card-draw.wav`,
      { contentDir },
    );

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('audio/wav');
    expect(Buffer.from(result.body as Uint8Array)).toEqual(WAV_BYTES);
  }, 60_000);

  it('scenario 3a: a missing manifest degrades to the static catalogue', async () => {
    const logger = { error: vi.fn() };
    const loader = (
      options: Parameters<typeof loadGamePlugins>[0],
    ): ReturnType<typeof loadGamePlugins> =>
      loadGamePlugins({
        ...options,
        // Point fetch at a directory with no games/manifest.json.
        fetchManifest: async () => {
          throw new Error('ENOENT: no such file');
        },
      });

    const pluginResult = await discoverRuntimeGames({
      contentDir,
      engineVersion: '0.1.0',
      loader,
      logger,
    });

    expect(pluginResult).not.toBeNull();
    expect(pluginResult!.games).toEqual([]);
    expect(pluginResult!.errors).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();

    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: [],
      pluginResult,
    });
    expect(payload.games).toEqual(STATIC_GAMES);
    expect(payload.incompatible).toEqual([]);
  });

  it('scenario 3b: a malformed manifest degrades to the static catalogue', async () => {
    const gamesDir = path.join(contentDir, 'games');
    fs.mkdirSync(gamesDir, { recursive: true });
    fs.writeFileSync(path.join(gamesDir, 'manifest.json'), '{ "version": 1, "games": [ }');

    const pluginResult = await discoverRuntimeGames({
      contentDir,
      engineVersion: '0.1.0',
      loader: (options) =>
        loadGamePlugins({
          ...options,
          fetchManifest: async () =>
            fs.readFileSync(path.join(gamesDir, 'manifest.json'), 'utf-8'),
          importer: realImporter,
        }),
      logger: { error: vi.fn() },
    });

    expect(pluginResult).not.toBeNull();
    expect(pluginResult!.games).toEqual([]);
    expect(pluginResult!.errors[0].reason).toMatch(/Invalid manifest/i);

    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: [],
      pluginResult,
    });
    expect(payload.games).toEqual(STATIC_GAMES);
  });

  it('scenario 3c: no content directory (browser build) skips discovery entirely', async () => {
    const pluginResult = await discoverRuntimeGames({ contentDir: null });
    expect(pluginResult).toBeNull();

    const payload = buildGameBootPayload({
      staticGames: STATIC_GAMES,
      staticScenes: [],
      pluginResult,
    });
    expect(payload.games).toEqual(STATIC_GAMES);
    expect(payload.pluginsLoaded).toBe(0);
  });
});
