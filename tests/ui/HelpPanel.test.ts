/**
 * Unit tests for the UI module -- tests that can run in Node
 * without Phaser (no DOM/window dependency).
 *
 * Tests the help-content.json structure and validity.
 * Phaser-dependent tests (HelpPanel rendering, HelpButton) live
 * in HelpPanel.browser.test.ts.
 */

import { describe, it, expect } from 'vitest';
import helpContent from '../../example-games/golf/help-content.json';

describe('Golf help-content.json', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(helpContent)).toBe(true);
    expect(helpContent.length).toBeGreaterThan(0);
  });

  it('should contain objects with heading and body string fields', () => {
    for (const section of helpContent) {
      expect(typeof section.heading).toBe('string');
      expect(typeof section.body).toBe('string');
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  it('should include key sections: rules overview, turn flow, scoring', () => {
    const headings = helpContent.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes('golf'))).toBe(true);
    expect(headings.some((h) => h.includes('turn'))).toBe(true);
    expect(headings.some((h) => h.includes('scor'))).toBe(true);
  });

  it('should have accurate scoring info in the scoring section', () => {
    const scoringSection = helpContent.find((s) =>
      s.heading.toLowerCase().includes('scor'),
    );
    expect(scoringSection).toBeDefined();
    const body = scoringSection!.body;
    // Key scoring rules from GolfScoring.ts
    expect(body).toContain('A = 1');
    expect(body).toContain('2 = -2');
    expect(body).toContain('K = 0');
    expect(body).toContain('J, Q = 10');
  });

  it('should mention the column bonus rule', () => {
    const scoringSection = helpContent.find((s) =>
      s.heading.toLowerCase().includes('scor'),
    );
    expect(scoringSection).toBeDefined();
    expect(scoringSection!.body.toLowerCase()).toContain('column');
    expect(scoringSection!.body).toContain('0 points');
  });

  it('should document the ? keyboard shortcut', () => {
    const allBodies = helpContent.map((s) => s.body).join(' ');
    expect(allBodies).toContain('?');
  });
});
