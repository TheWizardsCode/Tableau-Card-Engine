/**
 * Base + card-pack CSV merge and merged checksum.
 *
 * Part of the card-pack DLC feature (CG-0MUZFD1WR0031QTB, feature F3 /
 * CG-0MUZIS14J003LQDW). A game's card pool is defined by one base CSV; an
 * installed card pack contributes extra rows in the **same schema**. This
 * module is the single, renderer-safe seam that turns `base + packs` into one
 * deterministic CSV for the game to load, rejecting packs that do not match
 * the base schema and reporting duplicate card ids as structural conflicts.
 *
 * Design rules:
 *   - **Additive only.** Base rows always come first, then accepted packs in
 *     declared order; no pack ever replaces or removes a base row.
 *   - **Never throw.** Every problem is reported structurally in the returned
 *     `errors` / `conflicts` arrays; the caller decides how to degrade.
 *   - **All-or-nothing per pack.** A pack with a schema mismatch, or one that
 *     contributes a duplicate card id, is dropped *whole* — none of its rows
 *     are merged — so a partially-applied pack can never corrupt a pool.
 *   - **Stable output.** The merged text is rebuilt from the base header
 *     (emitted exactly once) using RFC 4180 quoting, so equal inputs always
 *     produce byte-identical output and a stable checksum.
 *
 * The merged CSV round-trips through {@link parseCsv}: parsing the result
 * yields exactly the base rows followed by the accepted packs' rows.
 *
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import { parseCsv, parseCsvHeader } from './CsvLoader';

/** One pack CSV fragment supplied to {@link mergeCardPackCsv}. */
export interface CardPackCsv {
  /** Pack id (from the manifest) used to attribute errors and conflicts. */
  readonly id: string;
  /** Raw CSV text of the pack's `cards` fragment. */
  readonly csv: string;
}

/**
 * A card id contributed by more than one source across the base pool and the
 * accepted packs.
 */
export interface CardPackMergeConflict {
  /** The duplicated card id. */
  readonly id: string;
  /**
   * Every source that contributed the id, in first-encounter order. `'base'`
   * is the base pool; other entries are pack ids.
   */
  readonly sources: string[];
}

/** Result of {@link mergeCardPackCsv}. */
export interface CardPackMergeResult {
  /**
   * The merged CSV text, or `null` when the base pool itself is unusable
   * (empty, or missing the required `id` column). Individual rejected packs
   * do not nullify a valid base.
   */
  readonly merged: string | null;
  /** Structural problems: an unusable base, or rejected packs. */
  readonly errors: string[];
  /** Duplicate card ids across the base pool and the accepted packs. */
  readonly conflicts: CardPackMergeConflict[];
}

/** Source label used for the base pool in conflict reports. */
const BASE_SOURCE = 'base';

/** One pack that passed validation and may be merged. */
interface AcceptedPack {
  readonly id: string;
  readonly rows: Record<string, string>[];
}

/**
 * Deterministically merge a base card CSV with zero or more pack CSV
 * fragments.
 *
 * @param baseCsv   The game's base card pool CSV (header + rows).
 * @param packCsvs  Pack fragments in declared order. Defaults to none.
 */
export function mergeCardPackCsv(
  baseCsv: string,
  packCsvs: readonly CardPackCsv[] = [],
): CardPackMergeResult {
  const errors: string[] = [];
  const conflicts: CardPackMergeConflict[] = [];

  const baseHeader = parseCsvHeader(baseCsv);
  if (baseHeader.length === 0) {
    return {
      merged: null,
      errors: ['Base CSV is empty or has no header.'],
      conflicts,
    };
  }
  if (!baseHeader.includes('id')) {
    return {
      merged: null,
      errors: ['Base CSV header is missing the required "id" column.'],
      conflicts,
    };
  }

  const baseRows = parseCsv(baseCsv);

  // Validate each pack; keep only those that match the base schema.
  const accepted: AcceptedPack[] = [];
  const seenPackIds = new Set<string>();
  packCsvs.forEach((candidate, index) => {
    const packId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (packId === '') {
      errors.push(`packs[${index}]: pack id must be a non-empty string.`);
      return;
    }
    if (seenPackIds.has(packId)) {
      errors.push(`Pack "${packId}": duplicate pack id in merge input.`);
      return;
    }
    seenPackIds.add(packId);

    const packHeader = parseCsvHeader(candidate.csv);
    if (packHeader.length === 0) {
      errors.push(`Pack "${packId}": header is empty.`);
      return;
    }
    if (!headersEqual(packHeader, baseHeader)) {
      errors.push(`Pack "${packId}": header does not match the base schema.`);
      return;
    }

    accepted.push({ id: packId, rows: parseCsv(candidate.csv) });
  });

  // Detect duplicate card ids across the base pool and the accepted packs.
  interface Occurrence {
    count: number;
    sources: string[];
    packIds: Set<string>;
  }
  const occurrences = new Map<string, Occurrence>();
  const record = (id: string, source: string, packId?: string): void => {
    const entry =
      occurrences.get(id) ?? { count: 0, sources: [], packIds: new Set<string>() };
    entry.count += 1;
    if (!entry.sources.includes(source)) entry.sources.push(source);
    if (packId !== undefined) entry.packIds.add(packId);
    occurrences.set(id, entry);
  };

  for (const row of baseRows) record(row.id ?? '', BASE_SOURCE);
  for (const acceptedPack of accepted) {
    for (const row of acceptedPack.rows) {
      record(row.id ?? '', acceptedPack.id, acceptedPack.id);
    }
  }

  const conflictingPackIds = new Set<string>();
  for (const [id, entry] of occurrences) {
    if (entry.count <= 1) continue;
    conflicts.push({ id, sources: [...entry.sources] });
    for (const packId of entry.packIds) conflictingPackIds.add(packId);
  }

  const mergedRows = [...baseRows];
  for (const acceptedPack of accepted) {
    if (conflictingPackIds.has(acceptedPack.id)) continue;
    mergedRows.push(...acceptedPack.rows);
  }

  return {
    merged: serialiseCsv(baseHeader, mergedRows),
    errors,
    conflicts,
  };
}

/**
 * Compute a deterministic checksum of merged CSV text.
 *
 * Uses the djb2 variant (seed 5381) already used by Main Street's
 * `computeCsvChecksum`, so a merged pool's checksum is directly comparable to
 * the base-only checksum embedded in existing saves. The result is an
 * 8-character, zero-padded lowercase hex string.
 */
export function computeMergedChecksum(csvText: string): string {
  let hash = 5381;
  for (let i = 0; i < csvText.length; i++) {
    hash = ((hash << 5) + hash + csvText.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Exact, order-sensitive header equality. */
function headersEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Serialise columns + rows to CSV, emitting the header exactly once. */
function serialiseCsv(
  columns: readonly string[],
  rows: readonly Record<string, string>[],
): string {
  const lines = [columns.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvField(row[column] ?? '')).join(','));
  }
  return lines.join('\n');
}

/** Quote a field when it contains a comma, quote, or line break (RFC 4180). */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
