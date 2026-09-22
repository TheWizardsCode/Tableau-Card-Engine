/**
 * Main Street: Week-Gated Market Offers (CG-0MTT0K9RX0004QTE / F3)
 *
 * Verifies that `refillSingleRowMarket` only offers Investment-trigger event
 * cards whose declared week window includes the current `state.week`, while
 * cards with no window remain year-round.
 *
 * The tests drive the gating through the public `refillSingleRowMarket` API
 * with a controlled event deck (upgrade/staff decks emptied so the single
 * non-business market slot must resolve through the event draw). This keeps
 * the assertions observable and deterministic without depending on the full
 * card-data.csv.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  refillSingleRowMarket,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  type EventCard,
  MARKET_TOTAL_SLOTS,
  MARKET_BUSINESS_MIN,
  MARKET_EVENT_MAX,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Harvest Festival window per AC5 of the parent item. */
const HARVEST_WINDOW = { start: 38, end: 41 } as const;
/** Summer Fest window per AC6 of the parent item. */
const SUMMER_WINDOW = { start: 23, end: 35 } as const;

function makeInvestment(
  id: string,
  name: string,
  window?: { start: number; end: number },
): EventCard {
  return {
    family: 'event',
    id,
    name,
    trigger: 'Investment',
    cost: 300,
    effect: '+1 coin',
    target: 'All',
    coinDelta: 100,
    reputationDelta: 0,
    ...(window ? { availableWeekStart: window.start, availableWeekEnd: window.end } : {}),
  };
}

const HARVEST = makeInvestment('evt-harvest-festival', 'Harvest Festival', HARVEST_WINDOW);
const SUMMER = makeInvestment('evt-summer-fest', 'Summer Fest', SUMMER_WINDOW);
const YEAR_ROUND = makeInvestment('evt-year-round', 'All Year Event');

/**
 * Builds a state with a controlled event deck and forces the single
 * non-business market slot to resolve through the event draw by emptying the
 * upgrade and staff decks. Returns the list of event cards offered.
 */
function refillWithCandidates(
  seed: string,
  week: number,
  candidates: EventCard[],
): EventCard[] {
  const state = setupMainStreetGame({ seed });
  state.week = week;
  state.decks.event = [...candidates];
  state.discards.event = [];
  state.decks.upgrade = [];
  state.decks.staff = [];
  state.market.cards = [];
  refillSingleRowMarket(state);
  return state.market.cards.filter((c): c is EventCard => c.family === 'event');
}

/** Counts market cards of a given family. */
function countFamily(state: MainStreetState, family: string): number {
  return state.market.cards.filter((c) => c.family === family).length;
}

// ── Gating tests ────────────────────────────────────────────

describe('WeekGatedMarket (F3)', () => {
  it('offers a windowed Investment event inside its window (week 40 → Harvest)', () => {
    for (const seed of ['wg-a', 'wg-b', 'wg-c', 'wg-d']) {
      const offered = refillWithCandidates(seed, 40, [HARVEST, SUMMER]);
      expect(offered.map((c) => c.id), `seed ${seed}`).toContain('evt-harvest-festival');
      expect(offered.map((c) => c.id), `seed ${seed}`).not.toContain('evt-summer-fest');
    }
  });

  it('offers Summer Fest but not Harvest Festival at week 28', () => {
    for (const seed of ['wg-e', 'wg-f', 'wg-g', 'wg-h']) {
      const offered = refillWithCandidates(seed, 28, [HARVEST, SUMMER]);
      expect(offered.map((c) => c.id), `seed ${seed}`).toContain('evt-summer-fest');
      expect(offered.map((c) => c.id), `seed ${seed}`).not.toContain('evt-harvest-festival');
    }
  });

  it('never offers a windowed event outside its window even when it is the only candidate', () => {
    // Week 10 is outside both windows → no event should be offerable.
    const offered = refillWithCandidates('wg-outside', 10, [HARVEST, SUMMER]);
    expect(offered).toHaveLength(0);
  });

  it('keeps year-round Investment events offerable in every week', () => {
    for (const week of [1, 10, 26, 40, 52]) {
      const offered = refillWithCandidates(`wg-yr-${week}`, week, [YEAR_ROUND]);
      expect(offered.map((c) => c.id), `week ${week}`).toContain('evt-year-round');
    }
  });

  it('falls back to a year-round event when the windowed candidate is out of season', () => {
    const offered = refillWithCandidates('wg-fallback', 10, [HARVEST, YEAR_ROUND]);
    expect(offered.map((c) => c.id)).toEqual(['evt-year-round']);
  });

  it('preserves the existing market composition constraints (≥1 business, ≤1 event)', () => {
    const state = setupMainStreetGame({ seed: 'wg-composition' });
    state.week = 40;
    state.decks.event = [HARVEST, SUMMER];
    state.decks.upgrade = [];
    state.decks.staff = [];
    state.market.cards = [];
    refillSingleRowMarket(state);
    expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
    const businessCount =
      countFamily(state, 'business') + countFamily(state, 'community-space');
    expect(businessCount).toBeGreaterThanOrEqual(MARKET_BUSINESS_MIN);
    expect(countFamily(state, 'event')).toBeLessThanOrEqual(MARKET_EVENT_MAX);
    expect(countFamily(state, 'upgrade')).toBe(0);
    expect(countFamily(state, 'staff')).toBe(0);
  });
});
