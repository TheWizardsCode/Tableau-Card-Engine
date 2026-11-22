/**
 * Pure, in-memory story-line content mutations.
 *
 * This module is the **pure** half of the authoring seam: applying a content
 * edit to CSV text and validating the candidate — nothing touches the file
 * system. It is what a form/preview pipeline runs in a browser: the editor
 * page composes an edit (add/update card, add-and-link a card), previews the
 * candidate and validates it, all in memory, before the Node-side writer
 * (`../author.ts`, the **only** content writer) persists anything.
 *
 * Every mutation follows the same contract:
 *
 * 1. parse the current content;
 * 2. apply the mutation to an in-memory copy;
 * 3. validate the resulting content with {@link validateContentCsv};
 * 4. return the candidate text when valid (and nothing was written), or the
 *    unchanged input plus actionable errors when not.
 *
 * Phaser-free, game-import-free and **Node-free**: only the pure content
 * model modules are imported, so this whole module is importable in a
 * browser.
 *
 * @module
 */

import {
  cardsFromCsv,
  compileContentOptions,
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

/** A spec for appending a new card to the content. */
export interface AddContentCardSpec {
  /** New card id (required, must be unique). */
  readonly id: string;
  /** New card name (required). */
  readonly name: string;
  /** Human-readable effect text. */
  readonly effect?: string;
  /**
   * The beat's authored situation paragraph. Prose is copied into the mapped
   * `context` column only when the adapter declares that mapping.
   */
  readonly context?: string | null;
  /** The terminal card's authored closing prose (same rule as `context`). */
  readonly epilogue?: string | null;
  /** CSV `options` encoding (`label|a,b;label2|c`). */
  readonly options?: string;
  /** Story-line id. */
  readonly storylineId?: string | null;
  /** Story-line title. */
  readonly storylineTitle?: string | null;
  /** Declared resource keys for this card's option attributes. */
  readonly resources?: string | null;
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
  /** New `context` prose (`null` or `''` clears it). */
  readonly context?: string | null;
  /** New `epilogue` prose (`null` or `''` clears it). */
  readonly epilogue?: string | null;
  /** New `options` encoding (`null` or `''` clears). */
  readonly options?: string | null;
  /** New story-line id (`null` clears). */
  readonly storylineId?: string | null;
  /** New story-line title (`null` clears). */
  readonly storylineTitle?: string | null;
  /** New declared resource keys (`null` or `''` clears). */
  readonly resources?: string | null;
  /** Game-specific column values, keyed by CSV column name. */
  readonly fields?: Readonly<Record<string, string>>;
}

/** A pure in-memory content mutation (used by the file writer). */
export type ContentMutation = (csvText: string) => ContentEditResult;

/**
 * A spec for appending one option to an existing card's `options` cell.
 *
 * This is the `add-option` counterpart of `update-card --options`: it appends
 * a single `label|target` entry instead of replacing the whole cell, so a
 * writer adding one branch never retypes the options that already exist.
 */
export interface AddOptionContentCardSpec {
  /** The existing card whose `options` cell gains the option (required). */
  readonly id: string;
  /** The option label shown to the player (required, unique on the card). */
  readonly label: string;
  /**
   * Successor card id(s), encoded verbatim after the `|`. Omitted or empty
   * authors a terminal option. A target that does not exist is refused by
   * validation (`unknown-successor`).
   */
  readonly target?: string | null;
  /**
   * Extended option attributes appended in authored order — `cost=coins:2`,
   * `extra=reputation:+1`, `when=hull>=1>card` or `says=…`. A leading `#` is
   * optional; each attribute is validated with the candidate content (an
   * unknown resource key or malformed attribute refuses the edit).
   */
  readonly attributes?: readonly string[];
}

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
 * Applies an `add-card` spec to CSV text **without validating** the candidate.
 *
 * Structural problems (missing required values, duplicate id, unknown column)
 * are still reported. Exposed for composing multi-step edits (a card added
 * *and* linked in) that must be validated once, as a whole candidate — the
 * public {@link addContentCard} wraps this with validation.
 *
 * @internal
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The new card.
 * @returns The unvalidated candidate (or the unchanged input + errors).
 */
export function applyAddContentCardSpec(
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
  if (fields.context !== undefined && spec.context !== undefined) {
    setColumn(header, rows, row, fields.context, spec.context ?? '');
  }
  if (fields.epilogue !== undefined && spec.epilogue !== undefined) {
    setColumn(header, rows, row, fields.epilogue, spec.epilogue ?? '');
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
  if (fields.resources !== undefined && spec.resources !== undefined) {
    setColumn(header, rows, row, fields.resources, spec.resources ?? '');
  }
  for (const [column, value] of Object.entries(spec.fields ?? {})) {
    setColumn(header, rows, row, column, value);
  }

  rows.push(row);
  return { csv: serialiseCsv({ header, rows }), ok: true, errors: [] };
}

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
  const applied = applyAddContentCardSpec(csvText, adapter, spec);
  if (!applied.ok) return applied;
  return finalise(csvText, applied.csv, adapter);
}

/**
 * Shared field-application step for {@link updateContentCard} and
 * {@link updateContentCards}: applies one spec's supplied fields to a row.
 */
function applyUpdateFields(
  header: string[],
  rows: string[][],
  row: string[],
  adapter: ContentAdapter,
  spec: UpdateContentCardSpec,
): void {
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
  if (spec.context !== undefined) setNullable(fields.context, spec.context);
  if (spec.epilogue !== undefined) setNullable(fields.epilogue, spec.epilogue);
  if (spec.options !== undefined) setNullable(fields.options, spec.options);
  if (spec.storylineId !== undefined) setNullable(fields.storylineId, spec.storylineId);
  if (spec.storylineTitle !== undefined) {
    setNullable(fields.storylineTitle, spec.storylineTitle);
  }
  if (spec.resources !== undefined) setNullable(fields.resources, spec.resources);
  for (const [column, value] of Object.entries(spec.fields ?? {})) {
    setColumn(header, rows, row, column, value);
  }
}

/**
 * Applies an `update-card` spec to CSV text **without validating** the
 * candidate.
 *
 * Structural problems (missing id, unknown field key, missing card) are still
 * reported. Exposed for composing multi-step edits that must be validated
 * once, as a whole candidate — the public {@link updateContentCard} wraps this
 * with validation.
 *
 * @internal
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The update (only the supplied fields are changed).
 * @returns The unvalidated candidate (or the unchanged input + errors).
 */
export function applyUpdateContentCardSpec(
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

  applyUpdateFields(header, rows, row, adapter, spec);
  return { csv: serialiseCsv({ header, rows }), ok: true, errors: [] };
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
  const applied = applyUpdateContentCardSpec(csvText, adapter, spec);
  if (!applied.ok) return applied;
  return finalise(csvText, applied.csv, adapter);
}

/**
 * Applies several card updates in one in-memory pass and validates the
 * combined result once.
 *
 * This is the batch counterpart of {@link updateContentCard}: every spec is
 * applied to the same row matrix, then the whole candidate is validated a
 * single time (`finalise`). It is what a storyline-level rename uses — a
 * group of member cards reassigned as one author operation, written once
 * through the file writer.
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param specs   The updates to apply, in order.
 * @returns The edit result (one validation over the combined candidate).
 */
export function updateContentCards(
  csvText: string,
  adapter: ContentAdapter,
  specs: readonly UpdateContentCardSpec[],
): ContentEditResult {
  if (specs.length === 0) {
    return { csv: csvText, ok: true, errors: [] };
  }

  const parsed = parseCsv(csvText);
  const header = [...parsed.header];
  const rows = mutableRows(parsed);

  for (const spec of specs) {
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
    applyUpdateFields(header, rows, row, adapter, spec);
  }

  return finalise(csvText, serialiseCsv({ header, rows }), adapter);
}

// ── Option append ───────────────────────────────────────────

/**
 * Encodes one option entry (`label|target#attr…`) for an `options` cell.
 *
 * A blank `target` authors a terminal option (`label|`). An attribute may be
 * written with or without its leading `#`; the canonical encoding always
 * carries one. Attributes are kept in authored order so an authored cell and
 * an appended entry read the same way.
 *
 * @param label      The option label.
 * @param target     Successor card id(s), comma-joined; empty for terminal.
 * @param attributes Extended `#cost` / `#extra` / `#when` / `#says` attributes.
 * @returns The option entry text.
 */
export function encodeOptionEntry(
  label: string,
  target?: string | null,
  attributes?: readonly string[],
): string {
  const head = `${label.trim()}|${(target ?? '').trim()}`;
  const suffix = (attributes ?? [])
    .map((attribute) => attribute.trim())
    .filter((attribute) => attribute !== '')
    .map((attribute) => (attribute.startsWith('#') ? attribute : `#${attribute}`))
    .join('');
  return `${head}${suffix}`;
}

/**
 * Appends one encoded option entry to an existing `options` cell.
 *
 * The existing text is preserved byte-for-byte apart from its trailing
 * whitespace / separator: an already-terminated cell (`…;`) gains the entry
 * directly, and a dangling trailing `;` never produces an empty option. This
 * is what makes one-branch authoring safe without retyping the cell.
 *
 * @param existing The current cell text (may be empty).
 * @param entry    The encoded option entry (see {@link encodeOptionEntry}).
 * @returns The options cell with the entry appended last.
 */
export function appendOptionEncoding(existing: string, entry: string): string {
  const head = existing.replace(/[\s;]+$/, '');
  if (head === '') return entry;
  return `${head};${entry}`;
}

/**
 * Appends one option to an existing card and validates the resulting content.
 *
 * Structural problems (no options column on the adapter, missing id/label,
 * unknown card, duplicate label) are reported before the candidate is
 * validated; the returned `csv` is the unchanged input whenever `ok` is
 * false. Everything else about an appended option — its successor exists, its
 * `#cost` / `#extra` keys are declared, its encoding is well formed — is
 * validated over the whole candidate by {@link validateContentCsv}, so the
 * refusal reason names the offending option.
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The option to append to an existing card.
 * @returns The edit result.
 */
export function addOptionToContentCard(
  csvText: string,
  adapter: ContentAdapter,
  spec: AddOptionContentCardSpec,
): ContentEditResult {
  const optionsColumn = adapter.fields.options;
  if (optionsColumn === undefined) {
    // An option lives only in the options encoding: refuse rather than claim
    // success while writing nothing.
    return {
      csv: csvText,
      ok: false,
      errors: [
        `add-option: adapter "${adapter.gameId}" maps no options column, so an option cannot be appended`,
      ],
    };
  }

  const parsed = parseCsv(csvText);
  const header = [...parsed.header];
  const rows = mutableRows(parsed);

  const errors = headerErrors(header, adapter);
  const label = spec.label.trim();
  if (spec.id.trim() === '') errors.push('add-option: --id is required');
  if (label === '') errors.push('add-option: --label is required');
  if (errors.length > 0) return { csv: csvText, ok: false, errors };

  const row = findRow(header, rows, adapter, spec.id);
  if (!row) {
    return {
      csv: csvText,
      ok: false,
      errors: [`add-option: card id "${spec.id}" not found`],
    };
  }

  const cardId = baseIdOf(adapter, spec.id);
  const card = readContentCards(csvText, adapter).find(
    (candidate) => baseIdOf(adapter, candidate.id) === cardId,
  );
  const optionsIndex = header.indexOf(optionsColumn);
  const existing = optionsIndex < 0 ? '' : (row[optionsIndex] ?? '');
  if (card && declaresOptionLabel(card, label)) {
    return {
      csv: csvText,
      ok: false,
      errors: [
        `add-option: card "${cardId}" already declares the option label "${label}" (duplicate option label)`,
      ],
    };
  }
  setColumn(
    header,
    rows,
    row,
    optionsColumn,
    appendOptionEncoding(existing, encodeOptionEntry(label, spec.target, spec.attributes)),
  );
  return finalise(csvText, serialiseCsv({ header, rows }), adapter);
}

/**
 * True when a card already declares a label (case-insensitively, matching the
 * validator's duplicate-label rule). A malformed existing encoding is not a
 * duplicate error here — validation reports the malformation itself.
 */
function declaresOptionLabel(card: ContentCard, label: string): boolean {
  if (card.options.trim() === '') return false;
  const wanted = label.trim().toLowerCase();
  try {
    return compileContentOptions(card).some(
      (option) => option.label.trim().toLowerCase() === wanted,
    );
  } catch {
    return false;
  }
}

// ── Read counterpart ─────────────────────────────────────────

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
