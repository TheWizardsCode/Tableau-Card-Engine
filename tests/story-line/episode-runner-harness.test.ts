/**
 * Episode-runner test harness: fixture lane and §2.3 step map.
 *
 * This suite proves the lane every later runner feature builds on:
 *
 * - the committed acceptance fixture binds to the content adapter the manifest
 *   names, and the card map covers exactly the beats and endings the manifest
 *   assigns;
 * - the manifest + shipped CSV validate clean through the delivered
 *   `validateEpisodeManifest`;
 * - the engine-adapter double declares exactly the manifest's key set, starts
 *   from the manifest's start bag, and records every applied delta in order;
 * - the §2.3 step map names every numbered step exactly once, so a later
 *   feature can assert no step is orphaned;
 * - the harness adds no Phaser dependency, asserted over its real import graph
 *   rather than by grepping one file.
 *
 * @module
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateEpisodeManifest } from '../../src/story-line/content/episode-manifest';
import {
  EPISODE_STEPS,
  EPISODE_STEP_IDS,
  REPO_ROOT,
  episodeStep,
  loadEpisodeFixture,
  stepsOwnedBy,
  type EpisodeStepSection,
} from './helpers/episode-fixture';

// ── §2.3 step map expectations ──────────────────────────────

/** Builds the expected step ids for a §2.3 section, inclusive. */
function expectedStepIds(section: EpisodeStepSection, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, index) => `${section}.${from + index}`);
}

/** Every step id GDD §2.3 numbers, in contract order. */
const EXPECTED_STEP_IDS = [
  ...expectedStepIds('A', 1, 3),
  ...expectedStepIds('B', 4, 5),
  ...expectedStepIds('C', 6, 12),
];

/** The one owning suite each §2.3 section maps to. */
const EXPECTED_OWNERS: Readonly<Record<string, string>> = {
  'A.1': 'episode-runner-beat-entry',
  'A.2': 'episode-runner-beat-entry',
  'A.3': 'episode-runner-beat-entry',
  'B.4': 'episode-runner-choice',
  'B.5': 'episode-runner-choice',
  'C.6': 'episode-runner-scene-close',
  'C.7': 'episode-runner-scene-close',
  'C.8': 'episode-runner-scene-close',
  'C.9': 'episode-runner-routing',
  'C.10': 'episode-runner-routing',
  'C.11': 'episode-runner-routing',
  'C.12': 'episode-runner-routing',
};

// ── Import-graph walk ───────────────────────────────────────

const HARNESS_FILE = fileURLToPath(import.meta.url);
const HELPER_FILE = resolve(dirname(HARNESS_FILE), 'helpers/episode-fixture.ts');

/** Extracts every static import/export specifier in a module. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\bfrom\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/** Resolves a relative specifier to a `.ts` file, or `null` when it is not one. */
function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Walks the relative import graph from the roots, returning every file visited. */
function importGraph(roots: readonly string[]): string[] {
  const visited = new Set<string>();
  const queue = [...roots];
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

/** Every specifier reachable from the roots, paired with the file naming it. */
function graphSpecifiers(roots: readonly string[]): { file: string; specifier: string }[] {
  return importGraph(roots).flatMap((file) =>
    importSpecifiers(readFileSync(file, 'utf-8')).map((specifier) => ({ file, specifier })),
  );
}

describe('episode runner harness: fixture lane', () => {
  it('binds the committed manifest to the content adapter and CSV it names', () => {
    const fixture = loadEpisodeFixture();

    expect(fixture.manifest.id).toBe('long-erasure');
    expect(fixture.adapter.gameId).toBe(fixture.manifest.content.adapter);
    expect(fixture.csvPath).toBe(resolve(REPO_ROOT, fixture.manifest.content.file));

    const assigned = new Set<string>([
      ...fixture.manifest.acts.flatMap((act) =>
        act.scenes.flatMap((scene) => scene.beats.map((beat) => beat.cardId)),
      ),
      ...fixture.manifest.endings,
    ]);
    expect([...fixture.cardsById.keys()].sort()).toEqual([...assigned].sort());

    // The storyline is a real system, not a stub: a choice card compiles.
    const entry = fixture.cardsById.get('le-i-open');
    expect(entry).toBeDefined();
    expect(fixture.storyline.getStorylineOptions(entry!)).toHaveLength(2);
    expect(fixture.storyline.engine).toBe(fixture.engine);
  });

  it('validates clean against the shipped content and declared key set', () => {
    const fixture = loadEpisodeFixture();

    const result = validateEpisodeManifest(
      fixture.manifest,
      fixture.cards,
      fixture.declaredResources,
      fixture.adapter,
    );

    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.counts).toEqual({ acts: 3, scenes: 5, beats: 15 });
  });

  it("declares exactly the manifest's resource key set and starts from its start bag", () => {
    const fixture = loadEpisodeFixture();
    const declared = fixture.manifest.resources.declared;

    expect(fixture.engine.resources).toEqual(declared);
    expect(fixture.storyline.resources).toEqual(declared);

    const resources = fixture.engine.getResources(fixture.state);
    expect(Object.keys(resources)).toEqual([...declared]);
    for (const key of declared) {
      expect(resources[key]).toBe(fixture.manifest.resources.start[key]);
    }
  });

  it('records every applied delta in order and never invents a resource', () => {
    const fixture = loadEpisodeFixture();
    const { engine, state } = fixture;

    expect(state.appliedDeltas).toEqual([]);
    engine.applyResourceDelta(state, { hull: -1 });
    engine.applyResourceDelta(state, { morale: -2, stores: 1 });
    engine.applyResourceDelta(state, { notDeclared: 9 });

    expect(state.appliedDeltas.map((entry) => entry.delta)).toEqual([
      { hull: -1 },
      { morale: -2, stores: 1 },
      { notDeclared: 9 },
    ]);
    const start = fixture.manifest.resources.start;
    const afterFirst = { ...start, hull: start.hull - 1 };
    const afterSecond = { ...afterFirst, morale: start.morale - 2, stores: start.stores + 1 };
    expect(state.appliedDeltas.map((entry) => entry.after)).toEqual([
      afterFirst,
      afterSecond,
      afterSecond,
    ]);

    const resources = engine.getResources(state);
    expect(resources.hull).toBe(fixture.manifest.resources.start.hull - 1);
    expect(resources.morale).toBe(fixture.manifest.resources.start.morale - 2);
    expect(resources.stores).toBe(fixture.manifest.resources.start.stores + 1);
    expect('notDeclared' in resources).toBe(false);
  });

  it('exposes the appendLog / getActivityLog seam', () => {
    const fixture = loadEpisodeFixture();

    fixture.engine.appendLog(fixture.state, 'Hull sacrificed (−1 hull)', 'loss');

    expect(fixture.engine.getActivityLog(fixture.state)).toEqual([
      { turn: 1, text: 'Hull sacrificed (−1 hull)', kind: 'loss' },
    ]);
  });

  it('builds a reproducible seeded RNG queue and records each draw', () => {
    const first = loadEpisodeFixture({ seed: 7 });
    const second = loadEpisodeFixture({ seed: 7 });
    const card = first.cardsById.get('le-i-open')!;

    expect(first.state.rngCalls).toBe(0);
    expect(first.engine.rng(first.state)).toBe(second.engine.rng(second.state));
    expect(first.state.rngCalls).toBe(1);
    expect(first.state.rngDraws).toHaveLength(1);

    // An explicit queue entry wins over the seeded draw.
    first.state.rngQueue.unshift(0.25);
    expect(first.engine.rng(first.state)).toBe(0.25);
    expect(first.storyline.eventHasStoryline(card)).toBe(true);
  });
});

describe('episode runner harness: GDD §2.3 step map', () => {
  it('names every numbered step exactly once, in contract order', () => {
    expect(EPISODE_STEP_IDS).toEqual(EXPECTED_STEP_IDS);
    expect(new Set(EPISODE_STEP_IDS).size).toBe(EXPECTED_STEP_IDS.length);
    expect(EPISODE_STEPS.map((step) => step.step)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    for (const step of EPISODE_STEPS) {
      expect(step.id).toBe(`${step.section}.${step.step}`);
      expect(step.contract.length).toBeGreaterThan(0);
    }
    expect(episodeStep('D.13')).toBeUndefined();
    expect(episodeStep('C.12')?.step).toBe(12);
  });

  it('gives each step exactly one owning test suite', () => {
    for (const step of EPISODE_STEPS) {
      expect(step.owningTest).toBe(EXPECTED_OWNERS[step.id]);
    }

    expect(stepsOwnedBy('episode-runner-beat-entry').map((step) => step.id)).toEqual([
      'A.1',
      'A.2',
      'A.3',
    ]);
    expect(stepsOwnedBy('episode-runner-choice').map((step) => step.id)).toEqual(['B.4', 'B.5']);
    expect(stepsOwnedBy('episode-runner-scene-close').map((step) => step.id)).toEqual([
      'C.6',
      'C.7',
      'C.8',
    ]);
    expect(stepsOwnedBy('episode-runner-routing').map((step) => step.id)).toEqual([
      'C.9',
      'C.10',
      'C.11',
      'C.12',
    ]);
    expect(stepsOwnedBy('episode-runner-unowned')).toEqual([]);
  });
});

describe('episode runner harness: import boundary', () => {
  it('adds no Phaser dependency and imports no game module', () => {
    const specifiers = graphSpecifiers([HELPER_FILE, HARNESS_FILE]);

    // The walk actually reached the engine through the helper's imports.
    expect(specifiers.map((entry) => entry.specifier)).toContain('../../../src/story-line');

    const violations = specifiers.filter(
      ({ specifier }) =>
        /phaser/i.test(specifier) || specifier.includes('example-games') || specifier.includes('@ui'),
    );
    expect(violations).toEqual([]);
  });
});
