/**
 * Static validation tests for declarative story-line option metadata.
 *
 * Each case is a broken fixture targeting one validation rule, plus positive
 * cases (clean declarative options, CSV-compiled options, null rule targets)
 * and the registered-option path.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createStorylineSystem,
  parseStorylineOptionsEncoding,
  validateStorylineOptions,
  type StorylineOption,
} from '../../src/story-line';
import { makeAdapter, makeCard, makeState } from './helpers';

/** A complete, valid declarative option. */
const VALID_OPTION: StorylineOption = {
  label: 'Investigate',
  effectPolicy: 'apply',
  cost: { coins: 50, reputation: 2 },
  extraEffect: { coins: 10, reputation: 1 },
  conditionalSuccessors: [
    { when: { field: 'coins', op: '>=', value: 100 }, successorId: 'evt-rich' },
    { when: { field: 'coins', op: '<', value: 5 }, successorId: null },
  ],
  successorId: 'evt-fallback',
};

/** Collects the issue codes for a list of options. */
function codes(options: readonly StorylineOption[]): string[] {
  return validateStorylineOptions(options).issues.map((i) => i.code);
}

describe('validateStorylineOptions — valid data', () => {
  it('accepts options without declarative metadata (legacy/CSV shape)', () => {
    const { system } = makeSystem();
    const options = system.parseStorylineOptionsEncoding('Accept|evt-a;Reject|');
    expect(validateStorylineOptions(options)).toEqual({ valid: true, issues: [] });
  });

  it('accepts a fully declarative option', () => {
    const result = validateStorylineOptions([VALID_OPTION]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts a null conditional target (ends the chain) and structural ids', () => {
    const result = validateStorylineOptions([
      {
        label: 'Stop',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          { when: { field: 'reputation', op: '==', value: 0 }, successorId: null },
        ],
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it('only treats conditional ids as dangling when a template catalogue is supplied', () => {
    expect(validateStorylineOptions([VALID_OPTION]).valid).toBe(true);

    const known = validateStorylineOptions([VALID_OPTION], {
      knownTemplateIds: ['evt-rich', 'evt-fallback'],
    });
    expect(known.valid).toBe(true);

    const dangling = validateStorylineOptions([VALID_OPTION], {
      knownTemplateIds: ['evt-fallback'],
    });
    expect(dangling.issues.map((i) => i.code)).toEqual(['dangling-conditional-successor']);
    expect(dangling.issues[0]?.path).toContain('conditionalSuccessors[0].successorId');
  });
});

describe('validateStorylineOptions — cost rules', () => {
  it('rejects a zero cost', () => {
    expect(
      validateStorylineOptions([
        { label: 'Free?', effectPolicy: 'skip', cost: { coins: 0 } },
      ]).issues.map((i) => i.code),
    ).toEqual(['non-positive-cost']);
  });

  it('rejects a negative cost (coins and reputation)', () => {
    const result = validateStorylineOptions([
      { label: 'Bad', effectPolicy: 'skip', cost: { coins: -1, reputation: -5 } },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual([
      'non-positive-cost',
      'non-positive-cost',
    ]);
    expect(result.issues.map((i) => i.path)).toEqual([
      'options[0].cost.coins',
      'options[0].cost.reputation',
    ]);
  });

  it('rejects a non-numeric cost value', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        cost: { coins: Number.NaN },
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['non-numeric-value']);
  });

  it('rejects a non-object cost at runtime', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        cost: 'free' as unknown as StorylineOption['cost'],
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['non-numeric-value']);
  });
});

describe('validateStorylineOptions — extra effect rules', () => {
  it('rejects a negative extra effect on either resource', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'apply',
        extraEffect: { coins: -10, reputation: -1 },
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual([
      'negative-extra-effect',
      'negative-extra-effect',
    ]);
  });

  it('accepts a zero extra effect and a positive gain', () => {
    expect(
      validateStorylineOptions([
        { label: 'Ok', effectPolicy: 'apply', extraEffect: { coins: 0, reputation: 3 } },
      ]).valid,
    ).toBe(true);
  });

  it('rejects a non-numeric extra effect value', () => {
    expect(
      codes([
        {
          label: 'Bad',
          effectPolicy: 'apply',
          extraEffect: { coins: Number.POSITIVE_INFINITY },
        },
      ]),
    ).toEqual(['non-numeric-value']);
  });
});

describe('validateStorylineOptions — condition rules', () => {
  it('rejects an unknown condition field', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          {
            when: { field: 'gold' as unknown as 'coins', op: '>=', value: 1 },
            successorId: 'evt-a',
          },
        ],
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['unknown-condition-field']);
  });

  it('rejects an unknown condition operator', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          {
            when: { field: 'coins', op: '!=' as unknown as '>=', value: 1 },
            successorId: 'evt-a',
          },
        ],
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['unknown-condition-op']);
  });

  it('rejects a non-numeric condition value', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          {
            when: {
              field: 'coins',
              op: '>=',
              value: '100' as unknown as number,
            },
            successorId: 'evt-a',
          },
        ],
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['non-numeric-value']);
  });

  it('rejects a structurally invalid successor id', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          {
            when: { field: 'coins', op: '>=', value: 1 },
            successorId: 42 as unknown as string,
          },
        ],
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['invalid-successor-id']);
  });

  it('rejects a missing when condition', () => {
    const rule = { successorId: 'evt-a' } as unknown as NonNullable<
      StorylineOption['conditionalSuccessors']
    >[number];
    const result = validateStorylineOptions([
      { label: 'Bad', effectPolicy: 'skip', conditionalSuccessors: [rule] },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['invalid-condition']);
  });

  it('rejects a non-array conditionalSuccessors value', () => {
    const result = validateStorylineOptions([
      {
        label: 'Bad',
        effectPolicy: 'skip',
        conditionalSuccessors: {} as unknown as StorylineOption['conditionalSuccessors'],
      },
    ]);
    expect(result.issues.map((i) => i.code)).toEqual(['invalid-conditional-successors']);
  });
});

describe('validateStorylineOptions — reported scope', () => {
  it('reports every issue with its option-relative path', () => {
    const result = validateStorylineOptions([
      { label: 'Ok', effectPolicy: 'apply', cost: { coins: 5 } },
      { label: 'Bad', effectPolicy: 'apply', cost: { coins: -5 } },
      { label: 'Also bad', effectPolicy: 'apply', extraEffect: { reputation: -1 } },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.path)).toEqual([
      'options[1].cost.coins',
      'options[2].extraEffect.reputation',
    ]);
  });

  it('validates options registered programmatically, not only compiled CSV rows', () => {
    const { system } = makeSystem();
    system.registerStorylineOptions('evt-registered', [
      { label: 'Pay', effectPolicy: 'apply', cost: { coins: 0 } },
    ]);
    const card = makeCard({ id: 'evt-registered' });

    const compiled = system.getStorylineOptions(card, makeState());
    expect(compiled).toHaveLength(1);
    expect(validateStorylineOptions(compiled).issues.map((i) => i.code)).toEqual([
      'non-positive-cost',
    ]);
  });

  it('validates parsed CSV encodings (shipped content carries no cost metadata)', () => {
    const options = parseStorylineOptionsEncoding('Investigate|evt-a,evt-b;Ignore|');
    expect(validateStorylineOptions(options).valid).toBe(true);
  });
});

/** A system instance bound to an empty template catalogue + adapter. */
function makeSystem() {
  const system = createStorylineSystem({ engine: makeAdapter(new Map()) });
  return { system };
}
