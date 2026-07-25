#!/usr/bin/env node
/**
 * Generate a deterministic fixture transcript for Feudalism replay testing.
 *
 * Runs a headless AI-vs-AI game using the game API directly with a
 * seeded RNG and writes the resulting transcript JSON to
 * tests/fixtures/transcripts/feudalism/fixture-game.json.
 *
 * Usage:
 *   npx tsx scripts/generate-feudalism-fixture-transcript.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { createSeededRng } from '../src/core-engine/SeededRng';
import {
  setupFeudalismGame,
  executeTurn,
  discardTokens,
  isGameOver,
  getWinnerIndex,
} from '../example-games/feudalism/FeudalismGame';
import { FeudalismAiPlayer, GreedyStrategy } from '../example-games/feudalism/AiStrategy';
import { FeudalismTranscriptRecorder } from '../example-games/feudalism/GameTranscript';

// Deterministic RNG
const rng = createSeededRng(42);

// Set up an AI-vs-AI game
const session = setupFeudalismGame({
  playerCount: 2,
  playerNames: ['AI-0', 'AI-1'],
  isAI: [true, true],
  rng,
});

// Create AI players with deterministic RNGs
const ai0 = new FeudalismAiPlayer(GreedyStrategy, createSeededRng(43));
const ai1 = new FeudalismAiPlayer(GreedyStrategy, createSeededRng(44));
const aiPlayers = [ai0, ai1];

// Create recorder
const recorder = new FeudalismTranscriptRecorder(session);

// Play the game
let turnCount = 0;
const MAX_TURNS = 200; // Safety limit

while (!isGameOver(session) && turnCount < MAX_TURNS) {
  const playerIndex = session.currentPlayerIndex;
  const aiPlayer = aiPlayers[playerIndex];
  const action = aiPlayer.chooseTurn(session, playerIndex);

  const result = executeTurn(session, action);

  // Handle discard if over limit
  let tokenDiscard = null;
  if (result.tokensOverLimit > 0) {
    const discard = aiPlayer.chooseDiscard(session, playerIndex, result.tokensOverLimit);
    tokenDiscard = discard;
    discardTokens(session, discard);
  }

  // Record the turn
  recorder.recordTurn(playerIndex, action, result, tokenDiscard);
  turnCount++;
}

// Finalize
const winnerIndex = getWinnerIndex(session);
const transcript = recorder.finalize(winnerIndex);

// Override timestamps for reproducibility
transcript.startedAt = '2026-01-01T00:00:00.000Z';
transcript.endedAt = '2026-01-01T00:10:00.000Z';

// Write to file
const outPath = resolve('tests/fixtures/transcripts/feudalism/fixture-game.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');

console.log(`Fixture transcript written to ${outPath}`);
console.log(`  Version: ${transcript.version}`);
console.log(`  Game type: ${transcript.gameType}`);
console.log(`  Turns: ${transcript.turns.length}`);
console.log(`  Winner: ${transcript.results?.winnerName} (index ${transcript.results?.winnerIndex})`);
console.log(`  Final influence: ${transcript.results?.finalInfluence.join(' - ')}`);
console.log(`  Final card counts: ${transcript.results?.finalCardCounts.join(' - ')}`);
