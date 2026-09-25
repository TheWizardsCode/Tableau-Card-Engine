/**
 * Unit tests for the deep-relative → alias codemod (F9 / C2 /
 * CG-0MUH0P1WC0029Q44).
 *
 * Two layers:
 *   - pure `rewriteSource` behaviour (mapping, non-matches, idempotency), and
 *   - the committed-tree guard: game source and game tests must contain **no**
 *     `../../src/**` engine specifier (AC2), and the guard must actually fail
 *     on a deliberately introduced one (AC4).
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALIAS_RULES,
  GAME_NAMES,
  codemod,
  rewriteSource,
} from '../../scripts/codemod-src-imports';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('rewriteSource', () => {
  it('maps each engine src/ tree to its alias', () => {
    const cases: Array<[string, string]> = [
      ["import x from '../../../src/core-engine/SoundManager';", "import x from '@core-engine/SoundManager';"],
      ["import x from '../../src/card-system/Card';", "import x from '@card-system/Card';"],
      ["import x from '../../src/rule-engine';", "import x from '@rule-engine';"],
      ["import x from '../../../src/ui';", "import x from '@ui';"],
      ["import x from '../../src/ai';", "import x from '@ai';"],
      ["import x from '../../../src/balance-cards';", "import x from '@balance-cards';"],
    ];
    for (const [input, expected] of cases) {
      const { source, rewrites } = rewriteSource(input);
      expect(source, input).toBe(expected);
      expect(rewrites, input).toBe(1);
    }
  });

  it('maps the core-framework trees to the new core aliases', () => {
    expect(
      rewriteSource("import type { ReplayAdapter } from '../../../../scripts/adapters/ReplayAdapter';"),
    ).toMatchObject({
      source: "import type { ReplayAdapter } from '@core-scripts/adapters/ReplayAdapter';",
      rewrites: 1,
    });
    expect(
      rewriteSource("import { waitForScene } from '../helpers/waitForScene';"),
    ).toMatchObject({
      source: "import { waitForScene } from '@core-tests/helpers/waitForScene';",
      rewrites: 1,
    });
  });

  it('rewrites dynamic import() specifiers too', () => {
    expect(
      rewriteSource("const m = await import('../../src/ui/overlays');"),
    ).toMatchObject({
      source: "const m = await import('@ui/overlays');",
      rewrites: 1,
    });
  });

  it('leaves intra-game, json and non-alias relative specifiers untouched', () => {
    const input = [
      "import { GolfRules } from './GolfRules';",
      "import layout from '../layouts/golf.layout.json';",
      "import { GolfGame } from '../../example-games/golf/GolfGame';",
      "import { createSeededRng } from '@core-engine/index';",
    ].join('\n');
    const { source, rewrites, unmatched } = rewriteSource(input);
    expect(source).toBe(input);
    expect(rewrites).toBe(0);
    expect(unmatched).toEqual([]);
  });

  it('is idempotent', () => {
    const input = "import x from '../../../src/ui';\nimport y from '../../src/ai';";
    const once = rewriteSource(input).source;
    const twice = rewriteSource(once);
    expect(twice.source).toBe(once);
    expect(twice.rewrites).toBe(0);
  });

  it('exposes one rule per supported alias target', () => {
    expect(ALIAS_RULES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('committed-tree guard (AC2 / AC4)', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeFixture(dir: string, rel: string, contents: string): void {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents, 'utf-8');
  }

  it('finds zero deep-relative engine imports in game source and tests', () => {
    const result = codemod(REPO_ROOT);
    const offenders = result.files.map((f) => `${f.file} (${f.rewrites})`).join('\n');
    expect(result.totalRewrites, offenders).toBe(0);
    // Every relative engine specifier must be one the codemod knows how to map.
    expect(result.unmatched).toEqual([]);
  });

  it('detects a deliberately introduced deep-relative engine import', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-guard-'));
    tempDirs.push(dir);
    writeFixture(
      dir,
      'example-games/golf/scenes/Injected.ts',
      "import { Card } from '../../../../src/card-system/Card';\n",
    );
    writeFixture(dir, 'tests/golf/injected.test.ts', "import x from '../../src/ui';\n");

    const result = codemod(dir, { games: ['golf'] });
    expect(result.totalRewrites).toBe(2);
    expect(result.files.map((f) => f.file).sort()).toEqual([
      path.join('example-games', 'golf', 'scenes', 'Injected.ts'),
      path.join('tests', 'golf', 'injected.test.ts'),
    ]);
  });

  it('covers exactly the eight per-game repositories', () => {
    expect([...GAME_NAMES].sort()).toEqual([
      'beleaguered-castle',
      'blackjack',
      'coloretto',
      'feudalism',
      'golf',
      'lost-cities',
      'main-street',
      'sushi-go',
    ]);
  });
});
