/**
 * Playable expanded street grid — state re-indexing
 * (CG-0MTH9OW0H0005VKE).
 *
 * Growing the playable board from the legacy 1×1 street to a larger planar
 * lattice changes the world-grid row width (5 → `4·cols+1`), so placed cards,
 * sold flags and ownership tags must be *reindexed* by world position rather
 * than merely re-sized.
 *
 * @module tests/main-street/expanded-grid-state
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  setStreetGridLattice,
} from '../../example-games/main-street/MainStreetState';
import { worldSlotCount } from '../../example-games/main-street/MainStreetAdjacency';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

function businessFixture(id: string): BusinessCard {
  return {
    family: 'business',
    id,
    name: id,
    cost: 1,
    baseIncome: 1,
    synergyTypes: ['Food'],
    synergyCoinBonus: 0.5,
    synergyRepBonus: 0,
    maxLevel: 1,
    description: '',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
  } as BusinessCard;
}

describe('setStreetGridLattice (playable expansion)', () => {
  it('is a no-op when the lattice is unchanged', () => {
    const state = setupMainStreetGame({ seed: 'noop-lattice' });
    const before = state.streetGrid;
    expect(setStreetGridLattice(state, 1, 1)).toBe(false);
    expect(state.streetGrid).toBe(before);
  });

  it('expands 1×1 → 2×1 and re-indexes the legacy rows by world position', () => {
    const state = setupMainStreetGame({ seed: 'expand-2x1' });
    // Legacy slot 7 = local (lx=2, ly=1) → world (2,1).
    state.streetGrid[7] = businessFixture('biz-test-7');
    state.soldSlots[3] = true; // local (3,0) → world (3,0)

    expect(setStreetGridLattice(state, 2, 1)).toBe(true);

    expect(state.streetGridCols).toBe(2);
    expect(state.streetGridRows).toBe(1);
    expect(state.streetGrid).toHaveLength(worldSlotCount(2, 1)); // 20
    expect(state.soldSlots).toHaveLength(20);

    // World index = worldY * 10 + worldX for a 2-wide lattice.
    expect(state.streetGrid[1 * 10 + 2]?.id).toBe('biz-test-7');
    expect(state.streetGrid[7]).toBeNull();
    expect(state.soldSlots[0 * 10 + 3]).toBe(true);
  });

  it('expands 1×1 → 2×2 and keeps all ten legacy plots', () => {
    const state = setupMainStreetGame({ seed: 'expand-2x2' });
    for (let i = 0; i < 10; i++) state.streetGrid[i] = businessFixture(`biz-test-${i}`);

    setStreetGridLattice(state, 2, 2);
    expect(state.streetGrid).toHaveLength(worldSlotCount(2, 2)); // 40

    // Every legacy plot survives, at world (lx, ly).
    let present = 0;
    for (let i = 0; i < 10; i++) {
      const worldX = i % 5;
      const worldY = Math.floor(i / 5);
      expect(state.streetGrid[worldY * 10 + worldX]?.id).toBe(`biz-test-${i}`);
      present++;
    }
    expect(present).toBe(10);
  });

  it('drops plots outside a shrunken lattice', () => {
    const state = setupMainStreetGame({ seed: 'shrink' });
    setStreetGridLattice(state, 2, 2);
    // World (8,2) → index 2*10+8 = 28 — outside a 1×1 lattice (5 wide, 2 tall).
    state.streetGrid[28] = businessFixture('biz-far');
    state.streetGrid[3] = businessFixture('biz-near');

    expect(setStreetGridLattice(state, 1, 1)).toBe(true);
    expect(state.streetGrid).toHaveLength(worldSlotCount(1, 1)); // 10
    expect(state.streetGrid[3]?.id).toBe('biz-near');
    expect(state.streetGrid.some((c) => c?.id === 'biz-far')).toBe(false);
  });

  it('re-indexes a street-edge plot consistently when growing', () => {
    const state = setupMainStreetGame({ seed: 'shared-corner' });
    // Legacy slot 4 (local 4,0) is the west street's own east-edge plot.
    state.streetGrid[4] = businessFixture('biz-edge');
    setStreetGridLattice(state, 2, 1);
    // World (4,0) is index 4 in BOTH the 1×1 and 2×1 frames.
    expect(state.streetGrid[4]?.id).toBe('biz-edge');
  });
});
