/**
 * Story-line editor edits: in-memory application, diff and preview.
 *
 * The editor (page → host endpoints) never touches the content CSV itself.
 * This module is the **pure** editor edit seam — what a preview can run in a
 * browser with no file system — while the transactional write lives in
 * {@link ../api} (which routes every accepted edit through the core author
 * `applyContentEditToFile`, the only content writer).
 *
 * | Concern | Reused core seam |
 * |---|---|
 * | Applying an edit in memory | `addContentCard`, `updateContentCard`, `updateContentCards`, `addLinkedContentCard` (`content/mutate.ts`) |
 * | Validating + reports | `validateContentCsv`, `formatContentValidationReport`, `contentValidationToJson` (`content/validate.ts`) |
 * | Content checksum | `computeContentChecksum` (`content/csv.ts`) |
 *
 * Editor edit kinds (each mapped onto one core author function):
 *
 * - `update-card` — edit an existing card's fields (the F3 edit form);
 * - `add-card` — append a new card (the F3 add-card form);
 * - `add-linked-card` — append a new card **and** link it into a chain from
 *   an existing card in one in-memory pass (the F3 guided add/link form);
 * - `set-storyline` / `set-storyline-batch` — story-line group membership
 *   (F4, exposed through the same author functions).
 *
 * No module here writes the CSV; everything is pure over CSV text.
 *
 * @module
 */

import {
  addContentCard,
  applyAddContentCardSpec,
  applyUpdateContentCardSpec,
  updateContentCard,
  updateContentCards,
  readContentCards,
  type AddContentCardSpec,
  type ContentEditResult,
  type UpdateContentCardSpec,
} from '../content/mutate';
import { computeContentChecksum, parseCsv } from '../content/csv';
import { baseIdOf, type ContentAdapter } from '../content/types';
import {
  contentValidationToJson,
  formatContentValidationReport,
  validateContentCsv,
  type ContentValidationResult,
} from '../content/validate';

// ── Edits ───────────────────────────────────────────────────

/** A storyline assignment for one card (the `setStoryline` bridge for F4). */
export interface SetStorylineSpec {
  /** The card to reassign. */
  readonly id: string;
  /** New story-line id (`null` clears it). */
  readonly storylineId: string | null;
  /** New story-line title (`undefined` leaves it alone, `null` clears it). */
  readonly storylineTitle?: string | null;
}

/** A storyline-level batch assignment (rename/reassign a whole group once). */
export interface SetStorylineBatchSpec {
  /** The cards to reassign, in order. */
  readonly ids: readonly string[];
  /** New story-line id (`null` clears it). */
  readonly storylineId: string | null;
  /** New story-line title (`undefined` leaves it alone, `null` clears it). */
  readonly storylineTitle?: string | null;
}

/**
 * A spec for adding a card **and** linking it in from an existing card in one
 * transaction: the new card is appended with its own fields, then the chosen
 * predecessor gains an option (or legacy accept/reject link) pointing at it.
 * This is what makes a guided add into an existing multi-member story-line
 * valid (`unreachable-card` never fires because the new card is reachable).
 */
export interface AddLinkedCardSpec {
  /** The new card (the same spec {@link addContentCard} accepts). */
  readonly card: AddContentCardSpec;
  /** The predecessor that gains a link to the new card. */
  readonly linkFrom: {
    /** The predecessor's card id. */
    readonly id: string;
    /**
     * Option label shown to the player. Required when the adapter maps an
     * `options` column; defaults to the new card's name.
     */
    readonly label?: string;
    /**
     * Which legacy link column to set when the adapter maps no `options`
     * column (`accept` default). Ignored when `options` is mapped.
     */
    readonly linkKind?: 'accept' | 'reject';
  };
}

/**
 * An editor edit: the curated operations the guided forms and the storyline
 * manager drive, each mapped onto a core author function.
 */
export type EditorEdit =
  | { readonly kind: 'add-card'; readonly spec: AddContentCardSpec }
  | { readonly kind: 'add-linked-card'; readonly spec: AddLinkedCardSpec }
  | { readonly kind: 'update-card'; readonly spec: UpdateContentCardSpec }
  | { readonly kind: 'set-storyline'; readonly spec: SetStorylineSpec }
  | { readonly kind: 'set-storyline-batch'; readonly spec: SetStorylineBatchSpec };

/** The `kind` values an edit can carry. */
export const EDITOR_EDIT_KINDS = [
  'add-card',
  'add-linked-card',
  'update-card',
  'set-storyline',
  'set-storyline-batch',
] as const;

/** Renders a card's storyline fields as an {@link UpdateContentCardSpec}. */
function storylineUpdate(spec: SetStorylineSpec): UpdateContentCardSpec {
  return {
    id: spec.id,
    storylineId: spec.storylineId,
    ...(spec.storylineTitle !== undefined ? { storylineTitle: spec.storylineTitle } : {}),
  };
}

/**
 * Assigns a card to a story-line group (the single `setStoryline` wrapper).
 *
 * A story-line exists implicitly through its members, so assignment is a plain
 * update of the card's storyline id/title fields — routed through the same
 * author function as every other field edit.
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The assignment.
 * @returns The edit result.
 */
export function setStoryline(
  csvText: string,
  adapter: ContentAdapter,
  spec: SetStorylineSpec,
): ContentEditResult {
  return updateContentCard(csvText, adapter, storylineUpdate(spec));
}

/**
 * Assigns many cards to a story-line group in a single in-memory pass and
 * validates the combined result once (the F4 batch rename/reassign).
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The batch assignment.
 * @returns The edit result.
 */
export function setStorylineBatch(
  csvText: string,
  adapter: ContentAdapter,
  spec: SetStorylineBatchSpec,
): ContentEditResult {
  return updateContentCards(
    csvText,
    adapter,
    spec.ids.map((id) =>
      storylineUpdate({
        id,
        storylineId: spec.storylineId,
        storylineTitle: spec.storylineTitle,
      }),
    ),
  );
}

/**
 * Appends an option (or legacy link) to `options`/`accept`/`reject` on the
 * predecessor card, pointing at the new card's id. Returns the update spec.
 */
function linkUpdateFrom(
  adapter: ContentAdapter,
  predecessor: { readonly id: string; readonly options: string },
  newId: string,
  link: AddLinkedCardSpec['linkFrom'],
): UpdateContentCardSpec {
  const label = (link.label ?? '').trim();
  if (adapter.fields.options !== undefined) {
    const existing = predecessor.options.trim();
    return {
      id: predecessor.id,
      options: existing === '' ? `${label}|${newId}` : `${existing};${label}|${newId}`,
      // Appending an options encoding makes the predecessor a choice card;
      // keep the raw flag in step so the column is not a stale `false`.
      ...(adapter.fields.hasChoices !== undefined ? { hasChoices: true } : {}),
    };
  }
  if (adapter.fields.acceptNextCardId !== undefined && (link.linkKind ?? 'accept') === 'accept') {
    return { id: predecessor.id, acceptNextCardId: newId };
  }
  return { id: predecessor.id, rejectNextCardId: newId };
}

/** Folds a candidate CSV's validation outcome into an edit result. */
function finaliseCandidate(
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

/**
 * Appends a new card and links it in from an existing card, validating the
 * combined candidate **once**.
 *
 * The new card is applied through the pure add step; then the chosen
 * predecessor gains an option (`label|newId` appended to its `options`
 * encoding) or a legacy accept/reject link pointing at the new card, applied
 * through the pure update step. Validating only the combined candidate is
 * deliberate: validating the intermediate candidate (the new card alone) would
 * reject it as unreachable from its story-line before the link existed. The
 * returned `csv` is the unchanged input whenever either step fails — so the
 * write path stays single, transactional and validator-gated.
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param spec    The new card plus the predecessor link.
 * @returns The edit result.
 */
export function addLinkedContentCard(
  csvText: string,
  adapter: ContentAdapter,
  spec: AddLinkedCardSpec,
): ContentEditResult {
  const added = applyAddContentCardSpec(csvText, adapter, spec.card);
  if (!added.ok) return added;

  const newId = baseIdOf(adapter, spec.card.id);
  const predecessorId = baseIdOf(adapter, spec.linkFrom.id);
  const cards = readContentCards(added.csv, adapter);
  const predecessor = cards.find((card) => baseIdOf(adapter, card.id) === predecessorId);
  if (!predecessor) {
    return {
      csv: csvText,
      ok: false,
      errors: [`add-linked-card: predecessor card "${spec.linkFrom.id}" not found`],
    };
  }

  const linked = applyUpdateContentCardSpec(
    added.csv,
    adapter,
    linkUpdateFrom(adapter, predecessor, newId, spec.linkFrom),
  );
  if (!linked.ok) {
    // Never hand a partially-applied candidate to the writer.
    return { ...linked, csv: csvText };
  }
  return finaliseCandidate(csvText, linked.csv, adapter);
}

/**
 * Applies one editor edit to content text in memory (no validation folding is
 * added here — the author functions validate the candidate themselves).
 *
 * @param csvText Current content CSV text.
 * @param adapter The game content adapter.
 * @param edit    The edit to apply.
 * @returns The author result (candidate text only when `ok`).
 */
export function applyEditToCsv(
  csvText: string,
  adapter: ContentAdapter,
  edit: EditorEdit,
): ContentEditResult {
  switch (edit.kind) {
    case 'add-card':
      return addContentCard(csvText, adapter, edit.spec);
    case 'add-linked-card':
      return addLinkedContentCard(csvText, adapter, edit.spec);
    case 'update-card':
      return updateContentCard(csvText, adapter, edit.spec);
    case 'set-storyline':
      return setStoryline(csvText, adapter, edit.spec);
    case 'set-storyline-batch':
      return setStorylineBatch(csvText, adapter, edit.spec);
    default: {
      // Exhaustiveness: an unknown kind is a caller/protocol error, never a
      // silent no-op that would claim success without an edit.
      const unknown = edit as { kind?: unknown };
      return {
        csv: csvText,
        ok: false,
        errors: [`unknown edit kind "${String(unknown.kind)}"`],
      };
    }
  }
}

// ── Diff / preview ──────────────────────────────────────────

/** How an affected row changed between the loaded and candidate content. */
export type EditRowStatus = 'added' | 'removed' | 'changed';

/** One affected content row, with its before and after cell values. */
export interface EditRowDiff {
  /** Base card id (chain serials stripped through the adapter). */
  readonly id: string;
  /** What happened to the row. */
  readonly status: EditRowStatus;
  /** The row's cells keyed by column before the edit (`null` for an added row). */
  readonly before: Readonly<Record<string, string>> | null;
  /** The row's cells keyed by column after the edit (`null` for a removed row). */
  readonly after: Readonly<Record<string, string>> | null;
  /** Columns whose value differs (added/removed rows list every affected column). */
  readonly changedColumns: readonly string[];
}

/** One parsed row, indexed by its base card id. */
interface IndexedRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, string>>;
}

/** Indexes CSV rows by base card id, keeping the first occurrence of an id. */
function indexRows(csvText: string, adapter: ContentAdapter): Map<string, IndexedRow> {
  const parsed = parseCsv(csvText);
  const idIndex = parsed.header.indexOf(adapter.fields.id);
  const index = new Map<string, IndexedRow>();
  for (const row of parsed.rows) {
    const rawId = idIndex >= 0 ? (row[idIndex] ?? '') : '';
    const id = baseIdOf(adapter, rawId);
    if (index.has(id)) continue;
    const cells: Record<string, string> = {};
    parsed.header.forEach((column, columnIndex) => {
      cells[column] = row[columnIndex] ?? '';
    });
    index.set(id, { id, cells });
  }
  return index;
}

/**
 * Diffs two content CSVs row-by-row, by base card id.
 *
 * Only affected rows are returned (`added`, `removed`, `changed`), in the
 * candidate's file order followed by removed ids — a row-order-only
 * difference is not an edit, so it never shows up as a change.
 *
 * @param beforeCsv The content the editor loaded.
 * @param afterCsv  The candidate content.
 * @param adapter   The game content adapter.
 * @returns The affected rows with their before/after cells.
 */
export function diffContentRows(
  beforeCsv: string,
  afterCsv: string,
  adapter: ContentAdapter,
): EditRowDiff[] {
  const before = indexRows(beforeCsv, adapter);
  const after = indexRows(afterCsv, adapter);
  const diffs: EditRowDiff[] = [];

  for (const [id, row] of after) {
    const previous = before.get(id);
    if (!previous) {
      diffs.push({
        id,
        status: 'added',
        before: null,
        after: row.cells,
        changedColumns: Object.keys(row.cells),
      });
      continue;
    }
    const columns = [...new Set([...Object.keys(previous.cells), ...Object.keys(row.cells)])];
    const changedColumns = columns.filter((column) => previous.cells[column] !== row.cells[column]);
    if (changedColumns.length > 0) {
      diffs.push({
        id,
        status: 'changed',
        before: previous.cells,
        after: row.cells,
        changedColumns,
      });
    }
  }

  for (const [id, row] of before) {
    if (after.has(id)) continue;
    diffs.push({
      id,
      status: 'removed',
      before: row.cells,
      after: null,
      changedColumns: Object.keys(row.cells),
    });
  }

  return diffs;
}

/** A preview of one editor edit, with its diff and validation report. */
export interface EditPreview {
  /** True when the edit applied in memory and the candidate validates. */
  readonly ok: boolean;
  /** The edit kind that was previewed. */
  readonly kind: string;
  /** Checksum of the content the edit was previewed against (the reload token). */
  readonly checksum: string;
  /** Checksum of the candidate content (absent when the edit was refused). */
  readonly candidateChecksum?: string;
  /** The candidate CSV text (absent when the edit was refused). */
  readonly csv?: string;
  /** Affected rows, before and after (empty when the edit was refused). */
  readonly rows: readonly EditRowDiff[];
  /** The base ids the edit touched. */
  readonly affectedIds: readonly string[];
  /** The validator's machine-readable result for the candidate. */
  readonly validation: ContentValidationResult;
  /** Actionable error messages (empty when `ok`), naming the offending card/link. */
  readonly errors: readonly string[];
  /** The validator's text report (identical to the CLI's rendering). */
  readonly report: string;
  /** The validator's JSON report (identical to the CLI's rendering). */
  readonly reportJson: string;
}

/**
 * Previews an edit: applies it in memory, validates the candidate and diffs the
 * affected rows. Nothing is written.
 *
 * @param csvText Current (loaded) content CSV text.
 * @param adapter The game content adapter.
 * @param edit    The edit to preview.
 * @returns The preview/diff plus the validation report.
 */
export function previewEdit(
  csvText: string,
  adapter: ContentAdapter,
  edit: EditorEdit,
): EditPreview {
  const result = applyEditToCsv(csvText, adapter, edit);
  const validation = result.validation ?? validateContentCsv(result.csv, adapter);
  const rows = result.ok ? diffContentRows(csvText, result.csv, adapter) : [];
  return {
    ok: result.ok,
    kind: edit.kind,
    checksum: computeContentChecksum(csvText),
    ...(result.ok ? { candidateChecksum: computeContentChecksum(result.csv), csv: result.csv } : {}),
    rows,
    affectedIds: rows.map((row) => row.id),
    validation,
    errors: result.errors,
    report: formatContentValidationReport(validation),
    reportJson: contentValidationToJson(validation),
  };
}

/** The outcome of validating one edit (no diff, no write). */
export interface EditValidation {
  /** True when the candidate is valid and the edit would be accepted. */
  readonly ok: boolean;
  /** The checksum of the content that was validated. */
  readonly checksum: string;
  /** Actionable error messages (empty when `ok`). */
  readonly errors: readonly string[];
  /** The validator's machine-readable result. */
  readonly validation: ContentValidationResult;
  /** The validator's text report. */
  readonly report: string;
  /** The validator's JSON report. */
  readonly reportJson: string;
}

/**
 * Validates an edit without writing (and without computing a diff).
 *
 * @param csvText Current (loaded) content CSV text.
 * @param adapter The game content adapter.
 * @param edit    The edit to validate.
 * @returns The validation result and its reports.
 */
export function validateEdit(
  csvText: string,
  adapter: ContentAdapter,
  edit: EditorEdit,
): EditValidation {
  const preview = previewEdit(csvText, adapter, edit);
  return {
    ok: preview.ok,
    checksum: preview.checksum,
    errors: preview.errors,
    validation: preview.validation,
    report: preview.report,
    reportJson: preview.reportJson,
  };
}
