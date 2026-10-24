/**
 * Story-line editor write bridge.
 *
 * The editor (page → host endpoints) never touches the content CSV itself.
 * This module is the bridge's **Node side**: the transactional write, the
 * concurrency guard, artefact regeneration and honest documentation
 * reporting. The **pure** side (edit application, diff, preview, validation)
 * lives in {@link ./edits} and is safe to run in a browser; it is re-exported
 * here so host code and tooling keep one import surface.
 *
 * | Concern | Reused core seam |
 * |---|---|
 * | Applying an edit in memory | `addContentCard`, `updateContentCard`, `updateContentCards`, `addLinkedContentCard` (`content/mutate.ts`) |
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
 * Game-import-free; Node builtins only where the file system is genuinely
 * required (reading/writing the content the caller asked about).
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
  applyContentEditToFile,
  type ContentFileEditResult,
} from '../content/author';
import { computeContentChecksum } from '../content/csv';
import {
  buildStorylineManifestFromCsv,
  type StorylineManifest,
} from '../content/manifest';
import type { ContentAdapter } from '../content/types';
import {
  DEFAULT_MANUAL_DOC_SECTIONS,
  findManualDocUpdates,
  type ManualDocSection,
  type ManualDocUpdate,
} from './manual-docs';
import { applyEditToCsv, previewEdit, type EditPreview, type EditorEdit } from './edits';

// The pure edit/preview seam is re-exported so existing callers (host, CLI,
// tests, page modules importing types) keep a single import surface.
export * from './edits';

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
