/**
 * Main Street: Synergy Display Formatting
 *
 * Pure helpers for converting card synergy displays from absolute coin
 * values to difficulty-aware percentage multipliers.
 *
 * Main Street synergy is percentage-based (CG-0MRVCWNEQ009H52Z): each
 * business/community-space card has a `synergyCoinBonus` rate (default
 * 0.5 = 50% of base income) which the difficulty preset scales via
 * `synergyBonusPerNeighbor` (Easy 1.5 / Medium 1.0 / Hard 0.75). This
 * module computes the effective rate for display and resolves the
 * `{SYNERGY_RATE}` token used in card descriptions.
 *
 * Reputation synergy (`synergyRepBonus`) is intentionally NOT handled
 * here — it remains an absolute-value system by design. Event-card
 * effects ("+1 coin per X business") are genuine `coinDelta` effects and
 * are never tokenized.
 *
 * @module
 */

import type { GameConfig } from './MainStreetDifficulty';

/** Default per-card coin synergy rate when the CSV does not specify one. */
export const DEFAULT_SYNERGY_COIN_RATE = 0.5;

/** Token substituted with the effective synergy percentage in card descriptions. */
export const SYNERGY_RATE_TOKEN = '{SYNERGY_RATE}';

/** The card shape needed by the formatters (only the coin-synergy rate is read). */
export interface SynergyRateCard {
  readonly synergyCoinBonus?: number;
}

/** Difficulty subset needed by the formatters. */
export type SynergyFormatConfig = Pick<GameConfig, 'synergyBonusPerNeighbor'>;

/**
 * Computes the effective coin-synergy rate (as a decimal) for a card under
 * a difficulty config.
 *
 *   effectiveRate = synergyCoinBonus (default 0.5) × synergyBonusPerNeighbor
 *
 * Returns 0 for zero-synergy opt-out cards (e.g. Pawn Shop).
 *
 * @param card    The business or community-space card.
 * @param config  The active difficulty config.
 * @returns The effective rate as a decimal (0..1.5+).
 */
export function effectiveSynergyRate(
  card: SynergyRateCard,
  config: SynergyFormatConfig,
): number {
  const baseRate = card.synergyCoinBonus ?? DEFAULT_SYNERGY_COIN_RATE;
  const multiplier = config?.synergyBonusPerNeighbor ?? 1;
  return baseRate * multiplier;
}

/**
 * Formats the effective coin-synergy rate as a percentage string with up to
 * one decimal place (e.g. "50%", "75%", "37.5%").
 *
 * Returns `null` for zero-synergy opt-out cards — callers should show the
 * card's explicit opt-out text instead of a percentage.
 *
 * @param card    The business or community-space card.
 * @param config  The active difficulty config.
 * @returns The formatted percentage string, or null when the card opts out.
 */
export function formatSynergyRate(
  card: SynergyRateCard,
  config: SynergyFormatConfig,
): string | null {
  const rate = effectiveSynergyRate(card, config);
  if (rate === 0) return null;
  return `${formatPercent(rate)}%`;
}

/**
 * Rounds a decimal rate to a percentage with up to one decimal place and no
 * trailing ".0" (50 → "50", 37.5 → "37.5", 75 → "75").
 */
function formatPercent(rate: number): string {
  const oneDecimal = Math.round(rate * 1000) / 10;
  return Number.isInteger(oneDecimal) ? String(oneDecimal) : oneDecimal.toFixed(1);
}

/**
 * Resolves a card description template by substituting the `{SYNERGY_RATE}`
 * token with the card's effective percentage for the active difficulty.
 *
 * Descriptions without the token pass through unchanged (event-card effects,
 * upgrade cards, zero-synergy opt-out text, flavour text).
 *
 * @param desc    The raw description (may contain the {SYNERGY_RATE} token).
 * @param card    The business or community-space card the description belongs to.
 * @param config  The active difficulty config.
 * @returns The description with the token resolved (or unchanged).
 */
export function resolveDescription(
  desc: string,
  card: SynergyRateCard,
  config: SynergyFormatConfig,
): string {
  if (!desc.includes(SYNERGY_RATE_TOKEN)) return desc;
  const rate = formatSynergyRate(card, config);
  if (rate === null) {
    // Defensive: a tokenized template on an opt-out card would otherwise show
    // a bare "{SYNERGY_RATE}". Drop the token rather than displaying it.
    return desc.replace(/\{SYNERGY_RATE\}/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  return desc.replace(/\{SYNERGY_RATE\}/g, rate);
}
