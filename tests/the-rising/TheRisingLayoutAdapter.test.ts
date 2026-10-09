/**
 * Unit tests for the The Rising SLL layout adapter (F4, AC1/AC2).
 *
 * These are pure tests: the layout engine and schema modules are Phaser-free,
 * so the adapter can be exercised in Node. They assert observable behaviour of
 * the public API — resolution of the shipped layout, fail-fast parsing and
 * sensible viewport-relative fallbacks — rather than re-implementing the SLL
 * maths.
 */
import { describe, expect, it } from 'vitest';
import {
  THE_RISING_LAYOUT,
  THE_RISING_VIEWPORT,
  createTheRisingLayout,
  parseTheRisingLayout,
  resolveHudAnchor,
  resolveHandAnchor,
  resolveSpiritRowAnchor,
  resolveTimelineAnchor,
  resolveAnchor,
  resolveZoneBounds,
} from '../../src/scenes/TheRisingLayoutAdapter';

const VIEWPORT = { width: 1280, height: 720 };

describe('TheRisingLayoutAdapter', () => {
  it('parses the shipped layout document', () => {
    expect(THE_RISING_LAYOUT.id).toBe('the-rising');
    expect(Object.keys(THE_RISING_LAYOUT.zones)).toContain('hud');
    expect(Object.keys(THE_RISING_LAYOUT.zones)).toContain('spiritRow');
    expect(Object.keys(THE_RISING_LAYOUT.zones)).toContain('timeline');
    expect(Object.keys(THE_RISING_LAYOUT.zones)).toContain('hand');
    expect(Object.keys(THE_RISING_LAYOUT.zones)).toContain('conversationOverlay');
  });

  it('throws at parse time for an invalid layout document', () => {
    expect(() => parseTheRisingLayout({ version: 1, id: 'broken' })).toThrow(
      /Invalid The Rising SLL layout/,
    );
  });

  it('resolves the HUD anchors in viewport pixels', () => {
    const memory = resolveHudAnchor('memory', VIEWPORT);
    const clock = resolveHudAnchor('clock', VIEWPORT);

    // The layout places Memory at x=0.16 and the clock at the horizontal centre.
    expect(memory.x).toBeCloseTo(0.16 * 1280, 5);
    expect(clock.x).toBeCloseTo(0.5 * 1280, 5);
    expect(clock.x).toBeGreaterThan(memory.x);
  });

  it('resolves the band anchors with left < center < right', () => {
    for (const resolve of [resolveSpiritRowAnchor, resolveTimelineAnchor, resolveHandAnchor]) {
      const left = resolve('left', VIEWPORT);
      const center = resolve('center', VIEWPORT);
      const right = resolve('right', VIEWPORT);
      expect(left.x).toBeLessThan(center.x);
      expect(center.x).toBeLessThan(right.x);
    }
  });

  it('falls back to a viewport-relative point for an unknown zone', () => {
    const anchor = resolveAnchor('does-not-exist', 'center', VIEWPORT);
    expect(anchor.x).toBe(VIEWPORT.width / 2);
    expect(anchor.y).toBe(VIEWPORT.height / 2);
  });

  it('falls back to a full-width band for an unknown zone', () => {
    const bounds = resolveZoneBounds('does-not-exist', VIEWPORT);
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(VIEWPORT.width);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('builds a composite layout whose bands are ordered and bounded', () => {
    const layout = createTheRisingLayout(THE_RISING_LAYOUT, VIEWPORT);

    expect(layout.viewport).toEqual({ width: 1280, height: 720 });

    for (const band of [layout.spiritRow, layout.timeline, layout.hand]) {
      expect(band.left.x).toBeLessThan(band.center.x);
      expect(band.center.x).toBeLessThan(band.right.x);
      expect(band.maxWidth).toBeGreaterThan(0);
      expect(band.maxWidth).toBeLessThanOrEqual(VIEWPORT.width);
    }

    // The Spirit Row sits above the timeline, which sits above the hand.
    expect(layout.spiritRow.center.y).toBeLessThan(layout.timeline.center.y);
    expect(layout.timeline.center.y).toBeLessThan(layout.hand.center.y);
  });

  it('honours a custom viewport when resolving the composite layout', () => {
    const wide = { width: 1920, height: 1080 };
    const layout = createTheRisingLayout(THE_RISING_LAYOUT, wide);
    expect(layout.viewport).toEqual(wide);
    // The clock anchor tracks the viewport centre.
    expect(layout.hud.clock.x).toBeCloseTo(wide.width / 2, 5);
    // The shipped canonical viewport is exported unchanged for callers.
    expect(THE_RISING_VIEWPORT).toEqual({ width: 1280, height: 720 });
  });
});
