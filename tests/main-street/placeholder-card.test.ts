import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

describe('Main Street placeholder SVG', () => {
  it('exists and has correct canonical dimensions (140x80)', () => {
    const p = join('public', 'assets', 'games', 'main-street', 'svg', 'placeholder-card.svg');
    const src = readFileSync(p, 'utf8');

    // Look for width/height attributes or viewBox
    const widthMatch = src.match(/<svg[^>]*width="(\d+)"/);
    const heightMatch = src.match(/<svg[^>]*height="(\d+)"/);
    const viewBoxMatch = src.match(/<svg[^>]*viewBox="([^"]+)"/);

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/\s+/).map(Number);
      expect(parts.length).toBe(4);
      expect(parts[2]).toBeGreaterThan(0);
      expect(parts[3]).toBeGreaterThan(0);
      // prefer width/height check
    }

    expect(widthMatch).not.toBeNull();
    expect(heightMatch).not.toBeNull();

    const w = Number(widthMatch![1]);
    const h = Number(heightMatch![1]);
    expect(w).toBe(140);
    expect(h).toBe(80);
  });
});
