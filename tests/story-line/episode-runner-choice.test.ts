/**
 * Episode runner choice resolution (GDD §2.3 steps B.4–B.5).
 *
 * This suite owns the middle of the routing contract:
 *
 * - **B.4** the chosen option resolves through `@story-line` **unchanged** —
 *   effect, cost payment, extra effect, `pushedCard`, outcome prose, journal
 *   and log stay the one choice model's business. A spy on the fixture's
 *   storyline double proves the runner delegates every B.5 case and adds no
 *   second resolution path.
 * - **B.5** the pushed card is classified against the manifest: an in-scene
 *   beat continues the scene, an out-of-scene beat or an ending card closes it
 *   with `pendingChain` set to that card, and a resolution that pushes nothing
 *   closes it with `pendingChain = null`.
 *
 * One test per `pushedCard` case (in-scene beat, out-of-scene beat, ending
 * card, none) is registered against the §2.3 step map's B.5 entry, and every
 * scenario runs against the committed fixture lane — the real manifest, the
 * real content CSV and the real `createStorylineSystem` choice model.
 *
 * The `none` case is the one shape the committed episode does not author (every
 * Long Erasure option pushes a successor), so that scenario overrides a single
 * card's `options` cell in memory with the documented terminal form `label|`
 * (a blank successor list). The fixture file stays the single source of truth
 * for every other card.
 *
 * `@story-line` pushes an **instance** card (`le-i-log-0`) with a deterministic
 * serial suffix; the classification names the manifest's **base** id
 * (`le-i-log`), which is what `enterBeat`, the route targets and the scene
 * close speak. The two ids are asserted apart so a later feature cannot
 * silently conflate them.
 *
 * @module
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEpisodeRunner,
  createStorylineSystem,
  type ChoiceResolution,
  type EpisodeRunner,
  type PushedCardCase,
  type StorylineOption,
} from '../../src/story-line';
import type { ContentCard } from '../../src/story-line/content/types';
import type { EpisodeManifest } from '../../src/story-line/content/episode-manifest';
import {
  DEFAULT_EPISODE_SEED,
  episodeStep,
  loadEpisodeFixture,
  stepsOwnedBy,
  type EpisodeFixture,
  type VoyageState,
} from './helpers/episode-fixture';

// ── Helpers ─────────────────────────────────────────────────

/** Builds the runner under test, optionally from an in-memory manifest copy. */
function makeRunner(
  fixture: EpisodeFixture,
  manifest: EpisodeManifest = fixture.manifest,
): EpisodeRunner<VoyageState, ContentCard> {
  return createEpisodeRunner({
    manifest,
    storyline: fixture.storyline,
    content: fixture.cardsById,
    seed: DEFAULT_EPISODE_SEED,
  });
}

/**
 * Returns a manifest copy whose `start` points at a chosen scene / beat, so a
 * test can begin a run inside the scene whose boundary it needs without
 * editing the committed fixture.
 */
function manifestStartingAt(
  fixture: EpisodeFixture,
  sceneId: string,
  beatId: string,
): EpisodeManifest {
  const act = fixture.manifest.acts.find((candidate) =>
    candidate.scenes.some((scene) => scene.id === sceneId),
  );
  if (act === undefined) throw new Error(`fixture has no act declaring scene "${sceneId}"`);
  return { ...fixture.manifest, start: { act: act.id, scene: sceneId, beat: beatId } };
}

/**
 * The committed fixture with one card's `options` cell replaced by the
 * documented terminal form `label|` (an empty successor list).
 */
function terminalFixture(beatCardId = 'le-i-open'): EpisodeFixture {
  const base = loadEpisodeFixture();
  const cards = base.cards.map((card) =>
    card.id === beatCardId ? { ...card, options: 'Record nothing|' } : card,
  );
  return loadEpisodeFixture({ cards });
}

/** One B.5 scenario: the runner, the beat to enter and the option to choose. */
interface ChoiceScenario {
  readonly fixture: EpisodeFixture;
  readonly runner: EpisodeRunner<VoyageState, ContentCard>;
  readonly beatId: string;
  readonly optionIndex: number;
}

/**
 * Builds one independent scenario per §2.3 step B.5 case, in the GDD's order.
 *
 * Each scenario owns its own fixture (state, engine double and choice model),
 * so resolving one cannot leak resources, chain cards or RNG into another.
 */
function choiceScenarios(): Record<PushedCardCase, ChoiceScenario> {
  const inScene = loadEpisodeFixture();
  const outOfScene = loadEpisodeFixture();
  const ending = loadEpisodeFixture();
  const none = terminalFixture();

  return {
    'in-scene-beat': {
      fixture: inScene,
      runner: makeRunner(inScene),
      beatId: 'le-i-open',
      optionIndex: 0,
    },
    'out-of-scene-beat': {
      fixture: outOfScene,
      runner: makeRunner(
        outOfScene,
        manifestStartingAt(outOfScene, 's-i-answer', 'le-i-transmit'),
      ),
      beatId: 'le-i-transmit',
      optionIndex: 0,
    },
    ending: {
      fixture: ending,
      runner: makeRunner(ending, manifestStartingAt(ending, 's-ii-offer', 'le-ii-offer')),
      beatId: 'le-ii-offer',
      optionIndex: 2,
    },
    none: {
      fixture: none,
      runner: makeRunner(none),
      beatId: 'le-i-open',
      optionIndex: 0,
    },
  };
}

/** Enters a scenario's beat and returns its presented options. */
function presentedOptions(scenario: ChoiceScenario): StorylineOption<VoyageState>[] {
  const entry = scenario.runner.enterBeat(scenario.beatId, scenario.fixture.state);
  expect(entry.status).toBe('presented');
  if (entry.status !== 'presented') throw new Error('expected a presented entry');
  return [...entry.options];
}

/** Resolves the scenario's chosen option and returns the classification. */
function resolveScenario(scenario: ChoiceScenario): ChoiceResolution<ContentCard> {
  const option = presentedOptions(scenario)[scenario.optionIndex];
  return scenario.runner.resolveChoice(option, scenario.fixture.state);
}

/** Asserts the §2.3 step a test covers is registered against this suite. */
function expectOwnsStep(id: string): void {
  const step = episodeStep(id);
  expect(step).toBeDefined();
  expect(step?.owningTest).toBe('episode-runner-choice');
}

// ── The suite ───────────────────────────────────────────────

describe('episode runner choice resolution', () => {
  it('registers B.4–B.5 against this suite in the §2.3 step map', () => {
    expect(stepsOwnedBy('episode-runner-choice').map((step) => step.id)).toEqual(['B.4', 'B.5']);
    expect(episodeStep('B.4')?.contract).toContain('@story-line');
    expect(episodeStep('B.5')?.contract).toContain('pendingChain');
    expectOwnsStep('B.4');
    expectOwnsStep('B.5');

    // The record is a discriminated union on where the run goes next, and B.5's
    // case vocabulary is exactly the GDD's four bullets.
    expectTypeOf<ChoiceResolution['next']>().toEqualTypeOf<'continue' | 'close'>();
    expectTypeOf<PushedCardCase>().toEqualTypeOf<
      'in-scene-beat' | 'out-of-scene-beat' | 'ending' | 'none'
    >();
  });

  it('B.4 delegates every B.5 case to the storyline system unchanged', () => {
    expectOwnsStep('B.4');

    const scenarios = choiceScenarios();
    const cases: PushedCardCase[] = ['in-scene-beat', 'out-of-scene-beat', 'ending', 'none'];

    for (const pushedCardCase of cases) {
      const scenario = scenarios[pushedCardCase];
      const { fixture, runner, beatId, optionIndex } = scenario;
      const delegate = vi.spyOn(fixture.storyline, 'resolveStorylineOption');

      const option = presentedOptions(scenario)[optionIndex];
      const card = fixture.cardsById.get(beatId)!;
      const result = runner.resolveChoice(option, fixture.state);

      expect(delegate, pushedCardCase).toHaveBeenCalledTimes(1);
      expect(delegate, pushedCardCase).toHaveBeenCalledWith(fixture.state, card, option);

      // The record carries the one choice model's result by reference: the
      // runner neither re-implements resolution nor rebuilds its payload.
      expect(result.resolution, pushedCardCase).toBe(delegate.mock.results[0].value);
      expect(result.pushedCard, pushedCardCase).toBe(result.resolution.pushedCard);
      expect(result.case, pushedCardCase).toBe(pushedCardCase);

      delegate.mockRestore();
    }
  });

  it('B.4 lets the engine seam apply the option cost, not the runner', () => {
    expectOwnsStep('B.4');

    const scenario = choiceScenarios()['in-scene-beat'];
    const { fixture } = scenario;

    // `Log the erasure` authors `#cost=stores:1`; the state starts at 4.
    expect(fixture.state.resources.stores).toBe(4);
    resolveScenario(scenario);

    expect(fixture.state.appliedDeltas).toEqual([
      { delta: { stores: -1 }, after: expect.objectContaining({ stores: 3 }) },
    ]);
    expect(fixture.state.activityLog.map((line) => line.text)).toEqual(['Cost paid: -1 stores.']);
  });

  it('B.5 continues the scene when the pushed card is an in-scene beat', () => {
    expectOwnsStep('B.5');

    const scenario = choiceScenarios()['in-scene-beat'];
    const result = resolveScenario(scenario);

    expect(result.next).toBe('continue');
    expect(result.case).toBe('in-scene-beat');
    // `Log the erasure` pushes `le-i-log`, a beat of the very scene we are in.
    expect(result.cardId).toBe('le-i-log');
    expect(result.pendingChain).toBeNull();
    // The pushed card is the instance; the classified id is its base id.
    expect(result.pushedCard?.id).toBe('le-i-log-0');
    expect(Object.isFrozen(result)).toBe(true);

    // The run has not left the scene and is not waiting on a chain route.
    const state = scenario.runner.getState();
    expect(state.currentSceneId).toBe('s-i-open');
    expect(state.currentActId).toBe('act-i');
    expect(state.pendingChain).toBeNull();
    expect(scenario.runner.getSceneExits()).toEqual([]);

    // The caller's next step is `enterBeat` with the classified beat, which the
    // scene still assigns and whose cost the remaining clock can pay.
    const next = scenario.runner.enterBeat(result.cardId!, scenario.fixture.state);
    expect(next.status).toBe('presented');
    expect(next.status === 'presented' ? next.cardId : null).toBe('le-i-log');
  });

  it('B.5 closes the scene when the pushed card is a beat of another scene', () => {
    expectOwnsStep('B.5');

    const scenario = choiceScenarios()['out-of-scene-beat'];
    const result = resolveScenario(scenario);

    // `Shelter in the dead zone` pushes `le-ii-shelter` — act II's scene.
    expect(result.next).toBe('close');
    expect(result.case).toBe('out-of-scene-beat');
    expect(result.cardId).toBe('le-ii-shelter');
    expect(result.pendingChain).toBe('le-ii-shelter');
    expect(result.pushedCard?.id).toBe('le-ii-shelter-0');
    expect(
      scenario.fixture.manifest.acts
        .flatMap((act) => act.scenes)
        .flatMap((scene) => scene.beats),
    ).toContainEqual(expect.objectContaining({ cardId: result.pendingChain }));

    // The run waits on the pending chain inside the scene it has not left yet;
    // the scene close reads `pendingChain` to route the chain door.
    const state = scenario.runner.getState();
    expect(state.currentSceneId).toBe('s-i-answer');
    expect(state.currentBeatId).toBe('le-i-transmit');
    expect(state.pendingChain).toBe('le-ii-shelter');
    // Closing is the close path's job: no scene-exit record is written here.
    expect(scenario.runner.getSceneExits()).toEqual([]);
  });

  it('B.5 closes the scene when the pushed card is an ending card', () => {
    expectOwnsStep('B.5');

    const scenario = choiceScenarios().ending;
    expect(presentedOptions(scenario)[scenario.optionIndex].label).toBe('Abandon the voyage');

    const result = resolveScenario(scenario);

    expect(result.next).toBe('close');
    expect(result.case).toBe('ending');
    expect(result.cardId).toBe('le-end-abandon');
    expect(result.pendingChain).toBe('le-end-abandon');
    expect(scenario.fixture.manifest.endings).toContain(result.pendingChain);
    expect(result.pushedCard?.id).toBe('le-end-abandon-0');

    const state = scenario.runner.getState();
    expect(state.currentSceneId).toBe('s-ii-offer');
    expect(state.pendingChain).toBe('le-end-abandon');
  });

  it('B.5 closes the scene with no pending chain when the choice pushes nothing', () => {
    expectOwnsStep('B.5');

    const scenario = choiceScenarios().none;
    const options = presentedOptions(scenario);
    expect(options).toHaveLength(1);
    expect(options[0].label).toBe('Record nothing');

    const result = resolveScenario(scenario);

    expect(result.next).toBe('close');
    expect(result.case).toBe('none');
    expect(result.cardId).toBeNull();
    expect(result.pendingChain).toBeNull();
    expect(result.pushedCard).toBeNull();

    // A null pending chain is recorded as a null chain, never as an empty id:
    // C.9's chain-route skip reads exactly this value.
    const state = scenario.runner.getState();
    expect(state.currentSceneId).toBe('s-i-open');
    expect(state.pendingChain).toBeNull();
  });

  it('rejects a resolution whose current beat has no content card, naming the beat', () => {
    const scenario = choiceScenarios()['in-scene-beat'];
    const option = presentedOptions(scenario)[scenario.optionIndex];
    // A beat whose card is missing from the run's card map is a content
    // defect: the runner reports it rather than resolving against nothing.
    const emptyContent = createEpisodeRunner<VoyageState, ContentCard>({
      manifest: scenario.fixture.manifest,
      storyline: scenario.fixture.storyline,
      content: new Map(),
      seed: DEFAULT_EPISODE_SEED,
    });

    expect(() => emptyContent.resolveChoice(option, scenario.fixture.state)).toThrow(
      /current beat "le-i-open" has no content card/,
    );
  });

  it('rejects a pushed card that is neither an assigned beat nor an ending', () => {
    // A choice whose successor resolves to a real card that the manifest
    // assigns to no beat and declares no ending is a content defect the
    // validators reject; the classifier reports it loudly instead of silently
    // closing or continuing the scene.
    const base = loadEpisodeFixture();
    const orphan: ContentCard = {
      ...base.cards[0],
      id: 'le-orphan',
      name: 'The Orphan',
      options: '',
    };
    const cards = [
      ...base.cards.map((card) =>
        card.id === 'le-i-open' ? { ...card, options: 'Take the side door|le-orphan' } : card,
      ),
      orphan,
    ];
    const fixture = loadEpisodeFixture({ cards });
    const runner = makeRunner(fixture);
    const entry = runner.enterBeat('le-i-open', fixture.state);
    if (entry.status !== 'presented') throw new Error('expected a presented entry');

    expect(() => runner.resolveChoice(entry.options[0], fixture.state)).toThrow(
      /pushed "le-orphan", which is neither a beat/,
    );
    // The run state is untouched by the rejected classification.
    expect(runner.getState().pendingChain).toBeNull();
    expect(runner.getState().currentSceneId).toBe('s-i-open');
  });

  it('B.4 reports a refused surfaced option without closing the run', () => {
    expectOwnsStep('B.4');

    const fixture = loadEpisodeFixture();
    const storyline = createStorylineSystem<VoyageState, ContentCard>({
      engine: fixture.engine,
      affordabilityPolicy: 'surface',
    });
    const runner = createEpisodeRunner({
      manifest: fixture.manifest,
      storyline,
      content: fixture.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });
    // Transmit the warning costs charge:1; the surfaced option stays visible
    // but cannot be taken at 0 charge.
    fixture.state.resources.charge = 0;

    const entry = runner.enterBeat('le-i-log', fixture.state);
    if (entry.status !== 'presented') throw new Error('expected a presented entry');
    const transmit = entry.options.find(
      (option) => option.label === 'Transmit the warning',
    )!;
    expect(transmit.affordability?.affordable).toBe(false);

    const result = runner.resolveChoice(transmit, fixture.state);

    // Nothing was routed: the refusal keeps the run where it is, so the caller
    // can present the choice again instead of losing the beat to a scene close.
    expect(result.refusal?.reason).toBe('unaffordable');
    expect(result.next).toBe('continue');
    expect(result.case).toBe('none');
    expect(result.pendingChain).toBeNull();
    expect(result.pushedCard).toBeNull();
    expect(runner.getState().pendingChain).toBeNull();
    expect(runner.getState().currentSceneId).toBe('s-i-open');
    expect(runner.getState().currentBeatId).toBe('le-i-log');
    // Nothing was paid, and the free option still resolves afterwards.
    expect(fixture.state.resources.charge).toBe(0);
    const silent = entry.options.find((option) => option.label === 'Stay silent')!;
    expect(runner.resolveChoice(silent, fixture.state).refusal).toBeUndefined();
  });
});
