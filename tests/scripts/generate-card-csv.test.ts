/**
 * Tests for the Main Street card-data CSV generator and its output.
 *
 * Two layers of validation:
 * 1. `buildCsvRows` — the generator's pure row-building logic, exercised
 *    with representative template content (CSV escaping, family coverage,
 *    field counts).
 * 2. `card-data.csv` — the checked-in generated file, validated for the
 *    expected cards, special-character preservation, family coverage, and
 *    per-row field-count integrity.
 *
 * @module generate-card-csv
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCsvRows, COLS } from '../../scripts/generate-card-csv';

// ---------------------------------------------------------------------------
// CSV helpers (test-only; production parsing uses src/core-engine/CsvLoader)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into header fields and data rows.
 * Handles quoted fields and escaped quotes.
 */
function parseCsv(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.trim().split('\n');
  const header = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { header, rows };
}

/**
 * Parse a single CSV line into an array of field values.
 * Handles quoted fields and escaped quotes.
 */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

const CARD_CSV_PATH = resolve(
  __dirname,
  '../../example-games/main-street/card-data.csv',
);

// Representative template content covering all five card families.
// Mirrors the object format the generator parses from MainStreetCards.ts.
const SAMPLE_TS = `
  const BUSINESS_TEMPLATES = [
    { id: 'biz-bakery', name: 'Bakery', cost: 3, baseIncome: 0.5, synergyTypes: ['Food'], upgradePath: 'Bakery', maxLevel: 2, reputationPerTurn: 0, description: 'Provides warm pastries.' },
  ];
  const COMMUNITY_SPACE_TEMPLATES = [
    { id: 'cs-park', name: 'Park', cost: 3, baseIncome: 0, synergyTypes: ['Culture'], upgradePath: 'Park', maxLevel: 1, reputationPerTurn: 0, description: 'Offers leisure space.' },
  ];
  const EVENT_TEMPLATES = [
    { id: 'evt-festival', name: 'Local Festival', cost: 3, trigger: 'Investment', effect: '+2 coins to all Culture businesses.', target: 'SpecificSynergy', targetSynergy: 'Culture', coinDelta: 2, reputationDelta: 1 },
  ];
  const UPGRADE_TEMPLATES = [
    { id: 'upg-readers-cafe', name: "Upgrade to Reader's Café", cost: 3, targetBusiness: 'Bookshop', incomeBonus: 1, synergyRangeBonus: 0, requiredLevel: 0, reputationBonus: 0.1, description: 'Transforms the Bookshop, blending books with café culture.' },
  ];
  const STAFF_CARD_TEMPLATES = [
    { id: 'staff-barista', name: 'Barista', cost: 3, ongoingCost: 0.5, handSlotsAdded: 0, description: 'Serves coffee.' },
  ];
`;

// ---------------------------------------------------------------------------
// Generator logic: buildCsvRows
// ---------------------------------------------------------------------------

describe('buildCsvRows (generator logic)', () => {
  const rows = buildCsvRows(SAMPLE_TS);

  it('produces one row per card across all five families', () => {
    const families = rows.map(r => r.split(',')[0]);
    expect(families).toContain('business');
    expect(families).toContain('community-space');
    expect(families).toContain('event');
    expect(families).toContain('upgrade');
    expect(families).toContain('staff');
  });

  it('preserves special characters in names (apostrophe and é)', () => {
    const row = rows.find(r => r.startsWith('upgrade,upg-readers-cafe,'));
    expect(row).toBeDefined();
    expect(row).toContain("Upgrade to Reader's Café");
  });

  it('produces valid CSV with quoted fields containing commas', () => {
    const row = rows.find(r => r.startsWith('upgrade,upg-readers-cafe,'));
    expect(row).toBeDefined();
    // The description contains a comma → must be wrapped in quotes and
    // parse back to the original value (description is column index 9).
    const fields = parseLine(row!);
    expect(fields[9]).toBe('Transforms the Bookshop, blending books with café culture.');
  });

  it('produces rows whose field count matches the header', () => {
    for (const row of rows) {
      expect(parseLine(row)).toHaveLength(COLS.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Generated file: card-data.csv
// ---------------------------------------------------------------------------

describe('card-data.csv (generated content)', () => {
  const csvContent = readFileSync(CARD_CSV_PATH, 'utf8');
  const { header, rows } = parseCsv(csvContent);

  it('validates Reader\'s Café card exists with special characters preserved', () => {
    const readersCafeRow = rows.find(r => r[1] === 'upg-readers-cafe');
    expect(readersCafeRow).toBeDefined();
    expect(readersCafeRow![2]).toBe("Upgrade to Reader's Café");
  });

  it('validates Local Festival event card exists', () => {
    const festivalRow = rows.find(r => r[1] === 'evt-festival');
    expect(festivalRow).toBeDefined();
    expect(festivalRow![2]).toBe('Local Festival');
  });

  it('validates all five card families produce CSV rows', () => {
    const families = new Set(rows.map(r => r[0]));
    expect(families).toContain('business');
    expect(families).toContain('community-space');
    expect(families).toContain('event');
    expect(families).toContain('upgrade');
    expect(families).toContain('staff');
  });

  it('validates each row\'s field count matches the header count', () => {
    for (const row of rows) {
      expect(row.length).toBe(header.length);
    }
  });
});
