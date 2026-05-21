import { describe, expect, it } from 'vitest';

import validMainStreetLayout from '../fixtures/layouts/main-street.valid.layout.json';
import type {
  NormalizedRect,
  ScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';
import {
  adaptLayoutWithFallback,
  anchorPoint,
  getZoneRect,
  normalizedToPixels,
  pixelToNormalized,
  type ScreenLayoutIssue,
} from '../../src/ui/screen-layout';

const layout = validMainStreetLayout as ScreenLayoutDocument;

function expectRectCloseTo(actual: NormalizedRect, expected: NormalizedRect): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe('screen layout mapping utilities', () => {
  it('maps normalized zones to pixels at 1280x720 @ DPR 1', () => {
    const marketRect = getZoneRect(layout, 'market', { width: 1280, height: 720 }, 1);

    expect(marketRect.x).toBeCloseTo(25.6, 6);
    expect(marketRect.y).toBeCloseTo(86.4, 6);
    expect(marketRect.width).toBeCloseTo(998.4, 6);
    expect(marketRect.height).toBeCloseTo(158.4, 6);
  });

  it('maps normalized zones to pixels at 720x1280 @ DPR 2', () => {
    const marketRect = getZoneRect(layout, 'market', { width: 720, height: 1280 }, 2);

    expect(marketRect.x).toBeCloseTo(28.8, 6);
    expect(marketRect.y).toBeCloseTo(307.2, 6);
    expect(marketRect.width).toBeCloseTo(1123.2, 6);
    expect(marketRect.height).toBeCloseTo(563.2, 6);
  });

  it('round-trips zone rects with bounded precision loss', () => {
    const viewport = { width: 1280, height: 720 };
    const dpr = 1;
    const marketRect = getZoneRect(layout, 'market', viewport, dpr);

    const normalized = pixelToNormalized(marketRect, viewport, dpr);

    expectRectCloseTo(normalized, layout.zones.market.rect);
  });

  it('throws explicit errors for unknown zones and unknown anchors', () => {
    expect(() => getZoneRect(layout, 'unknown-zone', { width: 1280, height: 720 }, 1)).toThrow(
      'Unknown zone: unknown-zone',
    );

    expect(() =>
      anchorPoint(layout, 'market', 'unknown-anchor', { width: 1280, height: 720 }, 1),
    ).toThrow('Unknown anchor "unknown-anchor" in zone "market"');
  });

  it('is deterministic for repeated calls with same inputs', () => {
    const first = normalizedToPixels(layout, { width: 1280, height: 720 }, 1);
    const second = normalizedToPixels(layout, { width: 1280, height: 720 }, 1);

    expect(second).toEqual(first);
  });

  it('returns anchor points inside the owning zone bounds', () => {
    const zoneRect = getZoneRect(layout, 'market', { width: 1280, height: 720 }, 1);
    const center = anchorPoint(layout, 'market', 'center', { width: 1280, height: 720 }, 1);

    expect(center.x).toBeGreaterThanOrEqual(zoneRect.x);
    expect(center.x).toBeLessThanOrEqual(zoneRect.x + zoneRect.width);
    expect(center.y).toBeGreaterThanOrEqual(zoneRect.y);
    expect(center.y).toBeLessThanOrEqual(zoneRect.y + zoneRect.height);
  });

  it('emits structured issues for unknown zone lookups', () => {
    const issues: ScreenLayoutIssue[] = [];

    expect(() =>
      getZoneRect(
        layout,
        'unknown-zone',
        { width: 1280, height: 720 },
        1,
        issue => issues.push(issue),
      ),
    ).toThrow('Unknown zone: unknown-zone');

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNKNOWN_ZONE');
    expect(issues[0].zoneName).toBe('unknown-zone');
  });

  it('uses legacy fallback adapter path when SLL mapping fails', () => {
    const issues: ScreenLayoutIssue[] = [];

    const resolved = adaptLayoutWithFallback({
      layoutDocument: layout,
      viewport: { width: 1280, height: 720 },
      dpr: 1,
      mapResolvedLayout: _resolved => {
        throw new Error('simulated mapping failure');
      },
      fallback: () => ({ source: 'legacy' as const }),
      reportIssue: issue => issues.push(issue),
    });

    expect(resolved.source).toBe('legacy');
    expect(issues.some(issue => issue.code === 'LAYOUT_ADAPTER_FALLBACK')).toBe(true);
  });

  it('maps a frame-sized batch within a small budget', () => {
    const loops = 500;
    const started = Date.now();

    for (let i = 0; i < loops; i += 1) {
      normalizedToPixels(layout, { width: 1280, height: 720 }, 1);
    }

    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeLessThan(50);
  });
});
