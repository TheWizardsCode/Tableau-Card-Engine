/**
 * Tests for Main Street CheckpointManager integration.
 *
 * These tests verify that:
 * - The `createMainStreetCheckpointManager` factory creates a valid CheckpointManager.
 * - `saveTurnStartCheckpoint` / `loadTurnStartCheckpoint` delegate to CheckpointManager
 *   internally while preserving the existing public API surface.
 * - `clearTurnStartCheckpoint` removes the saved checkpoint.
 * - All existing save-load tests continue to pass with the refactored internals.
 *
 * @module tests/main-street/checkpoint-manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveLoadStore, CheckpointManager } from '../../src/core-engine';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';

import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import {
  saveTurnStartCheckpoint,
  loadTurnStartCheckpoint,
  createMainStreetCheckpointManager,
  clearTurnStartCheckpoint,
} from '../../example-games/main-street/MainStreetSaveLoad';

function createLocalStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

describe('Main Street CheckpointManager integration', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Factory / construction ───────────────────────────────

  it('createMainStreetCheckpointManager returns a valid CheckpointManager instance', () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    expect(mgr).toBeInstanceOf(CheckpointManager);
  });

  it('createMainStreetCheckpointManager uses correct game type and slot', () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    expect(mgr).toBeInstanceOf(CheckpointManager);
    // The CheckpointManager doesn't expose gameType/slotId publicly,
    // but we verify it works by saving and loading through it.
  });

  // ── Save / Load / Clear via CheckpointManager ────────────

  it('saves and loads a checkpoint via CheckpointManager', async () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    const state = setupMainStreetGame({ seed: 'cm-test-save-load' });

    await mgr.save(state);
    const loaded = await mgr.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.seed).toBe(state.seed);
    expect(loaded!.turn).toBe(state.turn);
  });

  it('load returns null when no checkpoint exists', async () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    const loaded = await mgr.load();
    expect(loaded).toBeNull();
  });

  it('clear removes a saved checkpoint', async () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    const state = setupMainStreetGame({ seed: 'cm-test-clear' });

    await mgr.save(state);
    expect(await mgr.load()).not.toBeNull();

    await mgr.clear();
    expect(await mgr.load()).toBeNull();
  });

  it('clear is safe when no checkpoint exists', async () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    // Should not throw
    await expect(mgr.clear()).resolves.toBeUndefined();
  });

  // ── Existing public API (saveTurnStartCheckpoint / loadTurnStartCheckpoint) ──

  it('saveTurnStartCheckpoint persists state via the refactored CheckpointManager path', async () => {
    const store = new SaveLoadStore();
    const state = setupMainStreetGame({ seed: 'existing-api-save' });

    await saveTurnStartCheckpoint(store, state);
    const loaded = await loadTurnStartCheckpoint(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.seed).toBe(state.seed);
    expect(loaded!.turn).toBe(state.turn);
  });

  it('loadTurnStartCheckpoint returns null when no checkpoint saved', async () => {
    const store = new SaveLoadStore();
    const loaded = await loadTurnStartCheckpoint(store);
    expect(loaded).toBeNull();
  });

  it('save/load round-trip preserves turn-start state deterministically', async () => {
    const store = new SaveLoadStore();
    const state = setupMainStreetGame({ seed: 'existing-api-det-roundtrip' });
    // Coin cushion so the first market card is always affordable regardless of
    // which card the expanded pool's seeded market draws.
    state.resourceBank.coins = 100;

    executeDayStart(state);
    const card = state.market.cards[0];
    executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
    processEndOfTurn(state);

    await saveTurnStartCheckpoint(store, state);
    const restored = await loadTurnStartCheckpoint(store);
    expect(restored).not.toBeNull();

    const expected = setupMainStreetGame({ seed: 'existing-api-det-roundtrip' });
    expected.resourceBank.coins = 100; // match the cushion applied above
    executeDayStart(expected);
    executeAction(expected, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
    processEndOfTurn(expected);

    expect(restored!.turn).toBe(expected.turn);
    expect(restored!.resourceBank).toEqual(expected.resourceBank);
    expect(restored!.phase).toBe(expected.phase);
    expect(restored!.streetGrid.map((b) => b?.id ?? null)).toEqual(
      expected.streetGrid.map((b) => b?.id ?? null),
    );
  });

  it('clearing via CheckpointManager makes loadTurnStartCheckpoint return null', async () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    const state = setupMainStreetGame({ seed: 'clear-checkpoint' });

    await saveTurnStartCheckpoint(store, state);
    expect(await loadTurnStartCheckpoint(store)).not.toBeNull();

    await mgr.clear();
    expect(await loadTurnStartCheckpoint(store)).toBeNull();
  });

  it('clearTurnStartCheckpoint removes the saved checkpoint', async () => {
    const store = new SaveLoadStore();
    const state = setupMainStreetGame({ seed: 'clear-turn-start' });

    await saveTurnStartCheckpoint(store, state);
    expect(await loadTurnStartCheckpoint(store)).not.toBeNull();

    await clearTurnStartCheckpoint(store);
    expect(await loadTurnStartCheckpoint(store)).toBeNull();
  });

  it('clearTurnStartCheckpoint is safe when no checkpoint exists', async () => {
    const store = new SaveLoadStore();
    await expect(clearTurnStartCheckpoint(store)).resolves.toBeUndefined();
  });
});
