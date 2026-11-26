/**
 * Episode manifest legacy clock-cost migration rule (CG-0MWSJYS20005CBQ5).
 *
 * While the Long Erasure spike still carries a per-card `clockCost` CSV column,
 * a beat's authoritative `clockCost` in the manifest must agree with that cell:
 * a one-tick disagreement is enough to desynchronise the pressure clock, so
 * `clock-cost-mismatch` refuses it at review time.
 *
 * The rule is **migration-only**. The column is a game column, not a story-line
 * field mapping, so the validator resolves its name from the adapter's declared
 * columns and reads the raw cell from `ContentCard.fields`; it never treats the
 * cell as a beat's cost. Removing the column from the adapter (G10,
 * `CG-0MWR0BJXI007UINE`) therefore switches the rule off as a data change.
 *
 * The committed `fixtures/story-line/clock-cost-drift.csv` carries every card
 * the Appendix A episode references (with blank option cells, so no other
 * content rule has anything to say) and exactly one cell one tick off its beat.
 * The clean control is the shipped `long-erasure.csv`, whose cells all agree.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LONG_ERASURE_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import {
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestFinding,
  type EpisodeManifestValidationResult,
} from '../../../src/story-line/content/episode-manifest';
import {
  LEGACY_CLOCK_COST_COLUMN,
  type ContentAdapter,
  type ContentCard,
} from '../../../src/story-line/content/types';
import { REPO_ROOT } from './test-support';

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** The shipped story-line content, whose `clockCost` cells agree with the manifest. */
const CONTENT_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure.csv');

/** The committed one-tick drift fixture. */
const DRIFT_PATH = resolve(REPO_ROOT, 'tests/fixtures/story-line/clock-cost-drift.csv');

/** The path of the single drifted beat (`le-i-log`, manifest cost 1). */
const DRIFT_PATH_IN_MANIFEST = 'acts[0].scenes[0].beats[1].clockCost';

/** The manifest slice the fixture test reads (acts → scenes → beats). */
interface ActLike {
  readonly scenes: ReadonlyArray<{
    readonly beats: ReadonlyArray<{ readonly clockCost: number }>;
  }>;
}

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

/** The reference manifest as a fresh mutable copy. */
function reference(): Record<string, unknown> {
  return readJson(REFERENCE_PATH);
}

/** Parses a CSV file into content cards through the Long Erasure adapter. */
function cardsFrom(path: string, adapter: ContentAdapter = LONG_ERASURE_CONTENT_ADAPTER) {
  return cardsFromCsv(parseCsv(readFileSync(path, 'utf-8')), adapter);
}

/** The reference manifest's declared resource keys. */
function declaredResourcesOf(manifest: Record<string, unknown>): readonly string[] {
  const resources = manifest.resources as { declared?: unknown } | undefined;
  return Array.isArray(resources?.declared) ? (resources?.declared as string[]) : [];
}

/** Validates the reference manifest against the given content and adapter. */
function validate(
  cards: readonly ContentCard[],
  adapter: ContentAdapter = LONG_ERASURE_CONTENT_ADAPTER,
  manifest: Record<string, unknown> = reference(),
): EpisodeManifestValidationResult {
  return validateEpisodeManifest(manifest, cards, declaredResourcesOf(manifest), adapter);
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(result: EpisodeManifestValidationResult): string[] {
  return result.findings.map((finding) => `${finding.code}@${finding.path}`);
}

/** The finding with the given code and path, or `undefined`. */
function findingAt(
  result: EpisodeManifestValidationResult,
  path: string,
): EpisodeManifestFinding | undefined {
  return result.findings.find(
    (finding) => finding.code === 'clock-cost-mismatch' && finding.path === path,
  );
}

/** A copy of the cards with one card's legacy `clockCost` cell replaced. */
function withClockCost(
  cards: readonly ContentCard[],
  cardId: string,
  value: string,
): ContentCard[] {
  return cards.map((card) =>
    card.id === cardId ? { ...card, fields: { ...card.fields, clockCost: value } } : card,
  );
}

/** A copy of the cards with the legacy column removed from every raw row. */
function withoutClockCostColumn(cards: readonly ContentCard[]): ContentCard[] {
  return cards.map((card) => {
    const fields = { ...card.fields };
    delete fields.clockCost;
    return { ...card, fields };
  });
}

describe('clean control — the shipped content agrees with the manifest', () => {
  it('reports no findings and runs the migration rule', () => {
    const result = validate(cardsFrom(CONTENT_PATH));
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.rules).toContain('clock-cost-mismatch');
  });

  it('resolves the column name from the adapter, not a story-line field mapping', () => {
    // The legacy column is a game column: declared as a file column and left
    // unmapped, so the rule reads it from the raw ContentCard row.
    expect(LONG_ERASURE_CONTENT_ADAPTER.columns).toContain(LEGACY_CLOCK_COST_COLUMN);
    expect(Object.values(LONG_ERASURE_CONTENT_ADAPTER.fields)).not.toContain(
      LEGACY_CLOCK_COST_COLUMN,
    );
    const [first] = cardsFrom(CONTENT_PATH);
    expect(first?.fields[LEGACY_CLOCK_COST_COLUMN]).toBe('1');
  });
});

describe('the committed one-tick drift fixture', () => {
  it('reports exactly clock-cost-mismatch at the drifted beat', () => {
    const result = validate(cardsFrom(DRIFT_PATH));
    expect(pairs(result)).toEqual([`clock-cost-mismatch@${DRIFT_PATH_IN_MANIFEST}`]);
    expect(result.valid).toBe(false);
  });

  it('quotes both values in the finding message', () => {
    const finding = findingAt(validate(cardsFrom(DRIFT_PATH)), DRIFT_PATH_IN_MANIFEST);
    expect(finding).toBeDefined();
    // The manifest's 1 and the fixture's "2" are both named, so a reviewer can
    // see the one-tick disagreement without opening either file.
    expect(finding?.message).toContain('clockCost 1');
    expect(finding?.message).toContain('"2"');
    expect(finding?.message).toContain('le-i-log');
  });
});

describe('any disagreement, one finding per beat', () => {
  it('reports one finding for each mismatched beat, however large the gap', () => {
    const cards = withClockCost(
      withClockCost(cardsFrom(CONTENT_PATH), 'le-i-open', '4'),
      'le-ii-keep',
      '0',
    );
    const result = validate(cards);
    expect(pairs(result)).toEqual([
      'clock-cost-mismatch@acts[0].scenes[0].beats[0].clockCost',
      'clock-cost-mismatch@acts[1].scenes[1].beats[3].clockCost',
    ]);
  });

  it('does not report a beat whose raw cell carries no value to compare', () => {
    const cards = withClockCost(cardsFrom(CONTENT_PATH), 'le-i-open', '  ');
    expect(pairs(validate(cards))).toEqual([]);
  });
});

describe('retiring the column (G10) switches the rule off without a code change', () => {
  /** The adapter shape G10 leaves behind: the legacy column is not declared. */
  const G10_ADAPTER: ContentAdapter = {
    ...LONG_ERASURE_CONTENT_ADAPTER,
    columns: LONG_ERASURE_CONTENT_ADAPTER.columns.filter(
      (column) => column !== LEGACY_CLOCK_COST_COLUMN,
    ),
    editableColumns: LONG_ERASURE_CONTENT_ADAPTER.editableColumns?.filter(
      (column) => column !== LEGACY_CLOCK_COST_COLUMN,
    ),
    newCardDefaults: Object.fromEntries(
      Object.entries(LONG_ERASURE_CONTENT_ADAPTER.newCardDefaults ?? {}).filter(
        ([column]) => column !== LEGACY_CLOCK_COST_COLUMN,
      ),
    ),
  };

  it('is silent, and not listed as run, once no adapter declares the column', () => {
    const result = validate(withoutClockCostColumn(cardsFrom(CONTENT_PATH)), G10_ADAPTER);
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.rules).not.toContain('clock-cost-mismatch');
  });

  it('stays silent when a file lacks the column but its adapter still declares it', () => {
    // The declaration is the rule's activation data; an absent cell is simply
    // nothing to compare, never an error.
    const result = validate(withoutClockCostColumn(cardsFrom(CONTENT_PATH)));
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('does not run the rule when no content is bound', () => {
    const result = validateEpisodeManifest(reference());
    expect(result.rules).not.toContain('clock-cost-mismatch');
  });
});

describe('the reports', () => {
  it('renders the drift finding in both the text and JSON reports', () => {
    const result = validate(cardsFrom(DRIFT_PATH));
    expect(formatEpisodeManifestReport(result)).toContain(
      `✗ [clock-cost-mismatch] ${DRIFT_PATH_IN_MANIFEST}:`,
    );
    const parsed = JSON.parse(episodeManifestValidationToJson(result)) as {
      findings: EpisodeManifestFinding[];
    };
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.code).toBe('clock-cost-mismatch');
    expect(parsed.findings[0]?.manifestId).toBe('long-erasure');
  });
});

/** The legacy clock-cost cells of the drift fixture, in file order. */
function driftCells(): string[] {
  const parsed = parseCsv(readFileSync(DRIFT_PATH, 'utf-8'));
  const index = parsed.header.indexOf(LEGACY_CLOCK_COST_COLUMN);
  return parsed.rows.map((row) => row[index] ?? '');
}

describe('the fixture itself', () => {
  it('carries the legacy column and one cell one tick off the manifest', () => {
    expect(parseCsv(readFileSync(DRIFT_PATH, 'utf-8')).header).toContain(
      LEGACY_CLOCK_COST_COLUMN,
    );
    const expected = (reference().acts as ActLike[]).flatMap((act) =>
      act.scenes.flatMap((scene) => scene.beats.map((beat) => String(beat.clockCost))),
    );
    const drifts = expected.flatMap((cost, position) =>
      driftCells()[position] === cost
        ? []
        : [{ position, expected: cost, actual: driftCells()[position] }],
    );
    expect(drifts).toEqual([{ position: 1, expected: '1', actual: '2' }]);
  });
});
