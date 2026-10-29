/**
 * Story-line option model extension tests (CG-0MVI048QU000UF0F).
 *
 * The declarative `cost`, `extraEffect` and `conditionalSuccessors` fields are
 * authored programmatically through `registerStorylineOptions` and must be
 * carried verbatim by the compilation seam, which future draw-time filtering
 * and resolution work builds on. CSV-authored and legacy options keep their
 * current shape (no shipped content uses the new fields).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createStorylineSystem,
  type ConditionalSuccessorRule,
  type Condition,
  type OptionCost,
  type OptionExtraEffect,
  type StorylineOption,
} from '../../src/story-line';
import {
  makeAdapter,
  makeCard,
  makeState,
  type TemplateMap,
  type TestState,
} from './helpers';

/** A system instance bound to an empty template catalogue + adapter. */
function makeSystem() {
  const templates: TemplateMap = new Map();
  const engine = makeAdapter(templates);
  const system = createStorylineSystem({ engine });
  return { system, templates, engine, state: makeState() };
}

describe('declarative story-line option fields', () => {
  it('carries cost, extraEffect and conditionalSuccessors through compilation verbatim', () => {
    const { system } = makeSystem();

    const cost: OptionCost = { coins: 250 };
    const extraEffect: OptionExtraEffect = { coins: -50, reputation: 3 };
    const reputationCondition: Condition = {
      field: 'reputation',
      op: '>=',
      value: 40,
    };
    const conditionalSuccessors: readonly ConditionalSuccessorRule[] = [
      { when: reputationCondition, successorId: 'evt-flourish' },
      // A terminal rule (`successorId: null`) must be representable.
      { when: { field: 'coins', op: '<', value: 100 }, successorId: null },
    ];
    const options: StorylineOption<TestState>[] = [
      {
        label: 'Pay the levy',
        effectPolicy: 'apply',
        successorId: 'evt-after',
        cost,
        extraEffect,
        conditionalSuccessors,
      },
    ];

    system.registerStorylineOptions('evt-levy', options);
    const compiled = system.compileStorylineFromEvent(makeCard({ id: 'evt-levy' }));

    expect(compiled.compiledOptions).toEqual(options);
    // An unspecified cost component is unconstrained — not defaulted to 0.
    expect(compiled.compiledOptions[0]?.cost).toEqual({ coins: 250 });
    expect(compiled.compiledOptions[0]?.cost?.reputation).toBeUndefined();
  });

  it('keeps the declarative fields on options that survive draw-time condition filtering', () => {
    const { system } = makeSystem();
    const state = makeState({ coins: 250 });

    const options: StorylineOption<TestState>[] = [
      {
        label: 'Affordable',
        effectPolicy: 'apply',
        cost: { coins: 100, reputation: 5 },
        extraEffect: { reputation: 1 },
        condition: (s) => s.coins >= 100,
      },
      {
        label: 'Unaffordable',
        effectPolicy: 'apply',
        cost: { coins: 10_000 },
        condition: (s) => s.coins >= 10_000,
      },
    ];
    system.registerStorylineOptions('evt-filtered', options);

    const presented = system.getStorylineOptions(makeCard({ id: 'evt-filtered' }), state);

    expect(presented).toHaveLength(1);
    expect(presented[0]).toEqual(options[0]);
  });

  it('authors no declarative fields on CSV-encoded options', () => {
    const { system } = makeSystem();

    const parsed = system.parseStorylineOptionsEncoding('Pay|evt-a;Flee|evt-b');

    expect(parsed).toEqual([
      { label: 'Pay', successorIds: ['evt-a'], effectPolicy: 'apply' },
      { label: 'Flee', successorIds: ['evt-b'], effectPolicy: 'apply' },
    ]);
    for (const option of parsed) {
      expect(option.cost).toBeUndefined();
      expect(option.extraEffect).toBeUndefined();
      expect(option.conditionalSuccessors).toBeUndefined();
    }
  });
});
