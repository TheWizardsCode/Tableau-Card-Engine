/**
 * setup-distribution.ts — one-command bootstrap for a sibling distribution.
 *
 * The merged core (Option A) is **sibling-only**: `Tableau-Card-Engine` holds
 * the engine + Gym + launcher shell and no games, and the multi-game
 * distribution is composed from the game repositories checked out next to it
 * (`../tce-<game>`). Because the core never submodules games (that would be a
 * cycle), a full distribution is no longer a single
 * `git clone --recurse-submodules`; this helper restores the one-command
 * checkout:
 *
 *     npm run setup:distribution -- --dir ..
 *
 * Targets are resolved from `scripts/configs/repo-layout.json` (the single
 * source of truth, also used by extraction/publication), never hard-coded.
 * Each game repo's own `./core` submodule is then initialised recursively, so
 * every game is independently buildable.
 *
 * CLI:
 *   npm run setup:distribution -- [--dir <parent>] [--dry-run]
 *                                   [--depth <n>] [--branch <ref>]
 *                                   [--only core|games|<slug>]...
 *                                   [--no-submodules]
 *
 * Exit codes: 0 success (including an already-complete no-op); 1 any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── Constants ─────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Default location of the repo partition contract. */
export const DEFAULT_LAYOUT_PATH = path.join(HERE, 'configs', 'repo-layout.json');

/** The git remote owner every target must belong to. */
export const OWNER = 'TheWizardsCode';

// ── Types ─────────────────────────────────────────────────────────────────

export type DistributionTargetKind = 'core' | 'game';

/** One checkout the distribution is composed from. */
export interface DistributionTarget {
  kind: DistributionTargetKind;
  /** Repository name and checkout directory, e.g. `tce-golf`. */
  slug: string;
  /** SSH remote recorded in the layout. */
  remote: string;
}

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Injectable command runner (faked in tests; the CLI uses `spawnSync`). */
export interface CommandRunner {
  run(cmd: string, args: string[]): CommandResult;
}

export interface SetupOptions {
  /** Parent directory the sibling checkouts are cloned into. */
  dir: string;
  /** Layout contract to resolve targets from. */
  layoutPath?: string;
  /** Restrict to `core`, `games`, or a specific slug/game name. Repeatable. */
  targets?: string[];
  dryRun?: boolean;
  /** Depth for a shallow clone (`--depth <n>`); 0/undefined = full history. */
  depth?: number;
  /** Branch/tag to check out on clone. */
  branch?: string;
  /** Initialise each clone's submodules recursively (default true). */
  submodules?: boolean;
  /**
   * Remote-ownership guard (defaults to {@link assertRemoteOwned}). Tests may
   * inject a no-op to exercise a real local clone against `file://` remotes.
   */
  validateRemote?: (target: DistributionTarget) => void;
  runner?: CommandRunner;
  /** Returns true when a destination directory already exists. */
  dirExists?: (dir: string) => boolean;
  /** Sink for human-readable progress (defaults to a no-op). */
  log?: (line: string) => void;
}

export interface SetupReport {
  dryRun: boolean;
  exitCode: number;
  commands: string[];
  /** Slug → absolute destination directory. */
  checkouts: Record<string, string>;
  /** Slugs skipped because the directory already existed. */
  skipped: string[];
}

// ── Target resolution ─────────────────────────────────────────────────────

interface RawLayout {
  core: { slug: string; remote: string };
  games: Array<{ name: string; slug: string; remote: string }>;
}

/** Resolve the core + game targets from the layout contract. */
export function loadDistributionTargets(
  layoutPath: string = DEFAULT_LAYOUT_PATH,
): DistributionTarget[] {
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8')) as RawLayout;
  const targets: DistributionTarget[] = [
    { kind: 'core', slug: layout.core.slug, remote: layout.core.remote },
  ];
  for (const game of layout.games) {
    targets.push({ kind: 'game', slug: game.slug, remote: game.remote });
  }
  return targets;
}

/** True when `selector` addresses `target` (`core`, `games`, a name or slug). */
export function matchesTarget(
  target: DistributionTarget,
  selector: string,
): boolean {
  if (selector === target.slug) return true;
  if (selector === 'games') return target.kind === 'game';
  if (target.kind === 'core') return selector === 'core';
  return `tce-${selector}` === target.slug;
}

/** Fail unless `remote` is the recorded SSH remote for `slug` under `owner`. */
export function assertRemoteOwned(
  target: DistributionTarget,
  owner: string = OWNER,
): void {
  const expected = `git@github.com:${owner}/${target.slug}.git`;
  if (target.remote !== expected) {
    throw new Error(
      `refusing remote '${target.remote}' for ${target.slug}: expected '${expected}'`,
    );
  }
}

// ── Planning (pure) ───────────────────────────────────────────────────────

/** Destination directory for a target (slug == directory name). */
export function targetDir(parent: string, target: DistributionTarget): string {
  return path.join(parent, target.slug);
}

/**
 * Build the ordered command list a real run executes for one target.
 *
 * Pure: the caller decides whether the directory already exists, so the plan
 * is testable without touching the filesystem or the network.
 */
export function cloneCommands(
  target: DistributionTarget,
  dest: string,
  options: { depth?: number; branch?: string; submodules?: boolean } = {},
): string[][] {
  const clone: string[] = ['git', 'clone'];
  if (options.depth && options.depth > 0) clone.push('--depth', String(options.depth));
  if (options.branch) clone.push('--branch', options.branch);
  clone.push(target.remote, dest);

  const commands: string[][] = [clone];
  if (options.submodules !== false) {
    commands.push(['git', '-C', dest, 'submodule', 'update', '--init', '--recursive']);
  }
  return commands;
}

/** Render a human-readable plan (used by `--dry-run` and the CLI). */
export function renderSetupPlan(
  targets: DistributionTarget[],
  parent: string,
  exists: (dir: string) => boolean,
): string {
  const lines = ['Distribution bootstrap plan', '==========================='];
  lines.push(`Parent directory: ${parent}`);
  for (const target of targets) {
    const dest = targetDir(parent, target);
    const state = exists(dest) ? 'already present (skip)' : 'clone';
    lines.push(`  ${target.slug.padEnd(22)} ${target.kind.padEnd(5)} ${state}  ${dest}`);
  }
  return lines.join('\n');
}

// ── Execution ─────────────────────────────────────────────────────────────

const shellCommandRunner: CommandRunner = {
  run(cmd, args) {
    const result = spawnSync(cmd, args, { encoding: 'utf-8' });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  },
};

function formatCommand(cmd: string, args: string[]): string {
  return [cmd, ...args].join(' ');
}

/**
 * Clone the selected targets into `dir`, one sibling checkout per repo.
 *
 * Existing directories are never touched (idempotent). Returns a report rather
 * than throwing for expected operational failures so callers can decide how to
 * surface them; an unexpected exception propagates.
 */
export function setupDistribution(opts: SetupOptions): SetupReport {
  const layoutPath = opts.layoutPath ?? DEFAULT_LAYOUT_PATH;
  const dryRun = opts.dryRun ?? false;
  const runner = opts.runner ?? shellCommandRunner;
  const dirExists = opts.dirExists ?? ((dir: string) => fs.existsSync(dir));
  const log = opts.log ?? (() => {});
  const parent = path.resolve(opts.dir);

  const allTargets = loadDistributionTargets(layoutPath);
  const targets = opts.targets?.length
    ? allTargets.filter((t) => opts.targets!.some((sel) => matchesTarget(t, sel)))
    : allTargets;

  // Guard: every selected remote must be ours.
  const validateRemote = opts.validateRemote ?? ((t) => assertRemoteOwned(t));
  for (const target of targets) {
    try {
      validateRemote(target);
    } catch (error) {
      log(`ERROR: ${(error as Error).message}`);
      return { dryRun, exitCode: 1, commands: [], checkouts: {}, skipped: [] };
    }
  }

  const commands: string[] = [];
  const checkouts: Record<string, string> = {};
  const skipped: string[] = [];

  if (dryRun) {
    log(renderSetupPlan(targets, parent, dirExists));
    for (const target of targets) {
      const dest = targetDir(parent, target);
      checkouts[target.slug] = dest;
      if (dirExists(dest)) {
        skipped.push(target.slug);
        continue;
      }
      for (const argv of cloneCommands(target, dest, opts)) {
        commands.push(formatCommand(argv[0], argv.slice(1)));
      }
    }
    return { dryRun: true, exitCode: 0, commands, checkouts, skipped };
  }

  let exitCode = 0;
  for (const target of targets) {
    const dest = targetDir(parent, target);
    checkouts[target.slug] = dest;
    if (dirExists(dest)) {
      log(`--- ${target.slug}: already present, skipping`);
      skipped.push(target.slug);
      continue;
    }
    log(`--- ${target.slug}`);
    for (const argv of cloneCommands(target, dest, opts)) {
      const rendered = formatCommand(argv[0], argv.slice(1));
      commands.push(rendered);
      const result = runner.run(argv[0], argv.slice(1));
      if (result.status !== 0) {
        log(`ERROR: command failed (${result.status}): ${rendered}`);
        if (result.stderr) log(result.stderr.trim());
        exitCode = 1;
        break;
      }
    }
    if (exitCode !== 0) break;
  }

  return { dryRun: false, exitCode, commands, checkouts, skipped };
}

// ── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  dir: string;
  dryRun: boolean;
  depth?: number;
  branch?: string;
  targets: string[];
  submodules: boolean;
  layoutPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dir: path.join(HERE, '..'),
    dryRun: false,
    targets: [],
    submodules: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--dir':
        if (argv[i + 1]) args.dir = argv[i + 1];
        i += 1;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--depth':
        if (argv[i + 1]) args.depth = Number.parseInt(argv[i + 1], 10);
        i += 1;
        break;
      case '--branch':
        if (argv[i + 1]) args.branch = argv[i + 1];
        i += 1;
        break;
      case '--only':
        if (argv[i + 1]) args.targets.push(argv[i + 1]);
        i += 1;
        break;
      case '--no-submodules':
        args.submodules = false;
        break;
      case '--layout':
        if (argv[i + 1]) args.layoutPath = argv[i + 1];
        i += 1;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(
    [
      'Usage: npm run setup:distribution -- [options]',
      '',
      'Clone the merged core + the sibling game repos into one parent directory',
      'so a full distribution needs no `--recurse-submodules`.',
      '',
      'Options:',
      '  --dir <parent>       Parent directory for the sibling checkouts',
      '                       (default: the repo parent directory).',
      '  --dry-run            Print the plan; invoke no git command.',
      '  --depth <n>          Shallow clone depth (full history by default).',
      '  --branch <ref>       Branch/tag to check out on clone (default: remote HEAD).',
      '  --only <selector>    core | games | <game> | <slug>; repeatable.',
      '  --no-submodules      Do not initialise each game\'s ./core submodule.',
      '  --layout <path>      Layout contract (default: scripts/configs/repo-layout.json).',
      '  -h, --help           Show this help.',
    ].join('\n'),
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    const args = parseArgs(process.argv.slice(2));
    fs.mkdirSync(path.resolve(args.dir), { recursive: true });
    const report = setupDistribution({
      dir: args.dir,
      dryRun: args.dryRun,
      depth: args.depth,
      branch: args.branch,
      targets: args.targets,
      submodules: args.submodules,
      layoutPath: args.layoutPath,
      log: (line) => console.log(line),
    });
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error((error as Error).message);
    printUsage();
    process.exitCode = 1;
  }
}
