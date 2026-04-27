import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('does not recursively delete the tracked Main Street asset directory in tests', () => {
    const thumbnailE2e = readFileSync(
      join(process.cwd(), 'tests', 'e2e', 'generate-thumbnail.main-street.test.ts'),
      'utf8',
    );

    expect(thumbnailE2e).not.toContain("rmSync(join(ROOT, 'public', 'assets', 'games', 'main-street')");
  });
});
