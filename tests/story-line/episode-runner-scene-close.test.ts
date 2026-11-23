/**
 * Episode runner scene close (GDD §2.3 steps C.6–C.8).
 *
 * This suite owns the classification half of the routing contract:
 *
 * - **C.6** the scene objective is evaluated **exactly once**, against the
 *   post-resolution resources, and recorded as `objectiveMet`;
 * - **C.7** the outcome is classified first-match-wins in the outcome table's
 *   declaration order over `{ objective }`, `{ budget }` and raw
 *   `{ field, op, value }` conditions — `budgetExhausted` is an authored input,
 *   never a hard-coded `failure`, and a refused beat in `s-iii-core` classifies
 *   `failure` through the authored `watch-spent` rule placed before the
 *   catch-all;
 * - **C.8** every matching `losses[]` rule is applied in declaration order
 *   through `engine.applyResourceDelta`, producing one ledger rule line and one
 *   activity-log line each (statement plus signed amount and key).
 *
 * The suite also pins the two properties the GDD states as invariants: no rule
 * may throw on a manifest that passed `validateEpisodeManifest` (a fixture-wide
 * sweep over every scene and objective/budget combination, with no defensive
 * catch-all in the classifier), and scene close consumes no RNG.
 *
 * Everything runs against the committed `long-erasure` fixture lane (the real
 * manifest, the real CSV and the real `createStorylineSystem` choice model).
 * The shapes the fixture does not author — two loss rules in one scene and a
 * reordered outcome table — are supplied as in-memory overrides, so the
 * committed files stay the single source of truth for everything else.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  classifySceneOutcome,
  createEpisodeRunner,
  createStorylineSystem,
  evaluateSceneCondition,
  type EpisodeRunner,
  type SceneCloseResult,
  type SceneConditionContext,
} from '../../src/story-line';
import {
  SCENE_OUTCOMES,
  type EpisodeManifest,
  type LossRule,
  type OutcomeRule,
  type Scene,
} from '../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_SEED,
  episodeStep,
  loadEpisodeFixture,
  stepsOwnedBy,
  type EpisodeFixture,
  type VoyageEngineAdapter,
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
 * an optional in-memory rewrite of that scene — so a test can begin a run in
 * the scene whose close it needs to observe without editing the committed
 * fixture file.
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

/** Builds a storyline system whose `getResources` counts its reads. */
function countingStoryline(fixture: EpisodeFixture): {
  storyline: ReturnType<typeof createStorylineSystem<VoyageState, ContentCard>>;
  reads: () => number;
} {
  let reads = 0;
  const engine: VoyageEngineAdapter = {
    ...fixture.engine,
    getResources(state) {
      reads += 1;
      return fixture.engine.getResources(state);
    },
  };
  return {
    storyline: createStorylineSystem<VoyageState, ContentCard>({ engine }),
    reads: () => reads,
  };
}

// ── §2.3 step map ───────────────────────────────────────────

describe('episode runner scene close: §2.3 step map', () => {
  it('owns exactly steps C.6–C.8', () => {
    expect(stepsOwnedBy('episode-runner-scene-close').map((step) => step.id)).toEqual([
      'C.6',
      'C.7',
      'C.8',
    ]);
    expect(episodeStep('C.6')?.contract).toContain('objective');
    expect(episodeStep('C.7')?.contract).toContain('first-match-wins');
    expect(episodeStep('C.8')?.contract).toContain('applyResourceDelta');
  });
});

// ── C.6 — objective evaluation ──────────────────────────────

describe('episode runner scene close: objective (C.6)', () => {
  it('evaluates the objective against post-resolution resources', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    expect(fixture.state.resources.stores).toBe(4);

    // `Log the erasure` authors `#cost=stores:1`, so resolution leaves the
    // objective's threshold (stores >= 3) exactly satisfied — not before it did.
    resolveByLabel(runner, fixture, 'le-i-open', 'Log the erasure');
    expect(fixture.state.resources.stores).toBe(3);

    const result = runner.closeScene(fixture.state);

    expect(result.objectiveMet).toBe(true);
    expect(result.outcome).toBe('success');
    expect(result.ruleId).toBe('survey-held');
    expect(result.budgetExhausted).toBe(false);
    expect(result.losses).toEqual([]);
    expect(result.sceneId).toBe('s-i-open');
    // Exactly the close result the routing step and the scene-exit record read.
    expect(Object.keys(result).sort()).toEqual(
      ['budgetExhausted', 'losses', 'objectiveMet', 'outcome', 'ruleId', 'sceneId'].sort(),
    );
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('records an unmet objective when the post-resolution check fails', () => {
    const fixture = loadEpisodeFixture();
    // Below the objective's `stores >= 3` threshold before the close.
    fixture.state.resources.stores = 2;
    const runner = makeRunner(fixture);

    const result = runner.closeScene(fixture.state);

    expect(result.objectiveMet).toBe(false);
    expect(result.outcome).toBe('partial');
    expect(result.ruleId).toBe('survey-shaken');
  });

  it('reads engine.getResources exactly once for the objective', () => {
    const fixture = loadEpisodeFixture();
    const { storyline, reads } = countingStoryline(fixture);
    const runner = createEpisodeRunner<VoyageState, ContentCard>({
      manifest: fixture.manifest,
      storyline,
      content: fixture.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });

    // `s-i-open` authors no loss rules, so the objective read is the only one.
    runner.closeScene(fixture.state);

    expect(reads()).toBe(1);
  });

  it('consumes no RNG', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestAt(fixture, 's-iii-core', 'le-iii-approach'));
    expect(fixture.state.rngCalls).toBe(0);

    runner.closeScene(fixture.state);

    expect(fixture.state.rngCalls).toBe(0);
    expect(fixture.state.rngDraws).toEqual([]);
  });
});

// ── C.7 — outcome classification ────────────────────────────

describe('episode runner scene close: outcome (C.7)', () => {
  it('classifies first match wins in declaration order', () => {
    const matchedObjective: OutcomeRule = {
      id: 'objective-first',
      when: { objective: 'met' },
      outcome: 'failure',
    };
    const matchedResource: OutcomeRule = {
      id: 'resource-second',
      when: { field: 'stores', op: '>=', value: 0 },
      outcome: 'partial',
    };
    const catchAll: OutcomeRule = { id: 'catch-all', outcome: 'success' };

    // The committed start bag meets the objective (stores 4 >= 3) and the raw
    // resource gate, so both rules match and only the order decides.
    const first = loadEpisodeFixture();
    const firstRunner = makeRunner(
      first,
      manifestAt(first, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        outcomeRules: [matchedObjective, matchedResource, catchAll],
      })),
    );
    const firstResult = firstRunner.closeScene(first.state);
    expect(firstResult.outcome).toBe('failure');
    expect(firstResult.ruleId).toBe('objective-first');

    // Flip the two matching rules and the decision flips with them.
    const flipped = loadEpisodeFixture();
    const flippedRunner = makeRunner(
      flipped,
      manifestAt(flipped, 's-i-open', 'le-i-open', (scene) => ({
        ...scene,
        outcomeRules: [matchedResource, matchedObjective, catchAll],
      })),
    );
    const flippedResult = flippedRunner.closeScene(flipped.state);
    expect(flippedResult.outcome).toBe('partial');
    expect(flippedResult.ruleId).toBe('resource-second');
  });

  it('honours an authored budget-exhausted rule before the catch-all', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestAt(fixture, 's-iii-core', 'le-iii-approach'));

    // Drain the scene clock without resolving a choice: `le-iii-approach`
    // charges 3 of 5, so `le-iii-ahead` (3) is refused and sets exhaustion.
    expect(runner.enterBeat('le-iii-approach', fixture.state).status).toBe('presented');
    const refused = runner.enterBeat('le-iii-ahead', fixture.state);
    expect(refused.status).toBe('refused');
    expect(runner.getBudgetExhausted()).toBe(true);

    const result = runner.closeScene(fixture.state);

    // The objective (morale >= 4) holds, but `watch-spent` classifies first:
    // exhaustion is classified by the authored table, never hard-coded.
    expect(result.objectiveMet).toBe(true);
    expect(result.budgetExhausted).toBe(true);
    expect(result.outcome).toBe('failure');
    expect(result.ruleId).toBe('watch-spent');
  });

  it('classifies every fixture scene without throwing in any objective/budget case', () => {
    const fixture = loadEpisodeFixture();
    const scenes = fixture.manifest.acts.flatMap((act) => act.scenes);
    const resourceBags = [
      {},
      { hull: 0 },
      { stores: 2, morale: 1, hull: 5 },
      fixture.manifest.resources.start,
    ];
    let classifications = 0;

    for (const scene of scenes) {
      for (const objectiveMet of [true, false]) {
        for (const budgetExhausted of [true, false]) {
          for (const resources of resourceBags) {
            const context: SceneConditionContext = { objectiveMet, budgetExhausted, resources };
            for (const rule of scene.outcomeRules) {
              if (rule.when === undefined) continue;
              expect(typeof evaluateSceneCondition(rule.when, context)).toBe('boolean');
            }

            const classification = classifySceneOutcome(scene, context);
            expect(SCENE_OUTCOMES).toContain(classification.outcome);
            expect(classification.ruleId.length).toBeGreaterThan(0);
            classifications += 1;
          }
        }
      }
    }

    // The sweep really swept: 5 scenes × 2 objective × 2 budget × 4 bags.
    expect(classifications).toBe(scenes.length * 2 * 2 * resourceBags.length);
  });

  it('reports a non-total outcome table loudly instead of defaulting an outcome', () => {
    const fixture = loadEpisodeFixture();
    const scene = sceneOf(fixture, 's-i-open');
    const nonTotal: Scene = {
      ...scene,
      outcomeRules: [{ id: 'only-met', when: { objective: 'met' }, outcome: 'success' }],
    };

    expect(() =>
      classifySceneOutcome(nonTotal, {
        objectiveMet: false,
        budgetExhausted: false,
        resources: fixture.state.resources,
      }),
    ).toThrow(/no matching outcome rule/);
  });

  it('evaluates all three condition forms, with absent resources reading 0', () => {
    const context: SceneConditionContext = {
      objectiveMet: true,
      budgetExhausted: false,
      resources: { stores: 3 },
    };

    expect(evaluateSceneCondition({ objective: 'met' }, context)).toBe(true);
    expect(evaluateSceneCondition({ objective: 'unmet' }, context)).toBe(false);
    expect(evaluateSceneCondition({ budget: 'intact' }, context)).toBe(true);
    expect(evaluateSceneCondition({ budget: 'exhausted' }, context)).toBe(false);

    expect(evaluateSceneCondition({ field: 'stores', op: '>=', value: 3 }, context)).toBe(true);
    expect(evaluateSceneCondition({ field: 'stores', op: '>', value: 3 }, context)).toBe(false);
    expect(evaluateSceneCondition({ field: 'stores', op: '<=', value: 3 }, context)).toBe(true);
    expect(evaluateSceneCondition({ field: 'stores', op: '<', value: 4 }, context)).toBe(true);
    expect(evaluateSceneCondition({ field: 'stores', op: '==', value: 3 }, context)).toBe(true);

    // A declared key the bag omits reads as 0, the shipped @story-line rule.
    expect(evaluateSceneCondition({ field: 'missing', op: '==', value: 0 }, context)).toBe(true);
    expect(evaluateSceneCondition({ field: 'missing', op: '>', value: 0 }, context)).toBe(false);

    // The objective/budget forms ignore the resource bag entirely.
    expect(
      evaluateSceneCondition({ budget: 'exhausted' }, { ...context, budgetExhausted: true }),
    ).toBe(true);
  });
});

// ── C.8 — loss application ──────────────────────────────────

describe('episode runner scene close: losses (C.8)', () => {
  it('applies the matching loss through the seam with one ledger and one log line', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture, manifestAt(fixture, 's-iii-core', 'le-iii-approach'));
    const statement = 'Breaking for the core on the last of the watch costs the hull.';
    expect(fixture.state.resources.hull).toBe(5);

    // Reach a budget-exhausted close, whose `watch-spent` failure fires
    // `hull-sacrificed` (−1, the only loss the fixture authors).
    runner.enterBeat('le-iii-approach', fixture.state);
    runner.enterBeat('le-iii-ahead', fixture.state);
    const result: SceneCloseResult = runner.closeScene(fixture.state);

    expect(result.losses).toHaveLength(1);
    expect(result.losses[0]).toEqual({
      kind: 'rule',
      sceneId: 's-iii-core',
      ruleId: 'hull-sacrificed',
      field: 'hull',
      delta: -1,
      statement,
    });
    expect(Object.isFrozen(result.losses)).toBe(true);

    // The loss reached the resources through engine.applyResourceDelta …
    expect(fixture.state.resources.hull).toBe(4);
    expect(fixture.state.appliedDeltas).toEqual([
      { delta: { hull: -1 }, after: expect.objectContaining({ hull: 4 }) },
    ]);
    // … the ledger observed the same line …
    expect(runner.getLossLedger()).toEqual([result.losses[0]]);
    // … and the activity log carries one line: statement + signed amount + key.
    expect(fixture.state.activityLog).toEqual([
      { turn: 1, text: `${statement} (\u22121 hull)`, kind: 'loss' },
    ]);
  });

  it('applies every matching loss rule in declaration order', () => {
    const base = loadEpisodeFixture();
    const losses: LossRule[] = [
      {
        id: 'first-seam',
        on: 'failure',
        field: 'hull',
        amount: 1,
        statement: 'The frame gives at the first seam.',
      },
      {
        id: 'second-seam',
        on: 'failure',
        field: 'hull',
        amount: 2,
        statement: 'The frame gives all the way.',
      },
    ];
    const fixture = loadEpisodeFixture({
      manifest: manifestAt(base, 's-iii-core', 'le-iii-approach', (scene) => ({
        ...scene,
        losses,
      })),
    });
    const runner = makeRunner(fixture);

    runner.enterBeat('le-iii-approach', fixture.state);
    runner.enterBeat('le-iii-ahead', fixture.state);
    const result = runner.closeScene(fixture.state);

    expect(result.outcome).toBe('failure');
    expect(result.losses.map((entry) => entry.ruleId)).toEqual(['first-seam', 'second-seam']);
    expect(result.losses.map((entry) => entry.delta)).toEqual([-1, -2]);
    expect(result.losses.map((entry) => entry.kind)).toEqual(['rule', 'rule']);

    // Declaration order is applied order, for the seam, the ledger and the log.
    expect(fixture.state.appliedDeltas.map((applied) => applied.delta)).toEqual([
      { hull: -1 },
      { hull: -2 },
    ]);
    expect(
      runner.getLossLedger().map((entry) => (entry.kind === 'rule' ? entry.ruleId : null)),
    ).toEqual(['first-seam', 'second-seam']);
    expect(fixture.state.resources.hull).toBe(2);
    expect(fixture.state.activityLog.map((entry) => entry.text)).toEqual([
      `${losses[0].statement} (\u22121 hull)`,
      `${losses[1].statement} (\u22122 hull)`,
    ]);
  });

  it('applies no loss rule when the classified outcome does not match', () => {
    const fixture = loadEpisodeFixture();
    // A clean close of `s-iii-core`: objective met, budget intact → success,
    // and `hull-sacrificed` is authored `on: "failure"` only.
    const runner = makeRunner(fixture, manifestAt(fixture, 's-iii-core', 'le-iii-approach'));

    const result = runner.closeScene(fixture.state);

    expect(result.outcome).toBe('success');
    expect(result.ruleId).toBe('crew-with-you');
    expect(result.losses).toEqual([]);
    expect(fixture.state.resources.hull).toBe(5);
    expect(fixture.state.appliedDeltas).toEqual([]);
    expect(fixture.state.activityLog).toEqual([]);
    expect(runner.getLossLedger()).toEqual([]);
  });
});
