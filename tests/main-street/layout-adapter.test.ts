import { describe, expect, it } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import type { SceneLayout } from '../../example-games/main-street/scenes/MainStreetConstants';

function createLegacyLayoutStub(): SceneLayout {
  return {
    gameW: 1280,
    gameH: 720,
    hudY: 50,
    marketTop: 1,
    marketRowH: 94,
    marketRowGap: 10,
    marketCardW: 140,
    marketCardH: 80,
    marketCardGap: 12,
    marketLabelW: 90,
    queueTop: 1,
    queueCardW: 140,
    queueCardH: 80,
    queueCardGap: 10,
    queueLabelW: 90,
    streetTop: 1,
    slotW: 140,
    slotH: 80,
    slotGap: 10,
    streetX: 1,
    streetRowGap: 12,
    streetCols: 5,
    handY: 1,
    handX: 1,
    handCardW: 140,
    handCardH: 80,
    instructionY: 1,
    actionY: 1,
    actionButtonH: 34,
    actionButtonW: 140,
    hintButtonW: 104,
    smallButtonW: 68,
    challengeX: 1,
    challengeY: 1,
    challengeW: 300,
    logX: 1,
    logY: 1,
    logW: 1,
    logH: 1,
  };
}

describe('MainStreetLayoutAdapter', () => {
  it('overrides primary layout zones using the SLL layout document', () => {
    const layout = computeMainStreetLayoutWithSll(createLegacyLayoutStub());

    expect(layout.marketTop).toBe(90);
    expect(layout.queueTop).toBe(320);
    expect(layout.streetTop).toBe(422);
    expect(layout.handX).toBe(40);
    expect(layout.logX).toBe(820);
    expect(layout.logW).toBe(430);
    expect(layout.actionButtonW).toBe(140);
  });
});
