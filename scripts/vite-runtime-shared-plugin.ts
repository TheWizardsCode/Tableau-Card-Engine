/**
 * Vite plugin: runtime game plugin shared-dependency resolution
 * (CG-0MUV9Y71Z002W8N2, feature of epic CG-0MTRO7VMI000F3A5).
 *
 * Builds a stable "shared runtime" for dynamically-imported game artifacts and
 * injects a browser import map into `index.html` so their externalised bare
 * ESM specifiers (`phaser`, `@core-engine/*`, `@card-system/*`,
 * `@rule-engine/*`, `@ui/*`, `@ai/*`) resolve to the launcher's **own single**
 * engine/Phaser copies:
 *
 *   1. Every engine module is added as a Rollup entry with a **stable,
 *      path-derived output name** (`tce-shared/<alias>/<path>.js`) — never a
 *      content hash — so the import map is deterministic across builds.
 *   2. `preserveEntrySignatures: 'strict'` keeps each entry's named exports
 *      (Rollup would otherwise drop them for an entry that is only imported).
 *   3. Because these entries live in the **same build** as the launcher, Rollup
 *      deduplicates the engine/Phaser modules into shared chunks: the launcher
 *      and every runtime artifact use one module instance (class identity is
 *      preserved — no second Phaser/engine).
 *   4. A `<script type="importmap">` mapping every known specifier is injected
 *      at `head-prepend`, before the launcher's module script, so the map is
 *      active when the loader dynamically imports an artifact.
 *
 * The build only runs for `command === 'build'`; the dev server is untouched
 * (runtime plugins are an Electron/packaged-launcher concern). The mapping
 * logic itself is pure and lives in `./runtime-shared-import-map.ts`.
 *
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 * @see docs/dev/runtime-game-plugins-runbook.md — verification scenarios
 */

import path from 'node:path';
import type { Plugin } from 'vite';

import {
  PHASER_ENTRY_NAME,
  PHASER_STUB_PATH,
  SHARED_ENTRY_PREFIX,
  buildImportMap,
  discoverSharedModules,
  serialiseImportMap,
  type ImportMapDocument,
  type SharedModule,
} from './runtime-shared-import-map';

export interface RuntimeSharedPluginOptions {
  /** Disable the plugin (default: enabled). */
  enabled?: boolean;
  /** Core checkout root; defaults to the resolved Vite root. */
  projectRoot?: string;
  /** Import-map URL prefix (default `./`, correct for every launcher base). */
  base?: string;
}

/** The Rollup inputs / import map the plugin contributes. */
export interface RuntimeSharedBuild {
  /** Rollup input map: the HTML entry plus one stable entry per module. */
  readonly input: Record<string, string>;
  /** Fully-populated browser import map. */
  readonly importMap: ImportMapDocument;
  /** The discovered engine modules (sorted, deterministic). */
  readonly modules: SharedModule[];
}

/**
 * Compute the shared-runtime Rollup inputs and import map for a checkout.
 *
 * Pure (no Vite): exercised directly by the unit tests so the determinism and
 * coverage guarantees are checked without running a build.
 */
export function buildRuntimeSharedBuild(
  projectRoot: string,
  base = './',
): RuntimeSharedBuild {
  const modules = discoverSharedModules(projectRoot);
  const input: Record<string, string> = {
    index: path.resolve(projectRoot, 'index.html'),
  };
  for (const module of modules) {
    input[module.entryName] = module.sourceFile;
  }
  input[PHASER_ENTRY_NAME] = path.resolve(projectRoot, PHASER_STUB_PATH);

  return {
    input,
    importMap: buildImportMap(modules, base),
    modules,
  };
}

/**
 * The runtime-shared Vite plugin. Add to `vite.config.ts` `plugins`.
 */
export function runtimeSharedPlugin(
  options: RuntimeSharedPluginOptions = {},
): Plugin {
  let build: RuntimeSharedBuild | null = null;

  const resolveRoot = (viteRoot: string | undefined): string =>
    options.projectRoot ?? viteRoot ?? process.cwd();

  return {
    name: 'tce-runtime-shared',
    // Packaged/build only; the dev server has no runtime artifacts.
    apply: 'build',

    config(viteConfig) {
      if (options.enabled === false) return undefined;
      build = buildRuntimeSharedBuild(resolveRoot(viteConfig.root), options.base);
      return {
        build: {
          rollupOptions: {
            input: build.input,
            // Keep the named exports of every shared entry.
            preserveEntrySignatures: 'strict',
            output: {
              // Stable, path-derived names for shared entries; hashed names
              // stay for the launcher's own application chunk.
              entryFileNames: (chunk): string =>
                chunk.name.startsWith(`${SHARED_ENTRY_PREFIX}/`)
                  ? '[name].js'
                  : 'assets/[name]-[hash].js',
            },
          },
        },
      };
    },

    transformIndexHtml() {
      if (options.enabled === false || !build) return undefined;
      return [
        {
          tag: 'script',
          attrs: { type: 'importmap' },
          children: serialiseImportMap(build.importMap),
          // Must precede the launcher's module script.
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
