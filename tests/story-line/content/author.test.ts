/**
 * Transactional authoring tests.
 *
 * The author API is the single write path for story-line content, so these
 * tests assert the transaction rather than just the happy path: an invalid
 * edit writes nothing, a dry run leaves the file byte-identical, a valid edit
 * lands atomically, and only the supplied fields change.
 *
 * @module
 */
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  addContentCard,
  addOptionToContentCard,
  applyContentEditToFile,
  hasContentCard,
  readContentCards,
  updateContentCard,
} from '../../../src/story-line/content/author';
import { validateContentCsv } from '../../../src/story-line/content/validate';
import {
  compileContentOptions,
  contentCardHasChoice,
  parseCsv,
} from '../../../src/story-line/content/csv';
import { runStorylineAuthorCli } from '../../../scripts/storyline-author';
import { PROSE_CONTENT_ADAPTER, TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
import {
  GYM_CONTENT_PATH,
  captureOutput,
  fixturePath,
  makeTempDir,
  readFixture,
  readText,
  type TempDir,
} from './test-support';

const tavernCsv = readFixture('tavern-storylines.csv');

describe('addContentCard', () => {
  it('appends a standalone card without rewriting existing bytes', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
      effect: 'Nothing much happens.',
      fields: { payoff: '4' },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.csv.startsWith(tavernCsv)).toBe(true);

    const cards = readContentCards(result.csv, TAVERN_CONTENT_ADAPTER);
    expect(cards.map((entry) => entry.id)).toContain('tav-extra');
    expect(cards[cards.length - 1]).toMatchObject({
      id: 'tav-extra',
      name: 'An Extra Card',
      fields: { payoff: '4' },
    });
    expect(validateContentCsv(result.csv, TAVERN_CONTENT_ADAPTER).valid).toBe(true);
  });

  it('refuses a new unlinked card that would be unreachable in its story-line', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-orphan',
      name: 'An Orphan',
      storylineId: 'tav',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('unreachable');
  });

  it('round-trips options-authored content byte-identically', () => {
    const spec = {
      id: 'tav-extra',
      name: 'An Extra Card',
      effect: 'Nothing much happens.',
      options: 'Leave|tav-inn',
      storylineId: 'tav-extra-arc',
      fields: { payoff: '4' },
    };
    const added = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, spec);
    expect(added.ok).toBe(true);

    // Re-applying the same authored values must not change a single byte.
    const rewritten = updateContentCard(added.csv, TAVERN_CONTENT_ADAPTER, spec);
    expect(rewritten.ok).toBe(true);
    expect(rewritten.csv).toBe(added.csv);
  });

  it('accepts and round-trips #says outcome prose through add and update', () => {
    const options =
      'Leave|tav-inn#says=You step out into the rain, and the door shuts behind you.';
    const spec = {
      id: 'tav-extra',
      name: 'An Extra Card',
      effect: 'Nothing much happens.',
      options,
      storylineId: 'tav-extra-arc',
      fields: { payoff: '4' },
    };
    const added = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, spec);
    expect(added.ok).toBe(true);
    expect(added.errors).toEqual([]);

    const card = readContentCards(added.csv, TAVERN_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'tav-extra',
    );
    expect(card?.options).toBe(options);
    expect(compileContentOptions(card!)[0]).toMatchObject({
      label: 'Leave',
      says: 'You step out into the rain, and the door shuts behind you.',
    });

    // Re-applying the same authored values must not change a single byte.
    const rewritten = updateContentCard(added.csv, TAVERN_CONTENT_ADAPTER, spec);
    expect(rewritten.ok).toBe(true);
    expect(rewritten.csv).toBe(added.csv);

    // A prose edit lands as authored, escapes and all.
    const edited = updateContentCard(added.csv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      options: 'Leave|tav-inn#says=You leave, and the note says \\# 4.',
    });
    expect(edited.ok).toBe(true);
    const recompiled = compileContentOptions(
      readContentCards(edited.csv, TAVERN_CONTENT_ADAPTER).find(
        (entry) => entry.id === 'tav-extra',
      )!,
    );
    expect(recompiled[0]?.says).toBe('You leave, and the note says # 4.');
  });

  it('refuses a #says value with an unescaped reserved character', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
      options: 'Leave|tav-inn#says=Two things happened; and more',
      storylineId: 'tav-extra-arc',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('unescaped');
    expect(result.csv).toBe(tavernCsv);
  });

  it('refuses a duplicate id', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-open',
      name: 'Another Open',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('duplicate id');
    expect(result.csv).toBe(tavernCsv);
  });

  it('refuses a missing id or name', () => {
    expect(
      addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, { id: '', name: 'X' }).errors,
    ).toContain('add-card: --id is required');
    expect(
      addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, { id: 'tav-x', name: '' }).errors,
    ).toContain('add-card: --name is required');
  });

  it('refuses unknown or mapped columns passed as game fields', () => {
    const unknown = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-x',
      name: 'X',
      fields: { nope: '1' },
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.errors.join(' ')).toContain('unknown content column "nope"');

    const mapped = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-x',
      name: 'X',
      fields: { choices: 'Go|tav-inn' },
    });
    expect(mapped.ok).toBe(false);
    expect(mapped.errors.join(' ')).toContain('mapped story-line column');
  });

  it('refuses content that fails validation (dangling successor)', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-x',
      name: 'X',
      options: 'Go|tav-nowhere',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('tav-nowhere');
  });
});

describe('add-card positional insert', () => {
  /** Card ids of a content CSV, in file order. */
  const rowIds = (csv: string): string[] => {
    const parsed = parseCsv(csv);
    const idIndex = parsed.header.indexOf(TAVERN_CONTENT_ADAPTER.fields.id);
    return parsed.rows.map((row) => row[idIndex] ?? '');
  };

  it('inserts the new row directly after the named predecessor', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
      effect: 'The detour costs a day.',
      fields: { payoff: '3' },
      after: 'tav-inn',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(rowIds(result.csv)).toEqual(['tav-open', 'tav-inn', 'tav-extra', 'tav-tale']);

    // Only the new line is added: dropping it reproduces the input
    // byte-for-byte, so no existing row was rewritten.
    const withoutInsert = result.csv
      .split('\n')
      .filter((line) => !line.startsWith('tav-extra,'));
    expect(withoutInsert.join('\n')).toBe(tavernCsv);
  });

  it('appends when no position is given', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
      fields: { payoff: '3' },
    });
    expect(result.ok).toBe(true);
    expect(result.csv.startsWith(tavernCsv)).toBe(true);
    expect(rowIds(result.csv)).toEqual(['tav-open', 'tav-inn', 'tav-tale', 'tav-extra']);
  });

  it('refuses an `after` that names no card, naming the id', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
      after: 'tav-ghost',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors).toContain(
      'add-card: --after card "tav-ghost" not found (no such card id)',
    );
  });

  it('inserts into a multi-member story-line without re-pointing the entry card', () => {
    // Step 1: author the card just after its predecessor. It carries no
    // story-line yet (a choice card without one is invalid), so it is not a
    // member and reachability is unaffected.
    const added = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-follow',
      name: 'Following the Stranger',
      effect: 'The road south is long.',
      after: 'tav-inn',
    });
    expect(added.ok).toBe(true);
    expect(rowIds(added.csv)).toEqual(['tav-open', 'tav-inn', 'tav-follow', 'tav-tale']);

    // Step 2: link it in. `tav-open` stays the entry card (the first member
    // with no incoming edge), so every member remains reachable — a re-pointed
    // entry would surface as `unreachable-card` on the old entry.
    const linked = updateContentCard(added.csv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-inn',
      options: 'Listen|tav-tale;Follow|tav-follow;Retire|',
    });
    expect(linked.ok).toBe(true);
    const member = updateContentCard(linked.csv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-follow',
      storylineId: 'tav',
      storylineTitle: 'Tavern Nights',
    });
    expect(member.ok).toBe(true);

    expect(rowIds(member.csv)[0]).toBe('tav-open');
    const validation = validateContentCsv(member.csv, TAVERN_CONTENT_ADAPTER);
    expect(validation.valid).toBe(true);
    expect(
      validation.issues.filter((issue) => issue.code === 'unreachable-card'),
    ).toEqual([]);
  });

  it('refuses an append that would silently re-point the entry card', () => {
    // Linking back at the old entry would make it "linked to" within the
    // story-line, so the appended card — the first member with no incoming
    // link — would become the entry. Validation accepts that shape, so the
    // author seam refuses it and names both cards.
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
      storylineId: 'tav',
      storylineTitle: 'Tavern Nights',
      options: 'Back|tav-open',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    const message = result.errors.join(' ');
    expect(message).toContain('re-point');
    expect(message).toContain('tav-open');
    expect(message).toContain('tav-extra');
    expect(message).toContain('--link-from');
  });

  it('accepts a new story-line, whose new card is its entry', () => {
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-other',
      name: 'Another Night',
      storylineId: 'tav-two',
      storylineTitle: 'Other Nights',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('updateContentCard', () => {
  it('changes only the supplied fields and leaves the content valid', () => {
    const result = updateContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-tale',
      name: 'A Longer Tale',
      fields: { payoff: '9' },
    });
    expect(result.ok).toBe(true);

    const cards = readContentCards(result.csv, TAVERN_CONTENT_ADAPTER);
    const tale = cards.find((entry) => entry.id === 'tav-tale');
    expect(tale).toMatchObject({ name: 'A Longer Tale', fields: { payoff: '9' } });
    expect(tale?.effect).toBe('The stranger speaks of the long road south.');
    expect(validateContentCsv(result.csv, TAVERN_CONTENT_ADAPTER).valid).toBe(true);
  });

  it('links a card into a story-line in a second edit', () => {
    const added = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Card',
    });
    expect(added.ok).toBe(true);

    const linked = updateContentCard(added.csv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-tale',
      options: 'Visit|tav-extra',
    });
    expect(linked.ok).toBe(true);
    const tale = readContentCards(linked.csv, TAVERN_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'tav-tale',
    );
    expect(tale?.options).toBe('Visit|tav-extra');
  });

  it('clears a nullable field with an explicit null', () => {
    const result = updateContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-tale',
      storylineId: null,
    });
    expect(result.ok).toBe(true);
    const tale = readContentCards(result.csv, TAVERN_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'tav-tale',
    );
    expect(tale?.storylineId).toBeNull();
  });

  it('refuses an unknown card id and an edit that breaks validation', () => {
    const missing = updateContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-nope',
      name: 'Nope',
    });
    expect(missing.ok).toBe(false);
    expect(missing.csv).toBe(tavernCsv);

    const dangling = updateContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-open',
      options: 'Admit|tav-gone',
    });
    expect(dangling.ok).toBe(false);
    expect(dangling.errors.join(' ')).toContain('tav-gone');
    expect(dangling.csv).toBe(tavernCsv);
  });

  it('makes a card a choice through its options encoding', () => {
    const gymCsv = readText(GYM_CONTENT_PATH);
    const result = updateContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      id: 'gym-story-end',
      options: 'Revisit|gym-story-start',
    });
    expect(result.ok).toBe(true);
    const end = readContentCards(result.csv, GYM_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'gym-story-end',
    );
    expect(end?.options).toBe('Revisit|gym-story-start');
    expect(end && contentCardHasChoice(end)).toBe(true);
  });
});

describe('addOptionToContentCard', () => {
  it('appends one option without retyping the existing cell', () => {
    const result = addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-open',
      label: 'Ask after the road',
      target: 'tav-tale',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const open = readContentCards(result.csv, TAVERN_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'tav-open',
    );
    // The authored options stay byte-identical and the new one is appended.
    expect(open?.options).toBe('Admit|tav-inn;Turn away|;Ask after the road|tav-tale');

    // No unknown-successor and no invalid-option: the appended option is valid.
    const codes = (result.validation?.issues ?? []).map((issue) => issue.code);
    expect(codes).not.toContain('unknown-successor');
    expect(codes).not.toContain('invalid-option');
    expect(validateContentCsv(result.csv, TAVERN_CONTENT_ADAPTER).valid).toBe(true);
  });

  it('leaves every other cell of the content untouched', () => {
    const result = addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-open',
      label: 'Ask after the road',
      target: 'tav-tale',
    });
    expect(result.ok).toBe(true);

    const withoutOptions = (csv: string): unknown[] =>
      readContentCards(csv, TAVERN_CONTENT_ADAPTER).map(({ options: _options, ...rest }) => rest);
    expect(withoutOptions(result.csv)).toEqual(withoutOptions(tavernCsv));
  });

  it('turns a plain card into a choice card and keeps a dangling ; single', () => {
    const added = addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-tale',
      label: 'Leave at dawn',
    });
    expect(added.ok).toBe(true);
    const tale = readContentCards(added.csv, TAVERN_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'tav-tale',
    );
    expect(tale?.options).toBe('Leave at dawn|');
    expect(validateContentCsv(added.csv, TAVERN_CONTENT_ADAPTER).valid).toBe(true);

    // Appending to a cell that already ends in `;` does not create an empty
    // option between the entries (the dropped-`;` friction, in reverse).
    const trailingCsv = [
      'card_key,card_name,flavour,arc,arc_name,choices,payoff',
      'tav-a,First,Opening.,tav,Tavern,Go|tav-b;,1',
      'tav-b,Second,Closing.,tav,Tavern,,2',
      '',
    ].join('\n');
    const appended = addOptionToContentCard(trailingCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-a',
      label: 'Stay',
    });
    expect(appended.ok).toBe(true);
    expect(
      readContentCards(appended.csv, TAVERN_CONTENT_ADAPTER).find(
        (entry) => entry.id === 'tav-a',
      )?.options,
    ).toBe('Go|tav-b;Stay|');
  });

  it('appends declared option attributes verbatim and validates them', () => {
    const gymCsv = readText(GYM_CONTENT_PATH);
    const result = addOptionToContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      id: 'gym-story-invest',
      label: 'Wait for spring',
      target: 'gym-story-end',
      attributes: ['cost=coins:2', '#extra=reputation:+1', 'when=coins>=1>gym-story-end'],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const invest = readContentCards(result.csv, GYM_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'gym-story-invest',
    );
    expect(invest?.options.endsWith(
      'Wait for spring|gym-story-end#cost=coins:2#extra=reputation:+1#when=coins>=1>gym-story-end',
    )).toBe(true);
    const appended = compileContentOptions(invest!);
    expect(appended[appended.length - 1]).toMatchObject({
      label: 'Wait for spring',
      successorIds: ['gym-story-end'],
      cost: { coins: 2 },
      extraEffect: { reputation: 1 },
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>=', value: 1 }, successorId: 'gym-story-end' },
      ],
    });
  });

  it('refuses a duplicate option label on the same card', () => {
    const result = addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-open',
      label: 'admit',
      target: 'tav-tale',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('duplicate option label');
    expect(result.errors.join(' ')).toContain('admit');
  });

  it('refuses an option that references a card that does not exist', () => {
    const result = addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-open',
      label: 'Follow the stranger',
      target: 'tav-ghost',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('tav-ghost');
    expect((result.validation?.issues ?? []).map((issue) => issue.code)).toContain(
      'unknown-successor',
    );
  });

  it('refuses an unknown resource key in an authored attribute', () => {
    const gymCsv = readText(GYM_CONTENT_PATH);
    const result = addOptionToContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      id: 'gym-story-invest',
      label: 'Buy the harbour',
      target: 'gym-story-end',
      attributes: ['cost=gold:1'],
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(gymCsv);
    expect(result.errors.join(' ')).toContain('gold');
  });

  it('refuses a missing id, a missing label and an unknown card id', () => {
    expect(
      addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, { id: '', label: 'X' }).errors,
    ).toContain('add-option: --id is required');
    expect(
      addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, { id: 'tav-open', label: ' ' })
        .errors,
    ).toContain('add-option: --label is required');

    const missing = addOptionToContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-nope',
      label: 'X',
    });
    expect(missing.ok).toBe(false);
    expect(missing.csv).toBe(tavernCsv);
    expect(missing.errors.join(' ')).toContain('card id "tav-nope" not found');
  });

  it('refuses an adapter that maps no options column', () => {
    const noOptionsAdapter = {
      ...TAVERN_CONTENT_ADAPTER,
      gameId: 'tavern-no-options',
      fields: { ...TAVERN_CONTENT_ADAPTER.fields, options: undefined },
    };
    const result = addOptionToContentCard(tavernCsv, noOptionsAdapter, {
      id: 'tav-open',
      label: 'Ask after the road',
    });
    expect(result.ok).toBe(false);
    expect(result.csv).toBe(tavernCsv);
    expect(result.errors.join(' ')).toContain('maps no options column');
  });
});

describe('applyContentEditToFile', () => {
  let temp: TempDir;
  let contentPath: string;

  beforeEach(() => {
    temp = makeTempDir();
    contentPath = join(temp.path, 'tavern.csv');
    copyFileSync(fixturePath('tavern-storylines.csv'), contentPath);
  });

  afterEach(() => temp.cleanup());

  it('writes a valid edit atomically', () => {
    const result = applyContentEditToFile({
      contentPath,
      adapter: TAVERN_CONTENT_ADAPTER,
      mutate: (csv) =>
        updateContentCard(csv, TAVERN_CONTENT_ADAPTER, {
          id: 'tav-tale',
          name: 'A Longer Tale',
        }),
    });
    expect(result).toMatchObject({ ok: true, written: true, path: contentPath });
    expect(readText(contentPath)).toBe(result.csv);
    expect(readText(contentPath)).toContain('A Longer Tale');
    expect(validateContentCsv(readText(contentPath), TAVERN_CONTENT_ADAPTER).valid).toBe(true);
  });

  it('leaves the file byte-identical on a dry run', () => {
    const before = readFileSync(contentPath, 'utf-8');
    const result = applyContentEditToFile({
      contentPath,
      adapter: TAVERN_CONTENT_ADAPTER,
      dryRun: true,
      mutate: (csv) =>
        updateContentCard(csv, TAVERN_CONTENT_ADAPTER, {
          id: 'tav-tale',
          name: 'Preview Only',
        }),
    });
    expect(result).toMatchObject({ ok: true, written: false });
    expect(result.csv).toContain('Preview Only');
    expect(readFileSync(contentPath, 'utf-8')).toBe(before);
  });

  it('writes nothing when validation fails', () => {
    const before = readFileSync(contentPath, 'utf-8');
    const result = applyContentEditToFile({
      contentPath,
      adapter: TAVERN_CONTENT_ADAPTER,
      mutate: (csv) =>
        updateContentCard(csv, TAVERN_CONTENT_ADAPTER, {
          id: 'tav-open',
          options: 'Admit|tav-gone',
        }),
    });
    expect(result).toMatchObject({ ok: false, written: false });
    expect(result.errors.join(' ')).toContain('tav-gone');
    expect(readFileSync(contentPath, 'utf-8')).toBe(before);
  });

  it('writes nothing when the target card does not exist', () => {
    const before = readFileSync(contentPath, 'utf-8');
    const result = applyContentEditToFile({
      contentPath,
      adapter: TAVERN_CONTENT_ADAPTER,
      mutate: (csv) =>
        updateContentCard(csv, TAVERN_CONTENT_ADAPTER, { id: 'tav-nope', name: 'X' }),
    });
    expect(result).toMatchObject({ ok: false, written: false });
    expect(readFileSync(contentPath, 'utf-8')).toBe(before);
  });
});

describe('content read helpers', () => {
  it('projects cards back from CSV and reports membership', () => {
    const cards = readContentCards(tavernCsv, TAVERN_CONTENT_ADAPTER);
    expect(cards).toHaveLength(3);
    expect(hasContentCard(cards, TAVERN_CONTENT_ADAPTER, 'tav-inn')).toBe(true);
    expect(hasContentCard(cards, TAVERN_CONTENT_ADAPTER, 'tav-nope')).toBe(false);
  });
});

describe('storyline-author CLI', () => {
  let temp: TempDir;
  let contentPath: string;

  beforeEach(() => {
    temp = makeTempDir();
    contentPath = join(temp.path, 'storylines.csv');
    copyFileSync(GYM_CONTENT_PATH, contentPath);
  });

  afterEach(() => temp.cleanup());

  it('applies add-card and update-card against the content file', () => {
    const added = captureOutput(() =>
      runStorylineAuthorCli([
        'add-card',
        '--csv',
        contentPath,
        '--id',
        'gym-extra',
        '--name',
        'An Extra Card',
        '--field',
        'coinDelta=5',
      ]),
    );
    expect(added.code).toBe(0);
    expect(readText(contentPath)).toContain('gym-extra');
    expect(readText(contentPath)).toContain('An Extra Card');

    const updated = captureOutput(() =>
      runStorylineAuthorCli([
        'update-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-end',
        '--name',
        'A New Beginning',
      ]),
    );
    expect(updated.code).toBe(0);
    expect(readText(contentPath)).toContain('A New Beginning');
  });

  it('authors a forward reference in one transactional write (add-linked-card)', () => {
    const { code, stderr } = captureOutput(() =>
      runStorylineAuthorCli([
        'add-linked-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-detour',
        '--name',
        'A Detour',
        '--effect',
        'The scenic route.',
        '--storyline-id',
        'gym-story',
        '--storyline-title',
        'Gym Storyline',
        '--link-from',
        'gym-story-invest',
        '--link-label',
        'Take the detour',
      ]),
    );
    expect(stderr).toBe('');
    expect(code).toBe(0);

    const csv = readText(contentPath);
    const cards = readContentCards(csv, GYM_CONTENT_ADAPTER);
    expect(cards.map((card) => card.id)).toContain('gym-story-detour');
    expect(cards.find((card) => card.id === 'gym-story-invest')?.options).toBe(
      'Celebrate|gym-story-end;Double down|;Take the detour|gym-story-detour',
    );

    // The branch is never half-authored: one validation, and it is valid.
    const validation = validateContentCsv(csv, GYM_CONTENT_ADAPTER);
    expect(validation.valid).toBe(true);
    expect(validation.issues.map((issue) => issue.code)).not.toContain(
      'unreachable-card',
    );
    expect(validation.issues.map((issue) => issue.code)).not.toContain(
      'unknown-successor',
    );
  });

  it('refuses add-linked-card for an unknown predecessor without writing', () => {
    const before = readText(contentPath);
    const { code, stderr } = captureOutput(() =>
      runStorylineAuthorCli([
        'add-linked-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-detour',
        '--name',
        'A Detour',
        '--link-from',
        'gym-ghost',
      ]),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('predecessor card "gym-ghost" not found');
    expect(readText(contentPath)).toBe(before);
  });

  it('refuses add-linked-card without a --link-from predecessor', () => {
    const before = readText(contentPath);
    const { code, stderr } = captureOutput(() =>
      runStorylineAuthorCli([
        'add-linked-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-detour',
        '--name',
        'A Detour',
      ]),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('add-linked-card: --link-from is required');
    expect(readText(contentPath)).toBe(before);
  });

  it('authors declared resources and extended option attributes from the CLI', () => {
    const { code } = captureOutput(() =>
      runStorylineAuthorCli([
        'update-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-invest',
        '--resources',
        'coins,reputation,hull',
        '--options',
        'Celebrate|gym-story-end#cost=coins:2#extra=reputation:+1#when=hull>=1>gym-story-end;Double down|',
      ]),
    );
    expect(code).toBe(0);

    const card = readContentCards(readText(contentPath), GYM_CONTENT_ADAPTER).find(
      (candidate) => candidate.id === 'gym-story-invest',
    );
    expect(card?.resourceKeys).toEqual(['coins', 'reputation', 'hull']);
    expect(compileContentOptions(card!)[0]).toMatchObject({
      label: 'Celebrate',
      successorIds: ['gym-story-end'],
      cost: { coins: 2 },
      extraEffect: { reputation: 1 },
      conditionalSuccessors: [
        { when: { field: 'hull', op: '>=', value: 1 }, successorId: 'gym-story-end' },
      ],
    });
  });

  it('prints the candidate and writes nothing on --dry-run', () => {
    const before = readText(contentPath);
    const { code, stdout } = captureOutput(() =>
      runStorylineAuthorCli([
        'update-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-end',
        '--name',
        'Preview Only',
        '--dry-run',
      ]),
    );
    expect(code).toBe(0);
    expect(stdout).toContain('dry-run OK');
    expect(stdout).toContain('Preview Only');
    expect(readText(contentPath)).toBe(before);
  });

  it('refuses an invalid edit with a non-zero exit and no write', () => {
    const before = readText(contentPath);
    const { code, stderr } = captureOutput(() =>
      runStorylineAuthorCli([
        'update-card',
        '--csv',
        contentPath,
        '--id',
        'gym-story-start',
        '--options',
        'Invest|gym-gone',
      ]),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('refusing to write');
    expect(stderr).toContain('gym-gone');
    expect(readText(contentPath)).toBe(before);
  });

  it('rejects the removed legacy choice/link flags with a usage error', () => {
    const before = readText(contentPath);
    for (const flag of [
      '--has-choices',
      '--accept-next',
      '--clear-accept-next',
      '--reject-next',
      '--clear-reject-next',
    ]) {
      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'update-card',
          '--csv',
          contentPath,
          '--id',
          'gym-story-start',
          flag,
        ]),
      );
      expect(code, `${flag} is refused`).toBe(1);
      expect(stderr).toContain('no longer supported');
    }
    expect(readText(contentPath)).toBe(before);
  });

  it('documents only --options and never the removed flags in its help', () => {
    const { code, stdout } = captureOutput(() => runStorylineAuthorCli(['--help']));
    expect(code).toBe(0);
    expect(stdout).toContain('--options');
    expect(stdout).not.toContain('--has-choices');
    expect(stdout).not.toContain('--accept-next');
    expect(stdout).not.toContain('--reject-next');
  });

  it('rejects an unknown command, a bad --field and an unknown adapter', () => {
    expect(captureOutput(() => runStorylineAuthorCli(['frobnicate'])).code).toBe(1);
    expect(
      captureOutput(() => runStorylineAuthorCli(['add-card', '--field', 'nope'])).code,
    ).toBe(1);
    expect(
      captureOutput(() =>
        runStorylineAuthorCli(['add-card', '--game', 'nope', '--csv', contentPath]),
      ).code,
    ).toBe(1);
    expect(captureOutput(() => runStorylineAuthorCli(['--help'])).stdout).toContain(
      'add-card',
    );
  });
});

describe('authored prose authoring', () => {
  const proseCsv = readFixture('prose/prose-basic.csv');

  it('adds a card with authored context and epilogue', () => {
    const result = addContentCard(proseCsv, PROSE_CONTENT_ADAPTER, {
      id: 'prose-extra',
      name: 'The Last Lamp',
      effect: 'It goes out.',
      context: 'The quay is empty; a single lamp still burns.',
      epilogue: 'The lamp goes out, and the harbour is only a sound.',
      resources: 'coins,reputation',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const added = readContentCards(result.csv, PROSE_CONTENT_ADAPTER).find(
      (card) => card.id === 'prose-extra',
    );
    expect(added?.context).toBe('The quay is empty; a single lamp still burns.');
    expect(added?.epilogue).toBe('The lamp goes out, and the harbour is only a sound.');
  });

  it('updates and clears authored prose without touching untouched columns', () => {
    const updated = updateContentCard(proseCsv, PROSE_CONTENT_ADAPTER, {
      id: 'prose-pier',
      context: 'The pier is longer than yesterday.',
    });
    expect(updated.ok).toBe(true);
    const card = readContentCards(updated.csv, PROSE_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'prose-pier',
    );
    expect(card?.context).toBe('The pier is longer than yesterday.');
    expect(card?.epilogue).toBeNull();
    expect(card?.effect).toBe('The pier creaks.');

    const cleared = updateContentCard(updated.csv, PROSE_CONTENT_ADAPTER, {
      id: 'prose-pier',
      context: null,
    });
    expect(cleared.ok).toBe(true);
    expect(
      readContentCards(cleared.csv, PROSE_CONTENT_ADAPTER).find(
        (entry) => entry.id === 'prose-pier',
      )?.context,
    ).toBeNull();
  });

  it('refuses prose on an adapter that maps no prose column', () => {
    // The Tavern adapter maps neither prose column, so an authored context has
    // nowhere to go: the spec is accepted structurally but the column is never
    // invented.
    const result = addContentCard(tavernCsv, TAVERN_CONTENT_ADAPTER, {
      id: 'tav-extra',
      name: 'An Extra Beat',
      context: 'Nowhere to put this.',
    });
    expect(result.ok).toBe(true);
    const parsed = parseCsv(result.csv);
    expect(parsed.header).not.toContain('context');
  });
});
