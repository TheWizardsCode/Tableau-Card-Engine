/**
 * Main Street: Staff specialization — per-business buff application (T2,
 * CG-0MT4WXJDQ007H19S; parent CG-0MT1CIWSD003VBPK).
 *
 * Pure functions that translate employed staff specialization skills into
 * numeric buffs for income, reputation, ongoing costs, and incident
 * mitigation. The adjacency/engine wiring (I4, CG-0MT4WXV2J000M35M) folds
 * these buffs into `applyIncome` / `applyCommunitySpaceOngoingCosts` /
 * reputation and incident computations at call time.
 *
 * **Caching-safety contract:** these functions never mutate the state or the
 * engine's incremental-update caches (`currentIncome` / `currentRepPerTurn`,
 * CG-0MSVYPEZ90085SHE). They derive buffs from immutable profiles, so the
 * wiring can recompute them on demand without invalidating adjacency caches.
 *
 * Skill → effect mapping follows the CG-0MT1CIWSD003VBPK catalog:
 * - Income: skill-chef (+20% Food), skill-dj (+20% Entertainment),
 *   skill-sales-champion (+0.5 Commerce per turn); skill-networker and
 *   skill-tech-guru are adjacency-scoped and NOT part of the per-business
 *   income profile.
 * - Reputation: skill-community-builder (+0.1 all), skill-pr-strategist
 *   (+0.15 Service); skill-brand-ambassador is a +50% event-source
 *   multiplier (incidents/investments), exposed separately.
 * - Costs: skill-cost-cutter (-15% street-wide ongoing), skill-negotiator
 *   (-1 refresh), skill-operations-manager (-0.5 staff salary).
 * - Incidents: skill-quality-inspector (-30% coin), skill-compliance
 *   (-0.5 rep), skill-risk-manager (-15% probability), skill-security-
 *   consultant (theft/loss immunity on the home business).
 *
 * @module
 */

import type { SynergyType } from './MainStreetCards';
import type { SpecializationSkill } from './MainStreetStaffSkills';
import { deserializeSkillIds } from './MainStreetStaffSkills';
import type { MainStreetState } from './MainStreetState';

// ── Buff Profiles ───────────────────────────────────────────

/** Immutable per-business inputs the buff functions read. */
export interface BusinessBuffProfile {
  /** Synergy types of the business (drives synergy-gated skills). */
  readonly synergyTypes: readonly SynergyType[];
  /** Per-turn income before skill buffs (baseIncome + upgrade incomeBonus). */
  readonly baseIncome: number;
  /**
   * Per-turn ongoing cost of this business (the value `applyIncome` /
   * `applyCommunitySpaceOngoingCosts` deducts). Only used to attribute
   * cost-cutter reductions; costs are never mutated here.
   */
  readonly ongoingCost: number;
}

/** Income buffs for one business. */
export interface IncomeSkillBuffs {
  /** Flat coins added per turn (e.g. Sales Champion +0.5). */
  readonly flat: number;
  /** Fractional multiplier on pre-skill income (0.2 = +20%). */
  readonly percent: number;
}

/** Reputation buffs for one business. */
export interface ReputationSkillBuffs {
  /** Flat reputation added per turn (e.g. Community Builder +0.1). */
  readonly flat: number;
}

/** Ongoing-cost buffs for one business. */
export interface OngoingCostSkillBuffs {
  /** Fraction of this business's ongoing cost removed (0.15 = -15%). */
  readonly reductionPct: number;
}

/** Incident-mitigation buffs aggregated for the street / home business. */
export interface IncidentSkillBuffs {
  /** Fraction of incident coin damage removed (0.3 = -30%). */
  readonly coinDamageReductionPct: number;
  /** Flat incident reputation damage removed (0.5). */
  readonly reputationDamageReductionFlat: number;
  /** Fraction of incident probability removed (0.15 = -15%). */
  readonly probabilityReductionPct: number;
  /** True when theft/loss incidents cannot target the home business. */
  readonly immuneToTheftLoss: boolean;
}

/** Complete per-business buff bundle derived from the employed skill set. */
export interface PerBusinessSkillBuffs {
  readonly income: IncomeSkillBuffs;
  readonly reputation: ReputationSkillBuffs;
  readonly ongoingCosts: OngoingCostSkillBuffs;
  readonly incidents: IncidentSkillBuffs;
}

// ── Magic-numbers reference (balance docs CG-0MT1CIWSD003VBPK) ─

export const CHEF_INCOME_BOOST_PCT = 0.2;
export const DJ_INCOME_BOOST_PCT = 0.2;
export const SALES_CHAMPION_FLAT = 0.5;
export const COMMUNITY_BUILDER_REP = 0.1;
export const PR_STRATEGIST_REP = 0.15;
export const COST_CUTTER_ONGOING_PCT = 0.15;
export const NEGOTIATOR_REFRESH_DISCOUNT = 1;
export const OPERATIONS_MANAGER_SALARY_DISCOUNT = 0.5;
export const QUALITY_INSPECTOR_COIN_PCT = 0.3;
export const COMPLIANCE_REP_FLAT = 0.5;
export const RISK_MANAGER_PROBABILITY_PCT = 0.15;
export const BRAND_AMBASSADOR_REP_MULTIPLIER = 1.5;

// ── Per-business buff computation ───────────────────────────

/**
 * Computes the per-business buff bundle for one business from the employed
 * skill set. Pure: never mutates `profile` or any game state.
 *
 * @param skills  Employed specialization skills (one or more staff members).
 * @param profile Immutable per-business inputs.
 * @returns The buff bundle to fold into income/reputation/cost computations.
 */
export function computePerBusinessSkillBuffs(
  skills: readonly SpecializationSkill[],
  profile: BusinessBuffProfile,
): PerBusinessSkillBuffs {
  const income = { flat: 0, percent: 0 };
  const reputation = { flat: 0 };
  const ongoingCosts = { reductionPct: 0 };
  const incidents = {
    coinDamageReductionPct: 0,
    reputationDamageReductionFlat: 0,
    probabilityReductionPct: 0,
    immuneToTheftLoss: false,
  };

  for (const skill of skills) {
    switch (skill.id) {
      // Category A: income boosts (per-business subset; networker/tech-guru
      // are adjacency-scoped and handled by their own helpers).
      case 'skill-chef':
        if (profile.synergyTypes.includes('Food')) income.percent += CHEF_INCOME_BOOST_PCT;
        break;
      case 'skill-dj':
        if (profile.synergyTypes.includes('Entertainment')) income.percent += DJ_INCOME_BOOST_PCT;
        break;
      case 'skill-sales-champion':
        if (profile.synergyTypes.includes('Commerce')) income.flat += SALES_CHAMPION_FLAT;
        break;
      // Category B: reputation boosts (per-business subset).
      case 'skill-community-builder':
        reputation.flat += COMMUNITY_BUILDER_REP;
        break;
      case 'skill-pr-strategist':
        if (profile.synergyTypes.includes('Service')) reputation.flat += PR_STRATEGIST_REP;
        break;
      // Category C: cost reductions (per-business subset: street-wide %).
      case 'skill-cost-cutter':
        ongoingCosts.reductionPct += COST_CUTTER_ONGOING_PCT;
        break;
      // Category D: incident mitigation.
      case 'skill-quality-inspector':
        incidents.coinDamageReductionPct += QUALITY_INSPECTOR_COIN_PCT;
        break;
      case 'skill-compliance':
        incidents.reputationDamageReductionFlat += COMPLIANCE_REP_FLAT;
        break;
      case 'skill-risk-manager':
        incidents.probabilityReductionPct += RISK_MANAGER_PROBABILITY_PCT;
        break;
      case 'skill-security-consultant':
        incidents.immuneToTheftLoss = true;
        break;
      // Default: no per-business application (baseline Town Gossip,
      // adjacency-scoped networker/tech-guru, event-scoped brand-ambassador,
      // refresh/salary cost skills negotiator & operations-manager).
      default:
        break;
    }
  }

  return { income, reputation, ongoingCosts, incidents };
}

// ── Street / engine-level buff helpers ──────────────────────

/**
 * Flattens the specialization skills of every currently employed staff
 * member (hired cards in `state.staffCards`) into one skill list — the
 * STREET-WIDE aggregation used for buffs that are not business-scoped
 * (cost-cutter, incident mitigation, brand-ambassador, negotiator,
 * ops-manager salary, networker, tech-guru). Skills are read from the
 * card's locked `specializationSkillIds` (I3); members without the field
 * (legacy saves / hand-built fixtures) contribute nothing.
 *
 * Per-business income/reputation buffs use
 * {@link getEmployedSpecializationSkillsForBusiness} instead, so hand-slot
 * staff (no `employedAtSlot`) never leak income/rep buffs onto the street
 * (CG-0MSTOATDU006UGAX).
 */
export function getEmployedSpecializationSkills(state: MainStreetState): SpecializationSkill[] {
  return (state.staffCards ?? []).flatMap(card => {
    const ids = Array.isArray(card.specializationSkillIds) ? card.specializationSkillIds : [];
    try {
      return deserializeSkillIds(ids);
    } catch {
      // A stale/unknown skill id on a saved member must not break the income
      // phase; skip the member's skills (documented forward-compat path).
      return [];
    }
  });
}

/**
 * Flattens the specialization skills of ONLY the staff member(s) employed at
 * the given street-grid slot (`employedAtSlot === slotIndex`). Per-business
 * income/reputation buffs in `applyIncome` are derived from this per-slot
 * pool, so a Chef employed at one Food business never buffs another Food
 * business elsewhere on the street, and hand-slot staff (no `employedAtSlot`)
 * contribute no per-business buffs (CG-0MSTOATDU006UGAX).
 *
 * @param state     Current game state.
 * @param slotIndex Street-grid slot index of the target business.
 * @returns The employed specialization skills at that slot (empty when none).
 */
export function getEmployedSpecializationSkillsForBusiness(
  state: MainStreetState,
  slotIndex: number,
): SpecializationSkill[] {
  return (state.staffCards ?? []).flatMap(card => {
    if (card.employedAtSlot !== slotIndex) return [];
    const ids = Array.isArray(card.specializationSkillIds) ? card.specializationSkillIds : [];
    try {
      return deserializeSkillIds(ids);
    } catch {
      // Stale/unknown skill ids are skipped (same forward-compat path as the
      // street-wide aggregator).
      return [];
    }
  });
}

/**
 * Incident-mitigation buffs aggregated street-wide, independent of any
 * single business profile (all incident skills are profile-agnostic). Used by
 * the incident resolution path (I4).
 */
export function computeIncidentSkillBuffs(skills: readonly SpecializationSkill[]): IncidentSkillBuffs {
  const incidents = {
    coinDamageReductionPct: 0,
    reputationDamageReductionFlat: 0,
    probabilityReductionPct: 0,
    immuneToTheftLoss: false,
  };
  for (const skill of skills) {
    switch (skill.id) {
      case 'skill-quality-inspector':
        incidents.coinDamageReductionPct += QUALITY_INSPECTOR_COIN_PCT;
        break;
      case 'skill-compliance':
        incidents.reputationDamageReductionFlat += COMPLIANCE_REP_FLAT;
        break;
      case 'skill-risk-manager':
        incidents.probabilityReductionPct += RISK_MANAGER_PROBABILITY_PCT;
        break;
      case 'skill-security-consultant':
        incidents.immuneToTheftLoss = true;
        break;
      default:
        break;
    }
  }
  return incidents;
}

/**
 * Street-wide ongoing-cost reduction (Cost Cutter, -15%). Flagged AC5 for
 * additional balance testing because it scales with every earned card.
 */
export function computeStreetOngoingCostReductionPct(
  skills: readonly SpecializationSkill[],
): number {
  return skills.filter(s => s.id === 'skill-cost-cutter').length * COST_CUTTER_ONGOING_PCT;
}

/** Flat discount on each business-card refresh (Negotiator, -1). */
export function computeRefreshCostDiscount(skills: readonly SpecializationSkill[]): number {
  return skills.filter(s => s.id === 'skill-negotiator').length * NEGOTIATOR_REFRESH_DISCOUNT;
}

/** Flat salary discount for THIS employed staff member (Operations Manager, -0.5). */
export function computeStaffSalaryDiscount(skills: readonly SpecializationSkill[]): number {
  return skills.filter(s => s.id === 'skill-operations-manager').length * OPERATIONS_MANAGER_SALARY_DISCOUNT;
}

/** A staff member's ongoing salary after the Operations Manager discount (clamped at 0). */
export function computeStaffSalaryCost(
  skills: readonly SpecializationSkill[],
  baseSalary: number,
): number {
  return Math.max(0, baseSalary - computeStaffSalaryDiscount(skills));
}

/** Multiplier on reputation gains from incidents & investments (Brand Ambassador, +50%). */
export function computeReputationGainMultiplier(skills: readonly SpecializationSkill[]): number {
  return skills.some(s => s.id === 'skill-brand-ambassador') ? BRAND_AMBASSADOR_REP_MULTIPLIER : 1;
}

/** Extra synergy range for Entertainment businesses (Tech Guru, +1). */
export function computeEntertainmentSynergyRangeBoost(skills: readonly SpecializationSkill[]): number {
  return skills.filter(s => s.id === 'skill-tech-guru').length;
}

/** Flat coins per adjacent matching synergy (Networker, +0.2 per adjacency). */
export function computeAdjacencyCoinBonus(skills: readonly SpecializationSkill[]): number {
  return skills.filter(s => s.id === 'skill-networker').length * 0.2;
}