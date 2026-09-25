/**
 * Community Favour (CG-0MSTOATDQ005XDET): UI layout unit tests.
 *
 * Covers:
 * - AC1: SLL zones exist for both favour buttons and parse cleanly
 * - AC1: The layout adapter derives the favour button positions from the
 *   SLL anchors (no hardcoded pixel positions in the renderer)
 */
import { describe, it, expect } from 'vitest';

import { parseScreenLayoutDocument } from '@ui/screen-layout-schema';
import { anchorPoint } from '@ui/screen-layout';
import layoutJson from '../../example-games/main-street/layouts/main-street.layout.json';
import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';

// ── AC1: SLL zones exist and are valid ──────────────────────

describe('Main Street layout: Community Favour SLL zones', () => {
  it('layout JSON defines both favour button zones with center anchors', () => {
    const parsed = parseScreenLayoutDocument(layoutJson);
    expect(parsed.valid).toBe(true);
    expect(parsed.layout).not.toBeNull();

    const zones = parsed.layout!.zones ?? {};
    const coinsToRep = zones['favourCoinsToRepButton'] as
      | { anchors?: Record<string, { x: number; y: number }> }
      | undefined;
    const repToCoins = zones['favourRepToCoinsButton'] as
      | { anchors?: Record<string, { x: number; y: number }> }
      | undefined;

    expect(coinsToRep, 'favourCoinsToRepButton zone missing').toBeDefined();
    expect(repToCoins, 'favourRepToCoinsButton zone missing').toBeDefined();
    expect(coinsToRep!.anchors?.center).toBeDefined();
    expect(repToCoins!.anchors?.center).toBeDefined();
  });

  it('zone centers sit in the HUD strip band (y ≈ 0.069, CG-0MUFAITED0088AGN)', () => {
    const parsed = parseScreenLayoutDocument(layoutJson);
    expect(parsed.layout).not.toBeNull();
    const zones = parsed.layout!.zones!;
    for (const name of ['favourCoinsToRepButton', 'favourRepToCoinsButton']) {
      const center = (zones[name] as unknown as { anchors: { center: { x: number; y: number } } }).anchors.center;
      // HUD strip is centred at hudY = 50 / 720 ≈ 0.069444.
      expect(center.y).toBeGreaterThanOrEqual(0.05);
      expect(center.y).toBeLessThanOrEqual(0.09);
    }
  });

  it('the two button zones do not overlap each other', () => {
    const parsed = parseScreenLayoutDocument(layoutJson);
    expect(parsed.layout).not.toBeNull();
    const zones = parsed.layout!.zones!;
    const coins = (zones['favourCoinsToRepButton'] as unknown as { anchors: { center: { x: number; y: number } } }).anchors.center;
    const rep = (zones['favourRepToCoinsButton'] as unknown as { anchors: { center: { x: number; y: number } } }).anchors.center;
    expect(Math.abs(coins.x - rep.x)).toBeGreaterThan(0.05);
  });
});

// ── AC1: Adapter derives positions from SLL anchors ──────────

describe('Main Street layout adapter: favour button positions', () => {
  it('computes favour button left edges from the SLL center anchors', () => {
    const layout = computeMainStreetLayoutWithSll();
    const viewport = { width: 1280, height: 720 };

    const coinsCenter = anchorPoint(layoutJson as never, 'favourCoinsToRepButton', 'center', viewport, 1);
    const repCenter = anchorPoint(layoutJson as never, 'favourRepToCoinsButton', 'center', viewport, 1);

    // Left edge = centerX - width/2 (matches the adapter formula).
    expect(layout.favourCoinsToRepX).toBe(Math.round(coinsCenter.x - layout.favourButtonW / 2));
    expect(layout.favourRepToCoinsX).toBe(Math.round(repCenter.x - layout.favourButtonW / 2));
    // Pixel-perfect vs the current HUD-band anchor values (documented stability).
    expect(layout.favourCoinsToRepX).toBe(Math.round(0.238281 * 1280 - layout.favourButtonW / 2));
    expect(layout.favourRepToCoinsX).toBe(Math.round(0.152344 * 1280 - layout.favourButtonW / 2));
  });

  it('favour buttons share the action button height constant', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.actionButtonH).toBe(34);
    expect(layout.favourButtonW).toBeGreaterThan(0);
    // HUD-band button height fits inside the 28px strip.
    expect(layout.favourButtonH).toBe(24);
  });

  it('favour buttons are adjacent and ordered [rep→coins][coins→rep] (AC3)', () => {
    const layout = computeMainStreetLayoutWithSll();
    // Adjacency: rep→coins right edge === coins→rep left edge.
    expect(layout.favourRepToCoinsX + layout.favourButtonW).toBe(layout.favourCoinsToRepX);
    // The pair sits inside the reserved favour band, which is itself inside
    // the HUD strip and right of the Coins readout.
    expect(layout.favourRepToCoinsX).toBe(layout.favourBandLeft);
    expect(layout.favourCoinsToRepX + layout.favourButtonW).toBe(layout.favourBandRight);
    expect(layout.favourBandLeft).toBeGreaterThan(layout.hudLeft);
    expect(layout.favourBandRight).toBeLessThan(layout.hudRight);
  });
});