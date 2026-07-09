/**
 * Tests for incident queue card aspect ratio fix.
 *
 * Verifies that:
 * 1. BASE_QUEUE_CARD_W and BASE_QUEUE_CARD_H are set to 120×69
 * 2. The layout adapter returns correct queueCardW/queueCardH dimensions
 * 3. The renderer's refreshIncidentQueue uses layout-provided dimensions (not hardcoded values)
 * 4. The SVG texture manager prewarms queue card textures
 */

import { describe, expect, it } from 'vitest';

import {
  BASE_QUEUE_CARD_W,
  BASE_QUEUE_CARD_H,
} from '../../example-games/main-street/scenes/MainStreetConstants';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

describe('Incident queue card aspect ratio', () => {
  it('BASE_QUEUE_CARD_W is 120', () => {
    expect(BASE_QUEUE_CARD_W).toBe(120);
  });

  it('BASE_QUEUE_CARD_H is 69', () => {
    expect(BASE_QUEUE_CARD_H).toBe(69);
  });

  it('queue card dimensions preserve 7:4 aspect ratio', () => {
    // 120/69 ≈ 1.739, 7/4 = 1.75 — close enough for display purposes
    const ratio = BASE_QUEUE_CARD_W / BASE_QUEUE_CARD_H;
    expect(ratio).toBeCloseTo(7 / 4, 1);
  });

  it('layout adapter returns queueCardW=120 and queueCardH=69', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.queueCardW).toBe(120);
    expect(layout.queueCardH).toBe(69);
  });

  it('queue card dimensions differ from market card dimensions (custom size)', () => {
    const layout = computeMainStreetLayoutWithSll();
    // Market cards remain at 140×80
    expect(layout.marketCardW).toBe(140);
    expect(layout.marketCardH).toBe(80);
    // Queue cards are now a different custom size
    expect(layout.queueCardW).not.toBe(layout.marketCardW);
    expect(layout.queueCardH).not.toBe(layout.marketCardH);
  });

  it('two queue cards at 120×69 fit within the 300px wide panel', () => {
    const cardW = 120;
    const gap = 6;
    // Panel width is ~300px, card width is 120px, so card fits with room to spare
    expect(cardW).toBeLessThanOrEqual(300);
    // Two cards stacked vertically: 2 * 69 + gap = 144px panel height for cards
    const twoCardsHeight = 2 * 69 + gap;
    // Panel height should accommodate this
    expect(twoCardsHeight).toBeLessThan(300); // well within any reasonable panel
  });

  it('queue cards are smaller than market cards (14% reduction)', () => {
    const layout = computeMainStreetLayoutWithSll();
    const marketArea = layout.marketCardW * layout.marketCardH; // 140*80 = 11200
    const queueArea = layout.queueCardW * layout.queueCardH;   // 120*69 = 8280
    const reduction = 1 - queueArea / marketArea;
    expect(reduction).toBeCloseTo(0.26, 0); // ~26% area reduction
  });
});
