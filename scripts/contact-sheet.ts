#!/usr/bin/env npx tsx
/**
 * contact-sheet.ts
 *
 * Generates a contact sheet image (grid of per-turn screenshots) from
 * a replay output directory. Reads replay-summary.json for screenshot
 * metadata, composites thumbnails into a grid using sharp, and writes
 * contact-sheet.png to the output directory.
 *
 * Usage:
 *   npx tsx scripts/contact-sheet.ts <output-dir>
 *
 * Arguments:
 *   output-dir  Directory containing turn-NNN.png files and
 *               replay-summary.json. Default: data/screenshots/<game>/
 *
 * Output:
 *   <output-dir>/contact-sheet.png
 *
 * The contact sheet uses 4 columns, 225x175px thumbnails, with turn
 * numbers rendered as SVG text labels below each thumbnail.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

// ── Constants ──────────────────────────────────────────────

const THUMB_W = 225;
const THUMB_H = 175;
const COLS = 4;
const GAP = 10;
const LABEL_H = 24;
const FONT_SIZE = 14;

// ── Types ──────────────────────────────────────────────────

interface ScreenshotEntry {
  turn: number;
  screenshotPath: string;
  phase?: 'replay' | 'interactive';
  durationMs?: number;
  error?: string;
}

interface ReplaySummary {
  screenshots: ScreenshotEntry[];
  [key: string]: unknown;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Create an SVG string with centered text for use as a turn-number label.
 */
function createLabelSvg(text: string, width: number, height: number): string {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="transparent"/>
    <text x="${width / 2}" y="${height / 2 + 5}" font-family="monospace"
          font-size="${FONT_SIZE}px" fill="#cccccc" text-anchor="middle"
          dominant-baseline="middle">${text}</text>
  </svg>`;
}

/**
 * Generate a contact sheet from turn screenshots in the given output directory.
 *
 * @param outputDir - Path to directory containing turn-NNN.png and replay-summary.json
 * @returns The path to the generated contact-sheet.png, or null if no screenshots found
 */
async function generateContactSheet(outputDir: string): Promise<string | null> {
  const summaryPath = join(outputDir, 'replay-summary.json');

  if (!existsSync(summaryPath)) {
    console.warn(`[contact-sheet] No replay-summary.json found in ${outputDir}`);
    return null;
  }

  let summary: ReplaySummary;
  try {
    const raw = readFileSync(summaryPath, 'utf-8');
    summary = JSON.parse(raw) as ReplaySummary;
  } catch (err) {
    console.warn(`[contact-sheet] Failed to parse replay-summary.json: ${(err as Error).message}`);
    return null;
  }

  if (!summary.screenshots || summary.screenshots.length === 0) {
    console.warn('[contact-sheet] No screenshots found in replay-summary.json');
    return null;
  }

  // Filter to screenshots that have valid file paths and exist on disk
  const entries = summary.screenshots.filter((s) => {
    if (!s.screenshotPath) return false;
    // Resolve relative paths against the output directory
    const p = resolve(s.screenshotPath);
    if (!existsSync(p)) {
      // Try joining with outputDir
      const altPath = join(outputDir, s.screenshotPath);
      if (!existsSync(altPath)) return false;
      (s as any)._resolvedPath = altPath;
      return true;
    }
    (s as any)._resolvedPath = p;
    return true;
  });

  if (entries.length === 0) {
    console.warn('[contact-sheet] No screenshot files found on disk');
    return null;
  }

  // Sort by turn number
  entries.sort((a, b) => a.turn - b.turn);

  const count = entries.length;
  const rows = Math.ceil(count / COLS);
  const gridWidth = COLS * THUMB_W + (COLS - 1) * GAP;
  const gridHeight = rows * (THUMB_H + LABEL_H) + (rows - 1) * GAP;

  console.log(`[contact-sheet] Generating contact sheet: ${count} screenshots, ${rows} rows, ${gridWidth}x${gridHeight}`);

  // Build composite inputs for sharp
  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < count; i++) {
    const entry = entries[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * (THUMB_W + GAP);
    const y = row * (THUMB_H + LABEL_H + GAP);

    // Thumbnail
    composites.push({
      input: (entry as any)._resolvedPath as string,
      top: y,
      left: x,
    });

    // Turn number label
    const labelSvg = createLabelSvg(`Turn ${entry.turn}`, THUMB_W, LABEL_H);
    composites.push({
      input: Buffer.from(labelSvg),
      top: y + THUMB_H,
      left: x,
    });
  }

  // Create base transparent canvas
  const canvas = await sharp({
    create: {
      width: gridWidth,
      height: gridHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Write output
  const outputPath = join(outputDir, 'contact-sheet.png');
  writeFileSync(outputPath, canvas);
  console.log(`[contact-sheet] Written to ${outputPath}`);

  return outputPath;
}

// ── CLI entry point ────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: npx tsx scripts/contact-sheet.ts <output-dir>

Generates contact-sheet.png in the output directory from turn screenshots.
The output directory should contain replay-summary.json and turn-NNN.png files.

Examples:
  npx tsx scripts/contact-sheet.ts data/screenshots/golf/
  npx tsx scripts/contact-sheet.ts data/screenshots/golf/2026-01-15T14-30-45.123Z/
`);
    process.exit(0);
  }

  const outputDir = resolve(args[0]);
  if (!existsSync(outputDir)) {
    console.error(`Error: Directory not found: ${outputDir}`);
    process.exit(1);
  }

  const result = await generateContactSheet(outputDir);
  if (!result) {
    console.error('Error: Failed to generate contact sheet');
    process.exit(1);
  }
  console.log(`Contact sheet: ${result}`);
}

export { generateContactSheet };

// Run CLI directly if executed as main
const scriptName = 'contact-sheet.ts';
if (process.argv[1]?.endsWith(scriptName)) {
  main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}
