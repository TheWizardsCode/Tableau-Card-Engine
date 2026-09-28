import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Recursively list every file under *dir*. */
function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

describe('test workflow safety', () => {
  it('does not run a pretest script that targets Main Street SVG source assets', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> };

    const pretest = packageJson.scripts?.pretest ?? '';

    // Guard against reintroducing destructive test hooks that touch canonical SVG sources.
    expect(pretest).not.toContain('public/assets/games/main-street/svg');
    expect(pretest).not.toContain('git restore');
  });

  it('never recursively deletes the shared public asset tree from a test', () => {
    // The Main Street thumbnail E2E that once did this is game-owned and now
    // lives in the `tce-main-street` repo (Option A); this launcher-wide guard
    // catches a reintroduction anywhere in the remaining test tree. A static
    // scan is the pragmatic guard for a destructive filesystem operation.
    const root = join(process.cwd(), 'tests');
    const offenders = walk(root).filter((file) => {
      if (!file.endsWith('.test.ts')) return false;
      // Skip this guard: it necessarily contains the pattern it scans for.
      if (file.endsWith('test-workflow-safety.test.ts')) return false;
      const src = readFileSync(file, 'utf8');
      return src.includes(
        "rmSync(join(ROOT, 'public', 'assets', 'games', 'main-street'",
      );
    });
    expect(offenders).toEqual([]);
  });
});
