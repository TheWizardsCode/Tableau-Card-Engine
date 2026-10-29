/**
 * Story-line content validator tests.
 *
 * Each test targets one documented failure class, so a regression in one rule
 * cannot hide behind another. The text and JSON reports are asserted to agree
 * (they render the same issue/finding arrays), and the validator is asserted
 * not to mutate the cards it inspects.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import type { ContentCard } from '../../../src/story-line/content/types';
import {
  contentValidationToJson,
  formatContentValidationReport,
  validateContentCards,
  validateContentCsv,
} from '../../../src/story-line/content/validate';
import { TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
import { GYM_CONTENT_PATH, readFixture, readText } from './test-support';

/** A minimal content card for inline fixtures. */
function card(overrides: Partial<ContentCard> = {}): ContentCard {
  return {
    id: 'card-a',
    name: 'Card A',
    effect: 'An effect',
    hasChoices: false,
    acceptNextCardId: null,
    rejectNextCardId: null,
    options: '',
    storylineId: 'arc',
    storylineTitle: 'Arc',
    fields: {},
    ...overrides,
  };
}

/** Codes reported for an inline card list. */
function codes(cards: readonly ContentCard[]): string[] {
  return validateContentCards(cards, TAVERN_CONTENT_ADAPTER).issues.map(
    (issue) => issue.code,
  );
}

describe('valid content', () => {
  it('accepts the shipped Gym content', () => {
    const result = validateContentCsv(readText(GYM_CONTENT_PATH), GYM_CONTENT_ADAPTER);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.cardCount).toBe(4);
    expect(result.choiceCardCount).toBe(3);
    expect(result.storylineIds).toEqual(['gym-story']);
    expect(result.gameId).toBe('gym');
  });

  it('accepts the differently shaped tavern fixture', () => {
    const result = validateContentCsv(
      readFixture('tavern-storylines.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.choiceCardCount).toBe(2);
  });

  it('does not mutate the cards it inspects', () => {
    const cards = [card({ options: 'Go|card-b' }), card({ id: 'card-b', storylineId: 'arc' })];
    const before = JSON.parse(JSON.stringify(cards));
    validateContentCards(cards, TAVERN_CONTENT_ADAPTER);
    expect(JSON.parse(JSON.stringify(cards))).toEqual(before);
  });
});

describe('hard errors', () => {
  it('catches an unknown successor id (dangling chain)', () => {
    const result = validateContentCsv(
      readFixture('broken-dangling.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: 'unknown-successor',
      cardId: 'tav-open',
      target: 'tav-missing',
    });
    expect(result.issues[0].message).toContain('tav-missing');
  });

  it('catches duplicate card ids', () => {
    const result = validateContentCsv(
      readFixture('broken-duplicate.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'duplicate-id', cardId: 'tav-open' }),
    ]);
  });

  it('catches a choice card with no storyline id', () => {
    const result = validateContentCsv(
      readFixture('broken-missing-storyline.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'missing-storyline-id', cardId: 'tav-open' }),
    ]);
  });

  it('catches an unreachable story-line card', () => {
    const result = validateContentCsv(
      readFixture('broken-unreachable.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'unreachable-card', cardId: 'tav-lost' }),
    ]);
    expect(result.issues[0].message).toContain('tav-open');
  });

  it('catches a malformed options encoding without throwing', () => {
    const result = validateContentCsv(
      readFixture('broken-options.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: 'invalid-option',
      cardId: 'tav-open',
    });
    expect(result.issues[0].message).toContain('malformed options column');
  });

  it('catches a missing required field', () => {
    expect(codes([card({ name: '  ' })])).toEqual(['missing-required-field']);
  });

  it('catches an unknown legacy link target on a choice card', () => {
    const result = validateContentCards(
      [
        card({ hasChoices: true, acceptNextCardId: 'gone' }),
        card({ id: 'card-b', storylineId: null }),
      ],
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'unknown-successor', cardId: 'card-a', target: 'gone' }),
    ]);
  });

  it('catches links declared on a card that is not a choice card', () => {
    expect(
      codes([
        card({ acceptNextCardId: 'card-b' }),
        card({ id: 'card-b', storylineId: null }),
      ]),
    ).toEqual(['orphan-link']);
  });

  it('reports an orphan link and its unknown target together', () => {
    expect(
      codes([
        card({ acceptNextCardId: 'gone' }),
        card({ id: 'card-b', storylineId: null }),
      ]),
    ).toEqual(['orphan-link', 'dangling-link']);
  });

  it('catches an empty and a duplicate option label', () => {
    expect(codes([card({ options: '|card-b;Go|card-b' })])).toEqual(['invalid-option']);
    expect(codes([card({ options: 'Go|;go|' })])).toEqual(['invalid-option']);
  });
});

describe('cycles', () => {
  it('reports a cycle as informational by default', () => {
    const result = validateContentCsv(
      readFixture('tavern-cycle.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: 'cycle', path: ['tav-loop-a', 'tav-loop-b'] }),
    ]);
  });

  it('reports a self-link as a self-link finding', () => {
    const result = validateContentCards(
      [card({ options: 'Again|card-a' })],
      TAVERN_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: 'self-link', path: ['card-a'] }),
    ]);
  });

  it('turns cycles into hard errors when failOnCycle is set', () => {
    const result = validateContentCsv(
      readFixture('tavern-cycle.csv'),
      TAVERN_CONTENT_ADAPTER,
      { failOnCycle: true },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'cycle-error', cardId: 'tav-loop-a' }),
    ]);
  });
});

describe('reports', () => {
  it('renders the same findings in the text and JSON reports', () => {
    const result = validateContentCsv(
      readFixture('broken-dangling.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    const text = formatContentValidationReport(result);
    const json = JSON.parse(contentValidationToJson(result));

    expect(text).toContain('RESULT: INVALID');
    expect(json.valid).toBe(false);
    expect(json.issues).toEqual(result.issues);
    expect(json.findings).toEqual(result.findings);
    expect(json.cardCount).toBe(result.cardCount);
    for (const issue of result.issues) {
      expect(text).toContain(issue.message);
      expect(json.issues.map((entry: { message: string }) => entry.message)).toContain(
        issue.message,
      );
    }
  });

  it('renders a valid summary with story-lines and no findings', () => {
    const text = formatContentValidationReport(
      validateContentCsv(readText(GYM_CONTENT_PATH), GYM_CONTENT_ADAPTER),
    );
    expect(text).toContain('Game: gym');
    expect(text).toContain('Choice cards: 3');
    expect(text).toContain('Story-lines: gym-story');
    expect(text).toContain('ERRORS (0): none');
    expect(text).toContain('Informational findings (0)');
    expect(text).toContain('RESULT: VALID');
  });
});
