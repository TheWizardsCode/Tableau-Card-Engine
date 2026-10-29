import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranscriptStore } from '../../src/core-engine/TranscriptStore';

// ── Test helpers ───────────────────────────────────────────

/** A minimal fake transcript for testing. */
function fakeTranscript(id: number = 1) {
  return {
    version: 1 as const,
    gameId: `game-${id}`,
    turns: Array.from({ length: id }, (_, i) => ({ turn: i })),
  };
}

/**
 * Disk-persistence log lines only.
 *
 * The store also warns about unrelated conditions (e.g. the localStorage
 * fallback), so log-volume assertions filter to the disk-mirror messages.
 */
function diskLogs(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => line.includes('Disk persistence') || line.includes('persistence endpoint'));
}

// ── localStorage mock ──────────────────────────────────────

/**
 * Minimal in-memory localStorage mock.
 * The TranscriptStore localStorage backend uses getItem/setItem/removeItem.
 */
function createLocalStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

// ── Tests ──────────────────────────────────────────────────

describe('TranscriptStore', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createLocalStorageMock();

    // Ensure indexedDB is not defined so the store falls back to localStorage
    if (typeof globalThis.indexedDB !== 'undefined') {
      vi.stubGlobal('indexedDB', undefined);
    }

    // Provide a working localStorage mock
    vi.stubGlobal('localStorage', mockStorage);

    // Stub fetch to a no-op so the fire-and-forget POST in save() doesn't
    // produce noisy ERR_INVALID_URL warnings under Node (relative URLs are
    // not supported by Node's native fetch). Individual tests in the
    // "disk persistence POST" describe block override this with their own mocks.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    // Silence console.warn from postToDisk in tests that don't care about it
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('should export TranscriptStore from barrel', async () => {
    const { TranscriptStore: Exported } = await import(
      '../../src/core-engine/index'
    );
    expect(typeof Exported).toBe('function');
  });

  describe('save and retrieve', () => {
    it('should save a transcript and retrieve it by ID', async () => {
      const store = new TranscriptStore();
      const transcript = fakeTranscript(1);

      const stored = await store.save('golf', transcript);
      expect(stored).not.toBeNull();
      expect(stored!.gameType).toBe('golf');
      expect(stored!.transcript).toEqual(transcript);
      expect(stored!.id).toMatch(/^golf-/);
      expect(stored!.savedAt).toBeTruthy();

      const retrieved = await store.get(stored!.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.transcript).toEqual(transcript);
    });

    it('should return null when getting a non-existent ID', async () => {
      const store = new TranscriptStore();
      const retrieved = await store.get('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should list transcripts for a game type, newest first', async () => {
      const store = new TranscriptStore();

      // Save three transcripts with slight time gaps
      const t1 = await store.save('golf', fakeTranscript(1));
      const t2 = await store.save('golf', fakeTranscript(2));
      const t3 = await store.save('golf', fakeTranscript(3));

      const list = await store.list('golf');
      expect(list).toHaveLength(3);
      // Newest first
      expect(list[0].id).toBe(t3!.id);
      expect(list[1].id).toBe(t2!.id);
      expect(list[2].id).toBe(t1!.id);
    });

    it('should only list transcripts for the requested game type', async () => {
      const store = new TranscriptStore();

      await store.save('golf', fakeTranscript(1));
      await store.save('solitaire', fakeTranscript(2));
      await store.save('golf', fakeTranscript(3));

      const golfList = await store.list('golf');
      expect(golfList).toHaveLength(2);
      expect(golfList.every((e) => e.gameType === 'golf')).toBe(true);

      const solList = await store.list('solitaire');
      expect(solList).toHaveLength(1);
      expect(solList[0].gameType).toBe('solitaire');
    });
  });

  describe('rolling window eviction', () => {
    it('should evict oldest when exceeding maxPerGame', async () => {
      const store = new TranscriptStore({ maxPerGame: 3 });

      for (let i = 1; i <= 5; i++) {
        await store.save('golf', fakeTranscript(i));
      }

      const list = await store.list('golf');
      expect(list).toHaveLength(3);

      // The 3 retained transcripts should be the last 3 saved
      // (identified by their content since IDs/timestamps can collide)
      const retainedTurns = list.map(
        (e) => (e.transcript as { turns: { turn: number }[] }).turns.length,
      );
      retainedTurns.sort((a, b) => a - b);
      expect(retainedTurns).toEqual([3, 4, 5]);
    });

    it('should keep exactly maxPerGame transcripts after many saves', async () => {
      const store = new TranscriptStore({ maxPerGame: 2 });

      for (let i = 1; i <= 10; i++) {
        await store.save('golf', fakeTranscript(i));
      }

      const list = await store.list('golf');
      expect(list).toHaveLength(2);
    });

    it('should evict per game type independently', async () => {
      const store = new TranscriptStore({ maxPerGame: 2 });

      await store.save('golf', fakeTranscript(1));
      await store.save('golf', fakeTranscript(2));
      await store.save('golf', fakeTranscript(3));

      await store.save('solitaire', fakeTranscript(1));
      await store.save('solitaire', fakeTranscript(2));

      const golfList = await store.list('golf');
      expect(golfList).toHaveLength(2);

      const solList = await store.list('solitaire');
      expect(solList).toHaveLength(2);
    });

    it('should use default maxPerGame of 10', async () => {
      const store = new TranscriptStore();

      for (let i = 1; i <= 12; i++) {
        await store.save('golf', fakeTranscript(i));
      }

      const list = await store.list('golf');
      expect(list).toHaveLength(10);
    });
  });

  describe('remove', () => {
    it('should remove a specific transcript by ID', async () => {
      const store = new TranscriptStore();

      const t1 = await store.save('golf', fakeTranscript(1));
      const t2 = await store.save('golf', fakeTranscript(2));

      await store.remove(t1!.id);

      const list = await store.list('golf');
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(t2!.id);

      const removed = await store.get(t1!.id);
      expect(removed).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all transcripts when no gameType given', async () => {
      const store = new TranscriptStore();

      await store.save('golf', fakeTranscript(1));
      await store.save('solitaire', fakeTranscript(2));

      await store.clear();

      expect(await store.list('golf')).toHaveLength(0);
      expect(await store.list('solitaire')).toHaveLength(0);
    });

    it('should clear only the specified game type', async () => {
      const store = new TranscriptStore();

      await store.save('golf', fakeTranscript(1));
      await store.save('solitaire', fakeTranscript(2));

      await store.clear('golf');

      expect(await store.list('golf')).toHaveLength(0);
      expect(await store.list('solitaire')).toHaveLength(1);
    });
  });

  describe('no storage available', () => {
    it('should return null from save when no backend is available', async () => {
      vi.stubGlobal('indexedDB', undefined);
      vi.stubGlobal('localStorage', undefined);

      const store = new TranscriptStore();
      const result = await store.save('golf', fakeTranscript(1));
      expect(result).toBeNull();
    });

    it('should return empty list when no backend is available', async () => {
      vi.stubGlobal('indexedDB', undefined);
      vi.stubGlobal('localStorage', undefined);

      const store = new TranscriptStore();
      const list = await store.list('golf');
      expect(list).toHaveLength(0);
    });

    it('should return null from get when no backend is available', async () => {
      vi.stubGlobal('indexedDB', undefined);
      vi.stubGlobal('localStorage', undefined);

      const store = new TranscriptStore();
      const result = await store.get('some-id');
      expect(result).toBeNull();
    });

    it('should not throw from remove/clear when no backend is available', async () => {
      vi.stubGlobal('indexedDB', undefined);
      vi.stubGlobal('localStorage', undefined);

      const store = new TranscriptStore();
      await expect(store.remove('some-id')).resolves.toBeUndefined();
      await expect(store.clear()).resolves.toBeUndefined();
    });
  });

  describe('backend detection', () => {
    it('should report localStorage as backend when indexedDB is unavailable', async () => {
      const store = new TranscriptStore();
      const name = await store.getBackendName();
      expect(name).toBe('localStorage');
    });

    it('should report null when no backend is available', async () => {
      vi.stubGlobal('indexedDB', undefined);
      vi.stubGlobal('localStorage', undefined);

      const store = new TranscriptStore();
      const name = await store.getBackendName();
      expect(name).toBeNull();
    });
  });

  describe('stored transcript structure', () => {
    it('should include all required metadata fields', async () => {
      const store = new TranscriptStore();
      const transcript = fakeTranscript(1);
      const stored = await store.save('golf', transcript);

      expect(stored).toMatchObject({
        gameType: 'golf',
        transcript,
      });
      expect(stored!.id).toEqual(expect.any(String));
      expect(stored!.savedAt).toEqual(expect.any(String));
      // Validate ISO 8601
      expect(new Date(stored!.savedAt).toISOString()).toBe(stored!.savedAt);
    });
  });

  describe('disk persistence POST', () => {
    it('should fire a POST to /api/transcripts after saving', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchMock);

      const store = new TranscriptStore();
      const transcript = fakeTranscript(1);
      await store.save('golf', transcript);

      // Allow the fire-and-forget promise to settle
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      expect(fetchMock).toHaveBeenCalledWith('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'golf', transcript }),
      });
    });

    it('skips the POST entirely when not running under a Vite dev server', async () => {
      // The endpoint only exists behind the dev server's transcript plugin
      // (production/Electron bundles, and Vitest browser runs, have no
      // `/api/transcripts` middleware). Issuing the request there can only
      // produce noise, so the DEV gate removes it entirely
      // (MS-0MVREB31W004F48D). The gate reads `import.meta.env.DEV` through
      // `isDevMode()`, which is overridden here so the test does not depend on
      // the runner's injected Vite env.
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchMock);

      class NonDevStore extends TranscriptStore {
        protected override isDevMode(): boolean {
          return false;
        }
      }
      const store = new NonDevStore();
      const result = await store.save('golf', fakeTranscript(1));

      // Save still succeeds — only the disk mirror is skipped.
      expect(result).not.toBeNull();
      // Give any stray microtask a chance to run before asserting absence.
      await Promise.resolve();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should still return StoredTranscript when POST returns HTTP 500, warning once', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', fetchMock);

      const store = new TranscriptStore();
      const transcript = fakeTranscript(1);
      const result = await store.save('golf', transcript);

      expect(result).not.toBeNull();
      expect(result!.gameType).toBe('golf');

      // Allow the fire-and-forget promise to settle and check warning
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Disk persistence POST returned HTTP 500'),
      ));
    });

    it('logs an absent endpoint (HTTP 404) at most once, at debug, across repeated saves', async () => {
      // A missing `/api/transcripts` middleware (a game repo whose generated
      // `vite.config.ts` does not register the plugin, or any runtime without
      // it) is an *expected* absence: report it once, quietly, and stay silent
      // afterwards instead of warning on every single game-over.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal('fetch', fetchMock);

      const store = new TranscriptStore();
      for (let i = 0; i < 3; i += 1) {
        await store.save('main-street', fakeTranscript(i + 1));
      }

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(String(debugSpy.mock.calls[0]?.[0])).toContain('HTTP 404');
      // No warning or error for an expected absence (the store's unrelated
      // localStorage-fallback note is not a disk-persistence log).
      expect(diskLogs(warnSpy)).toEqual([]);
      expect(diskLogs(errorSpy)).toEqual([]);
    });

    it('logs a network failure at most once, at debug, across repeated saves', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const store = new TranscriptStore();
      for (let i = 0; i < 3; i += 1) {
        await store.save('golf', fakeTranscript(i + 1));
      }

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(String(debugSpy.mock.calls[0]?.[0])).toContain('Disk persistence POST failed');
      expect(diskLogs(warnSpy)).toEqual([]);
      expect(diskLogs(errorSpy)).toEqual([]);
    });

    it('should not call fetch when fetch is undefined', async () => {
      // In environments without fetch (e.g. older Node), the POST should be skipped
      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', undefined);

      const store = new TranscriptStore();
      const transcript = fakeTranscript(1);
      const result = await store.save('golf', transcript);

      expect(result).not.toBeNull();
      expect(result!.gameType).toBe('golf');

      // Restore fetch
      if (originalFetch) {
        vi.stubGlobal('fetch', originalFetch);
      }
    });
  });
});
