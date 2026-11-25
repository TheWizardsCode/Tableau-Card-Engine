/**
 * Scene-space guard: bounded enumeration of an episode's scene space.
 *
 * The authored-content route-space guard ([`./guard.ts`](./guard.ts)) walks the
 * **card chain** over the declared resources. It has no manifest input, so it
 * cannot see a scene boundary, the scene clock or an outcome table — and the
 * clock is deliberately **not** a declared resource, so a budget exhaustion is
 * invisible to it.
 *
 * This module is the other half: it walks the runtime's own scene / beat /
 * close / routing transitions over a validated {@link EpisodeManifest} and its
 * content cards, recording every scene exit and every beat refusal inside the
 * same `maxDepth` / `maxStates` bounds the CSV guard uses. It reproduces the
 * runtime's decisions by **delegating** them — outcome and route precedence are
 * never re-derived here:
 *
 * | Decision | Delegate |
 * |---|---|
 * | the close objective and every scene `when` gate (`objective`, `budget`, raw resource checks) | `evaluateSceneCondition` |
 * | the winning outcome rule (first match, declaration order) | `classifySceneOutcome` |
 * | the winning route (`on`, `when`, chain-skip) | `selectRoute` |
 * | the next beat / ending | `resolveRouteTarget` |
 * | whether an option is presented at all | `isOptionAffordable` |
 *
 * ## The state tuple
 *
 * One state is `(sceneId, beatId, clockRemaining, pendingChain, bag)` — the
 * beat the run is about to enter, the scene clock left, the chain a resolved
 * choice pushed, and the declared resource bag. The clock is reset on scene
 * entry and the pending chain is cleared, exactly as `createEpisodeRunner`
 * does (GDD §2.3 step 12).
 *
 * Each explored state is expanded once:
 *
 * 1. **Beat entry.** A beat whose `clockCost` exceeds `clockRemaining` is
 *    recorded as a **refusal**; that refusal is the scene-close trigger
 *    (`budgetExhausted`), and the close + routing step follows immediately, so
 *    the refusal's continuation is part of the same enumeration. Otherwise the
 *    cost is charged.
 * 2. **Choice resolution.** Every *affordable* compiled option is taken: its
 *    cost is paid, its extra effect is applied, and the card it pushes decides
 *    the next step (`null` → close; an in-scene beat → continue; an
 *    out-of-scene beat or a declared ending → close with that pending chain).
 *    The successor follows `resolveStorylineOption`'s declarative precedence —
 *    first matching `conditionalSuccessors` rule, then the candidate set, then
 *    the single `successorId`. A candidate set **branches exhaustively** rather
 *    than drawing the RNG, which is what keeps the enumeration deterministic
 *    (no RNG draw means no seed to reproduce). A programmatic
 *    `successorResolver` is a runtime callback outside the content model and is
 *    never consulted, matching the CSV guard's structural model.
 * 3. **Scene close.** The objective is evaluated once against the
 *    post-resolution bag (the same snapshot feeds every raw condition), the
 *    outcome table classifies first-match-wins, and every matching `losses[]`
 *    rule applies in declaration order through the same declared-delta
 *    selection the engine uses. The route gate then reads the **post-loss**
 *    bag, exactly as the runner does (GDD §2.3 steps C.6–C.9).
 * 4. **Routing.** The winning route resolves to the next beat (scene clock
 *    reset, chain cleared) or an ending (the branch stops).
 *
 * ## Invariants
 *
 * The report carries `invariants` (one `checked` / `violations` accounting per
 * invariant) and the `violations` themselves, derived from the same scene-exit
 * records the enumeration produces — no second traversal. The first invariant
 * is `no-success-on-exhausted-close`: a close triggered by a refused beat must
 * not be classified `success`, because that silently truncates the player's run
 * behind a success banner. `partial` and `failure` remain legitimate
 * classifications of an exhausted close, and a `success` close that follows a
 * paid beat is not a refusal.
 *
 * ## Resource arithmetic is the engine's today
 *
 * Every cost / extra effect / loss is applied **unclamped and unbounded**
 * through the same declared-delta selection the runtime's
 * `applyResourceDelta` seam receives: a value may fall below `bounds.min` or
 * rise above `bounds.max`, and an undeclared key is ignored, an irreversible
 * grant refused. The G4 clamping work (`CG-0MWR0BGVG004UE7X`) is what will
 * later change this arithmetic — a unit test pins the current unclamped
 * behaviour so that change is a deliberate, visible assertion flip.
 *
 * ## Bounds and determinism
 *
 * `maxDepth` bounds the transitions along one route (beat and scene entries)
 * and `maxStates` the examined states; both default to the CSV guard's values. A bound hit is
 * reported as `exploration.truncated` and makes the report **invalid** — the
 * enumeration never claims a scene space it could not check. Nothing reads the
 * wall clock, the RNG or any ambient state, explored state keys are emitted in
 * a fixed order and the JSON key order is the interface's, so two enumerations
 * of the same inputs serialise byte-identically.
 *
 * Nothing here imports a game module or Phaser, and nothing here mutates the
 * manifest or the cards it reads.
 *
 * @module
 */

import {
  classifySceneOutcome,
  evaluateSceneCondition,
  resolveRouteTarget,
  selectRoute,
} from '../episode-runner';
import { isOptionAffordable } from '../compile';
import { evaluateCondition } from '../resolve';
import {
  readManifestStartBag,
  readResource,
  selectDeclaredDelta,
  type StorylineResourceKey,
  type StorylineResources,
} from '../resources';
import type { StorylineOption } from '../types';
import { getContentAdapter } from './adapters';
import { compileContentOptions, optionSuccessorIds } from './csv';
import type { EpisodeManifest, Scene, SceneOutcome } from './episode-manifest';
import { DEFAULT_GUARD_MAX_DEPTH, DEFAULT_GUARD_MAX_STATES } from './guard';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';

/**
 * Default bound on the transitions along one route — beat entries and scene
 * entries alike (the CSV guard's own depth bound).
 */
export const DEFAULT_SCENE_GUARD_MAX_DEPTH = DEFAULT_GUARD_MAX_DEPTH;

/** Default bound on the examined states (the CSV guard's). */
export const DEFAULT_SCENE_GUARD_MAX_STATES = DEFAULT_GUARD_MAX_STATES;

/**
 * The invariant id: no exhausted close may be classified `success`.
 *
 * A beat that cannot be paid is not entered; the scene closes and its outcome
 * table classifies the close. If that table labels the exhausted close
 * `success`, the player's run is silently truncated with a success banner — the
 * invariant this guard reports on. The name is the parent epic's vocabulary and
 * the control-fixture lane's recorded intent. `partial` and `failure` are
 * legitimate classifications, so only `success` is a violation.
 */
export const SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE =
  'no-success-on-exhausted-close' as const;

/** The invariant identity a {@link SceneGuardViolation} belongs to. */
export type SceneGuardInvariantName =
  | typeof SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE;

/** One observed scene exit, in close order. */
export interface SceneGuardSceneExit {
  /** The scene that closed. */
  readonly sceneId: string;
  /** The `outcomeRules[].id` that classified the close (the winning rule). */
  readonly ruleId: string;
  /** The outcome that rule assigned. */
  readonly outcome: SceneOutcome;
  /** Clock ticks left when the scene closed. */
  readonly clockRemaining: number;
  /** Whether the close was triggered by a refused beat entry. */
  readonly refusalTriggered: boolean;
  /**
   * The refused beat's card id when {@link refusalTriggered}, else `null`.
   * Carried on the exit so a violation can name the exact beat whose entry the
   * clock could not pay for, without matching a second traversal.
   */
  readonly refusedBeatCardId: string | null;
}

/**
 * One invariant finding, in the CSV guard's violation JSON shape.
 *
 * The required fields mirror `ContentGuardViolation` (`invariant`, `cardId`,
 * `message`); the scene facts the invariant names are added alongside, so a
 * consumer of the CSV shape reads the same keys and a scene guard can point at
 * the exit that broke the rule.
 */
export interface SceneGuardViolation {
  /** The invariant the fault breaks. */
  readonly invariant: SceneGuardInvariantName;
  /** The refused beat's content card id (the CSV guard's `cardId` field). */
  readonly cardId: string;
  /** The scene that closed on the refusal. */
  readonly sceneId: string;
  /** The `outcomeRules[].id` that mislabelled the exhausted close. */
  readonly ruleId: string;
  /** The outcome that rule assigned (`success`, the mislabel). */
  readonly outcome: SceneOutcome;
  /** Human-readable explanation naming the scene, beat and winning rule. */
  readonly message: string;
}

/**
 * Per-invariant accounting, in the shape the CSV guard's human report prints
 * per invariant (`✓ name: N checked, M …`).
 */
export interface SceneGuardInvariantSummary {
  /** The invariant identity. */
  readonly invariant: SceneGuardInvariantName;
  /** How many scene exits the invariant examined. */
  readonly checked: number;
  /** How many of those exited the invariant. */
  readonly violations: number;
}

/** One observed beat refusal (the scene-close trigger). */
export interface SceneGuardBeatRefusal {
  /** The scene whose beat was refused. */
  readonly sceneId: string;
  /** The refused beat's content card id. */
  readonly beatCardId: string;
  /** The clock cost the beat asked for. */
  readonly clockCost: number;
  /** The clock left when the entry was attempted. */
  readonly clockRemaining: number;
}

/** One close + routing transition, resolved from the delegated helpers. */
interface CloseTransition {
  /** The exit record to observe. */
  readonly exit: SceneGuardSceneExit;
  /** The next state's scene / beat, or `null` when the route opened an ending. */
  readonly next: { readonly sceneId: string; readonly beatId: string } | null;
  /** The bag after the close's matching `losses[]` rules applied. */
  readonly bag: StorylineResources;
}

/** The report's route-space accounting. */
export interface SceneGuardExploration {
  /** Distinct `(scene, beat, clock, chain, bag)` states explored. */
  readonly statesVisited: number;
  /** True when a depth/state bound cut the enumeration short. */
  readonly truncated: boolean;
}

/** The scene-space enumeration's report (frozen and JSON-safe). */
export interface SceneGuardReport {
  /** True when both bounds held and no invariant is violated. */
  readonly valid: boolean;
  /** The episode id the enumeration walked (provenance in JSON reports). */
  readonly episodeId: string;
  /** The effective state bound. */
  readonly maxStates: number;
  /** The effective per-route transition bound. */
  readonly maxDepth: number;
  /** Every explored state key, in a fixed (sorted) order. */
  readonly exploredStateKeys: readonly string[];
  /** Every observed scene exit, in first-observed order. */
  readonly sceneExits: readonly SceneGuardSceneExit[];
  /** Every observed beat refusal, in first-observed order. */
  readonly beatRefusals: readonly SceneGuardBeatRefusal[];
  /** Every invariant with its checked / violation counts. */
  readonly invariants: readonly SceneGuardInvariantSummary[];
  /** Every invariant violation, in observed-exit order. */
  readonly violations: readonly SceneGuardViolation[];
  /** The route-space exploration accounting. */
  readonly exploration: SceneGuardExploration;
}

/** Options for {@link enumerateSceneSpace}. */
export interface SceneGuardOptions {
  /** Bound on the transitions along one route (default {@link DEFAULT_SCENE_GUARD_MAX_DEPTH}). */
  readonly maxDepth?: number;
  /** Bound on the examined states (default {@link DEFAULT_SCENE_GUARD_MAX_STATES}). */
  readonly maxStates?: number;
  /**
   * The content adapter whose `baseId` rule normalises successor ids. Defaults
   * to the adapter the manifest's `content.adapter` names, so a caller rarely
   * needs to pass one.
   */
  readonly adapter?: ContentAdapter;
}

/** One enumerated state: the run is about to enter `beatId` in `sceneId`. */
interface SceneState {
  readonly sceneId: string;
  readonly beatId: string;
  readonly clockRemaining: number;
  readonly pendingChain: string | null;
  readonly bag: StorylineResources;
}

/** The manifest's compiled model, built once and reused for every branch. */
interface EpisodeModel {
  readonly manifest: EpisodeManifest;
  readonly adapter: ContentAdapter;
  /** scene id → the scene (all acts, declaration order). */
  readonly scenes: ReadonlyMap<string, Scene>;
  /** beat card id → the scene that assigns it. */
  readonly assignedScene: ReadonlyMap<string, string>;
  readonly endings: ReadonlySet<string>;
  readonly declared: readonly StorylineResourceKey[];
  readonly irreversible: readonly StorylineResourceKey[];
  /** beat card id → its compiled options, in authored order. */
  readonly options: ReadonlyMap<string, readonly StorylineOption<unknown>[]>;
  readonly startBag: StorylineResources;
}

/** Resolves the manifest's content adapter, loudly. */
function resolveAdapter(manifest: EpisodeManifest, override?: ContentAdapter): ContentAdapter {
  if (override !== undefined) return override;
  const adapter = getContentAdapter(manifest.content.adapter);
  if (adapter === undefined) {
    throw new Error(
      `Scene guard: manifest "${manifest.id}" names unknown content adapter ` +
        `"${manifest.content.adapter}". Register the adapter or pass { adapter } to ` +
        'enumerateSceneSpace.',
    );
  }
  return adapter;
}

/** Builds the manifest-wide model once, so every branch reuses it. */
function buildModel(manifest: EpisodeManifest, cards: readonly ContentCard[], adapter: ContentAdapter): EpisodeModel {
  const scenes = new Map<string, Scene>();
  const assignedScene = new Map<string, string>();
  const options = new Map<string, readonly StorylineOption<unknown>[]>();

  for (const act of manifest.acts) {
    for (const scene of act.scenes) {
      scenes.set(scene.id, scene);
      for (const beat of scene.beats) assignedScene.set(beat.cardId, scene.id);
    }
  }

  for (const card of cards) {
    let compiled: StorylineOption<unknown>[];
    try {
      compiled = compileContentOptions(card);
    } catch (error) {
      throw new Error(
        `Scene guard: card "${card.id}" has an unparseable options column: ` +
          `${(error as Error).message}`,
      );
    }
    options.set(card.id, compiled);
  }

  const declared = manifest.resources.declared;
  const startBag = readManifestStartBag(declared, manifest.resources.start);
  if (!startBag.ok) {
    throw new Error(
      `Scene guard: manifest "${manifest.id}" has an unusable resources.start bag: ` +
        startBag.issues.map((issue) => `${issue.reason}:${issue.key}`).join(', '),
    );
  }

  return {
    manifest,
    adapter,
    scenes,
    assignedScene,
    endings: new Set(manifest.endings),
    declared,
    irreversible: manifest.resources.irreversible,
    options,
    startBag: startBag.bag,
  };
}

/** A deterministic key for one explored state. */
function stateKey(state: SceneState, declared: readonly StorylineResourceKey[]): string {
  const bag = declared.map((key) => `${key}=${readResource(state.bag, key)}`).join(',');
  const chain = state.pendingChain === null ? '-' : state.pendingChain;
  return `${state.sceneId}|${state.beatId}|clock=${state.clockRemaining}|chain=${chain}|${bag}`;
}

/** A deterministic key for one observed exit (for de-duplication). */
function exitKey(exit: SceneGuardSceneExit): string {
  return [
    exit.sceneId,
    exit.ruleId,
    exit.outcome,
    String(exit.clockRemaining),
    exit.refusalTriggered ? 'refusal' : 'close',
    exit.refusedBeatCardId ?? '-',
  ].join('|');
}

/** A deterministic key for one observed refusal (for de-duplication). */
function refusalKey(refusal: SceneGuardBeatRefusal): string {
  return [
    refusal.sceneId,
    refusal.beatCardId,
    String(refusal.clockCost),
    String(refusal.clockRemaining),
  ].join('|');
}

/** Applies one authored delta over the declared keys, unclamped. */
function applyDelta(
  bag: StorylineResources,
  delta: Readonly<Record<StorylineResourceKey, number>>,
  declared: readonly StorylineResourceKey[],
): StorylineResources {
  const next: Record<StorylineResourceKey, number> = {};
  for (const key of declared) next[key] = readResource(bag, key) + (delta[key] ?? 0);
  return next;
}

/**
 * Applies one option's cost and extra effect, mirroring `resolveStorylineOption`
 * (cost paid, then extra effect applied; both independent of the effect policy,
 * which carries no resource delta in the content model).
 *
 * @returns The resulting bag and the declarative successor base ids (`[]` for
 *          a terminal option). `null` when the option is not affordable — a
 *          hidden option the runtime never presents.
 */
function optionTransition(
  model: EpisodeModel,
  option: StorylineOption<unknown>,
  bag: StorylineResources,
): { readonly bag: StorylineResources; readonly targets: readonly string[] } | null {
  if (!isOptionAffordable(option, bag, model.declared)) return null;

  const cost = selectDeclaredDelta(option.cost, -1, model.declared);
  const extra = selectDeclaredDelta(option.extraEffect, 1, model.declared, {
    irreversible: model.irreversible,
  });
  const merged: Record<StorylineResourceKey, number> = {};
  for (const key of model.declared) {
    merged[key] = (cost.delta[key] ?? 0) + (extra.delta[key] ?? 0);
  }
  const next = applyDelta(bag, merged, model.declared);

  // Declarative successor precedence: first matching `#when` rule, then the
  // candidate set / single successor. A candidate set branches exhaustively
  // instead of drawing the RNG (determinism), and a `successorResolver` — a
  // runtime callback, not content — is never consulted.
  const rules = option.conditionalSuccessors ?? [];
  if (rules.length > 0) {
    const match = rules.find((rule) => evaluateCondition(rule.when, next));
    if (match !== undefined) {
      return {
        bag: next,
        targets: match.successorId ? [baseIdOf(model.adapter, match.successorId)] : [],
      };
    }
  }
  return { bag: next, targets: optionSuccessorIds(option, model.adapter) };
}

/** Applies a close's matching `losses[]` rules in declaration order, unclamped. */
function applyLosses(model: EpisodeModel, scene: Scene, outcome: SceneOutcome, bag: StorylineResources): StorylineResources {
  let next = bag;
  for (const rule of scene.losses ?? []) {
    if (rule.on !== outcome) continue;
    const selection = selectDeclaredDelta({ [rule.field]: rule.amount }, -1, model.declared);
    next = applyDelta(next, selection.delta, model.declared);
  }
  return next;
}

/**
 * Closes the state's scene and routes the close, delegating every decision to
 * the runtime's pure helpers.
 *
 * The objective and the outcome read the pre-loss bag (one snapshot), the route
 * gate reads the post-loss bag — the order the runner applies (GDD §2.3 steps
 * C.6–C.9).
 */
function closeAndRoute(
  model: EpisodeModel,
  state: SceneState,
  refusalTriggered: boolean,
): CloseTransition {
  const scene = model.scenes.get(state.sceneId);
  if (scene === undefined) {
    throw new Error(
      `Scene guard: current scene "${state.sceneId}" is not declared by episode ` +
        `"${model.manifest.id}".`,
    );
  }

  const objectiveMet = evaluateSceneCondition(scene.objective.check, {
    objectiveMet: false,
    budgetExhausted: refusalTriggered,
    resources: state.bag,
  });
  const { ruleId, outcome } = classifySceneOutcome(scene, {
    objectiveMet,
    budgetExhausted: refusalTriggered,
    resources: state.bag,
  });
  const bag = applyLosses(model, scene, outcome, state.bag);
  const route = selectRoute({
    scene,
    outcome,
    context: { objectiveMet, budgetExhausted: refusalTriggered, resources: bag, pendingChain: state.pendingChain },
  });
  const target = resolveRouteTarget(model.manifest, route.to, state.pendingChain);

  const exit: SceneGuardSceneExit = Object.freeze({
    sceneId: scene.id,
    ruleId,
    outcome,
    clockRemaining: state.clockRemaining,
    refusalTriggered,
    refusedBeatCardId: refusalTriggered ? state.beatId : null,
  });

  if (target.kind === 'ending') return { exit, next: null, bag };

  const nextScene = model.scenes.get(target.sceneId as string);
  if (nextScene === undefined) {
    throw new Error(
      `Scene guard: route "${route.id}" opens scene "${target.sceneId}", which episode ` +
        `"${model.manifest.id}" does not declare.`,
    );
  }
  return {
    exit,
    next: { sceneId: nextScene.id, beatId: target.beatId },
    bag,
  };
}

/**
 * Enumerates the scene space of a validated episode manifest and its content.
 *
 * Each explored state is expanded once (a revisited state is not re-expanded),
 * so a cyclic scene space terminates through state revisits and a
 * resource-growing cycle terminates at the bounds. See the module comment for
 * the transition model.
 *
 * @param manifest The validated episode manifest (never mutated).
 * @param cards    The manifest's content cards, as read through its adapter.
 * @param options  Bounds and an optional adapter override.
 * @returns A frozen report of every explored state, scene exit and refusal.
 * @throws Error when the manifest / content binding is unusable (unknown scene,
 *         adapter, unparseable options, or an unreadable starting bag) — the
 *         validator owns those defects, and the guard refuses rather than
 *         enumerating a scene space it cannot describe.
 */
export function enumerateSceneSpace(
  manifest: EpisodeManifest,
  cards: readonly ContentCard[],
  options: SceneGuardOptions = {},
): SceneGuardReport {
  const model = buildModel(manifest, cards, resolveAdapter(manifest, options.adapter));
  const maxDepth = options.maxDepth ?? DEFAULT_SCENE_GUARD_MAX_DEPTH;
  const maxStates = options.maxStates ?? DEFAULT_SCENE_GUARD_MAX_STATES;

  const cardById = new Map(cards.map((card) => [card.id, card] as const));
  const visited = new Set<string>();
  const exploredStateKeys: string[] = [];
  const sceneExits: SceneGuardSceneExit[] = [];
  const seenExits = new Set<string>();
  const beatRefusals: SceneGuardBeatRefusal[] = [];
  const seenRefusals = new Set<string>();
  let truncated = false;

  /** Records one observed scene exit (de-duplicated, first-observed order). */
  const observeExit = (exit: SceneGuardSceneExit): void => {
    const key = exitKey(exit);
    if (seenExits.has(key)) return;
    seenExits.add(key);
    sceneExits.push(exit);
  };

  /** Records one observed beat refusal (de-duplicated, first-observed order). */
  const observeRefusal = (refusal: SceneGuardBeatRefusal): void => {
    const key = refusalKey(refusal);
    if (seenRefusals.has(key)) return;
    seenRefusals.add(key);
    beatRefusals.push(Object.freeze(refusal));
  };

  const startScene = model.scenes.get(manifest.start.scene);
  if (startScene === undefined) {
    throw new Error(
      `Scene guard: manifest "${manifest.id}" starts at unknown scene ` +
        `"${manifest.start.scene}".`,
    );
  }

  const stack: { state: SceneState; depth: number }[] = [
    {
      state: {
        sceneId: startScene.id,
        beatId: manifest.start.beat,
        clockRemaining: startScene.budget.clock,
        pendingChain: null,
        bag: model.startBag,
      },
      depth: 0,
    },
  ];

  /** Observes a resolved close and pushes its children (none at an ending). */
  const observeClosed = (transition: CloseTransition, depth: number): void => {
    observeExit(transition.exit);
    if (transition.next === null) return;
    const scene = model.scenes.get(transition.next.sceneId);
    stack.push({
      state: {
        sceneId: transition.next.sceneId,
        beatId: transition.next.beatId,
        clockRemaining: scene?.budget.clock ?? 0,
        pendingChain: null,
        bag: transition.bag,
      },
      depth: depth + 1,
    });
  };

  while (stack.length > 0) {
    if (visited.size >= maxStates) {
      truncated = true;
      break;
    }
    const current = stack.pop();
    if (current === undefined) break;
    const key = stateKey(current.state, model.declared);
    if (visited.has(key)) continue;
    visited.add(key);
    exploredStateKeys.push(key);

    if (current.depth > maxDepth) {
      truncated = true;
      continue;
    }

    const scene = model.scenes.get(current.state.sceneId);
    if (scene === undefined) {
      throw new Error(
        `Scene guard: scene "${current.state.sceneId}" is not declared by episode ` +
          `"${manifest.id}".`,
      );
    }
    const beat = scene.beats.find((candidate) => candidate.cardId === current.state.beatId);
    if (beat === undefined) {
      throw new Error(
        `Scene guard: beat "${current.state.beatId}" is not a beat of scene "${scene.id}".`,
      );
    }

    // 1. Beat entry — refusal first (no charge, no options), and the refusal is
    //    the close trigger whose continuation this same expansion enumerates.
    if (beat.clockCost > current.state.clockRemaining) {
      observeRefusal({
        sceneId: scene.id,
        beatCardId: beat.cardId,
        clockCost: beat.clockCost,
        clockRemaining: current.state.clockRemaining,
      });
      observeClosed(closeAndRoute(model, current.state, true), current.depth);
      continue;
    }

    const charged: SceneState = {
      ...current.state,
      clockRemaining: current.state.clockRemaining - beat.clockCost,
    };

    const card = cardById.get(beat.cardId);
    if (card === undefined) {
      throw new Error(
        `Scene guard: beat "${beat.cardId}" in scene "${scene.id}" has no content card in ` +
          "the guard's card map.",
      );
    }
    const compiledOptions = model.options.get(beat.cardId) ?? [];

    // 2. Choice resolution — an affordable option, or (no options) an immediate
    //    close with no pending chain, exactly as the runner classifies `none`.
    const transitions: { readonly bag: StorylineResources; readonly target: string | null }[] = [];
    for (const option of compiledOptions) {
      const transition = optionTransition(model, option, charged.bag);
      if (transition === null) continue;
      if (transition.targets.length === 0) {
        transitions.push({ bag: transition.bag, target: null });
      } else {
        for (const target of transition.targets) transitions.push({ bag: transition.bag, target });
      }
    }
    if (compiledOptions.length === 0) transitions.push({ bag: charged.bag, target: null });

    // 3./4. Close + route every transition. Push children in reverse so the
    //       authored order is the exploration order the stack pops in.
    const children: { state: SceneState; depth: number }[] = [];
    for (const transition of transitions) {
      const pushed = transition.target;
      const pushedScene = pushed === null ? undefined : model.assignedScene.get(pushed);
      const closes =
        pushed === null ||
        pushedScene === undefined ||
        pushedScene !== scene.id;
      const pendingChain = pushed === null ? null : pushed;
      const closingState: SceneState = {
        ...charged,
        pendingChain,
        bag: transition.bag,
      };

      if (!closes) {
        // An in-scene beat continues the scene: same clock, no pending chain.
        children.push({
          state: { ...charged, beatId: pushed as string, pendingChain: null, bag: transition.bag },
          depth: current.depth + 1,
        });
        continue;
      }
      if (pushed !== null && pushedScene === undefined && !model.endings.has(pushed)) {
        throw new Error(
          `Scene guard: the resolved choice pushed "${pushed}", which is neither a beat ` +
            `assigned to any scene nor a declared ending of episode "${manifest.id}".`,
        );
      }

      const closed = closeAndRoute(model, closingState, false);
      observeExit(closed.exit);
      if (closed.next !== null) {
        children.push({
          state: {
            sceneId: closed.next.sceneId,
            beatId: closed.next.beatId,
            clockRemaining: model.scenes.get(closed.next.sceneId)?.budget.clock ?? 0,
            pendingChain: null,
            bag: closed.bag,
          },
          depth: current.depth + 1,
        });
      }
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  // Refusal-triggered closes are observed through the same close path, so an
  // exit is only ever recorded once; freeze the observed collections.
  exploredStateKeys.sort();

  // Invariant: no exhausted close classifies `success`. Derived from the exit
  // records the enumeration already produced (the refusal flag and the refused
  // beat are on the record), so no second traversal is added. An exhausted
  // close classified `partial` or `failure` is a legitimate authoring choice and
  // is never flagged.
  const exhaustedCloses = sceneExits.filter((exit) => exit.refusalTriggered);
  const violations: SceneGuardViolation[] = exhaustedCloses.flatMap((exit) => {
    if (exit.outcome !== 'success') return [];
    const refusedBeatCardId = exit.refusedBeatCardId;
    if (refusedBeatCardId === null) return []; // unreachable: a refusal names its beat
    return [
      Object.freeze({
        invariant: SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
        cardId: refusedBeatCardId,
        sceneId: exit.sceneId,
        ruleId: exit.ruleId,
        outcome: exit.outcome,
        message:
          `Scene "${exit.sceneId}" closed on the refused beat "${refusedBeatCardId}" and ` +
          `rule "${exit.ruleId}" classified the exhausted close as success.`,
      }),
    ];
  });
  const invariants: SceneGuardInvariantSummary[] = [
    Object.freeze({
      invariant: SCENE_GUARD_INVARIANT_NO_SUCCESS_ON_EXHAUSTED_CLOSE,
      checked: exhaustedCloses.length,
      violations: violations.length,
    }),
  ];

  return Object.freeze({
    valid: !truncated && violations.length === 0,
    episodeId: manifest.id,
    maxStates,
    maxDepth,
    exploredStateKeys: Object.freeze(exploredStateKeys),
    sceneExits: Object.freeze(sceneExits.map((exit) => Object.freeze({ ...exit }))),
    beatRefusals: Object.freeze(beatRefusals.map((refusal) => Object.freeze({ ...refusal }))),
    invariants: Object.freeze(invariants),
    violations: Object.freeze(violations),
    exploration: Object.freeze({ statesVisited: visited.size, truncated }),
  });
}

/** The machine-readable scene-guard report (JSON-safe; no functions or sets). */
export function sceneGuardToJson(report: SceneGuardReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Renders the human-readable scene-guard report.
 *
 * A header, one line per invariant (with a `✓`/`✗` marker), every violation,
 * one line per observed scene exit and refusal, the exploration accounting and a
 * PASS/FAIL verdict (a truncation always fails).
 *
 * @param report       The report to render.
 * @param manifestPath Optional manifest path, printed as a heading.
 */
export function formatSceneGuardReport(
  report: SceneGuardReport,
  manifestPath?: string,
): string {
  const lines: string[] = [];
  lines.push(
    `Scene guard${manifestPath ? `: ${manifestPath}` : ''} (episode ${report.episodeId})`,
  );
  lines.push(`maxDepth=${report.maxDepth} maxStates=${report.maxStates}`);
  lines.push(
    `states=${report.exploration.statesVisited} exits=${report.sceneExits.length} refusals=${report.beatRefusals.length}${report.exploration.truncated ? ' (truncated)' : ''}`,
  );
  for (const summary of report.invariants) {
    lines.push(
      `${summary.violations === 0 ? '✓' : '✗'} ${summary.invariant}: ${summary.checked} checked, ` +
        `${summary.violations} violation${summary.violations === 1 ? '' : 's'}`,
    );
  }
  for (const violation of report.violations) {
    lines.push(`✗ [${violation.invariant}] ${violation.message}`);
  }
  for (const exit of report.sceneExits) {
    lines.push(
      `scene exit — ${exit.sceneId}: ${exit.outcome} (${exit.ruleId}), ${exit.clockRemaining} left, ` +
        `${exit.refusalTriggered ? 'refusal-triggered' : 'not refusal-triggered'}`,
    );
  }
  for (const refusal of report.beatRefusals) {
    lines.push(
      `refusal — ${refusal.sceneId}: ${refusal.beatCardId} costs ${refusal.clockCost}, ` +
        `${refusal.clockRemaining} left`,
    );
  }
  if (report.exploration.truncated) {
    lines.push('! a depth/state bound cut the enumeration short; the scene space is unproven');
  }
  lines.push(report.valid ? 'PASS' : 'FAIL');
  return lines.join('\n');
}
