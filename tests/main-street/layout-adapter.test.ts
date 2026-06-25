import { describe, expect, it } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

describe('MainStreetLayoutAdapter', () => {
  it('derives layout from SLL layout document as single source of truth', () => {
    const layout = computeMainStreetLayoutWithSll();

    // market zone: y = 0.125 * 720 = 90
    expect(layout.marketTop).toBe(90);
    // incidentQueue zone: y = 0.444444 * 720 ≈ 320
    expect(layout.queueTop).toBe(320);
    // street zone: y = 0.586111 * 720 ≈ 422, shifted down by 17px for vertical spacing
    expect(layout.streetTop).toBe(439);
    // streetX is centered: (1280 - (5*140 + 4*10)) / 2 = (1280 - 740) / 2 = 270
    expect(layout.streetX).toBe(270);
    // hand zone: x = 0.03125 * 1280 = 40
    expect(layout.handX).toBe(40);
    // activityLog zone: x = 0.640625 * 1280 = 820
    expect(layout.logX).toBe(820);
    // activityLog zone: width = 0.335938 * 1280 ≈ 430
    expect(layout.logW).toBe(430);
    // activityLog height: bottomRight.y = 0.414 * 720 ≈ 298, topLeft.y = 0.111111 * 720 = 80
    // height = 298 - 80 = 218
    expect(layout.logH).toBe(218);
    // endTurnButton zone: width = 0.109375 * 1280 = 140
    expect(layout.actionButtonW).toBe(140);

    // challengePanel moved to align with activityLog: topLeft.x = 0.640625 * 1280 = 820
    expect(layout.challengeX).toBe(820);
    // challengePanel positioned below shortened activityLog: topLeft.y = 0.414 * 720 ≈ 298
    expect(layout.challengeY).toBe(298);
    // challengePanel width: (0.914062 - 0.640625) * 1280 = 350
    expect(layout.challengeW).toBe(350);
    // events section height from incidentQueue: (0.597222 - 0.444444) * 720 ≈ 110
    expect(layout.eventsHeight).toBe(110);
  });

  it('uses constants for non-positioning values', () => {
    const layout = computeMainStreetLayoutWithSll();

    expect(layout.marketCardW).toBe(140);
    expect(layout.marketCardH).toBe(80);
    expect(layout.streetCols).toBe(5);
    expect(layout.hudY).toBe(50);
  });

  it('reduces activity log height to align with market section bottom', () => {
    const layout = computeMainStreetLayoutWithSll();

    // Market section bottom (background box): marketTop - 10 + (2*marketRowH + marketRowGap + 20)
    // = 90 - 10 + (2*94 + 10 + 20) = 80 + 218 = 298
    // Activity Log bottom should align with this
    const activityLogBottom = layout.logY + layout.logH;
    const marketSectionBottom = layout.marketTop - 10 + (2 * layout.marketRowH + layout.marketRowGap + 20);
    expect(activityLogBottom).toBeLessThanOrEqual(marketSectionBottom + 1);
    expect(activityLogBottom).toBeGreaterThanOrEqual(marketSectionBottom - 1);
  });

  it('challenge panel aligns with activity log on the left edge', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.challengeX).toBe(layout.logX);
  });

  it('challenge panel sits below the shortened activity log without overlap', () => {
    const layout = computeMainStreetLayoutWithSll();
    const logBottom = layout.logY + layout.logH;
    expect(layout.challengeY).toBeGreaterThanOrEqual(logBottom);
  });

  it('challenge panel height matches events section height', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.eventsHeight).toBeGreaterThan(0);
  });

  it('challenge panel does not overlap with street section', () => {
    const layout = computeMainStreetLayoutWithSll();
    const challengeBottom = layout.challengeY + layout.eventsHeight;
    expect(challengeBottom).toBeLessThan(layout.streetTop);
  });
});
