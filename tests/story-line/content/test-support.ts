/**
 * Shared helpers for the story-line content test-suite.
 *
 * Paths are resolved from this file's location rather than `process.cwd()` so
 * the tests behave identically no matter where Vitest is invoked from.
 *
 * @module
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root (this file lives three levels down). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Absolute path of the story-line content fixtures directory. */
export const FIXTURES_DIR = join(REPO_ROOT, 'tests/fixtures/story-line');

/** Absolute path of the shipped Gym story-line content. */
export const GYM_CONTENT_PATH = join(REPO_ROOT, 'example-games/gym/data/storylines.csv');

/** Absolute path of the committed Gym manifest artefact. */
export const GYM_MANIFEST_PATH = join(REPO_ROOT, 'example-games/gym/data/storyline-manifest.json');

/** Absolute path of the committed Gym Mermaid artefact. */
export const GYM_MERMAID_PATH = join(REPO_ROOT, 'example-games/gym/data/storyline-graph.mmd');

/** Absolute path of the generic manifest JSON schema. */
export const MANIFEST_SCHEMA_PATH = join(REPO_ROOT, 'schemas/story-line-manifest.schema.json');

/** Reads a UTF-8 file. */
export function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Reads a named fixture CSV. */
export function readFixture(name: string): string {
  return readText(join(FIXTURES_DIR, name));
}

/** Absolute path of a named fixture CSV. */
export function fixturePath(name: string): string {
  return join(FIXTURES_DIR, name);
}

/** A temp directory plus a cleanup function (call in `afterEach`/`finally`). */
export interface TempDir {
  readonly path: string;
  cleanup(): void;
}

/** Creates a throwaway directory for file-writing tests. */
export function makeTempDir(): TempDir {
  const path = mkdtempSync(join(tmpdir(), 'tce-storyline-content-'));
  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

/**
 * Captures everything written to `process.stdout` / `process.stderr` while
 * `fn` runs, restoring the real streams afterwards.
 *
 * The CLIs write to the process streams by design (they are CLI entry
 * points), so tests drive them through this helper instead of a subprocess
 * whenever only the exit code and report text matter.
 */
export function captureOutput(fn: () => number): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}
