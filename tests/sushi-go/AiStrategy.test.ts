/**
 * Tests for Sushi Go! AI strategies.
 */

import { describe, it, expect } from 'vitest';
import {
  RandomStrategy,
  GreedyStrategy,
  SushiGoAiPlayer,
} from '../../example-games/sushi-go/AiStrategy';
import type { SushiGoCard } from '../../example-games/sushi-go/SushiGoCards';
import type { SushiGoPlayerState } from '../../example-games/sushi-go/SushiGoGame';

// ── Helpers ──────────────────────────────────────────────────

let nextId = 2000;
function tempura(): SushiGoCard {
  return { id: nextId++, type: 'tempura' } as SushiGoCard;
}
function sashimi(): SushiGoCard {
  return { id: nextId++, type: 'sashimi' } as SushiGoCard;
}
function nigiri(variant: 'egg' | 'salmon' | 'squid'): SushiGoCard {
  return { id: nextId++, type: 'nigiri', variant } as SushiGoCard;
}
function wasabi(): SushiGoCard {
  return { id: nextId++, type: 'wasabi' } as SushiGoCard;
}

function makeRng(seed: number = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('SushiGoAiStrategy', () => {
  describe('RandomStrategy', () => {
    it('picks a valid card index', () => {
      const hand: SushiGoCard[] = [tempura(), sashimi(), nigiri('egg')];
      const action = RandomStrategy.choosePick(hand, [], makeRng());
      expect(action.cardIndex).toBeGreaterThanOrEqual(0);
      expect(action.cardIndex).toBeLessThan(hand.length);
    });

    it('does not use chopsticks', () => {
      const hand: SushiGoCard[] = [tempura(), sashimi()];
      const action = RandomStrategy.choosePick(hand, [], makeRng());
      expect(action.secondCardIndex).toBeUndefined();
    });

    it('always picks within bounds', () => {
      const hand: SushiGoCard[] = [tempura()];
      // Run multiple times with different RNG seeds
      for (let seed = 0; seed < 20; seed++) {
        const action = RandomStrategy.choosePick(hand, [], makeRng(seed + 1));
        expect(action.cardIndex).toBe(0);
      }
    });
  });

  describe('GreedyStrategy', () => {
    it('picks the card with highest marginal value', () => {
      // Tableau has 1 tempura; hand has tempura (completes pair=5pts) and sashimi (0pts alone)
      const hand: SushiGoCard[] = [tempura(), sashimi()];
      const tableau: SushiGoCard[] = [tempura()];

      const action = GreedyStrategy.choosePick(hand, tableau, makeRng());
      // Should pick tempura (index 0) to complete the pair
      expect(action.cardIndex).toBe(0);
    });

    it('prefers high-value nigiri over low', () => {
      const hand: SushiGoCard[] = [nigiri('egg'), nigiri('squid')];
      const action = GreedyStrategy.choosePick(hand, [], makeRng());
      // Squid (3pts) > Egg (1pt), so should pick index 1
      expect(action.cardIndex).toBe(1);
    });

    it('prefers nigiri when wasabi is in tableau', () => {
      const hand: SushiGoCard[] = [tempura(), nigiri('squid')];
      const tableau: SushiGoCard[] = [wasabi()];

      const action = GreedyStrategy.choosePick(hand, tableau, makeRng());
      // Squid + wasabi = 9pts vs tempura alone = 0pts
      expect(action.cardIndex).toBe(1);
    });

    it('throws on empty hand', () => {
      expect(() =>
        GreedyStrategy.choosePick([], [], makeRng()),
      ).toThrow();
    });
  });

  describe('SushiGoAiPlayer', () => {
    it('wraps a strategy and returns valid picks', () => {
      const ai = new SushiGoAiPlayer(RandomStrategy, makeRng());
      const player: SushiGoPlayerState = {
        name: 'AI',
        isAI: true,
        hand: [tempura(), sashimi(), nigiri('egg')],
        tableau: [],
        puddingCount: 0,
        roundScores: [],
        totalScore: 0,
      };

      const pick = ai.choosePick(player);
      expect(pick.cardIndex).toBeGreaterThanOrEqual(0);
      expect(pick.cardIndex).toBeLessThan(3);
    });

    it('defaults to GreedyStrategy', () => {
      const ai = new SushiGoAiPlayer();
      expect(ai.strategy.name).toBe('greedy');
    });
  });
});
