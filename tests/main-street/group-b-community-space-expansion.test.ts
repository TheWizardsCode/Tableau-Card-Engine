/**
 * Main Street: Group B — Community Space expansion tests (CG-0MSQJ210I00491ZZ)
 *
 * Validates the 6 new community-space cards added by the "Main Street: design
 * 50+ new cards of varying types" epic (CG-0MSQE2NLX003ADIY), Group B:
 *
 * - Template count grows from 2 to 8 community-space cards (AC1).
 * - Every new card matches its design contract (name, cost, income, ongoing
 *   cost, synergy, tier, reputation per turn).
 * - Every new card appears in `CARD_TIER_MAP` at the contracted tier (AC2)
 *   and existing cards keep their tier assignments.
 * - All card IDs in the CSV remain unique, including the near-collision
 *   `cs-community-garden` vs `evt-community-garden` (AC3).
 * - Ongoing-cost mechanics behave correctly in the income phase (AC4):
 *   cards with an ongoing cost are charged; zero-cost cards are not.
 * - Deck generation and market integration stay healthy with the expanded
 *   family.
 * - Balance guardrails: cost-spread rule and CSV validation hold (AC5).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getCsvRows,
  getCommunitySpaceTemplates,
  createCommunitySpaceDeck,
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
  CARD_TIER_MAP,
  CARD_TEMPLATE_NAMES,
  type CommunitySpaceCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { applyCommunitySpaceOngoingCosts } from '../../example-games/main-street/MainStreetEngine';
import { createSeededRng } from '../../src/core-engine';

// ── Design contract (from epic CG-0MSQE2NLX003ADIY, Group B) ──────────

interface NewCommunitySpaceContract {
  id: string;
  name: string;
  cost: number;
  baseIncome: number;
  ongoingCost: number;
  synergyTypes: SynergyType[];
  tier: string;
  reputationPerTurn: number;
}

const NEW_COMMUNITY_SPACE_CONTRACTS: NewCommunitySpaceContract[] = [
  { id: 'cs-playground', name: 'Playground', cost: 4, baseIncome: 0, ongoingCost: 0, synergyTypes: ['Entertainment'], tier: '2', reputationPerTurn: 0.05 },
  { id: 'cs-community-garden', name: 'Community Garden', cost: 5, baseIncome: 0, ongoingCost: 0.1, synergyTypes: ['Food'], tier: '2', reputationPerTurn: 0.1 },
  { id: 'cs-fountain', name: 'Town Fountain', cost: 5, baseIncome: 0, ongoingCost: 0, synergyTypes: ['Culture'], tier: '3', reputationPerTurn: 0.1 },
  { id: 'cs-health-kiosk', name: 'Health Kiosk', cost: 6, baseIncome: 0, ongoingCost: 0.15, synergyTypes: ['Health'], tier: '3', reputationPerTurn: 0.15 },
  { id: 'cs-shelter', name: 'Community Shelter', cost: 6, baseIncome: 0, ongoingCost: 0, synergyTypes: ['Service'], tier: '4', reputationPerTurn: 0.15 },
  { id: 'cs-public-art', name: 'Public Art', cost: 8, baseIncome: 0, ongoingCost: 0.25, synergyTypes: ['Culture', 'Entertainment'], tier: '5', reputationPerTurn: 0.2 },
];

function byId(templates: readonly { id: string }[], id: string): CommunitySpaceCard | undefined {
  return templates.find(t => t.id === id) as CommunitySpaceCard | undefined;
}

// ── AC1: Template count ───────────────────────────────────────────────

describe('Group B community-space expansion: template count (AC1)', () => {
  it('grows the community-space family from 2 to exactly 8 templates', () => {
    expect(getCommunitySpaceTemplates().length).toBe(8);
  });

  it('adds exactly the 6 contracted card IDs (no more, no fewer)', () => {
    const existingIds = new Set(getCsvRows().filter(r => r.family === 'community-space').map(r => r.id));
    for (const c of NEW_COMMUNITY_SPACE_CONTRACTS) {
      expect(existingIds.has(c.id), `${c.id} missing from card-data.csv`).toBe(true);
    }
    for (const id of ['cs-park', 'cs-library']) {
      expect(existingIds.has(id), `${id} was removed`).toBe(true);
    }
  });
});

// ── AC3: Uniqueness across the whole CSV ──────────────────────────────

describe('Group B community-space expansion: ID uniqueness (AC3)', () => {
  it('keeps every card ID in the CSV unique', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('distinguishes cs-community-garden from the existing evt-community-garden', () => {
    const rows = getCsvRows();
    const cs = rows.find(r => r.id === 'cs-community-garden');
    const evt = rows.find(r => r.id === 'evt-community-garden');
    expect(cs).toBeDefined();
    expect(evt).toBeDefined();
    expect(cs!.family).toBe('community-space');
    expect(evt!.family).toBe('event');
    expect(cs!.id).not.toBe(evt!.id);
  });

  it('registers every new card in CARD_TEMPLATE_NAMES', () => {
    for (const c of NEW_COMMUNITY_SPACE_CONTRACTS) {
      expect(CARD_TEMPLATE_NAMES.get(c.id)).toBe(c.name);
    }
  });
});

// ── Design contract stats ─────────────────────────────────────────────

describe('Group B community-space expansion: design contract stats', () => {
  const templates = getCommunitySpaceTemplates();

  for (const contract of NEW_COMMUNITY_SPACE_CONTRACTS) {
    it(`matches the contract for ${contract.id} (${contract.name})`, () => {
      const card = byId(templates, contract.id);
      expect(card, `${contract.id} missing from community-space templates`).toBeDefined();
      expect(card!.name).toBe(contract.name);
      expect(card!.cost).toBe(contract.cost);
      expect(card!.baseIncome).toBe(contract.baseIncome);
      expect(card!.ongoingCost).toBe(contract.ongoingCost);
      expect(card!.synergyTypes.slice().sort()).toEqual(contract.synergyTypes.slice().sort());
      expect(card!.reputationPerTurn).toBe(contract.reputationPerTurn);
      expect(card!.description.length).toBeGreaterThan(0);
    });
  }

  it('uses only valid synergy types on every new card', () => {
    const valid: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health'];
    for (const c of NEW_COMMUNITY_SPACE_CONTRACTS) {
      for (const st of c.synergyTypes) {
        expect(valid).toContain(st);
      }
    }
  });
});

// ── AC2: Tier map membership ──────────────────────────────────────────

describe('Group B community-space expansion: tier map membership (AC2)', () => {
  it('assigns every new card to its contracted tier in CARD_TIER_MAP', () => {
    for (const c of NEW_COMMUNITY_SPACE_CONTRACTS) {
      expect(CARD_TIER_MAP.has(c.id), `${c.id} missing from CARD_TIER_MAP`).toBe(true);
      expect(CARD_TIER_MAP.get(c.id)).toBe(c.tier);
    }
  });

  it('keeps every community-space card tier-registered (no tier regressions)', () => {
    for (const t of getCommunitySpaceTemplates()) {
      expect(CARD_TIER_MAP.has(t.id), `${t.id} has no tier assignment`).toBe(true);
      expect(['1', '2', '3', '4', '5']).toContain(CARD_TIER_MAP.get(t.id));
    }
  });
});

// ── Deck generation & market integration ──────────────────────────────

describe('Group B community-space expansion: deck generation', () => {
  it('builds a 24-card community-space deck at the default 3 copies', () => {
    expect(createCommunitySpaceDeck(3)).toHaveLength(24);
  });

  it('includes every new card in a 1-copy (template) deck', () => {
    const ids = createCommunitySpaceDeck(1).map(c => c.id.replace(/-\d+$/, ''));
    for (const c of NEW_COMMUNITY_SPACE_CONTRACTS) {
      expect(ids, `${c.id} absent from community-space deck`).toContain(c.id);
    }
  });

  it('keeps copy ids distinct in the expanded deck', () => {
    const deck = createCommunitySpaceDeck(3);
    expect(new Set(deck.map(c => c.id)).size).toBe(deck.length);
  });

  it('initialises a full game with the expanded community-space pool', () => {
    const state = setupMainStreetGame({ seed: 'group-b-expansion' });
    // Community-space cards appear in the development row (mixed with business).
    const allIds = new Set([
      ...state.decks.communitySpace.map(c => c.id.replace(/-\d+$/, '')),
      ...state.market.cards.map(c => c.id.replace(/-\d+$/, '')),
    ]);
    for (const c of NEW_COMMUNITY_SPACE_CONTRACTS) {
      expect(allIds.has(c.id), `${c.id} unreachable in the game pool`).toBe(true);
    }
  });
});

// ── AC4: Ongoing-cost behaviour ───────────────────────────────────────

describe('Group B community-space expansion: ongoing-cost behaviour (AC4)', () => {
  it('deducts the ongoing cost for cards with a running cost', () => {
    const state = setupMainStreetGame({ seed: 'group-b-ongoing' });
    state.resourceBank.coins = 10;
    const grid = state.streetGrid;

    const garden = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-community-garden'))!;
    const kiosk = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-health-kiosk'))!;
    const art = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-public-art'))!;

    // Place three new cards with ongoing costs: 0.1 + 0.15 + 0.25 = 0.5.
    grid[0] = { ...garden, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
    grid[1] = { ...kiosk, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
    grid[2] = { ...art, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };

    applyCommunitySpaceOngoingCosts(state);
    expect(state.resourceBank.coins).toBeCloseTo(10 - 0.5);
  });

  it('does not deduct for zero-ongoing-cost cards', () => {
    const state = setupMainStreetGame({ seed: 'group-b-ongoing-zero' });
    state.resourceBank.coins = 10;
    const grid = state.streetGrid;

    const playground = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-playground'))!;
    const fountain = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-fountain'))!;
    const shelter = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-shelter'))!;

    grid[0] = { ...playground, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
    grid[1] = { ...fountain, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
    grid[2] = { ...shelter, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };

    applyCommunitySpaceOngoingCosts(state);
    expect(state.resourceBank.coins).toBe(10);
  });

  it('clamps the deduction at the available coins (no negative balance)', () => {
    const state = setupMainStreetGame({ seed: 'group-b-ongoing-clamp' });
    state.resourceBank.coins = 0.1;
    const grid = state.streetGrid;
    const art = createCommunitySpaceDeck(1).find(c => c.id.startsWith('cs-public-art'))!;
    grid[0] = { ...art, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };

    applyCommunitySpaceOngoingCosts(state);
    expect(state.resourceBank.coins).toBe(0);
  });
});

// ── AC5: Balance guardrails ───────────────────────────────────────────

describe('Group B community-space expansion: balance guardrails (AC5)', () => {
  it('keeps the community-space cost spread within the 1/3 rule', () => {
    const templates = getCommunitySpaceTemplates();
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
    expect(createBusinessDeck(1).length).toBe(30);
    expect(createEventDeck(1, undefined, createSeededRng(42), 1).length).toBe(56); // +8 Group C, +10 Group D, +1 Graffiti Art
    expect(createUpgradeDeck(1).length).toBe(39); // +12 Group E upgrades
  });
});
