/**
 * Action counter geometry tests (CG-0MUFAITX70081W41).
 *
 * The actions-remaining counter moves out of the HUD strip and into the action
 * cluster, right-aligned above the End Turn button.
 *
 * @module tests/main-street/action-counter
 */
import { describe, expect, it } from 'vitest';

import { computeMainStreetLayoutWithSll } from '../../example-games/main-street/scenes/MainStreetLayoutAdapter';
import { computeMainStreetLayoutGeometry } from './helpers/mainStreetLayoutGeometry';

describe('action counter geometry (CG-0MUFAITX70081W41)', () => {
  it('shares the End Turn button right edge (right-aligned)', () => {
    const g = computeMainStreetLayoutGeometry();
    expect(g.actionCounter.x + g.actionCounter.width).toBe(
      g.endTurnButton.x + g.endTurnButton.width,
    );
  });

  it('sits above the End Turn button top edge', () => {
    const g = computeMainStreetLayoutGeometry();
    expect(g.actionCounter.y + g.actionCounter.height).toBeLessThan(g.endTurnButton.y);
  });

  it('does not overlap the End Turn button vertically', () => {
    const g = computeMainStreetLayoutGeometry();
    const counterBottom = g.actionCounter.y + g.actionCounter.height;
    expect(counterBottom).toBeLessThanOrEqual(g.endTurnButton.y);
  });

  it('is not inside the HUD strip bounds', () => {
    const layout = computeMainStreetLayoutWithSll();
    const g = computeMainStreetLayoutGeometry();
    // The 28px strip is centred on hudY, so its bottom edge is hudY + 14.
    const stripBottom = layout.hudY + 14;
    expect(g.actionCounter.y).toBeGreaterThan(stripBottom);
  });
});
