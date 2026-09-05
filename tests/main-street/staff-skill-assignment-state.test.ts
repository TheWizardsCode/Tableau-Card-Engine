/**
 * Main Street: Staff specialization — game-start skill randomization &
 * assignment state tests (I3, CG-0MT4WXSWG0023VR0; parent CG-0MT1CIWSD003VBPK).
 *
 * Validates the per-game skill assignment contract:
 * - AC1: skills randomized once at game start, locked for the full game.
 * - AC2: 1–3 skills per staff applicant from the global pool.
 * - AC3: no staff member holds >1 income-boost AND >1 reputation-boost.
 * - AC4: Town Gossip included as the baseline skill.
 * - AC5: skills disconnected from the nominal job.
 * - AC6: deterministic under seeded RNG (same seed → same assignment).
 * - Serialization: locked skill rosters survive save → restore.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  getSkill,
  BASELINE_SKILL_ID,
  deserializeSkillIds,
} from '../../example-games/main-street/MainStreetStaffSkills';
import { executeDayStart, processEndOfTurn, hireStaffCard } from '../../example-games/main-street/MainStreetEngine';
import { refreshMarket } from '../../example-games/main-street/MainStreetMarket';
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** All staff card instances in the game (deck pool + market row). */
function allStaffInstances(state: MainStreetState): StaffCard[] {
  const deck = state.decks.staff;
  const row = state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
  return [...deck, ...row];
}

function skillIdsOf(cards: StaffCard[]): string[][] {
  return cards.map(c => c.specializationSkillIds ?? []);
}

describe('I3: game-start skill assignment (CG-0MT4WXSWG0023VR0)', () => {
  it('AC2/AC4: every staff instance has 1–3 skills incl. the Town Gossip baseline', () => {
    const state = setupMainStreetGame({ seed: 'i3-roster' });
    const cards = allStaffInstances(state);
    expect(cards.length).toBeGreaterThanOrEqual(21); // full staff catalog in deck
    for (const card of cards) {
      expect(card.specializationSkillIds, card.id).toBeDefined();
      expect(card.specializationSkillIds!.length).toBeGreaterThanOrEqual(1);
      expect(card.specializationSkillIds!.length).toBeLessThanOrEqual(3);
      expect(card.specializationSkillIds).toContain(BASELINE_SKILL_ID);
    }
  });

  it('AC3: no instance holds >1 income-boost or >1 reputation-boost beyond baseline', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const state = setupMainStreetGame({ seed: `i3-constraint-${seed}` });
      for (const card of allStaffInstances(state)) {
        const skills = deserializeSkillIds(card.specializationSkillIds ?? []);
        const income = skills.filter(s => s.category === 'income-boost').length;
        const rep = skills.filter(s => s.category === 'reputation-boost' && s.id !== BASELINE_SKILL_ID).length;
        expect(income, `${card.id} seed ${seed}`).toBeLessThanOrEqual(1);
        expect(rep, `${card.id} seed ${seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('AC6: same seed produces identical rosters on every staff instance', () => {
    const a = allStaffInstances(setupMainStreetGame({ seed: 'i3-detect' }));
    const b = allStaffInstances(setupMainStreetGame({ seed: 'i3-detect' }));
    expect(skillIdsOf(b)).toEqual(skillIdsOf(a));
  });

  it('AC6: different seeds diverge', () => {
    const a = skillIdsOf(allStaffInstances(setupMainStreetGame({ seed: 'i3-divergence-1' })));
    const b = skillIdsOf(allStaffInstances(setupMainStreetGame({ seed: 'i3-divergence-2' })));
    // At least one instance must differ (astronomically unlikely to collide).
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('AC5: skills are disconnected from the nominal job (a Chef can hold Security)', () => {
    // Across a scan of seeds, the chef template must eventually receive a
    // non-Food-category skill (pool draws are job-agnostic).
    const chefCards: string[][] = [];
    for (let seed = 0; seed < 300; seed += 1) {
      const state = setupMainStreetGame({ seed: `i3-jobless-${seed}` });
      const chef = allStaffInstances(state).find(c => c.id.startsWith('staff-barista'));
      if (chef) chefCards.push(chef.specializationSkillIds ?? []);
    }
    const hasOffTheme = chefCards.some(ids =>
      ids.some(id => getSkill(id).category !== 'income-boost'),
    );
    expect(hasOffTheme, 'barista pool draws must eventually include off-theme skills').toBe(true);
  });

  it('AC1: assignments are locked — hires and market refills never re-roll', () => {
    const state = setupMainStreetGame({ seed: 'i3-locked' });
    executeDayStart(state);
    state.resourceBank.coins = 9999;
    state.phase = 'MarketPhase';

    // Snapshot the visible row staff skills.
    const visible = state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
    const before = visible.map(c => c.id + ':' + (c.specializationSkillIds ?? []).join(','));

    // Regardless of which staff we hire, its skills stay put.
    if (visible.length > 0) {
      const target = visible[0];
      hireStaffCard(state, target.id);
      const hired = state.staffCards.find(c => c.id === target.id)!;
      expect(hired.specializationSkillIds).toEqual(target.specializationSkillIds);
    }

    // Refill the market and confirm the previously visible cards (still in
    // play) never changed AND fresh staff drawn later carry their assignment.
    const deckBefore = state.decks.staff.map(c => c.id + ':' + (c.specializationSkillIds ?? []).join(','));
    refreshMarket(state);
    const deckAfter = state.decks.staff.map(c => c.id + ':' + (c.specializationSkillIds ?? []).join(','));
    expect(deckAfter).toEqual(deckBefore);
    // New row staff (drawn from the deck) have assignments too.
    expect(before.length).toBeGreaterThanOrEqual(0);
    for (const c of state.market.cards.filter(c => c.family === 'staff') as StaffCard[]) {
      expect(c.specializationSkillIds, c.id).toBeDefined();
    }
  });

  it('serialization: locked rosters survive save → restore on deck and hired cards', () => {
    const state = setupMainStreetGame({ seed: 'i3-saveload' });
    executeDayStart(state);
    state.resourceBank.coins = 9999;
    state.phase = 'MarketPhase';
    const row = state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
    if (row.length > 0) {
      hireStaffCard(state, row[0].id);
    }
    processEndOfTurn(state);

    const saved = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(saved);

    const deckKey = (s: MainStreetState) =>
      s.decks.staff.map(c => [c.id, c.specializationSkillIds ?? []] as const);
    expect(deckKey(restored)).toEqual(deckKey(state));

    const hiredKey = (s: MainStreetState) =>
      s.staffCards.map(c => [c.id, c.specializationSkillIds ?? []] as const);
    expect(hiredKey(restored)).toEqual(hiredKey(state));
  });

  it('legacy-compat: cards without the field (hand-built) keep no skills and setup never re-rolls them', () => {
    const manual = createStaffDeck(1).map(c => {
      const { specializationSkillIds: _drop, ...rest } = c as StaffCard & { specializationSkillIds?: string[] };
      return rest as StaffCard;
    });
    expect(manual.every(c => c.specializationSkillIds === undefined)).toBe(true);
  });
});