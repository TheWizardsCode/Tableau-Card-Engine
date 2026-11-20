/**
 * Unit tests for the shared prose paginator
 * (`src/ui/prose-pagination.ts`, CG-0MWO7CVDI004J3JX).
 *
 * The contract under test is AC5: over-long prose is never silently clipped.
 * A panel that pages must keep every character, split on word boundaries and
 * degrade totally on blank prose / a nonsensical budget.
 *
 * @module tests/ui/prose-pagination.test.ts
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROSE_PAGE_CHARS,
  paginateProse,
} from '../../src/ui/prose-pagination';

/** Words from `count` to `count + n` so page contents are recognisable. */
function words(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `w${index}`);
}

describe('paginateProse', () => {
  it('keeps prose within the budget on a single page', () => {
    const result = paginateProse('You log it, and the charts go blank with it.', 120);
    expect(result.pages).toEqual(['You log it, and the charts go blank with it.']);
    expect(result.pageCount).toBe(1);
    expect(result.overflow).toBe(false);
  });

  it('pages over-budget prose instead of clipping it', () => {
    const prose = words(200).join(' ');
    const result = paginateProse(prose, 60);

    expect(result.overflow).toBe(true);
    expect(result.pageCount).toBeGreaterThan(1);
    for (const page of result.pages) {
      expect(page.length).toBeLessThanOrEqual(60);
    }
    // Nothing is dropped: the pages re-join into the original prose.
    expect(result.pages.join(' ')).toBe(prose);
  });

  it('never cuts a word in half', () => {
    const prose = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet';
    const result = paginateProse(prose, 22);

    expect(result.pages.length).toBeGreaterThan(1);
    const originalWords = prose.split(' ');
    for (const page of result.pages) {
      for (const word of page.split(' ')) {
        expect(originalWords).toContain(word);
      }
    }
    expect(result.pages.join(' ')).toBe(prose);
  });

  it('gives a single over-long word its own page rather than splitting it', () => {
    const long = 'x'.repeat(120);
    const result = paginateProse(`before ${long} after`, 40);

    expect(result.pages).toContain(long);
    expect(result.pages.join(' ')).toBe(`before ${long} after`);
  });

  it('normalises layout whitespace the way word wrap renders it', () => {
    const result = paginateProse('  The hatch seals\n\n  behind you,\tthe reading stops.  ', 200);
    expect(result.pages).toEqual(['The hatch seals behind you, the reading stops.']);
  });

  it('returns zero pages for blank prose', () => {
    for (const blank of ['', '   ', '\n\t ']) {
      const result = paginateProse(blank, 100);
      expect(result.pages).toEqual([]);
      expect(result.pageCount).toBe(0);
      expect(result.overflow).toBe(false);
    }
  });

  it('degrades to at least one character per page for a nonsensical budget', () => {
    const result = paginateProse('ab cd', 0);
    // A word longer than the budget keeps its own page (never split mid-word).
    expect(result.pages).toEqual(['ab', 'cd']);
    expect(result.pages.join(' ')).toBe('ab cd');
  });

  it('defaults to the documented page budget', () => {
    const prose = 'word '.repeat(200).trim();
    const result = paginateProse(prose);
    expect(result.overflow).toBe(true);
    for (const page of result.pages) {
      expect(page.length).toBeLessThanOrEqual(DEFAULT_PROSE_PAGE_CHARS);
    }
    expect(result.pages.join(' ')).toBe(prose);
  });
});
