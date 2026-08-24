/**
 * Main Street: Staff specialization — rendering & tooltip presentation tests
 * (I5, CG-0MT4WXX1Q00860VP; parent CG-0MT1CIWSD003VBPK).
 *
 * AC5 "help panel / UI shows staff skill information": the staff market-card
 * tooltip (buildCardTooltipInfo) lists the applicant's locked specialization
 * skills; chip badge colors map one-to-one to the four effect categories.
 * Legacy cards without skill ids show no skills line.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { buildCardTooltipInfo } from '../../example-games/main-street/MainStreetFormatting';
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';
import { STAFF_SKILL_CHIP_COLORS } from '../../example-games/main-street/MainStreetStaffSkills';

function staffWith(overrides: Partial<StaffCard>): StaffCard {
  const base = createStaffDeck(1).find(c => c.id.startsWith('staff-assistant'))!;
  return { ...base, id: `${base.id}-tpl`, ...overrides };
}

describe('staff tooltip shows specialization skills (AC5)', () => {
  it('lists skill names for an applicant holding skills', () => {
    const card = staffWith({ specializationSkillIds: ['skill-town-gossip', 'skill-chef'] });
    const tip = buildCardTooltipInfo(card, {} as never);
    expect(tip).toContain('Skills: Town Gossip, Chef de Cuisine');
    expect(tip).toContain('Staff:');
    expect(tip).toContain('Cost:');
  });

  it('owes nothing to skill ordering — baseline-first ordering from stored ids', () => {
    const card = staffWith({ specializationSkillIds: ['skill-chef', 'skill-town-gossip'] });
    const tip = buildCardTooltipInfo(card, {} as never);
    expect(tip).toContain('Skills: Chef de Cuisine, Town Gossip');
  });

  it('legacy staff without specializationSkillIds show no skills line', () => {
    const legacy = staffWith({ specializationSkillIds: undefined });
    const tip = buildCardTooltipInfo(legacy, {} as never);
    expect(tip).not.toContain('Skills:');
  });

  it('unknown/stale skill ids are skipped gracefully (forward-compat)', () => {
    const card = staffWith({ specializationSkillIds: ['skill-town-gossip', 'skill-removed'] });
    const tip = buildCardTooltipInfo(card, {} as never);
    expect(tip).toContain('Skills: Town Gossip');
    expect(tip).not.toContain('skill-removed');
  });

  it('tooltip still surfaces hired-card economics alongside skills', () => {
    const card = staffWith({
      specializationSkillIds: ['skill-town-gossip', 'skill-cost-cutter'],
      ongoingCost: 1,
      handSlotsAdded: 1,
    });
    const tip = buildCardTooltipInfo(card, {} as never);
    expect(tip).toContain('Hand slots: +1');
    expect(tip).toContain('Ongoing cost: -1/turn');
    expect(tip).toContain('Skills: Town Gossip, Cost Cutter');
  });
});

describe('skill chip colors are category-distinct (badges)', () => {
  it('covers all four effect categories with distinct colors', () => {
    const colors = Object.values(STAFF_SKILL_CHIP_COLORS);
    expect(colors).toHaveLength(4);
    expect(new Set(colors).size).toBe(4); // no category shares a chip color
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});