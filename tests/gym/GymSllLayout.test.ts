import { describe, expect, it } from 'vitest';
import shellLayoutJson from '../../example-games/gym/layouts/gym-shell.layout.json';
import sceneOnlyLayoutJson from '../../example-games/gym/layouts/gym-scene.layout.json';
import pixelOverrideLayoutJson from '../../example-games/gym/layouts/gym-sll-pixel-override.layout.json';
import type { ScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import {
  parseScreenLayoutDocument,
  validateScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';
import { anchorPoint, getZoneRect } from '../../src/ui/screen-layout';

const shellLayout = shellLayoutJson as ScreenLayoutDocument;
const sceneOnlyLayout = sceneOnlyLayoutJson as ScreenLayoutDocument;
const pixelOverrideLayout = pixelOverrideLayoutJson as ScreenLayoutDocument;

describe('Gym SLL layout fixtures', () => {
  it('validates bundled gym SLL documents against schema', () => {
    const docs = [sceneOnlyLayout, pixelOverrideLayout, shellLayout];

    for (const layout of docs) {
      const validation = validateScreenLayoutDocument(layout);
      expect(validation.valid).toBe(true);

      const parsed = parseScreenLayoutDocument(layout);
      expect(parsed.valid).toBe(true);
    }
  });

  it('maps the shell-only layout at 1280x720 @ DPR 1 with position-only zones', () => {
    const shellRect = getZoneRect(shellLayout, 'shell', { width: 1280, height: 720 }, 1);
    const titleAnchor = anchorPoint(shellLayout, 'shell', 'title', { width: 1280, height: 720 }, 1);
    const helpAnchor = anchorPoint(shellLayout, 'shell', 'help', { width: 1280, height: 720 }, 1);
    const actionAnchor = anchorPoint(shellLayout, 'shared', 'action', { width: 1280, height: 720 }, 1);

    // Shell zone is position-only
    expect(shellRect.x).toBeCloseTo(0, 6);
    expect(shellRect.y).toBeCloseTo(0, 6);

    // Anchors use absolute coordinates for position-only zones
    expect(titleAnchor.x).toBeCloseTo(640, 6);
    expect(titleAnchor.y).toBeCloseTo(45, 6);
    expect(helpAnchor.x).toBeCloseTo(1177.6, 6);
    expect(helpAnchor.y).toBeCloseTo(45, 6);
    expect(actionAnchor.x).toBeCloseTo(448, 6);
    expect(actionAnchor.y).toBeCloseTo(144, 6);
  });

  it('maps the scene-only layout at 1280x720 @ DPR 1 with position-only zones', () => {
    const sceneOnlyRect = getZoneRect(sceneOnlyLayout, 'sceneOnly', { width: 1280, height: 720 }, 1);
    const titleAnchor = anchorPoint(sceneOnlyLayout, 'shared', 'title', { width: 1280, height: 720 }, 1);
    const helpAnchor = anchorPoint(sceneOnlyLayout, 'shared', 'help', { width: 1280, height: 720 }, 1);
    const sceneCenter = anchorPoint(sceneOnlyLayout, 'sceneOnly', 'center', { width: 1280, height: 720 }, 1);

    // sceneOnly zone is position-only
    expect(sceneOnlyRect.x).toBeCloseTo(294.4, 6);
    expect(sceneOnlyRect.y).toBeCloseTo(201.6, 6);

    // Anchors use absolute coordinates
    expect(titleAnchor.x).toBeCloseTo(640, 6);
    expect(titleAnchor.y).toBeCloseTo(126, 6);
    expect(helpAnchor.x).toBeCloseTo(448, 6);
    expect(helpAnchor.y).toBeCloseTo(126, 6);
    expect(sceneCenter.x).toBeCloseTo(640, 6);
    expect(sceneCenter.y).toBeCloseTo(352.8, 6);

    const actionAnchor = anchorPoint(sceneOnlyLayout, 'shared', 'action', { width: 1280, height: 720 }, 1);
    // pixelOverride (580, 126) at 1280x720 @ DPR 1: scaleX=1, scaleY=1
    expect(actionAnchor.x).toBeCloseTo(580, 6);
    expect(actionAnchor.y).toBeCloseTo(126, 6);
  });

  it('maps the scene-only layout at 720x1280 @ DPR 2 with position-only zones', () => {
    const sharedRect = getZoneRect(sceneOnlyLayout, 'shared', { width: 720, height: 1280 }, 2);
    const actionAnchor = anchorPoint(sceneOnlyLayout, 'shared', 'action', { width: 720, height: 1280 }, 2);

    // Shared zone is position-only
    expect(sharedRect.x).toBeCloseTo(288, 6);
    expect(sharedRect.y).toBeCloseTo(256, 6);

    // pixelOverride (580, 126) scaled by viewport 720x1280 @ DPR 2
    // scaleX = (720*2)/1280 = 1.125, scaleY = (1280*2)/720 ≈ 3.555556
    expect(actionAnchor.x).toBeCloseTo(652.5, 6);
    expect(actionAnchor.y).toBeCloseTo(448, 5);
  });

  it('applies pixelOverride position fields in the alternate layout and scales by viewport + DPR', () => {
    const desktopViewport = { width: 1280, height: 720 };
    const portraitViewport = { width: 720, height: 1280 };

    const menuDesktop = getZoneRect(pixelOverrideLayout, 'menu', desktopViewport, 1);
    const actionDesktop = anchorPoint(pixelOverrideLayout, 'controls', 'action', desktopViewport, 1);

    expect(menuDesktop.x).toBeCloseTo(1000, 6);
    expect(menuDesktop.y).toBeCloseTo(28, 6);
    expect(actionDesktop.x).toBeCloseTo(390, 6);
    expect(actionDesktop.y).toBeCloseTo(170, 6);

    const menuPortraitDpr2 = getZoneRect(pixelOverrideLayout, 'menu', portraitViewport, 2);
    const actionPortraitDpr2 = anchorPoint(pixelOverrideLayout, 'controls', 'action', portraitViewport, 2);

    expect(menuPortraitDpr2.x).toBeCloseTo(1125, 6);
    expect(menuPortraitDpr2.y).toBeCloseTo(99.555556, 5);
    expect(actionPortraitDpr2.x).toBeCloseTo(438.75, 6);
    expect(actionPortraitDpr2.y).toBeCloseTo(604.444444, 5);
  });
});
