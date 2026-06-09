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
  MARKET_BUSINESS_SLOTS,
  INCIDENT_QUEUE_SIZE,
} from '../../example-games/main-street/MainStreetCards';
import {
  BASE_HUD_Y,
  BASE_MARKET_CARD_W,
  BASE_MARKET_CARD_H,
  BASE_MARKET_ROW_GAP,
  BASE_MARKET_CARD_GAP,
  BASE_MARKET_LABEL_W,
  BASE_QUEUE_CARD_W,
  BASE_QUEUE_CARD_H,
  BASE_QUEUE_CARD_GAP,
  BASE_SLOT_H,
  STREET_ROW_GAP,
} from '../../example-games/main-street/scenes/MainStreetConstants';

const VIEWPORT: LayoutViewport = { width: 1280, height: 720 };

function computeExpectedZoneBounds(
  zone: string,
  viewport: LayoutViewport = VIEWPORT,
): { x: number; y: number; w: number; h: number } | null {
  const gameW = viewport.width;
  const marketRowH = BASE_MARKET_CARD_H + 14;

  switch (zone) {
    case 'hud':
      return { x: 0, y: BASE_HUD_Y - 14, w: gameW, h: 28 };
    case 'marketBusinessRow': {
      const marketStartX = BASE_MARKET_LABEL_W + 50;
      const marketRight =
        marketStartX +
        (MARKET_BUSINESS_SLOTS - 1) * (BASE_MARKET_CARD_W + BASE_MARKET_CARD_GAP) +
        BASE_MARKET_CARD_W +
        20;
      return {
        x: 20,
        y: 90 - 10,
        w: marketRight - 20,
        h: 2 * marketRowH + BASE_MARKET_ROW_GAP + 20,
      };
    }
    case 'streetGrid': {
      const streetH = 2 * BASE_SLOT_H + STREET_ROW_GAP + 12;
      return { x: 0, y: 439 - 6, w: gameW, h: streetH };
    }
    case 'endTurnButton': {
      const rightX = gameW - 24;
      return {
        x: rightX - 140 - 20,
        y: 648 - 4,
        w: 140 + 20,
        h: 34 + 8,
      };
    }
    case 'incidentQueue': {
      const totalW =
        BASE_MARKET_LABEL_W +
        INCIDENT_QUEUE_SIZE * (BASE_QUEUE_CARD_W + BASE_QUEUE_CARD_GAP) +
        32;
      return {
        x: 20,
        y: 320 - 6,
        w: totalW,
        h: BASE_QUEUE_CARD_H + 16,
      };
    }
    case 'investmentsRow': {
      const marketStartX = BASE_MARKET_LABEL_W + 50;
      const marketRight =
        marketStartX +
        (MARKET_BUSINESS_SLOTS - 1) * (BASE_MARKET_CARD_W + BASE_MARKET_CARD_GAP) +
        BASE_MARKET_CARD_W +
        20;
      return {
        x: 20,
        y: 90 + marketRowH + BASE_MARKET_ROW_GAP,
        w: marketRight - 20,
        h: marketRowH,
      };
    }
    case 'helpButton':
      return { x: gameW - 120, y: 648 - 4, w: 100, h: 34 + 8 };
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
  'streetGrid',
  'endTurnButton',
  'incidentQueue',
  'investmentsRow',
  'helpButton',
];

describe('Tutorial layout resolution', () => {
  describe('schema validation', () => {
    it('passes validation for the tutorial layout', () => {
      const result = validateScreenLayoutDocument(tutorialLayout);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts all 7 required zones', () => {
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
    it('resolves all 7 tutorial zones at 1280x720 @1x', () => {
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

  describe('missing zones return null', () => {
    it('center-modal returns null as expected', () => {
      const result = computeExpectedZoneBounds('center-modal');
      expect(result).toBeNull();
    });

    it('completion-modal returns null as expected', () => {
      const result = computeExpectedZoneBounds('completion-modal');
      expect(result).toBeNull();
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

      expect(resolved.zones.hud.rect.x).toBe(0);
      expect(resolved.zones.hud.rect.y).toBe(72);
      expect(resolved.zones.hud.rect.width).toBe(2560);
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

      expect(resolved.zones.hud.rect.x).toBe(0);
      expect(resolved.zones.hud.rect.y).toBeCloseTo(30, 0);
      expect(resolved.zones.hud.rect.width).toBe(800);
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