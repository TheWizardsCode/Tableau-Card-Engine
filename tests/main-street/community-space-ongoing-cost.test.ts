/**
 * Community Space Ongoing-Cost Tests
 *
 * Validates the community-space ongoing-cost mechanic introduced by
 * CG-0MRXYGM9B006I3PE ("Why would a library bring in money"):
 * - Community space cards with `ongoingCost` are charged each income phase
 *   (clamped at 0 coins, logged) alongside staff costs.
 * - The Library (cs-library) is a reputation asset: no income, 0.25/turn
 *   ongoing cost, +0.1 reputation/turn, full synergy participation (Park
 *   model, default 0.5 coin rate).
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
  createBusinessDeck,
  createUpgradeDeck,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  applyCommunitySpaceOngoingCosts,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import { purchaseUpgrade } from '../../example-games/main-street/MainStreetMarket';
import {
  computeSynergyBonus,
  computeSynergyRepBonus,
  computeSynergyPairs,
} from '../../example-games/main-street/MainStreetAdjacency';

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
  it('should be a reputation asset with default synergy participation and a running cost', () => {
    const library = createCommunitySpaceDeck(1).find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.baseIncome).toBe(0);
    expect(library!.ongoingCost).toBe(25);
    expect(library!.reputationPerTurn).toBe(10);
    // Empty synergy fields (Park pattern) default to a 0.5 coin synergy rate,
    // so the Library participates in neighbours' Culture synergy (reversed by
    // CG-0MSKS963N000ZSTU).
    expect(library!.synergyCoinBonus).toBeUndefined();
    expect(library!.synergyRepBonus).toBeUndefined();
    expect(library!.cost).toBe(700);
  });
});

// ── AC: Library synergy participation (Park model) ──────────

describe('Library synergy participation (behavioral, Park model)', () => {
  it('should earn no coin synergy itself (baseIncome 0) despite a matching Culture neighbor', () => {
    const state = createTestState('library-no-coin-synergy');
    const library = placeLibrary(state);
    // Art Gallery is Culture|Entertainment — shares Culture with the Library.
    // The Library participates in synergy now (default 0.5 coin rate) but its
    // baseIncome is 0, so its own coin synergy is still 0.
    const gallery = createBusinessDeck(1).find(c => c.name === 'Art Gallery')!;
    state.streetGrid[1] = gallery;

    const slot = state.streetGrid.indexOf(library);
    expect(computeSynergyBonus(state.streetGrid, slot)).toBe(0);
  });

  it('should receive reputation synergy from a Culture neighbor with a rep bonus', () => {
    const state = createTestState('library-rep-synergy');
    const library = placeLibrary(state);
    // Art Gallery has synergyRepBonus 10 — the Library now receives rep
    // synergy from it (reversed by CG-0MSKS963N000ZSTU).
    const gallery = createBusinessDeck(1).find(c => c.name === 'Art Gallery')!;
    expect(gallery.synergyRepBonus).toBe(10);
    state.streetGrid[1] = gallery;

    const slot = state.streetGrid.indexOf(library);
    expect(computeSynergyRepBonus(state.streetGrid, slot)).toBe(10);
  });

  it('should be counted toward a neighbor\'s synergy (contributes like the Park)', () => {
    const state = createTestState('library-contributes');
    // Cafe (Food|Culture, baseIncome 1) adjacent to the Library
    const cafe = createBusinessDeck(1).find(c => c.name === 'Cafe')!;
    const library = createCommunitySpaceDeck(1).find(c => c.name === 'Library')!;
    state.streetGrid[0] = cafe;
    state.streetGrid[1] = library;

    // The Library participates in synergy now, so it is counted toward N:
    // Cafe earns 520 base income × 0.5 default rate × 1 neighbor = 260 coins
    // (base income raised by CG-0MSVYPEZ90085SHE: 5.2 → 520).
    expect(computeSynergyBonus(state.streetGrid, 0)).toBe(260);
  });

  it('should give a Bookshop 1.15 Culture synergy when placed adjacent', () => {
    const state = createTestState('bookshop-library-synergy');
    // Bookshop (Culture, baseIncome 2.3) adjacent to the Library
    const bookshop = createBusinessDeck(1).find(c => c.name === 'Bookshop')!;
    const library = createCommunitySpaceDeck(1).find(c => c.name === 'Library')!;
    state.streetGrid[0] = bookshop;
    state.streetGrid[1] = library;

    // 230 base income × 0.5 default rate × 1 neighbor = 115 coins/turn
    // (base income raised by CG-0MSVYPEZ90085SHE: 2.3 → 230).
    expect(computeSynergyBonus(state.streetGrid, 0)).toBe(115);
  });

  it('should draw a Culture synergy line between a Bookshop and the Library', () => {
    const state = createTestState('bookshop-library-pair');
    const bookshop = createBusinessDeck(1).find(c => c.name === 'Bookshop')!;
    const library = createCommunitySpaceDeck(1).find(c => c.name === 'Library')!;
    state.streetGrid[0] = bookshop;
    state.streetGrid[1] = library;

    const pairs = computeSynergyPairs(state.streetGrid);
    expect(pairs).toContainEqual({
      fromIndex: 0,
      toIndex: 1,
      sharedSynergy: 'Culture',
    });
  });
});

// ── AC: Ongoing-cost deduction in the income phase ──────────

describe('Community space ongoing-cost deduction', () => {
  it('should deduct the total ongoingCost of placed community spaces from coins', () => {
    const state = createTestState();
    const library = placeLibrary(state);
    expect(library.ongoingCost).toBe(25);

    state.resourceBank.coins = 1000;
    applyCommunitySpaceOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(975);
    const log = state.activityLog.find(l => l.text.includes('Community space costs'));
    expect(log).toBeDefined();
    expect(log!.text).toContain('-25');
  });

  it('should clamp the deduction at 0 coins and log insufficient funds', () => {
    const state = createTestState();
    placeLibrary(state);

    state.resourceBank.coins = 10;
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
      ongoingCost: 50,
      handSlotsAdded: 1,
      description: 'Test staff',
    });

    // No incidents to keep the turn deterministic
    state.incidentDeck = [];
    state.phase = 'MarketPhase';

    state.resourceBank.coins = 1000;
    processEndOfTurn(state);

    // Library costs 25 + staff 50 = 75 total ongoing costs
    expect(state.resourceBank.coins).toBeCloseTo(925, 5);
    expect(state.activityLog.some(l => l.text.includes('Community space costs'))).toBe(true);
    expect(state.activityLog.some(l => l.text.includes('Staff costs'))).toBe(true);
  });

  it('should not drive coins below zero through the full turn loop', () => {
    const state = createTestState('clamped-full-turn');
    placeLibrary(state);
    state.incidentDeck = [];
    state.phase = 'MarketPhase';

    state.resourceBank.coins = 10;
    processEndOfTurn(state);

    expect(state.resourceBank.coins).toBe(0);
  });
});

// ── AC: Community Hub upgrade repurposed to reputation ──────

describe('Community Hub upgrade (upg-community-hub)', () => {
  it('should grant +0.1 reputation/turn with no income or synergy-range bonus', () => {
    const state = createTestState('community-hub-upgrade');
    const library = placeLibrary(state);
    state.resourceBank.coins = 1000;

    // Put the Community Hub upgrade into the investments row
    const communityHub = createUpgradeDeck(1).find(u => u.targetBusiness === 'Library')!;
    state.market.cards.push(communityHub);

    const slot = state.streetGrid.indexOf(library);
    purchaseUpgrade(state, communityHub.id, slot);

    expect(library.incomeBonus).toBe(0);
    expect(library.synergyRangeBonus).toBe(0);
    expect(library.reputationBonus).toBe(10);
    // Effective reputation per turn = base 10 + upgrade bonus 10
    expect((library.reputationPerTurn ?? 0) + library.reputationBonus).toBeCloseTo(20, 5);
  });

  it('should have a rebalanced cost per the upgrade formula', () => {
    const communityHub = createUpgradeDeck(1).find(u => u.targetBusiness === 'Library')!;
    expect(communityHub.cost).toBe(400);
  });
});
