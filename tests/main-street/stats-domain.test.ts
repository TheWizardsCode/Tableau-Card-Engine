import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MAIN_STREET_STATS_SCHEMA_VERSION,
  MAIN_STREET_STATS_STORAGE_KEY,
  createDefaultStats,
  parseStats,
  serializeStats,
  updateStatsAfterRun,
  loadStats,
  saveStats,
  clearStats,
  resetAllProgress,
  BrowserStatsStorageAdapter,
  type MainStreetStatsV1,
  type StatsStorageAdapter,
} from '../../example-games/main-street/StatsDomain';

// ── In-memory storage adapter for tests ─────────────────────

function createInMemoryStorage(): StatsStorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

function createFakeSaveStore(): { clear: ReturnType<typeof vi.fn> } {
  return { clear: vi.fn().mockResolvedValue(undefined) };
}

// ── Default State ────────────────────────────────────────────

describe('createDefaultStats', () => {
  it('returns all fields at zero/null', () => {
    const stats = createDefaultStats();
    expect(stats).toEqual({
      schemaVersion: 1,
      gamesPlayed: 0,
      wins: 0,
      bestScore: 0,
      lastPlayedAt: null,
    });
  });

  it('uses the canonical schema version constant', () => {
    const stats = createDefaultStats();
    expect(stats.schemaVersion).toBe(MAIN_STREET_STATS_SCHEMA_VERSION);
  });
});

// ── Parsing ──────────────────────────────────────────────────

describe('parseStats', () => {
  it('returns default state when input is null', () => {
    const result = parseStats(null);
    expect(result.gamesPlayed).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.bestScore).toBe(0);
    expect(result.lastPlayedAt).toBeNull();
    expect(result.schemaVersion).toBe(1);
  });

  it('returns default state when input is empty string', () => {
    const result = parseStats('');
    expect(result.gamesPlayed).toBe(0);
  });

  it('returns default state for malformed JSON', () => {
    const result = parseStats('{bad json');
    expect(result.gamesPlayed).toBe(0);
  });

  it('returns default state for wrong schema version', () => {
    const raw = JSON.stringify({ schemaVersion: 99, gamesPlayed: 10, wins: 5, bestScore: 1000, lastPlayedAt: '2026-06-01T00:00:00.000Z' });
    const result = parseStats(raw);
    expect(result.gamesPlayed).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.bestScore).toBe(0);
    expect(result.lastPlayedAt).toBeNull();
  });

  it('returns default state for missing schema version', () => {
    const raw = JSON.stringify({ gamesPlayed: 10, wins: 5, bestScore: 1000, lastPlayedAt: '2026-06-01T00:00:00.000Z' });
    const result = parseStats(raw);
    expect(result.gamesPlayed).toBe(0);
  });

  it('parses a valid stats state', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      gamesPlayed: 42,
      wins: 15,
      bestScore: 2500,
      lastPlayedAt: '2026-06-01T12:00:00.000Z',
    });
    const result = parseStats(raw);
    expect(result.gamesPlayed).toBe(42);
    expect(result.wins).toBe(15);
    expect(result.bestScore).toBe(2500);
    expect(result.lastPlayedAt).toBe('2026-06-01T12:00:00.000Z');
  });

  it('defaults lastPlayedAt to null when absent', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      gamesPlayed: 5,
      wins: 2,
      bestScore: 800,
    });
    const result = parseStats(raw);
    expect(result.lastPlayedAt).toBeNull();
  });

  it('coerces NaN numeric fields to zero', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      gamesPlayed: 'not-a-number',
      wins: null,
      bestScore: undefined,
      lastPlayedAt: '2026-06-01T00:00:00.000Z',
    });
    const result = parseStats(raw);
    expect(result.gamesPlayed).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.bestScore).toBe(0);
  });

  it('coerces missing numeric fields to zero', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      lastPlayedAt: '2026-06-01T00:00:00.000Z',
    });
    const result = parseStats(raw);
    expect(result.gamesPlayed).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.bestScore).toBe(0);
  });

  it('coerces invalid lastPlayedAt (non-string) to null', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      gamesPlayed: 10,
      wins: 3,
      bestScore: 900,
      lastPlayedAt: 12345,
    });
    const result = parseStats(raw);
    expect(result.lastPlayedAt).toBeNull();
  });
});

// ── Serialization ───────────────────────────────────────────

describe('serializeStats', () => {
  it('produces valid JSON that round-trips through parse', () => {
    const stats: MainStreetStatsV1 = {
      schemaVersion: 1,
      gamesPlayed: 100,
      wins: 45,
      bestScore: 3200,
      lastPlayedAt: '2026-06-15T10:30:00.000Z',
    };
    const serialized = serializeStats(stats);
    const parsed = parseStats(serialized);
    expect(parsed).toEqual(stats);
  });

  it('serializes a default stats state correctly', () => {
    const stats = createDefaultStats();
    const serialized = serializeStats(stats);
    const parsed = JSON.parse(serialized);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.gamesPlayed).toBe(0);
    expect(parsed.wins).toBe(0);
    expect(parsed.bestScore).toBe(0);
    expect(parsed.lastPlayedAt).toBeNull();
  });
});

// ── Stats Updates After Run ─────────────────────────────────

describe('updateStatsAfterRun', () => {
  it('increments gamesPlayed on a loss', () => {
    const current = createDefaultStats();
    const updated = updateStatsAfterRun(current, false, 500);
    expect(updated.gamesPlayed).toBe(1);
    expect(updated.wins).toBe(0);
    expect(updated.bestScore).toBe(500);
  });

  it('increments both gamesPlayed and wins on a win', () => {
    const current = createDefaultStats();
    const updated = updateStatsAfterRun(current, true, 1200);
    expect(updated.gamesPlayed).toBe(1);
    expect(updated.wins).toBe(1);
    expect(updated.bestScore).toBe(1200);
  });

  it('updates bestScore when new score is higher', () => {
    const current: MainStreetStatsV1 = {
      schemaVersion: 1,
      gamesPlayed: 10,
      wins: 4,
      bestScore: 1500,
      lastPlayedAt: '2026-06-01T00:00:00.000Z',
    };
    const updated = updateStatsAfterRun(current, false, 2000);
    expect(updated.bestScore).toBe(2000);
    expect(updated.gamesPlayed).toBe(11);
    expect(updated.wins).toBe(4);
  });

  it('does NOT update bestScore when new score is lower', () => {
    const current: MainStreetStatsV1 = {
      schemaVersion: 1,
      gamesPlayed: 5,
      wins: 2,
      bestScore: 2500,
      lastPlayedAt: '2026-06-01T00:00:00.000Z',
    };
    const updated = updateStatsAfterRun(current, true, 1800);
    expect(updated.bestScore).toBe(2500);
    expect(updated.gamesPlayed).toBe(6);
    expect(updated.wins).toBe(3);
  });

  it('updates lastPlayedAt to current ISO timestamp by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T14:00:00.000Z'));
    const current = createDefaultStats();
    const updated = updateStatsAfterRun(current, false, 300);
    expect(updated.lastPlayedAt).toBe('2026-06-18T14:00:00.000Z');
    vi.useRealTimers();
  });

  it('accepts a custom now timestamp', () => {
    const current = createDefaultStats();
    const ts = '2026-01-15T08:30:00.000Z';
    const updated = updateStatsAfterRun(current, true, 800, ts);
    expect(updated.lastPlayedAt).toBe(ts);
  });

  it('returns a new object (does not mutate input)', () => {
    const current = createDefaultStats();
    const updated = updateStatsAfterRun(current, true, 500);
    expect(updated).not.toBe(current);
    expect(current.gamesPlayed).toBe(0);
    expect(current.wins).toBe(0);
  });

  it('preserves bestScore across multiple updates', () => {
    const current = createDefaultStats();
    const afterFirst = updateStatsAfterRun(current, true, 1000);
    const afterSecond = updateStatsAfterRun(afterFirst, false, 800);
    const afterThird = updateStatsAfterRun(afterSecond, true, 1200);
    expect(afterThird.gamesPlayed).toBe(3);
    expect(afterThird.wins).toBe(2);
    expect(afterThird.bestScore).toBe(1200);
  });
});

// ── Persistence (load/save/clear) ───────────────────────────

describe('loadStats', () => {
  it('returns default state when storage is empty', () => {
    const storage = createInMemoryStorage();
    const result = loadStats(storage);
    expect(result.gamesPlayed).toBe(0);
    expect(result.wins).toBe(0);
  });

  it('loads a saved state from storage', () => {
    const storage = createInMemoryStorage();
    const stats: MainStreetStatsV1 = {
      schemaVersion: 1,
      gamesPlayed: 25,
      wins: 10,
      bestScore: 1800,
      lastPlayedAt: '2026-06-10T00:00:00.000Z',
    };
    storage.setItem(MAIN_STREET_STATS_STORAGE_KEY, serializeStats(stats));
    const result = loadStats(storage);
    expect(result).toEqual(stats);
  });

  it('falls back to default for corrupted storage', () => {
    const storage = createInMemoryStorage();
    storage.setItem(MAIN_STREET_STATS_STORAGE_KEY, 'not-json');
    const result = loadStats(storage);
    expect(result.gamesPlayed).toBe(0);
  });

  it('uses a custom storage key when provided', () => {
    const storage = createInMemoryStorage();
    const customKey = 'my-custom-stats-key';
    const stats: MainStreetStatsV1 = {
      schemaVersion: 1,
      gamesPlayed: 5,
      wins: 1,
      bestScore: 600,
      lastPlayedAt: null,
    };
    storage.setItem(customKey, serializeStats(stats));
    const result = loadStats(storage, customKey);
    expect(result.gamesPlayed).toBe(5);
    // Default key should still return default
    expect(loadStats(storage).gamesPlayed).toBe(0);
  });
});

describe('saveStats', () => {
  it('persists state to storage', async () => {
    const storage = createInMemoryStorage();
    const stats: MainStreetStatsV1 = {
      schemaVersion: 1,
      gamesPlayed: 50,
      wins: 20,
      bestScore: 3000,
      lastPlayedAt: '2026-06-15T00:00:00.000Z',
    };
    await saveStats(storage, stats);
    const loaded = loadStats(storage);
    expect(loaded).toEqual(stats);
  });

  it('uses a custom storage key when provided', async () => {
    const storage = createInMemoryStorage();
    const stats = createDefaultStats();
    await saveStats(storage, stats, 'custom-key');
    expect(loadStats(storage).gamesPlayed).toBe(0);
    expect(loadStats(storage, 'custom-key').gamesPlayed).toBe(0);
    const raw = storage.getItem('custom-key');
    expect(raw).not.toBeNull();
  });
});

describe('clearStats', () => {
  it('removes stats from storage', () => {
    const storage = createInMemoryStorage();
    const stats = createDefaultStats();
    storage.setItem(MAIN_STREET_STATS_STORAGE_KEY, serializeStats(stats));
    clearStats(storage);
    expect(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)).toBeNull();
  });
});

// ── Reset All Progress ──────────────────────────────────────

describe('resetAllProgress', () => {
  it('clears standalone stats from storage', async () => {
    const storage = createInMemoryStorage();
    const saveStore = createFakeSaveStore();
    storage.setItem(MAIN_STREET_STATS_STORAGE_KEY, serializeStats(createDefaultStats()));
    await resetAllProgress(storage, saveStore);
    expect(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)).toBeNull();
  });

  it('clears campaign progress via SaveLoadStore', async () => {
    const storage = createInMemoryStorage();
    const saveStore = createFakeSaveStore();
    await resetAllProgress(storage, saveStore);
    expect(saveStore.clear).toHaveBeenCalledWith('campaign', 'main-street');
  });

  it('resets both stats and campaign progress', async () => {
    const storage = createInMemoryStorage();
    const saveStore = createFakeSaveStore();
    storage.setItem(MAIN_STREET_STATS_STORAGE_KEY, serializeStats({
      schemaVersion: 1,
      gamesPlayed: 100,
      wins: 40,
      bestScore: 5000,
      lastPlayedAt: '2026-06-18T00:00:00.000Z',
    }));
    await resetAllProgress(storage, saveStore);
    // Stats cleared
    expect(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)).toBeNull();
    // Campaign cleared
    expect(saveStore.clear).toHaveBeenCalledTimes(1);
  });

  it('uses a custom stats storage key when provided', async () => {
    const storage = createInMemoryStorage();
    const saveStore = createFakeSaveStore();
    const customKey = 'custom-stats-key';
    storage.setItem(customKey, serializeStats(createDefaultStats()));
    await resetAllProgress(storage, saveStore, customKey);
    expect(storage.getItem(customKey)).toBeNull();
    // Default key should remain untouched
    expect(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)).toBeNull(); // was never set
  });
});

// ── BrowserStatsStorageAdapter ──────────────────────────────

describe('BrowserStatsStorageAdapter', () => {
  let mockStorage: Map<string, string>;
  let adapter: BrowserStatsStorageAdapter;

  beforeEach(() => {
    mockStorage = new Map();
    const fakeLocalStorage: Storage = {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); },
      clear: () => { mockStorage.clear(); },
      get length() { return mockStorage.size; },
      key: (index: number) => [...mockStorage.keys()][index] ?? null,
    };
    vi.stubGlobal('window', { localStorage: fakeLocalStorage });
    adapter = new BrowserStatsStorageAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes and reads via the adapter', () => {
    adapter.setItem('test-key', 'test-value');
    expect(adapter.getItem('test-key')).toBe('test-value');
  });

  it('removes items via the adapter', () => {
    adapter.setItem('test-key', 'test-value');
    adapter.removeItem('test-key');
    expect(adapter.getItem('test-key')).toBeNull();
  });

  it('returns null when window is undefined', () => {
    vi.stubGlobal('window', undefined);
    const noWindowAdapter = new BrowserStatsStorageAdapter();
    expect(noWindowAdapter.getItem('any-key')).toBeNull();
    expect(() => noWindowAdapter.setItem('any-key', 'value')).not.toThrow();
    expect(() => noWindowAdapter.removeItem('any-key')).not.toThrow();
  });
});
