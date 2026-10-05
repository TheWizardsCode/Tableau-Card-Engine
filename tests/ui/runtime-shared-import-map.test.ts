/**
 * Unit tests for the runtime-shared import map
 * (CG-0MUV9Y71Z002W8N2).
 *
 * The import map is what makes dynamically-imported game artifacts playable in
 * the packaged launcher: it maps the bare ESM specifiers an externalised
 * artifact contains (`phaser`, `@core-engine/*`, `@card-system/*`,
 * `@rule-engine/*`, `@ui/*`, `@ai/*`) to stable launcher chunks.
 *
 * These tests cover the pure discovery/mapping logic (no Vite, no browser):
 * determinism, index-alias handling, test-file exclusion, and the coverage
 * check used to verify a real built artifact.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PHASER_ENTRY_NAME,
  PHASER_SPECIFIER,
  SHARED_ENTRY_PREFIX,
  buildImportMap,
  buildImportMapForProject,
  collectBareSpecifiers,
  discoverSharedModules,
  findUnmappedSpecifiers,
  serialiseImportMap,
} from '../../scripts/runtime-shared-import-map';
import { buildRuntimeSharedBuild } from '../../scripts/vite-runtime-shared-plugin';

const repoRoot = path.resolve(__dirname, '..', '..');

let root: string;

function write(relative: string, contents = 'export const x = 1;\n'): void {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf-8');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-shared-map-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('discoverSharedModules', () => {
  it('enumerates engine modules with alias specifiers and stable entry names', () => {
    write('src/core-engine/index.ts');
    write('src/core-engine/SetupOptions.ts');
    write('src/core-engine/transcript/index.ts');
    write('src/core-engine/transcript/Foo.ts');
    write('src/ui/index.ts');
    write('src/ui/PileView.ts');
    write('src/ui/Renderer/index.ts');

    const modules = discoverSharedModules(root);
    const byEntry = Object.fromEntries(
      modules.map((m) => [m.entryName, m.specifiers]),
    );

    expect(byEntry[`${SHARED_ENTRY_PREFIX}/core-engine/index`]).toEqual([
      '@core-engine',
      '@core-engine/index',
    ]);
    expect(byEntry[`${SHARED_ENTRY_PREFIX}/core-engine/SetupOptions`]).toEqual([
      '@core-engine/SetupOptions',
    ]);
    // Directory index is reachable both with and without the trailing `/index`.
    expect(byEntry[`${SHARED_ENTRY_PREFIX}/core-engine/transcript/index`]).toEqual([
      '@core-engine/transcript',
      '@core-engine/transcript/index',
    ]);
    expect(byEntry[`${SHARED_ENTRY_PREFIX}/ui/index`]).toEqual([
      '@ui',
      '@ui/index',
    ]);
    expect(byEntry[`${SHARED_ENTRY_PREFIX}/ui/Renderer/index`]).toEqual([
      '@ui/Renderer',
      '@ui/Renderer/index',
    ]);
    expect(byEntry[`${SHARED_ENTRY_PREFIX}/ui/PileView`]).toEqual([
      '@ui/PileView',
    ]);
  });

  it('excludes tests and declaration files', () => {
    write('src/ui/PileView.ts');
    write('src/ui/PileView.test.ts');
    write('src/ui/Foo.browser.test.ts');
    write('src/ui/types.d.ts');

    const specifiers = discoverSharedModules(root).flatMap((m) => m.specifiers);
    expect(specifiers).toContain('@ui/PileView');
    expect(specifiers).not.toContain('@ui/PileView.test');
    expect(specifiers).not.toContain('@ui/Foo.browser.test');
    expect(specifiers).not.toContain('@ui/types');
  });

  it('ignores alias roots that are not present in the checkout', () => {
    write('src/ui/index.ts');
    const modules = discoverSharedModules(root);
    expect(modules.every((m) => m.alias === '@ui')).toBe(true);
  });
});

describe('buildImportMap', () => {
  it('maps phaser and every engine specifier to a stable chunk URL', () => {
    write('src/ui/index.ts');
    write('src/ui/PileView.ts');

    const map = buildImportMap(discoverSharedModules(root));
    expect(map.imports[PHASER_SPECIFIER]).toBe(`./${PHASER_ENTRY_NAME}.js`);
    expect(map.imports['@ui']).toBe(`./${SHARED_ENTRY_PREFIX}/ui/index.js`);
    expect(map.imports['@ui/PileView']).toBe(
      `./${SHARED_ENTRY_PREFIX}/ui/PileView.js`,
    );
  });

  it('is deterministic across repeated calls', () => {
    write('src/ui/index.ts');
    write('src/ui/PileView.ts');
    write('src/core-engine/index.ts');

    const first = serialiseImportMap(buildImportMap(discoverSharedModules(root)));
    const second = serialiseImportMap(buildImportMap(discoverSharedModules(root)));
    expect(first).toBe(second);
  });

  it('honours a custom base prefix', () => {
    write('src/ui/index.ts');
    const map = buildImportMap(discoverSharedModules(root), '/app/');
    expect(map.imports['@ui']).toBe(`/app/${SHARED_ENTRY_PREFIX}/ui/index.js`);
  });
});

describe('collectBareSpecifiers', () => {
  it('extracts named, default, side-effect, re-export and dynamic specifiers', () => {
    const source = `
      import { a } from "@core-engine/SetupOptions";
      import Phaser from "phaser";
      import "@ui/index";
      export { x } from "@card-system/Deck";
      const mod = await import("@ui/Renderer");
      import local from "./local";
      import http from "https://example.com/mod.js";
    `;

    const specifiers = collectBareSpecifiers(source);
    expect(specifiers).toEqual([
      '@card-system/Deck',
      '@core-engine/SetupOptions',
      '@ui/Renderer',
      '@ui/index',
      'phaser',
    ]);
  });
});

describe('findUnmappedSpecifiers', () => {
  it('reports specifiers absent from the map', () => {
    const map = { imports: { phaser: './phaser.js' } };
    expect(findUnmappedSpecifiers(map, ['phaser', '@core-engine/SetupOptions'])).toEqual([
      '@core-engine/SetupOptions',
    ]);
  });

  it('treats trailing-slash keys as prefix mappings', () => {
    const map = { imports: { '@ui/': './tce-shared/ui/' } };
    expect(findUnmappedSpecifiers(map, ['@ui/PileView'])).toEqual([]);
  });
});

describe('real repository coverage', () => {
  it('maps the deep engine specifiers games emit', () => {
    const map = buildImportMapForProject(repoRoot);
    for (const specifier of [
      'phaser',
      '@core-engine',
      '@core-engine/SetupOptions',
      '@core-engine/transcript',
      '@card-system/Pile',
      '@ai',
      '@ui',
      '@ui/Renderer',
      '@ui/PileView',
      '@ui/screen-layout',
      '@ui/debug/AiDecisionRecorder',
      '@ui/Renderer/adapters/GolfAdapter',
    ]) {
      expect(map.imports[specifier], `missing import-map entry for ${specifier}`).toBeTruthy();
    }
  });
});

describe('buildRuntimeSharedBuild', () => {
  it('contributes the HTML entry, one stable entry per module and the phaser stub', () => {
    const build = buildRuntimeSharedBuild(repoRoot);

    expect(build.input.index).toBe(path.join(repoRoot, 'index.html'));
    expect(build.input[PHASER_ENTRY_NAME]).toBe(
      path.join(repoRoot, 'src/runtime-shared/phaser.js'),
    );
    expect(Object.keys(build.input).length).toBeGreaterThan(100);
    // Every input key is a stable path-derived name (no hashes).
    for (const name of Object.keys(build.input)) {
      if (name === 'index') continue;
      expect(name.startsWith(`${SHARED_ENTRY_PREFIX}/`)).toBe(true);
    }
  });
});
