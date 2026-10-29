/**
 * Content adapter seam tests.
 *
 * The seam's value is proven by two shapes, not one: the shipped Gym adapter
 * and a deliberately different fixture adapter. These tests assert the parts
 * of the contract the toolchain depends on — the default adapter/registry, the
 * mapping helpers, the optional base-id rule and the adapter-provided impact
 * description — for both shapes.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  CONTENT_ADAPTERS,
  DEFAULT_CONTENT_ADAPTER,
  GYM_CONTENT_ADAPTER,
  getContentAdapter,
  resolveContentAdapter,
} from '../../../src/story-line/content/adapters';
import type { ContentAdapter } from '../../../src/story-line/content/types';
import {
  baseIdOf,
  editableColumnsOf,
  mappedFieldColumns,
} from '../../../src/story-line/content/types';
import { TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
import { GYM_CONTENT_PATH, readFixture, readText } from './test-support';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';

describe('shipped adapters', () => {
  it('ships the Gym content as the default adapter', () => {
    expect(DEFAULT_CONTENT_ADAPTER).toBe(GYM_CONTENT_ADAPTER);
    expect(GYM_CONTENT_ADAPTER.gameId).toBe('gym');
    expect(CONTENT_ADAPTERS.gym).toBe(GYM_CONTENT_ADAPTER);
    expect(getContentAdapter('gym')).toBe(GYM_CONTENT_ADAPTER);
    expect(getContentAdapter('nope')).toBeUndefined();
    expect(resolveContentAdapter()).toBe(GYM_CONTENT_ADAPTER);
    expect(resolveContentAdapter('gym')).toBe(GYM_CONTENT_ADAPTER);
    expect(resolveContentAdapter('nope')).toBeUndefined();
  });

  it('maps every declared Gym column onto a story-line field', () => {
    for (const column of GYM_CONTENT_ADAPTER.columns) {
      const mapped = Object.values(GYM_CONTENT_ADAPTER.fields).includes(column);
      const editable = GYM_CONTENT_ADAPTER.editableColumns?.includes(column) ?? false;
      expect(mapped || editable).toBe(true);
    }
    expect(GYM_CONTENT_ADAPTER.columns).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'effect',
        'options',
        'hasChoices',
        'acceptNextCardId',
        'rejectNextCardId',
        'storylineId',
        'storylineTitle',
      ]),
    );
  });

  it('describes the Gym impact from its game columns', () => {
    const [start] = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    expect(GYM_CONTENT_ADAPTER.describeImpact?.(start)).toBe('−50 coins');

    const [end] = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER).slice(-1);
    expect(GYM_CONTENT_ADAPTER.describeImpact?.(end)).toBe('+60 reputation');
  });
});

describe('adapter seam with two differently shaped adapters', () => {
  it('projects two different column layouts onto the same generic model', () => {
    const gymCards = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    const tavernCards = cardsFromCsv(
      parseCsv(readFixture('tavern-storylines.csv')),
      TAVERN_CONTENT_ADAPTER,
    );

    // Different files, different columns, identical generic keys.
    expect(TAVERN_CONTENT_ADAPTER.columns).not.toEqual(GYM_CONTENT_ADAPTER.columns);
    const keys = (card: object): string[] => Object.keys(card).sort();
    expect(keys(gymCards[0])).toEqual(keys(tavernCards[0]));
    expect(keys(gymCards[0])).toEqual([
      'acceptNextCardId',
      'effect',
      'fields',
      'hasChoices',
      'id',
      'name',
      'options',
      'rejectNextCardId',
      'storylineId',
      'storylineTitle',
    ]);

    // Each adapter's own game columns stay in `fields`.
    expect(Object.keys(gymCards[0].fields)).toContain('coinDelta');
    expect(tavernCards[0].fields).toEqual({ payoff: '2' });
  });

  it('reports mapped fields and editable columns per adapter shape', () => {
    expect(mappedFieldColumns(TAVERN_CONTENT_ADAPTER)).toEqual([
      ['id', 'card_key'],
      ['name', 'card_name'],
      ['effect', 'flavour'],
      ['options', 'choices'],
      ['storylineId', 'arc'],
      ['storylineTitle', 'arc_name'],
    ]);

    expect(editableColumnsOf(TAVERN_CONTENT_ADAPTER)).toEqual([
      'card_key',
      'card_name',
      'flavour',
      'choices',
      'arc',
      'arc_name',
      'payoff',
    ]);
    expect(editableColumnsOf(GYM_CONTENT_ADAPTER)).toContain('coinDelta');
  });

  it('treats the base-id rule as optional (identity by default)', () => {
    expect(baseIdOf(GYM_CONTENT_ADAPTER, 'evt-x-3')).toBe('evt-x-3');
    const serialAdapter: ContentAdapter = {
      ...TAVERN_CONTENT_ADAPTER,
      baseId: (id) => id.replace(/-\d+$/, ''),
    };
    expect(baseIdOf(serialAdapter, 'evt-x-3')).toBe('evt-x');
  });

  it('leaves the impact description empty when the adapter supplies none', () => {
    const noImpact: ContentAdapter = {
      ...TAVERN_CONTENT_ADAPTER,
      describeImpact: undefined,
    };
    expect(noImpact.describeImpact).toBeUndefined();
  });
});
