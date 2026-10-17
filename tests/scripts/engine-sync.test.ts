/**
 * Unit tests for the engine submodule sync/verify script
 * (`scripts/engine-sync.mjs`, MS-0MVCRGKZY007DIED).
 *
 * The script implements the dev/release engine-composition policies for game
 * repos:
 *
 * - **sync** (dev build): refuse loudly when `./core` has uncommitted changes
 *   (never clobber), then `git submodule update --remote core` so the tracked
 *   branch's remote tip is checked out. Unreachable remote → fall back to the
 *   current checkout with a warning (offline build).
 * - **verify** (release build): refuse loudly on local modifications, read
 *   `configs/engine-pin.json`, confirm the pinned SHA equals the
 *   remote-resolved target, then check out exactly the pinned SHA.
 *
 * These tests drive real git fixtures (temp repos + local-path remotes, no
 * network) and assert observable behaviour through the exported API.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CORE_REL,
  DEFAULT_PIN_REL,
  EngineSyncError,
  readPin,
  resolveRemoteTarget,
  resolveTrackedBranch,
  submoduleIsDirty,
  syncEngine,
  verifyEngine,
} from '../../scripts/engine-sync.mjs';

const tempRoots: string[] = [];

/** Create a temp fixture root that is removed after the file runs. */
function tempRoot(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Run git quietly in a fixture (tests only — no network). */
function git(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true,
  });
  return {
    ok: res.status === 0,
    stdout: (res.stdout ?? '').trim(),
    stderr: (res.stderr ?? '').trim(),
  };
}

function commit(cwd: string, message: string): void {
  const res = git(cwd, ['commit', '--allow-empty', '-m', message]);
  if (!res.ok) throw new Error(`fixture commit failed: ${res.stderr}`);
}

/**
 * Build a fixture engine repo + game repo:
 *
 *   root/engine/       — the "engine repo" (branch `dev`)
 *   root/game/         — the game repo: configs/engine-pin.json, core submodule
 *                        registered against a local-path remote named `origin`
 *                        (no network; GIT_ALLOW_PROTOCOL=file enables the
 *                        local transport).
 *
 * @returns fixture paths plus helpers.
 */
function makeFixture(): {
  root: string;
  engine: string;
  game: string;
  pinPath: string;
  devTip: () => string;
  advanceEngine: () => string;
  pinTo: (sha: string) => void;
} {
  const root = tempRoot('engine-sync-');
  const engine = path.join(root, 'engine');
  const game = path.join(root, 'game');

  for (const dir of [engine, game]) fs.mkdirSync(dir, { recursive: true });

  // Engine repo with a `dev` branch.
  git(engine, ['init', '-q', '-b', 'dev']);
  git(engine, ['config', 'user.email', 'fixture@test']);
  git(engine, ['config', 'user.name', 'Fixture']);
  fs.writeFileSync(path.join(engine, 'version.txt'), 'v1\n');
  git(engine, ['add', 'version.txt']);
  commit(engine, 'v1');

  // Game repo consuming the engine as a `core` submodule (local-path remote).
  git(game, ['init', '-q', '-b', 'main']);
  git(game, ['config', 'user.email', 'fixture@test']);
  git(game, ['config', 'user.name', 'Fixture']);
  const subAdd = git(game, ['-c', 'protocol.file.allow=always', 'submodule', 'add', engine, 'core']);
  if (!subAdd.ok) throw new Error(`fixture submodule add failed: ${subAdd.stderr}`);
  git(game, ['config', '-f', '.gitmodules', 'submodule.core.branch', 'dev']);
  git(game, ['add', '.gitmodules', 'core']);
  commit(game, 'init with core @ dev');

  const pinPath = path.join(game, DEFAULT_PIN_REL);
  fs.mkdirSync(path.dirname(pinPath), { recursive: true });

  const devTip = (): string =>
    git(engine, ['rev-parse', 'HEAD']).stdout.split(/\s+/)[0] ?? '';

  const advanceEngine = (): string => {
    fs.appendFileSync(path.join(engine, 'version.txt'), `v${Date.now()}\n`);
    git(engine, ['add', 'version.txt']);
    commit(engine, 'advance');
    return devTip();
  };

  const pinTo = (sha: string): void => {
    fs.writeFileSync(pinPath, JSON.stringify({ sha }));
  };

  return { root, engine, game, pinPath, devTip, advanceEngine, pinTo };
}

describe('submoduleIsDirty', () => {
  it('is false on a clean submodule checkout and true after a change', () => {
    const f = makeFixture();
    expect(submoduleIsDirty(f.game)).toBe(false);
    fs.appendFileSync(path.join(f.game, 'core', 'version.txt'), 'dirty\n');
    expect(submoduleIsDirty(f.game)).toBe(true);
  });

  it('is true when the submodule is not (yet) a git repo', () => {
    const f = makeFixture();
    const nonGit = tempRoot('engine-sync-ng-');
    fs.mkdirSync(path.join(nonGit, 'core'), { recursive: true });
    fs.writeFileSync(path.join(nonGit, 'core', 'x.txt'), 'x');
    expect(submoduleIsDirty(nonGit)).toBe(true);
  });
});

describe('syncEngine — dirty-state guard (AC1)', () => {
  it('fails loudly on an uncommitted submodule change and does not clobber it', () => {
    const f = makeFixture();
    const before = git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout;
    fs.appendFileSync(path.join(f.game, 'core', 'version.txt'), 'wip\n');

    expect(() => syncEngine({ repoRoot: f.game })).toThrow(EngineSyncError);
    expect(() => syncEngine({ repoRoot: f.game })).toThrow(/uncommitted changes/);

    // Never clobbered: the submodule still points at the same commit with the
    // WIP file intact.
    const after = git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout;
    expect(after).toBe(before);
    expect(fs.readFileSync(path.join(f.game, 'core', 'version.txt'), 'utf-8')).toContain('wip');
  });

  it('advances a clean submodule to the tracked branch remote tip', () => {
    const f = makeFixture();
    const tip = f.advanceEngine();
    const res = syncEngine({ repoRoot: f.game });
    expect(res.updated).toBe(true);
    expect(res.to).toBe(tip);
    expect(git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout).toBe(tip);
  });

  it('is a no-op when the submodule is already at the remote tip', () => {
    const f = makeFixture();
    const tip = f.devTip();
    const res = syncEngine({ repoRoot: f.game });
    expect(res.updated).toBe(false);
    expect(res.to).toBe(tip);
  });

  it('falls back to the current checkout with a warning when the remote is unreachable', () => {
    const f = makeFixture();
    // The submodule must be behind the remote tip so `submodule update
    // --remote` actually attempts a fetch — then break its origin URL so the
    // fetch fails like an offline build would.
    const tip = f.advanceEngine();
    git(path.join(f.game, 'core'), ['remote', 'set-url', 'origin', 'http://127.0.0.1:9/nowhere.git']);
    const before = git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout;
    expect(before).not.toBe(tip);
    const res = syncEngine({ repoRoot: f.game });
    expect(res.warning).toMatch(/remote unreachable|WARNING/);
    expect(res.updated).toBe(false);
    // Offline fallback never clobbers: the checkout is untouched.
    expect(git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout).toBe(before);
  });
});

describe('readPin / pin file (AC3)', () => {
  it('reads a single `sha` field', () => {
    const f = makeFixture();
    f.pinTo('0123456789abcdef0123456789abcdef01234567');
    expect(readPin(f.game)).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('fails loudly when the pin file is missing', () => {
    const f = makeFixture();
    expect(() => readPin(f.game)).toThrow(/pin file not found/);
  });

  it('fails loudly on malformed or shapeless pins', () => {
    const f = makeFixture();
    for (const raw of ['not json', '{"foo": 1}', '{"sha": "xyz"}', '{"sha": 42}']) {
      fs.writeFileSync(path.join(f.game, DEFAULT_PIN_REL), raw);
      expect(() => readPin(f.game), raw).toThrow(EngineSyncError);
    }
  });
});

describe('verifyEngine — pin-mismatch failure path (AC2)', () => {
  it('fails loudly on local modifications before touching anything', () => {
    const f = makeFixture();
    f.pinTo(f.devTip());
    fs.appendFileSync(path.join(f.game, 'core', 'version.txt'), 'wip\n');
    expect(() => verifyEngine({ repoRoot: f.game })).toThrow(/local modifications/);
  });

  it('fails loudly when the pinned SHA differs from the remote-resolved target', () => {
    const f = makeFixture();
    const oldTip = f.devTip();
    f.advanceEngine();
    f.pinTo(oldTip); // stale pin
    expect(() => verifyEngine({ repoRoot: f.game })).toThrow(/PIN MISMATCH/);
    // The submodule was not moved by the failed verify.
    expect(git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout).toBe(oldTip);
  });

  it('fails loudly when the pin is missing (release needs a committed pin)', () => {
    const f = makeFixture();
    expect(() => verifyEngine({ repoRoot: f.game })).toThrow(/pin file not found/);
  });

  it('checks out exactly the pinned SHA when it matches the remote target', () => {
    const f = makeFixture();
    const tip = f.advanceEngine();
    f.pinTo(tip);
    const res = verifyEngine({ repoRoot: f.game });
    expect(res.sha).toBe(tip);
    expect(git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout).toBe(tip);
  });

  it('re-pins an older checkout to the exact pinned SHA', () => {
    const f = makeFixture();
    const tip = f.advanceEngine();
    f.pinTo(tip);
    // Drift the checkout back to the original commit, then verify re-pins it.
    const original = git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout;
    git(path.join(f.game, 'core'), ['checkout', '-q', original]);
    expect(git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout).toBe(original);
    verifyEngine({ repoRoot: f.game });
    expect(git(path.join(f.game, 'core'), ['rev-parse', 'HEAD']).stdout).toBe(tip);
  });
});

describe('branch + remote target resolution', () => {
  it('resolves the tracked branch from .gitmodules (dev by default)', () => {
    const f = makeFixture();
    expect(resolveTrackedBranch(f.game)).toBe('dev');
  });

  it('resolves the remote target to the dev tip', () => {
    const f = makeFixture();
    const tip = f.advanceEngine();
    expect(resolveRemoteTarget(f.game)).toBe(tip);
  });

  it('derives the submodule path from the fixture layout', () => {
    const f = makeFixture();
    expect(fs.existsSync(path.join(f.game, DEFAULT_CORE_REL, '.git'))).toBe(true);
  });
});
