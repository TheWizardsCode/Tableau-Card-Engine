#!/usr/bin/env npx tsx
/**
 * generate-all-thumbnails.ts
 *
 * Runs the replay pipeline for every game with a transcript fixture,
 * producing actual in-game screenshots as thumbnails.
 *
 * Usage:
 *   npx tsx scripts/generate-all-thumbnails.ts [--game <type>]
 *
 * Arguments:
 *   --game <type>  Optionally restrict to a single game type.
 *
 * Pipeline per game:
 *   1. npm run replay -- <transcript> --output data/screenshots/<game>
 *   2. npx tsx scripts/generate-thumbnail.ts <game> data/screenshots/<game>
 *
 * Related work item: CG-0MQK3CJUX0043I3U
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync as stat } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ── Types ──────────────────────────────────────────────────

interface GameInfo {
  gameName: string;
  transcriptPath: string;
  screenshotsDir: string;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Discover all games with transcript fixtures and return GameInfo objects.
 */
function discoverGames(): GameInfo[] {
  const transcriptsDir = join(ROOT, 'data', 'transcripts');
  const games: GameInfo[] = [];

  if (!existsSync(transcriptsDir)) {
    console.error(`Error: transcripts directory not found: ${transcriptsDir}`);
    process.exit(1);
  }

  const entries = readdirSync(transcriptsDir);
  for (const entry of entries) {
    const gameDir = join(transcriptsDir, entry);
    if (!existsSync(gameDir)) continue;

    const jsonFiles = readdirSync(gameDir).filter((f) => f.endsWith('.json'));
    if (jsonFiles.length === 0) continue;

    // Use the most recently modified transcript
    let newest = jsonFiles[0];
    let newestMtime = 0;
    for (const f of jsonFiles) {
      const mtime = stat(join(gameDir, f)).mtimeMs;
      if (mtime > newestMtime) {
        newest = f;
        newestMtime = mtime;
      }
    }

    games.push({
      gameName: entry,
      transcriptPath: join(gameDir, newest),
      screenshotsDir: join(ROOT, 'data', 'screenshots', entry),
    });
  }

  return games.sort((a, b) => a.gameName.localeCompare(b.gameName));
}

// ── Main ───────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const filterGame = args.find((a) => a === '--game')
    ? args[args.indexOf('--game') + 1]
    : undefined;

  const allGames = discoverGames();
  const games = filterGame
    ? allGames.filter((g) => g.gameName === filterGame)
    : allGames;

  if (games.length === 0) {
    console.error(`No games found${filterGame ? ` matching '${filterGame}'` : ''}.`);
    process.exit(1);
  }

  console.log(`\n=== Generating thumbnails for ${games.length} game(s) ===\n`);

  let success = 0;
  let failed = 0;

  for (const game of games) {
    console.log(`────────────────────────────────────────`);
    console.log(`Game: ${game.gameName}`);
    console.log(`Transcript: ${game.transcriptPath}`);

    try {
      // Step 1: Replay
      console.log('▶ Step 1/2: Running replay...');
      execSync(
        `npm run replay -- "${game.transcriptPath}" --output "${game.screenshotsDir}"`,
        { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CI: '1' } },
      );

      // Step 2: Generate thumbnail
      console.log('▶ Step 2/2: Generating thumbnail...');
      execSync(
        `npx tsx scripts/generate-thumbnail.ts ${game.gameName} "${game.screenshotsDir}"`,
        { cwd: ROOT, stdio: 'inherit' },
      );

      console.log(`✅ ${game.gameName} done\n`);
      success++;
    } catch (err) {
      console.error(`❌ ${game.gameName} failed\n`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${success} succeeded, ${failed} failed out of ${games.length} ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
