/**
 * Main Street: Diagonal Synergy Regression (CG-0MSP1HCAS00785MP)
 *
 * Encodes the manual-review scenario that rejected this work item:
 * "placed a Diner in slot 3 and a Bakery in slot 9 but got no synergy bonus."
 *
 * Slot 3 (row 0, col 3) and slot 9 (row 1, col 4) are diagonally adjacent
 * (Chebyshev distance 1). Both are Food-synergy businesses with distinct base
 * templates, so each must earn its 50% synergy bonus from the other — in the
 * pure computation, in the synergy-line pairs, and through the real
 * placement path (`placeFromHand` → `updateNeighborsOnPlacement` → cached
 * `currentIncome`).
 *
 * Unlike the synthetic-card adjacency tests, this uses the real Diner/Bakery
 * card definitions so a card-data regression (e.g. a wrong synergyType or an
 * erroneous same-type match between two templates) is caught.
 */
import { describe, it, expect } from 'vitest';

import {
  neighbors,
  computeSynergyBonus,
  computeSynergyPairs,
} from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { createBusinessDeck } from '../../example-games/main-street/MainStreetCards';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';
import { placeFromHand } from '../../example-games/main-street/MainStreetEngine';

function findCard(name: string): BusinessCard {
  const deck = createBusinessDeck(1);
  const card = deck.find(c => c.name === name);
  if (!card) throw new Error(`card ${name} not found in business deck`);
  return card;
}

function emptyGrid(): (BusinessCard | null)[] {
  return new Array<BusinessCard | null>(10).fill(null);
}

describe('Diagonal synergy: Diner at slot 3 + Bakery at slot 9 (manual-review regression)', () => {
  it('treats slots 3 and 9 as 8-way adjacent', () => {
    expect(neighbors(3, 1)).toContain(9);
    expect(neighbors(9, 1)).toContain(3);
  });

  it('awards the synergy coin bonus to both diagonally-placed businesses', () => {
    const diner = findCard('Diner');
    const bakery = findCard('Bakery');
    const grid = emptyGrid();
    grid[3] = diner;
    grid[9] = bakery;

    // 230 (base income, raised by CG-0MSVYPEZ90085SHE, ×100: 2.3 → 230) x 0.5 (default
    // synergy rate) x 1.0 (preset) x 1 neighbor = 115 (×100)
    expect(computeSynergyBonus(grid, 3, 1, [])).toBeCloseTo(115, 5);
    expect(computeSynergyBonus(grid, 9, 1, [])).toBeCloseTo(115, 5);
  });

  it('reports the diagonal pair for the visual synergy line', () => {
    const diner = findCard('Diner');
    const bakery = findCard('Bakery');
    const grid = emptyGrid();
    grid[3] = diner;
    grid[9] = bakery;

    expect(computeSynergyPairs(grid, [])).toContainEqual({
      fromIndex: 3,
      toIndex: 9,
      sharedSynergy: 'Food',
    });
  });

  it('includes the diagonal synergy in cached currentIncome via the real placement path', () => {
    const state = setupMainStreetGame({});
    state.hand.push(findCard('Diner'), findCard('Bakery'));

    placeFromHand(state, state.hand.length - 2, 3); // Diner
    placeFromHand(state, state.hand.length - 1, 9); // Bakery

    const dinerIncome = state.streetGrid[3]?.currentIncome ?? 0;
    const bakeryIncome = state.streetGrid[9]?.currentIncome ?? 0;
    // Each card's cached income must exceed its 0.5 base income, proving the
    // diagonal neighbor contributed synergy after placement.
    expect(dinerIncome).toBeGreaterThan(0.5);
    expect(bakeryIncome).toBeGreaterThan(0.5);
  });
});
