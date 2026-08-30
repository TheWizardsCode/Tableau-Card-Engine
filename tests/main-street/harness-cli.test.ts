/**
 * CLI harness regression tests for the Main Street npm scripts.
 *
 * Regression guard for CG-0MT4RBHQR006C5GR: the Main Street harness entry
 * points (`scripts/monte-carlo.ts`, `scripts/save-load-smoke.ts`) transitively
 * import `example-games/main-street/MainStreetCards.ts`, which loads
 * `card-data.csv` via Vite's `?raw` query suffix. tsx cannot resolve that
 * suffix (`ERR_UNKNOWN_FILE_EXTENSION`), so the scripts must run under
 * vite-node — the same Vite-aware ESM loader already used by
 * `scripts/generate-main-street-expanded-card-manifest.ts`.
 *
 * This bug class is invisible to the vitest unit suite (vitest resolves `?raw`
 * through the Vite pipeline), so these tests execute the real CLI entry points
 * as subprocesses and assert they complete green. Outputs are written to a
 * temp dir — `results/main-street-monte-carlo.{json,csv}` are tracked files,
 * so the tests must never clobber them.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const VITE_NODE_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'vite-node');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a command as a subprocess with a generous timeout (CPU-contention safe). */
function runCmd(bin: string, args: string[], timeoutMs = 180_000): RunResult {
  const result = spawnSync(bin, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    env: { ...process.env },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? (result.signal ? 1 : 0),
  };
}

describe('Main Street harness CLI scripts (vite-node)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-harness-cli-'));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('monte-carlo.ts runs green via vite-node and writes JSON + CSV outputs', () => {
    const jsonOut = path.join(tmpDir, 'mc.json');
    const csvOut = path.join(tmpDir, 'mc.csv');
    const res = runCmd(VITE_NODE_BIN, [
      'scripts/monte-carlo.ts',
      '--seeds',
      '4',
      '--seed-prefix',
      'mc-cli-regression',
      '--maxTurns',
      '25',
      '--strategy',
      'greedy',
      '--out',
      jsonOut,
      '--csv-out',
      csvOut,
    ]);
    expect(res.exitCode, res.stderr).toBe(0);
    expect(fs.existsSync(jsonOut)).toBe(true);
    expect(fs.existsSync(csvOut)).toBe(true);
    const report = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    expect(report.metrics.runs).toBe(4);
    expect(report.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.winRate).toBeLessThanOrEqual(1);
  });

  it('monte-carlo.ts sweep mode runs all strategy×difficulty combos via vite-node and writes per-combo outputs', () => {
    const jsonBase = path.join(tmpDir, 'sweep.json');
    const csvBase = path.join(tmpDir, 'sweep.csv');
    const res = runCmd(VITE_NODE_BIN, [
      'scripts/monte-carlo.ts',
      '--sweep',
      '--seeds',
      '2',
      '--seed-prefix',
      'sweep-cli-regression',
      '--maxTurns',
      '15',
      '--sweep-strategies',
      'greedy,random',
      '--sweep-difficulties',
      'Easy,Medium',
      '--out',
      jsonBase,
      '--csv-out',
      csvBase,
    ]);
    expect(res.exitCode, res.stderr).toBe(0);
    for (const combo of ['greedy-easy', 'greedy-medium', 'random-easy', 'random-medium']) {
      expect(fs.existsSync(jsonBase.replace('.json', `-${combo}.json`)), `missing ${combo}.json`).toBe(true);
      expect(fs.existsSync(csvBase.replace('.csv', `-${combo}.csv`)), `missing ${combo}.csv`).toBe(true);
    }
    const report = JSON.parse(fs.readFileSync(jsonBase.replace('.json', '-greedy-easy.json'), 'utf8'));
    expect(report.metrics.runs).toBe(2);
    expect(report.strategy).toBe('greedy');
    expect(report.difficulty).toBe('Easy');
  });

  it('npm run save-load-smoke completes green via vite-node (deterministic restore, 0 failures)', () => {
    // The npm script itself is the interface under test (its runner was the
    // bug — tsx cannot load the ?raw CSV); it writes nothing to the repo.
    const res = runCmd('npm', [
      'run',
      'save-load-smoke',
      '--',
      '--seed',
      'harness-cli-regression',
      '--checkpoint-after',
      '2',
    ]);
    expect(res.exitCode, `${res.stdout}\n${res.stderr}`).toBe(0);
    // npm prints a banner line before the child's stdout; parse from the first '{'.
    const report = JSON.parse(res.stdout.slice(res.stdout.indexOf('{')).trim());
    expect(report.failures).toBe(0);
    expect(report.deterministic).toBe(true);
    expect(report.campaignRoundTrip).toBe(true);
  });
});