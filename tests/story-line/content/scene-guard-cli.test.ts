/**
 * Scene-space guard CLI tests (`storylines:guard --manifest`, CG-0MWUOF1RA008OKSI).
 *
 * The CLI is the scene-space guard's shipping surface: one flag beside the
 * existing `--csv` route-space mode, the same exit-code contract (`0` clean,
 * `1` a violation, a truncation or an unreadable/misconfigured input), and a
 * stable JSON report that keeps the existing top-level shape (`valid` plus
 * per-input detail) while adding the scene-space keys.
 *
 * What is pinned here:
 *
 * - the `--manifest` mode over the three committed control fixtures: the clean
 *   one passes, and each violating fixture fails naming the scene, the refused
 *   beat and the winning rule (or the stranded terminal states);
 * - the JSON report is byte-identical across runs, and a bound hit fails closed
 *   as truncation;
 * - the input diagnostics (unreadable/unparseable/invalid manifest, unknown
 *   adapter, unreadable declared content) exit 1 with an actionable message;
 * - the configured-target mode accepts manifest targets beside CSV ones, a
 *   malformed target is reported without aborting the batch, and the committed
 *   worked manifest is a configured target that passes — so
 *   `npm run storylines:guard` checks the beat sheet rather than vacuously
 *   passing;
 * - the CSV mode's report is untouched (its verdict stays a bare `PASS`), and
 *   `--csv` plus `--manifest` is rejected naming both modes.
 *
 * @module
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
  SCENE_GUARD_INVARIANT_REFUSAL_REACHES_ENDING,
} from '../../../src/story-line/content/scene-guard';
import { DEFAULT_EPISODE_MANIFEST_PATH } from '../../../scripts/storyline-manifest';
import {
  DEFAULT_GUARD_CONFIG_PATH,
  GUARD_USAGE,
  loadGuardConfig,
  parseStorylineGuardArgs,
  runStorylineGuardCli,
} from '../../../scripts/storyline-guard';
import { REPO_ROOT, captureOutput, makeTempDir } from './test-support';

/** The committed control fixtures directory. */
const FIXTURES_DIR = join(REPO_ROOT, 'tests/fixtures/story-line/scene-guard');

/** Absolute path of a scene-guard fixture file. */
function fixture(name: string): string {
  return join(FIXTURES_DIR, name);
}

/** The clean control manifest (both invariants hold). */
const CLEAN_MANIFEST = fixture('clean.episode.json');

/** Runs the guard CLI in-process, capturing both streams. */
function run(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  return captureOutput(() => runStorylineGuardCli(args));
}

/** Runs the guard CLI with `--json` and parses its stdout. */
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

/** Writes a JSON document to a temp directory and returns its absolute path. */
function writeJson(dir: string, name: string, document: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  return path;
}

describe('parseStorylineGuardArgs', () => {
  it('defaults to the configured-target mode (no csv, no manifest)', () => {
    const opts = parseStorylineGuardArgs([]);
    expect(opts.csvPath).toBeNull();
    expect(opts.manifestPath).toBeNull();
    expect(opts.json).toBe(false);
    expect(opts.configPath).toBe(DEFAULT_GUARD_CONFIG_PATH);
  });

  it('parses --manifest and its bounds', () => {
    const opts = parseStorylineGuardArgs([
      '--manifest',
      'episode.json',
      '--max-depth',
      '12',
      '--max-states',
      '40',
      '--json',
    ]);
    expect(opts).toMatchObject({
      manifestPath: 'episode.json',
      maxDepth: 12,
      maxStates: 40,
      json: true,
    });
    expect(opts.csvPath).toBeNull();
  });

  it('rejects --csv together with --manifest, naming both modes', () => {
    expect(() =>
      parseStorylineGuardArgs(['--csv', 'a.csv', '--manifest', 'a.json']),
    ).toThrow(/--csv \(route-space mode\) and --manifest \(scene-space mode\)/);
  });
});

describe('--help', () => {
  it('documents the manifest mode, its invariants and the mode conflict', () => {
    const { code, stdout, stderr } = run(['--help']);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(GUARD_USAGE);
    expect(stdout).toContain('--manifest');
    expect(stdout).toContain('no-success-on-exhausted-close');
    expect(stdout).toContain('refusal-reaches-ending');
    expect(stdout).toContain('mutually exclusive');
  });
});

describe('--manifest, clean control', () => {
  it('exits 0 and prints the scene-space PASS verdict', () => {
    const { code, stdout, stderr } = run(['--manifest', CLEAN_MANIFEST]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(`Scene guard: ${CLEAN_MANIFEST}`);
    expect(stdout).toContain('✓ no-success-on-exhausted-close');
    expect(stdout).toContain('✓ refusal-reaches-ending');
    expect(stdout).toContain('PASS (scene space)');
  });

  it('does not print the CSV-mode verdict (the modes stay distinguishable)', () => {
    const { stdout } = run(['--manifest', CLEAN_MANIFEST]);
    expect(stdout.match(/^PASS$/gm)).toBeNull();
  });
});

describe('--manifest, exhausted-success control', () => {
  it('exits 1 and names the scene, the refused beat and the winning rule', () => {
    const { code, stdout } = run(['--manifest', fixture('exhausted-success.episode.json')]);
    expect(code).toBe(1);
    expect(stdout).toContain(`✗ [${SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE}]`);
    expect(stdout).toContain('"sg-hall"');
    expect(stdout).toContain('"sg-hall-wait"');
    expect(stdout).toContain('"hall-held"');
    expect(stdout).toContain('FAIL (scene space)');
  });
});

describe('--manifest, refusal-strand control', () => {
  it('exits 1 and names the stranded terminal states', () => {
    const { code, stdout } = run(['--manifest', fixture('refusal-strand.episode.json')]);
    expect(code).toBe(1);
    expect(stdout).toContain(`✗ [${SCENE_GUARD_INVARIANT_REFUSAL_REACHES_ENDING}]`);
    expect(stdout).toContain('"sg-hold"');
    expect(stdout).toContain('"sg-hold-wait"');
    expect(stdout).toContain('"hold-spent"');
    expect(stdout).toContain('sg-hold, sg-loop');
    expect(stdout).toContain('FAIL (scene space)');
  });
});

describe('--manifest --json', () => {
  it('keeps the top-level shape and adds the scene-space keys', () => {
    const { code, report } = runJson(['--manifest', CLEAN_MANIFEST]);
    expect(code).toBe(0);
    expect(report.valid).toBe(true);
    expect(report.manifest).toBe(CLEAN_MANIFEST);
    expect(report.content).toBe('tests/fixtures/story-line/scene-guard/clean.csv');
    expect(report.adapter).toBe('long-erasure');
    expect(report.episodeId).toBe('scene-guard-clean');
    expect(Array.isArray(report.invariants)).toBe(true);
    expect(Array.isArray(report.sceneExits)).toBe(true);
    expect(Array.isArray(report.beatRefusals)).toBe(true);
    expect(report.violations).toEqual([]);
    // The CSV-mode keys are absent: this is one mode's report, not a mix.
    expect(report.csv).toBeUndefined();
    expect(report.gatedBranches).toBeUndefined();
  });

  it('is byte-identical across runs', () => {
    const first = runJson(['--manifest', CLEAN_MANIFEST]);
    const second = runJson(['--manifest', CLEAN_MANIFEST]);
    expect(second.stdout).toBe(first.stdout);
    expect(second.code).toBe(first.code);
  });

  it('reports a violation with the refused beat and the scene under the invariant', () => {
    const { code, report } = runJson([
      '--manifest',
      fixture('exhausted-success.episode.json'),
    ]);
    expect(code).toBe(1);
    expect(report.valid).toBe(false);
    expect(
      (report.violations as Record<string, unknown>[]).map((violation) => violation.invariant),
    ).toEqual([SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE]);
    expect(report.violations).toContainEqual(
      expect.objectContaining({
        cardId: 'sg-hall-wait',
        sceneId: 'sg-hall',
        ruleId: 'hall-held',
        outcome: 'success',
      }),
    );
  });

  it('fails closed when a bound truncates the enumeration', () => {
    const { code, report } = runJson([
      '--manifest',
      CLEAN_MANIFEST,
      '--max-states',
      '1',
    ]);
    expect(code).toBe(1);
    expect(report.valid).toBe(false);
    expect((report.exploration as Record<string, unknown>).truncated).toBe(true);
  });
});

describe('--manifest input diagnostics (exit 1)', () => {
  it('rejects an unreadable manifest', () => {
    const { code, stderr } = run(['--manifest', 'tests/fixtures/nope.episode.json']);
    expect(code).toBe(1);
    expect(stderr).toContain('cannot read manifest');
  });

  it('rejects an unparseable manifest', () => {
    const dir = makeTempDir();
    try {
      const path = join(dir.path, 'broken.episode.json');
      writeFileSync(path, '{ not json', 'utf-8');
      const { code, stderr } = run(['--manifest', path]);
      expect(code).toBe(1);
      expect(stderr).toContain('cannot parse manifest');
    } finally {
      dir.cleanup();
    }
  });

  it('rejects a manifest without a content binding', () => {
    const dir = makeTempDir();
    try {
      const path = writeJson(dir.path, 'no-content.episode.json', { id: 'no-content' });
      const { code, stderr } = run(['--manifest', path]);
      expect(code).toBe(1);
      expect(stderr).toContain('manifest declares no content binding');
    } finally {
      dir.cleanup();
    }
  });

  it('rejects an unknown content.adapter, naming the shipped adapters', () => {
    const dir = makeTempDir();
    try {
      const path = writeJson(dir.path, 'unknown-adapter.episode.json', {
        content: { adapter: 'not-a-game', file: 'tests/fixtures/story-line/scene-guard/clean.csv' },
      });
      const { code, stderr } = run(['--manifest', path]);
      expect(code).toBe(1);
      expect(stderr).toContain('unknown content.adapter "not-a-game"');
      expect(stderr).toContain('shipped adapters: gym, long-erasure');
    } finally {
      dir.cleanup();
    }
  });

  it('rejects an unreadable declared content file', () => {
    const dir = makeTempDir();
    try {
      const path = writeJson(dir.path, 'missing-content.episode.json', {
        content: { adapter: 'long-erasure', file: 'tests/fixtures/nope.csv' },
      });
      const { code, stderr } = run(['--manifest', path]);
      expect(code).toBe(1);
      expect(stderr).toContain('cannot read content tests/fixtures/nope.csv');
    } finally {
      dir.cleanup();
    }
  });

  it('refuses to enumerate a manifest that does not validate', () => {
    const dir = makeTempDir();
    try {
      const path = writeJson(dir.path, 'invalid.episode.json', {
        manifestVersion: 1,
        id: 'invalid',
        title: 'Invalid',
        content: {
          adapter: 'long-erasure',
          file: 'tests/fixtures/story-line/scene-guard/clean.csv',
        },
      });
      const { code, stderr } = run(['--manifest', path]);
      expect(code).toBe(1);
      expect(stderr).toContain('fails validation');
    } finally {
      dir.cleanup();
    }
  });

  it('rejects --csv together with --manifest (CLI path)', () => {
    const { code, stdout, stderr } = run([
      '--csv',
      'tests/fixtures/story-line/gdd-worked-examples.csv',
      '--manifest',
      CLEAN_MANIFEST,
    ]);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('--csv (route-space mode) and --manifest (scene-space mode)');
  });
});

describe('configured targets', () => {
  it('accepts a manifest target beside a CSV target and guards both', () => {
    const dir = makeTempDir();
    try {
      const config = writeJson(dir.path, 'guard.json', {
        targets: [
          {
            csv: 'tests/fixtures/story-line/gdd-worked-examples.csv',
            game: 'gym',
            initial: { coins: 3, reputation: 1 },
          },
          { manifest: 'tests/fixtures/story-line/scene-guard/clean.episode.json' },
        ],
      });
      const { code, stdout, stderr } = run(['--config', config]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('Content guard:');
      expect(stdout).toContain('Scene guard:');
      expect(stdout.match(/^PASS$/gm)?.length).toBe(1);
      expect(stdout.match(/^PASS \(scene space\)$/gm)?.length).toBe(1);
    } finally {
      dir.cleanup();
    }
  });

  it('keeps the batch JSON shape: valid, files, then manifests', () => {
    const dir = makeTempDir();
    try {
      const config = writeJson(dir.path, 'guard.json', {
        targets: [
          {
            csv: 'tests/fixtures/story-line/gdd-worked-examples.csv',
            game: 'gym',
            initial: { coins: 3, reputation: 1 },
          },
          { manifest: 'tests/fixtures/story-line/scene-guard/clean.episode.json' },
        ],
      });
      const { code, report } = runJson(['--config', config]);
      expect(code).toBe(0);
      expect(report.valid).toBe(true);
      const files = report.files as Record<string, unknown>[];
      const manifests = report.manifests as Record<string, unknown>[];
      expect(files).toHaveLength(1);
      expect(files[0].csv).toBe('tests/fixtures/story-line/gdd-worked-examples.csv');
      expect(manifests).toHaveLength(1);
      expect(manifests[0].manifest).toBe(
        'tests/fixtures/story-line/scene-guard/clean.episode.json',
      );
      expect(manifests[0].valid).toBe(true);
      expect(manifests[0].episodeId).toBe('scene-guard-clean');
    } finally {
      dir.cleanup();
    }
  });

  it('reports a malformed target without aborting the rest of the batch', () => {
    const dir = makeTempDir();
    try {
      const config = writeJson(dir.path, 'guard.json', {
        targets: [
          {
            csv: 'tests/fixtures/story-line/gdd-worked-examples.csv',
            manifest: 'tests/fixtures/story-line/scene-guard/clean.episode.json',
          },
          {},
          { manifest: 'tests/fixtures/story-line/scene-guard/clean.episode.json' },
        ],
      });
      const { code, stdout, stderr } = run(['--config', config]);
      expect(code).toBe(1);
      expect(stderr).toContain('name exactly one input');
      expect(stderr).toContain('target names no input');
      // The good target still ran and printed its own PASS verdict.
      expect(stdout).toContain('PASS (scene space)');
    } finally {
      dir.cleanup();
    }
  });

  it('guards the committed worked manifest and keeps the CSV verdicts bare', () => {
    const { code, stdout, stderr } = run([]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(`Scene guard: ${DEFAULT_EPISODE_MANIFEST_PATH}`);
    expect(stdout).toContain('PASS (scene space)');
    // The CSV mode's batch report is unchanged: one bare PASS per CSV target.
    expect(stdout.match(/^PASS$/gm)?.length).toBe(3);
  });

  it('declares the committed worked manifest as a configured target', () => {
    const config = loadGuardConfig(DEFAULT_GUARD_CONFIG_PATH);
    const manifestTargets = config.targets
      .filter((target) => target.manifest !== undefined)
      .map((target) => target.manifest);
    expect(manifestTargets).toContain(DEFAULT_EPISODE_MANIFEST_PATH);
    // Every manifest target names exactly one input.
    for (const target of config.targets) {
      expect(
        Number(target.csv !== undefined) + Number(target.manifest !== undefined),
      ).toBe(1);
    }
  });
});

describe('CSV mode is unchanged', () => {
  it('keeps the bare PASS verdict for an ad-hoc CSV run', () => {
    const { code, stdout } = run([
      '--csv',
      'tests/fixtures/story-line/gdd-worked-examples.csv',
      '--game',
      'gym',
      '--initial',
      'coins=3,reputation=1',
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain('Content guard:');
    expect(stdout.match(/^PASS$/gm)?.length).toBe(1);
  });
});
