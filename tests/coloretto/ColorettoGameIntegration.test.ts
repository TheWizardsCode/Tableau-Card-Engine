/**
 * Coloretto integration tests -- full-game simulations with invariants.
 *
 * Complements the per-module unit tests with end-to-end game simulations
 * across all supported player counts (2-5) using both AI strategies.
 *
 * Invariants verified on every simulation:
 *   - Every executed action is legal.
 *   - The canonical round count is played for the player count.
 *   - Cumulative totals equal the sum of round scores.
 *   - The winner is the player with the highest cumulative score.
 *   - All 43 deck cards are always accounted for (deck + rows + collections).
 */

import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../../src/core-engine';
import {
  setupColorettoGame,
  validateAction,
  executeAction,
  getCurrentPlayerIndex,
  isRoundOver,
  beginRoundScoring,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../../example-games/coloretto/ColorettoGame';
import type { ColorettoSession, ColorettoAction } from '../../example-games/coloretto/ColorettoGame';
import { ColorettoAiPlayer, RandomStrategy, HeuristicStrategy } from '../../example-games/coloretto/ColorettoAis';
import { DECK_SIZE } from '../../example-games/coloretto/ColorettoCards';

/** Total cards currently on the table (deck + rows + all collections). */
function cardsInPlay(session: ColorettoSession): number {
  const rowCards = session.rows.reduce((sum, row) => sum + row.cards.length, 0);
  const collections = session.players.reduce(
    (sum, p) => sum + p.collection.length,
    0,
  );
  return session.deck.length + rowCards + collections;
}

/**
 * Play a complete game with the given strategies for AI players.
 * Returns a summary object describing the game.
 */
function simulateGame(
  playerCount: number,
  seed: number,
  aiStrategy: 'heuristic' | 'random',
) {
  const session = setupColorettoGame({
    playerCount,
    rng: createSeededRng(seed),
  });
  const ais = session.players.map(
    () => new ColorettoAiPlayer(
      aiStrategy === 'heuristic' ? HeuristicStrategy : RandomStrategy,
      createSeededRng(seed * 31 + playerCount),
    ),
  );

  let roundsPlayed = 0;
  const actionsTaken: string[] = [];

  while (!isGameOver(session) && roundsPlayed < 20) {
    let guard = 0;
    while (!isRoundOver(session) && guard < 200) {
      const playerIndex = getCurrentPlayerIndex(session);
      const action: ColorettoAction = ais[playerIndex].chooseAction(session, playerIndex);
      const validation = validateAction(session, playerIndex, action);
      expect(validation.legal).toBe(true);
      executeAction(session, playerIndex, action);
      actionsTaken.push(`${playerIndex}:${action.type}:${action.rowIndex}`);
      guard++;
    }
    expect(isRoundOver(session)).toBe(true);
    beginRoundScoring(session);
    const result = scoreRound(session);
    roundsPlayed++;

    // Cumulative totals equal the sum of round scores.
    for (let i = 0; i < session.players.length; i++) {
      expect(result.cumulativeScores[i]).toBe(
        session.players[i].roundScores.reduce((a, b) => a + b, 0),
      );
    }
    // All cards always accounted for (checked at every round boundary).
    expect(cardsInPlay(session)).toBe(DECK_SIZE);
  }

  expect(isGameOver(session)).toBe(true);
  const winner = getWinnerIndex(session);
  const winnerScore = session.players[winner].totalScore;
  // Winner must be tied for the highest cumulative score.
  for (const player of session.players) {
    expect(player.totalScore).toBeLessThanOrEqual(winnerScore);
  }

  return {
    playerCount,
    roundsPlayed,
    actionsTaken: actionsTaken.length,
    winner,
    winnerScore,
  };
}

describe('Coloretto full-game simulations', () => {
  it('plays canonical round counts for every player count', () => {
    // 2p=7, 3p=5, 4p=4, 5p=3
    expect(simulateGame(2, 101, 'heuristic').roundsPlayed).toBe(7);
    expect(simulateGame(3, 101, 'heuristic').roundsPlayed).toBe(5);
    expect(simulateGame(4, 101, 'heuristic').roundsPlayed).toBe(4);
    expect(simulateGame(5, 101, 'heuristic').roundsPlayed).toBe(3);
  });

  it('completes games with the random strategy for all player counts', () => {
    for (const playerCount of [2, 3, 4, 5]) {
      const result = simulateGame(playerCount, 202, 'random');
      expect(result.actionsTaken).toBeGreaterThan(0);
    }
  });

  it('plays many games without stalling or violating invariants', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const playerCount of [2, 3, 4, 5]) {
        const result = simulateGame(playerCount, seed * 7, 'heuristic');
        expect(result.actionsTaken).toBeGreaterThan(0);
      }
    }
  });

  it('produces different games for different seeds', () => {
    const gameA = simulateGame(4, 301, 'heuristic');
    const gameB = simulateGame(4, 302, 'heuristic');
    // Scores differ across seeds (extremely unlikely to match by chance).
    expect(gameA.winnerScore).not.toBe(gameB.winnerScore);
  });
});
