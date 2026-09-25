/**
 * Unit tests for the Main Street layout geometry helper.
 *
 * Validates that `computeMainStreetLayoutGeometry()` derives all rect
 * accessors from `computeMainStreetLayoutWithSll()` without duplicating
 * hardcoded strip maths.
 *
 * @module tests/main-street/helpers/mainStreetLayoutGeometry
 * @see {@link https://github.com/TheWizardsCode/Tableau-Card-Engine/issues/CG-0MT5UO47U0047UKA}
 */
import { describe, it, expect } from 'vitest';
import {
  computeMainStreetLayoutGeometry,
  assertMarketAlignedHud,
  assertFavourButtonsAdjacent,
  type MainStreetLayoutGeometry,
} from './mainStreetLayoutGeometry';
import { parseScreenLayoutDocument } from '@ui/screen-layout-schema';
import { anchorPoint } from '@ui/screen-layout';
import mainStreetLayoutJson from '../../../example-games/main-street/layouts/main-street.layout.json';
import { BASE_HUD_Y } from '../../../example-games/main-street/scenes/MainStreetConstants';

const VIEWPORT = { width: 1280, height: 720 };

// ── Helper to get geometry for a viewport ────────────────────────

function geom(vp: { width: number; height: number } = VIEWPORT): MainStreetLayoutGeometry {
  return computeMainStreetLayoutGeometry(vp);
}

// ── AC: pure, no Phaser/browser dependency ───────────────────────

describe('computeMainStreetLayoutGeometry — Node purity', () => {
  it('returns rects without requiring Phaser or a browser', () => {
    const g = geom();
    expect(g.marketBox).toBeDefined();
    expect(g.hudStrip).toBeDefined();
    expect(g.favourCoinsToRepButton).toBeDefined();
    expect(g.favourRepToCoinsButton).toBeDefined();
    expect(g.endTurnButton).toBeDefined();
    expect(g.hintButton).toBeDefined();
    expect(g.peekButton).toBeDefined();
    expect(g.actionCounter).toBeDefined();
    // All rects have numeric x/y/width/height.
    for (const key of [
      'marketBox',
      'hudStrip',
      'favourCoinsToRepButton',
      'favourRepToCoinsButton',
      'endTurnButton',
      'hintButton',
      'peekButton',
      'actionCounter',
    ] as const) {
      const r = g[key];
      expect(typeof r.x).toBe('number');
      expect(typeof r.y).toBe('number');
      expect(typeof r.width).toBe('number');
      expect(typeof r.height).toBe('number');
    }
  });
});

// ── AC: HUD strip aligned to market box ──────────────────────────

describe('HUD strip alignment to market box (AC2 target contract)', () => {
  it('hudLeft equals market box left edge (20)', () => {
    const g = geom();
    expect(g.hudStrip.x).toBe(20);
    expect(g.marketBox.x).toBe(20);
  });

  it('hudRight equals market box right edge (logX - 20)', () => {
    const g = geom();
    // The helper derives both from layout.logX - 20.
    expect(g.hudStrip.x + g.hudStrip.width).toBe(
      g.marketBox.x + g.marketBox.width,
    );
  });

  it('assertMarketAlignedHud passes for the derived geometry', () => {
    const g = geom();
    expect(() => assertMarketAlignedHud(g)).not.toThrow();
  });

  it('HUD strip width equals market box width', () => {
    const g = geom();
    expect(g.hudStrip.width).toBe(g.marketBox.width);
  });

  it('HUD strip height is 28px (legacy constant)', () => {
    const g = geom();
    expect(g.hudStrip.height).toBe(28);
  });

  it('HUD strip y is the top edge of the hudY-centred strip', () => {
    const g = geom();
    // 28px strip centred on BASE_HUD_Y → top edge BASE_HUD_Y - 14.
    expect(g.hudStrip.y).toBe(BASE_HUD_Y - 14);
    expect(g.hudStrip.y + g.hudStrip.height).toBe(BASE_HUD_Y + 14);
  });
});

// ── AC: Market box geometry ──────────────────────────────────────

describe('Market box geometry', () => {
  it('market box left edge is 20', () => {
    const g = geom();
    expect(g.marketBox.x).toBe(20);
  });

  it('market box top is marketTop - 10', () => {
    const g = geom();
    // The adapter computes marketTop from the SLL market zone.
    const parsed = parseScreenLayoutDocument(mainStreetLayoutJson);
    expect(parsed.valid).toBe(true);
    const viewport = { width: 1280, height: 720 };
    const topLeft = anchorPoint(
      parsed.layout as never,
      'market',
      'topLeft',
      viewport,
      1,
    );
    const expectedMarketTop = Math.round(topLeft.y);
    // The renderer adds -10 padding.
    expect(g.marketBox.y).toBe(expectedMarketTop - 10);
  });
});

// ── AC: Favour buttons geometry ──────────────────────────────────

describe('Favour button geometry', () => {
  it('favour buttons are positioned inside the HUD strip', () => {
    const g = geom();
    const strip = g.hudStrip;
    for (const btn of [g.favourRepToCoinsButton, g.favourCoinsToRepButton]) {
      expect(btn.x).toBeGreaterThanOrEqual(strip.x);
      expect(btn.x + btn.width).toBeLessThanOrEqual(strip.x + strip.width);
      expect(btn.y).toBeGreaterThanOrEqual(strip.y);
      expect(btn.y + btn.height).toBeLessThanOrEqual(strip.y + strip.height);
    }
  });

  it('favour buttons are vertically inside the HUD strip', () => {
    const g = geom();
    for (const btn of [g.favourRepToCoinsButton, g.favourCoinsToRepButton]) {
      expect(btn.y).toBeGreaterThanOrEqual(g.hudStrip.y);
      expect(btn.y + btn.height).toBeLessThanOrEqual(g.hudStrip.y + g.hudStrip.height);
    }
  });

  it('favour buttons share the same width', () => {
    const g = geom();
    expect(g.favourRepToCoinsButton.width).toBe(g.favourCoinsToRepButton.width);
  });

  it('assertFavourButtonsAdjacent passes for the derived geometry', () => {
    const g = geom();
    expect(() => assertFavourButtonsAdjacent(g)).not.toThrow();
  });
});

// ── AC: Action cluster geometry ──────────────────────────────────

describe('Action cluster geometry', () => {
  it('End Turn button is right-aligned at gameW - 24', () => {
    const g = geom();
    expect(g.endTurnButton.x + g.endTurnButton.width).toBe(1280 - 24);
  });

  it('End Turn button y is actionY + 4', () => {
    const g = geom();
    // actionY from the adapter is handTopLeft.y + 28 = 648 at base.
    expect(g.endTurnButton.y).toBe(652);
  });

  it('Hint button is to the left of End Turn with 12px gap', () => {
    const g = geom();
    const hintRight = g.hintButton.x + g.hintButton.width;
    const endTurnLeft = g.endTurnButton.x;
    expect(endTurnLeft - hintRight).toBe(12);
  });

  it('Action counter is right-aligned above End Turn', () => {
    const g = geom();
    // The action counter is right-aligned with the End Turn button (rightX = gameW - 24).
    const rightX = g.endTurnButton.x + g.endTurnButton.width;
    expect(g.actionCounter.x + g.actionCounter.width).toBe(rightX);
    // And sits above the End Turn button.
    expect(g.actionCounter.y).toBeLessThan(g.endTurnButton.y);
  });

  it('action counter height is 16px', () => {
    const g = geom();
    expect(g.actionCounter.height).toBe(16);
  });
});

// ── AC: No duplicated strip maths ────────────────────────────────

describe('No duplicated strip maths in geometry helper', () => {
  it('does not use gameW * 0.5 for strip width', () => {
    const g = geom();
    // The strip width should be market-aligned, not half-screen.
    expect(g.hudStrip.width).toBe(920); // 940 - 20 = marketBox width
    expect(g.hudStrip.width).not.toBe(1280 * 0.5);
  });

  it('hud strip left is not gameW / 4', () => {
    const g = geom();
    expect(g.hudStrip.x).not.toBe(1280 / 4); // 320
    expect(g.hudStrip.x).toBe(20);
  });
});

// ── AC: Viewport scaling ─────────────────────────────────────────

describe('Viewport scaling', () => {
  it('computeMainStreetLayoutWithSll hardcodes 1280×720 so viewport arg is a no-op', () => {
    // The adapter is currently hardcoded to 1280×720; this test documents
    // that behaviour and asserts the viewport override is inert (a contract
    // for future refactoring, not a regression).
    const g1280 = geom(VIEWPORT);
    const g800 = geom({ width: 800, height: 600 });
    expect(g1280.marketBox.width).toBe(g800.marketBox.width);
    expect(g1280.hudStrip.width).toBe(g800.hudStrip.width);
  });
});
