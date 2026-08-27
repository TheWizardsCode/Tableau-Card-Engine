/**
 * Main Street: Staff specialization — skill type & catalog definition tests
 * (I2, CG-0MT4WXQCN001G1LF; parent CG-0MT1CIWSD003VBPK).
 *
 * Validates that the canonical `SpecializationSkill` types live in
 * MainStreetCards, the catalog matches the parent-table composition exactly
 * (5 income / 4 reputation / 3 cost / 4 incident — 16 skills incl. the Town
 * Gossip baseline), every entry carries effect metadata, stacking metadata is
 * exposed for the max-1 constraint, and skill state round-trips through the
 * versioned serialization helpers.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  SpecializationSkill,
  SpecializationSkillCategory,
  STACKED_SKILL_CATEGORIES,
} from '../../example-games/main-street/MainStreetCards';
import {
  STAFF_SKILL_CATALOG,
  BASELINE_SKILL_ID,
  getSkill,
  serializeSkillIds,
  deserializeSkillIds,
  assignSkillsToApplicants,
  type SkillCategory,
} from '../../example-games/main-street/MainStreetStaffSkills';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── AC1: type defined in MainStreetCards with full metadata ─

describe('SpecializationSkill type lives in MainStreetCards (AC1)', () => {
  it('is importable from MainStreetCards with category + effect metadata', () => {
    const chef: SpecializationSkill = {
      id: 'skill-chef',
      name: 'Chef de Cuisine',
      category: 'income-boost',
      description: '+20% income from Food businesses.',
      effect: 'income-percent-food',
    };
    expect(chef.category).toBe('income-boost');
    expect(chef.effect.length).toBeGreaterThan(0);
  });

  it('re-exports the canonical type/category from MainStreetStaffSkills', () => {
    // Backward-compatible alias used by earlier imports (T1/T3 tests).
    const category: SkillCategory = 'cost-reduction';
    const categories: SpecializationSkillCategory[] = [
      'income-boost',
      'reputation-boost',
      'cost-reduction',
      'incident-mitigation',
    ];
    expect(categories).toContain(category);
    expect(categories).toHaveLength(4);
  });
});

// ── AC2: catalog composition matches the parent table ───────

describe('catalog composition (AC2)', () => {
  const byCategory = (cat: SpecializationSkillCategory) =>
    STAFF_SKILL_CATALOG.filter(s => s.category === cat).map(s => s.id).sort();

  it('contains exactly 5 income-boost skills (Networker, Chef, DJ, Sales Champion, Tech Guru)', () => {
    expect(byCategory('income-boost')).toEqual(
      ['skill-chef', 'skill-dj', 'skill-networker', 'skill-sales-champion', 'skill-tech-guru'].sort(),
    );
  });

  it('contains exactly 4 reputation-boost skills (incl. Town Gossip baseline)', () => {
    expect(byCategory('reputation-boost')).toEqual(
      ['skill-brand-ambassador', 'skill-community-builder', 'skill-pr-strategist', 'skill-town-gossip'].sort(),
    );
  });

  it('contains exactly 3 cost-reduction skills', () => {
    expect(byCategory('cost-reduction')).toEqual(
      ['skill-cost-cutter', 'skill-negotiator', 'skill-operations-manager'].sort(),
    );
  });

  it('contains exactly 4 incident-mitigation skills', () => {
    expect(byCategory('incident-mitigation')).toEqual(
      ['skill-compliance', 'skill-quality-inspector', 'skill-risk-manager', 'skill-security-consultant'].sort(),
    );
  });

  it('catalog totals 16 unique ids with the Town Gossip baseline', () => {
    const ids = STAFF_SKILL_CATALOG.map(s => s.id);
    expect(new Set(ids).size).toBe(16);
    expect(ids).toContain(BASELINE_SKILL_ID);
    expect(getSkill(BASELINE_SKILL_ID).category).toBe('reputation-boost');
  });

  it('every entry carries non-empty effect metadata (consumed by buff wiring)', () => {
    for (const skill of STAFF_SKILL_CATALOG) {
      expect(skill.effect.trim().length, `${skill.id} effect`).toBeGreaterThan(0);
      expect(skill.description.trim().length, `${skill.id} description`).toBeGreaterThan(0);
    }
  });
});

// ── AC: stacking metadata exposed for the max-1 constraint ──

describe('stacking metadata (max 1 income + 1 reputation per staff)', () => {
  it('STACKED_SKILL_CATEGORIES is exactly income-boost + reputation-boost', () => {
    expect(STACKED_SKILL_CATEGORIES).toEqual(['income-boost', 'reputation-boost']);
  });

  it('every stacked-category skill in the catalog is enforceable by category alone', () => {
    for (const skill of STAFF_SKILL_CATALOG) {
      if (STACKED_SKILL_CATEGORIES.includes(skill.category)) {
        // Category value IS the stacking key — assignment (T1) counts by it.
        expect(['income-boost', 'reputation-boost']).toContain(skill.category);
      }
    }
  });
});

// ── AC: JSON/TS serialization support (SaveLoadStore versioning) ─

describe('serialization support for saved state', () => {
  const sample = () => deserializeSkillIds(['skill-town-gossip', 'skill-chef', 'skill-cost-cutter']);

  it('serializeSkillIds collapses a roster to stable ids (JSON-safe)', () => {
    expect(serializeSkillIds(sample())).toEqual(['skill-town-gossip', 'skill-chef', 'skill-cost-cutter']);
    // Round-trips through JSON without loss.
    const raw = JSON.parse(JSON.stringify(serializeSkillIds(sample()))) as string[];
    expect(deserializeSkillIds(raw)).toEqual(sample());
  });

  it('deserializeSkillIds preserves stored order and resolves via the catalog', () => {
    const restored = sample();
    expect(restored.map(s => s.name)).toEqual(['Town Gossip', 'Chef de Cuisine', 'Cost Cutter']);
    expect(restored.map(s => s.effect)).toEqual(['peek-incident-deck', 'income-percent-food', 'ongoing-cost-street-pct']);
  });

  it('rejects invalid payloads loudly (version-mismatch convention)', () => {
    expect(() => deserializeSkillIds('skill-town-gossip')).toThrow(/expected an array/);
    expect(() => deserializeSkillIds(null)).toThrow(/expected an array/);
    expect(() => deserializeSkillIds(['skill-chef', 'skill-does-not-exist'])).toThrow(/Unknown specialization skill id/);
  });

  it('assigned rosters survive a serialize -> deserialize round-trip', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const roster = assignSkillsToApplicants(createSeededRng(seed), 8);
      for (const member of roster) {
        const ids = serializeSkillIds(member);
        expect(deserializeSkillIds(ids).map(s => s.id)).toEqual(ids);
      }
    }
  });
});