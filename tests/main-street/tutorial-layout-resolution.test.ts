/**
 * Tutorial layout resolution tests
 *
 * Verifies that SLL-resolved tutorial bounding boxes match current
 * zoneToAnchor() outputs and that composition works correctly.
 *
 * @module tests/main-street/tutorial-layout-resolution
 */

import { describe, expect, it } from 'vitest';

import type { ScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import {
  composeResolvedLayouts,
  type ComposeResolvedLayoutsIssue,
} from '../../src/ui/screen-layout-compose';
import {
  getZoneRect,
  ScreenLayoutMappingError,
  type LayoutViewport,
} from '../../src/ui/screen-layout';
import {
  parseScreenLayoutDocument,
  validateScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';

import baseLayout from '../../example-games/main-street/layouts/main-street.layout.json';
import tutorialLayout from '../../example-games/main-street/layouts/main-street-tutorial.layout.json';
import {
  BASE_HUD_Y,
  BASE_MARKET_CARD_H,
  BASE_MARKET_ROW_GAP,
} from '../../example-games/main-street/scenes/MainStreetConstants';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

const VIEWPORT: LayoutViewport = { width: 1280, height: 720 };

/**
 * Reference zone bounds computed from the RENDERER's geometry (the source of
 * truth) — `computeMainStreetLayoutWithSll()` + shared card constants + the
 * same renderer math used in `MainStreetRenderer` (`marketTop + 6`,
 * `streetTop`, `handCenterX`, `actionY + 4`, ...). The tutorial zone rects
 * must resolve to these bounds (within rounding tolerance), otherwise the
 * highlight rectangles land on empty space instead of their target element.
 */
function computeExpectedZoneBounds(
  zone: string,
  viewport: LayoutViewport = VIEWPORT,
): { x: number; y: number; w: number; h: number } | null {
  const gameW = viewport.width;
  const layout = computeMainStreetLayoutWithSll();
  const marketRowH = BASE_MARKET_CARD_H + 14; // 94

  // Right sidebar starts at logX (0.75*1280=960). The market/street area
  // extends from bgLeft=20 to bgRight=logX-20 (=940 at 1280).
  const logX = layout.logX;
  const bgLeft = 20;
  const bgRight = logX - 20;

  switch (zone) {
    case 'hud':
      // HUD strip: 50% screen width centered, 28px tall, center at hudY=50
      return { x: Math.round(gameW * 0.25), y: BASE_HUD_Y - 14, w: Math.round(gameW * 0.5), h: 28 };
    case 'marketBusinessRow': {
      // Market background box: bgLeft=20, bgRight=logX-20, covers both rows
      const bothRowsH = 2 * marketRowH + BASE_MARKET_ROW_GAP + 20;
      return {
        x: bgLeft,
        y: layout.marketTop - 10,
        w: bgRight - bgLeft,
        h: bothRowsH,
      };
    }
    case 'streetGrid': {
      // Street slots: streetX + 5×slotW + 4×slotGap, 2 rows of slotH + gap
      const streetW = layout.streetCols * layout.slotW + (layout.streetCols - 1) * layout.slotGap;
      const streetH = 2 * layout.slotH + layout.streetRowGap;
      return { x: layout.streetX, y: layout.streetTop, w: streetW, h: streetH };
    }
    case 'endTurnButton': {
      // End Turn button: right-aligned at gameW-24, top at actionY+4
      const rightX = layout.gameW - 24;
      return {
        x: rightX - layout.actionButtonW,
        y: layout.actionY + 4,
        w: layout.actionButtonW,
        h: layout.actionButtonH,
      };
    }
    case 'incidentQueue': {
      // Incident queue panel at boot: queueTop, width logW, height = the
      // renderer's panelH with 2 cards and 0 active effects (22+8+156+8=194).
      const cardAreaH = 2 * (layout.queueCardH + 6) - 6 + 12;
      const panelH = 22 + 8 + cardAreaH + 8;
      return {
        x: logX,
        y: layout.queueTop,
        w: layout.logW,
        h: panelH,
      };
    }
    case 'investmentsRow': {
      // Investments row drawn at marketTop + 6 + marketRowH + marketRowGap
      return {
        x: bgLeft,
        y: layout.marketTop + 6 + marketRowH + BASE_MARKET_ROW_GAP,
        w: bgRight - bgLeft,
        h: marketRowH,
      };
    }
    case 'developmentRow': {
      // Dev row only (informative Dev Row / Optimizing for Events / Build a
      // Library steps). Cards drawn at marketTop + 6; row height = marketRowH.
      return {
        x: bgLeft,
        y: layout.marketTop + 6,
        w: bgRight - bgLeft,
        h: marketRowH,
      };
    }
    case 'hand': {
      // Hand row centred on handCenterX covering up to maxHandSize (2) cards:
      // width = 2×handCardW + 8 (spacing gap), top at handY.
      const handW = 2 * layout.handCardW + 8;
      return {
        x: layout.handCenterX - Math.round(handW / 2),
        y: layout.handY,
        w: handW,
        h: layout.handCardH,
      };
    }
    case 'helpButton': {
      // Hint button sits to the left of End Turn (12px gap)
      const rightX = layout.gameW - 24;
      return {
        x: rightX - layout.actionButtonW - 12 - layout.hintButtonW,
        y: layout.actionY + 4,
        w: layout.hintButtonW,
        h: layout.actionButtonH,
      };
    }
    case 'centerModal':
    case 'completionModal':
      return null;
    default:
      return null;
  }
}

function boundsAlmostEqual(
  actual: { x: number; y: number; width?: number; height?: number },
  expected: { x: number; y: number; w: number; h: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 0);
  expect(actual.y).toBeCloseTo(expected.y, 0);
  expect(actual.width).toBeCloseTo(expected.w, 0);
  expect(actual.height).toBeCloseTo(expected.h, 0);
}

function parseTutorialLayout(): ScreenLayoutDocument {
  const validation = validateScreenLayoutDocument(tutorialLayout);
  if (!validation.valid) {
    throw new Error(
      `Tutorial layout is invalid: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  return tutorialLayout as ScreenLayoutDocument;
}

function parseBaseLayout(): ScreenLayoutDocument {
  const parsed = parseScreenLayoutDocument(baseLayout);
  if (!parsed.valid) {
    throw new Error(
      `Base layout is invalid: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  return parsed.layout;
}

const TUTORIAL_ZONE_NAMES = [
  'hud',
  'marketBusinessRow',
  'developmentRow',
  'streetGrid',
  'endTurnButton',
  'incidentQueue',
  'investmentsRow',
  'hand',
  'helpButton',
];

/** Zones that resolveZoneToAnchor() returns null for (no highlight needed). */
const NULL_ZONE_NAMES = ['centerModal', 'completionModal'];

describe('Tutorial layout resolution', () => {
  describe('schema validation', () => {
    it('passes validation for the tutorial layout', () => {
      const result = validateScreenLayoutDocument(tutorialLayout);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts all 9 required zones', () => {
      const layout = parseTutorialLayout();
      expect(layout.requiredZones.sort()).toEqual(TUTORIAL_ZONE_NAMES.sort());
    });

    it('all tutorial zones have dimensions (w and h)', () => {
      const layout = parseTutorialLayout();
      for (const zoneName of TUTORIAL_ZONE_NAMES) {
        const zone = layout.zones[zoneName];
        expect(zone).toBeDefined();
        expect(zone!.rect.w).toBeDefined();
        expect(zone!.rect.h).toBeDefined();
        expect(zone!.rect.w! > 0).toBe(true);
        expect(zone!.rect.h! > 0).toBe(true);
      }
    });
  });

  describe('composeResolvedLayouts resolves all tutorial zones', () => {
    it('resolves all 9 tutorial zones at 1280x720 @1x', () => {
      const issues: ComposeResolvedLayoutsIssue[] = [];
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
        { reportIssue: (issue) => issues.push(issue) },
      );

      for (const zoneName of TUTORIAL_ZONE_NAMES) {
        expect(resolved.zones[zoneName]).toBeDefined();
      }
    });

    it('returns viewport metadata matching the input', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
      );

      expect(resolved.viewport.width).toBe(1280);
      expect(resolved.viewport.height).toBe(720);
      expect(resolved.viewport.dpr).toBe(1);
      expect(resolved.viewport.pixelWidth).toBe(1280);
      expect(resolved.viewport.pixelHeight).toBe(720);
    });

    it('retains base layout zones alongside tutorial zones', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
      );

      const baseZones = [
        'market', 'incidentQueue', 'street', 'hand', 'actions',
        'activityLog', 'challengePanel', 'endTurnButton',
      ];
      for (const zoneName of baseZones) {
        expect(resolved.zones[zoneName]).toBeDefined();
      }
    });
  });

  describe('pixel bounds match zoneToAnchor() reference', () => {
    it('hud zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('hud');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.hud.rect, expected!);
    });

    it('marketBusinessRow zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('marketBusinessRow');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.marketBusinessRow.rect, expected!);
    });

    it('streetGrid zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('streetGrid');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.streetGrid.rect, expected!);
    });

    it('endTurnButton zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('endTurnButton');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.endTurnButton.rect, expected!);
    });

    it('incidentQueue zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('incidentQueue');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.incidentQueue.rect, expected!);
    });

    it('investmentsRow zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('investmentsRow');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.investmentsRow.rect, expected!);
    });

    it('developmentRow zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('developmentRow');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.developmentRow.rect, expected!);
    });

    it('hand zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('hand');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.hand.rect, expected!);
    });

    it('helpButton zone matches zoneToAnchor() pixel math within 1px', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );
      const expected = computeExpectedZoneBounds('helpButton');
      expect(expected).not.toBeNull();
      boundsAlmostEqual(resolved.zones.helpButton.rect, expected!);
    });

    it('all tutorial zones match zoneToAnchor() within 1px tolerance', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(), parseTutorialLayout(), VIEWPORT, 1,
      );

      for (const zoneName of TUTORIAL_ZONE_NAMES) {
        const expected = computeExpectedZoneBounds(zoneName);
        expect(expected).not.toBeNull();
        expect(resolved.zones[zoneName]).toBeDefined();
        boundsAlmostEqual(resolved.zones[zoneName]!.rect, expected!);
      }
    });
  });

  describe('resolveZoneToAnchor null zones', () => {
    /**
     * Simulate the resolveZoneToAnchor() logic: compose base+tutorial layouts
     * and look up the requested zone. Null zones are absent from both layouts,
     * so the composed lookup returns undefined — matching the expected null.
     */
    function simulateResolveZoneToAnchor(
      zoneName: string,
      viewport: LayoutViewport,
    ): { x: number; y: number; w: number; h: number } | null {
      if (NULL_ZONE_NAMES.includes(zoneName)) {
        return null;
      }
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        viewport,
        1,
      );
      const zone = resolved.zones[zoneName];
      if (!zone) {
        return null;
      }
      const rect = zone.rect;
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width ?? 0),
        h: Math.round(rect.height ?? 0),
      };
    }

    it('centerModal returns null (no highlight bounding box)', () => {
      const result = simulateResolveZoneToAnchor('centerModal', VIEWPORT);
      expect(result).toBeNull();
    });

    it('completionModal returns null (no highlight bounding box)', () => {
      const result = simulateResolveZoneToAnchor('completionModal', VIEWPORT);
      expect(result).toBeNull();
    });
  });

  describe('resolveZoneToAnchor known zones', () => {
    /**
     * Simulate the resolveZoneToAnchor() logic: compose base+tutorial layouts
     * and look up the requested zone.
     */
    function simulateResolveZoneToAnchor(
      zoneName: string,
      viewport: LayoutViewport,
    ): { x: number; y: number; w: number; h: number } | null {
      if (NULL_ZONE_NAMES.includes(zoneName)) {
        return null;
      }
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        viewport,
        1,
      );
      const zone = resolved.zones[zoneName];
      if (!zone) {
        return null;
      }
      const rect = zone.rect;
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width ?? 0),
        h: Math.round(rect.height ?? 0),
      };
    }

    for (const zoneName of TUTORIAL_ZONE_NAMES) {
      it(`returns a rect for known zone "${zoneName}"`, () => {
        const result = simulateResolveZoneToAnchor(zoneName, VIEWPORT);
        expect(result).not.toBeNull();
        expect(result!.x).toBeGreaterThanOrEqual(0);
        expect(result!.y).toBeGreaterThanOrEqual(0);
        expect(result!.w).toBeGreaterThanOrEqual(0);
        expect(result!.h).toBeGreaterThanOrEqual(0);
      });
    }

    it('matches computeExpectedZoneBounds for all known zones', () => {
      for (const zoneName of TUTORIAL_ZONE_NAMES) {
        const resolved = simulateResolveZoneToAnchor(zoneName, VIEWPORT);
        const expected = computeExpectedZoneBounds(zoneName);
        expect(resolved).not.toBeNull();
        expect(resolved!.x).toBeCloseTo(expected!.x, 0);
        expect(resolved!.y).toBeCloseTo(expected!.y, 0);
        expect(resolved!.w).toBeCloseTo(expected!.w, 0);
        expect(resolved!.h).toBeCloseTo(expected!.h, 0);
      }
    });
  });

  describe('resolveZoneToAnchor unknown zones', () => {
    it('returns null for an unknown zone name (not an error)', () => {
      // 'nonExistentZone' is not in either layout, so the composed zones
      // should not contain it — this mirrors what resolveZoneToAnchor does
      // when composed.zones[zone] is undefined.
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
      );
      expect(resolved.zones['nonExistentZone' as keyof typeof resolved.zones]).toBeUndefined();
    });
  });

  describe('unknown zone names throw ScreenLayoutMappingError', () => {
    it('throws ScreenLayoutMappingError for an unknown zone name via getZoneRect', () => {
      const layout = parseTutorialLayout();
      expect(() =>
        getZoneRect(layout, 'nonExistentZone', VIEWPORT, 1),
      ).toThrowError(ScreenLayoutMappingError);
    });

    it('throws with UNKNOWN_ZONE code for unknown zones', () => {
      const layout = parseTutorialLayout();
      let error: ScreenLayoutMappingError | undefined;
      try {
        getZoneRect(layout, 'phantomZone', VIEWPORT, 1);
      } catch (e) {
        if (e instanceof ScreenLayoutMappingError) {
          error = e;
        }
      }
      expect(error).toBeDefined();
      expect(error!.code).toBe('UNKNOWN_ZONE');
      expect(error!.zoneName).toBe('phantomZone');
    });

    it('does not throw for known tutorial zone names', () => {
      const layout = parseTutorialLayout();
      for (const zoneName of TUTORIAL_ZONE_NAMES) {
        const rect = getZoneRect(layout, zoneName, VIEWPORT, 1);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('sceneWins policy', () => {
    it('tutorial zones overlay base zones when names collide', () => {
      const issues: ComposeResolvedLayoutsIssue[] = [];
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
        { policy: 'sceneWins', reportIssue: (issue) => issues.push(issue) },
      );

      const collisionIssues = issues.filter(
        (i) => i.code === 'ZONE_COLLISION',
      );
      expect(collisionIssues.length).toBeGreaterThanOrEqual(1);

      const expectedEndTurn = computeExpectedZoneBounds('endTurnButton');
      if (expectedEndTurn) {
        boundsAlmostEqual(
          resolved.zones.endTurnButton.rect,
          expectedEndTurn,
        );
      }

      const expectedIncident = computeExpectedZoneBounds('incidentQueue');
      if (expectedIncident) {
        boundsAlmostEqual(
          resolved.zones.incidentQueue.rect,
          expectedIncident,
        );
      }
    });

    it('tutorial-only zones appear in the composed output', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
      );

      expect(resolved.zones.hud).toBeDefined();
      expect(resolved.zones.marketBusinessRow).toBeDefined();
      expect(resolved.zones.streetGrid).toBeDefined();
      expect(resolved.zones.investmentsRow).toBeDefined();
      expect(resolved.zones.helpButton).toBeDefined();
    });

    it('sceneWins keeps base-only zones', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
      );

      expect(resolved.zones.market).toBeDefined();
      expect(resolved.zones.street).toBeDefined();
      expect(resolved.zones.hand).toBeDefined();
      expect(resolved.zones.actions).toBeDefined();
      expect(resolved.zones.activityLog).toBeDefined();
      expect(resolved.zones.challengePanel).toBeDefined();
    });
  });

  describe('DPR and viewport scaling', () => {
    it('scales tutorial zone bounds proportionally at 2x DPR', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        2,
      );

      expect(resolved.viewport.dpr).toBe(2);
      expect(resolved.viewport.pixelWidth).toBe(2560);
      expect(resolved.viewport.pixelHeight).toBe(1440);

      // HUD is 50% centered; at 2x DPR the x is scaled from 0.25*1280*2=640
      expect(resolved.zones.hud.rect.x).toBe(640);
      expect(resolved.zones.hud.rect.y).toBe(72);
      expect(resolved.zones.hud.rect.width).toBe(1280);
      expect(resolved.zones.hud.rect.height).toBeCloseTo(56, 0);
    });

    it('handles different viewport sizes correctly', () => {
      const smallViewport: LayoutViewport = { width: 800, height: 600 };
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        smallViewport,
        1,
      );

      // HUD is 50% centered; at 800px: x=0.25*800=200, w=0.5*800=400
      expect(resolved.zones.hud.rect.x).toBe(200);
      expect(resolved.zones.hud.rect.y).toBeCloseTo(30, 0);
      expect(resolved.zones.hud.rect.width).toBe(400);
      expect(resolved.zones.hud.rect.height).toBeCloseTo(23.33, 0);
    });
  });

  describe('browser regression test', () => {
    it('captures expected highlight positions for T1-T10 steps', () => {
      const resolved = composeResolvedLayouts(
        parseBaseLayout(),
        parseTutorialLayout(),
        VIEWPORT,
        1,
      );

      const expectedPositions: Record<string, { x: number; y: number; w: number; h: number }> = {
        marketBusinessRow: computeExpectedZoneBounds('marketBusinessRow')!,
        incidentQueue: computeExpectedZoneBounds('incidentQueue')!,
        streetGrid: computeExpectedZoneBounds('streetGrid')!,
        endTurnButton: computeExpectedZoneBounds('endTurnButton')!,
        investmentsRow: computeExpectedZoneBounds('investmentsRow')!,
        helpButton: computeExpectedZoneBounds('helpButton')!,
        hud: computeExpectedZoneBounds('hud')!,
      };

      for (const [zoneName, expected] of Object.entries(expectedPositions)) {
        const actual = resolved.zones[zoneName]?.rect;
        expect(actual).toBeDefined();
        expect(actual!.x).toBeCloseTo(expected.x, 0);
        expect(actual!.y).toBeCloseTo(expected.y, 0);
        expect(actual!.width).toBeCloseTo(expected.w, 0);
        expect(actual!.height).toBeCloseTo(expected.h, 0);
      }
    });
  });
});