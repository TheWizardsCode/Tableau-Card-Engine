/**
 * Unit tests for the on-card coin grid component (CG-0MTDE9H0C0061D51).
 *
 * Covers the pure, Phaser-free packing algorithm (`packCoins` / `splitCoins`
 * / `gridColumns`): dynamic 5×3 → 10×3 → 15×3 packing, integer coins,
 * and the "never clipped" overflow guarantee. CG-0MTIO1M15001E9Y6: integer economy.
 */
import { describe, expect, it } from 'vitest';

import {
  gridColumns,
  packCoins,
  roundHalf,
  splitCoins,
} from '../../example-games/main-street/coin-grid';

describe('roundHalf', () => {
  it('rounds whole amounts unchanged (integer economy)', () => {
    expect(roundHalf(0)).toBe(0);
    expect(roundHalf(1)).toBe(1);
    expect(roundHalf(2)).toBe(2);
  });

  it('rounds fractional income to the nearest integer (integer economy)', () => {
    expect(roundHalf(0.6)).toBe(1);
    expect(roundHalf(0.9)).toBe(1);
    expect(roundHalf(2.1)).toBe(2);
    expect(roundHalf(2.75)).toBe(3);
    expect(roundHalf(1.2)).toBe(1);
  });

  it('uses half-up ties', () => {
    expect(roundHalf(2.5)).toBe(3);
    expect(roundHalf(3.5)).toBe(4);
  });
});

describe('splitCoins', () => {
  it('returns no icons for zero', () => {
    expect(splitCoins(0)).toEqual({ fullCoins: 0, halfCoin: false });
  });

  it('rounds fractional amounts to integer (integer economy: no half coins)', () => {
    expect(splitCoins(0.5)).toEqual({ fullCoins: 1, halfCoin: false });
  });

  it('renders full coins for whole amounts', () => {
    expect(splitCoins(1)).toEqual({ fullCoins: 1, halfCoin: false });
    expect(splitCoins(3)).toEqual({ fullCoins: 3, halfCoin: false });
  });

  it('renders full coins for integer amounts (integer economy: no half coins)', () => {
    expect(splitCoins(1.5)).toEqual({ fullCoins: 2, halfCoin: false });
    expect(splitCoins(2.5)).toEqual({ fullCoins: 3, halfCoin: false });
    expect(splitCoins(15.5)).toEqual({ fullCoins: 16, halfCoin: false });
  });

  it('clamps negative amounts to an empty grid', () => {
    expect(splitCoins(-2)).toEqual({ fullCoins: 0, halfCoin: false });
  });
});

describe('gridColumns', () => {
  it('starts at 5 columns for 1-5 coins', () => {
    expect(gridColumns(1)).toBe(5);
    expect(gridColumns(5)).toBe(5);
  });

  it('grows to 10 columns at 6-10 coins', () => {
    expect(gridColumns(6)).toBe(10);
    expect(gridColumns(10)).toBe(10);
  });

  it('grows to 15 columns at 11+ coins (continued scaling beyond)', () => {
    expect(gridColumns(11)).toBe(15);
    expect(gridColumns(15)).toBe(15);
    expect(gridColumns(20)).toBe(15);
    expect(gridColumns(60)).toBe(15);
  });
});

describe('packCoins', () => {
  // A 140×80 card like the base market/hand card, bottom-right quadrant
  // region (70×40) at default sizing.
  const AREA = { availableWidth: 70, availableHeight: 40 };

  it('returns an empty layout for 0 coins', () => {
    const layout = packCoins(0, AREA.availableWidth, AREA.availableHeight);
    expect(layout.iconCount).toBe(0);
    expect(layout.placements).toEqual([]);
  });

  it('packs 1-5 coins as a single 5-column row', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const layout = packCoins(count, AREA.availableWidth, AREA.availableHeight);
      expect(layout.iconCount).toBe(count);
      expect(layout.columns).toBe(5);
      expect(layout.rows).toBe(1);
    }
  });

  it('packs 6-10 coins as a 10-column grid', () => {
    for (const count of [6, 7, 10]) {
      const layout = packCoins(count, AREA.availableWidth, AREA.availableHeight);
      expect(layout.iconCount).toBe(count);
      expect(layout.columns).toBe(10);
      expect(layout.rows).toBe(1);
    }
  });

  it('packs 11-15 coins as a 15-column grid', () => {
    for (const count of [11, 15]) {
      const layout = packCoins(count, AREA.availableWidth, AREA.availableHeight);
      expect(layout.iconCount).toBe(count);
      expect(layout.columns).toBe(15);
      expect(layout.rows).toBe(1);
    }
  });

  it('grows rows beyond 15 coins and continues scaling', () => {
    expect(packCoins(16, AREA.availableWidth, AREA.availableHeight).rows).toBe(2);
    expect(packCoins(30, AREA.availableWidth, AREA.availableHeight).rows).toBe(2);
    expect(packCoins(31, AREA.availableWidth, AREA.availableHeight).rows).toBe(3);
    expect(packCoins(45, AREA.availableWidth, AREA.availableHeight).rows).toBe(3);
    expect(packCoins(46, AREA.availableWidth, AREA.availableHeight).rows).toBe(4);
  });

  it('never produces half coins (integer economy)', () => {
    const half = packCoins(3, AREA.availableWidth, AREA.availableHeight);
    expect(half.iconCount).toBe(3);
    expect(half.placements.every(p => !p.half)).toBe(true);

    const single = packCoins(1, AREA.availableWidth, AREA.availableHeight);
    expect(single.iconCount).toBe(1);
    expect(single.placements[0].half).toBe(false);
  });

  it('never clips: all placements fit the available area for 1-60+ coins', () => {
    const counts = [1, 2, 3, 5, 6, 10, 11, 15, 16, 20, 30, 31, 45, 46, 60];
    const areas = [
      { availableWidth: 70, availableHeight: 40 }, // default quadrant
      { availableWidth: 140, availableHeight: 80 }, // full card
      { availableWidth: 120, availableHeight: 68 }, // small card
      { availableWidth: 40, availableHeight: 24 }, // tiny card
    ];
    for (const count of counts) {
      for (const area of areas) {
        const layout = packCoins(count, area.availableWidth, area.availableHeight);
        const { fullCoins, halfCoin } = splitCoins(count);
        expect(layout.fullCoins).toBe(fullCoins);
        expect(layout.halfCoin).toBe(halfCoin);
        expect(layout.iconCount).toBe(fullCoins + (halfCoin ? 1 : 0));
        expect(layout.coinSize).toBeGreaterThan(0);
        for (const p of layout.placements) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(area.availableWidth / 2 + 1e-6);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(area.availableHeight / 2 + 1e-6);
        }
      }
    }
  });

  it('shrinks coins to fit a narrow available width', () => {
    const layout = packCoins(5, 30, 80); // 5 coins in 30px
    expect(layout.coinSize).toBeLessThan(10); // shrunken from the default
    expect(layout.shrinkApplied).toBe(true);
    expect(Math.max(...layout.placements.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(15 + 1e-6);
  });

  it('applies overlap (negative spacing) when shrinking alone is not enough', () => {
    const layout = packCoins(20, 40, 24);
    expect(layout.overlapApplied).toBe(true);
    expect(layout.spacing).toBeLessThan(0);
    expect(Math.max(...layout.placements.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(20 + 1e-6);
    expect(Math.max(...layout.placements.map((p) => Math.abs(p.y)))).toBeLessThanOrEqual(12 + 1e-6);
  });

  it('returns a large grid with continued scaling for 60 coins', () => {
    const layout = packCoins(60, 70, 40);
    expect(layout.iconCount).toBe(60);
    expect(layout.columns).toBe(15);
    expect(layout.rows).toBe(4);
    expect(layout.shrinkApplied).toBe(true);
    expect(layout.placements).toHaveLength(60);
  });

  it('is deterministic for the same inputs', () => {
    const a = packCoins(12, 70, 40);
    const b = packCoins(12, 70, 40);
    expect(a.placements).toEqual(b.placements);
    expect(a.coinSize).toBe(b.coinSize);
    expect(a.spacing).toBe(b.spacing);
  });

  it('returns an empty layout when the available area is degenerate', () => {
    expect(packCoins(5, 0, 40).placements).toEqual([]);
    expect(packCoins(5, 40, -1).placements).toEqual([]);
  });
});