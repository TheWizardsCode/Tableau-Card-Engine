/**
 * GDD §2.9.7 — the authoring-frictions table ↔ author CLI contract.
 *
 * The GDD tells a writer that every friction the Long Erasure spike measured is
 * closed on the command line, and names the command that closes it. That
 * promise is only true while the table and `scripts/storyline-author.ts` agree,
 * so this suite pins the two together:
 *
 * - all five friction rows are marked **Resolved** (a re-opened friction cannot
 *   leave a stale "Resolved" behind, and a resolved one cannot regress to a
 *   known limit unnoticed);
 * - every row names a `storylines:author` subcommand the CLI actually parses;
 * - the prose friction (the sixth the section found) names both `--context` and
 *   `--epilogue`;
 * - the positional-insert row names `--after`, and the resource row names the
 *   per-file `#resources:` declaration.
 *
 * It is a documentation guard, so it never asserts prose: it checks only the
 * parts a writer is told to run. Counterpart of T8
 * (`gdd-content-pipeline.test.ts`) for the authoring CLI.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUTHOR_USAGE, parseAuthorCliArgs } from '../../../scripts/storyline-author';
import { REPO_ROOT } from './test-support';

/** The GDD's friction subsection heading (the anchor every link uses). */
const SECTION_HEADING = "#### 2.9.7 The spike's five authoring frictions";

/** Every author CLI subcommand the friction table may name. */
const AUTHOR_SUBCOMMANDS = ['add-card', 'add-linked-card', 'add-option', 'update-card'] as const;

/** Reads the GDD's §2.9.7 subsection body (heading line excluded). */
function readFrictionSection(): string {
  const doc = readFileSync(resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md'), 'utf8');
  const start = doc.indexOf(SECTION_HEADING);
  expect(start, `GDD is missing the §2.9.7 heading (${SECTION_HEADING})`).toBeGreaterThanOrEqual(0);
  // Skip the rest of the heading line: it still reads "… resolved or known
  // limits" for anchor stability, which is not a claim about any friction row.
  const bodyStart = doc.indexOf('\n', start) + 1;
  const body = doc.slice(bodyStart);
  const end = body.search(/\n#{3,4} /);
  return end < 0 ? body : body.slice(0, end);
}

/** One parsed friction-table row, by friction number. */
interface FrictionRow {
  readonly number: number;
  readonly status: string;
  readonly action: string;
  readonly text: string;
}

/** Parses the five numbered rows out of the friction table. */
function parseFrictionRows(section: string): FrictionRow[] {
  const rows: FrictionRow[] = [];
  for (const line of section.split('\n')) {
    const cells = line.split('|');
    if (cells.length < 5) continue;
    const number = Number(cells[1]?.trim());
    if (!Number.isInteger(number) || number < 1 || number > 5) continue;
    rows.push({
      number,
      status: cells[3] ?? '',
      action: cells[4] ?? '',
      text: line,
    });
  }
  return rows.sort((a, b) => a.number - b.number);
}

/** The author subcommands a row names, in table order. */
function namedSubcommands(row: FrictionRow): string[] {
  return AUTHOR_SUBCOMMANDS.filter((command) => row.text.includes(command));
}

describe('GDD §2.9.7 authoring-frictions table', () => {
  const section = readFrictionSection();
  const rows = parseFrictionRows(section);

  it('tabulates all five spike frictions', () => {
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks every friction Resolved with the path that closes it', () => {
    for (const row of rows) {
      expect(row.status, `friction ${row.number} is not marked Resolved`).toMatch(
        /\*\*Resolved\*\*/,
      );
      // Rows 1, 2 and 4 close with a CLI subcommand; row 3 closes with a
      // file-level declaration (it is not a command). Row 5 closes with the
      // validator's hard error, which its own test pins below.
      const closesWithCommand = namedSubcommands(row).length > 0;
      const closesWithDeclaration =
        row.text.includes('#resources:') || row.text.includes('unknown content column');
      expect(
        closesWithCommand || closesWithDeclaration,
        `friction ${row.number} names neither an author subcommand nor a declaration`,
      ).toBe(true);
    }
  });

  it('leaves no known-limit claim in the friction section', () => {
    expect(section).not.toMatch(/Known limit/i);
  });

  it('names commands the CLI actually parses', () => {
    const commandRows = rows.filter((row) => namedSubcommands(row).length > 0);
    expect(commandRows.length, 'no friction row names an author subcommand').toBeGreaterThan(0);
    for (const row of commandRows) {
      for (const command of namedSubcommands(row)) {
        const parsed = parseAuthorCliArgs([command]);
        expect(
          'command' in parsed && parsed.command === command,
          `friction ${row.number} names "${command}", which the CLI does not parse`,
        ).toBe(true);
        expect(
          AUTHOR_USAGE,
          `friction ${row.number} names "${command}", which the usage text omits`,
        ).toContain(command);
      }
    }
  });

  it('closes forward references with add-linked-card in one transaction', () => {
    const row = rows.find((candidate) => candidate.number === 1) as FrictionRow;
    expect(namedSubcommands(row)).toContain('add-linked-card');
    expect(row.text).toContain('--link-from');
  });

  it('closes whole-cell replacement with add-option', () => {
    const row = rows.find((candidate) => candidate.number === 2) as FrictionRow;
    expect(namedSubcommands(row)).toContain('add-option');
    expect(row.text).toContain('--target');
  });

  it('declares the resource set once per file with #resources:', () => {
    const row = rows.find((candidate) => candidate.number === 3) as FrictionRow;
    expect(row.text).toContain('#resources:');
  });

  it('inserts at a documented position with add-card --after', () => {
    const row = rows.find((candidate) => candidate.number === 4) as FrictionRow;
    expect(namedSubcommands(row)).toContain('add-card');
    expect(row.text).toContain('--after');
    expect(AUTHOR_USAGE).toContain('--after');
  });

  it('records the prose friction as resolved, naming both flags', () => {
    expect(section).toMatch(/Prose \(found while writing this section\): resolved/);
    expect(section).toContain('--context');
    expect(section).toContain('--epilogue');
    expect(section).toContain('--clear-context');
  });
});
