/**
 * Main Street: Group E — Upgrade card expansion tests (CG-0MSQJ7SYD008U3EE)
 *
 * Validates the 12 new upgrade cards added by the "Main Street: design 50+
 * new cards of varying types" epic (CG-0MSQE2NLX003ADIY), Group E:
 *
 * - Upgrade template count grows from 27 to 39 (AC1).
 * - Every new upgrade's target references a valid existing business or
 *   community-space card name (AC2) — covering the Group A businesses and
 *   Group B community spaces.
 * - Every new card appears in `CARD_TIER_MAP` (AC3), all IDs are unique (AC4).
 * - Deck generation and balance guardrails hold (AC5/AC6).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getCsvRows,
  createUpgradeDeck,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  CARD_TIER_MAP,
  CARD_TEMPLATE_NAMES,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { createSeededRng } from '../../src/core-engine';

// ── Design contract (from epic CG-0MSQE2NLX003ADIY, Group E) ──────────

interface NewUpgradeContract {
  id: string;
  name: string;
  /** Target is a card NAME (existing schema: targetBusiness = display name). */
  target: string;
  cost: number;
  incomeBonus: number;
  synergyRangeBonus: number;
  requiredLevel: number;
  tier: string;
  /** Present only for reputation-bonus upgrades. */
  reputationBonus?: number;
}

const NEW_UPGRADE_CONTRACTS: NewUpgradeContract[] = [
  { id: 'upg-smoothie-bar', name: 'Upgrade to Smoothie Bar', target: 'Juice Bar', cost: 4, incomeBonus: 1, synergyRangeBonus: 0, requiredLevel: 0, tier: '3' },
  { id: 'upg-wellness-retreat', name: 'Upgrade to Wellness Retreat', target: 'Yoga Studio', cost: 5, incomeBonus: 1.5, synergyRangeBonus: 1, requiredLevel: 0, tier: '4' },
  { id: 'upg-fitness-center', name: 'Upgrade to Fitness Center', target: 'Gym', cost: 5, incomeBonus: 1.5, synergyRangeBonus: 1, requiredLevel: 0, tier: '5' },
  { id: 'upg-dental-clinic', name: 'Upgrade to Dental Clinic', target: 'Dentist', cost: 7, incomeBonus: 2, synergyRangeBonus: 1, requiredLevel: 0, tier: '5' },
  { id: 'upg-bespoke-tailor', name: 'Upgrade to Bespoke Tailor', target: 'Tailor', cost: 4, incomeBonus: 1, synergyRangeBonus: 0, requiredLevel: 0, tier: '2' },
  { id: 'upg-toy-warehouse', name: 'Upgrade to Toy Warehouse', target: 'Toy Store', cost: 4, incomeBonus: 1, synergyRangeBonus: 1, requiredLevel: 0, tier: '3' },
  { id: 'upg-tea-lounge', name: 'Upgrade to Tea Lounge', target: 'Teahouse', cost: 4, incomeBonus: 1, synergyRangeBonus: 0, requiredLevel: 0, tier: '3', reputationBonus: 0.1 },
  { id: 'upg-gourmet-deli', name: 'Upgrade to Gourmet Deli', target: 'Delicatessen', cost: 4, incomeBonus: 1.5, synergyRangeBonus: 0, requiredLevel: 0, tier: '2' },
  { id: 'upg-adventure-park', name: 'Upgrade to Adventure Park', target: 'Playground', cost: 3, incomeBonus: 0, synergyRangeBonus: 0, requiredLevel: 0, tier: '2', reputationBonus: 0.05 },
  { id: 'upg-orchard', name: 'Upgrade to Orchard', target: 'Community Garden', cost: 3, incomeBonus: 0, synergyRangeBonus: 0, requiredLevel: 0, tier: '2', reputationBonus: 0.05 },
  { id: 'upg-grand-fountain', name: 'Upgrade to Grand Fountain', target: 'Town Fountain', cost: 3, incomeBonus: 0, synergyRangeBonus: 0, requiredLevel: 0, tier: '3', reputationBonus: 0.05 },
  { id: 'upg-health-center', name: 'Upgrade to Health Center', target: 'Health Kiosk', cost: 4, incomeBonus: 0, synergyRangeBonus: 0, requiredLevel: 0, tier: '4', reputationBonus: 0.05 },
];

// ── AC1: Template count ───────────────────────────────────────────────

describe('Group E upgrade expansion: template count (AC1)', () => {
  it('grows upgrade templates from 27 to exactly 39', () => {
    expect(createUpgradeDeck(1)).toHaveLength(39);
  });

  it('adds exactly the 12 contracted card IDs', () => {
    const existingIds = new Set(getCsvRows().filter(r => r.family === 'upgrade').map(r => r.id));
    for (const c of NEW_UPGRADE_CONTRACTS) {
      expect(existingIds.has(c.id), `${c.id} missing from card-data.csv`).toBe(true);
    }
  });
});

// ── AC2: Target linkage ───────────────────────────────────────────────

describe('Group E upgrade expansion: target linkage (AC2)', () => {
  it('every new upgrade targets a valid existing business or community-space name', () => {
    const names = new Set([
      ...createBusinessDeck(1).map(b => b.name),
      ...createCommunitySpaceDeck(1).map(cs => cs.name),
    ]);
    for (const c of NEW_UPGRADE_CONTRACTS) {
      expect(names.has(c.target), `${c.id} targets "${c.target}" which is not a known card name`).toBe(true);
    }
  });

  it('covers every Group A business and Group B community space in the contract', () => {
    const targets = new Set(NEW_UPGRADE_CONTRACTS.map(c => c.target));
    for (const expected of [
      'Juice Bar', 'Yoga Studio', 'Gym', 'Dentist', 'Tailor', 'Toy Store',
      'Teahouse', 'Delicatessen', 'Playground', 'Community Garden', 'Town Fountain', 'Health Kiosk',
    ]) {
      expect(targets.has(expected), `no upgrade for ${expected}`).toBe(true);
    }
  });
});

// ── AC3/AC4: Tier map & uniqueness ────────────────────────────────────

describe('Group E upgrade expansion: tier map & uniqueness (AC3/AC4)', () => {
  it('keeps every card ID in the CSV unique', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every new card to its contracted tier in CARD_TIER_MAP', () => {
    for (const c of NEW_UPGRADE_CONTRACTS) {
      expect(CARD_TIER_MAP.get(c.id), `${c.id} tier mismatch`).toBe(c.tier);
    }
  });

  it('registers every new card in CARD_TEMPLATE_NAMES', () => {
    for (const c of NEW_UPGRADE_CONTRACTS) {
      expect(CARD_TEMPLATE_NAMES.get(c.id)).toBe(c.name);
    }
  });
});

// ── Design contract stats ─────────────────────────────────────────────

describe('Group E upgrade expansion: design contract stats', () => {
  const deck = createUpgradeDeck(1);

  for (const contract of NEW_UPGRADE_CONTRACTS) {
    it(`matches the contract for ${contract.id} (${contract.name})`, () => {
      const card = deck.find(c => c.id.startsWith(contract.id));
      expect(card, `${contract.id} missing`).toBeDefined();
      expect(card!.family).toBe('upgrade');
      expect(card!.name).toBe(contract.name);
      expect(card!.targetBusiness).toBe(contract.target);
      expect(card!.cost).toBe(contract.cost);
      expect(card!.incomeBonus).toBe(contract.incomeBonus);
      expect(card!.synergyRangeBonus).toBe(contract.synergyRangeBonus);
      expect(card!.requiredLevel).toBe(contract.requiredLevel);
      if (contract.reputationBonus !== undefined) {
        expect(card!.reputationBonus).toBe(contract.reputationBonus);
      } else {
        expect(card!.reputationBonus === undefined || card!.reputationBonus === 0).toBe(true);
      }
      expect(card!.description.length).toBeGreaterThan(0);
    });
  }
});

// ── Deck generation & balance guardrails ──────────────────────────────

describe('Group E: deck generation & balance guardrails (AC5/AC6)', () => {
  it('builds a 78-card upgrade deck at the default 2 copies', () => {
    expect(createUpgradeDeck(2)).toHaveLength(78);
  });

  it('initialises a full game with the expanded upgrade pool', () => {
    const state = setupMainStreetGame({ seed: 'group-e-expansion' });
    const allIds = new Set([
      ...state.decks.upgrade.map(c => c.id.replace(/-\d+$/, '')),
      ...state.market.cards.map(c => c.id.replace(/-\d+$/, '')),
    ]);
    for (const c of NEW_UPGRADE_CONTRACTS) {
      expect(allIds.has(c.id), `${c.id} unreachable in the game pool`).toBe(true);
    }
  });

  it('keeps the upgrade cost spread within the 1/3 rule', () => {
    const upgrades = getCsvRows().filter(r => r.family === 'upgrade');
    const threshold = Math.ceil(upgrades.length / 3);
    const freq = new Map<number, number>();
    for (const r of upgrades) {
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
    expect(createEventDeck(1, undefined, createSeededRng(42), 1).length).toBe(56); // +1 Graffiti Art
  });
});
