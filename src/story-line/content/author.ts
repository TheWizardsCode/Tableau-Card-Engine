/**
 * Transactional story-line content authoring.
 *
 * This module is the **only writer** of story-line content CSVs in the engine.
 * Every edit follows the same transaction:
 *
 * 1. parse the current content;
 * 2. apply the mutation to an in-memory copy;
 * 3. validate the resulting content with {@link validateContentCsv};
 * 4. only when validation passes, write the file atomically
 *    (temp file + rename in the same directory);
 * 5. on validation failure, return the errors and leave the file untouched.
 *
 * `--dry-run` support is part of the API (`dryRun`): the candidate text is
 * returned for preview but nothing is written.
 *
 * The module is Phaser-free and game-import-free: every game-specific detail
 * arrives through the {@link ContentAdapter}.
 *
 * @module
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import {
  cardsFromCsv,
  findMissingColumns,
  parseCsv,
  serialiseCsv,
  type ParsedCsv,
} from './csv';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';
import { validateContentCsv, type ContentValidationResult } from './validate';

// ── Result types ────────────────────────────────────────────

/** The outcome of an in-memory content edit. */
export interface ContentEditResult {
  /** The candidate CSV text — unchanged input when `ok` is false. */
  readonly csv: string;
  /** True when the edit applied and the resulting content validated. */
  readonly ok: boolean;
  /** Actionable error messages; empty when `ok` is true. */
  readonly errors: readonly string[];
  /** Validation detail for the candidate content (present once parsed). */
  readonly validation?: ContentValidationResult;
}

/** The outcome of a file-level content edit. */
export interface ContentFileEditResult extends ContentEditResult {
  /** The content path the edit targeted (absolute or caller-supplied). */
  readonly path: string;
  /** True only when the file was actually written. */
  readonly written: boolean;
}

/** A spec for appending a new card to the content. */
export interface AddContentCardSpec {
  /** New card id (required, must be unique). */
  readonly id: string;
  /** New card name (required). */
  readonly name: string;
  /** Human-readable effect text. */
  readonly effect?: string;
  /** Legacy two-way choice flag. */
  readonly hasChoices?: boolean;
  /** Legacy accept successor id (`null` clears). */
  readonly acceptNextCardId?: string | null;
  /** Legacy reject successor id (`null` clears). */
  readonly rejectNextCardId?: string | null;
  /** CSV `options` encoding (`label|a,b;label2|c`). */
  readonly options?: string;
  /** Story-line id. */
  readonly storylineId?: string | null;
  /** Story-line title. */
  readonly storylineTitle?: string | null;
  /** Game-specific column values, keyed by CSV column name. */
  readonly fields?: Readonly<Record<string, string>>;
}

/**
 * A spec for updating an existing card. Every field is optional; a field that
 * is `undefined` is left untouched, and a nullable field set to `null` is
 * cleared.
 */
export interface UpdateContentCardSpec {
  /** The card id to update (required). */
  readonly id: string;
  /** New name. */
  readonly name?: string;
  /** New effect text. */
  readonly effect?: string;
  /** New choice flag. */
  readonly hasChoices?: boolean;
  /** New accept successor id (`null` clears). */
  readonly acceptNextCardId?: string | null;
  /** New reject successor id (`null` clears). */
  readonly rejectNextCardId?: string | null;
  /** New `options` encoding (`null` or `''` clears). */
  readonly options?: string | null;
  /** New story-line id (`null` clears). */
  readonly storylineId?: string | null;
  /** New story-line title (`null` clears). */
  readonly storylineTitle?: string | null;
  /** Game-specific column values, keyed by CSV column name. */
  readonly fields?: Readonly<Record<string, string>>;
}

/** A pure in-memory content mutation (used by the file writer). */
export type ContentMutation = (csvText: string) => ContentEditResult;

// ── Matrix helpers ──────────────────────────────────────────

/** Returns a fresh, all-empty row aligned to the header. */
function emptyRow(parsed: ParsedCsv): string[] {
  return new Array(parsed.header.length).fill('');
}

/**
 * Sets a column's cell on a row. A column absent from the header is appended
 * (and every existing row padded), so content authored before an optional
 * column existed can still be edited without a separate migration.
 */
function setColumn(
  header: string[],
  rows: string[][],
  row: string[],
  column: string,
  value: string,
): void {
  let index = header.indexOf(column);
  if (index < 0) {
    index = header.length;
    header.push(column);
    for (const existing of rows) existing.push('');
    row.push('');
  }
  row[index] = value;
}

/** Returns the mutable row matrix (the parser's rows are readonly). */
function mutableRows(parsed: ParsedCsv): string[][] {
  return parsed.rows.map((row) => [...row]);
}

/** Finds the row for a base card id, or `undefined`. */
function findRow(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  adapter: ContentAdapter,
  id: string,
): string[] | undefined {
  const idIndex = header.indexOf(adapter.fields.id);
  if (idIndex < 0) return undefined;
  const wanted = baseIdOf(adapter, id);
  return rows.find((row) => baseIdOf(adapter, row[idIndex] ?? '') === wanted) as
    | string[]
    | undefined;
}

/** Validates a candidate CSV and folds the outcome into an edit result. */
function finalise(
  originalCsv: string,
  candidateCsv: string,
  adapter: ContentAdapter,
): ContentEditResult {
  const validation = validateContentCsv(candidateCsv, adapter);
  if (!validation.valid) {
    return {
      csv: originalCsv,
      ok: false,
      errors: validation.issues.map((issue) => issue.message),
      validation,
    };
  }
  return { csv: candidateCsv, ok: true, errors: [], validation };
}

/** Rejects adapter columns the file does not contain. */
function headerErrors(header: readonly string[], adapter: ContentAdapter): string[] {
  const missing = findMissingColumns(header, adapter);
  if (missing.length === 0) return [];
  return [
    `content header is missing required column(s): ${missing.join(', ')} (found: ${header.join(', ') || '(empty header)'})`,
  ];
}

/** Rejects game-field keys that are not real columns or are mapped fields. */
function fieldKeyErrors(
  header: readonly string[],
  adapter: ContentAdapter,
  fields: Readonly<Record<string, string>> | undefined,
): string[] {
  if (!fields) return [];
  const mapped = new Set(
    Object.values(adapter.fields).filter(
      (column): column is string => column !== undefined,
    ),
  );
  const errors: string[] = [];
  for (const column of Object.keys(fields)) {
    if (mapped.has(column)) {
      errors.push(
        `field "${column}" is a mapped story-line column; use the dedicated authoring option instead`,
      );
    } else if (!header.includes(column)) {
      errors.push(`unknown content column "${column}" (file columns: ${header.join(', ')})`);
    }
  }
  return errors;
}

// ── Pure author operations ──────────────────────────────────

/**
 * Appends a new card and validates the resulting content.
 *
 * Structural problems (missing required values, duplicate id, unknown column)
 * are reported before the candidate is validated; the returned `csv` is the
 * unchanged input whenever `ok` is false.
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The new card.
 * @returns The edit result.
 */
export function addContentCard(
  csvText: string,
  adapter: ContentAdapter,
  spec: AddContentCardSpec,
): ContentEditResult {
  const parsed = parseCsv(csvText);
  const header = [...parsed.header];
  const rows = mutableRows(parsed);

  const errors = headerErrors(header, adapter);
  if (spec.id.trim() === '') errors.push('add-card: --id is required');
  if (spec.name.trim() === '') errors.push('add-card: --name is required');
  errors.push(...fieldKeyErrors(header, adapter, spec.fields));
  if (errors.length > 0) return { csv: csvText, ok: false, errors };

  if (findRow(header, rows, adapter, spec.id)) {
    return {
      csv: csvText,
      ok: false,
      errors: [`add-card: card id "${spec.id}" already exists (duplicate id)`],
    };
  }

  const row = emptyRow({ header, rows });
  for (const [column, value] of Object.entries(adapter.newCardDefaults ?? {})) {
    if (header.includes(column)) setColumn(header, rows, row, column, value);
  }

  const fields = adapter.fields;
  setColumn(header, rows, row, fields.id, spec.id);
  setColumn(header, rows, row, fields.name, spec.name);
  if (fields.effect !== undefined) {
    setColumn(header, rows, row, fields.effect, spec.effect ?? '');
  }
  if (fields.hasChoices !== undefined) {
    setColumn(header, rows, row, fields.hasChoices, spec.hasChoices ? 'true' : 'false');
  }
  if (fields.acceptNextCardId !== undefined && spec.acceptNextCardId) {
    setColumn(header, rows, row, fields.acceptNextCardId, spec.acceptNextCardId);
  }
  if (fields.rejectNextCardId !== undefined && spec.rejectNextCardId) {
    setColumn(header, rows, row, fields.rejectNextCardId, spec.rejectNextCardId);
  }
  if (fields.options !== undefined && spec.options !== undefined) {
    setColumn(header, rows, row, fields.options, spec.options);
  }
  if (fields.storylineId !== undefined && spec.storylineId) {
    setColumn(header, rows, row, fields.storylineId, spec.storylineId);
  }
  if (fields.storylineTitle !== undefined && spec.storylineTitle) {
    setColumn(header, rows, row, fields.storylineTitle, spec.storylineTitle);
  }
  for (const [column, value] of Object.entries(spec.fields ?? {})) {
    setColumn(header, rows, row, column, value);
  }

  rows.push(row);
  return finalise(csvText, serialiseCsv({ header, rows }), adapter);
}

/**
 * Updates an existing card and validates the resulting content.
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The update (only the supplied fields are changed).
 * @returns The edit result.
 */
export function updateContentCard(
  csvText: string,
  adapter: ContentAdapter,
  spec: UpdateContentCardSpec,
): ContentEditResult {
  const parsed = parseCsv(csvText);
  const header = [...parsed.header];
  const rows = mutableRows(parsed);

  const errors = headerErrors(header, adapter);
  if (spec.id.trim() === '') errors.push('update-card: --id is required');
  errors.push(...fieldKeyErrors(header, adapter, spec.fields));
  if (errors.length > 0) return { csv: csvText, ok: false, errors };

  const row = findRow(header, rows, adapter, spec.id);
  if (!row) {
    return {
      csv: csvText,
      ok: false,
      errors: [`update-card: card id "${spec.id}" not found`],
    };
  }

  const fields = adapter.fields;
  const setNullable = (column: string | undefined, value: string | null): void => {
    if (column === undefined) return;
    setColumn(header, rows, row, column, value ?? '');
  };

  if (fields.name !== undefined && spec.name !== undefined) {
    setColumn(header, rows, row, fields.name, spec.name);
  }
  if (fields.effect !== undefined && spec.effect !== undefined) {
    setColumn(header, rows, row, fields.effect, spec.effect);
  }
  if (spec.hasChoices !== undefined && fields.hasChoices !== undefined) {
    setColumn(header, rows, row, fields.hasChoices, spec.hasChoices ? 'true' : 'false');
  }
  if (spec.acceptNextCardId !== undefined) {
    setNullable(fields.acceptNextCardId, spec.acceptNextCardId);
    // Setting a link implies a choice card (it would otherwise be inert at
    // runtime); clearing a link leaves the flag alone.
    if (spec.acceptNextCardId && spec.hasChoices === undefined && fields.hasChoices !== undefined) {
      setColumn(header, rows, row, fields.hasChoices, 'true');
    }
  }
  if (spec.rejectNextCardId !== undefined) {
    setNullable(fields.rejectNextCardId, spec.rejectNextCardId);
    if (spec.rejectNextCardId && spec.hasChoices === undefined && fields.hasChoices !== undefined) {
      setColumn(header, rows, row, fields.hasChoices, 'true');
    }
  }
  if (spec.options !== undefined) setNullable(fields.options, spec.options);
  if (spec.storylineId !== undefined) setNullable(fields.storylineId, spec.storylineId);
  if (spec.storylineTitle !== undefined) {
    setNullable(fields.storylineTitle, spec.storylineTitle);
  }
  for (const [column, value] of Object.entries(spec.fields ?? {})) {
    setColumn(header, rows, row, column, value);
  }

  return finalise(csvText, serialiseCsv({ header, rows }), adapter);
}

// ── File writer (the only content writer) ───────────────────

/** Options for {@link applyContentEditToFile}. */
export interface ApplyContentEditOptions {
  /** Absolute or caller-resolved content CSV path. */
  readonly contentPath: string;
  /** The game content adapter. */
  readonly adapter: ContentAdapter;
  /** The in-memory mutation to apply. */
  readonly mutate: ContentMutation;
  /** When true, validate and return the candidate without writing. */
  readonly dryRun?: boolean;
}

/**
 * Applies a content mutation to a file transactionally.
 *
 * The file is read, mutated in memory and validated; it is written via a temp
 * file + rename **only** when validation passes and `dryRun` is false. On any
 * failure (including a thrown I/O error while writing) the original file is
 * left in place and `ok` is false.
 *
 * @param options The edit to apply.
 * @returns The edit result plus `path` and `written`.
 */
export function applyContentEditToFile(
  options: ApplyContentEditOptions,
): ContentFileEditResult {
  const { contentPath, adapter, mutate, dryRun = false } = options;
  const original = readFileSync(contentPath, 'utf-8');
  const result = mutate(original);

  if (!result.ok) {
    return { ...result, path: contentPath, written: false };
  }

  // Defence in depth: the mutation validates already, but the writer never
  // trusts that — invalid content can never reach the file, whoever the
  // caller is.
  const validation = validateContentCsv(result.csv, adapter);
  if (!validation.valid) {
    return {
      csv: original,
      ok: false,
      errors: validation.issues.map((issue) => issue.message),
      validation,
      path: contentPath,
      written: false,
    };
  }

  if (dryRun) {
    return { ...result, validation, path: contentPath, written: false };
  }

  const tmp = `${contentPath}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, result.csv, 'utf-8');
    renameSync(tmp, contentPath);
  } catch (err) {
    return {
      csv: original,
      ok: false,
      errors: [`write failed: ${(err as Error).message}`],
      validation: result.validation,
      path: contentPath,
      written: false,
    };
  }
  return { ...result, validation, path: contentPath, written: true };
}

/**
 * True when a card list contains a card with the given base id.
 *
 * @param cards   Content cards.
 * @param adapter The game content adapter.
 * @param id      The id to look for.
 * @returns Whether the card exists.
 */
export function hasContentCard(
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
  id: string,
): boolean {
  const wanted = baseIdOf(adapter, id);
  return cards.some((card) => baseIdOf(adapter, card.id) === wanted);
}

/**
 * Re-projects a content CSV through the adapter (parse → cards), the read
 * counterpart of the write path. Exposed so callers never need to reach into
 * the CSV helpers just to read cards back after an edit.
 *
 * @param csvText Content CSV text.
 * @param adapter The game content adapter.
 * @returns The projected cards, in file order.
 */
export function readContentCards(
  csvText: string,
  adapter: ContentAdapter,
): ContentCard[] {
  return cardsFromCsv(parseCsv(csvText), adapter);
}
