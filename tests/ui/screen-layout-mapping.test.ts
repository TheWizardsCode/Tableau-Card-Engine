import { describe, expect, it } from 'vitest';

import validMainStreetLayout from '../fixtures/layouts/main-street.valid.layout.json';
import type {
  ScreenLayoutDocument,
  PixelPoint,
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

function expectPointCloseTo(actual: PixelPoint, expected: PixelPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

describe('screen layout mapping utilities', () => {
  it('maps position-only zones to pixels at 1280x720 @ DPR 1', () => {
    const marketPos = getZoneRect(layout, 'market', { width: 1280, height: 720 }, 1);

    expect(marketPos.x).toBeCloseTo(25.6, 6);
    expect(marketPos.y).toBeCloseTo(86.4, 6);
  });

  it('maps position-only zones at different viewport and DPR', () => {
    const marketPos = getZoneRect(layout, 'market', { width: 720, height: 1280 }, 2);

    expect(marketPos.x).toBeCloseTo(28.8, 6);
    expect(marketPos.y).toBeCloseTo(307.2, 6);
  });

  it('round-trips position-only zone positions', () => {
    const viewport = { width: 1280, height: 720 };
    const dpr = 1;
    const marketPos = getZoneRect(layout, 'market', viewport, dpr);

    const normalized = pixelToNormalized(marketPos, viewport, dpr);

    expectPointCloseTo(normalized, layout.zones.market.rect);
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

  it('resolves anchors using absolute coordinates for position-only zones', () => {
    const center = anchorPoint(layout, 'market', 'center', { width: 1280, height: 720 }, 1);

    // For position-only zones, anchors are in absolute viewport coordinates
    // center anchor is at x=0.41, y=0.23 in the fixture
    expect(center.x).toBeCloseTo(524.8, 6); // 0.41 * 1280
    expect(center.y).toBeCloseTo(165.6, 6); // 0.23 * 720
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
    // Budget is intentionally generous: normalizedToPixels is a pure math
    // hot-path used per-zone per-frame, so the guardrail only needs to catch
    // pathological regressions (e.g. O(n^2) or accidental I/O), not micro-
    // performance. 500ms also tolerates heavily-loaded shared CI machines.
    expect(elapsedMs).toBeLessThan(500);
  });

  it('handles zones with pixelOverride for position-only override', () => {
    // The activityLog zone has a pixelOverride for precise positioning
    const activityLogPos = getZoneRect(layout, 'activityLog', { width: 1280, height: 720 }, 1);

    expect(activityLogPos.x).toBeCloseTo(1036, 6);
    expect(activityLogPos.y).toBeCloseTo(86, 6);
  });
});
