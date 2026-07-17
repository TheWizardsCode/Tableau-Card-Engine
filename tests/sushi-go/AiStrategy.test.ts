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
function chopsticks(): SushiGoCard {
  return { id: nextId++, type: 'chopsticks' } as SushiGoCard;
}
function dumpling(): SushiGoCard {
  return { id: nextId++, type: 'dumpling' } as SushiGoCard;
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

    it('does not use chopsticks when none in tableau', () => {
      const hand: SushiGoCard[] = [tempura(), sashimi()];
      const action = RandomStrategy.choosePick(hand, [], makeRng());
      expect(action.secondCardIndex).toBeUndefined();
    });

    it('sometimes uses chopsticks when available', () => {
      // Run with multiple seeds to verify it sometimes uses chopsticks
      let usedChopsticks = false;
      let skippedChopsticks = false;
      const hand: SushiGoCard[] = [tempura(), sashimi(), nigiri('egg')];
      const tableau: SushiGoCard[] = [chopsticks()];

      for (let seed = 1; seed < 100; seed++) {
        const action = RandomStrategy.choosePick(hand, tableau, makeRng(seed));
        if (action.secondCardIndex !== undefined) {
          usedChopsticks = true;
          // Verify second card is different from first
          expect(action.secondCardIndex).not.toBe(action.cardIndex);
        } else {
          skippedChopsticks = true;
        }
        if (usedChopsticks && skippedChopsticks) break;
      }

      expect(usedChopsticks).toBe(true);
      expect(skippedChopsticks).toBe(true);
    });

    it('does not use chopsticks with only 1 card in hand', () => {
      const hand: SushiGoCard[] = [tempura()];
      const tableau: SushiGoCard[] = [chopsticks()];
      for (let seed = 1; seed < 20; seed++) {
        const action = RandomStrategy.choosePick(hand, tableau, makeRng(seed));
        expect(action.secondCardIndex).toBeUndefined();
      }
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

    it('uses chopsticks when a pair scores higher than a single card', () => {
      // Tableau has chopsticks + 1 tempura. Hand has tempura (completes pair = 5pts) and sashimi.
      // Single best: tempura = +5 pts
      // Pair (tempura + sashimi): adds both, but chopsticks is removed from tableau.
      // Since chopsticks scores 0 anyway, pair marginal = tempura(5) + sashimi(0) = 5
      // That's equal, not better. Let's use a scenario where pair is strictly better.
      //
      // Better scenario: tableau has chopsticks + 1 tempura + 2 sashimi.
      // Hand has [tempura, sashimi, dumpling].
      // Single best: sashimi completes set of 3 = +10. tempura completes pair = +5.
      // Pair (tempura + sashimi): +10 + 5 = +15 -- strictly better than any single (+10).
      const hand: SushiGoCard[] = [tempura(), sashimi(), dumpling()];
      const tableau: SushiGoCard[] = [
        chopsticks(),
        tempura(),
        sashimi(),
        sashimi(),
      ];

      const action = GreedyStrategy.choosePick(hand, tableau, makeRng());
      expect(action.secondCardIndex).toBeDefined();

      // Should pick tempura (index 0) and sashimi (index 1)
      const indices = [action.cardIndex, action.secondCardIndex!].sort();
      expect(indices).toEqual([0, 1]);
    });

    it('does not use chopsticks when single card is equally good', () => {
      // Tableau has chopsticks + 1 tempura. Hand has [tempura, dumpling].
      // Single best: tempura = +5 (completes pair)
      // Pair (tempura + dumpling): +5 + 1 = +6... actually that IS strictly better.
      // Let's use: tableau has chopsticks. Hand has [dumpling, dumpling].
      // Single best: dumpling = +1
      // Pair: 2 dumplings = +3. That's better.
      //
      // For equal case: tableau has chopsticks. Hand has [nigiri egg, nigiri egg].
      // Single: egg = +1
      // Pair: two eggs = +2. That's better too.
      //
      // Actually with 2 cards it's almost always better to take 2.
      // For NOT using chopsticks: the benefit of the pair must not exceed the single.
      // This would happen when both cards in hand are worth 0 individually and 0 together.
      // E.g., tableau has chopsticks + 1 wasabi. Hand has [wasabi, wasabi, squid nigiri].
      // Single best: squid on wasabi = +9 (wasabi triples it from 3 to 9)
      // Pair (wasabi + squid): chopsticks removed, tableau has 1 wasabi + new wasabi + squid.
      //   Score: squid paired with first wasabi = 9, second wasabi unpaired = 0. Total = 9
      //   Base without chopsticks = 0 (just wasabi).  Marginal = 9.
      // Pair (wasabi + wasabi): both wasabi, no nigiri = 0 marginal.
      // So single best (squid) = 9, best pair (wasabi+squid) = 9. Equal, so no chopsticks.
      const hand: SushiGoCard[] = [wasabi(), wasabi(), nigiri('squid')];
      const tableau: SushiGoCard[] = [chopsticks(), wasabi()];

      const action = GreedyStrategy.choosePick(hand, tableau, makeRng());
      // Best single is squid nigiri (+9), best pair is also +9, so should NOT use chopsticks
      expect(action.secondCardIndex).toBeUndefined();
      // Should pick squid nigiri (index 2)
      expect(action.cardIndex).toBe(2);
    });

    it('does not use chopsticks when not in tableau', () => {
      const hand: SushiGoCard[] = [tempura(), sashimi()];
      const tableau: SushiGoCard[] = [tempura()];

      const action = GreedyStrategy.choosePick(hand, tableau, makeRng());
      expect(action.secondCardIndex).toBeUndefined();
    });

    it('correctly simulates removing chopsticks from tableau when evaluating pairs', () => {
      // Tableau has [chopsticks, wasabi]. Hand has [squid nigiri, egg nigiri, tempura].
      // When using chopsticks: chopsticks is removed from tableau, so base is [wasabi].
      // Pair (squid + egg): wasabi pairs with squid (9), egg is alone (1) = 10. Marginal = 10.
      // Single best: squid on wasabi = 9 (marginal from tableau [chopsticks, wasabi] where chopsticks=0, wasabi=0, +squid paired = 9).
      // Pair is strictly better (10 > 9), so should use chopsticks.
      const hand: SushiGoCard[] = [nigiri('squid'), nigiri('egg'), tempura()];
      const tableau: SushiGoCard[] = [chopsticks(), wasabi()];

      const action = GreedyStrategy.choosePick(hand, tableau, makeRng());
      expect(action.secondCardIndex).toBeDefined();

      // Should pick squid (0) and egg (1) for max score
      const indices = [action.cardIndex, action.secondCardIndex!].sort();
      expect(indices).toEqual([0, 1]);
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
