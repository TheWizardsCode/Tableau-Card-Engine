/**
 * Episode runner routing, scene entry and the scene-exit record
 * (GDD §2.3 steps C.9–C.12).
 *
 * This suite owns the second half of the scene boundary:
 *
 * - **C.9** the first route in **declaration order** wins, honouring `on` and
 *   `when`, and a `chain` route is skipped while `pendingChain` is null;
 * - **C.10** `chain`, `beat` (with and without an explicit `beat`) and
 *   `ending` targets each resolve — a `beat` target without a beat opens the
 *   target scene's `entryBeat`, and an `ending` target presents the ending card
 *   and closes the run (whose reset ending restarts at `start`);
 * - **C.11** one frozen nine-field `scene-exit` record is appended per close,
 *   in close order, and never rewritten;
 * - **C.12** entering a scene resets its clock, pushes the scene id onto
 *   `sceneHistory` (the route id onto `routeHistory`), clears `pendingChain` and
 *   leaves every irreversible resource key untouched.
 *
 * Everything runs against the committed `long-erasure` fixture lane (the real
 * manifest, the real CSV and the real `createStorylineSystem` choice model).
 * The shapes the fixture does not author — two candidate routes reordered in
 * memory, a `beat` target with no explicit beat, a non-total route table, an
 * unknown scene name — are supplied as in-memory manifest copies, so the
 * committed files stay the single source of truth for everything else.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createEpisodeRunner,
  resolveRouteTarget,
  selectRoute,
  type EpisodeRunner,
  type RouteSelectionContext,
  type SceneCloseResult,
  type SceneRouteResult,
} from '../../src/story-line';
import type { EpisodeManifest, Scene, SceneRoute } from '../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../src/story-line/content/types';
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

/** Finds one scene of the fixture by id. */
function sceneOf(fixture: EpisodeFixture, sceneId: string): Scene {
  const scene = fixture.manifest.acts
    .flatMap((act) => act.scenes)
    .find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`fixture has no scene "${sceneId}"`);
  return scene;
}

/**
 * Returns a manifest copy whose `start` points at a chosen scene / beat, with
 * an optional in-memory rewrite of that scene.
 */
function manifestAt(
  fixture: EpisodeFixture,
  sceneId: string,
  beatId: string,
  override?: (scene: Scene) => Scene,
): EpisodeManifest {
  const act = fixture.manifest.acts.find((candidate) =>
    candidate.scenes.some((scene) => scene.id === sceneId),
  );
  if (act === undefined) throw new Error(`fixture has no act declaring scene "${sceneId}"`);
  return {
    ...fixture.manifest,
    start: { act: act.id, scene: sceneId, beat: beatId },
    acts: fixture.manifest.acts.map((candidate) => ({
      ...candidate,
      scenes: candidate.scenes.map((scene) =>
        scene.id === sceneId && override !== undefined ? override(scene) : scene,
      ),
    })),
  };
}

/** Enters a beat and resolves the option carrying `label`. */
function resolveByLabel(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  fixture: EpisodeFixture,
  beatId: string,
  label: string,
): void {
  const entry = runner.enterBeat(beatId, fixture.state);
  if (entry.status !== 'presented') throw new Error(`beat "${beatId}" was refused`);
  const option = entry.options.find((candidate) => candidate.label === label);
  if (option === undefined) {
    throw new Error(
      `beat "${beatId}" presented no option "${label}" (got ${entry.options
        .map((candidate) => candidate.label)
        .join(', ')})`,
    );
  }
  runner.resolveChoice(option, fixture.state);
}

/** Closes the current scene and routes the close. */
function closeAndRoute(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  fixture: EpisodeFixture,
): { close: SceneCloseResult; route: SceneRouteResult<ContentCard> } {
  const close = runner.closeScene(fixture.state);
  return { close, route: runner.routeScene(close, fixture.state) };
}

/** The activity-log lines of one kind, in order. */
function logLines(fixture: EpisodeFixture, kind: string): string[] {
  return fixture.state.activityLog
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.text);
}

/** Drives the fixture from `s-i-open` to a clean `success` close. */
function closeOpenSceneSuccessfully(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  fixture: EpisodeFixture,
): { close: SceneCloseResult; route: SceneRouteResult<ContentCard> } {
  resolveByLabel(runner, fixture, 'le-i-open', 'Log the erasure');
  return closeAndRoute(runner, fixture);
}

// ── §2.3 step map ───────────────────────────────────────────

describe('episode runner routing: §2.3 step map', () => {
  it('owns exactly steps C.9–C.12', () => {
    expect(stepsOwnedBy('episode-runner-routing').map((step) => step.id)).toEqual([
      'C.9',
      'C.10',
      'C.11',
      'C.12',
    ]);
    expect(episodeStep('C.9')?.contract).toContain('first route in declaration order');
    expect(episodeStep('C.10')?.contract).toContain('entryBeat');
    expect(episodeStep('C.11')?.contract).toContain('nine §2.3 fields');
    expect(episodeStep('C.12')?.contract).toContain('budget.clock');
  });
});

// ── C.9 — route selection ───────────────────────────────────

describe('episode runner routing: route selection (C.9)', () => {
  it('takes the first matching route in declaration order and flips with the order', () => {
    const base = loadEpisodeFixture();
    const toAnswer: SceneRoute = {
      id: 'first-answer',
      on: '*',
      to: { kind: 'beat', act: 'act-i', scene: 's-i-answer', beat: 'le-i-silent' },
    };
    const toEnding: SceneRoute = {
      id: 'second-ending',
      on: '*',
      to: { kind: 'ending', cardId: 'le-end-quiet' },
    };

    const first = loadEpisodeFixture({
      manifest: manifestAt(base, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        routes: [toAnswer, toEnding],
      })),
    });
    const firstRunner = makeRunner(first);
    const firstRoute = closeOpenSceneSuccessfully(firstRunner, first).route;
    expect(firstRoute.route.id).toBe('first-answer');
    expect(firstRoute.nextBeat).toBe('le-i-silent');
    expect(firstRoute.runClosed).toBe(false);

    // Flip the two matching candidates: the decision flips with them.
    const flipped = loadEpisodeFixture({
      manifest: manifestAt(base, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        routes: [toEnding, toAnswer],
      })),
    });
    const flippedRunner = makeRunner(flipped);
    const flippedRoute = closeOpenSceneSuccessfully(flippedRunner, flipped).route;
    expect(flippedRoute.route.id).toBe('second-ending');
    expect(flippedRoute.nextBeat).toBe('le-end-quiet');
    expect(flippedRoute.runClosed).toBe(true);
  });

  it('skips a chain route while pendingChain is null', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);

    // `s-i-open` authors `honour-the-door` (on success → chain) ahead of
    // `quiet-answer` (on "*"). A clean close pushes no chain, so the chain door
    // is skipped even though its outcome matches.
    const { route } = closeOpenSceneSuccessfully(runner, fixture);

    expect(sceneOf(fixture, 's-i-open').routes[0].to.kind).toBe('chain');
    expect(route.route.id).toBe('quiet-answer');
    expect(route.target.kind).toBe('beat');
  });

  it('honours the when gate and the outcome word', () => {
    const fixture = loadEpisodeFixture();
    // Start in `s-i-answer`, drain its clock so the close is budget-exhausted.
    const manifest = manifestAt(fixture, 's-i-answer', 'le-i-transmit');
    const runner = makeRunner(fixture, manifest);

    expect(runner.enterBeat('le-i-transmit', fixture.state).status).toBe('presented');
    expect(runner.enterBeat('le-i-silent', fixture.state).status).toBe('refused');
    const { close, route } = closeAndRoute(runner, fixture);

    // Objective (goodwill >= 1) unmet → partial, and the `when`-gated
    // `failed-watch` route is the only candidate that can open (the tail
    // `follow-the-door` is a chain route with no chain).
    expect(close.outcome).toBe('partial');
    expect(close.budgetExhausted).toBe(true);
    expect(route.route.id).toBe('failed-watch');
    expect(route.nextBeat).toBe('le-ii-shelter');
    expect(route.target).toMatchObject({
      kind: 'beat',
      actId: 'act-ii',
      sceneId: 's-ii-shelter',
    });
  });

  it('reports a route table that leaves the close with no door', () => {
    const base = loadEpisodeFixture();
    const fixture = loadEpisodeFixture({
      manifest: manifestAt(base, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        routes: [{ id: 'only-chain', on: '*', to: { kind: 'chain' } }],
      })),
    });
    const runner = makeRunner(fixture);
    resolveByLabel(runner, fixture, 'le-i-open', 'Log the erasure');
    const close = runner.closeScene(fixture.state);
    const logBefore = fixture.state.activityLog.length;

    expect(() => runner.routeScene(close, fixture.state)).toThrow(/has no route/);
    // A failed selection records nothing and enters nothing.
    expect(runner.getSceneExits()).toEqual([]);
    expect(fixture.state.activityLog).toHaveLength(logBefore);
    expect(runner.getState().routeHistory).toEqual([]);
  });

  it('evaluates a raw when condition against the supplied context, in order', () => {
    const scene: Scene = {
      id: 's-pure',
      title: 'Pure',
      objective: { statement: 'n/a', check: { field: 'hull', op: '>=', value: 0 } },
      budget: { clock: 1 },
      entryBeat: 'b-one',
      beats: [{ cardId: 'b-one', clockCost: 0 }],
      outcomeRules: [{ id: 'always', outcome: 'success' }],
      routes: [
        {
          id: 'gated-out',
          on: 'success',
          when: { field: 'hull', op: '>=', value: 3 },
          to: { kind: 'ending', cardId: 'e-one' },
        },
        {
          id: 'chain-door',
          on: '*',
          to: { kind: 'chain' },
        },
        {
          id: 'catch-all',
          on: '*',
          to: { kind: 'ending', cardId: 'e-two' },
        },
      ],
    };
    const lowHull: RouteSelectionContext = {
      objectiveMet: true,
      budgetExhausted: false,
      resources: { hull: 2 },
      pendingChain: null,
    };
    const highHull: RouteSelectionContext = { ...lowHull, resources: { hull: 3 } };

    // Low hull: the gate fails, the chain door is skipped (no chain), the tail wins.
    expect(selectRoute({ scene, outcome: 'success', context: lowHull }).id).toBe('catch-all');
    // High hull with no chain: the gate passes before the chain skip matters.
    expect(selectRoute({ scene, outcome: 'success', context: highHull }).id).toBe('gated-out');
    // High hull with a chain: the gate still wins first (declaration order).
    expect(
      selectRoute({ scene, outcome: 'success', context: { ...highHull, pendingChain: 'b-two' } })
        .id,
    ).toBe('gated-out');
  });
});

// ── C.10 — target resolution ────────────────────────────────

describe('episode runner routing: target resolution (C.10)', () => {
  it('chain target opens an out-of-scene beat and enters its scene', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestAt(fixture, 's-i-answer', 'le-i-transmit'));
    const hullBefore = fixture.state.resources.hull;

    // 'Shelter in the dead zone' pushes `le-ii-shelter`, a beat of another scene.
    resolveByLabel(runner, fixture, 'le-i-transmit', 'Shelter in the dead zone');
    expect(runner.getState().pendingChain).toBe('le-ii-shelter');
    const { route } = closeAndRoute(runner, fixture);

    expect(route.route.id).toBe('follow-the-door');
    expect(route.target).toEqual({
      kind: 'beat',
      actId: 'act-ii',
      sceneId: 's-ii-shelter',
      beatId: 'le-ii-shelter',
      endingCardId: null,
    });
    expect(route.nextBeat).toBe('le-ii-shelter');
    expect(route.runClosed).toBe(false);
    expect(route.endingCard).toBeNull();

    // C.12 — the run is in the target scene, at its beat, with a fresh clock.
    const state = runner.getState();
    expect(state.currentActId).toBe('act-ii');
    expect(state.currentSceneId).toBe('s-ii-shelter');
    expect(state.currentBeatId).toBe('le-ii-shelter');
    expect(state.sceneClockRemaining).toBe(sceneOf(fixture, 's-ii-shelter').budget.clock);
    expect(state.pendingChain).toBeNull();
    // Entering restores nothing: the irreversible hull is exactly as it was.
    expect(fixture.state.resources.hull).toBe(hullBefore);
  });

  it('chain target opens a declared ending and closes the run', () => {
    const fixture = loadEpisodeFixture();
    const manifest = manifestAt(fixture, 's-iii-core', 'le-iii-approach');
    const runner = makeRunner(fixture, manifest);

    // 'Unwrite the Loom' spends the charge and pushes the `le-end-quiet` ending.
    resolveByLabel(runner, fixture, 'le-iii-approach', 'Unwrite the Loom');
    expect(runner.getState().pendingChain).toBe('le-end-quiet');
    const { close, route } = closeAndRoute(runner, fixture);

    expect(close.outcome).toBe('success');
    expect(route.route.id).toBe('choose-the-ending');
    expect(route.target).toEqual({
      kind: 'ending',
      actId: null,
      sceneId: null,
      beatId: 'le-end-quiet',
      endingCardId: 'le-end-quiet',
    });
    expect(route.runClosed).toBe(true);
    expect(route.endingCard?.id).toBe('le-end-quiet');
    expect(runner.getEndingCardId()).toBe('le-end-quiet');
    // An ending is not a scene: no scene entry, but the route is recorded.
    expect(runner.getState().sceneHistory).toEqual([]);
    expect(runner.getState().routeHistory).toEqual(['choose-the-ending']);

    // The run is closed: no beat, close or route until it is reset.
    expect(() => runner.enterBeat('le-iii-approach', fixture.state)).toThrow(
      /Cannot enter beat|after the run reached ending/,
    );
    expect(() => runner.closeScene(fixture.state)).toThrow(/after the run reached ending/);
  });

  it('beat target with an explicit beat opens exactly that beat', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const { route } = closeOpenSceneSuccessfully(runner, fixture);

    // `s-i-open`'s `quiet-answer` route names `le-i-silent` explicitly, which
    // is *not* the target scene's `entryBeat` (`le-i-transmit`).
    expect(route.nextBeat).toBe('le-i-silent');
    expect(route.nextBeat).not.toBe(sceneOf(fixture, 's-i-answer').entryBeat);
    expect(runner.getState().currentBeatId).toBe('le-i-silent');
  });

  it('beat target without an explicit beat opens the target entryBeat', () => {
    const base = loadEpisodeFixture();
    const fixture = loadEpisodeFixture({
      manifest: manifestAt(base, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        routes: [
          {
            id: 'quiet-answer',
            on: '*',
            to: { kind: 'beat', act: 'act-i', scene: 's-i-answer' },
          },
        ],
      })),
    });
    const runner = makeRunner(fixture);
    const { route } = closeOpenSceneSuccessfully(runner, fixture);

    const entryBeat = sceneOf(fixture, 's-i-answer').entryBeat;
    expect(route.nextBeat).toBe(entryBeat);
    expect(runner.getState().currentBeatId).toBe(entryBeat);
  });

  it('exposes target resolution as a pure helper with the entryBeat default', () => {
    const fixture = loadEpisodeFixture();

    expect(
      resolveRouteTarget(fixture.manifest, { kind: 'beat', act: 'act-i', scene: 's-i-answer' }, null),
    ).toEqual({
      kind: 'beat',
      actId: 'act-i',
      sceneId: 's-i-answer',
      beatId: 'le-i-transmit',
      endingCardId: null,
    });
    expect(
      resolveRouteTarget(
        fixture.manifest,
        { kind: 'beat', act: 'act-i', scene: 's-i-answer', beat: 'le-i-silent' },
        null,
      ).beatId,
    ).toBe('le-i-silent');
    expect(
      resolveRouteTarget(fixture.manifest, { kind: 'ending', cardId: 'le-end-reset' }, null),
    ).toMatchObject({ kind: 'ending', beatId: 'le-end-reset', endingCardId: 'le-end-reset' });
    expect(resolveRouteTarget(fixture.manifest, { kind: 'chain' }, 'le-ii-offer')).toMatchObject({
      kind: 'beat',
      sceneId: 's-ii-offer',
      beatId: 'le-ii-offer',
    });

    expect(() => resolveRouteTarget(fixture.manifest, { kind: 'chain' }, null)).toThrow(
      /no pending chain/,
    );
  });

  it('reports a target naming an undeclared scene without recording anything', () => {
    const base = loadEpisodeFixture();
    const fixture = loadEpisodeFixture({
      manifest: manifestAt(base, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        routes: [
          {
            id: 'lost-door',
            on: '*',
            to: { kind: 'beat', act: 'act-i', scene: 's-nowhere', beat: 'le-i-silent' },
          },
        ],
      })),
    });
    const runner = makeRunner(fixture);
    resolveByLabel(runner, fixture, 'le-i-open', 'Log the erasure');
    const close = runner.closeScene(fixture.state);
    const logBefore = fixture.state.activityLog.length;

    expect(() => runner.routeScene(close, fixture.state)).toThrow(/s-nowhere/);
    expect(runner.getSceneExits()).toEqual([]);
    expect(runner.getState().routeHistory).toEqual([]);
    expect(fixture.state.activityLog).toHaveLength(logBefore);
  });

  it('resets a closed run to the manifest start and keeps the seed', () => {
    const fixture = loadEpisodeFixture();
    const manifest = manifestAt(fixture, 's-iii-core', 'le-iii-approach');
    const runner = makeRunner(fixture, manifest);
    const seed = runner.getState().seed;

    resolveByLabel(runner, fixture, 'le-iii-approach', 'Unwrite the Loom');
    closeAndRoute(runner, fixture);
    expect(runner.getEndingCardId()).toBe('le-end-quiet');
    expect(runner.getSceneExits()).toHaveLength(1);

    // A restart is only the post-ending action.
    const activeFixture = loadEpisodeFixture();
    const activeRunner = makeRunner(activeFixture);
    expect(() => activeRunner.resetRun()).toThrow(/has not reached an ending/);

    runner.resetRun();

    const state = runner.getState();
    expect(state.seed).toBe(seed);
    expect(state.currentActId).toBe(manifest.start.act);
    expect(state.currentSceneId).toBe(manifest.start.scene);
    expect(state.currentBeatId).toBe(manifest.start.beat);
    expect(state.sceneClockRemaining).toBe(sceneOf(fixture, manifest.start.scene).budget.clock);
    expect(state.pendingChain).toBeNull();
    expect(state.sceneHistory).toEqual([]);
    expect(state.routeHistory).toEqual([]);
    expect(state.lossLedger).toEqual([]);
    expect(runner.getSceneExits()).toEqual([]);
    expect(runner.getEndingCardId()).toBeNull();
    expect(runner.getBudgetExhausted()).toBe(false);
  });

  it('waits for the reset ending restart option rather than restating it', () => {
    const fixture = loadEpisodeFixture();
    // The reset ending is reached through a chain route in `s-iii-core`.
    const manifest = manifestAt(fixture, 's-iii-core', 'le-iii-approach');
    const runner = makeRunner(fixture, manifest);
    resolveByLabel(runner, fixture, 'le-iii-approach', 'Finish the weave');
    const { route } = closeAndRoute(runner, fixture);

    expect(route.nextBeat).toBe('le-end-reset');
    expect(route.endingCard?.id).toBe('le-end-reset');
    // The ending card authors the restart action (`le-i-open`); the runner
    // returns the run to `start` when the game invokes it.
    expect(fixture.cardsById.get('le-end-reset')?.options).toContain('le-i-open');
    runner.resetRun();
    expect(runner.getState().currentBeatId).toBe(manifest.start.beat);
    expect(runner.getState().currentSceneId).toBe(manifest.start.scene);
    expect(runner.getState().currentActId).toBe(manifest.start.act);
  });
});

// ── C.11 — the scene-exit record ────────────────────────────

describe('episode runner routing: scene-exit record (C.11)', () => {
  it('appends exactly one nine-field record per close, with the derived log lines', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const { close, route } = closeOpenSceneSuccessfully(runner, fixture);

    const expected = {
      sceneId: 's-i-open',
      objectiveMet: true,
      outcome: 'success',
      ruleId: 'survey-held',
      routeId: 'quiet-answer',
      clockSpent: 1,
      clockRemaining: 1,
      budgetExhausted: false,
      nextBeat: 'le-i-silent',
    } as const;
    expect(route.exit).toEqual(expected);
    expect(Object.keys(route.exit)).toHaveLength(9);
    expect(Object.isFrozen(route.exit)).toBe(true);

    // The record is the single source the log lines are derived from.
    expect(logLines(fixture, 'scene-exit')).toEqual([
      'Scene exit — s-i-open: success (survey-held), 1 of 2 ticks spent, 1 left, budget intact.',
    ]);
    expect(logLines(fixture, 'route')).toEqual(['Route — quiet-answer → s-i-answer:le-i-silent.']);

    // It repeats the close's verdict verbatim rather than re-evaluating it.
    expect(route.exit.objectiveMet).toBe(close.objectiveMet);
    expect(route.exit.outcome).toBe(close.outcome);
    expect(route.exit.ruleId).toBe(close.ruleId);
    expect(route.exit.budgetExhausted).toBe(close.budgetExhausted);
    expect(route.exit.routeId).toBe(route.route.id);
    expect(route.exit.nextBeat).toBe(route.nextBeat);
    expect(route.nextBeat).toBe(route.target.beatId);
  });

  it('keeps records in close order and never rewrites an earlier one', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const first = closeOpenSceneSuccessfully(runner, fixture).route.exit;

    // The route entered `s-i-answer` at `le-i-silent`; close it again.
    resolveByLabel(runner, fixture, 'le-i-silent', 'Shelter in the dead zone');
    const second = closeAndRoute(runner, fixture).route.exit;

    const exits = runner.getSceneExits();
    expect(exits).toHaveLength(2);
    expect(exits[0]).toEqual(first);
    expect(exits[1]).toEqual(second);
    expect(exits[0].sceneId).toBe('s-i-open');
    expect(exits[1].sceneId).toBe('s-i-answer');
    expect(Object.isFrozen(exits)).toBe(true);
    expect(Object.isFrozen(exits[0])).toBe(true);
    expect(runner.getState().sceneHistory).toEqual(['s-i-answer', 's-ii-shelter']);
    expect(runner.getState().routeHistory).toEqual(['quiet-answer', 'follow-the-door']);
    expect(runner.getState().sceneClockRemaining).toBe(
      sceneOf(fixture, 's-ii-shelter').budget.clock,
    );
  });

  it('returns a defensive copy a caller cannot use to rewrite the records', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    closeOpenSceneSuccessfully(runner, fixture);

    const exits = runner.getSceneExits();
    expect(() => {
      (exits as unknown as unknown[]).length = 0;
    }).toThrow();
    expect(runner.getSceneExits()).toHaveLength(1);

    const copy = [...runner.getSceneExits()];
    expect(copy).not.toBe(runner.getSceneExits());
    copy.pop();
    expect(runner.getSceneExits()).toHaveLength(1);
  });

  it('records a budget-exhausted close with the ticks it actually spent', () => {
    const fixture = loadEpisodeFixture();
    const manifest = manifestAt(fixture, 's-iii-core', 'le-iii-approach');
    const runner = makeRunner(fixture, manifest);

    expect(runner.enterBeat('le-iii-approach', fixture.state).status).toBe('presented');
    expect(runner.enterBeat('le-iii-ahead', fixture.state).status).toBe('refused');
    const { route } = closeAndRoute(runner, fixture);

    expect(route.exit).toMatchObject({
      sceneId: 's-iii-core',
      objectiveMet: true,
      outcome: 'failure',
      ruleId: 'watch-spent',
      routeId: 'quiet-core',
      clockSpent: 3,
      clockRemaining: 2,
      budgetExhausted: true,
      nextBeat: 'le-end-quiet',
    });
    expect(logLines(fixture, 'scene-exit')).toEqual([
      'Scene exit — s-iii-core: failure (watch-spent), 3 of 5 ticks spent, 2 left, budget exhausted.',
    ]);
    expect(logLines(fixture, 'route')).toEqual(['Route — quiet-core → ending le-end-quiet.']);
  });

  it('reads the route gate against post-loss resources', () => {
    const base = loadEpisodeFixture();
    const fixture = loadEpisodeFixture({
      manifest: manifestAt(base, 's-iii-core', 'le-iii-approach', (scene) => ({
        ...scene,
        routes: [
          {
            id: 'hull-scored',
            on: '*',
            when: { field: 'hull', op: '<=', value: 4 },
            to: { kind: 'ending', cardId: 'le-end-quiet' },
          },
          { id: 'choose-the-ending', on: 'success', to: { kind: 'chain' } },
        ],
      })),
    });
    const runner = makeRunner(fixture);

    // Drain the clock: the close classifies failure and `hull-sacrificed`
    // takes the hull from 5 to 4 *before* routing (steps 8 then 9).
    expect(runner.enterBeat('le-iii-approach', fixture.state).status).toBe('presented');
    expect(runner.enterBeat('le-iii-ahead', fixture.state).status).toBe('refused');
    const { route } = closeAndRoute(runner, fixture);

    expect(fixture.state.resources.hull).toBe(4);
    expect(route.route.id).toBe('hull-scored');
    expect(route.nextBeat).toBe('le-end-quiet');
    expect(route.runClosed).toBe(true);
  });

  it('refuses to route a close other than the current scene', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const stale: SceneCloseResult = {
      sceneId: 's-iii-core',
      objectiveMet: true,
      outcome: 'success',
      ruleId: 'crew-with-you',
      budgetExhausted: false,
      losses: [],
    };

    expect(() => runner.routeScene(stale, fixture.state)).toThrow(/Route the scene you just closed/);
    expect(runner.getSceneExits()).toEqual([]);
  });
});

// ── C.12 + RNG accounting ───────────────────────────────────

describe('episode runner routing: scene entry and RNG (C.12)', () => {
  it('resets the clock, pushes the histories, clears the chain and keeps irreversible keys', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestAt(fixture, 's-i-answer', 'le-i-transmit'));
    expect(fixture.state.resources.hull).toBe(5);

    // An out-of-scene push closes `s-i-answer` with a pending chain, and the
    // clock is nearly spent (2 of 2) when the route enters `s-ii-shelter`.
    resolveByLabel(runner, fixture, 'le-i-transmit', 'Shelter in the dead zone');
    const before = runner.getState();
    expect(before.sceneClockRemaining).toBe(0);
    expect(before.pendingChain).toBe('le-ii-shelter');
    expect(before.sceneHistory).toEqual([]);

    const { route } = closeAndRoute(runner, fixture);
    const after = runner.getState();

    expect(after.currentSceneId).toBe('s-ii-shelter');
    expect(after.currentActId).toBe('act-ii');
    expect(after.currentBeatId).toBe('le-ii-shelter');
    expect(after.sceneClockRemaining).toBe(6);
    expect(after.sceneHistory).toEqual(['s-ii-shelter']);
    expect(after.routeHistory).toEqual(['follow-the-door']);
    expect(after.pendingChain).toBeNull();
    // Nothing restores an irreversible key on entry.
    expect(fixture.state.resources.hull).toBe(5);
    expect(route.exit.clockSpent).toBe(2);
    expect(route.exit.clockRemaining).toBe(0);
  });

  it('consumes no RNG from route selection, record emission or scene entry', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    expect(fixture.state.rngCalls).toBe(0);

    // The choice is @story-line's own step and may draw its successor (the
    // engine seam owns that draw); routing must add nothing on top of it.
    resolveByLabel(runner, fixture, 'le-i-open', 'Log the erasure');
    const close = runner.closeScene(fixture.state);
    const callsAfterClose = fixture.state.rngCalls;
    const drawsAfterClose = [...fixture.state.rngDraws];

    const route = runner.routeScene(close, fixture.state);

    expect(fixture.state.rngCalls).toBe(callsAfterClose);
    expect(fixture.state.rngDraws).toEqual(drawsAfterClose);
    expect(route.exit.sceneId).toBe('s-i-open');
    expect(runner.getState().sceneHistory).toEqual(['s-i-answer']);
  });
});
