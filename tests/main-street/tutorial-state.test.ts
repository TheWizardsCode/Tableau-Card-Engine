import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TUTORIAL_SEED,
  createDefaultTutorialState,
  parseTutorialState,
  serializeTutorialState,
  updateTutorialStatus,
  shouldShowTutorialOffer,
  loadTutorialState,
  saveTutorialState,
  clearTutorialState,
  bridgeLegacyTutorialSeen,
  TUTORIAL_STATE_SCHEMA_VERSION,
  TUTORIAL_STATE_STORAGE_KEY,
  BrowserLocalStorageAdapter,
  type MainStreetTutorialStateV1,
  type TutorialStorageAdapter,
} from '../../example-games/main-street/TutorialState';

// ── In-memory storage adapter for tests ─────────────────────

function createInMemoryStorage(): TutorialStorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

// ── Default State ────────────────────────────────────────────

describe('TUTORIAL_SEED', () => {
  it('is a non-empty string', () => {
    expect(TUTORIAL_SEED).toBe('tutorial-seed');
    expect(TUTORIAL_SEED.length).toBeGreaterThan(0);
  });
});

describe('createDefaultTutorialState', () => {
  it('returns a not_seen state with null fields', () => {
    const state = createDefaultTutorialState();
    expect(state).toEqual({
      schemaVersion: 1,
      status: 'not_seen',
      completedAt: null,
      lastStepId: null,
    });
  });

  it('uses the canonical schema version constant', () => {
    const state = createDefaultTutorialState();
    expect(state.schemaVersion).toBe(TUTORIAL_STATE_SCHEMA_VERSION);
  });
});

// ── Parsing ──────────────────────────────────────────────────

describe('parseTutorialState', () => {
  it('returns default state when input is null', () => {
    const result = parseTutorialState(null);
    expect(result.status).toBe('not_seen');
    expect(result.schemaVersion).toBe(1);
  });

  it('returns default state when input is empty string', () => {
    const result = parseTutorialState('');
    expect(result.status).toBe('not_seen');
  });

  it('returns default state for malformed JSON', () => {
    const result = parseTutorialState('{bad json');
    expect(result.status).toBe('not_seen');
  });

  it('returns default state for wrong schema version', () => {
    const raw = JSON.stringify({ schemaVersion: 99, status: 'completed' });
    const result = parseTutorialState(raw);
    expect(result.status).toBe('not_seen');
  });

  it('returns default state for missing schema version', () => {
    const raw = JSON.stringify({ status: 'completed' });
    const result = parseTutorialState(raw);
    expect(result.status).toBe('not_seen');
  });

  it('returns default state for invalid status value', () => {
    const raw = JSON.stringify({ schemaVersion: 1, status: 'unknown' });
    const result = parseTutorialState(raw);
    expect(result.status).toBe('not_seen');
  });

  it('parses a valid not_seen state', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      status: 'not_seen',
      completedAt: null,
      lastStepId: null,
    });
    const result = parseTutorialState(raw);
    expect(result.status).toBe('not_seen');
    expect(result.completedAt).toBeNull();
    expect(result.lastStepId).toBeNull();
  });

  it('parses a valid skipped state', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      status: 'skipped',
      completedAt: null,
      lastStepId: 'T2',
    });
    const result = parseTutorialState(raw);
    expect(result.status).toBe('skipped');
    expect(result.lastStepId).toBe('T2');
  });

  it('parses a valid completed state with completedAt', () => {
    const ts = '2026-05-20T10:30:00.000Z';
    const raw = JSON.stringify({
      schemaVersion: 1,
      status: 'completed',
      completedAt: ts,
      lastStepId: 'T10',
    });
    const result = parseTutorialState(raw);
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe(ts);
    expect(result.lastStepId).toBe('T10');
  });

  it('defaults completedAt and lastStepId to null when absent', () => {
    const raw = JSON.stringify({ schemaVersion: 1, status: 'skipped' });
    const result = parseTutorialState(raw);
    expect(result.completedAt).toBeNull();
    expect(result.lastStepId).toBeNull();
  });
});

// ── Serialization ───────────────────────────────────────────

describe('serializeTutorialState', () => {
  it('produces valid JSON that round-trips through parse', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'completed',
      completedAt: '2026-05-20T10:30:00.000Z',
      lastStepId: 'T10',
    };
    const serialized = serializeTutorialState(state);
    const parsed = parseTutorialState(serialized);
    expect(parsed).toEqual(state);
  });

  it('serializes a not_seen state correctly', () => {
    const state = createDefaultTutorialState();
    const serialized = serializeTutorialState(state);
    const parsed = JSON.parse(serialized);
    expect(parsed.status).toBe('not_seen');
    expect(parsed.schemaVersion).toBe(1);
  });
});

// ── Status Updates ──────────────────────────────────────────

describe('updateTutorialStatus', () => {
  it('transitions from not_seen to skipped', () => {
    const state = createDefaultTutorialState();
    const updated = updateTutorialStatus(state, 'skipped');
    expect(updated.status).toBe('skipped');
    expect(updated.completedAt).toBeNull();
    expect(updated.lastStepId).toBeNull();
  });

  it('transitions to completed with a timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    const state = createDefaultTutorialState();
    const updated = updateTutorialStatus(state, 'completed');
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBe('2026-06-01T12:00:00.000Z');
    vi.useRealTimers();
  });

  it('accepts a custom now timestamp', () => {
    const state = createDefaultTutorialState();
    const ts = '2026-01-01T00:00:00.000Z';
    const updated = updateTutorialStatus(state, 'completed', { now: ts });
    expect(updated.completedAt).toBe(ts);
  });

  it('preserves lastStepId when not explicitly changed', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'not_seen',
      completedAt: null,
      lastStepId: 'T3',
    };
    const updated = updateTutorialStatus(state, 'skipped');
    expect(updated.lastStepId).toBe('T3');
  });

  it('updates lastStepId when explicitly provided', () => {
    const state = createDefaultTutorialState();
    const updated = updateTutorialStatus(state, 'not_seen', { lastStepId: 'T5' });
    expect(updated.lastStepId).toBe('T5');
  });

  it('clears lastStepId when explicitly set to null', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'not_seen',
      completedAt: null,
      lastStepId: 'T5',
    };
    const updated = updateTutorialStatus(state, 'skipped', { lastStepId: null });
    expect(updated.lastStepId).toBeNull();
  });

  it('does not set completedAt for non-completed transitions', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'skipped',
      completedAt: '2026-01-01T00:00:00.000Z',
      lastStepId: null,
    };
    const updated = updateTutorialStatus(state, 'not_seen');
    expect(updated.completedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updated.status).toBe('not_seen');
  });

  it('returns a new object (does not mutate input)', () => {
    const state = createDefaultTutorialState();
    const updated = updateTutorialStatus(state, 'completed');
    expect(updated).not.toBe(state);
    expect(state.status).toBe('not_seen');
  });
});

// ── Eligibility ──────────────────────────────────────────────

describe('shouldShowTutorialOffer', () => {
  it('shows offer for not_seen state', () => {
    const state = createDefaultTutorialState();
    expect(shouldShowTutorialOffer(state)).toBe(true);
  });

  it('does NOT show offer for skipped state', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'skipped',
      completedAt: null,
      lastStepId: null,
    };
    expect(shouldShowTutorialOffer(state)).toBe(false);
  });

  it('does NOT show offer for completed state', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'completed',
      completedAt: '2026-05-20T10:00:00.000Z',
      lastStepId: 'T10',
    };
    expect(shouldShowTutorialOffer(state)).toBe(false);
  });

  it('does NOT show offer in replay mode', () => {
    const state = createDefaultTutorialState();
    expect(shouldShowTutorialOffer(state, { replayMode: true })).toBe(false);
  });

  it('does NOT show offer when tutorial is explicitly disabled', () => {
    const state = createDefaultTutorialState();
    expect(shouldShowTutorialOffer(state, { disableTutorial: true })).toBe(false);
  });

  it('forceShowOffer overrides completed status', () => {
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'completed',
      completedAt: '2026-05-20T10:00:00.000Z',
      lastStepId: 'T10',
    };
    expect(shouldShowTutorialOffer(state, { forceShowOffer: true })).toBe(true);
  });

  it('forceShowOffer overrides replay mode', () => {
    const state = createDefaultTutorialState();
    expect(shouldShowTutorialOffer(state, { forceShowOffer: true, replayMode: true })).toBe(true);
  });

  it('forceShowOffer overrides disableTutorial', () => {
    const state = createDefaultTutorialState();
    expect(shouldShowTutorialOffer(state, { forceShowOffer: true, disableTutorial: true })).toBe(true);
  });
});

// ── Persistence (load/save/clear) ───────────────────────────

describe('loadTutorialState', () => {
  it('returns default state when storage is empty', () => {
    const storage = createInMemoryStorage();
    const result = loadTutorialState(storage);
    expect(result.status).toBe('not_seen');
  });

  it('loads a saved state from storage', () => {
    const storage = createInMemoryStorage();
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'skipped',
      completedAt: null,
      lastStepId: 'T2',
    };
    storage.setItem(TUTORIAL_STATE_STORAGE_KEY, JSON.stringify(state));
    const result = loadTutorialState(storage);
    expect(result).toEqual(state);
  });

  it('falls back to default for corrupted storage', () => {
    const storage = createInMemoryStorage();
    storage.setItem(TUTORIAL_STATE_STORAGE_KEY, 'not-json');
    const result = loadTutorialState(storage);
    expect(result.status).toBe('not_seen');
  });

  it('uses a custom storage key when provided', () => {
    const storage = createInMemoryStorage();
    const customKey = 'my-custom-key';
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'completed',
      completedAt: null,
      lastStepId: null,
    };
    storage.setItem(customKey, JSON.stringify(state));
    const result = loadTutorialState(storage, customKey);
    expect(result.status).toBe('completed');
    // Default key should still return default
    expect(loadTutorialState(storage).status).toBe('not_seen');
  });
});

describe('saveTutorialState', () => {
  it('persists state to storage', async () => {
    const storage = createInMemoryStorage();
    const state: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'completed',
      completedAt: '2026-06-01T00:00:00.000Z',
      lastStepId: 'T10',
    };
    await saveTutorialState(storage, state);
    const loaded = loadTutorialState(storage);
    expect(loaded).toEqual(state);
  });

  it('uses a custom storage key when provided', async () => {
    const storage = createInMemoryStorage();
    const state = createDefaultTutorialState();
    await saveTutorialState(storage, state, 'custom-key');
    expect(loadTutorialState(storage).status).toBe('not_seen');
    expect(loadTutorialState(storage, 'custom-key').status).toBe('not_seen');
    const raw = storage.getItem('custom-key');
    expect(raw).not.toBeNull();
  });
});

describe('clearTutorialState', () => {
  it('removes state from storage', () => {
    const storage = createInMemoryStorage();
    const state = createDefaultTutorialState();
    storage.setItem(TUTORIAL_STATE_STORAGE_KEY, JSON.stringify(state));
    clearTutorialState(storage);
    expect(storage.getItem(TUTORIAL_STATE_STORAGE_KEY)).toBeNull();
  });
});

// ── Legacy Bridge ────────────────────────────────────────────

describe('bridgeLegacyTutorialSeen', () => {
  it('returns completed state when legacy tutorialSeen is true', () => {
    const storage = createInMemoryStorage();
    const result = bridgeLegacyTutorialSeen(storage, true);
    expect(result.status).toBe('completed');
    expect(result.completedAt).toBeNull();
  });

  it('returns not_seen state when legacy tutorialSeen is false', () => {
    const storage = createInMemoryStorage();
    const result = bridgeLegacyTutorialSeen(storage, false);
    expect(result.status).toBe('not_seen');
  });

  it('returns not_seen state when legacy tutorialSeen is undefined', () => {
    const storage = createInMemoryStorage();
    const result = bridgeLegacyTutorialSeen(storage, undefined);
    expect(result.status).toBe('not_seen');
  });

  it('prefers existing new-style state over legacy flag', () => {
    const storage = createInMemoryStorage();
    const existing: MainStreetTutorialStateV1 = {
      schemaVersion: 1,
      status: 'skipped',
      completedAt: null,
      lastStepId: 'T3',
    };
    storage.setItem(TUTORIAL_STATE_STORAGE_KEY, JSON.stringify(existing));
    // Even though legacy says true (completed), new-style takes precedence
    const result = bridgeLegacyTutorialSeen(storage, true);
    expect(result.status).toBe('skipped');
    expect(result.lastStepId).toBe('T3');
  });

  it('uses legacy flag when new-style state is default not_seen', () => {
    const storage = createInMemoryStorage();
    // Pre-seed with a default not_seen (simulating a fresh default write)
    storage.setItem(TUTORIAL_STATE_STORAGE_KEY, JSON.stringify(createDefaultTutorialState()));
    const result = bridgeLegacyTutorialSeen(storage, true);
    expect(result.status).toBe('completed');
  });
});

// ── BrowserLocalStorageAdapter ──────────────────────────────

describe('BrowserLocalStorageAdapter', () => {
  let mockStorage: Map<string, string>;
  let adapter: BrowserLocalStorageAdapter;

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
    adapter = new BrowserLocalStorageAdapter();
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
    const noWindowAdapter = new BrowserLocalStorageAdapter();
    expect(noWindowAdapter.getItem('any-key')).toBeNull();
    expect(() => noWindowAdapter.setItem('any-key', 'value')).not.toThrow();
    expect(() => noWindowAdapter.removeItem('any-key')).not.toThrow();
  });
});
