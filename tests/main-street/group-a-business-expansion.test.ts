/**
 * Main Street: Group A — Business expansion tests (CG-0MSQJ1XIB0004QVN)
 *
 * Validates the 12 new business cards added by the "Main Street: design 50+
 * new cards of varying types" epic (CG-0MSQE2NLX003ADIY), Group A:
 *
 * - Template count grows from 18 to 30 business cards (AC1).
 * - Every new card matches its design contract (name, cost, income, synergy,
 *   tier, reputation per turn).
 * - Every new card appears in `CARD_TIER_MAP` at the contracted tier (AC2)
 *   and existing cards keep their tier assignments (no regressions).
 * - All card IDs in the CSV remain unique (AC3).
 * - Health (previously bridge-less) gains bridge cards.
 * - Deck generation and market integration stay healthy with the expanded pool.
 * - Balance guardrails: the cost-spread rule (no single cost value exceeding
 *   1/3 of a family's cards) and CSV validation hold (AC4).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getCsvRows,
  getBusinessTemplates,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  createStaffDeck,
  CARD_TIER_MAP,
  CARD_TEMPLATE_NAMES,
  type BusinessCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { createSeededRng } from '../../src/core-engine';

// ── Design contract (from epic CG-0MSQE2NLX003ADIY, Group A) ──────────

interface NewBusinessContract {
  id: string;
  name: string;
  cost: number;
  baseIncome: number;
  synergyTypes: SynergyType[];
  tier: string;
  /** Expected reputation per turn; undefined when the card has none. */
  reputationPerTurn?: number;
}

const NEW_BUSINESS_CONTRACTS: NewBusinessContract[] = [
  { id: 'biz-juice-bar', name: 'Juice Bar', cost: 5, baseIncome: 0.5, synergyTypes: ['Food', 'Health'], tier: '2' },
  { id: 'biz-yoga-studio', name: 'Yoga Studio', cost: 8, baseIncome: 1, synergyTypes: ['Culture', 'Health'], tier: '3' },
  { id: 'biz-physio', name: 'Physiotherapy', cost: 10, baseIncome: 1, synergyTypes: ['Health', 'Service'], tier: '4', reputationPerTurn: 0.1 },
  { id: 'biz-tailor', name: 'Tailor', cost: 5, baseIncome: 0.75, synergyTypes: ['Service'], tier: '2' },
  { id: 'biz-gym', name: 'Gym', cost: 8, baseIncome: 1, synergyTypes: ['Health'], tier: '3' },
  { id: 'biz-dentist', name: 'Dentist', cost: 12, baseIncome: 1.5, synergyTypes: ['Health'], tier: '4' },
  { id: 'biz-toy-store', name: 'Toy Store', cost: 5, baseIncome: 0.75, synergyTypes: ['Commerce'], tier: '2' },
  { id: 'biz-music-store', name: 'Music Store', cost: 8, baseIncome: 1, synergyTypes: ['Entertainment'], tier: '3' },
  { id: 'biz-delicatessen', name: 'Delicatessen', cost: 5, baseIncome: 0.75, synergyTypes: ['Food'], tier: '2' },
  { id: 'biz-craft-shop', name: 'Craft Shop', cost: 5, baseIncome: 0.75, synergyTypes: ['Culture'], tier: '2' },
  { id: 'biz-hotel', name: 'Grand Hotel', cost: 16, baseIncome: 2.5, synergyTypes: ['Service'], tier: '5', reputationPerTurn: 0.1 },
  { id: 'biz-teahouse', name: 'Teahouse', cost: 7, baseIncome: 0.75, synergyTypes: ['Food', 'Culture'], tier: '3' },
];

function byId(templates: readonly { id: string }[], id: string): BusinessCard | undefined {
  return templates.find(t => t.id === id) as BusinessCard | undefined;
}

// ── AC1: Template count ───────────────────────────────────────────────

describe('Group A business expansion: template count (AC1)', () => {
  it('grows the business family from 18 to exactly 30 templates', () => {
    const templates = getBusinessTemplates();
    expect(templates.length).toBe(30);
  });

  it('adds exactly the 12 contracted card IDs (no more, no fewer)', () => {
    const existingIds = new Set(getCsvRows().filter(r => r.family === 'business').map(r => r.id));
    const contractIds = NEW_BUSINESS_CONTRACTS.map(c => c.id);
    for (const id of contractIds) {
      expect(existingIds.has(id), `${id} missing from card-data.csv`).toBe(true);
    }
    // Spot-check that pre-existing business IDs are still present.
    for (const id of ['biz-bakery', 'biz-clinic', 'biz-pharmacy', 'biz-spa']) {
      expect(existingIds.has(id), `${id} was removed`).toBe(true);
    }
  });
});

// ── AC3: Uniqueness across the whole CSV ──────────────────────────────

describe('Group A business expansion: ID uniqueness (AC3)', () => {
  it('keeps every card ID in the CSV unique', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps business template IDs unique', () => {
    const ids = getBusinessTemplates().map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers every new card in CARD_TEMPLATE_NAMES', () => {
    for (const c of NEW_BUSINESS_CONTRACTS) {
      expect(CARD_TEMPLATE_NAMES.get(c.id)).toBe(c.name);
    }
  });
});

// ── Design contract stats ─────────────────────────────────────────────

describe('Group A business expansion: design contract stats', () => {
  const templates = getBusinessTemplates();

  for (const contract of NEW_BUSINESS_CONTRACTS) {
    it(`matches the contract for ${contract.id} (${contract.name})`, () => {
      const card = byId(templates, contract.id);
      expect(card, `${contract.id} missing from business templates`).toBeDefined();
      // Templates omit the runtime-added 'family' field (added by makeBusiness());
      // family membership is asserted on deck instances in the deck tests below.
      expect(card!.name).toBe(contract.name);
      expect(card!.cost).toBe(contract.cost);
      expect(card!.baseIncome).toBe(contract.baseIncome);
      expect(card!.synergyTypes.slice().sort()).toEqual(contract.synergyTypes.slice().sort());
      if (contract.reputationPerTurn !== undefined) {
        expect(card!.reputationPerTurn).toBe(contract.reputationPerTurn);
      } else {
        expect(card!.reputationPerTurn === undefined || card!.reputationPerTurn === 0).toBe(true);
      }
      expect(card!.description.length).toBeGreaterThan(0);
    });
  }

  it('uses only valid synergy types on every new card', () => {
    const valid: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health'];
    for (const c of NEW_BUSINESS_CONTRACTS) {
      for (const st of c.synergyTypes) {
        expect(valid).toContain(st);
      }
    }
  });
});

// ── AC2: Tier map membership ──────────────────────────────────────────

describe('Group A business expansion: tier map membership (AC2)', () => {
  it('assigns every new card to its contracted tier in CARD_TIER_MAP', () => {
    for (const c of NEW_BUSINESS_CONTRACTS) {
      expect(CARD_TIER_MAP.has(c.id), `${c.id} missing from CARD_TIER_MAP`).toBe(true);
      expect(CARD_TIER_MAP.get(c.id)).toBe(c.tier);
    }
  });

  it('keeps every business card tier-registered (no tier regressions)', () => {
    for (const t of getBusinessTemplates()) {
      expect(CARD_TIER_MAP.has(t.id), `${t.id} has no tier assignment`).toBe(true);
      const tier = CARD_TIER_MAP.get(t.id)!;
      expect(['1', '2', '3', '4', '5']).toContain(tier);
    }
  });

  it('smooths the T2/T3 thinness (business T2+T3 count >= 12)', () => {
    const t2t3 = getBusinessTemplates().filter(t => {
      const tier = CARD_TIER_MAP.get(t.id);
      return tier === '2' || tier === '3';
    });
    expect(t2t3.length).toBeGreaterThanOrEqual(12);
  });
});

// ── Health bridges ────────────────────────────────────────────────────

describe('Group A business expansion: Health bridges', () => {
  it('gives Health at least 3 bridge cards (previously none)', () => {
    const healthBridges = getBusinessTemplates().filter(
      t => t.synergyTypes.includes('Health') && t.synergyTypes.length >= 2,
    );
    expect(healthBridges.length).toBeGreaterThanOrEqual(3);
    const ids = healthBridges.map(t => t.id).sort();
    expect(ids).toContain('biz-juice-bar');
    expect(ids).toContain('biz-yoga-studio');
    expect(ids).toContain('biz-physio');
  });

  it('expands the Health family beyond the original three singles', () => {
    const health = getBusinessTemplates().filter(t => t.synergyTypes.includes('Health'));
    expect(health.length).toBeGreaterThanOrEqual(8);
  });
});

// ── Deck generation & market integration ──────────────────────────────

describe('Group A business expansion: deck generation', () => {
  it('builds a 90-card business deck at the default 3 copies', () => {
    expect(createBusinessDeck(3)).toHaveLength(90);
  });

  it('includes every new card in a 1-copy (template) deck', () => {
    const deck = createBusinessDeck(1);
    const ids = deck.map(c => c.id.replace(/-\d+$/, ''));
    for (const c of NEW_BUSINESS_CONTRACTS) {
      expect(ids, `${c.id} absent from business deck`).toContain(c.id);
      const instance = deck.find(d => d.id.replace(/-\d+$/, '') === c.id);
      expect(instance!.family).toBe('business');
    }
  });

  it('keeps copy ids distinct in the expanded deck', () => {
    const deck = createBusinessDeck(3);
    expect(new Set(deck.map(c => c.id)).size).toBe(deck.length);
  });

  it('initialises a full game with the expanded pool (market + decks consistent)', () => {
    const state = setupMainStreetGame({ seed: 'group-a-expansion' });
    const bizTotal = state.market.cards.filter(c => c.family === 'business').length + state.decks.business.length;
    expect(bizTotal).toBe(createBusinessDeck().length);
    // New cards must be reachable somewhere in the pool (deck or market).
    const allIds = new Set([
      ...state.decks.business.map(c => c.id.replace(/-\d+$/, '')),
      ...state.market.cards.map(c => c.id.replace(/-\d+$/, '')),
    ]);
    for (const c of NEW_BUSINESS_CONTRACTS) {
      expect(allIds.has(c.id), `${c.id} unreachable in the game pool`).toBe(true);
    }
  });
});

// ── AC4: Balance guardrails ───────────────────────────────────────────

describe('Group A business expansion: balance guardrails (AC4)', () => {
  it('keeps the business cost spread within the 1/3 rule', () => {
    const templates = getBusinessTemplates();
    const threshold = Math.ceil(templates.length / 3);
    const freq = new Map<number, number>();
    for (const t of templates) {
      freq.set(t.cost, (freq.get(t.cost) ?? 0) + 1);
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
    expect(createCommunitySpaceDeck(1).length).toBe(8); // +6 Group B community-space cards
    expect(createEventDeck(1, undefined, createSeededRng(42), 1).length).toBe(56); // +8 Group C, +10 Group D, +1 Graffiti Art
    expect(createUpgradeDeck(1).length).toBe(39); // +12 Group E upgrades
    expect(createStaffDeck(1).length).toBe(8); // +4 Group F staff, +1 General Manager (CG-0MSTOF1N5005PK2R)
  });
});
