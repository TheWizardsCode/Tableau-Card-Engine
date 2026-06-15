/**
 * Integration tests for Beleaguered Castle save/load checkpoint and transcript autosave.
 *
 * Exercises:
 * - SaveLoadStore save/load round-trip via BeleagueredCastleSaveLoad
 * - Transcript autosave persistence and retrieval
 * - State equality verification after save/load
 *
 * Satisfies: CG-0MPK8XS5A00345OT AC-4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveLoadStore } from '../../src/core-engine';
import { TranscriptStore, autoSaveTranscript } from '../../src/core-engine/transcript';
import { deal } from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import {
  serializeBCState,
  deserializeBCState,
  bcStateSerializer,
  saveBCSnapshot,
  loadBCSnapshot,
  BC_GAME_TYPE,
} from '../../example-games/beleaguered-castle/BeleagueredCastleSaveLoad';
import type { BeleagueredCastleState, BCMove } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import {
  applyMove,
  isLegalFoundationMove,
  isLegalTableauMove,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import { BCTranscriptRecorder } from '../../example-games/beleaguered-castle/GameTranscript';

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

/**
 * Find and execute a legal move in the given state.
 * Tries tableau-to-foundation moves first, then tableau-to-tableau.
 * Returns the move if found, null if no legal moves exist.
 */
function tryFindAndApplyMove(state: BeleagueredCastleState): BCMove | null {
  // Try foundation moves first
  for (let fromCol = 0; fromCol < state.tableau.length; fromCol++) {
    for (let toF = 0; toF < state.foundations.length; toF++) {
      if (isLegalFoundationMove(state, fromCol, toF)) {
        const move: BCMove = { kind: 'tableau-to-foundation', fromCol, toFoundation: toF };
        applyMove(state, move);
        return move;
      }
    }
  }

  // Try tableau-to-tableau moves
  for (let fromCol = 0; fromCol < state.tableau.length; fromCol++) {
    for (let toCol = 0; toCol < state.tableau.length; toCol++) {
      if (toCol !== fromCol && isLegalTableauMove(state, fromCol, toCol)) {
        const move: BCMove = { kind: 'tableau-to-tableau', fromCol, toCol };
        applyMove(state, move);
        return move;
      }
    }
  }

  return null;
}

/** Summary of a BeleagueredCastleState for quick comparison. */
function summarizeState(state: BeleagueredCastleState): Record<string, unknown> {
  return {
    seed: state.seed,
    moveCount: state.moveCount,
    foundationSizes: state.foundations.map((p) => ({
      size: p.size(),
      topRank: p.peek()?.rank ?? null,
    })),
    tableauSizes: state.tableau.map((p) => ({
      size: p.size(),
      topRank: p.peek()?.rank ?? null,
    })),
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('Beleaguered Castle save/load integration (CG-0MPK8XS5A00345OT)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Save/load round-trip ─────────────────────────────────

  it('save/load round-trip: deals produce identical state', async () => {
    const SEED = 42;
    const store = new SaveLoadStore();

    // Deal and apply a few moves
    const state = deal(SEED);
    expect(state.tableau.length).toBe(8);
    expect(state.foundations.length).toBe(4);

    // Apply a couple of moves
    const move1 = tryFindAndApplyMove(state);
    if (move1) {
      const move2 = tryFindAndApplyMove(state);
      void move2; // applied in place
    }

    const summaryBefore = summarizeState(state);

    // Save checkpoint
    await saveBCSnapshot(store, state);

    // Load and verify
    const restored = await loadBCSnapshot(store);
    expect(restored).not.toBeNull();

    const summaryAfter = summarizeState(restored!);
    expect(summaryAfter).toEqual(summaryBefore);

    // Verify individual fields match
    expect(restored!.seed).toBe(state.seed);
    expect(restored!.moveCount).toBe(state.moveCount);
    for (let i = 0; i < 4; i++) {
      expect(restored!.foundations[i].toArray()).toEqual(state.foundations[i].toArray());
    }
    for (let i = 0; i < 8; i++) {
      expect(restored!.tableau[i].toArray()).toEqual(state.tableau[i].toArray());
    }
  });

  it('save/load round-trip: post-deal checkpoint restores initial state', async () => {
    const SEED = 12345;
    const store = new SaveLoadStore();

    // Deal and save immediately (post-deal checkpoint)
    const state = deal(SEED);
    await saveBCSnapshot(store, state);

    // Load
    const restored = await loadBCSnapshot(store);
    expect(restored).not.toBeNull();
    expect(summarizeState(restored!)).toEqual(summarizeState(state));
    expect(restored!.seed).toBe(SEED);
    expect(restored!.moveCount).toBe(0);
  });

  it('save/load round-trip: state survives serialization round-trip via serializer', () => {
    const SEED = 999;
    const state = deal(SEED);

    // Apply some moves
    for (let i = 0; i < 3; i++) {
      const move = tryFindAndApplyMove(state);
      if (!move) break;
    }

    const serialized = serializeBCState(state);
    expect(bcStateSerializer.schemaVersion).toBe(1);
    expect(serialized.seed).toBe(SEED);
    expect(serialized.foundations.length).toBe(4);
    expect(serialized.tableau.length).toBe(8);

    const deserialized = deserializeBCState(serialized);
    expect(deserialized.seed).toBe(state.seed);
    expect(deserialized.moveCount).toBe(state.moveCount);
    expect(summarizeState(deserialized)).toEqual(summarizeState(state));
  });

  it('save/load round-trip: serializer works with SaveLoadStore', async () => {
    const SEED = 7777;
    const store = new SaveLoadStore();
    const state = deal(SEED);

    // Use the serializer directly with SaveLoadStore
    await store.saveRunCheckpoint(
      BC_GAME_TYPE,
      'test-slot',
      bcStateSerializer,
      state,
    );

    const restored = await store.loadRunCheckpoint(
      BC_GAME_TYPE,
      'test-slot',
      bcStateSerializer,
    );

    expect(restored).not.toBeNull();
    expect(restored!.seed).toBe(SEED);
    expect(restored!.moveCount).toBe(0);
    for (let i = 0; i < 8; i++) {
      expect(restored!.tableau[i].toArray()).toEqual(state.tableau[i].toArray());
    }
  });

  // ── Transcript autosave ──────────────────────────────────

  it('transcript autosave: finalized transcript persists to TranscriptStore', async () => {
    const SEED = 5555;
    const transcriptStore = new TranscriptStore();

    // Create a recorder and play a game
    const state = deal(SEED);
    const recorder = new BCTranscriptRecorder(SEED, state);

    // Record a few moves
    for (let i = 0; i < 2; i++) {
      const move = tryFindAndApplyMove(state);
      if (!move) break;
      recorder.recordMove(move, state.moveCount);
    }

    // Finalize transcript (win)
    const transcript = recorder.finalize('win', state.moveCount, 30);
    expect(transcript).not.toBeNull();
    expect(transcript!.game).toBe('beleaguered-castle');
    expect(transcript!.result!.outcome).toBe('win');
    expect(transcript!.moves.length).toBeGreaterThan(0);

    // Auto-save to TranscriptStore
    autoSaveTranscript(transcriptStore, 'beleaguered-castle', transcript!);

    // Wait for the fire-and-forget save
    await vi.waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Transcript saved'),
      );
    });

    // Verify the transcript is in storage
    const savedList = await transcriptStore.list('beleaguered-castle');
    expect(savedList.length).toBeGreaterThan(0);
    const st = savedList[0].transcript as { game: string };
    expect(st.game).toBe('beleaguered-castle');
  });

  it('transcript autosave: loss transcript is also persisted', async () => {
    const SEED = 1111;
    const transcriptStore = new TranscriptStore();

    const state = deal(SEED);
    const recorder = new BCTranscriptRecorder(SEED, state);

    // Record a move then finalize as loss
    const move = tryFindAndApplyMove(state);
    if (move) {
      recorder.recordMove(move, state.moveCount);
    }

    const transcript = recorder.finalize('loss', state.moveCount, 15);
    expect(transcript).not.toBeNull();
    expect(transcript!.result!.outcome).toBe('loss');

    autoSaveTranscript(transcriptStore, 'beleaguered-castle', transcript!);

    await vi.waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Transcript saved'),
      );
    });

    const savedList = await transcriptStore.list('beleaguered-castle');
    expect(savedList.length).toBeGreaterThan(0);
    const st = savedList[0].transcript as { result: { outcome: string } };
    expect(st.result.outcome).toBe('loss');
  });

  it('transcript autosave: full round-trip with serialized state equality', async () => {
    const SEED = 3333;
    const saveStore = new SaveLoadStore();
    const transcriptStore = new TranscriptStore();

    // Phase 1: Deal, play moves, save checkpoint, finalize transcript
    const state = deal(SEED);
    const recorder = new BCTranscriptRecorder(SEED, state);

    for (let i = 0; i < 2; i++) {
      const m = tryFindAndApplyMove(state);
      if (!m) break;
      recorder.recordMove(m, state.moveCount);
    }

    // Save checkpoint
    await saveBCSnapshot(saveStore, state);

    // Finalize and auto-save transcript
    const transcript = recorder.finalize('win', state.moveCount, 42);
    expect(transcript).not.toBeNull();
    autoSaveTranscript(transcriptStore, 'beleaguered-castle', transcript!);

    await vi.waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Transcript saved'),
      );
    });

    // Phase 2: Load checkpoint and verify state matches
    const restored = await loadBCSnapshot(saveStore);
    expect(restored).not.toBeNull();
    expect(summarizeState(restored!)).toEqual(summarizeState(state));

    // Phase 3: Verify transcript was persisted
    const savedTranscripts = await transcriptStore.list('beleaguered-castle');
    expect(savedTranscripts.length).toBeGreaterThan(0);
    const retrieved = await transcriptStore.get(savedTranscripts[0].id);
    expect(retrieved).not.toBeNull();
    const rt = retrieved!.transcript as { game: string; result: { outcome: string } };
    expect(rt.game).toBe('beleaguered-castle');
    expect(rt.result.outcome).toBe('win');
  });

  // ── Resume overlay integration tests ────────────────────

  it('resume: loadBCSnapshot returns null when no checkpoint saved', async () => {
    const store = new SaveLoadStore();
    const result = await loadBCSnapshot(store);
    expect(result).toBeNull();
  });

  it('resume: checkpoint exists after save, can be loaded', async () => {
    const SEED = 8888;
    const store = new SaveLoadStore();
    const state = deal(SEED);

    // Apply a move to create non-trivial state
    tryFindAndApplyMove(state);

    await saveBCSnapshot(store, state);
    const loaded = await loadBCSnapshot(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.seed).toBe(SEED);
    expect(loaded!.moveCount).toBe(state.moveCount);
  });

  it('resume: checkpoint persists across separate store instances', async () => {
    const SEED = 4444;
    const state = deal(SEED);
    tryFindAndApplyMove(state);
    const expectedMoveCount = state.moveCount;

    // Save with one store instance
    const store1 = new SaveLoadStore();
    await saveBCSnapshot(store1, state);

    // Load with a different store instance (same backend)
    const store2 = new SaveLoadStore();
    const loaded = await loadBCSnapshot(store2);
    expect(loaded).not.toBeNull();
    expect(loaded!.moveCount).toBe(expectedMoveCount);
    expect(loaded!.seed).toBe(SEED);
  });

  it('resume: loading checkpoint does not affect autosave functionality', async () => {
    const SEED = 6666;
    const saveStore = new SaveLoadStore();
    const transcriptStore = new TranscriptStore();

    const state = deal(SEED);
    const recorder = new BCTranscriptRecorder(SEED, state);

    // Play some moves
    tryFindAndApplyMove(state);

    // Save checkpoint
    await saveBCSnapshot(saveStore, state);

    // Load checkpoint
    const loaded = await loadBCSnapshot(saveStore);
    expect(loaded).not.toBeNull();

    // Continue playing from loaded state
    tryFindAndApplyMove(loaded!);
    recorder.recordMove(
      { kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 0 },
      loaded!.moveCount,
    );

    // Finalize and auto-save transcript
    const transcript = recorder.finalize('win', loaded!.moveCount, 60);
    expect(transcript).not.toBeNull();
    autoSaveTranscript(transcriptStore, 'beleaguered-castle', transcript!);

    await vi.waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Transcript saved'),
      );
    });

    const savedTranscripts = await transcriptStore.list('beleaguered-castle');
    expect(savedTranscripts.length).toBeGreaterThan(0);
  });

  it('resume: clearing checkpoint by saving fresh state then loading returns fresh state', async () => {
    const SEED = 7777;
    const store = new SaveLoadStore();

    // Save initial checkpoint
    const state1 = deal(SEED);
    tryFindAndApplyMove(state1);
    await saveBCSnapshot(store, state1);

    // "Clear" by saving a fresh deal state
    const freshState = deal(Date.now());
    await saveBCSnapshot(store, freshState);

    // Load should return the fresh state (overwritten), not state1
    const loaded = await loadBCSnapshot(store);
    expect(loaded).not.toBeNull();
    // The fresh state has moveCount=0 (just dealt)
    expect(loaded!.moveCount).toBe(0);
  });
});
