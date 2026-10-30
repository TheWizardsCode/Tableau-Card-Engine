/**
 * Teeth tests for the static import-graph check on the node-safe `src/ui`
 * surface (CG-0MVS9HBN3009HIQN; contract slice CG-0MVTVSYQE002JGDN).
 *
 * The manifest (`src/ui/node-safe-modules.ts`) is a promise: every listed
 * module is importable in a plain Node environment — no `window`, no Phaser
 * evaluation. This suite defines, through hermetic fixture trees built in a
 * temp directory, the exact contract that promise is enforced against, so the
 * check is proven to have teeth before it is relied upon:
 *
 *   (a) a clean manifest exits 0;
 *   (b) a value `import Phaser from 'phaser'` fails, naming the offending
 *       module and the offending specifier;
 *   (c) a transitive failure through a `tsconfig.json` path alias
 *       (`@ui/*`, `@core-engine/*`) fails and reports the full chain — as do
 *       `export * from` and dynamic `import()` edges;
 *   (d) a **type-only** Phaser edge passes (type-only edges are elided at
 *       compile time), with a negative control proving that rule is not
 *       vacuous;
 *   (e) an unresolvable local or alias specifier fails closed (never a silent
 *       skip);
 *   (f) a listed module that does not exist — or an unparseable manifest —
 *       fails;
 *   (g) the real repository manifest passes (a live regression gate).
 *
 * Every fixture is written into a fresh `mkdtemp` tree and passed to the check
 * through its `--root` / `--manifest` overrides, so nothing can drift out of
 * sync with a checked-in fixture. No network, no bundler, no nested Vitest:
 * the check is pure TypeScript-compiler static analysis over the fixture
 * files, and the CLI is invoked in-process through its injectable output sink.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  formatViolation,
  runCheck,
  runCli,
  type CheckResult,
} from '../../scripts/check-ui-node-surface';
import { uiNodeSafeModules } from '../../src/ui/node-safe-modules';

// ── Hermetic fixture helpers ───────────────────────────────────

/**
 * A fixture `tsconfig.json` mirroring the repository's alias shape, so the
 * alias-resolution cases exercise the same `paths` mechanism as the real
 * build (`vite.config.ts` / `tsconfig.json`).
 */
const FIXTURE_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      resolveJsonModule: true,
      baseUrl: '.',
      paths: {
        '@core-engine': ['src/core-engine'],
        '@core-engine/*': ['src/core-engine/*'],
        '@ui': ['src/ui'],
        '@ui/*': ['src/ui/*'],
      },
    },
  },
  null,
  2,
);

/** Manifest file shape used by the fixture trees (same as the real one). */
function manifestOf(...entries: string[]): string {
  return `export const uiNodeSafeModules = [\n${entries
    .map((entry) => `  '${entry}',`)
    .join('\n')}\n] as const;\n`;
}

const createdRoots: string[] = [];

/** Build a temp tree from a `relative path -> contents` map and return its root. */
function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ui-node-surface-'));
  createdRoots.push(root);
  const allFiles: Record<string, string> = {
    'tsconfig.json': FIXTURE_TSCONFIG,
    ...files,
  };
  for (const [relativePath, contents] of Object.entries(allFiles)) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  }
  return root;
}

/** Run the check CLI against a fixture root, capturing exit code and output. */
function runFixture(
  root: string,
  args: string[] = [],
): { code: number; output: string } {
  const chunks: string[] = [];
  const code = runCli(['--root', root, ...args], {
    write: (text: string) => chunks.push(text),
  });
  return { code, output: chunks.join('') };
}

/** Run the check as an API call against a fixture root. */
function checkFixture(root: string, args: string[] = []): CheckResult {
  const manifestIndex = args.indexOf('--manifest');
  return runCheck({
    root,
    manifestPath:
      manifestIndex >= 0
        ? path.resolve(root, args[manifestIndex + 1])
        : path.join(root, 'src', 'ui', 'node-safe-modules.ts'),
  });
}

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── (a) a clean manifest exits 0 ───────────────────────────────

describe('(a) clean manifest', () => {
  it('exits 0 and reports no violations when every listed module is Phaser-free', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('clean'),
      'src/ui/clean.ts':
        "import { helper } from './helper';\nexport const value = helper();\n",
      'src/ui/helper.ts': 'export function helper(): number {\n  return 1;\n}\n',
    });

    const result = checkFixture(root);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.modules).toEqual(['clean']);

    const { code, output } = runFixture(root);
    expect(code).toBe(0);
    expect(output).not.toContain('clean:');
  });

  it('emits machine-readable JSON on `--json`', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('clean'),
      'src/ui/clean.ts': 'export const value = 1;\n',
    });

    const { code, output } = runFixture(root, ['--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(output) as CheckResult;
    expect(parsed.ok).toBe(true);
    expect(parsed.violations).toEqual([]);
    expect(parsed.modules).toEqual(['clean']);
  });
});

// ── (b) value Phaser import fails, naming the offender ────────

describe('(b) value Phaser import', () => {
  it('exits non-zero and names the offending module and specifier', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('needsPhaser'),
      'src/ui/needsPhaser.ts':
        "import Phaser from 'phaser';\nexport const version = Phaser.VERSION;\n",
    });

    const { code, output } = runFixture(root);
    expect(code).not.toBe(0);
    expect(output).toContain('src/ui/needsPhaser.ts');
    expect(output).toContain('phaser');

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.module).toBe('needsPhaser');
    expect(result.violations[0]?.reason).toBe('phaser-value-import');
    // The full offending chain: listed module -> the Phaser specifier.
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/needsPhaser.ts',
      'phaser',
    ]);
  });

  it('also fails for a side-effect Phaser import', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('sideEffect'),
      'src/ui/sideEffect.ts': "import 'phaser';\nexport const value = 1;\n",
    });

    const { code, output } = runFixture(root);
    expect(code).not.toBe(0);
    expect(output).toContain('src/ui/sideEffect.ts');
    expect(output).toContain('phaser');
  });
});

// ── (c) transitive failures through path aliases ──────────────

describe('(c) transitive failure through a path alias', () => {
  it('follows `@ui/*` and reports the whole chain (module → module → phaser)', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts':
        "import { createThing } from '@ui/thing';\nexport const value = createThing();\n",
      'src/ui/thing.ts':
        "import { deeper } from '@core-engine/deeper';\nexport function createThing(): string {\n  return deeper();\n}\n",
      'src/core-engine/deeper.ts':
        "import Phaser from 'phaser';\nexport function deeper(): string {\n  return Phaser.VERSION;\n}\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      'src/ui/thing.ts',
      'src/core-engine/deeper.ts',
      'phaser',
    ]);

    const { code, output } = runFixture(root);
    expect(code).not.toBe(0);
    expect(output).toContain(
      'src/ui/entry.ts → src/ui/thing.ts → src/core-engine/deeper.ts → phaser',
    );
  });

  it('follows a bare `@core-engine` alias edge', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts':
        "import { ENGINE_VERSION } from '@core-engine';\nexport const value = ENGINE_VERSION;\n",
      'src/core-engine/index.ts':
        "import { banner } from './banner';\nexport const ENGINE_VERSION = banner();\n",
      'src/core-engine/banner.ts':
        "import { Scene } from 'phaser';\nexport function banner(): string {\n  return new Scene({ key: 'x' }).sys.settings.key;\n}\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      'src/core-engine/index.ts',
      'src/core-engine/banner.ts',
      'phaser',
    ]);
  });

  it('follows `export * from` re-exports', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts': "export * from './renderer';\n",
      'src/ui/renderer.ts':
        "import Phaser from 'phaser';\nexport const rect = new Phaser.Geom.Rectangle(0, 0, 1, 1);\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      'src/ui/renderer.ts',
      'phaser',
    ]);
  });

  it('follows dynamic `import()` edges', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts':
        "export async function load(): Promise<unknown> {\n  return import('./lazy');\n}\n",
      'src/ui/lazy.ts':
        "import Phaser from 'phaser';\nexport const version = Phaser.VERSION;\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      'src/ui/lazy.ts',
      'phaser',
    ]);
  });
});

// ── (d) type-only edges are elided ────────────────────────────

describe('(d) type-only Phaser edges', () => {
  const TYPE_ONLY_TREE = {
    'src/ui/node-safe-modules.ts': manifestOf('entry'),
    // Every shape of type-only edge: `import type`, inline `{ type X }`,
    // `export type { … } from`, and a type-only alias import.
    'src/ui/entry.ts': [
      "import type Phaser from 'phaser';",
      "import { type Scene } from 'phaser';",
      "import type { Model } from '@core-engine/model';",
      "export type { Diff } from './renderer';",
      'export function describe(value: Phaser.Scene | Scene, model: Model): string {',
      '  return `${String(value)}${String(model)}`;',
      '}',
      '',
    ].join('\n'),
    'src/ui/renderer.ts':
      "import Phaser from 'phaser';\nexport interface Diff {\n  rect: Phaser.Geom.Rectangle;\n}\n",
    'src/core-engine/model.ts':
      "import Phaser from 'phaser';\nexport interface Model {\n  scene: Phaser.Scene;\n}\n",
  };

  it('passes when every Phaser edge is type-only', () => {
    const root = makeTree(TYPE_ONLY_TREE);

    const result = checkFixture(root);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(runFixture(root).code).toBe(0);
  });

  it('negative control: the same graph fails once one edge is a value edge', () => {
    const root = makeTree({
      ...TYPE_ONLY_TREE,
      // `export { Diff } from` — a *value* re-export, so the Phaser-bearing
      // module is now evaluated and the type-only exemption must not fire.
      'src/ui/entry.ts': [
        "import type Phaser from 'phaser';",
        "export { Diff } from './renderer';",
        'export function describe(value: Phaser.Scene): string {',
        '  return String(value);',
        '}',
        '',
      ].join('\n'),
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      'src/ui/renderer.ts',
      'phaser',
    ]);
  });
});

// ── (e) unresolvable specifiers fail closed ───────────────────

describe('(e) unresolvable specifiers fail closed', () => {
  it('fails when a listed module imports a missing local file', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts':
        "import { gone } from './does-not-exist';\nexport const value = gone;\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toBe('unresolvable-local-import');
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      './does-not-exist',
    ]);

    const { code, output } = runFixture(root);
    expect(code).not.toBe(0);
    expect(output).toContain('./does-not-exist');
  });

  it('fails when a listed module imports a missing alias target', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts':
        "import { gone } from '@ui/DoesNotExist';\nexport const value = gone;\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toBe('unresolvable-alias-import');
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      '@ui/DoesNotExist',
    ]);
  });

  it('fails when a transitive local edge is unresolvable', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('entry'),
      'src/ui/entry.ts':
        "import { middle } from './middle';\nexport const value = middle;\n",
      'src/ui/middle.ts':
        "import { gone } from './missing-deep';\nexport const middle = gone;\n",
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.chain).toEqual([
      'src/ui/entry.ts',
      'src/ui/middle.ts',
      './missing-deep',
    ]);
  });
});

// ── (f) missing listed module / unparseable manifest ─────────

describe('(f) structural manifest failures', () => {
  it('fails when a listed module does not exist', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('present', 'ghost'),
      'src/ui/present.ts': 'export const value = 1;\n',
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.module).toBe('ghost');
    expect(result.violations[0]?.reason).toBe('missing-module');
    expect(result.violations[0]?.chain).toEqual(['src/ui/ghost.ts']);

    const { code, output } = runFixture(root);
    expect(code).not.toBe(0);
    expect(output).toContain('ghost');
  });

  it('fails closed on a manifest whose entry list cannot be read statically', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts':
        "const entries = ['present'];\nexport const uiNodeSafeModules = [...entries];\n",
      'src/ui/present.ts': 'export const value = 1;\n',
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toBe('unparseable-manifest');
    expect(runFixture(root).code).not.toBe(0);
  });

  it('fails closed on a manifest file that is not parseable TypeScript', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': 'export const uiNodeSafeModules = [ ;;;\n',
    });

    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toBe('unparseable-manifest');
  });

  it('fails closed when the manifest file itself is missing', () => {
    const root = makeTree({});
    const result = checkFixture(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.reason).toBe('unparseable-manifest');
  });
});

// ── (g) the real repository manifest is green ────────────────

describe('(g) real repository manifest (live regression gate)', () => {
  it('passes for every entry in src/ui/node-safe-modules.ts', () => {
    const chunks: string[] = [];
    // No --root / --manifest: the check's defaults are the real repository.
    const code = runCli(['--json'], {
      write: (text: string) => chunks.push(text),
    });

    const result = JSON.parse(chunks.join('')) as CheckResult;
    expect(result.violations.map(formatViolation)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(code).toBe(0);
    expect(result.modules).toEqual([...uiNodeSafeModules]);
  });
});

// ── CLI contract details ─────────────────────────────────────

describe('CLI contract', () => {
  it('rejects an unknown flag with the usage exit code (2)', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('present'),
      'src/ui/present.ts': 'export const value = 1;\n',
    });

    const chunks: string[] = [];
    const code = runCli(['--root', root, '--nonsense'], {
      write: (text: string) => chunks.push(text),
    });
    expect(code).toBe(2);
    expect(chunks.join('')).toContain('--nonsense');
  });

  it('honours a `--manifest` override', () => {
    const root = makeTree({
      'src/ui/node-safe-modules.ts': manifestOf('present'),
      'src/ui/present.ts': 'export const value = 1;\n',
      'other-manifest.ts': manifestOf('needsPhaser'),
      'src/ui/needsPhaser.ts':
        "import Phaser from 'phaser';\nexport const version = Phaser.VERSION;\n",
    });

    // Default manifest is clean; the override is not.
    expect(runFixture(root).code).toBe(0);
    const overridden = runFixture(root, ['--manifest', 'other-manifest.ts']);
    expect(overridden.code).not.toBe(0);
    expect(overridden.output).toContain('needsPhaser');
  });
});
