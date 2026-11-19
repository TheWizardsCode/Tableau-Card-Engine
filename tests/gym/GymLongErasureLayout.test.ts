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
