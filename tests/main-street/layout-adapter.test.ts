import { describe, expect, it } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

describe('MainStreetLayoutAdapter', () => {
  it('derives layout from SLL layout document as single source of truth', () => {
    const layout = computeMainStreetLayoutWithSll();

    // market zone: y = 0.125 * 720 = 90
    expect(layout.marketTop).toBe(90);
    // incidentQueue zone: y = 0.444444 * 720 ≈ 320
    expect(layout.queueTop).toBe(320);
    // street zone: y = 0.586111 * 720 ≈ 422
    expect(layout.streetTop).toBe(422);
    // hand zone: x = 0.03125 * 1280 = 40
    expect(layout.handX).toBe(40);
    // activityLog zone: x = 0.640625 * 1280 = 820
    expect(layout.logX).toBe(820);
    // activityLog zone: width = 0.335938 * 1280 ≈ 430
    expect(layout.logW).toBe(430);
    // endTurnButton zone: width = 0.109375 * 1280 = 140
    expect(layout.actionButtonW).toBe(140);
  });

  it('uses constants for non-positioning values', () => {
    const layout = computeMainStreetLayoutWithSll();

    expect(layout.marketCardW).toBe(140);
    expect(layout.marketCardH).toBe(80);
    expect(layout.streetCols).toBe(5);
    expect(layout.hudY).toBe(50);
  });
});
