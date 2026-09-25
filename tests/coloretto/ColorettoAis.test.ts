/**
 * Tests for ColorettoAis -- random and heuristic strategies.
 *
 * Covers acceptance criteria:
 *   - Random strategy produces uniformly legal moves.
 *   - Heuristic prefers rows containing colors already in the
 *     player's collection and avoids giving strong rows to opponents.
 *   - Deterministic behaviour: same state + same seed = same action.
 */

import { describe, it, expect } from 'vitest';
import { createSeededRng } from '@core-engine';
import {
  RandomStrategy,
  HeuristicStrategy,
  ColorettoAiPlayer,
  marginalGain,
  netRowValue,
  wholeRowValue,
} from '../../example-games/coloretto/ColorettoAis';
import {
  setupColorettoGame,
  legalActions,
  executeAction,
  getCurrentPlayerIndex,
  scoreRound,
  beginRoundScoring,
} from '../../example-games/coloretto/ColorettoGame';
import type { ColorettoSession } from '../../example-games/coloretto/ColorettoGame';
import type { ChameleonColor, ColorettoCard } from '../../example-games/coloretto/ColorettoCards';

function makeRng(seed: number = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function ch(color: ChameleonColor, count: 1 | 2, id: number): ColorettoCard {
  return { id, type: 'chameleon', color, count };
}

/**
 * Force identity turn order (players act in array order, player 0 first)
 * for tests that hardcode player indices. The game randomizes turn order
 * at setup; these tests opt into an explicit order instead.
 */
function forceIdentityTurnOrder(session: ColorettoSession): void {
  session.turnOrder = session.players.map((_, i) => i);
  session.roundStartPlayer = 0;
  session.currentTurnIndex = -1;
}

/** Run a full game (all rounds) with the given strategy for all AI players. */
function playGame(strategy: 'random' | 'heuristic', playerCount = 3, seed = 7): number {
  const session = setupColorettoGame({ playerCount, rng: makeRng(seed) });
  const ais = session.players.map(() =>
    strategy === 'random'
      ? new ColorettoAiPlayer(RandomStrategy, makeRng(seed))
      : new ColorettoAiPlayer(HeuristicStrategy, makeRng(seed)),
  );

  let rounds = 0;
  while (session.phase !== 'game-over' && rounds < 20) {
    let guard = 0;
    while (!isRoundOverFor(session) && guard < 100) {
      const idx = getCurrentPlayerIndex(session);
      const action = ais[idx].chooseAction(session, idx);
      expect(legalActions(session, idx)).toContainEqual(action);
      executeAction(session, idx, action);
      guard++;
    }
    if (isRoundOverFor(session)) {
      beginRoundScoring(session);
      scoreRound(session);
      rounds++;
    }
  }
  return rounds;
}

// Small local helper to avoid importing game internals into expectations.
function isRoundOverFor(session: ColorettoSession): boolean {
  return session.players.every((p) => p.roundState !== 'active');
}

describe('ColorettoAis', () => {
  describe('RandomStrategy', () => {
    it('always returns a legal action', () => {
      const session = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      forceIdentityTurnOrder(session);
      for (let i = 0; i < 50; i++) {
        const action = RandomStrategy.chooseAction(session, 0, createSeededRng(i));
        expect(legalActions(session, 0)).toContainEqual(action);
      }
    });

    it('can produce both place and take actions when both are legal', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      executeAction(session, 0, { type: 'place', rowIndex: 0 });
      const seen = new Set<string>();
      for (let i = 1; i <= 50; i++) {
        const action = RandomStrategy.chooseAction(session, 1, createSeededRng(i));
        expect(legalActions(session, 1)).toContainEqual(action);
        seen.add(action.type);
        if (seen.has('place') && seen.has('take')) break;
      }
      expect(seen.has('place')).toBe(true);
      expect(seen.has('take')).toBe(true);
    });

    it('throws when no legal actions exist', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Not player 1's turn → no legal actions for them.
      expect(() => RandomStrategy.chooseAction(session, 1, makeRng())).toThrow();
    });
  });

  describe('marginalGain', () => {
    it('gains more for colors already in the collection', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player has 2 red already.
      session.players[0].collection = [ch('red', 2, 0)];
      // Adding a single red: 3 red = 6 vs 2 red = 3 → +3
      expect(marginalGain(session, 0, ch('red', 1, 1))).toBe(3);
      // Adding a single blue (new color): 1 blue = 1 → +1
      expect(marginalGain(session, 0, ch('blue', 1, 2))).toBe(1);
    });

    it('counts the Last Round card as zero gain', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(marginalGain(session, 0, { id: 42, type: 'last-round' })).toBe(0);
    });

    it('values a bonus card at its flat +2 points', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      expect(marginalGain(session, 0, { id: 44, type: 'bonus' })).toBe(2);
    });

    it('values a joker at its best wild gain across colors', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player already has 2 red: a red single is worth +3 (3 red = 6 vs 2 = 3);
      // a new color is worth +1. The joker's wild value is the max = 3.
      session.players[0].collection = [ch('red', 2, 0)];
      expect(marginalGain(session, 0, { id: 43, type: 'joker' })).toBe(3);
    });
  });

  describe('wholeRowValue', () => {
    it('values a row of 3 same-colour singles at 6 (not 3)', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player has no collection (round-1 scenario).
      session.players[0].collection = [];
      // Row of 3 red singles: 3 red = 6 points.
      session.rows[0].cards = [ch('red', 1, 1), ch('red', 1, 2), ch('red', 1, 3)];
      expect(wholeRowValue(session, 0, 0)).toBe(6);
    });

    it('accounts for combined value when the player already holds cards of that colour', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player has 4 red: 4 red = 10 points.
      session.players[0].collection = [ch('red', 2, 0), ch('red', 2, 1)];
      // Row of 3 red singles: 4+3 = 7 red = 21 points → gain of 11.
      // (Canonical table read: a naive per-card sum would give only 3.)
      session.rows[0].cards = [ch('red', 1, 2), ch('red', 1, 3), ch('red', 1, 4)];
      expect(wholeRowValue(session, 0, 0)).toBe(11);
    });

    it('values the row at 12 when the player holds 2 of that colour', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player has 2 red: 2 red = 3 points.
      session.players[0].collection = [ch('red', 2, 0)];
      // Row of 3 red singles: 2+3 = 5 red = 15 points → gain of 12.
      session.rows[0].cards = [ch('red', 1, 2), ch('red', 1, 3), ch('red', 1, 4)];
      expect(wholeRowValue(session, 0, 0)).toBe(12);
    });

    it('values mixed-colour rows as the sum of per-colour combined gains', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player has no collection.
      session.players[0].collection = [];
      // Row: 2 red + 1 blue → 2 red = 3, 1 blue = 1 → total 4.
      session.rows[0].cards = [ch('red', 2, 1), ch('blue', 1, 2)];
      expect(wholeRowValue(session, 0, 0)).toBe(4);
    });
  });

  describe('netRowValue', () => {
    it('is positive when a row benefits the player more than opponents', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      // Player has 2 red; opponents have none.
      session.players[0].collection = [ch('red', 2, 0)];
      session.rows[0].cards = [ch('red', 1, 1)];
      // My gain +3; opponents gain +1 each → net 2.
      expect(netRowValue(session, 0, 0)).toBe(2);
    });

    it('is negative when a row would give opponents more than me', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      session.players[1].collection = [ch('blue', 2, 0)];
      session.rows[0].cards = [ch('blue', 1, 1)];
      // My gain +1; opponent 1 gain +3 → net -2.
      expect(netRowValue(session, 0, 0)).toBe(-2);
    });
  });

  describe('HeuristicStrategy', () => {
    it('takes a row whose net value meets the threshold', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      session.players[0].collection = [ch('red', 2, 0), ch('red', 2, 1)]; // 4 red
      session.rows[0].cards = [ch('red', 1, 2)]; // my gain: 5 red=15 vs 4 red=10 → +5
      // Opponents gain only +1 → net 4 ≥ 2 → take.
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action).toEqual({ type: 'take', rowIndex: 0 });
    });

    it('places when no row meets the take threshold', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Empty rows and no collection: every take is illegal; must place.
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action.type).toBe('place');
    });

    it('places on the collection-friendly row when no take meets the threshold', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Player 0 collects red; opponent 1 collects blue.
      session.players[0].collection = [ch('red', 1, 0)];
      session.players[1].collection = [ch('blue', 2, 1)];
      // Top card of the deck is a red single.
      session.deck = [ch('red', 1, 10), ch('blue', 1, 9)];
      // Row 0 is a green single: player 0 holds no green (combined gain 1
      // < threshold), and opponent 1 gains only +1 from it.
      session.rows[0].cards = [ch('green', 1, 2)];
      // Rows 1 and 2 are blue singles: player 0 holds no blue (combined
      // gain 1 < threshold), but opponent 1 already holds 2 blue, so a blue
      // single is worth +3 to them.
      session.rows[1].cards = [ch('blue', 1, 3)];
      session.rows[2].cards = [ch('blue', 1, 4)];

      // No row meets the take threshold (combined gain = 1 each).
      // Placing red on row 0: my gain 1+2=3, opp gain 1+1=2 → net +1.
      // Placing red on rows 1/2: my gain 1+2=3, opp gain 3+1=4 → net −1.
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action.type).toBe('place');
      expect(action.rowIndex).toBe(0);
    });

    it('avoids placing on rows that are strong for opponents', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Opponent 1 has 2 blue: a blue single is worth +3 to them.
      session.players[0].collection = [ch('red', 1, 0)];
      session.players[1].collection = [ch('blue', 2, 1)];
      // Top card of the deck is a red single.
      session.deck = [ch('red', 1, 10), ch('blue', 1, 9)];
      // Row 0 is a green single (player doesn't hold green, combined gain = 1
      // < threshold; weak for opponent too).
      session.rows[0].cards = [ch('green', 1, 2)];
      // Row 1 is a blue single (weak for me, strong for the opponent).
      session.rows[1].cards = [ch('blue', 1, 3)];
      // Row 2 is another blue single (strong for the opponent).
      session.rows[2].cards = [ch('blue', 1, 4)];

      // Neither row meets the take threshold (combined gain = 1 each).
      // Row 0 is weak for the opponent; rows 1/2 are strong for the opponent.
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action.type).toBe('place');
      expect(action.rowIndex).toBe(0);
    });

    it('is deterministic with the same state and seed', () => {
      const session1 = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      const session2 = setupColorettoGame({ playerCount: 4, rng: makeRng() });
      forceIdentityTurnOrder(session1);
      forceIdentityTurnOrder(session2);
      const a1 = HeuristicStrategy.chooseAction(session1, 0, makeRng(123));
      const a2 = HeuristicStrategy.chooseAction(session2, 0, makeRng(123));
      expect(a1).toEqual(a2);
    });

    it('takes a row of 5 same-colour singles in round 1 with empty collections', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      // Round 1: all collections empty.
      session.players[0].collection = [];
      session.players[1].collection = [];
      // Row 0: 5 red singles → wholeRowValue = 15 (5 red = 15).
      session.rows[0].cards = [
        ch('red', 1, 1), ch('red', 1, 2), ch('red', 1, 3),
        ch('red', 1, 4), ch('red', 1, 5),
      ];
      // netRowValue = 0 (all players value identically), but wholeRowValue = 15.
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action).toEqual({ type: 'take', rowIndex: 0 });
    });

    it('does not take a row of 1 single in round 1 (below threshold)', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      session.players[0].collection = [];
      session.players[1].collection = [];
      // Row 0: 1 red single → wholeRowValue = 1, netRowValue = 0.
      session.rows[0].cards = [ch('red', 1, 1)];
      // Both values are below threshold → must place (not take).
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action.type).toBe('place');
    });

    it('takes a row of 3 same-colour singles in round 1 (combined value 6 ≥ threshold)', () => {
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      session.players[0].collection = [];
      session.players[1].collection = [];
      // Row 0: 3 red singles → wholeRowValue = 6.
      session.rows[0].cards = [ch('red', 1, 1), ch('red', 1, 2), ch('red', 1, 3)];
      const action = HeuristicStrategy.chooseAction(session, 0, makeRng());
      expect(action).toEqual({ type: 'take', rowIndex: 0 });
    });
  });

  describe('ColorettoAiPlayer', () => {
    it('binds a strategy and RNG', () => {
      const player = new ColorettoAiPlayer(RandomStrategy, makeRng(1));
      expect(player.strategyName).toBe('random');
      const session = setupColorettoGame({ rng: makeRng() });
      forceIdentityTurnOrder(session);
      const action = player.chooseAction(session, 0);
      expect(legalActions(session, 0)).toContainEqual(action);
    });

    it('defaults to the heuristic strategy', () => {
      const player = new ColorettoAiPlayer();
      expect(player.strategyName).toBe('heuristic');
    });
  });

  describe('full games', () => {
    it('plays a complete game with the heuristic strategy', () => {
      const rounds = playGame('heuristic', 3, 11);
      expect(rounds).toBe(5); // 3 players → 5 rounds
    });

    it('plays a complete game with the random strategy', () => {
      const rounds = playGame('random', 3, 13);
      expect(rounds).toBe(5);
    });

    it('plays a 5-player game without stalling', () => {
      const rounds = playGame('heuristic', 5, 17);
      expect(rounds).toBe(3);
    });
  });
});
