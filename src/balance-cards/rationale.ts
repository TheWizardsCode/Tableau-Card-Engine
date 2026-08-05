/**
 * Rationale code enum for balancing adjustments.
 * Each code has a machine-readable key and a human-readable label.
 */

export const RationaleCode = {
  TIER_REASSIGN: 'TIER_REASSIGN',
  COST_CURVE_FIT: 'COST_CURVE_FIT',
  REWARD_SPREAD: 'REWARD_SPREAD',
  BAND_BALANCE: 'BAND_BALANCE',
  INCIDENT_FREE: 'INCIDENT_FREE',
  MIN_COST_FLOOR: 'MIN_COST_FLOOR',
  MAX_COST_CEIL: 'MAX_COST_CEIL',
  SPECIAL_CASE: 'SPECIAL_CASE',
  SYNERGY_BONUS_ADJ: 'SYNERGY_BONUS_ADJ',
  INCOME_ADJUST: 'INCOME_ADJUST',
  REPUTATION_ADJ: 'REPUTATION_ADJ',
  ONGOING_COST_ADJ: 'ONGOING_COST_ADJ',
  HAND_SLOT_ADJ: 'HAND_SLOT_ADJ',
  SCOPE_ADJ: 'SCOPE_ADJ',
} as const;

export type RationaleCode = (typeof RationaleCode)[keyof typeof RationaleCode];

export const RATIONALE_LABELS: Record<RationaleCode, string> = {
  TIER_REASSIGN: 'Tier reassignment to better reflect card value',
  COST_CURVE_FIT: 'Cost adjusted via curve-fitting to reward model',
  REWARD_SPREAD: 'Reward fields adjusted to widen spread',
  BAND_BALANCE: 'Band balance adjustment to improve cost distribution',
  INCIDENT_FREE: 'Incident event kept at cost 0 (not adjusted)',
  MIN_COST_FLOOR: 'Cost adjusted to meet minimum cost floor for tier',
  MAX_COST_CEIL: 'Cost adjusted to meet maximum cost ceiling for tier',
  SPECIAL_CASE: 'Special case handling (e.g., no-synergy cards)',
  SYNERGY_BONUS_ADJ: 'Synergy bonus adjusted based on family heuristics',
  INCOME_ADJUST: 'Income adjusted based on cost tier relationship',
  REPUTATION_ADJ: 'Reputation bonus adjusted to reflect cost tier',
  ONGOING_COST_ADJ: 'Ongoing cost adjusted for staff tier balance',
  HAND_SLOT_ADJ: 'Hand slot bonus adjusted for staff tier balance',
  SCOPE_ADJ: 'Event target scope multiplier applied to cost',
};

export function rationaleLabel(code: RationaleCode): string {
  return RATIONALE_LABELS[code] ?? `Unknown rationale: ${code}`;
}

export function isValidRationaleCode(code: string): code is RationaleCode {
  return code in RationaleCode;
}

export function getAllRationaleCodes(): RationaleCode[] {
  return Object.values(RationaleCode);
}
