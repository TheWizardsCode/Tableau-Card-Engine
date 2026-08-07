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
  getRoundTurnOrder,
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

/**
 * Force identity turn order (players act in array order, player 0 first)
 * for mechanics tests that hardcode player indices. The game randomizes
 * turn order at setup; these tests opt into an explicit order instead.
 */
function forceIdentityTurnOrder(session: ColorettoSession): void {
  session.turnOrder = session.players.map((_, i) => i);
  session.roundStartPlayer = 0;
  session.currentTurnIndex = -1;
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

    it('starts with the round-1 start player to move and empty collections', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Round 1 begins with the first player in the randomized turn order.
      expect(session.roundStartPlayer).toBe(session.turnOrder[0]);
      expect(getCurrentPlayerIndex(session)).toBe(session.turnOrder[0]);
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
      forceIdentityTurnOrder(session);
      const top = topCard(session);
      const result = executeAction(session, 0, { type: 'place', rowIndex: 0 });
      expect(result.drawnCard).toEqual(top);
      expect(session.rows[0].cards).toHaveLength(1);
      expect(session.deck).toHaveLength(42);
      expect(getCurrentPlayerIndex(session)).toBe(1);
    });

    it('accepts placement on any non-full row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      expect(validateAction(session, 0, { type: 'place', rowIndex: 1 }).legal).toBe(true);
      expect(validateAction(session, 0, { type: 'place', rowIndex: 2 }).legal).toBe(true);
      executeAction(session, 0, { type: 'place', rowIndex: 1 });
      expect(session.rows[1].cards).toHaveLength(1);
    });

    it('rejects placement on a full row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Fill row 0 with 3 cards via repeated placement by alternating players.
      session.rows[0].cards = [ch('red', 1, 0), ch('blue', 1, 1), ch('green', 1, 2)];
      session.currentTurnIndex = -1;
      expect(validateAction(session, 0, { type: 'place', rowIndex: 0 }).legal).toBe(false);
      // But placement on a non-full row remains legal.
      expect(validateAction(session, 0, { type: 'place', rowIndex: 1 }).legal).toBe(true);
    });

    it('rejects placement out of row bounds', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      expect(validateAction(session, 0, { type: 'place', rowIndex: 3 }).legal).toBe(false);
      expect(validateAction(session, 0, { type: 'place', rowIndex: -1 }).legal).toBe(false);
    });

    it('rejects placement when it is not the player turn', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      expect(validateAction(session, 1, { type: 'place', rowIndex: 0 }).legal).toBe(false);
    });

    it('rejects placement when the deck is empty', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      session.deck = [];
      expect(validateAction(session, 0, { type: 'place', rowIndex: 0 }).legal).toBe(false);
    });

    it('advances turns around the table, skipping taken-row players', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      forceIdentityTurnOrder(session);
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
      forceIdentityTurnOrder(session);
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
      forceIdentityTurnOrder(session);
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'take', rowIndex: 0 });
      expect(session.players[1].roundState).toBe('taken-row');
      // Player 1 cannot act again this round.
      expect(legalActions(session, 1)).toHaveLength(0);
      expect(validateAction(session, 1, { type: 'place', rowIndex: 1 }).legal).toBe(false);
    });

    it('rejects taking an empty row', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      expect(validateAction(session, 0, { type: 'take', rowIndex: 0 }).legal).toBe(false);
    });

    it('rejects taking a row out of bounds', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      session.rows[0].cards = [ch('red', 1, 0)];
      expect(validateAction(session, 0, { type: 'take', rowIndex: 5 }).legal).toBe(false);
    });

    it('throws on illegal actions', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      expect(() => executeAction(session, 0, { type: 'take', rowIndex: 0 })).toThrow();
    });
  });

  describe('legalActions', () => {
    it('returns place actions for non-full rows and take actions for non-empty rows', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
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
      forceIdentityTurnOrder(session);
      expect(legalActions(session, 1)).toHaveLength(0);
      session.players[0].roundState = 'taken-row';
      expect(legalActions(session, 0)).toHaveLength(0);
    });
  });

  describe('Last Round flow', () => {
    it('triggers the Last Round when the Last Round card is placed', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Replace the deck so the top card (last element) is the Last Round card.
      session.deck = [ch('red', 1, 0), { id: 42, type: 'last-round' }];
      const result = executeAction(session, 0, { type: 'place', rowIndex: 0 });
      expect(result.lastRoundTriggered).toBe(true);
      expect(session.lastRoundTriggered).toBe(true);
      expect(session.rows[0].cards[0]).toEqual({ id: 42, type: 'last-round' });
    });

    it('gives every active player exactly one final turn after the trigger', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      forceIdentityTurnOrder(session);
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
      forceIdentityTurnOrder(session);
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

  describe('collection persistence and negative scoring across rounds', () => {
    /**
     * Play round 1 of a 2-player game with a crafted deck so that player 0
     * takes a row of exactly 3 different colors (red, yellow, green) and
     * player 1 takes a 2-card row. Deck pop order is last-element-first:
     * deck = [A,B,C,D,E] pops E, D, C, B, A in turn.
     */
    function playDeterministicRound1(session: ColorettoSession): void {
      forceIdentityTurnOrder(session);
      session.deck = [
        ch('purple', 1, 90), ch('purple', 1, 91), // never drawn (round ends first)
        ch('green', 1, 1),  // 5th pop → row 0 third slot
        ch('purple', 1, 2), // 4th pop → row 1 second slot
        ch('yellow', 1, 3), // 3rd pop → row 0 second slot
        ch('purple', 1, 4), // 2nd pop → row 1 first slot
        ch('red', 1, 5),    // 1st pop → row 0 first slot
      ];
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'take', rowIndex: 1 });
      executeAction(session, 0, { type: 'take', rowIndex: 0 });
      expect(isRoundOver(session)).toBe(true);
    }

    it('keeps player collections across rounds (dealRound does not clear them)', () => {
      const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
      playDeterministicRound1(session);

      const round1Collection = [...session.players[0].collection];
      expect(
        round1Collection.filter((c) => c.type === 'chameleon').map((c) => c.color),
      ).toEqual(['red', 'yellow', 'green']);

      beginRoundScoring(session);
      scoreRound(session); // non-final round → deals round 2
      expect(session.currentRound).toBe(1);

      // The fix: collections survive dealRound, so round 2 starts with the
      // cards the player collected in round 1.
      expect(session.players[0].collection).toEqual(round1Collection);
      expect(session.players[0].roundScores).toEqual([3]); // all 3 colors positive
    });

    it('scores colors not chosen as positive negatively once a player holds 4+ colors', () => {
      const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
      // Round 1: player 0 accumulates red, yellow, green (persists).
      playDeterministicRound1(session);
      beginRoundScoring(session);
      scoreRound(session);
      expect(
        session.players[0].collection.filter((c) => c.type === 'chameleon').map((c) => c.color),
      ).toEqual(['red', 'yellow', 'green']);

      // Round 2: player 0 takes a row with blue + orange (2 oranges).
      // Deck pop order: blue (1st), purple (2nd), orange (3rd), purple
      // (4th), orange (5th) -- player 0 ends with blue(1) and orange(2).
      session.deck = [
        ch('orange', 1, 10),  // 5th pop → row 0 third slot
        ch('purple', 1, 11),  // 4th pop → row 1 second slot
        ch('orange', 1, 12),  // 3rd pop → row 0 second slot
        ch('purple', 1, 13),  // 2nd pop → row 1 first slot
        ch('blue', 1, 14),    // 1st pop → row 0 first slot
      ];
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'take', rowIndex: 1 });
      executeAction(session, 0, { type: 'take', rowIndex: 0 });
      expect(isRoundOver(session)).toBe(true);

      beginRoundScoring(session);
      const result = scoreRound(session);
      const p0 = result.playerScores[0];

      // Player 0 now holds 5 colors (red 1, yellow 1, green 1, blue 1,
      // orange 2). The optimal 3 positives are red + yellow + orange; the
      // remaining colors score NEGATIVELY (canonical Coloretto rule).
      expect(result.positiveColors[0]).toEqual(['red', 'yellow', 'orange']);
      const negatives = p0.details.filter((d) => !d.positive);
      expect(negatives.map((d) => d.color)).toEqual(['green', 'blue']);
      expect(negatives.every((d) => d.points < 0)).toBe(true);
      expect(p0.total).toBe(3); // 1 + 1 + 3 - 1 - 1
    });
  });

  describe('win/loss detection', () => {
    it('returns the player with the highest cumulative score', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[0].totalScore = 25;
      session.players[1].totalScore = 30;
      expect(getWinnerIndex(session)).toBe(1);
    });

    it('returns the first player when tied with no round history', () => {
      // No round scores recorded (e.g. unit-level totalScore setup):
      // all tie-break dimensions are equal, so the first player wins.
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[0].totalScore = 12;
      session.players[1].totalScore = 12;
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('breaks a total tie by the most single-round wins', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[0].roundScores = [4, 4, 1]; // wins rounds 0 and 1
      session.players[1].roundScores = [3, 3, 3]; // wins round 2
      session.players[0].totalScore = 9;
      session.players[1].totalScore = 9;
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('breaks a total-and-wins tie by the highest single-round score', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // p0 wins round 1, p1 wins round 0 (one win each); p1's peak is higher.
      session.players[0].roundScores = [2, 5];
      session.players[1].roundScores = [6, 1];
      session.players[0].totalScore = 7;
      session.players[1].totalScore = 7;
      expect(getWinnerIndex(session)).toBe(1);
    });

    it('falls back to the first player when every tie-break dimension is equal', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[0].roundScores = [4, 4, 4];
      session.players[1].roundScores = [4, 4, 4];
      session.players[0].totalScore = 12;
      session.players[1].totalScore = 12;
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('compares tie-breaks across all players at the maximum total', () => {
      const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
      // p0 wins round 0, p1 wins round 1; p2 wins no round.
      session.players[0].roundScores = [5, 3]; // 1 win
      session.players[1].roundScores = [3, 5]; // 1 win
      session.players[2].roundScores = [4, 4]; // 0 wins
      session.players[0].totalScore = 8;
      session.players[1].totalScore = 8;
      session.players[2].totalScore = 8;
      // p0 and p1 both have 1 win and a peak of 5: first player wins.
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

  describe('turn order randomization', () => {
    it('assigns a permutation of every player index at setup', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      expect(session.turnOrder).toHaveLength(4);
      expect([...session.turnOrder].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    });

    it('is deterministic for the same seed', () => {
      const a = setupColorettoGame({ playerCount: 4, rng: makeRng(99) });
      const b = setupColorettoGame({ playerCount: 4, rng: makeRng(99) });
      expect(a.turnOrder).toEqual(b.turnOrder);
    });

    it('varies across seeds so the human is not always first', () => {
      const orders = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        setupColorettoGame({ playerCount: 3, rng: makeRng(seed) }).turnOrder,
      );
      // Every order is a valid permutation of the 3 players...
      for (const order of orders) {
        expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2]);
      }
      // ...and not every game puts the human (index 0) first.
      expect(orders.every((o) => o[0] === 0)).toBe(false);
      // At least two distinct orders appear across seeds.
      expect(new Set(orders.map((o) => o.join(','))).size).toBeGreaterThan(1);
    });

    it('begins round 1 with the first player in the randomized order', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng(1234) });
      expect(session.roundStartPlayer).toBe(session.turnOrder[0]);
      expect(getCurrentPlayerIndex(session)).toBe(session.turnOrder[0]);
    });

    it('exposes the round play order for display (rotation from the start player)', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      session.turnOrder = [3, 1, 0, 2];
      session.roundStartPlayer = 1;
      expect(getRoundTurnOrder(session)).toEqual([1, 0, 2, 3]);
      session.roundStartPlayer = 3;
      expect(getRoundTurnOrder(session)).toEqual([3, 1, 0, 2]);
    });
  });

  describe('turn rotation through the turn order', () => {
    it('rotates turns through a non-identity turn order, wrapping around', () => {
      const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
      // Force a specific non-identity order: player 2 leads, then 0, then 1.
      session.turnOrder = [2, 0, 1];
      session.roundStartPlayer = 2;
      session.currentTurnIndex = -1;

      expect(getCurrentPlayerIndex(session)).toBe(2);
      executeAction(session, 2, { type: 'place', rowIndex: 0 });
      expect(getCurrentPlayerIndex(session)).toBe(0);
      executeAction(session, 0, { type: 'place', rowIndex: 1 });
      expect(getCurrentPlayerIndex(session)).toBe(1);
      executeAction(session, 1, { type: 'place', rowIndex: 2 });
      expect(getCurrentPlayerIndex(session)).toBe(2); // wraps around
      executeAction(session, 2, { type: 'place', rowIndex: 0 });
      expect(getCurrentPlayerIndex(session)).toBe(0);
      executeAction(session, 0, { type: 'place', rowIndex: 1 });
      expect(getCurrentPlayerIndex(session)).toBe(1);

      // Player 1 takes a row on their own turn and sits out; play skips them.
      executeAction(session, 1, { type: 'take', rowIndex: 2 });
      expect(session.players[1].roundState).toBe('taken-row');
      expect(getCurrentPlayerIndex(session)).toBe(2);
      executeAction(session, 2, { type: 'place', rowIndex: 0 });
      expect(getCurrentPlayerIndex(session)).toBe(0);
      executeAction(session, 0, { type: 'place', rowIndex: 1 });
      expect(getCurrentPlayerIndex(session)).toBe(2); // player 1 skipped
    });
  });

  describe('per-round start player rules', () => {
    it('starts the next round with the player who took the most cards', () => {
      const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Deck pops last-element-first: 7 places draw c7..c1 in order.
      session.deck = [
        ch('red', 1, 1), ch('blue', 1, 2), ch('green', 1, 3),
        ch('yellow', 1, 4), ch('purple', 1, 5), ch('orange', 1, 6), ch('brown', 1, 7),
      ];
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 2, { type: 'place', rowIndex: 2 });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 2, { type: 'place', rowIndex: 2 });
      // Player 0 and 1 each take a 2-card row; player 2 places one more
      // card (3 in row 2) and then takes a 3-card row.
      executeAction(session, 0, { type: 'take', rowIndex: 0 });
      executeAction(session, 1, { type: 'take', rowIndex: 1 });
      executeAction(session, 2, { type: 'place', rowIndex: 2 });
      executeAction(session, 2, { type: 'take', rowIndex: 2 });
      expect(isRoundOver(session)).toBe(true);

      beginRoundScoring(session);
      const result = scoreRound(session);
      expect(result.isLastRound).toBe(false);
      // Player 2 took 3 cards vs 2 each for players 0 and 1.
      expect(session.roundStartPlayer).toBe(2);
      expect(session.currentRound).toBe(1);
      expect(getCurrentPlayerIndex(session)).toBe(2);
    });

    it('breaks a tie by the tied player who most recently took a row', () => {
      const session = setupColorettoGame({ playerCount: 3, rng: makeRng() });
      forceIdentityTurnOrder(session);
      session.deck = [
        ch('red', 1, 1), ch('blue', 1, 2), ch('green', 1, 3),
        ch('yellow', 1, 4), ch('purple', 1, 5), ch('orange', 1, 6),
      ];
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 2, { type: 'place', rowIndex: 2 });
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      executeAction(session, 2, { type: 'place', rowIndex: 2 });
      // Everyone takes exactly 2 cards; row-take sequence is [0, 1, 2].
      executeAction(session, 0, { type: 'take', rowIndex: 0 });
      executeAction(session, 1, { type: 'take', rowIndex: 1 });
      executeAction(session, 2, { type: 'take', rowIndex: 2 });
      expect(isRoundOver(session)).toBe(true);

      beginRoundScoring(session);
      scoreRound(session);
      // Tie at 2 cards each; player 2 took a row most recently.
      expect(session.roundStartPlayer).toBe(2);
    });

    it('falls back to the first randomized player when nobody took a row', () => {
      const session = setupColorettoGame({ playerCount: 2, rng: makeRng() });
      forceIdentityTurnOrder(session);
      // The Last Round card is drawn on the first placement; each player
      // gets exactly one (placing) final turn and nobody ever takes a row.
      session.deck = [ch('red', 1, 1), ch('blue', 1, 2), { id: 42, type: 'last-round' }];
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      executeAction(session, 1, { type: 'place', rowIndex: 1 });
      expect(isRoundOver(session)).toBe(true);
      expect(session.players.every((p) => p.roundState !== 'active')).toBe(true);

      beginRoundScoring(session);
      scoreRound(session);
      // Nobody took a row: fall back to the first player in turnOrder (0).
      expect(session.roundStartPlayer).toBe(0);
    });
  });
});
