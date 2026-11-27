/**
 * Story-line compilation parity tests (MS-0MVFM9HGI004XADO AC1/AC2).
 *
 * Ports Main Street's storyline-model / storyline-csv-options compilation
 * cases onto the generic story-line API:
 *
 * - options-only compilation (a bare `storylineId`, or a stale object still
 *   carrying the retired legacy fields, is NOT a choice);
 * - CSV `options` encoding parsing (whitespace trimming, terminal options,
 *   malformed/rejected encodings, `apply` policy);
 * - registered-option precedence over CSV compilation;
 * - draw-time condition filtering (evaluated once, at compile time);
 * - `eventHasStoryline` semantics (a bare `storylineId` is NOT a choice).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createStorylineSystem,
  isOptionAffordable,
  optionAffordability,
  type StorylineEngineAdapter,
} from '../../src/story-line';
import {
  makeAdapter,
  makeCard,
  makeState,
  type TemplateMap,
  type TestCard,
  type TestState,
} from './helpers';

/** A system instance bound to an empty template catalogue + adapter. */
function makeSystem() {
  const templates: TemplateMap = new Map();
  const engine = makeAdapter(templates);
  const system = createStorylineSystem({ engine });
  return { system, templates, engine, state: makeState() };
}

// ── AC1: options-only compilation ──────────────────────────

describe('options-only compilation', () => {
  it('compiles a CSV options card with candidate successor sets', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-two-way',
      options: 'Accept|evt-next-a;Reject|evt-next-b',
    });

    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.storylineId).toBeNull();
    expect(compiled.compiledOptions).toEqual([
      { label: 'Accept', successorIds: ['evt-next-a'], effectPolicy: 'apply' },
      { label: 'Reject', successorIds: ['evt-next-b'], effectPolicy: 'apply' },
    ]);
  });

  it('a terminal option compiles with an empty successor list', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-terminal-option', options: 'Go|' });
    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.compiledOptions).toEqual([
      { label: 'Go', successorIds: [], effectPolicy: 'apply' },
    ]);
  });

  it('a non-choice card compiles to an empty option list', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-plain' });
    expect(system.compileStorylineFromEvent(card).compiledOptions).toEqual([]);
  });

  it('a card with only a storylineId is NOT a choice', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-terminal', storylineId: 'arc', storylineTitle: 'Arc' });
    expect(system.eventHasStoryline(card)).toBe(false);
    expect(system.compileStorylineFromEvent(card).compiledOptions).toEqual([]);
    expect(system.storylineOptionCount(card)).toBe(0);
  });

  it('ignores unknown properties that look like a two-way choice card', () => {
    const { system } = makeSystem();
    // The runtime model no longer declares any two-way choice/link property. A
    // card that still carries extra properties (a stale save, an older
    // adapter) must not become a choice: only registered options or a
    // non-empty `options` encoding do that.
    const card = {
      ...makeCard({ id: 'evt-unknown' }),
      legacyChoiceFlag: true,
      legacyAcceptLink: 'evt-next-a',
      legacyRejectLink: 'evt-next-b',
    } as unknown as TestCard;

    expect(system.eventHasStoryline(card)).toBe(false);
    expect(system.compileStorylineFromEvent(card).compiledOptions).toEqual([]);
    expect(system.storylineOptionCount(card)).toBe(0);
    expect(system.createPendingStorylineChoice(card)).toBeNull();
  });

  it('carries storyline metadata through compilation', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-story',
      storylineId: 'storyline-alpha',
      storylineTitle: 'Alpha Arc',
      options: 'Go|evt-story-next',
    });
    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.storylineId).toBe('storyline-alpha');
    expect(compiled.compiledOptions.map((o) => o.label)).toEqual(['Go']);
  });
});

// ── AC1: CSV `options` encoding ─────────────────────────────

describe('CSV `options` encoding compilation', () => {
  it('compiles an arbitrary ordered option list with candidate sets', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-multi',
      storylineId: 'arc-multi',
      options: 'Negotiate|evt-multi-a,evt-multi-b;Walk away|;Escalate|evt-multi-c',
    });

    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.compiledOptions.map((o) => o.label)).toEqual([
      'Negotiate',
      'Walk away',
      'Escalate',
    ]);
    expect(compiled.compiledOptions[0]?.successorIds).toEqual([
      'evt-multi-a',
      'evt-multi-b',
    ]);
    expect(compiled.compiledOptions[1]?.successorIds).toEqual([]);
    expect(compiled.compiledOptions[2]?.successorIds).toEqual(['evt-multi-c']);
  });

  it('compilation is deterministic and returns fresh option objects', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-multi', options: 'One|a,b;Two|' });

    const first = system.compileStorylineFromEvent(card).compiledOptions;
    const second = system.compileStorylineFromEvent(card).compiledOptions;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });

  it('whitespace around labels, separators and candidate ids is trimmed', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-padded',
      options: '  Negotiate |  evt-a , evt-b ;  Walk away |  ',
    });

    const options = system.compileStorylineFromEvent(card).compiledOptions;
    expect(options.map((o) => o.label)).toEqual(['Negotiate', 'Walk away']);
    expect(options[0]?.successorIds).toEqual(['evt-a', 'evt-b']);
    expect(options[1]?.successorIds).toEqual([]);
    expect(options.every((o) => o.effectPolicy === 'apply')).toBe(true);
  });

  it('a blank / whitespace-only options cell is a non-choice node', () => {
    const { system } = makeSystem();
    expect(system.eventHasStoryline(makeCard({ id: 'evt-plain' }))).toBe(false);
    expect(
      system.eventHasStoryline(makeCard({ id: 'evt-spaces', options: '   ' })),
    ).toBe(false);
    expect(system.compileStorylineFromEvent(makeCard({ id: 'evt-spaces', options: '  ' })).compiledOptions).toEqual([]);
  });

  it('a non-empty options encoding makes the card a choice', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-derived', options: 'Go|' });
    expect(system.eventHasStoryline(card)).toBe(true);
    expect(system.storylineOptionCount(card)).toBe(1);
  });

  it('every CSV-authored option carries effectPolicy "apply"', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-apply', options: 'One|a;Two|;Three|b' });
    const policies = system.getStorylineOptions(card).map((o) => o.effectPolicy);
    expect(policies).toEqual(['apply', 'apply', 'apply']);
  });
});

describe('malformed `options` encodings are rejected', () => {
  const { system } = makeSystem();

  it('a non-empty encoding that decodes to no valid option throws', () => {
    expect(() => system.parseStorylineOptionsEncoding(';;')).toThrow(/no valid option/);
    expect(() =>
      system.compileStorylineFromEvent(makeCard({ id: 'evt-bad', options: ' ; ; ' })),
    ).toThrow(/no valid option/);
  });

  it('an option segment missing the label/successor separator is rejected', () => {
    expect(() =>
      system.parseStorylineOptionsEncoding('Negotiate;Go|evt-a'),
    ).toThrow(/missing the "\|" separator/);
  });

  it('an empty label is rejected', () => {
    expect(() => system.parseStorylineOptionsEncoding('|evt-a')).toThrow(/empty label/);
    expect(() => system.parseStorylineOptionsEncoding('Good|evt-a;|evt-b')).toThrow(
      /empty label/,
    );
  });

  it('blank encodings decode to an empty option list (non-choice)', () => {
    expect(system.parseStorylineOptionsEncoding('')).toEqual([]);
    expect(system.parseStorylineOptionsEncoding('  \n  ')).toEqual([]);
  });
});

// ── AC2: registered-option precedence ───────────────────────

describe('registered-option precedence', () => {
  it('registered options fill in a card with no CSV options', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-reg' });

    system.registerStorylineOptions('evt-reg', [
      { label: 'Investigate', successorIds: ['evt-c'], effectPolicy: 'apply' },
    ]);
    expect(system.getStorylineOptions(card).map((o) => o.label)).toEqual([
      'Investigate',
    ]);
  });

  it('registered options take precedence over CSV options', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-reg-csv', options: 'CSV|evt-a' });

    system.registerStorylineOptions('evt-reg-csv', [
      { label: 'Programmatic', successorId: 'evt-b', effectPolicy: 'skip' },
    ]);
    expect(system.getStorylineOptions(card).map((o) => o.label)).toEqual([
      'Programmatic',
    ]);
  });

  it('registry lookups are keyed by base type id (instance-serial tolerant)', () => {
    const { system } = makeSystem();
    system.registerStorylineOptions('evt-serial', [
      { label: 'Go', successorId: 'evt-x', effectPolicy: 'apply' },
    ]);
    const card = makeCard({ id: 'evt-serial-3' });
    expect(system.hasRegisteredStorylineOptions('evt-serial-3')).toBe(true);
    expect(system.eventHasStoryline(card)).toBe(true);
  });

  it('resetStorylineRegistry clears all registrations (test isolation)', () => {
    const { system } = makeSystem();
    system.registerStorylineOptions('evt-r1', [
      { label: 'Go', successorId: 'evt-x', effectPolicy: 'apply' },
    ]);
    expect(system.hasRegisteredStorylineOptions('evt-r1')).toBe(true);
    system.resetStorylineRegistry();
    expect(system.hasRegisteredStorylineOptions('evt-r1')).toBe(false);
    expect(
      system.eventHasStoryline(makeCard({ id: 'evt-r1' })),
    ).toBe(false);
  });

  it('registry state is scoped per system instance', () => {
    const { system: a } = makeSystem();
    const { system: b } = makeSystem();
    a.registerStorylineOptions('evt-shared', [
      { label: 'A', successorId: 'evt-x', effectPolicy: 'apply' },
    ]);
    expect(a.hasRegisteredStorylineOptions('evt-shared')).toBe(true);
    expect(b.hasRegisteredStorylineOptions('evt-shared')).toBe(false);
  });
});

// ── AC2: draw-time condition filtering ──────────────────────

describe('draw-time condition filtering', () => {
  it('omits options whose condition returns false when state is provided', () => {
    const { system, state } = makeSystem();
    system.registerStorylineOptions('evt-cond', [
      { label: 'Always', effectPolicy: 'apply', condition: () => true },
      { label: 'Rich only', effectPolicy: 'apply', condition: (s) => s.coins > 500 },
      { label: 'Never', effectPolicy: 'apply', condition: () => false },
    ]);

    const card = makeCard({ id: 'evt-cond' });
    const options = system.getStorylineOptions(card, state);
    expect(options.map((o) => o.label)).toEqual(['Always', 'Rich only']);
  });

  it('includes all options when condition is absent or returns true', () => {
    const { system, state } = makeSystem();
    system.registerStorylineOptions('evt-cond2', [
      { label: 'No cond', effectPolicy: 'apply' },
      { label: 'True cond', effectPolicy: 'apply', condition: () => true },
    ]);
    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cond2' }), state).map((o) => o.label),
    ).toEqual(['No cond', 'True cond']);
  });

  it('includes every option when no state is provided (no-state behaviour)', () => {
    const { system } = makeSystem();
    system.registerStorylineOptions('evt-cond3', [
      { label: 'Yes', effectPolicy: 'apply', condition: () => false },
    ]);
    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cond3' })).map((o) => o.label),
    ).toEqual(['Yes']);
  });

  it('condition filtering does not mutate the registered list', () => {
    const { system, state } = makeSystem();
    const card = makeCard({ id: 'evt-cond4' });
    system.registerStorylineOptions('evt-cond4', [
      { label: 'Drop', effectPolicy: 'apply', condition: () => false },
      { label: 'Keep', effectPolicy: 'apply' },
    ]);
    expect(system.getStorylineOptions(card).map((o) => o.label)).toEqual(['Drop', 'Keep']);
    expect(system.getStorylineOptions(card, state).map((o) => o.label)).toEqual(['Keep']);
  });
});

// ── AC3: draw-time cost filtering ───────────────────────────

describe('draw-time cost filtering over declared resources', () => {
  it('gates on a declared key that is not a projection key', () => {
    const map: TemplateMap = new Map();
    const engine: StorylineEngineAdapter<TestState, TestCard> = {
      ...makeAdapter(map),
      resources: ['coins', 'reputation', 'hull'],
      getResources: (state) => ({
        coins: state.coins,
        reputation: state.reputation,
        hull: (state as TestState & { hull: number }).hull,
      }),
    };
    const system = createStorylineSystem({ engine });
    const state = Object.assign(makeState(), { hull: 4 });
    system.registerStorylineOptions('evt-hull-cost', [
      { label: 'Patch', effectPolicy: 'apply', cost: { hull: 4 } },
      { label: 'Overhaul', effectPolicy: 'apply', cost: { hull: 5 } },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-hull-cost' }), state).map((o) => o.label),
    ).toEqual(['Patch']);
  });

  it('treats a cost on an undeclared key as unpayable and an unspecified key as unconstrained', () => {
    const declared = ['coins', 'reputation', 'hull'];
    expect(isOptionAffordable({ cost: { hull: 2 } }, { hull: 3 }, declared)).toBe(true);
    expect(isOptionAffordable({ cost: { hull: 2 } }, { hull: 1 }, declared)).toBe(false);
    // No declaration → the default coins/reputation projection, so `hull` is unknown.
    expect(isOptionAffordable({ cost: { hull: 2 } }, { hull: 3 })).toBe(false);
    // Specified keys gate; unspecified declared keys never constrain.
    expect(isOptionAffordable({ cost: { hull: 2 } }, { hull: 2, coins: 0 }, declared)).toBe(true);
  });
});

describe('draw-time cost filtering', () => {
  it('omits an option whose coin cost exceeds the balance', () => {
    const { system, state } = makeSystem();
    state.coins = 100;
    system.registerStorylineOptions('evt-cost', [
      { label: 'Cheap', effectPolicy: 'apply', cost: { coins: 50 } },
      { label: 'Too dear', effectPolicy: 'apply', cost: { coins: 101 } },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cost' }), state).map((o) => o.label),
    ).toEqual(['Cheap']);
  });

  it('omits an option whose reputation cost exceeds the balance', () => {
    const { system, state } = makeSystem();
    state.reputation = 10;
    system.registerStorylineOptions('evt-cost-rep', [
      { label: 'Affordable', effectPolicy: 'apply', cost: { reputation: 10 } },
      { label: 'Unaffordable', effectPolicy: 'apply', cost: { reputation: 11 } },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cost-rep' }), state).map((o) => o.label),
    ).toEqual(['Affordable']);
  });

  it('treats a cost equal to the current balance as affordable (boundary)', () => {
    const { system, state } = makeSystem();
    state.coins = 75;
    state.reputation = 3;
    system.registerStorylineOptions('evt-cost-boundary', [
      {
        label: 'Exact',
        effectPolicy: 'apply',
        cost: { coins: 75, reputation: 3 },
      },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cost-boundary' }), state).map(
        (o) => o.label,
      ),
    ).toEqual(['Exact']);
  });

  it('enforces both the coin and reputation gates when both are specified', () => {
    const { system, state } = makeSystem();
    state.coins = 100;
    state.reputation = 5;
    system.registerStorylineOptions('evt-cost-both', [
      { label: 'Both ok', effectPolicy: 'apply', cost: { coins: 100, reputation: 5 } },
      { label: 'Coins ok, rep short', effectPolicy: 'apply', cost: { coins: 100, reputation: 6 } },
      { label: 'Rep ok, coins short', effectPolicy: 'apply', cost: { coins: 101, reputation: 5 } },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cost-both' }), state).map((o) => o.label),
    ).toEqual(['Both ok']);
  });

  it('always includes options without a cost', () => {
    const { system, state } = makeSystem();
    state.coins = 0;
    state.reputation = 0;
    system.registerStorylineOptions('evt-cost-free', [
      { label: 'Free', effectPolicy: 'apply' },
      { label: 'Free skip', effectPolicy: 'skip' },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cost-free' }), state).map((o) => o.label),
    ).toEqual(['Free', 'Free skip']);
  });

  it('applies the condition callback and the cost gate together', () => {
    const { system, state } = makeSystem();
    state.coins = 50;
    system.registerStorylineOptions('evt-cost-and-cond', [
      { label: 'Cond fails', effectPolicy: 'apply', condition: () => false, cost: { coins: 10 } },
      { label: 'Cost fails', effectPolicy: 'apply', condition: () => true, cost: { coins: 51 } },
      { label: 'Both pass', effectPolicy: 'apply', condition: () => true, cost: { coins: 50 } },
    ]);

    expect(
      system.getStorylineOptions(makeCard({ id: 'evt-cost-and-cond' }), state).map(
        (o) => o.label,
      ),
    ).toEqual(['Both pass']);
  });

  it('keeps a stable draw-time snapshot of the cost-filtered list', () => {
    const { system, state } = makeSystem();
    state.coins = 100;
    system.registerStorylineOptions('evt-cost-snapshot', [
      { label: 'Pay', effectPolicy: 'apply', cost: { coins: 100 } },
      { label: 'Free', effectPolicy: 'apply' },
    ]);
    const card = makeCard({ id: 'evt-cost-snapshot' });

    const pending = system.createPendingStorylineChoice(card, state);
    expect(pending).not.toBeNull();
    // Resources change after the draw: the frozen snapshot must not change.
    state.coins = 0;
    expect(system.getPendingStorylineOptions(pending!, state).map((o) => o.label)).toEqual([
      'Pay',
      'Free',
    ]);
  });

  it('re-applies the cost filter when a pending choice created without state has no snapshot', () => {
    const { system, state } = makeSystem();
    state.coins = 100;
    system.registerStorylineOptions('evt-cost-legacy', [
      { label: 'Pay', effectPolicy: 'apply', cost: { coins: 100 } },
    ]);
    const card = makeCard({ id: 'evt-cost-legacy' });
    const pending = system.createPendingStorylineChoice(card);
    expect(pending).not.toBeNull();
    expect(pending!.options).toBeUndefined();

    expect(system.getPendingStorylineOptions(pending!, state).map((o) => o.label)).toEqual([
      'Pay',
    ]);
    state.coins = 99;
    expect(system.getPendingStorylineOptions(pending!, state)).toEqual([]);
  });

  it('inherits cost-filtered options into the pending snapshot at draw time', () => {
    const { system, state } = makeSystem();
    state.coins = 10;
    system.registerStorylineOptions('evt-cost-draw', [
      { label: 'Affordable', effectPolicy: 'apply', cost: { coins: 10 } },
      { label: 'Unaffordable', effectPolicy: 'apply', cost: { coins: 11 } },
      { label: 'Free', effectPolicy: 'apply' },
    ]);

    const pending = system.createPendingStorylineChoice(makeCard({ id: 'evt-cost-draw' }), state);
    expect(pending?.options?.map((o) => o.label)).toEqual(['Affordable', 'Free']);
  });
});

// ── eventHasStoryline semantics ─────────────────────────────
describe('eventHasStoryline', () => {
  const { system } = makeSystem();

  it('is true for CSV options and registered options', () => {
    expect(system.eventHasStoryline(makeCard({ id: 'evt-o', options: 'Go|a' }))).toBe(true);
  });

  it('is false for plain cards and bare-storylineId cards', () => {
    expect(system.eventHasStoryline(makeCard({ id: 'evt-plain' }))).toBe(false);
    expect(system.eventHasStoryline(makeCard({ id: 'evt-story', storylineId: 'arc' }))).toBe(false);
  });

  it('is true for a registered choice even without card fields', () => {
    const { system: sys } = makeSystem();
    sys.registerStorylineOptions('evt-reg', [
      { label: 'X', effectPolicy: 'apply' },
    ]);
    expect(sys.eventHasStoryline(makeCard({ id: 'evt-reg' }))).toBe(true);
  });
});

// ── Surfaced affordability: the requirement accessor ────────

describe('optionAffordability', () => {
  it('reports an option with no cost as affordable', () => {
    expect(
      optionAffordability({}, { coins: 0, reputation: 0 }),
    ).toEqual({ affordable: true });
  });

  it('treats a cost exactly equal to the balance as affordable', () => {
    expect(
      optionAffordability(
        { cost: { coins: 75, reputation: 3 } },
        { coins: 75, reputation: 3 },
      ),
    ).toEqual({ affordable: true });
  });

  it('lists every unmet key of a multi-key cost in declared order', () => {
    const result = optionAffordability(
      { cost: { coins: 100, reputation: 6, charge: 2 } },
      { coins: 40, reputation: 5, charge: 0 },
      ['coins', 'reputation', 'charge'],
    );

    expect(result).toEqual({
      affordable: false,
      shortfall: [
        { key: 'coins', required: 100, available: 40 },
        { key: 'reputation', required: 6, available: 5 },
        { key: 'charge', required: 2, available: 0 },
      ],
    });
  });

  it('lists only the unmet key of a multi-key cost', () => {
    expect(
      optionAffordability(
        { cost: { coins: 100, reputation: 5 } },
        { coins: 100, reputation: 4 },
      ),
    ).toEqual({
      affordable: false,
      shortfall: [{ key: 'reputation', required: 5, available: 4 }],
    });
  });

  it('reports an undeclared cost key with available 0', () => {
    // `readResource` rule: a key outside the declared set reads as 0, so it can
    // never be paid until the game declares it.
    expect(
      optionAffordability(
        { cost: { hull: 2 } },
        { hull: 3 },
        ['coins', 'reputation'],
      ),
    ).toEqual({
      affordable: false,
      shortfall: [{ key: 'hull', required: 2, available: 0 }],
    });
  });

  it('never drifts from isOptionAffordable', () => {
    const declared = ['coins', 'reputation', 'hull'];
    const cases: { cost?: Record<string, number>; resources: Record<string, number> }[] = [
      { resources: { coins: 0 } },
      { cost: { coins: 0 }, resources: { coins: 0 } },
      { cost: { coins: 5 }, resources: { coins: 5 } },
      { cost: { coins: 5 }, resources: { coins: 4 } },
      { cost: { coins: 5, reputation: 2 }, resources: { coins: 5, reputation: 2 } },
      { cost: { coins: 5, reputation: 2 }, resources: { coins: 5, reputation: 1 } },
      { cost: { hull: 2 }, resources: { hull: 3 } },
      { cost: { hull: 2 }, resources: { hull: 1 } },
    ];

    for (const scenario of cases) {
      const option = scenario.cost === undefined ? {} : { cost: scenario.cost };
      const result = optionAffordability(option, scenario.resources, declared);
      expect(result.affordable).toBe(
        isOptionAffordable(option, scenario.resources, declared),
      );
      // Shape invariant: an affordable result carries no shortfall, and an
      // unaffordable one always lists at least one unmet key.
      if (result.affordable) {
        expect('shortfall' in result).toBe(false);
      } else {
        expect(result.shortfall.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── Surfaced affordability: the compile policy ──────────────

describe('compile affordability policy', () => {
  it("omits unaffordable options and attaches no state by default ('omit')", () => {
    const { system, state } = makeSystem();
    state.coins = 10;
    system.registerStorylineOptions('evt-policy-default', [
      { label: 'Dear', effectPolicy: 'apply', cost: { coins: 11 } },
      { label: 'Cheap', effectPolicy: 'apply', cost: { coins: 10 } },
      { label: 'Free', effectPolicy: 'apply' },
    ]);

    const compiled = system.compileStorylineFromEvent(
      makeCard({ id: 'evt-policy-default' }),
      state,
    );

    expect(compiled.compiledOptions.map((option) => option.label)).toEqual([
      'Cheap',
      'Free',
    ]);
    for (const option of compiled.compiledOptions) {
      expect('affordability' in option).toBe(false);
    }
  });

  it("keeps every condition-passing option under 'surface' with its affordability", () => {
    const { system, state } = makeSystem();
    state.coins = 10;
    system.registerStorylineOptions('evt-policy-surface', [
      { label: 'Dear', effectPolicy: 'apply', cost: { coins: 11 } },
      { label: 'Cheap', effectPolicy: 'apply', cost: { coins: 10 } },
      { label: 'Free', effectPolicy: 'apply' },
      { label: 'Hidden', effectPolicy: 'apply', condition: () => false },
    ]);

    const compiled = system.compileStorylineFromEvent(
      makeCard({ id: 'evt-policy-surface' }),
      state,
      { affordabilityPolicy: 'surface' },
    );

    // Every condition-passing option survives, in authored order; the
    // condition-failing one is still omitted.
    expect(compiled.compiledOptions.map((option) => option.label)).toEqual([
      'Dear',
      'Cheap',
      'Free',
    ]);
    expect(compiled.compiledOptions.map((option) => option.affordability)).toEqual([
      {
        affordable: false,
        shortfall: [{ key: 'coins', required: 11, available: 10 }],
      },
      { affordable: true },
      { affordable: true },
    ]);
  });

  it("surfaces a multi-key shortfall with every unmet key", () => {
    const { system, state } = makeSystem();
    state.coins = 1;
    state.reputation = 1;
    system.registerStorylineOptions('evt-policy-multi', [
      {
        label: 'Both',
        effectPolicy: 'apply',
        cost: { coins: 2, reputation: 3 },
      },
    ]);

    const [option] = system.compileStorylineFromEvent(
      makeCard({ id: 'evt-policy-multi' }),
      state,
      { affordabilityPolicy: 'surface' },
    ).compiledOptions;

    expect(option.affordability).toEqual({
      affordable: false,
      shortfall: [
        { key: 'coins', required: 2, available: 1 },
        { key: 'reputation', required: 3, available: 1 },
      ],
    });
  });

  it('honours a system-level surface policy and keeps the default omit', () => {
    const templates: TemplateMap = new Map();
    const surfaced = createStorylineSystem({
      engine: makeAdapter(templates),
      affordabilityPolicy: 'surface',
    });
    expect(surfaced.affordabilityPolicy).toBe('surface');
    surfaced.registerStorylineOptions('evt-system-policy', [
      { label: 'Dear', effectPolicy: 'apply', cost: { coins: 5000 } },
    ]);

    const state = makeState({ coins: 10 });
    expect(
      surfaced.getStorylineOptions(makeCard({ id: 'evt-system-policy' }), state),
    ).toHaveLength(1);

    const { system } = makeSystem();
    expect(system.affordabilityPolicy).toBe('omit');
  });

  it("attaches affordability to content-authored options under 'surface'", () => {
    const { system, state } = makeSystem();
    state.coins = 0;
    const card = makeCard({
      id: 'evt-csv-surface',
      options: 'Pay|evt-pay#cost=coins:2;Walk|',
    });

    const omitted = system.compileStorylineFromEvent(card, state);
    // The CSV path is never omitted at compile time (the presenter gates it),
    // and the default policy attaches nothing.
    expect(omitted.compiledOptions.map((option) => option.label)).toEqual([
      'Pay',
      'Walk',
    ]);
    expect(omitted.compiledOptions[0].affordability).toBeUndefined();

    const surfaced = system.compileStorylineFromEvent(card, state, {
      affordabilityPolicy: 'surface',
    });
    expect(surfaced.compiledOptions.map((option) => option.label)).toEqual([
      'Pay',
      'Walk',
    ]);
    expect(surfaced.compiledOptions[0].affordability).toEqual({
      affordable: false,
      shortfall: [{ key: 'coins', required: 2, available: 0 }],
    });
    expect(surfaced.compiledOptions[1].affordability).toEqual({
      affordable: true,
    });
  });

  it('leaves the compiled list unchanged when a surface compile has no resources oracle', () => {
    const { system } = makeSystem();
    system.registerStorylineOptions('evt-policy-no-state', [
      { label: 'Dear', effectPolicy: 'apply', cost: { coins: 5000 } },
    ]);

    const compiled = system.compileStorylineFromEvent(
      makeCard({ id: 'evt-policy-no-state' }),
      undefined,
      { affordabilityPolicy: 'surface' },
    );

    expect(compiled.compiledOptions.map((option) => option.label)).toEqual(['Dear']);
    expect(compiled.compiledOptions[0].affordability).toBeUndefined();
  });
});
