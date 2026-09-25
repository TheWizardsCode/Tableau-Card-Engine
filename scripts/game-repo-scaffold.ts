/**
 * Scaffold a per-game repository as a single-game TCE launcher (F4).
 *
 * Part of epic CG-0MTR7DLMY008CK17 (F4: CG-0MTRO72W5003ECAK).
 *
 * ## Why this exists
 *
 * `scripts/extract-repos.sh` (F1) produces a history-preserving checkout of a
 * game's own tree (`example-games/<game>/**`, its tests, docs and assets) but
 * **not** the root project files needed to build it (a game repo has no
 * `package.json`, `vite.config.ts`, `tsconfig.json`, `main.ts` or `index.html`
 * of its own). This module fills that gap: it adds the root configs that turn
 * an extracted game tree into a runnable single-game launcher which composes
 * the core engine checkout as a sibling (`../tableau-card-engine-core`).
 *
 * ## Composed layout (Option C — F9/C1)
 *
 * ```
 * <parent>/
 * ├── tableau-card-engine-core/   the engine + Gym + launcher shell
 * └── tce-<game>/                 scaffolded by this module
 *     ├── core -> ../tableau-card-engine-core   (symlink, optional; git submodule)
 *     ├── src/                     the game tree (renamed from example-games/<game>/)
 *     │   ├── scenes/<Game>Scene.ts
 *     │   ├── scripts/adapters/<Game>ReplayAdapter.ts
 *     │   └── tests/fixtures/…
 *     ├── configs/<game>.json      single-game preset (Gym + 1 game)
 *     ├── main.ts / index.html / env.d.ts
 *     ├── package.json / vite.config.ts / tsconfig.json
 *     └── tests/<game>/            the game's unit/browser tests (from F1 extraction)
 * ```
 *
 * The game source lives at repo-root `src/`; the `src -> core/src` compatibility
 * symlink is **gone**. Engine imports use the shared path aliases (C2), and the
 * game's own tests reach the game source through the rewritten `src/` prefix
 * (`../../src/…`), so no `example-games/` tree or symlink is needed.
 *
 * ## History
 *
 * Scaffolding is deliberately separate from extraction so the F1
 * `git filter-repo` step owns history preservation (AC5). The game-tree
 * rename to `src/` is a `--path-rename` in `scripts/extract-repos.sh`, so it is
 * history-preserving; scaffolding writes a single commit's worth of root files
 * on top of the extracted history and rewrites intra-test game-tree paths.
 *
 * ## CLI
 *
 * ```bash
 * tsx scripts/game-repo-scaffold.ts \
 *   --game golf \
 *   --game-repo-root ../tce-golf \
 *   --core-root ../tableau-card-engine-core
 * ```
 *
 * Run with `--help` for the full option list.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Public constants ──────────────────────────────────────────────────────

/** Default sibling location of the core checkout relative to a game repo. */
export const DEFAULT_CORE_REL = '../tableau-card-engine-core';

/** Directory (relative to a game repo root) holding the build presets. */
export const GAME_REPO_CONFIGS_DIR = 'configs';

/** The preset filename a game repo builds with by default. */
export const DEFAULT_GAME_PRESET = 'game';

// ── Types ─────────────────────────────────────────────────────────────────

/** The subset of the core `package.json` the scaffold reuses. */
export interface CoreManifest {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** A discovered game entry, as recorded in the core's `configs/full.json`. */
export interface GameEntryRef {
  id: string;
  path: string;
  scenePath: string;
  /** Sibling-repo (`src/`-layout) scene path (Option C, C4). */
  siblingScenePath?: string;
  adapterPath?: string;
  /** Sibling-repo (`src/`-layout) adapter path (Option C, C4). */
  siblingAdapterPath?: string;
}

/** Inputs for {@link scaffoldGameRepo}. */
export interface ScaffoldOptions {
  /** Game id, e.g. `golf` or `main-street`. */
  game: string;
  /** Absolute or cwd-relative path to the game repo root to scaffold. */
  gameRepoRoot: string;
  /** Absolute or cwd-relative path to the core engine checkout. */
  coreRoot: string;
  /**
   * Path to the core checkout relative to the game repo root. Used in the
   * generated configs. Defaults to {@link DEFAULT_CORE_REL}.
   */
  coreRel?: string;
  /** Scene module path relative to the game repo root. Resolved from the
   * core's `configs/full.json` when omitted. */
  scenePath?: string;
  /** Optional replay-adapter module path relative to the game repo root. */
  adapterPath?: string;
  /** The core manifest; read from `coreRoot/package.json` when omitted. */
  coreManifest?: CoreManifest;
}

/** Result of {@link scaffoldGameRepo}. */
export interface ScaffoldResult {
  gameRepoRoot: string;
  coreRoot: string;
  coreRel: string;
  presetPath: string;
  written: string[];
  symlinks: string[];
  /** Test/source files whose `example-games/<game>/` paths were rewritten. */
  rewritten: string[];
  /** Shared core assets linked into `public/assets` (F1 asset table). */
  assetLinks: string[];
}

// ── Small helpers ─────────────────────────────────────────────────────────

/** Convert a kebab-case game id to PascalCase (`main-street` → `MainStreet`). */
export function pascalCase(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** Default scene module path for a game id (Option C: `src/` layout). */
export function defaultScenePath(game: string): string {
  return `src/scenes/${pascalCase(game)}Scene.ts`;
}

/**
 * Translate a monorepo (`example-games/<game>/…`) path to the game-repo
 * (`src/…`) layout. Paths that do not reference the game tree are unchanged.
 */
export function toGameRepoPath(monorepoPath: string, game: string): string {
  const prefix = `example-games/${game}/`;
  return monorepoPath.startsWith(prefix)
    ? `src/${monorepoPath.slice(prefix.length)}`
    : monorepoPath;
}

/** Read and parse the core manifest (`package.json`). */
export function readCoreManifest(coreRoot: string): CoreManifest {
  const p = path.join(coreRoot, 'package.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as CoreManifest;
}

/**
 * Resolve the scene/adapter paths for a game from the core's `configs/full.json`.
 *
 * Returns `undefined` when the preset is absent or the game is not listed;
 * callers then fall back to {@link defaultScenePath}.
 */
export function findGameInPreset(
  coreRoot: string,
  game: string,
): GameEntryRef | undefined {
  const p = path.join(coreRoot, GAME_REPO_CONFIGS_DIR, 'full.json');
  if (!fs.existsSync(p)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as { games?: unknown };
    if (!Array.isArray(raw.games)) return undefined;
    return (raw.games as GameEntryRef[]).find((g) => g.id === game);
  } catch {
    return undefined;
  }
}

// ── Pure render functions ─────────────────────────────────────────────────

/** Render the game repo `package.json`. */
export function renderPackageJson(
  game: string,
  manifest: CoreManifest,
  coreRel: string,
): string {
  const pkg = {
    name: `tce-${game}`,
    version: manifest.version ?? '0.0.0',
    private: true,
    description:
      `Single-game Tableau Card Engine launcher for "${game}". ` +
      `Composes the engine checkout at ${coreRel} and builds web + Electron renderer bundles.`,
    type: 'module',
    scripts: {
      // Inherit the core toolchain scripts (save-load-smoke, monte-carlo,
      // balance, replay, …) so a game's tests can invoke them, then override
      // the repo-specific entry points below.
      ...(manifest.scripts ?? {}),
      dev: 'vite --host',
      build: 'tsc --noEmit && vite build',
      'build:electron': 'tsc --noEmit && vite build --mode electron',
      preview: 'vite preview --host',
      test: 'vitest run --project unit',
      'test:unit': 'vitest run --project unit',
      scaffold:
        'tsx ' +
        `${coreRel}/scripts/game-repo-scaffold.ts ` +
        `--game ${game} --game-repo-root . --core-root ${coreRel}`,
    },
    dependencies: manifest.dependencies ?? {},
    devDependencies: manifest.devDependencies ?? {},
    license: 'MIT',
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/** Render the game repo `vite.config.ts`. */
export function renderViteConfig(game: string, coreRel: string): string {
  return `/// <reference types="vitest" />
/**
 * Vite config for the tce-${game} single-game launcher.
 *
 * AUTO-GENERATED by scripts/game-repo-scaffold.ts — edit that template rather
 * than this file so a re-scaffold does not clobber local changes.
 *
 * The engine toolchain (the config-driven game-discovery plugin and the core
 * path aliases) is imported from the sibling core checkout at \`${coreRel}\`.
 */
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import {
  gameDiscoveryPlugin,
  resolveCoreAliases,
} from '${coreRel}/scripts/vite-game-discovery-plugin';

const coreRoot = path.resolve(__dirname, '${coreRel}');
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
);
// A game repo's only preset is ./configs/${DEFAULT_GAME_PRESET}.json; the
// plugin default (core-only) applies to the core repo. GAMES_CONFIG can
// still override for an ad-hoc build.
const presetEnv = {
  ...process.env,
  GAMES_CONFIG: process.env.GAMES_CONFIG ?? '${DEFAULT_GAME_PRESET}',
};

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Electron loads the bundle over file://, so relative asset URLs are required.
  base: mode === 'electron' ? './' : '/',
  plugins: [
    // Reads ./configs/${DEFAULT_GAME_PRESET}.json and generates
    // 'virtual:game-registry' (Gym from the core + this one game).
    gameDiscoveryPlugin({ projectRoot: __dirname, coreRoot, env: presetEnv }),
  ],
  resolve: {
    alias: resolveCoreAliases(coreRoot),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: false,
  },
  test: {
    projects: [
      // A game repo ships only its own unit suite; browser/teacher profiles
      // live in the launcher distribution.
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          // The replay CLI subprocess inherits this: it must resolve the
          // repo's single-game preset to register the game's adapter.
          env: { GAMES_CONFIG: '${DEFAULT_GAME_PRESET}' },
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.browser.test.ts'],
          testTimeout: 15_000,
          maxWorkers: 4,
        },
      },
    ],
  },
}));
`;
}

/** Render the game repo `tsconfig.json`. */
export function renderTsconfig(_game: string, coreRel: string): string {
  const cfg = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: './dist',
      baseUrl: '.',
      paths: {
        '@core-engine': [`${coreRel}/src/core-engine`],
        '@core-engine/*': [`${coreRel}/src/core-engine/*`],
        '@card-system': [`${coreRel}/src/card-system`],
        '@card-system/*': [`${coreRel}/src/card-system/*`],
        '@rule-engine': [`${coreRel}/src/rule-engine`],
        '@rule-engine/*': [`${coreRel}/src/rule-engine/*`],
        '@ui': [`${coreRel}/src/ui`],
        '@ui/*': [`${coreRel}/src/ui/*`],
        '@ai': [`${coreRel}/src/ai`],
        '@ai/*': [`${coreRel}/src/ai/*`],
        '@balance-cards': [`${coreRel}/src/balance-cards`],
        '@balance-cards/*': [`${coreRel}/src/balance-cards/*`],
        // Core-owned framework trees consumed by the game's own tests and
        // replay adapter (F9 / C1).
        '@core-scripts/*': [`${coreRel}/scripts/*`],
        '@core-tests/*': [`${coreRel}/tests/*`],
        // Core-owned Gym, imported by a game-owned Gym-backed scene.
        '@core-gym': [`${coreRel}/example-games/gym`],
        '@core-gym/*': [`${coreRel}/example-games/gym/*`],
      },
    },
    include: [
      'main.ts',
      'env.d.ts',
      'src/**/*.ts',
      'tests/**/*.ts',
      'vite.config.ts',
    ],
    // Browser/E2E tests need the launcher-distribution fixtures
    // (`tests/helpers`, `electron/`, `.pi/`) and cross-game checkouts; a
    // single-game repo validates its own unit suite only.
    exclude: ['node_modules', 'dist', 'tests/**/*.browser.test.ts'],
  };
  return `${JSON.stringify(cfg, null, 2)}\n`;
}

/** Render the game repo's single-game preset (`configs/game.json`). */
export function renderPreset(
  game: string,
  scenePath: string,
  adapterPath?: string,
): string {
  const entry: Record<string, string> = {
    id: game,
    // The scene lives locally in a game repo, so the path resolves against the
    // repo root itself; `path` is only a fallback for the composed layout.
    path: '.',
    scenePath,
  };
  if (adapterPath) entry.adapterPath = adapterPath;
  const preset = {
    $comment:
      `Single-game preset for tce-${game} (F4 / CG-0MTRO72W5003ECAK). ` +
      'Gym is core-owned and always present; exactly one game is selected.',
    games: [entry],
  };
  return `${JSON.stringify(preset, null, 2)}\n`;
}

/** Render the game repo `env.d.ts` (Vite client types + virtual module). */
export function renderEnvDts(): string {
  return `/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

/** Build-time injected version string from package.json (e.g. "0.1.7"). */
declare const __APP_VERSION__: string;

/**
 * Virtual module generated by the core game-discovery plugin
 * (\`scripts/vite-game-discovery-plugin.ts\`).
 */
declare module 'virtual:game-registry' {
  import type Phaser from 'phaser';
  import type { GameEntry } from '@ui/GameSelectorScene';

  /** The game catalogue: Gym first, then the selected game. */
  export const GAMES: GameEntry[];

  /** Every Phaser scene class to register (Gym scenes included). */
  export const SCENES: Array<typeof Phaser.Scene>;
}
`;
}

/** Render the game repo `main.ts` entry point. */
export function renderMainTs(): string {
  return `/**
 * tce single-game launcher entry point.
 *
 * AUTO-GENERATED by scripts/game-repo-scaffold.ts. Boots a Phaser game with
 * the shared GameSelectorScene; the catalogue is generated by the core
 * game-discovery plugin from \`configs/${DEFAULT_GAME_PRESET}.json\` (Gym + this
 * game). Engine imports resolve into the sibling core checkout via the
 * \`@ui/*\` path aliases.
 */
import Phaser from 'phaser';
import { createCardGame } from '@ui/createCardGame';
import { GameSelectorScene, REGISTRY_KEY_GAMES } from '@ui/GameSelectorScene';
import { GAMES, SCENES } from 'virtual:game-registry';

export { GAMES };

const isReplayMode =
  new URLSearchParams(window.location.search).get('mode') === 'replay';

createCardGame({
  backgroundColor: '#1a2a1a',
  scenes: [GameSelectorScene, ...SCENES],
  type: Phaser.CANVAS,
  render: isReplayMode ? { preserveDrawingBuffer: true } : undefined,
  callbacks: {
    preBoot: (game: Phaser.Game) => {
      game.registry.set(REGISTRY_KEY_GAMES, GAMES);
    },
  },
  exposeOnWindow: true,
});
`;
}

// ── Filesystem scaffolding ────────────────────────────────────────────────

/** Write `contents` to `filePath`, creating parent directories as needed. */
function writeFile(filePath: string, contents: string, written: string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf-8');
  written.push(filePath);
}

/**
 * Create a directory symlink, tolerating platforms where `dir` needs a
 * junction and re-running when the link already exists. The link target is
 * stored relative to the link's own directory, so nested links stay valid.
 */
function ensureDirSymlink(linkPath: string, targetPath: string): boolean {
  const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false });
  if (existing) return false;
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const relTarget = path.relative(path.dirname(linkPath), targetPath);
  try {
    fs.symlinkSync(relTarget, linkPath, 'dir');
  } catch {
    // Windows without developer mode needs a junction for directories.
    fs.symlinkSync(relTarget, linkPath, 'junction');
  }
  return true;
}

/**
 * Link the core-owned shared assets into the game repo's `public/assets`.
 *
 * The F1 asset audit (`repo-layout.json → sharedAssets`) enumerates the shared
 * objects (canonical deck SVGs, default SFX, root SFX, CREDITS.md). A game
 * repo owns only its own subtree, but it still needs the shared assets to run,
 * so each shared entry is symlinked next to the game's own assets.
 *
 * @returns The created symlink paths.
 */
export function linkSharedAssets(
  gameRepoRoot: string,
  coreRoot: string,
): string[] {
  const layoutPath = path.join(coreRoot, 'scripts', 'configs', 'repo-layout.json');
  if (!fs.existsSync(layoutPath)) return [];
  let shared: string[] = [];
  try {
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8')) as {
      sharedAssets?: unknown;
    };
    if (Array.isArray(layout.sharedAssets)) {
      shared = layout.sharedAssets.filter((a): a is string => typeof a === 'string');
    }
  } catch {
    return [];
  }

  const linked: string[] = [];
  for (const entry of shared) {
    const clean = entry.replace(/\/+$/, '');
    if (!clean) continue;
    const target = path.join(coreRoot, 'public', 'assets', clean);
    const link = path.join(gameRepoRoot, 'public', 'assets', clean);
    if (!fs.existsSync(target)) continue;
    if (fs.lstatSync(link, { throwIfNoEntry: false })) continue;
    fs.mkdirSync(path.dirname(link), { recursive: true });
    const relTarget = path.relative(path.dirname(link), target);
    if (fs.statSync(target).isDirectory()) {
      try {
        fs.symlinkSync(relTarget, link, 'dir');
      } catch {
        fs.symlinkSync(relTarget, link, 'junction');
      }
    } else {
      fs.symlinkSync(relTarget, link);
    }
    linked.push(link);
  }
  return linked;
}

/**
 * Rewrite intra-test references to the game tree for the `src/` layout.
 *
 * Game tests reach their own source with repository-root-relative specifiers
 * like `../../example-games/<game>/GolfGame` (C2 rewrote only the *engine*
 * imports to aliases). In the Option C layout the game tree is at `src/`, and
 * because a game test lives at the same depth as in the monorepo
 * (`tests/<game>/…`), replacing the `example-games/<game>/` segment with
 * `src/` is exact — including runtime paths such as fixture file locations.
 *
 * @returns The rewritten file paths.
 */
export function rewriteGameTreePaths(gameRepoRoot: string, game: string): string[] {
  const needle = `example-games/${game}/`;
  const rewritten: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const original = fs.readFileSync(full, 'utf-8');
        if (original.includes(needle)) {
          fs.writeFileSync(full, original.split(needle).join('src/'), 'utf-8');
          rewritten.push(full);
        }
      }
    }
  };
  walk(path.join(gameRepoRoot, 'tests'));
  walk(path.join(gameRepoRoot, 'src'));
  return rewritten;
}

/**
 * Scaffold a per-game repo in place.
 *
 * Writes `package.json`, `vite.config.ts`, `tsconfig.json`, `main.ts`,
 * `env.d.ts`, `index.html` (copied from the core) and
 * `configs/<preset>.json`, and creates the `src`/`core` symlinks into the
 * sibling core checkout.
 *
 * @param options See {@link ScaffoldOptions}.
 * @returns What was written and linked.
 * @throws When the game repo root or core root does not exist.
 */
export function scaffoldGameRepo(options: ScaffoldOptions): ScaffoldResult {
  const gameRepoRoot = path.resolve(options.gameRepoRoot);
  const coreRoot = path.resolve(options.coreRoot);
  const coreRel = options.coreRel ?? DEFAULT_CORE_REL;

  if (!fs.existsSync(gameRepoRoot)) {
    throw new Error(
      `[scaffold] game repo root does not exist: ${gameRepoRoot}. ` +
        'Run scripts/extract-repos.sh first or pass --game-repo-root.',
    );
  }
  if (!fs.existsSync(coreRoot)) {
    throw new Error(
      `[scaffold] core checkout does not exist: ${coreRoot}. ` +
        'Clone/check out tableau-card-engine-core next to the game repo.',
    );
  }

  const manifest = options.coreManifest ?? readCoreManifest(coreRoot);
  const preset = options.scenePath
    ? undefined
    : findGameInPreset(coreRoot, options.game);
  // Option C (C1/C4): prefer an explicit sibling `src/` path from the core's
  // preset, then translate a monorepo `example-games/<game>/…` path, then fall
  // back to the canonical `src/scenes/<Game>Scene.ts`.
  const scenePath =
    options.scenePath ??
    preset?.siblingScenePath ??
    (preset?.scenePath ? toGameRepoPath(preset.scenePath, options.game) : undefined) ??
    defaultScenePath(options.game);
  const adapterPath =
    options.adapterPath ??
    preset?.siblingAdapterPath ??
    (preset?.adapterPath ? toGameRepoPath(preset.adapterPath, options.game) : undefined);

  const written: string[] = [];
  const symlinks: string[] = [];

  writeFile(
    path.join(gameRepoRoot, 'package.json'),
    renderPackageJson(options.game, manifest, coreRel),
    written,
  );
  writeFile(
    path.join(gameRepoRoot, 'vite.config.ts'),
    renderViteConfig(options.game, coreRel),
    written,
  );
  writeFile(
    path.join(gameRepoRoot, 'tsconfig.json'),
    renderTsconfig(options.game, coreRel),
    written,
  );
  writeFile(
    path.join(gameRepoRoot, 'env.d.ts'),
    renderEnvDts(),
    written,
  );
  writeFile(
    path.join(gameRepoRoot, 'main.ts'),
    renderMainTs(),
    written,
  );

  // index.html is copied verbatim from the core so it stays in sync.
  const coreIndex = path.join(coreRoot, 'index.html');
  if (fs.existsSync(coreIndex)) {
    writeFile(
      path.join(gameRepoRoot, 'index.html'),
      fs.readFileSync(coreIndex, 'utf-8'),
      written,
    );
  }

  writeFile(
    path.join(gameRepoRoot, GAME_REPO_CONFIGS_DIR, `${DEFAULT_GAME_PRESET}.json`),
    renderPreset(options.game, scenePath, adapterPath),
    written,
  );

  // Option C (C1): the game source occupies repo-root `src/`, so the
  // `src -> core/src` compatibility symlink (and the `scripts`,
  // `example-games/gym` and `tests/helpers` symlinks that propped up
  // root-relative imported paths) are no longer created. Engine imports go
  // through the path aliases; intra-test game-tree paths are rewritten to
  // `src/`. The only remaining link is `core` (the engine checkout / a git
  // submodule once remotes exist).
  if (ensureDirSymlink(path.join(gameRepoRoot, 'core'), coreRoot)) {
    symlinks.push(path.join(gameRepoRoot, 'core'));
  }

  const assetLinks = linkSharedAssets(gameRepoRoot, coreRoot);

  const rewritten = rewriteGameTreePaths(gameRepoRoot, options.game);

  return {
    gameRepoRoot,
    coreRoot,
    coreRel,
    presetPath: path.join(
      gameRepoRoot,
      GAME_REPO_CONFIGS_DIR,
      `${DEFAULT_GAME_PRESET}.json`,
    ),
    written,
    symlinks,
    rewritten,
    assetLinks,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  game?: string;
  gameRepoRoot?: string;
  coreRoot?: string;
  coreRel?: string;
  reposDir?: string;
  all?: boolean;
  layout?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--game':
        args.game = next;
        i += 1;
        break;
      case '--game-repo-root':
        args.gameRepoRoot = next;
        i += 1;
        break;
      case '--core-root':
        args.coreRoot = next;
        i += 1;
        break;
      case '--core-rel':
        args.coreRel = next;
        i += 1;
        break;
      case '--repos-dir':
        args.reposDir = next;
        i += 1;
        break;
      case '--all':
        args.all = true;
        break;
      case '--layout':
        args.layout = next;
        i += 1;
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage(): string {
  return [
    'Usage: tsx scripts/game-repo-scaffold.ts --game <id> [options]',
    '   or: tsx scripts/game-repo-scaffold.ts --all [options]',
    '',
    'Turn an extracted game checkout into a runnable single-game launcher',
    'that composes the core engine checkout as a sibling.',
    '',
    'Options:',
    '  --game <id>              Game id (golf, main-street, …). Required unless --all.',
    '  --all                    Scaffold every game in scripts/configs/repo-layout.json.',
    '  --game-repo-root <path>  Game repo root. Defaults to <repos-dir>/tce-<id>.',
    '  --repos-dir <path>       Directory holding tce-<id> checkouts.',
    '  --core-root <path>       Core engine checkout. Defaults to',
    '                           <repos-dir-parent>/tableau-card-engine-core.',
    '  --core-rel <path>        Core path as used inside the game repo',
    `                           (default: ${DEFAULT_CORE_REL}).`,
    '  --layout <path>          Layout file for --all',
    '                           (default: <core-root>/scripts/configs/repo-layout.json).',
    '  -h, --help               Show this help.',
  ].join('\n');
}

function main(argv: string[]): number {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(usage());
    return 0;
  }
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    console.error(usage());
    return 1;
  }
  if (!args.game && !args.all) {
    console.error('error: --game or --all is required');
    console.error(usage());
    return 1;
  }

  const reposDir = path.resolve(args.reposDir ?? path.join(process.cwd(), '..'));
  const coreRoot = path.resolve(
    args.coreRoot ?? path.join(reposDir, 'tableau-card-engine-core'),
  );

  const games = args.all
    ? readLayoutGames(
        args.layout ?? path.join(coreRoot, 'scripts', 'configs', 'repo-layout.json'),
      )
    : [args.game as string];

  const manifest = readCoreManifest(coreRoot);
  let failures = 0;
  let lastGameRepoRoot = '';
  for (const game of games) {
    const gameRepoRoot = path.resolve(
      args.gameRepoRoot ?? path.join(reposDir, `tce-${game}`),
    );
    lastGameRepoRoot = gameRepoRoot;
    const coreRel =
      args.coreRel ??
      (path.relative(gameRepoRoot, coreRoot) || DEFAULT_CORE_REL);
    try {
      const result = scaffoldGameRepo({
        game,
        gameRepoRoot,
        coreRoot,
        coreRel,
        coreManifest: manifest,
      });
      console.log(`Scaffolded tce-${game}`);
      console.log(`  game repo: ${result.gameRepoRoot}`);
      console.log(`  core:      ${result.coreRoot} (${result.coreRel})`);
      console.log(`  preset:    ${result.presetPath}`);
      for (const f of result.written) console.log(`  wrote ${f}`);
      for (const l of result.symlinks) console.log(`  linked ${l}`);
      if (result.rewritten.length) {
        console.log(`  rewrote example-games/${game}/ → src/ in ${result.rewritten.length} file(s)`);
      }
      if (result.assetLinks.length) {
        console.log(`  linked ${result.assetLinks.length} shared asset(s)`);
      }
    } catch (err) {
      failures += 1;
      console.error(`Failed to scaffold tce-${game}: ${(err as Error).message}`);
    }
  }

  if (failures > 0) return 1;
  console.log('');
  console.log('Next:');
  console.log(`  cd ${lastGameRepoRoot}`);
  console.log('  npm install && npm run dev');
  return 0;
}

/** Read the game names from the F1 repo-layout file. */
export function readLayoutGames(layoutPath: string): string[] {
  const raw = JSON.parse(fs.readFileSync(layoutPath, 'utf-8')) as {
    games?: Array<{ name?: string }>;
  };
  if (!Array.isArray(raw.games)) {
    throw new Error(`[scaffold] layout file has no games array: ${layoutPath}`);
  }
  return raw.games
    .map((g) => g.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
