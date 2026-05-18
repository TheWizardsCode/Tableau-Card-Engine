/**
 * Gym Save/Load scenario tests.
 *
 * Validates that:
 *  - SaveLoadStore can save and load serialized state
 *  - Malformed payloads are detected and handled safely
 *  - Round-trip fidelity is maintained
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  SaveLoadStore,
  serializeWithVersion,
  deserializeWithVersion,
} from '../../src/core-engine';
import type { SaveSerializer } from '../../src/core-engine';

/** Simple state for testing. */
interface DemoState {
  counter: number;
  label: string;
}

interface DemoSerialized {
  c: number;
  l: string;
}

const DEMO_SERIALIZER: SaveSerializer<DemoState, DemoSerialized> = {
  schemaVersion: 1,
  serialize(state: DemoState): DemoSerialized {
    return { c: state.counter, l: state.label };
  },
  deserialize(data: DemoSerialized): DemoState {
    return { counter: data.c, label: data.l };
  },
};

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

describe('Gym Save/Load scenarios', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('save and load round-trips state correctly', async () => {
    const store = new SaveLoadStore({ localStoragePrefix: 'gym-test-rl' });
    const state: DemoState = { counter: 42, label: 'test' };

    await store.saveSerialized('run-checkpoint', 'gym-test', 'slot-1', DEMO_SERIALIZER, state);

    const loaded = await store.loadSerialized('run-checkpoint', 'gym-test', 'slot-1', DEMO_SERIALIZER);

    expect(loaded).not.toBeNull();
    expect(loaded!.counter).toBe(42);
    expect(loaded!.label).toBe('test');

    // Clean up
    await store.clear('run-checkpoint', 'gym-test');
  });

  it('returns null for missing save', async () => {
    const store = new SaveLoadStore({ localStoragePrefix: 'gym-test-missing' });
    const loaded = await store.loadSerialized('run-checkpoint', 'gym-test-missing', 'no-such-slot', DEMO_SERIALIZER);
    expect(loaded).toBeNull();
  });

  it('handles version mismatch safely', async () => {
    const store = new SaveLoadStore({ localStoragePrefix: 'gym-test-ver' });

    // Write a save with schema version 99 (wrong version)
    await store.save('run-checkpoint', 'gym-test-ver', 'bad-slot', 99, { c: 1, l: 'x' });

    // Trying to load with version 1 serializer should detect mismatch
    await expect(
      store.loadSerialized('run-checkpoint', 'gym-test-ver', 'bad-slot', DEMO_SERIALIZER),
    ).rejects.toThrow('Incompatible save version');

    // Clean up
    await store.clear('run-checkpoint', 'gym-test-ver');
  });

  it('serializeWithVersion / deserializeWithVersion work', () => {
    const state: DemoState = { counter: 10, label: 'hello' };
    const versioned = serializeWithVersion(DEMO_SERIALIZER, state);

    expect(versioned.schemaVersion).toBe(1);
    expect(versioned.data.c).toBe(10);
    expect(versioned.data.l).toBe('hello');

    const restored = deserializeWithVersion(DEMO_SERIALIZER, versioned);
    expect(restored.counter).toBe(10);
    expect(restored.label).toBe('hello');
  });

  it('remove deletes save data', async () => {
    const store = new SaveLoadStore({ localStoragePrefix: 'gym-test-rm' });
    const state: DemoState = { counter: 99, label: 'remove-test' };

    await store.saveSerialized('run-checkpoint', 'gym-test-rm', 'slot-rm', DEMO_SERIALIZER, state);
    const loaded = await store.loadSerialized('run-checkpoint', 'gym-test-rm', 'slot-rm', DEMO_SERIALIZER);
    expect(loaded).not.toBeNull();

    await store.remove('run-checkpoint', 'gym-test-rm', 'slot-rm');
    const afterRemove = await store.loadSerialized('run-checkpoint', 'gym-test-rm', 'slot-rm', DEMO_SERIALIZER);
    expect(afterRemove).toBeNull();
  });
});