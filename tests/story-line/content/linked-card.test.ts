/**
 * Forward-reference authoring: `addLinkedContentCard`, the single-transaction
 * add-and-link path.
 *
 * A branch is otherwise authored *backwards* from its target, because an option
 * may not name a card that does not exist yet (`unknown-successor`) and a new
 * card added alone to an existing story-line is `unreachable-card`. These tests
 * pin the friction and its resolution:
 *
 * - the standalone add of the same card is refused as unreachable (the
 *   friction), while
 * - `addLinkedContentCard` applies the card **and** the predecessor option in
 *   one in-memory pass and validates the combined candidate once;
 * - either half failing leaves the input byte-identical (never half-authored);
 * - a missing predecessor, a duplicate id, a link it cannot express (no
 *   `options` column) and a duplicate option label are all refused by name;
 * - an existing options cell keeps its authored attributes, because the link is
 *   appended through the shared option-append primitive;
 * - a link can carry its own `#cost` / `#extra` / `#when` / `#says` metadata
 *   (the extended surface of `add-linked-card`), and an attribute naming an
 *   undeclared resource is refused before anything is written.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  addContentCard,
  addLinkedContentCard,
  readContentCards,
} from '../../../src/story-line/content/author';
import { compileContentOptions } from '../../../src/story-line/content/csv';
import { validateContentCsv } from '../../../src/story-line/content/validate';
import { TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
import { GYM_CONTENT_PATH, readFixture, readText } from './test-support';

const tavernCsv = readFixture('tavern-storylines.csv');
const gymCsv = readText(GYM_CONTENT_PATH);

/** The validator issue codes for a candidate. */
function issueCodes(csv: string, adapter = TAVERN_CONTENT_ADAPTER): string[] {
  return validateContentCsv(csv, adapter).issues.map((issue) => issue.code);
}

/** One card's `options` cell as projected from the candidate. */
function optionsOf(csv: string, id: string, adapter = TAVERN_CONTENT_ADAPTER): string | undefined {
  return readContentCards(csv, adapter).find((card) => card.id === id)?.options;
}

/** The tavern branch these tests author: a new beat linked from `tav-open`. */
const DETOUR = {
  card: {
    id: 'tav-detour',
    name: 'A Detour',
    effect: 'Take the long way round.',
    storylineId: 'tav',
    storylineTitle: 'Tavern Nights',
  },
  linkFrom: { id: 'tav-open', label: 'Take the detour' },
} as const;

describe('addLinkedContentCard — the forward-reference authoring path', () => {
  it('adds the card and its predecessor option in one validated transaction', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, DETOUR);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const cards = readContentCards(result.csv, TAVERN_CONTENT_ADAPTER);
    expect(cards.map((card) => card.id)).toContain('tav-detour');
    expect(cards.find((card) => card.id === 'tav-detour')).toMatchObject({
      name: 'A Detour',
      effect: 'Take the long way round.',
      storylineId: 'tav',
      storylineTitle: 'Tavern Nights',
    });

    // The predecessor gained the option, and only that: the existing cell is
    // preserved verbatim.
    expect(optionsOf(result.csv, 'tav-open')).toBe(
      'Admit|tav-inn;Turn away|;Take the detour|tav-detour',
    );

    // One validation over the combined candidate: the new card is reachable
    // and the new option names a card that exists.
    expect(validateContentCsv(result.csv, TAVERN_CONTENT_ADAPTER).valid).toBe(true);
    const codes = issueCodes(result.csv);
    expect(codes).not.toContain('unreachable-card');
    expect(codes).not.toContain('unknown-successor');
  });

  it('is what makes the forward reference legal: the same add without the link is refused', () => {
    // The friction this path resolves — a new card alone in an existing
    // story-line is unreachable, so it must be authored together with its link.
    const alone = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, DETOUR.card);
    expect(alone.ok).toBe(false);
    expect(alone.csv).toBe(tavernCsv);
    expect(alone.errors.join(' ')).toContain('unreachable');
    expect(alone.errors.join(' ')).toContain('tav-detour');
    expect(alone.validation?.issues.map((issue) => issue.code)).toContain(
      'unreachable-card',
    );
  });

  it('leaves every other card untouched', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, DETOUR);
    expect(result.ok).toBe(true);

    const untouched = (csv: string): unknown[] =>
      readContentCards(csv, TAVERN_CONTENT_ADAPTER).filter(
        (card) => card.id !== 'tav-open' && card.id !== 'tav-detour',
      );
    expect(untouched(result.csv)).toEqual(untouched(tavernCsv));
    expect(readContentCards(result.csv, TAVERN_CONTENT_ADAPTER)).toHaveLength(
      readContentCards(tavernCsv, TAVERN_CONTENT_ADAPTER).length + 1,
    );
  });

  it('refuses a predecessor that does not exist and adds nothing', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      card: DETOUR.card,
      linkFrom: { id: 'tav-ghost', label: 'Take the detour' },
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('predecessor card "tav-ghost" not found');
    expect(readContentCards(result.csv, TAVERN_CONTENT_ADAPTER).map((card) => card.id)).not.toContain(
      'tav-detour',
    );
  });

  it('refuses an already-present card id and adds nothing', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      card: { id: 'tav-inn', name: 'A Duplicate' },
      linkFrom: { id: 'tav-open', label: 'Another room' },
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('duplicate id');
    expect(result.errors.join(' ')).toContain('tav-inn');
  });

  it('requires a predecessor id', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      card: DETOUR.card,
      linkFrom: { id: '  ' },
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors).toContain('add-linked-card: --link-from is required');
  });

  it('defaults the option label to the new card name', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      card: { id: 'tav-way-out', name: 'A Way Out', storylineId: 'tav' },
      linkFrom: { id: 'tav-inn' },
    });
    expect(result.ok).toBe(true);
    expect(optionsOf(result.csv, 'tav-inn')).toBe(
      'Listen|tav-tale;Retire|;A Way Out|tav-way-out',
    );
    expect(issueCodes(result.csv)).not.toContain('invalid-option');
  });

  it('refuses a label the predecessor already declares', () => {
    const result = addLinkedContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      card: DETOUR.card,
      linkFrom: { id: 'tav-open', label: 'admit' },
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('more than once');
  });

  it('refuses an adapter that maps no options column', () => {
    const noOptionsAdapter = {
      ...TAVERN_CONTENT_ADAPTER,
      gameId: 'tavern-no-options',
      fields: { ...TAVERN_CONTENT_ADAPTER.fields, options: undefined },
    };
    const result = addLinkedContentCard(tavernCsv, noOptionsAdapter, DETOUR);
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('maps no options column');
  });

  it('appends to a cell that already carries option attributes', () => {
    // `gym-story-start` authors #cost / #extra / #when / #says metadata in the
    // same cell; the link is appended after all of it, never retyped.
    const before = readContentCards(gymCsv, GYM_CONTENT_ADAPTER).find(
      (card) => card.id === 'gym-story-start',
    );
    const result = addLinkedContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      card: {
        id: 'gym-story-detour',
        name: 'A Detour',
        effect: 'The scenic route.',
        storylineId: 'gym-story',
        storylineTitle: 'Gym Storyline',
        resources: 'coins,reputation',
      },
      linkFrom: { id: 'gym-story-start', label: 'Take the detour' },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const start = readContentCards(result.csv, GYM_CONTENT_ADAPTER).find(
      (card) => card.id === 'gym-story-start',
    );
    expect(start?.options.startsWith(before!.options)).toBe(true);
    expect(start?.options.endsWith(';Take the detour|gym-story-detour')).toBe(true);

    // The authored metadata of the existing options still compiles.
    const options = compileContentOptions(start!);
    expect(options[0]).toMatchObject({
      label: 'Invest',
      cost: { coins: 5 },
      extraEffect: { reputation: 2 },
    });
    expect(options[options.length - 1]).toMatchObject({
      label: 'Take the detour',
      successorIds: ['gym-story-detour'],
    });
    const codes = issueCodes(result.csv, GYM_CONTENT_ADAPTER);
    expect(codes).not.toContain('unreachable-card');
    expect(codes).not.toContain('unknown-successor');
    expect(validateContentCsv(result.csv, GYM_CONTENT_ADAPTER).valid).toBe(true);
  });

  it('encodes authored attributes on the generated link option', () => {
    // The extended surface: a gated branch is authored in the same transaction
    // as the card and its incoming option — no follow-up `add-option` pass.
    const result = addLinkedContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      card: {
        id: 'gym-story-detour',
        name: 'A Detour',
        effect: 'The scenic route.',
        storylineId: 'gym-story',
        storylineTitle: 'Gym Storyline',
        resources: 'coins,reputation',
      },
      linkFrom: {
        id: 'gym-story-start',
        label: 'Take the detour',
        attributes: ['cost=coins:2', '#extra=reputation:+1'],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const start = readContentCards(result.csv, GYM_CONTENT_ADAPTER).find(
      (card) => card.id === 'gym-story-start',
    );
    expect(start?.options.endsWith(
      ';Take the detour|gym-story-detour#cost=coins:2#extra=reputation:+1',
    )).toBe(true);

    const options = compileContentOptions(start!);
    expect(options[options.length - 1]).toMatchObject({
      label: 'Take the detour',
      successorIds: ['gym-story-detour'],
      cost: { coins: 2 },
      extraEffect: { reputation: 1 },
    });
    expect(validateContentCsv(result.csv, GYM_CONTENT_ADAPTER).valid).toBe(true);
  });

  it('refuses a link attribute naming an undeclared resource, writing nothing', () => {
    const result = addLinkedContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      card: {
        id: 'gym-story-detour',
        name: 'A Detour',
        effect: 'The scenic route.',
        storylineId: 'gym-story',
        storylineTitle: 'Gym Storyline',
        resources: 'coins,reputation',
      },
      linkFrom: {
        id: 'gym-story-start',
        label: 'Take the detour',
        attributes: ['cost=gold:2'],
      },
    });
    expect(result.ok).toBe(false);
    // The card was applied in memory, but the refused link means the unchanged
    // input is returned: the file is never half-authored.
    expect(result.csv).toBe(gymCsv);
    expect(result.errors.join(' ')).toContain('gold');
    expect(readContentCards(result.csv, GYM_CONTENT_ADAPTER).map((card) => card.id)).not.toContain(
      'gym-story-detour',
    );
  });
});
