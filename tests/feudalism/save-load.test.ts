/**
 * Integration tests for Feudalism save/load checkpoint round-trip.
 *
 * Exercises:
 * - serialize/deserialize round-trip for full FeudalismSession state
 * - Checkpoint save after human turn and after AI turn
 * - Game state equality before save and after load/restore
 * - RNG seed serialization and reconstruction
 * - Market deck contents (all 3 tiers) faithfully serialized and restored
 * - Checkpoint cleared on game end
 *
 * Follows the pattern in tests/beleaguered-castle/save-load-autosave.test.ts
 * and satisfies: CG-0MQL8BEXS003ZNNN
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveLoadStore, CheckpointManager } from '../../src/core-engine';
import {
  setupFeudalismGame,
  executeTurn,
  type FeudalismSession,
  type TurnAction,
} from '../../example-games/feudalism/FeudalismGame';
import {
  serializeFeudalismState,
  deserializeFeudalismState,
  createFeudalismSerializer,
  saveFeudalismCheckpoint,
  loadFeudalismCheckpoint,
  clearFeudalismCheckpoint,
  FEUDALISM_GAME_TYPE,
} from '../../example-games/feudalism/FeudalismSaveLoad';
import { createSeededRng } from '../../src/core-engine';

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

/** Default seed for test games. */
const TEST_SEED = 42;

/**
 * Set up a 2-player Feudalism game with a deterministic seed.
 * Player 0 is human, Player 1 is AI.
 */
function setupTestSession(): FeudalismSession {
  return setupFeudalismGame({
    playerCount: 2,
    playerNames: ['Human', 'AI'],
    isAI: [false, true],
    rng: createSeededRng(TEST_SEED),
  });
}

/**
 * Execute a simple legal turn for the current player.
 * Tries 'take-different' first if available, then 'take-same', then reserves.
 * Returns the action taken, or null if no action was possible.
 */
function executeSimpleTurn(session: FeudalismSession): TurnAction | null {
  // Try take-different with first 3 available resources
  const availColors = (['oats', 'flax', 'wheat', 'barley', 'turnip'] as const)
    .filter((c) => (session.tokenSupply[c] ?? 0) > 0);

  let action: TurnAction;

  if (availColors.length >= 3) {
    action = { type: 'take-different', colors: [availColors[0], availColors[1], availColors[2]] };
  } else if (availColors.length >= 1) {
    // Take as many different as available
    action = { type: 'take-different', colors: availColors };
  } else if ((session.tokenSupply['oats'] ?? 0) >= 4) {
    action = { type: 'take-same', color: 'oats' };
  } else {
    // Try reserve
    for (const tier of [1, 2, 3] as const) {
      for (const card of session.market[tier].visible) {
        if (card) {
          action = { type: 'reserve', cardId: card.id };
          try {
            executeTurn(session, action);
            return action;
          } catch {
            continue;
          }
        }
      }
    }
    return null;
  }

  try {
    executeTurn(session, action);
    return action;
  } catch {
    return null;
  }
}

/**
 * Create a summary of the session state for equality comparison.
 * Excludes the rng function (not comparable) and uses card IDs
 * for market and player card references.
 */
function summarizeSession(session: FeudalismSession): Record<string, unknown> {
  return {
    phase: session.phase,
    currentPlayerIndex: session.currentPlayerIndex,
    startingPlayerIndex: session.startingPlayerIndex,
    triggerPlayerIndex: session.triggerPlayerIndex,
    playerCount: session.players.length,
    playerNames: session.players.map((p) => p.name),
    playerAI: session.players.map((p) => p.isAI),
    playerTokenCounts: session.players.map((p) => ({ ...p.tokens })),
    purchasedCardCounts: session.players.map((p) => p.purchasedCards.length),
    reservedCardCounts: session.players.map((p) => p.reservedCards.length),
    patronCounts: session.players.map((p) => p.patrons.length),
    tokenSupply: { ...session.tokenSupply },
    marketTier1Visible: session.market[1].visible.map((c) => c?.id ?? null),
    marketTier2Visible: session.market[2].visible.map((c) => c?.id ?? null),
    marketTier3Visible: session.market[3].visible.map((c) => c?.id ?? null),
    marketTier1DeckSize: session.market[1].deck.length,
    marketTier2DeckSize: session.market[2].deck.length,
    marketTier3DeckSize: session.market[3].deck.length,
    poolPatronCount: session.patrons.length,
  };
}

/**
 * Create a detailed comparison of two sessions for deep equality checking.
 * Compares individual fields that should match exactly.
 */
function expectSessionsEqual(
  actual: FeudalismSession,
  expected: FeudalismSession,
): void {
  // Phase and index fields
  expect(actual.phase).toBe(expected.phase);
  expect(actual.currentPlayerIndex).toBe(expected.currentPlayerIndex);
  expect(actual.startingPlayerIndex).toBe(expected.startingPlayerIndex);
  expect(actual.triggerPlayerIndex).toBe(expected.triggerPlayerIndex);

  // Player states
  expect(actual.players.length).toBe(expected.players.length);
  for (let i = 0; i < actual.players.length; i++) {
    expect(actual.players[i].name).toBe(expected.players[i].name);
    expect(actual.players[i].isAI).toBe(expected.players[i].isAI);
    expect(actual.players[i].tokens).toEqual(expected.players[i].tokens);
    expect(actual.players[i].purchasedCards.map((c) => c.id)).toEqual(
      expected.players[i].purchasedCards.map((c) => c.id),
    );
    expect(actual.players[i].reservedCards.map((c) => c.id)).toEqual(
      expected.players[i].reservedCards.map((c) => c.id),
    );
    expect(actual.players[i].patrons.map((pt) => pt.id)).toEqual(
      expected.players[i].patrons.map((pt) => pt.id),
    );
  }

  // Token supply
  expect(actual.tokenSupply).toEqual(expected.tokenSupply);

  // Market decks and visible cards
  for (const tier of [1, 2, 3] as const) {
    expect(actual.market[tier].visible.map((c) => c?.id ?? null)).toEqual(
      expected.market[tier].visible.map((c) => c?.id ?? null),
    );
    expect(actual.market[tier].deck.map((c) => c.id)).toEqual(
      expected.market[tier].deck.map((c) => c.id),
    );
  }

  // Pool patrons
  expect(actual.patrons.map((pt) => pt.id)).toEqual(
    expected.patrons.map((pt) => pt.id),
  );

  // RNG should be a function on both
  expect(typeof actual.rng).toBe('function');
  expect(typeof expected.rng).toBe('function');
}

// ── Tests ───────────────────────────────────────────────────

describe('Feudalism save/load integration (CG-0MQL8BEXS003ZNNN)', () => {
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

  // ── Serializer round-trip ─────────────────────────────────

  it('serialize/deserialize round-trip preserves full session state', () => {
    const session = setupTestSession();

    // Play a few turns to create non-trivial state
    for (let i = 0; i < 4; i++) {
      const action = executeSimpleTurn(session);
      if (!action) break;
    }

    const summaryBefore = summarizeSession(session);

    // Serialize and deserialize
    const serialized = serializeFeudalismState(session, TEST_SEED);
    const restored = deserializeFeudalismState(serialized);

    const summaryAfter = summarizeSession(restored);
    expect(summaryAfter).toEqual(summaryBefore);
    expectSessionsEqual(restored, session);
  });

  it('serialize/deserialize round-trip works on fresh session (no turns played)', () => {
    const session = setupTestSession();
    const summaryBefore = summarizeSession(session);

    const serialized = serializeFeudalismState(session, TEST_SEED);
    const restored = deserializeFeudalismState(serialized);

    expectSessionsEqual(restored, session);
    expect(summarizeSession(restored)).toEqual(summaryBefore);
  });

  it('serializer has correct schema version', () => {
    const serializer = createFeudalismSerializer(TEST_SEED);
    expect(serializer.schemaVersion).toBe(1);
  });

  // ── Save/Load round-trip via SaveLoadStore ────────────────

  it('save/load round-trip: checkpoint preserves full state', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Play a few turns
    for (let i = 0; i < 5; i++) {
      const action = executeSimpleTurn(session);
      if (!action) break;
    }

    const summaryBefore = summarizeSession(session);

    // Save checkpoint
    await saveFeudalismCheckpoint(store, session, TEST_SEED);

    // Load and verify
    const restored = await loadFeudalismCheckpoint(store);
    expect(restored).not.toBeNull();
    expectSessionsEqual(restored!, session);
    expect(summarizeSession(restored!)).toEqual(summaryBefore);
  });

  it('save/load round-trip: multiple saves overwrite correctly', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Save initial state
    const summaryInitial = summarizeSession(session);
    await saveFeudalismCheckpoint(store, session, TEST_SEED);

    // Play a turn and save again
    executeSimpleTurn(session);
    const summaryAfterTurn = summarizeSession(session);
    await saveFeudalismCheckpoint(store, session, TEST_SEED);

    // Load should return the latest (after turn), not initial
    const restored = await loadFeudalismCheckpoint(store);
    expect(restored).not.toBeNull();
    expect(summarizeSession(restored!)).toEqual(summaryAfterTurn);
    expect(summarizeSession(restored!)).not.toEqual(summaryInitial);
  });

  it('save/load round-trip: serializer works with CheckpointManager', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Play a couple turns
    executeSimpleTurn(session);
    executeSimpleTurn(session);

    const summaryBefore = summarizeSession(session);
    const serializer = createFeudalismSerializer(TEST_SEED);
    const manager = new CheckpointManager(store, FEUDALISM_GAME_TYPE, 'test-slot', serializer);

    // Save via CheckpointManager
    await manager.save(session);

    // Load via CheckpointManager
    const loaded = await manager.load();
    expect(loaded).not.toBeNull();

    // RNG is recreated, so the restored session has a new rng function
    // But the state should match
    const summaryAfter = summarizeSession(loaded!);
    expect(summaryAfter).toEqual(summaryBefore);
  });

  // ── Human and AI turns ───────────────────────────────────

  it('checkpoint saves after human turn (player 0)', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Player 0 (human) takes a turn
    expect(session.currentPlayerIndex).toBe(0);
    executeSimpleTurn(session);

    // Save after human turn
    await saveFeudalismCheckpoint(store, session, TEST_SEED);

    // Load and verify state
    const loaded = await loadFeudalismCheckpoint(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.currentPlayerIndex).not.toBe(0); // Should have advanced to next player
    expect(summarizeSession(loaded!)).toEqual(summarizeSession(session));
  });

  it('checkpoint saves after AI turn (player 1)', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Player 0 takes a turn (advances to player 1)
    executeSimpleTurn(session);

    // Now player 1 (AI) should be current
    expect(session.currentPlayerIndex).toBe(1);

    // AI takes a turn
    executeSimpleTurn(session);

    // Save after AI turn
    await saveFeudalismCheckpoint(store, session, TEST_SEED);

    // Load and verify
    const loaded = await loadFeudalismCheckpoint(store);
    expect(loaded).not.toBeNull();
    expect(summarizeSession(loaded!)).toEqual(summarizeSession(session));
  });

  it('checkpoint survives multiple human+AI turns', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Play 6 turns (3 rounds for 2 players)
    for (let i = 0; i < 6; i++) {
      const action = executeSimpleTurn(session);
      if (!action) break;
    }

    const summaryBefore = summarizeSession(session);
    await saveFeudalismCheckpoint(store, session, TEST_SEED);

    const restored = await loadFeudalismCheckpoint(store);
    expect(restored).not.toBeNull();
    expect(summarizeSession(restored!)).toEqual(summaryBefore);
  });

  // ── RNG seed serialization ──────────────────────────────

  it('RNG seed is serialized and RNG is reconstructed on deserialize', () => {
    const session = setupTestSession();

    const serialized = serializeFeudalismState(session, TEST_SEED);
    expect(serialized.seed).toBe(TEST_SEED);

    const restored = deserializeFeudalismState(serialized);
    // The restored session should have a working RNG
    expect(typeof restored.rng).toBe('function');

    // Deterministic check: two restores from same serialized state
    // should produce RNGs with the same first value
    const restored2 = deserializeFeudalismState(serialized);
    expect(restored.rng()).toBe(restored2.rng());
  });

  it('different seeds produce different restored sessions', () => {
    // Set up two sessions with different seeds
    const session1 = setupTestSession(); // seed 42

    const session2 = setupFeudalismGame({
      playerCount: 2,
      rng: createSeededRng(99),
    });

    const serialized1 = serializeFeudalismState(session1, TEST_SEED);
    const serialized2 = serializeFeudalismState(session2, 99);

    // Different seeds -> different market layouts
    expect(serialized1.market[1].visible).not.toEqual(serialized2.market[1].visible);
  });

  // ── Market deck contents ────────────────────────────────

  it('market deck contents (all 3 tiers) faithfully serialized and restored', () => {
    const session = setupTestSession();

    // Play a few turns that consume some market cards via reserve/purchase
    for (let i = 0; i < 6; i++) {
      executeSimpleTurn(session);
    }

    // Check market state before serialization
    const marketBefore = [
      { visible: session.market[1].visible.map((c) => c?.id ?? null), deckIds: session.market[1].deck.map((c) => c.id) },
      { visible: session.market[2].visible.map((c) => c?.id ?? null), deckIds: session.market[2].deck.map((c) => c.id) },
      { visible: session.market[3].visible.map((c) => c?.id ?? null), deckIds: session.market[3].deck.map((c) => c.id) },
    ];

    const serialized = serializeFeudalismState(session, TEST_SEED);
    const restored = deserializeFeudalismState(serialized);

    // Verify market contents match exactly
    for (const tier of [1, 2, 3] as const) {
      const idx = tier - 1;
      expect(restored.market[tier].visible.map((c) => c?.id ?? null))
        .toEqual(marketBefore[idx].visible);
      expect(restored.market[tier].deck.map((c) => c.id))
        .toEqual(marketBefore[idx].deckIds);
    }
  });

  it('deck ordering is preserved through save/load', () => {
    const session = setupTestSession();

    // Check deck ordering is preserved
    const deck1Before = session.market[1].deck.map((c) => c.id);

    const serialized = serializeFeudalismState(session, TEST_SEED);
    const restored = deserializeFeudalismState(serialized);

    const deck1After = restored.market[1].deck.map((c) => c.id);
    expect(deck1After).toEqual(deck1Before);
  });

  // ── Game end / checkpoint clear ─────────────────────────

  it('clear checkpoint removes saved data', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    // Save checkpoint
    await saveFeudalismCheckpoint(store, session, TEST_SEED);
    expect(await loadFeudalismCheckpoint(store)).not.toBeNull();

    // Clear it
    await clearFeudalismCheckpoint(store);

    // Verify it's gone
    const loaded = await loadFeudalismCheckpoint(store);
    expect(loaded).toBeNull();
  });

  it('clear is safe to call when no checkpoint exists', async () => {
    const store = new SaveLoadStore();
    await expect(clearFeudalismCheckpoint(store)).resolves.toBeUndefined();
    expect(await loadFeudalismCheckpoint(store)).toBeNull();
  });

  it('checkpoint persists across separate store instances', async () => {
    const store1 = new SaveLoadStore();
    const session = setupTestSession();

    // Play a few turns
    for (let i = 0; i < 3; i++) {
      executeSimpleTurn(session);
    }

    const expectedSummary = summarizeSession(session);

    // Save with one store instance
    await saveFeudalismCheckpoint(store1, session, TEST_SEED);

    // Load with a different store instance (same localStorage backend)
    const store2 = new SaveLoadStore();
    const loaded = await loadFeudalismCheckpoint(store2);
    expect(loaded).not.toBeNull();
    expect(summarizeSession(loaded!)).toEqual(expectedSummary);
  });

  // ── Checkpoint lifecycle ─────────────────────────────────

  it('load returns null when no checkpoint has been saved', async () => {
    const store = new SaveLoadStore();
    const result = await loadFeudalismCheckpoint(store);
    expect(result).toBeNull();
  });

  it('clear then load returns null', async () => {
    const store = new SaveLoadStore();
    const session = setupTestSession();

    await saveFeudalismCheckpoint(store, session, TEST_SEED);
    expect(await loadFeudalismCheckpoint(store)).not.toBeNull();

    await clearFeudalismCheckpoint(store);
    expect(await loadFeudalismCheckpoint(store)).toBeNull();
  });
});
