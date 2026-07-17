#!/usr/bin/env npx tsx
/**
 * generate-thumbnail.ts
 *
 * Selects the midpoint frame from replay screenshot output, resizes it
 * to 120x68 PNG, and copies it to public/assets/games/<game-name>/thumbnail.png.
 *
 * Usage:
 *   npx tsx scripts/generate-thumbnail.ts <game-name> [source-dir]
 *
 * Arguments:
 *   game-name   Name of the game (e.g. "golf"). Used to determine the
 *               default source directory and output path.
 *   source-dir  Optional path to the directory containing turn-NNN.png
 *               files. Defaults to data/screenshots/<game-name>/.
 *
 * The script first looks for a replay-summary.json in the source directory
 * (or its subdirectories) to identify replay-phase screenshots and pick
 * the midpoint frame. If no summary is found it falls back to scanning
 * for turn-NNN.png files and selecting the middle one.
 *
 * Output: public/assets/games/<game-name>/thumbnail.png (120x68 PNG)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ── Constants ──────────────────────────────────────────────

const THUMB_W = 120;
const THUMB_H = 68;

// ── Types ──────────────────────────────────────────────────

interface ScreenshotEntry {
  turn: number;
  screenshotPath: string;
  phase?: 'replay' | 'interactive';
}

interface ReplaySummary {
  screenshots: ScreenshotEntry[];
  [key: string]: unknown;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Recursively search for replay-summary.json files within a directory
 * and return screenshot entries from the first one found that has entries.
 */
function findReplaySummary(dir: string): ScreenshotEntry[] | null {
  const summaryPath = join(dir, 'replay-summary.json');
  if (existsSync(summaryPath)) {
    try {
      const data: ReplaySummary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
      if (data.screenshots && data.screenshots.length > 0) {
        return data.screenshots;
      }
    } catch {
      // Ignore parse errors, try subdirectories
    }
  }

  // Check subdirectories
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const result = findReplaySummary(join(dir, entry.name));
      if (result) return result;
    }
  }
  return null;
}

/**
 * Scan a directory (and subdirectories) for turn-NNN.png files and
 * return them sorted by turn number.
 */
function scanTurnFiles(dir: string): { turn: number; path: string }[] {
  const results: { turn: number; path: string }[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      results.push(...scanTurnFiles(join(dir, entry.name)));
    } else {
      const match = entry.name.match(/^turn-(\d+)\.png$/);
      if (match) {
        results.push({ turn: parseInt(match[1], 10), path: join(dir, entry.name) });
      }
    }
  }

  return results.sort((a, b) => a.turn - b.turn);
}

/**
 * Select the midpoint screenshot path from available screenshots.
 */
function selectMidpointFrame(sourceDir: string): string | null {
  // Strategy 1: Use replay-summary.json
  const summaryEntries = findReplaySummary(sourceDir);
  if (summaryEntries && summaryEntries.length > 0) {
    // Prefer replay-phase screenshots if phase metadata is available
    const replayPhase = summaryEntries.filter(
      (e) => !e.phase || e.phase === 'replay',
    );
    const pool = replayPhase.length > 0 ? replayPhase : summaryEntries;
    const midIdx = Math.floor(pool.length / 2);
    const selected = pool[midIdx];

    // The screenshotPath in the summary may be absolute from the original
    // run. Check if it exists; if not, try to resolve relative to sourceDir.
    if (existsSync(selected.screenshotPath)) {
      return selected.screenshotPath;
    }
    // Try filename relative to source dir (recursively)
    const filename = `turn-${String(selected.turn).padStart(3, '0')}.png`;
    const turnFiles = scanTurnFiles(sourceDir);
    const match = turnFiles.find((f) => f.path.endsWith(filename));
    if (match) return match.path;
  }

  // Strategy 2: Scan for turn-NNN.png files
  const turnFiles = scanTurnFiles(sourceDir);
  if (turnFiles.length === 0) return null;

  const midIdx = Math.floor(turnFiles.length / 2);
  return turnFiles[midIdx].path;
}

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/generate-thumbnail.ts <game-name> [source-dir]');
    process.exit(1);
  }

  const gameName = args[0];
  const sourceDir = args[1] || join(ROOT, 'data', 'screenshots', gameName);
  const outDir = join(ROOT, 'public', 'assets', 'games', gameName);
  const outPath = join(outDir, 'thumbnail.png');

  console.log(`Game:       ${gameName}`);
  console.log(`Source:     ${sourceDir}`);
  console.log(`Output:     ${outPath}`);

  if (!existsSync(sourceDir)) {
    console.error(`Error: Source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  const framePath = selectMidpointFrame(sourceDir);
  if (!framePath) {
    console.error(`Error: No turn-NNN.png screenshots found in ${sourceDir}`);
    process.exit(1);
  }

  console.log(`Selected:   ${framePath}`);

  // Ensure output directory exists
  mkdirSync(outDir, { recursive: true });

  // Resize and write
  await sharp(framePath)
    .resize(THUMB_W, THUMB_H, { fit: 'cover' })
    .png()
    .toFile(outPath);

  console.log(`Thumbnail generated: ${outPath} (${THUMB_W}x${THUMB_H})`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
