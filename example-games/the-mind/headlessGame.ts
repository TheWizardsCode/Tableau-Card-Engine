/**
 * headlessGame.ts
 *
 * Headless (no Phaser) game runner for The Mind.
 */

import { createSeededRng } from '../../src/core-engine/SeededRng';
import { setupTheMindGame } from './TheMindGameState';
import { MindAiPlayer } from './AiStrategy';
import type { MindAiTimingConfig } from './AiStrategy';
import { MindTranscriptRecorder } from './GameTranscript';
import type { MindTranscript, MindInitialState } from './GameTranscript';
import {
  buildResultSnapshot,
  finalizeTranscript,
  simulateGame,
} from './RunGameOrchestrator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for a headless game run. */
export interface HeadlessGameConfig {
  /** Seed for the game RNG (deck shuffling). Defaults to 42. */
  seed?: number;
  /** Seed for Player 0's AI timing RNG. Defaults to seed + 1. */
  player0AiSeed?: number;
  /** Seed for Player 1's AI timing RNG. Defaults to seed + 2. */
  player1AiSeed?: number;
  /** Optional timing config override for both AI players. */
  timingConfig?: Partial<MindAiTimingConfig>;
  /** Player names. Defaults to ['AI-0', 'AI-1']. */
  playerNames?: [string, string];
}

/** Result of a headless game run. */
export interface HeadlessGameResult {
  readonly transcript: MindTranscript;
  readonly totalPlays: number;
  readonly totalPenalties: number;
  readonly outcome: 'win' | 'loss';
  readonly finalLevel: number;
  readonly finalLives: number;
}

// ---------------------------------------------------------------------------
// Headless runner
// ---------------------------------------------------------------------------

/**
 * Run a complete headless AI-vs-AI game of The Mind.
 */
export function runGame(config?: HeadlessGameConfig): HeadlessGameResult {
  const { seed, p0AiSeed, p1AiSeed, names } = resolveConfig(config);
  const session = createSession(seed, names);
  const aiPlayers = createAiPlayers(p0AiSeed, p1AiSeed, config?.timingConfig);
  const recorder = createRecorder(session, names);

  const stats = simulateGame(session, aiPlayers, recorder);
  const snapshot = buildResultSnapshot(stats, session);
  const transcript = finalizeTranscript(recorder, snapshot);

  return {
    transcript,
    ...snapshot,
  };
}

function resolveConfig(config?: HeadlessGameConfig): {
  seed: number;
  p0AiSeed: number;
  p1AiSeed: number;
  names: [string, string];
} {
  const seed = config?.seed ?? 42;
  return {
    seed,
    p0AiSeed: config?.player0AiSeed ?? seed + 1,
    p1AiSeed: config?.player1AiSeed ?? seed + 2,
    names: config?.playerNames ?? ['AI-0', 'AI-1'],
  };
}

function createSession(
  seed: number,
  names: [string, string],
) {
  return setupTheMindGame({
    playerNames: names,
    isAI: [true, true],
    rng: createSeededRng(seed),
  });
}

function createAiPlayers(
  player0Seed: number,
  player1Seed: number,
  timingConfig?: Partial<MindAiTimingConfig>,
): [MindAiPlayer, MindAiPlayer] {
  return [
    new MindAiPlayer(undefined, createSeededRng(player0Seed), timingConfig),
    new MindAiPlayer(undefined, createSeededRng(player1Seed), timingConfig),
  ];
}

function createRecorder(
  session: ReturnType<typeof setupTheMindGame>,
  names: [string, string],
): MindTranscriptRecorder {
  const initialState: MindInitialState = {
    playerNames: names,
    isAI: [true, true],
    startingLives: session.lives,
    startingLevel: session.currentLevel,
    hands: [
      session.players[0].hand.map((c) => c.value),
      session.players[1].hand.map((c) => c.value),
    ],
  };

  return new MindTranscriptRecorder(initialState);
}
