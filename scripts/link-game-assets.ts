/**
 * Compose sibling game-owned assets into the launcher's `public/assets` tree.
 *
 * The merged core (`Tableau-Card-Engine`) owns only the **shared** assets
 * (canonical deck, default SFX, root SFX, `CREDITS.md`). Each game repo keeps
 * its **game-owned** assets in its own `public/assets/` tree (thumbnails, SVG
 * icons, game audio, `cards/lost-cities/`, `sushi-go/`, …). The launcher
 * therefore has to compose those game-owned roots into its own `public/assets`
 * before Vite serves (dev) or copies (build) them — otherwise the Game Selector
 * and every game 404 on their thumbnails, icons and audio.
 *
 * This is the inverse of `game-repo-scaffold.ts → linkSharedAssets()`: that
 * links the *shared* core assets into a *game* repo; this links each *game's*
 * assets into the *core launcher*. Ownership is taken from the single source of
 * truth, `scripts/configs/repo-layout.json → gameAssets`, and the selection
 * from the active `GAMES_CONFIG` preset, so a core-only run composes nothing
 * and removes any previously-composed links.
 *
 * The composed links are generated artefacts and are gitignored; they are
 * recreated automatically by `vite-game-assets-plugin.ts` (dev, build and
 * Electron modes alike) and can be driven manually via
 * `tsx scripts/link-game-assets.ts`.
 *
 * Related work item: CG-0MUKYCG9L00587FA.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamesConfig, selectConfigPath } from './vite-game-discovery-plugin';

// ── Types ─────────────────────────────────────────────────────────────────

/** One game's game-owned asset roots, as declared in `repo-layout.json`. */
export interface GameAssetOwnership {
  /** Game id, e.g. `main-street`. Also the sibling directory suffix. */
  game: string;
  /** Asset paths relative to `public/assets/`, e.g. `games/main-street/`. */
  assets: string[];
}

/** A single asset root to link from a sibling game repo into the launcher. */
export interface GameAssetLink {
  /** Owning game id. */
  game: string;
  /** Asset path relative to `public/assets/` (trailing slashes stripped). */
  asset: string;
  /** Absolute source path in the sibling game repo. */
  source: string;
  /** Absolute destination path in the launcher's `public/assets/`. */
  dest: string;
}

/** The planned composition before any filesystem mutation. */
export interface GameAssetPlan {
  /** Links to create or refresh. */
  links: GameAssetLink[];
  /**
   * Selected games whose declared asset roots were all absent — typically a
   * sibling checkout that has not been bootstrapped (`setup:distribution`).
   */
  missingGames: string[];
  /** Individual asset roots whose source directory does not exist. */
  missingAssets: GameAssetLink[];
}

/** Outcome of one composition pass. */
export interface GameAssetComposeReport {
  /** Links created this pass. */
  linked: GameAssetLink[];
  /** Links that existed but pointed elsewhere and were re-created. */
  replaced: GameAssetLink[];
  /** Links already correct — no filesystem change. */
  unchanged: GameAssetLink[];
  /** Stale link destinations removed (game no longer selected). */
  removed: string[];
  /** Destinations left untouched because they are not symlinks we own. */
  skipped: Array<{ dest: string; reason: string }>;
  /** Selected games with no composed assets (see {@link GameAssetPlan}). */
  missingGames: string[];
  /** Selected but absent asset roots (see {@link GameAssetPlan}). */
  missingAssets: GameAssetLink[];
}

/** Options accepted by {@link composeGameAssets}. */
export interface ComposeGameAssetsOptions {
  /** Absolute launcher repo root (where `configs/` and `public/` live). */
  projectRoot: string;
  /** Environment holding `GAMES_CONFIG` (defaults to `process.env`). */
  env?: Record<string, string | undefined>;
  /** Layout contract path (defaults to `scripts/configs/repo-layout.json`). */
  layoutPath?: string;
  /** Classify actions without touching the filesystem. */
  dryRun?: boolean;
  /** Sink for human-readable progress (defaults to a no-op). */
  log?: (line: string) => void;
}

// ── Layout contract ───────────────────────────────────────────────────────

/**
 * Read the per-game asset ownership table from a layout contract.
 *
 * Malformed entries are skipped rather than thrown on: the layout contract is
 * shared with the extraction tooling, and this composition must never be the
 * reason a build breaks.
 *
 * @param layoutPath Absolute path to `repo-layout.json`.
 * @returns The ownership table (empty when the file or field is absent).
 */
export function readGameAssetOwnership(layoutPath: string): GameAssetOwnership[] {
  if (!fs.existsSync(layoutPath)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
  } catch {
    return [];
  }
  if (typeof raw !== 'object' || raw === null) return [];
  const gameAssets = (raw as { gameAssets?: unknown }).gameAssets;
  if (!Array.isArray(gameAssets)) return [];

  const out: GameAssetOwnership[] = [];
  for (const entry of gameAssets) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { game?: unknown; assets?: unknown };
    if (typeof e.game !== 'string' || !e.game.length) continue;
    if (!Array.isArray(e.assets)) continue;
    const assets = e.assets
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.replace(/\/+$/, ''))
      .filter((a) => a.length > 0);
    if (assets.length) out.push({ game: e.game, assets });
  }
  return out;
}

/** Default layout contract path, relative to the launcher repo root. */
export const DEFAULT_LAYOUT_PATH = path.join('scripts', 'configs', 'repo-layout.json');

// ── Planning ──────────────────────────────────────────────────────────────

/**
 * Compute the asset links for a selected game set.
 *
 * Pure: it reads only the sibling filesystem (for existence) and never writes.
 * A game whose sibling directory is absent is reported under `missingGames`
 * rather than throwing, so a partially-bootstrapped distribution still builds
 * the games it does have.
 *
 * @param options.projectRoot Absolute launcher root.
 * @param options.selectedGames Selected games (id + sibling `path`).
 * @param options.ownership Per-game asset ownership table.
 * @returns The plan.
 */
export function planGameAssetLinks(options: {
  projectRoot: string;
  selectedGames: ReadonlyArray<{ id: string; path: string }>;
  ownership: ReadonlyArray<GameAssetOwnership>;
}): GameAssetPlan {
  const exists = fs.existsSync;
  const assetsRoot = path.join(options.projectRoot, 'public', 'assets');
  const ownershipByGame = new Map(options.ownership.map((o) => [o.game, o.assets]));

  const links: GameAssetLink[] = [];
  const missingGames: string[] = [];
  const missingAssets: GameAssetLink[] = [];

  for (const game of options.selectedGames) {
    const assets = ownershipByGame.get(game.id);
    if (!assets || assets.length === 0) {
      // No declared game-owned assets (e.g. a game with no extra assets).
      continue;
    }
    const siblingRoot = path.resolve(options.projectRoot, game.path);
    if (!exists(siblingRoot)) {
      missingGames.push(game.id);
      continue;
    }
    for (const asset of assets) {
      const source = path.join(siblingRoot, 'public', 'assets', asset);
      const dest = path.join(assetsRoot, asset);
      const link: GameAssetLink = { game: game.id, asset, source, dest };
      if (!exists(source)) {
        missingAssets.push(link);
        continue;
      }
      links.push(link);
    }
  }

  return { links, missingGames, missingAssets };
}

// ── Composition ───────────────────────────────────────────────────────────

/** The relative symlink target for a link → source pair. */
function relativeTarget(dest: string, source: string): string {
  return path.relative(path.dirname(dest), source);
}

/** Create the symlink, tolerating platforms that need a junction. */
function createSymlink(dest: string, source: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const rel = relativeTarget(dest, source);
  if (fs.statSync(source).isDirectory()) {
    try {
      fs.symlinkSync(rel, dest, 'dir');
    } catch {
      // Windows without developer mode needs a junction for directories.
      fs.symlinkSync(rel, dest, 'junction');
    }
  } else {
    fs.symlinkSync(rel, dest);
  }
}

/**
 * Compose the selected games' assets into the launcher's `public/assets`.
 *
 * Idempotent: an existing correct symlink is left untouched; a symlink to the
 * wrong target is re-created; a non-symlink at a destination is **never**
 * clobbered (reported under `skipped`). Asset roots belonging to games that are
 * *not* selected are removed when they are symlinks, so switching from `full`
 * to `core-only` leaves the launcher clean.
 *
 * @param options See {@link ComposeGameAssetsOptions}.
 * @returns The composition report.
 * @throws When the selected preset names an unknown file (delegated to
 *   `selectConfigPath`), matching the game-discovery plugin's fail-fast
 *   contract.
 */
export function composeGameAssets(options: ComposeGameAssetsOptions): GameAssetComposeReport {
  const { projectRoot } = options;
  const env = options.env ?? process.env;
  const log = options.log ?? ((): void => {});
  const layoutPath = options.layoutPath ?? path.join(projectRoot, DEFAULT_LAYOUT_PATH);
  const dryRun = options.dryRun === true;

  const ownership = readGameAssetOwnership(layoutPath);
  const configPath = selectConfigPath(projectRoot, env);
  const config = loadGamesConfig(configPath);

  const plan = planGameAssetLinks({
    projectRoot,
    selectedGames: config.games.map((g) => ({ id: g.id, path: g.path })),
    ownership,
  });

  const report: GameAssetComposeReport = {
    linked: [],
    replaced: [],
    unchanged: [],
    removed: [],
    skipped: [],
    missingGames: plan.missingGames,
    missingAssets: plan.missingAssets,
  };
  if (plan.missingAssets.length) {
    log(
      `[game-assets] ${plan.missingAssets.length} declared asset root(s) absent in sibling games; skipping.`,
    );
  }

  // ── Create / refresh selected links ──────────────────────────────────────
  for (const link of plan.links) {
    const existing = fs.lstatSync(link.dest, { throwIfNoEntry: false });
    if (existing) {
      if (existing.isSymbolicLink()) {
        const current = fs.readlinkSync(link.dest);
        if (path.resolve(path.dirname(link.dest), current) === path.resolve(link.source)) {
          report.unchanged.push(link);
          continue;
        }
        if (dryRun) {
          report.replaced.push(link);
          continue;
        }
        fs.unlinkSync(link.dest);
        createSymlink(link.dest, link.source);
        report.replaced.push(link);
        continue;
      }
      // A real file/directory already occupies the destination: never clobber.
      report.skipped.push({
        dest: link.dest,
        reason: 'destination exists and is not a symlink',
      });
      continue;
    }
    if (dryRun) {
      report.linked.push(link);
      continue;
    }
    createSymlink(link.dest, link.source);
    report.linked.push(link);
  }

  // ── Remove stale links for games no longer selected ──────────────────────
  const selected = new Set(config.games.map((g) => g.id));
  const assetsRoot = path.join(projectRoot, 'public', 'assets');
  for (const owned of ownership) {
    if (selected.has(owned.game)) continue;
    for (const asset of owned.assets) {
      const dest = path.join(assetsRoot, asset);
      const existing = fs.lstatSync(dest, { throwIfNoEntry: false });
      if (!existing) continue;
      if (!existing.isSymbolicLink()) {
        report.skipped.push({
          dest,
          reason: 'stale destination exists and is not a symlink',
        });
        continue;
      }
      if (!dryRun) fs.unlinkSync(dest);
      report.removed.push(dest);
    }
  }

  log(
    `[game-assets] linked ${report.linked.length}, replaced ${report.replaced.length}, ` +
      `unchanged ${report.unchanged.length}, removed ${report.removed.length}, ` +
      `skipped ${report.skipped.length}.` +
      (dryRun ? ' (dry run)' : ''),
  );
  return report;
}

// ── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  json: boolean;
  dryRun: boolean;
  projectRoot: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false, dryRun: false, projectRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run' || arg === '--check') args.dryRun = true;
    else if (arg === '--project-root' && argv[i + 1]) {
      args.projectRoot = path.resolve(argv[i + 1] as string);
      i += 1;
    }
  }
  return args;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = composeGameAssets({
      projectRoot: args.projectRoot,
      dryRun: args.dryRun,
      log: args.json ? (): void => {} : (line) => console.log(line),
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    }
    process.exitCode = 0;
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
