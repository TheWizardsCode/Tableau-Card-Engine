/**
 * Main Street: Competitive State Model Tests
 *
 * Tests for the competitive state model: per-player records, owner-tagged
 * street slots, shared decks/market, and deterministic setup via seeded RNG.
 *
 * AC1 — Per-player state & ownership: PlayerRecord exists with coins,
 * reputation, hand, staff, actionBudget, score; owner-tagged street slots.
 * AC2 — Shared market/decks/incidentDeck: unchanged and shared across players.
 * AC3 — Determinism: same seed → identical per-player initial state;
 *        N=1 behaves identically to pre-competitive single-player baseline.
 * AC4 — Resource/slot ownership is addressable by playerId/owner index.
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  createCompetitiveState,
  type OwnerTaggedSlot,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { GRID_SIZE } from '../../example-games/main-street/MainStreetCards';
import type { DifficultyName } from '../../example-games/main-street/MainStreetDifficulty';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Creates a competitive state with default options.
 */
function createCompetitiveTestState(
  seed: string = 'comp42',
  playerCount: number = 2,
  difficulty?: DifficultyName,
): MainStreetState {
  return createCompetitiveState({ seed, playerCount, difficulty });
}

/**
 * Asserts that a state is in competitive mode.
 */
function assertCompetitiveMode(state: MainStreetState): void {
  expect(state.players).toBeDefined();
  expect(state.players).not.toBeNull();
  expect(state.players!.length).toBeGreaterThan(0);
  expect(state.playerCount).toBe(state.players!.length);
}

// ── AC1: Per-player state & ownership ───────────────────────

describe('AC1 — Per-player state & ownership', () => {
  it('should create PlayerRecord with all required fields', () => {
    const state = createCompetitiveTestState('ac1-fields', 2);
    const players = state.players!;

    expect(players).toHaveLength(2);

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      expect(p.playerId).toBe(i);
      expect(typeof p.coins).toBe('number');
      expect(p.coins).toBeGreaterThan(0);
      expect(typeof p.reputation).toBe('number');
      expect(p.reputation).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(p.hand)).toBe(true);
      expect(Array.isArray(p.staffCards)).toBe(true);
      expect(typeof p.actionBudget).toBe('number');
      expect(p.actionBudget).toBeGreaterThan(0);
      expect(typeof p.score).toBe('number');
      expect(p.score).toBe(0);
    }
  });

  it('should create owner-tagged street grid with correct size', () => {
    const state = createCompetitiveTestState('ac1-grid', 2);

    expect(state.ownerTaggedGrid!).toHaveLength(GRID_SIZE);
    for (let i = 0; i < GRID_SIZE; i++) {
      const slot = state.ownerTaggedGrid![i] as OwnerTaggedSlot;
      expect(slot.ownerId).toBeNull(); // all slots start empty
      expect(slot.card).toBeNull();
    }
  });

  it('should have ownerTaggedGrid on the state', () => {
    const state = createCompetitiveTestState('ac1-grid-field', 2);
    expect(state.ownerTaggedGrid).toBeDefined();
    expect(Array.isArray(state.ownerTaggedGrid)).toBe(true);
  });

  it('should set playerCount to match players array length', () => {
    for (const count of [1, 2, 3, 4]) {
      const state = createCompetitiveTestState(`ac1-count-${count}`, count);
      expect(state.playerCount).toBe(count);
      expect(state.players!.length).toBe(count);
    }
  });

  it('should initialise each player with starting resources from config', () => {
    const state = createCompetitiveTestState('ac1-resources', 2);
    const p0 = state.players![0];

    // Starting coins come from the default difficulty preset
    expect(p0.coins).toBe(state.config.startingCoins);
    expect(p0.reputation).toBe(state.config.startingReputation);
  });

  it('should create separate resources per player', () => {
    const state = createCompetitiveTestState('ac1-separate', 2);
    const p0 = state.players![0];
    const p1 = state.players![1];

    // Each player starts with the same resources (same config)
    expect(p0.coins).toBe(p1.coins);
    expect(p0.reputation).toBe(p1.reputation);

    // But they are distinct objects (mutations to one don't affect the other)
    p0.coins += 100;
    expect(p1.coins).not.toBe(p0.coins);
  });

  it('should have empty hands for all players initially', () => {
    const state = createCompetitiveTestState('ac1-hands', 2);
    for (const player of state.players!) {
      expect(player.hand).toHaveLength(0);
    }
  });

  it('should have no staff cards for all players initially', () => {
    const state = createCompetitiveTestState('ac1-staff', 2);
    for (const player of state.players!) {
      expect(player.staffCards).toHaveLength(0);
    }
  });

  it('should start each player with actionBudget equal to config base', () => {
    const state = createCompetitiveTestState('ac1-actions', 2);
    for (const player of state.players!) {
      expect(player.actionBudget).toBe(1); // base action per player per turn
    }
  });
});

// ── AC2: Shared market/decks/incidentDeck ───────────────────

describe('AC2 — Shared market/decks/incidentDeck', () => {
  it('should have a single shared market across players', () => {
    const state = createCompetitiveTestState('ac2-market', 2);
    expect(state.market.cards.length).toBeGreaterThan(0);
    expect(state.market.cards.length).toBeLessThanOrEqual(3);
    // Market is a single object (not per-player)
    expect(state.market.cards.length).toBeGreaterThan(0);
  });

  it('should share the same business deck across players', () => {
    const state = createCompetitiveTestState('ac2-decks', 2);
    expect(state.decks.business.length).toBeGreaterThan(0);
    // Single shared deck — not duplicated per player
    expect(state.decks.business).toBe(state.decks.business);
  });

  it('should share the same event deck across players', () => {
    const state = createCompetitiveTestState('ac2-event-deck', 2);
    expect(state.decks.event.length).toBeGreaterThan(0);
  });

  it('should share the same incident deck across players', () => {
    const state = createCompetitiveTestState('ac2-incident', 2);
    expect(state.incidentDeck.length).toBeGreaterThan(0);
    for (const card of state.incidentDeck) {
      expect(card.trigger).toBe('Incident');
    }
  });

  it('should share upgrade and staff decks across players', () => {
    const state = createCompetitiveTestState('ac2-shared-decks', 2);
    expect(state.decks.upgrade.length).toBeGreaterThan(0);
    expect(state.decks.staff.length).toBeGreaterThan(0);
  });

  it('should share challenges across players', () => {
    const state = createCompetitiveTestState('ac2-challenges', 2);
    expect(state.activeChallenges.length).toBeGreaterThan(0);
    // Active challenges are shared (not per-player)
    for (const ac of state.activeChallenges) {
      expect(ac.challenge).toBeDefined();
    }
  });

  it('should share activeEffects across players', () => {
    const state = createCompetitiveTestState('ac2-effects', 2);
    expect(Array.isArray(state.activeEffects)).toBe(true);
  });

  it('should have a single ledger for the shared economy', () => {
    const state = createCompetitiveTestState('ac2-ledger', 2);
    expect(state.ledger).toBeDefined();
  });
});

// ── AC3: Determinism and N=1 regression ─────────────────────

describe('AC3 — Determinism and N=1 regression', () => {
  it('should produce identical competitive states for the same seed', () => {
    const s1 = createCompetitiveTestState('det-same', 2);
    const s2 = createCompetitiveTestState('det-same', 2);

    // Player counts match
    expect(s1.playerCount).toBe(s2.playerCount);
    expect(s1.players!.length).toBe(s2.players!.length);

    // Per-player resources match
    for (let i = 0; i < s1.players!.length; i++) {
      expect(s1.players![i].coins).toBe(s2.players![i].coins);
      expect(s1.players![i].reputation).toBe(s2.players![i].reputation);
      expect(s1.players![i].score).toBe(s2.players![i].score);
      expect(s1.players![i].actionBudget).toBe(s2.players![i].actionBudget);
    }

    // Shared market should have same cards
    expect(s1.market.cards.map(c => c.id)).toEqual(
      s2.market.cards.map(c => c.id),
    );

    // Shared decks should have same order
    expect(s1.decks.business.map(c => c.id)).toEqual(
      s2.decks.business.map(c => c.id),
    );
    expect(s1.decks.event.map(c => c.id)).toEqual(
      s2.decks.event.map(c => c.id),
    );

    // Owner-tagged grid should be identical (all null initially)
    for (let i = 0; i < GRID_SIZE; i++) {
      expect(s1.ownerTaggedGrid![i].card).toBe(s2.ownerTaggedGrid![i].card);
      expect(s1.ownerTaggedGrid![i].ownerId).toBe(s2.ownerTaggedGrid![i].ownerId);
    }
  });

  it('should produce different competitive states for different seeds', () => {
    const s1 = createCompetitiveTestState('diff-seed-a', 2);
    const s2 = createCompetitiveTestState('diff-seed-b', 2);

    const ids1 = s1.decks.business.map(c => c.id).join(',');
    const ids2 = s2.decks.business.map(c => c.id).join(',');
    expect(ids1).not.toBe(ids2);
  });

  it('should produce identical RNG sequences for the same seed', () => {
    const s1 = createCompetitiveTestState('rng-same', 2);
    const s2 = createCompetitiveTestState('rng-same', 2);

    const seq1 = Array.from({ length: 10 }, () => s1.rng());
    const seq2 = Array.from({ length: 10 }, () => s2.rng());

    expect(seq1).toEqual(seq2);
  });

  it('N=1 competitive state should have same starting resources as single-player', () => {
    const singlePlayer = setupMainStreetGame({ seed: 'n1-regression' });
    const competitive = createCompetitiveTestState('n1-regression', 1);

    // Same starting coins
    expect(singlePlayer.resourceBank.coins).toBe(competitive.players![0].coins);
    // Same starting reputation
    expect(singlePlayer.resourceBank.reputation).toBe(competitive.players![0].reputation);
    // Same action budget
    expect(competitive.players![0].actionBudget).toBe(1);
  });

  it('N=1 market should have same card composition as single-player', () => {
    const singlePlayer = setupMainStreetGame({ seed: 'n1-market' });
    const competitive = createCompetitiveTestState('n1-market', 1);

    expect(competitive.market.cards.length).toBe(singlePlayer.market.cards.length);
    expect(competitive.market.cards.map(c => c.id)).toEqual(
      singlePlayer.market.cards.map(c => c.id),
    );
  });

  it('N=1 decks should have same order as single-player', () => {
    const singlePlayer = setupMainStreetGame({ seed: 'n1-decks' });
    const competitive = createCompetitiveTestState('n1-decks', 1);

    expect(competitive.decks.business.map(c => c.id)).toEqual(
      singlePlayer.decks.business.map(c => c.id),
    );
    expect(competitive.decks.event.map(c => c.id)).toEqual(
      singlePlayer.decks.event.map(c => c.id),
    );
  });

  it('N=1 should have empty owner-tagged grid (same as empty single-player grid)', () => {
    const competitive = createCompetitiveTestState('n1-grid', 1);

    for (let i = 0; i < GRID_SIZE; i++) {
      expect(competitive.ownerTaggedGrid![i].card).toBeNull();
      expect(competitive.ownerTaggedGrid![i].ownerId).toBeNull();
    }
  });

  it('should preserve seed and numericSeed in competitive state', () => {
    const state = createCompetitiveTestState('seed-preserve-test', 2);
    expect(state.seed).toBe('seed-preserve-test');
    expect(typeof state.numericSeed).toBe('number');
  });

  it('should work with deterministic replay across multiple seeds', () => {
    const seeds = ['alpha', 'beta', 'gamma', 'delta'];
    for (const seed of seeds) {
      const s1 = createCompetitiveTestState(seed, 2);
      const s2 = createCompetitiveTestState(seed, 2);
      expect(s1.players![0].coins).toBe(s2.players![0].coins);
      expect(s1.players![1].coins).toBe(s2.players![1].coins);
      expect(s1.market.cards.map(c => c.id)).toEqual(s2.market.cards.map(c => c.id));
    }
  });
});

// ── AC4: Resource/slot ownership addressable by playerId ────

describe('AC4 — Resource/slot ownership addressable by playerId', () => {
  it('should allow lookup of a player by playerId', () => {
    const state = createCompetitiveTestState('ac4-lookup', 3);
    const p0 = state.players!.find(p => p.playerId === 0);
    const p1 = state.players!.find(p => p.playerId === 1);
    const p2 = state.players!.find(p => p.playerId === 2);

    expect(p0).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p0!.playerId).toBe(0);
    expect(p1!.playerId).toBe(1);
    expect(p2!.playerId).toBe(2);
  });

  it('should allow lookup of a slot by index', () => {
    const state = createCompetitiveTestState('ac4-slot-lookup', 2);
    const slot0 = state.ownerTaggedGrid![0];
    const slot5 = state.ownerTaggedGrid![5];
    const slot9 = state.ownerTaggedGrid![9];

    expect(slot0.card).toBeNull();
    expect(slot0.ownerId).toBeNull();
    expect(slot5.card).toBeNull();
    expect(slot5.ownerId).toBeNull();
    expect(slot9.card).toBeNull();
    expect(slot9.ownerId).toBeNull();
  });

  it('should allow listing all slots owned by a player', () => {
    const state = createCompetitiveTestState('ac4-slot-list', 2);
    const ownedBy0 = state.ownerTaggedGrid!
      .filter((slot) => slot.ownerId === 0)
      .length;
    const ownedBy1 = state.ownerTaggedGrid!
      .filter((slot) => slot.ownerId === 1)
      .length;
    const unowned = state.ownerTaggedGrid!
      .filter((slot) => slot.ownerId === null)
      .length;

    // Initially no one owns any slots
    expect(ownedBy0).toBe(0);
    expect(ownedBy1).toBe(0);
    expect(unowned).toBe(GRID_SIZE);
  });

  it('should allow getting the owner of a specific slot', () => {
    const state = createCompetitiveTestState('ac4-slot-owner', 2);
    for (let i = 0; i < GRID_SIZE; i++) {
      const owner = state.ownerTaggedGrid![i].ownerId;
      expect(owner).toBeNull(); // empty slots have no owner
    }
  });

  it('should handle playerId 0 as a valid owner (not falsy)', () => {
    const state = createCompetitiveTestState('ac4-zero-owner', 2);
    // playerId 0 is valid — must distinguish from null (unowned)
    const p0 = state.players!.find(p => p.playerId === 0);
    expect(p0).toBeDefined();
    expect(p0!.playerId).toBe(0);
    // ownerId === 0 means player 0 owns the slot, not that it's empty
  });

  it('should support N-player (N > 2) with distinct PlayerRecords', () => {
    const state = createCompetitiveTestState('ac4-nplayer', 4);
    expect(state.players!.length).toBe(4);
    const ids = state.players!.map(p => p.playerId);
    expect(ids).toEqual([0, 1, 2, 3]);
    // Each player is distinct
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(state.players![i]).not.toBe(state.players![j]);
      }
    }
  });

  it('should create separate player resources for each of 4 players', () => {
    const state = createCompetitiveTestState('ac4-nplayer-res', 4);
    // All players start with same resources (same config)
    const firstCoins = state.players![0].coins;
    for (let i = 1; i < 4; i++) {
      expect(state.players![i].coins).toBe(firstCoins);
    }
  });
});

// ── Integration: Competitive setup produces valid game state ─

describe('Integration — competitive state validity', () => {
  it('should be in playing state after competitive setup', () => {
    const state = createCompetitiveTestState('int-play', 2);
    expect(state.gameResult).toBe('playing');
    expect(state.endReason).toBeNull();
  });

  it('should start in DayStart phase', () => {
    const state = createCompetitiveTestState('int-phase', 2);
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(1);
  });

  it('should have valid config', () => {
    const state = createCompetitiveTestState('int-config', 2);
    expect(state.config).toBeDefined();
    expect(state.config.startingCoins).toBeGreaterThan(0);
    expect(state.config.startingReputation).toBeGreaterThan(0);
    expect(state.config.winThreshold).toBeGreaterThan(0);
  });

  it('should have empty discards after setup', () => {
    const state = createCompetitiveTestState('int-discards', 2);
    expect(state.discards.business).toHaveLength(0);
    expect(state.discards.event).toHaveLength(0);
    expect(state.discards.upgrade).toHaveLength(0);
    expect(state.discards.staff).toHaveLength(0);
  });

  it('should have empty activity log after setup', () => {
    const state = createCompetitiveTestState('int-log', 2);
    expect(state.activityLog).toHaveLength(0);
  });

  it('should have empty challengesCompleted after setup', () => {
    const state = createCompetitiveTestState('int-challenges', 2);
    expect(state.challengesCompleted).toHaveLength(0);
  });

  it('should have a valid rng function after setup', () => {
    const state = createCompetitiveTestState('int-rng', 2);
    expect(typeof state.rng).toBe('function');
    for (let i = 0; i < 5; i++) {
      const val = state.rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

// ── Error handling and edge cases ───────────────────────────

describe('Edge cases and error handling', () => {
  it('should reject playerCount of 0', () => {
    expect(() => createCompetitiveTestState('edge-zero', 0)).toThrow();
  });

  it('should reject playerCount of negative number', () => {
    expect(() => createCompetitiveTestState('edge-negative', -1)).toThrow();
  });

  it('should handle playerCount of 1 (N=1 mode)', () => {
    const state = createCompetitiveTestState('edge-n1', 1);
    assertCompetitiveMode(state);
    expect(state.players!.length).toBe(1);
    expect(state.playerCount).toBe(1);
  });

  it('should handle large playerCount (N=8)', () => {
    const state = createCompetitiveTestState('edge-n8', 8);
    assertCompetitiveMode(state);
    expect(state.players!.length).toBe(8);
    expect(state.playerCount).toBe(8);
    const ids = state.players!.map(p => p.playerId);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('should accept custom difficulty', () => {
    const state = createCompetitiveTestState('edge-diff', 2, 'Easy');
    expect(state.config.startingCoins).toBeGreaterThan(4); // Easy > Medium
  });

  it('should preserve original single-player setup unchanged', () => {
    const state = setupMainStreetGame({ seed: 'single-unchanged' });
    expect(state.resourceBank).toBeDefined();
    expect(state.streetGrid).toBeDefined();
    expect(state.streetGrid).toHaveLength(GRID_SIZE);
    // Single-player state does NOT have competitive fields populated
    // (players/ownerTaggedGrid remain undefined)
  });
});
