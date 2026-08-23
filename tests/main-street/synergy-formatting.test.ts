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
  turnLabel,
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
    ongoingCost: 0,
    ...overrides,
  };
}

// ── AC: effectiveSynergyRate ─────────────────────────────────

describe('effectiveSynergyRate', () => {
  it('defaults to 0.5 (50%) when synergyCoinBonus is undefined', () => {
    const card = makeCard();
    // Medium multiplier re-tuned 1.0 → 0.35 (CG-0MSP26Q5N002EH8P)
    expect(effectiveSynergyRate(card, MEDIUM)).toBeCloseTo(0.175);
  });

  it('multiplies the per-card rate by the difficulty synergyBonusPerNeighbor', () => {
    const card = makeCard({ synergyCoinBonus: 0.5 });
    // Re-tuned presets (CG-0MSP26Q5N002EH8P): Easy 0.5x / Medium 0.35x / Hard 0.25x
    expect(effectiveSynergyRate(card, EASY)).toBeCloseTo(0.25); // Easy 0.5x
    expect(effectiveSynergyRate(card, MEDIUM)).toBeCloseTo(0.175); // Medium 0.35x
    expect(effectiveSynergyRate(card, HARD)).toBeCloseTo(0.125); // Hard 0.25x
  });

  it('respects custom per-card rates (e.g. Barbershop 1.0)', () => {
    const card = makeCard({ synergyCoinBonus: 1.0 });
    expect(effectiveSynergyRate(card, MEDIUM)).toBe(0.35);
  });

  it('returns 0 for zero-synergy opt-out cards', () => {
    const card = makeCard({ synergyCoinBonus: 0 });
    expect(effectiveSynergyRate(card, MEDIUM)).toBe(0);
  });
});

// ── AC: formatSynergyRate ────────────────────────────────────

describe('formatSynergyRate', () => {
  it('formats the default 0.5 rate as "17.5%" at Medium (0.35x multiplier)', () => {
    expect(formatSynergyRate(makeCard(), MEDIUM)).toBe('17.5%');
  });

  it('formats "25%" at Easy and "12.5%" at Hard for default-rate cards', () => {
    // Re-tuned presets (CG-0MSP26Q5N002EH8P): 0.5 base × 0.5x / 0.25x
    expect(formatSynergyRate(makeCard(), EASY)).toBe('25%');
    expect(formatSynergyRate(makeCard(), HARD)).toBe('12.5%');
  });

  it('formats integer percentages without a trailing decimal', () => {
    expect(formatSynergyRate(makeCard({ synergyCoinBonus: 1.0 }), MEDIUM)).toBe('35%');
  });

  it('returns null for zero-synergy cards so callers can show opt-out text', () => {
    expect(formatSynergyRate(makeCard({ synergyCoinBonus: 0 }), MEDIUM)).toBeNull();
  });
});

// ── AC: resolveDescription ───────────────────────────────────

describe('resolveDescription', () => {
  it('substitutes {SYNERGY_RATE} with the effective percentage', () => {
    const desc = `Gains ${SYNERGY_RATE_TOKEN} of base income per adjacent Food business.`;
    // Re-tuned presets (CG-0MSP26Q5N002EH8P): Easy 0.5x / Medium 0.35x / Hard 0.25x
    expect(resolveDescription(desc, makeCard(), MEDIUM)).toBe(
      'Gains 17.5% of base income per adjacent Food business.',
    );
    expect(resolveDescription(desc, makeCard(), EASY)).toBe(
      'Gains 25% of base income per adjacent Food business.',
    );
    expect(resolveDescription(desc, makeCard(), HARD)).toBe(
      'Gains 12.5% of base income per adjacent Food business.',
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

// ── turnLabel (CG-0MSLXJCHH001DLIO) ─────────────────────────

describe('turnLabel', () => {
  it('renders only the current turn when the config has no maxTurns (unlimited)', () => {
    // Default presets impose no turn limit.
    expect(turnLabel(MEDIUM, 3)).toBe('Turn 3');
    expect(turnLabel(MEDIUM, 1)).toBe('Turn 1');
  });

  it('renders "Turn N / M" when the config explicitly sets maxTurns', () => {
    const limited = { ...MEDIUM, maxTurns: 20 };
    expect(turnLabel(limited, 3)).toBe('Turn 3 / 20');
    expect(turnLabel(limited, 20)).toBe('Turn 20 / 20');
  });

  it('treats undefined maxTurns as unlimited', () => {
    expect(turnLabel({}, 7)).toBe('Turn 7');
  });
});
