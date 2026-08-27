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
  it('tier-12 cumulative card IDs cover the full catalog', () => {
    const all = allTemplateIds();
    const tier12 = new Set(TIER_DEFINITIONS['tier-12'].cumulativeCardIds);

    expect(tier12.size).toBe(all.size);
    for (const id of all) {
      expect(tier12.has(id), `missing template in tier progression: ${id}`).toBe(true);
    }
  });

  it('tier-1 is the starter set (15 cards) and includes every tutorial-pinned card', () => {
    const tier1 = TIER_DEFINITIONS['tier-1'].newCardIds;
    // 12-tier starter set (CG-0MT3C744B009DS84): 4 biz + 2 cs + 4 events
    // + 1 staff + 4 upgrades. The tutorial builds decks from the tier-1 pool,
    // so the 7 scenario cards are all present.
    expect(tier1).toHaveLength(15);
    const set = new Set(tier1);
    for (const pinned of ['biz-bakery', 'biz-laundromat', 'biz-bookshop',
      'cs-library', 'evt-festival', 'evt-award', 'evt-rainy']) {
      expect(set.has(pinned), `tier-1 missing ${pinned}`).toBe(true);
    }
  });

  it('every tier has at least 10 new cards (no thin tiers)', () => {
    for (let i = 1; i <= 12; i++) {
      expect(
        TIER_DEFINITIONS[`tier-${i}`].newCardIds.length,
        `tier-${i} too thin`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  it('cumulative pools grow monotonically to 154', () => {
    let prevSize = 0;
    for (let i = 1; i <= 12; i++) {
      const size = TIER_DEFINITIONS[`tier-${i}`].cumulativeCardIds.length;
      expect(size).toBeGreaterThan(prevSize);
      prevSize = size;
    }
    // 142 + 12 specialization staff applicants (CG-0MT4WXNR80090FXZ).
    expect(TIER_DEFINITIONS['tier-12'].cumulativeCardIds).toHaveLength(154);
  });
});