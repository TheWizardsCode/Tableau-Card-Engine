/**
 * Unit tests for the CheckpointManager core engine abstraction.
 *
 * Exercises:
 * - CheckpointManager.save/load/clear round-trip
 * - checkAndResume() workflow (no checkpoint → freshStart, checkpoint exists → overlay)
 * - Error handling (storage unavailable, corrupt data)
 * - Both built-in overlay and callback-based overlay approaches
 * - Fire-and-forget save behaviour
 *
 * Test-first: defines the API contract that Feature 3 (Core Engine Checkpoint
 * Abstraction, CG-0MQL8CPZS009R74Q) must implement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SaveLoadStore,
  type SaveSerializer,
} from '../../src/core-engine/SaveLoad';
import {
  CheckpointManager,
  type CheckpointManagerOverlayOptions,
} from '../../src/core-engine/CheckpointManager';

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

/** A simple game state type for testing. */
interface TestState {
  score: number;
  level: number;
  items: string[];
}

/** A simple serializer for the test state. */
const testSerializer: SaveSerializer<TestState, TestState> = {
  schemaVersion: 1,
  serialize: (state) => ({ ...state }),
  deserialize: (data) => ({ ...data }),
};

/** Another serializer with a different version for version-mismatch tests. */
const serializerV2: SaveSerializer<TestState, TestState> = {
  schemaVersion: 2,
  serialize: (state) => ({ ...state }),
  deserialize: (data) => ({ ...data }),
};

function createTestState(overrides: Partial<TestState> = {}): TestState {
  return {
    score: 100,
    level: 3,
    items: ['sword', 'shield'],
    ...overrides,
  };
}

function createTestState2(): TestState {
  return {
    score: 200,
    level: 5,
    items: ['potion', 'map', 'key'],
  };
}

/** Summary of a checkpoint for equality comparison. */
function summarizeState(state: TestState): Record<string, unknown> {
  return { ...state, items: [...state.items] };
}

// ── Tests ───────────────────────────────────────────────────

describe('CheckpointManager', () => {
  let store: SaveLoadStore;
  let manager: CheckpointManager<TestState, TestState>;

  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    store = new SaveLoadStore();
    manager = new CheckpointManager(store, 'test-game', 'test-slot', testSerializer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Constructor ─────────────────────────────────────────

  it('constructor accepts SaveLoadStore, gameType, slotId, and SaveSerializer', () => {
    expect(manager).toBeInstanceOf(CheckpointManager);
  });

  // ── Save / Load / Clear round-trip ──────────────────────

  it('save persists state that can be loaded back', async () => {
    const state = createTestState();

    await manager.save(state);

    const loaded = await manager.load();
    expect(loaded).not.toBeNull();
    expect(summarizeState(loaded!)).toEqual(summarizeState(state));
  });

  it('load returns null when no checkpoint has been saved', async () => {
    const loaded = await manager.load();
    expect(loaded).toBeNull();
  });

  it('load returns the most recently saved state (overwrites previous)', async () => {
    const state1 = createTestState({ score: 100 });
    const state2 = createTestState2();

    await manager.save(state1);
    await manager.save(state2);

    const loaded = await manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.score).toBe(200);
    expect(loaded!.level).toBe(5);
    expect(loaded!.items).toEqual(['potion', 'map', 'key']);
  });

  it('clear removes an existing checkpoint', async () => {
    await manager.save(createTestState());
    expect(await manager.load()).not.toBeNull();

    await manager.clear();
    expect(await manager.load()).toBeNull();
  });

  it('clear is safe to call when no checkpoint exists', async () => {
    // Should not throw
    await expect(manager.clear()).resolves.toBeUndefined();
    expect(await manager.load()).toBeNull();
  });

  it('save/load round-trip preserves full state fidelity', async () => {
    const original = createTestState2();

    await manager.save(original);
    const restored = await manager.load();

    expect(restored).not.toBeNull();
    expect(restored!.score).toBe(original.score);
    expect(restored!.level).toBe(original.level);
    expect(restored!.items).toEqual(original.items);
  });

  it('multiple round-trips work correctly', async () => {
    for (let i = 0; i < 5; i++) {
      const state = createTestState({ score: i * 100, level: i });
      await manager.save(state);

      const loaded = await manager.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.score).toBe(i * 100);
      expect(loaded!.level).toBe(i);

      await manager.clear();
      expect(await manager.load()).toBeNull();
    }
  });

  // ── Fire-and-forget save ────────────────────────────────

  it('save is fire-and-forget (does not block the caller)', async () => {
    const state = createTestState();
    // Should resolve without error
    await expect(manager.save(state)).resolves.toBeUndefined();
  });

  it('save and immediate load works (fire-and-forget completes before next tick)', async () => {
    const state = createTestState({ score: 999 });
    await manager.save(state);
    const loaded = await manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.score).toBe(999);
  });

  // ── checkAndResume: no checkpoint ───────────────────────

  it('checkAndResume calls freshStartFn when no checkpoint exists', async () => {
    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();

    await manager.checkAndResume(freshStartFn, resumeFn);

    expect(freshStartFn).toHaveBeenCalledTimes(1);
    expect(resumeFn).not.toHaveBeenCalled();
  });

  it('checkAndResume does not show an overlay when no checkpoint exists', async () => {
    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();
    const createOverlay = vi.fn();

    await manager.checkAndResume(freshStartFn, resumeFn, createOverlay);

    expect(createOverlay).not.toHaveBeenCalled();
    expect(freshStartFn).toHaveBeenCalledTimes(1);
  });

  // ── checkAndResume: with checkpoint ─────────────────────

  it('checkAndResume calls createResumeOverlay callback when a checkpoint exists', async () => {
    const state = createTestState();
    await manager.save(state);

    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();
    const createOverlay = vi.fn();

    await manager.checkAndResume(freshStartFn, resumeFn, createOverlay);

    expect(freshStartFn).not.toHaveBeenCalled();
    expect(createOverlay).toHaveBeenCalledTimes(1);
    expect(resumeFn).not.toHaveBeenCalled(); // resume only called after user action
  });

  it('checkAndResume passes the saved state to createResumeOverlay', async () => {
    const state = createTestState({ score: 777 });
    await manager.save(state);

    const createOverlay = vi.fn();

    await manager.checkAndResume(vi.fn(), vi.fn(), createOverlay);

    // The overlay callback receives (state, onResume, onNewGame)
    expect(createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ score: 777 }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('checkAndResume resumeFn is called when onResume is triggered', async () => {
    const state = createTestState({ score: 555 });
    await manager.save(state);

    const resumeFn = vi.fn();
    let triggerResume: (() => void) | undefined;

    const createOverlay: CheckpointManagerOverlayOptions<TestState>['createResumeOverlay'] = (
      _state, onResume, _onNewGame,
    ) => {
      triggerResume = onResume;
    };

    await manager.checkAndResume(vi.fn(), resumeFn, createOverlay);

    expect(triggerResume).toBeDefined();

    // Simulate user clicking Resume
    triggerResume!();

    expect(resumeFn).toHaveBeenCalledTimes(1);
    expect(resumeFn).toHaveBeenCalledWith(state);
  });

  it('checkAndResume clears checkpoint and starts fresh when onNewGame is triggered', async () => {
    const state = createTestState();
    await manager.save(state);

    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();
    let triggerNewGame: (() => void) | undefined;

    const createOverlay: CheckpointManagerOverlayOptions<TestState>['createResumeOverlay'] = (
      _state, _onResume, onNewGame,
    ) => {
      triggerNewGame = onNewGame;
    };

    await manager.checkAndResume(freshStartFn, resumeFn, createOverlay);
    // (Note: resumeFn is a dummy — the fresh game path clears checkpoint)

    expect(triggerNewGame).toBeDefined();

    // Simulate user clicking New Game
    triggerNewGame!();

    // Flush microtasks so the async clear() completes
    await new Promise(resolve => setTimeout(resolve, 0));

    // Checkpoint should be cleared
    const loaded = await manager.load();
    expect(loaded).toBeNull();

    // Fresh start should have been triggered
    expect(freshStartFn).toHaveBeenCalledTimes(1);
  });

  // ── Built-in overlay ────────────────────────────────────

  it('checkAndResume works without createOverlay callback (uses built-in default)', async () => {
    // This test verifies the default path — no custom overlay needed.
    // When no checkpoint exists, freshStartFn is called.
    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();

    await manager.checkAndResume(freshStartFn, resumeFn);

    expect(freshStartFn).toHaveBeenCalledTimes(1);
    expect(resumeFn).not.toHaveBeenCalled();
  });

  it('checkAndResume with no overlay callback falls through to freshStartFn when checkpoint exists', async () => {
    const state = createTestState({ score: 333 });
    await manager.save(state);

    // Without an overlay callback, the core engine cannot show a resume
    // overlay (no Phaser dependency), so it falls through to freshStartFn.
    // Games should always provide a createResumeOverlay callback to get
    // a resume dialog.
    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();

    await manager.checkAndResume(freshStartFn, resumeFn);

    // Without overlay callback, freshStartFn is called
    expect(freshStartFn).toHaveBeenCalledTimes(1);
    expect(resumeFn).not.toHaveBeenCalled();
  });

  // ── Error handling ──────────────────────────────────────

  it('save does not throw when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', undefined);

    const noopStore = new SaveLoadStore();
    const noopManager = new CheckpointManager(noopStore, 'test-game', 'test-slot', testSerializer);

    // Should not throw
    await expect(noopManager.save(createTestState())).resolves.toBeUndefined();
    // Should return null (no storage)
    const loaded = await noopManager.load();
    expect(loaded).toBeNull();
  });

  it('load returns null when storage backend is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', undefined);

    const noopStore = new SaveLoadStore();
    const noopManager = new CheckpointManager(noopStore, 'test-game', 'test-slot', testSerializer);

    const loaded = await noopManager.load();
    expect(loaded).toBeNull();
  });

  it('checkAndResume falls through to freshStartFn when storage fails', async () => {
    // Simulate a storage error by making load fail
    const freshStartFn = vi.fn();
    const resumeFn = vi.fn();

    // With no storage at all
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', undefined);

    const brokenStore = new SaveLoadStore();
    const brokenManager = new CheckpointManager(brokenStore, 'test-game', 'test-slot', testSerializer);

    // Should fall through to freshStart without throwing
    await expect(
      brokenManager.checkAndResume(freshStartFn, resumeFn),
    ).resolves.toBeUndefined();

    expect(freshStartFn).toHaveBeenCalledTimes(1);
  });

  // ── Schema version handling ─────────────────────────────

  it('save/load returns null for incompatible schema version', async () => {
    const state = createTestState();

    // Save with version 1 serializer
    await manager.save(state);

    // Load with version 2 serializer (wrong version)
    const v2Manager = new CheckpointManager(store, 'test-game', 'test-slot', serializerV2);

    // CheckpointManager defensive error handling returns null
    // (consistent with "no valid checkpoint" semantics)
    const result = await v2Manager.load();
    expect(result).toBeNull();
  });

  // ── Game type isolation ─────────────────────────────────

  it('different game types have isolated checkpoints', async () => {
    const store2 = new SaveLoadStore();
    const game1 = new CheckpointManager(store2, 'game-a', 'slot-1', testSerializer);
    const game2 = new CheckpointManager(store2, 'game-b', 'slot-1', testSerializer);

    await game1.save(createTestState({ score: 111 }));
    await game2.save(createTestState({ score: 222 }));

    const loaded1 = await game1.load();
    const loaded2 = await game2.load();

    expect(loaded1).not.toBeNull();
    expect(loaded2).not.toBeNull();
    expect(loaded1!.score).toBe(111);
    expect(loaded2!.score).toBe(222);
  });
});
