import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveLoadStore } from '../../src/core-engine';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import type { MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  computeScore,
  type PlayerAction,
} from '../../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canPurchaseEvent,
} from '../../example-games/main-street/MainStreetMarket';
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
    state.resourceBank.coins = 1000;
    const card = state.market.cards.find(
      c =>
        (c.family === 'business' || c.family === 'community-space') &&
        c.cost <= state.resourceBank.coins,
    )!;
    executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
    processEndOfTurn(state);

    await saveTurnStartCheckpoint(store, state);
    const restored = await loadTurnStartCheckpoint(store);
    expect(restored).not.toBeNull();

    const expected = setupMainStreetGame({ seed: 'save-load-turn-start' });
    executeDayStart(expected);
    expected.resourceBank.coins = 1000;
    const expectedCard = expected.market.cards.find(
      c =>
        (c.family === 'business' || c.family === 'community-space') &&
        c.cost <= expected.resourceBank.coins,
    )!;
    executeAction(expected, { type: 'buy-business', cardId: expectedCard.id, slotIndex: 0 });
    processEndOfTurn(expected);

    expect(restored!.turn).toBe(expected.turn);
    expect(restored!.phase).toBe(expected.phase);
    expect(restored!.resourceBank).toEqual(expected.resourceBank);
    expect(restored!.streetGrid.map((b) => b?.id ?? null)).toEqual(
      expected.streetGrid.map((b) => b?.id ?? null),
    );
  });

  it('rejects incompatible checkpoint version (returns null via CheckpointManager)', async () => {
    const store = new SaveLoadStore();
    const state = setupMainStreetGame({ seed: 'save-load-version-mismatch' });
    const payload = {
      schemaVersion: 999,
      data: mainStreetStateSerializer.serialize(state),
    };

    await store.save('run-checkpoint', 'main-street', 'turn-start', payload.schemaVersion, payload);

    // CheckpointManager.load() catches schema version mismatch and returns null
    const result = await loadTurnStartCheckpoint(store);
    expect(result).toBeNull();
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

  it('deterministic restore: checkpoint-and-replay produces identical outcome', async () => {
    const SEED = 'smoke-deterministic-restore';
    const CHECKPOINT_AFTER = 3;
    const MAX_TURNS = 20;

    /** Simple greedy strategy: buy cheapest business, play events, buy upgrades. */
    function chooseActions(state: MainStreetState): PlayerAction[] {
      const actions: PlayerAction[] = [];
      const empty = getEmptySlots(state);
      const affordable = getAffordableBusinessCards(state);
      affordable.sort((a, b) => a.cost - b.cost);

      for (const card of affordable) {
        if (empty.length === 0) break;
        if (state.resourceBank.coins < card.cost) break;
        actions.push({ type: 'buy-business', cardId: card.id, slotIndex: empty.shift()! });
        break;
      }

      if ((state.hand ?? []).some(c => c.family === 'event')) {
        actions.push({ type: 'play-event' });
      }

      for (const card of state.market.cards) {
        if (card.family !== 'event') continue;
        if (canPurchaseEvent(state, card.id).legal) {
          actions.push({ type: 'buy-event', cardId: card.id });
          break;
        }
      }

      const upgrades = getAffordableUpgradeCards(state);
      if (upgrades.length > 0) {
        const upg = upgrades[0];
        const slot = state.streetGrid.findIndex(
          (b) => b !== null && b.upgradePath === upg.targetBusiness && b.level < b.maxLevel,
        );
        if (slot >= 0) {
          actions.push({ type: 'buy-upgrade', cardId: upg.id, targetSlot: slot });
        }
      }

      actions.push({ type: 'end-turn' });
      return actions;
    }

    interface Snapshot {
      turn: number;
      coins: number;
      reputation: number;
      score: number;
      gridIds: (string | null)[];
      gameResult: string;
    }

    function snap(s: MainStreetState): Snapshot {
      return {
        turn: s.turn,
        coins: s.resourceBank.coins,
        reputation: s.resourceBank.reputation,
        score: computeScore(s),
        gridIds: s.streetGrid.map((b) => b?.id ?? null),
        gameResult: s.gameResult,
      };
    }

    function playToEnd(s: MainStreetState): Snapshot[] {
      const out: Snapshot[] = [];
      while (s.gameResult === 'playing' && s.turn <= MAX_TURNS) {
        executeDayStart(s);
        for (const a of chooseActions(s)) {
          if (a.type === 'end-turn') break;
          try { executeAction(s, a); } catch { /* skip illegal */ }
        }
        processEndOfTurn(s);
        out.push(snap(s));
        if (s.gameResult !== 'playing') break;
      }
      return out;
    }

    const store = new SaveLoadStore();

    // Phase 1: play N turns then save
    const stateA = setupMainStreetGame({ seed: SEED });
    for (let t = 0; t < CHECKPOINT_AFTER && stateA.gameResult === 'playing' && stateA.turn <= MAX_TURNS; t++) {
      executeDayStart(stateA);
      for (const a of chooseActions(stateA)) {
        if (a.type === 'end-turn') break;
        try { executeAction(stateA, a); } catch { /* skip */ }
      }
      processEndOfTurn(stateA);
    }
    const checkpointTurn = stateA.turn;
    const checkpointCoins = stateA.resourceBank.coins;
    await saveTurnStartCheckpoint(store, stateA);

    // Phase 2: continue to completion (path A)
    const pathA = playToEnd(stateA);

    // Phase 3: restore and replay (path B)
    const restored = await loadTurnStartCheckpoint(store);
    expect(restored).not.toBeNull();
    expect(restored!.turn).toBe(checkpointTurn);
    expect(restored!.resourceBank.coins).toBe(checkpointCoins);

    const pathB = playToEnd(restored!);

    // Phase 4: assert identical outcomes
    expect(pathA.length).toBe(pathB.length);
    for (let i = 0; i < pathA.length; i++) {
      expect(pathB[i]).toEqual(pathA[i]);
    }

    // Final state equivalence
    expect(snap(restored!)).toEqual(snap(stateA));
  });

  it('campaign persistence round-trip within smoke scenario', async () => {
    const store = new SaveLoadStore();
    const campaign = createDefaultCampaignProgress();
    campaign.totalRuns = 5;
    campaign.totalWins = 2;
    campaign.persistentReputation = 14;
    campaign.highestScore = 42;
    campaign.unlockedTiers.push('tier-2');

    await saveCampaignProgress(store, campaign);
    const loaded = await loadCampaignProgress(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.totalRuns).toBe(5);
    expect(loaded!.totalWins).toBe(2);
    expect(loaded!.persistentReputation).toBe(14);
    expect(loaded!.highestScore).toBe(42);
    expect(loaded!.unlockedTiers).toContain('tier-2');

    // Campaign data is isolated from run checkpoints
    const runSlots = await store.list('run-checkpoint', 'main-street');
    const campaignSlots = await store.list('campaign', 'main-street');
    expect(runSlots).toHaveLength(0);
    expect(campaignSlots.length).toBeGreaterThan(0);
  });
});
