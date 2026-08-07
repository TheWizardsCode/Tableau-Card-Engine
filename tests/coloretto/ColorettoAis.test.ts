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
import { createSeededRng } from '../../src/core-engine';
import {
  RandomStrategy,
  HeuristicStrategy,
  ColorettoAiPlayer,
  marginalGain,
  netRowValue,
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
      session.players[1].collection = [ch('blue', 1, 1)];
      // Top card of the deck is a red single.
      session.deck = [ch('blue', 1, 9), ch('red', 1, 10)];
      // Row 0 suits player 0 (red); row 1 suits opponent 1 (blue).
      session.rows[0].cards = [ch('red', 1, 2)];
      session.rows[1].cards = [ch('blue', 1, 3)];

      // No row meets the take threshold (net take values are 1 and -1).
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
      session.deck = [ch('blue', 1, 9), ch('red', 1, 10)];
      // Row 0 is a red single (good for me, weak for the opponent).
      session.rows[0].cards = [ch('red', 1, 2)];
      // Row 1 is a blue single (weak for me, strong for the opponent).
      session.rows[1].cards = [ch('blue', 1, 3)];

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
