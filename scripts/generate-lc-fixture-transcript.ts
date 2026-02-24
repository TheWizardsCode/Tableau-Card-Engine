#!/usr/bin/env node
/**
 * Generate a deterministic fixture transcript for Lost Cities replay testing.
 *
 * Runs a full AI-vs-AI Lost Cities match (3 rounds) with fixed seeds
 * and writes the resulting transcript JSON to
 * tests/fixtures/transcripts/lost-cities/fixture-game.json.
 *
 * Usage:
 *   npx tsx scripts/generate-lc-fixture-transcript.ts
 */

import {
  setupLostCitiesGame,
  executeAction,
  getVisibleState,
} from '../example-games/lost-cities/LostCitiesGame';
import type { LostCitiesSession, PlayerId } from '../example-games/lost-cities/LostCitiesGame';
import { LCTranscriptRecorder } from '../example-games/lost-cities/GameTranscript';
import { LostCitiesAiPlayer, GreedyStrategy } from '../example-games/lost-cities/AiStrategy';
import type { TurnPhase } from '../example-games/lost-cities/LostCitiesRules';
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

const session: LostCitiesSession = setupLostCitiesGame({
  playerNames: ['Player 1', 'Player 2'],
  isAI: [true, true],
  rng: createRng(42),
});

const recorder = new LCTranscriptRecorder(session, ['greedy', 'greedy']);
const ai0 = new LostCitiesAiPlayer(GreedyStrategy, createRng(100));
const ai1 = new LostCitiesAiPlayer(GreedyStrategy, createRng(200));

let actionCount = 0;
const maxActions = 2000; // Safety limit (3 rounds × ~40 turns × 2 phases ≈ ~240 actions)

while (session.matchPhase === 'playing' && actionCount < maxActions) {
  const playerIndex: PlayerId = session.round.currentPlayer;
  const phase: TurnPhase = session.round.turnPhase;
  const ai = playerIndex === 0 ? ai0 : ai1;
  const state = getVisibleState(session, playerIndex);

  let action;
  if (phase === 'PlayOrDiscard') {
    action = ai.choosePhase1(state);
  } else {
    action = ai.choosePhase2(state);
  }

  const result = executeAction(session, action);
  recorder.recordAction(session, result, action, phase);
  actionCount++;

  // Reset AI round history when a new round starts
  if (result.roundEnded && !result.matchEnded) {
    ai0.resetRoundHistory();
    ai1.resetRoundHistory();
  }
}

if (session.matchPhase !== 'match-over') {
  console.error(`Match did not finish after ${maxActions} actions`);
  process.exit(1);
}

const transcript = recorder.finalize(session);

// Override timestamps for reproducibility
transcript.metadata.startedAt = '2026-01-01T00:00:00.000Z';
transcript.metadata.endedAt = '2026-01-01T00:15:00.000Z';

const outPath = resolve('tests/fixtures/transcripts/lost-cities/fixture-game.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');

const totalActions = transcript.rounds.reduce(
  (sum, r) => sum + r.actions.length,
  0,
);

console.log(`Fixture transcript written to ${outPath}`);
console.log(`  Rounds: ${transcript.rounds.length}`);
console.log(`  Total actions: ${totalActions}`);
console.log(
  `  Winner: ${transcript.results!.winnerName} (${transcript.results!.finalScores.join('-')})`,
);
