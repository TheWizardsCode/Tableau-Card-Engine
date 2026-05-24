/**
 * Integration test for Main Street transcript autosave and save/load
 * using the consolidated `src/core-engine/transcript` module.
 *
 * Exercises:
 * - TranscriptRecorderBase via MainStreetTranscriptRecorder
 * - autoSaveTranscript helper
 * - TranscriptStore persistence
 * - SaveLoadStore checkpoint save/load round-trip
 *
 * Satisfies: CG-0MP12WI75001L9P4 AC#2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TranscriptStore,
  autoSaveTranscript,
  TranscriptRecorderBase,
} from '../../src/core-engine/transcript';
import { SaveLoadStore } from '../../src/core-engine';
import {
  setupMainStreetGame,
  serializeMainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import {
  MainStreetTranscriptRecorder,
  finalizeMainStreetTranscript,
  setMainStreetRecorder,
  recordMainStreetEvent,
} from '../../example-games/main-street/MainStreetTranscript';
import {
  saveTurnStartCheckpoint,
  loadTurnStartCheckpoint,
} from '../../example-games/main-street/MainStreetSaveLoad';

// ── Test helpers ────────────────────────────────────────────

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

/** Run a few turns of Main Street with deterministic actions. */
function playTurns(state: ReturnType<typeof setupMainStreetGame>, turns: number): void {
  for (let t = 0; t < turns; t++) {
    if (state.gameResult !== 'playing') break;
    executeDayStart(state);
    // Try to buy first affordable business
    const affordable = state.market.business.filter(
      (c) => c.cost <= state.resourceBank.coins,
    );
    const emptyIdx = state.streetGrid.findIndex((b) => b === null);
    if (affordable.length > 0 && emptyIdx >= 0) {
      const card = affordable[0];
      try {
        executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: emptyIdx });
        recordMainStreetEvent({
          type: 'action',
          turn: state.turn,
          action: { type: 'buy-business', cardId: card.id },
          description: `Bought ${card.id}`,
        });
      } catch (_) { /* skip illegal */ }
    }
    processEndOfTurn(state);
    recordMainStreetEvent({ type: 'turn-end', turn: state.turn });
  }
}

// ── Tests ───────────────────────────────────────────────────

describe('Main Street transcript autosave integration (CG-0MP12WI75001L9P4)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Reset global recorder
    setMainStreetRecorder(null);
  });

  it('records events and finalizes transcript correctly', () => {
    const state = setupMainStreetGame({ seed: 'transcript-test-1' });
    const initialSnapshot = serializeMainStreetState(state);
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    playTurns(state, 2);

    const result = { gameResult: state.gameResult, finalScore: 0 };
    const transcript = finalizeMainStreetTranscript(result);

    expect(transcript).not.toBeNull();
    expect(transcript!.gameType).toBe('main-street');
    expect(transcript!.endedAt).not.toBe('');
    expect(transcript!.results).toEqual(result);
    expect(transcript!.events.length).toBeGreaterThan(0);
  });

  it('autoSaveTranscript persists the finalized transcript', async () => {
    const state = setupMainStreetGame({ seed: 'autosave-test-1' });
    const initialSnapshot = serializeMainStreetState(state);
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    playTurns(state, 2);

    const result = { gameResult: state.gameResult, finalScore: 0 };
    const transcript = finalizeMainStreetTranscript(result);
    expect(transcript).not.toBeNull();

    const store = new TranscriptStore();
    autoSaveTranscript(store, 'main-street', transcript!);

    // Wait for fire-and-forget save to complete
    await vi.waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Transcript saved'),
      );
    });

    // Verify the transcript is in storage
    const saved = await store.list('main-street');
    expect(saved.length).toBeGreaterThan(0);
    const st = saved[0].transcript as { gameType: string };
    expect(st.gameType).toBe('main-street');
  });

  it('full save/load + autosave round-trip: checkpoint and transcript survive storage restart', async () => {
    const SEED = 'full-roundtrip-1';

    // Phase 1: Set up recorder, play some turns
    const state = setupMainStreetGame({ seed: SEED });
    const initialSnapshot = serializeMainStreetState(state);
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    const saveStore = new SaveLoadStore();
    const transcriptStore = new TranscriptStore();

    playTurns(state, 2);

    // Save checkpoint
    await saveTurnStartCheckpoint(saveStore, state);

    // Auto-save transcript
    const partialResult = { gameResult: 'playing', finalScore: 0 };
    const partialTranscript = finalizeMainStreetTranscript(partialResult);
    expect(partialTranscript).not.toBeNull();
    autoSaveTranscript(transcriptStore, 'main-street', partialTranscript!);

    await vi.waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Transcript saved'),
      );
    });

    // Phase 2: Load checkpoint and verify state matches
    const restored = await loadTurnStartCheckpoint(saveStore);
    expect(restored).not.toBeNull();
    expect(restored!.turn).toBe(state.turn);
    expect(restored!.resourceBank.coins).toBe(state.resourceBank.coins);
    expect(restored!.streetGrid.map((b) => b?.id ?? null)).toEqual(
      state.streetGrid.map((b) => b?.id ?? null),
    );

    // Phase 3: Verify transcript was persisted
    const savedTranscripts = await transcriptStore.list('main-street');
    expect(savedTranscripts.length).toBeGreaterThan(0);
    const retrieved = await transcriptStore.get(savedTranscripts[0].id);
    expect(retrieved).not.toBeNull();
    const rt = retrieved!.transcript as { gameType: string; events: unknown[] };
    expect(rt.gameType).toBe('main-street');
    expect(rt.events.length).toBeGreaterThan(0);
  });

  it('TranscriptRecorderBase is used correctly by MainStreetTranscriptRecorder', () => {
    const state = setupMainStreetGame({ seed: 'base-class-test' });
    const initialSnapshot = serializeMainStreetState(state);
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    // Verify it extends TranscriptRecorderBase
    expect(recorder).toBeInstanceOf(TranscriptRecorderBase);

    // Verify getTranscript returns the same object
    const t1 = recorder.getTranscript();
    const t2 = recorder.getTranscript();
    expect(t1).toBe(t2);

    // Verify events accumulate via global recorder
    recordMainStreetEvent({ type: 'info', turn: 1, message: 'test' });
    const t3 = recorder.getTranscript();
    expect(t3.events.length).toBe(1);
    expect(t3.events[0].type).toBe('info');
  });

  it('consolidated module exports are accessible from @core-engine/transcript barrel', async () => {
    const mod = await import('../../src/core-engine/transcript');
    expect(mod.TranscriptRecorderBase).toBeDefined();
    expect(mod.TranscriptStore).toBeDefined();
    expect(mod.autoSaveTranscript).toBeDefined();
    expect(mod.snapshotCard).toBeDefined();
    // CardSnapshot and BaseTranscript are type-only exports (not runtime values)
    expect(Object.keys(mod)).not.toContain('CardSnapshot');
    expect(Object.keys(mod)).not.toContain('BaseTranscript');
  });

  it('backward-compatible top-level exports still work', async () => {
    const ts = await import('../../src/core-engine/TranscriptStore');
    expect(ts.TranscriptStore).toBeDefined();

    const tr = await import('../../src/core-engine/TranscriptRecorder');
    expect(tr.TranscriptRecorderBase).toBeDefined();

    const as = await import('../../src/core-engine/autoSaveTranscript');
    expect(as.autoSaveTranscript).toBeDefined();

    const tt = await import('../../src/core-engine/TranscriptTypes');
    expect(tt.snapshotCard).toBeDefined();
  });
});
