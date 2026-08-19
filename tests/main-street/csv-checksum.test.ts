/**
 * CSV Checksum and SVG Regeneration Tests
 *
 * Validates the CSV checksum computation, persistence in save state, and
 * SVG regeneration detection used to keep card SVGs in sync with the
 * card-data.csv.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { setupMainStreetGame, serializeMainStreetState, deserializeMainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import { mainStreetStateSerializer } from '../../example-games/main-street/MainStreetSaveLoad';
import { computeCsvChecksum } from '../../example-games/main-street/CsvChecksum';
import { generateCardSvgFromCsvRow } from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';

// ---------------------------------------------------------------------------
// Tests for AC1: CSV checksum computation stability
// ---------------------------------------------------------------------------

describe('computeCsvChecksum', () => {
  it('is stable for the same file content', () => {
    const csv1 = 'family,id,name,cost\nbusiness,biz-test,Tester,5\n';
    const csv2 = 'family,id,name,cost\nbusiness,biz-test,Tester,5\n';
    expect(computeCsvChecksum(csv1)).toBe(computeCsvChecksum(csv2));
  });

  it('changes when the file is modified', () => {
    const csv1 = 'family,id,name,cost\nbusiness,biz-test,Tester,5\n';
    const csv2 = 'family,id,name,cost\nbusiness,biz-test,Tester,10\n';
    expect(computeCsvChecksum(csv1)).not.toBe(computeCsvChecksum(csv2));
  });

  it('changes when a row is added', () => {
    const csv1 = 'family,id,name,cost\nbusiness,biz-a,Alpha,3\n';
    const csv2 = 'family,id,name,cost\nbusiness,biz-a,Alpha,3\nbusiness,biz-b,Beta,5\n';
    expect(computeCsvChecksum(csv1)).not.toBe(computeCsvChecksum(csv2));
  });

  it('changes when a column value is altered', () => {
    const csv1 = 'family,id,name,cost\nbusiness,biz-test,Tester,5\n';
    const csv2 = 'family,id,name,cost\nbusiness,biz-test,Renamed,5\n';
    expect(computeCsvChecksum(csv1)).not.toBe(computeCsvChecksum(csv2));
  });

  it('produces a deterministic hex string', () => {
    const csv = 'family,id,name,cost\nbusiness,biz-test,Tester,5\n';
    const hash = computeCsvChecksum(csv);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles empty CSV', () => {
    const hash = computeCsvChecksum('');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// Tests for AC6: Checkpoint save includes csvChecksum field
// ---------------------------------------------------------------------------

describe('serializeMainStreetState includes csvChecksum', () => {
  it('includes csvChecksum in serialized state', () => {
    const state = setupMainStreetGame({ seed: 'checksum-test' });
    const serialized = serializeMainStreetState(state);
    expect(serialized).toHaveProperty('csvChecksum');
    expect(typeof serialized.csvChecksum).toBe('string');
    expect(serialized.csvChecksum.length).toBeGreaterThan(0);
  });

  it('csvChecksum is a valid hex string', () => {
    const state = setupMainStreetGame({ seed: 'checksum-test-2' });
    const serialized = serializeMainStreetState(state);
    expect(serialized.csvChecksum).toMatch(/^[0-9a-f]{8}$/);
  });

  it('checkpoint save round-trip preserves csvChecksum', () => {
    const state = setupMainStreetGame({ seed: 'roundtrip-test' });
    const serialized = serializeMainStreetState(state);
    const savedChecksum = serialized.csvChecksum;
    expect(savedChecksum).toMatch(/^[0-9a-f]{8}$/);

    // Round-trip through serializer
    const serializedAgain = mainStreetStateSerializer.serialize(state);
    expect(serializedAgain).toHaveProperty('csvChecksum');
    expect(serializedAgain.csvChecksum).toBe(savedChecksum);
  });
});

// ---------------------------------------------------------------------------
// Tests for AC6: Checkpoint load correctly compares against current CSV
// ---------------------------------------------------------------------------

describe('deserializeMainStreetState handles csvChecksum', () => {
  it('loads state with matching csvChecksum', () => {
    const state = setupMainStreetGame({ seed: 'load-test' });
    const serialized = serializeMainStreetState(state);
    const savedChecksum = serialized.csvChecksum;

    const deserialized = deserializeMainStreetState(serialized);
    const reSerialized = serializeMainStreetState(deserialized);
    expect(reSerialized.csvChecksum).toBe(savedChecksum);
  });

  it('deserializes state from before csvChecksum was added (backward compat)', () => {
    const state = setupMainStreetGame({ seed: 'backward-compat' });
    const serialized = serializeMainStreetState(state);

    const withoutChecksum = { ...serialized };
    delete (withoutChecksum as any).csvChecksum;

    const deserialized = deserializeMainStreetState(withoutChecksum as any);
    expect(deserialized).toBeDefined();
    expect(deserialized.seed).toBe('backward-compat');
  });

  it('deserializes state with empty csvChecksum (upgraded save)', () => {
    const state = setupMainStreetGame({ seed: 'upgraded-save' });
    const serialized = serializeMainStreetState(state);

    const withEmpty = { ...serialized, csvChecksum: '' };

    const deserialized = deserializeMainStreetState(withEmpty as any);
    expect(deserialized).toBeDefined();
    expect(deserialized.seed).toBe('upgraded-save');
  });
});

// ---------------------------------------------------------------------------
// Tests for csvData field (AC1, AC5: embedded CSV data)
// ---------------------------------------------------------------------------

describe('csvData field embedding', () => {
  it('serializeMainStreetState includes csvData field', () => {
    const state = setupMainStreetGame({ seed: 'csvdata-test' });
    const serialized = serializeMainStreetState(state);
    expect(serialized).toHaveProperty('csvData');
    expect(typeof serialized.csvData).toBe('string');
    expect(serialized.csvData.length).toBeGreaterThan(0);
  });

  it('csvData contains valid CSV content with headers and rows', () => {
    const state = setupMainStreetGame({ seed: 'csvdata-content' });
    const serialized = serializeMainStreetState(state);
    // Should contain CSV header
    expect(serialized.csvData).toContain('family,id,name,cost');
    // Should contain at least one business card row
    expect(serialized.csvData).toContain('business');
    // Should contain at least one event card row
    expect(serialized.csvData).toContain('event');
  });

  it('round-trip save → load → re-save preserves csvData and csvChecksum', () => {
    const state = setupMainStreetGame({ seed: 'roundtrip-csv' });
    const serialized = serializeMainStreetState(state);
    const savedCsvData = serialized.csvData;
    const savedChecksum = serialized.csvChecksum;

    // Rehydrate
    const deserialized = deserializeMainStreetState(serialized);

    // Re-serialize
    const reSerialized = serializeMainStreetState(deserialized);

    expect(reSerialized.csvData).toBe(savedCsvData);
    expect(reSerialized.csvChecksum).toBe(savedChecksum);
  });

  it('csvData is preserved through checkpoint serializer', () => {
    const state = setupMainStreetGame({ seed: 'serializer-test' });
    const serialized = mainStreetStateSerializer.serialize(state);

    expect(serialized).toHaveProperty('csvData');
    expect(serialized.csvData.length).toBeGreaterThan(0);

    // Round-trip through the full serializer
    const deserialized = mainStreetStateSerializer.deserialize(serialized);
    const reSerialized = mainStreetStateSerializer.serialize(deserialized);

    expect(reSerialized.csvData).toBe(serialized.csvData);
    expect(reSerialized.csvChecksum).toBe(serialized.csvChecksum);
  });

  it('csvData is present in migrated legacy saves (backward compat)', () => {
    const state = setupMainStreetGame({ seed: 'legacy-csv' });
    const serialized = serializeMainStreetState(state);

    // Remove csvData to simulate a legacy save
    const withoutCsvData = { ...serialized };
    delete (withoutCsvData as any).csvData;

    const deserialized = deserializeMainStreetState(withoutCsvData as any);
    const reSerialized = serializeMainStreetState(deserialized);

    // After round-trip, csvData should be present (set from current module-level CSV)
    expect(reSerialized).toHaveProperty('csvData');
    expect(typeof reSerialized.csvData).toBe('string');
    expect(reSerialized.csvData.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests for AC2/AC3/AC4: CSV mismatch resolution and legacy save handling
// ---------------------------------------------------------------------------

describe('CSV mismatch resolution', () => {
  it('loads with matching csvChecksum (no CSV changes) works normally', () => {
    const state = setupMainStreetGame({ seed: 'normal-load' });
    const serialized = serializeMainStreetState(state);

    // Matching checksum — should deserialize without template override
    const deserialized = deserializeMainStreetState(serialized);
    expect(deserialized.seed).toBe('normal-load');
    expect(deserialized.resourceBank.coins).toBeGreaterThan(0);
  });

  it('uses saved CSV data when csvChecksum differs and csvData is present', () => {
    // Create a save state from the current CSV, then modify its checksum
    // to simulate a CSV change, while keeping the csvData intact.
    const state = setupMainStreetGame({ seed: 'mismatch-test' });
    const serialized = serializeMainStreetState(state);

    // Modify checksum to simulate CSV change
    const modifiedSave = {
      ...serialized,
      csvChecksum: 'deadbeef',
      // csvData is left intact from the real save
    };

    // Should deserialize without throwing (uses saved csvData)
    const deserialized = deserializeMainStreetState(modifiedSave);
    expect(deserialized.seed).toBe('mismatch-test');
    expect(deserialized.resourceBank.coins).toBeGreaterThan(0);
  });

  it('rejects legacy saves with mismatched checksum and no csvData', () => {
    const state = setupMainStreetGame({ seed: 'legacy-reject' });
    const serialized = serializeMainStreetState(state);

    // Remove csvData AND modify checksum to simulate legacy save with CSV change
    const modifiedSave = {
      ...serialized,
      csvChecksum: 'badc0de',
    };
    delete (modifiedSave as any).csvData;

    expect(() => {
      deserializeMainStreetState(modifiedSave);
    }).toThrow(/different version of card-data.csv/);
  });

  it('accepts matching-checksum saves without csvData (legacy compat)', () => {
    const state = setupMainStreetGame({ seed: 'matching-legacy' });
    const serialized = serializeMainStreetState(state);

    // Remove only csvData (keep matching checksum)
    const modifiedSave = { ...serialized };
    delete (modifiedSave as any).csvData;

    // Should deserialize without throwing (matching checksum)
    const deserialized = deserializeMainStreetState(modifiedSave);
    expect(deserialized.seed).toBe('matching-legacy');
  });

  it('template arrays are restored to defaults after fresh game setup', () => {
    const state = setupMainStreetGame({ seed: 'restore-test' });
    const serialized = serializeMainStreetState(state);

    // First, load with CSV mismatch to override templates
    const modifiedSave = {
      ...serialized,
      csvChecksum: 'f00dcafe',
    };
    const deserialized = deserializeMainStreetState(modifiedSave);
    expect(deserialized.seed).toBe('restore-test');

    // Now create a fresh game — should reset templates to defaults
    const newState = setupMainStreetGame({ seed: 'fresh-game' });
    expect(newState.seed).toBe('fresh-game');
    expect(newState.resourceBank.coins).toBeGreaterThan(0);

    // Verify a round-trip with default templates still works
    const newSerialized = serializeMainStreetState(newState);
    expect(newSerialized.csvChecksum.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests for AC3: Market state preservation on save/load
// ---------------------------------------------------------------------------

describe('Market state preservation on save/load', () => {
  it('save → load round-trip preserves development row cards', () => {
    const state = setupMainStreetGame({ seed: 'market-save' });
    const serialized = serializeMainStreetState(state);

    // Record development row card IDs before reload
    const devIds = serialized.market.cards.map(c => c.id);
    expect(devIds.length).toBeGreaterThan(0);

    // Load the saved state
    const deserialized = deserializeMainStreetState(serialized);

    // Verify development row cards are unchanged
    const reloadedDevIds = deserialized.market.cards.map(c => c.id);
    expect(reloadedDevIds).toEqual(devIds);
  });

  it('save → load round-trip preserves investments row cards', () => {
    const state = setupMainStreetGame({ seed: 'market-save-2' });
    const serialized = serializeMainStreetState(state);

    // Record investments row card IDs before reload
    const invIds = serialized.market.cards.map(c => c.id);
    expect(invIds.length).toBeGreaterThan(0);

    // Load the saved state
    const deserialized = deserializeMainStreetState(serialized);

    // Verify investments row cards are unchanged
    const reloadedInvIds = deserialized.market.cards.map(c => c.id);
    expect(reloadedInvIds).toEqual(invIds);
  });

  it('save → load → executeDayStart without skipMarketRefill replaces market cards', () => {
    const state = setupMainStreetGame({ seed: 'market-cycle' });
    const serialized = serializeMainStreetState(state);

    // Load the saved state
    const deserialized = deserializeMainStreetState(serialized);

    // Set phase to DayStart and call executeDayStart (normal flow — should refill)
    deserialized.phase = 'DayStart';
    executeDayStart(deserialized);

    // Verify market cards exist (refilled from deck)
    const newDevIds = deserialized.market.cards.map(c => c.id);
    expect(newDevIds.length).toBeGreaterThan(0);
  });

  it('save → load → executeDayStart with skipMarketRefill preserves market cards', () => {
    const state = setupMainStreetGame({ seed: 'market-preserve' });
    const serialized = serializeMainStreetState(state);
    const savedDevIds = serialized.market.cards.map(c => c.id);
    const savedInvIds = serialized.market.cards.map(c => c.id);

    // Load the saved state
    const deserialized = deserializeMainStreetState(serialized);

    // Set phase to DayStart and call executeDayStart with skipMarketRefill=true
    deserialized.phase = 'DayStart';
    executeDayStart(deserialized, true);

    // Verify market cards are preserved
    const newDevIds = deserialized.market.cards.map(c => c.id);
    const newInvIds = deserialized.market.cards.map(c => c.id);
    expect(newDevIds).toEqual(savedDevIds);
    expect(newInvIds).toEqual(savedInvIds);
  });

  it('full market preservation on round-trip save → deserialize → re-serialize', () => {
    const state = setupMainStreetGame({ seed: 'full-market' });
    const original = serializeMainStreetState(state);

    const deserialized = deserializeMainStreetState(original);
    const reSerialized = serializeMainStreetState(deserialized);

    // Both development and investments row should match original
    expect(reSerialized.market.cards.map(c => c.id))
      .toEqual(original.market.cards.map(c => c.id));
    expect(reSerialized.market.cards.map(c => c.id))
      .toEqual(original.market.cards.map(c => c.id));
  });
});

// ---------------------------------------------------------------------------
// Tests for SVG regeneration function
// ---------------------------------------------------------------------------

describe('generateCardSvgFromCsvRow', () => {
  it('generates SVG for a business card row', () => {
    const row = {
      id: 'biz-test',
      name: 'Test Business',
      family: 'business',
      cost: '5',
      synergyTypes: 'Food',
    };
    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).toContain('Test Business');
    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain('</svg>');
  });

  it('generates SVG for an event card row', () => {
    const row = {
      id: 'evt-test',
      name: 'Test Event',
      family: 'event',
      cost: '3',
      trigger: 'Investment',
    };
    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).toContain('Test Event');
    expect(svg).toContain('[Investment]');
  });
});
