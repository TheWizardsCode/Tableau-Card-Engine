/**
 * Unit tests for autoSaveTranscript – fire-and-forget transcript
 * persistence helper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoSaveTranscript } from '../../src/core-engine/autoSaveTranscript';
import type { TranscriptStore, StoredTranscript } from '../../src/core-engine/TranscriptStore';

// ── Mock helpers ────────────────────────────────────────────

function createMockStore(
  result: StoredTranscript<unknown> | null = null,
  shouldReject = false,
): TranscriptStore {
  const saveFn = shouldReject
    ? vi.fn().mockRejectedValue(new Error('Storage error'))
    : vi.fn().mockResolvedValue(result);

  return { save: saveFn } as unknown as TranscriptStore;
}

function createStoredResult(
  id = 'golf-001',
  gameType = 'golf',
): StoredTranscript<unknown> {
  return {
    id,
    gameType,
    savedAt: '2026-02-25T00:00:00.000Z',
    seq: 1,
    transcript: {},
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('autoSaveTranscript', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls store.save with the correct gameType and transcript', async () => {
    const store = createMockStore(createStoredResult());
    const transcript = { version: 1, events: [] };

    autoSaveTranscript(store, 'golf', transcript);

    // Let the microtask resolve
    await vi.waitFor(() => {
      expect(store.save).toHaveBeenCalledWith('golf', transcript);
    });
  });

  it('logs success info when save returns a stored entry', async () => {
    const stored = createStoredResult('sushi-go-042', 'sushi-go');
    const store = createMockStore(stored);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    autoSaveTranscript(store, 'sushi-go', {});

    await vi.waitFor(() => {
      expect(infoSpy).toHaveBeenCalledOnce();
      expect(infoSpy.mock.calls[0][0]).toContain('sushi-go-042');
      expect(infoSpy.mock.calls[0][0]).toContain('sushi-go');
    });
  });

  it('logs warning when save returns null (no backend)', async () => {
    const store = createMockStore(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    autoSaveTranscript(store, 'feudalism', {});

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('not saved');
    });
  });

  it('logs error when save rejects', async () => {
    const store = createMockStore(null, true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    autoSaveTranscript(store, 'golf', {});

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy.mock.calls[0][0]).toContain('Failed to auto-save');
    });
  });

  it('uses gameType as default log prefix', async () => {
    const stored = createStoredResult();
    const store = createMockStore(stored);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    autoSaveTranscript(store, 'golf', {});

    await vi.waitFor(() => {
      expect(infoSpy.mock.calls[0][0]).toMatch(/^\[golf\]/);
    });
  });

  it('uses custom logPrefix when provided', async () => {
    const stored = createStoredResult();
    const store = createMockStore(stored);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    autoSaveTranscript(store, 'golf', {}, '[GolfScene]');

    await vi.waitFor(() => {
      expect(infoSpy.mock.calls[0][0]).toMatch(/^\[GolfScene\]/);
    });
  });

  it('uses custom logPrefix in warning messages', async () => {
    const store = createMockStore(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    autoSaveTranscript(store, 'golf', {}, '[MyGame]');

    await vi.waitFor(() => {
      expect(warnSpy.mock.calls[0][0]).toMatch(/^\[MyGame\]/);
    });
  });

  it('uses custom logPrefix in error messages', async () => {
    const store = createMockStore(null, true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    autoSaveTranscript(store, 'golf', {}, '[TestGame]');

    await vi.waitFor(() => {
      expect(errorSpy.mock.calls[0][0]).toMatch(/^\[TestGame\]/);
    });
  });
});
