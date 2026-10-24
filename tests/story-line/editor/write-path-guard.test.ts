/**
 * Tests for the story-line editor write-path guard.
 *
 * The guard encodes the epic's single-write-path constraint: only the core
 * author module may write content files; every editor module must route edits
 * through it. It must be green while the editor does not exist yet (later
 * slices), and it must actually catch a direct writer — proven here with a
 * synthetic negative case rather than by waiting for a real one to ship.
 *
 * @module
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONTENT_AUTHOR_MODULE,
  DEFAULT_EDITOR_ROOTS,
  assertSingleWritePath,
  scanWritePaths,
} from './write-path-guard';
import { REPO_ROOT } from './fixtures';

describe('story-line editor write-path guard', () => {
  it('is green while the editor modules do not exist yet (tolerant, nothing silently dropped)', () => {
    const scan = scanWritePaths({
      baseDir: REPO_ROOT,
      // Pin the roots to the documented editor locations so this assertion
      // stays meaningful once feature code lands.
      roots: DEFAULT_EDITOR_ROOTS,
    });

    expect(scan.violations).toEqual([]);
    expect(() => assertSingleWritePath(scan)).not.toThrow();

    // Every root is accounted for individually: absent roots are reported as
    // skipped (never silently dropped), and once a root exists its files are
    // scanned for violations.
    for (const root of DEFAULT_EDITOR_ROOTS) {
      const rootScan = scanWritePaths({ baseDir: REPO_ROOT, roots: [root] });
      expect(rootScan.violations).toEqual([]);
      if (rootScan.skipped.length === 1) {
        expect(rootScan.scanned).toEqual([]);
      } else {
        expect(rootScan.scanned.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('passes on the shipped content modules when the author module is exempted', () => {
    // The single-write-path property already holds for the generalised
    // toolchain: only author.ts writes, so scanning everything else is clean.
    const scan = scanWritePaths({
      baseDir: REPO_ROOT,
      roots: ['src/story-line/content'],
      exclude: [CONTENT_AUTHOR_MODULE],
    });

    expect(scan.scanned.length).toBeGreaterThanOrEqual(6);
    expect(scan.violations).toEqual([]);
    expect(() => assertSingleWritePath(scan)).not.toThrow();
  });

  it('detects a synthetic editor module that writes the content CSV directly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tce-editor-write-guard-'));
    try {
      const offender = join(dir, 'fake-editor.ts');
      writeFileSync(
        offender,
        [
          "import { writeFileSync } from 'node:fs';",
          "import { join } from 'node:path';",
          '',
          'export function saveCsv(csvPath: string, csv: string): void {',
          "  const direct = join(csvPath, 'storylines.csv');",
          '  writeFileSync(direct, csv, "utf-8");',
          '}',
          '',
        ].join('\n'),
        'utf-8',
      );
      // A clean sibling module in the same root must not be reported.
      writeFileSync(
        join(dir, 'clean-editor.ts'),
        'export function preview(csv: string): string { return csv.trim(); }\n',
        'utf-8',
      );

      const scan = scanWritePaths({ baseDir: dir, roots: ['.'] });

      expect(scan.scanned).toHaveLength(2);
      expect(scan.violations).toHaveLength(1);
      expect(scan.violations[0]).toMatchObject({
        file: offender,
        call: 'writeFileSync',
        line: 6,
      });
      expect(() => assertSingleWritePath(scan)).toThrow(/Single-write-path violation/);
      expect(() => assertSingleWritePath(scan)).toThrow(/writeFileSync/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
