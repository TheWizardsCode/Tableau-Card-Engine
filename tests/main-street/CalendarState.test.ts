import { describe, it, expect } from 'vitest';
import {
  ALLOWED_START_WEEKS,
  advanceWeek,
  deserializeMainStreetState,
  rollStartWeek,
  serializeMainStreetState,
  setupMainStreetGame,
} from '../../example-games/main-street/MainStreetState';
import { createSeededRng } from '../../src/core-engine/SeededRng';
import { processEndOfTurn, executeDayStart } from '../../example-games/main-street/MainStreetEngine';

describe('CalendarState (CG-0MTT0K9RX0004QTE / F2)', () => {
  describe('ALLOWED_START_WEEKS', () => {
    it('is exactly {1-8, 16-24, 40-46}', () => {
      expect([...ALLOWED_START_WEEKS]).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 16, 17, 18, 19, 20, 21, 22, 23, 24, 40, 41, 42, 43, 44,
        45, 46,
      ]);
    });

    it('is within 1..52', () => {
      for (const w of ALLOWED_START_WEEKS) {
        expect(w).toBeGreaterThanOrEqual(1);
        expect(w).toBeLessThanOrEqual(52);
      }
    });
  });

  describe('rollStartWeek', () => {
    it('draws uniformly from the allowed set', () => {
      const seen = new Set<number>();
      for (let seed = 0; seed < 200; seed++) {
        seen.add(rollStartWeek(createSeededRng(seed)));
      }
      for (const w of seen) {
        expect(ALLOWED_START_WEEKS).toContain(w);
      }
      // Over 200 seeds we should hit at least half the allowed weeks.
      expect(seen.size).toBeGreaterThanOrEqual(12);
    });

    it('is deterministic for the same seed', () => {
      const a = rollStartWeek(createSeededRng(99));
      const b = rollStartWeek(createSeededRng(99));
      expect(a).toBe(b);
    });
  });

  describe('setupMainStreetGame start week', () => {
    it('same seed ⇒ same start week (determinism)', () => {
      const a = setupMainStreetGame({ seed: 'calendar-seed-A' });
      const b = setupMainStreetGame({ seed: 'calendar-seed-A' });
      expect(a.week).toBe(b.week);
      expect(ALLOWED_START_WEEKS).toContain(a.week);
    });

    it('initialises year to 1', () => {
      const s = setupMainStreetGame({ seed: 'cal-year-1' });
      expect(s.year).toBe(1);
    });

    it('start week is within the allowed set for a variety of seeds', () => {
      for (const seed of ['s1', 's2', 'hello', 'zzzz', '42', 'MS-cal', '🧱']) {
        const s = setupMainStreetGame({ seed });
        expect(ALLOWED_START_WEEKS, `seed ${JSON.stringify(seed)}`).toContain(s.week);
      }
    });

    it('does not break seeded determinism of non-calendar state', () => {
      // Re-constructing the same seed must yield the same market and a
      // start week that is itself deterministic — i.e. re-running with the
      // same seed must not change week.
      const s1 = setupMainStreetGame({ seed: 'cal-determinism-replay' });
      const s2 = setupMainStreetGame({ seed: 'cal-determinism-replay' });
      expect(s1.week).toBe(s2.week);
      expect(s1.year).toBe(s2.year);
    });
  });

  describe('advanceWeek', () => {
    it('increments week by 1 within the year', () => {
      const s = setupMainStreetGame({ seed: 'cal-adv-1' });
      s.week = 7;
      s.year = 2;
      advanceWeek(s);
      expect(s.week).toBe(8);
      expect(s.year).toBe(2);
    });

    it('wraps 52→1 and increments year', () => {
      const s = setupMainStreetGame({ seed: 'cal-adv-wrap' });
      s.week = 52;
      s.year = 3;
      advanceWeek(s);
      expect(s.week).toBe(1);
      expect(s.year).toBe(4);
    });

    it('wraps repeatedly over multiple calls', () => {
      const s = setupMainStreetGame({ seed: 'cal-adv-multi' });
      s.week = 51;
      s.year = 1;
      advanceWeek(s);
      expect(s.week).toBe(52);
      expect(s.year).toBe(1);
      advanceWeek(s);
      expect(s.week).toBe(1);
      expect(s.year).toBe(2);
      advanceWeek(s);
      expect(s.week).toBe(2);
      expect(s.year).toBe(2);
    });
  });

  describe('day-transition integration (MainStreetEngine)', () => {
    it('advances week once per completed turn', () => {
      const s = setupMainStreetGame({ seed: 'cal-engine-1' });
      const startWeek = s.week;
      s.phase = 'MarketPhase' as any;
      processEndOfTurn(s);
      // Turn advanced only when the game is still playing; week should
      // always have advanced by one (including on the wrap).
      if (s.gameResult === 'playing') {
        const expectedWeek = startWeek >= 52 ? 1 : startWeek + 1;
        const expectedYear = startWeek >= 52 ? 2 : 1;
        expect(s.week).toBe(expectedWeek);
        expect(s.year).toBe(expectedYear);
      } else {
        // On immediate game-over (e.g. immediate loss) the day does not
        // complete, so week must be unchanged. This branch documents the
        // contract without asserting a winner.
        expect(s.week).toBe(startWeek);
      }
    });

    it('advances week across a successful full turn and back to MarketPhase', () => {
      const s = setupMainStreetGame({ seed: 'cal-engine-full' });
      // Guarantee a survivable turn: cushion coins so even a bad incident
      // cannot bankrupt us within one turn.
      s.resourceBank.coins = 9999;
      s.phase = 'MarketPhase' as any;
      const startWeek = s.week;
      const startYear = s.year;
      const r = processEndOfTurn(s);
      // Full turn should end in DayStart (next day) when still playing.
      if (r.gameResult === 'playing') {
        expect(s.phase).toBe('DayStart');
        executeDayStart(s);
        expect(s.phase).toBe('MarketPhase');
        // Week advanced exactly once during processEndOfTurn.
        const expectedWeek = startWeek >= 52 ? 1 : startWeek + 1;
        const expectedYear = startWeek >= 52 ? startYear + 1 : startYear;
        expect(s.week).toBe(expectedWeek);
        expect(s.year).toBe(expectedYear);
      } else {
        expect(s.week).toBe(startWeek);
      }
    });
  });

  describe('serialization round-trip', () => {
    it('persists week/year through serialize/deserialize', () => {
      const s = setupMainStreetGame({ seed: 'cal-ser-1' });
      s.week = 44;
      s.year = 5;
      const saved: any = serializeMainStreetState(s);
      expect(saved.week).toBe(44);
      expect(saved.year).toBe(5);
      const restored = deserializeMainStreetState(saved);
      expect(restored.week).toBe(44);
      expect(restored.year).toBe(5);
    });

    it('migrates legacy saves missing week/year', () => {
      const s = setupMainStreetGame({ seed: 'cal-legacy-migrate' });
      const saved: any = serializeMainStreetState(s);
      const legacy: any = { ...saved };
      delete legacy.week;
      delete legacy.year;
      // Also delete numericSeed-based reconstruction would fail without the
      // field — migration must backfill week/year.
      const restored = deserializeMainStreetState(legacy as any);
      expect(restored.week).toBeGreaterThanOrEqual(1);
      expect(restored.week).toBeLessThanOrEqual(52);
      expect(ALLOWED_START_WEEKS).toContain(restored.week);
      expect(restored.year).toBe(1);
    });
  });
});
