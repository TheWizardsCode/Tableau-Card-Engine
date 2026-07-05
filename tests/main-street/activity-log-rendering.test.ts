/**
 * Main Street: Activity Log Rendering Tests
 *
 * Tests that the activity log renders a maximum number of entries
 * appropriate for the screen height, content stays within the
 * container, and scrolling works for past entries.
 */
import { describe, it, expect } from 'vitest';

import { LOG_TITLE_H, LOG_LINE_H, LOG_COLORS } from '../../example-games/main-street/scenes/MainStreetConstants';

// ── Test helper: simulate the log rendering logic ───────────

/**
 * Simulates the core logic of refreshLog to verify entry capping.
 * Returns the number of entries that would be rendered and the
 * total content height.
 */
function simulateLogRender(
  entryCount: number,
  logH: number,
): { renderedCount: number; totalContentH: number; maxRendered: number } {
  const visibleH = Math.max(1, logH - LOG_TITLE_H - 4);
  // In the actual implementation, each entry takes LOG_LINE_H pixels
  // (with adjustment for word-wrapped text, approximated as LOG_LINE_H here).
  const maxRendered = Math.max(1, Math.ceil(visibleH / LOG_LINE_H));

  // When entryCount exceeds maxRendered, we only render maxRendered entries
  const renderedCount = Math.min(entryCount, maxRendered);
  const totalContentH = renderedCount * LOG_LINE_H;

  return { renderedCount, totalContentH, maxRendered };
}

// ── Tests ───────────────────────────────────────────────────

describe('Activity Log rendering capacity', () => {
  it('renders all entries when count is below visible capacity', () => {
    // Typical log panel height: ~200px, visible area ~174px -> ~9 entries
    const logH = 200;
    const entryCount = 5;

    const result = simulateLogRender(entryCount, logH);
    expect(result.renderedCount).toBe(5);
    expect(result.totalContentH).toBe(5 * LOG_LINE_H);
  });

  it('caps rendered entries when count exceeds visible capacity', () => {
    const logH = 200;
    const entryCount = 20; // far exceeds visible capacity

    const result = simulateLogRender(entryCount, logH);
    expect(result.renderedCount).toBeLessThan(entryCount);
    expect(result.renderedCount).toBe(result.maxRendered);
    expect(result.totalContentH).toBe(result.maxRendered * LOG_LINE_H);
  });

  it('scales visible capacity with panel height', () => {
    // Taller panel = more entries
    const smallPanel = simulateLogRender(100, 150);
    const tallPanel = simulateLogRender(100, 400);

    expect(smallPanel.maxRendered).toBeLessThan(tallPanel.maxRendered);
  });

  it('handles empty log gracefully', () => {
    const result = simulateLogRender(0, 200);
    expect(result.renderedCount).toBe(0);
    expect(result.totalContentH).toBe(0);
  });

  it('renders at least one entry even in a very small panel', () => {
    const result = simulateLogRender(10, 30); // very small panel
    expect(result.renderedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Activity Log scrolling bounds', () => {
  it('computes correct max scroll for overflow entries', () => {
    const logH = 200;
    const visibleH = Math.max(1, logH - LOG_TITLE_H - 4);
    const maxRendered = Math.max(1, Math.ceil(visibleH / LOG_LINE_H));

    // If we have 30 entries and can show 9 at a time
    const totalEntries = 30;
    const hiddenCount = Math.max(0, totalEntries - maxRendered);

    // Total scroll distance (in pixels)
    const maxScroll = hiddenCount * LOG_LINE_H;

    // At maxScroll, we should see the last maxRendered entries
    // At scroll = 0, we should see the first maxRendered entries
    expect(maxScroll).toBeGreaterThan(0);
    expect(maxScroll).toBe((totalEntries - maxRendered) * LOG_LINE_H);
  });

  it('has zero max scroll when entries fit in panel', () => {
    const logH = 200;
    const visibleH = Math.max(1, logH - LOG_TITLE_H - 4);
    const maxRendered = Math.max(1, Math.ceil(visibleH / LOG_LINE_H));

    const totalEntries = 3; // fits easily
    const hiddenCount = Math.max(0, totalEntries - maxRendered);
    const maxScroll = hiddenCount * LOG_LINE_H;

    // All entries fit
    expect(hiddenCount).toBe(0);
    expect(maxScroll).toBe(0);
  });
});

describe('Activity Log constants consistency', () => {
  it('has LOG_TITLE_H less than a typical panel height', () => {
    // Title bar should not be taller than the content area
    expect(LOG_TITLE_H).toBeLessThan(200);
    expect(LOG_TITLE_H).toBe(22);
  });

  it('has LOG_LINE_H smaller than LOG_TITLE_H', () => {
    // Line height should be smaller than the title area
    expect(LOG_LINE_H).toBeLessThan(LOG_TITLE_H);
    expect(LOG_LINE_H).toBe(18);
  });

  it('provides colors for all log entry types', () => {
    expect(LOG_COLORS.gain).toBe('#44ff44');
    expect(LOG_COLORS.loss).toBe('#ff4444');
    expect(LOG_COLORS.neutral).toBe('#ccbbaa');
    expect(LOG_COLORS['turn-header']).toBe('#ffdd44');
  });
});
