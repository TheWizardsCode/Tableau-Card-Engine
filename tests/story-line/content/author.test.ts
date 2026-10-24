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
  applyContentEditToFile,
  hasContentCard,
  readContentCards,
  updateContentCard,
} from '../../../src/story-line/content/author';
import { validateContentCsv } from '../../../src/story-line/content/validate';
import { runStorylineAuthorCli } from '../../../scripts/storyline-author';
import { TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
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

  it('marks a card as a choice when a legacy link is set', () => {
    const gymCsv = readText(GYM_CONTENT_PATH);
    const result = updateContentCard(gymCsv, GYM_CONTENT_ADAPTER, {
      id: 'gym-story-end',
      acceptNextCardId: 'gym-story-start',
    });
    expect(result.ok).toBe(true);
    const end = readContentCards(result.csv, GYM_CONTENT_ADAPTER).find(
      (entry) => entry.id === 'gym-story-end',
    );
    expect(end).toMatchObject({ hasChoices: true, acceptNextCardId: 'gym-story-start' });
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
