import { describe, it, expect } from 'vitest';
import {
  RandomStrategy,
  GreedyStrategy,
  SplendorAiPlayer,
} from '../../example-games/splendor/AiStrategy';
import {
  setupSplendorGame,
  executeTurn,
  discardTokens,
  validateAction,
  isGameOver,
  type SplendorSession,
} from '../../example-games/splendor/SplendorGame';
import {
  totalTokens,
} from '../../example-games/splendor/SplendorCards';

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function createTestSession(seed = 42): SplendorSession {
  return setupSplendorGame({
    playerCount: 2,
    playerNames: ['Human', 'AI'],
    isAI: [false, true],
    rng: makeRng(seed),
  });
}

describe('AiStrategy', () => {
  // -------------------------------------------------------------------------
  // RandomStrategy
  // -------------------------------------------------------------------------
  describe('RandomStrategy', () => {
    it('always picks a legal action', () => {
      const rng = makeRng(99);
      for (let seed = 0; seed < 10; seed++) {
        const session = createTestSession(seed);
        const action = RandomStrategy.chooseTurn(session, 0, rng);
        expect(validateAction(session, action)).toBeNull();
      }
    });

    it('throws when no legal actions available', () => {
      const session = createTestSession();
      session.phase = 'game-over';
      expect(() => RandomStrategy.chooseTurn(session, 0, makeRng(1))).toThrow();
    });

    it('chooseDiscard returns correct number of tokens', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        ruby: 3, emerald: 3, sapphire: 3, diamond: 3,
      }; // 12 tokens
      const discard = RandomStrategy.chooseDiscard(session, 0, 2, makeRng(42));
      expect(totalTokens(discard.tokens)).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // GreedyStrategy
  // -------------------------------------------------------------------------
  describe('GreedyStrategy', () => {
    it('always picks a legal action', () => {
      const rng = makeRng(99);
      for (let seed = 0; seed < 10; seed++) {
        const session = createTestSession(seed);
        const action = GreedyStrategy.chooseTurn(session, 0, rng);
        expect(validateAction(session, action)).toBeNull();
      }
    });

    it('prefers purchasing when a free card is available', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Add a free card to reserved
      player.reservedCards.push({
        id: 800, tier: 1, cost: {}, bonus: 'emerald', points: 1,
      });
      const action = GreedyStrategy.chooseTurn(session, 0, makeRng(42));
      expect(action.type).toBe('purchase');
    });

    it('prefers higher-point cards when multiple affordable', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Add two free cards to reserved
      player.reservedCards.push(
        { id: 800, tier: 1, cost: {}, bonus: 'emerald', points: 1 },
        { id: 801, tier: 2, cost: {}, bonus: 'ruby', points: 3 },
      );
      const action = GreedyStrategy.chooseTurn(session, 0, makeRng(42));
      expect(action.type).toBe('purchase');
      expect((action as any).cardId).toBe(801);
    });

    it('takes tokens when no purchases available', () => {
      const session = createTestSession();
      // Ensure no affordable cards
      const action = GreedyStrategy.chooseTurn(session, 0, makeRng(42));
      expect(
        action.type === 'take-different' || action.type === 'take-same' || action.type === 'reserve',
      ).toBe(true);
    });

    it('chooseDiscard returns correct number of tokens', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        ruby: 4, emerald: 3, sapphire: 3, diamond: 2,
      }; // 12 tokens
      const discard = GreedyStrategy.chooseDiscard(session, 0, 2, makeRng(42));
      expect(totalTokens(discard.tokens)).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // SplendorAiPlayer
  // -------------------------------------------------------------------------
  describe('SplendorAiPlayer', () => {
    it('defaults to greedy strategy', () => {
      const ai = new SplendorAiPlayer();
      expect(ai.strategyName).toBe('Greedy');
    });

    it('can use random strategy', () => {
      const ai = new SplendorAiPlayer(RandomStrategy);
      expect(ai.strategyName).toBe('Random');
    });

    it('chooseTurn returns a valid action', () => {
      const ai = new SplendorAiPlayer(GreedyStrategy, makeRng(42));
      const session = createTestSession();
      const action = ai.chooseTurn(session, 0);
      expect(validateAction(session, action)).toBeNull();
    });

    it('chooseDiscard returns valid discard', () => {
      const ai = new SplendorAiPlayer(GreedyStrategy, makeRng(42));
      const session = createTestSession();
      session.players[0].tokens = {
        ruby: 3, emerald: 3, sapphire: 3, diamond: 3,
      };
      const discard = ai.chooseDiscard(session, 0, 2);
      expect(totalTokens(discard.tokens)).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Full AI-vs-AI game
  // -------------------------------------------------------------------------
  describe('AI-vs-AI game', () => {
    it('completes a full game without errors', () => {
      const session = setupSplendorGame({
        playerCount: 2,
        playerNames: ['Greedy-1', 'Greedy-2'],
        isAI: [true, true],
        rng: makeRng(42),
      });

      const ai1 = new SplendorAiPlayer(GreedyStrategy, makeRng(100));
      const ai2 = new SplendorAiPlayer(GreedyStrategy, makeRng(200));
      const ais = [ai1, ai2];

      let turns = 0;
      const maxTurns = 500;

      while (!isGameOver(session) && turns < maxTurns) {
        const playerIdx = session.currentPlayerIndex;
        const ai = ais[playerIdx];

        const action = ai.chooseTurn(session, playerIdx);
        const result = executeTurn(session, action);

        if (result.tokensOverLimit > 0) {
          const discard = ai.chooseDiscard(session, playerIdx, result.tokensOverLimit);
          discardTokens(session, discard);
        }

        turns++;
      }

      expect(isGameOver(session)).toBe(true);
      expect(turns).toBeLessThan(maxTurns);
    });

    it('greedy AI finishes games faster than random AI', () => {
      function playGame(strategy1: typeof GreedyStrategy, strategy2: typeof GreedyStrategy, seed: number): number {
        const session = setupSplendorGame({
          playerCount: 2,
          isAI: [true, true],
          rng: makeRng(seed),
        });
        const ais = [
          new SplendorAiPlayer(strategy1, makeRng(seed + 1)),
          new SplendorAiPlayer(strategy2, makeRng(seed + 2)),
        ];
        let turns = 0;
        while (!isGameOver(session) && turns < 500) {
          const idx = session.currentPlayerIndex;
          const action = ais[idx].chooseTurn(session, idx);
          const result = executeTurn(session, action);
          if (result.tokensOverLimit > 0) {
            discardTokens(session, ais[idx].chooseDiscard(session, idx, result.tokensOverLimit));
          }
          turns++;
        }
        return turns;
      }

      // Average turns across several seeds
      let greedyTotal = 0;
      let randomTotal = 0;
      const trials = 5;
      for (let i = 0; i < trials; i++) {
        greedyTotal += playGame(GreedyStrategy, GreedyStrategy, i * 100);
        randomTotal += playGame(RandomStrategy, RandomStrategy, i * 100);
      }

      // Greedy games should generally finish in fewer turns
      expect(greedyTotal / trials).toBeLessThan(randomTotal / trials);
    });
  });
});
