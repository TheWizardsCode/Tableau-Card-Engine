/**
 * Shared fixture helpers for the story-line editor tests.
 *
 * The editor edits a game's content CSV and regenerates the manifest/Mermaid
 * artefacts, so every edit test must run against **copies** in an isolated
 * temp directory — never against the committed files. All source paths here
 * derive from the generator's own exported defaults (`DEFAULT_CONTENT_PATH`,
 * `DEFAULT_GRAPH_OUTPUTS`, `DEFAULT_MANIFEST_SCHEMA_PATH`) rather than
 * hard-coded strings: if an artefact or the schema moves, the derived path
 * stops resolving and the tests fail loudly instead of silently copying a
 * stale file into the fixture.
 *
 * The copied filenames keep their source basenames, so an artefact rename is
 * likewise surfaced by an existence assertion in the test suite.
 *
 * @module
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CONTENT_PATH } from '../../../src/story-line/content/adapters';
import { DEFAULT_MANIFEST_SCHEMA_PATH } from '../../../src/story-line/content';
import { DEFAULT_GRAPH_OUTPUTS } from '../../../scripts/storyline-graph';

/** Absolute path of the repository root (this file lives three levels down). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Resolved path of the committed default (Gym) content CSV. */
export const CONTENT_CSV_PATH = resolve(REPO_ROOT, DEFAULT_CONTENT_PATH);

/** Resolved path of the committed manifest artefact. */
export const MANIFEST_ARTEFACT_PATH = resolve(REPO_ROOT, DEFAULT_GRAPH_OUTPUTS.json);

/** Resolved path of the committed Mermaid artefact. */
export const MERMAID_ARTEFACT_PATH = resolve(REPO_ROOT, DEFAULT_GRAPH_OUTPUTS.mermaid);

/** Resolved path of the generic manifest JSON schema. */
export const MANIFEST_SCHEMA_PATH = resolve(REPO_ROOT, DEFAULT_MANIFEST_SCHEMA_PATH);

/**
 * An isolated copy of the editor's content + artefact files.
 *
 * The returned paths always point **outside** the repository, so an edit test
 * can mutate them freely and the committed originals stay byte-identical.
 */
export interface EditorFixtureFiles {
  /** The isolated temp directory holding the copies. */
  readonly dir: string;
  /** Temp copy of the content CSV. */
  readonly csvPath: string;
  /** Temp copy of the manifest artefact. */
  readonly manifestPath: string;
  /** Temp copy of the Mermaid artefact. */
  readonly mermaidPath: string;
  /** Removes the temp directory (call in `afterEach`/`finally`). */
  cleanup(): void;
}

/**
 * Copies the committed content CSV and generated artefacts into a fresh temp
 * directory, keeping each copy's source filename.
 *
 * @returns The copy paths plus a cleanup function.
 */
export function copyEditorFixtureFiles(): EditorFixtureFiles {
  const dir = mkdtempSync(join(tmpdir(), 'tce-editor-fixtures-'));
  const csvPath = join(dir, basename(CONTENT_CSV_PATH));
  const manifestPath = join(dir, basename(MANIFEST_ARTEFACT_PATH));
  const mermaidPath = join(dir, basename(MERMAID_ARTEFACT_PATH));

  copyFileSync(CONTENT_CSV_PATH, csvPath);
  copyFileSync(MANIFEST_ARTEFACT_PATH, manifestPath);
  copyFileSync(MERMAID_ARTEFACT_PATH, mermaidPath);

  return {
    dir,
    csvPath,
    manifestPath,
    mermaidPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
