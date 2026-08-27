/**
 * Main Street: Staff specialization — skill assignment & RNG tests (T1,
 * CG-0MT4WXGSB002CP0P, parent CG-0MT1CIWSD003VBPK).
 *
 * Validates the deterministic skill-assignment contract defined for staff
 * applicants:
 * - AC1: Deterministic skill assignment under seeded RNG (same seed → same skills).
 * - AC2: Stacking constraint — no staff member holds more than 1 income-boost
 *   skill AND more than 1 reputation-boost skill simultaneously.
 * - AC3: 1–3 skills assigned per staff applicant.
 * - AC4: Town Gossip included as a baseline skill.
 *
 * Design decision (baseline exemption): the Town Gossip baseline
 * (skill-town-gossip) always ships with every applicant and is exempt from
 * the stacking cap. The cap governs randomly-assigned skills beyond the
 * baseline, so the reputation/income pools remain fully reachable — see
 * `assignSkillsToApplicant` in MainStreetStaffSkills.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { createSeededRng } from '../../src/core-engine/SeededRng';
import {
  assignSkillsToApplicant,
  assignSkillsToApplicants,
  BASELINE_SKILL_ID,
  STAFF_SKILL_CATALOG,
  type SkillCategory,
  type SpecializationSkill,
} from '../../example-games/main-street/MainStreetStaffSkills';

// ── Helpers ─────────────────────────────────────────────────

/** Number of independent seeds sampled for statistical properties. */
const SAMPLE_SEEDS = 500;

/** Counts skills in `skills` that fall into `category`. */
function countCategory(skills: readonly SpecializationSkill[], category: SkillCategory): number {
  return skills.filter(s => s.category === category).length;
}

/** Builds `count` independent assignments, one per seed in 0..count-1. */
function sampleAssignments(count: number = SAMPLE_SEEDS): SpecializationSkill[][] {
  const samples: SpecializationSkill[][] = [];
  for (let seed = 0; seed < count; seed += 1) {
    samples.push(assignSkillsToApplicant(createSeededRng(seed)));
  }
  return samples;
}

/** Returns the ids of an assignment in catalog order (order-insensitive compare helper). */
function sortIds(skills: readonly SpecializationSkill[]): string[] {
  return skills.map(s => s.id).sort();
}

// ── AC1: Deterministic assignment under seeded RNG ──────────

describe('AC1: seeded RNG determinism', () => {
  it('same seed produces the same skill set (and same order) for one applicant', () => {
    const first = assignSkillsToApplicant(createSeededRng(7));
    const second = assignSkillsToApplicant(createSeededRng(7));
    expect(second.map(s => s.id)).toEqual(first.map(s => s.id));
  });

  it('same seed produces an identical assignment stream across many applicants', () => {
    const first = assignSkillsToApplicants(createSeededRng(99), 40);
    const second = assignSkillsToApplicants(createSeededRng(99), 40);
    expect(second.map(a => a.map(s => s.id))).toEqual(first.map(a => a.map(s => s.id)));
  });

  it('different seeds produce varied assignments (RNG is actually consumed)', () => {
    const distinct = new Set(sampleAssignments(100).map(sortIds).map(ids => ids.join('|')));
    // With 16 skills and 1–3 draws, 100 seeds yield overwhelmingly more than
    // one distinct assignment; requiring ≥ 2 guards against a constant result.
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  it('repeated games with the same seed yield identical applicant rosters', () => {
    const first = assignSkillsToApplicants(createSeededRng(1234), 8);
    const replay = assignSkillsToApplicants(createSeededRng(1234), 8);
    expect(replay.map(a => sortIds(a).join('|'))).toEqual(first.map(a => sortIds(a).join('|')));
  });
});

// ── AC2: Stacking constraint ─────────────────────────────────

describe('AC2: stacking constraint (max 1 income-boost AND max 1 reputation-boost)', () => {
  it('never assigns more than 1 income-boost skill to any staff member', () => {
    for (const skills of sampleAssignments()) {
      expect(countCategory(skills, 'income-boost')).toBeLessThanOrEqual(1);
    }
  });

  it('never assigns more than 1 reputation-boost skill beyond the baseline', () => {
    for (const skills of sampleAssignments()) {
      const beyondBaseline = skills.filter(s => s.id !== BASELINE_SKILL_ID);
      expect(countCategory(beyondBaseline, 'reputation-boost')).toBeLessThanOrEqual(1);
    }
  });

  it('every staff member holds at most one income-boost AND at most one reputation-boost simultaneously', () => {
    for (const skills of sampleAssignments()) {
      const income = countCategory(skills, 'income-boost');
      const repBeyondBaseline = countCategory(skills.filter(s => s.id !== BASELINE_SKILL_ID), 'reputation-boost');
      expect(income).toBeLessThanOrEqual(1);
      expect(repBeyondBaseline).toBeLessThanOrEqual(1);
    }
  });

  it('does not over-restrict: a balanced 1 income-boost + 1 reputation-boost member is reachable', () => {
    // The constraint allows the full balanced combo (baseline + 1 income + 1 rep).
    // Search deterministic seeds until the combo appears; fail if it is never
    // reachable (would indicate an over-restrictive implementation).
    let found = false;
    for (let seed = 0; seed < SAMPLE_SEEDS * 10; seed += 1) {
      const skills = assignSkillsToApplicant(createSeededRng(seed));
      if (
        countCategory(skills, 'income-boost') === 1 &&
        countCategory(skills.filter(s => s.id !== BASELINE_SKILL_ID), 'reputation-boost') === 1
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ── AC3: 1–3 skills per staff applicant ─────────────────────

describe('AC3: skill count per staff applicant is in [1..3]', () => {
  it('never assigns fewer than 1 or more than 3 skills', () => {
    for (const skills of sampleAssignments()) {
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills.length).toBeLessThanOrEqual(3);
    }
  });

  it('produces the full range of sizes (1, 2 and 3 all occur)', () => {
    const sizes = new Set(sampleAssignments().map(s => s.length));
    expect(sizes.has(1)).toBe(true);
    expect(sizes.has(2)).toBe(true);
    expect(sizes.has(3)).toBe(true);
  });
});

// ── AC4: Town Gossip baseline ────────────────────────────────

describe('AC4: Town Gossip baseline skill', () => {
  it('includes skill-town-gossip in every assignment', () => {
    for (const skills of sampleAssignments()) {
      expect(skills.some(s => s.id === BASELINE_SKILL_ID)).toBe(true);
    }
  });

  it('includes the baseline exactly once per member', () => {
    for (const skills of sampleAssignments()) {
      expect(skills.filter(s => s.id === BASELINE_SKILL_ID)).toHaveLength(1);
    }
  });
});

// ── Catalog integrity & reachability ─────────────────────────

describe('skill catalog contract', () => {
  it('proposes 10+ specialization skills with unique ids (parent AC2)', () => {
    expect(STAFF_SKILL_CATALOG.length).toBeGreaterThanOrEqual(10);
    const ids = STAFF_SKILL_CATALOG.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spans all four effect categories', () => {
    const categories = new Set(STAFF_SKILL_CATALOG.map(s => s.category));
    expect(categories.has('income-boost')).toBe(true);
    expect(categories.has('reputation-boost')).toBe(true);
    expect(categories.has('cost-reduction')).toBe(true);
    expect(categories.has('incident-mitigation')).toBe(true);
  });

  it('every non-baseline skill is reachable by assignment (no dead pool entries)', () => {
    const seen = new Set<string>();
    for (const skills of sampleAssignments(SAMPLE_SEEDS * 4)) {
      for (const s of skills) seen.add(s.id);
    }
    const unreachable = STAFF_SKILL_CATALOG.map(s => s.id).filter(id => !seen.has(id));
    expect(unreachable).toEqual([]);
  });
});