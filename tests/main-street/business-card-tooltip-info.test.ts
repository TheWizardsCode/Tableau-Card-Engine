/**
 * Business Card Tooltip Info Tests
 *
 * Validates that `buildCardTooltipInfo()` produces correct, non-empty tooltip
 * content for business cards — the data layer behind the renderer fix for
 * CG-0MT24RFIV007NQMP.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { createBusinessDeck } from '../../example-games/main-street/MainStreetCards';
import {
  buildCardTooltipInfo,
  type CardTooltipInfoOptions,
} from '../../example-games/main-street/MainStreetFormatting';
import { MEDIUM_PRESET } from '../../example-games/main-street/MainStreetDifficulty';

// ── Helpers ──────────────────────────────────────────────────

const businessDeck = createBusinessDeck(1);

function buildTooltip(
  card: Parameters<typeof buildCardTooltipInfo>[0],
  options: CardTooltipInfoOptions = {},
): string {
  return buildCardTooltipInfo(card, MEDIUM_PRESET, options);
}

// ── AC: Business card tooltip content ────────────────────────

describe('buildCardTooltipInfo for business cards (AC1, AC2)', () => {
  it('produces a non-empty tooltip for every business card in the deck', () => {
    for (const card of businessDeck) {
      const tooltip = buildTooltip(card);
      expect(tooltip.length).toBeGreaterThan(0);
      expect(tooltip.trim()).not.toBe('');
    }
  });

  it('includes name, cost, income, and synergy for a business card', () => {
    const firstCard = businessDeck[0];
    const tooltip = buildTooltip(firstCard);

    expect(tooltip).toContain(`Business: ${firstCard.name}`);
    // Cost is formatted via formatCurrency() which prepends a currency symbol.
    expect(tooltip).toContain(`Cost: `);
    expect(tooltip).toContain(String(firstCard.cost));
    expect(tooltip).toContain(`Income: +${firstCard.baseIncome}/turn`);
    expect(tooltip).toContain(`Synergy: ${firstCard.synergyTypes.join('/')}`);
  });

  it('includes reputation line when the business card has reputationPerTurn', () => {
    const cardWithRep = businessDeck.find(
      c => (c.reputationPerTurn ?? 0) > 0,
    );
    if (!cardWithRep) {
      // If no business card has reputation, this test is skipped.
      return;
    }
    const tooltip = buildTooltip(cardWithRep);
    const repTotal = cardWithRep.reputationPerTurn ?? 0;
    expect(tooltip).toContain(`Reputation: +${repTotal}/turn`);
  });

  it('does NOT include event-detail coin/rep lines (default options)', () => {
    const card = businessDeck[0];
    const tooltip = buildTooltip(card);
    // Business cards should never show coin delta / reputation delta lines.
    expect(tooltip).not.toMatch(/Coins:/);
    expect(tooltip).not.toMatch(/Rep:/);
  });

  it('does NOT include event-detail lines when includeEventDetail is true', () => {
    const card = businessDeck[0];
    const tooltip = buildTooltip(card, { includeEventDetail: true });
    // Business tooltips should never show coin delta / reputation delta lines,
    // regardless of the option (the option only affects event cards).
    expect(tooltip).not.toMatch(/Coins:/);
    expect(tooltip).not.toMatch(/Rep:/);
  });

  it('tooltip content is deterministic', () => {
    const card = businessDeck[0];
    const first = buildTooltip(card);
    const second = buildTooltip(card);
    expect(first).toBe(second);
  });

  it('tooltip does not contain unresolved synergy tokens', () => {
    for (const card of businessDeck) {
      const tooltip = buildTooltip(card);
      expect(tooltip).not.toContain('{SYNERGY_RATE}');
    }
  });
});
