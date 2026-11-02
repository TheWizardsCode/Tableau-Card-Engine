/**
 * Shipped story-line options parity (CG-0MVZFVYKD001Q18N).
 *
 * Pins the compiled option list of every shipped story-line card in a committed
 * golden fixture (`tests/fixtures/story-line/options-parity.json`) so that the
 * removal of the legacy two-way choice model cannot change what the shipped
 * content compiles to. The fixture is a capture of **real behaviour** — the
 * shipped CSVs in, compiled options out — taken on 2026-11-02 against the code
 * before the removal started; it must stay green after every removal phase of
 * the parent epic (`CG-0MVZBUWPH003PWUI`).
 *
 * What it pins, per shipped card id: the card name, its story-line id and the
 * ordered compiled options (label, ordered successor ids, `effectPolicy`).
 *
 * Sources and adapters:
 *
 * - **Gym demo content** — `example-games/gym/content/storylines.csv` through
 *   the shipped `GYM_CONTENT_ADAPTER`.
 * - **Main Street reference card pack** —
 *   `tests/fixtures/reference-packs/main-street/main-street/main-street-foundations/cards.csv`
 *   through the minimal options-only adapter declared below. The pack CSV uses
 *   Main Street's 54-column schema; this snapshot cares only about the
 *   story-line columns, so the adapter maps exactly those and treats the rest
 *   as game fields.
 *
 * The comparison goes through the public content API only (`cardsFromCsv` then
 * `compileContentOptions`), so a drift fails with a diff of the computed JSON
 * against the fixture. Regenerate the fixture deliberately (and review the
 * diff) when the shipped content itself changes; an ordering change must never
 * be "fixed" by regenerating.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
} from '../../src/story-line/content/csv';
import type { ContentAdapter } from '../../src/story-line/content/types';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const GYM_CSV = 'example-games/gym/content/storylines.csv';
const MAIN_STREET_REFERENCE_CSV =
  'tests/fixtures/reference-packs/main-street/main-street/main-street-foundations/cards.csv';
const GOLDEN_FIXTURE = 'tests/fixtures/story-line/options-parity.json';

/**
 * A minimal **options-only** adapter for the Main Street reference card pack.
 *
 * The pack's CSV is Main Street's full card schema; only the story-line
 * columns matter for option compilation, so this adapter maps exactly those
 * and leaves every other column untouched as an unmapped game field. Declaring
 * it here (rather than importing Main Street, which this repository must not
 * do) keeps the snapshot dependency-free and stable across the refactor.
 */
const MAIN_STREET_REFERENCE_ADAPTER: ContentAdapter = {
  gameId: 'main-street-reference-pack',
  columns: ['id', 'name', 'effect', 'options', 'storylineId', 'storylineTitle'],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
    storylineId: 'storylineId',
    storylineTitle: 'storylineTitle',
  },
};

/** One compiled option as recorded in the golden fixture. */
interface GoldenOption {
  readonly label: string;
  readonly successorIds: readonly string[];
  readonly effectPolicy: string;
}

/** One shipped card's compiled option list as recorded in the fixture. */
interface GoldenCard {
  readonly id: string;
  readonly name: string;
  readonly storylineId: string | null;
  readonly options: readonly GoldenOption[];
}

/** One shipped content file plus its adapter and captured cards. */
interface GoldenSource {
  readonly id: string;
  readonly csv: string;
  readonly adapter: string;
  readonly cards: readonly GoldenCard[];
}

/** The committed golden fixture. */
interface GoldenFixture {
  readonly capturedFrom: string;
  readonly capturedAt: string;
  readonly captureNote: string;
  readonly sources: readonly GoldenSource[];
}

/** A content source the snapshot covers. */
interface SourceSpec {
  readonly id: string;
  readonly csv: string;
  readonly adapter: string;
  readonly contentAdapter: ContentAdapter;
}

const SOURCES: readonly SourceSpec[] = [
  {
    id: 'gym',
    csv: GYM_CSV,
    adapter: 'GYM_CONTENT_ADAPTER',
    contentAdapter: GYM_CONTENT_ADAPTER,
  },
  {
    id: 'main-street-reference-pack',
    csv: MAIN_STREET_REFERENCE_CSV,
    adapter:
      'minimal options-only adapter declared in tests/story-line/options-parity.test.ts',
    contentAdapter: MAIN_STREET_REFERENCE_ADAPTER,
  },
];

/** Reads a repository-relative UTF-8 file. */
function readText(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf-8');
}

/** Compiles one CSV through the public content API into fixture records. */
function captureCards(csvPath: string, adapter: ContentAdapter): GoldenCard[] {
  return cardsFromCsv(parseCsv(readText(csvPath)), adapter).map((card) => ({
    id: card.id,
    name: card.name,
    storylineId: card.storylineId,
    options: compileContentOptions(card).map((option) => ({
      label: option.label,
      successorIds: [...(option.successorIds ?? [])],
      effectPolicy: option.effectPolicy,
    })),
  }));
}

/** The snapshot recomputed from the shipped content. */
const ACTUAL_SOURCES: GoldenSource[] = SOURCES.map((source) => ({
  id: source.id,
  csv: source.csv,
  adapter: source.adapter,
  cards: captureCards(source.csv, source.contentAdapter),
}));

/** The committed golden snapshot. */
const GOLDEN: GoldenFixture = JSON.parse(readText(GOLDEN_FIXTURE)) as GoldenFixture;

/** The compiled options of one shipped card. */
function optionsOf(sourceId: string, cardId: string): readonly GoldenOption[] {
  const source = ACTUAL_SOURCES.find((candidate) => candidate.id === sourceId);
  if (source === undefined) throw new Error(`Unknown snapshot source "${sourceId}"`);
  const card = source.cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) throw new Error(`Unknown card "${cardId}" in source "${sourceId}"`);
  return card.options;
}

describe('shipped story-line options parity', () => {
  it('recompiles the shipped content to exactly the golden fixture', () => {
    expect(
      ACTUAL_SOURCES,
      'Compiled story-line options drifted from tests/fixtures/story-line/options-parity.json. ' +
        'The shipped content must compile to the same option lists as before the legacy ' +
        'two-way choice removal; only regenerate the fixture if the content change is deliberate.',
    ).toEqual(GOLDEN.sources);
  });

  it('records a multi-option branching card', () => {
    const options = optionsOf('gym', 'gym-story-start');
    expect(options.map((option) => option.label)).toEqual(['Invest', 'Ignore']);
    expect(options.map((option) => option.successorIds)).toEqual([
      ['gym-story-invest'],
      ['gym-story-ignore'],
    ]);
    expect(options.every((option) => option.effectPolicy === 'apply')).toBe(true);
  });

  it('records a terminal option with no successor (`successorIds: []`)', () => {
    const terminal = optionsOf('gym', 'gym-story-invest').find(
      (option) => option.label === 'Double down',
    );
    expect(terminal).toBeDefined();
    expect(terminal?.successorIds).toEqual([]);
  });

  it('records plain incidents with an empty option list', () => {
    expect(optionsOf('gym', 'gym-story-end')).toEqual([]);
    expect(optionsOf('main-street-reference-pack', 'evt-ms-foundations-fair')).toEqual([]);
  });
});
