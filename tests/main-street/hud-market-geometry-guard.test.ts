/**
 * Guard: HUD/market geometry single source of truth (CG-0MUFAIS8W0011LGQ).
 *
 * The market renderer must read the market-box edges from `SceneLayout`
 * (`marketLeft` / `marketRight`) rather than recomputing `20` / `logX - 20`
 * inline. This guards against a future edit silently re-introducing the
 * duplicated maths that the SLL geometry contract exists to remove.
 *
 * The primary assertions are behavioural (the adapter exposes aligned edges);
 * the static guard is a narrow, explicitly-required AC check that no inline
 * edge literal survives in the market renderer.
 *
 * @module tests/main-street/hud-market-geometry-guard
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import { computeMainStreetLayoutGeometry } from './helpers/mainStreetLayoutGeometry';

const MARKET_RENDERER_PATH = resolve(
  __dirname,
  '../../example-games/main-street/scenes/MainStreetRendererMarket.ts',
);

describe('geometry single source of truth', () => {
  it('adapter exposes market and HUD edges that agree', () => {
    const layout = computeMainStreetLayoutWithSll();
    expect(layout.hudLeft).toBe(layout.marketLeft);
    expect(layout.hudRight).toBe(layout.marketRight);
    expect(layout.hudWidth).toBe(layout.marketRight - layout.marketLeft);
  });

  it('test harness derives the same edges from the layout authority', () => {
    const layout = computeMainStreetLayoutWithSll();
    const geometry = computeMainStreetLayoutGeometry();
    expect(geometry.marketBox.x).toBe(layout.marketLeft);
    expect(geometry.marketBox.x + geometry.marketBox.width).toBe(layout.marketRight);
    expect(geometry.hudStrip.x).toBe(layout.hudLeft);
    expect(geometry.hudStrip.width).toBe(layout.hudWidth);
  });

  it('market renderer contains no inline duplicated market-edge literals', () => {
    const source = readFileSync(MARKET_RENDERER_PATH, 'utf8');
    // Forbid the legacy inline computations this item eliminated.
    expect(source).not.toMatch(/bgLeft\s*=\s*20\b/);
    expect(source).not.toMatch(/bgRight\s*=\s*logX\s*-\s*20/);
    expect(source).not.toMatch(/boxCenter\s*=\s*\(\s*20\s*\+\s*logX\s*-\s*20\s*\)/);
    // The market renderer should read the layout fields instead.
    expect(source).toMatch(/marketLeft/);
    expect(source).toMatch(/marketRight/);
  });
});
