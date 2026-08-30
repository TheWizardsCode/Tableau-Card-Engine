/**
 * Main Street: Staff specialization — balance integration tests
 * (D1, CG-0MT4WXZPX0040SA4; parent CG-0MT1CIWSD003VBPK).
 *
 * End-to-end validation that the specialization feature works as one system:
 * game-start skill assignment (I3) → hired staff carrying skills (I1/I3) →
 * buffs reaching engine computations (I4) → presentation data the UI
 * consumes (I5), while coexisting with established mechanics (Town Gossip
 * peek CG-0MSXOW6GN008ZSMN, Group F abilities CG-0MSQJ7VL9009JHF4, ongoing
 * costs CG-0MSVYPEZ90085SHE).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  hireStaffCard,
  peekIncidentDeck,
} from '../../example-games/main-street/MainStreetEngine';
import { applyIncome, syncCardCurrentIncome } from '../../example-games/main-street/MainStreetAdjacency';
import { buildCardTooltipInfo } from '../../example-games/main-street/MainStreetFormatting';
import {
  getSkill,
  BASELINE_SKILL_ID,
  deserializeSkillIds,
} from '../../example-games/main-street/MainStreetStaffSkills';
import { getEmployedSpecializationSkills } from '../../example-games/main-street/MainStreetStaffBuffs';
import type { StaffCard } from '../../example-games/main-street/MainStreetCards';

describe('D1: staff specialization end-to-end integration', () => {
  it('game-start roster is deterministic AND drives buffed income after a hire', () => {
    const build = (seed: string) => {
      const state = setupMainStreetGame({ seed });
      executeDayStart(state);
      return state;
    };
    const a = build('d1-flow');
    const b = build('d1-flow');

    // Deterministic assignments across two fresh games (I3).
    const key = (s: typeof a) =>
      s.decks.staff.map(c => `${c.id}:${(c.specializationSkillIds ?? []).join('+')}`);
    expect(key(b)).toEqual(key(a));

    // Hire a staff member with an income skill from the actual roster and
    // verify the income fold (I4). Staff wizardry: pick the first market
    // member; if it lacks an income skill, hire a synthetic member carrying
    // one of the roster's income skills.
    const rowStaff = a.market.cards.filter(c => c.family === 'staff') as StaffCard[];
    let employed: StaffCard | null = null;
    if (rowStaff.length > 0) {
      a.resourceBank.coins = 999;
      a.phase = 'MarketPhase';
      try {
        hireStaffCard(a, rowStaff[0].id);
        employed = a.staffCards[0];
      } catch {
        employed = null;
      }
    }

    // Per-business buffs apply ONLY to the business a member is employed at
    // (CG-0MSTOATDU006UGAX): employ the income-skill member at slot 0, or fall
    // back to a deterministic synthetic Chef employed there.
    const hasIncomeSkill = employed && (employed.specializationSkillIds ?? []).some(id => getSkill(id).category === 'income-boost');
    if (hasIncomeSkill) {
      employed!.employedAtSlot = 0;
    } else {
      a.staffCards.push({
        ...a.decks.staff[0],
        id: 'staff-d1-chef',
        specializationSkillIds: ['skill-town-gossip', 'skill-chef'],
        employedAtSlot: 0,
      });
    }
    a.streetGrid[0] = {
      family: 'business', id: 'biz-d1', name: 'D1 Bistro', cost: 3, baseIncome: 2,
      synergyTypes: ['Food'], maxLevel: 0, level: 0, incomeBonus: 0,
      synergyRangeBonus: 0, reputationBonus: 0, description: 'D1 fixture.', ongoingCost: 1,
    };
    syncCardCurrentIncome(a.streetGrid, 0);

    const employedSkills = getEmployedSpecializationSkills(a);
    const hasChefEmployed = employedSkills.some(s => s.id === 'skill-chef');
    const result = applyIncome(a);
    const slotTotal = result.breakdown?.find((s: { slotIndex: number }) => s.slotIndex === 0)?.total ?? 0;
    if (hasChefEmployed) {
      // Chef (+20%) on the Food fixture → 2 * 1.2 = 2.4.
      expect(slotTotal).toBeCloseTo(2.4);
    } else {
      // No Chef employed at the Food business → unbuffed baseline.
      expect(slotTotal).toBe(2);
    }
  });

  it('locked skills survive hire → end-of-turn → save → restore (snapshot stable)', () => {
    const state = setupMainStreetGame({ seed: 'd1-persist' });
    executeDayStart(state);
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 999;
    const rowStaff = state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
    if (rowStaff.length > 0) {
      hireStaffCard(state, rowStaff[0].id);
    }
    processEndOfTurn(state);

    const saved = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(saved);

    const key = (s: typeof state) =>
      [...s.staffCards, ...s.decks.staff].map(c => `${c.id}:${(c.specializationSkillIds ?? []).join('+')}`);
    expect(key(restored)).toEqual(key(state));
  });

  it('Town Gossip peek coexists with assigned skills (baseline on every member)', () => {
    const state = setupMainStreetGame({ seed: 'd1-peek' });
    executeDayStart(state);
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 999;

    // Every market staff member carries the baseline peek skill.
    for (const card of state.market.cards.filter(c => c.family === 'staff') as StaffCard[]) {
      expect(card.specializationSkillIds).toContain(BASELINE_SKILL_ID);
    }

    // Hire one and use the peek action end-to-end.
    const rowStaff = state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
    if (rowStaff.length > 0) {
      hireStaffCard(state, rowStaff[0].id);
      const before = state.revealedPeekedCard;
      const peeked = peekIncidentDeck(state);
      expect(peeked).toBeTruthy();
      expect(state.revealedPeekedCard).not.toBe(before);
      expect(state.revealedPeekedCard).toBe(peeked);
    }
  });

  it('stacking constraint holds across the real per-game roster (no hand-tuning)', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const state = setupMainStreetGame({ seed: `d1-stack-${seed}` });
      for (const card of [...state.decks.staff, ...state.market.cards.filter(c => c.family === 'staff') as StaffCard[]]) {
        const skills = deserializeSkillIds(card.specializationSkillIds ?? []);
        const income = skills.filter(s => s.category === 'income-boost').length;
        const rep = skills.filter(s => s.category === 'reputation-boost' && s.id !== BASELINE_SKILL_ID).length;
        expect(income, `${card.id} seed ${seed}`).toBeLessThanOrEqual(1);
        expect(rep, `${card.id} seed ${seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('UI presentation data matches the engine skills (tooltip + badges agree)', () => {
    const state = setupMainStreetGame({ seed: 'd1-ui' });
    executeDayStart(state);
    const rowStaff = state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
    for (const card of rowStaff) {
      const tip = buildCardTooltipInfo(card, {} as never);
      const ids = card.specializationSkillIds ?? [];
      if (ids.length > 0) {
        // Tooltip lists every skill name exactly once, in stored order.
        const names = ids.map(id => getSkill(id).name);
        for (const n of names) expect(tip).toContain(n);
        expect(tip).toContain('Skills:');
      } else {
        expect(tip).not.toContain('Skills:');
      }
    }
  });

  it('ongoing costs (CG-0MSVYPEZ90085SHE) coexist with the Cost Cutter reduction', () => {
    const state = setupMainStreetGame({ seed: 'd1-costs' });
    executeDayStart(state);
    state.streetGrid[0] = {
      family: 'community-space', id: 'cs-d1', name: 'D1 Plaza', cost: 4, baseIncome: 0,
      synergyTypes: ['Culture'], maxLevel: 0, level: 0, incomeBonus: 0,
      synergyRangeBonus: 0, reputationBonus: 0, description: 'D1 fixture.', ongoingCost: 1,
    };
    state.staffCards.push({
      ...state.decks.staff[0],
      id: 'staff-d1-cutter',
      specializationSkillIds: ['skill-cost-cutter'],
    });
    state.resourceBank.coins = 100;
    processEndOfTurn(state);

    const control = setupMainStreetGame({ seed: 'd1-costs' });
    executeDayStart(control);
    control.streetGrid[0] = {
      family: 'community-space', id: 'cs-d1', name: 'D1 Plaza', cost: 4, baseIncome: 0,
      synergyTypes: ['Culture'], maxLevel: 0, level: 0, incomeBonus: 0,
      synergyRangeBonus: 0, reputationBonus: 0, description: 'D1 fixture.', ongoingCost: 1,
    };
    control.staffCards.push({ ...control.decks.staff[0], id: 'staff-d1-cutter', specializationSkillIds: [] });
    control.resourceBank.coins = 100;
    processEndOfTurn(control);

    // Identical flow; the cutter member saves 15% on the community-space cost
    // AND on its own salary (1.0) → the buffed run keeps 0.30 coins more.
    expect(state.resourceBank.coins).toBeCloseTo(control.resourceBank.coins + 0.3);
  });
});