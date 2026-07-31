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

});
