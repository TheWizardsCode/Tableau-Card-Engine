/**
 * Community Favour (CG-0MSTOATDQ005XDET): Persistence & transcript tests.
 *
 * Covers:
 * - AC1: favourUsedThisTurn is serialized and deserialized
 * - AC2: legacy saves without the field backfill to false
 * - AC3: save→load round-trip preserves the exact value
 * - AC4: the community-favour action is recorded as a transcript 'action'
 *   event including its direction
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setupMainStreetGame, serializeMainStreetState, deserializeMainStreetState, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeDayStart, executeAction } from '../../example-games/main-street/MainStreetEngine';
import {
  MainStreetTranscriptRecorder,
  setMainStreetRecorder,
  recordMainStreetEvent,
} from '../../example-games/main-street/MainStreetTranscript';

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

function createMarketState(seed = 'cf-persist-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  return state;
}

// ── AC1+AC3: Serialization round-trip ───────────────────────

describe('favourUsedThisTurn persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes the flag and round-trips false', () => {
    const state = createMarketState();
    state.favourUsedThisTurn = false;

    const serialized = serializeMainStreetState(state);
    expect((serialized as { favourUsedThisTurn: boolean }).favourUsedThisTurn).toBe(false);

    const restored = deserializeMainStreetState(serialized);
    expect(restored.favourUsedThisTurn).toBe(false);
  });

  it('round-trips true exactly (gate spent at save)', () => {
    const state = createMarketState();
    executeAction(state, { type: 'community-favour', direction: 'coins-to-rep' });
    expect(state.favourUsedThisTurn).toBe(true);

    const serialized = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(serialized);
    expect(restored.favourUsedThisTurn).toBe(true);
  });

  // AC2: legacy-save backfill
  it('backfills to false when the field is absent (legacy save)', () => {
    const state = createMarketState();
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete serialized.favourUsedThisTurn;

    const restored = deserializeMainStreetState(serialized as never);
    expect(restored.favourUsedThisTurn).toBe(false);
  });

  it('checkpoint save/load through the MainStreetSaveLoad adapter preserves the flag', async () => {
    const { SaveLoadStore } = await import('../../src/core-engine');
    const { createMainStreetCheckpointManager } = await import('../../example-games/main-street/MainStreetSaveLoad');
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);
    const state = createMarketState('cf-save-load');
    executeAction(state, { type: 'community-favour', direction: 'rep-to-coins' });

    await mgr.save(state as never);
    const loaded = await mgr.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.favourUsedThisTurn).toBe(true);
    // The loaded state is fully functional: the exchange gate is respected.
    expect(() =>
      executeAction(loaded!, { type: 'community-favour', direction: 'rep-to-coins' }),
    ).toThrow('You have already used Community Favour this turn.');
  });
});

// ── AC4: Transcript capture ─────────────────────────────────

describe('Community Favour transcript event', () => {
  it('records an action event whose descriptor carries the direction', () => {
    const state = createMarketState('cf-transcript');
    const recorder = new MainStreetTranscriptRecorder({ seed: state.seed });
    setMainStreetRecorder(recorder);

    // The scene/turn-controller records the event exactly as executed.
    recordMainStreetEvent({
      type: 'action',
      turn: state.turn,
      action: { type: 'community-favour', direction: 'rep-to-coins' },
      description: 'Community Favour (rep-to-coins) executed',
    });

    const events = recorder.getTranscript().events;
    const actionEvent = events.find(e => e.type === 'action') as
      | { action?: { type: string; direction?: string }; description?: string }
      | undefined;

    expect(actionEvent).toBeDefined();
    expect(actionEvent!.action?.type).toBe('community-favour');
    expect(actionEvent!.action?.direction).toBe('rep-to-coins');
    expect(actionEvent!.description).toContain('rep-to-coins');
  });

  it('the coins-to-rep direction is recorded distinctly', () => {
    const state = createMarketState('cf-transcript-2');
    const recorder = new MainStreetTranscriptRecorder({ seed: state.seed });
    setMainStreetRecorder(recorder);

    recordMainStreetEvent({
      type: 'action',
      turn: state.turn,
      action: { type: 'community-favour', direction: 'coins-to-rep' },
      description: 'Community Favour (coins-to-rep) executed',
    });

    const events = recorder.getTranscript().events;
    const actionEvent = events.find(e => e.type === 'action') as
      | { action?: { type: string; direction?: string } }
      | undefined;
    expect(actionEvent!.action?.direction).toBe('coins-to-rep');
  });
});