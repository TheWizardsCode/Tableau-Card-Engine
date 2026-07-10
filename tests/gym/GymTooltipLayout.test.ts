import { describe, expect, it } from 'vitest';
import tooltipLayoutJson from '../../example-games/gym/layouts/gym-tooltip.layout.json';
import type { ScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import {
  parseScreenLayoutDocument,
  validateScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';
import { anchorPoint } from '../../src/ui/screen-layout';

const tooltipLayout = tooltipLayoutJson as ScreenLayoutDocument;

describe('GymTooltipScene SLL layout', () => {
  it('validates the tooltip layout against the SLL schema', () => {
    const validation = validateScreenLayoutDocument(tooltipLayout);
    expect(validation.valid).toBe(true);

    const parsed = parseScreenLayoutDocument(tooltipLayout);
    expect(parsed.valid).toBe(true);
  });

  it('maps header zone at the expected button-row position (y ≈ 60 at 1280x720)', () => {
    const headerAnchor = anchorPoint(tooltipLayout, 'header', 'center', { width: 1280, height: 720 }, 1);
    // 0.08333 * 720 ≈ 60.0
    expect(headerAnchor.x).toBeCloseTo(640, 6);
    expect(headerAnchor.y).toBeCloseTo(60, 1);
  });

  it('maps label zone at the expected mode-label position (y ≈ 100 at 1280x720)', () => {
    const labelAnchor = anchorPoint(tooltipLayout, 'label', 'center', { width: 1280, height: 720 }, 1);
    // 0.13889 * 720 ≈ 100.0
    expect(labelAnchor.x).toBeCloseTo(640, 6);
    expect(labelAnchor.y).toBeCloseTo(100, 1);
  });

  it('maps content zone at the expected demo-cards position (y ≈ 200 at 1280x720)', () => {
    const contentAnchor = anchorPoint(tooltipLayout, 'content', 'center', { width: 1280, height: 720 }, 1);
    // 0.27778 * 720 ≈ 200.0
    expect(contentAnchor.x).toBeCloseTo(640, 6);
    expect(contentAnchor.y).toBeCloseTo(200, 1);
  });

  it('maps log zone at the expected event-log position (y ≈ 380 at 1280x720)', () => {
    const logAnchor = anchorPoint(tooltipLayout, 'log', 'center', { width: 1280, height: 720 }, 1);
    // 0.52778 * 720 ≈ 380.0
    expect(logAnchor.x).toBeCloseTo(640, 6);
    expect(logAnchor.y).toBeCloseTo(380, 1);
  });

  it('maps zones at 800x600 viewport (browser test dimensions)', () => {
    const viewport = { width: 800, height: 600 };
    const headerAnchor = anchorPoint(tooltipLayout, 'header', 'center', viewport, 1);
    const labelAnchor = anchorPoint(tooltipLayout, 'label', 'center', viewport, 1);
    const contentAnchor = anchorPoint(tooltipLayout, 'content', 'center', viewport, 1);
    const logAnchor = anchorPoint(tooltipLayout, 'log', 'center', viewport, 1);

    // All anchors should maintain center x = 400 (800/2)
    expect(headerAnchor.x).toBeCloseTo(400, 6);
    expect(labelAnchor.x).toBeCloseTo(400, 6);
    expect(contentAnchor.x).toBeCloseTo(400, 6);
    expect(logAnchor.x).toBeCloseTo(400, 6);

    // Y positions should scale proportionally (tolerance 0.5 for non-integer results)
    expect(headerAnchor.y).toBeCloseTo(50, 1);   // 0.08333 * 600 ≈ 50.0
    expect(labelAnchor.y).toBeCloseTo(83.3, 0);   // 0.13889 * 600 ≈ 83.3
    expect(contentAnchor.y).toBeCloseTo(166.7, 0); // 0.27778 * 600 ≈ 166.7
    expect(logAnchor.y).toBeCloseTo(316.7, 0);     // 0.52778 * 600 ≈ 316.7
  });
});
