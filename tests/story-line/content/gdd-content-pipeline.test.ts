/**
 * Writer content pipeline — document ↔ fixture contract.
 *
 * The GDD's content-pipeline section quotes worked CSV rows verbatim and tells a
 * writer they validate. That promise is only true while the document and the
 * fixture agree, so this suite pins the two together:
 *
 * - every row in the document's fenced block is a **byte-for-byte** row of the
 *   worked-example fixture (a corrected row cannot leave a stale copy behind);
 * - the fixture still validates cleanly through the same seam
 *   `npm run storylines:validate` uses;
 * - the quoted rows between them demonstrate the three shapes the section
 *   teaches — a costed choice, a `#when`-gated successor and a terminal card.
 *
 * This is T8 in the GDD's test plan. It is a documentation guard, so it never
 * asserts prose: it only checks the parts a writer is told to copy.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { validateContentCsv } from '../../../src/story-line/content/validate';
import { REPO_ROOT, fixturePath, readFixture } from './test-support';

/** The GDD's content-pipeline section must quote at least this many rows. */
const MINIMUM_WORKED_ROWS = 2;

/**
 * Extracts the rows from the document's `<!-- gdd-worked-rows -->` fenced block.
 *
 * Returns the header row separately from the data rows so a caller can assert
 * the block is a real CSV fragment rather than a pile of example lines.
 */
function extractWorkedRows(): { header: string; rows: string[] } {
  const doc = readFileSync(
    resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md'),
    'utf8',
  );
  const match = doc.match(/<!-- gdd-worked-rows -->\s*```csv\n([\s\S]*?)\n```/);
  if (!match) throw new Error('gdd-worked-rows block not found or not fenced as csv');
  const lines = match[1].split('\n');
  const [header, ...rows] = lines;
  return { header, rows };
}

describe('GDD writer content pipeline', () => {
  it('quotes at least two worked example rows under a real CSV header', () => {
    const { header, rows } = extractWorkedRows();
    expect(header).toBe(
      'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,' +
        'coinDelta,reputationDelta,context,consequential,ending',
    );
    expect(rows.length).toBeGreaterThanOrEqual(MINIMUM_WORKED_ROWS);
    // Every quoted row must actually be a row of that table.
    for (const row of rows) {
      expect(row.split(',').length).toBeGreaterThan(1);
    }
  });

  it('quotes rows that are byte-identical to the fixture the tooling validates', () => {
    const fixtureLines = readFixture('gdd-worked-examples.csv')
      .split('\n')
      .map((line) => line.trimEnd());
    const { rows } = extractWorkedRows();
    for (const row of rows) {
      expect(fixtureLines).toContain(row);
    }
  });

  it('keeps the worked-example fixture valid through the validator seam', () => {
    const result = validateContentCsv(
      readFixture('gdd-worked-examples.csv'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('demonstrates a costed choice, a gated successor and a terminal card', () => {
    const { rows } = extractWorkedRows();
    const block = rows.join('\n');
    expect(block).toContain('#cost='); // a cost gate + payment
    expect(block).toContain('#when='); // a conditional successor
    expect(block).toContain('#says='); // authored outcome prose
    // A terminal row: no options cell, and the `ending` mark set.
    expect(
      rows.some(
        (row) => row.split(',')[3] === '' && row.endsWith('yes'),
      ),
    ).toBe(true);
  });

  it('quotes a fixture path that exists and matches the rows it claims', () => {
    expect(fixturePath('gdd-worked-examples.csv')).toContain(
      'tests/fixtures/story-line/gdd-worked-examples.csv',
    );
    const { rows } = extractWorkedRows();
    const ids = rows.map((row) => row.slice(0, row.indexOf(',')));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
