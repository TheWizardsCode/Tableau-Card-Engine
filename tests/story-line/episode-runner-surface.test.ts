/**
 * Episode runner public surface (GDD §2.3).
 *
 * This suite pins the runner's **shipped shape** — the slice every later
 * §2.3 feature extends:
 *
 * - every public name (`createEpisodeRunner` and its config / run-state /
 *   ledger / scene-exit types) is reachable through the `@story-line` barrel
 *   and nowhere else is required;
 * - a runner constructed from the committed fixture starts at the manifest's
 *   `start` act / scene / beat, with the entry scene's `budget.clock` loaded,
 *   empty histories and ledger, and the seed it was given;
 * - the module and its transitive imports contain no `phaser` specifier,
 *   asserted over the real import graph rather than by grepping one file;
 * - `SceneExitRecord` is exactly the nine §2.3 step 11 fields — a type-level
 *   assertion fails `npm run build` (`tsc --noEmit`) if a field is added or
 *   removed without `SCENE_EXIT_FIELDS` following;
 * - each constructed runner owns its own run state, and the read accessors
 *   hand out frozen snapshots;
 * - the "Episode runner" documentation section lists the shipped public API
 *   and the nine record fields, so the doc cannot drift from the code.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  LOSS_LEDGER_KINDS,
  SCENE_EXIT_FIELDS,
  createEpisodeRunner,
  type ChainLossLedgerEntry,
  type EpisodeRunState,
  type EpisodeRunner,
  type EpisodeRunnerConfig,
  type LossLedgerEntry,
  type LossLedgerKind,
  type RuleLossLedgerEntry,
  type SceneExitRecord,
} from '../../src/story-line';
import {
  DEFAULT_EPISODE_SEED,
  REPO_ROOT,
  loadEpisodeFixture,
} from './helpers/episode-fixture';

// ── Compile-time helpers ────────────────────────────────────

/**
 * `true` only when `A` and `B` are assignable to each other.
 *
 * Used to pin `SceneExitRecord`'s keys against `SCENE_EXIT_FIELDS`: a field
 * added to the interface alone resolves the type to `never`, which fails the
 * `tsc --noEmit` build.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** One representative entry of each loss-ledger kind. */
type LedgerEntryOfKind<K extends LossLedgerKind> = Extract<LossLedgerEntry, { kind: K }>;

/** One representative record satisfying all nine scene-exit fields. */
const SCENE_EXIT_RECORD: SceneExitRecord = {
  sceneId: 's-i-open',
  objectiveMet: true,
  outcome: 'success',
  ruleId: 'survey-held',
  routeId: 'honour-the-door',
  clockSpent: 2,
  clockRemaining: 0,
  budgetExhausted: false,
  nextBeat: 'le-i-transmit',
};

// ── Import-graph walk ───────────────────────────────────────

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

// ── Documentation section ───────────────────────────────────

const STORY_LINE_DOC = resolve(REPO_ROOT, 'docs/core-engine/story-line.md');

/** Reads the `## Episode runner` section body (up to the next `## ` heading). */
function episodeRunnerDocSection(): string {
  const lines = readFileSync(STORY_LINE_DOC, 'utf-8').split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Episode runner');
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

// ── The suite ───────────────────────────────────────────────

describe('episode runner public surface', () => {
  it('exports the runner and its public types through the @story-line barrel', () => {
    // Runtime surface.
    expect(typeof createEpisodeRunner).toBe('function');
    expect(SCENE_EXIT_FIELDS).toHaveLength(9);
    expect(LOSS_LEDGER_KINDS).toEqual(['chain', 'rule']);

    // Type surface: each is exported from the barrel as a usable (non-`any`)
    // type. `expectTypeOf` is compile-checked by `npm run build`.
    expectTypeOf<EpisodeRunnerConfig>().not.toBeAny();
    expectTypeOf<EpisodeRunState>().not.toBeAny();
    expectTypeOf<LossLedgerEntry>().not.toBeAny();
    expectTypeOf<SceneExitRecord>().not.toBeAny();
    expectTypeOf<EpisodeRunner>().not.toBeAny();
    expectTypeOf<ChainLossLedgerEntry>().not.toBeAny();
    expectTypeOf<RuleLossLedgerEntry>().not.toBeAny();

    // The ledger union discriminates exactly on the two declared kinds.
    expectTypeOf<LedgerEntryOfKind<'chain'>>().toEqualTypeOf<ChainLossLedgerEntry>();
    expectTypeOf<LedgerEntryOfKind<'rule'>>().toEqualTypeOf<RuleLossLedgerEntry>();
    expectTypeOf<LossLedgerKind>().toEqualTypeOf<'chain' | 'rule'>();
  });

  it("constructs run state at the manifest's start from the committed fixture", () => {
    const fixture = loadEpisodeFixture();
    const runner = createEpisodeRunner({
      manifest: fixture.manifest,
      storyline: fixture.storyline,
      content: fixture.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });

    const startScene = fixture.manifest.acts
      .flatMap((act) => act.scenes)
      .find((scene) => scene.id === fixture.manifest.start.scene);
    expect(startScene).toBeDefined();

    const state = runner.getState();
    expect(state.currentActId).toBe(fixture.manifest.start.act);
    expect(state.currentSceneId).toBe(fixture.manifest.start.scene);
    expect(state.currentBeatId).toBe(fixture.manifest.start.beat);
    expect(state.sceneClockRemaining).toBe(startScene!.budget.clock);
    expect(state.pendingChain).toBeNull();
    expect(state.sceneHistory).toEqual([]);
    expect(state.routeHistory).toEqual([]);
    expect(state.lossLedger).toEqual([]);
    expect(state.seed).toBe(DEFAULT_EPISODE_SEED);
    expect(runner.getSceneExits()).toEqual([]);

    // Construction is a read: the fixture's card map and manifest are the
    // runner's own references, never a copy that could drift.
    expect(runner.manifest).toBe(fixture.manifest);
    expect(runner.storyline).toBe(fixture.storyline);
    expect(runner.content).toBe(fixture.cardsById);
  });

  it('hands out frozen snapshots rather than mutable run state', () => {
    const fixture = loadEpisodeFixture();
    const runner = createEpisodeRunner({
      manifest: fixture.manifest,
      storyline: fixture.storyline,
      content: fixture.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });

    const state = runner.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.sceneHistory)).toBe(true);
    expect(Object.isFrozen(state.routeHistory)).toBe(true);
    expect(Object.isFrozen(state.lossLedger)).toBe(true);
    expect(Object.isFrozen(runner.getSceneExits())).toBe(true);

    // A second read is a fresh snapshot: history arrays are never shared.
    expect(runner.getState()).not.toBe(state);
    expect(runner.getState().sceneHistory).not.toBe(state.sceneHistory);

    // Mutating a snapshot cannot change the run.
    const clock = state.sceneClockRemaining;
    const mutable = state as { sceneClockRemaining: number };
    expect(() => {
      mutable.sceneClockRemaining = 0;
    }).toThrow(TypeError);
    expect(runner.getState().sceneClockRemaining).toBe(clock);
  });

  it('builds an independent run state per constructed runner', () => {
    const first = loadEpisodeFixture();
    const second = loadEpisodeFixture();

    const firstRunner = createEpisodeRunner({
      manifest: first.manifest,
      storyline: first.storyline,
      content: first.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });
    const secondRunner = createEpisodeRunner({
      manifest: second.manifest,
      storyline: second.storyline,
      content: second.cardsById,
      seed: DEFAULT_EPISODE_SEED + 1,
    });

    expect(firstRunner.getState()).not.toBe(secondRunner.getState());
    expect(firstRunner.getState().seed).toBe(DEFAULT_EPISODE_SEED);
    expect(secondRunner.getState().seed).toBe(DEFAULT_EPISODE_SEED + 1);
    expect(firstRunner.getState()).toEqual(
      expect.objectContaining({ currentSceneId: secondRunner.getState().currentSceneId }),
    );

    // Two runners over the same fixture share no mutable state either.
    const twinRunner = createEpisodeRunner({
      manifest: first.manifest,
      storyline: first.storyline,
      content: first.cardsById,
      seed: DEFAULT_EPISODE_SEED,
    });
    expect(twinRunner.getState()).toEqual(firstRunner.getState());
    expect(twinRunner.getState()).not.toBe(firstRunner.getState());
  });

  it('reaches no phaser specifier from its transitive import graph', () => {
    const root = resolve(REPO_ROOT, 'src/story-line/episode-runner.ts');
    const graph = importGraph(root);

    // The walk really walked: the barrel's own types module is reachable.
    expect(graph).toContain(resolve(REPO_ROOT, 'src/story-line/types.ts'));
    expect(graph.length).toBeGreaterThan(1);

    const phaserSpecifiers = graph.flatMap((file) =>
      importSpecifiers(readFileSync(file, 'utf-8'))
        .filter((specifier) => specifier === 'phaser' || specifier.startsWith('phaser/'))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(phaserSpecifiers).toEqual([]);
  });

  it('declares exactly the nine §2.3 step 11 scene-exit fields', () => {
    // Compile-time: the interface keys and the tuple members are mutually
    // assignable, so a field added to or removed from either side fails the
    // build. The runtime assertion below consumes the constant so
    // `noUnusedLocals` stays satisfied.
    const fieldsAreExact: MutuallyAssignable<
      keyof SceneExitRecord,
      (typeof SCENE_EXIT_FIELDS)[number]
    > = true;
    expect(fieldsAreExact).toBe(true);

    expect(SCENE_EXIT_FIELDS).toEqual([
      'sceneId',
      'objectiveMet',
      'outcome',
      'ruleId',
      'routeId',
      'clockSpent',
      'clockRemaining',
      'budgetExhausted',
      'nextBeat',
    ]);
    expect(Object.keys(SCENE_EXIT_RECORD)).toHaveLength(9);
    expect([...Object.keys(SCENE_EXIT_RECORD)].sort()).toEqual([...SCENE_EXIT_FIELDS].sort());
  });

  it('documents the public API and the nine record fields under "Episode runner"', () => {
    const section = episodeRunnerDocSection();

    for (const name of [
      'createEpisodeRunner',
      'EpisodeRunnerConfig',
      'EpisodeRunState',
      'LossLedgerEntry',
      'SceneExitRecord',
      'EpisodeRunner',
      'SCENE_EXIT_FIELDS',
      'LOSS_LEDGER_KINDS',
    ]) {
      expect(section).toContain(name);
    }

    for (const field of SCENE_EXIT_FIELDS) {
      expect(section).toContain(field);
    }
  });
});
