/**
 * Transactional story-line content authoring.
 *
 * This module is the **only writer** of story-line content CSVs in the engine.
 * Every edit follows the same transaction:
 *
 * 1. parse the current content;
 * 2. apply the mutation to an in-memory copy (see {@link ../mutate} — the
 *    pure half of this seam, Node-free);
 * 3. validate the resulting content with {@link validateContentCsv};
 * 4. only when validation passes, write the file atomically
 *    (temp file + rename in the same directory);
 * 5. on validation failure, return the errors and leave the file untouched.
 *
 * `--dry-run` support is part of the API (`dryRun`): the candidate text is
 * returned for preview but nothing is written.
 *
 * The pure in-memory mutations (`addContentCard`, `updateContentCard`,
 * `updateContentCards`, `readContentCards`, `hasContentCard` and their
 * result/spec types) live in {@link ../mutate} and are re-exported here so
 * existing callers keep one import surface — but a browser or form pipeline
 * that only needs preview/validation should import the pure module directly,
 * never this one (it binds `node:fs`).
 *
 * The module is Phaser-free and game-import-free: every game-specific detail
 * arrives through the {@link ContentAdapter}.
 *
 * @module
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import { computeContentChecksum } from './csv';
import { type ContentAdapter } from './types';
import { validateContentCsv } from './validate';
import type { ContentEditResult, ContentMutation } from './mutate';

export type {
  AddContentCardSpec,
  ContentEditResult,
  ContentMutation,
  UpdateContentCardSpec,
} from './mutate';
export {
  addContentCard,
  hasContentCard,
  readContentCards,
  updateContentCard,
  updateContentCards,
} from './mutate';

// ── File writer (the only content writer) ───────────────────

/** The outcome of a file-level content edit. */
export interface ContentFileEditResult extends ContentEditResult {
  /** The content path the edit targeted (absolute or caller-supplied). */
  readonly path: string;
  /** True only when the file was actually written. */
  readonly written: boolean;
  /**
   * True when the writer refused the edit because the file's checksum no
   * longer matches the caller's `expectedChecksum` (concurrency guard).
   */
  readonly stale?: boolean;
  /** True when the caller must reload the content before retrying. */
  readonly reloadRequired?: boolean;
}

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
  /**
   * Concurrency guard: the content checksum captured when the caller loaded
   * the file. When the file on disk does not match, the writer refuses (no
   * write) and returns `stale`/`reloadRequired` so the caller can instruct a
   * reload instead of clobbering a concurrent edit. Reuses the single
   * checksum implementation from the content model.
   */
  readonly expectedChecksum?: string;
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
  const { contentPath, adapter, mutate, dryRun = false, expectedChecksum } = options;
  const original = readFileSync(contentPath, 'utf-8');

  // ── Concurrency guard (before any mutation, on the writer's own read): ──
  // the caller loaded a snapshot; if the file moved on since, an edit would
  // silently clobber someone else's change. Refuse instead, and instruct a
  // reload. Reuses computeContentChecksum — there is no second hash.
  if (expectedChecksum !== undefined) {
    const actual = computeContentChecksum(original);
    if (actual !== expectedChecksum) {
      return {
        csv: original,
        ok: false,
        errors: [
          `content changed on disk since load (checksum ${actual} ≠ expected ${expectedChecksum}) — ` +
            'reload the editor and retry your edit',
        ],
        path: contentPath,
        written: false,
        stale: true,
        reloadRequired: true,
      };
    }
  }

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

