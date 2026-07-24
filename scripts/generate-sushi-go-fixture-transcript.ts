#!/usr/bin/env node
/**
 * Generate a deterministic fixture transcript for Sushi Go! replay testing.
 *
 * Runs a headless AI-vs-AI game using the game API directly with a
 * seeded RNG and writes the resulting transcript JSON to
 * tests/fixtures/transcripts/sushi-go/fixture-game.json.
 *
 * Usage:
 *   npx tsx scripts/generate-sushi-go-fixture-transcript.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { createSeededRng } from '../src/core-engine/SeededRng';
import {
  setupSushiGoGame,
  executeAllPicks,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../example-games/sushi-go/SushiGoGame';
import { SushiGoAiPlayer, GreedyStrategy } from '../example-games/sushi-go/AiStrategy';
import { SushiGoTranscriptRecorder } from '../example-games/sushi-go/GameTranscript';

// Deterministic RNG
const rng = createSeededRng(42);

// Set up an AI-vs-AI game
const session = setupSushiGoGame({
  playerCount: 2,
  playerNames: ['AI-0', 'AI-1'],
  isAI: [true, true],
  rng,
});

// Create AI players with deterministic RNGs
const ai0 = new SushiGoAiPlayer(GreedyStrategy, createSeededRng(43));
const ai1 = new SushiGoAiPlayer(GreedyStrategy, createSeededRng(44));

// Create recorder
const recorder = new SushiGoTranscriptRecorder(session);

// Play the game
let totalTurns = 0;
while (!isGameOver(session)) {
  if (session.phase === 'picking') {
    const pick0 = ai0.choosePick(session.players[0]);
    const pick1 = ai1.choosePick(session.players[1]);
    executeAllPicks(session, [pick0, pick1]);
    recorder.recordTurn([pick0, pick1]);
    totalTurns++;
  } else if (session.phase === 'round-scoring') {
    const result = scoreRound(session);
    recorder.recordRoundResult(result);
  }
}

// Finalize
const winnerIndex = getWinnerIndex(session);
const transcript = recorder.finalize(winnerIndex);

// Override timestamps for reproducibility
transcript.startedAt = '2026-01-01T00:00:00.000Z';
transcript.endedAt = '2026-01-01T00:10:00.000Z';

// Write to file
const outPath = resolve('tests/fixtures/transcripts/sushi-go/fixture-game.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');

console.log(`Fixture transcript written to ${outPath}`);
console.log(`  Version: ${transcript.version}`);
console.log(`  Game type: ${transcript.gameType}`);
console.log(`  Turns: ${transcript.turns.length}`);
console.log(`  Rounds: ${transcript.roundResults.length}`);
console.log(`  Winner: ${transcript.results?.winnerName} (index ${transcript.results?.winnerIndex})`);
console.log(`  Final scores: ${transcript.results?.finalScores.join(' - ')}`);
