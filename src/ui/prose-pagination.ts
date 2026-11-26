/**
 * prose-pagination -- page an authored prose block into a fixed display
 * budget, never silently clipping it (CG-0MWO7CVDI004J3JX).
 *
 * A narrative panel has room for a bounded number of wrapped lines. Authored
 * prose (`context`, an option's outcome, an `epilogue`) can exceed that budget,
 * and a silently cropped paragraph loses the writer's text. `paginateProse()`
 * splits the prose into display-sized **pages** on word boundaries, so a panel
 * can show the first page plus a visible "more…" affordance and reveal the
 * remainder on demand.
 *
 * The module is pure and Phaser-free: the panel decides the character budget
 * (derived from its width and line count), and this module owns only the
 * deterministic split.
 *
 * ## Guarantees
 *
 * - **Nothing is dropped.** Whitespace is normalised (runs collapse to one
 *   space, as word wrap would render them), then the pages joined by a single
 *   space reproduce the normalised text exactly.
 * - **Word boundaries.** A page boundary falls between words unless a single
 *   word is longer than the whole budget, which then gets its own (over-budget)
 *   page — never a mid-word cut.
 * - **Total.** Blank prose yields zero pages (the caller renders nothing), and
 *   a non-positive budget degrades to one character per page rather than
 *   throwing.
 *
 * @module ui/prose-pagination
 */

/** Default display budget for one prose page, in characters. */
export const DEFAULT_PROSE_PAGE_CHARS = 420;

/** One prose block split into display pages. */
export interface ProsePagination {
  /** The pages, in reading order (`[]` when the prose is blank). */
  readonly pages: readonly string[];
  /** The number of pages (`0` when the prose is blank). */
  readonly pageCount: number;
  /** True when the prose needed more than one page. */
  readonly overflow: boolean;
}

/** Collapses every whitespace run to a single space and trims the ends. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Splits authored prose into word-boundary pages of at most `maxCharsPerPage`.
 *
 * @param text            The authored prose (verbatim; layout whitespace is
 *                        normalised).
 * @param maxCharsPerPage Display budget for one page, in characters
 *                        (defaults to {@link DEFAULT_PROSE_PAGE_CHARS}).
 */
export function paginateProse(
  text: string,
  maxCharsPerPage: number = DEFAULT_PROSE_PAGE_CHARS,
): ProsePagination {
  const normalised = normalise(text);
  if (normalised.length === 0) {
    return { pages: [], pageCount: 0, overflow: false };
  }

  const budget = Math.max(1, Math.floor(maxCharsPerPage));
  const words = normalised.split(' ');
  const pages: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= budget) {
      current = `${current} ${word}`;
    } else {
      pages.push(current);
      current = word;
    }
  }
  if (current.length > 0) pages.push(current);

  return {
    pages,
    pageCount: pages.length,
    overflow: pages.length > 1,
  };
}
