/**
 * Tests for GameTranscript -- Coloretto transcript recording.
 *
 * Covers acceptance criteria:
 *   - Each completed game produces a JSON transcript recording the
 *     sequence of turns, row states, and final scores.
 */

import { describe, it, expect } from 'vitest';
import {
  setupColorettoGame,
  executeAction,
  getCurrentPlayerIndex,
  beginRoundScoring,
  scoreRound,
  isRoundOver,
  isGameOver,
  getWinnerIndex,
} from '../../example-games/coloretto/ColorettoGame';
import { ColorettoTranscriptRecorder, snapshotCard } from '../../example-games/coloretto/GameTranscript';
import { createSeededRng } from '../../src/core-engine';
import type { ColorettoSession } from '../../example-games/coloretto/ColorettoGame';

function makeRng(seed: number = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Play one full round of simple legal actions, recording each turn. */
function playFullRound(session: ColorettoSession, recorder: ColorettoTranscriptRecorder): void {
  while (!isRoundOver(session)) {
    const idx = getCurrentPlayerIndex(session);
    const rowIndex = session.rows.findIndex((r) => r.cards.length < 3 && session.deck.length > 0);
    const action = rowIndex >= 0
      ? { type: 'place' as const, rowIndex }
      : { type: 'take' as const, rowIndex: session.rows.findIndex((r) => r.cards.length > 0) };
    const result = executeAction(session, idx, action);
    recorder.recordTurn(idx, action, result.drawnCard);
  }
}

describe('ColorettoTranscriptRecorder', () => {
  it('records the initial state with players, rows, and deck size', () => {
    const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
    const recorder = new ColorettoTranscriptRecorder(session);
    const transcript = recorder.getTranscript();

    expect(transcript.version).toBe(1);
    expect(transcript.gameType).toBe('coloretto');
    expect(transcript.initialState.playerStates).toHaveLength(3);
    expect(transcript.initialState.rows).toHaveLength(3);
    expect(transcript.initialState.deckSize).toBe(49);
    expect(transcript.initialState.totalRounds).toBe(5);
    expect(transcript.initialState.playerStates[0].name).toBe('Player 1');
    expect(transcript.turns).toHaveLength(0);
    expect(transcript.results).toBeNull();
  });

  it('records turns with actions, row states, and deck size', () => {
    const session = setupColorettoGame({ rng: makeRng() });
    const recorder = new ColorettoTranscriptRecorder(session);

    playFullRound(session, recorder);

    const transcript = recorder.getTranscript();
    expect(transcript.turns.length).toBeGreaterThan(0);

    const firstTurn = transcript.turns[0];
    expect(firstTurn.round).toBe(0);
    // Round 1 begins with the first player in the randomized turn order.
    expect(firstTurn.playerIndex).toBe(session.turnOrder[0]);
    expect(firstTurn.action).toEqual({ type: 'place', rowIndex: 0 });
    expect(firstTurn.drawnCard).toBeDefined();
    expect(firstTurn.rows.length).toBe(3);
    expect(firstTurn.rows[0].cards.length).toBe(1);
    // Deck shrinks after the first placement (49-card full deck).
    expect(firstTurn.deckSize).toBe(48);

    // The last turn of the round has recorded row states.
    const lastTurn = transcript.turns[transcript.turns.length - 1];
    expect(lastTurn.rows.some((r) => r.cards.length > 0)).toBe(true);
  });

  it('records round results with scores and cumulative totals', () => {
    const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
    const recorder = new ColorettoTranscriptRecorder(session);

    playFullRound(session, recorder);
    beginRoundScoring(session);
    const result = scoreRound(session);
    recorder.recordRoundResult(result);

    const transcript = recorder.getTranscript();
    expect(transcript.roundResults).toHaveLength(1);
    expect(transcript.roundResults[0].roundScores).toHaveLength(2);
    expect(transcript.roundResults[0].cumulativeScores).toHaveLength(2);
  });

  it('finalizes with final scores and the winner', () => {
    const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
    const recorder = new ColorettoTranscriptRecorder(session);

    // Play the full 7-round game (2 players).
    while (!isGameOver(session)) {
      playFullRound(session, recorder);
      beginRoundScoring(session);
      const result = scoreRound(session);
      recorder.recordRoundResult(result);
    }

    const winner = getWinnerIndex(session);
    const transcript = recorder.finalize(winner);

    expect(recorder.isSealed()).toBe(true);
    expect(transcript.endedAt).not.toBe('');
    expect(transcript.results).not.toBeNull();
    expect(transcript.results?.finalScores).toHaveLength(2);
    expect(transcript.results?.winnerIndex).toBe(winner);
    expect(transcript.results?.winnerName).toBe(session.players[winner].name);
    expect(transcript.results?.roundScores).toHaveLength(2);
    expect(transcript.results?.roundScores[0]).toHaveLength(7);
    // Final scores match the recorded totals.
    expect(transcript.results?.finalScores[0]).toBe(session.players[0].totalScore);
  });

  it('finalize is idempotent after sealing', () => {
    const session = setupColorettoGame({ rng: makeRng() });
    const recorder = new ColorettoTranscriptRecorder(session);
    const first = recorder.finalize(0);
    const second = recorder.finalize(1);
    expect(second).toBe(first);
    expect(first.results?.winnerIndex).toBe(0);
  });

  it('produces a JSON-serializable transcript', () => {
    const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
    const recorder = new ColorettoTranscriptRecorder(session);
    playFullRound(session, recorder);
    beginRoundScoring(session);
    const result = scoreRound(session);
    recorder.recordRoundResult(result);

    const transcript = recorder.finalize(getWinnerIndex(session));
    const json = JSON.stringify(transcript);
    expect(json.length).toBeGreaterThan(0);
    const parsed = JSON.parse(json);
    expect(parsed.gameType).toBe('coloretto');
    expect(parsed.turns.length).toBe(transcript.turns.length);
  });

  it('snapshots cards with type-specific fields', () => {
    const chameleon = snapshotCard({ id: 1, type: 'chameleon', color: 'red', count: 2 });
    expect(chameleon).toEqual({ id: 1, type: 'chameleon', color: 'red', count: 2 });

    const lastRound = snapshotCard({ id: 42, type: 'last-round' });
    expect(lastRound).toEqual({ id: 42, type: 'last-round' });

    const joker = snapshotCard({ id: 43, type: 'joker' });
    expect(joker).toEqual({ id: 43, type: 'joker' });

    const bonus = snapshotCard({ id: 44, type: 'bonus' });
    expect(bonus).toEqual({ id: 44, type: 'bonus' });
  });

  it('is deterministic given the same seeded game', () => {
    const session = setupColorettoGame({ playerCount: 3, rng: createSeededRng(99) });
    const recorder = new ColorettoTranscriptRecorder(session);
    playFullRound(session, recorder);
    const transcript = recorder.getTranscript();

    const session2 = setupColorettoGame({ playerCount: 3, rng: createSeededRng(99) });
    const recorder2 = new ColorettoTranscriptRecorder(session2);
    playFullRound(session2, recorder2);
    const transcript2 = recorder2.getTranscript();

    expect(transcript.turns.map((t) => t.action)).toEqual(
      transcript2.turns.map((t) => t.action),
    );
  });
});
