/**
 * Episode-manifest validator CLI tests (CG-0MWSJYV86000ZHM4).
 *
 * The CLI is the beat sheet's `storylines:validate`: one command that loads a
 * manifest, resolves its `content.adapter` through the shipped adapter registry,
 * binds the content file's cards and declared resource set, and reports the
 * validator's findings with the exact manifest path that failed.
 *
 * Exit codes are the contract (0 = valid, 1 = any finding or an unreadable /
 * unresolvable input), so they are asserted directly alongside the report
 * content. The JSON report is a stability contract too: no timestamp, a fixed
 * key order, so two successive runs over the same input are byte-identical.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LONG_ERASURE_CONTENT_PATH } from '../../../src/story-line/content/adapters';
import {
  DEFAULT_EPISODE_MANIFEST_PATH,
  MANIFEST_USAGE,
  parseManifestArgs,
  runStorylineManifestCli,
} from '../../../scripts/storyline-manifest';
import { REPO_ROOT, captureOutput, makeTempDir } from './test-support';

/** The committed Appendix A manifest the default mode validates. */
const REFERENCE_PATH = resolve(REPO_ROOT, DEFAULT_EPISODE_MANIFEST_PATH);

/** The shipped content the committed manifest binds. */
const CONTENT_PATH = resolve(REPO_ROOT, LONG_ERASURE_CONTENT_PATH);

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

/** Writes a manifest document to a temp file and returns its absolute path. */
function writeManifest(dir: string, manifest: Record<string, unknown>): string {
  const path = join(dir, 'episode.json');
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  return path;
}

/** Runs the CLI with the shipped content pinned, capturing both streams. */
function run(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  return captureOutput(() => runStorylineManifestCli(args));
}

/** Parses the CLI's stdout as the stable JSON report. */
function runJson(args: readonly string[]): {
  code: number;
  report: Record<string, unknown>;
  stdout: string;
  stderr: string;
} {
  const outcome = run([...args, '--json']);
  return {
    code: outcome.code,
    report: JSON.parse(outcome.stdout) as Record<string, unknown>,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
  };
}

describe('parseManifestArgs', () => {
  it('defaults to the committed Appendix A manifest and the text report', () => {
    const opts = parseManifestArgs([]);
    expect(opts.manifestPath).toBe(DEFAULT_EPISODE_MANIFEST_PATH);
    expect(opts.contentPath).toBeUndefined();
    expect(opts.json).toBe(false);
    expect(opts.help).toBe(false);
  });

  it('parses --manifest, --content, --json and --help', () => {
    const opts = parseManifestArgs([
      '--manifest',
      'a.json',
      '--content',
      'a.csv',
      '--json',
      '--help',
    ]);
    expect(opts).toMatchObject({
      manifestPath: 'a.json',
      contentPath: 'a.csv',
      json: true,
      help: true,
    });
  });
});

describe('--help', () => {
  it('exits 0 and documents the flags, the default manifest and the exit codes', () => {
    const { code, stdout, stderr } = run(['--help']);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(MANIFEST_USAGE);
    expect(stdout).toContain('--manifest');
    expect(stdout).toContain('--content');
    expect(stdout).toContain('--json');
    expect(stdout).toContain(DEFAULT_EPISODE_MANIFEST_PATH);
    expect(stdout).toContain('Exit codes');
  });
});

describe('clean manifest', () => {
  it('validates the committed default manifest and prints the path it used', () => {
    const { code, stdout, stderr } = run([]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(REFERENCE_PATH);
    expect(stdout).toContain('RESULT: VALID');
  });

  it('reports valid: true with the resolved paths and the content binding', () => {
    const { code, report, stderr } = runJson(['--manifest', REFERENCE_PATH]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(report).toMatchObject({
      valid: true,
      manifestId: 'long-erasure',
      manifest: REFERENCE_PATH,
      content: CONTENT_PATH,
      adapter: 'long-erasure',
    });
    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({ acts: 3, scenes: 5, beats: 15 });
  });

  it('produces byte-identical JSON on two successive runs', () => {
    const first = run(['--manifest', REFERENCE_PATH, '--json']);
    const second = run(['--manifest', REFERENCE_PATH, '--json']);
    expect(first.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    // No clock: the report can never carry a timestamp.
    expect(first.stdout).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('prints the report in a fixed key order (no finding keys drift)', () => {
    const { report } = runJson(['--manifest', REFERENCE_PATH]);
    expect(Object.keys(report)).toEqual([
      'valid',
      'manifestId',
      'manifest',
      'content',
      'adapter',
      'counts',
      'rules',
      'findings',
    ]);
  });
});

describe('a broken manifest', () => {
  it('exits non-zero and reports the expected code with its path', () => {
    const temp = makeTempDir();
    try {
      const manifest = readJson(REFERENCE_PATH);
      const acts = manifest.acts as Array<{
        scenes: Array<{ beats: Array<Record<string, unknown>> }>;
      }>;
      // One documented mutation: the opening beat's clock cost is illegal.
      acts[0].scenes[0].beats[0].clockCost = -1;
      const path = writeManifest(temp.path, manifest);

      const { code, report, stderr } = runJson([
        '--manifest',
        path,
        '--content',
        CONTENT_PATH,
      ]);
      expect(code).not.toBe(0);
      expect(stderr).toBe('');
      expect(report.valid).toBe(false);
      expect(report.manifestId).toBe('long-erasure');
      expect(report.manifest).toBe(path);
      expect(report.content).toBe(CONTENT_PATH);

      const findings = report.findings as Array<Record<string, unknown>>;
      const finding = findings.find((entry) => entry.code === 'numeric-invalid');
      expect(finding).toBeDefined();
      expect(finding).toMatchObject({
        code: 'numeric-invalid',
        path: 'acts[0].scenes[0].beats[0].clockCost',
        manifestId: 'long-erasure',
      });
      expect(typeof finding?.message).toBe('string');
    } finally {
      temp.cleanup();
    }
  });

  it('prints RESULT: INVALID in the text report', () => {
    const temp = makeTempDir();
    try {
      const manifest = readJson(REFERENCE_PATH);
      (manifest.acts as Array<Record<string, unknown>>)[1].id = 'act-i';
      const path = writeManifest(temp.path, manifest);

      const { code, stdout } = run(['--manifest', path, '--content', CONTENT_PATH]);
      expect(code).not.toBe(0);
      expect(stdout).toContain('RESULT: INVALID');
      expect(stdout).toContain('[duplicate-act]');
    } finally {
      temp.cleanup();
    }
  });
});

describe('--content override', () => {
  it('binds the overridden content file and reports it as the content path', () => {
    const temp = makeTempDir();
    try {
      const copy = join(temp.path, 'content-copy.csv');
      copyFileSync(CONTENT_PATH, copy);

      const { code, report } = runJson([
        '--manifest',
        REFERENCE_PATH,
        '--content',
        copy,
      ]);
      expect(code).toBe(0);
      expect(report.content).toBe(copy);
    } finally {
      temp.cleanup();
    }
  });
});

describe('diagnostics', () => {
  it('an unreadable manifest is a non-zero diagnostic, never a throw', () => {
    const missing = join(REPO_ROOT, 'tests/fixtures/does-not-exist-manifest.json');
    const { code, stdout, stderr } = run(['--manifest', missing]);
    expect(code).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('storyline-manifest: cannot read');
    expect(stderr).toContain(missing);
  });

  it('a malformed manifest is a non-zero diagnostic naming the parse error', () => {
    const temp = makeTempDir();
    try {
      const path = join(temp.path, 'episode.json');
      writeFileSync(path, '{ not json', 'utf-8');
      const { code, stderr } = run(['--manifest', path]);
      expect(code).not.toBe(0);
      expect(stderr).toContain('storyline-manifest: cannot parse');
      expect(stderr).toContain(path);
    } finally {
      temp.cleanup();
    }
  });

  it('an unknown content.adapter is a non-zero diagnostic listing the shipped adapters', () => {
    const temp = makeTempDir();
    try {
      const manifest = readJson(REFERENCE_PATH);
      (manifest.content as Record<string, unknown>).adapter = 'no-such-game';
      const path = writeManifest(temp.path, manifest);

      const { code, stdout, stderr } = run(['--manifest', path, '--content', CONTENT_PATH]);
      expect(code).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('unknown content.adapter "no-such-game"');
      expect(stderr).toContain('long-erasure');
    } finally {
      temp.cleanup();
    }
  });

  it('an unreadable content file is a non-zero diagnostic naming the path', () => {
    const missing = join(REPO_ROOT, 'tests/fixtures/does-not-exist-content.csv');
    const { code, stderr } = run(['--manifest', REFERENCE_PATH, '--content', missing]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('storyline-manifest: cannot read content');
    expect(stderr).toContain(missing);
  });
});

describe('tsx entry point', () => {
  it('runs under tsx with no Vite loader and exits 0 for --help', () => {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(
      npx,
      ['--no-install', 'tsx', join('scripts', 'storyline-manifest.ts'), '--help'],
      { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 120_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(MANIFEST_USAGE);
  });
});
