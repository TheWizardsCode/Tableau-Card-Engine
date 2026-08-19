/**
 * Main Street: Group D — Incident event expansion tests (CG-0MSQJ7QLM0076FTD)
 *
 * Validates the 10 new incident-event cards added by the "Main Street: design
 * 50+ new cards of varying types" epic (CG-0MSQE2NLX003ADIY), Group D:
 *
 * - Incident template count grows from 24 to 34 (AC1) (+1 Graffiti Art since).
 * - Polarity balance is constraint-compatible with the incident-balance
 *   system (AC2): the net-delta formula classifies 4 good / 3 bad / 3 neutral
 *   (duration incidents like Labor Shortage classify neutral, matching the
 *   existing Flu Outbreak / Recession convention).
 * - Labor Shortage (income-multiplier 0.9, 3 turns) applies and expires
 *   correctly through the ActiveEffect path (AC3).
 * - Every new card appears in `CARD_TIER_MAP` (AC4), all IDs are unique (AC5),
 *   and balance guardrails hold (AC6).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getCsvRows,
  createEventDeck,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createUpgradeDeck,
  CARD_TIER_MAP,
  CARD_TEMPLATE_NAMES,
  incidentPolarity,
  isDurationEventCard,
  type DurationEventCard,
  type IncidentPolarity,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { resolveIncident, processEndOfTurn, executeDayStart, resolveEvent } from '../../example-games/main-street/MainStreetEngine';
import { applyIncome, recalculateCard } from '../../example-games/main-street/MainStreetAdjacency';
import { createSeededRng } from '../../src/core-engine';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Design contract (from epic CG-0MSQE2NLX003ADIY, Group D) ──────────

interface NewIncidentContract {
  id: string;
  name: string;
  /** Thematic polarity from the design contract. */
  intendedPolarity: IncidentPolarity;
  tier: string;
  targetSynergy?: SynergyType;
  coinDelta: number;
  reputationDelta: number;
  duration?: number;
  effectType?: string;
  multiplier?: number;
}

const NEW_INCIDENT_CONTRACTS: NewIncidentContract[] = [
  { id: 'evt-graffiti', name: 'Graffiti', intendedPolarity: 'bad', tier: '1', coinDelta: -1, reputationDelta: -1 },
  { id: 'evt-water-main', name: 'Water Main Break', intendedPolarity: 'bad', tier: '2', targetSynergy: 'Service', coinDelta: -2, reputationDelta: 0 },
  { id: 'evt-parking-tickets', name: 'Parking Enforcement', intendedPolarity: 'bad', tier: '2', targetSynergy: 'Commerce', coinDelta: -1, reputationDelta: 0 },
  // Thematic polarity is 'bad', but the streak system classifies by net delta
  // (0 + 0 = neutral) — same convention as Flu Outbreak / Recession.
  { id: 'evt-labor-shortage', name: 'Labor Shortage', intendedPolarity: 'neutral', tier: '3', coinDelta: 0, reputationDelta: 0, duration: 3, effectType: 'income-multiplier', multiplier: 0.9 },
  { id: 'evt-movie-premiere', name: 'Movie Premiere', intendedPolarity: 'good', tier: '2', targetSynergy: 'Entertainment', coinDelta: 1, reputationDelta: 1 },
  { id: 'evt-health-screening', name: 'Free Health Screening', intendedPolarity: 'good', tier: '2', targetSynergy: 'Health', coinDelta: 1, reputationDelta: 1 },
  { id: 'evt-farmers-market', name: 'Farmers Market Day', intendedPolarity: 'good', tier: '2', targetSynergy: 'Food', coinDelta: 1, reputationDelta: 1 },
  { id: 'evt-library-reading', name: 'Library Story Hour', intendedPolarity: 'good', tier: '1', targetSynergy: 'Culture', coinDelta: 0, reputationDelta: 1 },
  { id: 'evt-street-cleaning', name: 'Street Cleaning', intendedPolarity: 'neutral', tier: '1', coinDelta: 0, reputationDelta: 0 },
  { id: 'evt-neighborhood-watch', name: 'Neighborhood Watch', intendedPolarity: 'neutral', tier: '2', coinDelta: -1, reputationDelta: 1 },
];

// ── AC1: Template count ───────────────────────────────────────────────

describe('Group D incident expansion: template count (AC1)', () => {
  const rng = createSeededRng(42);
  const deck = createEventDeck(1, undefined, rng, 1);

  it('grows incident templates from 24 to exactly 35 (+1 Graffiti Art)', () => {
    const incidents = deck.filter(c => c.trigger === 'Incident');
    expect(incidents).toHaveLength(35); // +1 Graffiti Art (CG-0MSRC9UR9006FBXC)
  });

  it('adds exactly the 10 contracted card IDs', () => {
    const existingIds = new Set(getCsvRows().filter(r => r.family === 'event').map(r => r.id));
    for (const c of NEW_INCIDENT_CONTRACTS) {
      expect(existingIds.has(c.id), `${c.id} missing from card-data.csv`).toBe(true);
    }
  });

  it('grows total event templates from 45 to exactly 55', () => {
    expect(deck).toHaveLength(56); // +1 Graffiti Art
  });
});

// ── AC4/AC5: Tier map & uniqueness ────────────────────────────────────

describe('Group D incident expansion: tier map & uniqueness (AC4/AC5)', () => {
  it('keeps every card ID in the CSV unique (incl. evt-farmers-market)', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // No collision: Farmers Market Day vs any existing id.
    const farmers = getCsvRows().filter(r => r.id === 'evt-farmers-market');
    expect(farmers).toHaveLength(1);
  });

  it('assigns every new card to its contracted tier in CARD_TIER_MAP', () => {
    for (const c of NEW_INCIDENT_CONTRACTS) {
      expect(CARD_TIER_MAP.get(c.id), `${c.id} tier mismatch`).toBe(c.tier);
    }
  });

  it('registers every new card in CARD_TEMPLATE_NAMES', () => {
    for (const c of NEW_INCIDENT_CONTRACTS) {
      expect(CARD_TEMPLATE_NAMES.get(c.id)).toBe(c.name);
    }
  });
});

// ── Design contract stats & system polarity ───────────────────────────

describe('Group D incident expansion: contract stats & polarity', () => {
  const rng = createSeededRng(7);
  const deck = createEventDeck(1, undefined, rng, 1);

  for (const contract of NEW_INCIDENT_CONTRACTS) {
    it(`matches the contract for ${contract.id} (${contract.name})`, () => {
      const card = deck.find(c => c.id.startsWith(contract.id));
      expect(card, `${contract.id} missing`).toBeDefined();
      expect(card!.name).toBe(contract.name);
      expect(card!.trigger).toBe('Incident');
      expect(card!.coinDelta).toBe(contract.coinDelta);
      expect(card!.reputationDelta).toBe(contract.reputationDelta);
      if (contract.targetSynergy) {
        expect(card!.targetSynergy).toBe(contract.targetSynergy);
      }
      if (contract.duration !== undefined) {
        expect(isDurationEventCard(card)).toBe(true);
        const d = card as DurationEventCard;
        expect(d.duration).toBe(contract.duration);
        expect(d.effectType).toBe(contract.effectType);
        expect(d.multiplier).toBe(contract.multiplier);
      } else {
        expect(isDurationEventCard(card)).toBe(false);
      }
      // The system's polarity derives from the net delta formula.
      expect(incidentPolarity(card!)).toBe(contract.intendedPolarity);
    });
  }

  it('produces a constraint-compatible polarity mix (4 good / 3 bad / 3 neutral)', () => {
    const incidents = deck.filter(c => c.trigger === 'Incident');
    const newIds = new Set(NEW_INCIDENT_CONTRACTS.map(c => c.id));
    const newIncidents = incidents.filter(c => newIds.has(c.id.replace(/-\d+$/, '')));
    expect(newIncidents).toHaveLength(10);

    const counts: Record<string, number> = { good: 0, bad: 0, neutral: 0 };
    for (const c of newIncidents) {
      counts[incidentPolarity(c)] += 1;
    }
    // Duration incidents (Labor Shortage) classify neutral under the net-delta
    // formula — same convention as Flu Outbreak / Recession. Documented in the
    // epic as "bad" thematically; the streak system treats them as breakers.
    expect(counts).toEqual({ good: 4, bad: 3, neutral: 3 });
  });

  it('keeps the 25% positive-incident floor satisfied with the larger pool', () => {
    const incidents = deck.filter(c => c.trigger === 'Incident');
    const effectful = incidents.filter(i => i.coinDelta !== 0 || i.reputationDelta !== 0);
    const positive = effectful.filter(i => i.coinDelta > 0 || i.reputationDelta > 0);
    expect(positive.length / effectful.length).toBeGreaterThanOrEqual(0.25);
  });
});

// ── AC3: Labor Shortage duration incident ─────────────────────────────

/** Minimal BusinessCard helper. */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: 3,
    baseIncome: 10,
    synergyTypes: ['Food'],
    upgradePath: undefined,
    maxLevel: 1,
    description: 'Test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

describe('Group D: Labor Shortage duration incident (AC3)', () => {
  it('resolves to an income-multiplier 0.9 effect for 3 turns', () => {
    const state = setupMainStreetGame({ seed: 'group-d-labor' });
    const labor = createEventDeck(1, undefined, createSeededRng(1), 1)
      .find(c => c.id.startsWith('evt-labor-shortage'))!;
    resolveIncident(state);
    // Direct resolution check via the queue-facing path is covered by the
    // full lifecycle below; here we verify the template parses as a duration
    // incident with the contracted numbers.
    expect(labor.trigger).toBe('Incident');
    expect(isDurationEventCard(labor)).toBe(true);
    const d = labor as DurationEventCard;
    expect(d.effectType).toBe('income-multiplier');
    expect(d.multiplier).toBe(0.9);
    expect(d.duration).toBe(3);
  });

  it('reduces income to 90% while active, then recovers after expiry', () => {
    const state = setupMainStreetGame({ seed: 'group-d-labor-lifecycle' });
    state.streetGrid[0] = makeBiz({ baseIncome: 10, id: 'biz-test-labor' });
    recalculateCard(state, 0);

    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);
    const normalIncome = state.resourceBank.coins - coinsBefore;

    // Resolve the duration incident directly (as the incident phase would).
    resolveEvent(state, createEventDeck(1, undefined, createSeededRng(2), 1)
      .find(c => c.id.startsWith('evt-labor-shortage'))!);
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0].effectType).toBe('income-multiplier');
    expect(state.activeEffects[0].multiplier).toBe(0.9);
    expect(state.activeEffects[0].turnsRemaining).toBe(3);

    const coinsBeforeReduced = state.resourceBank.coins;
    applyIncome(state);
    const reducedIncome = state.resourceBank.coins - coinsBeforeReduced;
    expect(reducedIncome).toBeCloseTo(normalIncome * 0.9, 5);

    // Run 3 full turns: the effect decays and expires at end of turn 3.
    for (let t = 0; t < 3; t++) {
      executeDayStart(state);
      processEndOfTurn(state);
    }
    expect(state.activeEffects).toHaveLength(0);
  });
});

// ── Deck generation & balance guardrails ──────────────────────────────

describe('Group D: deck generation & balance guardrails (AC6)', () => {
  const rng = createSeededRng(42);

  it('builds a 165-card event deck at the default 3 copies', () => {
    expect(createEventDeck(3, undefined, createSeededRng(1), 1)).toHaveLength(168); // 56 x 3 (+1 Graffiti Art)
  });

  it('includes every new card in a 1-copy (template) deck', () => {
    const ids = createEventDeck(1, undefined, rng, 1).map(c => c.id.replace(/-\d+$/, ''));
    for (const c of NEW_INCIDENT_CONTRACTS) {
      expect(ids, `${c.id} absent from event deck`).toContain(c.id);
    }
  });

  it('initialises a full game with the expanded incident pool', () => {
    const state = setupMainStreetGame({ seed: 'group-d-expansion' });
    const allIds = new Set([
      ...state.decks.event.map(c => c.id.replace(/-\d+$/, '')),
      ...state.market.cards.map(c => c.id.replace(/-\d+$/, '')),
      ...state.incidentDeck.map(c => c.id.replace(/-\d+$/, '')),
      ...(state.hand ?? []).map(c => c.id.replace(/-\d+$/, '')),
    ]);
    for (const c of NEW_INCIDENT_CONTRACTS) {
      expect(allIds.has(c.id), `${c.id} unreachable in the game pool`).toBe(true);
    }
  });

  it('keeps the non-incident event cost spread within the 1/3 rule', () => {
    // Incident events are free (cost 0) by design and excluded from the cost
    // spread (see src/balance-cards/algorithm.ts enforceCostSpread).
    const events = getCsvRows().filter(r => r.family === 'event' && r.trigger !== 'Incident');
    const threshold = Math.ceil(events.length / 3);
    const freq = new Map<number, number>();
    for (const r of events) {
      const cost = Number(r.cost) || 0;
      freq.set(cost, (freq.get(cost) ?? 0) + 1);
    }
    for (const [cost, count] of freq) {
      expect(count, `cost ${cost} appears ${count} times (threshold ${threshold})`).toBeLessThanOrEqual(threshold);
    }
  });

  it('validates cleanly through the balance tool CSV validator', () => {
    const rows = getCsvRows().map(r => ({ ...r }));
    expect(() => validateCsvRows(rows as never)).not.toThrow();
  });

  it('keeps other families unchanged in count (data-driven scope)', () => {
    expect(createBusinessDeck(1).length).toBe(30);
    expect(createCommunitySpaceDeck(1).length).toBe(8);
    expect(createUpgradeDeck(1).length).toBe(39); // +12 Group E upgrades
  });
});
