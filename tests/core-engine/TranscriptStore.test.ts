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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
});
