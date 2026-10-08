/**
 * Tests for the reference card-pack builder (`scripts/build-card-pack.mjs`,
 * feature F7 / CG-0MUZIS3G6008UQGO).
 *
 * The builder validates an authored pack source tree, copies its real
 * (non-symlink) files, and merges its manifest entry into an installable packs
 * root. These tests exercise the pure helpers directly, build the committed
 * reference Main Street pack (`tests/fixtures/reference-packs/main-street/`),
 * prove determinism and symlink exclusion, and confirm the emitted packs root
 * is consumable by the renderer loader (`loadCardPacks`) — so the builder and
 * the loader agree on the on-disk contract.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_OUT_ROOT,
  CardPackBuildError,
  buildCardPack,
  main,
  mergePackManifestEntry,
  validatePackCsv,
} from '../../scripts/build-card-pack.mjs';
import { loadCardPacks } from '../../src/ui/CardPackLoader';
import {
  CARD_PACK_CSV_HEADER,
  makeCardPackManifest,
} from '../fixtures/card-pack/helpers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_PACK_INPUT = path.resolve(
  HERE,
  '../fixtures/reference-packs/main-street',
);
const REFERENCE_PACK_ID = 'main-street-foundations';
const REFERENCE_GAME_ID = 'main-street';

/** Deterministic 1×1 PNG (same seed bytes as the F1 fixtures). */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
  'base64',
);

const tempRoots: string[] = [];

/** Create a fresh temp directory that is removed after the test file runs. */
function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
});

process.on('exit', () => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Write a pack source tree and return its root. */
function writePackSource(
  manifest: unknown,
  files: Record<string, string | Buffer>,
): string {
  const inputDir = tempDir('tce-card-pack-src-');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(
    path.join(inputDir, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(inputDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return inputDir;
}

/** A minimal valid pack CSV fragment with the Main Street schema header. */
function validPackCsv(id: string): string {
  return `${CARD_PACK_CSV_HEADER}\nbusiness,${id},${id}`;
}

describe('validatePackCsv', () => {
  it('accepts a fragment whose header includes the id column', () => {
    const result = validatePackCsv(validPackCsv('biz-x'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.header).toContain('id');
  });

  it('rejects an empty fragment', () => {
    expect(validatePackCsv('')).toEqual({
      ok: false,
      reason: 'CSV fragment is empty or has no header.',
    });
  });

  it('rejects a fragment whose header lacks an id column', () => {
    const result = validatePackCsv('family,name\nbusiness,Thing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"id" column/);
  });
});

describe('mergePackManifestEntry', () => {
  it('creates a fresh deterministic manifest document', () => {
    const outRoot = tempDir('tce-card-pack-out-');
    const { document, manifestPath } = mergePackManifestEntry(outRoot, {
      id: 'pack-a',
      gameId: 'game-a',
    });
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(document.version).toBe(1);
    expect(document.packs.map((p) => p.id)).toEqual(['pack-a']);
  });

  it('appends a pack while preserving other packs, sorted by game then id', () => {
    const outRoot = tempDir('tce-card-pack-out-');
    fs.mkdirSync(outRoot, { recursive: true });
    fs.writeFileSync(
      path.join(outRoot, 'manifest.json'),
      JSON.stringify({
        version: 1,
        packs: [
          { id: 'z-pack', gameId: 'game-b' },
          { id: 'a-pack', gameId: 'game-b' },
        ],
      }),
    );

    const { document } = mergePackManifestEntry(outRoot, {
      id: 'm-pack',
      gameId: 'game-a',
    });

    expect(document.packs.map((p) => `${p.gameId}/${p.id}`)).toEqual([
      'game-a/m-pack',
      'game-b/a-pack',
      'game-b/z-pack',
    ]);
  });

  it('replaces an entry with the same (gameId, id) but keeps same id across games', () => {
    const outRoot = tempDir('tce-card-pack-out-');
    mergePackManifestEntry(outRoot, { id: 'shared', gameId: 'game-a', title: 'old' });
    mergePackManifestEntry(outRoot, { id: 'shared', gameId: 'game-b', title: 'other' });
    const { document } = mergePackManifestEntry(outRoot, {
      id: 'shared',
      gameId: 'game-a',
      title: 'new',
    });

    expect(document.packs).toHaveLength(2);
    expect(
      document.packs.find((p) => p.gameId === 'game-a')?.title,
    ).toBe('new');
    expect(
      document.packs.find((p) => p.gameId === 'game-b')?.title,
    ).toBe('other');
  });

  it('recovers from a malformed existing manifest', () => {
    const outRoot = tempDir('tce-card-pack-out-');
    fs.mkdirSync(outRoot, { recursive: true });
    fs.writeFileSync(path.join(outRoot, 'manifest.json'), '{ not valid json');
    const { document } = mergePackManifestEntry(outRoot, {
      id: 'pack-a',
      gameId: 'game-a',
    });
    expect(document.packs).toHaveLength(1);
  });
});

describe('buildCardPack — reference Main Street pack', () => {
  it('builds the committed reference pack and writes an installable manifest', () => {
    const outRoot = path.join(tempDir('tce-card-pack-ref-'), 'packs');
    const result = buildCardPack({
      inputDir: REFERENCE_PACK_INPUT,
      outRoot,
    });

    expect(result.rejected).toEqual([]);
    expect(result.packs).toHaveLength(1);
    const pack = result.packs[0];
    expect(pack.id).toBe(REFERENCE_PACK_ID);
    expect(pack.gameId).toBe(REFERENCE_GAME_ID);

    // The manifest entry is emitted verbatim, keyed by (gameId, id).
    expect(result.document?.packs).toEqual([
      expect.objectContaining({
        id: REFERENCE_PACK_ID,
        gameId: REFERENCE_GAME_ID,
        cards: 'cards.csv',
      }),
    ]);
    const written = JSON.parse(fs.readFileSync(result.manifestPath, 'utf-8'));
    expect(written.packs[0].title).toBe('Main Street Foundations');

    // CSV fragment copied, retaining the Main Street schema header.
    expect(fs.existsSync(pack.csvPath)).toBe(true);
    expect(fs.readFileSync(pack.csvPath, 'utf-8').split('\n')[0]).toBe(
      CARD_PACK_CSV_HEADER,
    );
    expect(pack.files).toContain('cards.csv');

    // Both art assets copied as real files.
    expect(pack.files).toContain('assets/biz-ms-foundations-teahouse.png');
    expect(pack.files).toContain('assets/evt-ms-foundations-fair.png');
  });

  it('is deterministic for the same inputs', () => {
    const first = buildCardPack({
      inputDir: REFERENCE_PACK_INPUT,
      outRoot: path.join(tempDir('tce-card-pack-det-a-'), 'packs'),
    });
    const second = buildCardPack({
      inputDir: REFERENCE_PACK_INPUT,
      outRoot: path.join(tempDir('tce-card-pack-det-b-'), 'packs'),
    });

    expect(fs.readFileSync(first.manifestPath, 'utf-8')).toBe(
      fs.readFileSync(second.manifestPath, 'utf-8'),
    );
    expect(fs.readFileSync(first.packs[0].csvPath, 'utf-8')).toBe(
      fs.readFileSync(second.packs[0].csvPath, 'utf-8'),
    );
    expect(first.packs[0].files).toEqual(second.packs[0].files);
  });

  it('merges into an existing packs root without overwriting other games', () => {
    const outRoot = path.join(tempDir('tce-card-pack-merge-'), 'packs');
    const { manifestPath } = mergePackManifestEntry(outRoot, {
      id: 'other-pack',
      gameId: 'other-game',
    });

    const result = buildCardPack({ inputDir: REFERENCE_PACK_INPUT, outRoot });

    expect(result.manifestPath).toBe(manifestPath);
    expect(result.document?.packs.map((p) => `${p.gameId}/${p.id}`)).toEqual([
      `${REFERENCE_GAME_ID}/${REFERENCE_PACK_ID}`,
      'other-game/other-pack',
    ]);
    // The pre-existing entry survives.
    const written = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(written.packs.map((p: { id: string }) => p.id)).toEqual([
      REFERENCE_PACK_ID,
      'other-pack',
    ]);
  });

  it('emits a packs root the renderer loader consumes', async () => {
    const contentDir = tempDir('tce-card-pack-content-');
    const result = buildCardPack({
      inputDir: REFERENCE_PACK_INPUT,
      outRoot: path.join(contentDir, 'packs'),
    });
    const built = result.packs[0];

    const seenCsvUrls: string[] = [];
    const loaded = await loadCardPacks({
      contentDir,
      gameId: REFERENCE_GAME_ID,
      fetchManifest: async () =>
        fs.readFileSync(result.manifestPath, 'utf-8'),
      fetchCsv: async (url) => {
        seenCsvUrls.push(url);
        return fs.readFileSync(built.csvPath, 'utf-8');
      },
    });

    expect(loaded.errors).toEqual([]);
    expect(loaded.locked).toEqual([]);
    expect(loaded.packs).toHaveLength(1);
    expect(loaded.packs[0].manifest.id).toBe(REFERENCE_PACK_ID);
    expect(loaded.packs[0].csv).toContain('biz-ms-foundations-teahouse');
    expect(seenCsvUrls[0]).toBe(
      `tce-packs://${REFERENCE_GAME_ID}/${REFERENCE_PACK_ID}/cards.csv`,
    );
  });
});

describe('buildCardPack — validation and safety', () => {
  it('refuses an invalid manifest and writes nothing', () => {
    const inputDir = writePackSource('{ "version": 1, "packs": [ }', {});
    const outRoot = path.join(tempDir('tce-card-pack-out-'), 'packs');

    expect(() => buildCardPack({ inputDir, outRoot })).toThrow(
      CardPackBuildError,
    );
    expect(fs.existsSync(path.join(outRoot, 'manifest.json'))).toBe(false);
  });

  it('rejects a pack with an invalid CSV header but still builds valid packs', () => {
    const manifest = makeCardPackManifest([{ id: 'good-pack' }, { id: 'bad-pack' }]);
    const inputDir = writePackSource(manifest, {
      'fixture-game/good-pack/cards.csv': validPackCsv('biz-good'),
      'fixture-game/bad-pack/cards.csv': 'family,name\nbusiness,Thing',
    });
    const outRoot = path.join(tempDir('tce-card-pack-out-'), 'packs');

    const result = buildCardPack({ inputDir, outRoot });

    expect(result.packs.map((p) => p.id)).toEqual(['good-pack']);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ id: 'bad-pack' });
    expect(result.rejected[0].reason).toMatch(/"id" column/);
    expect(result.document?.packs.map((p) => p.id)).toEqual(['good-pack']);
    expect(fs.existsSync(path.join(outRoot, 'fixture-game', 'bad-pack'))).toBe(
      false,
    );
  });

  it('rejects a pack whose directory is missing', () => {
    const manifest = makeCardPackManifest([{ id: 'ghost-pack' }]);
    const inputDir = writePackSource(manifest, {});
    const outRoot = path.join(tempDir('tce-card-pack-out-'), 'packs');

    const result = buildCardPack({ inputDir, outRoot });

    expect(result.packs).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/directory is missing/);
  });

  it('copies real assets but excludes symlinks (shared core assets)', () => {
    const manifest = makeCardPackManifest([
      { id: 'sym-pack', assets: ['assets/real.png', 'assets/linked.png'] },
    ]);
    const inputDir = writePackSource(manifest, {
      'fixture-game/sym-pack/cards.csv': validPackCsv('biz-sym'),
      'fixture-game/sym-pack/assets/real.png': PNG_BYTES,
    });
    // A symlink inside the pack stands in for a shared core asset.
    const sharedTarget = path.join(inputDir, 'shared.png');
    fs.writeFileSync(sharedTarget, PNG_BYTES);
    fs.symlinkSync(
      sharedTarget,
      path.join(inputDir, 'fixture-game/sym-pack/assets/linked.png'),
    );

    const outRoot = path.join(tempDir('tce-card-pack-out-'), 'packs');
    const result = buildCardPack({ inputDir, outRoot });

    expect(result.rejected).toEqual([]);
    const packDir = result.packs[0].packDir;
    expect(fs.existsSync(path.join(packDir, 'assets', 'real.png'))).toBe(true);
    expect(fs.existsSync(path.join(packDir, 'assets', 'linked.png'))).toBe(false);
    expect(result.packs[0].files).toContain('assets/real.png');
    expect(result.packs[0].files).not.toContain('assets/linked.png');
  });

  it('defaults the output root to build/card-packs/packs', () => {
    expect(DEFAULT_OUT_ROOT).toBe(path.join('build', 'card-packs', 'packs'));
  });
});

describe('build-card-pack CLI', () => {
  it('prints usage and exits 0 for --help', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(main(['--help'])).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('build:card-pack'),
    );
  });

  it('exits 1 when no input is supplied', () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(main([])).toBe(1);
  });

  it('builds the reference pack and exits 0', () => {
    const outRoot = path.join(tempDir('tce-card-pack-cli-'), 'packs');
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const code = main(['--input', REFERENCE_PACK_INPUT, '--out', outRoot]);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outRoot, 'manifest.json'))).toBe(true);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('main-street/main-street-foundations'),
    );
  });

  it('exits 1 when a pack is rejected', () => {
    const manifest = makeCardPackManifest([{ id: 'bad-pack' }]);
    const inputDir = writePackSource(manifest, {
      'fixture-game/bad-pack/cards.csv': 'family,name\nbusiness,Thing',
    });
    const outRoot = path.join(tempDir('tce-card-pack-cli-'), 'packs');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    expect(main(['--input', inputDir, '--out', outRoot])).toBe(1);
  });
});
