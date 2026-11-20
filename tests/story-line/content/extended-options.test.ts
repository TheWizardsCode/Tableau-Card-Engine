/**
 * Writer-authorable CSV option fields (CG-0MWNHZ7DA00243HB).
 *
 * The extended option attributes — a declarative `cost`, an `extraEffect` and
 * ordered `conditionalSuccessors` — are authored **inside the existing
 * `options` cell** as an additive `#name=value` tail, so the shipped
 * `label|cardA,cardB;label2|cardC` shorthand keeps its exact meaning. A card
 * declares the resource keys those attributes may name through a mapped
 * `resources` column.
 *
 * These tests pin, through the public content API only:
 *
 * - the grammar (cost / extra / repeated `when`, whitespace, terminal
 *   conditional successors) and the unchanged shorthand object shape;
 * - stable row + column + reason diagnostics for every malformed class;
 * - byte-identical CSV round-tripping for the new column/attributes, including
 *   quoted cells with commas and empty cells;
 * - compilation through the runtime path with **no TypeScript registration**
 *   (the shipped Gym content and a Gym-shaped fixture both compile from CSV
 *   alone).
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
  serialiseCsv,
} from '../../../src/story-line/content/csv';
import {
  contentValidationToJson,
  formatContentValidationReport,
  validateContentCsv,
} from '../../../src/story-line/content/validate';
import {
  compileStorylineFromEvent,
  createStorylineOptionRegistry,
  parseStorylineOptionsEncoding,
  serialiseStorylineOptionsEncoding,
  StorylineOptionsEncodingError,
} from '../../../src/story-line/compile';
import type { StorylineOptionsEncodingErrorReason } from '../../../src/story-line/compile';
import type { StorylineCard } from '../../../src/story-line/types';
import { runValidateStorylinesCli } from '../../../scripts/validate-storylines';
import { GYM_CONTENT_PATH, FIXTURES_DIR, captureOutput, readFixture, readText } from './test-support';

/** Directory holding the extended-option fixtures. */
const CONTENT_FIXTURE_DIR = join(FIXTURES_DIR, 'content');

/** Reads a fixture from the `content/` subdirectory by name. */
function readContentFixture(name: string): string {
  return readFixture(`content/${name}`);
}

/** Runs a parser call and returns the structured error reason, or `null`. */
function reasonOf(fn: () => unknown): StorylineOptionsEncodingErrorReason | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof StorylineOptionsEncodingError ? err.reason : null;
  }
}

describe('option attribute grammar', () => {
  it('parses a cost, an extra effect and a conditional successor from one cell', () => {
    const options = parseStorylineOptionsEncoding(
      'Descend|card-a,card-b#cost=coins:5,hull:1#extra=reputation:+2#when=hull>=3>card-c',
    );
    expect(options).toEqual([
      {
        label: 'Descend',
        successorIds: ['card-a', 'card-b'],
        effectPolicy: 'apply',
        cost: { coins: 5, hull: 1 },
        extraEffect: { reputation: 2 },
        conditionalSuccessors: [
          { when: { field: 'hull', op: '>=', value: 3 }, successorId: 'card-c' },
        ],
      },
    ]);
  });

  it('keeps repeated #when rules in authored order, including a terminal rule', () => {
    const [option] = parseStorylineOptionsEncoding(
      'Go|card-a#when=coins>10>card-hot#when=coins<=10>',
    );
    expect(option.conditionalSuccessors).toEqual([
      { when: { field: 'coins', op: '>', value: 10 }, successorId: 'card-hot' },
      { when: { field: 'coins', op: '<=', value: 10 }, successorId: null },
    ]);
  });

  it('supports every documented condition operator and trims whitespace', () => {
    const [option] = parseStorylineOptionsEncoding(
      ' Go | a , b # cost = coins : 5 # extra = morale : 2 # when = hull < 4 > next ',
    );
    expect(option.label).toBe('Go');
    expect(option.successorIds).toEqual(['a', 'b']);
    expect(option.cost).toEqual({ coins: 5 });
    expect(option.extraEffect).toEqual({ morale: 2 });
    expect(option.conditionalSuccessors).toEqual([
      { when: { field: 'hull', op: '<', value: 4 }, successorId: 'next' },
    ]);
  });

  it('leaves the shorthand object shape untouched (no extra keys)', () => {
    const [option] = parseStorylineOptionsEncoding('Invest|card-a,card-b');
    expect(option).toEqual({
      label: 'Invest',
      successorIds: ['card-a', 'card-b'],
      effectPolicy: 'apply',
    });
    expect(Object.keys(option)).toEqual(['label', 'successorIds', 'effectPolicy']);
  });

  it('rejects an unknown attribute with a stable reason', () => {
    expect(reasonOf(() => parseStorylineOptionsEncoding('Go|a#bogus=1'))).toBe(
      'unknown-attribute',
    );
  });

  it('rejects a malformed cost pair with a stable reason', () => {
    expect(reasonOf(() => parseStorylineOptionsEncoding('Go|a#cost=coins'))).toBe(
      'malformed-cost-pair',
    );
    expect(reasonOf(() => parseStorylineOptionsEncoding('Go|a#cost=coins:lots'))).toBe(
      'malformed-cost-pair',
    );
  });

  it('rejects an unparseable condition with a stable reason', () => {
    expect(reasonOf(() => parseStorylineOptionsEncoding('Go|a#when=hull>=abc>b'))).toBe(
      'unparseable-condition',
    );
    expect(reasonOf(() => parseStorylineOptionsEncoding('Go|a#when=hull>=3'))).toBe(
      'unparseable-condition',
    );
  });

  it('rejects a malformed attribute (no "=") with a stable reason', () => {
    expect(reasonOf(() => parseStorylineOptionsEncoding('Go|a#cost'))).toBe(
      'malformed-attribute',
    );
  });

  it('keeps the pre-existing shorthand failure reasons', () => {
    expect(reasonOf(() => parseStorylineOptionsEncoding('NoSeparator'))).toBe(
      'missing-separator',
    );
    expect(reasonOf(() => parseStorylineOptionsEncoding('|a'))).toBe('empty-label');
    expect(reasonOf(() => parseStorylineOptionsEncoding(';;'))).toBe('no-valid-option');
  });
});

describe('CSV round-trip stability for extended attributes', () => {
  const fixtures = readdirSync(CONTENT_FIXTURE_DIR)
    .filter((name) => name.endsWith('.csv'))
    .sort();

  it('covers every extended-option fixture', () => {
    expect(fixtures).toEqual([
      'extended-options.csv',
      'malformed-condition.csv',
      'malformed-cost-pair.csv',
      'malformed-unknown-attribute.csv',
      'shorthand-only.csv',
      'unknown-resource-key.csv',
    ]);
  });

  it('round-trips every fixture byte-identically', () => {
    for (const name of fixtures) {
      const text = readContentFixture(name);
      expect(serialiseCsv(parseCsv(text)), name).toBe(text);
    }
  });

  it('round-trips quoted attributes (commas), quoted effect text and empty cells', () => {
    const text = readContentFixture('extended-options.csv');
    const parsed = parseCsv(text);

    // The options cell contains commas (the two-key cost) so it is quoted; the
    // terminal card's options/resources cells are empty.
    expect(parsed.rows[0]?.[3]).toBe(
      'Descend|ext-mid#cost=coins:5,hull:1#extra=reputation:+2#when=hull>=3>ext-deep;Leave|',
    );
    expect(parsed.rows[2]?.[3]).toBe('');
    expect(parsed.rows[2]?.[6]).toBe('');
    expect(serialiseCsv(parsed)).toBe(text);
  });

  it('projects the resources column into declared keys, not game fields', () => {
    const cards = cardsFromCsv(
      parseCsv(readContentFixture('extended-options.csv')),
      GYM_CONTENT_ADAPTER,
    );
    expect(cards.map((card) => card.resourceKeys)).toEqual([
      ['coins', 'hull', 'reputation'],
      ['coins', 'hull', 'reputation'],
      [],
    ]);
    // Mapped columns never leak into the game-specific `fields` bag.
    expect(cards[0]?.fields).not.toHaveProperty('resources');
  });
});

describe('content validation diagnostics', () => {
  it('accepts the extended fixture and compiles its attributes', () => {
    const result = validateContentCsv(
      readContentFixture('extended-options.csv'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.cardCount).toBe(3);
    expect(result.choiceCardCount).toBe(2);

    const cards = cardsFromCsv(parseCsv(readContentFixture('extended-options.csv')), GYM_CONTENT_ADAPTER);
    const [invest] = compileContentOptions(cards[0]!);
    expect(invest?.cost).toEqual({ coins: 5, hull: 1 });
    expect(invest?.extraEffect).toEqual({ reputation: 2 });
  });

  const failures: readonly {
    readonly fixture: string;
    readonly code: 'invalid-option' | 'unknown-resource-key';
    readonly reason: string;
  }[] = [
    { fixture: 'malformed-unknown-attribute.csv', code: 'invalid-option', reason: 'unknown-attribute' },
    { fixture: 'malformed-cost-pair.csv', code: 'invalid-option', reason: 'malformed-cost-pair' },
    { fixture: 'malformed-condition.csv', code: 'invalid-option', reason: 'unparseable-condition' },
    { fixture: 'unknown-resource-key.csv', code: 'unknown-resource-key', reason: 'unknown-resource-key' },
  ];

  it.each(failures)(
    'reports row + column + reason for $fixture',
    ({ fixture, code, reason }) => {
      const result = validateContentCsv(readContentFixture(fixture), GYM_CONTENT_ADAPTER);
      expect(result.valid).toBe(false);
      expect(result.issues[0]).toMatchObject({
        code,
        cardId: 'bad-a',
        row: 2,
        column: 'options',
        reason,
      });
    },
  );

  it('renders the row, column and reason in both reports', () => {
    const result = validateContentCsv(
      readContentFixture('malformed-cost-pair.csv'),
      GYM_CONTENT_ADAPTER,
    );
    const text = formatContentValidationReport(result);
    expect(text).toContain('row 2');
    expect(text).toContain('column "options"');
    expect(text).toContain('(malformed-cost-pair)');

    const json = JSON.parse(contentValidationToJson(result)) as {
      issues: { row?: number; column?: string; reason?: string }[];
    };
    expect(json.issues[0]).toMatchObject({
      row: 2,
      column: 'options',
      reason: 'malformed-cost-pair',
    });
  });

  it('fails `storylines:validate` with the row + column + reason and exit 1', () => {
    const csvPath = join(FIXTURES_DIR, 'content', 'malformed-cost-pair.csv');
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli(['--csv', csvPath, '--json']),
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout) as {
      valid: boolean;
      issues: { row?: number; column?: string; reason?: string; message: string }[];
    };
    expect(report.valid).toBe(false);
    expect(report.issues[0]).toMatchObject({
      row: 2,
      column: 'options',
      reason: 'malformed-cost-pair',
    });
  });

  it('reports an unknown conditional-successor target', () => {
    const result = validateContentCsv(
      [
        'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context',
        'bad-a,Bad A,X,Go|bad-b#when=coins>=1>missing,bad,Bad,"coins,reputation",Incident,0,0,0,',
        'bad-b,Bad B,X,,bad,Bad,"coins,reputation",Incident,0,0,0,',
      ].join('\n') + '\n',
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'unknown-successor',
        cardId: 'bad-a',
        target: 'missing',
        row: 2,
        column: 'options',
      }),
    ]);
  });
});

describe('no TypeScript registration required', () => {
  it('compiles a Gym-shaped extended CSV through the runtime path with an empty registry', () => {
    const cards = cardsFromCsv(
      parseCsv(readContentFixture('extended-options.csv')),
      GYM_CONTENT_ADAPTER,
    );
    const registry = createStorylineOptionRegistry<unknown>((id) => id.replace(/-\d+$/, ''));
    const compiled = compileStorylineFromEvent(cards[0] as StorylineCard, registry);
    expect(compiled.compiledOptions[0]).toMatchObject({
      label: 'Descend',
      successorIds: ['ext-mid'],
      cost: { coins: 5, hull: 1 },
      extraEffect: { reputation: 2 },
      conditionalSuccessors: [
        { when: { field: 'hull', op: '>=', value: 3 }, successorId: 'ext-deep' },
      ],
    });
  });

  it('authors the shipped Gym content in CSV alone', () => {
    const cards = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER);
    const start = cards.find((card) => card.id === 'gym-story-start');
    expect(start?.resourceKeys).toEqual(['coins', 'reputation']);

    const [invest] = compileContentOptions(start!);
    expect(invest).toMatchObject({
      label: 'Invest',
      successorIds: ['gym-story-invest'],
      cost: { coins: 5 },
      extraEffect: { reputation: 2 },
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>=', value: 100 }, successorId: 'gym-story-end' },
      ],
    });
  });
});

describe('shorthand-only content is unchanged', () => {
  it('validates and compiles exactly the shorthand option list', () => {
    const result = validateContentCsv(
      readContentFixture('shorthand-only.csv'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);

    const [start] = cardsFromCsv(
      parseCsv(readContentFixture('shorthand-only.csv')),
      GYM_CONTENT_ADAPTER,
    );
    expect(compileContentOptions(start!)).toEqual([
      { label: 'Go', successorIds: ['sh-b'], effectPolicy: 'apply' },
      { label: 'Stop', successorIds: [], effectPolicy: 'apply' },
    ]);
  });
});

describe('option-outcome prose (#says)', () => {
  it('parses #says in any attribute position alongside the mechanical attributes', () => {
    const options = parseStorylineOptionsEncoding(
      'Open|ext-a#says=The door opens on a room you remember.#cost=coins:5#when=reputation>=2>ext-b',
    );
    expect(options[0]).toMatchObject({
      label: 'Open',
      successorIds: ['ext-a'],
      says: 'The door opens on a room you remember.',
      cost: { coins: 5 },
      conditionalSuccessors: [
        { when: { field: 'reputation', op: '>=', value: 2 }, successorId: 'ext-b' },
      ],
    });
  });

  it('decodes \\; \\# and \\\\ only inside a says value', () => {
    const [option] = parseStorylineOptionsEncoding(
      'Read|ext-a#says=One\\; two \\# three C:\\\\ledger',
    );
    expect(option?.says).toBe('One; two # three C:\\ledger');

    // Outside prose a backslash is an ordinary character, not an escape.
    expect(parseStorylineOptionsEncoding('C:\\ledger|ext-a')[0]?.label).toBe(
      'C:\\ledger',
    );
    expect(
      reasonOf(() => parseStorylineOptionsEncoding('Pay|ext-a#cost=coins:\\5')),
    ).toBe('malformed-cost-pair');
  });

  it('rejects an unescaped ";" in prose, naming the option index', () => {
    let caught: unknown;
    try {
      parseStorylineOptionsEncoding('Ok|ext-a;Bad|ext-b#says=Two things happened; and more');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StorylineOptionsEncodingError);
    expect(caught).toMatchObject({
      reason: 'unescaped-says-delimiter',
      attribute: 'says',
      optionIndex: 1,
    });
  });

  it('rejects an unescaped "#" in prose, naming the option index', () => {
    let caught: unknown;
    try {
      parseStorylineOptionsEncoding('Ok|ext-a;Bad|ext-b#says=One thing # and more');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StorylineOptionsEncodingError);
    expect(caught).toMatchObject({
      reason: 'unescaped-says-delimiter',
      attribute: 'says',
      optionIndex: 1,
    });
  });

  it('still understands an escaped ";" as content, not a segment boundary', () => {
    const options = parseStorylineOptionsEncoding(
      'Recall|q-end#says=One thing happened\\; then another was forgotten',
    );
    expect(options).toEqual([
      {
        label: 'Recall',
        successorIds: ['q-end'],
        effectPolicy: 'apply',
        says: 'One thing happened; then another was forgotten',
      },
    ]);
  });

  it('serialises a canonical cell byte-identically (parse → serialise identity)', () => {
    const cell =
      'Recall|q-end#cost=coins:2#when=coins>=1>q-mid#says=One thing happened\\; then another was forgotten';
    expect(serialiseStorylineOptionsEncoding(parseStorylineOptionsEncoding(cell))).toBe(
      cell,
    );
  });

  it('re-encodes any authored attribute order to a stable, re-parseable model', () => {
    const parsed = parseStorylineOptionsEncoding(
      'Wait|q-d#says=You wait. A note reads "1 \\# 2".#when=coins>=1>q-c#cost=coins:1',
    );
    const encoded = serialiseStorylineOptionsEncoding(parsed);
    expect(parseStorylineOptionsEncoding(encoded)).toEqual(parsed);
    expect(serialiseStorylineOptionsEncoding(parseStorylineOptionsEncoding(encoded))).toBe(
      encoded,
    );
  });

  it('re-encodes an empty option list as an empty cell', () => {
    expect(serialiseStorylineOptionsEncoding([])).toBe('');
  });

  it('carries says into the compiled storyline', () => {
    const registry = createStorylineOptionRegistry<unknown>((id) => id);
    const compiled = compileStorylineFromEvent(
      {
        id: 'ext-a',
        name: 'A',
        options: 'Open|ext-b#says=The door opens.',
      } as StorylineCard,
      registry,
    );
    expect(compiled.compiledOptions[0]).toMatchObject({
      label: 'Open',
      successorIds: ['ext-b'],
      says: 'The door opens.',
    });
  });
});

describe('option-outcome prose diagnostics', () => {
  /** A Gym-shaped header with the choice card first and its successor second. */
  function idiomsCsv(asCell: string): string {
    return (
      [
        'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context',
        `bad-a,Bad A,X,${asCell},bad,Bad,"coins,reputation",Incident,0,0,0,`,
        'bad-b,Bad B,X,,bad,Bad,"coins,reputation",Incident,0,0,0,',
      ].join('\n') + '\n'
    );
  }

  it('reports an unescaped reserved character at options[N].says', () => {
    const result = validateContentCsv(
      idiomsCsv('Go|bad-b#says=Two things happened; and more'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    // The malformed cell also leaves `bad-b` unreachable; the says fault is
    // reported first, on the card that authored it.
    expect(result.issues[0]).toMatchObject({
      code: 'invalid-option',
      cardId: 'bad-a',
      row: 2,
      column: 'options',
      reason: 'unescaped-says-delimiter',
      path: 'options[0].says',
    });
  });

  it('reports a says value that decodes to more than one prose segment', () => {
    const result = validateContentCsv(
      idiomsCsv('Recall|bad-b#says=One thing happened\\; then another was forgotten'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(false);
    const issue = result.issues[0]!;
    expect(issue).toMatchObject({
      code: 'invalid-option',
      reason: 'says-segment-count',
      path: 'options[0].says',
      column: 'options',
      row: 2,
    });
    expect(issue.message).toContain('expected 1');
    expect(issue.message).toContain('actual 2');
  });

  it('accepts a single-segment says value', () => {
    const result = validateContentCsv(
      idiomsCsv('Go|bad-b#says=One thing happened, and then nothing did.'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
