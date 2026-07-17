/**
 * Tests for SushiGoScoring -- scoring logic for all card types.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreTableau,
  nigiriBaseValue,
  dumplingScore,
  scoreMaki,
  scorePudding,
  countMakiIcons,
  countPudding,
} from '../../example-games/sushi-go/SushiGoScoring';
import type { SushiGoCard } from '../../example-games/sushi-go/SushiGoCards';

// ── Helpers ──────────────────────────────────────────────────

let nextId = 1000;
function card(type: SushiGoCard['type'], extras?: Partial<SushiGoCard>): SushiGoCard {
  return { id: nextId++, type, ...extras } as SushiGoCard;
}
function tempura(): SushiGoCard {
  return card('tempura');
}
function sashimi(): SushiGoCard {
  return card('sashimi');
}
function dumpling(): SushiGoCard {
  return card('dumpling');
}
function maki(icons: 1 | 2 | 3): SushiGoCard {
  return { id: nextId++, type: 'maki', icons } as SushiGoCard;
}
function nigiri(variant: 'egg' | 'salmon' | 'squid'): SushiGoCard {
  return { id: nextId++, type: 'nigiri', variant } as SushiGoCard;
}
function wasabi(): SushiGoCard {
  return card('wasabi');
}
function pudding(): SushiGoCard {
  return card('pudding');
}
function chopsticks(): SushiGoCard {
  return card('chopsticks');
}

// ── Tests ────────────────────────────────────────────────────

describe('SushiGoScoring', () => {
  describe('nigiriBaseValue', () => {
    it('egg = 1', () => expect(nigiriBaseValue('egg')).toBe(1));
    it('salmon = 2', () => expect(nigiriBaseValue('salmon')).toBe(2));
    it('squid = 3', () => expect(nigiriBaseValue('squid')).toBe(3));
  });

  describe('dumplingScore', () => {
    it('0 dumplings = 0', () => expect(dumplingScore(0)).toBe(0));
    it('1 dumpling = 1', () => expect(dumplingScore(1)).toBe(1));
    it('2 dumplings = 3', () => expect(dumplingScore(2)).toBe(3));
    it('3 dumplings = 6', () => expect(dumplingScore(3)).toBe(6));
    it('4 dumplings = 10', () => expect(dumplingScore(4)).toBe(10));
    it('5 dumplings = 15', () => expect(dumplingScore(5)).toBe(15));
    it('6+ dumplings = 15 (capped)', () => expect(dumplingScore(6)).toBe(15));
    it('10 dumplings = 15 (capped)', () => expect(dumplingScore(10)).toBe(15));
  });

  describe('scoreTableau - tempura', () => {
    it('0 tempura = 0', () => {
      expect(scoreTableau([])).toBe(0);
    });

    it('1 tempura = 0 (incomplete pair)', () => {
      expect(scoreTableau([tempura()])).toBe(0);
    });

    it('2 tempura = 5', () => {
      expect(scoreTableau([tempura(), tempura()])).toBe(5);
    });

    it('3 tempura = 5 (one pair + one leftover)', () => {
      expect(scoreTableau([tempura(), tempura(), tempura()])).toBe(5);
    });

    it('4 tempura = 10', () => {
      expect(scoreTableau([tempura(), tempura(), tempura(), tempura()])).toBe(10);
    });
  });

  describe('scoreTableau - sashimi', () => {
    it('1 sashimi = 0', () => {
      expect(scoreTableau([sashimi()])).toBe(0);
    });

    it('2 sashimi = 0', () => {
      expect(scoreTableau([sashimi(), sashimi()])).toBe(0);
    });

    it('3 sashimi = 10', () => {
      expect(scoreTableau([sashimi(), sashimi(), sashimi()])).toBe(10);
    });

    it('4 sashimi = 10 (one set + one leftover)', () => {
      expect(scoreTableau([sashimi(), sashimi(), sashimi(), sashimi()])).toBe(10);
    });

    it('6 sashimi = 20', () => {
      const cards = Array.from({ length: 6 }, () => sashimi());
      expect(scoreTableau(cards)).toBe(20);
    });
  });

  describe('scoreTableau - dumpling', () => {
    it('1 dumpling = 1', () => {
      expect(scoreTableau([dumpling()])).toBe(1);
    });

    it('3 dumplings = 6', () => {
      expect(scoreTableau([dumpling(), dumpling(), dumpling()])).toBe(6);
    });

    it('5 dumplings = 15', () => {
      const cards = Array.from({ length: 5 }, () => dumpling());
      expect(scoreTableau(cards)).toBe(15);
    });
  });

  describe('scoreTableau - nigiri', () => {
    it('egg nigiri = 1', () => {
      expect(scoreTableau([nigiri('egg')])).toBe(1);
    });

    it('salmon nigiri = 2', () => {
      expect(scoreTableau([nigiri('salmon')])).toBe(2);
    });

    it('squid nigiri = 3', () => {
      expect(scoreTableau([nigiri('squid')])).toBe(3);
    });

    it('multiple nigiri sum normally', () => {
      expect(
        scoreTableau([nigiri('egg'), nigiri('salmon'), nigiri('squid')]),
      ).toBe(6);
    });
  });

  describe('scoreTableau - wasabi + nigiri', () => {
    it('wasabi then nigiri triples the nigiri', () => {
      // Wasabi played first, then squid nigiri (3 * 3 = 9)
      expect(scoreTableau([wasabi(), nigiri('squid')])).toBe(9);
    });

    it('wasabi then egg nigiri = 3', () => {
      expect(scoreTableau([wasabi(), nigiri('egg')])).toBe(3);
    });

    it('wasabi then salmon nigiri = 6', () => {
      expect(scoreTableau([wasabi(), nigiri('salmon')])).toBe(6);
    });

    it('wasabi without following nigiri = 0', () => {
      expect(scoreTableau([wasabi()])).toBe(0);
    });

    it('wasabi only pairs with the first nigiri after it', () => {
      // wasabi, squid(x3=9), salmon(normal=2) = 11
      expect(
        scoreTableau([wasabi(), nigiri('squid'), nigiri('salmon')]),
      ).toBe(11);
    });

    it('multiple wasabi pair with successive nigiri', () => {
      // wasabi, wasabi, egg(x3=3), salmon(x3=6) = 9
      expect(
        scoreTableau([wasabi(), wasabi(), nigiri('egg'), nigiri('salmon')]),
      ).toBe(9);
    });

    it('wasabi count exceeding nigiri count: extras score 0', () => {
      // wasabi, wasabi, wasabi, egg(x3=3) = 3
      expect(
        scoreTableau([wasabi(), wasabi(), wasabi(), nigiri('egg')]),
      ).toBe(3);
    });
  });

  describe('scoreTableau - chopsticks', () => {
    it('chopsticks score 0', () => {
      expect(scoreTableau([chopsticks()])).toBe(0);
    });

    it('chopsticks among other cards do not affect scoring', () => {
      expect(scoreTableau([tempura(), tempura(), chopsticks()])).toBe(5);
    });
  });

  describe('scoreTableau - mixed', () => {
    it('mixed tableau scores correctly', () => {
      // 2 tempura (5) + 3 sashimi (10) + 1 dumpling (1) + wasabi + squid (9) = 25
      const tableau: SushiGoCard[] = [
        tempura(),
        sashimi(),
        wasabi(),
        tempura(),
        sashimi(),
        dumpling(),
        nigiri('squid'),
        sashimi(),
      ];
      expect(scoreTableau(tableau)).toBe(25);
    });
  });

  describe('countMakiIcons', () => {
    it('empty tableau = 0', () => {
      expect(countMakiIcons([])).toBe(0);
    });

    it('counts total icons correctly', () => {
      expect(countMakiIcons([maki(1), maki(2), maki(3)])).toBe(6);
    });

    it('ignores non-maki cards', () => {
      expect(countMakiIcons([maki(2), tempura(), maki(3)])).toBe(5);
    });
  });

  describe('scoreMaki', () => {
    it('single player with maki gets 6', () => {
      expect(scoreMaki([5])).toEqual([6]);
    });

    it('most maki gets 6, second gets 3', () => {
      expect(scoreMaki([5, 3])).toEqual([6, 3]);
    });

    it('tie for most splits 6', () => {
      expect(scoreMaki([5, 5])).toEqual([3, 3]);
    });

    it('tie for most with 3 players splits 6, no second', () => {
      expect(scoreMaki([5, 5, 5])).toEqual([2, 2, 2]);
    });

    it('no maki = no bonuses', () => {
      expect(scoreMaki([0, 0])).toEqual([0, 0]);
    });

    it('second place tie splits 3', () => {
      // Player 0 has most (6pts), players 1 and 2 tie for second (3/2=1 each)
      expect(scoreMaki([5, 3, 3])).toEqual([6, 1, 1]);
    });

    it('one player zero, one player non-zero', () => {
      expect(scoreMaki([3, 0])).toEqual([6, 0]);
    });
  });

  describe('countPudding', () => {
    it('empty tableau = 0', () => {
      expect(countPudding([])).toBe(0);
    });

    it('counts pudding correctly', () => {
      expect(countPudding([pudding(), tempura(), pudding()])).toBe(2);
    });
  });

  describe('scorePudding', () => {
    it('most gets +6, fewest gets -6', () => {
      expect(scorePudding([3, 1])).toEqual([6, -6]);
    });

    it('tie for all = no bonuses or penalties', () => {
      expect(scorePudding([2, 2])).toEqual([0, 0]);
    });

    it('tie for most splits +6', () => {
      expect(scorePudding([3, 3, 1])).toEqual([3, 3, -6]);
    });

    it('tie for fewest splits -6', () => {
      expect(scorePudding([3, 1, 1])).toEqual([6, -3, -3]);
    });

    it('empty counts', () => {
      expect(scorePudding([0, 0])).toEqual([0, 0]);
    });

    it('single player gets +6 only if there are differences', () => {
      // With just one player, max === min, so no bonuses
      expect(scorePudding([5])).toEqual([0]);
    });
  });
});
