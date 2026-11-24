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

describe('validateStorylineOptions — declared resources', () => {
  it('reports an undeclared cost key with the card id, the key and a reason', () => {
    const result = validateStorylineOptions(
      [{ label: 'Pay', effectPolicy: 'apply', cost: { hull: 5 } }],
      { cardId: 'evt-toll' },
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      path: 'options[0].cost.hull',
      code: 'unknown-resource-key',
      cardId: 'evt-toll',
      resource: 'hull',
    });
    expect(result.issues[0].message).toContain('hull');
    expect(result.issues[0].message).toContain('coins, reputation');
  });

  it('reports an undeclared extra-effect key', () => {
    const result = validateStorylineOptions([
      { label: 'Gain', effectPolicy: 'apply', extraEffect: { morale: 2 } },
    ]);
    expect(result.issues.map((issue) => [issue.path, issue.code, issue.resource])).toEqual([
      ['options[0].extraEffect.morale', 'unknown-resource-key', 'morale'],
    ]);
  });

  it('accepts declared keys in costs, extra effects and conditions', () => {
    const declared = ['coins', 'reputation', 'hull', 'morale'];
    const result = validateStorylineOptions(
      [
        {
          label: 'All declared',
          effectPolicy: 'apply',
          cost: { hull: 2 },
          extraEffect: { morale: 3 },
          conditionalSuccessors: [
            { when: { field: 'hull', op: '<=', value: 1 }, successorId: null },
          ],
        },
      ],
      { resources: declared },
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a negative extra effect on any declared key, naming the key', () => {
    const result = validateStorylineOptions(
      [{ label: 'Bleed', effectPolicy: 'apply', extraEffect: { morale: -2 } }],
      { resources: ['coins', 'reputation', 'morale'] },
    );
    expect(result.issues.map((issue) => [issue.path, issue.code, issue.resource])).toEqual([
      ['options[0].extraEffect.morale', 'negative-extra-effect', 'morale'],
    ]);
  });

  it('defaults the vocabulary to the coins/reputation projection', () => {
    expect(
      validateStorylineOptions([
        { label: 'Coins', effectPolicy: 'apply', cost: { coins: 1 } },
      ]).valid,
    ).toBe(true);
    expect(
      validateStorylineOptions([
        { label: 'Rep', effectPolicy: 'apply', extraEffect: { reputation: 1 } },
      ]).valid,
    ).toBe(true);
    expect(
      validateStorylineOptions([
        {
          label: 'Unknown field',
          effectPolicy: 'skip',
          conditionalSuccessors: [
            { when: { field: 'stores', op: '>=', value: 1 }, successorId: null },
          ],
        },
      ]).issues.map((issue) => issue.code),
    ).toEqual(['unknown-condition-field']);
  });
});

describe('validateStorylineOptions — irreversible grants', () => {
  const DECLARED = ['coins', 'reputation', 'hull'] as const;

  it('rejects a positive extra effect on a declared irreversible key', () => {
    const result = validateStorylineOptions(
      [{ label: 'Patch', effectPolicy: 'apply', extraEffect: { hull: 1 } }],
      { resources: DECLARED, irreversible: ['hull'], cardId: 'evt-wreck' },
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      path: 'options[0].extraEffect.hull',
      code: 'irreversible-grant',
      cardId: 'evt-wreck',
      resource: 'hull',
    });
    expect(result.issues[0].message).toContain('hull');
    expect(result.issues[0].message).toContain('irreversible');
  });

  it('leaves a zero extra effect alone (only a gain is refused)', () => {
    expect(
      validateStorylineOptions(
        [{ label: 'No-op', effectPolicy: 'apply', extraEffect: { hull: 0 } }],
        { resources: DECLARED, irreversible: ['hull'] },
      ).valid,
    ).toBe(true);
  });

  it('accepts spending an irreversible key and granting a recoverable one', () => {
    const result = validateStorylineOptions(
      [
        {
          label: 'Trade',
          effectPolicy: 'apply',
          cost: { hull: 1 },
          extraEffect: { coins: 2 },
        },
      ],
      { resources: DECLARED, irreversible: ['hull'] },
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('reports nothing extra when no irreversible set is supplied', () => {
    const hullGain = validateStorylineOptions(
      [{ label: 'Gain', effectPolicy: 'apply', extraEffect: { hull: 1 } }],
      { resources: DECLARED },
    );
    expect(hullGain.valid).toBe(true);

    // The default projection is unchanged too: a positive `coins` extra effect
    // is still a gain, never an irreversible one.
    const coinsGain = validateStorylineOptions([
      { label: 'Gain', effectPolicy: 'apply', extraEffect: { coins: 1 } },
    ]);
    expect(coinsGain.valid).toBe(true);
  });

  it('keeps the negative rule dominant for an irreversible key', () => {
    expect(
      validateStorylineOptions(
        [{ label: 'Bleed', effectPolicy: 'apply', extraEffect: { hull: -1 } }],
        { resources: DECLARED, irreversible: ['hull'] },
      ).issues.map((issue) => issue.code),
    ).toEqual(['negative-extra-effect']);
  });
});

/** A system instance bound to an empty template catalogue + adapter. */
function makeSystem() {
  const system = createStorylineSystem({ engine: makeAdapter(new Map()) });
  return { system };
}
