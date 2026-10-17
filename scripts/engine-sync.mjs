#!/usr/bin/env node
/**
 * Engine submodule sync/verify for a single-game TCE launcher
 * (MS-0MVCRGKZY007DIED).
 *
 * Game repos compose the Tableau-Card-Engine checkout as a git submodule at
 * `./core`. Two build-time policies keep that checkout coherent:
 *
 * - **sync** (dev builds, `npm run engine:sync`): always compose the LATEST
 *   engine — refuse loudly when `./core` has uncommitted changes (never
 *   clobber), then run `git submodule update --remote core` so the tracked
 *   branch's remote tip is fetched and checked out. When the remote is
 *   unreachable (network failure) the build falls back to the current
 *   checkout with a warning instead of failing (risk note: offline builds
 *   keep working).
 * - **verify** (release builds, `npm run engine:verify`): pin the engine to a
 *   committed SHA — refuse loudly when `./core` has local modifications, read
 *   `configs/engine-pin.json` (a single `sha` field), confirm the pinned SHA
 *   equals the remote-resolved target (the tip of the branch `core` tracks),
 *   then check out exactly that SHA. Release builds require the remote to be
 *   reachable so the pin can be compared; a mismatch fails the build.
 *
 * The npm scripts wrap this script:
 *
 *   "engine:sync":   "node scripts/engine-sync.mjs sync"
 *   "engine:verify": "node scripts/engine-sync.mjs verify"
 *
 * This file is the canonical implementation in the engine repo; the game-repo
 * scaffold (`scripts/game-repo-scaffold.ts`) copies it into each game repo as
 * `scripts/engine-sync.mjs`, so edit it here and re-scaffold — never edit the
 * generated copy by hand.
 *
 * Subcommands:
 *   node engine-sync.mjs sync|verify [--core-rel <path>] [--pin <path>]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Submodule path relative to the game repo root (from .gitmodules). */
export const DEFAULT_CORE_REL = 'core';

/** Engine pin file relative to the game repo root. */
export const DEFAULT_PIN_REL = path.join('configs', 'engine-pin.json');

/** Error type for deterministic failure messages. */
export class EngineSyncError extends Error {}

/**
 * Run a git command from a given cwd.
 * @returns {{ ok: boolean, code: number, stdout: string, stderr: string }}
 */
export function runGit(cwd, args, env = {}) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  const code = res.status ?? 1;
  return {
    ok: code === 0,
    code,
    stdout: (res.stdout ?? '').trim(),
    stderr: (res.stderr ?? '').trim(),
  };
}

/** Absolute submodule directory for a game repo root. */
export function corePath(repoRoot, coreRel = DEFAULT_CORE_REL) {
  return path.join(repoRoot, coreRel);
}

/**
 * True when the submodule working tree has uncommitted changes (tracked
 * modifications, staged files, or untracked files that would block a
 * checkout). `git -C <sub> status --porcelain` is the guard: any output means
 * dirty. A submodule that is not (yet) a git repo returns true so sync/verify
 * never attempt to clobber it.
 */
export function submoduleIsDirty(repoRoot, coreRel = DEFAULT_CORE_REL) {
  const sub = corePath(repoRoot, coreRel);
  // Not a git repo at all → cannot prove it is safe to update (sync/verify
  // will fail loudly via ensureSubmoduleInit when it is uninitialised).
  if (!fs.existsSync(path.join(sub, '.git'))) return true;
  const res = runGit(repoRoot, ['-C', coreRel, 'status', '--porcelain', '--untracked-files=all']);
  return !res.ok || res.stdout.length > 0;
}

/**
 * Ensure the submodule is present and registered. Returns an array of extra
 * git args to pass (none here), or throws a loud failure when the submodule
 * cannot be initialised.
 */
export function ensureSubmoduleInit(repoRoot, coreRel = DEFAULT_CORE_REL) {
  const sub = corePath(repoRoot, coreRel);
  if (!fs.existsSync(path.join(sub, '.git'))) {
    // Initialise from .gitmodules (never depends on the remote yet).
    const res = runGit(repoRoot, ['submodule', 'update', '--init', '--recursive', coreRel]);
    if (!res.ok) {
      throw new EngineSyncError(
        `${coreRel} submodule is not initialised and could not be initialised:\n` +
          `${res.stderr}\n` +
          `Run 'git submodule update --init --recursive' and retry.`,
      );
    }
  }
}

/**
 * The branch the `core` submodule tracks (for `--remote` resolution):
 * `submodule.core.branch` from `.gitmodules` / local config, falling back to
 * the remote's default branch (`HEAD`).
 */
export function resolveTrackedBranch(repoRoot, coreRel = DEFAULT_CORE_REL) {
  for (const args of [
    ['config', '-f', path.join(repoRoot, '.gitmodules'), '--get', 'submodule.core.branch'],
    ['config', '--get', 'submodule.core.branch'],
  ]) {
    const res = runGit(repoRoot, args);
    if (res.ok && res.stdout) return res.stdout.trim();
  }
  // Default: remote HEAD (the default branch of the submodule's remote).
  return '';
}

/**
 * Resolve the remote target: the full SHA that `git submodule update
 * --remote core` would check out — the tip of the branch the submodule
 * tracks (or the remote's default branch when no branch is configured).
 */
export function resolveRemoteTarget(repoRoot, coreRel = DEFAULT_CORE_REL) {
  const gitmodules = path.join(repoRoot, '.gitmodules');
  const branch = resolveTrackedBranch(repoRoot, coreRel);
  for (const args of [
    ['config', '-f', gitmodules, '--get', 'submodule.core.url'],
    ['config', '--get', 'submodule.core.url'],
  ]) {
    const res = runGit(repoRoot, args);
    if (res.ok && res.stdout) {
      const url = res.stdout.trim();
      const ref = branch ? `refs/heads/${branch}` : 'HEAD';
      const ls = runGit(repoRoot, ['ls-remote', url, ref]);
      if (!ls.ok) {
        throw new EngineSyncError(
          `engine:verify: cannot resolve remote target for ${coreRel} (${url} ${ref}):\n${ls.stderr}\n` +
            `Release builds need network access so the pin can be checked.`,
        );
      }
      const sha = ls.stdout.split(/\s+/)[0];
      if (!/^[0-9a-f]{40}$/i.test(sha)) {
        throw new EngineSyncError(
          `engine:verify: unexpected ls-remote output for ${url} ${ref}:\n${ls.stdout}`,
        );
      }
      return sha;
    }
  }
  throw new EngineSyncError(
    `engine:verify: no remote URL configured for the ${coreRel} submodule. ` +
      `Check .gitmodules.`,
  );
}

/**
 * Read the engine pin file (default `configs/engine-pin.json`) and return its
 * `sha` field. Throws EngineSyncError with a loud, actionable message when the
 * file is missing, malformed, or has no sha.
 */
export function readPin(repoRoot, pinRel = DEFAULT_PIN_REL) {
  const pinPath = path.join(repoRoot, pinRel);
  let raw;
  try {
    raw = fs.readFileSync(pinPath, 'utf-8');
  } catch {
    throw new EngineSyncError(
      `engine:verify: engine pin file not found: ${pinRel}\n` +
        `Release builds compile against a committed engine SHA. Create ` +
        `${pinRel} with a single "sha" field (e.g. {"sha": "${'0'.repeat(40)}"}); ` +
        `the release process writes it alongside the version bump.`,
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new EngineSyncError(
      `engine:verify: engine pin file ${pinRel} is not valid JSON: ${String(err)}`,
    );
  }
  const sha = data && typeof data === 'object' && 'sha' in data ? String(data.sha) : '';
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new EngineSyncError(
      `engine:verify: engine pin file ${pinRel} must contain a single "sha" ` +
        `field with a hex commit SHA (7–40 chars), got ${JSON.stringify(data)}.`,
    );
  }
  return sha;
}

/** Expand a (possibly short) SHA to a full 40-hex SHA via rev-parse. */
export function resolveShaFull(repoRoot, coreRel, sha) {
  const res = runGit(corePath(repoRoot, coreRel), ['rev-parse', `${sha}^{commit}`]);
  if (!res.ok) return null;
  return res.stdout.split(/\s+/)[0] ?? null;
}

/**
 * sync: refuse loudly on a dirty submodule, then `git submodule update
 * --remote core` so dev builds follow the latest engine of the tracked
 * branch. On network failure, warn and fall back to the current checkout
 * (exit 0) per the documented offline-build assumption.
 *
 * @returns {{ updated: boolean, from: string, to: string, warning?: string }}
 */
export function syncEngine({ repoRoot, coreRel = DEFAULT_CORE_REL, log = console.log }) {
  ensureSubmoduleInit(repoRoot, coreRel);
  if (submoduleIsDirty(repoRoot, coreRel)) {
    throw new EngineSyncError(
      `engine:sync: ${coreRel} has uncommitted changes — refusing to sync ` +
        `(never clobber).\nCommit, stash or discard the changes in ${coreRel} ` +
        `and rerun the build, or use engine:verify for a pinned release build.`,
    );
  }
  const before = resolveShaFull(repoRoot, coreRel, 'HEAD');
  const res = runGit(repoRoot, ['submodule', 'update', '--init', '--recursive', '--remote', coreRel]);
  if (!res.ok) {
    const msg = `${res.stderr}\n${res.stdout}`;
    if (/unable to access|could not resolve|connection timed out|operation timed out|failed to connect|fatal: unable to access/i.test(msg)) {
      log(`engine:sync: WARNING remote unreachable — using existing ${coreRel} checkout (no change).`);
      log(msg.trim());
      return { updated: false, from: before ?? '', to: before ?? '', warning: 'remote unreachable' };
    }
    throw new EngineSyncError(
      `engine:sync: failed to update ${coreRel}:\n${msg}\n` +
        `If the engine repo is unreachable, your build toolchain is offline ` +
        `and the existing checkout was kept.`,
    );
  }
  const after = resolveShaFull(repoRoot, coreRel, 'HEAD');
  log(`engine:sync: ${coreRel} updated ${(before ?? '').slice(0, 10)} → ${(after ?? '').slice(0, 10)}`);
  return { updated: before !== after, from: before ?? '', to: after ?? '' };
}

/**
 * verify: refuse loudly on a dirty submodule, read the pin, compare the
 * pinned SHA against the remote-resolved target of the tracked branch, then
 * check out exactly the pinned SHA. Release builds require a reachable
 * remote so the pin can be verified.
 *
 * @returns {{ sha: string }}
 */
export function verifyEngine({ repoRoot, coreRel = DEFAULT_CORE_REL, pinRel = DEFAULT_PIN_REL, log = console.log }) {
  ensureSubmoduleInit(repoRoot, coreRel);
  if (submoduleIsDirty(repoRoot, coreRel)) {
    throw new EngineSyncError(
      `engine:verify: ${coreRel} has local modifications — refusing to verify ` +
        `(release builds must be reproducible).\nClean ${coreRel} and rerun.`,
    );
  }
  const pinned = readPin(repoRoot, pinRel);
  const target = resolveRemoteTarget(repoRoot, coreRel);
  // Fetch so the pinned commit's objects exist locally before resolving it to
  // a full SHA (release builds possess network by construction).
  runGit(repoRoot, ['submodule', 'update', '--init', '--recursive', coreRel]);
  runGit(corePath(repoRoot, coreRel), ['fetch', 'origin']);
  const pinnedFull = resolveShaFull(repoRoot, coreRel, pinned);
  if (!pinnedFull) {
    throw new EngineSyncError(
      `engine:verify: pinned engine SHA ${pinned} (${pinRel}) is not reachable ` +
        `from ${coreRel}'s remotes — check the pin.`,
    );
  }
  if (pinnedFull !== target) {
    throw new EngineSyncError(
      `engine:verify: PIN MISMATCH — pinned engine ${pinnedFull} (${pinRel}) ` +
        `differs from the remote-resolved target ${target} of the branch ${coreRel} tracks.\n` +
        `Update ${pinRel} to {"sha": "${target}"} alongside the release version bump.`,
    );
  }
  // Check out exactly the pinned SHA (detached HEAD — this is a build, not a
  // checkout-to-work login).
  const checkout = runGit(corePath(repoRoot, coreRel), ['checkout', '--detach', pinnedFull]);
  if (!checkout.ok) {
    throw new EngineSyncError(
      `engine:verify: failed to check out pinned engine ${pinnedFull}:\n${checkout.stderr}`,
    );
  }
  log(`engine:verify: engine pinned and checked out at ${pinnedFull}`);
  return { sha: pinnedFull };
}

/** CLI entry: `node engine-sync.mjs sync|verify [--core-rel path] [--pin path]`. */
export function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const [mode, ...rest] = argv;
  const flagValue = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const coreRel = flagValue('core-rel') ?? DEFAULT_CORE_REL;
  const pinRel = flagValue('pin') ?? DEFAULT_PIN_REL;
  let result;
  try {
    if (mode === 'sync') result = syncEngine({ repoRoot: process.cwd(), coreRel });
    else if (mode === 'verify') result = verifyEngine({ repoRoot: process.cwd(), coreRel, pinRel });
    else {
      io.stderr.write(
        `usage: node engine-sync.mjs <sync|verify> [--core-rel <path>] [--pin <path>]\n` +
          `  sync    dev build   — follow latest engine remote head (offline: keep current)\n` +
          `  verify  release     — check out exactly configs/engine-pin.json's sha\n`,
      );
      return 2;
    }
    io.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
    return 0;
  } catch (err) {
    io.stderr.write(`${err instanceof EngineSyncError ? err.message : String(err)}\n`);
    io.stdout.write(JSON.stringify({ ok: false, error: err instanceof EngineSyncError ? err.message : String(err) }) + '\n');
    return 1;
  }
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
