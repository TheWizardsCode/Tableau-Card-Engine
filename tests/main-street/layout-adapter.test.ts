import { describe, expect, it } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import { parseScreenLayoutDocument } from '@ui/screen-layout-schema';
import { getZoneRect } from '@ui/screen-layout';
import mainStreetLayoutJson from '../../example-games/main-street/layouts/main-street.layout.json';
import {
  computeMainStreetLayoutGeometry,
} from './helpers/mainStreetLayoutGeometry';

describe('MainStreetLayoutAdapter', () => {
  it('derives layout from SLL layout document as single source of truth', () => {
    const layout = computeMainStreetLayoutWithSll();

    // market zone: y = 0.125 * 720 = 90
    expect(layout.marketTop).toBe(90);
    // incidentQueue zone: y = 0.567 * 720 ≈ 408
    expect(layout.queueTop).toBe(408);
    // street zone: y = 0.444444 * 720 ≈ 320, shifted down by 17px for vertical spacing
    expect(layout.streetTop).toBe(337);
    // streetX from SLL anchor: topCenter.x = 0.3203125 * 1280 = 410, minus half
    // row width (780/2=390), plus one road band (57) so the whole road ring is
    // on-canvas at the default zoom (CG-0MT5Y1X5T001M4S6).
    // rowWidth = 5*140 + 4*20 = 780
    expect(layout.streetX).toBe(77);
    // hand zone: x = 0.03125 * 1280 = 40
    expect(layout.handX).toBe(40);
    // activityLog zone: x = 0.75 * 1280 = 960
    expect(layout.logX).toBe(960);
    // activityLog zone: width = (0.984375 - 0.75) * 1280 ≈ 300
    expect(layout.logW).toBe(300);
    // activityLog height: bottomRight.y = 0.414 * 720 ≈ 298, topLeft.y = 0.111111 * 720 = 80
    // height = 298 - 80 = 218
    expect(layout.logH).toBe(218);
    // endTurnButton zone: width = 0.109375 * 1280 = 140
    expect(layout.actionButtonW).toBe(140);

    // challengePanel moved to align with activityLog: topLeft.x = 0.75 * 1280 = 960
    expect(layout.challengeX).toBe(960);
    // challengePanel positioned below shortened activityLog: topLeft.y = 0.414 * 720 ≈ 298
    expect(layout.challengeY).toBe(298);
    // challengePanel width: (0.875 - 0.640625) * 1280 = 300 (same as activity log)
    expect(layout.challengeW).toBe(300);
    // events section height from incidentQueue: (0.861111 - 0.567) * 720 ≈ 212
    expect(layout.eventsHeight).toBe(212);
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

  it('right column boxes have consistent width', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.logW).toBe(layout.challengeW);
  });

  it('centres handCenterX on the street block', () => {
    const layout = computeMainStreetLayoutWithSll();
    // The street block spans streetX .. streetX + 780, so its centre is 467
    // (the SLL anchor 410 shifted right by one road band so the road ring fits).
    expect(layout.handCenterX).toBe(layout.streetX + 390);
    expect(layout.handCenterX).toBe(467);
  });

  it('resolves the staff-applicant overlay centre from the SLL applicantOverlay zone', () => {
    const layout = computeMainStreetLayoutWithSll();
    // applicantOverlay anchor 'center' = { x: 0.5, y: 0.4 } at 1280x720
    // → 640, 288. Positioned via SLL (no hardcoded pixels) so the overlay
    // tracks the declared layout rather than a magic constant.
    expect(layout.applicantCenterX).toBe(640);
    expect(layout.applicantCenterY).toBe(288);
  });

  it('right column does not overlap with left-area sections horizontally', () => {
    const layout = computeMainStreetLayoutWithSll();
    // Right column starts at logX (960). Street grid ends at streetX + rowWidth (20 + 780 = 800).
    const streetRightEdge = layout.streetX + (layout.streetCols * layout.slotW + (layout.streetCols - 1) * layout.slotGap);
    expect(streetRightEdge).toBeLessThanOrEqual(layout.logX - 10);
  });
});

// ── HUD/market geometry source of truth (CG-0MUFAIS8W0011LGQ) ──────

describe('MainStreetLayoutAdapter: HUD/market geometry source of truth', () => {
  it('exposes marketLeft/marketRight derived from SLL zones', () => {
    const layout = computeMainStreetLayoutWithSll();
    // marketLeft = round(market zone topLeft.x) = 0.015625 * 1280 = 20
    expect(layout.marketLeft).toBe(20);
    // marketRight = round(activityLog topLeft.x) - MARKET_BOX_MARGIN_PX
    //             = 960 - 20 = 940
    expect(layout.marketRight).toBe(940);
  });

  it('aligns the HUD strip edges to the market box edges (AC2)', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.hudLeft).toBe(layout.marketLeft);
    expect(layout.hudRight).toBe(layout.marketRight);
    expect(layout.hudWidth).toBe(layout.marketRight - layout.marketLeft);
    expect(layout.hudWidth).toBe(920);
  });

  it('layout-derived test harness reports the same aligned geometry', () => {
    const layout = computeMainStreetLayoutWithSll();
    const geometry = computeMainStreetLayoutGeometry();
    expect(geometry.marketBox.x).toBe(layout.marketLeft);
    expect(geometry.marketBox.x + geometry.marketBox.width).toBe(layout.marketRight);
    expect(geometry.hudStrip.x).toBe(layout.hudLeft);
    expect(geometry.hudStrip.x + geometry.hudStrip.width).toBe(layout.hudRight);
  });

  it('reserves the Community Favour band inside the HUD strip', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.favourBandLeft).toBe(layout.hudLeft + 120);
    expect(layout.favourBandRight).toBe(layout.favourBandLeft + 2 * layout.favourButtonW);
    // Band sits strictly inside the strip, right of the Coins readout.
    expect(layout.favourBandLeft).toBeGreaterThan(layout.hudLeft);
    expect(layout.favourBandRight).toBeLessThan(layout.hudRight);
  });

  it('defines a hudBar SLL zone whose edges coincide with the market box at 1280x720', () => {
    const parsed = parseScreenLayoutDocument(mainStreetLayoutJson);
    expect(parsed.valid).toBe(true);
    const viewport = { width: 1280, height: 720 };
    const rect = getZoneRect(parsed.layout as never, 'hudBar', viewport, 1);
    expect(Math.round(rect.x)).toBe(20);
    expect(Math.round(rect.x + (rect.width ?? 0))).toBe(940);
  });
});
