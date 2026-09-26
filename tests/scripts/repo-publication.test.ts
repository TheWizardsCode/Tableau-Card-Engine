/**
 * Contract tests for the repo publication helper (CG-0MUIND2NE009GPHJ, child
 * of CG-0MUHK5NND0024J1S).
 *
 * The publication *decision* is fixed in
 * `docs/dev/repo-publication-decision.md`. This suite encodes that decision as
 * executable behaviour. The helper itself (`scripts/publish-repos.ts`) is
 * implemented by the follow-up task CG-0MUIND4FD000OQB5; until then the
 * behavioural cases are authored as documented `it.skip(...)` contracts (so
 * the suite stays green) and the follow-up task unskips and satisfies them.
 *
 * The data-only cases (the `repo-layout.json` partition) run today and need no
 * helper. The helper-dependent cases load the module lazily with
 * `/* @vite-ignore *\/` so the file resolves even before the module exists.
 *
 * No network and no `gh` calls happen here: the helper is exercised through an
 * injected `CommandRunner` double.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LAYOUT_PATH = path.join(REPO_ROOT, 'scripts', 'configs', 'repo-layout.json');

/** Lazily load the (not-yet-written) publication helper. The specifier is a
 * variable so neither TypeScript nor Vite tries to resolve a module that the
 * follow-up task CG-0MUIND4FD000OQB5 still has to create. */
const HELPER_SPECIFIER = '../../scripts/publish-repos';
async function loadHelper(): Promise<Record<string, any>> {
  return (await import(/* @vite-ignore */ HELPER_SPECIFIER)) as Record<
    string,
    any
  >;
}

interface Layout {
  core: { name: string; slug: string; remote: string };
  games: Array<{ name: string; slug: string; remote: string }>;
}

function readLayout(): Layout {
  return JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf-8')) as Layout;
}

function writeTempLayout(overrides: {
  coreSlug?: string;
  coreRemote?: string;
  gameSlug?: string;
  gameRemote?: string;
}): string {
  const layout = readLayout();
  const copy = JSON.parse(JSON.stringify(layout)) as Layout;
  if (overrides.coreSlug) copy.core.slug = overrides.coreSlug;
  if (overrides.coreRemote) copy.core.remote = overrides.coreRemote;
  if (overrides.gameSlug) copy.games[0].slug = overrides.gameSlug;
  if (overrides.gameRemote) copy.games[0].remote = overrides.gameRemote;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-layout-'));
  const file = path.join(dir, 'repo-layout.json');
  fs.writeFileSync(file, JSON.stringify(copy, null, 2));
  return file;
}

/** A recording command double for the helper's injected runner. */
function fakeRunner(
  responder: (cmd: string, args: string[]) => { status?: number; stdout?: string; stderr?: string },
) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  return {
    calls,
    runner: {
      run(cmd: string, args: string[]) {
        calls.push({ cmd, args });
        const r = responder(cmd, args);
        return { status: r.status ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
      },
    },
  };
}

// ── Data-only: the publication targets come from the layout contract ───────

describe('repo-layout.json — publication targets', () => {
  it('declares the core repo plus exactly the eight tce-<game> repos', () => {
    const layout = readLayout();
    expect(layout.core.slug).toBe('tableau-card-engine-core');
    expect(layout.games.map((g) => g.slug).sort()).toEqual(
      [
        'tce-beleaguered-castle',
        'tce-blackjack',
        'tce-coloretto',
        'tce-feudalism',
        'tce-golf',
        'tce-lost-cities',
        'tce-main-street',
        'tce-sushi-go',
      ].sort(),
    );
  });

  it('records an SSH remote under TheWizardsCode for every repo', () => {
    const layout = readLayout();
    const all = [layout.core, ...layout.games];
    for (const repo of all) {
      expect(repo.remote, repo.slug).toBe(
        `git@github.com:TheWizardsCode/${repo.slug}.git`,
      );
      expect(repo.remote).not.toMatch(/^https:/);
    }
  });

  it('keeps every slug unique', () => {
    const layout = readLayout();
    const slugs = [layout.core.slug, ...layout.games.map((g) => g.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

// ── Contract (helper): authored as skips, unskipped by CG-0MUIND4FD000OQB5 ─

describe('publish-repos — target resolution', () => {
  it('resolves the nine targets from repo-layout.json (no hard-coded names)', async () => {
    const { loadPublishTargets } = await loadHelper();
    const targets = loadPublishTargets(LAYOUT_PATH);
    expect(targets).toHaveLength(9);
    expect(targets.find((t: any) => t.kind === 'core')?.slug).toBe(
      'tableau-card-engine-core',
    );
    expect(targets.map((t: any) => t.slug)).toEqual(
      expect.arrayContaining([
        'tce-golf',
        'tce-beleaguered-castle',
        'tce-blackjack',
        'tce-sushi-go',
        'tce-feudalism',
        'tce-lost-cities',
        'tce-main-street',
        'tce-coloretto',
      ]),
    );
  });

  it('reflects a renamed target from the layout rather than a literal', async () => {
    const { loadPublishTargets } = await loadHelper();
    const layoutPath = writeTempLayout({ coreSlug: 'core-renamed' });
    const targets = loadPublishTargets(layoutPath);
    expect(targets.find((t: any) => t.kind === 'core')?.slug).toBe('core-renamed');
  });
});

describe('publish-repos — ref contract', () => {
  it('publishes exactly dev + main, with main as the default branch', async () => {
    const mod = await loadHelper();
    expect([...mod.PUBLISH_REFS]).toEqual(['dev', 'main']);
    expect(mod.DEFAULT_BRANCH).toBe('main');
    expect(mod.OWNER).toBe('TheWizardsCode');
  });

  it('rejects any ref outside {dev, main}, including tags', async () => {
    const { assertPublishRefAllowed } = await loadHelper();
    expect(() => assertPublishRefAllowed('dev')).not.toThrow();
    expect(() => assertPublishRefAllowed('main')).not.toThrow();
    expect(() => assertPublishRefAllowed('refs/tags/v0.1.17')).toThrow();
    expect(() => assertPublishRefAllowed('wl-CG-0MTR7DLMY008CK17')).toThrow();
    expect(() => assertPublishRefAllowed('feature/x')).toThrow();
  });
});

describe('publish-repos — creation and idempotency', () => {
  const targets = [
    { kind: 'game' as const, slug: 'tce-golf', remote: 'git@github.com:TheWizardsCode/tce-golf.git' },
  ];

  it('creates a missing repository publicly and pushes dev then seeds main', async () => {
    const { buildPublicationPlan } = await loadHelper();
    const plan = buildPublicationPlan(targets, {
      'tce-golf': { exists: false, heads: [], tags: [] },
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].create).toBe(true);
    expect(plan[0].push).toEqual(['dev', 'main']);
    expect(plan[0].defaultBranch).toBe(true);
    expect(plan[0].upToDate).toBe(false);
  });

  it('is a no-op when the repo already has dev + main and main is default', async () => {
    const { buildPublicationPlan } = await loadHelper();
    const plan = buildPublicationPlan(targets, {
      'tce-golf': { exists: true, heads: ['dev', 'main'], tags: [] },
    });
    expect(plan[0].create).toBe(false);
    expect(plan[0].push).toEqual([]);
    expect(plan[0].upToDate).toBe(true);
  });

  it('seeds main from dev when only dev exists', async () => {
    const { buildPublicationPlan } = await loadHelper();
    const plan = buildPublicationPlan(targets, {
      'tce-golf': { exists: true, heads: ['dev'], tags: [] },
    });
    expect(plan[0].push).toEqual(['main']);
    expect(plan[0].defaultBranch).toBe(true);
    expect(plan[0].upToDate).toBe(false);
  });

  it('never pushes extra remote branches or the inherited monorepo tags', async () => {
    const { buildPublicationPlan } = await loadHelper();
    const plan = buildPublicationPlan(targets, {
      'tce-golf': {
        exists: true,
        heads: ['dev', 'main', 'wl-CG-0MTR7DLMY008CK17', 'revert-fix'],
        tags: ['v0.1.17'],
      },
    });
    expect(plan[0].push).toEqual([]);
    expect(plan[0].upToDate).toBe(true);
  });
});

describe('publish-repos — safety guards and dry run', () => {
  it('creates repositories with --public and never --private', async () => {
    const mod = await loadHelper();
    const { calls, runner } = fakeRunner((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') {
        return { status: 1 };
      }
      return { status: 0 };
    });
    mod.publishRepos({
      repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-root-')),
      targets: ['golf'],
      runner,
      layoutPath: LAYOUT_PATH,
    });
    const create = calls.find((c) => c.cmd === 'gh' && c.args[1] === 'create');
    expect(create).toBeDefined();
    expect(create!.args).toContain('--public');
    expect(create!.args).not.toContain('--private');
  });

  it('never emits a force push and never pushes a tag', async () => {
    const mod = await loadHelper();
    const { calls, runner } = fakeRunner((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') return { status: 1 };
      if (cmd === 'git' && args.includes('ls-remote')) return { status: 0, stdout: '' };
      return { status: 0 };
    });
    mod.publishRepos({
      repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-root-')),
      targets: ['golf'],
      runner,
      layoutPath: LAYOUT_PATH,
    });
    for (const call of calls) {
      const joined = [call.cmd, ...call.args].join(' ');
      expect(joined).not.toMatch(/--force|force-with-lease|-f\b/);
      expect(joined).not.toMatch(/refs\/tags\//);
    }
  });

  it('dry-run writes nothing: the runner is never invoked', async () => {
    const mod = await loadHelper();
    const { calls, runner } = fakeRunner(() => ({ status: 0 }));
    const report = mod.publishRepos({
      repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-root-')),
      targets: ['golf'],
      dryRun: true,
      runner,
      layoutPath: LAYOUT_PATH,
    });
    expect(calls).toHaveLength(0);
    expect(report.dryRun).toBe(true);
    expect(report.commands.length).toBeGreaterThan(0);
  });

  it('restricts the run to --target and leaves the other eight untouched', async () => {
    const mod = await loadHelper();
    const { calls, runner } = fakeRunner((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') {
        return { status: args[args.length - 1]?.includes('tce-golf') ? 1 : 0 };
      }
      return { status: 0, stdout: '' };
    });
    const report = mod.publishRepos({
      repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-root-')),
      targets: ['golf'],
      runner,
      layoutPath: LAYOUT_PATH,
    });
    expect(report.entries).toHaveLength(1);
    for (const call of calls) {
      expect(call.args.join(' ')).toContain('tce-golf');
    }
  });

  it('refuses a remote that is not under the configured owner', async () => {
    const mod = await loadHelper();
    const layoutPath = writeTempLayout({
      gameRemote: 'git@github.com:SomeOtherOrg/tce-golf.git',
    });
    const { runner } = fakeRunner(() => ({ status: 0 }));
    const report = mod.publishRepos({
      repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-root-')),
      targets: ['golf'],
      runner,
      layoutPath,
    });
    expect(report.exitCode).not.toBe(0);
  });

  it('aborts rather than overwriting when a target is divergent', async () => {
    const mod = await loadHelper();
    const { runner } = fakeRunner((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'repo' && args[1] === 'view') return { status: 0 };
      if (cmd === 'git' && args.includes('ls-remote')) {
        return { status: 0, stdout: 'deadbeef\trefs/heads/dev\n' };
      }
      // A non-fast-forward push is rejected by the remote.
      return { status: 1, stderr: 'non-fast-forward' };
    });
    const report = mod.publishRepos({
      repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'tce-publish-root-')),
      targets: ['golf'],
      runner,
      layoutPath: LAYOUT_PATH,
    });
    expect(report.exitCode).not.toBe(0);
  });
});
