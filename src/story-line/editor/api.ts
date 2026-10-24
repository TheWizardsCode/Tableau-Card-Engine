/**
 * Story-line editor write bridge.
 *
 * The editor (page → host endpoints) never touches the content CSV itself.
 * This module is the single thin bridge over the core authoring seams and is
 * the editor's only way to write:
 *
 * | Concern | Reused core seam |
 * |---|---|
 * | Applying an edit in memory | `addContentCard`, `updateContentCard`, `updateContentCards` (`content/author.ts`) |
 * | Validating + reports | `validateContentCsv`, `formatContentValidationReport`, `contentValidationToJson` (`content/validate.ts`) |
 * | Manifest + Mermaid | `buildStorylineManifestFromCsv`, `serialiseManifest`, `renderMermaid` (`content/manifest.ts`) |
 * | Content checksum | `computeContentChecksum` (`content/csv.ts`) |
 * | Transactional write | `applyContentEditToFile` (`content/author.ts`) — the only content writer |
 * | Generated artefacts | `writeArtefacts` / `checkArtefacts` (`content/artefacts.ts`) |
 *
 * Nothing here writes the CSV: `applyEdit` delegates to the author API, which
 * validates and writes atomically. The bridge adds the three things the editor
 * needs on top of that:
 *
 * 1. **Preview/diff** — before/after CSV rows for the affected cards plus the
 *    validation report, computed in memory (`previewEdit`).
 * 2. **A concurrency guard** — the checksum captured at load is handed to the
 *    writer, which compares it with its own read and refuses on mismatch,
 *    returning a reload instruction instead of clobbering a concurrent edit.
 * 3. **Artefact regeneration + honest reporting** — after an accepted edit the
 *    committed Mermaid/JSON artefacts are regenerated and verified by a
 *    post-write drift check; hand-written documentation is never claimed as
 *    machine-synced, so an edit touching a documented row reports an explicit
 *    "manual documentation update required" naming the check that now fails.
 *
 * Phaser-free and game-import-free (Node builtins only, for reading the
 * content the caller asked about).
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_ARTEFACT_PATHS,
  checkArtefacts,
  previewArtefacts,
  writeArtefacts,
  type ArtefactDrift,
  type ArtefactPaths,
  type ArtefactWriteResult,
} from '../content/artefacts';
import {
  addContentCard,
  applyContentEditToFile,
  updateContentCard,
  updateContentCards,
  type AddContentCardSpec,
  type ContentEditResult,
  type ContentFileEditResult,
  type UpdateContentCardSpec,
} from '../content/author';
import { computeContentChecksum, parseCsv } from '../content/csv';
import {
  buildStorylineManifestFromCsv,
  type StorylineManifest,
} from '../content/manifest';
import { baseIdOf, type ContentAdapter } from '../content/types';
import {
  contentValidationToJson,
  formatContentValidationReport,
  validateContentCsv,
  type ContentValidationResult,
} from '../content/validate';
import {
  DEFAULT_MANUAL_DOC_SECTIONS,
  findManualDocUpdates,
  type ManualDocSection,
  type ManualDocUpdate,
} from './manual-docs';

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
 * An editor edit: the curated operations the guided forms and the storyline
 * manager drive, each mapped onto a core author function.
 */
export type EditorEdit =
  | { readonly kind: 'add-card'; readonly spec: AddContentCardSpec }
  | { readonly kind: 'update-card'; readonly spec: UpdateContentCardSpec }
  | { readonly kind: 'set-storyline'; readonly spec: SetStorylineSpec }
  | { readonly kind: 'set-storyline-batch'; readonly spec: SetStorylineBatchSpec };

/** The `kind` values an edit can carry. */
export const EDITOR_EDIT_KINDS = [
  'add-card',
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

// ── Apply ───────────────────────────────────────────────────

/** Why an apply request ended the way it did. */
export type EditApplyStatus = 'applied' | 'dry-run' | 'invalid' | 'stale-content';

/** The artefact outcome of an accepted edit. */
export interface EditArtefactOutcome {
  /** The artefact paths involved. */
  readonly paths: ArtefactPaths;
  /** True only when the artefacts were (re)generated and verified in sync. */
  readonly ok: boolean;
  /** True when the artefacts were actually written (`false` on a dry run). */
  readonly regenerated: boolean;
  /** Paths written (empty on a dry run). */
  readonly written: readonly string[];
  /** Post-write drift check (`missing`/`drift` entries when not in sync). */
  readonly drifts: readonly ArtefactDrift[];
  /** Actionable one-line summary of the artefact state. */
  readonly message: string;
}

/** Options for {@link applyEdit}. */
export interface ApplyEditOptions {
  /** Content CSV path (absolute or relative to `baseDir`). */
  readonly contentPath: string;
  /** The game content adapter. */
  readonly adapter: ContentAdapter;
  /** The edit to apply. */
  readonly edit: EditorEdit;
  /**
   * The content checksum captured when the editor loaded the file. Required:
   * the concurrency guard must never be silently disabled by an edit request.
   */
  readonly expectedChecksum: string;
  /** When true, preview and validate but write nothing. */
  readonly dryRun?: boolean;
  /** Generated-artefact paths (defaults to the committed Gym artefacts). */
  readonly artefactPaths?: ArtefactPaths;
  /** Hand-written documentation registry (defaults to the shipped sections). */
  readonly manualDocs?: readonly ManualDocSection[];
  /** When false, skip artefact regeneration (tests/tooling that only want a CSV). */
  readonly regenerateArtefacts?: boolean;
  /** Base directory relative paths resolve against (default `process.cwd()`). */
  readonly baseDir?: string;
}

/** The outcome of an apply request. */
export interface EditApplyResult {
  /** Why the request ended the way it did. */
  readonly status: EditApplyStatus;
  /** True when the content was accepted (`applied` or `dry-run`). */
  readonly ok: boolean;
  /** HTTP-style status code for the host endpoints (200/409/422/500). */
  readonly code: number;
  /** True only when the content file was actually written. */
  readonly written: boolean;
  /** The content path targeted. */
  readonly contentPath: string;
  /** The preview/diff and validation report for the attempted edit. */
  readonly preview: EditPreview;
  /** Actionable errors (empty when `ok`). */
  readonly errors: readonly string[];
  /** Human-readable outcome summary (used verbatim by the CLI/host). */
  readonly message: string;
  /** True when the caller must reload the content before retrying. */
  readonly reloadRequired: boolean;
  /** The checksum of the content after the attempt (candidate when accepted). */
  readonly checksum: string;
  /** The artefact outcome (present only when the content was accepted). */
  readonly artefacts?: EditArtefactOutcome;
  /** Documented sections whose rows this edit touched (manual update required). */
  readonly manualDocUpdates: readonly ManualDocUpdate[];
  /** True when at least one hand-written doc section needs a human edit. */
  readonly manualDocumentationRequired: boolean;
}

/** Maps an author file-edit result to the bridge's status. */
function statusOf(result: ContentFileEditResult, dryRun: boolean): EditApplyStatus {
  if (!result.ok) return result.stale ? 'stale-content' : 'invalid';
  return dryRun ? 'dry-run' : 'applied';
}

/** Builds the artefact outcome for an accepted candidate. */
function artefactOutcome(
  result: ContentFileEditResult,
  options: ApplyEditOptions,
): EditArtefactOutcome {
  const paths = options.artefactPaths ?? DEFAULT_ARTEFACT_PATHS;
  const baseDir = options.baseDir ?? process.cwd();
  const manifest = buildStorylineManifestFromCsv(result.csv, options.adapter);

  if (options.dryRun) {
    const preview = previewArtefacts(manifest, paths, baseDir);
    return {
      paths,
      ok: preview.drifts.length === 0,
      regenerated: false,
      written: [],
      drifts: preview.drifts,
      message:
        preview.drifts.length === 0
          ? 'dry run: the committed artefacts would remain in sync'
          : `dry run: the edit would leave ${preview.drifts.length} artefact(s) out of sync until regenerated`,
    };
  }

  const written: ArtefactWriteResult = writeArtefacts(manifest, paths, baseDir);
  return {
    paths: written.paths,
    ok: written.ok,
    regenerated: true,
    written: written.written,
    drifts: written.drifts,
    message: written.ok
      ? `regenerated and verified ${written.written.length} artefact(s) — no drift`
      : `regenerated ${written.written.length} artefact(s) but ${written.drifts.length} still drifted`,
  };
}

/** Builds the outcome message for an accepted edit. */
function successMessage(
  status: EditApplyStatus,
  result: ContentFileEditResult,
  artefacts: EditArtefactOutcome | undefined,
  manualUpdates: readonly ManualDocUpdate[],
): string {
  const parts: string[] = [];
  if (status === 'dry-run') {
    parts.push(`dry run: the edit is valid and would apply to ${result.path}; nothing written`);
  } else {
    parts.push(`applied the edit to ${result.path}`);
  }
  if (artefacts) parts.push(artefacts.message);

  if (manualUpdates.length > 0) {
    parts.push(
      `manual documentation update required — ${manualUpdates.length} hand-written section(s) ` +
        `document an edited row: ${manualUpdates
          .map(
            (update) =>
              `${update.check} (${update.path}; check that now fails: ${update.verifyCommand})`,
          )
          .join('; ')}`,
    );
  } else {
    parts.push('no hand-written documentation section documents the edited rows');
  }
  return `${parts.join('; ')}.`;
}

/**
 * Adds the `write-error` outcome: an accepted-looking edit that the writer
 * could not persist is a server-side failure (500), not a content error.
 */
function failureCode(result: ContentFileEditResult): number {
  if (result.stale) return 409;
  return result.errors.some((error) => error.startsWith('write failed:')) ? 500 : 422;
}

/**
 * Applies an edit through the core author API, regenerating the committed
 * artefacts and reporting hand-written documentation honestly.
 *
 * The concurrency guard runs inside the writer's own read (via
 * `expectedChecksum`), so a concurrent external edit can never be clobbered by
 * a stale editor snapshot.
 *
 * @param options The edit, the adapter and the concurrency token.
 * @returns The apply outcome (never throws for validation/IO refusals).
 */
export function applyEdit(options: ApplyEditOptions): EditApplyResult {
  const { adapter, edit, expectedChecksum, dryRun = false } = options;
  const baseDir = options.baseDir ?? process.cwd();
  const resolvedPath = resolve(baseDir, options.contentPath);

  // The content the writer actually sees, captured for the diff below.
  let beforeCsv = '';
  const fileResult = applyContentEditToFile({
    contentPath: resolvedPath,
    adapter,
    dryRun,
    expectedChecksum,
    mutate: (csv) => {
      beforeCsv = csv;
      return applyEditToCsv(csv, adapter, edit);
    },
  });

  const status = statusOf(fileResult, dryRun);
  // The writer refuses before mutating on a stale token, so read the current
  // content to report what the edit would have done against it.
  const snapshot = beforeCsv === '' ? readFileSync(resolvedPath, 'utf-8') : beforeCsv;
  const preview = previewEdit(snapshot, adapter, edit);

  if (!fileResult.ok) {
    const stale = fileResult.stale === true;
    return {
      status: stale ? 'stale-content' : 'invalid',
      ok: false,
      code: failureCode(fileResult),
      written: false,
      contentPath: resolvedPath,
      preview,
      errors: fileResult.errors,
      message: stale
        ? `refused to write: ${fileResult.errors.join('; ')}`
        : `refused to write — validation failed: ${fileResult.errors.join('; ')}`,
      reloadRequired: fileResult.reloadRequired === true,
      checksum: computeContentChecksum(snapshot),
      manualDocUpdates: [],
      manualDocumentationRequired: false,
    };
  }

  const artefacts =
    options.regenerateArtefacts === false ? undefined : artefactOutcome(fileResult, { ...options, baseDir });
  const manualDocUpdates = findManualDocUpdates(
    preview.affectedIds,
    options.manualDocs ?? DEFAULT_MANUAL_DOC_SECTIONS,
  );

  return {
    status,
    ok: true,
    code: 200,
    written: fileResult.written,
    contentPath: resolvedPath,
    preview,
    errors: [],
    message: successMessage(status, fileResult, artefacts, manualDocUpdates),
    reloadRequired: false,
    checksum: computeContentChecksum(fileResult.csv),
    ...(artefacts ? { artefacts } : {}),
    manualDocUpdates,
    manualDocumentationRequired: manualDocUpdates.length > 0,
  };
}

/**
 * Regenerates the committed artefacts for a content file.
 *
 * Exposed separately so tooling can repair artefacts without editing content;
 * the content itself is never written here.
 *
 * @param csvText The accepted content CSV text.
 * @param adapter The game content adapter.
 * @param options Artefact paths and base directory.
 * @returns The manifest plus the regeneration result.
 */
export function regenerateArtefacts(
  csvText: string,
  adapter: ContentAdapter,
  options: { readonly artefactPaths?: ArtefactPaths; readonly baseDir?: string } = {},
): { readonly manifest: StorylineManifest; readonly artefacts: ArtefactWriteResult } {
  const manifest = buildStorylineManifestFromCsv(csvText, adapter);
  const artefacts = writeArtefacts(
    manifest,
    options.artefactPaths ?? DEFAULT_ARTEFACT_PATHS,
    options.baseDir ?? process.cwd(),
  );
  return { manifest, artefacts };
}

/**
 * Checks the committed artefacts for a content file without writing anything.
 *
 * @param csvText The content CSV text.
 * @param adapter The game content adapter.
 * @param options Artefact paths and base directory.
 * @returns The drift check (empty when in sync).
 */
export function checkCommittedArtefacts(
  csvText: string,
  adapter: ContentAdapter,
  options: { readonly artefactPaths?: ArtefactPaths; readonly baseDir?: string } = {},
): ArtefactDrift[] {
  return checkArtefacts(
    buildStorylineManifestFromCsv(csvText, adapter),
    options.artefactPaths ?? DEFAULT_ARTEFACT_PATHS,
    options.baseDir ?? process.cwd(),
  );
}
