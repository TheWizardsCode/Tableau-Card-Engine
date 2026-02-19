/**
 * Tests for GameTranscript -- TranscriptRecorder and transcript schema validation.
 */

import { describe, it, expect } from 'vitest';
import {
  TranscriptRecorder,
  snapshotCard,
  snapshotBoard,
} from '../../example-games/golf/GameTranscript';
import type {
  GameTranscript,
  TurnRecord,
  BoardSnapshot,
  CardSnapshot,
} from '../../example-games/golf/GameTranscript';
import { setupGolfGame, executeTurn } from '../../example-games/golf/GolfGame';
import type { GolfAction } from '../../example-games/golf/GolfGame';
import { AiPlayer, RandomStrategy, GreedyStrategy } from '../../example-games/golf/AiStrategy';
import { createCard } from '../../src/card-system/Card';
import { createGolfGrid } from '../../example-games/golf/GolfGrid';

// Deterministic RNG
function createTestRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('snapshotCard', () => {
  it('creates a serializable card snapshot', () => {
    const card = createCard('A', 'spades', true);
    const snap = snapshotCard(card);
    expect(snap).toEqual({ rank: 'A', suit: 'spades', faceUp: true });
  });

  it('captures face-down state', () => {
    const card = createCard('K', 'hearts', false);
    const snap = snapshotCard(card);
    expect(snap.faceUp).toBe(false);
  });
});

describe('snapshotBoard', () => {
  it('creates a board snapshot with correct scores', () => {
    const cards = [
      createCard('A', 'clubs', true),   // 1
      createCard('K', 'hearts', true),  // 0
      createCard('5', 'spades', true),  // 5
      createCard('3', 'clubs', false),  // hidden
      createCard('4', 'hearts', false), // hidden
      createCard('6', 'spades', false), // hidden
      createCard('7', 'clubs', false),
      createCard('8', 'hearts', false),
      createCard('9', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const snap = snapshotBoard(grid);

    expect(snap.grid).toHaveLength(9);
    expect(snap.faceUpCount).toBe(3);
    expect(snap.visibleScore).toBe(6); // 1 + 0 + 5
    expect(typeof snap.totalScore).toBe('number');
  });

  it('has 9 card snapshots in the grid', () => {
    const cards = Array.from({ length: 9 }, () =>
      createCard('2', 'clubs', true),
    );
    const grid = createGolfGrid(cards);
    const snap = snapshotBoard(grid);

    expect(snap.grid).toHaveLength(9);
    snap.grid.forEach((cs: CardSnapshot) => {
      expect(cs.rank).toBe('2');
      expect(cs.suit).toBe('clubs');
      expect(cs.faceUp).toBe(true);
    });
  });
});

describe('TranscriptRecorder', () => {
  it('captures initial state on construction', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    const recorder = new TranscriptRecorder(session, ['random', 'greedy']);
    const transcript = recorder.getTranscript();

    expect(transcript.version).toBe(1);
    expect(transcript.metadata.players).toHaveLength(2);
    expect(transcript.metadata.players[0].strategy).toBe('random');
    expect(transcript.metadata.players[1].strategy).toBe('greedy');
    expect(transcript.initialState.boardStates).toHaveLength(2);
    expect(transcript.initialState.stockRemaining).toBe(33);
    expect(transcript.initialState.discardTop).not.toBeNull();
    expect(transcript.turns).toHaveLength(0);
    expect(transcript.results).toBeNull();
  });

  it('records a turn', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    const recorder = new TranscriptRecorder(session);

    const action: GolfAction = {
      drawSource: 'stock',
      move: { kind: 'swap', row: 1, col: 0 },
    };
    const result = executeTurn(session, action);
    recorder.recordTurn(result, action.drawSource);

    const transcript = recorder.getTranscript();
    expect(transcript.turns).toHaveLength(1);

    const turn = transcript.turns[0];
    expect(turn.turnNumber).toBe(0);
    expect(turn.playerIndex).toBe(0);
    expect(turn.drawSource).toBe('stock');
    expect(turn.move.kind).toBe('swap');
    expect(turn.drawnCard).toBeDefined();
    expect(turn.discardedCard).toBeDefined();
    expect(turn.boardStates).toHaveLength(2);
    expect(turn.roundEnded).toBe(false);
  });

  it('finalizes with results', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    const recorder = new TranscriptRecorder(session);

    // Execute a few turns
    for (let i = 0; i < 4; i++) {
      const action: GolfAction = {
        drawSource: 'stock',
        move: { kind: 'swap', row: Math.floor(i / 3), col: i % 3 },
      };
      const result = executeTurn(session, action);
      recorder.recordTurn(result, action.drawSource);
    }

    const transcript = recorder.finalize();
    expect(transcript.results).not.toBeNull();
    expect(transcript.results!.scores).toHaveLength(2);
    expect(transcript.results!.winnerIndex).toBeGreaterThanOrEqual(0);
    expect(transcript.results!.winnerName).toBeTruthy();
    expect(transcript.metadata.endedAt).toBeTruthy();
  });
});

describe('Full game transcript', () => {
  it('produces a valid transcript for a RandomStrategy AI-vs-AI game', () => {
    const session = setupGolfGame({ rng: createTestRng(100) });
    const recorder = new TranscriptRecorder(session, ['random', 'random']);
    const ai0 = new AiPlayer(RandomStrategy, createTestRng(200));
    const ai1 = new AiPlayer(RandomStrategy, createTestRng(300));

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

    expect(session.gameState.phase).toBe('ended');

    const transcript = recorder.finalize();
    validateTranscript(transcript);
  });

  it('produces a valid transcript for a GreedyStrategy AI-vs-AI game', () => {
    const session = setupGolfGame({ rng: createTestRng(400) });
    const recorder = new TranscriptRecorder(session, ['greedy', 'greedy']);
    const ai0 = new AiPlayer(GreedyStrategy, createTestRng(500));
    const ai1 = new AiPlayer(GreedyStrategy, createTestRng(600));

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

    expect(session.gameState.phase).toBe('ended');

    const transcript = recorder.finalize();
    validateTranscript(transcript);
  });

  it('transcript is JSON-serializable and parseable', () => {
    const session = setupGolfGame({ rng: createTestRng(700) });
    const recorder = new TranscriptRecorder(session, ['random', 'random']);
    const ai = new AiPlayer(RandomStrategy, createTestRng(800));

    let turnCount = 0;
    while (session.gameState.phase !== 'ended' && turnCount < 200) {
      const idx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[idx];
      const action = ai.chooseAction(ps, session.shared);
      const result = executeTurn(session, action);
      recorder.recordTurn(result, action.drawSource);
      turnCount++;
    }

    const transcript = recorder.finalize();
    const json = JSON.stringify(transcript);
    const parsed: GameTranscript = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.turns.length).toBe(transcript.turns.length);
    expect(parsed.results).toEqual(transcript.results);
    expect(parsed.metadata).toEqual(transcript.metadata);
  });
});

// ── Schema validation helper ────────────────────────────────

function validateTranscript(t: GameTranscript): void {
  // Version
  expect(t.version).toBe(1);

  // Metadata
  expect(t.metadata.startedAt).toBeTruthy();
  expect(t.metadata.endedAt).toBeTruthy();
  expect(t.metadata.players.length).toBeGreaterThanOrEqual(2);
  for (const p of t.metadata.players) {
    expect(typeof p.name).toBe('string');
    expect(typeof p.isAI).toBe('boolean');
  }

  // Initial state
  expect(t.initialState.boardStates.length).toBe(t.metadata.players.length);
  for (const bs of t.initialState.boardStates) {
    validateBoardSnapshot(bs);
  }
  expect(typeof t.initialState.stockRemaining).toBe('number');

  // Turns
  expect(t.turns.length).toBeGreaterThan(0);
  for (let i = 0; i < t.turns.length; i++) {
    const turn = t.turns[i];
    validateTurnRecord(turn, i, t.metadata.players.length);
  }

  // The last turn should have roundEnded = true
  expect(t.turns[t.turns.length - 1].roundEnded).toBe(true);

  // Results
  expect(t.results).not.toBeNull();
  expect(t.results!.scores.length).toBe(t.metadata.players.length);
  expect(t.results!.winnerIndex).toBeGreaterThanOrEqual(0);
  expect(t.results!.winnerIndex).toBeLessThan(t.metadata.players.length);
  expect(typeof t.results!.winnerName).toBe('string');
}

function validateBoardSnapshot(bs: BoardSnapshot): void {
  expect(bs.grid).toHaveLength(9);
  for (const card of bs.grid) {
    validateCardSnapshot(card);
  }
  expect(typeof bs.faceUpCount).toBe('number');
  expect(bs.faceUpCount).toBeGreaterThanOrEqual(0);
  expect(bs.faceUpCount).toBeLessThanOrEqual(9);
  expect(typeof bs.visibleScore).toBe('number');
  expect(typeof bs.totalScore).toBe('number');
}

function validateTurnRecord(
  turn: TurnRecord,
  expectedIndex: number,
  playerCount: number,
): void {
  expect(turn.turnNumber).toBe(expectedIndex);
  expect(turn.playerIndex).toBeGreaterThanOrEqual(0);
  expect(turn.playerIndex).toBeLessThan(playerCount);
  expect(typeof turn.playerName).toBe('string');
  expect(['stock', 'discard']).toContain(turn.drawSource);
  validateCardSnapshot(turn.drawnCard);
  expect(['swap', 'discard-and-flip']).toContain(turn.move.kind);
  validateCardSnapshot(turn.discardedCard);
  expect(turn.boardStates).toHaveLength(playerCount);
  for (const bs of turn.boardStates) {
    validateBoardSnapshot(bs);
  }
  expect(typeof turn.stockRemaining).toBe('number');
  expect(typeof turn.roundEnded).toBe('boolean');
}

function validateCardSnapshot(cs: CardSnapshot): void {
  expect(typeof cs.rank).toBe('string');
  expect(typeof cs.suit).toBe('string');
  expect(typeof cs.faceUp).toBe('boolean');
}
