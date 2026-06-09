import { describe, expect, it } from 'vitest';

import type {
  ScreenLayoutDocument,
  PixelRect,
} from '../../src/ui/screen-layout-schema';
import { getZoneRect } from '../../src/ui/screen-layout';
import {
  validateScreenLayoutDocument,
  parseScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';
import {
  composeResolvedLayouts,
  type ComposeResolvedLayoutsIssue,
} from '../../src/ui/screen-layout-compose';

const baseViewport = { width: 1280, height: 720 };

function expectPixelRectClose(
  actual: PixelRect,
  expectedX: number,
  expectedY: number,
  expectedWidth: number | null = null,
  expectedHeight: number | null = null,
): void {
  expect(actual.x).toBeCloseTo(expectedX, 6);
  expect(actual.y).toBeCloseTo(expectedY, 6);

  if (expectedWidth !== null) {
    expect(actual.width).toBeCloseTo(expectedWidth, 6);
  } else if (expectedWidth === null && actual.width !== undefined) {
    expect(actual.width).toBeUndefined();
  }

  if (expectedHeight !== null) {
    expect(actual.height).toBeCloseTo(expectedHeight, 6);
  } else if (expectedHeight === null && actual.height !== undefined) {
    expect(actual.height).toBeUndefined();
  }
}

describe('NormalizedRect dimension support (w/h)', () => {
  it('accepts zones with optional w and h in JSON Schema', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'dim-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
          },
        },
      },
    };

    const result = validateScreenLayoutDocument(layout);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects zones with negative w or h', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'neg-dim-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: -1,
            h: 0.4,
          },
        },
      },
    };

    const result = validateScreenLayoutDocument(layout);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts zones without w/h (backward-compatible)', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'no-dim-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['pos-only'],
      zones: {
        'pos-only': {
          rect: {
            x: 0.1,
            y: 0.2,
          },
        },
      },
    };

    const result = validateScreenLayoutDocument(layout);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('parses dimensioned zones into typed documents', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'parse-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
          },
        },
      },
    };

    const result = parseScreenLayoutDocument(layout);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.layout.zones.boxed.rect.w).toBe(0.3);
      expect(result.layout.zones.boxed.rect.h).toBe(0.4);
    }
  });
});

describe('resolveRect with dimensions', () => {
  it('returns PixelRect with width/height when w/h are present', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'dim-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
          },
        },
      },
    };

    const rect = getZoneRect(layout, 'boxed', baseViewport, 1);

    expectPixelRectClose(rect, 128, 144, 384, 288);
  });

  it('returns PixelRect with undefined width/height when w/h are absent', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'pos-only',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['pos-only'],
      zones: {
        'pos-only': {
          rect: {
            x: 0.1,
            y: 0.2,
          },
        },
      },
    };

    const rect = getZoneRect(layout, 'pos-only', baseViewport, 1);

    expectPixelRectClose(rect, 128, 144, null, null);
  });

  it('scales dimensions with DPR', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'dim-dpr-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
          },
        },
      },
    };

    const rect = getZoneRect(layout, 'boxed', baseViewport, 2);

    // x = 0.1 * 1280 * 2 = 256
    // y = 0.2 * 720 * 2 = 288
    // width = 0.3 * 1280 * 2 = 768
    // height = 0.4 * 720 * 2 = 576
    expectPixelRectClose(rect, 256, 288, 768, 576);
  });

  it('scales dimensions with different base viewport', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'dim-bv-test',
      baseViewport: { width: 1920, height: 1080 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
          },
        },
      },
    };

    const rect = getZoneRect(layout, 'boxed', baseViewport, 1);

    // x = 0.1 * 1280 = 128
    // y = 0.2 * 720 = 144
    // width = 0.3 * 1280 = 384
    // height = 0.4 * 720 = 288
    expectPixelRectClose(rect, 128, 144, 384, 288);
  });

  it('uses pixelOverride for position but still returns dimensions', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'dim-pixel-override',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            pixelOverride: { x: 100, y: 50 },
            w: 0.3,
            h: 0.4,
          },
        },
      },
    };

    const rect = getZoneRect(layout, 'boxed', baseViewport, 1);

    expectPixelRectClose(rect, 100, 50, 384, 288);
  });
});

describe('ResolvedZone.rect type', () => {
  it('getZoneRect returns PixelRect with optional width/height', () => {
    const layout: ScreenLayoutDocument = {
      version: 1,
      id: 'type-test',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['boxed', 'pos-only'],
      zones: {
        boxed: {
          rect: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.4,
          },
        },
        'pos-only': {
          rect: {
            x: 0.1,
            y: 0.2,
          },
        },
      },
    };

    const boxedRect = getZoneRect(layout, 'boxed', baseViewport, 1);
    const posRect = getZoneRect(layout, 'pos-only', baseViewport, 1);

    // Dimensioned zone should have width and height
    expect(boxedRect.width).toBe(384);
    expect(boxedRect.height).toBe(288);

    // Position-only zone should have undefined width and height
    expect(posRect.width).toBeUndefined();
    expect(posRect.height).toBeUndefined();
  });
});

describe('composeResolvedLayouts with dimensioned zones', () => {
  const desktopViewport = { width: 1280, height: 720 };

  const baseLayout: ScreenLayoutDocument = {
    version: 1,
    id: 'base-layout',
    baseViewport: { width: 1280, height: 720 },
    requiredZones: ['market', 'street'],
    zones: {
      market: {
        rect: { x: 0.02, y: 0.12 },
        anchors: { center: { x: 0.215, y: 0.175 } },
      },
      street: {
        rect: { x: 0.12, y: 0.53, w: 0.7, h: 0.35 },
        anchors: { center: { x: 0.47, y: 0.705 } },
      },
    },
  };

  const sceneLayout: ScreenLayoutDocument = {
    version: 1,
    id: 'scene-layout',
    baseViewport: { width: 1280, height: 720 },
    requiredZones: ['hud', 'helpButton'],
    zones: {
      hud: {
        rect: { x: 0, y: 0, w: 1, h: 0.04 },
        anchors: { center: { x: 0.5, y: 0.02 } },
      },
      helpButton: {
        rect: { x: 0.93, y: 0.89, w: 0.07, h: 0.09 },
        anchors: { center: { x: 0.965, y: 0.935 } },
      },
    },
  };

  it('propagates dimensioned scene zones through composition (sceneWins)', () => {
    const issues: ComposeResolvedLayoutsIssue[] = [];
    const resolved = composeResolvedLayouts(
      baseLayout,
      sceneLayout,
      desktopViewport,
      1,
      { reportIssue: (issue) => issues.push(issue) },
    );

    // Scene-only dimensioned zone should have width/height
    const hudRect = resolved.zones['hud'].rect;
    expect(hudRect.x).toBe(0);
    expect(hudRect.y).toBe(0);
    expect(hudRect.width).toBe(1280);
    expect(hudRect.height).toBe(28.8);

    const helpRect = resolved.zones['helpButton'].rect;
    expect(helpRect.width).toBeCloseTo(89.6, 4);
    expect(helpRect.height).toBeCloseTo(64.8, 4);

    // Base dimensioned zone should keep its dimensions
    const streetRect = resolved.zones['street'].rect;
    expect(streetRect.width).toBeCloseTo(896, 6);
    expect(streetRect.height).toBeCloseTo(252, 6);

    // Base position-only zone should keep undefined dimensions
    const marketRect = resolved.zones['market'].rect;
    expect(marketRect.width).toBeUndefined();
    expect(marketRect.height).toBeUndefined();
  });

  it('propagates dimensioned zones through composition (baseWins)', () => {
    const resolved = composeResolvedLayouts(
      baseLayout,
      sceneLayout,
      desktopViewport,
      1,
      { policy: 'baseWins' },
    );

    // Base market zone (pos-only) should be preserved with undefined dims
    const marketRect = resolved.zones['market'].rect;
    expect(marketRect.width).toBeUndefined();
    expect(marketRect.height).toBeUndefined();

    // Scene-only zones should still be included
    const hudRect = resolved.zones['hud'].rect;
    expect(hudRect.width).toBe(1280);
    expect(hudRect.height).toBe(28.8);
  });

  it('propagates dimensioned zones through composition (namespace)', () => {
    const resolved = composeResolvedLayouts(
      baseLayout,
      sceneLayout,
      desktopViewport,
      1,
      { policy: 'namespace', namespacePrefix: 'scene' },
    );

    // Scene zones should be namespaced and keep dimensions
    const hudRect = resolved.zones['scene:hud'].rect;
    expect(hudRect.width).toBe(1280);
    expect(hudRect.height).toBe(28.8);

    const helpRect = resolved.zones['scene:helpButton'].rect;
    expect(helpRect.width).toBeCloseTo(89.6, 4);
    expect(helpRect.height).toBeCloseTo(64.8, 4);

    // Base zones should be preserved
    const streetRect = resolved.zones['street'].rect;
    expect(streetRect.width).toBeCloseTo(896, 6);
    expect(streetRect.height).toBeCloseTo(252, 6);
  });

  it('preserves pixelOverride position while adding dimensions in composed zones', () => {
    const baseWithPixelOverride: ScreenLayoutDocument = {
      version: 1,
      id: 'base-pixel-override',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['activityLog'],
      zones: {
        activityLog: {
          rect: {
            x: 0.81,
            y: 0.12,
            pixelOverride: { x: 1036, y: 86 },
            w: 0.15,
            h: 0.35,
          },
        },
      },
    };

    const resolved = composeResolvedLayouts(
      baseWithPixelOverride,
      sceneLayout,
      desktopViewport,
      1,
    );

    const logRect = resolved.zones['activityLog'].rect;
    // pixelOverride position is respected
    expect(logRect.x).toBe(1036);
    expect(logRect.y).toBe(86);
    // dimensions are scaled from normalized
    expect(logRect.width).toBeCloseTo(192, 4);
    expect(logRect.height).toBeCloseTo(252, 4);
  });

  it('handles mixed dimensioned and position-only zones in both base and scene', () => {
    const baseMixed: ScreenLayoutDocument = {
      version: 1,
      id: 'base-mixed',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['dimZone', 'posZone'],
      zones: {
        dimZone: {
          rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
        },
        posZone: {
          rect: { x: 0.4, y: 0.4 },
        },
      },
    };

    const sceneMixed: ScreenLayoutDocument = {
      version: 1,
      id: 'scene-mixed',
      baseViewport: { width: 1280, height: 720 },
      requiredZones: ['dimScene', 'posScene'],
      zones: {
        dimScene: {
          rect: { x: 0.6, y: 0.6, w: 0.1, h: 0.1 },
        },
        posScene: {
          rect: { x: 0.8, y: 0.8 },
        },
      },
    };

    const resolved = composeResolvedLayouts(
      baseMixed,
      sceneMixed,
      desktopViewport,
      1,
    );

    // Dimensioned zones keep dimensions
    expect(resolved.zones['dimZone'].rect.width).toBe(256);
    expect(resolved.zones['dimZone'].rect.height).toBe(216);
    expect(resolved.zones['dimScene'].rect.width).toBe(128);
    expect(resolved.zones['dimScene'].rect.height).toBe(72);

    // Position-only zones keep undefined dimensions
    expect(resolved.zones['posZone'].rect.width).toBeUndefined();
    expect(resolved.zones['posZone'].rect.height).toBeUndefined();
    expect(resolved.zones['posScene'].rect.width).toBeUndefined();
    expect(resolved.zones['posScene'].rect.height).toBeUndefined();
  });
});
