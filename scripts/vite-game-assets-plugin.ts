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
 * Composition also **prunes dangling links** ({@link pruneDanglingComposedLinks}):
 * composed links carry relative targets, so a tree moved into
 * `.worklog/worktrees/<id>/` (or one whose sibling game checkout was removed)
 * would otherwise leave a link Vite's public-dir copy aborts on with `ENOENT`.
 * For the same reason it re-runs at `buildStart`, which closes the window
 * between config resolution and the copy (a concurrent composition, or a
 * sibling checkout removed mid-build).
 *
 * Composition is **on by default** for every real invocation (`npm run dev`,
 * `npm run build`, `build:electron`, `package`). Automated builds opt out with
 * {@link GameAssetsPluginOptions.compose} `false`: composition is destructive
 * (it creates, replaces and removes links), so several test workers building
 * the real project root with different presets would race over one shared
 * `public/assets` tree while Vite copies it (CG-0MWW6BWZB00968NQ). Opting out
 * skips composition *and* dangling-link pruning — a test build must never
 * mutate that tree.
 *
 * Related work items: CG-0MUKYCG9L00587FA, CG-0MWTSRRWU0062OMI,
 * CG-0MWW6BWZB00968NQ.
 */
import type { Plugin, ResolvedConfig } from 'vite';

import { composeGameAssets, pruneDanglingComposedLinks } from './link-game-assets';

/** Options for {@link gameAssetsPlugin}. */
export interface GameAssetsPluginOptions {
  /** Launcher repo root (defaults to Vite's resolved `root`). */
  projectRoot?: string;
  /** Environment holding `GAMES_CONFIG` (defaults to `process.env`). */
  env?: Record<string, string | undefined>;
  /** Layout contract path override (defaults to `scripts/configs/repo-layout.json`). */
  layoutPath?: string;
  /**
   * Compose sibling game assets into `public/assets` (default `true`).
   *
   * Set to `false` to make the plugin a complete no-op: no composition and no
   * dangling-link pruning, so a build never mutates the shared
   * `public/assets` tree. This exists for **test isolation** only — Vitest
   * builds the real project root and several workers would otherwise race on
   * the same links (`CG-0MWW6BWZB00968NQ`). Every real dev/build/package run
   * leaves it unset, so composition stays on.
   */
  compose?: boolean;
}

/** Minimal logger surface used from both hooks. */
interface PluginLogger {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
}

/**
 * Create the game-asset composition Vite plugin.
 *
 * @param options See {@link GameAssetsPluginOptions}.
 * @returns A Vite plugin instance.
 */
export function gameAssetsPlugin(options: GameAssetsPluginOptions = {}): Plugin {
  let projectRoot = options.projectRoot ?? process.cwd();
  let logger: PluginLogger = {};
  // Default ON: no existing caller changes behaviour. Only an explicit opt-out
  // (the Vitest wiring in `vite.config.ts`) disables the plugin entirely.
  const compose = options.compose ?? true;

  const syncAssets = (): void => {
    // A test-context build must leave `public/assets` byte-for-byte untouched:
    // pruning is a mutation too, so bail out before any filesystem work.
    if (!compose) return;
    try {
      const report = composeGameAssets({
        projectRoot,
        env: options.env,
        layoutPath: options.layoutPath,
      });
      const changed =
        report.linked.length +
        report.replaced.length +
        report.removed.length +
        report.prunedDangling.length;
      if (changed > 0 || report.skipped.length > 0) {
        logger.info?.(
          `[game-assets] composed sibling game assets ` +
            `(linked ${report.linked.length}, replaced ${report.replaced.length}, ` +
            `pruned ${report.prunedDangling.length}, ` +
            `removed ${report.removed.length}, skipped ${report.skipped.length}).`,
        );
      }
    } catch (err) {
      // An unknown preset is reported by gameDiscoveryPlugin with the full
      // list of valid names; don't mask or duplicate that error. Still prune
      // dangling links: a stale link must never be the reason a build fails.
      logger.warn?.(`[game-assets] skipped asset composition: ${(err as Error).message}`);
      try {
        pruneDanglingComposedLinks({
          projectRoot,
          layoutPath: options.layoutPath,
          log: (line) => logger.info?.(line),
        });
      } catch {
        // Composition is best-effort: never fail the build from this plugin.
      }
    }
  };

  return {
    name: 'tce-game-assets',

    configResolved(config: ResolvedConfig) {
      if (!options.projectRoot) projectRoot = config.root;
      logger = config.logger;
      syncAssets();
    },

    // Re-run before Vite copies the public dir. Composition is idempotent and
    // cheap (a handful of lstat calls), and this closes the window in which a
    // link could dangle after `configResolved` — the failure mode reported in
    // CG-0MWTSRRWU0062OMI.
    buildStart() {
      syncAssets();
    },
  };
}

export default gameAssetsPlugin;
