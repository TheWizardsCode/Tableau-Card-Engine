/**
 * Main Street: Staff specialization skills (CG-0MT1CIWSD003VBPK)
 *
 * Pure skill catalog + deterministic skill assignment for staff applicants.
 * Skills are randomized once at game start and locked for the full game
 * (established by CG-0MSTOATDU006UGAX); the assignment functions here produce
 * that locked roster from a seeded RNG so a given seed always yields the same
 * skills (same-seed ⇒ same-game determinism, mirroring the engine's shuffled
 * decks).
 *
 * Assignment rules (AC3/AC4 of CG-0MT1CIWSD003VBPK):
 * - Every staff applicant receives 1–3 skills.
 * - `skill-town-gossip` (the Town Gossip peek mechanic, CG-0MSXOW6GN008ZSMN)
 *   is always included as the baseline skill.
 * - Stacking constraint: no staff member may hold more than 1 income-boost
 *   skill AND more than 1 reputation-boost skill simultaneously, preventing
 *   runaway stacking. The baseline Town Gossip is exempt from this cap — it is
 *   a fixed informational ability (peek) rather than a stacking boost, and
 *   exempting it keeps the reputation pool reachable.
 *
 * Skills only modify computations through the buff helpers in
 * `MainStreetStaffBuffs` / adjacency wiring; this module stays free of engine
 * or state imports so it can be unit-tested headlessly.
 *
 * The canonical `SpecializationSkill` / `SpecializationSkillCategory` types
 * live in `MainStreetCards` (I2, CG-0MT4WXQCN001G1LF) and are re-exported
 * here for backward compatibility with earlier imports.
 *
 * @module
 */

import type { SpecializationSkill, SpecializationSkillCategory } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import { createSeededRng } from '../../src/core-engine/SeededRng';

export type { SpecializationSkill, SpecializationSkillCategory } from './MainStreetCards';
export { STACKED_SKILL_CATEGORIES } from './MainStreetCards';

// ── Effect Categories (AC4) ─────────────────────────────────

/**
 * Effect category a specialization skill belongs to. Re-exported alias of the
 * canonical `SpecializationSkillCategory` from MainStreetCards (I2).
 */
export type SkillCategory = SpecializationSkillCategory;

/** Baseline skill always assigned to every staff applicant. */
export const BASELINE_SKILL_ID = 'skill-town-gossip' as const;

/**
 * Category badge colors used by the market-card skill chips (I5,
 * CG-0MT4WXX1Q00860VP). Hex strings consumed directly by Phaser text
 * `backgroundColor`. Distinct per effect category for at-a-glance reads.
 */
export const STAFF_SKILL_CHIP_COLORS: Readonly<Record<SpecializationSkillCategory, string>> = {
  'income-boost': '#226633',
  'reputation-boost': '#334488',
  'cost-reduction': '#886622',
  'incident-mitigation': '#883333',
};

// ── Catalog (16 skills, 4 categories) ────────────────────────

/** The global specialization-skill pool (locked at game start). */
export const STAFF_SKILL_CATALOG: readonly SpecializationSkill[] = [
  // Category A: Income Boosts
  { id: 'skill-networker', name: 'Networker', category: 'income-boost', description: '+0.2 coins per adjacent business synergy (passive).', effect: 'adjacency-coin-bonus' },
  { id: 'skill-chef', name: 'Chef de Cuisine', category: 'income-boost', description: '+20% income from Food businesses.', effect: 'income-percent-food' },
  { id: 'skill-dj', name: 'DJ', category: 'income-boost', description: '+20% income from Entertainment businesses.', effect: 'income-percent-entertainment' },
  { id: 'skill-sales-champion', name: 'Sales Champion', category: 'income-boost', description: '+0.5 coins per turn from Commerce businesses.', effect: 'income-flat-commerce' },
  { id: 'skill-tech-guru', name: 'Tech Guru', category: 'income-boost', description: 'Unlocks +1 synergy range for Entertainment businesses.', effect: 'synergy-range-entertainment' },
  // Category B: Reputation Boosts
  { id: 'skill-town-gossip', name: 'Town Gossip', category: 'reputation-boost', description: 'Peek at the top incident-deck card once per turn (baseline).', effect: 'peek-incident-deck' },
  { id: 'skill-community-builder', name: 'Community Builder', category: 'reputation-boost', description: '+0.1 reputation per turn from all businesses.', effect: 'reputation-flat-all' },
  { id: 'skill-brand-ambassador', name: 'Brand Ambassador', category: 'reputation-boost', description: '+50% reputation gain from incidents and investments.', effect: 'reputation-multiplier-sources' },
  { id: 'skill-pr-strategist', name: 'PR Strategist', category: 'reputation-boost', description: '+0.15 reputation per turn from Service businesses.', effect: 'reputation-flat-service' },
  // Category C: Cost Reductions
  { id: 'skill-cost-cutter', name: 'Cost Cutter', category: 'cost-reduction', description: '-15% ongoing costs for the entire street (flagged for extra balance testing).', effect: 'ongoing-cost-street-pct' },
  { id: 'skill-negotiator', name: 'Negotiator', category: 'cost-reduction', description: '-1 cost on business card refreshes.', effect: 'refresh-cost-flat' },
  { id: 'skill-operations-manager', name: 'Operations Manager', category: 'cost-reduction', description: '-0.5 salary cost for this employed staff member.', effect: 'salary-flat' },
  // Category D: Incident Mitigation
  { id: 'skill-quality-inspector', name: 'Quality Inspector', category: 'incident-mitigation', description: '-30% coin damage from all incidents.', effect: 'incident-coin-damage-pct' },
  { id: 'skill-risk-manager', name: 'Risk Manager', category: 'incident-mitigation', description: 'Reduces incident probability by 15%.', effect: 'incident-probability-pct' },
  { id: 'skill-security-consultant', name: 'Security Consultant', category: 'incident-mitigation', description: 'Immunity to theft/loss incidents on the home business.', effect: 'incident-theft-immunity' },
  { id: 'skill-compliance', name: 'Compliance Officer', category: 'incident-mitigation', description: 'Reduces incident reputation damage by 0.5.', effect: 'incident-rep-damage-flat' },
];

/** O(1) lookup of a specialization skill by id. */
export function getSkill(skillId: string): SpecializationSkill {
  const skill = STAFF_SKILL_CATALOG.find(s => s.id === skillId);
  if (!skill) {
    throw new Error(`Unknown specialization skill id: ${skillId}`);
  }
  return skill;
}

// ── Serialization (I2, CG-0MT4WXQCN001G1LF) ─────────────────

/**
 * Collapses a skill set to its stable id list for persistence. Skills travel
 * in saved state as plain ids (version-safe: catalogs evolve, stored ids do
 * not) and are resolved back through `getSkill` on load. Compatible with the
 * SaveLoadStore versioned-serialization convention — unknown ids fail loudly
 * rather than silently corrupting the roster.
 *
 * @param skills Skills to persist (e.g. an applicant's assigned skills).
 * @returns Stable id array suitable for JSON serialization.
 */
export function serializeSkillIds(skills: readonly SpecializationSkill[]): string[] {
  return skills.map(s => s.id);
}

/**
 * Restores a skill set from persisted ids, validating each id against the
 * current catalog.
 *
 * @param raw Persisted value (expected: array of skill ids).
 * @returns Resolved skill objects in stored order.
 * @throws Error when the payload is not an array or contains unknown ids.
 */
export function deserializeSkillIds(raw: unknown): SpecializationSkill[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid specialization skill state: expected an array, got ${typeof raw}`);
  }
  return raw.map(id => getSkill(String(id)));
}

// ── Game-start randomization (I3, CG-0MT4WXSWG0023VR0) ─────

/**
 * Derivation salt separating the skill-assignment RNG stream from the main
 * game RNG stream (deck shuffles, market draws, challenge selection). Using a
 * dedicated stream keeps `state.rngCalls` and every seed-dependent deck
 * ordering unchanged, so the wider suite's seeded fixtures stay stable.
 */
const SKILL_RNG_SALT = 0x5eed;

/**
 * Assigns specialization skills to every staff card instance in a new game:
 * the staff deck pool and the staff cards currently face-up in the market
 * row. Called once at set-up (CG-0MT4WXSWG0023VR0); assignments are locked
 * for the whole game — hires, discards, and market refills never re-roll
 * them (CG-0MSTOATDU006UGAX).
 *
 * Determinism: a dedicated `createSeededRng` stream derived from the game's
 * numeric seed produces the same assignments for the same seed (same seed ⇒
 * same game), without perturbing the main RNG stream.
 *
 * Skills are deliberately assigned from the global pool regardless of the
 * staff member's nominal job — a "Chef" can hold the "Security" skill.
 *
 * @param state Initialized game state (decks + market already assembled).
 */
export function assignStaffApplicantSkills(state: MainStreetState): void {
  const skillRng = createSeededRng(state.numericSeed ^ SKILL_RNG_SALT);
  const assign = (card: { specializationSkillIds?: string[] }): void => {
    card.specializationSkillIds = serializeSkillIds(assignSkillsToApplicant(skillRng));
  };

  for (const card of state.decks.staff) {
    assign(card);
  }
  for (const card of state.market.cards) {
    if (card.family === 'staff') {
      assign(card as { specializationSkillIds?: string[] });
    }
  }
}

// ── Deterministic Assignment (AC3/AC4) ───────────────────────

/** The stacking cap: at most one income-boost AND at most one reputation-boost beyond baseline. */
const MAX_INCOME_BOOST = 1;
const MAX_REPUTATION_BOOST = 1;

/**
 * Assigns specialization skills to a single staff applicant using a seeded
 * RNG (`() => number` in [0, 1), e.g. `createSeededRng`).
 *
 * Every draw decision consumes exactly one `rng()` call in a fixed order, so
 * the same RNG stream always produces the same skill set (and order).
 *
 * @param rng Seeded RNG; the same stream yields identical assignments.
 * @returns 1–3 skills, always including the Town Gossip baseline.
 */
export function assignSkillsToApplicant(rng: () => number): SpecializationSkill[] {
  const skills: SpecializationSkill[] = [getSkill(BASELINE_SKILL_ID)];
  // 1..3 total skills: the baseline plus 0..2 drawn from the pool.
  const total = 1 + Math.floor(rng() * 3);
  const toDraw = total - 1;

  // Candidates remain eligible while the stacking cap allows their category.
  const remaining = STAFF_SKILL_CATALOG.filter(s => s.id !== BASELINE_SKILL_ID);
  let incomeBoost = 0;
  let reputationBoost = 0;

  for (let i = 0; i < toDraw && remaining.length > 0; i += 1) {
    const candidates = remaining.filter(s => {
      if (s.category === 'income-boost' && incomeBoost >= MAX_INCOME_BOOST) return false;
      if (s.category === 'reputation-boost' && reputationBoost >= MAX_REPUTATION_BOOST) return false;
      return true;
    });
    if (candidates.length === 0) break;

    const idx = Math.floor(rng() * candidates.length);
    const picked = candidates[idx];
    skills.push(picked);
    if (picked.category === 'income-boost') incomeBoost += 1;
    if (picked.category === 'reputation-boost') reputationBoost += 1;
    remaining.splice(remaining.indexOf(picked), 1);
  }

  return skills;
}

/**
 * Assigns specialization skills to `count` staff applicants from a shared
 * seeded RNG stream (game-start roster generation).
 *
 * @param rng Seeded RNG shared across applicants.
 * @param count Number of applicants to generate.
 * @returns One skill set per applicant, in roster order.
 */
export function assignSkillsToApplicants(rng: () => number, count: number): SpecializationSkill[][] {
  const roster: SpecializationSkill[][] = [];
  for (let i = 0; i < count; i += 1) {
    roster.push(assignSkillsToApplicant(rng));
  }
  return roster;
}