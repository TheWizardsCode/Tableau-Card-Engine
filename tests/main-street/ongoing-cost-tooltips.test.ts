/**
 * Main Street: Ongoing cost / turn cost tooltip display tests.
 *
 * Work item: CG-0MTQZ7VWU008Q259 — Add turn cost to card and scoring tooltips.
 *
 * Acceptance Criteria:
 *   AC1 — buildCardTooltipInfo() always shows the ongoing cost line for
 *         Business, Community Space, and Staff cards (even when the value is 0).
 *   AC2 — buildScoreTooltip() includes a total turn cost line computed from
 *         all placed Business, Community Space, and Staff cards.
 *   AC3 — New score tooltip strings use i18n keys registered in
 *         HUD_TOOLTIP_STRINGS / HUD_TOOLTIP_I18N_KEYS.
 *   AC4 — Unit tests verify both tooltip builders include the turn cost lines.
 */
import { describe, it, expect } from 'vitest';

import {
  buildCardTooltipInfo,
  type CardTooltipInfoOptions,
} from '../../example-games/main-street/MainStreetFormatting';
import {
  buildScoreTooltip,
  HUD_TOOLTIP_I18N_KEYS,
  HUD_TOOLTIP_STRINGS,
} from '../../example-games/main-street/scenes/MainStreetHudTooltips';

import {
  createBusinessDeck,
  createCommunitySpaceDeck,
  createStaffDeck,
  type StaffCard,
  type CommunitySpaceCard,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MEDIUM_PRESET } from '../../example-games/main-street/MainStreetDifficulty';

// ── Helpers ──────────────────────────────────────────────────

function tooltipFor(
  card: Parameters<typeof buildCardTooltipInfo>[0],
  options: CardTooltipInfoOptions = {},
): string {
  return buildCardTooltipInfo(card, MEDIUM_PRESET, options);
}

// ── AC1: Card tooltip always shows ongoing cost ──────────────

describe('buildCardTooltipInfo — always shows ongoing cost (AC1)', () => {
  it('business card shows ongoing cost line with its actual value', () => {
    const deck = createBusinessDeck(1);
    const card = deck[0];
    // Business cards have a non-zero ongoingCost from the data CSV.
    expect(card.ongoingCost).toBeGreaterThan(0);
    const tip = tooltipFor(card);
    expect(tip).toContain(`Ongoing cost: -${card.ongoingCost}/turn`);
  });

  it('business card with zero ongoingCost explicitly shows "Ongoing cost: -0/turn"', () => {
    const card: BusinessCard = {
      ...createBusinessDeck(1)[0],
      id: 'biz-test-zero-ongoing',
      ongoingCost: 0,
    };
    const tip = tooltipFor(card);
    expect(tip).toContain('Ongoing cost: -0/turn');
  });

  it('business card with non-zero ongoingCost shows the value', () => {
    const card: BusinessCard = {
      ...createBusinessDeck(1)[0],
      id: 'biz-test-ongoing',
      ongoingCost: 5,
    };
    const tip = tooltipFor(card);
    expect(tip).toContain('Ongoing cost: -5/turn');
  });

  it('community space card with zero ongoingCost shows "Ongoing cost: -0/turn"', () => {
    const deck = createCommunitySpaceDeck(1);
    const card = deck[0];
    expect(card.ongoingCost).toBe(0);
    const tip = tooltipFor(card);
    expect(tip).toContain('Ongoing cost: -0/turn');
  });

  it('community space card with non-zero ongoingCost shows the value', () => {
    const card: CommunitySpaceCard = {
      ...createCommunitySpaceDeck(1)[0],
      id: 'cs-test-ongoing',
      ongoingCost: 3,
    };
    const tip = tooltipFor(card);
    expect(tip).toContain('Ongoing cost: -3/turn');
  });

  it('staff card shows ongoing cost line with its actual value', () => {
    const deck = createStaffDeck(1);
    const card = deck[0] as StaffCard;
    // Staff cards have a non-zero ongoingCost from the data CSV.
    expect(card.ongoingCost).toBeGreaterThan(0);
    const tip = tooltipFor(card);
    expect(tip).toContain(`Ongoing cost: -${card.ongoingCost}/turn`);
  });

  it('staff card with zero ongoingCost explicitly shows "Ongoing cost: -0/turn"', () => {
    const card: StaffCard = {
      ...createStaffDeck(1)[0],
      id: 'staff-test-zero-ongoing',
      ongoingCost: 0,
    };
    const tip = tooltipFor(card);
    expect(tip).toContain('Ongoing cost: -0/turn');
  });

  it('staff card with non-zero ongoingCost shows the value', () => {
    const card: StaffCard = {
      ...createStaffDeck(1)[0],
      id: 'staff-test-ongoing',
      ongoingCost: 2,
    };
    const tip = tooltipFor(card);
    expect(tip).toContain('Ongoing cost: -2/turn');
  });

  it('event card does NOT show ongoing cost (no such field)', () => {
    const deck = createBusinessDeck(1);
    // Event cards have family 'event' — buildCardTooltipInfo returns a different
    // string for them, with no ongoing cost line.
    const eventCard = {
      ...deck[0],
      family: 'event' as const,
      name: 'Test Event',
      cost: 50,
      effect: 'Test effect',
      coinDelta: 0,
      reputationDelta: 0,
      target: 'All' as const,
      duration: 0,
      targetSynergy: '',
    } as unknown as Parameters<typeof buildCardTooltipInfo>[0];
    const tip = tooltipFor(eventCard);
    expect(tip).not.toMatch(/Ongoing cost:/);
  });

  it('upgrade card does NOT show ongoing cost (no such field)', () => {
    const upgradeCard = {
      ...createBusinessDeck(1)[0],
      family: 'upgrade' as const,
      name: 'Test Upgrade',
      cost: 100,
      incomeBonus: 10,
      targetBusiness: 'Food',
      requiredLevel: 1,
      description: 'Test upgrade',
      upgradePath: 'Food',
      maxLevel: 1,
      synergyTypes: [],
      synergyCoinBonus: 0,
      synergyRangeBonus: 0,
      appliedUpgrades: [],
    } as unknown as Parameters<typeof buildCardTooltipInfo>[0];
    const tip = tooltipFor(upgradeCard);
    expect(tip).not.toMatch(/Ongoing cost:/);
  });

  it('every business card tooltip contains the ongoing cost line', () => {
    const deck = createBusinessDeck(1);
    for (const card of deck) {
      const tip = tooltipFor(card);
      expect(tip).toMatch(/Ongoing cost: -\d+\/turn/);
    }
  });

  it('every community space card tooltip contains the ongoing cost line', () => {
    const deck = createCommunitySpaceDeck(1);
    for (const card of deck) {
      const tip = tooltipFor(card);
      expect(tip).toMatch(/Ongoing cost: -\d+\/turn/);
    }
  });

  it('every staff card tooltip contains the ongoing cost line', () => {
    const deck = createStaffDeck(1);
    for (const card of deck) {
      const tip = tooltipFor(card);
      expect(tip).toMatch(/Ongoing cost: -\d+\/turn/);
    }
  });
});

// ── AC2 & AC3: Score tooltip includes turn cost + i18n keys ──

describe('buildScoreTooltip — includes total turn cost (AC2, AC3)', () => {
  it('shows total turn cost line when no cards are placed', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-zero' });
    const tooltip = buildScoreTooltip(state, null);

    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreTurnCostLabel);
    expect(tooltip).toContain('-0/turn');
  });

  it('shows total turn cost from placed business cards', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-business' });
    // Place a business card on the grid
    const business = createBusinessDeck(1)[0];
    state.streetGrid[0] = {
      ...business,
      id: 'placed-biz',
      ongoingCost: 5,
    } as unknown as BusinessCard;

    const tooltip = buildScoreTooltip(state, null);
    expect(tooltip).toContain('-5/turn');
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreTurnCostLabel);
  });

  it('shows total turn cost from placed community space cards', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-cs' });
    const cs = createCommunitySpaceDeck(1)[0];
    state.streetGrid[0] = {
      ...cs,
      id: 'placed-cs',
      ongoingCost: 3,
    } as unknown as CommunitySpaceCard;

    const tooltip = buildScoreTooltip(state, null);
    expect(tooltip).toContain('-3/turn');
  });

  it('shows total turn cost from hired staff cards', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-staff' });
    // Add a staff card with ongoing cost to state.staffCards
    const staff = {
      ...createStaffDeck(1)[0],
      id: 'staff-gm-cost',
      ongoingCost: 4,
    } as unknown as StaffCard;
    state.staffCards = [staff];

    const tooltip = buildScoreTooltip(state, null);
    expect(tooltip).toContain('-4/turn');
  });

  it('sums ongoing costs from mixed placed and hired staff', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-mixed' });

    // Place a business card with ongoing cost
    const biz = createBusinessDeck(1)[0];
    state.streetGrid[0] = {
      ...biz,
      id: 'placed-biz-mixed',
      ongoingCost: 5,
    } as unknown as BusinessCard;

    // Place a community space with ongoing cost
    const cs = createCommunitySpaceDeck(1)[0];
    state.streetGrid[1] = {
      ...cs,
      id: 'placed-cs-mixed',
      ongoingCost: 3,
    } as unknown as CommunitySpaceCard;

    // Hire staff with ongoing cost
    const staff = {
      ...createStaffDeck(1)[0],
      id: 'staff-mixed',
      ongoingCost: 2,
    } as unknown as StaffCard;
    state.staffCards = [staff];

    const tooltip = buildScoreTooltip(state, null);
    // Total should be 5 + 3 + 2 = 10
    expect(tooltip).toContain('-10/turn');
  });

  it('excludes sold slots from turn cost calculation', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-sold' });
    const biz = createBusinessDeck(1)[0];
    state.streetGrid[0] = {
      ...biz,
      id: 'sold-biz',
      ongoingCost: 5,
    } as unknown as BusinessCard;
    state.soldSlots = [true]; // Mark slot as sold

    const tooltip = buildScoreTooltip(state, null);
    // Sold slot should not contribute to turn cost
    expect(tooltip).not.toContain('-5/turn');
    expect(tooltip).toContain('-0/turn');
  });

  it('uses i18n key for the turn cost label', () => {
    const state = setupMainStreetGame({ seed: 'score-tooltip-i18n' });
    const tip = buildScoreTooltip(state, null);

    // The label key should exist in HUD_TOOLTIP_I18N_KEYS
    expect(HUD_TOOLTIP_I18N_KEYS.scoreTurnCostLabel).toBe(
      'hud.tooltip.score.turnCost',
    );
    // The tooltip should include the translated label
    expect(tip).toContain(HUD_TOOLTIP_STRINGS.scoreTurnCostLabel);
  });
});
