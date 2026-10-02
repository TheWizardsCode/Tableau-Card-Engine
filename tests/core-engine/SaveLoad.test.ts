import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SaveLoadStore,
  serializeWithVersion,
  deserializeWithVersion,
  type SaveSerializer,
} from '../../src/core-engine/SaveLoad';

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

describe('SaveLoadStore', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('saves and loads run checkpoints by slot', async () => {
    const store = new SaveLoadStore();
    const saved = await store.save('run-checkpoint', 'main-street', 'slot-a', 1, { turn: 2 });
    expect(saved).not.toBeNull();

    const loaded = await store.load<{ turn: number }>('run-checkpoint', 'main-street', 'slot-a');
    expect(loaded).not.toBeNull();
    expect(loaded!.payload.turn).toBe(2);
  });

  it('keeps run and campaign domains separated', async () => {
    const store = new SaveLoadStore();
    await store.save('run-checkpoint', 'main-street', 'slot-a', 1, { value: 'run' });
    await store.save('campaign', 'main-street', 'slot-a', 1, { value: 'campaign' });

    const run = await store.load<{ value: string }>('run-checkpoint', 'main-street', 'slot-a');
    const campaign = await store.load<{ value: string }>('campaign', 'main-street', 'slot-a');
    expect(run!.payload.value).toBe('run');
    expect(campaign!.payload.value).toBe('campaign');
  });

  it('replaces existing slot with newer save', async () => {
    const store = new SaveLoadStore();
    await store.save('run-checkpoint', 'main-street', 'slot-a', 1, { turn: 1 });
    await store.save('run-checkpoint', 'main-street', 'slot-a', 1, { turn: 3 });

    const list = await store.list('run-checkpoint', 'main-street');
    expect(list).toHaveLength(1);
    expect((list[0].payload as { turn: number }).turn).toBe(3);
  });

  it('returns localStorage backend name when IndexedDB is unavailable', async () => {
    const store = new SaveLoadStore();
    expect(await store.getBackendName()).toBe('localStorage');
  });

  it('returns null backend when no storage exists', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', undefined);
    const store = new SaveLoadStore();

    expect(await store.getBackendName()).toBeNull();
    expect(await store.save('run-checkpoint', 'main-street', 'slot-a', 1, { a: 1 })).toBeNull();
  });
});

describe('versioned serializer helpers', () => {
  const serializer: SaveSerializer<{ n: number }, { n: number }> = {
    schemaVersion: 7,
    serialize: (state) => ({ n: state.n }),
    deserialize: (data) => ({ n: data.n }),
  };

  it('round-trips with matching version', () => {
    const payload = serializeWithVersion(serializer, { n: 42 });
    const restored = deserializeWithVersion(serializer, payload);
    expect(restored).toEqual({ n: 42 });
  });

  it('rejects incompatible versions', () => {
    expect(() =>
      deserializeWithVersion(serializer, {
        schemaVersion: 8,
        data: { n: 1 },
      }),
    ).toThrow(/Incompatible save version/);
  });
});
