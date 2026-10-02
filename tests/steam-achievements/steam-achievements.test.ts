/**
 * Launcher achievement manifest + sync service tests (F4, CG-0MUNC7DNE0088ERH).
 *
 * Covers:
 *  - manifest loading and structural/graceful handling,
 *  - semantic validation (duplicates, empty ids),
 *  - the `SteamAchievementService` unlock protocol (idempotent, offline-safe),
 *  - re-sync on launch (success, offline, drift),
 *  - graceful degradation when the manifest or Steam is absent.
 *
 * No Steam client, Electron, or browser required.
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  FakeAchievementSource,
  MemoryAchievementStore,
  type AchievementManifestFile,
} from '../../electron/steam-achievements.js';
import {
  loadAchievementManifest,
  parseManifestFile,
  validateAchievementManifest,
  findAchievementEntry,
  findGameManifest,
} from '../../electron/achievement-manifest.js';
import { SteamAchievementService } from '../../electron/steam-achievements.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Fixture manifest used across the tests. */
const FIXTURE_MANIFEST: AchievementManifestFile = {
  version: 1,
  games: [
    {
      gameId: 'test-game',
      achievements: [
        { achievementId: 'foodie-row', steamApiName: 'TCE_TEST_FOODIE_ROW', hidden: false },
        { achievementId: 'secret', steamApiName: 'TCE_TEST_SECRET', hidden: true },
      ],
    },
  ],
};

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tce-ach-f4-'));
}

// ── Manifest loading ────────────────────────────────────────

describe('loadAchievementManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads and parses a valid manifest file', () => {
    const manifestPath = path.join(tmpDir, 'achievement-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(FIXTURE_MANIFEST));

    const loaded = loadAchievementManifest({ manifestPath });
    expect(loaded).not.toBeNull();
    expect(loaded?.games).toHaveLength(1);
    expect(loaded?.games[0].achievements).toHaveLength(2);
  });

  it('returns null for a missing file (graceful)', () => {
    expect(loadAchievementManifest({ manifestPath: path.join(tmpDir, 'missing.json') })).toBeNull();
  });

  it('returns null for invalid JSON (graceful)', () => {
    const manifestPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(manifestPath, '{ not json');
    expect(loadAchievementManifest({ manifestPath })).toBeNull();
  });

  it('returns null for a non-object manifest', () => {
    const manifestPath = path.join(tmpDir, 'array.json');
    fs.writeFileSync(manifestPath, '[]');
    expect(loadAchievementManifest({ manifestPath })).toBeNull();
  });

  it('drops structurally invalid entries instead of disabling the manifest', () => {
    const manifestPath = path.join(tmpDir, 'partial.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        games: [
          {
            gameId: 'g',
            achievements: [
              { achievementId: 'ok', steamApiName: 'TCE_OK', hidden: false },
              { achievementId: 'bad-no-api', hidden: false },
              { achievementId: '', steamApiName: 'TCE_EMPTY', hidden: false },
              'not-an-object',
            ],
          },
        ],
      }),
    );
    const loaded = loadAchievementManifest({ manifestPath });
    expect(loaded?.games[0].achievements).toHaveLength(1);
    expect(loaded?.games[0].achievements[0].achievementId).toBe('ok');
  });

  it('loads the committed product manifest and validates clean', () => {
    const manifest = loadAchievementManifest({
      manifestPath: path.join(here, '..', '..', 'electron', 'achievement-manifest.json'),
    });
    expect(manifest).not.toBeNull();
    const mainStreet = findGameManifest(manifest!, 'main-street');
    expect(mainStreet).not.toBeNull();
    expect(mainStreet?.achievements).toHaveLength(13);
    // The committed manifest must pass semantic validation.
    expect(validateAchievementManifest(manifest!)).toEqual([]);
  });
});

// ── Manifest validation ─────────────────────────────────────

describe('validateAchievementManifest', () => {
  it('returns no issues for a clean manifest', () => {
    expect(validateAchievementManifest(FIXTURE_MANIFEST)).toEqual([]);
  });

  it('detects duplicate achievement ids across the manifest', () => {
    const manifest: AchievementManifestFile = {
      version: 1,
      games: [
        {
          gameId: 'a',
          achievements: [
            { achievementId: 'dup', steamApiName: 'TCE_A', hidden: false },
            { achievementId: 'dup', steamApiName: 'TCE_B', hidden: false },
          ],
        },
      ],
    };
    const issues = validateAchievementManifest(manifest);
    expect(issues.some((i) => i.code === 'duplicate-achievement-id')).toBe(true);
  });

  it('detects duplicate Steam API names across games', () => {
    const manifest: AchievementManifestFile = {
      version: 1,
      games: [
        { gameId: 'a', achievements: [{ achievementId: 'x', steamApiName: 'TCE_SAME', hidden: false }] },
        { gameId: 'b', achievements: [{ achievementId: 'y', steamApiName: 'TCE_SAME', hidden: false }] },
      ],
    };
    const issues = validateAchievementManifest(manifest);
    expect(issues.some((i) => i.code === 'duplicate-steam-api-name')).toBe(true);
  });

  it('detects duplicate game ids', () => {
    const manifest: AchievementManifestFile = {
      version: 1,
      games: [
        { gameId: 'a', achievements: [] },
        { gameId: 'a', achievements: [] },
      ],
    };
    const issues = validateAchievementManifest(manifest);
    expect(issues.some((i) => i.code === 'duplicate-game-id')).toBe(true);
  });

  it('detects an unsupported manifest version', () => {
    const manifest: AchievementManifestFile = { version: 99, games: [] };
    const issues = validateAchievementManifest(manifest);
    expect(issues.some((i) => i.code === 'unsupported-version')).toBe(true);
  });
});

// ── Lookups ─────────────────────────────────────────────────

describe('manifest lookups', () => {
  it('findAchievementEntry resolves by game + achievement id', () => {
    expect(findAchievementEntry(FIXTURE_MANIFEST, 'test-game', 'foodie-row')?.steamApiName).toBe(
      'TCE_TEST_FOODIE_ROW',
    );
    expect(findAchievementEntry(FIXTURE_MANIFEST, 'test-game', 'missing')).toBeNull();
    expect(findAchievementEntry(FIXTURE_MANIFEST, 'missing-game', 'foodie-row')).toBeNull();
    expect(findAchievementEntry(null, 'test-game', 'foodie-row')).toBeNull();
  });

  it('parseManifestFile returns null for invalid shapes', () => {
    expect(parseManifestFile(null)).toBeNull();
    expect(parseManifestFile({})).toBeNull();
    expect(parseManifestFile({ games: 'nope' })).toBeNull();
  });
});

// ── Sync service: unlock ────────────────────────────────────

describe('SteamAchievementService.unlock', () => {
  it('unlocks, persists locally, and syncs to Steam when available', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore();
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.unlock('foodie-row');
    expect(result).toEqual({
      achievementId: 'foodie-row',
      unlocked: true,
      synced: true,
      reason: 'unlocked',
    });
    expect(await service.getUnlocked()).toEqual(['foodie-row']);
    expect(await source.isUnlocked('TCE_TEST_FOODIE_ROW')).toBe(true);
  });

  it('persists locally when Steam is unavailable (offline-safe)', async () => {
    const source = new FakeAchievementSource({ availability: 'unavailable' });
    const store = new MemoryAchievementStore();
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.unlock('foodie-row');
    expect(result.unlocked).toBe(true);
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('steam-unavailable');
    expect(await service.getUnlocked()).toEqual(['foodie-row']);
  });

  it('reports an unknown achievement id without persisting', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore();
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.unlock('not-in-manifest');
    expect(result).toEqual({
      achievementId: 'not-in-manifest',
      unlocked: false,
      synced: false,
      reason: 'unknown-achievement',
    });
    expect(await service.getUnlocked()).toEqual([]);
  });

  it('is idempotent and does not duplicate the stored id', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore();
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    await service.unlock('foodie-row');
    const second = await service.unlock('foodie-row');
    expect(second.unlocked).toBe(true);
    expect(second.reason).toBe('already-unlocked');
    expect(await service.getUnlocked()).toEqual(['foodie-row']);
  });

  it('retries a previously-failed sync on a repeat unlock', async () => {
    // First unlock: Steam fails to store.
    const failing = new FakeAchievementSource({ setAchievementResult: false });
    const store = new MemoryAchievementStore();
    const service = new SteamAchievementService(failing, store, FIXTURE_MANIFEST);

    const first = await service.unlock('foodie-row');
    expect(first.synced).toBe(false);
    expect(first.reason).toBe('store-failed');

    // Steam recovers; a repeat unlock re-syncs idempotently.
    const working = new FakeAchievementSource();
    const service2 = new SteamAchievementService(working, store, FIXTURE_MANIFEST);
    const second = await service2.unlock('foodie-row');
    expect(second.reason).toBe('already-unlocked');
    expect(second.synced).toBe(true);
  });

  it('fails safely when no manifest is loaded', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore();
    const service = new SteamAchievementService(source, store, null);

    const result = await service.unlock('foodie-row');
    expect(result.reason).toBe('manifest-missing');
    expect(result.unlocked).toBe(false);
  });
});

// ── Sync service: resync ────────────────────────────────────

describe('SteamAchievementService.resync', () => {
  it('re-sends all persisted ids to Steam', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore(['foodie-row', 'secret']);
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.resync();
    expect(result).toEqual({ synced: 2, failed: 0, unknown: [], steamAvailable: true });
    expect(await source.isUnlocked('TCE_TEST_FOODIE_ROW')).toBe(true);
    expect(await source.isUnlocked('TCE_TEST_SECRET')).toBe(true);
  });

  it('reports ids absent from the manifest as unknown drift', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore(['foodie-row', 'stale-id']);
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.resync();
    expect(result.synced).toBe(1);
    expect(result.unknown).toEqual(['stale-id']);
  });

  it('reports failures when Steam rejects a store', async () => {
    const source = new FakeAchievementSource({ storeStatsResult: false });
    const store = new MemoryAchievementStore(['foodie-row']);
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.resync();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('is a safe no-op when Steam is unavailable', async () => {
    const source = new FakeAchievementSource({ availability: 'unavailable' });
    const store = new MemoryAchievementStore(['foodie-row']);
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);

    const result = await service.resync();
    expect(result.steamAvailable).toBe(false);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    // The store is untouched — the unlock survives for the next launch.
    expect(await service.getUnlocked()).toEqual(['foodie-row']);
  });

  it('does not throw when the source throws', async () => {
    const source = new FakeAchievementSource();
    const store = new MemoryAchievementStore(['foodie-row']);
    const service = new SteamAchievementService(source, store, FIXTURE_MANIFEST);
    // Force an unexpected throw from the source.
    source.setAchievement = async () => {
      throw new Error('boom');
    };

    await expect(service.resync()).resolves.toMatchObject({ synced: 0, failed: 1 });
  });
});

// ── Sync service: diagnostics ───────────────────────────────

describe('SteamAchievementService diagnostics', () => {
  it('resolves the Steam API name for an achievement', () => {
    const service = new SteamAchievementService(
      new FakeAchievementSource(),
      new MemoryAchievementStore(),
      FIXTURE_MANIFEST,
    );
    expect(service.resolveSteamApiName('foodie-row')).toBe('TCE_TEST_FOODIE_ROW');
    expect(service.resolveSteamApiName('missing')).toBeNull();
  });

  it('reports manifest presence and Steam availability', () => {
    const service = new SteamAchievementService(
      new FakeAchievementSource(),
      new MemoryAchievementStore(),
      FIXTURE_MANIFEST,
    );
    expect(service.hasManifest()).toBe(true);
    expect(service.isSteamAvailable()).toBe(true);
  });
});

// ── File store integration ──────────────────────────────────

describe('SteamAchievementService with FileAchievementStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('survives a restart via the file store and re-syncs on the next launch', async () => {
    const storePath = path.join(tmpDir, 'achievements.json');
    const { FileAchievementStore } = await import('../../electron/steam-achievements.js');

    // Session 1: offline unlock persists to disk.
    const offline = new FakeAchievementSource({ availability: 'unavailable' });
    const service1 = new SteamAchievementService(
      offline,
      new FileAchievementStore(storePath),
      FIXTURE_MANIFEST,
    );
    await service1.unlock('foodie-row');

    // Session 2: Steam is available; resync replays the persisted unlock.
    const online = new FakeAchievementSource();
    const service2 = new SteamAchievementService(
      online,
      new FileAchievementStore(storePath),
      FIXTURE_MANIFEST,
    );
    expect(await service2.getUnlocked()).toEqual(['foodie-row']);

    const result = await service2.resync();
    expect(result.synced).toBe(1);
    expect(await online.isUnlocked('TCE_TEST_FOODIE_ROW')).toBe(true);
  });

  it('persisted ids are written to disk as JSON', async () => {
    const storePath = path.join(tmpDir, 'achievements.json');
    const { FileAchievementStore } = await import('../../electron/steam-achievements.js');
    const service = new SteamAchievementService(
      new FakeAchievementSource(),
      new FileAchievementStore(storePath),
      FIXTURE_MANIFEST,
    );
    await service.unlock('secret');

    const raw = await fsPromises.readFile(storePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(['secret']);
  });
});
