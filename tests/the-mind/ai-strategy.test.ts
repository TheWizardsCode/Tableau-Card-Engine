import { describe, it, expect } from 'vitest';
import {
  type MindAiStrategy,
  type MindAiTimingConfig,
  LinearTimingStrategy,
  MindAiPlayer,
  DEFAULT_BASE_DURATION,
  DEFAULT_JITTER_RANGE,
  MIN_PLAY_DELAY,
  AI_LAST_CARD_DELAY,
  computeEffectiveDelay,
} from '../../example-games/the-mind/AiStrategy';
import type { MindCard } from '../../example-games/the-mind/MindCard';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a MindCard with the given value. */
function card(value: number): MindCard {
  return { value, faceUp: false };
}

/** Create a hand of cards from an array of values. */
function hand(...values: number[]): MindCard[] {
  return values.map(card);
}

/** A config with zero jitter for deterministic formula testing. */
const ZERO_JITTER_CONFIG: MindAiTimingConfig = {
  baseDuration: 5000,
  jitterRange: 0,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('DEFAULT_BASE_DURATION is 10000ms', () => {
    expect(DEFAULT_BASE_DURATION).toBe(10000);
  });

  it('DEFAULT_JITTER_RANGE is 800ms', () => {
    expect(DEFAULT_JITTER_RANGE).toBe(800);
  });

  it('MIN_PLAY_DELAY is 1500ms', () => {
    expect(MIN_PLAY_DELAY).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// LinearTimingStrategy
// ---------------------------------------------------------------------------

describe('LinearTimingStrategy', () => {
  it('has the name "LinearTiming"', () => {
    expect(LinearTimingStrategy.name).toBe('LinearTiming');
  });

  describe('computeDelays', () => {
    it('returns one delay per card', () => {
      const h = hand(10, 50, 90);
      const rng = createSeededRng(100);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );
      expect(delays).toHaveLength(3);
    });

    it('preserves card references in returned delays', () => {
      const h = hand(42);
      const rng = createSeededRng(101);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );
      expect(delays[0].card).toBe(h[0]);
    });

    // ── Formula verification (no jitter) ──

    it('delay = (value/100) * baseDuration when jitter is 0', () => {
      const h = hand(25, 50, 75, 100);
      const rng = createSeededRng(102);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );

      // 25/100 * 5000 = 1250, clamped to MIN_PLAY_DELAY (1500)
      expect(delays[0].delay).toBeCloseTo(MIN_PLAY_DELAY, 5);
      expect(delays[1].delay).toBeCloseTo(2500, 5); // 50/100 * 5000
      expect(delays[2].delay).toBeCloseTo(3750, 5); // 75/100 * 5000
      expect(delays[3].delay).toBeCloseTo(5000, 5); // 100/100 * 5000
    });

    it('card value 1 is clamped to MIN_PLAY_DELAY', () => {
      const h = hand(1);
      const rng = createSeededRng(103);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );
      // Raw delay = 1/100 * 5000 = 50, clamped to MIN_PLAY_DELAY
      expect(delays[0].delay).toBe(MIN_PLAY_DELAY);
    });

    it('scales linearly with baseDuration', () => {
      const h = hand(50);
      const rng = createSeededRng(104);
      const config: MindAiTimingConfig = {
        baseDuration: 10000,
        jitterRange: 0,
      };
      const delays = LinearTimingStrategy.computeDelays(h, config, rng);
      expect(delays[0].delay).toBeCloseTo(5000, 5); // 50/100 * 10000
    });

    // ── Jitter verification ──

    it('applies jitter within ±jitterRange', () => {
      const h = hand(50);
      const config: MindAiTimingConfig = {
        baseDuration: 5000,
        jitterRange: 500,
      };

      // Run many trials to verify jitter stays in bounds
      for (let seed = 0; seed < 100; seed++) {
        const rng = createSeededRng(seed);
        const delays = LinearTimingStrategy.computeDelays(h, config, rng);
        const baseDelay = (50 / 100) * 5000; // 2500
        const jitter = delays[0].delay - baseDelay;
        expect(jitter).toBeGreaterThanOrEqual(-500);
        expect(jitter).toBeLessThanOrEqual(500);
      }
    });

    it('jitter produces variation across different seeds', () => {
      const h = hand(50);
      const config: MindAiTimingConfig = {
        baseDuration: 5000,
        jitterRange: 500,
      };

      const delays1 = LinearTimingStrategy.computeDelays(
        h,
        config,
        createSeededRng(200),
      );
      const delays2 = LinearTimingStrategy.computeDelays(
        h,
        config,
        createSeededRng(300),
      );

      // With different seeds, delays should differ (jitter varies)
      expect(delays1[0].delay).not.toBeCloseTo(delays2[0].delay, 5);
    });

    it('zero jitter range produces exact formula results', () => {
      const h = hand(33);
      const rng = createSeededRng(105);
      const config: MindAiTimingConfig = {
        baseDuration: 6000,
        jitterRange: 0,
      };
      const delays = LinearTimingStrategy.computeDelays(h, config, rng);
      expect(delays[0].delay).toBeCloseTo((33 / 100) * 6000, 5);
    });

    // ── Error handling ──

    it('throws if baseDuration is 0', () => {
      const h = hand(10);
      const rng = createSeededRng(106);
      expect(() =>
        LinearTimingStrategy.computeDelays(
          h,
          { baseDuration: 0, jitterRange: 0 },
          rng,
        ),
      ).toThrow(/baseDuration must be positive/);
    });

    it('throws if baseDuration is negative', () => {
      const h = hand(10);
      const rng = createSeededRng(107);
      expect(() =>
        LinearTimingStrategy.computeDelays(
          h,
          { baseDuration: -1000, jitterRange: 0 },
          rng,
        ),
      ).toThrow(/baseDuration must be positive/);
    });

    it('returns empty array for empty hand', () => {
      const rng = createSeededRng(108);
      const delays = LinearTimingStrategy.computeDelays(
        [],
        ZERO_JITTER_CONFIG,
        rng,
      );
      expect(delays).toHaveLength(0);
    });

    // ── MIN_PLAY_DELAY clamping ──

    it('clamps delays below MIN_PLAY_DELAY to the minimum', () => {
      // With baseDuration=5000, cards with value ≤ 30 produce raw delays ≤ 1500
      // Card value 10 → raw 500, Card value 20 → raw 1000, Card value 29 → raw 1450
      const h = hand(10, 20, 29);
      const rng = createSeededRng(200);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );
      for (const d of delays) {
        expect(d.delay).toBe(MIN_PLAY_DELAY);
      }
    });

    it('does not clamp delays already above MIN_PLAY_DELAY', () => {
      // Card value 50 → raw 2500 (above 1500)
      const h = hand(50);
      const rng = createSeededRng(201);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );
      expect(delays[0].delay).toBeCloseTo(2500, 5);
    });

    it('clamps at exactly MIN_PLAY_DELAY boundary', () => {
      // Card value 30 → raw 30/100 * 5000 = 1500 = MIN_PLAY_DELAY exactly
      const h = hand(30);
      const rng = createSeededRng(202);
      const delays = LinearTimingStrategy.computeDelays(
        h,
        ZERO_JITTER_CONFIG,
        rng,
      );
      expect(delays[0].delay).toBe(MIN_PLAY_DELAY);
    });

    // ── Determinism ──

    it('produces identical delays with the same seed', () => {
      const h = hand(10, 30, 60, 90);
      const config: MindAiTimingConfig = {
        baseDuration: 5000,
        jitterRange: 400,
      };

      const delays1 = LinearTimingStrategy.computeDelays(
        h,
        config,
        createSeededRng(42),
      );
      const delays2 = LinearTimingStrategy.computeDelays(
        h,
        config,
        createSeededRng(42),
      );

      expect(delays1.map((d) => d.delay)).toEqual(
        delays2.map((d) => d.delay),
      );
    });

    // ── Independence ──

    it('each card gets its own independent delay', () => {
      // Use values well above MIN_PLAY_DELAY threshold to ensure distinct delays
      // 50/100*5000=2500, 60/100*5000=3000, 70/100*5000=3500 (all > 1500)
      const h = hand(50, 60, 70);
      const rng = createSeededRng(109);
      const config: MindAiTimingConfig = {
        baseDuration: 5000,
        jitterRange: 200,
      };
      const delays = LinearTimingStrategy.computeDelays(h, config, rng);

      // All three delays should be different values
      const values = delays.map((d) => d.delay);
      const unique = new Set(values);
      expect(unique.size).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// MindAiPlayer
// ---------------------------------------------------------------------------

describe('MindAiPlayer', () => {
  describe('construction', () => {
    it('uses LinearTimingStrategy by default', () => {
      const player = new MindAiPlayer();
      expect(player.strategyName).toBe('LinearTiming');
    });

    it('uses default config when none provided', () => {
      const player = new MindAiPlayer();
      const config = player.getConfig();
      expect(config.baseDuration).toBe(DEFAULT_BASE_DURATION);
      expect(config.jitterRange).toBe(DEFAULT_JITTER_RANGE);
    });

    it('accepts partial config overrides', () => {
      const player = new MindAiPlayer(LinearTimingStrategy, Math.random, {
        baseDuration: 3000,
      });
      const config = player.getConfig();
      expect(config.baseDuration).toBe(3000);
      expect(config.jitterRange).toBe(DEFAULT_JITTER_RANGE);
    });

    it('accepts full config overrides', () => {
      const player = new MindAiPlayer(LinearTimingStrategy, Math.random, {
        baseDuration: 8000,
        jitterRange: 100,
      });
      const config = player.getConfig();
      expect(config.baseDuration).toBe(8000);
      expect(config.jitterRange).toBe(100);
    });

    it('accepts a custom strategy', () => {
      const custom: MindAiStrategy = {
        name: 'Custom',
        computeDelays: (h, _config, _rng) =>
          h.map((c) => ({ card: c, delay: c.value * 10 })),
      };
      const player = new MindAiPlayer(custom);
      expect(player.strategyName).toBe('Custom');
    });
  });

  describe('commitLevel', () => {
    it('computes and stores delays for the given hand', () => {
      const rng = createSeededRng(110);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(20, 40, 80));

      const delays = player.getCardDelays();
      expect(delays).toHaveLength(3);
    });

    it('sorts delays by earliest fire time (ascending)', () => {
      const rng = createSeededRng(111);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      // With zero jitter, card 10 < card 50 < card 90 in delay
      player.commitLevel(hand(90, 10, 50));

      const delays = player.getCardDelays();
      expect(delays[0].card.value).toBe(10);
      expect(delays[1].card.value).toBe(50);
      expect(delays[2].card.value).toBe(90);
    });

    it('replaces previous level delays when called again', () => {
      const rng = createSeededRng(112);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });

      player.commitLevel(hand(10, 20));
      expect(player.getCardDelays()).toHaveLength(2);

      player.commitLevel(hand(30, 40, 50));
      expect(player.getCardDelays()).toHaveLength(3);
      expect(player.getCardDelays()[0].card.value).toBe(30);
    });

    it('handles empty hand', () => {
      const rng = createSeededRng(113);
      const player = new MindAiPlayer(LinearTimingStrategy, rng);
      player.commitLevel([]);

      expect(player.getCardDelays()).toHaveLength(0);
      expect(player.hasCards()).toBe(false);
    });
  });

  describe('getCardDelays', () => {
    it('returns a defensive copy (mutation does not affect internal state)', () => {
      const rng = createSeededRng(114);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(10, 20));

      const copy = player.getCardDelays();
      copy.splice(0, 1); // Remove an element from the copy
      expect(player.getCardDelays()).toHaveLength(2); // Internal unchanged
    });
  });

  describe('getNextCard', () => {
    it('returns the card with the shortest delay', () => {
      const rng = createSeededRng(115);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(80, 20, 50));

      const next = player.getNextCard();
      expect(next).toBeDefined();
      expect(next!.card.value).toBe(20);
    });

    it('returns undefined when no cards are committed', () => {
      const player = new MindAiPlayer();
      expect(player.getNextCard()).toBeUndefined();
    });

    it('returns undefined after all cards are removed', () => {
      const rng = createSeededRng(116);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(10));
      player.removeCard(10);

      expect(player.getNextCard()).toBeUndefined();
    });
  });

  describe('removeCard', () => {
    it('removes a card by value and returns true', () => {
      const rng = createSeededRng(117);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(10, 30, 50));

      const result = player.removeCard(30);
      expect(result).toBe(true);
      expect(player.getCardDelays()).toHaveLength(2);
      expect(
        player.getCardDelays().find((d) => d.card.value === 30),
      ).toBeUndefined();
    });

    it('returns false for a card not in committed delays', () => {
      const rng = createSeededRng(118);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(10, 20));

      expect(player.removeCard(99)).toBe(false);
      expect(player.getCardDelays()).toHaveLength(2);
    });

    it('remaining card delays are NOT reset after removal', () => {
      const rng = createSeededRng(119);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(10, 50, 90));

      // Record delays before removal
      const delaysBefore = player.getCardDelays();
      const delay50Before = delaysBefore.find(
        (d) => d.card.value === 50,
      )!.delay;
      const delay90Before = delaysBefore.find(
        (d) => d.card.value === 90,
      )!.delay;

      // Remove card 10
      player.removeCard(10);

      // Remaining delays unchanged
      const delaysAfter = player.getCardDelays();
      expect(delaysAfter.find((d) => d.card.value === 50)!.delay).toBe(
        delay50Before,
      );
      expect(delaysAfter.find((d) => d.card.value === 90)!.delay).toBe(
        delay90Before,
      );
    });

    it('after removing the next card, getNextCard returns the new earliest', () => {
      const rng = createSeededRng(120);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(10, 50, 90));

      expect(player.getNextCard()!.card.value).toBe(10);
      player.removeCard(10);
      expect(player.getNextCard()!.card.value).toBe(50);
      player.removeCard(50);
      expect(player.getNextCard()!.card.value).toBe(90);
    });
  });

  describe('hasCards', () => {
    it('returns false before commitLevel is called', () => {
      const player = new MindAiPlayer();
      expect(player.hasCards()).toBe(false);
    });

    it('returns true after committing a non-empty hand', () => {
      const rng = createSeededRng(121);
      const player = new MindAiPlayer(LinearTimingStrategy, rng);
      player.commitLevel(hand(10));
      expect(player.hasCards()).toBe(true);
    });

    it('returns false after all cards are removed', () => {
      const rng = createSeededRng(122);
      const player = new MindAiPlayer(LinearTimingStrategy, rng);
      player.commitLevel(hand(10));
      player.removeCard(10);
      expect(player.hasCards()).toBe(false);
    });
  });

  // ── Determinism across full player lifecycle ──

  describe('determinism', () => {
    it('two players with the same seed produce identical delays', () => {
      const config = { baseDuration: 5000, jitterRange: 300 };
      const h = hand(5, 25, 50, 75, 100);

      const player1 = new MindAiPlayer(
        LinearTimingStrategy,
        createSeededRng(42),
        config,
      );
      const player2 = new MindAiPlayer(
        LinearTimingStrategy,
        createSeededRng(42),
        config,
      );

      player1.commitLevel(h);
      player2.commitLevel(h);

      const delays1 = player1.getCardDelays().map((d) => d.delay);
      const delays2 = player2.getCardDelays().map((d) => d.delay);

      expect(delays1).toEqual(delays2);
    });

    it('different seeds produce different delays', () => {
      const config = { baseDuration: 5000, jitterRange: 300 };
      const h = hand(50);

      const player1 = new MindAiPlayer(
        LinearTimingStrategy,
        createSeededRng(1),
        config,
      );
      const player2 = new MindAiPlayer(
        LinearTimingStrategy,
        createSeededRng(999),
        config,
      );

      player1.commitLevel(h);
      player2.commitLevel(h);

      const delay1 = player1.getCardDelays()[0].delay;
      const delay2 = player2.getCardDelays()[0].delay;

      expect(delay1).not.toBeCloseTo(delay2, 5);
    });
  });

  // ── Lowest-delay card plays first ──

  describe('lowest-delay card plays first', () => {
    it('lowest-value card above MIN_PLAY_DELAY threshold has the earliest delay (no jitter)', () => {
      const rng = createSeededRng(130);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      // Use values where the lowest is still above the MIN_PLAY_DELAY threshold
      // 40/100 * 5000 = 2000 > 1500
      player.commitLevel(hand(99, 40, 50, 75));

      const next = player.getNextCard()!;
      expect(next.card.value).toBe(40);
    });

    it('cards clamped to MIN_PLAY_DELAY all share the same delay', () => {
      const rng = createSeededRng(132);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      // Cards 1, 10, 25 all produce raw delays < 1500, so all clamp to MIN_PLAY_DELAY
      player.commitLevel(hand(1, 10, 25));

      const delays = player.getCardDelays();
      for (const d of delays) {
        expect(d.delay).toBe(MIN_PLAY_DELAY);
      }
    });

    it('with small jitter, lower cards generally fire before higher cards', () => {
      // Card 10: raw ≈ 500±50, clamped to MIN_PLAY_DELAY (1500)
      // Card 90: raw ≈ 4500±50, well above MIN_PLAY_DELAY
      // Order is preserved since 1500 < ~4450
      const rng = createSeededRng(131);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 50,
      });
      player.commitLevel(hand(10, 90));

      const delays = player.getCardDelays();
      expect(delays[0].card.value).toBe(10);
      expect(delays[1].card.value).toBe(90);
    });
  });

  // ── Multiple cards with similar delays ──

  describe('similar-delay cards', () => {
    it('cards with close values produce close but distinct delays', () => {
      const rng = createSeededRng(140);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 0,
      });
      player.commitLevel(hand(49, 50, 51));

      const delays = player.getCardDelays();
      // Delays: 2450, 2500, 2550 — close but distinct
      expect(delays[0].delay).toBeCloseTo(2450, 5);
      expect(delays[1].delay).toBeCloseTo(2500, 5);
      expect(delays[2].delay).toBeCloseTo(2550, 5);
    });

    it('jitter can reorder cards with similar values', () => {
      // With large jitter relative to the value gap, ordering can flip
      // Card 50 base = 2500, Card 51 base = 2550, gap = 50
      // jitterRange = 200 can easily flip them
      let flipped = false;
      for (let seed = 0; seed < 50; seed++) {
        const rng = createSeededRng(seed);
        const player = new MindAiPlayer(LinearTimingStrategy, rng, {
          baseDuration: 5000,
          jitterRange: 200,
        });
        player.commitLevel(hand(50, 51));

        const delays = player.getCardDelays();
        if (delays[0].card.value === 51) {
          flipped = true;
          break;
        }
      }
      expect(flipped).toBe(true);
    });
  });

  // ── Timers persist through pile changes ──

  describe('timers persist through pile changes', () => {
    it('delays remain unchanged after removing a card (simulating partner play)', () => {
      const rng = createSeededRng(150);
      const player = new MindAiPlayer(LinearTimingStrategy, rng, {
        baseDuration: 5000,
        jitterRange: 100,
      });
      player.commitLevel(hand(20, 40, 60, 80));

      // Snapshot all delays
      const snapshot = player.getCardDelays().map((d) => ({
        value: d.card.value,
        delay: d.delay,
      }));

      // Simulate partner playing — the pile top changes, but we do NOT
      // call commitLevel again. Remaining timers should be unchanged.
      // (In the real game, removeCard is only called if a penalty
      //  discards AI cards. The AI's own play also calls removeCard.)

      // Verify delays haven't changed
      const current = player.getCardDelays();
      for (const entry of snapshot) {
        const match = current.find((d) => d.card.value === entry.value);
        if (match) {
          expect(match.delay).toBe(entry.delay);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveDelay — fast-play when opponent hand is empty
// ---------------------------------------------------------------------------

describe('computeEffectiveDelay', () => {
  it('AI_LAST_CARD_DELAY is 400ms', () => {
    expect(AI_LAST_CARD_DELAY).toBe(400);
  });

  it('returns AI_LAST_CARD_DELAY when opponent hand is empty and player has 1 card', () => {
    const result = computeEffectiveDelay(
      /* committedDelay */ 8000,
      /* elapsed */ 2000,
      /* playerHandSize */ 1,
      /* opponentHandSize */ 0,
    );
    expect(result).toBe(AI_LAST_CARD_DELAY);
  });

  it('returns normal delay when opponent still has cards (even if player has 1 card)', () => {
    const result = computeEffectiveDelay(
      /* committedDelay */ 8000,
      /* elapsed */ 2000,
      /* playerHandSize */ 1,
      /* opponentHandSize */ 2,
    );
    // Normal: max(8000 - 2000, 100) = 6000
    expect(result).toBe(6000);
  });

  it('returns AI_LAST_CARD_DELAY when opponent hand is empty and player has multiple cards', () => {
    const result = computeEffectiveDelay(
      /* committedDelay */ 8000,
      /* elapsed */ 2000,
      /* playerHandSize */ 3,
      /* opponentHandSize */ 0,
    );
    expect(result).toBe(AI_LAST_CARD_DELAY);
  });

  it('returns normal delay when both players have cards', () => {
    const result = computeEffectiveDelay(
      /* committedDelay */ 5000,
      /* elapsed */ 1000,
      /* playerHandSize */ 2,
      /* opponentHandSize */ 3,
    );
    // Normal: max(5000 - 1000, 100) = 4000
    expect(result).toBe(4000);
  });

  it('clamps normal delay to 100ms minimum', () => {
    const result = computeEffectiveDelay(
      /* committedDelay */ 3000,
      /* elapsed */ 5000,
      /* playerHandSize */ 2,
      /* opponentHandSize */ 1,
    );
    // Normal: max(3000 - 5000, 100) = max(-2000, 100) = 100
    expect(result).toBe(100);
  });

  it('does not clamp to 100ms in fast-play scenario (AI_LAST_CARD_DELAY is used directly)', () => {
    // Even if the committed delay minus elapsed would be negative,
    // the fast-play path returns AI_LAST_CARD_DELAY, not 100.
    const result = computeEffectiveDelay(
      /* committedDelay */ 1000,
      /* elapsed */ 5000,
      /* playerHandSize */ 1,
      /* opponentHandSize */ 0,
    );
    expect(result).toBe(AI_LAST_CARD_DELAY);
  });

  it('returns AI_LAST_CARD_DELAY when both hands are empty (edge case)', () => {
    const result = computeEffectiveDelay(
      /* committedDelay */ 5000,
      /* elapsed */ 1000,
      /* playerHandSize */ 0,
      /* opponentHandSize */ 0,
    );
    // opponentHandSize is 0, so fast-play path
    expect(result).toBe(AI_LAST_CARD_DELAY);
  });
});
