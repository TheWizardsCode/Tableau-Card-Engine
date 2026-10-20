/**
 * Story-line compilation parity tests (MS-0MVFM9HGI004XADO AC1/AC2).
 *
 * Ports Main Street's storyline-model / storyline-csv-options compilation
 * cases onto the generic story-line API:
 *
 * - legacy `hasChoices` → Accept(apply)/Reject(skip) compilation;
 * - CSV `options` encoding parsing (whitespace trimming, terminal options,
 *   malformed/rejected encodings, `apply` policy);
 * - registered-option precedence over legacy/CSV compilation;
 * - draw-time condition filtering (evaluated once, at compile time);
 * - `eventHasStoryline` semantics (a bare `storylineId` is NOT a choice).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { createStorylineSystem } from '../../src/story-line';
import {
  makeAdapter,
  makeCard,
  makeState,
  type TemplateMap,
} from './helpers';

/** A system instance bound to an empty template catalogue + adapter. */
function makeSystem() {
  const templates: TemplateMap = new Map();
  const engine = makeAdapter(templates);
  const system = createStorylineSystem({ engine });
  return { system, templates, engine, state: makeState() };
}

// ── AC1: legacy hasChoices compilation ──────────────────────

describe('legacy `hasChoices` compilation', () => {
  it('compiles a two-way choice to Accept(apply) / Reject(skip)', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-legacy',
      hasChoices: true,
      acceptNextCardId: 'evt-next-a',
      rejectNextCardId: 'evt-next-b',
    });

    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.storylineId).toBeNull();
    expect(compiled.compiledOptions).toEqual([
      { label: 'Accept', successorId: 'evt-next-a', effectPolicy: 'apply' },
      { label: 'Reject', successorId: 'evt-next-b', effectPolicy: 'skip' },
    ]);
  });

  it('null successor ids compile to terminal options', () => {
    const { system } = makeSystem();
    const card = makeCard({ id: 'evt-legacy', hasChoices: true });
    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.compiledOptions[0]?.successorId).toBeUndefined();
    expect(compiled.compiledOptions[1]?.successorId).toBeUndefined();
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

  it('carries storyline metadata through compilation', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-story',
      storylineId: 'storyline-alpha',
      storylineTitle: 'Alpha Arc',
      hasChoices: true,
    });
    const compiled = system.compileStorylineFromEvent(card);
    expect(compiled.storylineId).toBe('storyline-alpha');
    expect(compiled.compiledOptions).toHaveLength(2);
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

  it('hasChoices is derived from a non-empty options encoding', () => {
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
  it('registered options take precedence over legacy compilation', () => {
    const { system } = makeSystem();
    const card = makeCard({
      id: 'evt-reg',
      hasChoices: true,
      acceptNextCardId: 'evt-a',
      rejectNextCardId: 'evt-b',
    });

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

  it('includes every option when no state is provided (legacy behaviour)', () => {
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

// ── eventHasStoryline semantics ─────────────────────────────

describe('eventHasStoryline', () => {
  const { system } = makeSystem();

  it('is true for legacy hasChoices, CSV options and registered options', () => {
    expect(system.eventHasStoryline(makeCard({ id: 'evt-h', hasChoices: true }))).toBe(true);
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
