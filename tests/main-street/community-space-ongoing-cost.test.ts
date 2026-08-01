/**
 * Community Space Ongoing-Cost Tests
 *
 * Validates the community-space ongoing-cost mechanic introduced by
 * CG-0MRXYGM9B006I3PE ("Why would a library bring in money"):
 * - Community space cards with `ongoingCost` are charged each income phase
 *   (clamped at 0 coins, logged) alongside staff costs.
 * - The Library (cs-library) is a reputation asset: no income, 0.25/turn
 *   ongoing cost, +0.1 reputation/turn, synergy-neutral.
 * - The Community Hub upgrade (upg-community-hub) grants +0.1 reputation/turn
 *   and no income or synergy-range bonus.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  createCommunitySpaceDeck,
  createUpgradeDeck,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  applyCommunitySpaceOngoingCosts,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import { purchaseUpgrade } from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'community-space-ongoing-cost'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Places a Library card on the street grid (slot 0) and simulates the
 * placement cache (`currentIncome` / `currentReputationPerTurn`) that
 * `updateNeighborsOnPlacement` would set after a real placement.
 */
function placeLibrary(state: MainStreetState): CommunitySpaceCard {
  const library = createCommunitySpaceDeck(1).find(c => c.name === 'Library')!;
  library.currentIncome = library.baseIncome;
  library.currentReputationPerTurn = library.reputationPerTurn ?? 0;
  state.streetGrid[0] = library;
  return library;
}

// ── AC: Library stats (reputation asset) ────────────────────

describe('Library card stats (reputation asset)', () => {
  it('should be synergy-neutral with a running cost and per-turn reputation', () => {
    const library = createCommunitySpaceDeck(1).find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.baseIncome).toBe(0);
    expect(library!.ongoingCost).toBe(0.25);
    expect(library!.reputationPerTurn).toBe(0.1);
    expect(library!.synergyCoinBonus).toBeUndefined();
    expect(library!.synergyRepBonus).toBeUndefined();
    expect(library!.cost).toBe(7);
  });
});

// ── AC: Ongoing-cost deduction in the income phase ──────────

describe('Community space ongoing-cost deduction', () => {
  it('should deduct the total ongoingCost of placed community spaces from coins', () => {
    const state = createTestState();
    const library = placeLibrary(state);
    expect(library.ongoingCost).toBe(0.25);

    state.resourceBank.coins = 10;
    applyCommunitySpaceOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(9.75);
    const log = state.activityLog.find(l => l.text.includes('Community space costs'));
    expect(log).toBeDefined();
    expect(log!.text).toContain('-0.25');
  });

  it('should clamp the deduction at 0 coins and log insufficient funds', () => {
    const state = createTestState();
    placeLibrary(state);

    state.resourceBank.coins = 0.1;
    applyCommunitySpaceOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(0);
    const log = state.activityLog.find(l => l.text.includes('Insufficient coins for community space costs'));
    expect(log).toBeDefined();
  });

  it('should do nothing when no community space has an ongoing cost', () => {
    const state = createTestState();
    // Park has no ongoing cost
    const park = createCommunitySpaceDeck(1).find(c => c.name === 'Park')!;
    park.currentIncome = park.baseIncome;
    park.currentReputationPerTurn = park.reputationPerTurn ?? 0;
    state.streetGrid[0] = park;

    state.resourceBank.coins = 5;
    applyCommunitySpaceOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(5);
  });

  it('should deduct community-space costs alongside staff costs in the full turn loop', () => {
    const state = createTestState('full-turn-ongoing-cost');
    placeLibrary(state);

    // Add a staff card with an ongoing cost
    state.staffCards.push({
      family: 'staff',
      id: 'staff-tester',
      name: 'Tester',
      cost: 3,
      ongoingCost: 0.5,
      handSlotsAdded: 1,
      description: 'Test staff',
    });

    // No incidents to keep the turn deterministic
    state.incidentQueue = [];
    state.phase = 'MarketPhase';

    state.resourceBank.coins = 10;
    processEndOfTurn(state);

    // Library costs 0.25 + staff 0.5 = 0.75 total ongoing costs
    expect(state.resourceBank.coins).toBeCloseTo(9.25, 5);
    expect(state.activityLog.some(l => l.text.includes('Community space costs'))).toBe(true);
    expect(state.activityLog.some(l => l.text.includes('Staff costs'))).toBe(true);
  });

  it('should not drive coins below zero through the full turn loop', () => {
    const state = createTestState('clamped-full-turn');
    placeLibrary(state);
    state.incidentQueue = [];
    state.phase = 'MarketPhase';

    state.resourceBank.coins = 0.1;
    processEndOfTurn(state);

    expect(state.resourceBank.coins).toBe(0);
  });
});

// ── AC: Community Hub upgrade repurposed to reputation ──────

describe('Community Hub upgrade (upg-community-hub)', () => {
  it('should grant +0.1 reputation/turn with no income or synergy-range bonus', () => {
    const state = createTestState('community-hub-upgrade');
    const library = placeLibrary(state);
    state.resourceBank.coins = 10;

    // Put the Community Hub upgrade into the investments row
    const communityHub = createUpgradeDeck(1).find(u => u.targetBusiness === 'Library')!;
    state.market.investments.push(communityHub);

    const slot = state.streetGrid.indexOf(library);
    purchaseUpgrade(state, communityHub.id, slot);

    expect(library.incomeBonus).toBe(0);
    expect(library.synergyRangeBonus).toBe(0);
    expect(library.reputationBonus).toBe(0.1);
    // Effective reputation per turn = base 0.1 + upgrade bonus 0.1
    expect((library.reputationPerTurn ?? 0) + library.reputationBonus).toBeCloseTo(0.2, 5);
  });

  it('should have a rebalanced cost per the upgrade formula', () => {
    const communityHub = createUpgradeDeck(1).find(u => u.targetBusiness === 'Library')!;
    expect(communityHub.cost).toBe(4);
  });
});
