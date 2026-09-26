/**
 * publish-repos.ts — create and publish the nine TCE repositories on GitHub.
 *
 * Contract: `docs/dev/repo-publication-decision.md` (CG-0MUIND2NE009GPHJ). This
 * helper implements that decision; the executable contract lives in
 * `tests/scripts/repo-publication.test.ts`.
 *
 * Summary of the contract:
 *   - targets are resolved from `scripts/configs/repo-layout.json` (never
 *     hard-coded);
 *   - each repository is created **public** (`gh repo create --public`);
 *   - the only published refs are `dev` and `main` (`main` seeded once from
 *     `dev` and set as the default branch);
 *   - the run is idempotent — an existing repository is never re-created and an
 *     up-to-date target pushes nothing and exits 0;
 *   - safety: no force, no tag pushes, no branch outside `{dev, main}`, never
 *     the launcher or the source monorepo, owner-restricted remotes, abort on
 *     collision/divergence.
 *
 * CLI:
 *   npm run publish:repos -- [--dry-run] [--target <name>]... [--repos-dir <path>]
 *
 * Exit codes: 0 success (including an up-to-date no-op); 1 any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── Constants ─────────────────────────────────────────────────────────────

/** GitHub owner (organisation) that hosts every TCE repository. */
export const OWNER = 'TheWizardsCode';

/** The only refs that may ever be published, in push order (dev, then main). */
export const PUBLISH_REFS = ['dev', 'main'] as const;

/** Default branch of every published repository. */
export const DEFAULT_BRANCH = 'main';

/** Local branch whose tip seeds every published ref. */
export const SOURCE_BRANCH = 'dev';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Default location of the repo partition contract. */
export const DEFAULT_LAYOUT_PATH = path.join(HERE, 'configs', 'repo-layout.json');

// ── Types ─────────────────────────────────────────────────────────────────

export type TargetKind = 'core' | 'game';

export interface PublishTarget {
  kind: TargetKind;
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

export interface RemoteState {
  exists: boolean;
  heads: string[];
  tags: string[];
}

export interface PublicationPlanEntry {
  slug: string;
  remote: string;
  create: boolean;
  /** Destination branches to seed from the local `dev` tip. */
  push: string[];
  /** True when `main` must be (re)set as the default branch. */
  defaultBranch: boolean;
  upToDate: boolean;
}

export interface PublishReport {
  dryRun: boolean;
  exitCode: number;
  entries: PublicationPlanEntry[];
  commands: string[];
}

export interface PublishOptions {
  /** Directory holding the extracted/scaffolded checkouts. */
  repoRoot: string;
  owner?: string;
  layoutPath?: string;
  /** Target selectors: `core`, a game name (`golf`), or a slug (`tce-golf`). */
  targets?: string[];
  dryRun?: boolean;
  runner?: CommandRunner;
  /** Sink for human-readable progress (defaults to stdout). */
  log?: (line: string) => void;
}

// ── Target resolution ─────────────────────────────────────────────────────

interface RawLayout {
  core: { name: string; slug: string; remote: string };
  games: Array<{ name: string; slug: string; remote: string }>;
}

/** Resolve the nine publication targets from the layout contract. */
export function loadPublishTargets(
  layoutPath: string = DEFAULT_LAYOUT_PATH,
): PublishTarget[] {
  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8')) as RawLayout;
  const targets: PublishTarget[] = [
    { kind: 'core', slug: layout.core.slug, remote: layout.core.remote },
  ];
  for (const game of layout.games) {
    targets.push({ kind: 'game', slug: game.slug, remote: game.remote });
  }
  return targets;
}

/** True when `selector` addresses `target` (`core`, the game name, or slug). */
export function matchesTarget(target: PublishTarget, selector: string): boolean {
  if (selector === target.slug) return true;
  if (target.kind === 'core') {
    return selector === 'core' || selector === 'tableau-card-engine-core';
  }
  return `tce-${selector}` === target.slug;
}

// ── Safety guards ─────────────────────────────────────────────────────────

/**
 * Throw unless `refspec` names one of the two publishable branches.
 *
 * Accepts `dev`/`main` and their fully-qualified `refs/heads/...` forms;
 * rejects tags and any other branch.
 */
export function assertPublishRefAllowed(refspec: string): void {
  if (refspec.startsWith('refs/tags/')) {
    throw new Error(`refusing to publish a tag: ${refspec}`);
  }
  const name = refspec.replace(/^refs\/heads\//, '');
  if (!(PUBLISH_REFS as readonly string[]).includes(name)) {
    throw new Error(`refusing to publish a branch outside {dev, main}: ${refspec}`);
  }
}

/** Throw unless `remote` is the recorded SSH remote for `slug` under `owner`. */
export function assertRemoteOwned(
  target: PublishTarget,
  owner: string,
): void {
  const expected = `git@github.com:${owner}/${target.slug}.git`;
  if (target.remote !== expected) {
    throw new Error(
      `refusing remote '${target.remote}' for ${target.slug}: expected '${expected}'`,
    );
  }
}

// ── Planning (pure) ───────────────────────────────────────────────────────

/**
 * Compute what each target needs. Pure: the caller supplies the observed
 * remote state, so the contract is testable without network access.
 */
export function buildPublicationPlan(
  targets: PublishTarget[],
  remoteState: Record<string, RemoteState>,
): PublicationPlanEntry[] {
  return targets.map((target) => {
    const state = remoteState[target.slug] ?? {
      exists: false,
      heads: [],
      tags: [],
    };
    const hasDev = state.heads.includes('dev');
    const hasMain = state.heads.includes('main');
    const missing: string[] = [];
    if (!state.exists) {
      missing.push('dev', 'main');
    } else {
      if (!hasDev) missing.push('dev');
      if (!hasMain) missing.push('main');
    }
    const upToDate = state.exists && hasDev && hasMain;
    return {
      slug: target.slug,
      remote: target.remote,
      create: !state.exists,
      push: missing,
      defaultBranch: !upToDate,
      upToDate,
    };
  });
}

/** Render a human-readable plan (used by `--dry-run` and the CLI). */
export function renderPublicationPlan(plan: PublicationPlanEntry[]): string {
  const lines = ['Repo publication plan', '====================='];
  for (const entry of plan) {
    lines.push(`${entry.slug} (${entry.remote})`);
    lines.push(`  create: ${entry.create ? 'yes (public)' : 'no (exists)'}`);
    lines.push(`  push:   ${entry.push.length ? entry.push.join(', ') : 'nothing (up to date)'}`);
    lines.push(`  default branch: ${entry.defaultBranch ? 'set to main' : 'already main'}`);
  }
  return lines.join('\n');
}

// ── Command helpers ───────────────────────────────────────────────────────

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

function refspecFor(destination: string): string {
  assertPublishRefAllowed(destination);
  return `refs/heads/${SOURCE_BRANCH}:refs/heads/${destination}`;
}

/** Parse `git ls-remote` output; `kind` selects heads or tags. */
export function parseLsRemote(stdout: string, kind: 'heads' | 'tags'): string[] {
  const prefix = kind === 'heads' ? 'refs/heads/' : 'refs/tags/';
  const names: string[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const ref = line.split(/\s+/)[1];
    if (ref && ref.startsWith(prefix)) names.push(ref.slice(prefix.length));
  }
  return names;
}

// ── Publication ───────────────────────────────────────────────────────────

/** Build the ordered command list a real run would execute for one entry. */
function plannedCommands(
  owner: string,
  repoPath: string,
  entry: PublicationPlanEntry,
): string[][] {
  const commands: string[][] = [];
  if (entry.create) commands.push(['gh', 'repo', 'create', `${owner}/${entry.slug}`, '--public']);
  for (const destination of entry.push) {
    commands.push(['git', '-C', repoPath, 'push', 'origin', refspecFor(destination)]);
  }
  if (entry.defaultBranch) {
    commands.push(['gh', 'repo', 'edit', `${owner}/${entry.slug}`, '--default-branch', DEFAULT_BRANCH]);
  }
  return commands;
}

function formatCommand(cmd: string, args: string[]): string {
  return [cmd, ...args].join(' ');
}

/**
 * Create and publish the selected repositories.
 *
 * Returns a report rather than throwing for expected operational failures
 * (owner mismatch, divergence, command failure) so callers can decide how to
 * surface them; an unexpected exception propagates.
 */
export function publishRepos(opts: PublishOptions): PublishReport {
  const owner = opts.owner ?? OWNER;
  const layoutPath = opts.layoutPath ?? DEFAULT_LAYOUT_PATH;
  const dryRun = opts.dryRun ?? false;
  const runner = opts.runner ?? shellCommandRunner;
  const log = opts.log ?? (() => {});

  const allTargets = loadPublishTargets(layoutPath);
  const targets = opts.targets?.length
    ? allTargets.filter((t) => opts.targets!.some((sel) => matchesTarget(t, sel)))
    : allTargets;

  // Guard: every selected remote must be ours.
  for (const target of targets) {
    try {
      assertRemoteOwned(target, owner);
    } catch (error) {
      log(`ERROR: ${(error as Error).message}`);
      return { dryRun, exitCode: 1, entries: [], commands: [] };
    }
  }

  const entries: PublicationPlanEntry[] = [];
  const commands: string[] = [];

  if (dryRun) {
    for (const target of targets) {
      const optimistic: PublicationPlanEntry = {
        slug: target.slug,
        remote: target.remote,
        create: true,
        push: ['dev', 'main'],
        defaultBranch: true,
        upToDate: false,
      };
      const repoPath = path.join(opts.repoRoot, target.slug);
      for (const argv of plannedCommands(owner, repoPath, optimistic)) {
        commands.push(formatCommand(argv[0], argv.slice(1)));
      }
      entries.push(optimistic);
    }
    log(renderPublicationPlan(entries));
    return { dryRun: true, exitCode: 0, entries, commands };
  }

  let exitCode = 0;
  for (const target of targets) {
    const repoPath = path.join(opts.repoRoot, target.slug);
    log(`--- ${target.slug}`);

    const view = runner.run('gh', ['repo', 'view', `${owner}/${target.slug}`]);
    const exists = view.status === 0;
    let heads: string[] = [];
    let tags: string[] = [];
    if (exists) {
      const headsOut = runner.run('git', ['-C', repoPath, 'ls-remote', '--heads', 'origin']);
      const tagsOut = runner.run('git', ['-C', repoPath, 'ls-remote', '--tags', 'origin']);
      heads = parseLsRemote(headsOut.stdout, 'heads');
      tags = parseLsRemote(tagsOut.stdout, 'tags');
    }

    const [entry] = buildPublicationPlan([target], {
      [target.slug]: { exists, heads, tags },
    });
    entries.push(entry);
    log(renderPublicationPlan([entry]));

    for (const argv of plannedCommands(owner, repoPath, entry)) {
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

  return { dryRun: false, exitCode, entries, commands };
}

// ── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  dryRun: boolean;
  targets: string[];
  reposDir?: string;
  layoutPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, targets: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--target':
        if (argv[i + 1]) args.targets.push(argv[i + 1]);
        i += 1;
        break;
      case '--repos-dir':
        args.reposDir = argv[i + 1];
        i += 1;
        break;
      case '--layout':
        args.layoutPath = argv[i + 1];
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
      'Usage: npm run publish:repos -- [options]',
      '',
      'Create the nine TCE GitHub repositories and push dev + seeded main.',
      '',
      'Options:',
      '  --dry-run            Print the plan; invoke no gh/git commands.',
      '  --target <name>      Publish one target (core, golf, …); repeatable.',
      '  --repos-dir <path>   Directory holding the extracted checkouts',
      '                       (default: the monorepo parent directory).',
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
    const repoRoot = path.resolve(args.reposDir ?? path.join(HERE, '..'));
    const report = publishRepos({
      repoRoot,
      dryRun: args.dryRun,
      targets: args.targets,
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
