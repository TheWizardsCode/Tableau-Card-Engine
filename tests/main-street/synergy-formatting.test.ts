/**
 * Main Street: Synergy Formatting Tests
 *
 * Unit tests for the synergy rate/description resolver
 * (`MainStreetFormatting.ts`) that converts card synergy displays from
 * absolute coin values to difficulty-aware percentage multipliers.
 *
 * Acceptance criteria covered:
 * - Effective rate = per-card `synergyCoinBonus` (default 0.5) ×
 *   `synergyBonusPerNeighbor` (Easy 1.5 / Medium 1.0 / Hard 0.75).
 * - Formatting to up to 1 decimal place (50%, 75%, 37.5%).
 * - Zero-synergy opt-out cards (e.g. Pawn Shop) yield no percentage.
 * - `{SYNERGY_RATE}` token substitution in card descriptions.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import {
  effectiveSynergyRate,
  formatSynergyRate,
  resolveDescription,
  SYNERGY_RATE_TOKEN,
} from '../../example-games/main-street/MainStreetFormatting';
import {
  EASY_PRESET,
  MEDIUM_PRESET,
  HARD_PRESET,
} from '../../example-games/main-street/MainStreetDifficulty';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

const EASY = EASY_PRESET;
const MEDIUM = MEDIUM_PRESET;
const HARD = HARD_PRESET;

// ── Helpers ──────────────────────────────────────────────────

function makeCard(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: 'biz-test',
    name: 'Test Business',
    cost: 3,
    baseIncome: 2,
    synergyTypes: ['Food'],
    maxLevel: 1,
    description: 'Test description.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ...overrides,
  };
}

// ── AC: effectiveSynergyRate ─────────────────────────────────

describe('effectiveSynergyRate', () => {
  it('defaults to 0.5 (50%) when synergyCoinBonus is undefined', () => {
    const card = makeCard();
    expect(effectiveSynergyRate(card, MEDIUM)).toBeCloseTo(0.5);
  });

  it('multiplies the per-card rate by the difficulty synergyBonusPerNeighbor', () => {
    const card = makeCard({ synergyCoinBonus: 0.5 });
    expect(effectiveSynergyRate(card, EASY)).toBeCloseTo(0.75); // Easy 1.5x
    expect(effectiveSynergyRate(card, MEDIUM)).toBeCloseTo(0.5); // Medium 1.0x
    expect(effectiveSynergyRate(card, HARD)).toBeCloseTo(0.375); // Hard 0.75x
  });

  it('respects custom per-card rates (e.g. Barbershop 1.0)', () => {
    const card = makeCard({ synergyCoinBonus: 1.0 });
    expect(effectiveSynergyRate(card, MEDIUM)).toBe(1.0);
  });

  it('returns 0 for zero-synergy opt-out cards', () => {
    const card = makeCard({ synergyCoinBonus: 0 });
    expect(effectiveSynergyRate(card, MEDIUM)).toBe(0);
  });
});

// ── AC: formatSynergyRate ────────────────────────────────────

describe('formatSynergyRate', () => {
  it('formats the default 0.5 rate as "50%" at Medium', () => {
    expect(formatSynergyRate(makeCard(), MEDIUM)).toBe('50%');
  });

  it('formats "75%" at Easy and "37.5%" at Hard for default-rate cards', () => {
    expect(formatSynergyRate(makeCard(), EASY)).toBe('75%');
    expect(formatSynergyRate(makeCard(), HARD)).toBe('37.5%');
  });

  it('formats integer percentages without a trailing decimal', () => {
    expect(formatSynergyRate(makeCard({ synergyCoinBonus: 1.0 }), MEDIUM)).toBe('100%');
  });

  it('returns null for zero-synergy cards so callers can show opt-out text', () => {
    expect(formatSynergyRate(makeCard({ synergyCoinBonus: 0 }), MEDIUM)).toBeNull();
  });
});

// ── AC: resolveDescription ───────────────────────────────────

describe('resolveDescription', () => {
  it('substitutes {SYNERGY_RATE} with the effective percentage', () => {
    const desc = `Gains ${SYNERGY_RATE_TOKEN} of base income per adjacent Food business.`;
    expect(resolveDescription(desc, makeCard(), MEDIUM)).toBe(
      'Gains 50% of base income per adjacent Food business.',
    );
    expect(resolveDescription(desc, makeCard(), EASY)).toBe(
      'Gains 75% of base income per adjacent Food business.',
    );
    expect(resolveDescription(desc, makeCard(), HARD)).toBe(
      'Gains 37.5% of base income per adjacent Food business.',
    );
  });

  it('passes through descriptions without the token unchanged', () => {
    const desc = 'Trades second-hand goods. Does not provide or receive synergy bonuses.';
    expect(resolveDescription(desc, makeCard({ synergyCoinBonus: 0 }), MEDIUM)).toBe(desc);
  });

  it('does not substitute tokens in event-card absolute effect text', () => {
    // Event effects are genuine coinDelta effects, not synergy: they must
    // pass through untouched even though they contain coin phrasing.
    const eventEffect = 'Gains +1 coin per Food business on your street.';
    expect(resolveDescription(eventEffect, makeCard(), MEDIUM)).toBe(eventEffect);
  });
});
