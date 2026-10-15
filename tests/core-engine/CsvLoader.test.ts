/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvHeader } from '../../src/core-engine/CsvLoader';

describe('CSV Loader', () => {
  it('should parse simple CSV rows', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '3' });
    expect(rows[1]).toEqual({ a: '4', b: '5', c: '6' });
  });

  it('should handle quoted fields with commas', () => {
    const csv = 'name,desc\n"Smith, John","A, B, C"';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Smith, John');
    expect(rows[0].desc).toBe('A, B, C');
  });

  it('should handle escaped quotes within quoted fields (CSV double-quote style)', () => {
    const csv = 'name,desc\n"Reader\'s Café","A ""great"" place"';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Reader's Café");
    expect(rows[0].desc).toBe('A "great" place');
  });

  it('should handle empty fields', () => {
    const csv = 'a,b,c\n1,,3\n,,\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: '1', b: '', c: '3' });
    expect(rows[1]).toEqual({ a: '', b: '', c: '' });
  });

  it('should handle empty fields in quoted values', () => {
    const csv = 'a,b,c\n"","",""\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ a: '', b: '', c: '' });
  });

  it('should return empty array for empty string', () => {
    const rows = parseCsv('');
    expect(rows).toHaveLength(0);
  });

  it('should return empty array for header-only CSV', () => {
    const rows = parseCsv('a,b,c');
    expect(rows).toHaveLength(0);
  });
});

describe('CSV Header', () => {
  it('returns the header columns of a CSV with data rows', () => {
    expect(parseCsvHeader('a,b,c\n1,2,3')).toEqual(['a', 'b', 'c']);
  });

  it('returns the header of a header-only CSV', () => {
    expect(parseCsvHeader('family,id,name')).toEqual(['family', 'id', 'name']);
  });

  it('returns the supplied headers (as a copy) when provided', () => {
    const headers = ['x', 'y'];
    const result = parseCsvHeader('ignored', headers);
    expect(result).toEqual(headers);
    expect(result).not.toBe(headers);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsvHeader('')).toEqual([]);
    expect(parseCsvHeader('   ')).toEqual([]);
  });

  it('handles quoted header fields containing a comma', () => {
    expect(parseCsvHeader('"a,b",c\n1,2')).toEqual(['a,b', 'c']);
  });
});
