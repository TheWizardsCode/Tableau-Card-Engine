/**
 * End-to-end tests for the committed `pre-push` full-suite gate
 * (CG-0MW0SC8A2003UEX6, parent AC2).
 *
 * These tests scaffold a throwaway game repo, add a linked worktree, and push a
 * `dev` branch **from the worktree** to a local bare remote. The committed
 * `.githooks/pre-push` (copied from this repository by the scaffold) runs the
 * full-suite gate, resolving its runner local-then-global — the test supplies a
 * stub runner in the worktree's `skill/test/scripts/run_tests.py` so the real
 * suite never runs.
 *
 * What is proved:
 *
 * 1. The hook is active in the worktree (`core.hooksPath` is shared config).
 * 2. A green stub lets the push through, and the stub really was invoked with
 *    `--scope full --strict-git-env`.
 * 3. A red stub blocks the push and leaves the remote branch unadvanced, with
 *    the hook's actionable failure message.
 * 4. The worktree-managed `GIT_DIR` git exports for hook runs is not treated as
 *    a repository override (no `--strict-git-env` refusal), mirroring
 *    `docs/dev/test-isolation.md` §9 (`git_sandbox.is_worktree_git_dir`).
 *
 * Everything is temp-dir / `file://` / stub based: no network, no `npm install`,
 * no browser, no developer config touched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  GITHOOKS_DIR,
  scaffoldGameRepo,
  type CoreManifest,
} from '../../scripts/game-repo-scaffold';

/** The repository under test (its committed hooks are the artifact copied). */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const MANIFEST: CoreManifest = {
  version: '9.9.9',
  dependencies: { phaser: '4.0.0-rc.7' },
  devDependencies: { vite: '^6.1.0', vitest: '^3.0.0', typescript: '^5.7.0' },
};

/**
 * Stub `run_tests.py`: records its invocation (argv + the exported `GIT_DIR`)
 * and exits with `STUB_EXIT`. The hook always passes `--scope full
 * --strict-git-env`, so the recorded argv proves which runner ran.
 */
const STUB_RUNNER = [
  '#!/usr/bin/env python3',
  'import json, os, sys',
  'marker = os.environ.get("STUB_MARKER")',
  'if marker:',
  '    with open(marker, "w", encoding="utf-8") as fh:',
  '        json.dump({"argv": sys.argv[1:], "git_dir": os.environ.get("GIT_DIR")}, fh)',
  'sys.exit(int(os.environ.get("STUB_EXIT", "0")))',
  '',
].join('\n');

let tmpRoot = '';

beforeEach(() => {
  tmpRoot = '';
});

afterEach(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Environment with every inherited `GIT_*` variable removed.
 *
 * A test runner may export `GIT_INDEX_FILE` / `GIT_DIR` for its own gate; a
 * fixture that shells out to git must never write into that state (doing so
 * invalidates the caller's gate). Overrides are applied last so the push below
 * can deliberately export the worktree's `GIT_DIR`.
 */
function cleanEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GIT_')) continue;
    env[key] = value;
  }
  return { ...env, ...overrides };
}

function run(
  cmd: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): GitResult {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    cwd: options.cwd,
    env: options.env ?? cleanEnv(),
  });
  return {
    status: result.status,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
  };
}

const git = (
  cwd: string,
  ...args: string[]
): GitResult => run('git', ['-C', cwd, ...args]);

interface Fixture {
  root: string;
  core: string;
  repo: string;
  worktree: string;
  remote: string;
  worktreeGitDir: string;
  /** Isolated HOME so no developer/global runner can be picked up. */
  home: string;
}

/**
 * Build a scaffolded, committed game repo with a local bare remote and a linked
 * worktree whose `dev` push target is that remote.
 */
function makeFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-hook-gate-'));
  tmpRoot = root;

  // ── Minimal core checkout: manifest, index.html, committed hooks ─────────
  const core = path.join(root, 'Tableau-Card-Engine');
  fs.mkdirSync(path.join(core, 'configs'), { recursive: true });
  fs.mkdirSync(path.join(core, 'public'), { recursive: true });
  fs.cpSync(
    path.join(REPO_ROOT, GITHOOKS_DIR),
    path.join(core, GITHOOKS_DIR),
    { recursive: true },
  );
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(MANIFEST));
  fs.writeFileSync(path.join(core, 'index.html'), '<html><body></body></html>\n');
  fs.writeFileSync(
    path.join(core, 'configs', 'full.json'),
    JSON.stringify({ games: [] }),
  );

  // ── Game repo: a git repo with a committed tree, then scaffolded ─────────
  const repo = path.join(root, 'tce-golf');
  fs.mkdirSync(path.join(repo, 'src', 'scenes'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'src', 'scenes', 'GolfScene.ts'),
    'export class GolfScene {}\n',
  );
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# tce-golf\n');
  expect(git(repo, 'init', '-q').status).toBe(0);
  expect(git(repo, 'config', 'user.email', 'test@example.invalid').status).toBe(0);
  expect(git(repo, 'config', 'user.name', 'Hook Gate Test').status).toBe(0);

  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });

  const scaffold = scaffoldGameRepo({
    game: 'golf',
    gameRepoRoot: repo,
    coreRoot: core,
    scenePath: 'src/scenes/GolfScene.ts',
    // The measurement tooling is deliberately unavailable: the generated budget
    // is then absent and the context gate stays fail-open, isolating this test
    // to the full-suite gate.
    measureContextPath: path.join(root, 'missing-measure_context.py'),
  });
  expect(scaffold.hooksPath).toEqual({ applied: true, value: GITHOOKS_DIR });

  expect(git(repo, 'add', '-A').status).toBe(0);
  expect(git(repo, 'commit', '-qm', 'scaffold').status).toBe(0);

  // ── Bare remote + linked worktree ────────────────────────────────────────
  const remote = path.join(root, 'remote.git');
  expect(run('git', ['init', '--bare', '-q', remote]).status).toBe(0);
  expect(git(repo, 'remote', 'add', 'origin', remote).status).toBe(0);

  const worktree = path.join(root, 'worktree');
  expect(git(repo, 'worktree', 'add', '-q', worktree, '-b', 'wl-hook-test').status).toBe(
    0,
  );
  const worktreeGitDir = git(worktree, 'rev-parse', '--absolute-git-dir').stdout;
  expect(fs.existsSync(worktreeGitDir)).toBe(true);

  return { root, core, repo, worktree, remote, worktreeGitDir, home };
}

/** Write the stub runner into the worktree's local runner location. */
function installStubRunner(fixture: Fixture): string {
  const runnerDir = path.join(fixture.worktree, 'skill', 'test', 'scripts');
  fs.mkdirSync(runnerDir, { recursive: true });
  const runner = path.join(runnerDir, 'run_tests.py');
  fs.writeFileSync(runner, STUB_RUNNER);
  return runner;
}

/**
 * Push `HEAD` from the linked worktree onto the remote `dev` branch, with the
 * worktree's git-dir exported as `GIT_DIR` exactly as git does for a hook run
 * from a linked worktree.
 */
function pushFromWorktree(
  fixture: Fixture,
  stubExit: 0 | 1,
): { result: GitResult; marker: string } {
  installStubRunner(fixture);
  const marker = path.join(fixture.root, `stub-${stubExit}.json`);
  const result = run(
    'git',
    ['-C', fixture.worktree, 'push', 'origin', 'HEAD:refs/heads/dev'],
    {
      env: cleanEnv({
        HOME: fixture.home,
        GIT_DIR: fixture.worktreeGitDir,
        STUB_EXIT: String(stubExit),
        STUB_MARKER: marker,
        // Isolate the run from the worklog store and the context-budget gate;
        // the full-suite gate under test stays enabled.
        WORKLOG_SKIP_PRE_PUSH: '1',
        CONTEXT_BUDGET_SKIP: '1',
        TEST_SCOPE_SKIP: '0',
      }),
    },
  );
  return { result, marker };
}

describe('committed pre-push gate from a linked worktree', () => {
  it('runs the full-suite gate and lets a green suite through', () => {
    const fixture = makeFixture();
    const { result, marker } = pushFromWorktree(fixture, 0);

    expect(result.status, `push failed: ${result.stderr}`).toBe(0);
    // The remote dev branch now exists.
    const remoteRefs = run('git', ['-C', fixture.remote, 'show-ref']);
    expect(remoteRefs.stdout).toContain('refs/heads/dev');

    // The stub — not the developer's global runner — actually ran the full
    // suite in strict-git-env mode.
    expect(fs.existsSync(marker), 'stub runner was never invoked').toBe(true);
    const invocation = JSON.parse(fs.readFileSync(marker, 'utf-8')) as {
      argv: string[];
      git_dir: string | null;
    };
    expect(invocation.argv).toEqual(
      expect.arrayContaining(['--scope', 'full', '--strict-git-env']),
    );
    // No release-gate refusal: a worktree-managed GIT_DIR is legitimate.
    expect(result.stderr).not.toMatch(/refusing to run the release gate/i);
    expect(result.stderr).not.toMatch(/repository-override/i);
  }, 60_000);

  it('blocks a red suite and leaves the remote branch unadvanced', () => {
    const fixture = makeFixture();
    const { result, marker } = pushFromWorktree(fixture, 1);

    expect(result.status, 'a red suite must fail the push').not.toBe(0);
    // The gate ran (the stub is the evidence) and the remote ref was not
    // created.
    expect(fs.existsSync(marker)).toBe(true);
    const remoteRefs = run('git', ['-C', fixture.remote, 'show-ref']);
    expect(remoteRefs.stdout).not.toContain('refs/heads/dev');

    // The failure is actionable: what went wrong and how to bypass it.
    expect(result.stderr).toContain('Full test suite failed');
    expect(result.stderr).toContain('TEST_SCOPE_SKIP=1');
  }, 60_000);

  it('copies self-contained hooks that never point back at the core checkout', () => {
    // A copied hook must keep working in a clone at any path, so no hook may
    // embed the core checkout it came from. The delegating wrappers resolve
    // their sibling script from the hook's own directory.
    const fixture = makeFixture();
    for (const name of ['post-merge', 'post-rewrite']) {
      const hook = fs.readFileSync(
        path.join(fixture.repo, GITHOOKS_DIR, name),
        'utf-8',
      );
      expect(hook, `${name} embeds the core path`).not.toContain(fixture.core);
      expect(hook, `${name} does not resolve its sibling`).toContain(
        'dirname -- "$0"',
      );
    }
  }, 60_000);

  it('treats the linked worktree as the repository under test, not an export', () => {
    const fixture = makeFixture();
    // The push succeeds under the exported worktree `GIT_DIR` (AC1's green
    // run proves the gate accepted it rather than refusing).
    expect(pushFromWorktree(fixture, 0).result.status).toBe(0);

    // The worktree is a real linked worktree of the scaffolded repo...
    expect(
      git(fixture.worktree, 'rev-parse', '--git-common-dir').stdout,
    ).toBe(path.join(fixture.repo, '.git'));
    expect(
      git(fixture.worktree, 'rev-parse', '--show-toplevel').stdout,
    ).toBe(fixture.worktree);
    expect(fixture.worktreeGitDir.startsWith(path.join(fixture.repo, '.git'))).toBe(
      true,
    );
  }, 60_000);
});
