/**
 * Story-line content CSV tests.
 *
 * Covers the two properties the authoring tooling relies on — byte-identical
 * round-tripping of a canonically quoted file and a deterministic content
 * checksum — plus projection of rows onto the generic content model through
 * two differently shaped adapters.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import type { ContentAdapter, ContentCard } from '../../../src/story-line/content/types';
import {
  cardsFromCsv,
  compileContentOptions,
  computeContentChecksum,
  escapeCsvField,
  findMissingColumns,
  optionSuccessorIds,
  parseCsv,
  serialiseCsv,
} from '../../../src/story-line/content/csv';
import { TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
import { GYM_CONTENT_PATH, readFixture, readText } from './test-support';

/** A content card with only the fields a test needs. */
function card(overrides: Partial<ContentCard> = {}): ContentCard {
  return {
    id: 'card-a',
    name: 'Card A',
    effect: '',
    hasChoices: false,
    acceptNextCardId: null,
    rejectNextCardId: null,
    options: '',
    storylineId: null,
    storylineTitle: null,
    fields: {},
    ...overrides,
  };
}

describe('parseCsv / serialiseCsv', () => {
  it('round-trips the shipped Gym content byte-identically', () => {
    const text = readText(GYM_CONTENT_PATH);
    expect(serialiseCsv(parseCsv(text))).toBe(text);
  });

  it('round-trips a differently shaped fixture byte-identically', () => {
    const text = readFixture('tavern-storylines.csv');
    expect(serialiseCsv(parseCsv(text))).toBe(text);
  });

  it('preserves column order when the file reorders columns', () => {
    const text = 'card_name,card_key,payoff\nName,key-1,3\n';
    const parsed = parseCsv(text);
    expect(parsed.header).toEqual(['card_name', 'card_key', 'payoff']);
    expect(serialiseCsv(parsed)).toBe(text);
  });

  it('round-trips quoted fields containing commas, quotes and newlines', () => {
    const text = 'a,b,c\n"x, y","he said ""hi""","line one\nline two"\n';
    const parsed = parseCsv(text);
    expect(parsed.rows[0]).toEqual(['x, y', 'he said "hi"', 'line one\nline two']);
    expect(serialiseCsv(parsed)).toBe(text);
  });

  it('normalises CRLF input to LF output (canonical form)', () => {
    expect(serialiseCsv(parseCsv('a,b\r\n1,2\r\n'))).toBe('a,b\n1,2\n');
  });

  it('does not invent a final record for a terminal newline', () => {
    expect(parseCsv('a,b\n1,2\n').rows).toHaveLength(1);
  });

  it('quotes a field only when it needs quoting', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('computeContentChecksum', () => {
  it('is stable for identical content and differs for any change', () => {
    const text = readText(GYM_CONTENT_PATH);
    const checksum = computeContentChecksum(text);
    expect(checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(computeContentChecksum(text)).toBe(checksum);
    expect(computeContentChecksum(`${text} `)).not.toBe(checksum);
    expect(computeContentChecksum(text.replace('Town Meeting', 'Town Gathering'))).not.toBe(
      checksum,
    );
  });
});

describe('findMissingColumns', () => {
  it('accepts a header that carries every mapped column', () => {
    expect(findMissingColumns(GYM_CONTENT_ADAPTER.columns, GYM_CONTENT_ADAPTER)).toEqual([]);
  });

  it('names the required columns a foreign header lacks', () => {
    expect(findMissingColumns(['card_key', 'card_name'], GYM_CONTENT_ADAPTER)).toEqual([
      'id',
      'name',
    ]);
  });
});

describe('cardsFromCsv', () => {
  it('projects the Gym content onto the generic model plus its game columns', () => {
    const cards = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    expect(cards.map((entry) => entry.id)).toEqual([
      'gym-story-start',
      'gym-story-invest',
      'gym-story-ignore',
      'gym-story-end',
    ]);

    const start = cards[0];
    expect(start.name).toBe('Town Meeting');
    expect(start.effect).toBe('Lose 50 coins');
    expect(start.options).toBe('Invest|gym-story-invest;Ignore|gym-story-ignore');
    expect(start.hasChoices).toBe(false);
    expect(start.acceptNextCardId).toBeNull();
    expect(start.storylineId).toBe('gym-story');
    expect(start.storylineTitle).toBe('Gym Storyline');
    expect(start.fields).toMatchObject({
      trigger: 'Incident',
      cost: '0',
      coinDelta: '-50',
      reputationDelta: '0',
    });
  });

  it('projects a column-mapped fixture through a differently shaped adapter', () => {
    const cards = cardsFromCsv(
      parseCsv(readFixture('tavern-storylines.csv')),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(cards.map((entry) => entry.id)).toEqual(['tav-open', 'tav-inn', 'tav-tale']);

    const first = cards[0];
    expect(first.name).toBe('Open the Door');
    expect(first.effect).toBe('A stranger knocks at the tavern door.');
    expect(first.options).toBe('Admit|tav-inn;Turn away|');
    // No hasChoices / accept / reject columns in this shape.
    expect(first.hasChoices).toBe(false);
    expect(first.acceptNextCardId).toBeNull();
    expect(first.rejectNextCardId).toBeNull();
    expect(first.storylineId).toBe('tav');
    expect(first.storylineTitle).toBe('Tavern Nights');
    expect(first.fields).toEqual({ payoff: '2' });
  });

  it('reads a missing optional column as absent rather than failing', () => {
    const sparse: ContentAdapter = {
      gameId: 'sparse',
      columns: ['key', 'title'],
      fields: { id: 'key', name: 'title' },
    };
    const [parsed] = cardsFromCsv(parseCsv('key,title\nk-1,A Card\n'), sparse);
    expect(parsed).toMatchObject({
      id: 'k-1',
      name: 'A Card',
      effect: '',
      hasChoices: false,
      options: '',
      storylineId: null,
    });
  });
});

describe('compileContentOptions', () => {
  it('compiles legacy hasChoices fields into Accept/Reject options', () => {
    const options = compileContentOptions(
      card({
        hasChoices: true,
        acceptNextCardId: 'card-b',
        rejectNextCardId: 'card-c',
      }),
    );
    expect(options).toEqual([
      { label: 'Accept', successorId: 'card-b', effectPolicy: 'apply' },
      { label: 'Reject', successorId: 'card-c', effectPolicy: 'skip' },
    ]);
  });

  it('prefers the options encoding over legacy fields', () => {
    const options = compileContentOptions(
      card({
        hasChoices: true,
        acceptNextCardId: 'card-b',
        options: 'Invest|card-c,card-d;Walk|',
      }),
    );
    expect(options).toEqual([
      { label: 'Invest', successorIds: ['card-c', 'card-d'], effectPolicy: 'apply' },
      { label: 'Walk', successorIds: [], effectPolicy: 'apply' },
    ]);
  });

  it('rejects a malformed options encoding', () => {
    expect(() => compileContentOptions(card({ options: 'NoSeparator' }))).toThrow(
      /missing the "\|" separator/,
    );
  });

  it('returns no options for a plain incident', () => {
    expect(compileContentOptions(card())).toEqual([]);
  });
});

describe('optionSuccessorIds', () => {
  it('prefers the candidate set and applies the adapter base-id rule', () => {
    const adapter: ContentAdapter = {
      ...TAVERN_CONTENT_ADAPTER,
      baseId: (id) => id.replace(/-\d+$/, ''),
    };
    expect(
      optionSuccessorIds(
        { label: 'A', successorIds: ['tav-inn-3'], effectPolicy: 'apply' },
        adapter,
      ),
    ).toEqual(['tav-inn']);
    expect(
      optionSuccessorIds(
        { label: 'A', successorId: 'tav-tale-2', effectPolicy: 'apply' },
        adapter,
      ),
    ).toEqual(['tav-tale']);
  });

  it('reports a terminal option with no successors', () => {
    expect(optionSuccessorIds({ label: 'End', effectPolicy: 'apply' }, TAVERN_CONTENT_ADAPTER)).toEqual(
      [],
    );
  });
});
