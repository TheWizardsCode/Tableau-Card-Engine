/**
 * Content-column shape guard (CG-0MVZFW4XD009JSR6, CG-0MVZFW6FY008RNZH).
 *
 * Story-line choices are represented **only** by the `options` encoding. Every
 * content file the toolchain ships or consumes must declare exactly the
 * columns its adapter expects: an unmapped column is projected into
 * `ContentCard.fields`, so a reintroduced two-way choice column would silently
 * leak into the generated manifest that the authoring surfaces read.
 *
 * The guard is an **allow-list**, not a deny-list: the expected column set is
 * pinned exactly (the adapter's own `columns`, the shared card-pack header, or
 * the reference pack's documented header plus its two pack-only extras). An
 * added, removed or renamed column therefore fails this guard no matter what
 * it is called.
 *
 * The assertions go through the public content API (`parseCsv`,
 * `cardsFromCsv`, `compileContentOptions`) and the committed manifest itself,
 * so the guard fails on real observable output rather than on a text search.
 *
 * @module
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
} from '../../../src/story-line/content/csv';
import type { StorylineManifest } from '../../../src/story-line/content/manifest';
import { CARD_PACK_CSV_COLUMNS } from '../../fixtures/card-pack/helpers';
import {
  GYM_CONTENT_PATH,
  GYM_MANIFEST_PATH,
  REPO_ROOT,
  readFixture,
  readText,
} from './test-support';

/**
 * The Gym's unmapped (game) columns, in adapter order.
 *
 * Every mapped column is projected onto a generic story-line field; everything
 * else survives in `ContentCard.fields` and reaches the manifest's node
 * `fields`. This is the exact expected set.
 */
const GYM_GAME_COLUMNS = GYM_CONTENT_ADAPTER.columns.filter(
  (column) => !Object.values(GYM_CONTENT_ADAPTER.fields).includes(column),
);

/** The reference pack's two columns that the shared card-pack header lacks. */
const PACK_ONLY_COLUMNS = ['options', 'piggybackable'] as const;

/** Repository-relative card-pack fixture CSVs (Main Street schema fragments). */
const CARD_PACK_FIXTURE_CSVS = [
  'tests/fixtures/card-pack/packs/fixture-game/fixture-pack/cards.csv',
  'tests/fixtures/card-pack/packs/fixture-game/fixture-pack/cards-duplicate.csv',
  'tests/fixtures/card-pack/packs/fixture-game/fixture-pack-two/cards.csv',
] as const;

/** The committed reference Main Street card pack used by the pack builder. */
const REFERENCE_PACK_CSV =
  'tests/fixtures/reference-packs/main-street/main-street/main-street-foundations/cards.csv';

/** Reads a repository-relative UTF-8 file. */
function readRepoFile(relativePath: string): string {
  return readText(join(REPO_ROOT, relativePath));
}

/** Asserts that a header is exactly the expected ordered column list. */
function expectExactColumns(
  label: string,
  header: readonly string[],
  expected: readonly string[],
): void {
  expect(header, `${label} column header drifted from the expected set`).toEqual([...expected]);
}

describe('shipped Gym story-line content', () => {
  it('declares exactly the columns the Gym adapter accepts', () => {
    const parsed = parseCsv(readText(GYM_CONTENT_PATH));
    expectExactColumns(
      'example-games/gym/content/storylines.csv',
      parsed.header,
      GYM_CONTENT_ADAPTER.columns,
    );
    for (const row of parsed.rows) expect(row).toHaveLength(parsed.header.length);
  });

  it('projects exactly the adapter’s game columns onto every card', () => {
    const cards = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expectExactColumns(`card ${card.id}`, Object.keys(card.fields), GYM_GAME_COLUMNS);
    }
  });

  it('keeps every card’s compiled options and coin/reputation deltas unchanged', () => {
    const cards = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    const byId = new Map(cards.map((card) => [card.id, card]));

    const expected = [
      { id: 'gym-story-start', options: ['Invest', 'Ignore'], coins: '-50', reputation: '0' },
      { id: 'gym-story-invest', options: ['Celebrate', 'Double down'], coins: '120', reputation: '0' },
      { id: 'gym-story-ignore', options: ['Repair', 'Let it be'], coins: '-80', reputation: '0' },
      { id: 'gym-story-end', options: [], coins: '0', reputation: '60' },
    ] as const;

    for (const { id, options, coins, reputation } of expected) {
      const card = byId.get(id);
      expect(card, `missing shipped card ${id}`).toBeDefined();
      expect(compileContentOptions(card!).map((option) => option.label)).toEqual(options);
      expect(card!.fields.coinDelta).toBe(coins);
      expect(card!.fields.reputationDelta).toBe(reputation);
    }
  });
});

describe('committed Gym manifest artefact', () => {
  it('carries exactly the adapter’s game columns on every node', () => {
    const manifest = JSON.parse(readText(GYM_MANIFEST_PATH)) as StorylineManifest;
    expect(manifest.nodes.length).toBeGreaterThan(0);
    for (const node of manifest.nodes) {
      expectExactColumns(`node ${node.id}`, Object.keys(node.fields), GYM_GAME_COLUMNS);
      // The derived choice flag can never disagree with the compiled options.
      expect(node.isChoice).toBe(node.optionCount > 0);
    }
  });
});

describe('story-line and card-pack fixtures', () => {
  it('keeps the cycle fixture on the Gym columns', () => {
    const parsed = parseCsv(readFixture('gym-cycle.csv'));
    expectExactColumns('tests/fixtures/story-line/gym-cycle.csv', parsed.header, GYM_CONTENT_ADAPTER.columns);
    expect(parsed.rows).toHaveLength(2);
  });

  it('keeps every card-pack fixture CSV on the shared card-pack header', () => {
    for (const relativePath of CARD_PACK_FIXTURE_CSVS) {
      const parsed = parseCsv(readRepoFile(relativePath));
      expectExactColumns(relativePath, parsed.header, CARD_PACK_CSV_COLUMNS);
      expect(parsed.rows.length).toBeGreaterThan(0);
      // Every row keeps one cell per column, so the pack merge's exact-header
      // check still passes.
      for (const row of parsed.rows) expect(row).toHaveLength(parsed.header.length);
    }
  });

  it('declares no duplicate columns in the shared card-pack header', () => {
    expect(new Set(CARD_PACK_CSV_COLUMNS).size).toBe(CARD_PACK_CSV_COLUMNS.length);
  });

  it('keeps the reference Main Street pack on the base header plus its two pack-only columns', () => {
    const parsed = parseCsv(readRepoFile(REFERENCE_PACK_CSV));
    expect(
      parsed.header.filter(
        (column) => !(PACK_ONLY_COLUMNS as readonly string[]).includes(column),
      ),
    ).toEqual(CARD_PACK_CSV_COLUMNS);
    expect(parsed.header).toHaveLength(
      CARD_PACK_CSV_COLUMNS.length + PACK_ONLY_COLUMNS.length,
    );
    // Story-line choices are carried by `options` alone.
    expect(parsed.header).toContain('options');
    expect(parsed.rows.length).toBeGreaterThan(0);
    for (const row of parsed.rows) expect(row).toHaveLength(parsed.header.length);
  });
});
