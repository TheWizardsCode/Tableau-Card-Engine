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
