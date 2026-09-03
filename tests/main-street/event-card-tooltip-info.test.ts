/**
 * Event Card Tooltip Info Tests
 *
 * Validates that `buildCardTooltipInfo()` produces clear, non-confusing
 * tooltip content for event cards — specifically that market-row tooltips
 * (with `includeEventDetail: true`) show effect descriptions that align with
 * the engine's per-match logic for SpecificSynergy events.
 *
 * Regression tests for CG-0MT5Y9AD2001MKWZ — tooltips on businesses are confusing.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
  buildCardTooltipInfo,
  type CardTooltipInfoOptions,
} from '../../example-games/main-street/MainStreetFormatting';
import { MEDIUM_PRESET } from '../../example-games/main-street/MainStreetDifficulty';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ──────────────────────────────────────────────────

function makeEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: 'evt-test',
    name: 'Test Event',
    trigger: 'Investment',
    cost: 5,
    effect: 'Test effect',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 0,
    ...overrides,
  };
}

function buildTooltip(
  card: EventCard,
  options: CardTooltipInfoOptions = {},
): string {
  return buildCardTooltipInfo(card, MEDIUM_PRESET, options);
}

// ── AC2: Tooltip is no longer confusing (SpecificSynergy) ────

describe('SpecificSynergy events — no misleading raw delta line (AC2)', () => {
  it('does NOT show a raw "Coins:" line for SpecificSynergy events', () => {
    const event = makeEvent({
      id: 'evt-street-performer',
      name: 'Street Performer',
      effect: '+2 coins to each Entertainment business from a popular busker.',
      target: 'SpecificSynergy',
      targetSynergy: 'Entertainment',
      coinDelta: 5,
      reputationDelta: 0,
    });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    // The confusing raw "Coins: +5.000" line must NOT appear.
    expect(tooltip).not.toMatch(/Coins:/);
    expect(tooltip).not.toMatch(/Rep:/);
    // The effect text should still be present.
    expect(tooltip).toContain('Effect: +2 coins to each Entertainment business');
  });

  it('does NOT show misleading raw deltas for any SpecificSynergy event', () => {
    const events: Partial<EventCard>[] = [
      { id: 'evt-festival', name: 'Local Festival', effect: '+2 coins to Culture businesses.', target: 'SpecificSynergy', targetSynergy: 'Culture', coinDelta: 2, reputationDelta: 1 },
      { id: 'evt-inspection', name: 'Health Inspection', effect: '-2 coins per Food business.', target: 'SpecificSynergy', targetSynergy: 'Food', coinDelta: -2, reputationDelta: -1 },
      { id: 'evt-grand-opening', name: 'Grand Opening', effect: '+3 coins from Commerce promotion.', target: 'SpecificSynergy', targetSynergy: 'Commerce', coinDelta: 4.5, reputationDelta: 0 },
    ];

    for (const ev of events) {
      const event = makeEvent(ev);
      const tooltip = buildTooltip(event, { includeEventDetail: true });
      expect(tooltip, `tooltip for ${event.name}`).not.toMatch(/Coins:/);
      expect(tooltip, `tooltip for ${event.name}`).not.toMatch(/Rep:/);
    }
  });

  it('Street Performer tooltip is not confusing for 0 matching businesses scenario (AC2 regression)', () => {
    // The reporter saw Street Performer in market with only a Pawn Shop (non-Entertainment) on the street.
    // The old tooltip showed "Coins: +5.000" which was wrong — effective gain was 0.
    const event = makeEvent({
      id: 'evt-street-performer',
      name: 'Street Performer',
      effect: '+2 coins to each Entertainment business from a popular busker drawing crowds.',
      target: 'SpecificSynergy',
      targetSynergy: 'Entertainment',
      coinDelta: 5,
      reputationDelta: 0,
    });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    expect(tooltip).not.toMatch(/Coins: \+5/);
    expect(tooltip).not.toMatch(/Coins: 5\.000/);
    expect(tooltip).toContain('Effect: +2 coins to each Entertainment business');
  });
});

// ── AC2: All-target events show flat deltas cleanly ──────────

describe('All-target events — show flat deltas without per-match confusion (AC2)', () => {
  it('shows a single clear coin/rep line for All-target events', () => {
    const event = makeEvent({
      id: 'evt-local-festival-all',
      name: 'Local Festival',
      effect: '+2 coins to all businesses.',
      target: 'All',
      coinDelta: 2,
      reputationDelta: 1,
    });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    // All-target events show the flat deltas (these are board-independent).
    expect(tooltip).toContain('Coins:');
    expect(tooltip).toContain('Rep:');
    // But no spurious decimals.
    expect(tooltip).toContain('Coins: +2');
    expect(tooltip).toContain('Rep: +1');
  });

  it('formats coinDelta as an integer when it is a whole number', () => {
    const event = makeEvent({ target: 'All', coinDelta: 3, reputationDelta: 0 });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    expect(tooltip).toContain('Coins: +3');
    expect(tooltip).not.toContain('Coins: +3.000');
    expect(tooltip).not.toContain('Coins: +3.0');
  });

  // Fractional coinDelta no longer exists under the ×100 integer economy
  // (CG-0MTIO1M15001E9Y6). The previous case "formats fractional coinDelta with
  // reasonable precision" (coinDelta: 2.5) has been replaced with an integer
  // case that documents the ×100 contract: 250 represents the old 2.5.
  it('formats integer coinDelta (scaled ×100) cleanly without spurious decimals', () => {
    const event = makeEvent({ target: 'All', coinDelta: 250, reputationDelta: 0 });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    expect(tooltip).toContain('Coins: +250');
    expect(tooltip).not.toContain('Coins: +250.000');
  });

  it('shows negative coinDelta correctly', () => {
    const event = makeEvent({ target: 'All', coinDelta: -3, reputationDelta: 0 });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    expect(tooltip).toContain('Coins: -3');
  });
});

// ── AC3: Formatting is consistent ────────────────────────────

describe('Coin/rep value formatting has no spurious decimals (AC3)', () => {
  it('All-target event with integer coinDelta shows no trailing zeros', () => {
    const event = makeEvent({ target: 'All', coinDelta: 5, reputationDelta: 0 });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    expect(tooltip).not.toMatch(/Coins:.*\.\d+$/);
  });

  // Under the ×100 integer economy (CG-0MTIO1M15001E9Y6), coinDelta is
  // always an integer (e.g. 150 represents the old 1.5). No decimal should
  // ever appear in the Coins line.
  it('All-target integer coinDelta (scaled ×100) has no decimal', () => {
    const event = makeEvent({ target: 'All', coinDelta: 150, reputationDelta: 0 });
    const tooltip = buildTooltip(event, { includeEventDetail: true });
    expect(tooltip).not.toMatch(/Coins:.*\.\d+$/);
    expect(tooltip).toContain('Coins: +150');
  });
});

// ── Default options (no includeEventDetail) ──────────────────

describe('Default tooltip (includeEventDetail omitted) omits detail lines', () => {
  it('SpecificSynergy event shows no detail lines without includeEventDetail', () => {
    const event = makeEvent({
      target: 'SpecificSynergy',
      targetSynergy: 'Entertainment',
      coinDelta: 5,
      reputationDelta: 0,
    });
    const tooltip = buildTooltip(event);
    expect(tooltip).not.toContain('Coins:');
    expect(tooltip).not.toContain('Rep:');
  });

  it('All-target event also shows no detail lines without includeEventDetail', () => {
    const event = makeEvent({ target: 'All', coinDelta: 2, reputationDelta: 1 });
    const tooltip = buildTooltip(event);
    expect(tooltip).not.toContain('Coins:');
    expect(tooltip).not.toContain('Rep:');
  });
});

// ── Determinism ──────────────────────────────────────────────

describe('Tooltip content is deterministic', () => {
  it('produces identical output on repeated calls', () => {
    const event = makeEvent({
      target: 'SpecificSynergy',
      targetSynergy: 'Food',
      coinDelta: -2,
      reputationDelta: -1,
    });
    const first = buildTooltip(event, { includeEventDetail: true });
    const second = buildTooltip(event, { includeEventDetail: true });
    expect(first).toBe(second);
  });
});
