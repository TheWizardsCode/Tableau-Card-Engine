/**
 * Tests for the reference runtime game artifact builder
 * (`scripts/build-game-artifact.mjs`, feature F7 / CG-0MUG2ZM3K007QSVH).
 *
 * A synthetic fixture game (scene + GAME_INFO + thumbnail) is built with the
 * real Vite library-mode pipeline into a temp content directory, then the
 * emitted artifact + manifest are loaded through `loadGamePlugins` with a
 * stubbed importer — proving the builder and the loader agree on the artifact
 * contract.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildGameArtifact,
  copyGameOwnedAssets,
  isSharedExternal,
  mergeManifestEntry,
  renderArtifactEntry,
  parseArgs,
} from '../../scripts/build-game-artifact.mjs';
import { loadGamePlugins } from '../../src/ui/GamePluginLoader';

/** Deterministic 1×1 PNG (same seed bytes as the F1 fixture). */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

const GAME_ID = 'fixture-artifact';
const SCENE_CLASS = 'FixtureArtifactScene';

const SCENE_SOURCE = `import Phaser from 'phaser';
import { createSeededRng } from '@core-engine';

export const GAME_INFO = {
  sceneKey: '${SCENE_CLASS}',
  title: 'Fixture Artifact',
  description: 'Synthetic runtime artifact built by the reference builder.',
  thumbnail: 'games/${GAME_ID}/thumbnail',
};

export class ${SCENE_CLASS} extends Phaser.Scene {
  constructor() {
    super({ key: '${SCENE_CLASS}' });
  }

  create() {
    createSeededRng(1);
  }
}
`;

let root: string;
let fixtureRepo: string;
let contentDir: string;

/** Create the fixture game repo and a content directory to install into. */
function createFixture(): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-artifact-test-'));
  fixtureRepo = path.join(root, 'fixture-repo');
  contentDir = path.join(root, 'content');

  const gameDir = path.join(fixtureRepo, 'fixture-game');
  const sceneDir = path.join(gameDir, 'src', 'scenes');
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(
    path.join(sceneDir, `${SCENE_CLASS}.ts`),
    SCENE_SOURCE,
    'utf-8',
  );

  const thumbDir = path.join(gameDir, 'public', 'assets', 'games', GAME_ID);
  fs.mkdirSync(thumbDir, { recursive: true });
  fs.writeFileSync(path.join(thumbDir, 'thumbnail.png'), PNG_BYTES);

  // Game-owned audio, which the builder must package for the runtime artifact.
  const audioDir = path.join(gameDir, 'public', 'assets', 'audio', GAME_ID);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(path.join(audioDir, 'card-draw.wav'), Buffer.from('RIFF'));
}

/** The preset-equivalent config pointing at the fixture game. */
function fixtureConfig() {
  return {
    games: [
      {
        id: GAME_ID,
        path: path.join(fixtureRepo, 'fixture-game'),
        scenePath: `src/scenes/${SCENE_CLASS}.ts`,
      },
    ],
  };
}

beforeEach(() => {
  createFixture();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('artifact builder — pure helpers', () => {
  it('classifies shared dependencies as external', () => {
    expect(isSharedExternal('phaser')).toBe(true);
    expect(isSharedExternal('@core-engine')).toBe(true);
    expect(isSharedExternal('@core-engine/SoundManager')).toBe(true);
    expect(isSharedExternal('@card-system')).toBe(true);
    expect(isSharedExternal('@ui/CardGameScene')).toBe(true);
    expect(isSharedExternal('@ai')).toBe(true);
    expect(isSharedExternal('./local/module')).toBe(false);
    expect(isSharedExternal('phaser3')).toBe(false);
  });

  it('renders an entry that re-exports the scene and GAME_INFO', () => {
    const source = renderArtifactEntry({
      sceneClass: 'MyScene',
      absoluteScenePath: '/tmp/MyScene.ts',
      info: { sceneKey: 'MyScene', title: 'T', description: 'D' },
    });

    expect(source).toContain('export { MyScene } from "/tmp/MyScene.ts";');
    expect(source).toContain('export const GAME_INFO');
    expect(source).toContain('"sceneKey": "MyScene"');
  });

  it('merges a manifest entry, preserving other games and sorting by id', () => {
    const outRoot = path.join(root, 'manifest-test');
    fs.mkdirSync(outRoot, { recursive: true });
    fs.writeFileSync(
      path.join(outRoot, 'manifest.json'),
      JSON.stringify({
        version: 1,
        games: [{ id: 'z-game', entry: 'entry.js' }],
      }),
    );

    const { document } = mergeManifestEntry(outRoot, {
      id: 'a-game',
      entry: 'entry.js',
    });

    expect(document.version).toBe(1);
    expect(document.games.map((g) => g.id as string)).toEqual([
      'a-game',
      'z-game',
    ]);
  });

  it('replaces an existing entry with the same id', () => {
    const outRoot = path.join(root, 'manifest-replace');
    fs.mkdirSync(outRoot, { recursive: true });

    mergeManifestEntry(outRoot, { id: 'g', title: 'old' });
    const { document } = mergeManifestEntry(outRoot, { id: 'g', title: 'new' });

    expect(document.games).toHaveLength(1);
    expect(document.games[0].title).toBe('new');
  });

  it('parses CLI arguments', () => {
    expect(parseArgs(['--game', 'golf', '--out', 'x', '--help'])).toEqual({
      game: 'golf',
      out: 'x',
      help: true,
    });
  });

  it('copies game-owned assets and skips shared-asset symlinks', () => {
    const src = path.join(root, 'asset-src');
    const dest = path.join(root, 'asset-dest');
    fs.mkdirSync(path.join(src, 'audio', 'golf'), { recursive: true });
    fs.mkdirSync(path.join(src, 'games', 'golf'), { recursive: true });
    fs.writeFileSync(path.join(src, 'audio', 'golf', 'card-draw.wav'), 'wav');
    fs.writeFileSync(path.join(src, 'games', 'golf', 'icon.png'), 'img');
    fs.writeFileSync(path.join(src, 'CREDITS.md'), 'credits');

    // A shared core asset is included as a symlink and must not be copied.
    const shared = path.join(root, 'shared.wav');
    fs.writeFileSync(shared, 'shared');
    fs.symlinkSync(shared, path.join(src, 'audio', 'shared.wav'));

    const copied = copyGameOwnedAssets(src, dest);

    expect(copied.sort()).toEqual([
      'audio/golf/card-draw.wav',
      'games/golf/icon.png',
    ]);
    expect(
      fs.existsSync(path.join(dest, 'audio', 'golf', 'card-draw.wav')),
    ).toBe(true);
    expect(fs.existsSync(path.join(dest, 'CREDITS.md'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'audio', 'shared.wav'))).toBe(false);
  });

  it('returns an empty list when the game has no assets directory', () => {
    expect(
      copyGameOwnedAssets(path.join(root, 'no-such-dir'), path.join(root, 'out')),
    ).toEqual([]);
  });
});

describe('buildGameArtifact', () => {
  it('builds a loadable artifact, externalising shared dependencies', async () => {
    const result = await buildGameArtifact({
      gameId: GAME_ID,
      projectRoot: fixtureRepo,
      config: fixtureConfig(),
      outRoot: path.join(contentDir, 'games'),
    });

    // Emitted entry + manifest.
    expect(fs.existsSync(result.entryPath)).toBe(true);
    expect(fs.existsSync(result.manifestPath)).toBe(true);
    expect(fs.existsSync(path.join(result.outDir, 'assets', 'thumbnail.png'))).toBe(
      true,
    );
    // Game-owned audio is packaged so the artifact is self-contained.
    expect(result.assets).toContain(`audio/${GAME_ID}/card-draw.wav`);
    expect(
      fs.existsSync(
        path.join(result.outDir, 'assets', 'audio', GAME_ID, 'card-draw.wav'),
      ),
    ).toBe(true);

    // Externalised: Phaser/engine imports are kept, their runtime is not bundled.
    const bundle = fs.readFileSync(result.entryPath, 'utf-8');
    expect(bundle).toContain('phaser');
    expect(bundle).toContain('@core-engine');
    expect(bundle).not.toMatch(/WebGLRenderer|CanvasRenderer/);
    expect(result.externalised.phaser).toBe(true);
    expect(result.bundleBytes).toBeLessThan(100_000);

    // The manifest entry describes the artifact contract.
    expect(result.manifestEntry).toEqual({
      id: GAME_ID,
      sceneKey: SCENE_CLASS,
      title: 'Fixture Artifact',
      description: 'Synthetic runtime artifact built by the reference builder.',
      thumbnail: 'assets/thumbnail.png',
      coreEngineVersion: '^0.1.0',
      entry: 'entry.js',
    });
  }, 60_000);

  it('loads the built artifact + manifest through loadGamePlugins', async () => {
    const result = await buildGameArtifact({
      gameId: GAME_ID,
      projectRoot: fixtureRepo,
      config: fixtureConfig(),
      outRoot: path.join(contentDir, 'games'),
    });

    // A stubbed importer stands in for the browser/Electron module load; the
    // loader resolves the manifest, entry URL, and asset URL for real.
    const importer = vi.fn(async (_url: string) => ({
      [SCENE_CLASS]: class {},
      GAME_INFO: { id: GAME_ID, sceneKey: SCENE_CLASS },
    }));

    const loaded = await loadGamePlugins({
      contentDir,
      fetchManifest: async () =>
        fs.readFileSync(result.manifestPath, 'utf-8'),
      importer,
    });

    expect(loaded.errors).toEqual([]);
    expect(loaded.incompatible).toEqual([]);
    expect(loaded.games).toHaveLength(1);
    expect(loaded.games[0].entry).toEqual({
      sceneKey: SCENE_CLASS,
      title: 'Fixture Artifact',
      description: 'Synthetic runtime artifact built by the reference builder.',
      runtimeGameId: GAME_ID,
      thumbnail: `tce-games://${GAME_ID}/assets/thumbnail.png`,
    });

    // The importer was handed the artifact's entry URL.
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer.mock.calls[0][0]).toContain(
      `/games/${GAME_ID}/entry.js`,
    );
  }, 60_000);

  it('rejects a game id that is not in the preset', async () => {
    await expect(
      buildGameArtifact({
        gameId: 'not-a-game',
        projectRoot: fixtureRepo,
        config: fixtureConfig(),
        outRoot: path.join(contentDir, 'games'),
      }),
    ).rejects.toThrow(/not in the selected preset/);
  });
});
