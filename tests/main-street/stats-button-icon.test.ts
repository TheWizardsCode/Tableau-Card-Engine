/**
 * Unit tests for the StatsButton SVG icon asset.
 *
 * Verifies:
 * - The ms-icon-stats.svg asset exists and follows the 16x16 icon pattern.
 * - The MainStreetLifecycleManager preload includes the stats icon.
 * - The StatsButton class references the ms-icon-stats texture key.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// ── Asset existence & format ───────────────────────────────

describe('Stats icon SVG asset', () => {
  const svgPath = path.resolve(
    'public/assets/games/main-street/svg/icons/ms-icon-stats.svg',
  );

  it('exists at the expected path', () => {
    expect(fs.existsSync(svgPath)).toBe(true);
  });

  it('is a valid 16x16 SVG', () => {
    const content = fs.readFileSync(svgPath, 'utf8');
    expect(content).toMatch(/<svg/);
    expect(content).toMatch(/width="16"/);
    expect(content).toMatch(/height="16"/);
    expect(content).toMatch(/viewBox="0 0 16 16"/);
  });

  it('has a descriptive title and aria-label', () => {
    const content = fs.readFileSync(svgPath, 'utf8');
    expect(content).toMatch(/<title>/);
    expect(content).toMatch(/aria-label="Stats icon"/);
  });

  it('follows the existing icon visual pattern (colored background + white foreground)', () => {
    const content = fs.readFileSync(svgPath, 'utf8');
    // Must have a colored background shape (not just white)
    const hasColoredFill = /fill="(?:#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3})"/.test(content);
    expect(hasColoredFill).toBe(true);
    // Must have at least one white/semi-transparent foreground element
    expect(content).toMatch(/fill="#fff"\s+opacity="0\.\d"/);
    // Should have bar-like rect elements in the foreground
    const barCount = (content.match(/<rect/g) || []).length;
    expect(barCount).toBeGreaterThanOrEqual(3);
  });
});

// ── Preload integration ────────────────────────────────────

describe('Stats texture preload integration', () => {
  const lifeCyclePath = 'example-games/main-street/scenes/MainStreetLifecycleManager.ts';

  it('includes "stats" in the preloaded icons list', () => {
    const content = fs.readFileSync(lifeCyclePath, 'utf8');
    expect(content).toMatch(/'stats'/);
  });

  it('loads ms-icon-stats via template interpolation', () => {
    const content = fs.readFileSync(lifeCyclePath, 'utf8');
    // The preload loop uses: s.load.image(`ms-icon-${k}`, ...)
    // Since 'stats' is in the icons array, ms-icon-stats gets loaded.
    expect(content).toMatch(/load\.image\(`ms-icon-/);
  });
});

// ── StatsButton class integration ──────────────────────────

describe('StatsButton icon reference', () => {
  const statsOverlayPath = 'example-games/main-street/scenes/StatsOverlay.ts';

  it('references ms-icon-stats texture key', () => {
    const content = fs.readFileSync(statsOverlayPath, 'utf8');
    expect(content).toMatch(/ms-icon-stats/);
  });

  it('replaces the Greek Sigma Σ text with an icon', () => {
    const content = fs.readFileSync(statsOverlayPath, 'utf8');
    // The old Σ character should no longer be the primary label text
    // It may still appear as a fallback in code comments
    expect(content).not.toMatch(/'\u03A3'/);
  });

  it('provides a fallback text label when the texture is unavailable', () => {
    const content = fs.readFileSync(statsOverlayPath, 'utf8');
    // The class should have fallback logic to show text when texture is missing
    expect(content).toMatch(/\u03A3/);
    expect(content).toMatch(/fallback/i);
  });
});
