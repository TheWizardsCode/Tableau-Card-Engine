/**
 * CSV parsing/serialising and content projection for story-line content.
 *
 * The parser is a minimal RFC-4180 subset (quoted fields, embedded commas,
 * `""` escapes and embedded newlines) with two hard properties the tooling
 * depends on:
 *
 * - **Round-trip stability** — for a canonically quoted file,
 *   `parseCsv` → `serialiseCsv` is byte-identical, including column order,
 *   leading declaration comments and the trailing newline.
 * - **Change detection** — {@link computeContentChecksum} is a deterministic
 *   DJB2 hash of the raw text, so any byte change (even whitespace) yields a
 *   different checksum.
 *
 * Leading `#` lines before the header are **declaration comments**, lifted out
 * of the header/row matrix so a file can declare something once for every row
 * ({@link parseResourceDeclaration} reads the `#resources:` form).
 *
 * {@link cardsFromCsv} projects parsed rows onto the generic
 * {@link ContentCard} model through a game's {@link ContentAdapter};
 * {@link compileContentOptions} reuses the runtime engine's option semantics
 * (the CSV `options` encoding is the single choice representation) so authored
 * content compiles exactly as the runtime will read it.
 *
 * This module is Phaser-free and game-import-free.
 *
 * @module
 */

import { parseStorylineOptionsEncoding } from '../compile';
import { parseResourceKeys } from '../resources';
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
  /**
   * Leading `#` comment lines, verbatim and in file order, before the header.
   *
   * A declaration line declares something once for the whole file instead of
   * repeating it in every row; {@link parseResourceDeclaration} reads the
   * `#resources:` form. The lines are re-emitted by {@link serialiseCsv}, so an
   * authored edit never drops them.
   */
  readonly declarations: readonly string[];
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
  const declarations: string[] = [];
  let body = text;
  // A declaration line is any leading `#` line before the header. Only the
  // leading block qualifies, so a `#`-leading cell in a data row stays data.
  while (body.startsWith('#')) {
    const lineEnd = body.search(/\r\n|\n|\r/);
    if (lineEnd < 0) {
      declarations.push(body);
      body = '';
      break;
    }
    declarations.push(body.slice(0, lineEnd));
    const terminator = body.startsWith('\r\n', lineEnd) ? 2 : 1;
    body = body.slice(lineEnd + terminator);
  }

  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
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
      if (ch === '\r' && body[i + 1] === '\n') i++;
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
  return { header, rows: records, declarations };
}

/**
 * Reads the file's declared resource keys from its leading declaration lines.
 *
 * Accepts a `#resources: hull,morale` line (an optional space after `#`, and a
 * case-insensitive `resources` key). The first matching line wins; a file with
 * no such line declares no keys (`[]`), which leaves per-row cells — or the
 * engine's default projection — in charge.
 *
 * @param declarations Leading declaration lines from {@link ParsedCsv.declarations}.
 * @returns The declared keys, in declaration order (trimmed and de-duplicated).
 */
export function parseResourceDeclaration(
  declarations: readonly string[],
): readonly string[] {
  for (const line of declarations) {
    const match = /^#\s*resources\s*:\s*(.*)$/i.exec(line);
    if (match) return parseResourceKeys(match[1]);
  }
  return [];
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
  const lines = [
    ...parsed.declarations,
    parsed.header.map(escapeCsvField).join(','),
  ];
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
 * Identifier-like fields (`id`, `name`, the storyline ids) and the effect text
 * are trimmed; `fields` keeps raw cell text so a game column is never silently
 * rewritten. A column the adapter does not map (or does not exist in the file)
 * reads as absent — `null` for optional identifiers, `''` for text.
 *
 * Only the generic story-line fields (`id`, `name`, `effect`, `options`, the
 * storyline metadata, the declared `resources` keys and the optional authored
 * `context` / `epilogue` prose) are projected; every other column, including
 * any game-specific or not-yet-migrated column, lands in
 * {@link ContentCard.fields}.
 *
 * The effective resource set per card is the row's `resources` cell when it is
 * non-blank, otherwise the file-level `#resources:` declaration, otherwise
 * nothing (the engine's default projection applies downstream). A per-row cell
 * therefore **overrides**, rather than extends, the file declaration, so mixed
 * resource sets inside one file stay expressible.
 *
 * Authored prose is kept **verbatim** (commas, quotes, apostrophes, `;`, `|`
 * and `#` all survive) and a blank cell reads as `null` (absent), never `''`.
 * The prose keys exist only when the adapter maps their column, so content
 * without prose columns keeps exactly the shape it had before the prose
 * fields existed.
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
  // Prose is preserved verbatim (only blankness is normalised), so an author's
  // punctuation and spacing survive the projection.
  const prose = (value: string): string | null =>
    value.trim() === '' ? null : value;

  const mappedColumns = new Set(
    Object.values(adapter.fields).filter((column): column is string => column !== undefined),
  );
  const declaredResources = parseResourceDeclaration(parsed.declarations);
  const resourceKeysOf = (row: readonly string[]): readonly string[] => {
    const raw = cell(row, adapter.fields.resources);
    return raw.trim() === '' ? declaredResources : parseResourceKeys(raw);
  };

  return parsed.rows.map((row) => {
    const fields: Record<string, string> = {};
    parsed.header.forEach((column, index) => {
      if (mappedColumns.has(column)) return;
      fields[column] = row[index] ?? '';
    });

    return {
      id: text(cell(row, adapter.fields.id)),
      name: text(cell(row, adapter.fields.name)),
      effect: text(cell(row, adapter.fields.effect)),
      options: text(cell(row, adapter.fields.options)),
      ...(adapter.fields.context !== undefined
        ? { context: prose(cell(row, adapter.fields.context)) }
        : {}),
      ...(adapter.fields.epilogue !== undefined
        ? { epilogue: prose(cell(row, adapter.fields.epilogue)) }
        : {}),
      storylineId: optional(cell(row, adapter.fields.storylineId)),
      storylineTitle: optional(cell(row, adapter.fields.storylineTitle)),
      fields,
      resourceKeys: resourceKeysOf(row),
    };
  });
}

/**
 * Compiles a content card's options with the runtime engine's semantics.
 *
 * A non-blank CSV `options` encoding is parsed through
 * {@link parseStorylineOptionsEncoding} (`successorIds`, `apply`); otherwise
 * the card is a plain incident with no options. There is no second
 * (legacy) representation to fall back to.
 *
 * @param card The content card.
 * @returns The compiled option list (empty for a plain card).
 * @throws Error when the card's `options` encoding is malformed.
 */
export function compileContentOptions(card: ContentCard): StorylineOption<unknown>[] {
  if (card.options.trim() !== '') {
    return parseStorylineOptionsEncoding<unknown>(card.options);
  }
  return [];
}

/**
 * True when a content card presents a choice — i.e. carries a non-empty
 * `options` encoding. A bare storyline id does **not** make a card a choice
 * (terminal escalation cards carry it for grouping).
 *
 * @param card The content card.
 * @returns Whether the card branches.
 */
export function contentCardHasChoice(card: ContentCard): boolean {
  return card.options.trim() !== '';
}

/**
 * The successor ids an option can reach, in declaration order.
 *
 * A non-empty candidate set (`successorIds`) takes precedence over a single
 * `successorId`, mirroring runtime resolution precedence. An empty list is a
 * terminal option.
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
