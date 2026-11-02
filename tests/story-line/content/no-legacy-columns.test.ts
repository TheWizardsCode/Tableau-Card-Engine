/**
 * Legacy choice-column regression guard (CG-0MVZFW4XD009JSR6).
 *
 * Story-line choices are represented **only** by the `options` encoding. The
 * retired two-way choice columns (`hasChoices`, `acceptNextCardId`,
 * `rejectNextCardId`) must never come back — not in the shipped Gym content,
 * not in the committed story-line/card-pack fixtures and not in the reference
 * Main Street pack. Any content file that still declares them would land them
 * in `ContentCard.fields` (they are unmapped columns), leaking legacy keys into
 * the generated manifest that authoring surfaces read.
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

/** The retired legacy columns the migration removed from every content file. */
const LEGACY_COLUMNS = [
  'hasChoices',
  'acceptNextCardId',
  'rejectNextCardId',
] as const;

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

/** Asserts that a CSV header declares none of the retired columns. */
function expectNoLegacyColumns(label: string, header: readonly string[]): void {
  for (const column of LEGACY_COLUMNS) {
    expect(header, `${label} still declares the legacy "${column}" column`).not.toContain(
      column,
    );
  }
}

describe('shipped Gym story-line content', () => {
  it('no longer declares the legacy choice columns', () => {
    const parsed = parseCsv(readText(GYM_CONTENT_PATH));
    expectNoLegacyColumns('example-games/gym/content/storylines.csv', parsed.header);
  });

  it('projects no legacy key into any card field set', () => {
    const cards = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expectNoLegacyColumns(`card ${card.id}`, Object.keys(card.fields));
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
  it('carries no legacy key in any node’s fields', () => {
    const manifest = JSON.parse(readText(GYM_MANIFEST_PATH)) as StorylineManifest;
    expect(manifest.nodes.length).toBeGreaterThan(0);
    for (const node of manifest.nodes) {
      expectNoLegacyColumns(`node ${node.id}`, Object.keys(node.fields));
    }
  });
});

describe('story-line and card-pack fixtures', () => {
  it('migrates the cycle fixture off the legacy columns', () => {
    const parsed = parseCsv(readFixture('gym-cycle.csv'));
    expectNoLegacyColumns('tests/fixtures/story-line/gym-cycle.csv', parsed.header);
    expect(parsed.rows).toHaveLength(2);
  });

  it('migrates every card-pack fixture CSV off the legacy columns', () => {
    for (const relativePath of CARD_PACK_FIXTURE_CSVS) {
      const parsed = parseCsv(readRepoFile(relativePath));
      expectNoLegacyColumns(relativePath, parsed.header);
      expect(parsed.rows.length).toBeGreaterThan(0);
      // A migrated fragment keeps one cell per column on every row, so the
      // pack merge's exact-header check still passes.
      for (const row of parsed.rows) expect(row).toHaveLength(parsed.header.length);
    }
  });

  it('keeps the shared card-pack header constant legacy-free', () => {
    expectNoLegacyColumns('CARD_PACK_CSV_COLUMNS', CARD_PACK_CSV_COLUMNS);
  });

  it('migrates the reference Main Street pack off the legacy columns', () => {
    const parsed = parseCsv(readRepoFile(REFERENCE_PACK_CSV));
    expectNoLegacyColumns(REFERENCE_PACK_CSV, parsed.header);
    // Story-line choices are carried by `options` alone.
    expect(parsed.header).toContain('options');
    expect(parsed.rows.length).toBeGreaterThan(0);
    for (const row of parsed.rows) expect(row).toHaveLength(parsed.header.length);
  });
});
