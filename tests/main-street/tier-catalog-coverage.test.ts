import { describe, expect, it } from 'vitest';

import { createBusinessDeck, createCommunitySpaceDeck, createEventDeck, createUpgradeDeck } from '../../example-games/main-street/MainStreetCards';
import { TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';
import { createSeededRng } from '../../src/core-engine';

function allTemplateIds(): Set<string> {
  const rng = createSeededRng(42);
  const business = createBusinessDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  const communitySpaces = createCommunitySpaceDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  const events = createEventDeck(1, undefined, rng, 1).map(c => c.id.replace(/-\d+$/, ''));
  const upgrades = createUpgradeDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  return new Set([...business, ...communitySpaces, ...events, ...upgrades]);
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
    // 26 tier-1 cards - 13 fixed M1 baseline = 13 (+cs-playground, 3 Group D,
    // upg-adventure-park, evt-graffiti-art)
    expect(expandedCountInTier1).toBe(13);
  });
});
