/**
 * Terminology save-migration tests (CG-0MTMYIHKO001QCWL).
 *
 * The day→week terminology rename changed the serialized phase value
 * ('DayStart' → 'WeekStart') and the turn-start resource snapshot field names
 * (dayStartCoins/dayStartRep/dayStartScore → weekStartCoins/weekStartRep/
 * weekStartScore), and bumped both schema versions. These tests prove that
 * pre-change saves still load with no data loss.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { deserializeWithVersion } from '@core-engine';
import {
  serializeMainStreetState,
  deserializeMainStreetState,
  setupMainStreetGame,
} from '../../example-games/main-street/MainStreetState';
import {
  MAIN_STREET_SAVE_SCHEMA_VERSION,
  MAIN_STREET_CAMPAIGN_SCHEMA_VERSION,
  mainStreetStateSerializer,
  mainStreetCampaignSerializer,
  createDefaultCampaignProgress,
} from '../../example-games/main-street/MainStreetSaveLoad';

/**
 * Build a pre-change (v1) serialized state by taking a current state and
 * renaming the week-themed fields back to their legacy day-themed names.
 */
function createLegacySave(seed: string): Record<string, unknown> {
  const state = setupMainStreetGame({ seed });
  const legacy = JSON.parse(JSON.stringify(serializeMainStreetState(state))) as Record<string, unknown>;
  legacy.phase = 'DayStart';
  legacy.dayStartCoins = legacy.weekStartCoins;
  legacy.dayStartRep = legacy.weekStartRep;
  legacy.dayStartScore = legacy.weekStartScore;
  delete legacy.weekStartCoins;
  delete legacy.weekStartRep;
  delete legacy.weekStartScore;
  return legacy;
}

describe('day→week terminology save migration', () => {
  it('bumps the run and campaign schema versions', () => {
    expect(MAIN_STREET_SAVE_SCHEMA_VERSION).toBe(2);
    expect(MAIN_STREET_CAMPAIGN_SCHEMA_VERSION).toBe(3);
  });

  it('maps the legacy DayStart phase and dayStart* fields to week equivalents', () => {
    const state = setupMainStreetGame({ seed: 'term-mig-1' });
    const legacy = createLegacySave('term-mig-1');

    const restored = deserializeMainStreetState(legacy as never);

    expect(restored.phase).toBe('WeekStart');
    expect(restored.weekStartCoins).toBe(state.weekStartCoins);
    expect(restored.weekStartRep).toBe(state.weekStartRep);
    expect(restored.weekStartScore).toBe(state.weekStartScore);
  });

  it('round-trips a legacy save back to the current schema with no data loss', () => {
    const legacy = createLegacySave('term-mig-2');
    const legacyCoins = legacy.dayStartCoins as number;
    const legacyRep = legacy.dayStartRep as number;
    const legacyScore = legacy.dayStartScore as number;

    const restored = deserializeMainStreetState(legacy as never);
    const reserialized = serializeMainStreetState(restored) as unknown as Record<string, unknown>;

    expect(reserialized.weekStartCoins).toBe(legacyCoins);
    expect(reserialized.weekStartRep).toBe(legacyRep);
    expect(reserialized.weekStartScore).toBe(legacyScore);
    expect(reserialized.phase).toBe('WeekStart');
    expect(reserialized).not.toHaveProperty('dayStartCoins');
    expect(reserialized).not.toHaveProperty('dayStartRep');
    expect(reserialized).not.toHaveProperty('dayStartScore');
  });

  it('preserves the deterministic seed and turn counter through the migration', () => {
    const legacy = createLegacySave('term-mig-3');
    const restored = deserializeMainStreetState(legacy as never);
    expect(restored.seed).toBe('term-mig-3');
    expect(restored.turn).toBe(legacy.turn);
    expect(restored.week).toBe(legacy.week);
    expect(restored.year).toBe(legacy.year);
  });

  it('accepts a v1 VersionedPayload through deserializeWithVersion (migrate hook)', () => {
    const legacy = createLegacySave('term-mig-4');
    const payload = { schemaVersion: 1, data: legacy };

    const restored = deserializeWithVersion(
      mainStreetStateSerializer,
      payload as never,
    );

    expect(restored.phase).toBe('WeekStart');
    expect(restored.seed).toBe('term-mig-4');
  });

  it('still rejects a mismatch when no migrate hook is provided', () => {
    const legacy = createLegacySave('term-mig-5');
    const noMigrate = {
      schemaVersion: MAIN_STREET_SAVE_SCHEMA_VERSION,
      serialize: serializeMainStreetState,
      deserialize: deserializeMainStreetState,
    };
    expect(() =>
      deserializeWithVersion(noMigrate, { schemaVersion: 1, data: legacy } as never),
    ).toThrow(/Incompatible save version/);
  });

  it('migrates a v1 campaign save and preserves its fields', () => {
    const legacyCampaign = {
      schemaVersion: 1,
      unlockedTiers: ['tier-1'],
      persistentReputation: 7,
      highestScore: 123,
      totalRuns: 4,
      totalWins: 2,
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    };

    const migrated = mainStreetCampaignSerializer.deserialize(legacyCampaign as never);

    expect(migrated.schemaVersion).toBe(MAIN_STREET_CAMPAIGN_SCHEMA_VERSION);
    expect(migrated.persistentReputation).toBe(7);
    expect(migrated.highestScore).toBe(123);
    expect(migrated.totalRuns).toBe(4);
    expect(migrated.totalWins).toBe(2);
    expect(migrated.unlockedCardIds.length).toBeGreaterThan(0);
    expect(migrated.milestoneHistory).toEqual([]);
  });

  it('migrates a v2 campaign save to the current version', () => {
    const v2Campaign = {
      ...createDefaultCampaignProgress(),
      schemaVersion: 2,
      persistentReputation: 11,
    };

    const migrated = mainStreetCampaignSerializer.deserialize(v2Campaign as never);

    expect(migrated.schemaVersion).toBe(MAIN_STREET_CAMPAIGN_SCHEMA_VERSION);
    expect(migrated.persistentReputation).toBe(11);
    expect(migrated.tutorialSeen).toBe(false);
  });
});
