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
const FIXTURE_TRANSCRIPT = path.join(
  PROJECT_ROOT,
  'tests/fixtures/transcripts/golf/fixture-game.json',
);

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

// ── --stop-at Argument Validation Tests ─────────────────────

describe('Replay CLI -- --stop-at argument validation', () => {
  it(
    'should exit with error when --stop-at has no value',
    () => {
      const result = runReplay([FIXTURE_TRANSCRIPT, '--stop-at']);
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('non-negative integer');
    },
    20_000,
  );

  it(
    'should exit with error when --stop-at is negative',
    () => {
      const result = runReplay([FIXTURE_TRANSCRIPT, '--stop-at', '-1']);
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('non-negative integer');
    },
    20_000,
  );

  it(
    'should exit with error when --stop-at is a decimal',
    () => {
      const result = runReplay([FIXTURE_TRANSCRIPT, '--stop-at', '3.5']);
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('non-negative integer');
    },
    20_000,
  );

  it(
    'should show --stop-at in help text',
    () => {
      const result = runReplay(['--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--stop-at');
    },
    20_000,
  );
});

// ── V1 Transcript Backward Compatibility Tests ──────────────

describe('Replay CLI -- v1 transcript handling', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-v1-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Create a minimal v1 transcript file. Has valid structure but no
   * stockPileCards (the key v1 limitation). Contains enough data to
   * pass basic CLI validation (version, initialState, turns array).
   */
  function createV1TranscriptFile(filename: string): string {
    const filePath = path.join(tmpDir, filename);
    const v1Transcript = {
      version: 1,
      metadata: {
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: '2026-01-01T00:01:00.000Z',
        players: [
          { name: 'Player 0', isAI: true, strategy: 'random' },
          { name: 'Player 1', isAI: true, strategy: 'random' },
        ],
      },
      initialState: {
        boardStates: [
          {
            grid: Array.from({ length: 9 }, () => ({ rank: '5', suit: 'hearts', faceUp: false })),
            faceUpCount: 0,
            visibleScore: 0,
            totalScore: 45,
          },
          {
            grid: Array.from({ length: 9 }, () => ({ rank: '6', suit: 'clubs', faceUp: false })),
            faceUpCount: 0,
            visibleScore: 0,
            totalScore: 54,
          },
        ],
        discardTop: { rank: '3', suit: 'spades', faceUp: true },
        stockRemaining: 33,
        // NOTE: no stockPileCards — this is what makes it v1
      },
      turns: [
        {
          turnNumber: 0,
          playerIndex: 0,
          playerName: 'Player 0',
          drawSource: 'stock',
          drawnCard: { rank: '7', suit: 'diamonds', faceUp: true },
          move: { kind: 'swap', row: 0, col: 0 },
          discardedCard: { rank: '5', suit: 'hearts', faceUp: true },
          boardStates: [
            {
              grid: Array.from({ length: 9 }, (_, i) =>
                i === 0
                  ? { rank: '7', suit: 'diamonds', faceUp: true }
                  : { rank: '5', suit: 'hearts', faceUp: false },
              ),
              faceUpCount: 1,
              visibleScore: 7,
              totalScore: 47,
            },
            {
              grid: Array.from({ length: 9 }, () => ({ rank: '6', suit: 'clubs', faceUp: false })),
              faceUpCount: 0,
              visibleScore: 0,
              totalScore: 54,
            },
          ],
          stockRemaining: 32,
          roundEnded: false,
        },
      ],
      results: null,
    };
    fs.writeFileSync(filePath, JSON.stringify(v1Transcript));
    return filePath;
  }

  it(
    'should reject v1 transcript when --stop-at is used',
    () => {
      const filePath = createV1TranscriptFile('v1-stop-at.json');
      const result = runReplay([filePath, '--stop-at', '0']);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('--stop-at requires a v2 transcript');
      expect(output).toContain('Re-record the game');
    },
    20_000,
  );

  it(
    'should accept v1 transcript for regular replay (no --stop-at)',
    () => {
      const filePath = createV1TranscriptFile('v1-regular.json');
      // Run with a very short timeout -- we only need to verify the CLI
      // gets past transcript validation. It will fail later trying to
      // start the dev server / Playwright, which is fine.
      const result = runReplay([filePath], 10_000);
      const output = result.stdout + result.stderr;

      // Should NOT contain the v1 rejection error
      expect(output).not.toContain('--stop-at requires a v2 transcript');
      // Should NOT contain a version error
      expect(output).not.toContain('Unsupported transcript version');
      // Should show transcript info (proving it passed validation)
      expect(output).toContain('Version: 1');
      expect(output).toContain('Turns: 1');
    },
    20_000,
  );
});
