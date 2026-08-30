/**
 * Main Street: Tier synergy-type balance tests (CG-0MT3IPFSF005KEFB)
 *
 * Mirrors `tier-family-balance.test.ts` (family axis, CG-0MT2WU0CX005Z143)
 * along the synergy-type axis. Only business (30) and community-space (8)
 * cards carry synergy types; events, upgrades and staff carry none.
 *
 * The rebalance (CG-0MT3IPFSF005KEFB) fixes three failing sparse tiers:
 *
 * - T1 had Culture 3 vs Service 1 (ratio 3.0x > 2.0x) -> retagged the Park
 *   from Culture to Entertainment ("offers leisure space"), giving
 *   Culture 2 / Food 2 / Service 1 / Entertainment 1.
 * - T2 had Commerce 3 (single type) -> Hardware Store retagged to Service
 *   (supplies tools = tool-supply service), giving Commerce 2 / Service 1.
 * - T3 had Entertainment 2 (single type, Arcade + Playground) -> Community
 *   Shelter (Service) retiered T6->T3 (CG-0MT5VZJLS000B8KI, a neighbourhood
 *   amenity), giving Entertainment 2 / Service 1. (To keep T6's event share
 *   under the 42% family-mix rule, Good Press (Incident) also moved T6->T3:
 *   local news coverage is a neighbourhood-scale event.)
 *
 * Rule enforced (per the work item): every tier's synergy-bearing cards
 * span >= 2 distinct types, and no type's assignment count within a tier
 * exceeds 2x any other type's count in that tier. Bridge cards count once
 * per type they carry.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';

const SYNERGY_TYPES: SynergyType[] = [
  'Food',
  'Culture',
  'Commerce',
  'Service',
  'Entertainment',
  'Health',
];

/** id -> synergy types for every synergy-bearing business/community-space template. */
function synergyByCardId(): Map<string, readonly SynergyType[]> {
  const map = new Map<string, readonly SynergyType[]>();
  for (const template of [...getBusinessTemplates(), ...getCommunitySpaceTemplates()]) {
    if (template.synergyTypes.length > 0) {
      map.set(template.id, template.synergyTypes);
    }
  }
  return map;
}

/** Per-tier synergy assignment counts (a bridge card counts once per type it carries). */
function tierSynergyCounts(): Map<string, Record<string, number>> {
  const byCard = synergyByCardId();
  const perTier = new Map<string, Record<string, number>>();
  for (let i = 1; i <= 12; i++) {
    const tierId = `tier-${i}`;
    const counts: Record<string, number> = {};
    for (const cardId of TIER_DEFINITIONS[tierId].newCardIds) {
      const types = byCard.get(cardId);
      if (!types) continue;
      for (const type of types) {
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    if (Object.keys(counts).length > 0) {
      perTier.set(tierId, counts);
    }
  }
  return perTier;
}

describe('Main Street tier synergy-type balance (CG-0MT3IPFSF005KEFB)', () => {
  it('every tier with synergy-bearing cards spans at least two distinct types', () => {
    const perTier = tierSynergyCounts();
    for (let i = 1; i <= 12; i++) {
      const tierId = `tier-${i}`;
      const counts = perTier.get(tierId);
      // Every tier 1-12 must have synergy-bearing cards post-rebalance.
      expect(counts, `${tierId} has no synergy-bearing cards`).toBeDefined();
      const distinct = Object.keys(counts as Record<string, number>).length;
      expect(distinct, `${tierId} spans only ${distinct} synergy type(s)`).toBeGreaterThanOrEqual(2);
    }
  });

  it('no synergy type exceeds 2x any other type within a tier', () => {
    const perTier = tierSynergyCounts();
    for (const [tierId, counts] of perTier) {
      const values = Object.values(counts);
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(min, `${tierId} min type count`).toBeGreaterThanOrEqual(1);
      expect(max, `${tierId} max type count`).toBeLessThanOrEqual(2 * min);
    }
  });

  it('the sparse tiers fixed by the rebalance carry their documented spans', () => {
    const snapshot = {
      'tier-1': { Culture: 2, Food: 2, Service: 1, Entertainment: 1 },
      'tier-2': { Commerce: 2, Service: 1 },
      'tier-3': { Entertainment: 2, Service: 1 },
    };
    for (const [tierId, expected] of Object.entries(snapshot)) {
      expect(tierSynergyCounts().get(tierId)).toEqual(expected);
    }
  });

  it('retagged/bridged cards carry the expected synergy types', () => {
    const byCard = synergyByCardId();
    // Park: Culture -> Entertainment (T1 retag, flavour "offers leisure space").
    expect(byCard.get('cs-park')).toContain('Entertainment');
    expect(byCard.get('cs-park')).not.toContain('Culture');
    // Hardware Store: Commerce -> Service retag (T2, "supplies tools" = tool-supply service).
    expect(byCard.get('biz-hardware')).toEqual(['Service']);
    // Arcade: Entertainment-only (T3) — the Entertainment|Service bridge was
    // removed (CG-0MT5VZJLS000B8KI): an arcade is purely an entertainment
    // business, and T3's Service type now comes from relocated Community Shelter.
    expect(byCard.get('biz-arcade')).toEqual(['Entertainment']);
    expect(byCard.get('cs-shelter')).toEqual(['Service']);
  });

  it('every synergy type still appears somewhere on the tier ladder', () => {
    const perTier = tierSynergyCounts();
    const seen = new Set<string>();
    for (const counts of perTier.values()) {
      for (const type of Object.keys(counts)) {
        seen.add(type);
      }
    }
    for (const type of SYNERGY_TYPES) {
      expect(seen.has(type), `synergy type ${type} missing from every tier`).toBe(true);
    }
  });
});