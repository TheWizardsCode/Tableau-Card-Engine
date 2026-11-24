/**
 * Irreversible resolution guard (CG-0MWUQS2GW001WDCM, G5 child 2).
 *
 * The authoring declaration (`CG-0MWUQQAEW0078270`) says which keys are
 * never-restored; this suite pins the **runtime** half of the promise:
 *
 * - a positive `#extra` grant on a declared irreversible key is refused — the
 *   key is not applied and one activity-log line names it
 *   (`Extra effect refused: hull is irreversible.`);
 * - an irreversible key may still be **spent**: a `#cost` deduction on it is
 *   paid and never refused;
 * - the refusal is local: the rest of the option (cost, effect, remaining
 *   grants, successor push) still resolves;
 * - with no irreversible declaration every grant is forwarded as before, so
 *   the guard is invisible to a game that declares none.
 *
 * The projection is the declaration the guard reads: the engine adapter is
 * built by spreading a `createResourceProjection(..., { irreversible })`, so
 * these tests exercise the seam exactly as a game wires it.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createResourceProjection,
  createStorylineSystem,
  type StorylineEngineAdapter,
  type StorylineOption,
  type StorylineResourceField,
} from '../../src/story-line';
import {
  addTemplate,
  makeAdapter,
  makeCard,
  makeState,
  type TestCard,
  type TestState,
  type TemplateMap,
} from './helpers';

/** The fixture voyage: two reversible keys and two never-restored keys. */
interface VoyageState extends TestState {
  hull: number;
  morale: number;
}

/** Every key the projection declares, in declaration order. */
const VOYAGE_KEYS = ['coins', 'reputation', 'hull', 'morale'] as const;

type VoyageKey = (typeof VOYAGE_KEYS)[number];

/** A read/mutate pair for one voyage state field. */
function voyageField(key: VoyageKey): StorylineResourceField<VoyageState> {
  return {
    read: (state) => state[key],
    apply: (state, delta) => {
      state[key] += delta;
    },
  };
}

/**
 * Builds a system whose resource seam is a projection carrying the given
 * irreversible declaration (default `['hull']`).
 */
function setup(irreversible: readonly string[] = ['hull'], templates: TestCard[] = []) {
  const map: TemplateMap = new Map();
  for (const template of templates) addTemplate(map, template);

  const projection = createResourceProjection<VoyageState>(
    {
      coins: voyageField('coins'),
      reputation: voyageField('reputation'),
      hull: voyageField('hull'),
      morale: voyageField('morale'),
    },
    { irreversible },
  );
  const engine: StorylineEngineAdapter<VoyageState, TestCard> = {
    ...makeAdapter(map),
    ...projection,
  };

  return {
    system: createStorylineSystem({ engine }),
    engine,
    state: { ...makeState(), hull: 5, morale: 0 },
  };
}

/** Every activity-log line that reports a refusal. */
function refusalLines(state: VoyageState): string[] {
  return state.activityLog
    .map((entry) => entry.text)
    .filter((text) => text.includes('refused'));
}

describe('irreversible grant refused at resolution', () => {
  it('refuses #extra=hull:1, naming the key once, while the rest resolves', () => {
    const { system, state } = setup(['hull'], [makeCard({ id: 'evt-next' })]);
    const option: StorylineOption<VoyageState> = {
      label: 'Patch the breach',
      effectPolicy: 'skip',
      cost: { coins: 100 },
      extraEffect: { hull: 1, morale: 1 },
      successorId: 'evt-next',
    };

    const result = system.resolveStorylineOption(
      state,
      makeCard({ id: 'evt-patch' }),
      option,
    );

    // The refused key is untouched; every other part of the option landed.
    expect(state.hull).toBe(5);
    expect(state.coins).toBe(900);
    expect(state.morale).toBe(1);
    expect(result.pushedCard?.id).toBe('evt-next-0');

    const lines = state.activityLog.map((entry) => entry.text);
    expect(lines).toEqual([
      'Cost paid: -100 coins.',
      'Extra effect: +1 morale.',
      'Extra effect refused: hull is irreversible.',
    ]);
    expect(refusalLines(state)).toHaveLength(1);
  });

  it('pays a cost on an irreversible key: it may be spent, never granted', () => {
    const { system, state } = setup(['hull']);
    const option: StorylineOption<VoyageState> = {
      label: 'Strip the hull plating',
      effectPolicy: 'skip',
      cost: { hull: 1 },
      extraEffect: { morale: 1 },
    };

    system.resolveStorylineOption(state, makeCard({ id: 'evt-strip' }), option);

    expect(state.hull).toBe(4);
    expect(state.morale).toBe(1);
    expect(state.activityLog.map((entry) => entry.text)).toEqual([
      'Cost paid: -1 hull.',
      'Extra effect: +1 morale.',
    ]);
    expect(refusalLines(state)).toEqual([]);
  });

  it('logs one refusal per refused key, leaving the other declarations alone', () => {
    const { system, state } = setup(['hull', 'morale']);
    const option: StorylineOption<VoyageState> = {
      label: 'Repair everything',
      effectPolicy: 'skip',
      extraEffect: { hull: 2, morale: 1, coins: 5 },
    };

    system.resolveStorylineOption(state, makeCard({ id: 'evt-repair' }), option);

    expect(state.hull).toBe(5);
    expect(state.morale).toBe(0);
    expect(state.coins).toBe(1005);
    expect(refusalLines(state)).toEqual([
      'Extra effect refused: hull is irreversible.',
      'Extra effect refused: morale is irreversible.',
    ]);
    expect(state.activityLog.map((entry) => entry.text)).toContain(
      'Extra effect: +5 coins.',
    );
  });

  it('is invisible with no irreversible declaration: every grant is forwarded', () => {
    const { system, state } = setup([]);
    const option: StorylineOption<VoyageState> = {
      label: 'Repair everything',
      effectPolicy: 'skip',
      extraEffect: { hull: 1, morale: 2 },
    };

    system.resolveStorylineOption(state, makeCard({ id: 'evt-repair' }), option);

    expect(state.hull).toBe(6);
    expect(state.morale).toBe(2);
    expect(state.activityLog.map((entry) => entry.text)).toEqual([
      'Extra effect: +1 hull, +2 morale.',
    ]);
    expect(refusalLines(state)).toEqual([]);
  });

  it('keeps the default projectable pair unchanged when no declaration exists', () => {
    const map: TemplateMap = new Map();
    const engine = makeAdapter(map);
    const system = createStorylineSystem({ engine });
    const state = makeState();

    system.resolveStorylineOption(state, makeCard({ id: 'evt-gain' }), {
      label: 'Take the coin',
      effectPolicy: 'skip',
      extraEffect: { coins: 25, reputation: 1 },
    });

    expect(state.coins).toBe(1025);
    expect(state.reputation).toBe(51);
    expect(state.activityLog.map((entry) => entry.text)).toEqual([
      'Extra effect: +25 coins, +1 reputation.',
    ]);
  });
});
