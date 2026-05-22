import { describe, expect, it } from 'vitest';
import shellLayoutJson from '../../example-games/gym/layouts/gym-shell.layout.json';
import sceneOnlyLayoutJson from '../../example-games/gym/layouts/gym-scene.layout.json';
import pixelOverrideLayoutJson from '../../example-games/gym/layouts/gym-sll-pixel-override.layout.json';
import {
  shouldShowDemoActionControl,
  shouldShowSharedHelpChrome,
  shouldShowShellChrome,
} from '../../example-games/gym/scenes/GymSllVisibility';
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
    const docs = [sceneOnlyLayout, pixelOverrideLayout];

    for (const layout of docs) {
      const validation = validateScreenLayoutDocument(layout);
      expect(validation.valid).toBe(true);

      const parsed = parseScreenLayoutDocument(layout);
      expect(parsed.valid).toBe(true);
    }
  });

  it('maps the shell-only layout at 1280x720 @ DPR 1', () => {
    const shellRect = getZoneRect(shellLayout, 'shell', { width: 1280, height: 720 }, 1);
    const titleAnchor = anchorPoint(shellLayout, 'shell', 'title', { width: 1280, height: 720 }, 1);
    const helpAnchor = anchorPoint(shellLayout, 'shell', 'help', { width: 1280, height: 720 }, 1);
    const actionAnchor = anchorPoint(shellLayout, 'shared', 'action', { width: 1280, height: 720 }, 1);

    expect(shellRect.x).toBeCloseTo(0, 6);
    expect(shellRect.y).toBeCloseTo(0, 6);
    expect(shellRect.width).toBeCloseTo(1280, 6);
    expect(shellRect.height).toBeCloseTo(90, 6);

    expect(titleAnchor.x).toBeCloseTo(640, 6);
    expect(titleAnchor.y).toBeCloseTo(45, 6);
    expect(helpAnchor.x).toBeCloseTo(1177.6, 6);
    expect(helpAnchor.y).toBeCloseTo(45, 6);
    expect(actionAnchor.x).toBeCloseTo(416, 6);
    expect(actionAnchor.y).toBeCloseTo(144, 6);
  });

  it('maps the scene-only layout at 1280x720 @ DPR 1', () => {
    const sceneOnlyRect = getZoneRect(sceneOnlyLayout, 'sceneOnly', { width: 1280, height: 720 }, 1);
    const helpAnchor = anchorPoint(sceneOnlyLayout, 'shared', 'help', { width: 1280, height: 720 }, 1);
    const sceneCenter = anchorPoint(sceneOnlyLayout, 'sceneOnly', 'center', { width: 1280, height: 720 }, 1);

    expect(sceneOnlyRect.x).toBeCloseTo(294.4, 6);
    expect(sceneOnlyRect.y).toBeCloseTo(201.6, 6);
    expect(sceneOnlyRect.width).toBeCloseTo(691.2, 6);
    expect(sceneOnlyRect.height).toBeCloseTo(302.4, 6);

    expect(helpAnchor.x).toBeCloseTo(448, 6);
    expect(helpAnchor.y).toBeCloseTo(126, 6);
    expect(sceneCenter.x).toBeCloseTo(640, 6);
    expect(sceneCenter.y).toBeCloseTo(352.8, 6);
  });

  it('maps the scene-only layout at 720x1280 @ DPR 2', () => {
    const sharedRect = getZoneRect(sceneOnlyLayout, 'shared', { width: 720, height: 1280 }, 2);
    const actionAnchor = anchorPoint(sceneOnlyLayout, 'shared', 'action', { width: 720, height: 1280 }, 2);

    expect(sharedRect.x).toBeCloseTo(288, 6);
    expect(sharedRect.y).toBeCloseTo(256, 6);
    expect(sharedRect.width).toBeCloseTo(432, 6);
    expect(sharedRect.height).toBeCloseTo(384, 6);

    expect(actionAnchor.x).toBeCloseTo(655.2, 6);
    expect(actionAnchor.y).toBeCloseTo(448, 6);
  });

  it('applies pixelOverride fields in the alternate layout and scales by viewport + DPR', () => {
    const desktopViewport = { width: 1280, height: 720 };
    const portraitViewport = { width: 720, height: 1280 };

    const menuDesktop = getZoneRect(pixelOverrideLayout, 'menu', desktopViewport, 1);
    const actionDesktop = anchorPoint(pixelOverrideLayout, 'controls', 'action', desktopViewport, 1);

    expect(menuDesktop.x).toBeCloseTo(1000, 6);
    expect(menuDesktop.y).toBeCloseTo(28, 6);
    expect(menuDesktop.width).toBeCloseTo(230, 6);
    expect(menuDesktop.height).toBeCloseTo(56, 6);
    expect(actionDesktop.x).toBeCloseTo(390, 6);
    expect(actionDesktop.y).toBeCloseTo(170, 6);

    const menuPortraitDpr2 = getZoneRect(pixelOverrideLayout, 'menu', portraitViewport, 2);
    const actionPortraitDpr2 = anchorPoint(pixelOverrideLayout, 'controls', 'action', portraitViewport, 2);

    expect(menuPortraitDpr2.x).toBeCloseTo(1125, 6);
    expect(menuPortraitDpr2.y).toBeCloseTo(99.555556, 5);
    expect(menuPortraitDpr2.width).toBeCloseTo(258.75, 6);
    expect(menuPortraitDpr2.height).toBeCloseTo(199.111111, 5);
    expect(actionPortraitDpr2.x).toBeCloseTo(438.75, 6);
    expect(actionPortraitDpr2.y).toBeCloseTo(604.444444, 5);
  });

  it('suppresses shared shell chrome in the pure scene-only layout', () => {
    expect(
      shouldShowShellChrome({ kind: 'direct', name: 'Shell-only' }),
    ).toBe(true);
    expect(
      shouldShowShellChrome({ kind: 'direct', name: 'Pixel Override' }),
    ).toBe(true);
    expect(
      shouldShowShellChrome({ kind: 'composed', name: 'Composed Shell + Scene' }),
    ).toBe(true);
    expect(
      shouldShowShellChrome({ kind: 'direct', name: 'Scene-only' }),
    ).toBe(false);
  });

  it('keeps shared help chrome aligned with shell chrome visibility', () => {
    expect(
      shouldShowSharedHelpChrome({ kind: 'direct', name: 'Shell-only' }),
    ).toBe(true);
    expect(
      shouldShowSharedHelpChrome({ kind: 'direct', name: 'Scene-only' }),
    ).toBe(false);
  });

  it('hides the demo action control in shell-only mode', () => {
    expect(
      shouldShowDemoActionControl({ kind: 'direct', name: 'Shell-only' }),
    ).toBe(false);
    expect(
      shouldShowDemoActionControl({ kind: 'direct', name: 'Scene-only' }),
    ).toBe(true);
    expect(
      shouldShowDemoActionControl({ kind: 'composed', name: 'Composed Shell + Scene' }),
    ).toBe(true);
    expect(
      shouldShowDemoActionControl({ kind: 'direct', name: 'Pixel Override' }),
    ).toBe(true);
  });
});
