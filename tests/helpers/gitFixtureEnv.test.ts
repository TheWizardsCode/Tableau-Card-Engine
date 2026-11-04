/**
 * Regression tests for the hermetic fixture-git environment
 * (CG-0MVVKUUY50010004).
 *
 * The important assertion is **behavioural**, not structural: an ambient
 * `GIT_INDEX_FILE` must not reach a fixture `git` command. The historical bug
 * was that `git worktree add … HEAD` ran with the finish gate's inherited
 * index and reset it to `HEAD`'s tree, wiping the staged would-be-commit
 * change set and invalidating the gate's own evidence.
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  REPOSITORY_OVERRIDE_ENV_VARS,
  clearAmbientGitOverrides,
  fixtureGitEnv,
} from './gitFixtureEnv';

const tempDirs: string[] = [];

/** A temp directory removed after each test. */
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('fixtureGitEnv', () => {
  it('drops an ambient GIT_INDEX_FILE and every repository-override variable', () => {
    const base: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      GIT_INDEX_FILE: '/tmp/a-gate-index',
      GIT_DIR: '/tmp/somewhere/.git',
      GIT_WORK_TREE: '/tmp/somewhere',
    };
    for (const name of REPOSITORY_OVERRIDE_ENV_VARS) base[name] = `/tmp/${name}`;

    const env = fixtureGitEnv(base);

    expect(env.GIT_INDEX_FILE).toBeUndefined();
    for (const name of REPOSITORY_OVERRIDE_ENV_VARS) {
      expect(env[name]).toBeUndefined();
    }
    // Unrelated variables survive, and the input mapping is untouched.
    expect(env.PATH).toBe(base.PATH);
    expect(base.GIT_INDEX_FILE).toBe('/tmp/a-gate-index');
  });

  it('never lets a fixture `git worktree add` reset an ambient index', () => {
    const root = tempDir('tce-fixture-git-env-');
    const repo = join(root, 'repo');
    const worktree = join(root, 'wt');

    // A real repo with one commit, driven hermetically.
    execFileSync('git', ['init', '-q', repo], { env: fixtureGitEnv() });
    writeFileSync(join(repo, 'tracked.txt'), 'tracked\n');
    const hermetic = fixtureGitEnv();
    execFileSync('git', ['-C', repo, 'add', 'tracked.txt'], { env: hermetic });
    execFileSync(
      'git',
      ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init'],
      { env: hermetic },
    );

    // A scratch index standing in for the finish gate's temporary index: seed
    // it from HEAD and stage a probe file (the would-be change set).
    const scratchIndex = join(root, 'gate-index');
    const scratchEnv = { ...hermetic, GIT_INDEX_FILE: scratchIndex };
    execFileSync('git', ['-C', repo, 'read-tree', 'HEAD'], { env: scratchEnv });
    writeFileSync(join(repo, 'probe.txt'), 'probe\n');
    execFileSync('git', ['-C', repo, 'add', 'probe.txt'], { env: scratchEnv });
    const before = execFileSync('git', ['-C', repo, 'write-tree'], { env: scratchEnv })
      .toString('utf8')
      .trim();

    // The historic failure: `git worktree add` with the *ambient* GIT_INDEX_FILE
    // resets the scratch index to HEAD's tree.
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', worktree, 'HEAD'], {
      env: fixtureGitEnv({ ...process.env, GIT_INDEX_FILE: scratchIndex }),
    });

    const after = execFileSync('git', ['-C', repo, 'write-tree'], { env: scratchEnv })
      .toString('utf8')
      .trim();
    expect(after).toBe(before);
  });

  it('clears the ambient overrides from the given mapping in place', () => {
    const env: NodeJS.ProcessEnv = { KEEP: 'yes', GIT_INDEX_FILE: '/tmp/gate-index' };
    for (const name of REPOSITORY_OVERRIDE_ENV_VARS) env[name] = '/tmp/x';

    clearAmbientGitOverrides(env);

    expect(env.KEEP).toBe('yes');
    expect(env.GIT_INDEX_FILE).toBeUndefined();
    for (const name of REPOSITORY_OVERRIDE_ENV_VARS) expect(env[name]).toBeUndefined();
  });
});
