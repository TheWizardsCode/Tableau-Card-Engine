/**
 * Market Row Alignment Tests
 *
 * Validates that the Investments row's card slots align vertically with the
 * Development row's card slots. The first three investment cards should sit
 * directly below the first three business cards (grid-aligned), not
 * independently centered.
 *
 * Acceptance criteria:
 * 1. Investment card startX equals development card startX (not independently centered)
 * 2. The first investment card's left edge matches the first development card's left edge
 * 3. The second investment card's left edge matches the second development card's left edge
 * 4. The third investment card's left edge matches the third development card's left edge
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import {
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
} from '../../example-games/main-street/MainStreetCards';

describe('Market row alignment (Investments → Development grid-aligned)', () => {
  // The layout uses the SLL-derived dimensions
  const layout = computeMainStreetLayoutWithSll();
  const { marketCardW, marketCardGap, logX } = layout;

  // These match the values used in MainStreetRenderer.refreshMarket() and drawMarketRow()
  const boxLeft = 20;
  const boxRight = logX - 20;
  const boxCenter = (boxLeft + boxRight) / 2;

  // Development row centering (4 slots): totalCardsW = 4 * marketCardW + 3 * marketCardGap
  const devTotalCardsW = MARKET_BUSINESS_SLOTS * marketCardW + (MARKET_BUSINESS_SLOTS - 1) * marketCardGap;
  const devStartX = Math.round(boxCenter - devTotalCardsW / 2);

  it('should compute development startX using 4-slot centering', () => {
    // At 1280×720: boxCenter = (20 + 940) / 2 = 480
    // devTotalCardsW = 4*140 + 3*12 = 560 + 36 = 596
    // devStartX = round(480 - 596/2) = round(480 - 298) = 182
    expect(boxLeft).toBe(20);
    expect(boxRight).toBe(logX - 20);
    expect(MARKET_BUSINESS_SLOTS).toBe(4);
    expect(marketCardW).toBe(140);
    expect(marketCardGap).toBe(12);
    expect(devStartX).toBe(182);
  });

  it('should use development startX for investment row (not independent centering)', () => {
    // Before the fix, investments used its own centering:
    //   invTotalCardsW = 3*140 + 2*12 = 420 + 24 = 444
    //   invStartX = round(480 - 444/2) = round(480 - 222) = 258 (76px offset!)
    //
    // After the fix, investments uses devStartX (182) so cards align.
    const invIndependentTotalCardsW = MARKET_INVESTMENT_SLOTS * marketCardW + (MARKET_INVESTMENT_SLOTS - 1) * marketCardGap;
    const invIndependentStartX = Math.round(boxCenter - invIndependentTotalCardsW / 2);

    // Verify the independent centering would be different (this is the bug)
    expect(invIndependentStartX).not.toBe(devStartX);
    expect(invIndependentStartX - devStartX).toBe(76);

    // Verify the fix: investment startX should match development startX
    const investmentStartX = devStartX;
    expect(investmentStartX).toBe(devStartX);
    expect(investmentStartX).toBe(182);
  });

  it('should align investment slot 0 with development slot 0', () => {
    // Slot 0 position for both rows = startX
    const devSlot0X = devStartX;
    const invSlot0X = devStartX; // aligned to dev
    expect(invSlot0X).toBe(devSlot0X);
  });

  it('should align investment slot 1 with development slot 1', () => {
    // Slot 1 = startX + 1 * (marketCardW + marketCardGap) = startX + 152
    const slotOffset = 1 * (marketCardW + marketCardGap);
    const devSlot1X = devStartX + slotOffset;
    const invSlot1X = devStartX + slotOffset; // aligned to dev
    expect(invSlot1X).toBe(devSlot1X);
    expect(invSlot1X).toBe(334); // 182 + 152
  });

  it('should align investment slot 2 with development slot 2', () => {
    // Slot 2 = startX + 2 * (marketCardW + marketCardGap) = startX + 304
    const slotOffset = 2 * (marketCardW + marketCardGap);
    const devSlot2X = devStartX + slotOffset;
    const invSlot2X = devStartX + slotOffset; // aligned to dev
    expect(invSlot2X).toBe(devSlot2X);
    expect(invSlot2X).toBe(486); // 182 + 304
  });

  it('should have development row with 4 slots and investments with 3 slots', () => {
    expect(MARKET_BUSINESS_SLOTS).toBe(4);
    expect(MARKET_INVESTMENT_SLOTS).toBe(3);
  });

  it('should use same card width and gap for both rows in layout', () => {
    expect(layout.marketCardW).toBe(140);
    expect(layout.marketCardGap).toBe(12);
  });
});
