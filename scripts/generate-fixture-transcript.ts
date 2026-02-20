#!/usr/bin/env node
/**
 * Generate a deterministic fixture transcript for replay testing.
 *
 * Runs a short AI-vs-AI Golf game with fixed seeds and writes
 * the resulting transcript JSON to data/transcripts/golf/fixture-game.json.
 *
 * Usage:
 *   npx tsx scripts/generate-fixture-transcript.ts
 */

import { setupGolfGame, executeTurn } from '../example-games/golf/GolfGame';
import { TranscriptRecorder } from '../example-games/golf/GameTranscript';
import { AiPlayer, GreedyStrategy } from '../example-games/golf/AiStrategy';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

// Deterministic RNG (same LCG as tests)
function createRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const session = setupGolfGame({
  playerNames: ['You', 'AI'],
  isAI: [false, true],
  rng: createRng(42),
});
const recorder = new TranscriptRecorder(session, [undefined, 'greedy']);
const ai0 = new AiPlayer(GreedyStrategy, createRng(100));
const ai1 = new AiPlayer(GreedyStrategy, createRng(200));

let turnCount = 0;
const maxTurns = 200;

while (session.gameState.phase !== 'ended' && turnCount < maxTurns) {
  const idx = session.gameState.currentPlayerIndex;
  const ps = session.gameState.playerStates[idx];
  const ai = idx === 0 ? ai0 : ai1;

  const action = ai.chooseAction(ps, session.shared);
  const result = executeTurn(session, action);
  recorder.recordTurn(result, action.drawSource);
  turnCount++;
}

if (session.gameState.phase !== 'ended') {
  console.error(`Game did not end after ${maxTurns} turns`);
  process.exit(1);
}

const transcript = recorder.finalize();

// Override timestamps for reproducibility
transcript.metadata.startedAt = '2026-01-01T00:00:00.000Z';
transcript.metadata.endedAt = '2026-01-01T00:05:00.000Z';

const outPath = resolve('data/transcripts/golf/fixture-game.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');

console.log(`Fixture transcript written to ${outPath}`);
console.log(`  Turns: ${transcript.turns.length}`);
console.log(`  Winner: ${transcript.results!.winnerName} (score: ${transcript.results!.scores[transcript.results!.winnerIndex]})`);
