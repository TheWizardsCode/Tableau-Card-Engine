/**
 * Single-Row Market Alignment Tests
 *
 * Validates that the single-row market (CG-0MSTOATDT009BRX2) centres its
 * `MARKET_TOTAL_SLOTS` (3) card slots inside the market box, mirroring the
 * exact math used by `MainStreetRenderer.drawMarketRow`:
 *
 *   totalCardsW = MARKET_TOTAL_SLOTS * marketCardW + (MARKET_TOTAL_SLOTS - 1) * marketCardGap
 *   startX      = round(boxCenter - totalCardsW / 2)
 *
 * At the canonical 1280×720 layout (marketCardW=140, gap=12, box 20..logX-20):
 *   totalCardsW = 444, startX = 258 → slots at 258 / 410 / 562.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import { MARKET_TOTAL_SLOTS } from '../../example-games/main-street/MainStreetCards';

describe('Single-row market alignment', () => {
  const layout = computeMainStreetLayoutWithSll();
  const { marketCardW, marketCardGap, logX } = layout;

  // These match the values used in MainStreetRenderer.drawMarketRow()
  const boxLeft = 20;
  const boxRight = logX - 20;
  const boxCenter = (boxLeft + boxRight) / 2;

  const totalCardsW = MARKET_TOTAL_SLOTS * marketCardW + (MARKET_TOTAL_SLOTS - 1) * marketCardGap;
  const startX = Math.round(boxCenter - totalCardsW / 2);

  it('the market row has exactly 3 slots (single row)', () => {
    expect(MARKET_TOTAL_SLOTS).toBe(3);
    expect(marketCardW).toBe(140);
    expect(marketCardGap).toBe(12);
  });

  it('centres the 3-slot row inside the market box', () => {
    // At 1280×720: boxCenter = (20 + 940) / 2 = 480
    // totalCardsW = 3*140 + 2*12 = 444
    // startX = round(480 - 444/2) = 258
    expect(boxLeft).toBe(20);
    expect(boxRight).toBe(logX - 20);
    expect(totalCardsW).toBe(444);
    expect(startX).toBe(258);
    // The centred row fits within the box.
    expect(startX + totalCardsW).toBeLessThanOrEqual(boxRight);
  });

  it('slot positions advance by marketCardW + gap', () => {
    const slot = (i: number) => startX + i * (marketCardW + marketCardGap);
    expect(slot(0)).toBe(258);
    expect(slot(1)).toBe(410);
    expect(slot(2)).toBe(562);
  });

  it('the market box uses the same card width/gap as the rest of the layout', () => {
    expect(layout.marketCardW).toBe(140);
    expect(layout.marketCardGap).toBe(12);
  });
});
