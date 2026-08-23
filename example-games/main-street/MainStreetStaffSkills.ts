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
 * @module
 */

// ── Effect Categories (AC4) ─────────────────────────────────

/** Effect category a specialization skill belongs to. */
export type SkillCategory =
  | 'income-boost'
  | 'reputation-boost'
  | 'cost-reduction'
  | 'incident-mitigation';

/** A single specialization skill from the global pool. */
export interface SpecializationSkill {
  readonly id: string;
  readonly name: string;
  readonly category: SkillCategory;
  readonly description: string;
}

/** Baseline skill always assigned to every staff applicant. */
export const BASELINE_SKILL_ID = 'skill-town-gossip' as const;

// ── Catalog (16 skills, 4 categories) ────────────────────────

/** The global specialization-skill pool (locked at game start). */
export const STAFF_SKILL_CATALOG: readonly SpecializationSkill[] = [
  // Category A: Income Boosts
  { id: 'skill-networker', name: 'Networker', category: 'income-boost', description: '+0.2 coins per adjacent business synergy (passive).' },
  { id: 'skill-chef', name: 'Chef de Cuisine', category: 'income-boost', description: '+20% income from Food businesses.' },
  { id: 'skill-dj', name: 'DJ', category: 'income-boost', description: '+20% income from Entertainment businesses.' },
  { id: 'skill-sales-champion', name: 'Sales Champion', category: 'income-boost', description: '+0.5 coins per turn from Commerce businesses.' },
  { id: 'skill-tech-guru', name: 'Tech Guru', category: 'income-boost', description: 'Unlocks +1 synergy range for Entertainment businesses.' },
  // Category B: Reputation Boosts
  { id: 'skill-town-gossip', name: 'Town Gossip', category: 'reputation-boost', description: 'Peek at the top incident-deck card once per turn (baseline).' },
  { id: 'skill-community-builder', name: 'Community Builder', category: 'reputation-boost', description: '+0.1 reputation per turn from all businesses.' },
  { id: 'skill-brand-ambassador', name: 'Brand Ambassador', category: 'reputation-boost', description: '+50% reputation gain from incidents and investments.' },
  { id: 'skill-pr-strategist', name: 'PR Strategist', category: 'reputation-boost', description: '+0.15 reputation per turn from Service businesses.' },
  // Category C: Cost Reductions
  { id: 'skill-cost-cutter', name: 'Cost Cutter', category: 'cost-reduction', description: '-15% ongoing costs for the entire street (flagged for extra balance testing).' },
  { id: 'skill-negotiator', name: 'Negotiator', category: 'cost-reduction', description: '-1 cost on business card refreshes.' },
  { id: 'skill-operations-manager', name: 'Operations Manager', category: 'cost-reduction', description: '-0.5 salary cost for this employed staff member.' },
  // Category D: Incident Mitigation
  { id: 'skill-quality-inspector', name: 'Quality Inspector', category: 'incident-mitigation', description: '-30% coin damage from all incidents.' },
  { id: 'skill-risk-manager', name: 'Risk Manager', category: 'incident-mitigation', description: 'Reduces incident probability by 15%.' },
  { id: 'skill-security-consultant', name: 'Security Consultant', category: 'incident-mitigation', description: 'Immunity to theft/loss incidents on the home business.' },
  { id: 'skill-compliance', name: 'Compliance Officer', category: 'incident-mitigation', description: 'Reduces incident reputation damage by 0.5.' },
];

/** O(1) lookup of a specialization skill by id. */
export function getSkill(skillId: string): SpecializationSkill {
  const skill = STAFF_SKILL_CATALOG.find(s => s.id === skillId);
  if (!skill) {
    throw new Error(`Unknown specialization skill id: ${skillId}`);
  }
  return skill;
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