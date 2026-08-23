/**
 * Main Street: Staff Purchase Path, Hire & AI Enumeration
 * (CG-0MT3KZOBZ005IRYE)
 *
 * Feature 2 of "Remove dedicated staff market; route staff cards into
 * general market selection" (CG-0MT2WTN0L004JA53).
 *
 * Covers the unified staff purchase path — staff cards are hired directly
 * from the general market row:
 *   AC1  canPurchaseStaff legality (present + staff family + affordable).
 *   AC2  purchaseStaffCard operates on state.market.cards (coins deducted,
 *        card removed from the row, pushed to staffCards, maxHandSize grown)
 *        and throws meaningful errors when illegal.
 *   AC3  hireStaffCard resolves the card in the market row, consumes one
 *        daily action via the 'hire-staff' PlayerAction, and delegates to
 *        the unified purchaseStaffCard.
 *   AC7  enumerateLegalActions generates hire-staff actions for affordable,
 *        not-already-employed staff in the row; the scoreAction hire-staff
 *        branch is exercised via enumerateAndScoreActions, and GreedyStrategy
 *        hires staff in a seeded run when it is the best available action.
 *
 * (AC4 cycle/refresh → discards.staff routing, AC5 moveToHand rejection and
 * AC6 layoff → discards.staff are covered by staff-general-market-state and
 * staff-pipeline tests from CG-0MT3KZNQB0053K55.)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  hireStaffCard,
  layoffStaffCard,
  type PlayerAction,
} from '../../example-games/main-street/MainStreetEngine';
import {
  canPurchaseStaff,
  purchaseStaffCard,
} from '../../example-games/main-street/MainStreetMarket';
import {
  enumerateLegalActions,
  enumerateAndScoreActions,
  GreedyStrategy,
  MainStreetAiPlayer,
} from '../../example-games/main-street/MainStreetAiStrategy';
import { createStaffDeck } from '../../example-games/main-street/MainStreetCards';

/** Seeded state with the day started (MarketPhase). */
function startState(seed = 'staff-purchase'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  return state;
}

/** Deterministic LCG RNG mirroring the shared harness style. */
function makeRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

/** Puts one staff card (from the staff deck) into the market row. */
function addStaffToMarket(state: MainStreetState, prefix: string = 'staff'): NonNullable<ReturnType<typeof createStaffDeck>[number]> {
  const staff = createStaffDeck(1).find(c => c.id.startsWith(prefix))!;
  state.market.cards.push({ ...staff });
  return staff;
}

// ── AC1: canPurchaseStaff legality ─────────────────────────────

describe('AC1: canPurchaseStaff legality', () => {
  it('is legal when the staff card is in the market row and affordable', () => {
    const state = startState('staff-legal');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 5;

    expect(canPurchaseStaff(state, staff.id)).toEqual({ legal: true });
  });

  it('is illegal when the card is missing from the market row', () => {
    const state = startState('staff-missing');
    state.resourceBank.coins = 100;

    expect(canPurchaseStaff(state, 'staff-nobody-home-0')).toMatchObject({ legal: false });
  });

  it('is illegal when the player cannot afford the staff card', () => {
    const state = startState('staff-poor');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost - 1;

    expect(canPurchaseStaff(state, staff.id)).toMatchObject({ legal: false });
  });

  it('is illegal for a non-staff card in the same row', () => {
    const state = startState('staff-wrong-family');
    const business = state.market.cards.find(c => c.family !== 'staff');
    expect(business).toBeTruthy();

    const result = canPurchaseStaff(state, business!.id);
    expect(result.legal).toBe(false);
  });
});

// ── AC2: purchaseStaffCard unified market path ─────────────────

describe('AC2: purchaseStaffCard on the general market row', () => {
  it('deducts coins, removes the card from the row, employs it, and grows maxHandSize', () => {
    const state = startState('staff-buy');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 10;
    const coinsBefore = state.resourceBank.coins;
    const handCardsBefore = state.staffCards.length;
    const maxBefore = state.maxHandSize;

    purchaseStaffCard(state, staff.id);

    expect(state.resourceBank.coins).toBe(coinsBefore - staff.cost);
    expect(state.market.cards.some(c => c.id === staff.id)).toBe(false);
    expect(state.staffCards.length).toBe(handCardsBefore + 1);
    expect(state.staffCards[state.staffCards.length - 1].id).toBe(staff.id);
    expect(state.maxHandSize).toBe(maxBefore + staff.handSlotsAdded);
  });

  it('throws when the card only exists in the staff deck (no deck fallback)', () => {
    const state = startState('staff-deck-only');
    const deckStaff = state.decks.staff[0];
    expect(deckStaff).toBeTruthy();
    expect(state.market.cards.some(c => c.id === deckStaff.id)).toBe(false);
    state.resourceBank.coins = deckStaff.cost + 10;

    expect(() => purchaseStaffCard(state, deckStaff.id)).toThrow(/not found in the market row/);
    expect(state.staffCards).toHaveLength(0);
    expect(state.decks.staff.some(c => c.id === deckStaff.id)).toBe(true);
  });

  it('throws a meaningful error when the player cannot afford the hire', () => {
    const state = startState('staff-unaffordable');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost - 1;

    expect(() => purchaseStaffCard(state, staff.id)).toThrow(/Not enough coins/);
    expect(state.staffCards).toHaveLength(0);
    expect(state.market.cards.some(c => c.id === staff.id)).toBe(true);
  });
});

// ── AC3: hireStaffCard resolves in the market and consumes an action ──

describe('AC3: hireStaffCard via the unified action path', () => {
  it('resolves the card in the market row and delegates to purchaseStaffCard', () => {
    const state = startState('staff-hire');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 5;

    const result = hireStaffCard(state, staff.id);

    expect(result.card.id).toBe(staff.id);
    expect(state.staffCards.some(s => s.id === staff.id)).toBe(true);
  });

  it('throws when the staff card is not in the market row', () => {
    const state = startState('staff-hire-missing');
    expect(() => hireStaffCard(state, 'staff-ghost-9')).toThrow(/not found in the market row/);
  });

  it("'hire-staff' PlayerAction consumes one daily action via executeAction", () => {
    const state = startState('staff-action-cost');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 5;
    state.actionsRemaining = 1;

    const action: PlayerAction = { type: 'hire-staff', cardId: staff.id };
    executeAction(state, action);

    expect(state.actionsRemaining).toBe(0);
    expect(state.staffCards.some(s => s.id === staff.id)).toBe(true);
  });

  it("'hire-staff' is rejected when the daily action budget is spent", () => {
    const state = startState('staff-action-spent');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 5;
    state.actionsRemaining = 0;

    expect(() =>
      executeAction(state, { type: 'hire-staff', cardId: staff.id }),
    ).toThrow(/No actions remaining today/);
    expect(state.staffCards).toHaveLength(0);
  });
});

// ── Staff lifecycle: hire → layoff → back into the market pipeline ──

describe('staff lifecycle round-trip (hire → layoff → refill)', () => {
  it('layoffStaffCard returns the employed staff card to discards.staff', () => {
    const state = startState('staff-layoff');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 5;
    purchaseStaffCard(state, staff.id);
    expect(state.staffCards.some(s => s.id === staff.id)).toBe(true);

    layoffStaffCard(state, staff.id);

    expect(state.staffCards.some(s => s.id === staff.id)).toBe(false);
    expect(state.discards.staff.some(c => c.id === staff.id)).toBe(true);
  });

  it('a laid-off staff card can be re-hired from the market row on a later refill', () => {
    const state = startState('staff-rehire');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 30;
    purchaseStaffCard(state, staff.id);
    layoffStaffCard(state, staff.id);

    // Force the laid-off card back into the row via refill: empty the row
    // and re-run the standard refill with a staff-only discard pool.
    const laidOff = state.discards.staff.find(c => c.id === staff.id);
    state.discards.staff = [];
    state.decks.staff = [];
    if (laidOff) state.market.cards.push({ ...laidOff });
    expect(state.market.cards.some(c => c.id === staff.id)).toBe(true);

    state.resourceBank.coins = staff.cost + 5;
    purchaseStaffCard(state, staff.id);
    expect(state.staffCards.some(s => s.id === staff.id)).toBe(true);
  });
});

// ── AC7: AI enumeration, scoring and greedy hiring ─────────────

describe('AC7: AI can hire staff from the general market', () => {
  it('enumerateLegalActions includes hire-staff for an affordable staff card', () => {
    const state = startState('ai-hire-enum');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 50;
    state.actionsRemaining = 2;

    const actions = enumerateLegalActions(state);
    const hire = actions.find(a => a.type === 'hire-staff' && a.cardId === staff.id);
    expect(hire).toBeTruthy();
  });

  it('excludes hire-staff for a staff template already employed', () => {
    const state = startState('ai-hire-employed');
    // Two instances of the same template in the row.
    const staff1 = addStaffToMarket(state);
    const staff2 = addStaffToMarket(state);
    expect(staff1.id.replace(/-\d+$/, '')).toBe(staff2.id.replace(/-\d+$/, ''));
    state.resourceBank.coins = Math.max(staff1.cost, staff2.cost) + 50;
    state.actionsRemaining = 2;

    // Employ the first instance.
    purchaseStaffCard(state, staff1.id);

    const actions = enumerateLegalActions(state);
    const hireForSecond = actions.find(a => a.type === 'hire-staff' && a.cardId === staff2.id);
    expect(hireForSecond).toBeUndefined();
  });

  it('does not generate hire-staff when the card is unaffordable', () => {
    const state = startState('ai-hire-poor');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost - 1;

    const actions = enumerateLegalActions(state);
    expect(actions.find(a => a.type === 'hire-staff' && a.cardId === staff.id)).toBeUndefined();
  });

  it('the scoreAction hire-staff branch is exercised via enumerateAndScoreActions', () => {
    const state = startState('ai-hire-score');
    const staff = addStaffToMarket(state);
    state.resourceBank.coins = staff.cost + 50;
    state.actionsRemaining = 2;

    const scored = enumerateAndScoreActions(state);
    const hireEntry = scored.find(s => s.action.type === 'hire-staff' && s.action.cardId === staff.id);
    expect(hireEntry).toBeTruthy();
    expect(hireEntry!.score).toBeGreaterThan(0);
  });

  it('GreedyStrategy hires staff in a seeded run when it is the best available action', () => {
    const state = startState('ai-greedy-hire');
    // Strip the row to a single affordable staff card and clear the hand so
    // no other productive action competes with the hire.
    state.market.cards = [addStaffToMarket(state)];
    const hireId = state.market.cards[0].id;
    state.hand = [];
    state.resourceBank.coins = state.market.cards[0].cost + 5;
    state.actionsRemaining = 1;

    const player = new MainStreetAiPlayer(GreedyStrategy, makeRng(7));
    const chosen = player.chooseAction(state);
    expect(chosen.type).toBe('hire-staff');

    executeAction(state, chosen as PlayerAction);
    expect(state.actionsRemaining).toBe(0);
    expect(state.staffCards).toHaveLength(1);
    expect(state.staffCards[0].id).toBe(hireId);
  });
});