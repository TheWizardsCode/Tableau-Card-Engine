/**
 * Per-file resource declaration seam (CG-0MWQZHFA0006AOVX, parent friction 3).
 *
 * Content files used to repeat the same declared resource key set in every
 * row's `resources` cell. This suite pins the seam that replaces that
 * repetition with a **single leading `#resources:` comment line**:
 *
 * 1. **The declaration is a leading comment** — `parseCsv` lifts leading `#`
 *    lines out of the header/row matrix into `declarations`, so the file's
 *    schema and rows are unchanged and `parseCsv` → `serialiseCsv` still
 *    round-trips byte-identically (a declaration survives an authored edit).
 * 2. **The declared set is the file default** — a row that leaves `resources`
 *    blank inherits the declaration; a row that sets the cell overrides it
 *    (mixed-resource files).
 * 3. **Validation reads the effective set** — `unknown-resource-key` still
 *    fires for a key outside the declaration (or outside a row's override),
 *    and a file with neither a declaration nor per-row cells falls back to
 *    the engine's default `coins` / `reputation` projection.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import type { ContentAdapter } from '../../../src/story-line/content/types';
import {
  cardsFromCsv,
  parseCsv,
  parseResourceDeclaration,
  serialiseCsv,
} from '../../../src/story-line/content/csv';
import {
  addContentCard,
  updateContentCard,
} from '../../../src/story-line/content/mutate';
import { validateContentCsv } from '../../../src/story-line/content/validate';

/** The declared set the Long Erasure content authors once, at file level. */
const VOYAGE_RESOURCES = ['hull', 'morale', 'stores', 'goodwill', 'charge'] as const;

/** The declaration line the fixtures open with. */
const VOYAGE_DECLARATION = `#resources: ${VOYAGE_RESOURCES.join(',')}`;

/** Column header shared by every fixture in this suite. */
const HEADER = 'id,name,effect,options,resources,storylineId';

/**
 * A generic adapter mapping the `resources` column.
 *
 * Kept local (rather than reusing a shipped adapter) so the suite states the
 * mapping it exercises and cannot drift with a game's adapter.
 */
const RESOURCE_ADAPTER: ContentAdapter = {
  gameId: 'per-file-fixture',
  columns: ['id', 'name', 'effect', 'options', 'resources', 'storylineId'],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
    resources: 'resources',
    storylineId: 'storylineId',
  },
};

/** An adapter whose content file has no `resources` column at all. */
const NO_RESOURCE_COLUMN_ADAPTER: ContentAdapter = {
  gameId: 'per-file-no-column-fixture',
  columns: ['id', 'name', 'effect', 'options'],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
  },
};

/**
 * Builds fixture CSV text from rows and optional leading declaration lines.
 *
 * Rows are plain comma-joined cells: every option encoding used here relies
 * on `;` / `|` / `#`, so no cell needs quoting.
 *
 * @param rows         Data rows, each aligned to {@link HEADER}.
 * @param declarations Leading `#` lines (omitted by default).
 * @param header       Column header (defaults to {@link HEADER}).
 * @returns CSV text with a terminal newline.
 */
function contentCsv(
  rows: readonly (readonly string[])[],
  declarations: readonly string[] = [],
  header: string = HEADER,
): string {
  return [...declarations, header, ...rows.map((row) => row.join(','))].join('\n') + '\n';
}

/** The unknown-resource-key issues reported for CSV text. */
function unknownResourceIssues(
  csvText: string,
  adapter: ContentAdapter = RESOURCE_ADAPTER,
) {
  return validateContentCsv(csvText, adapter).issues.filter(
    (issue) => issue.code === 'unknown-resource-key',
  );
}

describe('parseCsv: leading declaration lines', () => {
  it('lifts a #resources line out of the header/rows and round-trips it', () => {
    const text = contentCsv(
      [['card-a', 'Card A', 'An effect', '', '']],
      [VOYAGE_DECLARATION],
    );

    const parsed = parseCsv(text);

    expect(parsed.declarations).toEqual([VOYAGE_DECLARATION]);
    expect(parsed.header).toEqual(HEADER.split(','));
    expect(parsed.rows).toEqual([['card-a', 'Card A', 'An effect', '', '']]);
    // Round-trip stability is a hard parser property: the authored
    // declaration must survive parse → serialise byte-identically.
    expect(serialiseCsv(parsed)).toBe(text);
  });

  it('accepts spaced / mixed-case declaration lines', () => {
    const parsed = parseCsv(
      contentCsv([['card-a', 'Card A', '', '', '']], ['# Resources: hull, morale']),
    );

    expect(parsed.declarations).toEqual(['# Resources: hull, morale']);
    expect(parseResourceDeclaration(parsed.declarations)).toEqual(['hull', 'morale']);
  });

  it('ignores non-declaration comments and keeps every declared line verbatim', () => {
    const text = contentCsv(
      [['card-a', 'Card A', '', '', '']],
      ['# The Long Erasure, act I', VOYAGE_DECLARATION],
    );

    const parsed = parseCsv(text);

    expect(parsed.declarations).toEqual([
      '# The Long Erasure, act I',
      VOYAGE_DECLARATION,
    ]);
    expect(parseResourceDeclaration(parsed.declarations)).toEqual([
      ...VOYAGE_RESOURCES,
    ]);
    expect(serialiseCsv(parsed)).toBe(text);
  });

  it('does not treat a # row after the header as a declaration', () => {
    const parsed = parseCsv(
      contentCsv([
        ['card-a', 'Card A', '', '', ''],
        ['#not-an-id', '#not-a-name', '', '', ''],
      ]),
    );

    expect(parsed.declarations).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
  });

  it('reports no declaration and no declared keys for an undeclared file', () => {
    const parsed = parseCsv(contentCsv([['card-a', 'Card A', '', '', '']]));

    expect(parsed.declarations).toEqual([]);
    expect(parseResourceDeclaration(parsed.declarations)).toEqual([]);
  });
});

describe('cardsFromCsv: the declared set is the file default', () => {
  it('inherits the declared set when a row leaves resources blank', () => {
    const cards = cardsFromCsv(
      parseCsv(
        contentCsv(
          [
            ['card-a', 'Card A', '', '', ''],
            ['card-b', 'Card B', '', '', ''],
          ],
          [VOYAGE_DECLARATION],
        ),
      ),
      RESOURCE_ADAPTER,
    );

    expect(cards.map((card) => card.resourceKeys)).toEqual([
      [...VOYAGE_RESOURCES],
      [...VOYAGE_RESOURCES],
    ]);
  });

  it('lets a row override the declared set (mixed-resource file)', () => {
    const cards = cardsFromCsv(
      parseCsv(
        contentCsv(
          [
            ['card-a', 'Card A', '', '', ''],
            ['card-b', 'Card B', '', '', '"stores,goodwill"', ''],
          ],
          [VOYAGE_DECLARATION],
        ),
      ),
      RESOURCE_ADAPTER,
    );

    expect(cards[0].resourceKeys).toEqual([...VOYAGE_RESOURCES]);
    expect(cards[1].resourceKeys).toEqual(['stores', 'goodwill']);
  });

  it('applies the declaration when the adapter maps no resources column', () => {
    const cards = cardsFromCsv(
      parseCsv(
        contentCsv(
          [['card-a', 'Card A', '', '']],
          [VOYAGE_DECLARATION],
          'id,name,effect,options',
        ),
      ),
      NO_RESOURCE_COLUMN_ADAPTER,
    );

    expect(cards[0].resourceKeys).toEqual([...VOYAGE_RESOURCES]);
  });
});

describe('validation: the declared set is the effective vocabulary', () => {
  it('validates an option against the file-declared set', () => {
    const result = validateContentCsv(
      contentCsv(
        [
          [
            'card-a',
            'Card A',
            '',
            'Sail on|card-b#cost=hull:1#when=stores>=2>card-b',
            '',
            'arc',
          ],
          ['card-b', 'Card B', '', '', '', 'arc'],
        ],
        [VOYAGE_DECLARATION],
      ),
      RESOURCE_ADAPTER,
    );

    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.code === 'unknown-resource-key')).toEqual([]);
  });

  it('fires unknown-resource-key for a key outside the declared set', () => {
    const issues = unknownResourceIssues(
      contentCsv(
        [
          ['card-a', 'Card A', '', 'Plunder|card-b#extra=plunder:+1', '', 'arc'],
          ['card-b', 'Card B', '', '', '', 'arc'],
        ],
        [VOYAGE_DECLARATION],
      ),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'unknown-resource-key',
      cardId: 'card-a',
      resource: 'plunder',
    });
  });

  it('validates a row override against the row, not the file default', () => {
    const csvText = contentCsv(
      [
        // Inherits the declaration: `hull` is a legal cost.
        ['card-a', 'Card A', '', 'Hold|card-c#cost=hull:1', '', 'arc'],
        // Overrides the declaration: `hull` is no longer declared here.
        ['card-c', 'Card C', '', 'Haul|card-a#cost=hull:1', 'stores', 'arc'],
      ],
      [VOYAGE_DECLARATION],
    );

    const issues = unknownResourceIssues(csvText);

    expect(issues.map((issue) => issue.cardId)).toEqual(['card-c']);
    expect(issues[0].resource).toBe('hull');
  });

  it('falls back to the engine default projection with no declaration or cells', () => {
    const csvText = contentCsv(
      [
        // `coins` / `reputation` are the engine defaults.
        ['card-a', 'Card A', '', 'Pay|card-b#cost=coins:2#when=reputation>=1', '', 'arc'],
        // Any other key is outside the default projection.
        ['card-b', 'Card B', '', 'Salvage|card-a#extra=hull:+1', '', 'arc'],
      ],
      [],
    );

    const result = validateContentCsv(csvText, RESOURCE_ADAPTER);
    const unknown = result.issues.filter(
      (issue) => issue.code === 'unknown-resource-key',
    );

    expect(unknown.map((issue) => [issue.cardId, issue.resource])).toEqual([
      ['card-b', 'hull'],
    ]);
  });
});

describe('authored edits preserve the declaration', () => {
  it('keeps the #resources line through an update-card edit', () => {
    const text = contentCsv(
      [
        ['card-a', 'Card A', '', '', ''],
        ['card-b', 'Card B', '', '', '', 'arc'],
      ],
      [VOYAGE_DECLARATION],
    );

    const result = updateContentCard(text, RESOURCE_ADAPTER, {
      id: 'card-a',
      name: 'Card A Renamed',
    });

    expect(result.ok).toBe(true);
    expect(result.csv.split('\n')[0]).toBe(VOYAGE_DECLARATION);
    // The edited file still reads the declaration back as its default set.
    const cards = cardsFromCsv(parseCsv(result.csv), RESOURCE_ADAPTER);
    expect(cards[0].name).toBe('Card A Renamed');
    expect(cards[0].resourceKeys).toEqual([...VOYAGE_RESOURCES]);
  });
});

describe('add-card inherits a file-level declaration', () => {
  /**
   * An adapter that seeds every new row with the full key list — the shape a
   * game adapter uses when it predates the per-file declaration.
   */
  const DEFAULTING_ADAPTER: ContentAdapter = {
    ...RESOURCE_ADAPTER,
    newCardDefaults: { resources: VOYAGE_RESOURCES.join(',') },
  };

  /** The new row's raw `resources` cell in the candidate text. */
  function resourcesCellOf(csvText: string, cardId: string): string {
    const parsed = parseCsv(csvText);
    const idIndex = parsed.header.indexOf('id');
    const resourcesIndex = parsed.header.indexOf('resources');
    const row = parsed.rows.find((candidate) => candidate[idIndex] === cardId);
    return row?.[resourcesIndex] ?? '';
  }

  it('leaves the cell blank so the new row inherits the declaration', () => {
    const text = contentCsv([['card-a', 'Card A', '', '', '']], [VOYAGE_DECLARATION]);

    const result = addContentCard(text, DEFAULTING_ADAPTER, {
      id: 'card-b',
      name: 'Card B',
    });

    expect(result.ok).toBe(true);
    expect(resourcesCellOf(result.csv, 'card-b')).toBe('');
    const cards = cardsFromCsv(parseCsv(result.csv), DEFAULTING_ADAPTER);
    const added = cards.find((card) => card.id === 'card-b');
    expect(added?.resourceKeys).toEqual([...VOYAGE_RESOURCES]);
  });

  it('still applies the adapter default when the file declares nothing', () => {
    const text = contentCsv([['card-a', 'Card A', '', '', '']]);

    const result = addContentCard(text, DEFAULTING_ADAPTER, {
      id: 'card-b',
      name: 'Card B',
    });

    expect(result.ok).toBe(true);
    expect(resourcesCellOf(result.csv, 'card-b')).toBe(VOYAGE_RESOURCES.join(','));
  });

  it('lets an explicit spec.resources override the declaration', () => {
    const text = contentCsv([['card-a', 'Card A', '', '', '']], [VOYAGE_DECLARATION]);

    const result = addContentCard(text, DEFAULTING_ADAPTER, {
      id: 'card-b',
      name: 'Card B',
      resources: 'coins,reputation',
    });

    expect(result.ok).toBe(true);
    expect(resourcesCellOf(result.csv, 'card-b')).toBe('coins,reputation');
    const cards = cardsFromCsv(parseCsv(result.csv), DEFAULTING_ADAPTER);
    const added = cards.find((card) => card.id === 'card-b');
    expect(added?.resourceKeys).toEqual(['coins', 'reputation']);
  });
});
