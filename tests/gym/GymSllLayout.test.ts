import { describe, expect, it } from 'vitest';
import defaultLayoutJson from '../../example-games/gym/layouts/gym-sll-default.layout.json';
import pixelOverrideLayoutJson from '../../example-games/gym/layouts/gym-sll-pixel-override.layout.json';
import type { ScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import {
  parseScreenLayoutDocument,
  validateScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';
import { anchorPoint, getZoneRect } from '../../src/ui/screen-layout';

const defaultLayout = defaultLayoutJson as ScreenLayoutDocument;
const pixelOverrideLayout = pixelOverrideLayoutJson as ScreenLayoutDocument;

describe('Gym SLL layout fixtures', () => {
  it('validates bundled gym SLL documents against schema', () => {
    const docs = [defaultLayout, pixelOverrideLayout];

    for (const layout of docs) {
      const validation = validateScreenLayoutDocument(layout);
      expect(validation.valid).toBe(true);

      const parsed = parseScreenLayoutDocument(layout);
      expect(parsed.valid).toBe(true);
    }
  });

  it('maps the default layout at 1280x720 @ DPR 1', () => {
    const headerRect = getZoneRect(defaultLayout, 'header', { width: 1280, height: 720 }, 1);
    const titleAnchor = anchorPoint(defaultLayout, 'header', 'title', { width: 1280, height: 720 }, 1);

    expect(headerRect.x).toBeCloseTo(153.6, 6);
    expect(headerRect.y).toBeCloseTo(36, 6);
    expect(headerRect.width).toBeCloseTo(716.8, 6);
    expect(headerRect.height).toBeCloseTo(72, 6);

    expect(titleAnchor.x).toBeCloseTo(512, 6);
    expect(titleAnchor.y).toBeCloseTo(72, 6);
  });

  it('maps the default layout at 720x1280 @ DPR 2', () => {
    const contentRect = getZoneRect(defaultLayout, 'content', { width: 720, height: 1280 }, 2);
    const menuAnchor = anchorPoint(defaultLayout, 'menu', 'help', { width: 720, height: 1280 }, 2);

    expect(contentRect.x).toBeCloseTo(172.8, 6);
    expect(contentRect.y).toBeCloseTo(819.2, 6);
    expect(contentRect.width).toBeCloseTo(1094.4, 6);
    expect(contentRect.height).toBeCloseTo(1228.8, 6);

    expect(menuAnchor.x).toBeCloseTo(1224, 6);
    expect(menuAnchor.y).toBeCloseTo(230.4, 6);
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
});
