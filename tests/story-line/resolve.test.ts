/**
 * Story-line resolution parity tests (MS-0MVFM9HGI004XADO AC3).
 *
 * Ports Main Street's resolution cases onto the generic API:
 *
 * - `apply` / `skip` effect policy;
 * - successor precedence (resolver → seeded candidate draw → legacy id);
 * - exactly one seeded `rng()` draw per candidate selection at resolution
 *   time, terminal options consuming no draw;
 * - deterministic chain-card serial naming across deck locations;
 * - pending-choice lifecycle (draw-time snapshot, resolve marking).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { createStorylineSystem, evaluateCondition } from '../../src/story-line';
import {
  addTemplate,
  makeAdapter,
  makeCard,
  makeState,
  type TemplateMap,
  type TestCard,
} from './helpers';

/** Builds a system plus its template catalogue. */
function setup(templates: TestCard[] = []) {
  const map: TemplateMap = new Map();
  for (const t of templates) addTemplate(map, t);
  const engine = makeAdapter(map);
  const system = createStorylineSystem({ engine });
  return { system, map, engine, state: makeState() };
}

// ── AC3: effect policy ──────────────────────────────────────

describe('effect policy', () => {
  it('apply runs the card effect and reports the deltas', () => {
    const { system, state } = setup();
    const card = makeCard({ id: 'evt-eff', coinDelta: -200, reputationDelta: 5 });
    const res = system.resolveStorylineOption(state, card, {
      label: 'Accept',
      effectPolicy: 'apply',
    });

    expect(res.coinChange).toBe(-200);
    expect(res.repChange).toBe(5);
    expect(state.coins).toBe(800);
    expect(state.reputation).toBe(55);
  });

  it('skip leaves the effect unapplied and reports zero deltas', () => {
    const { system, state } = setup();
    const card = makeCard({ id: 'evt-eff', coinDelta: -200, reputationDelta: 5 });
    const res = system.resolveStorylineOption(state, card, {
      label: 'Reject',
      effectPolicy: 'skip',
    });

    expect(res.coinChange).toBe(0);
    expect(res.repChange).toBe(0);
    expect(state.coins).toBe(1000);
    expect(state.reputation).toBe(50);
  });
});

// ── AC3: successor precedence ───────────────────────────────

describe('successor precedence', () => {
  it('resolver wins over candidates and legacy id, consuming no rng', () => {
    const { system, state } = setup([makeCard({ id: 'evt-resolved' })]);
    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Go',
      effectPolicy: 'apply',
      successorResolver: () => 'evt-resolved',
      successorIds: ['evt-cand'],
      successorId: 'evt-legacy',
    });

    expect(res.pushedCard?.id).toBe('evt-resolved-0');
    expect(state.rngCalls).toBe(0);
  });

  it('a resolver returning null ends the chain without a draw', () => {
    const { system, state } = setup();
    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Stop',
      effectPolicy: 'apply',
      successorResolver: () => null,
    });
    expect(res.pushedCard).toBeNull();
    expect(state.rngCalls).toBe(0);
  });

  it('candidate set consumes exactly one seeded draw per selection', () => {
    const { system, state } = setup([
      makeCard({ id: 'evt-a' }),
      makeCard({ id: 'evt-b' }),
    ]);
    state.rngQueue = [0];
    system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Pick',
      effectPolicy: 'apply',
      successorIds: ['evt-a', 'evt-b'],
    });
    expect(state.rngCalls).toBe(1);
  });

  it('the single draw selects uniformly across the candidate list', () => {
    const { system } = setup([
      makeCard({ id: 'evt-a' }),
      makeCard({ id: 'evt-b' }),
      makeCard({ id: 'evt-c' }),
    ]);

    const low = makeState({ rngQueue: [0] });
    const lowRes = system.resolveStorylineOption(low, makeCard({ id: 'evt-card' }), {
      label: 'Pick',
      effectPolicy: 'apply',
      successorIds: ['evt-a', 'evt-b', 'evt-c'],
    });
    expect(lowRes.pushedCard?.id).toBe('evt-a-0');

    const high = makeState({ rngQueue: [0.99] });
    const highRes = system.resolveStorylineOption(high, makeCard({ id: 'evt-card' }), {
      label: 'Pick',
      effectPolicy: 'apply',
      successorIds: ['evt-a', 'evt-b', 'evt-c'],
    });
    expect(highRes.pushedCard?.id).toBe('evt-c-0');
  });

  it('a terminal (empty candidate) option consumes no draw', () => {
    const { system, state } = setup();
    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Walk away',
      effectPolicy: 'apply',
      successorIds: [],
    });
    expect(res.pushedCard).toBeNull();
    expect(state.rngCalls).toBe(0);
  });

  it('a legacy single successorId is pushed directly, consuming no draw', () => {
    const { system, state } = setup([makeCard({ id: 'evt-legacy' })]);
    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Accept',
      successorId: 'evt-legacy',
      effectPolicy: 'apply',
    });
    expect(res.pushedCard?.id).toBe('evt-legacy-0');
    expect(state.rngCalls).toBe(0);
  });
});

// ── AC3: deterministic chain-card naming ────────────────────

describe('deterministic chain-card naming', () => {
  it('sums the highest serial across deck and discard locations, +1', () => {
    const { system, state } = setup([makeCard({ id: 'evt-chain', name: 'Chain' })]);
    state.deck = [makeCard({ id: 'evt-chain-0' }), makeCard({ id: 'evt-chain-2' })];
    state.discards = [makeCard({ id: 'evt-chain-5' })];

    const card = system.pushChainCard(state, 'evt-chain');
    expect(card?.id).toBe('evt-chain-6');
    expect(state.deck[state.deck.length - 1]?.id).toBe('evt-chain-6');
  });

  it('starts at serial 0 when no instance exists', () => {
    const { system, state } = setup([makeCard({ id: 'evt-chain' })]);
    expect(system.pushChainCard(state, 'evt-chain')?.id).toBe('evt-chain-0');
  });

  it('ignores serials from unrelated base ids', () => {
    const { system, state } = setup([makeCard({ id: 'evt-chain' })]);
    state.deck = [makeCard({ id: 'evt-other-9' })];
    expect(system.pushChainCard(state, 'evt-chain')?.id).toBe('evt-chain-0');
  });

  it('is replay-safe: repeated pushes increment monotonically', () => {
    const { system, state } = setup([makeCard({ id: 'evt-chain' })]);
    expect(system.pushChainCard(state, 'evt-chain')?.id).toBe('evt-chain-0');
    expect(system.pushChainCard(state, 'evt-chain')?.id).toBe('evt-chain-1');
    expect(system.pushChainCard(state, 'evt-chain')?.id).toBe('evt-chain-2');
  });

  it('copies the template and overrides only the id', () => {
    const { system, state } = setup([
      makeCard({ id: 'evt-chain', name: 'Chain', coinDelta: -50, storylineId: 'arc' }),
    ]);
    const card = system.pushChainCard(state, 'evt-chain');
    expect(card).toMatchObject({ id: 'evt-chain-0', name: 'Chain', coinDelta: -50, storylineId: 'arc' });
  });

  it('null / undefined ends the chain with no push', () => {
    const { system, state } = setup();
    expect(system.pushChainCard(state, null)).toBeNull();
    expect(system.pushChainCard(state, undefined)).toBeNull();
    expect(state.deck).toHaveLength(0);
  });

  it('a missing template logs a neutral line and pushes nothing', () => {
    const { system, state } = setup();
    expect(system.pushChainCard(state, 'evt-missing')).toBeNull();
    expect(state.deck).toHaveLength(0);
    expect(state.activityLog[state.activityLog.length - 1]?.text).toContain(
      'Chain card evt-missing not found in card data.',
    );
  });
});

// ── AC3: pending-choice lifecycle ───────────────────────────

describe('pending-choice lifecycle', () => {
  it('returns null for a non-choice card', () => {
    const { system } = setup();
    expect(system.createPendingStorylineChoice(makeCard({ id: 'evt-plain' }))).toBeNull();
  });

  it('creates a pending choice for a choice card', () => {
    const { system } = setup();
    const pending = system.createPendingStorylineChoice(
      makeCard({ id: 'evt-choice', hasChoices: true }),
    );
    expect(pending).not.toBeNull();
    expect(pending?.chosenOption).toBeNull();
    expect(pending?.resolved).toBe(false);
  });

  it('freezes the condition-filtered option list at draw time', () => {
    const { system, state } = setup();
    let evaluations = 0;
    system.registerStorylineOptions('evt-cond', [
      {
        label: 'Rich only',
        effectPolicy: 'apply',
        condition: (s) => {
          evaluations += 1;
          return s.coins > 500;
        },
      },
    ]);

    const pending = system.createPendingStorylineChoice(makeCard({ id: 'evt-cond' }), state);
    expect(pending?.options?.map((o) => o.label)).toEqual(['Rich only']);
    expect(evaluations).toBe(1);

    // Mutating state after the draw cannot change the frozen snapshot.
    state.coins = 0;
    expect(system.getPendingStorylineOptions(pending!, state).map((o) => o.label)).toEqual([
      'Rich only',
    ]);
    expect(evaluations).toBe(1);
  });

  it('without state the pending choice has no snapshot and recompiles on demand', () => {
    const { system } = setup();
    const pending = system.createPendingStorylineChoice(
      makeCard({ id: 'evt-choice', options: 'Go|evt-a' }),
    );
    expect(pending?.options).toBeUndefined();
    expect(system.getPendingStorylineOptions(pending!).map((o) => o.label)).toEqual(['Go']);
  });

  it('markChoiceResolved records the chosen label and resolution flag', () => {
    const { system } = setup();
    const pending = system.createPendingStorylineChoice(
      makeCard({ id: 'evt-choice', hasChoices: true }),
    )!;
    system.markChoiceResolved(pending, 'Accept');
    expect(pending.chosenOption).toBe('Accept');
    expect(pending.resolved).toBe(true);
  });
});

// ── C3: cost payment and extra effects ──────────────────────

describe('cost payment and extra effects', () => {
  it('deducts the option cost and reports it in the deltas', () => {
    const { system, state } = setup();
    const card = makeCard({ id: 'evt-cost', name: 'Cost' });
    const res = system.resolveStorylineOption(state, card, {
      label: 'Pay',
      effectPolicy: 'skip',
      cost: { coins: 100, reputation: 5 },
    });

    expect(state.coins).toBe(900);
    expect(state.reputation).toBe(45);
    expect(res.coinChange).toBe(-100);
    expect(res.repChange).toBe(-5);
  });

  it('applies extraEffect independently of the effect policy', () => {
    const { system, state } = setup();
    const card = makeCard({ id: 'evt-extra', coinDelta: -200, reputationDelta: 5 });

    const applied = system.resolveStorylineOption(state, card, {
      label: 'Accept',
      effectPolicy: 'apply',
      extraEffect: { coins: 10, reputation: 2 },
    });
    // -200 (policy) + 10 (extra effect)
    expect(applied.coinChange).toBe(-190);
    expect(applied.repChange).toBe(7);
    expect(state.coins).toBe(810);
    expect(state.reputation).toBe(57);

    const skipped = system.resolveStorylineOption(state, card, {
      label: 'Reject',
      effectPolicy: 'skip',
      extraEffect: { coins: 10, reputation: 2 },
    });
    // The card effect is skipped; the extra effect still applies.
    expect(skipped.coinChange).toBe(10);
    expect(skipped.repChange).toBe(2);
    expect(state.coins).toBe(820);
    expect(state.reputation).toBe(59);
  });

  it('combines cost and extraEffect in one resolution', () => {
    const { system, state } = setup();
    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-both' }), {
      label: 'Pay and gain',
      effectPolicy: 'skip',
      cost: { coins: 100 },
      extraEffect: { coins: 30, reputation: -2 },
    });

    expect(res.coinChange).toBe(-70);
    expect(res.repChange).toBe(-2);
    expect(state.coins).toBe(930);
    expect(state.reputation).toBe(48);
  });

  it('applies the policy effect before the cost and the extra effect', () => {
    const { map } = setup();
    const calls: string[] = [];
    const engine = makeAdapter(map);
    const applyEffect = engine.applyEffect.bind(engine);
    const applyResourceDelta = engine.applyResourceDelta!.bind(engine);
    engine.applyEffect = (state, card) => {
      calls.push(`effect:${card.id}`);
      applyEffect(state, card);
    };
    engine.applyResourceDelta = (state, delta) => {
      calls.push(`delta:${delta.coins ?? 0}`);
      applyResourceDelta(state, delta);
    };
    const ordered = createStorylineSystem({ engine });
    const state = makeState();

    ordered.resolveStorylineOption(state, makeCard({ id: 'evt-order' }), {
      label: 'Ordered',
      effectPolicy: 'apply',
      cost: { coins: 100 },
      extraEffect: { coins: 25 },
    });

    expect(calls).toEqual(['effect:evt-order', 'delta:-100', 'delta:25']);
    expect(state.coins).toBe(925);
  });

  it('logs the cost payment before the extra effect', () => {
    const { system, state } = setup();
    system.resolveStorylineOption(state, makeCard({ id: 'evt-log' }), {
      label: 'Logged',
      effectPolicy: 'skip',
      cost: { coins: 5 },
      extraEffect: { reputation: 1 },
    });

    const texts = state.activityLog.map((e) => e.text);
    expect(texts).toEqual([
      'Cost paid: -5 coins.',
      'Extra effect: +1 reputation.',
    ]);
  });

  it('can drive resources to zero (loss-check precondition)', () => {
    const { system, state } = setup();
    state.coins = 25;
    state.reputation = 2;

    system.resolveStorylineOption(state, makeCard({ id: 'evt-zero' }), {
      label: 'All in',
      effectPolicy: 'skip',
      cost: { coins: 25, reputation: 2 },
    });

    expect(state.coins).toBe(0);
    expect(state.reputation).toBe(0);
  });

  it('behaves identically when cost and extraEffect are absent', () => {
    const { system, state } = setup();
    const card = makeCard({ id: 'evt-plain', coinDelta: -40, reputationDelta: 3 });
    const res = system.resolveStorylineOption(state, card, {
      label: 'Accept',
      effectPolicy: 'apply',
    });

    expect(res.coinChange).toBe(-40);
    expect(res.repChange).toBe(3);
    expect(state.coins).toBe(960);
    expect(state.reputation).toBe(53);
    expect(state.activityLog).toHaveLength(0);
  });

  it('leaves resources untouched and warns when the adapter has no mutation seam', () => {
    const { map, state } = setup();
    const engine = makeAdapter(map);
    // Simulate a legacy adapter implementor predating `applyResourceDelta`.
    delete (engine as { applyResourceDelta?: unknown }).applyResourceDelta;
    const legacy = createStorylineSystem({ engine });

    const res = legacy.resolveStorylineOption(state, makeCard({ id: 'evt-legacy-seam' }), {
      label: 'Pay',
      effectPolicy: 'skip',
      cost: { coins: 100 },
      extraEffect: { coins: 10 },
    });

    expect(state.coins).toBe(1000);
    expect(res.coinChange).toBe(0);
    expect(
      state.activityLog.some((e) =>
        e.text.includes('applyResourceDelta'),
      ),
    ).toBe(true);
  });
});

// ── C4: declarative conditional successors ──────────────────

describe('declarative conditional successors', () => {
  it('picks the first matching rule (greater-than threshold)', () => {
    const { system, state, map } = setup([makeCard({ id: 'evt-high' })]);
    expect(map.size).toBe(1);
    state.coins = 600;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>', value: 500 }, successorId: 'evt-high' },
      ],
      successorId: 'evt-fallback',
    });

    expect(res.pushedCard?.id).toBe('evt-high-0');
    expect(state.rngCalls).toBe(0);
  });

  it('does not match below the threshold', () => {
    const { system, state, map } = setup([
      makeCard({ id: 'evt-low' }),
      makeCard({ id: 'evt-fallback' }),
    ]);
    state.coins = 400;
    expect(map.size).toBe(2);

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>', value: 500 }, successorId: 'evt-low' },
      ],
      successorId: 'evt-fallback',
    });

    expect(res.pushedCard?.id).toBe('evt-fallback-0');
  });

  it('treats equality as a match for >= (boundary)', () => {
    const { system, state } = setup([makeCard({ id: 'evt-eq' })]);
    state.reputation = 42;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'reputation', op: '>=', value: 42 }, successorId: 'evt-eq' },
      ],
      successorId: 'evt-fallback',
    });

    expect(res.pushedCard?.id).toBe('evt-eq-0');
  });

  it('treats equality as a non-match for > (boundary)', () => {
    const { system, state } = setup([
      makeCard({ id: 'evt-eq' }),
      makeCard({ id: 'evt-fallback' }),
    ]);
    state.reputation = 42;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'reputation', op: '>', value: 42 }, successorId: 'evt-eq' },
      ],
      successorId: 'evt-fallback',
    });

    expect(res.pushedCard?.id).toBe('evt-fallback-0');
  });

  it('evaluates rules sequentially and takes the first match', () => {
    const { system, state } = setup([
      makeCard({ id: 'evt-first' }),
      makeCard({ id: 'evt-second' }),
    ]);
    state.coins = 100;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>=', value: 50 }, successorId: 'evt-first' },
        { when: { field: 'coins', op: '>=', value: 0 }, successorId: 'evt-second' },
      ],
    });

    expect(res.pushedCard?.id).toBe('evt-first-0');
  });

  it('a matching rule consumes no RNG draw', () => {
    const { system, state } = setup([makeCard({ id: 'evt-branch' })]);
    state.coins = 10;
    state.rngQueue = [0]; // would select evt-a if the draw ran

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '<=', value: 10 }, successorId: 'evt-branch' },
      ],
      successorIds: ['evt-cand'],
    });

    expect(res.pushedCard?.id).toBe('evt-branch-0');
    expect(state.rngCalls).toBe(0);
  });

  it('runs ahead of the random candidate draw', () => {
    const { system, state } = setup([makeCard({ id: 'evt-rule' })]);
    state.coins = 1;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>=', value: 0 }, successorId: 'evt-rule' },
      ],
      successorIds: ['evt-cand-a', 'evt-cand-b'],
    });

    expect(res.pushedCard?.id).toBe('evt-rule-0');
    expect(state.rngCalls).toBe(0);
  });

  it('keeps the callback resolver at the highest precedence', () => {
    const { system, state } = setup([makeCard({ id: 'evt-resolved' })]);
    state.coins = 1;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      successorResolver: () => 'evt-resolved',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>=', value: 0 }, successorId: 'evt-rule' },
      ],
    });

    expect(res.pushedCard?.id).toBe('evt-resolved-0');
    expect(state.rngCalls).toBe(0);
  });

  it('a matching null target ends the chain without pushing a card', () => {
    const { system, state } = setup();
    state.coins = 999;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>=', value: 500 }, successorId: null },
      ],
      successorId: 'evt-fallback',
    });

    expect(res.pushedCard).toBeNull();
    expect(state.deck).toHaveLength(0);
  });

  it('falls back to the legacy single successorId when no rule matches', () => {
    const { system, state } = setup([makeCard({ id: 'evt-legacy' })]);
    state.coins = 10;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Branch',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '>', value: 100 }, successorId: 'unused' },
      ],
      successorId: 'evt-legacy',
    });
    expect(res.pushedCard?.id).toBe('evt-legacy-0');
  });

  it('evaluates rules against the post-effect resources', () => {
    const { system, state } = setup([
      makeCard({ id: 'evt-with-effect', coinDelta: -50 }),
    ]);
    state.coins = 100;

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card', coinDelta: -50 }), {
      label: 'Branch',
      effectPolicy: 'apply',
      conditionalSuccessors: [
        { when: { field: 'coins', op: '<=', value: 50 }, successorId: 'evt-with-effect' },
      ],
      successorId: 'evt-fallback',
    });

    // The card effect drops coins 100 → 50, so the <= 50 rule matches and
    // the pushed successor must be the rule's target (not the fallback).
    expect(res.pushedCard?.id).toBe('evt-with-effect-0');
  });

  it('behaves unchanged when conditionalSuccessors is absent', () => {
    const { system, state } = setup([makeCard({ id: 'evt-cand' })]);

    const res = system.resolveStorylineOption(state, makeCard({ id: 'evt-card' }), {
      label: 'Pick',
      effectPolicy: 'skip',
      successorIds: ['evt-cand'],
    });

    expect(state.rngCalls).toBe(1);
    expect(res.pushedCard).not.toBeNull();
  });
});

// ── C4: pure condition helper ───────────────────────────────

describe('evaluateCondition', () => {
  const resources = { coins: 100, reputation: 5 };

  it('implements every declarative operator at and around the boundary', () => {
    expect(evaluateCondition({ field: 'coins', op: '>=', value: 100 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'coins', op: '>=', value: 101 }, resources)).toBe(false);
    expect(evaluateCondition({ field: 'coins', op: '<=', value: 100 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'coins', op: '<=', value: 99 }, resources)).toBe(false);
    expect(evaluateCondition({ field: 'coins', op: '>', value: 99 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'coins', op: '>', value: 100 }, resources)).toBe(false);
    expect(evaluateCondition({ field: 'coins', op: '<', value: 101 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'coins', op: '<', value: 100 }, resources)).toBe(false);
    expect(evaluateCondition({ field: 'coins', op: '==', value: 100 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'coins', op: '==', value: 99 }, resources)).toBe(false);
  });

  it('reads the field named by the condition', () => {
    expect(evaluateCondition({ field: 'reputation', op: '>=', value: 5 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'reputation', op: '>=', value: 6 }, resources)).toBe(false);
    expect(evaluateCondition({ field: 'reputation', op: '<=', value: 5 }, resources)).toBe(true);
    expect(evaluateCondition({ field: 'reputation', op: '>', value: 5 }, resources)).toBe(false);
  });
});
