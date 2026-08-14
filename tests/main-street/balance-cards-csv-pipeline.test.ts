/**
 * Regression tests for the balance-cards CSV pipeline (CG-0MSREC65T004J5SS).
 *
 * The bug: `npm run balance-cards` crashed with "CSV has 30 columns but
 * expected 29" because `refreshCostDiscount` was added to card-data.csv
 * (Group F staff expansion, CG-0MSQJ7VL9009JHF4) but not to
 * `CSV_COLUMNS`/`NUMERIC_COLUMNS` in src/balance-cards/csv.ts. The per-group
 * expansion tests fed pre-parsed rows into `validateCsvRows`, bypassing
 * `parseCsv`/`readCsvFile` — the exact code path that crashed.
 *
 * These tests exercise the full `readCsvFile` → `validateCsvRows` →
 * `runBalancingPass` pipeline against the real card-data.csv so a future
 * CSV-column change cannot silently break the CLI again.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import {
  readCsvFile,
  validateCsvRows,
  runBalancingPass,
  toCsvString,
  parseCsv,
  validateRow,
} from '../../src/balance-cards';

const CSV_PATH = resolve(process.cwd(), 'example-games/main-street/card-data.csv');

describe('balance-cards CSV pipeline (regression CG-0MSREC65T004J5SS)', () => {
  it('reads the real 30-column card-data.csv without a column-count crash', () => {
    const rows = readCsvFile(CSV_PATH);
    // Header has 30 columns (refreshCostDiscount added by Group F).
    expect(rows.length).toBeGreaterThan(100);
  });

  it('validates all real CSV rows (refreshCostDiscount is numeric)', () => {
    const rows = readCsvFile(CSV_PATH);
    expect(() => validateCsvRows(rows)).not.toThrow();
  });

  it('parses refreshCostDiscount into staff rows', () => {
    const rows = readCsvFile(CSV_PATH);
    const accountant = rows.find(r => r.id === 'staff-accountant');
    expect(accountant).toBeDefined();
    expect(accountant?.refreshCostDiscount).toBe('1');
  });

  it('runs the full balancing pass on the real CSV', () => {
    const rows = readCsvFile(CSV_PATH);
    const result = runBalancingPass(rows);
    expect(result.rows).toHaveLength(rows.length);
    // refreshCostDiscount survives the pass unchanged
    const accountant = result.rows.find(r => r.id === 'staff-accountant');
    expect(accountant?.refreshCostDiscount).toBe('1');
  });

  it('round-trips the balanced CSV with all 30 columns intact', () => {
    const rows = readCsvFile(CSV_PATH);
    const result = runBalancingPass(rows);
    const reparsed = parseCsv(toCsvString(result.rows));
    expect(reparsed).toHaveLength(result.rows.length);
    const accountant = reparsed.find(r => r.id === 'staff-accountant');
    expect(accountant?.refreshCostDiscount).toBe('1');
  });

  it('treats refreshCostDiscount as numeric in row validation', () => {
    const rows = readCsvFile(CSV_PATH);
    const accountant = rows.find(r => r.id === 'staff-accountant');
    expect(accountant).toBeDefined();
    const nonNumeric = { ...accountant, refreshCostDiscount: 'abc' };
    const errors = validateRow(nonNumeric as never, 0);
    expect(errors.some(e => e.includes("refreshCostDiscount' has non-numeric value"))).toBe(true);
  });
});
