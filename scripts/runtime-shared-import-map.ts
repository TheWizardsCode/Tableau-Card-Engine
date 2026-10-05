/**
 * Runtime game plugin shared-dependency resolution
 * (CG-0MUV9Y71Z002W8N2, feature of epic CG-0MTRO7VMI000F3A5).
 *
 * Runtime game artifacts are built with Vite library mode and externalise
 * `phaser` and the engine aliases (`@core-engine/*`, `@card-system/*`,
 * `@rule-engine/*`, `@ui/*`, `@ai/*`) so they never bundle a second copy of
 * the engine (see `scripts/build-game-artifact.mjs`). The emitted `entry.js`
 * therefore contains **bare ESM specifiers** such as
 * `import { resolveSetupOptions } from "@core-engine/SetupOptions"`.
 *
 * A plain browser/Electron renderer has no resolver for bare specifiers. This
 * module derives a browser **import map** that maps every engine module (and
 * `phaser`) to a stable launcher chunk emitted by
 * `scripts/vite-runtime-shared-plugin.ts`:
 *
 * ```jsonc
 * {
 *   "imports": {
 *     "phaser": "./tce-shared/phaser.js",
 *     "@core-engine/SetupOptions": "./tce-shared/core-engine/SetupOptions.js",
 *     "@ui/Renderer": "./tce-shared/ui/Renderer/index.js",
 *     // …one entry per engine module…
 *   }
 * }
 * ```
 *
 * The map is **derived from the launcher's own source tree**, so it is
 * deterministic across builds: chunk names are the module paths (never
 * content hashes) and every specifier is enumerated, not guessed.
 *
 * The pure discovery/mapping logic lives here (no Vite dependency) so it is
 * unit-testable without a browser or a build — see
 * `tests/ui/runtime-shared-import-map.test.ts`.
 *
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 */

import fs from 'node:fs';
import path from 'node:path';

/** The alias roots whose modules are externalised by the artifact builder. */
export const SHARED_IMPORT_ROOTS = [
  { alias: '@core-engine', dir: 'src/core-engine' },
  { alias: '@card-system', dir: 'src/card-system' },
  { alias: '@rule-engine', dir: 'src/rule-engine' },
  { alias: '@ai', dir: 'src/ai' },
  { alias: '@ui', dir: 'src/ui' },
] as const;

/** Stable output directory (under the Vite `base`) for the shared chunks. */
export const SHARED_ENTRY_PREFIX = 'tce-shared';

/** The Phaser specifier externalised by artifacts. */
export const PHASER_SPECIFIER = 'phaser';

/** Stable entry name of the launcher chunk that re-exports Phaser. */
export const PHASER_ENTRY_NAME = `${SHARED_ENTRY_PREFIX}/phaser`;

/** Source (relative to the repo root) of the Phaser re-export stub. */
export const PHASER_STUB_PATH = 'src/runtime-shared/phaser.js';

/** File extensions treated as importable engine modules. */
const MODULE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);

/** A single engine module the import map exposes to runtime artifacts. */
export interface SharedModule {
  /** The alias root, e.g. `@core-engine` or `@ui`. */
  readonly alias: string;
  /**
   * Every bare specifier that resolves to this module. A directory index has
   * two (`@ui/Renderer` and `@ui/Renderer/index`); the alias root itself also
   * gets `@core-engine` and `@core-engine/index`.
   */
  readonly specifiers: string[];
  /** Absolute path to the module source file. */
  readonly sourceFile: string;
  /** Stable Rollup entry name / output path without extension. */
  readonly entryName: string;
}

/** A browser import map (the `imports` block of a `<script type="importmap">`). */
export interface ImportMapDocument {
  readonly imports: Record<string, string>;
}

/** True when *file* is a test/declaration file that must not be exposed. */
function isTestOrDeclaration(file: string): boolean {
  const base = path.basename(file);
  return (
    base.endsWith('.d.ts') ||
    base.endsWith('.d.mts') ||
    base.includes('.test.') ||
    base.includes('.spec.') ||
    base.includes('.browser.test.')
  );
}

/** Recursively collect importable module files under *dir*. */
function collectModuleFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
      out.push(...collectModuleFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (isTestOrDeclaration(full)) continue;
    if (!MODULE_EXTENSIONS.has(path.extname(full))) continue;
    out.push(full);
  }
  return out;
}

/**
 * Enumerate every engine module reachable by a bare alias specifier.
 *
 * @param projectRoot Absolute path to the core checkout root.
 * @returns Shared modules sorted by entry name (deterministic).
 */
export function discoverSharedModules(projectRoot: string): SharedModule[] {
  const modules: SharedModule[] = [];

  for (const { alias, dir } of SHARED_IMPORT_ROOTS) {
    const root = path.resolve(projectRoot, dir);
    if (!fs.existsSync(root)) continue;
    const dirName = path.basename(dir);

    for (const sourceFile of collectModuleFiles(root)) {
      const relNoExt = path
        .relative(root, sourceFile)
        .replace(/\\/g, '/')
        .replace(/\.(tsx?|mts|js|mjs)$/, '');
      const relDir = path.posix.dirname(relNoExt);
      const baseName = path.posix.basename(relNoExt);

      let specifiers: string[];
      if (relNoExt === 'index') {
        specifiers = [alias, `${alias}/index`];
      } else if (baseName === 'index') {
        specifiers = [`${alias}/${relDir}`, `${alias}/${relDir}/index`];
      } else {
        specifiers = [`${alias}/${relNoExt}`];
      }

      modules.push({
        alias,
        specifiers,
        sourceFile,
        entryName: `${SHARED_ENTRY_PREFIX}/${dirName}/${relNoExt}`,
      });
    }
  }

  modules.sort((a, b) => a.entryName.localeCompare(b.entryName));
  return modules;
}

/**
 * Build the browser import map from the discovered modules.
 *
 * The map always includes `phaser`; engine specifiers are emitted in sorted
 * order so the resulting JSON is stable across runs (the determinism AC).
 *
 * @param modules Result of {@link discoverSharedModules}.
 * @param base    URL prefix for the emitted chunks (default `./`). Values are
 *                resolved relative to the document the import map lives in.
 */
export function buildImportMap(
  modules: readonly SharedModule[],
  base = './',
): ImportMapDocument {
  const imports: Record<string, string> = {
    [PHASER_SPECIFIER]: `${base}${PHASER_ENTRY_NAME}.js`,
  };

  for (const module of modules) {
    const url = `${base}${module.entryName}.js`;
    for (const specifier of module.specifiers) {
      imports[specifier] = url;
    }
  }

  const sorted: Record<string, string> = {};
  for (const key of Object.keys(imports).sort()) sorted[key] = imports[key];
  return { imports: sorted };
}

/**
 * Extract every bare ESM specifier referenced by *source*.
 *
 * Handles `import … from "x"`, `export … from "x"` and side-effect
 * `import "x"`. Relative/absolute URLs and Node built-ins are ignored: only
 * specifiers the browser must resolve through the import map are returned.
 */
export function collectBareSpecifiers(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      if (
        specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('http:') ||
        specifier.startsWith('https:') ||
        specifier.startsWith('data:') ||
        specifier.startsWith('node:')
      ) {
        continue;
      }
      found.add(specifier);
    }
  }
  return [...found].sort();
}

/**
 * Return the specifiers *importMap* cannot resolve.
 *
 * A specifier is covered by an exact key or by a trailing-slash (prefix)
 * mapping. An empty result means the map covers every specifier — the check
 * used by the artifact-coverage verification test.
 */
export function findUnmappedSpecifiers(
  importMap: ImportMapDocument,
  specifiers: Iterable<string>,
): string[] {
  const exact = importMap.imports;
  const prefixes = Object.keys(exact).filter((key) => key.endsWith('/'));
  const missing: string[] = [];
  for (const specifier of specifiers) {
    if (specifier in exact) continue;
    if (prefixes.some((prefix) => specifier.startsWith(prefix))) continue;
    missing.push(specifier);
  }
  return missing.sort();
}

/**
 * Build the import map for the core/engine source tree rooted at
 * *projectRoot*. Convenience composition of discovery + mapping.
 */
export function buildImportMapForProject(
  projectRoot: string,
  base = './',
): ImportMapDocument {
  return buildImportMap(discoverSharedModules(projectRoot), base);
}

/** Serialise the import map for embedding in `index.html`. */
export function serialiseImportMap(importMap: ImportMapDocument): string {
  return JSON.stringify(importMap);
}
