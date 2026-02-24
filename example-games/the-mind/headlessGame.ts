/**
 * headlessGame.ts
 *
 * Headless (no Phaser) game runner for The Mind.
 *
 * Simulates a complete AI-vs-AI game by computing timing delays for
 * both players, then resolving plays in chronological order. Produces
 * a valid MindTranscript identical in structure to interactive games.
 *
 * Usage:
 *   import { runGame } from './headlessGame';
 *   const result = runGame({ seed: 42 });
 *   console.log(result.transcript.results);
 *
 * @module
 */

import { createSeededRng } from '../../src/core-engine/SeededRng';
import type { PlayerId, TheMindSession } from './TheMindGameState';
import {
  setupTheMindGame,
  playCard,
  isGameOver,
  getPileTopValue,
} from './TheMindGameState';
import { MindAiPlayer } from './AiStrategy';
import type { MindAiTimingConfig } from './AiStrategy';
import { MindTranscriptRecorder } from './GameTranscript';
import type { MindTranscript, MindInitialState } from './GameTranscript';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for a headless game run. */
export interface HeadlessGameConfig {
  /** Seed for the game RNG (deck shuffling). Defaults to 42. */
  seed?: number;
  /**
   * Seed for Player 0's AI timing RNG. Defaults to seed + 1.
   * Using a different seed from Player 1 ensures independent timing.
   */
  player0AiSeed?: number;
  /**
   * Seed for Player 1's AI timing RNG. Defaults to seed + 2.
   */
  player1AiSeed?: number;
  /** Optional timing config override for both AI players. */
  timingConfig?: Partial<MindAiTimingConfig>;
  /** Player names. Defaults to ['AI-0', 'AI-1']. */
  playerNames?: [string, string];
}

/** Result of a headless game run. */
export interface HeadlessGameResult {
  /** The finalized transcript. */
  readonly transcript: MindTranscript;
  /** Total number of card plays across all levels. */
  readonly totalPlays: number;
  /** Total number of penalties incurred. */
  readonly totalPenalties: number;
  /** Final game outcome. */
  readonly outcome: 'win' | 'loss';
  /** Final level reached. */
  readonly finalLevel: number;
  /** Lives remaining at game end. */
  readonly finalLives: number;
}

/** A pending card play in the simulation queue. */
interface PendingPlay {
  /** Which player will play this card. */
  readonly playerId: PlayerId;
  /** The card value to play. */
  readonly cardValue: number;
  /** Absolute simulation time (ms) when this play fires. */
  readonly fireTime: number;
}

// ---------------------------------------------------------------------------
// Headless runner
// ---------------------------------------------------------------------------

/**
 * Run a complete headless AI-vs-AI game of The Mind.
 *
 * Both players use the linear timing strategy with independent seeded
 * RNGs. The simulation resolves plays in chronological order by their
 * computed fire times, handling penalties and level transitions.
 *
 * @param config - Optional configuration for seeds, timing, and names.
 * @returns A HeadlessGameResult with the finalized transcript and stats.
 */
export function runGame(config?: HeadlessGameConfig): HeadlessGameResult {
  const seed = config?.seed ?? 42;
  const p0AiSeed = config?.player0AiSeed ?? seed + 1;
  const p1AiSeed = config?.player1AiSeed ?? seed + 2;
  const names = config?.playerNames ?? ['AI-0', 'AI-1'];

  // Create game session with seeded RNG
  const gameRng = createSeededRng(seed);
  const session = setupTheMindGame({
    playerNames: names,
    isAI: [true, true],
    rng: gameRng,
  });

  // Create AI players with independent RNGs
  const aiPlayers: [MindAiPlayer, MindAiPlayer] = [
    new MindAiPlayer(undefined, createSeededRng(p0AiSeed), config?.timingConfig),
    new MindAiPlayer(undefined, createSeededRng(p1AiSeed), config?.timingConfig),
  ];

  // Create transcript recorder
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
  const recorder = new MindTranscriptRecorder(initialState);

  // Simulation state
  let totalPlays = 0;
  let totalPenalties = 0;
  let levelStartTime = 0;

  // Commit initial level delays
  commitLevelDelays(session, aiPlayers, levelStartTime);

  // Main simulation loop
  while (!isGameOver(session)) {
    // Build queue of pending plays from both players
    const queue = buildPlayQueue(aiPlayers, levelStartTime);

    if (queue.length === 0) {
      // No cards left but game not over — shouldn't happen, but guard
      break;
    }

    // Pick the earliest play
    const next = queue[0];
    const timestamp = next.fireTime - levelStartTime;

    // Execute the play
    const result = playCard(session, next.playerId, next.cardValue);

    if (!result.success) {
      // Card was already removed (e.g., by penalty). Remove from AI and retry.
      aiPlayers[next.playerId].removeCard(next.cardValue);
      continue;
    }

    totalPlays++;

    // Record card play
    recorder.recordCardPlay(
      timestamp,
      next.playerId,
      next.cardValue,
      getPileTopValue(session),
      session.pile.size(),
    );

    // Remove from both AI players (the played card, and any penalty cards)
    aiPlayers[next.playerId].removeCard(next.cardValue);

    if (result.lifeLost) {
      totalPenalties++;

      recorder.recordPenalty(
        timestamp,
        session.lives,
        result.penaltyCards.map((p) => ({
          playerId: p.playerId,
          cardValue: p.card.value,
        })),
      );

      // Remove penalty cards from AI players
      for (const pc of result.penaltyCards) {
        aiPlayers[pc.playerId].removeCard(pc.card.value);
      }
    }

    // Handle level completion (must be recorded before game-over check,
    // since completing the final level triggers both levelComplete and
    // game-over simultaneously)
    if (result.levelComplete) {
      // When the game is won, currentLevel stays at MAX_LEVEL (no dealLevel call).
      // When a non-final level completes, dealLevel advances currentLevel.
      const completedLevel = session.outcome === 'win'
        ? session.currentLevel
        : session.currentLevel - 1;

      recorder.recordLevelComplete(
        timestamp,
        completedLevel,
        result.bonusLifeAwarded,
        session.lives,
      );

      if (isGameOver(session)) {
        break;
      }

      // New level has been dealt by playCard — commit new delays
      levelStartTime = next.fireTime;
      commitLevelDelays(session, aiPlayers, levelStartTime);
    }

    // Check game over (loss from penalty with no level completion)
    if (isGameOver(session)) {
      break;
    }
  }

  // Finalize transcript
  const outcome = session.outcome as 'win' | 'loss';
  const finalTimestamp = Date.now(); // arbitrary for headless
  const transcript = recorder.finalize(
    finalTimestamp,
    outcome,
    session.currentLevel,
    session.lives,
  );

  return {
    transcript,
    totalPlays,
    totalPenalties,
    outcome,
    finalLevel: session.currentLevel,
    finalLives: session.lives,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Commit level delays for both AI players based on their current hands.
 */
function commitLevelDelays(
  session: TheMindSession,
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  _levelStartTime: number,
): void {
  aiPlayers[0].commitLevel(session.players[0].hand);
  aiPlayers[1].commitLevel(session.players[1].hand);
}

/**
 * Build a sorted queue of pending plays from both AI players.
 * Returns plays sorted by fire time (earliest first).
 */
function buildPlayQueue(
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  levelStartTime: number,
): PendingPlay[] {
  const queue: PendingPlay[] = [];

  for (let p = 0; p < 2; p++) {
    const playerId = p as PlayerId;
    const delays = aiPlayers[p].getCardDelays();
    for (const d of delays) {
      queue.push({
        playerId,
        cardValue: d.card.value,
        fireTime: levelStartTime + Math.max(d.delay, 0),
      });
    }
  }

  // Sort by fire time, then by card value (lower card first on ties)
  queue.sort((a, b) => a.fireTime - b.fireTime || a.cardValue - b.cardValue);
  return queue;
}
