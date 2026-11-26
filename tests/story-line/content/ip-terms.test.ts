/**
 * Prohibited-term scanner semantics (`src/story-line/content/ip-terms.ts`).
 *
 * The scanner is the single matcher behind the CLI and the CI guard, so its
 * contract is pinned here: the documented prefix-anchored, case-insensitive
 * match, the line numbers a reviewer acts on, and — most importantly — that a
 * documentation allowance cannot hide a narrative use of the same word.
 *
 * The fixture is the shipped list (`tests/fixtures/story-line/ip-prohibited-terms.json`),
 * so these tests fail if the list or its allowance contract drifts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseProhibitedTermList,
  scanProhibitedTerms,
  type ProhibitedTermList,
} from '../../../src/story-line/content/ip-terms';
import { FIXTURES_DIR } from '../content/test-support';

/** The shipped term list, as parsed JSON (untrusted shape, as the CLI sees it). */
const SHIPPED = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'ip-prohibited-terms.json'), 'utf-8'),
) as unknown;

/** The shipped list, validated. */
function shippedList(): ProhibitedTermList {
  const parsed = parseProhibitedTermList(SHIPPED);
  if (!parsed.ok) throw new Error(`shipped term list is invalid: ${parsed.errors.join('; ')}`);
  return parsed.list;
}

/** A minimal list for a focused case. */
function listOf(terms: string[], allowedOccurrences: ProhibitedTermList['allowedOccurrences'] = []): ProhibitedTermList {
  return { terms, allowedOccurrences };
}

describe('parseProhibitedTermList', () => {
  it('accepts the shipped list and normalises its terms', () => {
    const list = shippedList();
    expect(list.terms.length).toBeGreaterThan(20);
    expect(list.terms).toContain('star trek');
    expect(list.terms).toContain('phaser');
    expect(list.allowedOccurrences.length).toBe(1);
    expect(list.allowedOccurrences[0]?.rationale).toContain('framework');
    // Lower-cased and de-duplicated.
    expect(list.terms.every((term) => term === term.toLowerCase())).toBe(true);
    expect(new Set(list.terms).size).toBe(list.terms.length);
  });

  it('reports every malformed field instead of throwing', () => {
    expect(parseProhibitedTermList(null)).toEqual({
      ok: false,
      errors: ['term list must be a JSON object'],
    });

    const parsed = parseProhibitedTermList({
      terms: ['warp', '', 42, 'warp'],
      allowedOccurrences: [
        { pattern: '([', rationale: 'broken regex' },
        { pattern: 'ok', rationale: '' },
        'not-an-object',
      ],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        'terms[1] must be a non-empty string',
        'terms[2] must be a non-empty string',
        expect.stringContaining('not a valid regular expression'),
        'allowedOccurrences[1].rationale must be a non-empty string',
        'allowedOccurrences[2] must be an object',
      ]),
    );
  });

  it('rejects a list with no usable terms', () => {
    const parsed = parseProhibitedTermList({ terms: [] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors).toContain('terms must contain at least one term');
  });
});

describe('scanProhibitedTerms', () => {
  it('detects a prohibited term and its inflections (the guard can actually fail)', () => {
    expect(scanProhibitedTerms('The warped hull answered with phasers.', shippedList())).toEqual([
      { term: 'phaser', line: 1 },
      { term: 'warp', line: 1 },
    ]);
  });

  it('keeps the prefix boundary: an innocent substring is not a match', () => {
    // "swarp" contains "warp" but not at a word boundary.
    expect(scanProhibitedTerms('A swarp is a wetland.', listOf(['warp']))).toEqual([]);
    expect(scanProhibitedTerms('A swarp is not a warp.', listOf(['warp']))).toEqual([
      { term: 'warp', line: 1 },
    ]);
  });

  it('reports the 1-based line of the first occurrence, once per term', () => {
    const text = 'line one\nline two\nwarp and warped again\nline four';
    expect(scanProhibitedTerms(text, listOf(['warp']))).toEqual([{ term: 'warp', line: 3 }]);
  });

  it('leaves original prose alone', () => {
    expect(
      scanProhibitedTerms(
        'The Archivist reweaves a drowned homeland and the survey service files the chart.',
        shippedList(),
      ),
    ).toEqual([]);
  });

  it('allows only the framework compound, never a narrative use of the same word', () => {
    const list = shippedList();
    // The allowance, as the documentation uses it.
    expect(scanProhibitedTerms('The module is `Phaser`-free and unit-tested.', list)).toEqual([]);
    expect(scanProhibitedTerms('It runs without Phaser tooltip modes.', list)).toEqual([]);
    expect(scanProhibitedTerms('A Phaser mode panel is available.', list)).toEqual([]);
    expect(scanProhibitedTerms('Every element is a Phaser `Text` object.', list)).toEqual([]);
    // The same word in a narrative sentence is still a match, capitalised or not.
    expect(scanProhibitedTerms('The Phaser banks fired.', list)).toEqual([
      { term: 'phaser', line: 1 },
    ]);
    expect(scanProhibitedTerms('phaser banks fired', list)).toEqual([
      { term: 'phaser', line: 1 },
    ]);
    // The allowance is case-sensitive: the lower-case compound is not exempt.
    expect(scanProhibitedTerms('phaser tooltip modes', list)).toEqual([
      { term: 'phaser', line: 1 },
    ]);
  });
});
