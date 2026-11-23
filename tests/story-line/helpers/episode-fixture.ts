/**
 * Shared harness for the episode-runner test lane (GDD §2.3).
 *
 * This module is the **single** place the epic's tests obtain their inputs:
 *
 * - {@link loadEpisodeFixture} binds the committed acceptance fixture —
 *   `example-games/gym/content/long-erasure-episode.json` and the CSV its
 *   `content.file` names — through the shipped content adapter, and builds the
 *   one choice model through the public `createStorylineSystem` seam. No game
 *   module is imported and no copy of the manifest is made (the fixture has a
 *   single source of truth, Assumption A3).
 * - {@link createVoyageAdapter} is a headless engine-adapter double over
 *   exactly the manifest's declared resource keys. It records every
 *   `applyResourceDelta` call in order and every `rng` draw, so a test can
 *   assert what the runner applied rather than trusting it.
 * - {@link EPISODE_STEPS} is the GDD §2.3 step map as data: every numbered
 *   step (A.1–A.3, B.4–B.5, C.6–C.12) names exactly one owning test suite, so
 *   a later feature can assert no step is orphaned.
 *
 * Everything here is Phaser-free and imports nothing from `example-games/`
 * other than the committed fixture **files** it reads at runtime.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createStorylineSystem,
  readManifestStartBag,
  type StorylineEngineAdapter,
  type StorylineLogEntry,
  type StorylineResourceKey,
  type StorylineResources,
  type StorylineResourcesDelta,
  type StorylineSystem,
} from '../../../src/story-line';
import { getContentAdapter } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import type { EpisodeManifest } from '../../../src/story-line/content/episode-manifest';
import type { ContentAdapter, ContentCard } from '../../../src/story-line/content/types';

/** Absolute path of the repository root (this file lives three levels down). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Repository-relative path of the committed acceptance fixture manifest. */
export const LONG_ERASURE_MANIFEST_RELATIVE_PATH =
  'example-games/gym/content/long-erasure-episode.json' as const;

/** Absolute path of the committed acceptance fixture manifest. */
export const LONG_ERASURE_MANIFEST_PATH = resolve(REPO_ROOT, LONG_ERASURE_MANIFEST_RELATIVE_PATH);

/** The seed the fixture builds its deterministic RNG queue from by default. */
export const DEFAULT_EPISODE_SEED = 1234;

/** How many seeded draws the fixture queues before falling back to `0.5`. */
export const SEEDED_RNG_DRAWS = 64;

// ── Engine-adapter double ───────────────────────────────────

/** An activity-log line; `kind` mirrors the adapter seam's optional tag. */
export interface VoyageLogEntry extends StorylineLogEntry {
  /** Optional caller tag (`'loss'`, `'scene-exit'`, …), when supplied. */
  readonly kind?: string;
}

/** One recorded `applyResourceDelta` call and the resources it produced. */
export interface AppliedResourceDelta {
  /** The delta exactly as the runner passed it (a defensive copy). */
  readonly delta: Readonly<StorylineResourcesDelta>;
  /** Every declared resource after the delta was applied (a copy). */
  readonly after: Readonly<StorylineResources>;
}

/**
 * The stage label used when the harness is not driving a runner call.
 *
 * The runner itself has no notion of stages — it is one pipeline, not a state
 * machine — so attribution is done by the **harness**: it sets this label
 * around the call it is making, and the double stamps every draw it serves
 * with it. A draw recorded under {@link RNG_STAGE_IDLE} would be a draw the
 * caller cannot attribute, which the determinism suite treats as a failure.
 */
export const RNG_STAGE_IDLE = 'idle';

/** One `engine.rng` call, tagged with the harness stage that caused it. */
export interface RngDrawRecord {
  /** The stage label active when the draw happened. */
  readonly stage: string;
  /** The value the draw returned. */
  readonly value: number;
}

/**
 * The in-memory voyage state the double mutates.
 *
 * Resources start from the manifest's `resources.start` bag (read through the
 * public `readManifestStartBag` seam, never a game-side constant), so a test
 * that mutates state cannot silently disagree with the manifest.
 */
export interface VoyageState {
  /** The seed the RNG queue was generated from. */
  readonly seed: number;
  /** Activity-log turn the next appended line is stamped with. */
  turn: number;
  /** Current values, keyed by the manifest's declared resource keys. */
  resources: Record<StorylineResourceKey, number>;
  /** Append-only activity log, oldest first. */
  activityLog: VoyageLogEntry[];
  /** Chain-card sink (`pushChainCard` writes here). */
  deck: ContentCard[];
  /** Chain-scan location (`getChainScanCards` reads deck + discards). */
  discards: ContentCard[];
  /** Explicit RNG draws, consumed before the seeded fallback. */
  rngQueue: number[];
  /** Every value `engine.rng` returned, in call order. */
  rngDraws: number[];
  /** Every `engine.rng` call, in order, tagged with the active stage. */
  rngLedger: RngDrawRecord[];
  /** The stage label the harness is currently driving. */
  rngStage: string;
  /** Number of `engine.rng` calls (the one-draw-per-selection proof). */
  rngCalls: number;
  /** Every `applyResourceDelta` call, in order. */
  appliedDeltas: AppliedResourceDelta[];
}

/**
 * The engine-adapter double's type.
 *
 * The two optional seam members the double always provides (a declared key
 * set, and the `applyResourceDelta` recorder) are re-declared required so a
 * test never needs a non-null assertion to read the deltas it records.
 */
export interface VoyageEngineAdapter
  extends Omit<StorylineEngineAdapter<VoyageState, ContentCard>, 'applyResourceDelta' | 'resources'> {
  /** Exactly the manifest's declared resource keys, in declaration order. */
  readonly resources: readonly StorylineResourceKey[];
  /** Applies a delta and records it (with the resulting resources) in order. */
  applyResourceDelta(state: VoyageState, delta: StorylineResourcesDelta): void;
}

/** Deterministic generator (mulberry32) used to seed the RNG queue. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a fresh voyage state.
 *
 * The RNG queue is pre-filled with {@link SEEDED_RNG_DRAWS} draws from the
 * supplied seed, so the fixture is deterministic without any test choosing
 * numbers; a test that needs specific values assigns `state.rngQueue`.
 *
 * @param resources The starting resource bag (the manifest's `resources.start`).
 * @param seed      The seed the queue is generated from.
 */
export function createVoyageState(
  resources: StorylineResources,
  seed: number = DEFAULT_EPISODE_SEED,
): VoyageState {
  const next = mulberry32(seed);
  return {
    seed,
    turn: 1,
    resources: { ...resources },
    activityLog: [],
    deck: [],
    discards: [],
    rngQueue: Array.from({ length: SEEDED_RNG_DRAWS }, () => next()),
    rngDraws: [],
    rngLedger: [],
    rngStage: RNG_STAGE_IDLE,
    rngCalls: 0,
    appliedDeltas: [],
  };
}

/**
 * Builds the headless engine-adapter double.
 *
 * Contract, mirroring the shipped adapters:
 * - `resources` is exactly the declared key set it was built with, so
 *   `createStorylineSystem` resolves the same set the manifest declares.
 * - `rng` consumes `state.rngQueue` first (recording each draw, tagged with
 *   `state.rngStage`) and falls back to `0.5`; it never consults `Math.random`.
 * - `applyResourceDelta` applies only declared keys, in declaration order, and
 *   records the call plus the resulting resources — every call, in order.
 * - `applyEffect` is a no-op: Long Erasure cards carry no intrinsic
 *   coin/reputation effect; every mechanic rides on option attributes.
 *
 * @param declaredKeys The manifest's declared resource keys.
 * @param cards        The fixture's card map (`getTemplate` resolves in it).
 */
export function createVoyageAdapter(
  declaredKeys: readonly StorylineResourceKey[],
  cards: ReadonlyMap<string, ContentCard>,
): VoyageEngineAdapter {
  return {
    resources: declaredKeys,
    rng(state) {
      state.rngCalls += 1;
      const value = state.rngQueue.length > 0 ? state.rngQueue.shift()! : 0.5;
      state.rngDraws.push(value);
      state.rngLedger.push({ stage: state.rngStage, value });
      return value;
    },
    applyEffect() {
      // Long Erasure authors no card-level coin/reputation effect.
    },
    applyResourceDelta(state, delta) {
      for (const key of declaredKeys) {
        const value = delta[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          state.resources[key] = (state.resources[key] ?? 0) + value;
        }
      }
      state.appliedDeltas.push({
        delta: { ...delta },
        after: { ...state.resources },
      });
    },
    getResources(state) {
      return state.resources;
    },
    appendLog(state, text, kind) {
      state.activityLog.push(
        kind === undefined ? { turn: state.turn, text } : { turn: state.turn, text, kind },
      );
    },
    getActivityLog(state) {
      return state.activityLog;
    },
    getTemplate(id) {
      return cards.get(id) ?? null;
    },
    getBaseTypeId(id) {
      return id.replace(/-\d+$/, '');
    },
    getChainScanCards(state) {
      return [...state.deck, ...state.discards];
    },
    pushChainCard(state, card) {
      state.deck.push(card);
    },
  };
}

/**
 * Runs `fn` with the double's RNG stage set to `stage`, restoring the previous
 * label afterwards (even when `fn` throws).
 *
 * Every `engine.rng` draw inside `fn` is recorded against `stage`, which is
 * what lets the determinism suite prove that a pipeline call did — or did not —
 * consume the run's one RNG stream.
 *
 * @param state The voyage state whose engine double serves the draws.
 * @param stage The pipeline stage label to attribute the draws to.
 * @param fn    The call being driven.
 * @returns Whatever `fn` returned.
 */
export function withRngStage<T>(state: VoyageState, stage: string, fn: () => T): T {
  const previous = state.rngStage;
  state.rngStage = stage;
  try {
    return fn();
  } finally {
    state.rngStage = previous;
  }
}

// ── Fixture loader ──────────────────────────────────────────

/** Options for {@link loadEpisodeFixture}. */
export interface EpisodeFixtureOptions {
  /** Seed for the double's RNG queue (defaults to {@link DEFAULT_EPISODE_SEED}). */
  readonly seed?: number;
  /** In-memory manifest override (e.g. a mutated copy reordering routes). */
  readonly manifest?: EpisodeManifest;
  /** In-memory card override (defaults to the cards parsed from the CSV). */
  readonly cards?: readonly ContentCard[];
}

/** Everything a runner test needs, all bound to the committed fixture. */
export interface EpisodeFixture {
  /** The parsed manifest (read-only: never a copy of the file's meaning). */
  readonly manifest: EpisodeManifest;
  /** Absolute path of the manifest file that was read. */
  readonly manifestPath: string;
  /** Absolute path of the CSV the manifest's `content.file` names. */
  readonly csvPath: string;
  /** The content adapter the manifest selects (`getContentAdapter`). */
  readonly adapter: ContentAdapter;
  /** Every content card, in file order. */
  readonly cards: readonly ContentCard[];
  /** The cards keyed by card id — the id space beats and endings resolve in. */
  readonly cardsById: ReadonlyMap<string, ContentCard>;
  /** The manifest's declared resource keys, in declaration order. */
  readonly declaredResources: readonly StorylineResourceKey[];
  /** The fresh voyage state (resources at the manifest's `start` bag). */
  readonly state: VoyageState;
  /** The engine-adapter double the storyline system is bound to. */
  readonly engine: VoyageEngineAdapter;
  /** The one choice model, built through the public `createStorylineSystem`. */
  readonly storyline: StorylineSystem<VoyageState, ContentCard>;
}

/** Reads and parses a JSON file. */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
}

/**
 * Loads the committed acceptance fixture.
 *
 * The manifest's `content.adapter` selects the shipped content adapter and its
 * `content.file` names the CSV — the loader derives both from the manifest
 * rather than hard-coding them, so the binding is proved on every run.
 *
 * @param options Optional seed / in-memory overrides.
 * @returns The manifest, its cards keyed by id, and the bound storyline system.
 */
export function loadEpisodeFixture(options: EpisodeFixtureOptions = {}): EpisodeFixture {
  const manifest: EpisodeManifest =
    options.manifest ?? (readJson(LONG_ERASURE_MANIFEST_PATH) as EpisodeManifest);
  const csvPath = resolve(REPO_ROOT, manifest.content.file);

  const adapter = getContentAdapter(manifest.content.adapter);
  if (adapter === undefined) {
    throw new Error(
      `Episode fixture "${manifest.id}" names unknown content adapter "${manifest.content.adapter}".`,
    );
  }

  const cards =
    options.cards ?? cardsFromCsv(parseCsv(readFileSync(csvPath, 'utf-8')), adapter);
  const cardsById = new Map(cards.map((card) => [card.id, card] as const));

  const declaredResources = manifest.resources.declared;
  const startBag = readManifestStartBag(declaredResources, manifest.resources.start);
  if (!startBag.ok) {
    throw new Error(
      `Episode fixture "${manifest.id}" has an unusable resources.start bag: ` +
        startBag.issues.map((issue) => `${issue.reason}:${issue.key}`).join(', '),
    );
  }

  const state = createVoyageState(startBag.bag, options.seed);
  const engine = createVoyageAdapter(declaredResources, cardsById);
  const storyline = createStorylineSystem<VoyageState, ContentCard>({ engine });

  return {
    manifest,
    manifestPath: LONG_ERASURE_MANIFEST_PATH,
    csvPath,
    adapter,
    cards,
    cardsById,
    declaredResources,
    state,
    engine,
    storyline,
  };
}

// ── GDD §2.3 step map ───────────────────────────────────────

/** The §2.3 subsection a step belongs to. */
export type EpisodeStepSection = 'A' | 'B' | 'C';

/** One numbered step of the GDD §2.3 routing contract. */
export interface EpisodeStep {
  /** Step identity as the GDD numbers it (`A.1` … `C.12`). */
  readonly id: string;
  /** The step's ordinal in §2.3 (`A.1` → 1 … `C.12` → 12). */
  readonly step: number;
  /** The §2.3 subsection (`A` beat entry, `B` choice resolution, `C` scene close). */
  readonly section: EpisodeStepSection;
  /** One-line statement of the contract the step imposes. */
  readonly contract: string;
  /**
   * The **one** test suite that owns this step. Later features register their
   * tests against this name; no step may be left with a suite that does not
   * assert it and no step may be claimed by two suites.
   */
  readonly owningTest: string;
}

/**
 * Every numbered step of GDD §2.3, in contract order.
 *
 * A.1–A.3 beat entry, B.4–B.5 choice resolution, C.6–C.12 scene close and
 * routing. The step ordinals are continuous across the sections, which is how
 * the completeness test proves nothing was skipped.
 */
export const EPISODE_STEPS: readonly EpisodeStep[] = [
  {
    id: 'A.1',
    step: 1,
    section: 'A',
    contract: "Read the entered beat's clockCost from the validated manifest.",
    owningTest: 'episode-runner-beat-entry',
  },
  {
    id: 'A.2',
    step: 2,
    section: 'A',
    contract:
      'Refuse a beat whose clockCost exceeds the remaining clock: it is not played, its options are never presented, and the scene closes with reason budget-exhausted.',
    owningTest: 'episode-runner-beat-entry',
  },
  {
    id: 'A.3',
    step: 3,
    section: 'A',
    contract:
      'Otherwise charge the cost, present the card prose and banner, and gate the options with isOptionAffordable — a cost exactly equal to the remaining clock is affordable.',
    owningTest: 'episode-runner-beat-entry',
  },
  {
    id: 'B.4',
    step: 4,
    section: 'B',
    contract: 'Resolve the chosen option through @story-line unchanged (effect, cost, extra, pushedCard, prose, journal, log).',
    owningTest: 'episode-runner-choice',
  },
  {
    id: 'B.5',
    step: 5,
    section: 'B',
    contract:
      'Classify pushedCard: in-scene beat continues the scene; an out-of-scene beat or an ending card closes it with pendingChain set; none closes it with pendingChain null.',
    owningTest: 'episode-runner-choice',
  },
  {
    id: 'C.6',
    step: 6,
    section: 'C',
    contract:
      'Evaluate the objective once against engine.getResources after the resolving choice and record objectiveMet.',
    owningTest: 'episode-runner-scene-close',
  },
  {
    id: 'C.7',
    step: 7,
    section: 'C',
    contract:
      'Classify the outcome first-match-wins in declaration order against post-resolution resources, objectiveMet and budgetExhausted; the last rule is unconditional.',
    owningTest: 'episode-runner-scene-close',
  },
  {
    id: 'C.8',
    step: 8,
    section: 'C',
    contract:
      'Apply the matching losses through engine.applyResourceDelta in declaration order, recording one ledger line and one activity-log line per rule.',
    owningTest: 'episode-runner-scene-close',
  },
  {
    id: 'C.9',
    step: 9,
    section: 'C',
    contract:
      'Select the first route in declaration order matching on/outcome and when, skipping a chain route while pendingChain is null.',
    owningTest: 'episode-runner-routing',
  },
  {
    id: 'C.10',
    step: 10,
    section: 'C',
    contract:
      'Resolve the target: chain → pendingChain; beat → target.beat ?? the scene entryBeat; ending → play the ending card and epilogue and close the run.',
    owningTest: 'episode-runner-routing',
  },
  {
    id: 'C.11',
    step: 11,
    section: 'C',
    contract:
      'Append exactly one scene-exit record with the nine §2.3 fields (sceneId, objectiveMet, outcome, ruleId, routeId, clockSpent, clockRemaining, budgetExhausted, nextBeat).',
    owningTest: 'episode-runner-routing',
  },
  {
    id: 'C.12',
    step: 12,
    section: 'C',
    contract:
      'Enter the target scene: reset sceneClockRemaining to its budget.clock, push the scene id onto the history, clear pendingChain, and never restore irreversible keys.',
    owningTest: 'episode-runner-routing',
  },
];

/** Every step id, in contract order (`A.1` … `C.12`). */
export const EPISODE_STEP_IDS: readonly string[] = EPISODE_STEPS.map((step) => step.id);

/**
 * Looks up a §2.3 step by its id.
 *
 * @param id The step identity (`A.1` … `C.12`).
 * @returns The step, or `undefined` when the id is not part of the contract.
 */
export function episodeStep(id: string): EpisodeStep | undefined {
  return EPISODE_STEPS.find((step) => step.id === id);
}

/**
 * The §2.3 steps one test suite owns, in contract order.
 *
 * @param owningTest The `owningTest` name a suite registers under.
 */
export function stepsOwnedBy(owningTest: string): readonly EpisodeStep[] {
  return EPISODE_STEPS.filter((step) => step.owningTest === owningTest);
}
