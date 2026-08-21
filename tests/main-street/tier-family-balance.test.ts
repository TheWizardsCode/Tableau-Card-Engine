/**
 * Main Street: Tier family balance tests (CG-0MT2WU0CX005Z143)
 *
 * Verifies the progression-tier rebalance acceptance criteria:
 *
 * - Every tier's new-card mix contains all five card families
 *   (business, community-space, event, upgrade, staff).
 * - No single family exceeds ~42% of a tier's new cards (the event family is
 *   39% of the full catalog, so tiers mirror the catalog mix; previously Tier 5
 *   was 72% events).
 * - Staff cards are tier-gated through `createStaffDeck` like every other
 *   family (`unlockedCardIds` filtering).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createStaffDeck,
  getStaffCardTemplates,
} from '../../example-games/main-street/MainStreetCards';
import { TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';

/** Family of a card ID by its prefix (mirrors CreateTemplatesFromCsvRow). */
function familyOf(cardId: string): string {
  if (cardId.startsWith('biz-')) return 'business';
  if (cardId.startsWith('cs-')) return 'community-space';
  if (cardId.startsWith('evt-')) return 'event';
  if (cardId.startsWith('upg-')) return 'upgrade';
  if (cardId.startsWith('staff-')) return 'staff';
  return 'unknown';
}

const FAMILIES = ['business', 'community-space', 'event', 'staff', 'upgrade'];

describe('Main Street tier family balance (CG-0MT2WU0CX005Z143)', () => {
  it('every tier contains at least one card of each of the five families', () => {
    for (const tierDef of Object.values(TIER_DEFINITIONS)) {
      const present = new Set(tierDef.newCardIds.map(familyOf));
      for (const family of FAMILIES) {
        expect(present.has(family), `${tierDef.id} missing ${family}`).toBe(true);
      }
    }
  });

  it('no single family exceeds 42% of any tier new-card mix', () => {
    for (const tierDef of Object.values(TIER_DEFINITIONS)) {
      const total = tierDef.newCardIds.length;
      expect(total).toBeGreaterThan(0);
      for (const family of FAMILIES) {
        const count = tierDef.newCardIds.filter((id) => familyOf(id) === family).length;
        expect(
          count / total,
          `${tierDef.id} ${family} share ${count}/${total}`,
        ).toBeLessThanOrEqual(0.42);
      }
    }
  });

  it('Tier 5 no longer dominates with events (was 72%)', () => {
    const tier5 = TIER_DEFINITIONS['tier-5'].newCardIds;
    const eventShare = tier5.filter((id) => id.startsWith('evt-')).length / tier5.length;
    expect(eventShare).toBeLessThanOrEqual(0.42);
  });

  it('Tier 1 unlocks staff (the two cheapest staff cards)', () => {
    const tier1 = new Set(TIER_DEFINITIONS['tier-1'].newCardIds);
    expect(tier1.has('staff-apprentice')).toBe(true);
    expect(tier1.has('staff-assistant')).toBe(true);
  });

  it('staff deck filters by unlockedCardIds (tier gating)', () => {
    const tier1Ids = TIER_DEFINITIONS['tier-1'].cumulativeCardIds;
    const gated = createStaffDeck(1, tier1Ids);
    const baseIds = gated.map((c) => c.id.replace(/-\d+$/, ''));
    expect(baseIds.sort()).toEqual(['staff-apprentice', 'staff-assistant']);
  });

  it('staff deck returns the full pool when no tier filter is provided', () => {
    expect(createStaffDeck(1)).toHaveLength(getStaffCardTemplates().length);
  });
});