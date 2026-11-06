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
 * the core engine checkout as a sibling (`../Tableau-Card-Engine`).
 *
 * ## Composed layout (Option C — F9/C1)
 *
 * ```
 * <parent>/
 * ├── Tableau-Card-Engine/        the engine + Gym + launcher shell
 * └── tce-<game>/                 scaffolded by this module
 *     ├── core -> ../Tableau-Card-Engine   (symlink, optional; git submodule)
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
 * A real run also copies the core's committed `.githooks/` verbatim (including
 * the unified full-suite pre-push gate, which is bound to the pushed commit via
 * `--gate-commit`), points the generated repo's **local** `core.hooksPath` at
 * it, and generates
 * `docs/dev/context-budget.thresholds.json` from that repo's own measured
 * surface (CG-0MW0KURL8002XOV9). Because `core.hooksPath` is local config, a
 * fresh clone still needs one activation step (`install_pi.sh` or
 * `git config core.hooksPath .githooks`).
 *
 * ## History
 *
 * Scaffolding is deliberately separate from extraction so the F1
 * `git filter-repo` step owns history preservation (AC5). The game-tree
 * rename to `src/` is a `--path-rename` in `scripts/extract-repos.sh`, so it is
 * history-preserving; scaffolding writes a single commit's worth of root files
 * on top of the extracted history and, only when `--migrate-game-paths` is
 * passed, rewrites intra-test game-tree paths.
 *
 * ## CLI
 *
 * ```bash
 * tsx scripts/game-repo-scaffold.ts \
 *   --game golf \
 *   --game-repo-root ../tce-golf \
 *   --core-root ../Tableau-Card-Engine
 * ```
 *
 * Write-gating flags (README, Developer Guide, and Multi-Repo Architecture §5):
 * `--only <file,...>`, `--force`, `--dry-run`, `--json` and
 * `--migrate-game-paths` — `--help` lists them all.
 *
 * Every run classifies each generated file (`create` / `update` / `unchanged` /
 * `skip-local`) and reports it; `--dry-run` reports without writing and
 * `--json` emits the machine-readable report. Run with `--help` for the full
 * option list, and see the rationale above {@link classifyAndApply} for why
 * writes are classified rather than applied blindly.
 *
 * ## Write gating (`--only` / `--force` / `skip-local`)
 *
 * The prose contract for this section and the next lives with the docs —
 * `docs/dev/multi-repo-architecture.md` §5 "Write gating" and
 * `docs/DEVELOPER.md` "Write gating: `--dry-run`, `--only`, `--force` and
 * `--migrate-game-paths" — so a reader of this header finds the user-facing
 * documentation, and a reader of those pages finds the implementation here.
 *
 * A generated file is engine-owned but it lives in a consumer checkout that
 * owns its own wiring, so a run may only touch it when the caller says so
 * (CG-0MVWGJPPA000GBE7):
 *
 * - `--only <file,...>` restricts the run to the named generated paths, and
 *   suppresses every non-file side effect (the `core` symlink, shared-asset
 *   and root app-icon links, and the game-tree path rewrite). Unselected
 *   generated files classify `skip-local` (or `unchanged` when they already
 *   match the template) and are never written.
 * - `--force` allows overwriting a **selected** file whose content differs
 *   from the template; without it such a file classifies `skip-local` and is
 *   left untouched.
 * - With **no** `--only` a run is a *full* run: it regenerates everything,
 *   because the eight sibling `tce-<game>` repos rely on a plain run to
 *   receive template updates. Force is therefore implied
 *   (`effectiveForce = force || only === undefined`).
 *
 * A `--only` name that is not one of the generated paths fails the run before
 * anything is written, listing the valid paths — a typo must never produce a
 * silent no-op scaffold.
 *
 * ## Game-tree migration (`--migrate-game-paths`)
 *
 * The textual rewrite of the game's own `tests/` and `src/` trees
 * (`example-games/<game>/` → `src/`, plus the quoted-`scripts/`, core-`src/`
 * and relative-`scripts/` rewrites) is **opt-in** (CG-0MVWGJRIO0094Y4Z): a
 * routine re-scaffold must never edit a consumer's tests or source. Without
 * the flag the rewrite is not invoked at all and `rewritten` is empty — a
 * fresh repo does not need it, because `scripts/extract-repos.sh
 * --path-rename` already produced the `src/` layout.
 *
 * With `--migrate-game-paths` the rewrite runs exactly as before **for files
 * that genuinely reference `example-games/<game>/`**; a file with no such
 * reference (a drift guard's own `STALE_PREFIX`, a run-tests import, a
 * documented local edit) stays byte-identical. `--migrate-game-paths
 * --dry-run` writes nothing and reports the files a real migration would
 * rewrite, naming which rewrite applies ({@link ScaffoldMigrationReport}).
 * `--only` promises "no rewrite", so combining the two flags fails fast.
 *
 * ## Per-game version policy
 *
 * A scaffolded game repo owns its own `version`, decoupled from the engine's.
 * The scaffold seeds a **new** game at {@link GAME_INITIAL_VERSION} (`0.1.0`),
 * **preserves** the version already in a game repo's `package.json` on a
 * re-scaffold, and accepts an explicit `--version` override. It never copies
 * `CoreManifest.version` (CG-0MVGF2QE9008NA5R). A game release bumps only that
 * game's version; the ship `bump-version.js` resolves the invoking repo root.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Public constants ──────────────────────────────────────────────────────

/** Default sibling location of the core checkout relative to a game repo. */
export const DEFAULT_CORE_REL = '../Tableau-Card-Engine';

/**
 * SSH remote of the merged core that a game repo's `core` submodule points
 * at. The single source of truth is `repo-layout.json` → `core.remote`; this
 * constant mirrors it so the scaffold and the layout cannot drift.
 */
export const CORE_REMOTE =
  'git@github.com:TheWizardsCode/Tableau-Card-Engine.git';

/** Directory (relative to a game repo root) holding the build presets. */
export const GAME_REPO_CONFIGS_DIR = 'configs';

/** The preset filename a game repo builds with by default. */
export const DEFAULT_GAME_PRESET = 'game';

/**
 * Directory (relative to a game repo root) holding the committed git hooks.
 *
 * The scaffold copies every file from `<coreRoot>/.githooks/` into this
 * directory **verbatim** and then points the repo's local
 * `core.hooksPath` at it (CG-0MW0KURL8002XOV9). Copying the core's directory —
 * rather than rendering hook text here — keeps the single source of truth in
 * TCE: a hook fix reaches every scaffolded game repo with no second copy to
 * drift.
 */
export const GITHOOKS_DIR = '.githooks';

/** The committed startup-context budget a scaffold generates for a game repo. */
export const CONTEXT_THRESHOLDS_PATH = 'docs/dev/context-budget.thresholds.json';

/** The per-repo guidance note shipped beside the generated thresholds. */
export const CONTEXT_BUDGET_DOC_PATH = 'docs/dev/context-budget.md';

/**
 * Threshold-refresh entry point copied from the core into every game repo.
 *
 * A game repo needs its **own** copy: the core's script resolves `REPO_ROOT`
 * from its own location, which inside a game repo is the `core/` submodule —
 * running it there would refresh the engine budget, not the game's.
 */
export const REFRESH_THRESHOLDS_PATH = 'scripts/refresh-context-thresholds.sh';

/**
 * Version a freshly scaffolded game repo is seeded with.
 *
 * Per-game version policy (CG-0MVGF2QE9008NA5R): **each game repo owns its
 * own version**, decoupled from the engine's release cadence.
 * `renderPackageJson` never derives a game version from the core manifest; the
 * scaffold seeds a new game at `GAME_INITIAL_VERSION`, preserves an existing
 * game's version on re-scaffold, and a game release bumps only that game's
 * `package.json` (the ship `bump-version.js` resolves the invoking repo root).
 */
export const GAME_INITIAL_VERSION = '0.1.0';

/**
 * Core-only npm scripts that must never be inherited into a game repo
 * (MS-0MVO30VXS002A1Z0).
 *
 * The core legitimately declares both for use **from the core checkout**, where
 * `scripts/game-repo-scaffold.ts` exists. Option C (F9/C1) gives a game repo
 * `src/`-layout sources and no root `scripts/` tree, so an inherited
 * `tsx scripts/game-repo-scaffold.ts` entry point is dead on arrival — invoking
 * it in a generated repo fails with module-not-found. A game repo scaffolds
 * through its own `scaffold` entry point, which targets the sibling core
 * checkout (`<coreRel>/scripts/game-repo-scaffold.ts`) instead.
 *
 * Deliberately an explicitly-named drop-list rather than a rule inferred from
 * the command: the wider class of core-only inherited scripts (`test:smoke`,
 * `context:check`, `build:electron-main`, …) is tracked separately on
 * MS-0MVO30VXS002A1Z0 and should be generalised there, not guessed at here.
 */
export const CORE_ONLY_SCRIPTS = ['scaffold:game', 'scaffold:games'] as const;

// ── Types ─────────────────────────────────────────────────────────────────

/** The subset of the core `package.json` the scaffold reuses. */
export interface CoreManifest {
  /**
   * The **core's** version. Kept typed because a manifest is a `package.json`
   * subset, but deliberately **unused** by the scaffold: a game repo owns its
   * own version (CG-0MVGF2QE9008NA5R), see {@link GAME_INITIAL_VERSION}.
   */
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
  /**
   * Explicit version for the generated `package.json`. Wins over any version
   * already present in the game repo (preserve-on-re-scaffold); when omitted,
   * the existing version is preserved, else {@link GAME_INITIAL_VERSION}.
   */
  version?: string;
  /**
   * Classify every generated file without touching the checkout: no writes, no
   * `mkdir`, no symlink, no shared-asset/app-icon link and no path rewrite.
   * The returned {@link ScaffoldResult.files} report carries exactly what the
   * equivalent real run would do, so a caller can preview before trusting it.
   */
  dryRun?: boolean;
  /**
   * Restrict the run to the named generated files, repo-relative with POSIX
   * separators (`main.ts`, `configs/game.json`, …).
   *
   * Selecting a file is the **only** way a run may modify a consumer-owned
   * file, and a selection run performs none of the non-file side effects (no
   * `core` symlink, no shared-asset or root app-icon link, no game-tree path
   * rewrite — a one-line note records that). Names are literal (no globs) and
   * an unknown name fails the run **before** anything is written.
   *
   * When omitted the run is a full run: every generated file is a write
   * candidate and the side effects apply, which is what the sibling
   * `tce-<game>` repos rely on to receive template updates.
   */
  only?: string[];
  /**
   * Allow overwriting a **selected** file whose content differs from the
   * template. Without it such a file classifies `skip-local` and is left
   * untouched, so a run cannot silently clobber a hand-edited generated file.
   *
   * A full run implies force (`effectiveForce = force || only === undefined`):
   * "regenerate everything" is inherently the overwrite mode.
   */
  force?: boolean;
  /**
   * Opt in to the game-tree **migration**: rewrite `example-games/<game>/` →
   * `src/` and the accompanying quoted-`scripts/`, core-`src/` and
   * relative-`scripts/` references in the game's own `tests/` and `src/`
   * trees.
   *
   * **Off by default**, deliberately: the rewrite used to run on every
   * scaffold, so a routine re-scaffold could edit a consumer's tests or
   * source — and the blanket rewrite also touched files with no genuine
   * game-tree reference (a drift guard's own `STALE_PREFIX`, run-tests
   * imports, documented local edits). A fresh repo does not need it either:
   * `scripts/extract-repos.sh --path-rename` already produces the `src/`
   * layout (CG-0MVWGJRIO0094Y4Z).
   *
   * Only a file that genuinely contains `example-games/<game>/` is migrated.
   * Combined with a dry run nothing is written and
   * {@link ScaffoldResult.migrations} previews the affected files. Mutually
   * exclusive with {@link ScaffoldOptions.only}, which promises "no rewrite".
   */
  migrateGamePaths?: boolean;
  /**
   * Override the resolved `measure_context.py` path (tests inject a stub so the
   * thresholds contract is provable without the framework install). When
   * omitted the local-then-global resolution in
   * {@link resolveMeasureContext} is used.
   */
  measureContextPath?: string;
}

/** Why the scaffold picked the game version it wrote. */
export type ScaffoldVersionSource = 'explicit' | 'preserved' | 'baseline';

/**
 * What a scaffold run did (or, in a dry run, would do) to one generated file.
 *
 * The vocabulary is fixed by the parent contract (CG-0MVWFN1HX004B5PN):
 *
 * - `create` — the target was absent and is written.
 * - `update` — the target exists and differs from the template, and is written.
 * - `unchanged` — the target exists and is byte-identical, so nothing is written.
 * - `skip-local` — the target exists and differs, and is deliberately left
 *   alone (the write-gating slice, CG-0MVWGJPPA000GBE7).
 */
export type ScaffoldFileAction =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'skip-local';

/** Per-file classification reported by every scaffold run (dry or real). */
export interface ScaffoldFileReport {
  /** Generated file path, relative to the game repo root (POSIX separators). */
  path: string;
  action: ScaffoldFileAction;
}

/**
 * One textual rewrite the opt-in game-tree migration can apply to a consumer
 * file, in application order.
 *
 * - `game-tree-prefix` — `example-games/<game>/…` → `src/…`.
 * - `relative-scripts-import` — `(../)+scripts/<module>` → `@core-scripts/<module>`.
 * - `quoted-scripts-path` — a quoted `scripts/…` → `core/scripts/…`.
 * - `core-src-path` — a quoted `src/<core-dir>` → `core/src/<core-dir>`.
 */
export type GameTreeRewriteKind =
  | 'game-tree-prefix'
  | 'relative-scripts-import'
  | 'quoted-scripts-path'
  | 'core-src-path';

/** One entry of the game-tree migration report. */
export interface ScaffoldMigrationReport {
  /** File the migration affects, relative to the game repo root (POSIX). */
  path: string;
  /** Which of the textual rewrites apply to that file, in application order. */
  rewrites: GameTreeRewriteKind[];
}

/**
 * Outcome of wiring `core.hooksPath` in the generated repo
 * (CG-0MW0KURL8002XOV9).
 *
 * `applied` is true only for a real (non-dry, non-selection) run in a git
 * repository; every other case carries a `reason` and never throws.
 */
export interface ScaffoldHooksPathReport {
  applied: boolean;
  /** The configured value when applied. */
  value?: string;
  /** Why the wiring was skipped (not a git repo, dry run, selection run). */
  reason?: string;
}

/**
 * Outcome of generating `docs/dev/context-budget.thresholds.json`
 * (CG-0MW0KURL8002XOV9).
 *
 * Fail-open by design: when the measurement tooling is unavailable no file is
 * written (never a zeroed guess) and `reason` names the remedy.
 */
export interface ScaffoldThresholdsReport {
  generated: boolean;
  /** Repo-relative thresholds path. */
  path: string;
  /** The measurement script that produced the values. */
  measureScript?: string;
  /** Why no thresholds file was generated. */
  reason?: string;
}

/** Result of {@link scaffoldGameRepo}. */
export interface ScaffoldResult {
  gameRepoRoot: string;
  coreRoot: string;
  coreRel: string;
  presetPath: string;
  /**
   * The classification of every generated file, repo-relative and in a stable
   * order. This is the machine-readable report a consumer reads **before**
   * trusting a run: `--dry-run` classifies without touching the disk, a real
   * run classifies and applies, and both report the same shape.
   */
  files: ScaffoldFileReport[];
  /**
   * Compatibility projection of the `create` + `update` entries in
   * {@link files}; empty for a dry run or a run with nothing to write.
   */
  written: string[];
  symlinks: string[];
  /** Test/source files whose `example-games/<game>/` paths were rewritten. */
  rewritten: string[];
  /**
   * The game-tree migration report: one entry per file the opt-in
   * `--migrate-game-paths` run rewrites — or, in a dry run, would rewrite —
   * naming which rewrite applies. Empty unless the migration is requested.
   */
  migrations: ScaffoldMigrationReport[];
  /** Shared core assets linked into `public/assets` (F1 asset table). */
  assetLinks: string[];
  /** Core root app-icon files linked into `public/` (CG-0MUUFZSE90061KKL). */
  publicLinks: string[];
  /** The version written to the game's `package.json`. */
  version: string;
  /** Why {@link version} was chosen. */
  versionSource: ScaffoldVersionSource;
  /**
   * One-line note present only for a selection (`--only`) run, recording that
   * the non-file side effects were skipped (the orthogonal
   * `symlinks`/`assetLinks`/`publicLinks`/`rewritten` lists come back empty).
   */
  selectionNote?: string;
  /**
   * The `core.hooksPath` wiring outcome (CG-0MW0KURL8002XOV9). Local git
   * config, so a **fresh clone still needs one activation step**
   * (`install_pi.sh` or `git config core.hooksPath .githooks`).
   */
  hooksPath: ScaffoldHooksPathReport;
  /** The generated context-budget thresholds outcome. */
  thresholds: ScaffoldThresholdsReport;
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
 * Read the `version` field of an existing game repo `package.json`.
 *
 * Total by design: returns the string version when the file exists and parses
 * with a string `version`; `undefined` when the file is absent, unreadable,
 * malformed, or declares no string version — callers then fall back to
 * {@link GAME_INITIAL_VERSION}. This is the preserve-on-re-scaffold seam: a
 * re-scaffold must not clobber a game's own release version.
 */
export function readExistingPackageVersion(
  gameRepoRoot: string,
): string | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(gameRepoRoot, 'package.json'), 'utf-8'),
    ) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
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
  version: string = GAME_INITIAL_VERSION,
): string {
  const pkg = {
    name: `tce-${game}`,
    // The game owns its version (CG-0MVGF2QE9008NA5R): the caller decides it
    // (baseline / preserved / explicit), never the core manifest.
    version,
    private: true,
    description:
      `Single-game Tableau Card Engine launcher for "${game}". ` +
      `Composes the engine checkout at ${coreRel} and builds web + Electron renderer bundles.`,
    type: 'module',
    scripts: {
      // Inherit the core toolchain scripts (save-load-smoke, monte-carlo,
      // balance, replay, …) so a game's tests can invoke them, then override
      // the repo-specific entry points below. Option C (F9/C1) moves the game
      // tree to `src/`, so any inherited script that references
      // `example-games/<game>/…` is repointed accordingly. Scripts that only
      // work from the core checkout are dropped first — a game repo has no
      // root `scripts/` tree ({@link CORE_ONLY_SCRIPTS}, MS-0MVO30VXS002A1Z0).
      ...Object.fromEntries(
        Object.entries(manifest.scripts ?? {})
          .filter(
            ([name]) => !(CORE_ONLY_SCRIPTS as readonly string[]).includes(name),
          )
          .map(([name, cmd]) => [
            name,
            cmd.split(`example-games/${game}/`).join('src/'),
          ]),
      ),
      // Interactive dev start: the soft variant of `engine:sync` composes the
      // latest engine but never blocks on a dirty `./core` — it warns and
      // serves the developer's working tree instead (CG-0MVZJ35EV00690W5).
      // Build/release paths keep the strict `engine:sync` guard below.
      dev: 'npm run engine:dev-sync && vite --host',
      build: `npm run engine:sync && tsc --noEmit && vite build`,
      'build:electron': `npm run engine:sync && tsc --noEmit && vite build --mode electron`,
      'build:release': `npm run engine:verify && tsc --noEmit && vite build`,
      // Engine submodule sync/verify (MS-0MVCRGKZY007DIED): dev builds always
      // compose the latest engine remote head; release builds compile exactly
      // the committed `configs/engine-pin.json` SHA. The script is canonical
      // in the engine repo (`<coreRel>/scripts/engine-sync.mjs`); game repos
      // invoke it through the submodule — there is no game-repo `scripts/`
      // tree (Option C).
      'engine:sync': `node ${coreRel}/scripts/engine-sync.mjs sync`,
      'engine:dev-sync': `node ${coreRel}/scripts/engine-sync.mjs sync --soft`,
      'engine:verify': `node ${coreRel}/scripts/engine-sync.mjs verify`,
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
import { transcriptPersistPlugin, DEV_WATCH_IGNORE_PATTERNS } from '${coreRel}/scripts/vite-transcript-plugin';

const coreRoot = path.resolve(__dirname, '${coreRel}');
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
);
/**
 * Production base path for the GitHub Pages project site.
 *
 * Derived generically from the package name (the last path segment, so a
 * scoped package name yields its final segment), with a PAGES_BASE environment
 * override for forks or custom domains. No hard-coded repository name, so a
 * re-scaffold never regresses the Pages deployment.
 */
function resolvePagesBase(): string {
  const override = process.env.PAGES_BASE;
  if (override && override.trim() !== '') {
    const trimmed = override.trim();
    const stripped = trimmed.split('/').filter(Boolean).join('/');
    return stripped === '' ? '/' : '/' + stripped + '/';
  }
  const name = String(pkg.name ?? 'app');
  const segment = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
  return '/' + segment + '/';
}
// A game repo's only preset is ./configs/${DEFAULT_GAME_PRESET}.json; the
// plugin default (core-only) applies to the core repo. GAMES_CONFIG can
// still override for an ad-hoc build.
const presetEnv = {
  ...process.env,
  GAMES_CONFIG: process.env.GAMES_CONFIG ?? '${DEFAULT_GAME_PRESET}',
};

export default defineConfig(({ command, mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Electron uses file:// → relative paths; production (GitHub Pages)
  // uses the project path derived from the package name; dev uses root.
  base: mode === 'electron' ? './' : mode === 'production' ? resolvePagesBase() : '/',
  plugins: [
    // Reads ./configs/${DEFAULT_GAME_PRESET}.json and generates
    // 'virtual:game-registry' (Gym from the core + this one game).
    gameDiscoveryPlugin({ projectRoot: __dirname, coreRoot, env: presetEnv }),
    // Persist transcripts to data/transcripts/<game>/ during a normal dev
    // session: this is the middleware behind POST /api/transcripts, so without
    // it every game-over 404s in the browser console. Dev-serve only, and never
    // under Vitest (the plugin writes to disk — see the core docs/DEVELOPER.md
    // section on Transcript Persistence). Mirrors core/vite.config.ts.
    ...(command === 'serve' && !process.env.VITEST ? [transcriptPersistPlugin()] : []),
  ],
  resolve: {
    alias: resolveCoreAliases(coreRoot),
    // Shared runtime deps must resolve to exactly ONE copy (phaser, tone): a
    // second copy (e.g. an npm install inside the core submodule) becomes a
    // distinct module id and the Node-env unit tests' vi.mock('phaser') stops
    // applying, evaluating real Phaser on collection. Mirrors the
    // core/vite.config.ts dedupe.
    dedupe: ['phaser', 'tone'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: false,
    watch: {
      // Exclude dev-output trees and the .worklog/ worktree checkouts from the
      // file watcher. .worklog/worktrees are symlinks into other full project
      // checkouts (including a game <-> Tableau-Card-Engine cycle), so a
      // recursive watch walks tens of thousands of directories and exhausts
      // fs.inotify.max_user_watches (ENOSPC), crashing the dev server on startup.
      ignored: [...DEV_WATCH_IGNORE_PATTERNS],
    },
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
        '@story-line': [`${coreRel}/src/story-line`],
        '@story-line/*': [`${coreRel}/src/story-line/*`],
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
  // \`Phaser.AUTO\` = WebGL with a Canvas fallback (CG-0MVTQ3WPV003ZECA).
  // Games rely on Phaser 4's Filter pipeline (e.g. the Mask filter that
  // replaces the Canvas-only \`GeometryMask\`); forcing Canvas here would
  // silently drop that pipeline on every desktop/GPU browser.
  type: Phaser.AUTO,
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

interface ApplyOptions {
  /** Game repo root the generated paths are reported relative to. */
  gameRepoRoot: string;
  /** When true, classify only: no `mkdir`, no write. */
  dryRun?: boolean;
  /**
   * Whether the caller selected this repo-relative path for writing. False in
   * a selection (`--only`) run for every generated file the caller did not
   * name; such a file is never written.
   */
  isSelected: (reportPath: string) => boolean;
  /**
   * `force || only === undefined` — whether a **selected** file whose content
   * differs from the template may be overwritten (see
   * {@link ScaffoldOptions.force}).
   */
  effectiveForce: boolean;
}

/**
 * Why writes are classified before they happen (CG-0MVWFN1HX004B5PN).
 *
 * A scaffolded file is **generated**, but the checkout it lands in is a live
 * consumer repo that owns its own wiring: `main.ts` gains game-specific boot
 * code, `vite.config.ts` gains documented local edits, and a drift guard lives
 * in `tests/`. Blindly overwriting every template on a routine re-scaffold
 * destroys that local work (the MS-0MVVGUYYG004XXOB incident rewrote 11 files
 * in one run). So every generated file is classified against what is already
 * on disk **before** anything is written, the classification is returned in
 * {@link ScaffoldResult.files} and printed on every run, and `--dry-run` runs
 * the identical classification while writing nothing. A caller can therefore
 * see exactly which files a run would touch — and the write itself is gated on
 * the same classification (`--only` / `--force` / `skip-local`,
 * CG-0MVWGJPPA000GBE7).
 */

/**
 * Classify one generated file against the on-disk content (CG-0MVWFN1HX004B5PN)
 * and, unless this is a dry run, apply the change.
 *
 * Precedence is deliberate, and it is the whole write-gating contract
 * (CG-0MVWGJPPA000GBE7):
 *
 * 1. **Unselected** file (selection run, `--only` did not name it) — never
 *    written: `unchanged` when it already matches the template, `skip-local`
 *    otherwise (an absent unselected file is `skip-local` too: `create` would
 *    claim a write that the selection suppressed).
 * 2. **Selected** file, absent → `create`.
 * 3. **Selected** file, byte-identical → `unchanged`, no write.
 * 4. **Selected** file, differs → `update` when `effectiveForce`, else
 *    `skip-local`: a diverged generated file is local work and is only
 *    overwritten when the caller explicitly asked for it.
 *
 * A dry run returns the same report without touching the disk, so a preview
 * and the real run always agree.
 */
function classifyAndApply(
  filePath: string,
  contents: string,
  opts: ApplyOptions,
): ScaffoldFileReport {
  const reportPath = path
    .relative(opts.gameRepoRoot, filePath)
    .split(path.sep)
    .join('/');
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf-8')
    : undefined;
  const action: ScaffoldFileAction = !opts.isSelected(reportPath)
    ? existing === contents
      ? 'unchanged'
      : 'skip-local'
    : existing === undefined
      ? 'create'
      : existing === contents
        ? 'unchanged'
        : opts.effectiveForce
          ? 'update'
          : 'skip-local';

  if ((action === 'create' || action === 'update') && !opts.dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf-8');
  }
  return { path: reportPath, action };
}

/**
 * Classify + apply one generated file, recording the report and (only when a
 * real write happened) the compatibility `written` list.
 *
 * A thin wrapper over {@link classifyAndApply} so each call site stays a
 * single readable line.
 */
function writeFile(
  filePath: string,
  contents: string,
  ctx: ApplyOptions & {
    dryRun: boolean;
    files: ScaffoldFileReport[];
    written: string[];
  },
): void {
  const report = classifyAndApply(filePath, contents, ctx);
  ctx.files.push(report);
  // `written` is the compatibility projection of what a real run actually
  // wrote: `skip-local` (and `unchanged`) files are deliberately absent.
  if (!ctx.dryRun && (report.action === 'create' || report.action === 'update')) {
    ctx.written.push(filePath);
  }
}

/**
 * Normalise `--only` names to repo-relative POSIX paths.
 *
 * Trims whitespace, converts Windows separators, strips a leading `./` and
 * de-duplicates, so `./main.ts` and `main.ts` name the same generated file.
 * Globs are rejected: a selection must name a generated file exactly, or it
 * would resolve to nothing and produce a silent no-op scaffold.
 */
function normalizeOnly(names: string[]): string[] {
  const normalized: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (name === '') continue;
    if (/[*?[\]]/.test(name)) {
      throw new Error(
        `[scaffold] --only accepts literal generated file names, not globs: ${raw}`,
      );
    }
    if (!normalized.includes(name)) normalized.push(name);
  }
  if (normalized.length === 0) {
    throw new Error('[scaffold] --only requires at least one generated file name.');
  }
  return normalized;
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
 * Read a string-array field from the core's `repo-layout.json` contract.
 *
 * Returns an empty list when the layout file, the field, or a valid array is
 * absent — callers then compose nothing rather than throwing.
 */
function readLayoutList(coreRoot: string, key: string): string[] {
  const layoutPath = path.join(coreRoot, 'scripts', 'configs', 'repo-layout.json');
  if (!fs.existsSync(layoutPath)) return [];
  try {
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    const list = layout[key];
    return Array.isArray(list)
      ? list.filter((a): a is string => typeof a === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Realise one shared entry as a link under the game repo's `public/<subdir>`.
 *
 * The link target is stored relative to the link's own directory so a nested
 * link stays valid when the composed sibling layout is moved. Directories get
 * a `dir` symlink with a Windows `junction` fallback; files get a plain file
 * symlink (falling back to a byte copy on platforms where symlinks are
 * unavailable). Missing sources and already-existing links are skipped, which
 * makes composition idempotent.
 *
 * @returns `true` when a new link was created.
 */
function linkSharedEntry(
  gameRepoRoot: string,
  coreRoot: string,
  subdir: string,
  entry: string,
): boolean {
  const clean = entry.replace(/\/+$/, '');
  if (!clean) return false;
  const target = path.join(coreRoot, 'public', subdir, clean);
  const link = path.join(gameRepoRoot, 'public', subdir, clean);
  if (!fs.existsSync(target)) return false;
  if (fs.lstatSync(link, { throwIfNoEntry: false })) return false;
  fs.mkdirSync(path.dirname(link), { recursive: true });
  const relTarget = path.relative(path.dirname(link), target);
  if (fs.statSync(target).isDirectory()) {
    try {
      fs.symlinkSync(relTarget, link, 'dir');
    } catch {
      // Windows without developer mode needs a junction for directories.
      fs.symlinkSync(relTarget, link, 'junction');
    }
  } else {
    try {
      fs.symlinkSync(relTarget, link);
    } catch {
      // Windows without developer mode cannot create file symlinks; a copy
      // keeps the app runnable (the icon set is small and static).
      fs.copyFileSync(target, link);
    }
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
  const linked: string[] = [];
  for (const entry of readLayoutList(coreRoot, 'sharedAssets')) {
    if (linkSharedEntry(gameRepoRoot, coreRoot, 'assets', entry)) {
      linked.push(path.join(gameRepoRoot, 'public', 'assets', entry.replace(/\/+$/, '')));
    }
  }
  return linked;
}

/**
 * Link the core-owned root app-icon files into the game repo's `public/` root.
 *
 * The icon set is generated from the tracked `core/public/favicon.svg`
 * (CG-0MUTTXRWZ009NUB9) and enumerated by `repo-layout.json → sharedPublicRoot`.
 * Composing them here keeps the game repo's `index.html` base-relative icon
 * links resolving in dev, production and Electron builds without committing a
 * divergent hand-authored copy.
 *
 * @returns The created symlink paths.
 */
export function linkSharedPublicAssets(
  gameRepoRoot: string,
  coreRoot: string,
): string[] {
  const linked: string[] = [];
  for (const entry of readLayoutList(coreRoot, 'sharedPublicRoot')) {
    if (linkSharedEntry(gameRepoRoot, coreRoot, '', entry)) {
      linked.push(path.join(gameRepoRoot, 'public', entry.replace(/\/+$/, '')));
    }
  }
  return linked;
}

/**
 * Read every committed hook from the core checkout, sorted by filename.
 *
 * The core `.githooks/` directory is the single source of truth: the scaffold
 * copies these files byte-for-byte rather than rendering hook text, so a hook
 * fix in TCE reaches every generated game repo with no forked copy to drift
 * (CG-0MW0KURL8002XOV9). Absence of the directory is a no-op, not an error —
 * an older core checkout must not fail a scaffold.
 */
export function readCoreHooks(
  coreRoot: string,
): Array<{ name: string; contents: string; executable: boolean }> {
  const hooksDir = path.join(coreRoot, GITHOOKS_DIR);
  if (!fs.existsSync(hooksDir) || !fs.statSync(hooksDir).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(hooksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const filePath = path.join(hooksDir, entry.name);
      const stat = fs.statSync(filePath);
      return {
        name: entry.name,
        contents: fs.readFileSync(filePath, 'utf-8'),
        executable: (stat.mode & 0o111) !== 0,
      };
    });
}

/**
 * Resolve `measure_context.py` local-then-global — the same order
 * `.githooks/pre-push` and `scripts/refresh-context-thresholds.sh` use
 * (CG-0MW0KURL8002XOV9).
 *
 * Returns `undefined` when neither location exists; the caller then records a
 * fail-open report entry instead of writing guessed thresholds.
 */
export function resolveMeasureContext(
  coreRoot: string,
  homeDir: string = os.homedir(),
): string | undefined {
  const local = path.join(
    coreRoot,
    'skill',
    'context-audit',
    'scripts',
    'measure_context.py',
  );
  if (fs.existsSync(local)) return local;
  const global = path.join(
    homeDir,
    '.pi',
    'agent',
    'skills',
    'context-audit',
    'scripts',
    'measure_context.py',
  );
  return fs.existsSync(global) ? global : undefined;
}

/** The four components a measured thresholds file carries. */
export interface ContextThresholds {
  global_agents: number;
  project_agents: number;
  skills_prose: number;
  total: number;
}

/**
 * Measure a game repo's startup context surface.
 *
 * Shells out to `measure_context.py --generate-thresholds` with the repo root
 * passed explicitly (the global script's default root is its own checkout,
 * not the game repo). Read-only and never throws: any failure comes back as a
 * `reason` so the scaffold can stay fail-open with an actionable report.
 */
export function measureContextThresholds(
  measureScript: string,
  gameRepoRoot: string,
): { thresholds?: ContextThresholds; reason?: string } {
  const run = spawnSync(
    'python3',
    [
      measureScript,
      '--repo-root',
      gameRepoRoot,
      '--include-hidden',
      '--generate-thresholds',
    ],
    { encoding: 'utf-8' },
  );
  if (run.error) {
    return {
      reason:
        `python3/measure_context.py could not run (${run.error.message}); ` +
        'install the framework skills with scripts/install_pi.sh',
    };
  }
  if (run.status !== 0) {
    return {
      reason:
        `measure_context.py exited ${run.status ?? 'unknown'}: ` +
        `${(run.stderr || '').trim() || 'no diagnostic'}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    return { reason: 'measure_context.py did not emit a JSON thresholds object' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { reason: 'measure_context.py did not emit a JSON thresholds object' };
  }
  const record = parsed as Record<string, unknown>;
  const keys = ['global_agents', 'project_agents', 'skills_prose', 'total'] as const;
  for (const key of keys) {
    if (typeof record[key] !== 'number') {
      return { reason: `measured thresholds are missing numeric '${key}'` };
    }
  }
  return { thresholds: record as unknown as ContextThresholds };
}

/**
 * The short guidance note shipped in a generated game repo beside its
 * thresholds file (CG-0MW0KURL8002XOV9).
 *
 * It is generated rather than copied because the core's
 * `docs/dev/context-budget.md` documents TCE's own budget history; a game repo
 * needs the activation/refresh/scope contract, not that history.
 */
export function renderContextBudgetDoc(game: string): string {
  return [
    `# Startup Context Budget — tce-${game}`,
    '',
    'This repository commits a startup-context budget in',
    `\`${CONTEXT_THRESHOLDS_PATH}\` and enforces it at push time through the`,
    'committed `.githooks/pre-push` gate (copied from the engine core).',
    '',
    '## What the gate measures',
    '',
    '| Component | What it counts |',
    '|-----------|----------------|',
    '| `global_agents` | the global `AGENTS_GLOBAL.md` ruleset |',
    '| `project_agents` | this repository\'s `AGENTS.md` |',
    '| `skills_prose` | the frontmatter `description` prose of `skill/*/SKILL.md` (with `--include-hidden`) |',
    '| `total` | the sum of the components above |',
    '',
    '## Activating the hooks in a fresh clone',
    '',
    '`core.hooksPath` is **local git config**, so a fresh clone still needs one',
    'activation step before the committed hooks run:',
    '',
    '```bash',
    'git config core.hooksPath .githooks   # or run the framework install_pi.sh',
    '```',
    '',
    '## Refreshing the budget',
    '',
    'Any commit that changes `AGENTS.md` (or skills prose) must refresh the',
    'thresholds in the same commit:',
    '',
    '```bash',
    './scripts/refresh-context-thresholds.sh          # write refreshed thresholds',
    './scripts/refresh-context-thresholds.sh --check  # verify only',
    '```',
    '',
    'The gate is fail-open only when the measurement tooling or the thresholds',
    'file is absent; with both present a regression fails the push.',
    '',
  ].join('\n');
}

/**
 * Wire `core.hooksPath` for a real scaffold run.
 *
 * Skipped (with an explicit reason, never a throw) when the target is not a git
 * repository, so the existing pre-`git init` scaffold use case keeps working.
 * Only the repo-local config is touched; the committed `.githooks/` directory
 * is what a fresh clone activates.
 */
export function applyHooksPath(gameRepoRoot: string): ScaffoldHooksPathReport {
  const probe = spawnSync('git', ['-C', gameRepoRoot, 'rev-parse', '--git-dir'], {
    encoding: 'utf-8',
  });
  if (probe.error || probe.status !== 0) {
    return {
      applied: false,
      reason: 'target is not a git repository (run git init first)',
    };
  }
  const set = spawnSync(
    'git',
    ['-C', gameRepoRoot, 'config', 'core.hooksPath', GITHOOKS_DIR],
    { encoding: 'utf-8' },
  );
  if (set.error || set.status !== 0) {
    return {
      applied: false,
      reason:
        `git config core.hooksPath failed: ` +
        `${(set.error?.message ?? set.stderr ?? '').toString().trim() || 'unknown error'}`,
    };
  }
  return { applied: true, value: GITHOOKS_DIR };
}

/**
 * The textual rewrites the game-tree migration applies, **in order**.
 *
 * Each rule takes the current contents and returns the rewritten contents, so
 * the chain reproduces the original single-expression rewrite verbatim while
 * letting the planner record *which* rewrite actually fired for a file.
 */
const GAME_TREE_REWRITE_RULES: ReadonlyArray<{
  kind: GameTreeRewriteKind;
  apply: (contents: string, needle: string) => string;
}> = [
  // Rule 1 — `example-games/<game>/…` -> `src/…` (game tree).
  {
    kind: 'game-tree-prefix',
    apply: (contents, needle) => contents.split(needle).join('src/'),
  },
  // Rule 2 — a relative `(../)+scripts/<module>` path -> `@core-scripts/<module>`.
  //    In the Option C layout a game repo has no repository-root `scripts/`
  //    tree (its own scripts live under `src/scripts/`), so a root-relative
  //    `scripts/` reference always denotes a core-owned script and the alias
  //    resolves it against the core checkout.
  {
    kind: 'relative-scripts-import',
    apply: (contents) =>
      contents.replace(
        /(['"])((?:\.\.\/)+)scripts\/([A-Za-z0-9_./-]+)\1/g,
        (_match, quote: string, _dots: string, moduleName: string) =>
          `${quote}@core-scripts/${moduleName}${quote}`,
      ),
  },
  // Rule 3 — a quoted `scripts/…` path -> `core/scripts/…`: game tests invoke
  //    core-owned CLIs (e.g. `scripts/replay.ts`) that now live in the core
  //    checkout, not the game repo. `src/scripts/…` is untouched.
  {
    kind: 'quoted-scripts-path',
    apply: (contents) =>
      contents
        .split("'scripts/")
        .join("'core/scripts/")
        .split('"scripts/')
        .join('"core/scripts/'),
  },
  // Rule 4 — a quoted `src/<core-dir>…` path -> `core/src/<core-dir>…`: some
  //    main-street tests scan the core's UI/engine layers directly.
  {
    kind: 'core-src-path',
    apply: (contents) =>
      contents.replace(
        /(['"])src\/(core-engine|card-system|rule-engine|ui|ai)(?=[/'"])/g,
        '$1core/src/$2',
      ),
  },
];

/** A planned (not yet applied) rewrite of one consumer file. */
interface PlannedGameTreeRewrite {
  filePath: string;
  updated: string;
  rewrites: GameTreeRewriteKind[];
}

/**
 * Plan the game-tree path rewrite for one game repo without writing anything.
 *
 * A file is a candidate only when it genuinely references this game's tree
 * (`example-games/<game>/`). That is the `--migrate-game-paths` scoping rule
 * (CG-0MVWGJRIO0094Y4Z): the rewrite used to touch every test/source file, so
 * a drift guard's own `STALE_PREFIX`, a run-tests import or a documented local
 * edit could be edited by a routine re-scaffold. A file with no genuine
 * game-tree reference is reported as unaffected (absent from the plan) and is
 * left byte-identical.
 */
function planGameTreePathRewrites(
  gameRepoRoot: string,
  game: string,
): PlannedGameTreeRewrite[] {
  const needle = `example-games/${game}/`;
  const planned: PlannedGameTreeRewrite[] = [];
  const consider = (filePath: string): void => {
    if (!/\.(ts|tsx|mjs|cjs|js)$/.test(filePath)) return;
    const original = fs.readFileSync(filePath, 'utf-8');
    if (!original.includes(needle)) return;
    const rewrites: GameTreeRewriteKind[] = [];
    let updated = original;
    for (const rule of GAME_TREE_REWRITE_RULES) {
      const next = rule.apply(updated, needle);
      if (next !== updated) {
        rewrites.push(rule.kind);
        updated = next;
      }
    }
    if (updated !== original) {
      planned.push({ filePath, updated, rewrites });
    }
  };
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else consider(full);
    }
  };
  walk(path.join(gameRepoRoot, 'tests'));
  walk(path.join(gameRepoRoot, 'src'));
  return planned;
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
 * This is **not** called by a routine scaffold: it is the opt-in
 * `--migrate-game-paths` migration (CG-0MVWGJRIO0094Y4Z). The signature is
 * unchanged because other tooling and tests import it directly; only the
 * files that genuinely reference the game tree are touched.
 *
 * @returns The rewritten file paths.
 */
export function rewriteGameTreePaths(gameRepoRoot: string, game: string): string[] {
  const rewritten: string[] = [];
  for (const plan of planGameTreePathRewrites(gameRepoRoot, game)) {
    fs.writeFileSync(plan.filePath, plan.updated, 'utf-8');
    rewritten.push(plan.filePath);
  }
  return rewritten;
}

/**
 * Scaffold a per-game repo in place.
 *
 * Classifies (and, for a real run, writes) `package.json`, `vite.config.ts`,
 * `tsconfig.json`, `main.ts`, `env.d.ts`, `index.html` (copied from the core)
 * and `configs/<preset>.json`, and creates the `core` symlink into the sibling
 * core checkout. With {@link ScaffoldOptions.dryRun} it classifies only and
 * leaves every file, link and test/source rewrite untouched. With
 * {@link ScaffoldOptions.only} it restricts writing to the named generated
 * files and performs no non-file side effect at all.
 *
 * @param options See {@link ScaffoldOptions}.
 * @returns The per-file classification, what was written and what was linked.
 * @throws When the game repo root or core root does not exist, or when a
 *   selected (`only`) name is not one of this run's generated paths — the
 *   error lists the valid paths and nothing is written.
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
        'Clone/check out Tableau-Card-Engine next to the game repo.',
    );
  }

  const manifest = options.coreManifest ?? readCoreManifest(coreRoot);
  // Per-game version policy: an explicit override wins, else preserve an
  // existing released version, else seed the independent baseline.
  const existingVersion = readExistingPackageVersion(gameRepoRoot);
  const version = options.version ?? existingVersion ?? GAME_INITIAL_VERSION;
  const versionSource: ScaffoldVersionSource =
    options.version !== undefined
      ? 'explicit'
      : existingVersion !== undefined
        ? 'preserved'
        : 'baseline';
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
  const files: ScaffoldFileReport[] = [];
  const dryRun = options.dryRun === true;

  // Write gating (CG-0MVWGJPPA000GBE7). A selection run touches only the named
  // generated files; a full run (no `only`) regenerates every generated file,
  // which is what the eight sibling `tce-<game>` repos rely on to receive
  // template updates — hence `effectiveForce` is implied by a full run.
  const only = options.only === undefined ? undefined : normalizeOnly(options.only);
  const selectionMode = only !== undefined;
  const effectiveForce = options.force === true || !selectionMode;

  // The game-tree path rewrite is opt-in (CG-0MVWGJRIO0094Y4Z). It used to run
  // on every scaffold, so a routine re-scaffold could edit a consumer's tests
  // or source — and the blanket rewrite also touched files with no genuine
  // game-tree reference (a drift guard's own `STALE_PREFIX`, run-tests imports,
  // documented local edits). Fresh repos do not need it:
  // `scripts/extract-repos.sh --path-rename` already produced the `src/`
  // layout. `--only` promises "no rewrite", so the pair is contradictory:
  // refuse before anything is written rather than half-migrate a repo.
  const migrateGamePaths = options.migrateGamePaths === true;
  if (migrateGamePaths && selectionMode) {
    throw new Error(
      '[scaffold] --migrate-game-paths cannot be combined with --only: ' +
        '--only promises "no rewrite", so a selection run never migrates. ' +
        'Drop one of the two flags.',
    );
  }

  // Build the whole plan (path + rendered contents) before writing anything:
  // `--only` validation must fail before a single byte lands, and the valid
  // name list is exactly this plan.
  const plan: Array<{ filePath: string; contents: string; executable?: boolean }> = [
    {
      filePath: path.join(gameRepoRoot, 'package.json'),
      contents: renderPackageJson(options.game, manifest, coreRel, version),
    },
    {
      filePath: path.join(gameRepoRoot, 'vite.config.ts'),
      contents: renderViteConfig(options.game, coreRel),
    },
    {
      filePath: path.join(gameRepoRoot, 'tsconfig.json'),
      contents: renderTsconfig(options.game, coreRel),
    },
    {
      filePath: path.join(gameRepoRoot, 'env.d.ts'),
      contents: renderEnvDts(),
    },
    {
      filePath: path.join(gameRepoRoot, 'main.ts'),
      contents: renderMainTs(),
    },
  ];

  // index.html is copied verbatim from the core so it stays in sync.
  const coreIndex = path.join(coreRoot, 'index.html');
  if (fs.existsSync(coreIndex)) {
    plan.push({
      filePath: path.join(gameRepoRoot, 'index.html'),
      contents: fs.readFileSync(coreIndex, 'utf-8'),
    });
  }

  plan.push({
    filePath: path.join(
      gameRepoRoot,
      GAME_REPO_CONFIGS_DIR,
      `${DEFAULT_GAME_PRESET}.json`,
    ),
    contents: renderPreset(options.game, scenePath, adapterPath),
  });

  // ── Committed git hooks + context budget (CG-0MW0KURL8002XOV9) ──────────
  // Hooks are copied verbatim from the core checkout (single source of truth),
  // so a scaffolded repo ships the unified full-suite pre-push gate instead of
  // a forked, gate-less copy. The thresholds file is measured from the
  // generated repo's own surface; when the measurement tooling is unavailable
  // nothing is written and the report names the remedy (fail-open).
  const coreHooks = readCoreHooks(coreRoot);
  for (const hook of coreHooks) {
    plan.push({
      filePath: path.join(gameRepoRoot, GITHOOKS_DIR, hook.name),
      contents: hook.contents,
      executable: hook.executable,
    });
  }

  const measureScript =
    options.measureContextPath ?? resolveMeasureContext(coreRoot);
  const measured = measureScript
    ? measureContextThresholds(measureScript, gameRepoRoot)
    : {
        reason:
          'measure_context.py not found; install the framework skills with ' +
          'scripts/install_pi.sh (thresholds gate stays fail-open)',
      };
  const thresholdsReport: ScaffoldThresholdsReport = {
    generated: measured.thresholds !== undefined,
    path: CONTEXT_THRESHOLDS_PATH,
    ...(measureScript === undefined ? {} : { measureScript }),
    ...(measured.thresholds === undefined ? { reason: measured.reason } : {}),
  };
  if (measured.thresholds !== undefined) {
    plan.push({
      filePath: path.join(gameRepoRoot, CONTEXT_THRESHOLDS_PATH),
      contents: `${JSON.stringify(measured.thresholds, null, 2)}\n`,
    });
    const refreshScript = path.join(coreRoot, REFRESH_THRESHOLDS_PATH);
    if (fs.existsSync(refreshScript)) {
      plan.push({
        filePath: path.join(gameRepoRoot, REFRESH_THRESHOLDS_PATH),
        contents: fs.readFileSync(refreshScript, 'utf-8'),
        executable: true,
      });
    }
    plan.push({
      filePath: path.join(gameRepoRoot, CONTEXT_BUDGET_DOC_PATH),
      contents: renderContextBudgetDoc(options.game),
    });
  }

  const reportPathOf = (filePath: string): string =>
    path.relative(gameRepoRoot, filePath).split(path.sep).join('/');

  if (only !== undefined) {
    const valid = plan.map((entry) => reportPathOf(entry.filePath));
    const unknown = only.filter((name) => !valid.includes(name));
    if (unknown.length > 0) {
      // Fail fast: a typo must not produce a silent no-op scaffold.
      throw new Error(
        `[scaffold] unknown --only file(s): ${unknown.join(', ')}. ` +
          `Valid generated paths: ${[...valid].sort().join(', ')}.`,
      );
    }
  }

  const writeCtx = {
    gameRepoRoot,
    dryRun,
    files,
    written,
    isSelected: (reportPath: string) =>
      only === undefined || only.includes(reportPath),
    effectiveForce,
  };

  for (const entry of plan) {
    writeFile(entry.filePath, entry.contents, writeCtx);
    // Hooks and the refresh entry point must stay executable. The apply step
    // above writes 0644, so restore the bit for a file this run may write
    // (a selection run only touches its selected files).
    if (entry.executable === true && !dryRun) {
      const reportPath = reportPathOf(entry.filePath);
      if (writeCtx.isSelected(reportPath)) {
        try {
          fs.chmodSync(entry.filePath, 0o755);
        } catch {
          // A mode we cannot set must not fail an otherwise valid scaffold.
        }
      }
    }
  }

  // Point the repo's *local* config at the copied hooks only after the plan
  // has been written. `core.hooksPath` is local config, so a fresh clone still
  // needs the documented one activation step (install_pi.sh or
  // `git config core.hooksPath .githooks`).
  const hooksPath: ScaffoldHooksPathReport =
    dryRun || selectionMode
      ? {
          applied: false,
          reason: dryRun
            ? 'dry run — nothing configured'
            : 'selection run — no side effects',
        }
      : coreHooks.length === 0
        ? {
            applied: false,
            reason: `core ${GITHOOKS_DIR}/ has no hook files`,
          }
        : applyHooksPath(gameRepoRoot);

  // Option C (C1): the game source occupies repo-root `src/`, so the
  // `src -> core/src` compatibility symlink (and the `scripts`,
  // `example-games/gym` and `tests/helpers` symlinks that propped up
  // root-relative imported paths) are no longer created. Engine imports go
  // through the path aliases; intra-test game-tree paths are rewritten to
  // `src/`. The only remaining link is `core` (the engine checkout / a git
  // submodule once remotes exist).
  //
  // Every side effect below is skipped in a dry run: the classification above
  // already reported what a real run would write, so a preview must not create
  // the `core` symlink, link shared assets, or rewrite the consumer's own
  // tests/source. A **selection** run skips them too: `--only main.ts` must
  // touch nothing but `main.ts`.
  const selectionNote = only === undefined
    ? undefined
    : `selection mode: only the ${only.length} selected generated file(s) may be written; ` +
      'skipped the core symlink, shared asset links, root app-icon links and game-tree path rewrites';

  if (!selectionMode && !dryRun && ensureDirSymlink(path.join(gameRepoRoot, 'core'), coreRoot)) {
    symlinks.push(path.join(gameRepoRoot, 'core'));
  }

  const skipSideEffects = dryRun || selectionMode;
  const assetLinks = skipSideEffects ? [] : linkSharedAssets(gameRepoRoot, coreRoot);
  const publicLinks = skipSideEffects
    ? []
    : linkSharedPublicAssets(gameRepoRoot, coreRoot);

  // Opt-in game-tree migration (CG-0MVWGJRIO0094Y4Z). The plan is computed
  // even in a dry run — that is exactly what a `--migrate-game-paths
  // --dry-run` preview reports — but nothing is written until a real run.
  const migrations: ScaffoldMigrationReport[] = migrateGamePaths
    ? planGameTreePathRewrites(gameRepoRoot, options.game).map((plan) => ({
        path: reportPathOf(plan.filePath),
        rewrites: plan.rewrites,
      }))
    : [];
  const rewritten = migrateGamePaths && !dryRun
    ? rewriteGameTreePaths(gameRepoRoot, options.game)
    : [];

  return {
    gameRepoRoot,
    coreRoot,
    coreRel,
    presetPath: path.join(
      gameRepoRoot,
      GAME_REPO_CONFIGS_DIR,
      `${DEFAULT_GAME_PRESET}.json`,
    ),
    files,
    written,
    symlinks,
    rewritten,
    migrations,
    assetLinks,
    publicLinks,
    version,
    versionSource,
    selectionNote,
    hooksPath,
    thresholds: thresholdsReport,
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
  version?: string;
  dryRun?: boolean;
  /** Generated files selected by `--only` (literal, repo-relative names). */
  only?: string[];
  /** `--force`: overwrite a selected file whose content differs. */
  force?: boolean;
  /** `--migrate-game-paths`: opt in to the game-tree path migration. */
  migrateGamePaths?: boolean;
  json?: boolean;
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
      case '--version':
        args.version = next;
        i += 1;
        break;
      case '--repos-dir':
        args.reposDir = next;
        i += 1;
        break;
      case '--all':
        args.all = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--only': {
        if (next === undefined || next.startsWith('--')) {
          throw new Error(
            '--only requires a comma-separated list of generated file names',
          );
        }
        const names = next
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name !== '');
        if (names.length === 0) {
          throw new Error('--only requires at least one generated file name');
        }
        for (const name of names) {
          // Literal names only: a glob would silently select nothing.
          if (/[*?[\]]/.test(name)) {
            throw new Error(
              `--only accepts literal generated file names, not globs: ${name}`,
            );
          }
        }
        args.only = [...(args.only ?? []), ...names];
        i += 1;
        break;
      }
      case '--force':
        args.force = true;
        break;
      case '--migrate-game-paths':
        args.migrateGamePaths = true;
        break;
      case '--json':
        args.json = true;
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
    'A real run also copies the core\'s committed .githooks/ (including the',
    'full-suite pre-push gate), points core.hooksPath at it, and generates',
    'docs/dev/context-budget.thresholds.json from the game repo\'s own surface.',
    '',
    'Options:',
    '  --game <id>              Game id (golf, main-street, …). Required unless --all.',
    '  --all                    Scaffold every game in scripts/configs/repo-layout.json.',
    '  --game-repo-root <path>  Game repo root. Defaults to <repos-dir>/tce-<id>.',
    '  --repos-dir <path>       Directory holding tce-<id> checkouts.',
    '  --core-root <path>       Core engine checkout. Defaults to',
    '                           <repos-dir-parent>/Tableau-Card-Engine.',
    '  --core-rel <path>        Core path as used inside the game repo',
    `                           (default: ${DEFAULT_CORE_REL}).`,
    '  --version <semver>       Explicit game package version (default:',
    '                           preserve the repo version, else seed 0.1.0).',
    '  --dry-run                Classify every generated file (create | update |',
    '                           unchanged | skip-local) and report it, writing',
    '                           nothing: no file, no symlink, no link, no path',
    '                           rewrite.',
    '  --only <file,...>        Regenerate only the named generated files',
    '                           (comma-separated, repo-relative, e.g. main.ts).',
    '                           Unselected generated files are left alone',
    '                           (skip-local) and no symlink, asset link or path',
    '                           rewrite is performed. Names are literal (no',
    '                           globs); an unknown name fails before any write.',
    '                           A selected file that differs from the template',
    '                           is only overwritten with --force.',
    '  --force                  Overwrite a selected generated file that',
    '                           differs from the template (default: leave it,',
    '                           reported as skip-local). A full run without',
    '                           --only always implies force.',
    '  --migrate-game-paths     Rewrite the game-tree references in the game\'s',
    '                           own tests/source: example-games/<game>/ -> src/',
    '                           plus the quoted-scripts, core-src and',
    '                           relative-scripts rewrites. Off by default — a',
    '                           routine re-scaffold must never edit a',
    '                           consumer\'s tests or source, and a fresh repo',
    '                           already has the src/ layout from',
    '                           extract-repos.sh --path-rename. Only a file that',
    '                           genuinely references example-games/<game>/ is',
    '                           touched. With --dry-run the affected files (and',
    '                           which rewrite applies) are reported, not',
    '                           written. Cannot be combined with --only.',
    '  --json                   Print one machine-readable JSON document for the',
    '                           run (an object, or an array with --all) carrying',
    '                           the per-file `files` report.',
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

  // `--only` promises "no rewrite", so a migration cannot be combined with a
  // selection: fail fast before anything is written.
  if (args.migrateGamePaths && args.only !== undefined) {
    console.error(
      'error: --migrate-game-paths cannot be combined with --only ' +
        '(--only promises "no rewrite").',
    );
    console.error(usage());
    return 1;
  }

  const reposDir = path.resolve(args.reposDir ?? path.join(process.cwd(), '..'));
  const coreRoot = path.resolve(
    args.coreRoot ?? path.join(reposDir, 'Tableau-Card-Engine'),
  );

  const games = args.all
    ? readLayoutGames(
        args.layout ?? path.join(coreRoot, 'scripts', 'configs', 'repo-layout.json'),
      )
    : [args.game as string];

  const manifest = readCoreManifest(coreRoot);
  let failures = 0;
  let lastGameRepoRoot = '';
  const results: ScaffoldResult[] = [];
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
        version: args.version,
        dryRun: args.dryRun,
        only: args.only,
        force: args.force,
        migrateGamePaths: args.migrateGamePaths,
      });
      results.push(result);
      if (args.json) continue;
      console.log(
        args.dryRun
          ? `Scaffolded tce-${game} (dry run — nothing written)`
          : `Scaffolded tce-${game}`,
      );
      console.log(`  game repo: ${result.gameRepoRoot}`);
      console.log(`  core:      ${result.coreRoot} (${result.coreRel})`);
      console.log(`  preset:    ${result.presetPath}`);
      console.log(`  version:   ${result.version} (${result.versionSource})`);
      // Hook activation and the context budget are part of the contract, so
      // name both outcomes on every run (CG-0MW0KURL8002XOV9). A skipped
      // wiring is reported with its reason, never silently omitted.
      console.log(
        result.hooksPath.applied
          ? `  hooks:     ${result.hooksPath.value} (core.hooksPath) — a fresh clone needs one activation step`
          : `  hooks:     not wired (${result.hooksPath.reason})`,
      );
      console.log(
        result.thresholds.generated
          ? `  budget:    ${result.thresholds.path} (measured)`
          : `  budget:    not generated (${result.thresholds.reason})`,
      );
      // One line per generated file: the classification **is** the report, for
      // both a dry run and a real one (CG-0MVWGJNQM0061W6I).
      for (const file of result.files) {
        console.log(`  ${file.action}  ${file.path}`);
      }
      if (result.selectionNote) console.log(`  note:      ${result.selectionNote}`);
      for (const l of result.symlinks) console.log(`  linked ${l}`);
      if (result.rewritten.length) {
        console.log(`  rewrote example-games/${game}/ → src/ in ${result.rewritten.length} file(s)`);
      }
      // The opt-in migration report names every affected file and which
      // rewrite applies, so a `--dry-run` preview is actionable
      // (CG-0MVWGJRIO0094Y4Z).
      if (result.migrations.length) {
        const verb = args.dryRun ? 'would migrate' : 'migrated';
        console.log(`  ${verb} ${result.migrations.length} game-tree file(s):`);
        for (const migration of result.migrations) {
          console.log(`    ${migration.path} (${migration.rewrites.join(', ')})`);
        }
      }
      if (result.assetLinks.length) {
        console.log(`  linked ${result.assetLinks.length} shared asset(s)`);
      }
      if (result.publicLinks.length) {
        console.log(`  linked ${result.publicLinks.length} root app-icon file(s)`);
      }
    } catch (err) {
      failures += 1;
      console.error(`Failed to scaffold tce-${game}: ${(err as Error).message}`);
    }
  }

  if (failures > 0) return 1;

  // `--json` prints exactly one document: an object for a single `--game` run,
  // an array for `--all`, both carrying the same per-file `files` report.
  if (args.json) {
    console.log(JSON.stringify(args.all ? results : results[0], null, 2));
    return 0;
  }

  if (args.dryRun) return 0;
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
