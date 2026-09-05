/**
 * Main Street: Tier family balance tests (CG-0MT3C744B009DS84, 12 tiers)
 *
 * Verifies the 12-tier expansion acceptance criteria:
 *
 * - Every tier's new-card mix contains the three catalog-spanning families
 *   (business, event, upgrade). Community-space (8 cards) and staff (9 cards)
 *   are spread across as many tiers as the catalog allows rather than forced
 *   into every tier (8 + 9 cards physically cannot cover all 12 tiers).
 * - No single family exceeds 42% of a tier's new cards (events are 39% of
 *   the full catalog, so tiers mirror the catalog mix).
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

const CORE_FAMILIES = ['business', 'event', 'upgrade'];
const FAMILIES = ['business', 'community-space', 'event', 'staff', 'upgrade'];

describe('Main Street tier family balance (CG-0MT3C744B009DS84)', () => {
  it('every tier contains business, event and upgrade cards', () => {
    for (const tierDef of Object.values(TIER_DEFINITIONS)) {
      const present = new Set(tierDef.newCardIds.map(familyOf));
      for (const family of CORE_FAMILIES) {
        expect(present.has(family), `${tierDef.id} missing ${family}`).toBe(true);
      }
    }
  });

  it('community-space appears in most tiers (>= 6) and staff in most tiers (>= 8)', () => {
    // 8 community-space + 9 staff cards spread across the 12-tier ladder:
    // cs in T1, T3, T4, T5, T8, T12 (6 tiers; Community Shelter T6->T3,
    // CG-0MT5VZJLS000B8KI, and Good Press T6->T3 keeps T6's event share under
    // the 42% ceiling); staff in 9 tiers.
    let csTiers = 0;
    let staffTiers = 0;
    for (const tierDef of Object.values(TIER_DEFINITIONS)) {
      const families = new Set(tierDef.newCardIds.map(familyOf));
      if (families.has('community-space')) csTiers++;
      if (families.has('staff')) staffTiers++;
    }
    expect(csTiers).toBeGreaterThanOrEqual(6);
    expect(staffTiers).toBeGreaterThanOrEqual(8);
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

  it('late tiers are not dominated by events (was 72% at old T5)', () => {
    for (const tierId of ['tier-11', 'tier-12']) {
      const cards = TIER_DEFINITIONS[tierId].newCardIds;
      const eventShare = cards.filter((id) => id.startsWith('evt-')).length / cards.length;
      expect(eventShare, `${tierId} event share`).toBeLessThanOrEqual(0.42);
    }
  });

  it('Tier 1 unlocks the apprentice staff card', () => {
    const tier1 = new Set(TIER_DEFINITIONS['tier-1'].newCardIds);
    expect(tier1.has('staff-apprentice')).toBe(true);
  });

  it('staff deck filters by unlockedCardIds (tier gating)', () => {
    const tier1Ids = TIER_DEFINITIONS['tier-1'].cumulativeCardIds;
    const gated = createStaffDeck(1, tier1Ids);
    const baseIds = gated.map((c) => c.id.replace(/-\d+$/, ''));
    expect(baseIds).toEqual(['staff-apprentice']);
  });

  it('staff deck returns the full pool when no tier filter is provided', () => {
    expect(createStaffDeck(1)).toHaveLength(getStaffCardTemplates().length);
  });
});