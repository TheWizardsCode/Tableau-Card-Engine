/**
 * Reusable write-path guard for the story-line editor.
 *
 * Contract: a content CSV is edited through exactly one module — the core
 * author API (`applyContentEditToFile` in `src/story-line/content/author.ts`).
 * No editor module may open a file-write handle of its own, otherwise that
 * single write path silently dies. This helper statically scans the editor's
 * source roots and reports any fs write/delete call; the consumer then asserts
 * there are none (`assertSingleWritePath`).
 *
 * Two sanctioned writers are exempted from a scan of the **content** roots
 * (they live outside the editor roots anyway): `author.ts`, which owns the
 * content CSV, and `artefacts.ts`, which owns the **generated** Mermaid/JSON
 * artefacts — regenerating a generated file is not a CSV edit path.
 *
 * The scan is **tolerant of the editor modules not existing yet**: an absent
 * root is reported as `skipped` (with the future path), so the guard is green
 * before the feature code lands and meaningful the moment it does.
 *
 * @module
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * The editor's future source roots, repository-relative. Kept central so the
 * guard follows the editor wherever later slices put it.
 */
export const DEFAULT_EDITOR_ROOTS = [
  'src/story-line/editor',
  'tools/storyline-editor',
  'scripts/storyline-editor-cli.ts',
  'scripts/storyline-editor-server.ts',
] as const;

/** One forbidden file-write/delete call found in a scanned module. */
export interface WritePathViolation {
  /** Absolute path of the offending file. */
  readonly file: string;
  /** The matched call (e.g. `writeFileSync`). */
  readonly call: string;
  /** 1-based line number of the call. */
  readonly line: number;
  /** The matching source line, trimmed, for actionable messages. */
  readonly preview: string;
}

/** The result of scanning a set of roots. */
export interface WritePathScan {
  /** Files actually scanned (existing roots only). */
  readonly scanned: readonly string[];
  /** Roots that do not exist yet (editor modules land in later slices). */
  readonly skipped: readonly string[];
  /** Calling-styles matched against {@link forbiddenCalls}. */
  readonly violations: readonly WritePathViolation[];
}

/** FS write/delete call shapes that bypass the transactional author API. */
const FORBIDDEN_WRITE_CALLS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'writeFileSync', pattern: /\bwriteFileSync\s*\(/ },
  { name: 'writeFile', pattern: /\bwriteFile\s*\(/ },
  { name: 'appendFileSync', pattern: /\bappendFileSync\s*\(/ },
  { name: 'appendFile', pattern: /\bappendFile\s*\(/ },
  { name: 'createWriteStream', pattern: /\bcreateWriteStream\s*\(/ },
  { name: 'renameSync', pattern: /\brenameSync\s*\(/ },
  { name: 'rename', pattern: /\brename\s*\(/ },
  { name: 'unlinkSync', pattern: /\bunlinkSync\s*\(/ },
  { name: 'unlink', pattern: /\bunlink\s*\(/ },
  { name: 'rmSync', pattern: /\brmSync\s*\(/ },
  { name: 'rm', pattern: /\brm\s*\(/ },
];

/** Options for {@link scanWritePaths}. */
export interface WritePathScanOptions {
  /** Roots to scan (repository-relative unless absolute). Defaults to the editor roots. */
  readonly roots?: readonly string[];
  /** Extra roots appended to the defaults (used for synthetic negative cases). */
  readonly extraRoots?: readonly string[];
  /** Repository root used to resolve relative roots (defaults to `process.cwd()`). */
  readonly baseDir?: string;
  /**
   * Files to skip, matched by absolute path. The core author module is the
   * single sanctioned writer, so callers scanning it pass the dedicated
   * {@link CONTENT_AUTHOR_MODULE} here.
   */
  readonly exclude?: readonly string[];
}

/** Absolute path of the core author module — the single sanctioned writer. */
export const CONTENT_AUTHOR_MODULE = 'src/story-line/content/author.ts';

/** Absolute path of the generated-artefact writer (mermaid/json, never a CSV). */
export const CONTENT_ARTEFACT_MODULE = 'src/story-line/content/artefacts.ts';

/** Every module allowed to write files (content CSV + generated artefacts). */
export const SANCTIONED_WRITE_MODULES = [
  CONTENT_AUTHOR_MODULE,
  CONTENT_ARTEFACT_MODULE,
] as const;

/** Recursively lists every `.ts` file under a directory. */
function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Scans the given roots for forbidden write/delete calls.
 *
 * @param options Scan options (roots default to the editor roots).
 * @returns The scan result; absent roots are reported under `skipped`, never
 *          treated as a violation.
 */
export function scanWritePaths(
  options: WritePathScanOptions = {},
): WritePathScan {
  const baseDir = options.baseDir ?? process.cwd();
  const roots = [...(options.roots ?? DEFAULT_EDITOR_ROOTS), ...(options.extraRoots ?? [])];
  const exclude = new Set(
    (options.exclude ?? []).map((file) => (isAbsolute(file) ? file : resolve(baseDir, file))),
  );

  const scanned: string[] = [];
  const skipped: string[] = [];
  const violations: WritePathViolation[] = [];

  for (const root of roots) {
    const abs = isAbsolute(root) ? root : resolve(baseDir, root);
    if (!existsSync(abs)) {
      skipped.push(root);
      continue;
    }
    if (statSync(abs).isFile()) {
      if (abs.endsWith('.ts') || abs.endsWith('.tsx')) scanned.push(abs);
      else skipped.push(root);
      continue;
    }
    const files = listTsFiles(abs);
    if (files.length === 0) {
      skipped.push(root);
      continue;
    }
    scanned.push(...files);
  }

  for (const file of scanned) {
    if (exclude.has(file)) continue;
    const source = readFileSync(file, 'utf-8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      const forbidden = FORBIDDEN_WRITE_CALLS.find(({ pattern }) => pattern.test(line));
      if (forbidden) {
        violations.push({
          file,
          call: forbidden.name,
          line: index + 1,
          preview: line.trim(),
        });
      }
    });
  }

  return { scanned, skipped, violations };
}

/**
 * Asserts a scan found no forbidden write calls, throwing a detailed error
 * otherwise.
 *
 * @param scan The scan result.
 * @throws Error listing every violation with file/line/context.
 */
export function assertSingleWritePath(scan: WritePathScan): void {
  if (scan.violations.length === 0) return;
  const detail = scan.violations
    .map((v) => `  ${v.file}:${v.line} — ${v.call} (${v.preview})`)
    .join('\n');
  throw new Error(
    `Single-write-path violation: editor modules must not write files directly; ` +
      `every edit goes through the transactional author API ` +
      `(${CONTENT_AUTHOR_MODULE}).\n${detail}`,
  );
}
