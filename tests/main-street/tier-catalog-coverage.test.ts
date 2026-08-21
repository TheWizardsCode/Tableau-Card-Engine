import { describe, expect, it } from 'vitest';

import { createBusinessDeck, createCommunitySpaceDeck, createEventDeck, createUpgradeDeck, createStaffDeck } from '../../example-games/main-street/MainStreetCards';
import { TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';
import { createSeededRng } from '../../src/core-engine';

function allTemplateIds(): Set<string> {
  const rng = createSeededRng(42);
  const business = createBusinessDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  const communitySpaces = createCommunitySpaceDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  const events = createEventDeck(1, undefined, rng, 1).map(c => c.id.replace(/-\d+$/, ''));
  const upgrades = createUpgradeDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  const staff = createStaffDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  return new Set([...business, ...communitySpaces, ...events, ...upgrades, ...staff]);
}

describe('Main Street tier catalog coverage', () => {
  it('tier-5 cumulative card IDs cover the full catalog', () => {
    const all = allTemplateIds();
    const tier5 = new Set(TIER_DEFINITIONS['tier-5'].cumulativeCardIds);

    expect(tier5.size).toBe(all.size);
    for (const id of all) {
      expect(tier5.has(id), `missing template in tier progression: ${id}`).toBe(true);
    }
  });

  it('tier-1 includes a small expanded sample (~10% of expanded set = 5 cards)', () => {
    const all = allTemplateIds();
    const tier1 = new Set(TIER_DEFINITIONS['tier-1'].newCardIds);

    const expanded = [...all].filter(id => !tier1.has(id));
    // expanded cards in tier1 = cards in tier1 that are outside original M1 baseline (13 fixed IDs)
    const baselineM1 = new Set([
      'biz-bakery', 'biz-diner', 'biz-bookshop', 'cs-park', 'biz-hardware',
      'evt-festival', 'evt-rainy', 'evt-tax', 'evt-award', 'evt-inspection',
      'upg-patisserie', 'upg-bistro', 'upg-readers-cafe',
    ]);
    const expandedCountInTier1 = TIER_DEFINITIONS['tier-1'].newCardIds.filter(id => !baselineM1.has(id)).length;

    expect(expanded.length).toBeGreaterThan(0);
    // 27 tier-1 cards - 13 fixed M1 baseline = 14 (cs-playground rebalanced to
    // T2, +2 staff tiered in at T1; rebalance CG-0MT2WU0CX005Z143).
    expect(expandedCountInTier1).toBe(14);
  });
});
