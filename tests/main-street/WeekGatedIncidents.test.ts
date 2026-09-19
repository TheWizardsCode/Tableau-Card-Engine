/**
 * Main Street: Week-Gated Incident Draws (CG-0MTT0K9RX0004QTE / F4)
 *
 * Verifies that `findConstrainedIncidentIndex` skips Incident-trigger cards
 * whose declared week window excludes the current week, in addition to the
 * existing repeat-spacing / streak constraints, and returns -1 when no
 * incident is eligible (turn draws no incident).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { resolveIncident } from '../../example-games/main-street/MainStreetEngine';
import {
  type EventCard,
  createIncidentBalanceState,
  findConstrainedIncidentIndex,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Builds an Incident EventCard with overridable fields. */
function makeIncident(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: overrides.id ?? 'test-incident',
    name: overrides.name ?? 'Test Incident',
    trigger: 'Incident',
    cost: 0,
    effect: 'test effect',
    target: 'All',
    coinDelta: overrides.coinDelta ?? 100,
    reputationDelta: overrides.reputationDelta ?? 0,
    ...overrides,
  };
}

const YEAR_ROUND = makeIncident({ id: 'inc-year-round', name: 'Year Round' });
const OUT_OF_SEASON = makeIncident({
  id: 'inc-out-of-season',
  name: 'Out Of Season',
  availableWeekStart: 10,
  availableWeekEnd: 12,
});
const IN_SEASON = makeIncident({
  id: 'inc-in-season',
  name: 'In Season',
  availableWeekStart: 38,
  availableWeekEnd: 41,
});

// ── Selector-level gating ───────────────────────────────────

describe('findConstrainedIncidentIndex: week gating (F4)', () => {
  it('skips an out-of-season windowed incident and picks the year-round one', () => {
    const balance = createIncidentBalanceState();
    const deck = [OUT_OF_SEASON, YEAR_ROUND];
    // Week 40: OUT_OF_SEASON (10-12) is excluded; YEAR_ROUND is eligible.
    expect(findConstrainedIncidentIndex(deck, balance, 40)).toBe(1);
  });

  it('picks an in-season windowed incident when it is first in deck order', () => {
    const balance = createIncidentBalanceState();
    const deck = [IN_SEASON, YEAR_ROUND];
    expect(findConstrainedIncidentIndex(deck, balance, 40)).toBe(0);
  });

  it('returns -1 when no incident is eligible for the current week', () => {
    const balance = createIncidentBalanceState();
    const deck = [OUT_OF_SEASON];
    expect(findConstrainedIncidentIndex(deck, balance, 40)).toBe(-1);
    // A year-round card is always eligible, so the same deck at week 11 works.
    const deck2 = [OUT_OF_SEASON, YEAR_ROUND];
    expect(findConstrainedIncidentIndex(deck2, balance, 11)).toBe(0);
  });

  it('without a week argument the gating is disabled (backward compatible)', () => {
    const balance = createIncidentBalanceState();
    const deck = [OUT_OF_SEASON];
    expect(findConstrainedIncidentIndex(deck, balance)).toBe(0);
  });

  it('year-round incidents stay eligible in every week', () => {
    const balance = createIncidentBalanceState();
    for (const week of [1, 11, 26, 40, 52]) {
      expect(findConstrainedIncidentIndex([YEAR_ROUND], balance, week), `week ${week}`).toBe(0);
    }
  });

  it('composes week gating with repeat-spacing (repeat window relaxed, window respected)', () => {
    const balance = createIncidentBalanceState({ repeatSpacing: 3 });
    // YEAR_ROUND was the most recent draw; the strict tier must skip it.
    balance.recentNames = ['Year Round'];
    const deck = [YEAR_ROUND, IN_SEASON];
    // Week 40: YEAR_ROUND is name-blocked, IN_SEASON is in-season → index 1.
    expect(findConstrainedIncidentIndex(deck, balance, 40)).toBe(1);
  });

  it('never returns an out-of-season card even when all constraints are relaxed', () => {
    const balance = createIncidentBalanceState({ repeatSpacing: 3, maxStreak: 1 });
    // A bad run at the streak limit; the only alternative is out of season.
    balance.polarityRun = { polarity: 'good', length: 1 };
    balance.recentNames = ['Out Of Season'];
    const goodOutOfSeason = makeIncident({
      id: 'inc-good-oos',
      name: 'Out Of Season',
      coinDelta: 200,
      availableWeekStart: 10,
      availableWeekEnd: 12,
    });
    const deck = [goodOutOfSeason];
    // Even the final fallback tiers must exclude the out-of-season card.
    expect(findConstrainedIncidentIndex(deck, balance, 40)).toBe(-1);
  });
});

// ── End-to-end resolveIncident gating ───────────────────────

describe('resolveIncident: week gating (F4)', () => {
  function controlledState(seed: string, week: number, deck: EventCard[]): MainStreetState {
    const state = setupMainStreetGame({ seed });
    state.week = week;
    state.incidentDeck = [...deck];
    state.incidentBalance = createIncidentBalanceState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = 1000;
    return state;
  }

  it('resolves the in-season incident and leaves the out-of-season card in the deck', () => {
    const state = controlledState('f4-e2e-1', 40, [OUT_OF_SEASON, YEAR_ROUND]);
    const resolved = resolveIncident(state);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe('inc-year-round');
    // The out-of-season card remains in the deck (never drawn).
    expect(state.incidentDeck.map((c) => c.id)).toEqual(['inc-out-of-season']);
  });

  it('draws no incident when every deck card is out of season', () => {
    const state = controlledState('f4-e2e-2', 40, [OUT_OF_SEASON]);
    const resolved = resolveIncident(state);
    expect(resolved).toBeNull();
    // Nothing was consumed — the deck is unchanged.
    expect(state.incidentDeck.map((c) => c.id)).toEqual(['inc-out-of-season']);
  });

  it('resolves a windowed incident when the week is inside its window', () => {
    const state = controlledState('f4-e2e-3', 39, [IN_SEASON]);
    const resolved = resolveIncident(state);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe('inc-in-season');
  });
});
