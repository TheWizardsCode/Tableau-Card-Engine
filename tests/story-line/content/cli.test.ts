/**
 * Validator CLI tests.
 *
 * Exit codes are the CLI's contract (0 = valid, 1 = invalid), so they are
 * asserted directly alongside the report content. One end-to-end subprocess
 * case proves the three thin entry points really run under `tsx` with no Vite
 * loader or game dependency.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT_PATH } from '../../../src/story-line/content/adapters';
import { DEFAULT_GRAPH_OUTPUTS } from '../../../scripts/storyline-graph';
import {
  parseValidateStorylinesArgs,
  runValidateStorylinesCli,
} from '../../../scripts/validate-storylines';
import { REPO_ROOT, captureOutput, fixturePath, makeTempDir } from './test-support';

const GYM_CONTENT = join(REPO_ROOT, DEFAULT_CONTENT_PATH);

/** Runs a `tsx` script in a subprocess and returns its outcome. */
function runTsx(script: string, args: readonly string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npx, ['--no-install', 'tsx', join('scripts', script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('parseValidateStorylinesArgs', () => {
  it('defaults to the Gym content and the text report', () => {
    const opts = parseValidateStorylinesArgs([]);
    expect(opts.csvPath).toBe('example-games/gym/content/storylines.csv');
    expect(opts.json).toBe(false);
    expect(opts.failOnCycle).toBe(false);
    expect(opts.help).toBe(false);
  });

  it('parses flags', () => {
    const opts = parseValidateStorylinesArgs([
      '--csv',
      'a.csv',
      '--game',
      'gym',
      '--json',
      '--fail-on-cycle',
    ]);
    expect(opts).toMatchObject({
      csvPath: 'a.csv',
      gameId: 'gym',
      json: true,
      failOnCycle: true,
    });
  });
});

describe('validate-storylines CLI', () => {
  it('exits 0 and reports VALID for valid content', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli(['--csv', GYM_CONTENT]),
    );
    expect(code).toBe(0);
    expect(stdout).toContain('RESULT: VALID');
  });

  it('exits 1 with a JSON report naming the offending card', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli(['--csv', fixturePath('gym-broken-dangling.csv'), '--json']),
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.valid).toBe(false);
    expect(report.issues[0]).toMatchObject({
      code: 'unknown-successor',
      cardId: 'gym-open',
      target: 'gym-missing',
    });
  });

  it('fails on a cycle only with --fail-on-cycle', () => {
    const csv = fixturePath('gym-cycle.csv');
    expect(captureOutput(() => runValidateStorylinesCli(['--csv', csv])).code).toBe(0);
    const strict = captureOutput(() =>
      runValidateStorylinesCli(['--csv', csv, '--fail-on-cycle']),
    );
    expect(strict.code).toBe(1);
    expect(strict.stdout).toContain('cycle-error');
  });

  it('exits 1 for an unknown adapter, a missing file and prints usage for --help', () => {
    expect(
      captureOutput(() => runValidateStorylinesCli(['--csv', GYM_CONTENT, '--game', 'nope']))
        .code,
    ).toBe(1);

    const temp = makeTempDir();
    try {
      const missing = captureOutput(() =>
        runValidateStorylinesCli(['--csv', join(temp.path, 'absent.csv')]),
      );
      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain('cannot read');
    } finally {
      temp.cleanup();
    }

    const help = captureOutput(() => runValidateStorylinesCli(['--help']));
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Validate story-line content');
  });
});

describe('tsx entry points', () => {
  it('runs validate-storylines.ts under tsx and emits parseable JSON', () => {
    const result = runTsx('validate-storylines.ts', ['--csv', GYM_CONTENT, '--json']);
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, gameId: 'gym' });
  });

  it('runs storyline-graph.ts --check under tsx against the committed artefacts', () => {
    const result = runTsx('storyline-graph.ts', ['--format', 'json', '--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('is up to date');
  });
});

describe('shipped content location', () => {
  it('keeps the default content and its artefacts out of any ignore rule', () => {
    // A repo-wide `data/` ignore rule once swallowed these files while the
    // in-worktree suite still passed, so the committed demo content silently
    // disappeared. `git check-ignore` exits 1 when a path is *not* ignored;
    // that is the property the shipped artefacts need (they are committed).
    const paths = [
      DEFAULT_CONTENT_PATH,
      DEFAULT_GRAPH_OUTPUTS.json,
      DEFAULT_GRAPH_OUTPUTS.mermaid,
    ];
    for (const path of paths) {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
      const ignored = spawnSync('git', ['check-ignore', '-q', path], {
        cwd: REPO_ROOT,
      });
      expect(ignored.status, `${path} must not be git-ignored`).toBe(1);
    }
  });
});
