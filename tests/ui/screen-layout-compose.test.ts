import { describe, expect, it } from 'vitest';

import type { ScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import {
  composeResolvedLayouts,
  type ComposeResolvedLayoutsIssue,
} from '../../src/ui/screen-layout-compose';

const desktopViewport = { width: 1280, height: 720 };
const portraitViewport = { width: 720, height: 1280 };

function expectRectCloseTo(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

const baseLayout = {
  version: 1,
  id: 'gym-shell-layout',
  baseViewport: { width: 1280, height: 720 },
  requiredZones: ['shell', 'shared', 'banner'],
  zones: {
    shell: {
      rect: { x: 0, y: 0, width: 1, height: 0.125 },
      anchors: {
        title: { x: 0.5, y: 0.5 },
        help: { x: 0.92, y: 0.5 },
      },
    },
    shared: {
      rect: { x: 0.1, y: 0.1, width: 0.25, height: 0.2 },
      anchors: {
        left: { x: 0.1, y: 0.5 },
        action: { x: 0.9, y: 0.5 },
      },
    },
    banner: {
      rect: {
        x: 0,
        y: 0,
        width: 0.05,
        height: 0.05,
        pixelOverride: { x: 16, y: 9, width: 64, height: 36 },
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
      rect: { x: 0.2, y: 0.1, width: 0.3, height: 0.15 },
      anchors: {
        help: { x: 0.82, y: 0.5 },
        action: { x: 0.2, y: 0.8 },
      },
    },
    sceneOnly: {
      rect: { x: 0.55, y: 0.45, width: 0.2, height: 0.2 },
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

    expectRectCloseTo(resolved.zones.shared.rect, {
      x: 256,
      y: 72,
      width: 384,
      height: 108,
    });
    expect(resolved.zones.shared.anchors.help).toEqual({ x: 570.88, y: 126 });
    expect(resolved.zones.shared.anchors.action).toEqual({ x: 332.8, y: 158.4 });

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

    expectRectCloseTo(resolved.zones.shared.rect, {
      x: 128,
      y: 72,
      width: 320,
      height: 144,
    });
    expect(resolved.zones.shared.anchors.left).toEqual({ x: 160, y: 144 });
    expect(resolved.zones.shared.anchors.action).toEqual({ x: 416, y: 144 });
    expect(resolved.zones.sceneOnly.rect).toEqual({
      x: 704,
      y: 324,
      width: 256,
      height: 144,
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

    expect(resolved.zones['scene:shared'].anchors.help).toEqual({ x: 570.88, y: 126 });
    expect(resolved.zones['scene:sceneOnly'].anchors.center).toEqual({ x: 832, y: 396 });
    expect(resolved.zones.shared.rect).toEqual({
      x: 128,
      y: 72,
      width: 320,
      height: 144,
    });
  });

  it('honours pixel overrides across viewport and DPR vectors', () => {
    const desktopResolved = composeResolvedLayouts(baseLayout, sceneLayout, desktopViewport, 1);
    const portraitResolved = composeResolvedLayouts(baseLayout, sceneLayout, portraitViewport, 2);

    expectRectCloseTo(desktopResolved.zones.banner.rect, {
      x: 16,
      y: 9,
      width: 64,
      height: 36,
    });

    expectRectCloseTo(portraitResolved.zones.banner.rect, {
      x: 18,
      y: 32,
      width: 72,
      height: 128,
    });
    expect(portraitResolved.viewport.pixelWidth).toBe(1440);
    expect(portraitResolved.viewport.pixelHeight).toBe(2560);
    expectRectCloseTo(portraitResolved.zones.sceneOnly.rect, {
      x: 792,
      y: 1152,
      width: 288,
      height: 512,
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
