/**
 * Unit tests for base+pack CSV merge and the merged checksum
 * (CG-0MUZIS14J003LQDW, feature F3).
 *
 * The merge is the single seam where a game's base card CSV and one or more
 * card-pack CSV fragments become one pool. It must be deterministic, reject a
 * pack that does not share the base schema, detect duplicate card ids as
 * structural conflicts (dropping the offending pack wholesale), and expose a
 * checksum that changes once pack rows are present.
 *
 * Fixtures come from F1 (CG-0MUZIRZYO008B01N); a synthetic base pool is built
 * from `CARD_PACK_CSV_HEADER` so the base and pack schemas cannot drift.
 */

import { describe, it, expect } from 'vitest';

import {
  mergeCardPackCsv,
  computeMergedChecksum,
  parseCsv,
  type CardPackCsv,
} from '../../src/core-engine';
import {
  CARD_PACK_CSV_COLUMNS,
  CARD_PACK_CSV_HEADER,
  FIXTURE_PACK_ID,
  FIXTURE_PACK_TWO_ID,
  readCommittedPackCsv,
} from '../fixtures/card-pack/helpers';

/** A minimal Main-Street-schema data row: `family,id,name` (rest empty). */
function dataRow(id: string, name = id, family = 'business'): string {
  return `${family},${id},${name}`;
}

/** Build a base/pack CSV from a header (default schema) and data rows. */
function csvFromRows(rows: string[], header = CARD_PACK_CSV_HEADER): string {
  return [header, ...rows].join('\n');
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Parsed card ids in document order. */
function idsOf(csv: string): string[] {
  return parseCsv(csv).map((row) => row.id);
}

function pack(id: string, csv: string): CardPackCsv {
  return { id, csv };
}

const BASE_ONLY = csvFromRows([dataRow('biz-base-one'), dataRow('biz-base-two')]);

describe('mergeCardPackCsv — deterministic concatenation', () => {
  it('merges base first then packs in declared order, with one header', () => {
    const firstPack = readCommittedPackCsv(FIXTURE_PACK_ID);
    const secondPack = readCommittedPackCsv(FIXTURE_PACK_TWO_ID);

    const result = mergeCardPackCsv(BASE_ONLY, [
      pack(FIXTURE_PACK_ID, firstPack),
      pack(FIXTURE_PACK_TWO_ID, secondPack),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.merged).not.toBeNull();
    expect(idsOf(result.merged!)).toEqual([
      'biz-base-one',
      'biz-base-two',
      'biz-pack-teahouse',
      'biz-pack-nightmarket',
    ]);
    // Base header appears exactly once (packs' headers are not repeated).
    expect(countOccurrences(result.merged!, CARD_PACK_CSV_HEADER)).toBe(1);
    expect(result.merged!.split('\n')[0]).toBe(CARD_PACK_CSV_HEADER);
  });

  it('honours declared pack order (not pack id or content order)', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const a = csvFromRows([dataRow('biz-a')]);
    const b = csvFromRows([dataRow('biz-b')]);

    const result = mergeCardPackCsv(base, [pack('pack-b', b), pack('pack-a', a)]);

    expect(idsOf(result.merged!)).toEqual(['biz-base', 'biz-b', 'biz-a']);
  });

  it('produces stable output for the same inputs', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const p = csvFromRows([dataRow('biz-pack')]);

    const first = mergeCardPackCsv(base, [pack('p', p)]);
    const second = mergeCardPackCsv(base, [pack('p', p)]);

    expect(first.merged).toBe(second.merged);
    expect(first.errors).toEqual(second.errors);
    expect(first.conflicts).toEqual(second.conflicts);
  });

  it('treats an empty pack list as a no-op merge of the base pool', () => {
    const result = mergeCardPackCsv(BASE_ONLY);

    expect(result.errors).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.merged).not.toBeNull();
    expect(parseCsv(result.merged!)).toEqual(parseCsv(BASE_ONLY));
  });

  it('composes multiple packs additively (never replaces base rows)', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const result = mergeCardPackCsv(base, [
      pack('p1', csvFromRows([dataRow('biz-p1')])),
      pack('p2', csvFromRows([dataRow('biz-p2')])),
      pack('p3', csvFromRows([dataRow('biz-p3')])),
    ]);

    expect(idsOf(result.merged!)).toEqual(['biz-base', 'biz-p1', 'biz-p2', 'biz-p3']);
  });

  it('round-trips quoted fields (commas and escaped quotes)', () => {
    const baseWithQuote = ['id,desc', 'biz-a,"Alpha, Inc"'].join('\n');
    const packCsv = ['id,desc', 'biz-b,"Beta ""B"""'].join('\n');

    const result = mergeCardPackCsv(baseWithQuote, [pack('p', packCsv)]);

    const rows = parseCsv(result.merged!);
    expect(rows.find((r) => r.id === 'biz-a')?.desc).toBe('Alpha, Inc');
    expect(rows.find((r) => r.id === 'biz-b')?.desc).toBe('Beta "B"');
    expect(rows.length).toBe(2);
  });
});

describe('mergeCardPackCsv — schema rejection', () => {
  it('rejects a pack whose header differs from the base schema', () => {
    const bad = csvFromRows([dataRow('biz-pack-bad')], 'id,family,name');

    const result = mergeCardPackCsv(BASE_ONLY, [pack('bad-pack', bad)]);

    expect(result.merged).not.toBeNull();
    expect(
      result.errors.some(
        (e) => e.includes('bad-pack') && e.toLowerCase().includes('header'),
      ),
    ).toBe(true);
    expect(idsOf(result.merged!)).not.toContain('biz-pack-bad');
    // Base rows are untouched.
    expect(idsOf(result.merged!)).toEqual(['biz-base-one', 'biz-base-two']);
  });

  it('rejects a pack whose header has the same columns in a different order', () => {
    const reordered = [...CARD_PACK_CSV_COLUMNS].reverse().join(',');
    const bad = [reordered, dataRow('biz-pack-reordered')].join('\n');

    const result = mergeCardPackCsv(BASE_ONLY, [pack('reordered-pack', bad)]);

    expect(result.errors.some((e) => e.includes('reordered-pack'))).toBe(true);
    expect(idsOf(result.merged!)).not.toContain('biz-pack-reordered');
  });

  it('rejects an empty pack CSV fragment', () => {
    const result = mergeCardPackCsv(BASE_ONLY, [pack('empty-pack', '')]);

    expect(result.errors.some((e) => e.includes('empty-pack'))).toBe(true);
    expect(parseCsv(result.merged!)).toEqual(parseCsv(BASE_ONLY));
  });

  it('merges valid packs even when a sibling pack is rejected', () => {
    const bad = csvFromRows([dataRow('biz-bad')], 'id,family,name');
    const good = csvFromRows([dataRow('biz-good')]);

    const result = mergeCardPackCsv(BASE_ONLY, [
      pack('bad-pack', bad),
      pack('good-pack', good),
    ]);

    expect(idsOf(result.merged!)).toContain('biz-good');
    expect(idsOf(result.merged!)).not.toContain('biz-bad');
  });

  it('returns merged:null and reports an empty base', () => {
    const result = mergeCardPackCsv('');

    expect(result.merged).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns merged:null and reports a base without an "id" column', () => {
    const result = mergeCardPackCsv('name,family\nFoo,Bar');

    expect(result.merged).toBeNull();
    expect(result.errors.join(' ')).toMatch(/id/);
  });

  it('reports a duplicate pack id in the merge input', () => {
    const result = mergeCardPackCsv(BASE_ONLY, [
      pack('dup', csvFromRows([dataRow('biz-x')])),
      pack('dup', csvFromRows([dataRow('biz-y')])),
    ]);

    expect(result.errors.some((e) => /duplicate pack id/i.test(e))).toBe(true);
  });

  it('reports a pack whose id is empty', () => {
    const result = mergeCardPackCsv(BASE_ONLY, [pack('   ', csvFromRows([dataRow('biz-x')]))]);

    expect(result.errors.some((e) => /packs\[0\]/.test(e))).toBe(true);
  });
});

describe('mergeCardPackCsv — duplicate id conflicts', () => {
  it('reports a base/pack duplicate and drops the whole conflicting pack', () => {
    const base = csvFromRows([dataRow('biz-bakery')]);
    const conflictingPack = csvFromRows([
      dataRow('biz-bakery', 'Bakery (pack variant)'),
      dataRow('biz-pack-extra'),
    ]);

    const result = mergeCardPackCsv(base, [pack('p1', conflictingPack)]);

    expect(result.errors).toEqual([]);
    expect(result.conflicts).toEqual([
      { id: 'biz-bakery', sources: ['base', 'p1'] },
    ]);
    // The whole pack is excluded — even its non-conflicting row.
    expect(idsOf(result.merged!)).toEqual(['biz-bakery']);
  });

  it('detects a duplicate against the committed fixture conflict row', () => {
    const base = csvFromRows([dataRow('biz-bakery')]);
    const conflictingPack = readCommittedPackCsv(FIXTURE_PACK_ID, 'cards-duplicate.csv');

    const result = mergeCardPackCsv(base, [
      pack(FIXTURE_PACK_ID, conflictingPack),
    ]);

    expect(result.conflicts).toEqual([
      { id: 'biz-bakery', sources: ['base', FIXTURE_PACK_ID] },
    ]);
    expect(idsOf(result.merged!)).toEqual(['biz-bakery']);
  });

  it('reports a conflict between two packs and drops both', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const p1 = csvFromRows([dataRow('biz-shared')]);
    const p2 = csvFromRows([dataRow('biz-shared')]);

    const result = mergeCardPackCsv(base, [pack('p1', p1), pack('p2', p2)]);

    expect(result.conflicts).toEqual([
      { id: 'biz-shared', sources: ['p1', 'p2'] },
    ]);
    expect(idsOf(result.merged!)).toEqual(['biz-base']);
  });

  it('reports a duplicate id inside a single pack', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const within = csvFromRows([dataRow('biz-dup'), dataRow('biz-dup')]);

    const result = mergeCardPackCsv(base, [pack('p1', within)]);

    expect(result.conflicts).toEqual([{ id: 'biz-dup', sources: ['p1'] }]);
    expect(idsOf(result.merged!)).toEqual(['biz-base']);
  });

  it('keeps independent packs while dropping only the conflicting one', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const conflicting = csvFromRows([dataRow('biz-base'), dataRow('biz-keep?')]);
    const clean = csvFromRows([dataRow('biz-clean')]);

    const result = mergeCardPackCsv(base, [
      pack('conflicting', conflicting),
      pack('clean', clean),
    ]);

    expect(result.conflicts).toEqual([
      { id: 'biz-base', sources: ['base', 'conflicting'] },
    ]);
    expect(idsOf(result.merged!)).toEqual(['biz-base', 'biz-clean']);
  });
});

describe('computeMergedChecksum', () => {
  it('is deterministic for the same input', () => {
    const csv = csvFromRows([dataRow('biz-a'), dataRow('biz-b')]);
    expect(computeMergedChecksum(csv)).toBe(computeMergedChecksum(csv));
  });

  it('returns an 8-character lowercase hex string', () => {
    expect(computeMergedChecksum('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs from the base-only checksum once pack rows are present', () => {
    const base = csvFromRows([dataRow('biz-base')]);
    const merged = mergeCardPackCsv(base, [
      pack('p1', csvFromRows([dataRow('biz-pack')])),
    ]).merged!;

    expect(computeMergedChecksum(merged)).not.toBe(computeMergedChecksum(base));
  });

  it('matches the landed djb2 checksum value (algorithm lock)', () => {
    // Mirrors Main Street's computeCsvChecksum (djb2, seed 5381).
    expect(computeMergedChecksum('family,id\nbusiness,biz-a\n')).toBe('6bcca93f');
  });
});
