/**
 * Episode runner determinism (epic determinism proof).
 *
 * The run is a scripted, non-interactive pipeline: the same seed and the same
 * choice sequence must walk the same beats, take the same routes and close on
 * the same ending. This suite pins that property from four directions:
 *
 * - **Same seed, same choices.** Two *independently constructed* runs (their
 *   own state, engine-adapter double and storyline system) produce identical
 *   ordered `scene-exit` records, identical loss-ledger lines, an identical
 *   activity log and the same final outcome, down to a byte-identical
 *   `JSON.stringify` of the records.
 * - **One RNG.** Every `engine.rng` draw is attributed to an option
 *   resolution. Beat entry, scene close (which owns outcome classification and
 *   loss application), routing and the pure seams that support them consume
 *   no draw — asserted both from a stage-tagged RNG ledger and from a
 *   per-call draw count.
 * - **No hidden clock or randomness.** `Math.random` never appears in the
 *   runner module, and neither the scene-exit record nor the loss ledger can
 *   carry a timestamp.
 * - **Table order is the only other lever.** Reordering two competing routes
 *   in an in-memory manifest copy flips the decision at the same seed without
 *   drawing any RNG; an unmodified copy reproduces byte-identical records.
 *
 * The scripted route is the committed `long-erasure` fixture. It reaches
 * `le-ii-sabotage`'s two-candidate option with `charge < 2`, so the choice
 * model takes its one draw for that selection — the draw this suite accounts
 * for — and the drawn card decides which `s-iii-core` beat the run enters.
 * Every other resolution draws once for its own single-candidate selection,
 * which is the one-draw-per-selection rule this suite pins.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SCENE_EXIT_FIELDS,
  classifySceneOutcome,
  createEpisodeRunner,
  deserializeRunState,
  evaluateSceneCondition,
  resolveRouteTarget,
  selectRoute,
  serializeRunState,
  type ChoiceResolution,
  type EpisodeRunState,
  type EpisodeRunner,
  type LossLedgerEntry,
  type SceneCloseResult,
  type SceneExitRecord,
  type SceneRouteResult,
  type StorylineOption,
} from '../../src/story-line';
import type { EpisodeManifest, Scene } from '../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_SEED,
  REPO_ROOT,
  RNG_STAGE_IDLE,
  loadEpisodeFixture,
  withRngStage,
  type RngDrawRecord,
  type VoyageLogEntry,
  type VoyageState,
} from './helpers/episode-fixture';

// ── Stage-tagged instrumentation ────────────────────────────

/** One driven pipeline call and how many RNG draws it consumed. */
interface StageAudit {
  /** The stage label the harness set around the call. */
  readonly stage: string;
  /** How many `engine.rng` calls the call made. */
  readonly draws: number;
}

/**
 * Drives `fn` under a stage label and records how many draws it consumed.
 *
 * The guard is deliberately generic: the caller names the pipeline stage it is
 * driving, which is the only way to attribute a draw to a step (the runner
 * reports no stage of its own by design).
 */
function stage<T>(state: VoyageState, audit: StageAudit[], name: string, fn: () => T): T {
  const before = state.rngCalls;
  const result = withRngStage(state, name, fn);
  audit.push({ stage: name, draws: state.rngCalls - before });
  return result;
}

// ── Scripted driver ─────────────────────────────────────────

/** One scripted decision: enter `beat`, resolve the option labelled `choose`. */
interface ScriptStep {
  /** The beat to enter (a beat of the run's current scene). */
  readonly beat: string;
  /** The authored option label to resolve at that beat. */
  readonly choose: string;
}

/** Everything one scripted run produced, read back from the public surface. */
interface ScriptedRun {
  /** The ending card id the run closed on (`null` while still active). */
  readonly endingCardId: string | null;
  /** Every scene exit appended by the run, in close order. */
  readonly exits: readonly SceneExitRecord[];
  /** Every loss-ledger line the run recorded, in observation order. */
  readonly ledger: readonly LossLedgerEntry[];
  /** The activity log the engine double collected, in append order. */
  readonly log: readonly VoyageLogEntry[];
  /** Every resolved choice, in play order. */
  readonly choices: readonly ChoiceResolution<ContentCard>[];
  /** Every scene close, in close order. */
  readonly closes: readonly SceneCloseResult[];
  /** Every routed close, in close order. */
  readonly routes: readonly SceneRouteResult<ContentCard>[];
  /** The final run-state snapshot. */
  readonly state: EpisodeRunState;
  /** The final resource bag (a copy). */
  readonly resources: Readonly<Record<string, number>>;
  /** Every driven call with its draw count, in play order. */
  readonly stages: readonly StageAudit[];
  /** Every RNG draw, in call order, tagged with the stage that caused it. */
  readonly draws: readonly RngDrawRecord[];
}

/** Builds a runner from a fixture, without consuming RNG. */
function makeRunner(
  fixture: ReturnType<typeof loadEpisodeFixture>,
  state: VoyageState,
  audit: StageAudit[],
): EpisodeRunner<VoyageState, ContentCard> {
  return stage(state, audit, 'construction', () =>
    createEpisodeRunner<VoyageState, ContentCard>({
      manifest: fixture.manifest,
      storyline: fixture.storyline,
      content: fixture.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    }),
  );
}

/**
 * Plays one scripted run from a fresh, independently constructed fixture.
 *
 * Each call builds its own state, engine-adapter double and storyline system,
 * so the two runs a comparison test makes share nothing but the committed
 * fixture files and the script.
 *
 * The script names options by their **authored label**, so the choice sequence
 * is data rather than an index into whatever the run happened to present.
 */
function playScript(
  steps: readonly ScriptStep[],
  options: { manifest?: EpisodeManifest; seed?: number } = {},
): ScriptedRun {
  const fixture = loadEpisodeFixture({ manifest: options.manifest, seed: options.seed });
  const audit: StageAudit[] = [];
  const state = fixture.state;
  const runner = stage(state, audit, 'construction', () =>
    createEpisodeRunner<VoyageState, ContentCard>({
      manifest: fixture.manifest,
      storyline: fixture.storyline,
      content: fixture.cardsById,
      seed: options.seed ?? DEFAULT_EPISODE_SEED,
    }),
  );

  const choices: ChoiceResolution<ContentCard>[] = [];
  const closes: SceneCloseResult[] = [];
  const routes: SceneRouteResult<ContentCard>[] = [];

  /** Enters a beat, resolves the labelled option and routes a close. */
  const playStep = (step: ScriptStep): void => {
    const entry = stage(state, audit, 'beat-entry', () =>
      runner.enterBeat(step.beat, state),
    );
    if (entry.status !== 'presented') {
      throw new Error(
        `beat "${step.beat}" was refused (${entry.reason}) in scene "${entry.sceneId}"`,
      );
    }

    const option: StorylineOption<VoyageState> | undefined = entry.options.find(
      (candidate) => candidate.label === step.choose,
    );
    if (option === undefined) {
      throw new Error(
        `beat "${step.beat}" presented no option "${step.choose}" (got ${entry.options
          .map((candidate) => candidate.label)
          .join(', ')})`,
      );
    }

    const resolution = stage(state, audit, 'option-resolution', () =>
      runner.resolveChoice(option, state),
    );
    choices.push(resolution);

    if (resolution.next !== 'close') return;

    // The close owns outcome classification (C.7) and loss application (C.8);
    // routing owns route selection (C.9–C.10). Each is driven as its own stage
    // so a draw in either place is attributable.
    const close = stage(state, audit, 'scene-close', () => runner.closeScene(state));
    closes.push(close);
    routes.push(stage(state, audit, 'routing', () => runner.routeScene(close, state)));
  };

  for (const step of steps) playStep(step);

  return {
    endingCardId: runner.getEndingCardId(),
    exits: runner.getSceneExits(),
    ledger: runner.getLossLedger(),
    log: state.activityLog,
    choices,
    closes,
    routes,
    state: runner.getState(),
    resources: { ...state.resources },
    stages: audit,
    draws: state.rngLedger,
  };
}

// ── The scripted route ──────────────────────────────────────

/**
 * The prefix that reaches the sabotage beat's two-candidate option with
 * `charge < 2`, so that selection must take the candidate draw.
 *
 * Logging costs a store (so `s-i-open` closes on `success`), transmitting
 * costs the ship's charge (`charge` drops to 1, so the sabotage option's
 * `charge >= 2` rule cannot match), stripping the derelict gives the crew the
 * goodwill the sabotage costs, and sharing the berth tops it up to exactly 3.
 */
const RANDOM_BRANCH_PREFIX: readonly ScriptStep[] = [
  { beat: 'le-i-open', choose: 'Log the erasure' },
  { beat: 'le-i-log', choose: 'Transmit the warning' },
  { beat: 'le-i-transmit', choose: 'Shelter in the dead zone' },
  { beat: 'le-ii-shelter', choose: 'Strip the derelict' },
  { beat: 'le-ii-salvage', choose: 'Share the berth' },
  { beat: 'le-ii-offer', choose: 'Bargain in bad faith' },
  { beat: 'le-ii-bargain', choose: 'Sabotage the Loom' },
  { beat: 'le-ii-sabotage', choose: 'Break for the core' },
];

/**
 * The continuation from `s-iii-core`, chosen from the **drawn** entry beat.
 *
 * `s-iii-core`'s clock is 5 and every beat costs 3, so the second beat of the
 * scene is never affordable: whichever candidate the draw picks, the run takes
 * that beat's ending option. Both options open `le-end-ram`, so the branch
 * changes the position and resources but not the ending or the routes.
 */
function coreContinuation(beatId: string): ScriptStep[] {
  if (beatId === 'le-iii-ahead') {
    return [{ beat: 'le-iii-ahead', choose: 'Hit the core now' }];
  }
  if (beatId === 'le-iii-approach') {
    return [{ beat: 'le-iii-approach', choose: 'Ram the core' }];
  }
  throw new Error(`the sabotage draw entered unexpected beat "${beatId}" of s-iii-core`);
}

/** Two steps that close `s-i-open` — the scene with the competing routes. */
const COMPETING_ROUTE_SCRIPT: readonly ScriptStep[] = [
  { beat: 'le-i-open', choose: 'Log the erasure' },
  { beat: 'le-i-log', choose: 'Transmit the warning' },
];

/**
 * Plays the whole fixed script — prefix plus the drawn continuation — from one
 * fresh fixture.
 */
function playFullRoute(
  options: { manifest?: EpisodeManifest; seed?: number } = {},
): ScriptedRun & { readonly entryBeat: string } {
  const probe = playScript(RANDOM_BRANCH_PREFIX, options);
  const entryBeat = probe.state.currentSceneId === 's-iii-core' ? probe.state.currentBeatId : '';
  if (entryBeat === '') {
    throw new Error(
      `the sabotage prefix did not route into s-iii-core (in "${probe.state.currentSceneId}")`,
    );
  }

  const run = playScript([...RANDOM_BRANCH_PREFIX, ...coreContinuation(entryBeat)], options);
  return { ...run, entryBeat };
}

// ── Manifest helpers ────────────────────────────────────────

/** Returns one scene of a manifest by id. */
function sceneOf(manifest: EpisodeManifest, sceneId: string): Scene {
  const scene = manifest.acts
    .flatMap((act) => act.scenes)
    .find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`manifest has no scene "${sceneId}"`);
  return scene;
}

/**
 * Returns a manifest copy whose first two routes of `sceneId` are swapped.
 *
 * The copy shares everything it does not reorder — including the committed
 * card content — so the only difference from the original is table order.
 */
function withSwappedRoutes(manifest: EpisodeManifest, sceneId: string): EpisodeManifest {
  return {
    ...manifest,
    acts: manifest.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        if (scene.routes.length < 2) {
          throw new Error(`scene "${sceneId}" has fewer than two routes to swap`);
        }
        const routes = [...scene.routes];
        [routes[0], routes[1]] = [routes[1], routes[0]];
        return { ...scene, routes };
      }),
    })),
  };
}

/** JSON-normalises a value for byte-level comparison. */
function normalise(value: unknown): string {
  return JSON.stringify(value);
}

// ── Same seed, same choices ─────────────────────────────────

describe('episode runner determinism: same seed, same choices', () => {
  it('two independent runs produce byte-identical exits, ledger lines and outcome', () => {
    const first = playFullRoute();
    const second = playFullRoute();

    // The scripts are the same sequence of authored labels, and both runs
    // reached the same ending by the same drawn branch.
    expect(second.endingCardId).toBe(first.endingCardId);
    expect(second.endingCardId).toBe('le-end-ram');
    expect(second.entryBeat).toBe(first.entryBeat);

    // Ordered records, byte-identical after JSON serialisation.
    expect(second.exits.length).toBeGreaterThan(0);
    expect(normalise(second.exits)).toBe(normalise(first.exits));
    expect(second.exits).toEqual(first.exits);

    // Loss ledger lines: the chain loss from stripping the derelict plus
    // nothing from the success close.
    expect(second.ledger.length).toBeGreaterThan(0);
    expect(normalise(second.ledger)).toBe(normalise(first.ledger));

    // Final outcome: position, histories and resources all agree.
    expect(normalise(second.state)).toBe(normalise(first.state));
    expect(normalise(second.resources)).toBe(normalise(first.resources));
    expect(normalise(second.log)).toBe(normalise(first.log));
  });

  it('takes exactly one draw per resolution, and the sabotage draw picks the branch', () => {
    const run = playFullRoute();

    // One seeded draw per selection is the choice model's one-draw rule.
    expect(run.draws).toHaveLength(run.choices.length);
    expect(run.choices.length).toBe(RANDOM_BRANCH_PREFIX.length + 1);

    // The sabotage selection is the prefix's last draw: at seed 1234 it picks
    // the second candidate, `le-iii-ahead`.
    const sabotageDraw = run.draws[RANDOM_BRANCH_PREFIX.length - 1];
    expect(sabotageDraw.value).toBeGreaterThanOrEqual(0.5);
    expect(run.entryBeat).toBe('le-iii-ahead');
    const history = run.state.routeHistory;
    expect(history[history.length - 1]).toBe('choose-the-ending');
  });

  it('a different seed changes the drawn branch but the fixed choices still close the run', () => {
    // Seed 7's eighth draw is below 0.5, so the sabotage selection picks the
    // first candidate rather than seed 1234's second.
    const seeded = playFullRoute({ seed: DEFAULT_EPISODE_SEED });
    const other = playFullRoute({ seed: 7 });

    // Same one-draw pipeline, different seed → the other candidate.
    expect(seeded.draws).toHaveLength(seeded.choices.length);
    expect(other.draws).toHaveLength(other.choices.length);
    expect(other.draws[0].value).not.toBe(seeded.draws[0].value);
    expect(seeded.entryBeat).toBe('le-iii-ahead');
    expect(other.entryBeat).toBe('le-iii-approach');

    // The branch is the only difference: the scripted decisions still end the
    // run on the same ending through the same routes.
    expect(other.endingCardId).toBe('le-end-ram');
    expect(other.state.routeHistory).toEqual(seeded.state.routeHistory);
  });
});

// ── RNG attribution ─────────────────────────────────────────

describe('episode runner determinism: one RNG, drawn only by choice resolution', () => {
  it('tags every draw with the option-resolution stage', () => {
    const run = playFullRoute();

    expect(run.draws.length).toBeGreaterThan(0);
    for (const draw of run.draws) {
      expect(draw.stage).toBe('option-resolution');
    }

    const drawingStages = new Set(
      run.stages.filter((entry) => entry.draws > 0).map((entry) => entry.stage),
    );
    expect([...drawingStages]).toEqual(['option-resolution']);
  });

  it('consumes no draw in construction, beat entry, scene close or routing', () => {
    const run = playFullRoute();

    const observed = new Set(run.stages.map((entry) => entry.stage));
    for (const name of ['construction', 'beat-entry', 'scene-close', 'routing']) {
      expect(observed.has(name)).toBe(true);
    }

    for (const entry of run.stages) {
      if (entry.stage === 'option-resolution') continue;
      expect(entry, `stage "${entry.stage}" drew no RNG`).toMatchObject({ draws: 0 });
    }

    // Every draw has an attributed stage — an idle draw would be unattributable.
    expect(run.draws.some((draw) => draw.stage === RNG_STAGE_IDLE)).toBe(false);
  });

  it('pure seams — classification, loss application, routing, serialisation — draw nothing', () => {
    const fixture = loadEpisodeFixture();
    const audit: StageAudit[] = [];
    const state = fixture.state;
    const manifest = fixture.manifest;

    const runner = makeRunner(fixture, state, audit);
    const openScene = sceneOf(manifest, 's-i-open');
    const coreScene = sceneOf(manifest, 's-iii-core');
    const context = {
      objectiveMet: true,
      budgetExhausted: false,
      resources: state.resources,
    };

    stage(state, audit, 'outcome-classification', () => {
      evaluateSceneCondition(openScene.objective.check, context);
      classifySceneOutcome(openScene, context);
      // The failure branch is the one that carries the authored loss rule.
      classifySceneOutcome(coreScene, { ...context, objectiveMet: false });
    });

    stage(state, audit, 'loss-application', () => {
      const rule = coreScene.losses?.[0];
      if (rule === undefined) throw new Error('s-iii-core authors no loss rule');
      runner.applyLossRule(rule, state);
    });

    stage(state, audit, 'routing', () => {
      const route = selectRoute({
        scene: openScene,
        outcome: 'success',
        context: { ...context, pendingChain: 'le-i-transmit' },
      });
      resolveRouteTarget(manifest, route.to, 'le-i-transmit');
    });

    const payload = stage(state, audit, 'serialisation', () =>
      serializeRunState(runner.getState()),
    );
    stage(state, audit, 'serialisation', () =>
      deserializeRunState(JSON.parse(JSON.stringify(payload)) as typeof payload),
    );

    expect(state.rngCalls).toBe(0);
    expect(state.rngLedger).toEqual([]);
    for (const entry of audit) expect(entry.draws).toBe(0);
  });
});

// ── No hidden randomness or clock ───────────────────────────

describe('episode runner determinism: no hidden randomness or clock', () => {
  const runnerSource = readFileSync(
    resolve(REPO_ROOT, 'src/story-line/episode-runner.ts'),
    'utf-8',
  );

  it('the runner module never calls Math.random', () => {
    expect(runnerSource).not.toMatch(/Math\s*\.\s*random/);
  });

  it('the runner module never reads a wall clock', () => {
    expect(runnerSource).not.toMatch(/Date\s*\.\s*now/);
    expect(runnerSource).not.toMatch(/new\s+Date\s*\(/);
    expect(runnerSource).not.toMatch(/performance\s*\.\s*now/);
  });

  it('the scene-exit record is exactly the nine §2.3 fields, with no timestamp', () => {
    const run = playFullRoute();

    for (const exit of run.exits) {
      expect(Object.keys(exit)).toEqual([...SCENE_EXIT_FIELDS]);
      expect(Object.keys(exit).filter((key) => /time|stamp|date/i.test(key))).toEqual([]);
      for (const value of Object.values(exit)) {
        if (typeof value === 'number') {
          // Clock ticks are small integers; an epoch-millisecond stamp (≈1e12)
          // would fail here even if it were smuggled in under a benign name.
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeLessThan(1_000_000_000);
        }
      }
    }
  });

  it('every loss-ledger line is timestamp-free and JSON-safe', () => {
    const run = playFullRoute();

    expect(run.ledger.length).toBeGreaterThan(0);
    for (const entry of run.ledger) {
      expect(Object.keys(entry).filter((key) => /time|stamp|date/i.test(key))).toEqual([]);
      expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    }
  });
});

// ── Table order is the only other lever ─────────────────────

describe('episode runner determinism: table order is the only other lever', () => {
  it('reordering two competing routes flips the decision at the same seed', () => {
    const fixture = loadEpisodeFixture();
    const reordered = withSwappedRoutes(fixture.manifest, 's-i-open');

    const original = playScript(COMPETING_ROUTE_SCRIPT);
    const swapped = playScript(COMPETING_ROUTE_SCRIPT, { manifest: reordered });

    // Same seed, same choices, same draws — only the table differs.
    expect(original.draws).toEqual(swapped.draws);
    expect(original.draws.length).toBe(original.choices.length);
    expect(original.state.seed).toBe(swapped.state.seed);

    // First match wins in declaration order, so the win flips.
    expect(original.exits).toHaveLength(1);
    expect(swapped.exits).toHaveLength(1);
    expect(original.exits[0].routeId).toBe('honour-the-door');
    expect(original.exits[0].nextBeat).toBe('le-i-transmit');
    expect(original.state.currentSceneId).toBe('s-i-answer');

    expect(swapped.exits[0].routeId).toBe('quiet-answer');
    expect(swapped.exits[0].nextBeat).toBe('le-i-silent');
    expect(swapped.state.currentSceneId).toBe('s-i-answer');
    expect(swapped.state.currentBeatId).toBe('le-i-silent');

    // The outcome classification itself is unchanged; only the door moved.
    expect(swapped.exits[0].outcome).toBe(original.exits[0].outcome);
    expect(swapped.exits[0].ruleId).toBe(original.exits[0].ruleId);
  });

  it('an unmodified copy reproduces byte-identical records after JSON serialisation', () => {
    const first = playScript(COMPETING_ROUTE_SCRIPT);
    const copy = loadEpisodeFixture().manifest;
    const second = playScript(COMPETING_ROUTE_SCRIPT, { manifest: copy });

    expect(normalise(second.exits)).toBe(normalise(first.exits));
    expect(second.state.currentBeatId).toBe('le-i-transmit');
  });
});
