/**
 * Vite plugin: compose sibling game-owned assets into the launcher.
 *
 * `gameDiscoveryPlugin` bundles each selected game's **source** from its
 * sibling checkout, but Vite only serves/copies the launcher's single
 * `public/` directory. Each game's assets (thumbnails, icons, audio) live in
 * that game repo's own `public/assets/`, so without composition the Game
 * Selector and every game 404 on them.
 *
 * This plugin runs {@link composeGameAssets} in `configResolved` — which is
 * early enough that Vite's public-file scan (`recursiveReaddir(publicDir)`)
 * and the build's public-dir copy both see the composed symlinks — so
 * `GAMES_CONFIG=<preset> npm run dev` / `npm run build` /
 * `npm run build:electron` serve every selected game's assets with no extra
 * step. Composition is driven by the active preset and is idempotent, so a
 * core-only run leaves the tree clean.
 *
 * Related work item: CG-0MUKYCG9L00587FA.
 */
import type { Plugin } from 'vite';

import { composeGameAssets } from './link-game-assets';

/** Options for {@link gameAssetsPlugin}. */
export interface GameAssetsPluginOptions {
  /** Launcher repo root (defaults to Vite's resolved `root`). */
  projectRoot?: string;
  /** Environment holding `GAMES_CONFIG` (defaults to `process.env`). */
  env?: Record<string, string | undefined>;
  /** Layout contract path override (defaults to `scripts/configs/repo-layout.json`). */
  layoutPath?: string;
}

/**
 * Create the game-asset composition Vite plugin.
 *
 * @param options See {@link GameAssetsPluginOptions}.
 * @returns A Vite plugin instance.
 */
export function gameAssetsPlugin(options: GameAssetsPluginOptions = {}): Plugin {
  let projectRoot = options.projectRoot ?? process.cwd();
  let composed = false;

  return {
    name: 'tce-game-assets',

    configResolved(config) {
      if (!options.projectRoot) projectRoot = config.root;
      // `configResolved` may fire more than once (Vite re-resolves for test
      // projects); composition is idempotent, but do the work once per plugin
      // instance.
      if (composed) return;
      composed = true;

      try {
        const report = composeGameAssets({
          projectRoot,
          env: options.env,
          layoutPath: options.layoutPath,
        });
        const changed = report.linked.length + report.replaced.length + report.removed.length;
        if (changed > 0 || report.skipped.length > 0) {
          config.logger.info(
            `[game-assets] composed sibling game assets ` +
              `(linked ${report.linked.length}, replaced ${report.replaced.length}, ` +
              `removed ${report.removed.length}, skipped ${report.skipped.length}).`,
          );
        }
      } catch (err) {
        // An unknown preset is reported by gameDiscoveryPlugin with the full
        // list of valid names; don't mask or duplicate that error.
        config.logger.warn(`[game-assets] skipped asset composition: ${(err as Error).message}`);
      }
    },
  };
}

export default gameAssetsPlugin;
