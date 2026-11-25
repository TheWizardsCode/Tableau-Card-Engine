/**
 * Scene-space guard: the bounded enumeration and its report
 * (CG-0MWUOELHP003UDUI).
 *
 * This suite is the second slice of the scene-space guard epic
 * (`CG-0MWR0BG9H007AFNU`). It proves the enumeration itself:
 *
 * - the report carries every explored state key, every observed scene exit and
 *   every observed beat refusal, in the shape the invariant children read;
 * - **parity**: driving a real `createEpisodeRunner` over the clean control
 *   fixture's authored routes records the **same** scene exits (scene, winning
 *   rule, outcome, refusal flag) as the enumeration — so a later invariant is
 *   asserting on the runtime's decisions, not on a second copy of them;
 * - both bounds (`maxDepth`, `maxStates`) truncate visibly and make the report
 *   invalid, never a silent pass;
 * - two enumerations of the same inputs serialise byte-identically;
 * - resource arithmetic is the engine's today (unclamped, unbounded
 *   `applyResourceDelta`) — a value is allowed past the manifest's declared
 *   `bounds.max`, and the G4 clamping work (`CG-0MWR0BGVG004UE7X`) is what will
 *   later change that pin.
 *
 * Everything runs through the lane established by the previous child
 * (`scene-guard-fixtures.ts`) and the shared headless adapter double
 * (`../helpers/episode-fixture.ts`): no game module and no Phaser.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  createEpisodeRunner,
  createStorylineSystem,
  type EpisodeRunner,
} from '../../../src/story-line';
import type { EpisodeManifest, Scene } from '../../../src/story-line/content/episode-manifest';
import { DEFAULT_GUARD_MAX_DEPTH, DEFAULT_GUARD_MAX_STATES } from '../../../src/story-line/content/guard';
import {
  DEFAULT_SCENE_GUARD_MAX_DEPTH,
  DEFAULT_SCENE_GUARD_MAX_STATES,
  SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
  enumerateSceneSpace,
  formatSceneGuardReport,
  sceneGuardToJson,
  type SceneGuardReport,
  type SceneGuardSceneExit,
} from '../../../src/story-line/content/scene-guard';
import type { ContentCard } from '../../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_SEED,
  createVoyageAdapter,
  createVoyageState,
  type VoyageState,
} from '../helpers/episode-fixture';
import {
  beatOf,
  loadSceneGuardFixture,
  sceneById,
  type SceneGuardFixture,
} from './scene-guard-fixtures';

// ── Helpers ─────────────────────────────────────────────────

/** A canonical key for one recorded scene exit (for set comparison). */
function exitKey(exit: SceneGuardSceneExit): string {
  return [
    exit.sceneId,
    exit.ruleId,
    exit.outcome,
    String(exit.clockRemaining),
    exit.refusalTriggered ? 'refusal' : 'close',
  ].join('|');
}

/** Sorted keys of every exit in a report (or in a driven list). */
function exitKeys(exits: readonly SceneGuardSceneExit[]): string[] {
  return exits.map(exitKey).sort();
}

/** A manifest copy whose `sg-crossing` objective demands `supply >= 4`. */
function crossingObjectiveAtFour(manifest: EpisodeManifest): EpisodeManifest {
  return {
    ...manifest,
    acts: manifest.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene): Scene =>
        scene.id === 'sg-crossing'
          ? { ...scene, objective: { ...scene.objective, check: { field: 'supply', op: '>=', value: 4 } } }
          : scene,
      ),
    })),
  };
}

/** A manifest copy whose `sg-hall` outcome table classifies a refused beat as `outcome`. */
function hallExhaustedClassifiedAs(
  manifest: EpisodeManifest,
  outcome: 'success' | 'partial' | 'failure',
  ruleId: string,
): EpisodeManifest {
  return {
    ...manifest,
    acts: manifest.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene): Scene => {
        if (scene.id !== 'sg-hall') return scene;
        const withoutBudgetRule = scene.outcomeRules.filter(
          (rule) => rule.when === undefined || !('budget' in rule.when),
        );
        return {
          ...scene,
          outcomeRules: [
            { id: ruleId, when: { budget: 'exhausted' }, outcome },
            ...withoutBudgetRule,
          ],
        };
      }),
    })),
  };
}

/** A minimal one-scene episode whose single beat can never be refused. */
function neverRefusedManifest(): EpisodeManifest {
  return {
    manifestVersion: 1,
    id: 'scene-guard-never-refused',
    title: 'Scene Guard Inline: Never Refused',
    content: { adapter: 'long-erasure', file: 'inline-never-refused.csv' },
    resources: {
      declared: ['hull', 'supply'],
      irreversible: ['hull'],
      start: { hull: 2, supply: 1 },
      bounds: { hull: { min: 0, max: 4 }, supply: { min: 0, max: 3 } },
    },
    start: { act: 'sg-act', scene: 'sg-alone', beat: 'sg-alone-open' },
    endings: ['sg-end-quiet'],
    acts: [
      {
        id: 'sg-act',
        title: 'Alone',
        order: 1,
        entryScene: 'sg-alone',
        scenes: [
          {
            id: 'sg-alone',
            title: 'Alone',
            objective: {
              statement: 'Leave the room with supply still in hand.',
              check: { field: 'supply', op: '>=', value: 1 },
            },
            budget: { clock: 5 },
            entryBeat: 'sg-alone-open',
            beats: [{ cardId: 'sg-alone-open', clockCost: 1 }],
            outcomeRules: [
              { id: 'alone-met', when: { objective: 'met' }, outcome: 'success' },
              { id: 'alone-quiet', outcome: 'partial' },
            ],
            routes: [
              {
                id: 'alone-end',
                on: '*',
                to: { kind: 'ending', cardId: 'sg-end-quiet' },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Minimal inline content cards for {@link neverRefusedManifest}. */
function neverRefusedCards(): ContentCard[] {
  const card = (id: string, options: string): ContentCard => ({
    id,
    name: id,
    effect: '',
    options,
    storylineId: null,
    storylineTitle: null,
    fields: {},
    resourceKeys: ['hull', 'supply'],
  });
  return [card('sg-alone-open', 'Leave|sg-end-quiet'), card('sg-end-quiet', '')];
}

/** A card copy whose `Take the door` option grants `supply: +5`. */
function grantSupplyOnDoor(cards: readonly ContentCard[]): ContentCard[] {
  return cards.map((card): ContentCard =>
    card.id === 'sg-hall-open'
      ? {
          ...card,
          options: card.options.replace(
            'Take the door|sg-crossing-open',
            'Take the door|sg-crossing-open#extra=supply:+5',
          ),
        }
      : card,
  );
}

// ── Runner parity driver ────────────────────────────────────

/** Rebuilds the runner and state around a saved position (a branch fork). */
function forkRunner(
  fixture: SceneGuardFixture,
  runner: EpisodeRunner<VoyageState, ContentCard>,
  state: VoyageState,
): { runner: EpisodeRunner<VoyageState, ContentCard>; state: VoyageState } {
  const engine = createVoyageAdapter(fixture.declaredResources, fixture.cardsById);
  const storyline = createStorylineSystem<VoyageState, ContentCard>({ engine });
  return {
    runner: createEpisodeRunner<VoyageState, ContentCard>({
      manifest: fixture.manifest,
      storyline,
      content: fixture.cardsById,
      restored: runner.serialize(),
    }),
    state: structuredClone(state),
  };
}

/**
 * Drives a real episode runner over every authored route of a fixture and
 * collects the scene exits it records.
 *
 * The walk is exhaustive over the options the runner presents (each branch is
 * forked by restoring the serialised position), so it covers exactly the routes
 * the authored content offers. It is the parity oracle for the enumeration: it
 * reads the runtime's own `getSceneExits()` records, never a re-derivation.
 */
function driveRunner(fixture: SceneGuardFixture): SceneGuardSceneExit[] {
  const exits: SceneGuardSceneExit[] = [];
  const engine = createVoyageAdapter(fixture.declaredResources, fixture.cardsById);
  const storyline = createStorylineSystem<VoyageState, ContentCard>({ engine });
  const runner = createEpisodeRunner<VoyageState, ContentCard>({
    manifest: fixture.manifest,
    storyline,
    content: fixture.cardsById,
    seed: DEFAULT_EPISODE_SEED,
  });
  const state = createVoyageState(fixture.startBag);

  /** Closes the current scene, routes it, and continues or ends the branch. */
  const closeAndRoute = (
    activeRunner: EpisodeRunner<VoyageState, ContentCard>,
    activeState: VoyageState,
    refusedBeatCardId: string | null,
  ): void => {
    const close = activeRunner.closeScene(activeState);
    const route = activeRunner.routeScene(close, activeState);
    exits.push({
      sceneId: route.exit.sceneId,
      ruleId: route.exit.ruleId,
      outcome: route.exit.outcome,
      clockRemaining: route.exit.clockRemaining,
      refusalTriggered: route.exit.budgetExhausted,
      refusedBeatCardId: route.exit.budgetExhausted ? refusedBeatCardId : null,
    });
    if (!route.runClosed) walk(activeRunner, activeState, route.nextBeat);
  };

  /** Enters `beatId`, then either refuses-and-closes or branches on options. */
  const walk = (
    activeRunner: EpisodeRunner<VoyageState, ContentCard>,
    activeState: VoyageState,
    beatId: string,
  ): void => {
    if (exits.length > DEFAULT_GUARD_MAX_DEPTH * 4) {
      throw new Error('runner parity driver exceeded its route bound');
    }
    const entry = activeRunner.enterBeat(beatId, activeState);
    if (entry.status === 'refused') {
      closeAndRoute(activeRunner, activeState, beatId);
      return;
    }
    if (entry.options.length === 0) {
      closeAndRoute(activeRunner, activeState, null);
      return;
    }
    for (const option of entry.options) {
      const branch = forkRunner(fixture, activeRunner, activeState);
      const resolution = branch.runner.resolveChoice(option, branch.state);
      if (resolution.next === 'continue') {
        walk(branch.runner, branch.state, resolution.cardId as string);
      } else {
        closeAndRoute(branch.runner, branch.state, null);
      }
    }
  };

  walk(runner, state, fixture.manifest.start.beat);
  return exits;
}

// ── Report shape ────────────────────────────────────────────

describe('scene-space guard: report shape', () => {
  it('records explored states, scene exits and beat refusals in the AC shape', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.sceneExits)).toBe(true);
    expect(Object.isFrozen(report.beatRefusals)).toBe(true);
    expect(Object.isFrozen(report.exploredStateKeys)).toBe(true);
    expect(report.valid).toBe(true);
    expect(report.exploration.truncated).toBe(false);
    expect(report.exploration.statesVisited).toBe(report.exploredStateKeys.length);
    expect(report.exploredStateKeys.length).toBeGreaterThan(0);

    // Every exit carries exactly the fields the invariants read.
    expect(report.sceneExits.length).toBeGreaterThan(0);
    for (const exit of report.sceneExits) {
      expect(Object.keys(exit).sort()).toEqual([
        'clockRemaining',
        'outcome',
        'refusalTriggered',
        'refusedBeatCardId',
        'ruleId',
        'sceneId',
      ]);
    }

    // Every refusal carries exactly the fields the invariants read.
    expect(report.beatRefusals.length).toBeGreaterThan(0);
    for (const refusal of report.beatRefusals) {
      expect(Object.keys(refusal).sort()).toEqual([
        'beatCardId',
        'clockCost',
        'clockRemaining',
        'sceneId',
      ]);
    }
  });

  it('reports the clean fixture’s exact refusal and both close classes', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);

    // `sg-hall-wait` costs 3 and is entered with 2 of the hall's 3 ticks left.
    expect(report.beatRefusals).toEqual([
      { sceneId: 'sg-hall', beatCardId: 'sg-hall-wait', clockCost: 3, clockRemaining: 2 },
    ]);
    expect(beatOf(sceneById(fixture.manifest, 'sg-hall'), 'sg-hall-wait').clockCost).toBe(3);

    // A met objective closes `success` without a refusal…
    expect(report.sceneExits).toContainEqual({
      sceneId: 'sg-hall',
      ruleId: 'hall-held',
      outcome: 'success',
      clockRemaining: 2,
      refusalTriggered: false,
      refusedBeatCardId: null,
    });
    // …and the refused beat closes `failure` with the refusal flag set.
    expect(report.sceneExits).toContainEqual({
      sceneId: 'sg-hall',
      ruleId: 'hall-spent',
      outcome: 'failure',
      clockRemaining: 2,
      refusalTriggered: true,
      refusedBeatCardId: 'sg-hall-wait',
    });
  });

  it('records the exact scene exit each control fixture was authored for', () => {
    for (const name of ['exhausted-success', 'refusal-strand'] as const) {
      const fixture = loadSceneGuardFixture(name);
      const report = enumerateSceneSpace(fixture.manifest, fixture.cards);
      for (const violation of fixture.expectedViolations) {
        const matching = report.sceneExits.filter(
          (exit) =>
            exit.sceneId === violation.sceneId &&
            exit.ruleId === violation.winningRuleId &&
            exit.refusalTriggered,
        );
        expect(
          matching.length,
          `"${name}" must enumerate a refusal-triggered close of ${violation.sceneId} ` +
            `classified by ${violation.winningRuleId}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ── Invariant: no exhausted close classifies success ────────

describe('scene-space guard: no-success-on-exhausted-close', () => {
  it('reports the invariant with checked and violation counts', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);

    expect(report.invariants).toEqual([
      {
        invariant: SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
        checked: 1,
        violations: 0,
      },
    ]);
    expect(Object.keys(report.invariants[0]).sort()).toEqual([
      'checked',
      'invariant',
      'violations',
    ]);
  });

  it('fails the exhausted-success control, naming its recorded scene, beat, rule and outcome', () => {
    const fixture = loadSceneGuardFixture('exhausted-success');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);
    const expected = fixture.expectedViolations[0];

    expect(report.valid).toBe(false);
    expect(report.violations).toHaveLength(1);
    // The control fixture violates this invariant and only this one.
    expect(report.violations.every((violation) => violation.invariant === expected.invariant)).toBe(
      true,
    );
    expect(report.invariants).toEqual([
      { invariant: expected.invariant, checked: 1, violations: 1 },
    ]);

    const [violation] = report.violations;
    expect(Object.keys(violation).sort()).toEqual([
      'cardId',
      'invariant',
      'message',
      'outcome',
      'ruleId',
      'sceneId',
    ]);
    expect(violation).toMatchObject({
      invariant: SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
      sceneId: expected.sceneId,
      cardId: expected.refusedBeatCardId,
      ruleId: expected.winningRuleId,
      outcome: 'success',
    });
    expect(violation.message).toContain(expected.sceneId);
    expect(violation.message).toContain(expected.refusedBeatCardId);
    expect(violation.message).toContain(expected.winningRuleId);

    // The refusal record the violation names is the exit's own refused beat.
    const exhaustedSuccess = report.sceneExits.find(
      (exit) => exit.refusalTriggered && exit.outcome === 'success',
    );
    expect(exhaustedSuccess?.refusedBeatCardId).toBe(expected.refusedBeatCardId);
  });

  it('passes the clean control, whose exhausted close is classified failure', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);

    const exhausted = report.sceneExits.filter((exit) => exit.refusalTriggered);
    expect(exhausted).toHaveLength(1);
    expect(exhausted[0].outcome).toBe('failure');
    expect(report.violations).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it.each([
    { outcome: 'partial' as const, ruleId: 'hall-exhausted-partial' },
    { outcome: 'failure' as const, ruleId: 'hall-exhausted-failure' },
  ])(
    'does not flag an exhausted close classified $outcome',
    ({ outcome, ruleId }) => {
      const fixture = loadSceneGuardFixture('exhausted-success');
      const manifest = hallExhaustedClassifiedAs(fixture.manifest, outcome, ruleId);
      const report = enumerateSceneSpace(manifest, fixture.cards);

      expect(report.violations).toEqual([]);
      expect(report.invariants[0]).toEqual({
        invariant: SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
        checked: 1,
        violations: 0,
      });
      expect(report.valid).toBe(true);
      expect(report.sceneExits).toContainEqual(
        expect.objectContaining({ ruleId, outcome, refusalTriggered: true }),
      );
    },
  );

  it('does not flag a success close that follows a paid beat rather than a refusal', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);

    const paidSuccess = report.sceneExits.filter(
      (exit) => exit.outcome === 'success' && !exit.refusalTriggered,
    );
    expect(paidSuccess.length).toBeGreaterThan(0);
    expect(paidSuccess.every((exit) => exit.refusedBeatCardId === null)).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('reports nothing for a scene space with no refusals at all', () => {
    const manifest = neverRefusedManifest();
    const report = enumerateSceneSpace(manifest, neverRefusedCards());

    expect(report.beatRefusals).toEqual([]);
    expect(report.violations).toEqual([]);
    expect(report.invariants).toEqual([
      { invariant: SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE, checked: 0, violations: 0 },
    ]);
    expect(report.valid).toBe(true);
  });

  it('renders the invariant line in the human report', () => {
    const clean = formatSceneGuardReport(
      enumerateSceneSpace(loadSceneGuardFixture('clean').manifest, loadSceneGuardFixture('clean').cards),
    );
    expect(clean).toContain('✓ no-success-on-exhausted-close: 1 checked, 0 violations');

    const exhaustFixture = loadSceneGuardFixture('exhausted-success');
    const exhaust = formatSceneGuardReport(
      enumerateSceneSpace(exhaustFixture.manifest, exhaustFixture.cards),
    );
    expect(exhaust).toContain('✗ no-success-on-exhausted-close: 1 checked, 1 violation');
    expect(exhaust).toContain('FAIL');
  });
});

// ── Runner parity ───────────────────────────────────────────

describe('scene-space guard: runner parity', () => {
  it('records the same scene exits as a real runner along the clean routes', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);

    const driven = driveRunner(fixture);
    expect(driven.length).toBeGreaterThan(0);

    // Deduplicate: two authored routes may reach the same close.
    const drivenKeys = [...new Set(exitKeys(driven))];
    const guardKeys = [...new Set(exitKeys(report.sceneExits))];

    expect(guardKeys).toEqual(drivenKeys);
  });

  it('matches the runtime on the refused beat’s close, not just on the happy path', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);
    const driven = driveRunner(fixture);

    const refusedByRuntime = driven.filter((exit) => exit.refusalTriggered);
    const refusedByGuard = report.sceneExits.filter((exit) => exit.refusalTriggered);

    expect(refusedByRuntime.length).toBeGreaterThan(0);
    expect(exitKeys(refusedByGuard)).toEqual([...new Set(exitKeys(refusedByRuntime))]);
  });
});

// ── Bounds and truncation ───────────────────────────────────

describe('scene-space guard: bounds', () => {
  it('defaults to the CSV guard’s bounds', () => {
    expect(DEFAULT_SCENE_GUARD_MAX_DEPTH).toBe(DEFAULT_GUARD_MAX_DEPTH);
    expect(DEFAULT_SCENE_GUARD_MAX_STATES).toBe(DEFAULT_GUARD_MAX_STATES);

    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);
    expect(report.maxDepth).toBe(DEFAULT_GUARD_MAX_DEPTH);
    expect(report.maxStates).toBe(DEFAULT_GUARD_MAX_STATES);
  });

  it('reports a state-bound hit as truncation and invalidates the report', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards, { maxStates: 1 });

    expect(report.exploration.truncated).toBe(true);
    expect(report.valid).toBe(false);
    expect(report.exploredStateKeys.length).toBe(1);
  });

  it('reports a depth-bound hit as truncation and invalidates the report', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards, { maxDepth: 1 });

    expect(report.exploration.truncated).toBe(true);
    expect(report.valid).toBe(false);
  });

  it('fails the human report when truncated, and passes a clean run', () => {
    const fixture = loadSceneGuardFixture('clean');
    const clean = formatSceneGuardReport(enumerateSceneSpace(fixture.manifest, fixture.cards));
    expect(clean).toContain('PASS');
    expect(clean).not.toContain('truncated');

    const truncated = formatSceneGuardReport(
      enumerateSceneSpace(fixture.manifest, fixture.cards, { maxStates: 1 }),
    );
    expect(truncated).toContain('FAIL');
    expect(truncated).toContain('truncated');
  });
});

// ── Determinism ─────────────────────────────────────────────

describe('scene-space guard: determinism', () => {
  it('serialises two enumerations of the same inputs byte-identically', () => {
    const fixture = loadSceneGuardFixture('clean');
    const first = sceneGuardToJson(enumerateSceneSpace(fixture.manifest, fixture.cards));
    const second = sceneGuardToJson(enumerateSceneSpace(fixture.manifest, fixture.cards));
    expect(second).toBe(first);

    // The explored state keys are emitted in a fixed (sorted) order.
    const report: SceneGuardReport = enumerateSceneSpace(fixture.manifest, fixture.cards);
    expect([...report.exploredStateKeys]).toEqual([...report.exploredStateKeys].sort());
  });

  it('keys a state by scene, beat, clock, chain and the declared bag', () => {
    const fixture = loadSceneGuardFixture('clean');
    const report = enumerateSceneSpace(fixture.manifest, fixture.cards);
    for (const key of report.exploredStateKeys) {
      const parts = key.split('|');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toMatch(/^sg-[a-z]+$/);
      expect(parts[1]).toMatch(/^sg-[a-z-]+$/);
      expect(parts[2]).toMatch(/^clock=\d+$/);
      expect(parts[3]).toMatch(/^chain=(?:-|sg-[a-z-]+)$/);
      expect(parts[4]).toMatch(/^hull=-?\d+,supply=-?\d+$/);
    }
  });
});

// ── Unclamped arithmetic pin (G4 boundary) ──────────────────

describe('scene-space guard: resource arithmetic', () => {
  it('applies an option’s extra effect unclamped and unbounded', () => {
    const fixture = loadSceneGuardFixture('clean');
    // `bounds.supply.max` is 3. The door grants +5 (start supply 1 → 6) and the
    // crossing objective demands 4: only unclamped arithmetic meets it. When
    // G4 (`CG-0MWR0BGVG004UE7X`) adds clamping this assertion is what changes.
    const manifest = crossingObjectiveAtFour(fixture.manifest);
    const cards = grantSupplyOnDoor(fixture.cards);
    expect(fixture.manifest.resources.bounds.supply.max).toBe(3);
    expect(manifest.acts[0].scenes.find((scene) => scene.id === 'sg-crossing')?.objective.check)
      .toEqual({ field: 'supply', op: '>=', value: 4 });

    const report = enumerateSceneSpace(manifest, cards);

    expect(report.sceneExits).toContainEqual({
      sceneId: 'sg-crossing',
      ruleId: 'crossing-met',
      outcome: 'success',
      clockRemaining: 1,
      refusalTriggered: false,
      refusedBeatCardId: null,
    });
    // A clamped engine (supply capped at 3) would classify `crossing-quiet`.
    expect(report.sceneExits.some((exit) => exit.ruleId === 'crossing-quiet')).toBe(false);
  });
});
