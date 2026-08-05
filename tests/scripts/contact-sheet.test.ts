/**
 * Unit tests for the contact-sheet generator (scripts/contact-sheet.ts).
 *
 * The module reads replay-summary.json from the output directory to find the
 * screenshot list, then composites them into contact-sheet.png. These tests
 * exercise the module contract that scripts/replay.ts relies on:
 *
 * - With a replay-summary.json + real PNGs on disk, generateContactSheet
 *   produces contact-sheet.png and returns its path.
 * - Without replay-summary.json, it warns and returns null (the failure mode
 *   behind CG-0MSBX3UA9001QDF3, where replay.ts called the generator before
 *   writing the summary).
 * - Without screenshots in the summary, it warns and returns null.
 *
 * See CG-0MSBX3UA9001QDF3.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import sharp from 'sharp';
import { generateContactSheet } from '../../scripts/contact-sheet';

const PNG_W = 225;
const PNG_H = 175;

/**
 * Create a tiny PNG (matching the contact-sheet thumbnail dimensions) in the
 * given directory and return its absolute path.
 */
async function writeTurnPng(dir: string, name: string): Promise<string> {
  const filePath = path.join(dir, name);
  await sharp({
    create: {
      width: PNG_W,
      height: PNG_H,
      channels: 3,
      background: { r: 30, g: 60, b: 120 },
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}

describe('generateContactSheet', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-sheet-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate contact-sheet.png and return its path when a summary with screenshots exists', async () => {
    const outDir = path.join(tmpDir, 'happy-path');
    fs.mkdirSync(outDir, { recursive: true });

    const ss1 = await writeTurnPng(outDir, 'turn-000.png');
    const ss2 = await writeTurnPng(outDir, 'turn-001.png');

    fs.writeFileSync(
      path.join(outDir, 'replay-summary.json'),
      JSON.stringify({
        gameType: 'golf',
        screenshots: [
          { turn: 0, screenshotPath: ss1, phase: 'replay' },
          { turn: 1, screenshotPath: ss2, phase: 'replay' },
        ],
      }),
    );

    const result = await generateContactSheet(outDir);

    expect(result).toBe(path.join(outDir, 'contact-sheet.png'));
    expect(fs.existsSync(result as string)).toBe(true);
  });

  it('should resize full-size screenshots (larger than thumbnail cells) into the contact sheet', async () => {
    const outDir = path.join(tmpDir, 'full-size-shots');
    fs.mkdirSync(outDir, { recursive: true });

    // Replay screenshots are full viewport size (e.g. 1280x720), much larger
    // than the 225x175 thumbnail cells. Regression CG-0MSBX3UA9001QDF3:
    // compositing an oversized image made sharp throw
    // "Image to composite must have same dimensions or smaller", so the
    // contact sheet was never produced in the integrated replay flow.
    const bigFile = path.join(outDir, 'turn-000.png');
    await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: { r: 40, g: 80, b: 160 },
      },
    })
      .png()
      .toFile(bigFile);

    fs.writeFileSync(
      path.join(outDir, 'replay-summary.json'),
      JSON.stringify({
        gameType: 'golf',
        screenshots: [
          { turn: 0, screenshotPath: bigFile, phase: 'replay' },
        ],
      }),
    );

    const result = await generateContactSheet(outDir);

    expect(result).toBe(path.join(outDir, 'contact-sheet.png'));
    expect(fs.existsSync(result as string)).toBe(true);
    const meta = await sharp(result as string).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  it('should warn and return null when replay-summary.json is missing', async () => {
    const outDir = path.join(tmpDir, 'no-summary');
    fs.mkdirSync(outDir, { recursive: true });
    await writeTurnPng(outDir, 'turn-000.png');

    // Suppress expected warning in test output
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await generateContactSheet(outDir);
      expect(result).toBeNull();
      expect(fs.existsSync(path.join(outDir, 'contact-sheet.png'))).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No replay-summary.json found'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('should warn and return null when the summary has no screenshots', async () => {
    const outDir = path.join(tmpDir, 'empty-screenshots');
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(
      path.join(outDir, 'replay-summary.json'),
      JSON.stringify({ gameType: 'golf', screenshots: [] }),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await generateContactSheet(outDir);
      expect(result).toBeNull();
      expect(fs.existsSync(path.join(outDir, 'contact-sheet.png'))).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No screenshots found'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('should warn and return null when summary screenshots point at missing files', async () => {
    const outDir = path.join(tmpDir, 'missing-files');
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(
      path.join(outDir, 'replay-summary.json'),
      JSON.stringify({
        gameType: 'golf',
        screenshots: [
          { turn: 0, screenshotPath: path.join(outDir, 'does-not-exist.png'), phase: 'replay' },
        ],
      }),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await generateContactSheet(outDir);
      expect(result).toBeNull();
      expect(fs.existsSync(path.join(outDir, 'contact-sheet.png'))).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
