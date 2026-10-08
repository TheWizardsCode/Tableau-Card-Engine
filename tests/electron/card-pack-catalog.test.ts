/**
 * Unit tests for the card-pack DLC catalog
 * (`electron/card-pack-catalog.ts`, feature F5 / CG-0MUZIS2B8005WG4S).
 *
 * The catalog is pure data + a pure resolver, so these tests exercise it with
 * in-memory and temp-file inputs — no Electron, Steam, or content directory.
 * The invariant under test: a pack id resolves to its configured Steam app id
 * (or the manifest fallback), and a malformed/missing catalog degrades to
 * `null`/free rather than throwing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_CARD_PACK_CATALOG_FILE,
  isCardPackDlcEntry,
  loadCardPackCatalog,
  resolvePackSteamAppId,
  type CardPackDlcCatalog,
} from '../../electron/card-pack-catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = path.join(HERE, '..', '..', 'electron');

const tmpDirs: string[] = [];

/** Write *contents* to a fresh temp catalog file and return its path. */
function tempCatalog(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-pack-catalog-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'catalog.json');
  fs.writeFileSync(file, contents, 'utf-8');
  return file;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── loadCardPackCatalog ─────────────────────────────────────

describe('loadCardPackCatalog', () => {
  it('loads the committed catalog next to the module', () => {
    const catalog = loadCardPackCatalog();

    expect(fs.existsSync(path.join(ELECTRON_DIR, DEFAULT_CARD_PACK_CATALOG_FILE))).toBe(true);
    expect(catalog).not.toBeNull();
    expect(catalog!.version).toBe(1);
    expect(Array.isArray(catalog!.packs)).toBe(true);
    for (const entry of catalog!.packs) {
      expect(isCardPackDlcEntry(entry)).toBe(true);
    }
  });

  it('returns null when the file is missing', () => {
    expect(
      loadCardPackCatalog({ catalogPath: path.join(os.tmpdir(), 'does-not-exist-catalog.json') }),
    ).toBeNull();
  });

  it('returns null for malformed JSON (never throws)', () => {
    const file = tempCatalog('{ "version": 1, "packs": [ }');
    expect(() => loadCardPackCatalog({ catalogPath: file })).not.toThrow();
    expect(loadCardPackCatalog({ catalogPath: file })).toBeNull();
  });

  it('returns null when the document has no packs array', () => {
    const file = tempCatalog(JSON.stringify({ version: 1, packages: [] }));
    expect(loadCardPackCatalog({ catalogPath: file })).toBeNull();
  });

  it('accepts an empty (well-formed) catalog', () => {
    const file = tempCatalog(JSON.stringify({ version: 1, packs: [] }));
    expect(loadCardPackCatalog({ catalogPath: file })).toEqual({ version: 1, packs: [] });
  });

  it('filters invalid entries and keeps the valid ones', () => {
    const file = tempCatalog(
      JSON.stringify({
        version: 2,
        packs: [
          { packId: 'ok', steamAppId: 100 },
          { packId: '', steamAppId: 101 },
          { packId: 'no-app', steamAppId: 0 },
          { packId: 'float', steamAppId: 1.5 },
          { packId: 'bad-game', gameId: 7, steamAppId: 102 },
        ],
      }),
    );

    expect(loadCardPackCatalog({ catalogPath: file })).toEqual({
      version: 2,
      packs: [{ packId: 'ok', steamAppId: 100 }],
    });
  });

  it('defaults the version to 1 when it is absent or invalid', () => {
    const file = tempCatalog(JSON.stringify({ packs: [{ packId: 'ok', steamAppId: 100 }] }));
    expect(loadCardPackCatalog({ catalogPath: file })?.version).toBe(1);
  });
});

// ── isCardPackDlcEntry ──────────────────────────────────────

describe('isCardPackDlcEntry', () => {
  it('accepts a minimal entry', () => {
    expect(isCardPackDlcEntry({ packId: 'p', steamAppId: 1 })).toBe(true);
  });

  it('accepts an entry with a gameId', () => {
    expect(isCardPackDlcEntry({ packId: 'p', gameId: 'g', steamAppId: 1 })).toBe(true);
  });

  it('rejects malformed entries', () => {
    for (const value of [
      null,
      undefined,
      'pack',
      1,
      {},
      { packId: 'p' },
      { packId: 'p', steamAppId: '1' },
      { packId: 'p', steamAppId: 0 },
      { packId: 'p', steamAppId: -1 },
      { packId: 'p', steamAppId: 1.2 },
      { packId: 'p', gameId: 3, steamAppId: 1 },
    ]) {
      expect(isCardPackDlcEntry(value), JSON.stringify(value)).toBe(false);
    }
  });
});

// ── resolvePackSteamAppId ───────────────────────────────────

describe('resolvePackSteamAppId', () => {
  const catalog: CardPackDlcCatalog = {
    version: 1,
    packs: [
      { gameId: 'game-a', packId: 'shared', steamAppId: 111 },
      { packId: 'wildcard', steamAppId: 222 },
    ],
  };

  it('resolves an exact (packId, gameId) match', () => {
    expect(resolvePackSteamAppId(catalog, { id: 'shared', gameId: 'game-a' })).toBe(111);
  });

  it('does not resolve an exact mismatch for another game', () => {
    expect(resolvePackSteamAppId(catalog, { id: 'shared', gameId: 'game-b' })).toBeNull();
  });

  it('resolves a gameId-less (wildcard) entry for any game', () => {
    expect(resolvePackSteamAppId(catalog, { id: 'wildcard', gameId: 'game-b' })).toBe(222);
    expect(resolvePackSteamAppId(catalog, { id: 'wildcard' })).toBe(222);
  });

  it('falls back to the pack manifest declaration when the catalog has no entry', () => {
    expect(resolvePackSteamAppId(catalog, { id: 'unlisted', steamAppId: 333 })).toBe(333);
    expect(resolvePackSteamAppId(null, { id: 'unlisted', steamAppId: 333 })).toBe(333);
  });

  it('prefers the catalog entry over the pack manifest declaration', () => {
    expect(resolvePackSteamAppId(catalog, { id: 'shared', gameId: 'game-a', steamAppId: 999 })).toBe(111);
  });

  it('returns null when nothing gates the pack', () => {
    expect(resolvePackSteamAppId(catalog, { id: 'free-pack' })).toBeNull();
    expect(resolvePackSteamAppId(null, { id: 'free-pack' })).toBeNull();
  });

  it('ignores a malformed pack manifest app id', () => {
    expect(resolvePackSteamAppId(null, { id: 'p', steamAppId: 0 })).toBeNull();
    expect(resolvePackSteamAppId(null, { id: 'p', steamAppId: 1.5 })).toBeNull();
    expect(resolvePackSteamAppId(null, { id: 'p', steamAppId: null })).toBeNull();
  });
});
