/**
 * CSV parsing/serialising and content projection for story-line content.
 *
 * The parser is a minimal RFC-4180 subset (quoted fields, embedded commas,
 * `""` escapes and embedded newlines) with two hard properties the tooling
 * depends on:
 *
 * - **Round-trip stability** — for a canonically quoted file,
 *   `parseCsv` → `serialiseCsv` is byte-identical, including column order and
 *   the trailing newline.
 * - **Change detection** — {@link computeContentChecksum} is a deterministic
 *   DJB2 hash of the raw text, so any byte change (even whitespace) yields a
 *   different checksum.
 *
 * {@link cardsFromCsv} projects parsed rows onto the generic
 * {@link ContentCard} model through a game's {@link ContentAdapter};
 * {@link compileContentOptions} reuses the runtime engine's option semantics
 * (CSV `options` encoding first, legacy `hasChoices` fields second) so
 * authored content compiles exactly as the runtime will read it.
 *
 * This module is Phaser-free and game-import-free.
 *
 * @module
 */

import { parseStorylineOptionsEncoding } from '../compile';
import type { StorylineOption } from '../types';
import {
  baseIdOf,
  type ContentAdapter,
  type ContentCard,
} from './types';

/** A parsed CSV file: header names plus a row matrix aligned to the header. */
export interface ParsedCsv {
  /** Column names, in file order. */
  readonly header: readonly string[];
  /** Data rows; each row has one cell per header entry. */
  readonly rows: readonly (readonly string[])[];
}

/**
 * Parses CSV text into a header + row matrix.
 *
 * Handles quoted fields with embedded commas, quotes (`""`) and newlines. A
 * terminal newline does not produce an empty final record.
 *
 * @param text Raw CSV text.
 * @returns The parsed header and rows.
 */
export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      records.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Final field/row (when the file has no trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  // Drop trailing empty records produced by terminal newline(s).
  while (records.length > 0 && records[records.length - 1].every((cell) => cell === '')) {
    records.pop();
  }

  const header = records.shift() ?? [];
  return { header, rows: records };
}

/**
 * Escapes one CSV field, quoting only when the value requires it.
 *
 * @param value Raw cell value.
 * @returns The CSV-escaped cell.
 */
export function escapeCsvField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialises a header + row matrix to CSV text (LF newlines, trailing
 * newline). Round-trips a canonically quoted file byte-identically.
 *
 * @param parsed The header and rows to serialise.
 * @returns CSV text.
 */
export function serialiseCsv(parsed: ParsedCsv): string {
  const lines = [parsed.header.map(escapeCsvField).join(',')];
  for (const row of parsed.rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Computes a deterministic checksum (DJB2 hash, hex-encoded) of content text.
 *
 * Suitable for change detection, **not** for cryptographic security. The same
 * text always yields the same checksum and any byte change yields a different
 * one, which is what the authoring tooling uses to detect concurrent edits.
 *
 * @param csvText Raw content text.
 * @returns An 8-character hex string.
 */
export function computeContentChecksum(csvText: string): string {
  let hash = 5381;
  for (let i = 0; i < csvText.length; i++) {
    hash = ((hash << 5) + hash + csvText.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Lists the adapter's **required** columns (the id and name mappings) that the
 * file header does not contain.
 *
 * Optional mappings are never reported: a game without an `options` column is
 * a valid shape, and the authoring layer appends an absent optional column on
 * demand when a card sets it.
 *
 * @param header  Parsed CSV header.
 * @param adapter The game content adapter.
 * @returns Missing required column names (empty when the file is usable).
 */
export function findMissingColumns(
  header: readonly string[],
  adapter: ContentAdapter,
): string[] {
  const present = new Set(header);
  const missing: string[] = [];
  const { id, name } = adapter.fields;
  if (!present.has(id)) missing.push(id);
  if (!present.has(name)) missing.push(name);
  return missing;
}

/**
 * Projects parsed CSV rows onto the generic content model through an adapter.
 *
 * Identifier-like fields (`id`, `name`, the storyline ids and the successor
 * ids) and the effect text are trimmed; `fields` keeps raw cell text so a
 * game column is never silently rewritten. A column the adapter does not map
 * (or does not exist in the file) reads as absent — `null` for optional
 * identifiers, `''` for text, `false` for the choice flag.
 *
 * @param parsed  Parsed CSV.
 * @param adapter The game content adapter.
 * @returns One {@link ContentCard} per data row, in file order.
 */
export function cardsFromCsv(
  parsed: ParsedCsv,
  adapter: ContentAdapter,
): ContentCard[] {
  const indexByColumn = new Map<string, number>();
  parsed.header.forEach((column, index) => indexByColumn.set(column, index));

  const cell = (row: readonly string[], column: string | undefined): string => {
    if (column === undefined) return '';
    const index = indexByColumn.get(column);
    if (index === undefined) return '';
    return row[index] ?? '';
  };
  const text = (value: string): string => value.trim();
  const optional = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };

  const mappedColumns = new Set(
    Object.values(adapter.fields).filter((column): column is string => column !== undefined),
  );

  return parsed.rows.map((row) => {
    const fields: Record<string, string> = {};
    parsed.header.forEach((column, index) => {
      if (mappedColumns.has(column)) return;
      fields[column] = row[index] ?? '';
    });

    const flag = text(cell(row, adapter.fields.hasChoices)).toLowerCase();
    return {
      id: text(cell(row, adapter.fields.id)),
      name: text(cell(row, adapter.fields.name)),
      effect: text(cell(row, adapter.fields.effect)),
      hasChoices: flag === 'true' || flag === '1' || flag === 'yes',
      acceptNextCardId: optional(cell(row, adapter.fields.acceptNextCardId)),
      rejectNextCardId: optional(cell(row, adapter.fields.rejectNextCardId)),
      options: text(cell(row, adapter.fields.options)),
      storylineId: optional(cell(row, adapter.fields.storylineId)),
      storylineTitle: optional(cell(row, adapter.fields.storylineTitle)),
      fields,
    };
  });
}

/**
 * Compiles a content card's options with the runtime engine's semantics.
 *
 * Precedence mirrors the runtime exactly (minus the programmatic registry,
 * which is not content):
 *
 * 1. a non-blank CSV `options` encoding →
 *    {@link parseStorylineOptionsEncoding} (`successorIds`, `apply`);
 * 2. legacy `hasChoices` → `Accept` (`apply`) / `Reject` (`skip`) using
 *    `successorId`;
 * 3. otherwise no options (a plain incident).
 *
 * @param card The content card.
 * @returns The compiled option list (empty for a plain card).
 * @throws Error when the card's `options` encoding is malformed.
 */
export function compileContentOptions(card: ContentCard): StorylineOption<unknown>[] {
  if (card.options.trim() !== '') {
    return parseStorylineOptionsEncoding<unknown>(card.options);
  }
  if (!card.hasChoices) return [];
  return [
    {
      label: 'Accept',
      successorId: card.acceptNextCardId ?? undefined,
      effectPolicy: 'apply',
    },
    {
      label: 'Reject',
      successorId: card.rejectNextCardId ?? undefined,
      effectPolicy: 'skip',
    },
  ];
}

/**
 * True when a content card presents a choice — a non-empty `options` encoding
 * or the legacy `hasChoices` flag. A bare storyline id does **not** make a
 * card a choice (terminal escalation cards carry it for grouping).
 *
 * @param card The content card.
 * @returns Whether the card branches.
 */
export function contentCardHasChoice(card: ContentCard): boolean {
  return card.hasChoices || card.options.trim() !== '';
}

/**
 * The successor ids an option can reach, in declaration order.
 *
 * A non-empty candidate set (`successorIds`) takes precedence over the legacy
 * single `successorId`, mirroring runtime resolution precedence. An empty
 * list is a terminal option.
 *
 * @param option The compiled option.
 * @param adapter The game content adapter (for its base-id rule).
 * @returns Candidate base ids, or `[]` for a terminal option.
 */
export function optionSuccessorIds(
  option: StorylineOption<unknown>,
  adapter: ContentAdapter,
): string[] {
  if (option.successorIds !== undefined && option.successorIds.length > 0) {
    return option.successorIds.map((id) => baseIdOf(adapter, id));
  }
  if (option.successorId) return [baseIdOf(adapter, option.successorId)];
  return [];
}
