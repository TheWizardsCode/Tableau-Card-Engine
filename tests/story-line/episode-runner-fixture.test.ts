/**
 * Episode runner acceptance fixture (GDD §2.3).
 *
 * This is the epic's end-to-end proof: the **committed** `long-erasure`
 * manifest and CSV are played through the public runner surface by a
 * scripted-choice driver, with no game module and no rendering involved.
 *
 * - the fixture validates clean through the delivered
 *   `validateEpisodeManifest` with its bound content cards;
 * - four scripted routes reach the four authored endings, each asserted by
 *   ending card id;
 * - one scripted route forces the `s-iii-core` clock cliff — `le-iii-approach`
 *   costs 3 of a 5-tick scene clock, so `le-iii-ahead` (cost 3) is refused —
 *   and the close classifies `failure` (`watch-spent`) and applies the
 *   `hull-sacrificed` loss through `engine.applyResourceDelta`;
 * - the reset ending's restart action returns the run to `manifest.start`
 *   without refunding the hull lost earlier;
 * - every scene exit produced by the four runs names a route and an outcome
 *   rule the manifest declares;
 * - the suite imports the runner and the `@story-line` surface only — its
 *   import graph never enters `example-games/`.
 *
 * The driver deliberately uses only the public runner surface:
 * `enterBeat`, `resolveChoice`, `closeScene`, `routeScene`, `getState`,
 * `getSceneExits`, `getLossLedger`, `getEndingCardId` and `resetRun`.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createEpisodeRunner,
  type ChoiceResolution,
  type EpisodeRunState,
  type EpisodeRunner,
  type SceneCloseResult,
  type SceneExitRecord,
  type SceneRouteResult,
} from '../../src/story-line';
import type { EpisodeManifest, Scene } from '../../src/story-line/content/episode-manifest';
import { validateEpisodeManifest } from '../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_SEED,
  loadEpisodeFixture,
  type EpisodeFixture,
  type VoyageState,
} from './helpers/episode-fixture';

// ── Scripted-choice driver ──────────────────────────────────

/** One scripted decision: enter `beat`, resolve the option labelled `choose`. */
export interface ScriptedStep {
  /** The beat to enter (a beat of the run's current scene). */
  readonly beat: string;
  /** The authored option label to resolve at that beat. */
  readonly choose: string;
}

/** Everything one scripted run produced, read back from the public surface. */
export interface ScriptedRun {
  /** The ending card id the run closed on (`null` while still active). */
  readonly endingCardId: string | null;
  /** Every resolved choice, in play order. */
  readonly choices: readonly ChoiceResolution<ContentCard>[];
  /** Every scene close, in close order. */
  readonly closes: readonly SceneCloseResult[];
  /** Every routed close, in close order. */
  readonly routes: readonly SceneRouteResult<ContentCard>[];
  /** Every scene exit appended by the run, in close order. */
  readonly exits: readonly SceneExitRecord[];
  /** The final run state snapshot. */
  readonly state: EpisodeRunState;
}

/** Builds the runner under test from the committed fixture. */
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
 * Plays a scripted route through the public runner surface.
 *
 * For each step the driver enters the named beat, resolves the option with the
 * authored label, and — whenever the choice closes the scene — closes and
 * routes it before continuing. A run that reaches an ending stops the script;
 * a script with steps left over is a script defect and throws.
 */
function playChoices(
  runner: EpisodeRunner<VoyageState, ContentCard>,
  state: VoyageState,
  steps: readonly ScriptedStep[],
): ScriptedRun {
  const choices: ChoiceResolution<ContentCard>[] = [];
  const closes: SceneCloseResult[] = [];
  const routes: SceneRouteResult<ContentCard>[] = [];

  for (const step of steps) {
    const ending = runner.getEndingCardId();
    if (ending !== null) {
      throw new Error(`script continues after the run reached ending "${ending}"`);
    }

    const entry = runner.enterBeat(step.beat, state);
    if (entry.status !== 'presented') {
      throw new Error(
        `beat "${step.beat}" was refused (${entry.reason}) in scene "${entry.sceneId}"`,
      );
    }

    const option = entry.options.find((candidate) => candidate.label === step.choose);
    if (option === undefined) {
      throw new Error(
        `beat "${step.beat}" presented no option "${step.choose}" (got ${entry.options
          .map((candidate) => candidate.label)
          .join(', ')})`,
      );
    }

    const resolution = runner.resolveChoice(option, state);
    choices.push(resolution);

    if (resolution.next === 'close') {
      const close = runner.closeScene(state);
      closes.push(close);
      routes.push(runner.routeScene(close, state));
    }
  }

  return {
    endingCardId: runner.getEndingCardId(),
    choices,
    closes,
    routes,
    exits: runner.getSceneExits(),
    state: runner.getState(),
  };
}

/** Loads a fresh fixture, builds its runner and plays the scripted route. */
function playRoute(steps: readonly ScriptedStep[]): {
  fixture: EpisodeFixture;
  runner: EpisodeRunner<VoyageState, ContentCard>;
  run: ScriptedRun;
} {
  const fixture = loadEpisodeFixture();
  const runner = makeRunner(fixture);
  return { fixture, runner, run: playChoices(runner, fixture.state, steps) };
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
 * The shared prefix that carries the run from `start` to `s-iii-core` with the
 * ship's charge untouched, so `le-iii-approach`'s charge-2 option is affordable.
 */
const TO_CORE_WITH_CHARGE: readonly ScriptedStep[] = [
  { beat: 'le-i-open', choose: 'Rally the survey crew' },
  { beat: 'le-i-rally', choose: 'Hold the survey line' },
  { beat: 'le-i-transmit', choose: 'Shelter in the dead zone' },
  { beat: 'le-ii-shelter', choose: 'Ration the stores' },
  { beat: 'le-ii-offer', choose: 'Refuse him' },
  { beat: 'le-ii-refuse', choose: 'Side with the captain' },
];

/**
 * The prefix that reaches `s-iii-core` **after losing hull**: stripping the
 * derelict costs 1 hull, so a later reset can prove an irreversible loss is
 * never refunded.
 */
const TO_CORE_WITH_HULL_LOSS: readonly ScriptedStep[] = [
  { beat: 'le-i-open', choose: 'Rally the survey crew' },
  { beat: 'le-i-rally', choose: 'Hold the survey line' },
  { beat: 'le-i-transmit', choose: 'Shelter in the dead zone' },
  { beat: 'le-ii-shelter', choose: 'Strip the derelict' },
  { beat: 'le-ii-salvage', choose: 'Share the berth' },
  { beat: 'le-ii-offer', choose: 'Refuse him' },
  { beat: 'le-ii-refuse', choose: 'Side with the captain' },
];

/** The four scripted ending routes, each ending at the authored ending card. */
const ENDING_ROUTES: readonly {
  readonly endingCardId: string;
  readonly steps: readonly ScriptedStep[];
}[] = [
  {
    endingCardId: 'le-end-abandon',
    steps: [
      { beat: 'le-i-open', choose: 'Log the erasure' },
      { beat: 'le-i-log', choose: 'Transmit the warning' },
      { beat: 'le-i-transmit', choose: 'Shelter in the dead zone' },
      { beat: 'le-ii-shelter', choose: 'Ration the stores' },
      { beat: 'le-ii-offer', choose: 'Abandon the voyage' },
    ],
  },
  {
    endingCardId: 'le-end-quiet',
    steps: [...TO_CORE_WITH_CHARGE, { beat: 'le-iii-approach', choose: 'Unwrite the Loom' }],
  },
  {
    endingCardId: 'le-end-ram',
    steps: [...TO_CORE_WITH_CHARGE, { beat: 'le-iii-approach', choose: 'Ram the core' }],
  },
  {
    endingCardId: 'le-end-reset',
    steps: [...TO_CORE_WITH_HULL_LOSS, { beat: 'le-iii-approach', choose: 'Finish the weave' }],
  },
];

// ── Fixture gate ────────────────────────────────────────────

describe('episode runner acceptance fixture: committed long-erasure manifest', () => {
  it('validates clean through validateEpisodeManifest with its bound content', () => {
    const fixture = loadEpisodeFixture();

    const result = validateEpisodeManifest(
      fixture.manifest,
      fixture.cards,
      fixture.declaredResources,
      fixture.adapter,
    );

    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifestId).toBe('long-erasure');
    expect(result.counts.acts).toBe(3);
  });
});

// ── Four ending routes ──────────────────────────────────────

describe('episode runner acceptance fixture: four ending routes', () => {
  for (const route of ENDING_ROUTES) {
    it(`reaches ${route.endingCardId} by playing the committed fixture`, () => {
      const { fixture, run } = playRoute(route.steps);

      expect(run.endingCardId).toBe(route.endingCardId);
      expect(fixture.manifest.endings).toContain(route.endingCardId);

      // The run really walked scenes: every close has a routed exit, and the
      // ending itself is the presented card of the last routed close.
      expect(run.closes).toHaveLength(run.routes.length);
      expect(run.exits).toHaveLength(run.closes.length);
      const lastRoute = run.routes[run.routes.length - 1];
      expect(lastRoute?.runClosed).toBe(true);
      expect(lastRoute?.endingCard?.id).toBe(route.endingCardId);
      expect(run.state.routeHistory[run.state.routeHistory.length - 1]).toBe(lastRoute?.route.id);
    });
  }

  it('reaches all four endings from the one committed fixture', () => {
    const endings = ENDING_ROUTES.map((route) => playRoute(route.steps).run.endingCardId);

    expect(endings).toEqual(['le-end-abandon', 'le-end-quiet', 'le-end-ram', 'le-end-reset']);
    expect(new Set(endings).size).toBe(4);
  });

  it('restarts a reset-ending run at the manifest start without refunding lost hull', () => {
    const { fixture, runner, run } = playRoute(
      ENDING_ROUTES.find((route) => route.endingCardId === 'le-end-reset')!.steps,
    );

    // The route lost hull to the derelict before it reached the core.
    const startHull = fixture.manifest.resources.start.hull!;
    expect(run.endingCardId).toBe('le-end-reset');
    expect(fixture.state.resources.hull).toBe(startHull - 1);
    expect(run.state.lossLedger.some((entry) => entry.field === 'hull')).toBe(true);

    runner.resetRun();

    const restarted = runner.getState();
    expect(restarted.currentActId).toBe(fixture.manifest.start.act);
    expect(restarted.currentSceneId).toBe(fixture.manifest.start.scene);
    expect(restarted.currentBeatId).toBe(fixture.manifest.start.beat);
    expect(restarted.sceneClockRemaining).toBe(
      sceneOf(fixture, fixture.manifest.start.scene).budget.clock,
    );
    expect(restarted.pendingChain).toBeNull();
    expect(restarted.sceneHistory).toEqual([]);
    expect(restarted.routeHistory).toEqual([]);
    expect(restarted.lossLedger).toEqual([]);
    expect(runner.getSceneExits()).toEqual([]);
    expect(runner.getEndingCardId()).toBeNull();
    expect(runner.getBudgetExhausted()).toBe(false);

    // Resources are the game's state: the restart is not a refund.
    expect(fixture.state.resources.hull).toBe(startHull - 1);
    expect(fixture.state.resources.hull).toBeLessThan(startHull);
  });
});

// ── Forced budget-exhausted close ───────────────────────────

describe('episode runner acceptance fixture: refused close in s-iii-core', () => {
  it('refuses le-iii-ahead, classifies watch-spent failure and applies hull-sacrificed', () => {
    const fixture = loadEpisodeFixture();
    const runner = makeRunner(fixture);
    const state = fixture.state;

    playChoices(runner, state, TO_CORE_WITH_CHARGE);

    // `le-iii-approach` costs 3 of the core's 5 ticks: 2 remain.
    const approach = runner.enterBeat('le-iii-approach', state);
    expect(approach.status).toBe('presented');
    if (approach.status !== 'presented') throw new Error('unreachable');
    expect(approach.clockCost).toBe(3);
    expect(approach.clockRemaining).toBe(2);

    // `le-iii-ahead` costs 3: the scene's deliberate cliff refuses it.
    const refused = runner.enterBeat('le-iii-ahead', state);
    expect(refused.status).toBe('refused');
    if (refused.status !== 'refused') throw new Error('unreachable');
    expect(refused.reason).toBe('budget-exhausted');
    expect(refused.clockCost).toBe(3);
    expect(refused.clockRemaining).toBe(2);
    expect(runner.getBudgetExhausted()).toBe(true);
    expect(runner.getState().currentBeatId).toBe('le-iii-approach');

    const hullBefore = state.resources.hull;
    const deltasBefore = state.appliedDeltas.length;

    const close = runner.closeScene(state);
    expect(close.sceneId).toBe('s-iii-core');
    expect(close.budgetExhausted).toBe(true);
    expect(close.outcome).toBe('failure');
    expect(close.ruleId).toBe('watch-spent');
    expect(close.objectiveMet).toBe(true);

    // Exactly one rule-ledger line, for hull, and exactly one applied delta.
    const hullRuleLines = runner
      .getLossLedger()
      .filter((entry) => entry.kind === 'rule' && entry.field === 'hull');
    expect(hullRuleLines).toHaveLength(1);
    expect(hullRuleLines[0]).toMatchObject({
      kind: 'rule',
      sceneId: 's-iii-core',
      ruleId: 'hull-sacrificed',
      field: 'hull',
      delta: -1,
    });

    const applied = state.appliedDeltas.slice(deltasBefore);
    expect(applied).toHaveLength(1);
    expect(applied[0].delta).toEqual({ hull: -1 });
    expect(state.resources.hull).toBe(hullBefore! - 1);

    // The failure takes the `quiet-core` ending, not the success chain.
    const routed = runner.routeScene(close, state);
    expect(routed.route.id).toBe('quiet-core');
    expect(routed.runClosed).toBe(true);
    expect(runner.getEndingCardId()).toBe('le-end-quiet');
  });
});

// ── Scene-exit integrity across the four runs ───────────────

describe('episode runner acceptance fixture: scene exits', () => {
  it('every exit of the four runs matched a manifest route and outcome rule', () => {
    const notes: string[] = [];

    for (const route of ENDING_ROUTES) {
      const { fixture, run } = playRoute(route.steps);

      expect(run.endingCardId).toBe(route.endingCardId);
      // One exit per scene close; the entry scene is history after its close.
      expect(run.exits).toHaveLength(run.state.sceneHistory.length + 1);
      expect(run.state.routeHistory).toHaveLength(run.exits.length);

      for (const exit of run.exits) {
        const scene = sceneOf(fixture, exit.sceneId);
        const routes = scene.routes ?? [];
        const rules = scene.outcomeRules ?? [];

        const matchedRoute = routes.find((candidate) => candidate.id === exit.routeId);
        const matchedRule = rules.find((candidate) => candidate.id === exit.ruleId);

        if (matchedRoute === undefined) {
          notes.push(`${exit.sceneId}: unknown routeId "${exit.routeId}"`);
        }
        if (matchedRule === undefined) {
          notes.push(`${exit.sceneId}: unknown ruleId "${exit.ruleId}"`);
        }
        expect(exit.routeId).toBeTruthy();
        expect(exit.ruleId).toBeTruthy();
        expect(exit.nextBeat).toBeTruthy();
        expect(matchedRule?.outcome).toBe(exit.outcome);
      }
    }

    expect(notes).toEqual([]);
  });
});

// ── Import boundary ─────────────────────────────────────────

/** Extracts every static `from '<specifier>'` in a module's source. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\bfrom\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/** Resolves a relative specifier from a file, or `null` when it is not relative. */
function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Not this candidate: try the next extension form.
    }
  }
  return null;
}

/** Walks the relative import graph from `root`, returning every file visited. */
function importGraph(root: string): string[] {
  const visited = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiers(readFileSync(file, 'utf-8'))) {
      const resolved = resolveModule(file, specifier);
      if (resolved !== null) queue.push(resolved);
    }
  }
  return [...visited];
}

describe('episode runner acceptance fixture: imports', () => {
  it('imports the runner and @story-line surface only, never a game module', () => {
    const self = fileURLToPath(import.meta.url);
    const graph = importGraph(self);

    expect(graph).toContain(resolve(dirname(self), '../../src/story-line/index.ts'));
    expect(graph.filter((file) => file.includes('/example-games/'))).toEqual([]);
    expect(graph.filter((file) => file.includes('GymLongErasureGame'))).toEqual([]);
    expect(graph.filter((file) => file.includes('/src/story-line/')).length).toBeGreaterThan(0);
  });
});
