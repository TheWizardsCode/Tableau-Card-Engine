/**
 * GymLongErasureLayout -- SLL pinning for the Long Erasure scene.
 *
 * The scene resolves every chrome position through `anchorPoint()` against
 * `layouts/gym-long-erasure.layout.json`; this suite pins the layout's shape,
 * schema validity and anchor geometry so a moved anchor is a deliberate,
 * reviewable change rather than a silent drift.
 *
 * @module tests/gym/GymLongErasureLayout.test.ts
 */
import { describe, expect, it } from 'vitest';

import { anchorPoint } from '../../src/ui/screen-layout';
import {
  parseScreenLayoutDocument,
  validateScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';
import longErasureLayoutJson from '../../example-games/gym/layouts/gym-long-erasure.layout.json';

/** The layout's base viewport (the Gym's design resolution). */
const VIEWPORT = { width: 1280, height: 720 };

/**
 * The option column anchor names the scene renders into.
 *
 * Declared here (rather than imported from the scene) so this stays a
 * Phaser-free unit test; the scene exports the same list and the scene's
 * browser suite pins that export.
 */
const OPTION_ANCHORS = ['option1', 'option2', 'option3', 'option4'] as const;

/** Zones the scene addresses by name. */
const ZONES = [
  'statusBar',
  'narrative',
  'options',
  'feedback',
  'journal',
  'controls',
] as const;

/**
 * The narrative panel's visible budget, mirroring the scene's panel text
 * style: three wrapped lines of 14 px text with 4 px line spacing.
 *
 * Declared here (rather than imported from the scene) so this stays a
 * Phaser-free unit test; the panel must fit its SLL window without ever
 * reaching the `[ more… ]` control or the option column.
 */
const PANEL_LINES = 3;
const PANEL_LINE_HEIGHT = 22;

describe('GymLongErasureScene SLL layout', () => {
  it('validates against the SLL schema', () => {
    const validation = validateScreenLayoutDocument(longErasureLayoutJson);
    expect(validation.valid).toBe(true);

    const parsed = parseScreenLayoutDocument(longErasureLayoutJson);
    expect(parsed.valid).toBe(true);
  });

  it('declares every zone the scene resolves', () => {
    const parsed = parseScreenLayoutDocument(longErasureLayoutJson);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    expect(parsed.layout.requiredZones).toEqual([...ZONES]);
    for (const zone of ZONES) {
      expect(parsed.layout.zones[zone]).toBeDefined();
    }
  });

  it('provides the option column anchors the scene renders into', () => {
    const parsed = parseScreenLayoutDocument(longErasureLayoutJson);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const anchors = parsed.layout.zones.options.anchors ?? {};
    for (const name of OPTION_ANCHORS) {
      expect(anchors[name]).toBeDefined();
    }
  });

  it('lays the option anchors out as a descending column inside the viewport', () => {
    const parsed = parseScreenLayoutDocument(longErasureLayoutJson);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const points = OPTION_ANCHORS.map((name) =>
      anchorPoint(parsed.layout, 'options', name, VIEWPORT, 1),
    );

    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].y).toBeGreaterThan(points[i - 1].y);
      expect(points[i].x).toBe(points[0].x);
    }
    for (const point of points) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(VIEWPORT.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(VIEWPORT.height);
    }
  });

  it('positions the narrative panel between the effect line and the options', () => {
    const parsed = parseScreenLayoutDocument(longErasureLayoutJson);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const effect = anchorPoint(parsed.layout, 'narrative', 'effect', VIEWPORT, 1);
    const context = anchorPoint(parsed.layout, 'narrative', 'context', VIEWPORT, 1);
    const more = anchorPoint(parsed.layout, 'narrative', 'contextMore', VIEWPORT, 1);
    const firstOption = anchorPoint(parsed.layout, 'options', 'option1', VIEWPORT, 1);

    // The panel hangs below the beat's effect line and above its continuation
    // control, which in turn sits above the option column: prose and options
    // cannot collide at the design resolution.
    expect(context.y).toBeGreaterThan(effect.y);
    expect(context.y + PANEL_LINES * PANEL_LINE_HEIGHT).toBeLessThan(more.y);
    expect(more.y).toBeLessThan(firstOption.y);
    expect(context.x).toBeCloseTo(VIEWPORT.width / 2, 6);
  });

  it('resolves the status bar, journal and controls anchors at 1280x720', () => {
    const parsed = parseScreenLayoutDocument(longErasureLayoutJson);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const act = anchorPoint(parsed.layout, 'statusBar', 'act', VIEWPORT, 1);
    const resources = anchorPoint(parsed.layout, 'statusBar', 'resources', VIEWPORT, 1);
    const heading = anchorPoint(parsed.layout, 'journal', 'heading', VIEWPORT, 1);
    const restart = anchorPoint(parsed.layout, 'controls', 'center', VIEWPORT, 1);

    // Act sits left of the resource summary (which is right-aligned).
    expect(act.x).toBeLessThan(resources.x);
    expect(act.y).toBeCloseTo(resources.y, 6);

    // The journal sits below the beat narrative and above the controls.
    expect(heading.y).toBeGreaterThan(act.y);
    expect(restart.y).toBeGreaterThan(heading.y);
    expect(restart.x).toBeCloseTo(VIEWPORT.width / 2, 6);
  });
});
