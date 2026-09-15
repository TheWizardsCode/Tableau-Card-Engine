/**
 * Gym Card Index — unit tests for the pure grouping / filtering / formatting
 * helpers backing `GymCardIndexScene`.
 *
 * Covers:
 *  - `buildCardIndex()` — the full Main Street pool is indexed from the
 *    template getters (every card exactly once, name/id searchable).
 *  - `filterCards()` — case-insensitive substring match on name and id,
 *    whitespace-only queries are inert.
 *  - `groupByFamily()` — cards grouped by card family in canonical order.
 *  - `groupBySynergy()` — cards grouped by synergy type; a multi-synergy card
 *    appears in every matching group; cards with no synergy fall into the
 *    explicit `Unsynergised` group.
 *  - `formatCardDetailLines()` — the detail sheet is a superset of the
 *    player-facing tooltip and lists absent optional fields explicitly.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  buildCardIndex,
  filterCards,
  groupByFamily,
  groupBySynergy,
  formatCardDetailLines,
  buildCardTooltip,
  CARD_FAMILIES,
  SYNERGY_TYPES,
  UNSYNERGISED_GROUP_KEY,
  type CardIndexEntry,
} from '../../example-games/gym/GymCardIndex';
import {
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  getEventTemplates,
  getUpgradeTemplates,
  getStaffCardTemplates,
  type AnyCard,
  type BusinessCard,
  type CardFamily,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** A minimal synthetic business card with the given synergies. */
function businessCard(
  id: string,
  name: string,
  synergyTypes: SynergyType[],
): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost: 100,
    baseIncome: 50,
    synergyTypes,
    maxLevel: 0,
    description: 'synthetic',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
  };
}

/** Wrap a synthetic card in a `CardIndexEntry` the way the index would. */
function entry(card: AnyCard): CardIndexEntry {
  return {
    card,
    id: card.id,
    name: card.name,
    family: card.family,
    tier: '1',
    searchText: `${card.name} ${card.id}`.toLowerCase(),
  };
}

// ── buildCardIndex ──────────────────────────────────────────

describe('buildCardIndex', () => {
  it('indexes every template from all five Main Street families', () => {
    const expected =
      getBusinessTemplates().length +
      getCommunitySpaceTemplates().length +
      getEventTemplates().length +
      getUpgradeTemplates().length +
      getStaffCardTemplates().length;

    const index = buildCardIndex();

    expect(index.length).toBe(expected);
    expect(index.length).toBeGreaterThan(100);
  });

  it('exposes a searchable name+id text for each card', () => {
    for (const e of buildCardIndex()) {
      expect(e.searchText).toBe(`${e.name} ${e.id}`.toLowerCase());
    }
  });

  it('assigns every card a family from the canonical family list', () => {
    for (const e of buildCardIndex()) {
      expect(CARD_FAMILIES).toContain(e.family);
    }
  });

  it('contains a known business template with its templates-level data intact', () => {
    const bakery = buildCardIndex().find((e) => e.id === 'biz-bakery');
    expect(bakery).toBeDefined();
    expect(bakery!.name).toBe('Bakery');
    expect(bakery!.family).toBe('business');
    expect(bakery!.tier.length).toBeGreaterThan(0);
  });
});

// ── filterCards ─────────────────────────────────────────────

describe('filterCards', () => {
  const entries = buildCardIndex();

  it('returns all entries for an empty query', () => {
    expect(filterCards(entries, '').length).toBe(entries.length);
  });

  it('returns all entries for a whitespace-only query', () => {
    expect(filterCards(entries, '   ').length).toBe(entries.length);
  });

  it('matches on card name case-insensitively', () => {
    const lower = filterCards(entries, 'bakery');
    const upper = filterCards(entries, 'BAKERY');

    expect(lower.length).toBeGreaterThan(0);
    expect(lower.map((e) => e.id)).toEqual(upper.map((e) => e.id));
    expect(lower.every((e) => e.name.toLowerCase().includes('bakery'))).toBe(true);
  });

  it('matches on card id', () => {
    const hits = filterCards(entries, 'biz-clinic');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((e) => e.id === 'biz-clinic')).toBe(true);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterCards(entries, 'zzz-no-such-card-zzz')).toEqual([]);
  });

  it('preserves index order in filtered results', () => {
    const filtered = filterCards(entries, 'cafe');
    const ids = filtered.map((e) => e.id);
    const sourceIds = entries.filter((e) => e.searchText.includes('cafe')).map((e) => e.id);
    expect(ids).toEqual(sourceIds);
  });
});

// ── groupByFamily ───────────────────────────────────────────

describe('groupByFamily', () => {
  it('returns exactly one group per card family, in canonical order', () => {
    const groups = groupByFamily(buildCardIndex());
    expect(groups.map((g) => g.key)).toEqual([...CARD_FAMILIES]);
  });

  it('places each card in its own family group and nowhere else', () => {
    const groups = groupByFamily(buildCardIndex());

    for (const group of groups) {
      for (const e of group.entries) {
        expect(e.family).toBe(group.key);
      }
    }

    const total = groups.reduce((sum, g) => sum + g.entries.length, 0);
    expect(total).toBe(buildCardIndex().length);
  });

  it('labels groups with a human-readable family name and count', () => {
    const groups = groupByFamily(buildCardIndex());
    const business = groups.find((g) => g.key === 'business')!;
    expect(business.label).toBe('Business');
    expect(business.entries.length).toBe(getBusinessTemplates().length);
  });
});

// ── groupBySynergy ──────────────────────────────────────────

describe('groupBySynergy', () => {
  it('returns one group per synergy type plus an Unsynergised catch-all', () => {
    const groups = groupBySynergy(buildCardIndex());
    expect(groups.map((g) => g.key)).toEqual([
      ...SYNERGY_TYPES,
      UNSYNERGISED_GROUP_KEY,
    ]);
  });

  it('lists a multi-synergy card in every matching group', () => {
    const multi = businessCard('biz-multi', 'Multi', ['Food', 'Culture']);
    const groups = groupBySynergy([entry(multi)]);

    const food = groups.find((g) => g.key === 'Food')!;
    const culture = groups.find((g) => g.key === 'Culture')!;
    const commerce = groups.find((g) => g.key === 'Commerce')!;

    expect(food.entries.map((e) => e.id)).toEqual(['biz-multi']);
    expect(culture.entries.map((e) => e.id)).toEqual(['biz-multi']);
    expect(commerce.entries).toEqual([]);
  });

  it('places cards without synergies in the Unsynergised group only', () => {
    const noSynergy = businessCard('biz-none', 'None', []);
    const groups = groupBySynergy([entry(noSynergy)]);

    const unsynergised = groups.find((g) => g.key === UNSYNERGISED_GROUP_KEY)!;
    expect(unsynergised.entries.map((e) => e.id)).toEqual(['biz-none']);

    for (const type of SYNERGY_TYPES) {
      expect(groups.find((g) => g.key === type)!.entries).toEqual([]);
    }
  });

  it('total membership equals the sum of each card synergy count (plus unsynergised)', () => {
    const index = buildCardIndex();
    const groups = groupBySynergy(index);
    const membership = groups.reduce((sum, g) => sum + g.entries.length, 0);

    const expected = index.reduce((sum, e) => {
      const synergies =
        'synergyTypes' in e.card ? (e.card.synergyTypes ?? []).length : 0;
      return sum + (synergies > 0 ? synergies : 1);
    }, 0);

    expect(membership).toBe(expected);
  });

  it('reports the real Main Street event/staff/upgrade families as unsynergised', () => {
    const groups = groupBySynergy(buildCardIndex());
    const unsynergised = groups.find((g) => g.key === UNSYNERGISED_GROUP_KEY)!;

    expect(unsynergised.entries.length).toBe(
      getEventTemplates().length +
        getStaffCardTemplates().length +
        getUpgradeTemplates().length,
    );
  });

  it('groups cards from different families together when they share a synergy', () => {
    const biz = businessCard('biz-food', 'Food Biz', ['Food']);
    const cs: AnyCard = { ...businessCard('cs-food', 'Food Space', ['Food']), family: 'community-space' };
    const groups = groupBySynergy([entry(biz), entry(cs)]);

    const food = groups.find((g) => g.key === 'Food')!;
    expect(food.entries.map((e) => e.family).sort()).toEqual([
      'business',
      'community-space',
    ]);
  });
});

// ── formatCardDetailLines ───────────────────────────────────

describe('formatCardDetailLines', () => {
  it('includes the common identity fields for a business card', () => {
    const bakery = buildCardIndex().find((e) => e.id === 'biz-bakery')!;
    const lines = formatCardDetailLines(bakery).join('\n');

    expect(lines).toContain('Family: business');
    expect(lines).toContain('ID: biz-bakery');
    expect(lines).toContain('Name: Bakery');
    expect(lines).toContain('Tier: 1');
    expect(lines).toContain('Synergy types: Food');
  });

  it('is a superset of the player-facing tooltip content', () => {
    const bakery = buildCardIndex().find((e) => e.id === 'biz-bakery')!;
    const tooltip = buildCardTooltip(bakery);
    const detail = formatCardDetailLines(bakery).join('\n');

    // Every non-empty tooltip line content must appear in the detail sheet.
    for (const line of tooltip.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Description text is included verbatim in the detail sheet.
      const payload = trimmed.includes(': ') ? trimmed.split(': ').slice(1).join(': ') : trimmed;
      expect(detail).toContain(payload);
    }
  });

  it('lists absent optional fields explicitly rather than omitting them', () => {
    const evt = buildCardIndex().find((e) => e.family === 'event')!;
    const lines = formatCardDetailLines(evt);

    const find = (label: string) => lines.find((l) => l.startsWith(`${label}:`));
    expect(find('Duration')).toBeDefined();
    expect(find('Multiplier')).toBeDefined();
    // Event cards have no limited-week window by default → explicit dash.
    expect(find('Available weeks')).toBeDefined();
    expect(find('Available weeks')).toContain('—');
  });

  it('renders duration-event fields when present', () => {
    const duration: AnyCard = {
      family: 'event',
      id: 'evt-duration',
      name: 'Recession',
      cost: 0,
      trigger: 'Incident',
      effect: 'Income halved',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 0,
      duration: 3,
      effectType: 'income-multiplier',
      multiplier: 0.5,
    };

    const lines = formatCardDetailLines({
      card: duration,
      id: duration.id,
      name: duration.name,
      family: 'event',
      tier: '3',
      searchText: 'recession evt-duration',
    }).join('\n');
    expect(lines).toContain('Duration: 3');
    expect(lines).toContain('Effect type: income-multiplier');
    expect(lines).toContain('Multiplier: 0.5');
  });

  it('renders staff-specific fields', () => {
    const staff = buildCardIndex().find((e) => e.family === 'staff')!;
    const lines = formatCardDetailLines(staff).join('\n');

    expect(lines).toContain('Family: staff');
    expect(lines).toContain('Hand slots:');
    expect(lines).toContain('Ongoing cost:');
  });

  it('renders upgrade-specific fields', () => {
    const upgrade = buildCardIndex().find((e) => e.family === 'upgrade')!;
    const lines = formatCardDetailLines(upgrade).join('\n');

    expect(lines).toContain('Family: upgrade');
    expect(lines).toContain('Target business:');
    expect(lines).toContain('Income bonus:');
    expect(lines).toContain('Required level:');
  });

  it('renders community-space cards with their family name', () => {
    const cs = buildCardIndex().find((e) => e.family === 'community-space')!;
    const lines = formatCardDetailLines(cs).join('\n');
    expect(lines).toContain('Family: community-space');
  });
});

// ── buildCardTooltip ────────────────────────────────────────

describe('buildCardTooltip', () => {
  it('delegates to the Main Street player-facing formatter', () => {
    const bakery = buildCardIndex().find((e) => e.id === 'biz-bakery')!;
    const tooltip = buildCardTooltip(bakery);
    expect(tooltip).toContain('Business: Bakery');
    expect(tooltip).toContain('Synergy: Food');
  });

  it('returns a non-empty string for every family', () => {
    const samples: CardIndexEntry[] = [
      buildCardIndex().find((e) => e.family === 'business')!,
      buildCardIndex().find((e) => e.family === 'community-space')!,
      buildCardIndex().find((e) => e.family === 'event')!,
      buildCardIndex().find((e) => e.family === 'upgrade')!,
      buildCardIndex().find((e) => e.family === 'staff')!,
    ];
    for (const entry of samples) {
      expect(buildCardTooltip(entry).length).toBeGreaterThan(0);
    }
  });
});

// ── Family labels ───────────────────────────────────────────

describe('CARD_FAMILIES / SYNERGY_TYPES constants', () => {
  it('lists all five card families exactly once', () => {
    expect([...CARD_FAMILIES].sort()).toEqual(
      (['business', 'community-space', 'event', 'upgrade', 'staff'] as CardFamily[]).sort(),
    );
  });

  it('lists all six synergy types exactly once', () => {
    expect([...SYNERGY_TYPES].sort()).toEqual(
      (['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health'] as SynergyType[]).sort(),
    );
  });
});
