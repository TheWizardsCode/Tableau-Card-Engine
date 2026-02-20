/**
 * Tests for SushiGoGame -- game orchestration, drafting, and round flow.
 */

import { describe, it, expect } from 'vitest';
import {
  setupSushiGoGame,
  executeAllPicks,
  scoreRound,
  isGameOver,
  getWinnerIndex,
  isRoundPickingDone,
  validatePick,
} from '../../example-games/sushi-go/SushiGoGame';
import type {
  SushiGoPlayerState,
} from '../../example-games/sushi-go/SushiGoGame';

// Deterministic RNG for reproducible tests
function makeRng(seed: number = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('SushiGoGame', () => {
  describe('setupSushiGoGame', () => {
    it('creates a 2-player game with 10 cards each', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      expect(session.players).toHaveLength(2);
      expect(session.players[0].hand).toHaveLength(10);
      expect(session.players[1].hand).toHaveLength(10);
      expect(session.phase).toBe('picking');
      expect(session.currentRound).toBe(0);
      expect(session.currentTurn).toBe(0);
    });

    it('sets player names and AI flags correctly', () => {
      const session = setupSushiGoGame({
        playerNames: ['Alice', 'Bob'],
        isAI: [false, true],
        rng: makeRng(),
      });

      expect(session.players[0].name).toBe('Alice');
      expect(session.players[0].isAI).toBe(false);
      expect(session.players[1].name).toBe('Bob');
      expect(session.players[1].isAI).toBe(true);
    });

    it('initializes empty tableaux and zero scores', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      for (const player of session.players) {
        expect(player.tableau).toHaveLength(0);
        expect(player.puddingCount).toBe(0);
        expect(player.roundScores).toHaveLength(0);
        expect(player.totalScore).toBe(0);
      }
    });
  });

  describe('validatePick', () => {
    it('accepts valid card index', () => {
      const player: SushiGoPlayerState = {
        name: 'Test',
        isAI: false,
        hand: [
          { id: 0, type: 'tempura' },
          { id: 1, type: 'sashimi' },
        ] as any[],
        tableau: [],
        puddingCount: 0,
        roundScores: [],
        totalScore: 0,
      };

      expect(validatePick(player, { cardIndex: 0 })).toEqual({ valid: true });
      expect(validatePick(player, { cardIndex: 1 })).toEqual({ valid: true });
    });

    it('rejects out-of-bounds card index', () => {
      const player: SushiGoPlayerState = {
        name: 'Test',
        isAI: false,
        hand: [{ id: 0, type: 'tempura' }] as any[],
        tableau: [],
        puddingCount: 0,
        roundScores: [],
        totalScore: 0,
      };

      const result = validatePick(player, { cardIndex: 5 });
      expect(result.valid).toBe(false);
    });

    it('rejects chopsticks usage without chopsticks in tableau', () => {
      const player: SushiGoPlayerState = {
        name: 'Test',
        isAI: false,
        hand: [
          { id: 0, type: 'tempura' },
          { id: 1, type: 'sashimi' },
        ] as any[],
        tableau: [],
        puddingCount: 0,
        roundScores: [],
        totalScore: 0,
      };

      const result = validatePick(player, {
        cardIndex: 0,
        secondCardIndex: 1,
      });
      expect(result.valid).toBe(false);
    });

    it('accepts chopsticks usage with chopsticks in tableau', () => {
      const player: SushiGoPlayerState = {
        name: 'Test',
        isAI: false,
        hand: [
          { id: 0, type: 'tempura' },
          { id: 1, type: 'sashimi' },
        ] as any[],
        tableau: [{ id: 2, type: 'chopsticks' }] as any[],
        puddingCount: 0,
        roundScores: [],
        totalScore: 0,
      };

      const result = validatePick(player, {
        cardIndex: 0,
        secondCardIndex: 1,
      });
      expect(result).toEqual({ valid: true });
    });

    it('rejects picking the same card twice', () => {
      const player: SushiGoPlayerState = {
        name: 'Test',
        isAI: false,
        hand: [
          { id: 0, type: 'tempura' },
          { id: 1, type: 'sashimi' },
        ] as any[],
        tableau: [{ id: 2, type: 'chopsticks' }] as any[],
        puddingCount: 0,
        roundScores: [],
        totalScore: 0,
      };

      const result = validatePick(player, {
        cardIndex: 0,
        secondCardIndex: 0,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('executeAllPicks', () => {
    it('moves picked cards from hand to tableau', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      const hand0Before = [...session.players[0].hand];
      const hand1Before = [...session.players[1].hand];

      executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);

      // Each player should have 1 card in tableau
      expect(session.players[0].tableau).toHaveLength(1);
      expect(session.players[1].tableau).toHaveLength(1);

      // Picked cards should match original hand[0]
      expect(session.players[0].tableau[0]).toBe(hand0Before[0]);
      expect(session.players[1].tableau[0]).toBe(hand1Before[0]);
    });

    it('advances the turn counter', () => {
      const session = setupSushiGoGame({ rng: makeRng() });
      expect(session.currentTurn).toBe(0);

      executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);
      expect(session.currentTurn).toBe(1);
    });

    it('passes hands after each pick', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      // After first pick, hands should swap (2 players)
      const hand0BeforePick = [...session.players[0].hand];
      const hand1BeforePick = [...session.players[1].hand];

      executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);

      // After pick + pass: player 0 now has player 1's remaining hand
      // and player 1 has player 0's remaining hand
      // Player 0 picked hand0[0], so hand0 remaining = hand0[1..9]
      // Player 1 picked hand1[0], so hand1 remaining = hand1[1..9]
      // After swap: p0 gets hand1[1..9], p1 gets hand0[1..9]
      expect(session.players[0].hand).toEqual(hand1BeforePick.slice(1));
      expect(session.players[1].hand).toEqual(hand0BeforePick.slice(1));
    });

    it('transitions to round-scoring when all cards picked', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      // Play all 10 turns
      for (let turn = 0; turn < 10; turn++) {
        executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);
      }

      expect(session.phase).toBe('round-scoring');
      expect(session.players[0].tableau).toHaveLength(10);
      expect(session.players[1].tableau).toHaveLength(10);
      expect(session.players[0].hand).toHaveLength(0);
      expect(session.players[1].hand).toHaveLength(0);
    });

    it('throws if phase is not picking', () => {
      const session = setupSushiGoGame({ rng: makeRng() });
      session.phase = 'game-over';

      expect(() =>
        executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]),
      ).toThrow();
    });

    it('throws if wrong number of picks', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      expect(() => executeAllPicks(session, [{ cardIndex: 0 }])).toThrow();
    });
  });

  describe('chopsticks usage', () => {
    it('picks two cards and returns chopsticks to hand', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      // Manually place chopsticks in player 0's tableau
      session.players[0].tableau = [
        { id: 999, type: 'chopsticks' } as any,
      ];

      executeAllPicks(session, [
        { cardIndex: 0, secondCardIndex: 1 },
        { cardIndex: 0 },
      ]);

      // Player 0 should now have 2 more cards in tableau (3 total, 2 picked + original minus chopsticks returned)
      // Original tableau had 1 chopsticks, picked 2 cards, returned chopsticks
      // So tableau now has 2 cards (chopsticks was removed and put in hand)
      expect(session.players[0].tableau).toHaveLength(2);

      // Chopsticks should have been removed from tableau
      expect(
        session.players[0].tableau.find((c) => c.type === 'chopsticks'),
      ).toBeUndefined();
    });
  });

  describe('scoreRound', () => {
    it('scores round and advances to next round', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      // Play through all picks
      for (let turn = 0; turn < 10; turn++) {
        executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);
      }

      expect(session.phase).toBe('round-scoring');

      const result = scoreRound(session);

      expect(result.round).toBe(0);
      expect(result.roundScores).toHaveLength(2);
      expect(result.tableauScores).toHaveLength(2);
      expect(result.makiCounts).toHaveLength(2);
      expect(result.makiBonuses).toHaveLength(2);

      // Should have advanced to next round
      expect(session.currentRound).toBe(1);
      expect(session.phase).toBe('picking');

      // Players should have recorded round scores
      expect(session.players[0].roundScores).toHaveLength(1);
      expect(session.players[1].roundScores).toHaveLength(1);
    });

    it('ends game after round 3 with pudding scoring', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      // Play all 3 rounds
      for (let round = 0; round < 3; round++) {
        for (let turn = 0; turn < 10; turn++) {
          executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);
        }
        const result = scoreRound(session);

        if (round === 2) {
          // Final round should include pudding scoring
          expect(result.puddingCounts).toBeDefined();
          expect(result.puddingBonuses).toBeDefined();
        }
      }

      expect(session.phase).toBe('game-over');
      expect(isGameOver(session)).toBe(true);

      // Each player should have 3 round scores
      expect(session.players[0].roundScores).toHaveLength(3);
      expect(session.players[1].roundScores).toHaveLength(3);
    });

    it('throws if phase is not round-scoring', () => {
      const session = setupSushiGoGame({ rng: makeRng() });
      expect(() => scoreRound(session)).toThrow();
    });
  });

  describe('full game flow', () => {
    it('completes a full 3-round game', () => {
      const session = setupSushiGoGame({ rng: makeRng() });

      for (let round = 0; round < 3; round++) {
        expect(session.phase).toBe('picking');
        expect(session.currentRound).toBe(round);

        // Play all turns in the round
        for (let turn = 0; turn < 10; turn++) {
          executeAllPicks(session, [{ cardIndex: 0 }, { cardIndex: 0 }]);
        }

        expect(isRoundPickingDone(session)).toBe(true);
        scoreRound(session);
      }

      expect(isGameOver(session)).toBe(true);

      const winner = getWinnerIndex(session);
      expect(winner).toBeGreaterThanOrEqual(0);
      expect(winner).toBeLessThan(2);
    });
  });

  describe('getWinnerIndex', () => {
    it('returns player with highest total score', () => {
      const session = setupSushiGoGame({ rng: makeRng() });
      session.players[0].totalScore = 50;
      session.players[1].totalScore = 30;

      expect(getWinnerIndex(session)).toBe(0);
    });

    it('returns first player on tie', () => {
      const session = setupSushiGoGame({ rng: makeRng() });
      session.players[0].totalScore = 30;
      session.players[1].totalScore = 30;

      expect(getWinnerIndex(session)).toBe(0);
    });
  });
});
