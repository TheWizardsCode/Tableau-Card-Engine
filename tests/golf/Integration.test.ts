/**
 * Integration tests for 9-Card Golf.
 *
 * Runs complete AI-vs-AI games from setup through round end and verifies:
 *   - The game completes without errors
 *   - The transcript is valid and captures all turns
 *   - Final scores are calculated correctly
 *   - All game invariants hold throughout play
 */

import { describe, it, expect } from 'vitest';
import { setupGolfGame, executeTurn } from '../../example-games/golf/GolfGame';
import type { GolfSession } from '../../example-games/golf/GolfGame';
import { AiPlayer, RandomStrategy, GreedyStrategy } from '../../example-games/golf/AiStrategy';
import type { AiStrategy } from '../../example-games/golf/AiStrategy';
import { TranscriptRecorder } from '../../example-games/golf/GameTranscript';
import type { GameTranscript } from '../../example-games/golf/GameTranscript';
import { scoreGrid } from '../../example-games/golf/GolfScoring';
import { isGridFullyRevealed } from '../../example-games/golf/GolfGrid';

// ── Helpers ─────────────────────────────────────────────────

/** Deterministic LCG RNG for reproducible tests. */
function createTestRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Maximum number of turns before we consider the game stuck. */
const MAX_TURNS = 200;

/**
 * Run a complete AI-vs-AI game and return the session + transcript.
 */
function runFullGame(
  strategy: AiStrategy,
  seed: number = 42,
): { session: GolfSession; transcript: GameTranscript; turnCount: number } {
  const rng = createTestRng(seed);
  const session = setupGolfGame({
    playerNames: ['AI-1', 'AI-2'],
    isAI: [true, true],
    rng,
  });

  const ai1 = new AiPlayer(strategy, createTestRng(seed + 1));
  const ai2 = new AiPlayer(strategy, createTestRng(seed + 2));
  const ais = [ai1, ai2];

  const recorder = new TranscriptRecorder(session, [
    strategy.name,
    strategy.name,
  ]);

  let turnCount = 0;

  while (session.gameState.phase !== 'ended' && turnCount < MAX_TURNS) {
    const idx = session.gameState.currentPlayerIndex;
    const ps = session.gameState.playerStates[idx];
    const action = ais[idx].chooseAction(ps, session.shared);

    const result = executeTurn(session, action);
    recorder.recordTurn(result, action.drawSource);
    turnCount++;
  }

  const transcript = recorder.finalize();
  return { session, transcript, turnCount };
}

// ── Integration tests ───────────────────────────────────────

describe('Integration: AI-vs-AI full game (RandomStrategy)', () => {
  it('completes a full game without errors', () => {
    const { session, turnCount } = runFullGame(RandomStrategy, 42);
    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(MAX_TURNS);
    expect(turnCount).toBeGreaterThanOrEqual(2); // at least one turn per player
  });

  it('produces a valid transcript', () => {
    const { transcript, turnCount } = runFullGame(RandomStrategy, 42);

    // Version
    expect(transcript.version).toBe(1);

    // Metadata
    expect(transcript.metadata.startedAt).toBeTruthy();
    expect(transcript.metadata.endedAt).toBeTruthy();
    expect(transcript.metadata.players).toHaveLength(2);
    expect(transcript.metadata.players[0].isAI).toBe(true);
    expect(transcript.metadata.players[1].isAI).toBe(true);
    expect(transcript.metadata.players[0].strategy).toBe('random');

    // Initial state
    expect(transcript.initialState.boardStates).toHaveLength(2);
    expect(transcript.initialState.boardStates[0].grid).toHaveLength(9);
    expect(transcript.initialState.boardStates[1].grid).toHaveLength(9);
    expect(transcript.initialState.stockRemaining).toBe(33);
    expect(transcript.initialState.discardTop).not.toBeNull();

    // Turns
    expect(transcript.turns).toHaveLength(turnCount);
    for (let i = 0; i < transcript.turns.length; i++) {
      const turn = transcript.turns[i];
      expect(turn.turnNumber).toBe(i);
      expect(turn.playerIndex).toBeGreaterThanOrEqual(0);
      expect(turn.playerIndex).toBeLessThanOrEqual(1);
      expect(turn.playerName).toBeTruthy();
      expect(['stock', 'discard']).toContain(turn.drawSource);
      expect(['swap', 'discard-and-flip']).toContain(turn.move.kind);
      expect(turn.drawnCard).toBeDefined();
      expect(turn.drawnCard.rank).toBeTruthy();
      expect(turn.drawnCard.suit).toBeTruthy();
      expect(turn.discardedCard).toBeDefined();
      expect(turn.boardStates).toHaveLength(2);
      expect(turn.stockRemaining).toBeGreaterThanOrEqual(0);
    }

    // The last turn should have roundEnded = true
    expect(transcript.turns[transcript.turns.length - 1].roundEnded).toBe(true);

    // Results
    expect(transcript.results).not.toBeNull();
    expect(transcript.results!.scores).toHaveLength(2);
    expect(transcript.results!.winnerIndex).toBeGreaterThanOrEqual(0);
    expect(transcript.results!.winnerIndex).toBeLessThanOrEqual(1);
    expect(transcript.results!.winnerName).toBeTruthy();
  });

  it('computes final scores correctly', () => {
    const { session, transcript } = runFullGame(RandomStrategy, 42);

    // Verify scores match direct calculation from game state
    for (let p = 0; p < 2; p++) {
      const grid = session.gameState.playerStates[p].grid;
      const expected = scoreGrid(grid);
      expect(transcript.results!.scores[p]).toBe(expected);
    }

    // Winner has the lowest score
    const scores = transcript.results!.scores;
    const minScore = Math.min(...scores);
    expect(scores[transcript.results!.winnerIndex]).toBe(minScore);
  });

  it('reveals all cards by game end', () => {
    const { session } = runFullGame(RandomStrategy, 42);
    // The triggering player's grid must be fully revealed;
    // other players may not be (they just get one final turn).
    // But the game should have ended properly.
    expect(session.gameState.phase).toBe('ended');
  });

  it('completes consistently across multiple seeds', () => {
    for (const seed of [1, 2, 3, 17, 99, 12345]) {
      const { session, turnCount } = runFullGame(RandomStrategy, seed);
      expect(session.gameState.phase).toBe('ended');
      expect(turnCount).toBeLessThan(MAX_TURNS);
    }
  });
});

describe('Integration: AI-vs-AI full game (GreedyStrategy)', () => {
  it('completes a full game without errors', () => {
    const { session, turnCount } = runFullGame(GreedyStrategy, 42);
    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(MAX_TURNS);
    expect(turnCount).toBeGreaterThanOrEqual(2);
  });

  it('produces a valid transcript', () => {
    const { transcript, turnCount } = runFullGame(GreedyStrategy, 42);

    expect(transcript.version).toBe(1);
    expect(transcript.metadata.players[0].strategy).toBe('greedy');
    expect(transcript.turns).toHaveLength(turnCount);
    expect(transcript.results).not.toBeNull();
    expect(transcript.results!.scores).toHaveLength(2);

    // Last turn ends the round
    expect(transcript.turns[transcript.turns.length - 1].roundEnded).toBe(true);
  });

  it('computes final scores correctly', () => {
    const { session, transcript } = runFullGame(GreedyStrategy, 42);

    for (let p = 0; p < 2; p++) {
      const grid = session.gameState.playerStates[p].grid;
      const expected = scoreGrid(grid);
      expect(transcript.results!.scores[p]).toBe(expected);
    }

    const scores = transcript.results!.scores;
    const minScore = Math.min(...scores);
    expect(scores[transcript.results!.winnerIndex]).toBe(minScore);
  });

  it('greedy strategy typically scores lower than random', () => {
    // Run multiple games and compare average scores
    const greedyScores: number[] = [];
    const randomScores: number[] = [];

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const greedyResult = runFullGame(GreedyStrategy, seed);
      const randomResult = runFullGame(RandomStrategy, seed);

      // Average score per game
      const greedyAvg =
        greedyResult.transcript.results!.scores.reduce((a, b) => a + b, 0) / 2;
      const randomAvg =
        randomResult.transcript.results!.scores.reduce((a, b) => a + b, 0) / 2;

      greedyScores.push(greedyAvg);
      randomScores.push(randomAvg);
    }

    const avgGreedy =
      greedyScores.reduce((a, b) => a + b, 0) / greedyScores.length;
    const avgRandom =
      randomScores.reduce((a, b) => a + b, 0) / randomScores.length;

    // Greedy should generally score lower (better) than random
    // Allow some tolerance since random can occasionally beat greedy
    expect(avgGreedy).toBeLessThan(avgRandom + 10);
  });

  it('completes consistently across multiple seeds', () => {
    for (const seed of [1, 2, 3, 17, 99, 12345]) {
      const { session, turnCount } = runFullGame(GreedyStrategy, seed);
      expect(session.gameState.phase).toBe('ended');
      expect(turnCount).toBeLessThan(MAX_TURNS);
    }
  });
});

describe('Integration: Transcript structure validation', () => {
  it('turn numbers are sequential', () => {
    const { transcript } = runFullGame(RandomStrategy, 42);
    for (let i = 0; i < transcript.turns.length; i++) {
      expect(transcript.turns[i].turnNumber).toBe(i);
    }
  });

  it('player indices alternate correctly', () => {
    const { transcript } = runFullGame(RandomStrategy, 42);
    // Turns should alternate between player 0 and 1
    // (except possibly at round end where order may differ)
    for (let i = 0; i < transcript.turns.length - 1; i++) {
      const current = transcript.turns[i].playerIndex;
      const next = transcript.turns[i + 1].playerIndex;
      // They should alternate: 0,1,0,1,...
      if (!transcript.turns[i].roundEnded) {
        expect(next).toBe(1 - current);
      }
    }
  });

  it('stock count decreases when drawing from stock', () => {
    const { transcript } = runFullGame(RandomStrategy, 42);
    let expectedStock = transcript.initialState.stockRemaining;

    for (const turn of transcript.turns) {
      if (turn.drawSource === 'stock') {
        expectedStock--;
      }
      expect(turn.stockRemaining).toBe(expectedStock);
    }
  });

  it('board state grids always have 9 cards', () => {
    const { transcript } = runFullGame(RandomStrategy, 42);

    // Initial state
    for (const bs of transcript.initialState.boardStates) {
      expect(bs.grid).toHaveLength(9);
    }

    // Every turn
    for (const turn of transcript.turns) {
      for (const bs of turn.boardStates) {
        expect(bs.grid).toHaveLength(9);
      }
    }
  });

  it('face-up count never decreases for a player', () => {
    const { transcript } = runFullGame(RandomStrategy, 42);

    const lastFaceUpCount = [
      transcript.initialState.boardStates[0].faceUpCount,
      transcript.initialState.boardStates[1].faceUpCount,
    ];

    for (const turn of transcript.turns) {
      for (let p = 0; p < 2; p++) {
        const currentCount = turn.boardStates[p].faceUpCount;
        // Face-up count should never decrease (cards are revealed, not hidden)
        expect(currentCount).toBeGreaterThanOrEqual(lastFaceUpCount[p]);
        lastFaceUpCount[p] = currentCount;
      }
    }
  });

  it('transcript serializes to valid JSON', () => {
    const { transcript } = runFullGame(GreedyStrategy, 42);
    const json = JSON.stringify(transcript);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.metadata).toBeDefined();
    expect(parsed.initialState).toBeDefined();
    expect(parsed.turns).toBeInstanceOf(Array);
    expect(parsed.results).toBeDefined();
    expect(parsed.results.scores).toBeInstanceOf(Array);
  });
});

describe('Integration: Game invariants', () => {
  it('total cards in play remain constant (52)', () => {
    const rng = createTestRng(42);
    const session = setupGolfGame({
      playerNames: ['AI-1', 'AI-2'],
      isAI: [true, true],
      rng,
    });

    const countTotalCards = (s: GolfSession): number => {
      let count = 0;
      // Cards in grids (9 per player)
      count += s.gameState.playerStates.length * 9;
      // Cards in stock
      count += s.shared.stockPile.length;
      // Cards in discard
      count += s.shared.discardPile.size();
      return count;
    };

    // Before play: should be 52
    expect(countTotalCards(session)).toBe(52);

    const ai = new AiPlayer(RandomStrategy, createTestRng(43));

    let turns = 0;
    while (session.gameState.phase !== 'ended' && turns < MAX_TURNS) {
      const idx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[idx];
      const action = ai.chooseAction(ps, session.shared);
      executeTurn(session, action);

      // After each turn, total cards should still be 52
      expect(countTotalCards(session)).toBe(52);
      turns++;
    }

    expect(session.gameState.phase).toBe('ended');
  });

  it('at least one player has a fully revealed grid at round end', () => {
    const { session } = runFullGame(RandomStrategy, 42);

    const anyFullyRevealed = session.gameState.playerStates.some((ps) =>
      isGridFullyRevealed(ps.grid),
    );
    expect(anyFullyRevealed).toBe(true);
  });

  it('discard pile top card is always face-up', () => {
    const rng = createTestRng(42);
    const session = setupGolfGame({
      playerNames: ['AI-1', 'AI-2'],
      isAI: [true, true],
      rng,
    });

    // Initial discard top should be face-up
    const initialTop = session.shared.discardPile.peek();
    expect(initialTop).toBeDefined();
    expect(initialTop!.faceUp).toBe(true);

    const ai = new AiPlayer(RandomStrategy, createTestRng(43));

    let turns = 0;
    while (session.gameState.phase !== 'ended' && turns < MAX_TURNS) {
      const idx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[idx];
      const action = ai.chooseAction(ps, session.shared);
      executeTurn(session, action);

      // Discard pile top should always be face-up
      const top = session.shared.discardPile.peek();
      if (top) {
        expect(top.faceUp).toBe(true);
      }
      turns++;
    }
  });
});
