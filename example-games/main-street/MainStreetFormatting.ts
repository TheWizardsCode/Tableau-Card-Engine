/**
 * Main Street: Synergy Display Formatting
 *
 * Pure helpers for converting card synergy displays from absolute coin
 * values to difficulty-aware percentage multipliers.
 *
 * Main Street synergy is percentage-based (CG-0MRVCWNEQ009H52Z): each
 * business/community-space card has a `synergyCoinBonus` rate (default
 * 0.5 = 50% of base income) which the difficulty preset scales via
 * `synergyBonusPerNeighbor` (Easy 0.5 / Medium 0.35 / Hard 0.25, re-tuned by
 * CG-0MSP26Q5N002EH8P). This
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
import type { AnyCard, StaffCard } from './MainStreetCards';
import { getSkill } from './MainStreetStaffSkills';
import { formatCurrency } from '@core-engine/I18n';

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
 * Options controlling `buildCardTooltipInfo()` output.
 */
export interface CardTooltipInfoOptions {
  /**
   * Include the coin/reputation detail lines for event cards (used by the
   * market-row tooltip). Hand-held event cards omit these lines.
   */
  includeEventDetail?: boolean;
}

/**
 * Build the hover tooltip text for a Main Street card.
 *
 * All families render their cost line through `formatCurrency()` so the
 * currency symbol follows the active locale (e.g. `€` for `en`, `$` for
 * `en-US`) instead of a hardcoded symbol or raw number.
 *
 * Unknown card families return an empty string.
 *
 * @param card    The card to describe.
 * @param config  The active difficulty config (for synergy-rate resolution).
 * @param options  Optional per-call tweaks (event detail lines).
 * @returns The tooltip text (may be empty for unsupported families).
 */
export function buildCardTooltipInfo(
  card: AnyCard,
  config: SynergyFormatConfig,
  options: CardTooltipInfoOptions = {},
): string {
  switch (card.family) {
    case 'business': {
      const b = card;
      const bTotalRep = (b.reputationPerTurn ?? 0) + (b.reputationBonus ?? 0);
      const bRepInfo = bTotalRep > 0 ? `\nReputation: +${bTotalRep}/turn` : '';
      const bOngoingInfo = (b.ongoingCost ?? 0) > 0 ? `\nOngoing cost: -${b.ongoingCost}/turn` : '';
      return `Business: ${b.name}\nCost: ${formatCurrency(b.cost)}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn${bOngoingInfo}${bRepInfo}\nSynergy: ${(b.synergyTypes || []).join('/')}\n${resolveDescription(b.description ?? '', b, config)}`;
    }
    case 'community-space': {
      const cs = card;
      const csTotalRep = (cs.reputationPerTurn ?? 0) + (cs.reputationBonus ?? 0);
      const csRepInfo = csTotalRep > 0 ? `\nReputation: +${csTotalRep}/turn` : '';
      const csOngoingInfo = (cs.ongoingCost ?? 0) > 0 ? `\nOngoing cost: -${cs.ongoingCost}/turn` : '';
      return `Community Space: ${cs.name}\nCost: ${formatCurrency(cs.cost)}\nIncome: +${cs.baseIncome + (cs.incomeBonus || 0)}/turn${csOngoingInfo}${csRepInfo}\nSynergy: ${(cs.synergyTypes || []).join('/')}\n${resolveDescription(cs.description ?? '', cs, config)}`;
    }
    case 'event': {
      const e = card;
      const detail = options.includeEventDetail
        ? `\nCoins: ${e.coinDelta >= 0 ? '+' : ''}${e.coinDelta.toFixed(3)}, Rep: ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}`
        : '';
      return `Event: ${e.name}\nCost: ${formatCurrency(e.cost)}\nEffect: ${e.effect}${detail}`;
    }
    case 'upgrade': {
      const u = card;
      return `Upgrade: ${u.name}\nCost: ${formatCurrency(u.cost)}\nApplies to: ${u.targetBusiness}\nIncome Bonus: +${u.incomeBonus}\nRequires: Lv${u.requiredLevel ?? 0}\n${u.description ?? ''}`;
    }
    case 'staff': {
      // Staff cards are hired directly from the general market row
      // (CG-0MT3KZOUX007GQ44): show hire-relevant info — cost, hand slots,
      // ongoing cost and the staff member's abilities.
      const st = card as StaffCard;
      const lines = [
        `Staff: ${st.name}`,
        `Cost: ${formatCurrency(st.cost)}`,
        `Hand slots: +${st.handSlotsAdded}`,
      ];
      if ((st.ongoingCost ?? 0) > 0) lines.push(`Ongoing cost: -${st.ongoingCost}/turn`);
      if ((st.reputationPerTurn ?? 0) > 0) lines.push(`Reputation: +${st.reputationPerTurn}/turn`);
      if ((st.refreshCostDiscount ?? 0) > 0) lines.push(`Refresh discount: -${st.refreshCostDiscount} per refresh`);
      if ((st.actionsPerTurn ?? 0) > 0) lines.push(`Actions: +${st.actionsPerTurn}/day`);
      if (st.peekOncePerTurn) lines.push('Ability: peek the incident deck once per turn');
      // Specialization skills (CG-0MT1CIWSD003VBPK): the applicant card's
      // locked skill set (1-3 skills incl. the Town Gossip baseline). Legacy
      // cards without specializationSkillIds show no skills line.
      const skillIds = Array.isArray(st.specializationSkillIds) ? st.specializationSkillIds : [];
      const skillNames: string[] = [];
      for (const id of skillIds) {
        try {
          skillNames.push(getSkill(id).name);
        } catch {
          // Unknown/stale id on a saved card — show nothing for it (forward-compat).
        }
      }
      if (skillNames.length > 0) lines.push(`Skills: ${skillNames.join(', ')}`);
      if (st.description) lines.push(st.description);
      return lines.join('\n');
    }
    default:
      // Staff cards (and any future unknown families) show no tooltip text.
      return '';
  }
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

/**
 * Renders the turn instruction label (CG-0MSLXJCHH001DLIO).
 *
 * - Unlimited config (no `config.maxTurns`): `Turn N`
 * - Limited config (explicit `config.maxTurns`): `Turn N / M`
 *
 * Default presets impose no turn limit, so the label shows only the current
 * turn unless a limit is explicitly configured.
 *
 * @param config  The active difficulty config (maxTurns optional).
 * @param turn    The current 1-based turn number.
 * @returns The turn label, e.g. `Turn 3` or `Turn 3 / 20`.
 */
export function turnLabel(config: Pick<GameConfig, 'maxTurns'>, turn: number): string {
  return config.maxTurns !== undefined
    ? `Turn ${turn} / ${config.maxTurns}`
    : `Turn ${turn}`;
}
