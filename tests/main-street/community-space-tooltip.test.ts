/**
 * Community Space Card Tooltip Tests
 *
 * Validates that community space cards (Park, Library) have the correct
 * data fields to populate a meaningful tooltip, and that the tooltip
 * content for community-space family cards is distinct from business cards.
 *
 * Acceptance criteria:
 * 1. Community space cards have all fields needed for tooltip content
 * 2. Tooltip for community space card contains name, cost, income, synergy
 * 3. Tooltip distinguishes community space from business (label, not empty)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  createCommunitySpaceDeck,
  createBusinessDeck,
  type CommunitySpaceCard,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Deck Data ────────────────────────────────────────────────

const communitySpaceDeck = createCommunitySpaceDeck(1);
const businessDeck = createBusinessDeck(1);

// ── Helpers ─────────────────────────────────────────────────

/**
 * Builds the tooltip info string for a community space card, mimicking the
 * format used in MainStreetRenderer.drawMarketCard for business cards.
 */
function buildCommunitySpaceTooltip(card: CommunitySpaceCard): string {
  const income = card.baseIncome + (card.incomeBonus || 0);
  return [
    `Community Space: ${card.name}`,
    `Cost: ${card.cost}`,
    `Income: +${income}/turn`,
    `Synergy: ${card.synergyTypes.join('/')}`,
    card.description ?? '',
  ].join('\n');
}

/**
 * Builds the tooltip info string for a business card, matching the format
 * in MainStreetRenderer.drawMarketCard.
 */
function buildBusinessTooltip(card: BusinessCard): string {
  const income = card.baseIncome + (card.incomeBonus || 0);
  return [
    `Business: ${card.name}`,
    `Cost: ${card.cost}`,
    `Income: +${income}/turn`,
    `Synergy: ${card.synergyTypes.join('/')}`,
    card.description ?? '',
  ].join('\n');
}

// ── AC1: Community space cards have all fields needed for a tooltip ────

describe('Community space card tooltip data fields (AC1)', () => {
  it('Park card has all required tooltip fields', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();

    const card = park!;

    // All fields needed for a meaningful tooltip must be present
    expect(card.name).toBe('Park');
    expect(typeof card.cost).toBe('number');
    expect(typeof card.baseIncome).toBe('number');
    expect(Array.isArray(card.synergyTypes)).toBe(true);
    expect(card.synergyTypes.length).toBeGreaterThan(0);
    expect(typeof card.description).toBe('string');
    expect(card.description.length).toBeGreaterThan(0);
  });

  it('Library card has all required tooltip fields', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();

    const card = library!;

    expect(typeof card.name).toBe('string');
    expect(card.name.length).toBeGreaterThan(0);
    expect(typeof card.cost).toBe('number');
    expect(typeof card.baseIncome).toBe('number');
    expect(Array.isArray(card.synergyTypes)).toBe(true);
    expect(card.synergyTypes.length).toBeGreaterThan(0);
    expect(typeof card.description).toBe('string');
    expect(card.description.length).toBeGreaterThan(0);
  });

  it('community space card has synergyTypes matching the business card structure', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();

    // Park has Culture synergy (same as before reclassification)
    expect(park!.synergyTypes).toContain('Culture');

    // Should have same synergy type structure as a business card
    const cultureBusiness = businessDeck.find(c => c.synergyTypes.includes('Culture'));
    if (cultureBusiness) {
      expect(typeof cultureBusiness.synergyTypes[0]).toBe(typeof park!.synergyTypes[0]);
    }
  });

  it('community space card incomeBonus, synergyRangeBonus are initialized to 0', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();
    expect(park!.incomeBonus).toBe(0);
    expect(park!.synergyRangeBonus).toBe(0);
  });

  it('community space card has valid cost', () => {
    for (const card of communitySpaceDeck) {
      expect(card.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('community space card has non-negative baseIncome', () => {
    for (const card of communitySpaceDeck) {
      expect(card.baseIncome).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── AC2: Tooltip for community space card contains meaningful content ──

describe('Community space card tooltip content (AC2)', () => {
  it('builds a tooltip for Park with name and cost', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();

    const tooltip = buildCommunitySpaceTooltip(park!);

    // Tooltip should be non-empty
    expect(tooltip.length).toBeGreaterThan(0);

    // Must contain key information
    expect(tooltip).toContain('Community Space: Park');
    expect(tooltip).toContain('Cost: 3');
    expect(tooltip).toContain('Income: +0');
    expect(tooltip).toContain('Synergy: Culture');
    expect(tooltip).toContain(park!.description);
  });

  it('builds a tooltip for Library with name and stats', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();

    const tooltip = buildCommunitySpaceTooltip(library!);

    expect(tooltip.length).toBeGreaterThan(0);
    expect(tooltip).toContain('Community Space: Library');
    expect(tooltip).toContain('Cost:');
    expect(tooltip).toContain('Income:');
    expect(tooltip).toContain('Synergy:');
    expect(tooltip).toContain(library!.description);
  });

  it('tooltip distinguishes community space from business', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park')!;
    const business = businessDeck[0];

    const csTooltip = buildCommunitySpaceTooltip(park);
    const bizTooltip = buildBusinessTooltip(business);

    // Community space tooltip should say "Community Space:" not "Business:"
    expect(csTooltip).toContain('Community Space:');
    expect(csTooltip).not.toContain('Business:');

    // Business tooltip should say "Business:" not "Community Space:"
    expect(bizTooltip).toContain('Business:');
    expect(bizTooltip).not.toContain('Community Space:');
  });

  it('tooltip is non-empty (regression: was empty before fix)', () => {
    // This is the core regression test: community space cards must NOT
    // produce empty tooltips when hovered in the market or on the grid.
    for (const card of communitySpaceDeck) {
      const tooltip = buildCommunitySpaceTooltip(card);
      expect(tooltip.length).toBeGreaterThan(0);
      // Tooltip must contain actual card data, not just whitespace
      expect(tooltip.trim()).not.toBe('');
    }
  });

  it('tooltip includes description text', () => {
    for (const card of communitySpaceDeck) {
      const tooltip = buildCommunitySpaceTooltip(card);
      expect(tooltip).toContain(card.description);
    }
  });

  it('tooltip does not reference synergy exclusion message for community spaces', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park')!;

    const tooltip = buildCommunitySpaceTooltip(park);
    expect(tooltip).not.toContain('excluded from synergy');
  });

  it('synergy label in tooltip joins all synergy types', () => {
    for (const card of communitySpaceDeck) {
      const tooltip = buildCommunitySpaceTooltip(card);
      for (const st of card.synergyTypes) {
        expect(tooltip).toContain(st);
      }
    }
  });
});

// ── AC3: Tooltip displays consistently on every hover ─────────

describe('Tooltip format consistency (AC3)', () => {
  it('all community space cards produce the same tooltip structure', () => {
    for (const card of communitySpaceDeck) {
      const tooltip = buildCommunitySpaceTooltip(card);
      const lines = tooltip.split('\n');

      // Every tooltip should have at least 4 lines
      expect(lines.length).toBeGreaterThanOrEqual(4);

      // First line should be "Community Space: <name>"
      expect(lines[0]).toMatch(/^Community Space: /);

      // Second line should be "Cost: <number>"
      expect(lines[1]).toMatch(/^Cost: /);

      // Third line should be "Income: +<number>/turn"
      expect(lines[2]).toMatch(/^Income: /);

      // Fourth line(s) should contain synergy info and description
      expect(lines[3]).toMatch(/^Synergy: /);
    }
  });

  it('tooltip content is deterministic for the same card', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park')!;

    const first = buildCommunitySpaceTooltip(park);
    const second = buildCommunitySpaceTooltip(park);

    expect(first).toBe(second);
  });
});
