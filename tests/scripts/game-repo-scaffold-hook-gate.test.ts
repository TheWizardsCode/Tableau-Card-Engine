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
 * 5. A green worktree gate run mirrors its cache entries into the main
 *    checkout's `.worklog/cache` (never overwriting an existing entry) and a
 *    mirror that cannot be performed only warns — the push still succeeds
 *    (CG-0MW2KEFMA000YY66, parent AC4(b)).
 * 6. The gate is bound to the pushed commit (CG-0MW2151GL003SV5E): the hook
 *    forwards `--gate-commit <pushed sha>` and `--project-root <root>`; a
 *    non-gated ref runs no suite; a multi-commit dev/main push is refused
 *    before any suite runs; a ref deletion is not gated; and the cache mirror
 *    sources from the gate-resolved root (`run_tests: gate-root`), not the
 *    push cwd.
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
 * --strict-git-env --json --project-root <root> --gate-commit <sha>`, so the
 * recorded argv proves which runner ran and which commit it was bound to.
 *
 * The literal `--gate-commit` in this source satisfies the hook's capability
 * pre-check. With `STUB_GATE_ROOT` set it echoes `run_tests: gate-root <path>`
 * on stderr, exactly as the real runner does, so the hook's mirror source is
 * observable.
 *
 * With `STUB_CACHE_ENTRY` set it also writes a gate cache entry the way
 * `run_tests.py` does — under the git dir the hook exported. A linked worktree
 * has no `.worklog`, so that is `<git-dir>/test-cache/<name>/result.json`: the
 * exact seam the hook's cache mirroring copies from.
 */
const STUB_RUNNER = [
  '#!/usr/bin/env python3',
  '# Stub run_tests.py: supports --gate-commit (capability pre-check marker).',
  'import json, os, pathlib, subprocess, sys',
  'marker = os.environ.get("STUB_MARKER")',
  'if marker:',
  '    with open(marker, "w", encoding="utf-8") as fh:',
  '        json.dump({"argv": sys.argv[1:], "git_dir": os.environ.get("GIT_DIR")}, fh)',
  'gate_root = os.environ.get("STUB_GATE_ROOT")',
  'if gate_root:',
  '    sys.stderr.write("run_tests: gate-root " + gate_root + "\\n")',
  'cache_name = os.environ.get("STUB_CACHE_ENTRY")',
  'if cache_name:',
  '    git_dir = subprocess.check_output(',
  '        ["git", "rev-parse", "--absolute-git-dir"], text=True',
  '    ).strip()',
  '    entry = pathlib.Path(git_dir) / "test-cache" / cache_name',
  '    entry.mkdir(parents=True, exist_ok=True)',
  `    (entry / "result.json").write_text('{"status": "green"}', encoding="utf-8")`,
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
 * from a linked worktree. `extraEnv` carries per-case stub controls (e.g. the
 * cache entry name); it is applied last.
 */
function pushFromWorktree(
  fixture: Fixture,
  stubExit: 0 | 1,
  extraEnv: NodeJS.ProcessEnv = {},
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
        ...extraEnv,
      }),
    },
  );
  return { result, marker };
}

/**
 * Push arbitrary refspecs from the linked worktree with the stub runner
 * installed — for multi-commit and ref-deletion cases that `pushFromWorktree`
 * (single `HEAD:refs/heads/dev`) cannot express.
 */
function pushRefspecs(
  fixture: Fixture,
  refspecs: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): { result: GitResult; marker: string } {
  installStubRunner(fixture);
  const marker = path.join(fixture.root, 'stub-refspecs.json');
  const result = run(
    'git',
    ['-C', fixture.worktree, 'push', 'origin', ...refspecs],
    {
      env: cleanEnv({
        HOME: fixture.home,
        GIT_DIR: fixture.worktreeGitDir,
        STUB_EXIT: '0',
        STUB_MARKER: marker,
        WORKLOG_SKIP_PRE_PUSH: '1',
        CONTEXT_BUDGET_SKIP: '1',
        TEST_SCOPE_SKIP: '0',
        ...extraEnv,
      }),
    },
  );
  return { result, marker };
}

/** The main checkout's mirror target (`<main>/.worklog/cache`). */
function createMainCache(fixture: Fixture): string {
  const cache = path.join(fixture.repo, '.worklog', 'cache');
  fs.mkdirSync(cache, { recursive: true });
  return cache;
}

/**
 * Where a worktree gate run caches: the linked worktree has no `.worklog`, so
 * `run_tests.py` uses `<git-dir>/test-cache` (the production `implement.py
 * finish` shape).
 */
function worktreeCache(fixture: Fixture): string {
  return path.join(fixture.worktreeGitDir, 'test-cache');
}

/** Permissions cannot deny a copy when running as root. */
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

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
      expect.arrayContaining([
        '--scope',
        'full',
        '--strict-git-env',
        '--project-root',
        fixture.worktree,
        '--gate-commit',
        git(fixture.worktree, 'rev-parse', 'HEAD').stdout,
      ]),
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
      // The canonical Worklog hook template resolves the sibling from the
      // hook's own directory; the assertion is behavioural (a `$0`-relative
      // `dirname`) rather than pinned to one spelling, so a defensive
      // `dirname -- "$0"` hardening and the canonical `dirname "$0"` both
      // satisfy it (CG-0MW1VJRY6001FOPT — the hooks are now the canonical
      // template, which `wl doctor upgrade` compares byte-wise).
      expect(hook, `${name} does not resolve its sibling`).toMatch(
        /dirname (?:-- )?"\$0"/,
      );
    }
  }, 60_000);

  it('runs no suite for a non-gated ref (no --gate-commit)', () => {
    const fixture = makeFixture();
    const { result, marker } = pushRefspecs(fixture, [
      'HEAD:refs/heads/feature/x',
    ]);

    expect(result.status, `push failed: ${result.stderr}`).toBe(0);
    // The stub marker proves the runner never ran for a feature branch.
    expect(fs.existsSync(marker)).toBe(false);
  }, 60_000);

  it('refuses a push carrying two different dev/main commits', () => {
    const fixture = makeFixture();
    // A second commit gives the two gated refs different shas.
    expect(
      git(fixture.worktree, 'commit', '--allow-empty', '-qm', 'second').status,
    ).toBe(0);
    const { result, marker } = pushRefspecs(fixture, [
      'HEAD~1:refs/heads/dev',
      'HEAD:refs/heads/main',
    ]);

    expect(result.status, 'a multi-commit push must be refused').not.toBe(0);
    // Refused before any suite runs.
    expect(fs.existsSync(marker)).toBe(false);
    expect(result.stderr).toContain(
      'cannot evidence one suite for several pushed commits',
    );
    expect(result.stderr).toContain('refs/heads/dev');
    expect(result.stderr).toContain('refs/heads/main');
    expect(result.stderr).toContain('TEST_SCOPE_SKIP=1');
    expect(result.stderr).toContain('git push --no-verify');
    // The remote refs stay unadvanced.
    const remoteRefs = run('git', ['-C', fixture.remote, 'show-ref']);
    expect(remoteRefs.stdout).not.toContain('refs/heads/dev');
    expect(remoteRefs.stdout).not.toContain('refs/heads/main');
  }, 60_000);

  it('does not gate a ref deletion (all-zero local sha)', () => {
    const fixture = makeFixture();
    // Create dev first so the deletion below is a real ref deletion.
    expect(pushFromWorktree(fixture, 0).result.status).toBe(0);

    const { result, marker } = pushRefspecs(fixture, [':refs/heads/dev']);

    expect(result.status, `delete push failed: ${result.stderr}`).toBe(0);
    // A deletion has no tree to test: the suite is never invoked.
    expect(fs.existsSync(marker)).toBe(false);
    const remoteRefs = run('git', ['-C', fixture.remote, 'show-ref']);
    expect(remoteRefs.stdout).not.toContain('refs/heads/dev');
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

/**
 * The committed hook must mirror the cache entries a worktree gate run wrote
 * into the main checkout (CG-0MW2KEFMA000YY66, parent AC4(b)). These cases
 * assert against the **committed** `.githooks/pre-push` the scaffold copies, so
 * a replaced or hand-edited hook fails here. Skipped on Windows, where POSIX
 * permissions cannot express the fail-soft case.
 */
describe.skipIf(process.platform === 'win32')(
  'committed pre-push test-cache mirroring',
  () => {
    it('mirrors a worktree gate cache entry into the main checkout cache', () => {
      const fixture = makeFixture();
      const mainCache = createMainCache(fixture);
      const { result } = pushFromWorktree(fixture, 0, {
        STUB_CACHE_ENTRY: 'entry-abc',
      });

      expect(result.status, `push failed: ${result.stderr}`).toBe(0);
      // The stub cached under the worktree's git dir (no `.worklog` there),
      // exactly as the real runner does for a worktree push.
      const worktreeEntry = path.join(
        worktreeCache(fixture),
        'entry-abc',
        'result.json',
      );
      expect(
        fs.existsSync(worktreeEntry),
        'stub runner wrote no worktree cache entry',
      ).toBe(true);

      const mirrored = path.join(mainCache, 'entry-abc', 'result.json');
      expect(
        fs.existsSync(mirrored),
        `entry was not mirrored into ${mainCache}`,
      ).toBe(true);
      expect(fs.readFileSync(mirrored, 'utf-8')).toBe(
        fs.readFileSync(worktreeEntry, 'utf-8'),
      );
      expect(result.stderr).toContain('pre-push: mirrored gate cache entry entry-abc');
    }, 60_000);

    it('mirrors from the gate-resolved root, not the push cwd', () => {
      const fixture = makeFixture();
      const mainCache = createMainCache(fixture);
      // The runner resolved a different checkout than the push cwd: that
      // checkout's cache entry is what must be mirrored.
      const otherRoot = path.join(fixture.root, 'other-checkout');
      const otherEntry = path.join(
        otherRoot,
        '.worklog',
        'cache',
        'entry-gate',
        'result.json',
      );
      fs.mkdirSync(path.dirname(otherEntry), { recursive: true });
      fs.writeFileSync(otherEntry, '{"status": "green"}');

      const { result } = pushFromWorktree(fixture, 0, {
        STUB_GATE_ROOT: otherRoot,
      });

      expect(result.status, `push failed: ${result.stderr}`).toBe(0);
      const mirrored = path.join(mainCache, 'entry-gate', 'result.json');
      expect(
        fs.existsSync(mirrored),
        `gate-root entry was not mirrored into ${mainCache}`,
      ).toBe(true);
      expect(fs.readFileSync(mirrored, 'utf-8')).toBe('{"status": "green"}');
      expect(result.stderr).toContain('pre-push: mirrored gate cache entry entry-gate');
    }, 60_000);

    it('never overwrites a cache entry the main checkout already holds', () => {
      const fixture = makeFixture();
      const mainCache = createMainCache(fixture);
      const existing = path.join(mainCache, 'entry-abc', 'result.json');
      fs.mkdirSync(path.dirname(existing), { recursive: true });
      fs.writeFileSync(existing, '{"status": "already-cached"}');

      const { result } = pushFromWorktree(fixture, 0, {
        STUB_CACHE_ENTRY: 'entry-abc',
      });

      expect(result.status, `push failed: ${result.stderr}`).toBe(0);
      expect(fs.readFileSync(existing, 'utf-8')).toBe(
        '{"status": "already-cached"}',
      );
      expect(result.stderr).not.toContain('mirrored gate cache entry entry-abc');
    }, 60_000);

    // Skipped as root, where directory permissions cannot deny the copy.
    it.skipIf(isRoot)(
      'warns but never fails the push when an entry cannot be mirrored',
      () => {
        const fixture = makeFixture();
        const mainCache = createMainCache(fixture);
        fs.chmodSync(mainCache, 0o500);
        let result: GitResult;
        try {
          result = pushFromWorktree(fixture, 0, {
            STUB_CACHE_ENTRY: 'entry-abc',
          }).result;
        } finally {
          fs.chmodSync(mainCache, 0o700);
        }

        // Fail-soft: cache plumbing must never decide a push.
        expect(
          result.status,
          `fail-soft violated, the push was blocked: ${result.stderr}`,
        ).toBe(0);
        expect(result.stderr).toContain(
          'pre-push: warning: could not mirror cache entry entry-abc',
        );
        expect(fs.existsSync(path.join(mainCache, 'entry-abc'))).toBe(false);
      },
      60_000,
    );
  },
);
