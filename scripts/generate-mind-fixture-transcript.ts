#!/usr/bin/env node
/**
 * Generate a deterministic fixture transcript for The Mind replay testing.
 *
 * Runs a headless AI-vs-AI game using the `runGame()` runner and writes
 * the resulting transcript JSON to
 * tests/fixtures/transcripts/the-mind/fixture-game.json.
 *
 * Usage:
 *   npx tsx scripts/generate-mind-fixture-transcript.ts
 */

import { runGame } from '../example-games/the-mind/headlessGame';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const result = runGame({
  seed: 42,
  player0AiSeed: 43,
  player1AiSeed: 44,
  playerNames: ['AI-0', 'AI-1'],
});

const transcript = result.transcript;

// Override timestamps for reproducibility
transcript.startedAt = '2026-01-01T00:00:00.000Z';
transcript.endedAt = '2026-01-01T00:10:00.000Z';

const outPath = resolve('tests/fixtures/transcripts/the-mind/fixture-game.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');

console.log(`Fixture transcript written to ${outPath}`);
console.log(`  Version: ${transcript.version}`);
console.log(`  Events: ${transcript.events.length}`);
console.log(`  Outcome: ${result.outcome}`);
console.log(`  Final level: ${result.finalLevel}`);
console.log(`  Final lives: ${result.finalLives}`);
console.log(`  Total plays: ${result.totalPlays}`);
console.log(`  Total penalties: ${result.totalPenalties}`);
