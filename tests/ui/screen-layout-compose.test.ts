import { describe, expect, it } from 'vitest';

import type { ScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import {
  composeResolvedLayouts,
  type ComposeResolvedLayoutsIssue,
} from '../../src/ui/screen-layout-compose';

const desktopViewport = { width: 1280, height: 720 };
const portraitViewport = { width: 720, height: 1280 };

function expectPointCloseTo(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

const baseLayout = {
  version: 1,
  id: 'gym-shell-layout',
  baseViewport: { width: 1280, height: 720 },
  requiredZones: ['shell', 'shared', 'banner'],
  zones: {
    shell: {
      rect: { x: 0, y: 0 },
      anchors: {
        title: { x: 0.5, y: 0.5 },
        help: { x: 0.92, y: 0.5 },
      },
    },
    shared: {
      rect: { x: 0.1, y: 0.1 },
      anchors: {
        left: { x: 0.1, y: 0.5 },
        action: { x: 0.9, y: 0.5 },
      },
    },
    banner: {
      rect: {
        x: 0,
        y: 0,
        pixelOverride: { x: 16, y: 9 },
      },
      anchors: {
        center: { x: 0.5, y: 0.5 },
      },
    },
  },
} satisfies ScreenLayoutDocument;

const sceneLayout = {
  version: 1,
  id: 'gym-scene-layout',
  baseViewport: { width: 1280, height: 720 },
  requiredZones: ['shared', 'sceneOnly'],
  zones: {
    shared: {
      rect: { x: 0.2, y: 0.1 },
      anchors: {
        help: { x: 0.82, y: 0.5 },
        action: { x: 0.2, y: 0.8 },
      },
    },
    sceneOnly: {
      rect: { x: 0.55, y: 0.45 },
      anchors: {
        center: { x: 0.5, y: 0.5 },
      },
    },
  },
} satisfies ScreenLayoutDocument;

describe('composeResolvedLayouts', () => {
  it('defaults to sceneWins, merges the scene zone, and emits a collision warning', () => {
    const issues: ComposeResolvedLayoutsIssue[] = [];

    const resolved = composeResolvedLayouts(baseLayout, sceneLayout, desktopViewport, 1, {
      reportIssue: issue => issues.push(issue),
    });

    expect(resolved.viewport).toEqual({
      width: 1280,
      height: 720,
      dpr: 1,
      pixelWidth: 1280,
      pixelHeight: 720,
    });

    expect(Object.keys(resolved.zones).sort()).toEqual([
      'banner',
      'sceneOnly',
      'shared',
      'shell',
    ]);

    expectPointCloseTo(resolved.zones.shared.rect, {
      x: 256,
      y: 72,
    });
    // Anchors are resolved in absolute viewport coordinates (not zone-relative)
    expect(resolved.zones.shared.anchors.help).toEqual({ x: 1049.6, y: 360 });
    expect(resolved.zones.shared.anchors.action).toEqual({ x: 256, y: 576 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      policy: 'sceneWins',
      zoneName: 'shared',
      baseLayoutId: 'gym-shell-layout',
      sceneLayoutId: 'gym-scene-layout',
    });
    expect(issues[0].message).toContain('shared');
    expect(issues[0].message).toContain('gym-shell-layout');
    expect(issues[0].message).toContain('gym-scene-layout');
  });

  it('supports baseWins while keeping scene-only zones available', () => {
    const resolved = composeResolvedLayouts(baseLayout, sceneLayout, desktopViewport, 1, {
      policy: 'baseWins',
    });

    expectPointCloseTo(resolved.zones.shared.rect, {
      x: 128,
      y: 72,
    });
    expect(resolved.zones.shared.anchors.left).toEqual({ x: 128, y: 360 });
    expect(resolved.zones.shared.anchors.action).toEqual({ x: 1152, y: 360 });
    expect(resolved.zones.sceneOnly.rect).toEqual({
      x: 704,
      y: 324,
    });
  });

  it('namespaces scene zones when requested', () => {
    const resolved = composeResolvedLayouts(baseLayout, sceneLayout, desktopViewport, 1, {
      policy: 'namespace',
      namespacePrefix: 'scene',
    });

    expect(Object.keys(resolved.zones).sort()).toEqual([
      'banner',
      'scene:sceneOnly',
      'scene:shared',
      'shared',
      'shell',
    ]);

    expect(resolved.zones['scene:shared'].anchors.help).toEqual({ x: 1049.6, y: 360 });
    expect(resolved.zones['scene:sceneOnly'].anchors.center).toEqual({ x: 640, y: 360 });
    expectPointCloseTo(resolved.zones.shared.rect, {
      x: 128,
      y: 72,
    });
  });

  it('honours pixel overrides across viewport and DPR vectors', () => {
    const desktopResolved = composeResolvedLayouts(baseLayout, sceneLayout, desktopViewport, 1);
    const portraitResolved = composeResolvedLayouts(baseLayout, sceneLayout, portraitViewport, 2);

    expectPointCloseTo(desktopResolved.zones.banner.rect, {
      x: 16,
      y: 9,
    });

    expectPointCloseTo(portraitResolved.zones.banner.rect, {
      x: 18,
      y: 32,
    });
    expect(portraitResolved.viewport.pixelWidth).toBe(1440);
    expect(portraitResolved.viewport.pixelHeight).toBe(2560);
    expectPointCloseTo(portraitResolved.zones.sceneOnly.rect, {
      x: 792,
      y: 1152,
    });
  });

  it('rejects invalid documents before merging', () => {
    expect(() =>
      composeResolvedLayouts(
        {
          ...baseLayout,
          requiredZones: ['missing-zone'],
        } as ScreenLayoutDocument,
        sceneLayout,
        desktopViewport,
      ),
    ).toThrow('Required zone "missing-zone" is missing');
  });
});
