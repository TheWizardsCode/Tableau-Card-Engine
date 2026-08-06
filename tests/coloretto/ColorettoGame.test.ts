/**
 * Tests for ColorettoGame -- setup, row placement, take-a-row mechanics,
 * Last Round flow, round management, multi-round accumulation, win/loss.
 *
 * Covers acceptance criteria:
 *   - Row placement: max 3 cards per row, no placement on a full row,
 *     placement on any non-full row.
 *   - Take-a-row: row removed from tableau, cards added to collection,
 *     player eliminated from further action in the round.
 *   - Multi-round accumulation: canonical round counts (3/4/5/7 for
 *     5/4/3/2 players) and cumulative scoring.
 *   - Win/loss detection via cumulative score.
 */

import { describe, it, expect } from 'vitest';
import {
  setupColorettoGame,
  topCard,
  getCurrentPlayerIndex,
  validateAction,
  legalActions,
  executeAction,
  isRoundOver,
  beginRoundScoring,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../../example-games/coloretto/ColorettoGame';
import type {
  ColorettoSession,
  ColorettoAction,
} from '../../example-games/coloretto/ColorettoGame';
import type { ChameleonColor, ColorettoCard } from '../../example-games/coloretto/ColorettoCards';

// Deterministic RNG for reproducible tests.
function makeRng(seed: number = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Build a chameleon card quickly. */
function ch(color: ChameleonColor, count: 1 | 2, id: number): ColorettoCard {
  return { id, type: 'chameleon', color, count };
}

/** Play a full round for all players using simple legal actions, returning actions taken. */
function playFullRound(session: ColorettoSession): ColorettoAction[] {
  const actions: ColorettoAction[] = [];
  while (!isRoundOver(session)) {
    const playerIndex = getCurrentPlayerIndex(session);
    const legal = legalActions(session, playerIndex);
    expect(legal.length).toBeGreaterThan(0);
    const action = legal[0];
    executeAction(session, playerIndex, action);
    actions.push(action);
  }
  return actions;
}

describe('ColorettoGame', () => {
  describe('setupColorettoGame', () => {
    it('creates a 2-player game with 3 rows and 7 rounds', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(session.players).toHaveLength(2);
      expect(session.rows).toHaveLength(3);
      expect(session.totalRounds).toBe(7);
      expect(session.phase).toBe('playing');
      expect(session.currentRound).toBe(0);
      expect(session.lastRoundTriggered).toBe(false);
    });

    it('configures rows and rounds per player count', () => {
      expect(setupColorettoGame({ playerCount: 2, rng: makeRng() }).rows).toHaveLength(3);
      expect(setupColorettoGame({ playerCount: 2, rng: makeRng() }).totalRounds).toBe(7);
      expect(setupColorettoGame({ playerCount: 3, rng: makeRng() }).rows).toHaveLength(3);
      expect(setupColorettoGame({ playerCount: 3, rng: makeRng() }).totalRounds).toBe(5);
      expect(setupColorettoGame({ playerCount: 4, rng: makeRng() }).rows).toHaveLength(4);
      expect(setupColorettoGame({ playerCount: 4, rng: makeRng() }).totalRounds).toBe(4);
      expect(setupColorettoGame({ playerCount: 5, rng: makeRng() }).rows).toHaveLength(5);
      expect(setupColorettoGame({ playerCount: 5, rng: makeRng() }).totalRounds).toBe(3);
    });

    it('rejects player counts outside 2-5', () => {
      expect(() => setupColorettoGame({ playerCount: 1, rng: makeRng() })).toThrow();
      expect(() => setupColorettoGame({ playerCount: 6, rng: makeRng() })).toThrow();
    });

    it('sets player names and AI flags', () => {
      const session = setupColorettoGame({
        playerNames: ['You', 'Bob', 'Carol'],
        isAI: [false, true, true],
        rng: makeRng(),
      });
      expect(session.players[0].name).toBe('You');
      expect(session.players[0].isAI).toBe(false);
      expect(session.players[1].name).toBe('Bob');
      expect(session.players[1].isAI).toBe(true);
    });

    it('deals a full 43-card deck and empty rows', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(session.deck).toHaveLength(43);
      for (const row of session.rows) {
        expect(row.cards).toHaveLength(0);
      }
    });

    it('starts with player 0 to move and empty collections', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(getCurrentPlayerIndex(session)).toBe(0);
      for (const player of session.players) {
        expect(player.collection).toHaveLength(0);
        expect(player.roundState).toBe('active');
        expect(player.roundScores).toHaveLength(0);
        expect(player.totalScore).toBe(0);
      }
    });
  });

  describe('row placement rules', () => {
    it('places the top card onto an empty row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      const top = topCard(session);
      const result = executeAction(session, 0, { type: 'place', rowIndex: 0 });
      expect(result.drawnCard).toEqual(top);
      expect(session.rows[0].cards).toHaveLength(1);
      expect(session.deck).toHaveLength(42);
      expect(getCurrentPlayerIndex(session)).toBe(1);
    });

    it('accepts placement on any non-full row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(validateAction(session, 0, { type: 'place', rowIndex: 1 }).legal).toBe(true);
      expect(validateAction(session, 0, { type: 'place', rowIndex: 2 }).legal).toBe(true);
      executeAction(session, 0, { type: 'place', rowIndex: 1 });
      expect(session.rows[1].cards).toHaveLength(1);
    });

    it('rejects placement on a full row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Fill row 0 with 3 cards via repeated placement by alternating players.
      session.rows[0].cards = [ch('red', 1, 0), ch('blue', 1, 1), ch('green', 1, 2)];
      session.currentTurnIndex = -1;
      expect(validateAction(session, 0, { type: 'place', rowIndex: 0 }).legal).toBe(false);
      // But placement on a non-full row remains legal.
      expect(validateAction(session, 0, { type: 'place', rowIndex: 1 }).legal).toBe(true);
    });

    it('rejects placement out of row bounds', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(validateAction(session, 0, { type: 'place', rowIndex: 3 }).legal).toBe(false);
      expect(validateAction(session, 0, { type: 'place', rowIndex: -1 }).legal).toBe(false);
    });

    it('rejects placement when it is not the player turn', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(validateAction(session, 1, { type: 'place', rowIndex: 0 }).legal).toBe(false);
    });

    it('rejects placement when the deck is empty', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.deck = [];
      expect(validateAction(session, 0, { type: 'place', rowIndex: 0 }).legal).toBe(false);
    });

    it('advances turns around the table, skipping taken-row players', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      expect(getCurrentPlayerIndex(session)).toBe(0);
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      expect(getCurrentPlayerIndex(session)).toBe(1);
      // Player 1 takes row 0 (now containing one card) and sits out.
      executeAction(session, 1, { type: 'take', rowIndex: 0 });
      expect(session.players[1].roundState).toBe('taken-row');
      expect(getCurrentPlayerIndex(session)).toBe(2);
      executeAction(session, 2, { type: 'place', rowIndex: 0 });
      expect(getCurrentPlayerIndex(session)).toBe(3);
      // Player 0's next turn comes around only after player 3 acts.
      executeAction(session, 3, { type: 'place', rowIndex: 0 });
      expect(getCurrentPlayerIndex(session)).toBe(0);
    });
  });

  describe('take-a-row mechanics', () => {
    it('moves all row cards into the collection and clears the row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 0 });
      const rowCards = [...session.rows[0].cards];
      expect(rowCards).toHaveLength(2);

      executeAction(session, 0, { type: 'take', rowIndex: 0 });
      expect(session.players[0].collection).toEqual(rowCards);
      expect(session.rows[0].cards).toHaveLength(0);
    });

    it('eliminates the player from further action in the round', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'take', rowIndex: 0 });
      expect(session.players[1].roundState).toBe('taken-row');
      // Player 1 cannot act again this round.
      expect(legalActions(session, 1)).toHaveLength(0);
      expect(validateAction(session, 1, { type: 'place', rowIndex: 1 }).legal).toBe(false);
    });

    it('rejects taking an empty row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(validateAction(session, 0, { type: 'take', rowIndex: 0 }).legal).toBe(false);
    });

    it('rejects taking a row out of bounds', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.rows[0].cards = [ch('red', 1, 0)];
      expect(validateAction(session, 0, { type: 'take', rowIndex: 5 }).legal).toBe(false);
    });

    it('throws on illegal actions', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(() => executeAction(session, 0, { type: 'take', rowIndex: 0 })).toThrow();
    });
  });

  describe('legalActions', () => {
    it('returns place actions for non-full rows and take actions for non-empty rows', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      let actions = legalActions(session, 0);
      expect(actions).toEqual([
        { type: 'place', rowIndex: 0 },
        { type: 'place', rowIndex: 1 },
        { type: 'place', rowIndex: 2 },
      ]);

      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      actions = legalActions(session, 1);
      expect(actions).toContainEqual({ type: 'place', rowIndex: 0 });
      expect(actions).toContainEqual({ type: 'take', rowIndex: 0 });
    });

    it('returns no actions for non-current or eliminated players', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(legalActions(session, 1)).toHaveLength(0);
      session.players[0].roundState = 'taken-row';
      expect(legalActions(session, 0)).toHaveLength(0);
    });
  });

  describe('Last Round flow', () => {
    it('triggers the Last Round when the Last Round card is placed', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Replace the deck so the top card (last element) is the Last Round card.
      session.deck = [ch('red', 1, 0), { id: 42, type: 'last-round' }];
      const result = executeAction(session, 0, { type: 'place', rowIndex: 0 });
      expect(result.lastRoundTriggered).toBe(true);
      expect(session.lastRoundTriggered).toBe(true);
      expect(session.rows[0].cards[0]).toEqual({ id: 42, type: 'last-round' });
    });

    it('gives every active player exactly one final turn after the trigger', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      // Player 0 and 1 act normally first.
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 0 });

      // Player 2 draws the Last Round card.
      session.deck = [ch('red', 1, 0), ch('blue', 1, 1), { id: 42, type: 'last-round' }];
      executeAction(session, 2, { type: 'place', rowIndex: 0 });
      expect(session.lastRoundTriggered).toBe(true);
      expect(session.players[2].roundState).toBe('final-turn-done');

      // Remaining active players each get one final turn.
      const remaining = session.players
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.roundState === 'active');
      expect(remaining.map(({ i }) => i)).toEqual([0, 1, 3]);

      const finalActions: string[] = [];
      while (!isRoundOver(session)) {
        const idx = getCurrentPlayerIndex(session);
        const legal = legalActions(session, idx);
        finalActions.push(`${idx}:${legal[0].type}`);
        executeAction(session, idx, legal[0]);
      }

      // Each of players 0, 1, 3 got exactly one more turn.
      expect(finalActions).toHaveLength(3);
      expect(isRoundOver(session)).toBe(true);
      expect(session.players.every((p) => p.roundState !== 'active')).toBe(true);
    });

    it('ends the round after final turns even if rows have space', () => {
      const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
      session.deck = [ch('red', 1, 0), { id: 42, type: 'last-round' }];
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      // Player 1's final turn: they may place one more card.
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      expect(isRoundOver(session)).toBe(true);
      // Row 0 still has space but the round is over.
      expect(session.rows[0].cards.length).toBeLessThan(3);
    });
  });

  describe('round scoring and accumulation', () => {
    it('scores a round and deals the next', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      playFullRound(session);
      expect(isRoundOver(session)).toBe(true);

      beginRoundScoring(session);
      const result = scoreRound(session);

      expect(result.round).toBe(0);
      expect(result.roundScores).toHaveLength(2);
      expect(result.cumulativeScores).toHaveLength(2);
      expect(result.positiveColors).toHaveLength(2);
      expect(result.isLastRound).toBe(false);
      expect(session.phase).toBe('playing');
      expect(session.currentRound).toBe(1);
      expect(session.players[0].roundScores).toHaveLength(1);
      expect(session.players[1].roundScores).toHaveLength(1);
    });

    it('uses provided positive colors when given', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      playFullRound(session);
      beginRoundScoring(session);
      const result = scoreRound(session, [['red'], undefined]);
      expect(result.positiveColors[0]).toEqual(['red']);
      // Player 1 (AI) falls back to the optimal selection.
      expect(result.positiveColors[1].length).toBeGreaterThan(0);
    });

    it('throws when scoring outside the round-scoring phase', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(() => scoreRound(session)).toThrow();
      playFullRound(session);
      beginRoundScoring(session);
      expect(() => scoreRound(session)).not.toThrow();
    });

    it('throws when scoring a round still in progress', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(() => beginRoundScoring(session)).toThrow();
    });

    it('accumulates totals across all rounds', () => {
      const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
      let totalRoundsPlayed = 0;
      while (!isGameOver(session)) {
        playFullRound(session);
        beginRoundScoring(session);
        const result = scoreRound(session);
        totalRoundsPlayed++;
        // Cumulative totals match the sum of round scores.
        for (let i = 0; i < session.players.length; i++) {
          expect(result.cumulativeScores[i]).toBe(
            session.players[i].roundScores.reduce((a, b) => a + b, 0),
          );
        }
      }
      expect(totalRoundsPlayed).toBe(5); // 3 players → 5 rounds
      expect(session.phase).toBe('game-over');
      expect(session.players[0].roundScores).toHaveLength(5);
    });

    it('plays the canonical round count for 2 players (7 rounds)', () => {
      const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
      let rounds = 0;
      while (!isGameOver(session)) {
        playFullRound(session);
        beginRoundScoring(session);
        scoreRound(session);
        rounds++;
      }
      expect(rounds).toBe(7);
    });
  });

  describe('win/loss detection', () => {
    it('returns the player with the highest cumulative score', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[0].totalScore = 25;
      session.players[1].totalScore = 30;
      expect(getWinnerIndex(session)).toBe(1);
    });

    it('returns the first player on a tie', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[0].totalScore = 12;
      session.players[1].totalScore = 12;
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('detects game over only after the final round', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(isGameOver(session)).toBe(false);
      for (let round = 0; round < 6; round++) {
        playFullRound(session);
        beginRoundScoring(session);
        scoreRound(session);
        expect(isGameOver(session)).toBe(false);
      }
      playFullRound(session);
      beginRoundScoring(session);
      scoreRound(session);
      expect(isGameOver(session)).toBe(true);
      expect(getWinnerIndex(session)).toBeGreaterThanOrEqual(0);
    });
  });
});
