import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAIN_STREET_STATS_STORAGE_KEY,
  MAIN_STREET_STATS_SCHEMA_VERSION,
  type StatsStorageAdapter,
} from '../../example-games/main-street/StatsDomain';

// ── In-memory storage for tests ─────────────────────────────

function createInMemoryStorage(): StatsStorageAdapter & { _data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    _data: data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

/**
 * Creates a minimal mock scene with the properties needed by updateStats().
 */
function createMockScene(
  overrides: { replayMode?: boolean } = {},
): any {
  return {
    replayMode: overrides.replayMode ?? false,
  };
}

/**
 * Creates a mock MainStreetLifecycleManager that wraps the real updateStats
 * logic but allows injecting a custom storage adapter.
 */
function createLifecycleManager(
  scene: any,
  storage: StatsStorageAdapter,
): { updateStats: (gameResult: 'win' | 'loss', finalScore: number) => Promise<void> } {
  return {
    async updateStats(gameResult: 'win' | 'loss', finalScore: number): Promise<void> {
      if (scene.replayMode) return;

      // Inline the real logic from MainStreetLifecycleManager.updateStats()
      // but using the injected storage adapter instead of BrowserStatsStorageAdapter.
      const {
        loadStats,
        saveStats,
        updateStatsAfterRun,
      } = await import('../../example-games/main-street/StatsDomain');

      const current = loadStats(storage);
      const updated = updateStatsAfterRun(current, gameResult === 'win', finalScore);
      await saveStats(storage, updated);
    },
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('Stats update integration (run-end hook)', () => {
  let storage: ReturnType<typeof createInMemoryStorage>;
  let scene: any;
  let lifecycle: ReturnType<typeof createLifecycleManager>;

  beforeEach(() => {
    storage = createInMemoryStorage();
    scene = createMockScene({ replayMode: false });
    lifecycle = createLifecycleManager(scene, storage);
  });

  it('updates stats after a win', async () => {
    await lifecycle.updateStats('win', 1500);

    const raw = storage.getItem(MAIN_STREET_STATS_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(MAIN_STREET_STATS_SCHEMA_VERSION);
    expect(parsed.gamesPlayed).toBe(1);
    expect(parsed.wins).toBe(1);
    expect(parsed.bestScore).toBe(1500);
    expect(parsed.lastPlayedAt).toBeTypeOf('string');
  });

  it('updates stats after a loss', async () => {
    await lifecycle.updateStats('loss', 300);

    const raw = storage.getItem(MAIN_STREET_STATS_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.gamesPlayed).toBe(1);
    expect(parsed.wins).toBe(0);
    expect(parsed.bestScore).toBe(300);
  });

  it('accumulates stats across multiple runs', async () => {
    // Run 1: win, score 2000
    await lifecycle.updateStats('win', 2000);

    // Run 2: loss, score 800
    await lifecycle.updateStats('loss', 800);

    // Run 3: win, score 2500 (new best)
    await lifecycle.updateStats('win', 2500);

    // Run 4: loss, score 1000
    await lifecycle.updateStats('loss', 1000);

    const raw = storage.getItem(MAIN_STREET_STATS_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.gamesPlayed).toBe(4);
    expect(parsed.wins).toBe(2);
    expect(parsed.bestScore).toBe(2500);
  });

  it('updates lastPlayedAt to the most recent run timestamp', async () => {
    // First run
    await lifecycle.updateStats('win', 500);
    const afterFirst = JSON.parse(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)!);
    const firstTs = afterFirst.lastPlayedAt;

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));

    // Second run
    await lifecycle.updateStats('loss', 200);
    const afterSecond = JSON.parse(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)!);

    expect(afterSecond.lastPlayedAt).not.toBe(firstTs);
    // Both should be valid ISO strings
    expect(firstTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(afterSecond.lastPlayedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does NOT update stats when replayMode is true', async () => {
    const replayScene = createMockScene({ replayMode: true });
    const replayLifecycle = createLifecycleManager(replayScene, storage);

    // Pre-seed with some stats
    storage.setItem(
      MAIN_STREET_STATS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        gamesPlayed: 10,
        wins: 5,
        bestScore: 3000,
        lastPlayedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    await replayLifecycle.updateStats('win', 5000);

    // Stats should remain unchanged
    const raw = storage.getItem(MAIN_STREET_STATS_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.gamesPlayed).toBe(10);
    expect(parsed.wins).toBe(5);
    expect(parsed.bestScore).toBe(3000);
    expect(parsed.lastPlayedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('handles first run from empty storage gracefully', async () => {
    // Ensure storage is empty
    expect(storage.getItem(MAIN_STREET_STATS_STORAGE_KEY)).toBeNull();

    await lifecycle.updateStats('win', 1000);

    const raw = storage.getItem(MAIN_STREET_STATS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.gamesPlayed).toBe(1);
    expect(parsed.wins).toBe(1);
  });

  it('handles corrupted storage gracefully (falls back to defaults then overwrites)', async () => {
    storage.setItem(MAIN_STREET_STATS_STORAGE_KEY, '{corrupted-json');

    await lifecycle.updateStats('win', 750);

    const raw = storage.getItem(MAIN_STREET_STATS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    // Should have fallen back to defaults and then updated
    expect(parsed.gamesPlayed).toBe(1);
    expect(parsed.wins).toBe(1);
    expect(parsed.bestScore).toBe(750);
  });
});
