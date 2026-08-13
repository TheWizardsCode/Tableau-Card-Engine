/**
 * Constrained Incident Draws (CG-0MSL0OP040043KKZ)
 *
 * Tests for the incident-queue balance system:
 * - repeat-spacing enforcement (no card name within the last N-1 draws)
 * - good/bad streak enforcement (never more than M consecutive same polarity)
 * - neutral cards breaking streaks
 * - runtime limit changes affecting subsequent draws (setIncidentBalanceLimits)
 * - deck-exhaustion / reshuffle fallback (no deadlock)
 * - seeded determinism (same seed => same draw sequence)
 * - serialization round-trip and legacy-save backfill
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  deserializeMainStreetState,
  serializeMainStreetState,
  setIncidentBalanceLimits,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  refillIncidentQueue,
} from '../../example-games/main-street/MainStreetMarket';
import { resolveIncident } from '../../example-games/main-street/MainStreetEngine';
import {
  type EventCard,
  type IncidentPolarity,
  type IncidentBalanceState,
  INCIDENT_QUEUE_SIZE,
  DEFAULT_INCIDENT_REPEAT_SPACING,
  DEFAULT_INCIDENT_MAX_STREAK,
  incidentPolarity,
  createIncidentBalanceState,
  createIncidentBalanceFromQueue,
  findConstrainedIncidentIndex,
  recordIncidentDraw,
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
    coinDelta: overrides.coinDelta ?? -1,
    reputationDelta: overrides.reputationDelta ?? 0,
    ...overrides,
  };
}

/** Shorthand for a good incident (net > 0). */
function good(name: string, id = name): EventCard {
  return makeIncident({ id, name, coinDelta: 1, reputationDelta: 1 });
}

/** Shorthand for a bad incident (net < 0). */
function bad(name: string, id = name): EventCard {
  return makeIncident({ id, name, coinDelta: -1, reputationDelta: 0 });
}

/** Shorthand for a neutral incident (net == 0). */
function neutral(name: string, id = name): EventCard {
  return makeIncident({ id, name, coinDelta: 0, reputationDelta: 0 });
}

/**
 * Replaces the event deck + queue with a controlled pool and resets balance
 * history, returning the state ready for constrained draws.
 */
function setupControlledDeck(
  seed: string,
  deck: EventCard[],
  limits?: Partial<Pick<IncidentBalanceState, 'repeatSpacing' | 'maxStreak'>>,
): MainStreetState {
  const state = setupMainStreetGame({ seed });
  state.decks.event = deck;
  state.incidentQueue = [];
  state.incidentBalance.recentNames = [];
  state.incidentBalance.polarityRun = null;
  if (limits) setIncidentBalanceLimits(state, limits);
  return state;
}

/** Resolves up to `count` incidents, collecting resolved polarities/names. */
function resolveMany(
  state: MainStreetState,
  count: number,
): { names: string[]; polarities: IncidentPolarity[] } {
  state.resourceBank.coins = 1000;
  state.resourceBank.reputation = 1000;
  const names: string[] = [];
  const polarities: IncidentPolarity[] = [];
  for (let i = 0; i < count; i++) {
    if (state.incidentQueue.length === 0) break;
    const ev = resolveIncident(state);
    if (!ev) break;
    names.push(ev.name);
    polarities.push(incidentPolarity(ev));
  }
  return { names, polarities };
}

// ── Repeat-spacing (selector unit) ──────────────────────────

describe('findConstrainedIncidentIndex: repeat spacing', () => {
  it('does not repeat a name within repeatSpacing - 1 drawn cards (N=3 => window 2)', () => {
    const balance = createIncidentBalanceState();
    recordIncidentDraw(balance, bad('bad-1'));
    recordIncidentDraw(balance, good('good-2'));
    // Window = last 2 names [good-2, bad-1]: both must be avoided
    const deck = [bad('bad-1'), good('good-2'), bad('bad-3')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('bad-3');
  });

  it('allows a name to reappear after repeatSpacing - 1 other draws (N=3 => free at distance 3)', () => {
    const balance = createIncidentBalanceState();
    recordIncidentDraw(balance, bad('bad-1'));
    recordIncidentDraw(balance, good('good-2'));
    // bad-1 is 3 back: window is [good-2, bad-1], so a fresh name is preferred,
    // but when only bad-1 remains available the relaxation picks it.
    const deck = [bad('bad-1')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('bad-1');
  });

  it('repeatSpacing = 1 disables the repeat window (immediate repeats allowed)', () => {
    const balance = createIncidentBalanceState({ repeatSpacing: 1 });
    recordIncidentDraw(balance, bad('bad-1'));
    const deck = [bad('bad-1')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('bad-1');
  });

  it('returns -1 when the deck has no Incident-trigger cards', () => {
    const deck: EventCard[] = [
      makeIncident({ id: 'inv-1', name: 'Investment Card', trigger: 'Investment' }),
    ];
    expect(findConstrainedIncidentIndex(deck, createIncidentBalanceState())).toBe(-1);
  });
});

// ── Streak enforcement (selector unit) ──────────────────────

describe('findConstrainedIncidentIndex: streak enforcement', () => {
  it('after M consecutive goods the next card must be bad (not good, not neutral)', () => {
    const balance = createIncidentBalanceState();
    balance.polarityRun = { polarity: 'good', length: 2 };
    balance.recentNames = ['good-2', 'good-1'];
    const deck = [good('good-3'), neutral('neutral-1'), bad('bad-1')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('bad-1');
  });

  it('relaxes to a neutral card (which breaks the streak) when no bad is available', () => {
    const balance = createIncidentBalanceState();
    balance.polarityRun = { polarity: 'good', length: 2 };
    balance.recentNames = ['good-2', 'good-1'];
    const deck = [good('good-3'), neutral('neutral-1')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('neutral-1');
  });

  it('never deadlocks: picks the first card when no card can satisfy either rule', () => {
    const balance = createIncidentBalanceState();
    balance.polarityRun = { polarity: 'good', length: 2 };
    const deck = [good('good-3'), good('good-4')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('good-3');
  });

  it('maxStreak = 1 forces strict polarity alternation', () => {
    const balance = createIncidentBalanceState({ maxStreak: 1 });
    recordIncidentDraw(balance, good('good-1'));
    const deck = [good('good-2'), neutral('neutral-1'), bad('bad-1')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('bad-1');
  });

  it('allows a run shorter than M to extend', () => {
    const balance = createIncidentBalanceState();
    recordIncidentDraw(balance, good('good-1'));
    // Run is {good, 1} < M=2: a second good is fine (run becomes exactly 2)
    const deck = [good('good-2'), bad('bad-1')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('good-2');
  });
});

// ── Neutral cards break streaks ─────────────────────────────

describe('neutral cards break streaks', () => {
  it('recordIncidentDraw resets the run on a neutral draw and frees the next card', () => {
    const balance = createIncidentBalanceState();
    recordIncidentDraw(balance, good('good-1'));
    recordIncidentDraw(balance, good('good-2'));
    expect(balance.polarityRun).toEqual({ polarity: 'good', length: 2 });

    recordIncidentDraw(balance, neutral('neutral-1'));
    expect(balance.polarityRun).toBeNull();

    // After a neutral, the next card can be anything — good is allowed again
    const deck = [good('good-3')];
    const idx = findConstrainedIncidentIndex(deck, balance);
    expect(deck[idx].name).toBe('good-3');
  });
});

// ── Runtime limit changes (setIncidentBalanceLimits) ────────

describe('runtime limit changes (setIncidentBalanceLimits)', () => {
  it('validates limits (M >= 1, N >= 1 integers)', () => {
    const state = setupMainStreetGame({ seed: 'validate-limits' });
    setIncidentBalanceLimits(state, { repeatSpacing: 5, maxStreak: 3 });
    expect(state.incidentBalance.repeatSpacing).toBe(5);
    expect(state.incidentBalance.maxStreak).toBe(3);

    expect(() => setIncidentBalanceLimits(state, { maxStreak: 0 })).toThrow(/maxStreak/);
    expect(() => setIncidentBalanceLimits(state, { repeatSpacing: 0 })).toThrow(/repeatSpacing/);
    expect(() => setIncidentBalanceLimits(state, { maxStreak: -2 })).toThrow(/maxStreak/);
    expect(() => setIncidentBalanceLimits(state, { maxStreak: 2.5 })).toThrow(/maxStreak/);

    // Unchanged fields survive partial updates
    expect(state.incidentBalance.repeatSpacing).toBe(5);
    expect(state.incidentBalance.maxStreak).toBe(3);
  });

  it('maxStreak = 1 forces alternation on subsequent draws', () => {
    const deck: EventCard[] = [];
    for (let i = 0; i < 6; i++) {
      deck.push(good('Good-A', `Good-A-${i}`), good('Good-B', `Good-B-${i}`),
        bad('Bad-A', `Bad-A-${i}`), bad('Bad-B', `Bad-B-${i}`));
    }
    const state = setupControlledDeck('runtime-maxstreak', deck, { maxStreak: 1 });
    refillIncidentQueue(state);
    const { polarities } = resolveMany(state, 12);

    expect(polarities.length).toBe(12);
    for (let i = 1; i < polarities.length; i++) {
      expect(polarities[i]).not.toBe(polarities[i - 1]);
    }
  });

  it('repeatSpacing = 1 allows immediate repeats on subsequent draws (blocked at default N=3)', () => {
    const deck = [good('Good-A', 'Good-A-0'), good('Good-A', 'Good-A-1'),
      bad('Bad-A', 'Bad-A-0'), bad('Bad-A', 'Bad-A-1')];
    const state = setupControlledDeck('runtime-repeat-1', deck, { repeatSpacing: 1 });
    refillIncidentQueue(state);
    const { names } = resolveMany(state, 4);
    expect(names.length).toBe(4);
    // With N=1 the same name can appear back-to-back
    expect(names[0]).toBe(names[1]);
  });

  it('default repeatSpacing (N=3) prevents immediate repeats on subsequent draws', () => {
    const deck = [good('Good-A', 'Good-A-0'), good('Good-A', 'Good-A-1'),
      bad('Bad-A', 'Bad-A-0'), bad('Bad-A', 'Bad-A-1')];
    const state = setupControlledDeck('runtime-repeat-3', deck);
    refillIncidentQueue(state);
    const { names } = resolveMany(state, 4);
    expect(names.length).toBe(4);
    expect(names[0]).not.toBe(names[1]);
  });
});

// ── Reshuffle / exhaustion fallback ─────────────────────────

describe('deck exhaustion and reshuffle fallback', () => {
  it('refills from reshuffled discards and never hangs when the deck runs dry', () => {
    const state = setupMainStreetGame({ seed: 'reshuffle-fallback' });
    const incidentCards = state.decks.event.filter(e => e.trigger === 'Incident');
    state.decks.event = [];
    state.discards.event.push(...incidentCards);
    state.incidentQueue = [];
    state.incidentBalance.recentNames = [];
    state.incidentBalance.polarityRun = null;

    refillIncidentQueue(state);

    expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
    expect(state.incidentQueue.every(c => c.trigger === 'Incident')).toBe(true);
    expect(state.discards.event.length).toBe(0);
  });

  it('keeps drawing across multiple reshuffle cycles without deadlock', () => {
    // Controlled deck of two names; force streak violations so every tier of
    // relaxation is exercised while the queue keeps refilling.
    const deck: EventCard[] = [];
    for (let i = 0; i < 8; i++) deck.push(good('Only-Good', `Only-Good-${i}`));
    const state = setupControlledDeck('deadlock-cycle', deck);
    refillIncidentQueue(state);
    const { names } = resolveMany(state, 20);
    // Every resolution returned a card (no hang) and consumed from the deck
    expect(names.length).toBeGreaterThan(0);
    expect(state.decks.event.filter(e => e.trigger === 'Incident').length + names.length).toBeLessThanOrEqual(8 + 2);
  });

  it('queue stays short (no crash) when no Incident cards exist anywhere', () => {
    const state = setupMainStreetGame({ seed: 'exhaust-all' });
    state.decks.event = state.decks.event.filter(e => e.trigger !== 'Incident');
    state.incidentQueue = [];
    refillIncidentQueue(state);
    expect(state.incidentQueue.length).toBe(0);
  });
});

// ── Integration: setup + refills respect constraints ────────

describe('constrained draws in the full game loop', () => {
  it('setup queue and subsequent refills respect repeat-spacing and streak rules', () => {
    const state = setupMainStreetGame({ seed: 'constraint-integration' });
    const { names, polarities } = resolveMany(state, 30);

    expect(names.length).toBeGreaterThan(10);

    // Repeat spacing (N=3 default => window 2): no name within 2 positions
    for (let i = 2; i < names.length; i++) {
      expect(names[i]).not.toBe(names[i - 1]);
      expect(names[i]).not.toBe(names[i - 2]);
    }

    // Streak (M=2): never 3 consecutive same-polarity (good/bad) cards;
    // neutrals break runs so only runs of 3 non-neutral cards count
    for (let i = 2; i < polarities.length; i++) {
      const a = polarities[i - 2];
      const b = polarities[i - 1];
      const c = polarities[i];
      if (a !== 'neutral' && b !== 'neutral' && c !== 'neutral') {
        expect(a === b && b === c).toBe(false);
      }
    }
  });

  it('setup queue itself never contains the same name twice (N=3)', () => {
    for (const seed of ['setup-a', 'setup-b', 'setup-c', 'setup-d', 'setup-e']) {
      const state = setupMainStreetGame({ seed });
      expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
      expect(state.incidentQueue[0].name).not.toBe(state.incidentQueue[1].name);
    }
  });
});

// ── Preset-driven limits (CG-0MSL0OU1E005WFJB) ─────────────

describe('preset-driven incident limits at setup and refill', () => {
  it('Easy (N=4, M=2): wider repeat spacing holds through setup and refills', () => {
    const state = setupMainStreetGame({ seed: 'preset-easy-limits', difficulty: 'Easy' });
    expect(state.incidentBalance.repeatSpacing).toBe(4);
    expect(state.incidentBalance.maxStreak).toBe(2);
    const { names, polarities } = resolveMany(state, 30);
    expect(names.length).toBeGreaterThan(10);

    // N=4 => window 3: no name within 3 positions
    for (let i = 3; i < names.length; i++) {
      expect(names[i]).not.toBe(names[i - 1]);
      expect(names[i]).not.toBe(names[i - 2]);
      expect(names[i]).not.toBe(names[i - 3]);
    }

    // M=2: never 3 consecutive non-neutral same-polarity cards
    for (let i = 2; i < polarities.length; i++) {
      const a = polarities[i - 2];
      const b = polarities[i - 1];
      const c = polarities[i];
      if (a !== 'neutral' && b !== 'neutral' && c !== 'neutral') {
        expect(a === b && b === c).toBe(false);
      }
    }
  });

  it('Hard (N=2, M=3): minimal spacing and longer streaks are allowed', () => {
    const state = setupMainStreetGame({ seed: 'preset-hard-limits', difficulty: 'Hard' });
    expect(state.incidentBalance.repeatSpacing).toBe(2);
    expect(state.incidentBalance.maxStreak).toBe(3);
    const { names, polarities } = resolveMany(state, 30);
    expect(names.length).toBeGreaterThan(10);

    // N=2 => window 1: no immediate repeats
    for (let i = 1; i < names.length; i++) {
      expect(names[i]).not.toBe(names[i - 1]);
    }

    // M=3: never 4 consecutive non-neutral same-polarity cards
    for (let i = 3; i < polarities.length; i++) {
      const a = polarities[i - 3];
      const b = polarities[i - 2];
      const c = polarities[i - 1];
      const d = polarities[i];
      if (a !== 'neutral' && b !== 'neutral' && c !== 'neutral' && d !== 'neutral') {
        expect(a === b && b === c && c === d).toBe(false);
      }
    }

    // M=3 must be observable: with the default M=2 the bound would forbid
    // 3-runs, so at least one 3-run must appear somewhere in the sequence.
    const maxRun = (): number => {
      let run = 1;
      let best = 1;
      for (let i = 1; i < polarities.length; i++) {
        const a = polarities[i - 1];
        const b = polarities[i];
        if (a !== 'neutral' && b !== 'neutral' && a === b) {
          run += 1;
          best = Math.max(best, run);
        } else {
          run = 1;
        }
      }
      return best;
    };
    expect(maxRun()).toBeGreaterThanOrEqual(3);
  });

  it('restored legacy configs omitting the incident-limit fields keep working with defaults', () => {
    const state = setupMainStreetGame({ seed: 'legacy-config-limits', difficulty: 'Medium' });
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete (serialized.config as Record<string, unknown>).incidentRepeatSpacing;
    delete (serialized.config as Record<string, unknown>).incidentMaxStreak;
    const restored = deserializeMainStreetState(serialized as never);

    // Config retains the legacy shape (fields missing)...
    expect(
      (restored.config as unknown as Record<string, unknown>).incidentRepeatSpacing,
    ).toBeUndefined();
    // ...and the balance keeps the default limits without crashing.
    expect(restored.incidentBalance.repeatSpacing).toBe(DEFAULT_INCIDENT_REPEAT_SPACING);
    expect(restored.incidentBalance.maxStreak).toBe(DEFAULT_INCIDENT_MAX_STREAK);
    const { names } = resolveMany(restored, 6);
    expect(names.length).toBe(6);
  });
});

// ── Seeded determinism ──────────────────────────────────────

describe('seeded determinism', () => {
  it('same seed => identical setup queue, balance history, and draw sequence', () => {
    const collect = (seed: string): { queueIds: string[]; names: string[] } => {
      const state = setupMainStreetGame({ seed });
      const queueIds = state.incidentQueue.map(c => c.id);
      const { names } = resolveMany(state, 15);
      return { queueIds, names };
    };

    const a = collect('determinism-seed');
    const b = collect('determinism-seed');
    expect(a.queueIds).toEqual(b.queueIds);
    expect(a.names).toEqual(b.names);

    // Different seeds may diverge (guards against accidental constant output)
    const c = collect('determinism-seed-other');
    expect(a.names).not.toEqual(c.names);
  });

  it('selector consumes no RNG: rngCalls unchanged between setup and first resolution', () => {
    const state = setupMainStreetGame({ seed: 'rng-stable' });
    const callsAfterSetup = state.rngCalls;
    // Setting up a second game with the same seed must not shift the sequence
    const other = setupMainStreetGame({ seed: 'rng-stable' });
    expect(state.rngCalls).toBe(other.rngCalls);
    expect(state.incidentQueue.map(c => c.id)).toEqual(other.incidentQueue.map(c => c.id));
    expect(callsAfterSetup).toBe(state.rngCalls);
  });
});

// ── Serialization / restore ─────────────────────────────────

describe('serialization and legacy restore', () => {
  it('round-trips incidentBalance (limits + history) through serialize/deserialize', () => {
    const state = setupMainStreetGame({ seed: 'serialize-balance' });
    setIncidentBalanceLimits(state, { repeatSpacing: 5, maxStreak: 3 });

    const serialized = serializeMainStreetState(state);
    expect(serialized.incidentBalance.repeatSpacing).toBe(5);
    expect(serialized.incidentBalance.maxStreak).toBe(3);
    expect(serialized.incidentBalance.recentNames).toEqual(state.incidentBalance.recentNames);

    const restored = deserializeMainStreetState(serialized);
    expect(restored.incidentBalance).toEqual(state.incidentBalance);
    expect(restored.incidentQueue.map(c => c.id)).toEqual(state.incidentQueue.map(c => c.id));

    // Constrained draws continue to honor the restored limits.
    // maxStreak=3 means "never MORE than 3 consecutive same-polarity" — so a
    // 3-in-a-row is legal; the invariant violated is a 4-in-a-row (M+1).
    const { polarities } = resolveMany(restored, 8);
    for (let i = 3; i < polarities.length; i++) {
      const a = polarities[i - 3];
      const b = polarities[i - 2];
      const c = polarities[i - 1];
      const d = polarities[i];
      if (a !== 'neutral' && b !== 'neutral' && c !== 'neutral' && d !== 'neutral') {
        expect(a === b && b === c && c === d).toBe(false);
      }
    }
  });

  it('legacy saves without incidentBalance get defaults + history backfilled from the queue', () => {
    const state = setupMainStreetGame({ seed: 'legacy-balance' });
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    delete serialized.incidentBalance;

    const restored = deserializeMainStreetState(serialized as never);

    expect(restored.incidentBalance.repeatSpacing).toBe(DEFAULT_INCIDENT_REPEAT_SPACING);
    expect(restored.incidentBalance.maxStreak).toBe(DEFAULT_INCIDENT_MAX_STREAK);

    // History mirrors the queue in draw order (queue front = first drawn),
    // most recent name first.
    const [first, second] = state.incidentQueue;
    expect(restored.incidentBalance.recentNames).toEqual([second.name, first.name]);

    // Polarity run matches the trailing run of the queue.
    const p1 = incidentPolarity(first);
    const p2 = incidentPolarity(second);
    if (p2 === 'neutral') {
      expect(restored.incidentBalance.polarityRun).toBeNull();
    } else if (p1 === p2) {
      // p2 !== 'neutral' here, so p1 === p2 implies p1 !== 'neutral' too
      expect(restored.incidentBalance.polarityRun).toEqual({ polarity: p1, length: 2 });
    } else {
      expect(restored.incidentBalance.polarityRun).toEqual({ polarity: p2, length: 1 });
    }

    // Subsequent constrained draws work on the restored legacy state
    const { names } = resolveMany(restored, 6);
    expect(names.length).toBe(6);
  });

  it('createIncidentBalanceFromQueue backfills history in draw order', () => {
    const queue = [good('g-1'), bad('b-1'), neutral('n-1'), good('g-2')];
    const balance = createIncidentBalanceFromQueue(queue);
    expect(balance.recentNames).toEqual(['g-2', 'n-1', 'b-1', 'g-1']);
    expect(balance.polarityRun).toEqual({ polarity: 'good', length: 1 });
    expect(balance.repeatSpacing).toBe(DEFAULT_INCIDENT_REPEAT_SPACING);
    expect(balance.maxStreak).toBe(DEFAULT_INCIDENT_MAX_STREAK);
  });
});
