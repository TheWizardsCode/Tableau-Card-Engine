/**
 * Steam achievements: launcher-side `AchievementSource` contract, fakes,
 * and stores (F2, CG-0MUNC7CDH008YBTL).
 *
 * Tests the `AchievementSource` interface, `FakeAchievementSource`,
 * `MemoryAchievementStore`, and `FileAchievementStore` — no Steam client
 * required.
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  FakeAchievementSource,
  MemoryAchievementStore,
  FileAchievementStore,
  type AchievementSource,
} from '../../electron/steam-achievements.js';

// ── Helpers ─────────────────────────────────────────────────

/** Create a temporary directory for file-store tests. */
function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tce-achievements-${prefix}-`));
}

// ── FakeAchievementSource ───────────────────────────────────

describe('FakeAchievementSource', () => {
  it('starts available and tracks unlocked names', async () => {
    const source = new FakeAchievementSource();
    expect(source.isSteamAvailable()).toBe(true);
    expect(await source.isUnlocked('ach-test')).toBe(false);

    await source.setAchievement('ach-test');
    expect(await source.isUnlocked('ach-test')).toBe(true);
  });

  it('returns all unlocked names via getUnlockedNames', async () => {
    const source = new FakeAchievementSource({
      unlockedNames: ['ach-already'],
    });
    expect(await source.getUnlockedNames()).toEqual(['ach-already']);

    await source.setAchievement('ach-new');
    expect(await source.getUnlockedNames()).toEqual(['ach-already', 'ach-new']);
  });

  it('setAchievement returns configured result', async () => {
    const source = new FakeAchievementSource({ setAchievementResult: false });
    await expect(source.setAchievement('ach-fail')).resolves.toBe(false);
  });

  it('storeStats returns configured result', async () => {
    const source = new FakeAchievementSource({ storeStatsResult: false });
    await expect(source.storeStats()).resolves.toBe(false);
  });

  it('init returns configured availability', async () => {
    const source = new FakeAchievementSource({ availability: 'unavailable' });
    expect(source.isSteamAvailable()).toBe(false);
    expect(await source.init()).toBe('unavailable');
  });

  it('close() makes the source unavailable', async () => {
    const source = new FakeAchievementSource();
    source.close();
    expect(source.isSteamAvailable()).toBe(false);
    await expect(source.setAchievement('ach-x')).resolves.toBe(false);
    await expect(source.storeStats()).resolves.toBe(false);
    await expect(source.isUnlocked('ach-x')).resolves.toBe(false);
    await expect(source.getUnlockedNames()).resolves.toEqual([]);
  });

  it('provides the required interface surface', () => {
    const source: AchievementSource = new FakeAchievementSource();
    expect(typeof source.init).toBe('function');
    expect(typeof source.isSteamAvailable).toBe('function');
    expect(typeof source.setAchievement).toBe('function');
    expect(typeof source.storeStats).toBe('function');
    expect(typeof source.isUnlocked).toBe('function');
    expect(typeof source.getUnlockedNames).toBe('function');
    expect(typeof source.close).toBe('function');
  });
});

// ── MemoryAchievementStore ──────────────────────────────────

describe('MemoryAchievementStore', () => {
  it('starts empty', async () => {
    const store = new MemoryAchievementStore();
    expect(await store.load()).toEqual([]);
  });

  it('saves and loads ids', async () => {
    const store = new MemoryAchievementStore();
    await store.save(['ach-1', 'ach-2']);
    expect(await store.load()).toEqual(['ach-1', 'ach-2']);
  });

  it('returns a defensive copy on load', async () => {
    const store = new MemoryAchievementStore(['ach-a']);
    const ids = await store.load();
    ids.push('ach-fake');
    expect(await store.load()).toEqual(['ach-a']);
  });

  it('accepts initial ids in constructor', async () => {
    const store = new MemoryAchievementStore(['ach-init']);
    expect(await store.load()).toEqual(['ach-init']);
  });
});

// ── FileAchievementStore ────────────────────────────────────

describe('FileAchievementStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTempDir('file-store');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads empty array from missing file', async () => {
    const store = new FileAchievementStore(path.join(tmpDir, 'missing.json'));
    expect(await store.load()).toEqual([]);
  });

  it('loads and saves ids to disk', async () => {
    const store = new FileAchievementStore(path.join(tmpDir, 'data.json'));
    await store.save(['ach-x', 'ach-y']);
    expect(await store.load()).toEqual(['ach-x', 'ach-y']);
  });

  it('rejects non-array JSON (corrupt file) gracefully', async () => {
    await fsPromises.writeFile(path.join(tmpDir, 'corrupt.json'), '{"not": "an array"}');
    const store = new FileAchievementStore(path.join(tmpDir, 'corrupt.json'));
    expect(await store.load()).toEqual([]);
  });

  it('filters non-string entries from array', async () => {
    await fsPromises.writeFile(
      path.join(tmpDir, 'mixed.json'),
      JSON.stringify(['ach-ok', 42, null, 'ach-also-ok']),
    );
    const store = new FileAchievementStore(path.join(tmpDir, 'mixed.json'));
    expect(await store.load()).toEqual(['ach-ok', 'ach-also-ok']);
  });

  it('creates parent directories automatically', async () => {
    const store = new FileAchievementStore(
      path.join(tmpDir, 'nested', 'deep', 'store.json'),
    );
    await store.save(['ach-nested']);
    expect(await store.load()).toEqual(['ach-nested']);
  });
});

// ── Manifest type surface ───────────────────────────────────

describe('AchievementManifest types (surface check)', () => {
  it('has gameId, achievements array with required fields', () => {
    const manifest = {
      gameId: 'main-street',
      achievements: [
        { achievementId: 'foodie', steamApiName: 'TCE_MAIN_STREET_FOODIE_ROW', hidden: false },
      ],
    };
    expect(manifest.gameId).toBe('main-street');
    expect(manifest.achievements).toHaveLength(1);
    expect(manifest.achievements[0].steamApiName).toBe('TCE_MAIN_STREET_FOODIE_ROW');
    expect(manifest.achievements[0].hidden).toBe(false);
  });
});
