/**
 * Story-line resource-semantics baseline (CG-0MWNHZ51N007STI3).
 *
 * A **characterisation suite**: it pins what the engine does *today* with its
 * hard-coded `coins` / `reputation` resource pair, so the resource
 * generalisation (parent `CG-0MWNFV6VU003O3PC` decision 1) and the CSV
 * extension (decision 2) cannot silently change existing behaviour. Every
 * expectation below is a description of current behaviour, not a wish.
 *
 * The suite deliberately reads as one contract rather than a pile of cases:
 *
 * 1. **Resolution order** — a scenario matrix (`effect → cost → extra effect`)
 *    of exact post-resolution resources, reported deltas and activity-log
 *    lines.
 * 2. **Draw-time affordability** — the presented option list is filtered by
 *    the declared `cost` against the current resources, component by
 *    component, with equality treated as affordable.
 * 3. **Successor precedence** — the four-step ladder walked in priority order
 *    (`successorResolver` → matching `conditionalSuccessors` rule → seeded
 *    `successorIds` draw → single `successorId`), including the RNG-draw
 *    accounting that replay determinism depends on.
 * 4. **Validation versus runtime permissiveness** — `validateStorylineOptions`
 *    rejects a negative `extraEffect` and a non-positive `cost`, while
 *    resolution stays permissive and applies whatever is declared.
 * 5. **The declared resource boundary** — originally only `coins` and
 *    `reputation` were accepted condition fields. The resource
 *    generalisation (CG-0MWNHZ67Q005BWE0) **deliberately rewrote** this
 *    section: the default projection still accepts exactly `coins` and
 *    `reputation`, and a game-declared key is accepted once it is declared.
 *
 * Companion per-behaviour suites (`compile.test.ts`, `resolve.test.ts`,
 * `validate.test.ts`) cover the individual helpers in depth; this file is the
 * consolidated contract the later spike children are re-run against.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createStorylineSystem,
  isOptionAffordable,
  selectDeclaredDelta,
  validateStorylineOptions,
  type Condition,
  type StorylineOption,
} from '../../src/story-line';
import {
  addTemplate,
  makeAdapter,
  makeCard,
  makeState,
  type TemplateMap,
  type TestCard,
  type TestState,
} from './helpers';

/** Start-of-run resources every scenario assumes. */
const START_COINS = 1000;
const START_REPUTATION = 50;

/** Builds a system over a template catalogue. */
function setup(templates: readonly TestCard[] = []) {
  const map: TemplateMap = new Map();
  for (const template of templates) addTemplate(map, template);
  const engine = makeAdapter(map);
  return {
    system: createStorylineSystem({ engine }),
    map,
    engine,
    state: makeState({ coins: START_COINS, reputation: START_REPUTATION }),
  };
}

/** One row of the resolution-order matrix. */
interface ResolutionScenario {
  readonly name: string;
  /** Card intrinsic effect (the `effectPolicy`-governed part). */
  readonly card: { id: string; coinDelta?: number; reputationDelta?: number };
  /** The option under test. */
  readonly option: StorylineOption<TestState>;
  /** Template catalogue the successor lookup can resolve. */
  readonly templates?: readonly TestCard[];
  /** Seeded RNG draws available to the scenario. */
  readonly rngQueue?: readonly number[];
  readonly expected: {
    readonly coins: number;
    readonly reputation: number;
    readonly coinChange: number;
    readonly repChange: number;
    /** Pushed chain-card instance id (`<base>-<serial>`), or null. */
    readonly pushedId: string | null;
    readonly rngCalls: number;
    readonly log: readonly string[];
  };
}

/**
 * The resolution-order matrix: card effect first, then the cost payment, then
 * the extra effect — all three reported as one summed delta.
 */
const RESOLUTION_SCENARIOS: readonly ResolutionScenario[] = [
  {
    name: 'apply runs the intrinsic effect',
    card: { id: 'evt-plain', coinDelta: -200, reputationDelta: 5 },
    option: { label: 'Go', effectPolicy: 'apply' },
    expected: {
      coins: START_COINS - 200,
      reputation: START_REPUTATION + 5,
      coinChange: -200,
      repChange: 5,
      pushedId: null,
      rngCalls: 0,
      log: [],
    },
  },
  {
    name: 'skip leaves the intrinsic effect unapplied',
    card: { id: 'evt-plain', coinDelta: -200, reputationDelta: 5 },
    option: { label: 'Go', effectPolicy: 'skip' },
    expected: {
      coins: START_COINS,
      reputation: START_REPUTATION,
      coinChange: 0,
      repChange: 0,
      pushedId: null,
      rngCalls: 0,
      log: [],
    },
  },
  {
    name: 'cost is paid after the effect and independent of the policy',
    card: { id: 'evt-cost', coinDelta: -200, reputationDelta: 5 },
    option: { label: 'Pay', effectPolicy: 'apply', cost: { coins: 100, reputation: 5 } },
    expected: {
      coins: START_COINS - 200 - 100,
      reputation: START_REPUTATION + 5 - 5,
      coinChange: -300,
      repChange: 0,
      pushedId: null,
      rngCalls: 0,
      log: ['Cost paid: -100 coins, -5 reputation.'],
    },
  },
  {
    name: 'a skipped option still pays its cost',
    card: { id: 'evt-cost-skip', coinDelta: -200, reputationDelta: 5 },
    option: { label: 'Pay', effectPolicy: 'skip', cost: { reputation: 5 } },
    expected: {
      coins: START_COINS,
      reputation: START_REPUTATION - 5,
      coinChange: 0,
      repChange: -5,
      pushedId: null,
      rngCalls: 0,
      log: ['Cost paid: -5 reputation.'],
    },
  },
  {
    name: 'extraEffect is applied independently of the policy',
    card: { id: 'evt-extra', coinDelta: -200, reputationDelta: 5 },
    option: { label: 'Gain', effectPolicy: 'apply', extraEffect: { coins: 30, reputation: 2 } },
    expected: {
      coins: START_COINS - 200 + 30,
      reputation: START_REPUTATION + 5 + 2,
      coinChange: -170,
      repChange: 7,
      pushedId: null,
      rngCalls: 0,
      log: ['Extra effect: +30 coins, +2 reputation.'],
    },
  },
  {
    name: 'cost is paid before the extra effect in one resolution',
    card: { id: 'evt-both', coinDelta: -200, reputationDelta: 5 },
    option: {
      label: 'Both',
      effectPolicy: 'apply',
      cost: { coins: 100 },
      extraEffect: { coins: 30, reputation: 2 },
    },
    expected: {
      coins: START_COINS - 200 - 100 + 30,
      reputation: START_REPUTATION + 5 + 2,
      coinChange: -270,
      repChange: 7,
      pushedId: null,
      rngCalls: 0,
      // Declaration order: the payment is logged before the gain.
      log: ['Cost paid: -100 coins.', 'Extra effect: +30 coins, +2 reputation.'],
    },
  },
  {
    name: 'a zero cost component is unconstrained and never logged',
    card: { id: 'evt-zero' },
    option: {
      label: 'Zero',
      effectPolicy: 'skip',
      cost: { coins: 0, reputation: 5 },
      extraEffect: { coins: 0, reputation: 3 },
    },
    expected: {
      coins: START_COINS,
      reputation: START_REPUTATION - 5 + 3,
      coinChange: 0,
      repChange: -2,
      pushedId: null,
      rngCalls: 0,
      log: ['Cost paid: -5 reputation.', 'Extra effect: +3 reputation.'],
    },
  },
  {
    name: 'a negative extraEffect is applied by resolution (validation is permissive)',
    card: { id: 'evt-negative' },
    option: { label: 'Lose', effectPolicy: 'skip', extraEffect: { coins: -25 } },
    expected: {
      coins: START_COINS - 25,
      reputation: START_REPUTATION,
      coinChange: -25,
      repChange: 0,
      pushedId: null,
      rngCalls: 0,
      log: ['Extra effect: -25 coins.'],
    },
  },
];

describe('coins/reputation resolution order (baseline matrix)', () => {
  for (const scenario of RESOLUTION_SCENARIOS) {
    it(scenario.name, () => {
      const { system, state } = setup(scenario.templates ?? []);
      state.rngQueue = [...(scenario.rngQueue ?? [])];

      const card = makeCard({ ...scenario.card, name: scenario.card.id });
      const result = system.resolveStorylineOption(state, card, scenario.option);

      expect({
        coins: state.coins,
        reputation: state.reputation,
        coinChange: result.coinChange,
        repChange: result.repChange,
        pushedId: result.pushedCard?.id ?? null,
        rngCalls: state.rngCalls,
        log: state.activityLog.map((entry) => entry.text),
      }).toEqual(scenario.expected);
    });
  }
});

describe('draw-time affordability filtering (baseline)', () => {
  it('omits only the options whose declared cost exceeds the current resources', () => {
    const { system, state } = setup();
    system.registerStorylineOptions('evt-gate', [
      { label: 'Free', effectPolicy: 'skip' },
      { label: 'Empty cost', effectPolicy: 'skip', cost: {} },
      { label: 'Zero coins', effectPolicy: 'skip', cost: { coins: 0 } },
      { label: 'Coins boundary', effectPolicy: 'skip', cost: { coins: START_COINS } },
      { label: 'Coins short', effectPolicy: 'skip', cost: { coins: START_COINS + 1 } },
      {
        label: 'Reputation boundary',
        effectPolicy: 'skip',
        cost: { reputation: START_REPUTATION },
      },
      {
        label: 'Reputation short',
        effectPolicy: 'skip',
        cost: { reputation: START_REPUTATION + 1 },
      },
      { label: 'Both ok', effectPolicy: 'skip', cost: { coins: 10, reputation: 10 } },
      { label: 'One short', effectPolicy: 'skip', cost: { coins: 10, reputation: 999 } },
    ]);

    const presented = system
      .getStorylineOptions(makeCard({ id: 'evt-gate' }), state)
      .map((option) => option.label);

    expect(presented).toEqual([
      'Free',
      'Empty cost',
      'Zero coins',
      'Coins boundary',
      'Reputation boundary',
      'Both ok',
    ]);
  });

  it('isOptionAffordable treats an unspecified component as unconstrained', () => {
    const resources = { coins: START_COINS, reputation: START_REPUTATION };
    const cases: readonly {
      readonly label: string;
      readonly option: { cost?: { coins?: number; reputation?: number } };
      readonly affordable: boolean;
    }[] = [
      { label: 'no cost', option: {}, affordable: true },
      { label: 'empty cost', option: { cost: {} }, affordable: true },
      { label: 'coins boundary', option: { cost: { coins: START_COINS } }, affordable: true },
      {
        label: 'coins short',
        option: { cost: { coins: START_COINS + 1 } },
        affordable: false,
      },
      {
        label: 'reputation boundary',
        option: { cost: { reputation: START_REPUTATION } },
        affordable: true,
      },
      {
        label: 'reputation short',
        option: { cost: { reputation: START_REPUTATION + 1 } },
        affordable: false,
      },
      // An unspecified component is never defaulted to zero, so a missing
      // component never blocks an otherwise affordable option.
      { label: 'coins only', option: { cost: { coins: 1 } }, affordable: true },
    ];

    for (const { label, option, affordable } of cases) {
      expect(isOptionAffordable(option, resources), label).toBe(affordable);
    }
    expect(
      isOptionAffordable({ cost: { coins: 1 } }, { coins: 1, reputation: 0 }),
      'a zero reputation balance does not block a coins-only cost',
    ).toBe(true);
  });

  it('freezes the filtered list at draw time (it never re-reads resources)', () => {
    const { system, state } = setup();
    system.registerStorylineOptions('evt-frozen', [
      { label: 'Dear', effectPolicy: 'skip', cost: { coins: 900 } },
    ]);

    const pending = system.createPendingStorylineChoice(makeCard({ id: 'evt-frozen' }), state);
    expect(pending?.options?.map((option) => option.label)).toEqual(['Dear']);

    state.coins = 0;
    expect(system.getPendingStorylineOptions(pending!, state).map((o) => o.label)).toEqual([
      'Dear',
    ]);
  });
});

describe('successor precedence ladder (baseline)', () => {
  /** Catalogue every rung of the ladder can resolve to. */
  const TEMPLATES: readonly TestCard[] = [
    makeCard({ id: 'evt-resolver' }),
    makeCard({ id: 'evt-rule' }),
    makeCard({ id: 'evt-candidate-a' }),
    makeCard({ id: 'evt-candidate-b' }),
    makeCard({ id: 'evt-single' }),
  ];

  /** Registers one option under `evt-ladder` and resolves it. */
  function resolveLadder(
    option: StorylineOption<TestState>,
    rngQueue: readonly number[] = [],
  ) {
    const { system, state } = setup(TEMPLATES);
    state.rngQueue = [...rngQueue];
    system.registerStorylineOptions('evt-ladder', [option]);
    const [registered] = system.getStorylineOptions(makeCard({ id: 'evt-ladder' }));
    const result = system.resolveStorylineOption(
      state,
      makeCard({ id: 'evt-ladder' }),
      registered,
    );
    return { state, result };
  }

  const RULE: Condition = { field: 'coins', op: '>=', value: 0 };

  it('1. successorResolver wins over every rung below it, consuming no draw', () => {
    const { state, result } = resolveLadder({
      label: 'Ladder',
      effectPolicy: 'skip',
      successorResolver: () => 'evt-resolver',
      conditionalSuccessors: [{ when: RULE, successorId: 'evt-rule' }],
      successorIds: ['evt-candidate-a', 'evt-candidate-b'],
      successorId: 'evt-single',
    });
    expect(result.pushedCard?.id).toBe('evt-resolver-0');
    expect(state.rngCalls).toBe(0);
  });

  it('2. the first matching rule wins over the candidate draw, consuming no draw', () => {
    const { state, result } = resolveLadder({
      label: 'Ladder',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>', value: 5000 }, successorId: 'evt-single' },
        { when: RULE, successorId: 'evt-rule' },
      ],
      successorIds: ['evt-candidate-a', 'evt-candidate-b'],
      successorId: 'evt-single',
    });
    expect(result.pushedCard?.id).toBe('evt-rule-0');
    expect(state.rngCalls).toBe(0);
  });

  it('3. with no matching rule the candidate set takes exactly one seeded draw', () => {
    const { state, result } = resolveLadder(
      {
        label: 'Ladder',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          { when: { field: 'coins', op: '>', value: 5000 }, successorId: 'evt-rule' },
        ],
        successorIds: ['evt-candidate-a', 'evt-candidate-b'],
        successorId: 'evt-single',
      },
      [0.75],
    );
    // 0.75 → floor(0.75 * 2) = 1 → the second candidate.
    expect(result.pushedCard?.id).toBe('evt-candidate-b-0');
    expect(state.rngCalls).toBe(1);
  });

  it('3b. an empty candidate set is terminal and consumes no draw', () => {
    const { state, result } = resolveLadder({
      label: 'Ladder',
      effectPolicy: 'skip',
      successorIds: [],
      successorId: 'evt-single',
    });
    expect(result.pushedCard).toBeNull();
    expect(state.rngCalls).toBe(0);
  });

  it('4. a single successorId is the lowest rung and consumes no draw', () => {
    const { state, result } = resolveLadder({
      label: 'Ladder',
      effectPolicy: 'skip',
      successorId: 'evt-single',
    });
    expect(result.pushedCard?.id).toBe('evt-single-0');
    expect(state.rngCalls).toBe(0);
  });

  it('evaluates rules against post-resolution resources (after cost is paid)', () => {
    const { state, result } = resolveLadder({
      label: 'Ladder',
      effectPolicy: 'skip',
      cost: { coins: 100 },
      conditionalSuccessors: [
        { when: { field: 'coins', op: '<=', value: START_COINS - 100 }, successorId: 'evt-rule' },
      ],
      successorIds: ['evt-candidate-a'],
    });
    expect(result.pushedCard?.id).toBe('evt-rule-0');
    expect(state.coins).toBe(START_COINS - 100);
    expect(state.rngCalls).toBe(0);
  });
});

describe('validation versus runtime permissiveness (baseline)', () => {
  it('rejects a negative extraEffect on either resource, with both paths', () => {
    const result = validateStorylineOptions<TestState>([
      { label: 'Bad', effectPolicy: 'apply', extraEffect: { coins: -10, reputation: -1 } },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'negative-extra-effect',
      'negative-extra-effect',
    ]);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'options[0].extraEffect.coins',
      'options[0].extraEffect.reputation',
    ]);
  });

  it('accepts a zero extra effect and any positive gain', () => {
    expect(
      validateStorylineOptions<TestState>([
        { label: 'Ok', effectPolicy: 'apply', extraEffect: { coins: 0, reputation: 3 } },
      ]).valid,
    ).toBe(true);
  });

  it('rejects a non-positive or non-numeric cost', () => {
    const result = validateStorylineOptions<TestState>([
      { label: 'Zero', effectPolicy: 'apply', cost: { coins: 0 } },
      { label: 'Negative', effectPolicy: 'apply', cost: { reputation: -5 } },
      { label: 'Infinite', effectPolicy: 'apply', cost: { coins: Number.POSITIVE_INFINITY } },
    ]);
    expect(result.issues.map((issue) => [issue.path, issue.code])).toEqual([
      ['options[0].cost.coins', 'non-positive-cost'],
      ['options[1].cost.reputation', 'non-positive-cost'],
      ['options[2].cost.coins', 'non-numeric-value'],
    ]);
  });

  it('accepts coins/reputation as the default projection', () => {
    expect(
      validateStorylineOptions<TestState>([
        {
          label: 'Default projection',
          effectPolicy: 'skip',
          conditionalSuccessors: [
            { when: { field: 'coins', op: '>=', value: 1 }, successorId: null },
            { when: { field: 'reputation', op: '<', value: 1 }, successorId: null },
          ],
        },
      ]).valid,
    ).toBe(true);
  });

  it('rejects an undeclared resource key and accepts it once the game declares it', () => {
    const declaredOptions: StorylineOption<TestState>[] = [
      {
        label: 'Declared resource',
        effectPolicy: 'skip',
        conditionalSuccessors: [
          { when: { field: 'hull', op: '>=', value: 1 }, successorId: 'evt-resolver' },
        ],
      },
    ];

    // Without a declaration the default projection applies: `hull` is unknown.
    expect(
      validateStorylineOptions<TestState>(declaredOptions).issues.map((issue) => [
        issue.path,
        issue.code,
      ]),
    ).toEqual([
      ['options[0].conditionalSuccessors[0].when.field', 'unknown-condition-field'],
    ]);

    // Once declared, the same options validate cleanly.
    expect(
      validateStorylineOptions<TestState>(declaredOptions, {
        resources: ['coins', 'reputation', 'hull'],
      }).valid,
    ).toBe(true);
  });
});

// ── Irreversible grants are refused at selection ────────────

describe('irreversible grants (G5 refusal at selection)', () => {
  const DECLARED = ['coins', 'reputation', 'hull'] as const;
  const IRREVERSIBLE = ['hull'] as const;

  it('moves a positive grant on an irreversible key into refused', () => {
    const selection = selectDeclaredDelta(
      { hull: 1, coins: 2 },
      1,
      DECLARED,
      { irreversible: IRREVERSIBLE },
    );

    expect(selection).toEqual({
      delta: { coins: 2 },
      ignored: [],
      refused: ['hull'],
    });
  });

  it('never refuses a deduction: an irreversible key may be spent', () => {
    const selection = selectDeclaredDelta(
      { hull: 1, coins: 2 },
      -1,
      DECLARED,
      { irreversible: IRREVERSIBLE },
    );

    expect(selection).toEqual({
      delta: { hull: -1, coins: -2 },
      ignored: [],
      refused: [],
    });
  });

  it('forwards a positive grant on a non-irreversible key', () => {
    const selection = selectDeclaredDelta(
      { coins: 3, reputation: 1 },
      1,
      DECLARED,
      { irreversible: IRREVERSIBLE },
    );

    expect(selection).toEqual({
      delta: { coins: 3, reputation: 1 },
      ignored: [],
      refused: [],
    });
  });

  it('reports an undeclared key as ignored, never as refused', () => {
    const selection = selectDeclaredDelta(
      { shields: 1 },
      1,
      DECLARED,
      { irreversible: IRREVERSIBLE },
    );

    expect(selection).toEqual({ delta: {}, ignored: ['shields'], refused: [] });
  });

  it('declares nothing by default: every declared delta is forwarded, refused is empty', () => {
    const selection = selectDeclaredDelta({ coins: 1, hull: 2 }, 1, DECLARED);

    expect(selection).toEqual({
      delta: { coins: 1, hull: 2 },
      ignored: [],
      refused: [],
    });
  });
});
