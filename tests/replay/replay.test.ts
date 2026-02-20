/**
 * Integration tests for the replay CLI tool (scripts/replay.ts).
 *
 * Tests transcript loading/validation via CLI subprocess invocation
 * and summary report structure by reading previously-generated output.
 *
 * Note: CLI invocation tests use longer timeouts because the replay
 * script imports Playwright, which adds ~5-6s of module loading time.
 *
 * See CG-0MLU5G2A707CSMKD.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ── Helpers ─────────────────────────────────────────────────

/**
 * Run the replay CLI via `node --import tsx/esm` and return results.
 * Uses spawnSync with a generous timeout to account for Playwright
 * module loading overhead (~6s).
 */
function runReplay(
  args: string[],
  timeoutMs = 15_000,
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', 'scripts/replay.ts', ...args],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: timeoutMs,
      env: { ...process.env },
    },
  );

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? (result.signal ? 1 : 0),
  };
}

// ── Transcript Validation Tests ─────────────────────────────

describe('Replay CLI -- transcript validation', () => {
  // These tests invoke the full CLI, which loads Playwright (~6s).
  // They validate that the CLI exits correctly for various error cases.

  it(
    'should show help text when --help flag is provided',
    () => {
      const result = runReplay(['--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--output');
      expect(result.stdout).toContain('transcript.json');
    },
    20_000,
  );

  it(
    'should exit with error when transcript file does not exist',
    () => {
      const result = runReplay(['non-existent-file.json']);
      expect(result.exitCode).not.toBe(0);
      // console.error writes to stderr
      const output = result.stdout + result.stderr;
      expect(output).toContain('not found');
    },
    20_000,
  );

  describe('invalid transcript files', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-test-'));
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it(
      'should exit with error for invalid JSON',
      () => {
        const filePath = path.join(tmpDir, 'bad.json');
        fs.writeFileSync(filePath, '{ not valid json !!!');

        const result = runReplay([filePath]);
        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain('invalid JSON');
      },
      20_000,
    );

    it(
      'should exit with error for wrong transcript version',
      () => {
        const filePath = path.join(tmpDir, 'wrong-version.json');
        fs.writeFileSync(
          filePath,
          JSON.stringify({
            version: 99,
            metadata: {},
            initialState: {
              boardStates: [],
              discardTop: null,
              stockRemaining: 0,
            },
            turns: [],
            results: null,
          }),
        );

        const result = runReplay([filePath]);
        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain('version');
      },
      20_000,
    );

    it(
      'should exit with error for missing initialState',
      () => {
        const filePath = path.join(tmpDir, 'no-initial.json');
        fs.writeFileSync(
          filePath,
          JSON.stringify({
            version: 1,
            metadata: {},
            turns: [],
            results: null,
          }),
        );

        const result = runReplay([filePath]);
        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain('initialState');
      },
      20_000,
    );
  });
});

// ── Summary Report Structure Tests ──────────────────────────

describe('Replay CLI -- summary report structure', () => {
  // These tests validate the structure of a previously-generated
  // replay summary. They are fast (no subprocess) and run against
  // the fixture-test output directory.
  const summaryPath = path.resolve(
    PROJECT_ROOT,
    'data/screenshots/golf/fixture-test/replay-summary.json',
  );

  const summaryExists = fs.existsSync(summaryPath);

  it.skipIf(!summaryExists)(
    'should contain required top-level fields',
    () => {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

      expect(summary).toHaveProperty('transcriptPath');
      expect(summary).toHaveProperty('outputDir');
      expect(summary).toHaveProperty('turnsReplayed');
      expect(summary).toHaveProperty('screenshots');
      expect(summary).toHaveProperty('totalDurationMs');
      expect(summary).toHaveProperty('errors');
    },
  );

  it.skipIf(!summaryExists)(
    'should report 14 turns replayed from fixture transcript',
    () => {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

      expect(summary.turnsReplayed).toBe(14);
      expect(summary.errors).toHaveLength(0);
    },
  );

  it.skipIf(!summaryExists)(
    'should have 15 screenshot entries (initial + 14 turns)',
    () => {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

      expect(summary.screenshots).toHaveLength(15);
      expect(summary.screenshots[0].turn).toBe(0);
      expect(summary.screenshots[14].turn).toBe(14);
    },
  );

  it.skipIf(!summaryExists)(
    'should have valid screenshot entries with required fields',
    () => {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

      for (const entry of summary.screenshots) {
        expect(entry).toHaveProperty('turn');
        expect(entry).toHaveProperty('screenshotPath');
        expect(entry).toHaveProperty('durationMs');
        expect(typeof entry.turn).toBe('number');
        expect(typeof entry.screenshotPath).toBe('string');
        expect(typeof entry.durationMs).toBe('number');
        expect(entry.durationMs).toBeGreaterThan(0);
      }
    },
  );

  it.skipIf(!summaryExists)(
    'should have positive total duration',
    () => {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

      expect(summary.totalDurationMs).toBeGreaterThan(0);
    },
  );
});
