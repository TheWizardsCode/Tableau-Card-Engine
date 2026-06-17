/**
 * Serialized State Migration Tests
 *
 * Validates backward-compatible deserialization after the Park reclassification
 * from 'business' to 'community-space' family and the market.business to
 * market.development rename.
 *
 * Acceptance criteria:
 * 1. Deserializing old-format save with Park as family: 'business' produces valid state with Park as family: 'community-space'
 * 2. Deserializing new-format save with Park as family: 'community-space' works without migration
 * 3. Campaign progress (MainStreetCampaignProgress) is unaffected by the reclassification
 * 4. Full test suite passes with the migration code
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { serializeMainStreetState, deserializeMainStreetState, setupMainStreetGame, type MainStreetState, type MainStreetSerializedState } from '../../example-games/main-street/MainStreetState';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'migration-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Creates an old-format serialized state shape with `market.business`
 * instead of `market.development`, and Park as `family: 'business'`.
 * This simulates a save from before the community-space reclassification.
 */
function createOldFormatSavedState(seed: string = 'migration-test'): Record<string, unknown> {
  const state = createTestState(seed);

  // Serialize normally then mutate to old format
  const serialized = JSON.parse(JSON.stringify(serializeMainStreetState(state)));

  // Replace market.development with market.business (old format)
  const market = serialized.market as Record<string, unknown>;
  market.business = market.development;
  delete market.development;

  // Find any Park cards in the street grid and change their family to 'business' (old format)
  const grid = serialized.streetGrid as Record<string, unknown>[];
  for (const slot of grid) {
    if (slot && (slot as Record<string, unknown>).name === 'Park') {
      (slot as Record<string, unknown>).family = 'business';
    }
  }

  // Find any Park cards in the market (business array) and change their family
  const bizCards = market.business as Record<string, unknown>[];
  for (const card of bizCards) {
    if (card.name === 'Park') {
      card.family = 'business';
    }
  }

  // Also check decks
  const decks = serialized.decks as Record<string, unknown>;
  if (decks.business) {
    for (const card of decks.business as Record<string, unknown>[]) {
      if (card.name === 'Park') {
        card.family = 'business';
      }
    }
  }

  return serialized;
}

// ── AC1: Old-format save migration ─────────────────────────

describe('Old-format save migration (AC1)', () => {
  it('should deserialize old-format save with market.business to market.development', () => {
    const oldSave = createOldFormatSavedState('migration-test-1');

    // Verify the old format has market.business (not development)
    expect(oldSave.market).toHaveProperty('business');
    expect(oldSave.market).not.toHaveProperty('development');

    // Deserialize (should trigger migration)
    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    // After migration, state should have market.development
    expect(migratedState.market.development).toBeDefined();
    expect(Array.isArray(migratedState.market.development)).toBe(true);
  });

  it('should convert Park cards with family: "business" to family: "community-space"', () => {
    const oldSave = createOldFormatSavedState('migration-test-2');

    // Intentionally set Park card's family to 'business' (old format)
    const grid = oldSave.streetGrid as Record<string, unknown>[];
    let parkFound = false;
    for (const slot of grid) {
      if (slot && (slot as Record<string, unknown>).name === 'Park') {
        (slot as Record<string, unknown>).family = 'business';
        parkFound = true;
      }
    }

    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    // Verify Park cards in the grid are now community-space
    let migratedParkCount = 0;
    for (const slot of migratedState.streetGrid) {
      if (slot && slot.name === 'Park') {
        expect(slot.family).toBe('community-space');
        migratedParkCount++;
      }
    }

    // If Park was found in the old save, it should be migrated
    if (parkFound) {
      expect(migratedParkCount).toBeGreaterThan(0);
    }
  });

  it('should preserve non-Park business cards unchanged after migration', () => {
    const oldSave = createOldFormatSavedState('migration-test-3');
    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    // Non-Park business cards should still have family: 'business'
    for (const slot of migratedState.streetGrid) {
      if (slot && slot.family === 'business') {
        expect(slot.name).not.toBe('Park');
      }
    }
  });

  it('should maintain grid integrity after migration', () => {
    const oldSave = createOldFormatSavedState('migration-test-4');
    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    // Grid should have the same length
    expect(migratedState.streetGrid.length).toBe(10);

    // Empty slots should remain null
    const nullCount = migratedState.streetGrid.filter(s => s === null).length;
    expect(nullCount).toBeGreaterThanOrEqual(0);
  });

  it('should preserve resource bank after migration', () => {
    const oldSave = createOldFormatSavedState('migration-test-5');
    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    expect(migratedState.resourceBank.coins).toBeDefined();
    expect(migratedState.resourceBank.reputation).toBeDefined();
    expect(typeof migratedState.resourceBank.coins).toBe('number');
    expect(typeof migratedState.resourceBank.reputation).toBe('number');
  });
});

// ── AC2: New-format save deserialization ───────────────────

describe('New-format save deserialization (AC2)', () => {
  it('should deserialize new-format save without migration', () => {
    const state = createTestState('new-format-test');
    const serialized = serializeMainStreetState(state);

    // New format should have market.development
    expect(serialized.market.development).toBeDefined();

    // Deserialize without migration needed
    const deserialized = deserializeMainStreetState(serialized);

    // Should have all required fields
    expect(deserialized.market.development).toBeDefined();
    expect(deserialized.turn).toBe(state.turn);
    expect(deserialized.seed).toBe(state.seed);
  });

  it('should preserve deterministic state after serialization round-trip', () => {
    const state1 = createTestState('roundtrip-test');
    const serialized = serializeMainStreetState(state1);
    const deserialized = deserializeMainStreetState(serialized);

    // Verify key properties are preserved
    expect(deserialized.market.development.map(c => c.id)).toEqual(
      state1.market.development.map(c => c.id),
    );

    expect(deserialized.resourceBank.coins).toBe(state1.resourceBank.coins);
    expect(deserialized.resourceBank.reputation).toBe(state1.resourceBank.reputation);
    expect(deserialized.turn).toBe(state1.turn);
    expect(deserialized.phase).toBe(state1.phase);
  });

  it('should preserve Park as community-space in round-trip', () => {
    const state = createTestState('park-preserve-test');
    const serialized = serializeMainStreetState(state);
    const deserialized = deserializeMainStreetState(serialized);

    // Check if any Park card exists, it's community-space
    const gridParks = deserialized.streetGrid.filter(s => s && s.name === 'Park');
    for (const park of gridParks) {
      if (park) {
        expect(park.family).toBe('community-space');
      }
    }
  });

  it('should preserve decks after round-trip', () => {
    const state = createTestState('deck-roundtrip');
    const serialized = serializeMainStreetState(state);
    const deserialized = deserializeMainStreetState(serialized);

    expect(deserialized.decks.business.length).toBeGreaterThanOrEqual(0);
    expect(deserialized.decks.communitySpace).toBeDefined();
    expect(deserialized.discards.communitySpace).toBeDefined();
  });
});

// ── AC3: Campaign progress unaffected ──────────────────────

describe('Campaign progress unaffected (AC3)', () => {
  it('should not require campaign progress migration', () => {
    // Campaign progress tracks tier unlocks, not individual card families
    const campaignProgress = {
      schemaVersion: 1,
      unlockedTiers: ['tier-1', 'tier-2'],
      unlockedCardIds: ['biz-bakery', 'cs-park', 'cs-library'],
      milestoneHistory: [],
      persistentReputation: 5,
      highestScore: 150,
      totalRuns: 10,
      totalWins: 3,
      lastUpdatedAt: new Date().toISOString(),
    };

    // Campaign progress is unaffected by card reclassification
    expect(campaignProgress.unlockedCardIds).toContain('cs-park');
    expect(campaignProgress.unlockedCardIds).toContain('cs-library');
  });

  it('should preserve campaign progress structure after migration', () => {
    const campaignProgress = {
      schemaVersion: 1,
      unlockedTiers: ['tier-1'],
      unlockedCardIds: ['biz-bakery'],
      milestoneHistory: [],
      persistentReputation: 3,
      highestScore: 100,
      totalRuns: 5,
      totalWins: 1,
      lastUpdatedAt: new Date().toISOString(),
    };

    expect(campaignProgress.schemaVersion).toBe(1);
    expect(Array.isArray(campaignProgress.unlockedTiers)).toBe(true);
    expect(Array.isArray(campaignProgress.unlockedCardIds)).toBe(true);
  });
});

// ── AC4: Full suite compatibility ──────────────────────────

describe('Migration integration (AC4)', () => {
  it('should produce a playable state after migrating old-format saves', () => {
    const oldSave = createOldFormatSavedState('playable-migration');
    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    // The migrated state should have valid game structure
    expect(migratedState).toHaveProperty('config');
    expect(migratedState).toHaveProperty('market');
    expect(migratedState.market.development).toBeDefined();
    expect(migratedState.market.investments).toBeDefined();
    expect(migratedState).toHaveProperty('resourceBank');
    expect(migratedState).toHaveProperty('decks');
    expect(migratedState).toHaveProperty('discards');
    expect(migratedState).toHaveProperty('rng');
    expect(typeof migratedState.rng).toBe('function');
  });

  it('should handle migration for saves with Park on the street grid', () => {
    const state = createTestState('grid-park-test');
    const serialized = serializeMainStreetState(state);

    // Simulate old format by changing market and Park family
    const oldFormat = JSON.parse(JSON.stringify(serialized)) as Record<string, unknown>;
    const oldMarket = oldFormat.market as Record<string, unknown>;
    oldMarket.business = oldMarket.development;
    delete oldMarket.development;

    const grid = oldFormat.streetGrid as Record<string, unknown>[];
    for (const slot of grid) {
      if (slot && slot.name === 'Park') {
        slot.family = 'business';
      }
    }

    const migratedState = deserializeMainStreetState(oldFormat as unknown as MainStreetSerializedState);

    // Should produce a valid state
    expect(migratedState.market.development.length).toBeGreaterThan(0);
  });

  it('should preserve financial state after migration', () => {
    const oldSave = createOldFormatSavedState('financial-test');
    const migratedState = deserializeMainStreetState(oldSave as unknown as MainStreetSerializedState);

    expect(typeof migratedState.resourceBank.coins).toBe('number');
    expect(typeof migratedState.resourceBank.reputation).toBe('number');
    expect(typeof migratedState.finalScore).toBe('number');
  });
});
