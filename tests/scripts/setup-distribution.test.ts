/**
 * Unit + integration tests for the distribution bootstrap (Option A, F4).
 *
 * The merged core is sibling-only, so a full multi-game distribution is the
 * core repo plus the game repos checked out next to it. `setup-distribution.ts`
 * restores the one-command checkout that `--recurse-submodules` used to give.
 *
 * These are behaviour tests over the target manifest (derived from the layout
 * contract, never hard-coded), the generated `git` commands, the idempotent
 * skip of existing checkouts, and a real clone against local bare remotes.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertRemoteOwned,
  cloneCommands,
  loadDistributionTargets,
  matchesTarget,
  setupDistribution,
  type CommandRunner,
  type DistributionTarget,
} from '../../scripts/setup-distribution';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LAYOUT = path.join(REPO_ROOT, 'scripts', 'configs', 'repo-layout.json');

/** Every game repo the distribution composes as a sibling. */
const GAME_SLUGS = [
  'tce-beleaguered-castle',
  'tce-blackjack',
  'tce-coloretto',
  'tce-feudalism',
  'tce-golf',
  'tce-lost-cities',
  'tce-main-street',
  'tce-sushi-go',
];

/** Records the commands a fake runner is asked to execute. */
function recordingRunner(): CommandRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run(cmd, args) {
      calls.push([cmd, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    },
  };
}

let tmpRoot = '';
beforeEach(() => {
  tmpRoot = '';
});
afterEach(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ── Target resolution ─────────────────────────────────────────────────────

describe('loadDistributionTargets', () => {
  it('resolves the merged core plus every game repo from the layout contract', () => {
    const targets = loadDistributionTargets(LAYOUT);
    expect(targets.map((t) => t.slug).sort()).toEqual(
      ['Tableau-Card-Engine', ...GAME_SLUGS].sort(),
    );
    expect(targets[0].kind).toBe('core');
    expect(targets.slice(1).every((t) => t.kind === 'game')).toBe(true);
  });

  it('points every target remote at the TheWizardsCode owner', () => {
    for (const target of loadDistributionTargets(LAYOUT)) {
      expect(target.remote).toBe(
        `git@github.com:TheWizardsCode/${target.slug}.git`,
      );
    }
  });
});

describe('matchesTarget', () => {
  const core: DistributionTarget = {
    kind: 'core',
    slug: 'Tableau-Card-Engine',
    remote: 'git@github.com:TheWizardsCode/Tableau-Card-Engine.git',
  };
  const golf: DistributionTarget = {
    kind: 'game',
    slug: 'tce-golf',
    remote: 'git@github.com:TheWizardsCode/tce-golf.git',
  };

  it('selects core by name or slug', () => {
    expect(matchesTarget(core, 'core')).toBe(true);
    expect(matchesTarget(core, 'Tableau-Card-Engine')).toBe(true);
    expect(matchesTarget(core, 'games')).toBe(false);
    expect(matchesTarget(core, 'golf')).toBe(false);
  });

  it('selects a game by name, slug, or the games bucket', () => {
    expect(matchesTarget(golf, 'golf')).toBe(true);
    expect(matchesTarget(golf, 'tce-golf')).toBe(true);
    expect(matchesTarget(golf, 'games')).toBe(true);
    expect(matchesTarget(golf, 'core')).toBe(false);
  });
});

describe('assertRemoteOwned', () => {
  it('accepts the recorded remote', () => {
    const target: DistributionTarget = {
      kind: 'game',
      slug: 'tce-golf',
      remote: 'git@github.com:TheWizardsCode/tce-golf.git',
    };
    expect(() => assertRemoteOwned(target)).not.toThrow();
  });

  it('rejects a foreign remote', () => {
    const target: DistributionTarget = {
      kind: 'game',
      slug: 'tce-golf',
      remote: 'git@github.com:SomeoneElse/tce-golf.git',
    };
    expect(() => assertRemoteOwned(target)).toThrow(/refusing remote/);
  });
});

// ── Command generation ────────────────────────────────────────────────────

describe('cloneCommands', () => {
  const golf: DistributionTarget = {
    kind: 'game',
    slug: 'tce-golf',
    remote: 'git@github.com:TheWizardsCode/tce-golf.git',
  };

  it('clones the sibling then initialises its ./core submodule', () => {
    const commands = cloneCommands(golf, '/parent/tce-golf');
    expect(commands).toEqual([
      ['git', 'clone', golf.remote, '/parent/tce-golf'],
      ['git', '-C', '/parent/tce-golf', 'submodule', 'update', '--init', '--recursive'],
    ]);
  });

  it('honours depth and branch for a shallow clone', () => {
    const commands = cloneCommands(golf, '/parent/tce-golf', {
      depth: 1,
      branch: 'dev',
    });
    expect(commands[0]).toEqual([
      'git',
      'clone',
      '--depth',
      '1',
      '--branch',
      'dev',
      golf.remote,
      '/parent/tce-golf',
    ]);
  });

  it('omits the submodule step when disabled', () => {
    const commands = cloneCommands(golf, '/parent/tce-golf', { submodules: false });
    expect(commands).toHaveLength(1);
  });
});

// ── Planning / dry-run ────────────────────────────────────────────────────

describe('setupDistribution — dry run', () => {
  it('plans the clone commands without invoking any runner', () => {
    const runner = recordingRunner();
    const report = setupDistribution({
      dir: '/parent',
      layoutPath: LAYOUT,
      dryRun: true,
      runner,
      dirExists: () => false,
    });

    expect(report.exitCode).toBe(0);
    expect(runner.calls).toEqual([]);
    expect(report.commands[0]).toContain('git clone');
    expect(report.commands[0]).toContain('/parent/Tableau-Card-Engine');
    // One game's clone command is present too.
    expect(report.commands.some((c) => c.includes('/parent/tce-golf'))).toBe(true);
  });

  it('marks existing checkouts as skipped in the plan', () => {
    const report = setupDistribution({
      dir: '/parent',
      layoutPath: LAYOUT,
      dryRun: true,
      dirExists: (dir) => dir.endsWith('tce-golf'),
    });
    expect(report.skipped).toEqual(['tce-golf']);
    expect(report.commands.some((c) => c.includes('/parent/tce-golf'))).toBe(false);
  });

  it('restricts the plan to the selected target', () => {
    const report = setupDistribution({
      dir: '/parent',
      layoutPath: LAYOUT,
      dryRun: true,
      targets: ['core'],
      dirExists: () => false,
    });
    expect(report.checkouts).toEqual({
      'Tableau-Card-Engine': path.join('/parent', 'Tableau-Card-Engine'),
    });
  });
});

// ── Orchestration with a fake runner ──────────────────────────────────────

describe('setupDistribution — orchestration', () => {
  it('clones every target when nothing exists', () => {
    const runner = recordingRunner();
    const report = setupDistribution({
      dir: '/parent',
      layoutPath: LAYOUT,
      runner,
      dirExists: () => false,
    });

    expect(report.exitCode).toBe(0);
    // A clone + a submodule update for each of the nine targets.
    expect(runner.calls.filter((c) => c[0] === 'git' && c[1] === 'clone')).toHaveLength(9);
    expect(
      runner.calls.filter((c) => c.includes('submodule')),
    ).toHaveLength(9);
    expect(report.checkouts['tce-golf']).toBe(path.join('/parent', 'tce-golf'));
  });

  it('skips existing checkouts and never runs a command for them', () => {
    const runner = recordingRunner();
    const report = setupDistribution({
      dir: '/parent',
      layoutPath: LAYOUT,
      targets: ['golf'],
      runner,
      dirExists: (dir) => dir.endsWith('tce-golf'),
    });

    expect(report.skipped).toEqual(['tce-golf']);
    expect(runner.calls).toEqual([]);
    expect(report.exitCode).toBe(0);
  });

  it('reports a non-zero exit when a clone command fails', () => {
    const failing: CommandRunner = {
      run: () => ({ status: 128, stdout: '', stderr: 'boom' }),
    };
    const report = setupDistribution({
      dir: '/parent',
      layoutPath: LAYOUT,
      targets: ['core'],
      runner: failing,
      dirExists: () => false,
    });
    expect(report.exitCode).toBe(1);
  });
});

// ── Real clone against local bare remotes ─────────────────────────────────

describe('setupDistribution — real clone', () => {
  function makeBareRepo(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '--bare', '-q', dir], { stdio: 'ignore' });
  }

  it('clones the manifest into sibling directories and is idempotent', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-setup-'));
    const remotes = path.join(tmpRoot, 'remotes');
    makeBareRepo(path.join(remotes, 'Tableau-Card-Engine.git'));
    makeBareRepo(path.join(remotes, 'tce-golf.git'));

    const layoutPath = path.join(tmpRoot, 'layout.json');
    fs.writeFileSync(
      layoutPath,
      JSON.stringify({
        core: {
          slug: 'Tableau-Card-Engine',
          remote: path.join(remotes, 'Tableau-Card-Engine.git'),
        },
        games: [
          {
            name: 'golf',
            slug: 'tce-golf',
            remote: path.join(remotes, 'tce-golf.git'),
          },
        ],
      }),
    );

    const parent = path.join(tmpRoot, 'dist');
    const first = setupDistribution({
      dir: parent,
      layoutPath,
      // Local `file://` paths are not the production SSH remotes; the guard is
      // exercised separately above.
      validateRemote: () => {},
    });

    expect(first.exitCode).toBe(0);
    expect(fs.existsSync(path.join(parent, 'Tableau-Card-Engine', '.git'))).toBe(true);
    expect(fs.existsSync(path.join(parent, 'tce-golf', '.git'))).toBe(true);
    expect(first.skipped).toEqual([]);

    const second = setupDistribution({
      dir: parent,
      layoutPath,
      validateRemote: () => {},
    });
    expect(second.skipped.sort()).toEqual(['Tableau-Card-Engine', 'tce-golf']);
    expect(second.commands).toEqual([]);
  });
});
