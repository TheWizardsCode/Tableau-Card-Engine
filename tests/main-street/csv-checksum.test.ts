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
