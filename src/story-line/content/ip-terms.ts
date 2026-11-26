/**
 * Prohibited third-party-term scanning for authored story-line content and the
 * documents that specify it.
 *
 * The narrative is an original setting; the term list
 * (`tests/fixtures/story-line/ip-prohibited-terms.json`) names the franchise
 * vocabulary that must never appear in the content, its generated artefacts or
 * the design documents that quote them. This module is the **single matcher**
 * behind all three consumers:
 *
 * | Consumer | Use |
 * |---|---|
 * | `npm run storylines:ip-scan` | a writer or reviewer runs the scan over the configured guarded set, or an ad-hoc file |
 * | `tests/gym/LongErasureContent.test.ts` | CI proves the guarded set is clean, with a positive control |
 * | `tests/story-line/content/ip-terms.test.ts` | pins the matching semantics and the allowance narrowness |
 *
 * Matching is case-insensitive and **prefix-anchored at the start of a term**,
 * matching the list's documented contract: `warp` catches `warped` and `phaser`
 * catches `phasers`. It is intentionally mechanical — it cannot catch a
 * paraphrased reference, which is why the GDD records a human read alongside
 * it.
 *
 * A term can collide with an unrelated technical word (`phaser` also names the
 * game framework this engine builds on). The term list therefore carries
 * **narrow, case-sensitive allowances**: exact technical compounds that are
 * blanked before the scan, each with a rationale. An allowance is a regular
 * expression source and is never a general exemption — the tests assert that a
 * weapon reference using the same word is still caught.
 *
 * This module is Phaser-free, game-free and dependency-free.
 *
 * @module
 */

/** One narrow, documented exception to a prohibited term. */
export interface ProhibitedTermAllowance {
  /**
   * Case-sensitive regular-expression source for the allowed occurrence.
   *
   * Kept deliberately narrow (an exact compound or a code-span form) so it
   * cannot mask an ordinary use of the same word.
   */
  readonly pattern: string;
  /** Why the occurrence is not a reference to third-party IP. */
  readonly rationale: string;
}

/** A validated prohibited-term list. */
export interface ProhibitedTermList {
  /** Prohibited terms, lower-cased and de-duplicated. */
  readonly terms: readonly string[];
  /** Narrow documented exceptions, in declaration order. */
  readonly allowedOccurrences: readonly ProhibitedTermAllowance[];
}

/** One term found in a text, with the line it first appears on. */
export interface ProhibitedTermMatch {
  /** The prohibited term (lower-cased, as listed). */
  readonly term: string;
  /** 1-based line number of the first occurrence. */
  readonly line: number;
}

/** The outcome of validating a term-list document. */
export type ProhibitedTermListParseResult =
  | { readonly ok: true; readonly list: ProhibitedTermList }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Escapes a literal string for use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True for a non-empty string after trimming. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates a parsed term-list document.
 *
 * Total: malformed input returns `ok: false` with every problem listed, so the
 * CLI can fail closed with an actionable message instead of throwing.
 *
 * @param input Parsed JSON (untrusted shape).
 * @returns The validated list, or the collected validation errors.
 */
export function parseProhibitedTermList(input: unknown): ProhibitedTermListParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['term list must be a JSON object'] };
  }
  const record = input as Record<string, unknown>;
  const errors: string[] = [];

  const rawTerms = record.terms;
  if (!Array.isArray(rawTerms)) {
    errors.push('terms must be an array of strings');
  }
  const terms: string[] = [];
  if (Array.isArray(rawTerms)) {
    for (const [index, raw] of rawTerms.entries()) {
      if (!isNonEmptyString(raw)) {
        errors.push(`terms[${index}] must be a non-empty string`);
        continue;
      }
      const term = raw.trim().toLowerCase();
      if (!terms.includes(term)) terms.push(term);
    }
    if (terms.length === 0) errors.push('terms must contain at least one term');
  }

  const rawAllowances = record.allowedOccurrences;
  const allowedOccurrences: ProhibitedTermAllowance[] = [];
  if (rawAllowances !== undefined) {
    if (!Array.isArray(rawAllowances)) {
      errors.push('allowedOccurrences must be an array when present');
    } else {
      for (const [index, raw] of rawAllowances.entries()) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          errors.push(`allowedOccurrences[${index}] must be an object`);
          continue;
        }
        const allowance = raw as Record<string, unknown>;
        const pattern = allowance.pattern;
        const rationale = allowance.rationale;
        if (!isNonEmptyString(pattern)) {
          errors.push(`allowedOccurrences[${index}].pattern must be a non-empty string`);
          continue;
        }
        if (!isNonEmptyString(rationale)) {
          errors.push(`allowedOccurrences[${index}].rationale must be a non-empty string`);
          continue;
        }
        try {
          // Compile once here so a broken pattern is a load error, not a
          // mid-scan surprise on one file.
          new RegExp(pattern, 'g');
        } catch (error) {
          errors.push(
            `allowedOccurrences[${index}].pattern is not a valid regular expression: ${(error as Error).message}`,
          );
          continue;
        }
        allowedOccurrences.push({ pattern, rationale: rationale.trim() });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, list: { terms, allowedOccurrences } };
}

/**
 * Blanks every allowed occurrence, preserving newlines so line numbers survive.
 *
 * Matching is case-sensitive by design: the allowance names an exact technical
 * compound, not every use of its constituent word.
 */
function maskAllowedOccurrences(text: string, list: ProhibitedTermList): string {
  return list.allowedOccurrences.reduce((current, allowance) => {
    const pattern = new RegExp(allowance.pattern, 'g');
    return current.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
  }, text);
}

/**
 * Scans a text for prohibited terms.
 *
 * Returns one match per term (its first occurrence), ordered by line and then
 * term, so a report is stable across runs. A term with several occurrences on
 * the same line is reported once; the reviewer fixes the file and re-runs.
 *
 * @param text The text to scan.
 * @param list A validated term list ({@link parseProhibitedTermList}).
 * @returns The matches, empty when the text is clean.
 */
export function scanProhibitedTerms(
  text: string,
  list: ProhibitedTermList,
): ProhibitedTermMatch[] {
  const haystack = maskAllowedOccurrences(text, list).toLowerCase();
  const matches: ProhibitedTermMatch[] = [];

  // Longest-first so a term that is a prefix of another reports the more
  // specific term; alphabetical as the deterministic tie-break.
  const terms = [...list.terms].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );

  for (const term of terms) {
    const match = new RegExp(`(^|[^a-z])${escapeRegExp(term)}`).exec(haystack);
    if (match === null) continue;
    const termStart = match.index + (match[1]?.length ?? 0);
    const line = haystack.slice(0, termStart).split('\n').length;
    matches.push({ term, line });
  }

  return matches.sort((a, b) => a.line - b.line || a.term.localeCompare(b.term));
}
