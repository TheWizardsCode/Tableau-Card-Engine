/**
 * Dedicated Vite config for the story-line editor dev page.
 *
 * The editor is a **development tool**, not a game: it is a plain-DOM page
 * (no Phaser, no game scenes) driven by the story-line content/author seams.
 * It therefore gets its own config instead of reusing the game/build config
 * (`vite.config.ts`), so:
 *
 * - the editor page is never pulled into the production game bundle or the
 *   packaged Electron app (separate `root` and `build.outDir`);
 * - the game's build plugins (`virtual:game-registry` discovery, game assets,
 *   runtime shared chunks) are not applied to the editor;
 * - the core aliases still resolve so the editor imports the engine modules
 *   directly.
 *
 * The page itself lands in the editor-host slice; this config exists from the
 * harness slice onwards so the browser-test path and the dev-server wiring are
 * decided up front rather than retrofitted.
 *
 * ```bash
 * npx vite --config vite.editor.config.ts
 * ```
 *
 * @module
 */

import { defineConfig } from 'vite';

import { resolveCoreAliases } from './scripts/vite-game-discovery-plugin';

/** Directory the editor dev page is served from (repository-relative). */
export const EDITOR_PAGE_ROOT = 'tools/storyline-editor';

/** Dedicated dev-server port (distinct from the game dev server's 3000). */
export const EDITOR_SERVER_PORT = 5174;

/** Build output for the editor page — never the game's `dist/`. */
export const EDITOR_BUILD_OUT_DIR = 'dist/editor';

export default defineConfig({
  root: EDITOR_PAGE_ROOT,
  base: '/',
  resolve: {
    // The editor talks to the same core modules as the game; the aliases are
    // resolved from this checkout (CORE_ROOT is honoured for a game repo that
    // composes core as a submodule).
    alias: resolveCoreAliases(process.env.CORE_ROOT || __dirname),
  },
  server: {
    port: EDITOR_SERVER_PORT,
    open: false,
  },
  build: {
    outDir: EDITOR_BUILD_OUT_DIR,
    emptyOutDir: true,
    sourcemap: true,
  },
});
