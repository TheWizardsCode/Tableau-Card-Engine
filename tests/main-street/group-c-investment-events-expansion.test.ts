/**
 * Main Street: Group C — Investment event expansion tests (CG-0MSQJ244M0055X7S)
 *
 * Validates the 8 new investment-event cards added by the "Main Street: design
 * 50+ new cards of varying types" epic (CG-0MSQE2NLX003ADIY), Group C:
 *
 * - Investment-event template count grows from 13 to 21 (AC1).
 * - Two NEW duration effect types are engine-supported and unit-tested (AC2):
 *   positive `income-multiplier` (Tourist Season 1.15×, 3 turns) and
 *   `rep-multiplier` (Community Renovation 1.2×, 4 turns) — they apply and
 *   expire correctly through the ActiveEffect path.
 * - Existing negative `income-multiplier` duration events (Flu Outbreak,
 *   Recession) still work — no regression (AC5).
 * - Every new card appears in `CARD_TIER_MAP` (AC3) and all IDs are unique (AC4).
 * - Balance guardrails (1/3 cost spread, CSV validation) hold (AC6).
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
  isDurationEventCard,
  type EventCard,
  type DurationEventCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { resolveEvent, processEndOfTurn, executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import { applyIncome, recalculateCard } from '../../example-games/main-street/MainStreetAdjacency';
import { createSeededRng } from '../../src/core-engine';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Design contract (from epic CG-0MSQE2NLX003ADIY, Group C) ──────────

interface NewEventContract {
  id: string;
  name: string;
  cost: number;
  tier: string;
  targetSynergy?: SynergyType;
  coinDelta: number;
  reputationDelta: number;
  /** Present only for the two duration events. */
  duration?: number;
  effectType?: string;
  multiplier?: number;
}

const NEW_EVENT_CONTRACTS: NewEventContract[] = [
  { id: 'evt-health-carnival', name: 'Health Carnival', cost: 500, tier: '7', targetSynergy: 'Health', coinDelta: 200, reputationDelta: 100 },
  { id: 'evt-food-tasting', name: 'Food Tasting Tour', cost: 500, tier: '7', targetSynergy: 'Food', coinDelta: 200, reputationDelta: 100 },
  { id: 'evt-art-sale', name: 'Art Sale', cost: 500, tier: '7', targetSynergy: 'Culture', coinDelta: 200, reputationDelta: 100 },
  { id: 'evt-shopping-spree', name: 'Shopping Spree', cost: 700, tier: '8', targetSynergy: 'Commerce', coinDelta: 250, reputationDelta: 0 },
  { id: 'evt-summer-fest', name: 'Summer Fest', cost: 700, tier: '8', targetSynergy: 'Entertainment', coinDelta: 200, reputationDelta: 100 },
  { id: 'evt-service-week', name: 'Service Week', cost: 700, tier: '8', targetSynergy: 'Service', coinDelta: 200, reputationDelta: 100 },
  { id: 'evt-tourist-season', name: 'Tourist Season', cost: 1000, tier: '12', coinDelta: 0, reputationDelta: 0, duration: 3, effectType: 'income-multiplier', multiplier: 1.15 },
  { id: 'evt-community-renovation', name: 'Community Renovation', cost: 1000, tier: '12', coinDelta: 0, reputationDelta: 0, duration: 4, effectType: 'rep-multiplier', multiplier: 1.2 },
];

function findTemplate<T extends EventCard>(cards: readonly T[], id: string): T | undefined {
  // Event deck cards carry a sequential serial suffix (evt-x-21); match on the
  // base template id.
  return cards.find(c => c.id.startsWith(id));
}

// ── AC1: Template count ───────────────────────────────────────────────

describe('Group C investment-event expansion: template count (AC1)', () => {
  const rng = createSeededRng(42);
  const deck = createEventDeck(1, undefined, rng, 1);

  it('grows total event templates (56 after Group D + Graffiti Art)', () => {
    expect(deck).toHaveLength(56); // +1 Graffiti Art (CG-0MSRC9UR9006FBXC)
  });

  it('grows investment-event templates from 13 to exactly 21', () => {
    const investments = deck.filter(c => c.trigger === 'Investment');
    expect(investments).toHaveLength(21);
  });

  it('adds exactly the 8 contracted card IDs', () => {
    const existingIds = new Set(getCsvRows().filter(r => r.family === 'event').map(r => r.id));
    for (const c of NEW_EVENT_CONTRACTS) {
      expect(existingIds.has(c.id), `${c.id} missing from card-data.csv`).toBe(true);
    }
  });
});

// ── AC3/AC4: Tier map membership & uniqueness ─────────────────────────

describe('Group C investment-event expansion: tier map & uniqueness (AC3/AC4)', () => {
  it('keeps every card ID in the CSV unique', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every new card to its contracted tier in CARD_TIER_MAP', () => {
    for (const c of NEW_EVENT_CONTRACTS) {
      expect(CARD_TIER_MAP.get(c.id), `${c.id} tier mismatch`).toBe(c.tier);
    }
  });

  it('registers every new card in CARD_TEMPLATE_NAMES', () => {
    for (const c of NEW_EVENT_CONTRACTS) {
      expect(CARD_TEMPLATE_NAMES.get(c.id)).toBe(c.name);
    }
  });
});

// ── Design contract stats ─────────────────────────────────────────────

describe('Group C investment-event expansion: design contract stats', () => {
  const rng = createSeededRng(7);
  const deck = createEventDeck(1, undefined, rng, 1);

  for (const contract of NEW_EVENT_CONTRACTS) {
    it(`matches the contract for ${contract.id} (${contract.name})`, () => {
      const card = findTemplate(deck, contract.id);
      expect(card, `${contract.id} missing`).toBeDefined();
      expect(card!.name).toBe(contract.name);
      expect(card!.cost).toBe(contract.cost);
      expect(card!.trigger).toBe('Investment');
      if (contract.targetSynergy) {
        expect(card!.targetSynergy).toBe(contract.targetSynergy);
      }
      expect(card!.coinDelta).toBe(contract.coinDelta);
      expect(card!.reputationDelta).toBe(contract.reputationDelta);
      if (contract.duration !== undefined) {
        expect(isDurationEventCard(card)).toBe(true);
        const d = card as DurationEventCard;
        expect(d.duration).toBe(contract.duration);
        expect(d.effectType).toBe(contract.effectType);
        expect(d.multiplier).toBe(contract.multiplier);
      } else {
        expect(isDurationEventCard(card)).toBe(false);
      }
      expect(card!.effect.length).toBeGreaterThan(0);
    });
  }
});

// ── AC2: New duration effect types ────────────────────────────────────

/** Minimal BusinessCard helper for income tests. */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: 300,
    baseIncome: 1000,
    synergyTypes: ['Food'],
    upgradePath: undefined,
    maxLevel: 1,
    description: 'Test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

function makeDurationEvent(id: string, effectType: string, multiplier: number, duration: number): DurationEventCard {
  return {
    family: 'event',
    id,
    name: id,
    trigger: 'Investment',
    cost: 1000,
    effect: `${id} effect`,
    target: 'All',
    coinDelta: 0,
    reputationDelta: 0,
    duration,
    effectType,
    multiplier,
  };
}

describe('Group C: positive income-multiplier (Tourist Season)', () => {
  it('boosts income above the base when resolved and income is applied', () => {
    const state = setupMainStreetGame({ seed: 'group-c-income-boost' });
    state.streetGrid[0] = makeBiz({ baseIncome: 1000, id: 'biz-test-income' });
    recalculateCard(state, 0);

    // Baseline income (no effect)
    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);
    const normalIncome = state.resourceBank.coins - coinsBefore;

    // Resolve Tourist Season: +15% income for 3 turns
    resolveEvent(state, makeDurationEvent('evt-tourist-season', 'income-multiplier', 1.15, 3));
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0].effectType).toBe('income-multiplier');
    expect(state.activeEffects[0].multiplier).toBe(1.15);
    expect(state.activeEffects[0].turnsRemaining).toBe(3);

    const coinsBeforeBoost = state.resourceBank.coins;
    applyIncome(state);
    const boostedIncome = state.resourceBank.coins - coinsBeforeBoost;

    // 1000 base × 1.15 = 1150 > 1000 (integer-rounded).
    expect(boostedIncome).toBeGreaterThan(normalIncome);
    expect(boostedIncome).toBeCloseTo(normalIncome * 1.15, -1);
  });
});

describe('Group C: rep-multiplier (Community Renovation)', () => {
  it('scales per-turn reputation income by the multiplier', () => {
    const state = setupMainStreetGame({ seed: 'group-c-rep-boost' });
    // A card with +10 rep/turn (e.g. Clinic-style reputation asset)
    state.streetGrid[0] = makeBiz({ baseIncome: 0, id: 'biz-test-rep' });
    state.streetGrid[0].reputationPerTurn = 10;
    state.streetGrid[0].currentReputationPerTurn = 10;
    recalculateCard(state, 0);

    // Baseline rep gain (no effect)
    const repBefore = state.resourceBank.reputation;
    applyIncome(state);
    const normalRepGain = state.resourceBank.reputation - repBefore;
    expect(normalRepGain).toBeCloseTo(10, 5);

    // Resolve Community Renovation: +20% reputation for 4 turns
    resolveEvent(state, makeDurationEvent('evt-community-renovation', 'rep-multiplier', 1.2, 4));
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0].effectType).toBe('rep-multiplier');
    expect(state.activeEffects[0].multiplier).toBe(1.2);
    expect(state.activeEffects[0].turnsRemaining).toBe(4);

    const repBeforeBoost = state.resourceBank.reputation;
    applyIncome(state);
    const boostedRepGain = state.resourceBank.reputation - repBeforeBoost;

    expect(boostedRepGain).toBeGreaterThan(normalRepGain);
    expect(boostedRepGain).toBeCloseTo(normalRepGain * 1.2, 0);
  });

  it('applies no rep bonus when no rep-producing cards are placed', () => {
    const state = setupMainStreetGame({ seed: 'group-c-rep-empty' });
    const repBefore = state.resourceBank.reputation;
    resolveEvent(state, makeDurationEvent('evt-community-renovation', 'rep-multiplier', 1.2, 4));
    applyIncome(state);
    expect(state.resourceBank.reputation).toBe(repBefore);
  });
});

describe('Group C: duration expiry (AC2)', () => {
  it('income-multiplier and rep-multiplier effects expire after their duration', () => {
    const state = setupMainStreetGame({ seed: 'group-c-expiry' });
    // Drain the pre-filled incident queue: the seeded draw can now include the
    // duration incident (Labor Shortage), which would add an unrelated active
    // effect and break the expiry window assertion. This test is scoped to the
    // two manually-resolved duration effects.
    state.incidentDeck = [];
    state.streetGrid[0] = makeBiz({ baseIncome: 1000, id: 'biz-test-exp' });
    state.streetGrid[0].reputationPerTurn = 10;
    state.streetGrid[0].currentReputationPerTurn = 10;
    recalculateCard(state, 0);

    // Tourist Season (3 turns) + Community Renovation (4 turns)
    resolveEvent(state, makeDurationEvent('evt-tourist-season', 'income-multiplier', 1.15, 3));
    resolveEvent(state, makeDurationEvent('evt-community-renovation', 'rep-multiplier', 1.2, 4));
    expect(state.activeEffects).toHaveLength(2);

    // Run 4 full turns: Tourist Season expires at end of turn 3; Renovation at end of turn 4.
    for (let t = 0; t < 4; t++) {
      executeDayStart(state);
      processEndOfTurn(state);
    }
    // Both effects expired (removed by decay).
    expect(state.activeEffects).toHaveLength(0);
  });
});

describe('Group C: clinic does NOT shorten positive duration effects', () => {
  it('keeps Tourist Season at full duration when a Clinic is present', () => {
    const state = setupMainStreetGame({ seed: 'group-c-clinic-positive' });
    // Place a Clinic on the grid (would reduce negative effect durations).
    state.decks.business.push(makeBiz({ baseIncome: 0, id: 'biz-clinic' }));
    state.streetGrid[0] = { ...makeBiz({ baseIncome: 0, id: 'biz-clinic' }), id: 'biz-clinic' };

    resolveEvent(state, makeDurationEvent('evt-tourist-season', 'income-multiplier', 1.15, 3));
    expect(state.activeEffects[0].turnsRemaining).toBe(3);

    // And Community Renovation keeps its full 4 turns too.
    resolveEvent(state, makeDurationEvent('evt-community-renovation', 'rep-multiplier', 1.2, 4));
    expect(state.activeEffects[1].turnsRemaining).toBe(4);
  });
});

// ── AC5: Negative income-multiplier still works (no regression) ───────

describe('Group C: existing negative income-multiplier (regression)', () => {
  it('still reduces income when a flu-style effect is resolved', () => {
    const state = setupMainStreetGame({ seed: 'group-c-negative' });
    state.streetGrid[0] = makeBiz({ baseIncome: 1000, id: 'biz-test-neg' });
    recalculateCard(state, 0);

    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);
    const normalIncome = state.resourceBank.coins - coinsBefore;

    resolveEvent(state, makeDurationEvent('evt-flu-outbreak', 'income-multiplier', 0.8, 5));
    const coinsBeforeReduced = state.resourceBank.coins;
    applyIncome(state);
    const reducedIncome = state.resourceBank.coins - coinsBeforeReduced;

    expect(reducedIncome).toBeLessThan(normalIncome);
    expect(reducedIncome).toBeCloseTo(normalIncome * 0.8, 0);
  });

  it('keeps the clinic duration reduction for negative effects', () => {
    const state = setupMainStreetGame({ seed: 'group-c-clinic-negative' });
    state.streetGrid[0] = { ...makeBiz({ baseIncome: 0, id: 'biz-clinic' }), id: 'biz-clinic' };

    resolveEvent(state, makeDurationEvent('evt-flu-outbreak', 'income-multiplier', 0.8, 5));
    expect(state.activeEffects[0].turnsRemaining).toBe(3); // 5 - 2 (Clinic)
  });
});

// ── Deck generation & balance guardrails ──────────────────────────────

describe('Group C: deck generation & balance guardrails (AC6)', () => {
  const rng = createSeededRng(42);

  it('builds a 165-card event deck at the default 3 copies', () => {
    expect(createEventDeck(3, undefined, createSeededRng(1), 1)).toHaveLength(168); // 56 x 3 (+1 Graffiti Art)
  });

  it('includes every new card in a 1-copy (template) deck', () => {
    const ids = createEventDeck(1, undefined, rng, 1).map(c => c.id.replace(/-\d+$/, ''));
    for (const c of NEW_EVENT_CONTRACTS) {
      expect(ids, `${c.id} absent from event deck`).toContain(c.id);
    }
  });

  it('initialises a full game with the expanded event pool', () => {
    const state = setupMainStreetGame({ seed: 'group-c-expansion' });
    const allIds = new Set([
      ...state.decks.event.map(c => c.id.replace(/-\d+$/, '')),
      ...state.market.cards.map(c => c.id.replace(/-\d+$/, '')),
      ...state.incidentDeck.map(c => c.id.replace(/-\d+$/, '')),
      ...(state.hand ?? []).map(c => c.id.replace(/-\d+$/, '')),
    ]);
    for (const c of NEW_EVENT_CONTRACTS) {
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
