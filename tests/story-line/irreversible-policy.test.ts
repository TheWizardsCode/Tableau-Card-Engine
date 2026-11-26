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
 * The final block replaces the synthetic voyage with the **shipped** Long
 * Erasure content (CG-0MWUQUJ84005L4MF): its content adapter declares `hull`
 * irreversible, the run's resource projection carries that declaration into
 * the engine seam, and a grant authored into the real content is refused
 * while the real `#cost=hull` paths still pay.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createResourceProjection,
  createStorylineSystem,
  type StorylineEngineAdapter,
  type StorylineOption,
  type StorylineResourceField,
} from '../../src/story-line';
import {
  LONG_ERASURE_IRREVERSIBLE_RESOURCES,
  chooseOption,
  createLongErasureRun,
  longErasureContentFromCsv,
  type LongErasureContent,
} from '../../example-games/gym/GymLongErasureGame';
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

// ── The shipped Long Erasure content ────────────────────────────

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Repository-relative path of the authored Long Erasure content. */
const CONTENT_PATH = 'example-games/gym/content/long-erasure.csv';

/** Repository-relative path of the authoritative episode manifest. */
const MANIFEST_PATH = 'example-games/gym/content/long-erasure-episode.json';

/** Reads a repository-relative UTF-8 file. */
function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8');
}

/** The real authored content, loaded through the game's own loader. */
const CONTENT: LongErasureContent = longErasureContentFromCsv(
  readRepoFile(CONTENT_PATH),
);

/**
 * The real content with the entry card's option cell replaced.
 *
 * The shipped content deliberately authors no `#extra=hull` (that is what the
 * authoring validator enforces), so the runtime refusal is exercised by asking
 * the **real** content engine to resolve an option that does — the same seam a
 * violating content file would reach before validation rejects it.
 */
function contentWithEntryOptions(options: string): LongErasureContent {
  return {
    ...CONTENT,
    cards: CONTENT.cards.map((card) =>
      card.id === CONTENT.entryCardId ? { ...card, options } : card,
    ),
  };
}

/** Every activity-log line that reports a refusal. */
function refusalTexts(state: ReturnType<typeof createLongErasureRun>): string[] {
  return state.activityLog
    .map((entry) => entry.text)
    .filter((text) => text.includes('refused'));
}

describe('Gym Long Erasure: irreversible hull on the shipped content', () => {
  it('declares hull irreversible from the adapter, matching the manifest', () => {
    const manifest = JSON.parse(readRepoFile(MANIFEST_PATH)) as {
      resources: { irreversible: readonly string[] };
    };

    // One declaration, three readers: the authoring adapter, the manifest and
    // the run's projection. None may drift.
    expect(LONG_ERASURE_IRREVERSIBLE_RESOURCES).toEqual(['hull']);
    expect(CONTENT.irreversible).toEqual(['hull']);
    expect(manifest.resources.irreversible).toEqual(
      LONG_ERASURE_IRREVERSIBLE_RESOURCES,
    );
  });

  it('refuses a hull grant authored into the real content, resolving the rest', () => {
    const content = contentWithEntryOptions(
      'Claim the plate|le-i-log#extra=hull:1,morale:1',
    );
    const state = chooseOption(createLongErasureRun(0, content), 'Claim the plate');

    // The refused key is untouched; the rest of the option (the morale gain
    // and the successor push) landed, and the guard logged exactly one line.
    expect(state.resources.hull).toBe(5);
    expect(state.resources.morale).toBe(6);
    expect(state.currentCard.id).toBe('le-i-log');
    expect(refusalTexts(state)).toEqual([
      'Extra effect refused: hull is irreversible.',
    ]);
    expect(state.activityLog.map((entry) => entry.text)).toContain(
      'Extra effect: +1 morale.',
    );
  });

  it('pays an authored hull cost on the real content: it may be spent', () => {
    // The shipped route to the derelict's locker pays `#cost=hull:1`.
    let state = createLongErasureRun(0, CONTENT);
    for (const label of [
      'Log the erasure',
      'Transmit the warning',
      'Push deeper',
      'Strip the locker',
    ]) {
      state = chooseOption(state, label);
    }

    expect(state.currentCard.id).toBe('le-ii-salvage');
    expect(state.resources.hull).toBe(4);
    expect(state.activityLog.map((entry) => entry.text)).toContain(
      'Cost paid: -1 hull.',
    );
    expect(refusalTexts(state)).toEqual([]);
  });
});
