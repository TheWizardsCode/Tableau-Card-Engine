import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FIXTURE_TRANSCRIPT = path.join(
  PROJECT_ROOT,
  'tests/fixtures/transcripts/main-street/fixture-game.json',
);
const OUT_DIR = path.join(PROJECT_ROOT, 'tmp/test-replay-main-street');

function runReplay(args: string[], timeoutMs = 60_000): { stdout: string; stderr: string; exitCode: number } {
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

describe('Main Street replay e2e', () => {
  beforeAll(() => {
    try { fs.rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  afterAll(() => {
    try { fs.rmSync(OUT_DIR, { recursive: true, force: true }); } catch {}
  });

  it('replays the canonical fixture and captures screenshots without errors', () => {
    const result = runReplay([
      FIXTURE_TRANSCRIPT,
      '--game',
      'main-street',
      '--output',
      OUT_DIR,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Replay failed with code ${result.exitCode}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    }

    const summaryPath = path.join(OUT_DIR, 'replay-summary.json');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as {
      gameType: string;
      screenshots: Array<{ screenshotPath: string }>;
      errors: string[];
    };

    expect(summary.gameType).toBe('main-street');
    expect(summary.errors).toEqual([]);
    expect(summary.screenshots.length).toBeGreaterThan(0);

    const screenshotPaths = summary.screenshots
      .map((entry) => entry.screenshotPath)
      .filter((p) => Boolean(p));

    expect(screenshotPaths.length).toBeGreaterThan(0);
    for (const screenshotPath of screenshotPaths) {
      expect(fs.existsSync(screenshotPath)).toBe(true);
    }
  }, 90_000);

  it('captures canonical-resolution screenshots for layout assertions', async () => {
    const summaryPath = path.join(OUT_DIR, 'replay-summary.json');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as {
      screenshots: Array<{ screenshotPath: string }>;
    };

    expect(summary.screenshots.length).toBeGreaterThan(0);
    const firstScreenshot = summary.screenshots[0]?.screenshotPath;
    expect(firstScreenshot).toBeTruthy();

    const metadata = await sharp(firstScreenshot).metadata();
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(720);
  });
});
