import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveLoadStore } from '../../src/core-engine';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import {
  createDefaultCampaignProgress,
  loadCampaignProgress,
  loadTurnStartCheckpoint,
  mainStreetStateSerializer,
  saveCampaignProgress,
  saveTurnStartCheckpoint,
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

describe('Main Street save/load integration', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores turn-start checkpoint deterministically', async () => {
    const store = new SaveLoadStore();
    const state = setupMainStreetGame({ seed: 'save-load-turn-start' });

    executeDayStart(state);
    const card = state.market.business[0];
    executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
    processEndOfTurn(state);

    await saveTurnStartCheckpoint(store, state);
    const restored = await loadTurnStartCheckpoint(store);
    expect(restored).not.toBeNull();

    const expected = setupMainStreetGame({ seed: 'save-load-turn-start' });
    executeDayStart(expected);
    executeAction(expected, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
    processEndOfTurn(expected);

    expect(restored!.turn).toBe(expected.turn);
    expect(restored!.phase).toBe(expected.phase);
    expect(restored!.resourceBank).toEqual(expected.resourceBank);
    expect(restored!.streetGrid.map((b) => b?.id ?? null)).toEqual(
      expected.streetGrid.map((b) => b?.id ?? null),
    );
  });

  it('rejects incompatible checkpoint version', async () => {
    const store = new SaveLoadStore();
    const state = setupMainStreetGame({ seed: 'save-load-version-mismatch' });
    const payload = {
      schemaVersion: 999,
      data: mainStreetStateSerializer.serialize(state),
    };

    await store.save('run-checkpoint', 'main-street', 'turn-start', payload.schemaVersion, payload);

    await expect(loadTurnStartCheckpoint(store)).rejects.toThrow(/Incompatible save version/);
  });

  it('persists and restores campaign progression separately from run checkpoint', async () => {
    const store = new SaveLoadStore();
    const progress = createDefaultCampaignProgress();
    progress.totalRuns = 12;
    progress.totalWins = 7;
    progress.persistentReputation = 31;
    progress.unlockedTiers.push('tier-2');

    await saveCampaignProgress(store, progress);
    const loaded = await loadCampaignProgress(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.totalRuns).toBe(12);
    expect(loaded!.totalWins).toBe(7);
    expect(loaded!.persistentReputation).toBe(31);
    expect(loaded!.unlockedTiers).toContain('tier-2');

    const runSaves = await store.list('run-checkpoint', 'main-street');
    expect(runSaves).toHaveLength(0);
  });
});
