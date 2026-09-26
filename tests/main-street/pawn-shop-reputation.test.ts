/**
 * Pawn Shop reputation penalty tests (CG-0MUAYBA0L000XLK3).
 *
 * The Pawn Shop is a budget Commerce business that should *reduce* the
 * player's reputation each turn, not increase it. Under the ×100 integer
 * economy (CG-0MTIO1M15001E9Y6) the design intent of `-0.1` reputation per
 * turn maps to `-10` raw CSV units (the same ×100 convention that turns a
 * pre-scale cost of `2` into `200`).
 *
 * Acceptance criteria covered:
 *   (AC1) `reputationPerTurn` is negative and `applyIncome` credits a
 *         negative reputation delta (never a positive one).
 *   (AC2) `cost` is 200 (2.00 at the ×100 display convention).
 *   (AC3) The synergy opt-out (zero synergy coin/reputation bonus) is
 *         unchanged.
 *   (AC5) The negative reputation is surfaced in the tooltip and card face.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  getBusinessTemplates,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  applyIncome,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  buildCardTooltipInfo,
  type SynergyFormatConfig,
} from '../../example-games/main-street/MainStreetFormatting';
import { generateBusinessCardSvg } from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';

// ── Helpers ─────────────────────────────────────────────────

const config: SynergyFormatConfig = { synergyBonusPerNeighbor: 1 };

/** The real Pawn Shop template as loaded from `card-data.csv`, as a runtime card. */
function findPawnShop(): BusinessCard {
  const template = getBusinessTemplates().find(c => c.id === 'biz-pawnshop');
  if (!template) throw new Error('biz-pawnshop template not found in card-data.csv');
  // CSV templates omit the runtime-only fields added when a deck card is
  // created; supply them so the full player-facing card shape is exercised.
  return {
    family: 'business',
    ...template,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  } as BusinessCard;
}

/** A game state with an empty street and no staff (isolates the card under test). */
function createEmptyState(seed = 'pawn-shop-reputation'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  state.streetGrid = state.streetGrid.map(() => null);
  state.staffCards = [];
  return state;
}

/** Places a fresh Pawn Shop on the street at `index` with its caches primed. */
function placePawnShop(state: MainStreetState, index = 0): BusinessCard {
  const pawn: BusinessCard = { ...findPawnShop(), id: `biz-pawnshop-${index}` };
  pawn.currentIncome = pawn.baseIncome + (pawn.incomeBonus ?? 0);
  pawn.currentReputationPerTurn =
    (pawn.reputationPerTurn ?? 0) + (pawn.reputationBonus ?? 0);
  state.streetGrid[index] = pawn;
  return pawn;
}

// ── AC1/AC2: CSV data ───────────────────────────────────────

describe('Pawn Shop card data (×100 integer economy)', () => {
  it('costs 200 coins', () => {
    expect(findPawnShop().cost).toBe(200);
  });

  it('reduces reputation per turn (design intent -0.1 → -10 ×100 units)', () => {
    expect(findPawnShop().reputationPerTurn).toBe(-10);
  });

  it('keeps ongoingCost at 75 (unchanged by this work item)', () => {
    // The intake confirmed only the purchase cost; ongoingCost is deliberately
    // left untouched. Pinned so a silent drift is caught.
    expect(findPawnShop().ongoingCost).toBe(75);
  });
});

// ── AC3: synergy opt-out unchanged ──────────────────────────

describe('Pawn Shop synergy opt-out (regression)', () => {
  it('provides and receives zero synergy coin/reputation bonuses', () => {
    // The Pawn Shop remains synergy-neutral in the CSV data. The behavioural
    // opt-out (contribute + receive) is covered by adjacency.test.ts and
    // same-type-synergy.test.ts, which must still pass unchanged.
    const pawn = findPawnShop();
    expect(pawn.synergyCoinBonus ?? 0).toBe(0);
    expect(pawn.synergyRepBonus ?? 0).toBe(0);
  });
});

// ── AC1: behaviour through applyIncome ──────────────────────

describe('Pawn Shop income phase applies a negative reputation delta', () => {
  it('credits -10 reputation per turn and never a positive delta', () => {
    const state = createEmptyState();
    placePawnShop(state, 0);
    const reputationBefore = state.resourceBank.reputation;

    const result = applyIncome(state);

    expect(result.repDelta).toBe(-10);
    expect(result.repDelta).toBeLessThan(0);
    expect(state.resourceBank.reputation).toBe(reputationBefore - 10);
    expect(state.resourceBank.reputation).toBeLessThan(reputationBefore);
  });

  it('stacks the penalty across multiple Pawn Shops with no synergy', () => {
    const state = createEmptyState();
    placePawnShop(state, 0);
    placePawnShop(state, 1);

    const result = applyIncome(state);
    expect(result.repDelta).toBe(-20);
  });
});

// ── AC5: player-facing presentation ─────────────────────────

describe('Pawn Shop exposes the reputation penalty to the player', () => {
  it('shows the negative reputation in the hover tooltip', () => {
    const info = buildCardTooltipInfo(findPawnShop(), config);
    expect(info).toContain('Reputation: -10/turn');
  });

  it('shows the negative reputation on the generated card face', () => {
    const svg = generateBusinessCardSvg(findPawnShop());
    expect(svg).toContain('-10/turn');
  });
});
