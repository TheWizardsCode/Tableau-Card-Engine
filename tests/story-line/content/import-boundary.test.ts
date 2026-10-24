/**
 * Import-boundary tests for the story-line content toolkit.
 *
 * The content module must stay loadable by plain `tsx`/Node and must never
 * acquire a game or Phaser dependency — the whole point of the content
 * adapter seam is that core generalises the toolchain while games supply only
 * data. That is a property of the **module graph**, not of a runtime value, so
 * it is asserted by scanning the modules' import specifiers:
 *
 * - every import in `src/story-line/content/**` and in the authoring CLIs is a
 *   relative path or a `node:` builtin (no `phaser`, no game alias, no package
 *   that a game-only toolchain would pull in);
 * - only `author.ts` may import `node:fs` — it is the single content writer.
 *
 * @module
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './test-support';

/** Recursively lists `.ts` files under a directory. */
function listTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTypeScriptFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** Extracts every static `from '…'` import/export specifier in a file. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\bfrom\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

const CONTENT_DIR = join(REPO_ROOT, 'src/story-line/content');
const CONTENT_FILES = listTypeScriptFiles(CONTENT_DIR);
const CLI_FILES = [
  join(REPO_ROOT, 'scripts/storyline-author.ts'),
  join(REPO_ROOT, 'scripts/storyline-graph.ts'),
  join(REPO_ROOT, 'scripts/validate-storylines.ts'),
  join(REPO_ROOT, 'scripts/storyline-cli-support.ts'),
];

describe('story-line content import boundaries', () => {
  it('scans the modules this suite claims to protect', () => {
    expect(CONTENT_FILES.length).toBeGreaterThanOrEqual(6);
    expect(CONTENT_FILES.map((file) => file.split('/').pop())).toEqual(
      expect.arrayContaining([
        'types.ts',
        'csv.ts',
        'manifest.ts',
        'validate.ts',
        'author.ts',
        'adapters.ts',
        'index.ts',
      ]),
    );
  });

  it('imports only relative modules and node builtins (no Phaser, no game repo)', () => {
    const offenders: string[] = [];
    for (const file of [...CONTENT_FILES, ...CLI_FILES]) {
      const source = readFileSync(file, 'utf-8');
      for (const specifier of importSpecifiers(source)) {
        const allowed = specifier.startsWith('.') || specifier.startsWith('node:');
        if (!allowed) offenders.push(`${file} → ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('confines file writing to author.ts (the single content writer)', () => {
    const importFs = CONTENT_FILES.filter(
      (file) =>
        !file.endsWith('/author.ts') &&
        importSpecifiers(readFileSync(file, 'utf-8')).some(
          (specifier) => specifier === 'node:fs',
        ),
    );
    expect(importFs).toEqual([]);

    const authorSource = readFileSync(join(CONTENT_DIR, 'author.ts'), 'utf-8');
    expect(authorSource).toContain('writeFileSync');
    expect(authorSource).toContain('renameSync');
  });
});
