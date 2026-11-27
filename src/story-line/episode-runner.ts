/**
 * Episode runner — the generic beat-sheet layer (GDD §2.3).
 *
 * An episode manifest is a scene beat sheet: acts hold scenes, a scene holds
 * an ordered beat set, a clock budget, one objective, an outcome-rule table
 * and a route table. {@link createEpisodeRunner} binds that authored data to
 * a {@link StorylineSystem} so a game can walk one beat at a time without
 * re-implementing the routing contract.
 *
 * This module owns the **public surface and the constructed run state**:
 *
 * - construction from an already-validated manifest (the runner never
 *   re-validates — GDD §2.4's validator owns that), with the run positioned at
 *   `manifest.start` and the entry scene's `budget.clock` loaded;
 * - a frozen {@link EpisodeRunState} snapshot and a frozen
 *   {@link SceneExitRecord} list, so a caller can read the run without being
 *   able to mutate it, and later features add behaviour without changing the
 *   constructed shape;
 * - beat entry (GDD §2.3 steps A.1–A.3): charge the manifest's `clockCost` and
 *   present the beat, or refuse it for want of clock and report the
 *   `budget-exhausted` close trigger;
 * - choice resolution (GDD §2.3 steps B.4–B.5): delegate the chosen option to
 *   the run's one `@story-line` choice model, then classify the card it pushed
 *   as continuing the scene or closing it with a pending chain;
 * - the scene close (GDD §2.3 steps C.6–C.8): evaluate the scene objective
 *   once against post-resolution resources, classify the outcome first-match
 *   wins from the authored outcome table (`budgetExhausted` is an authored
 *   input, never a hard-coded failure), then apply every matching loss rule in
 *   declaration order through the engine seam — one ledger line and one
 *   activity-log line each;
 * - the loss ledger (GDD §2.2.8): one `chain` line per irreversible key that
 *   fell across a resolution (observed by diffing `engine.getResources`, never
 *   computed), and one `rule` line per authored `LossRule` the scene close
 *   applies through the engine seam. The ledger never holds a positive line;
 * - versioned run state (GDD §3.5.2): {@link EpisodeRunStateSerializer} carries
 *   the nine persisted fields at `schemaVersion: 1` through the core
 *   `serializeWithVersion` / `deserializeWithVersion` helpers. A version
 *   mismatch is a refusal (there is no v1 `migrate` hook), and restoring a
 *   payload consumes no RNG and applies no resource delta — a reload is not a
 *   refund.
 *
 * The single-choice model (compilation, resolution, resource projection and
 * RNG), the game's state and the activity log all stay with the supplied
 * `@story-line` system; this layer adds no second copy of any of them.
 * Nothing here depends on Phaser.
 *
 * @module
 */

import {
  deserializeWithVersion,
  serializeWithVersion,
  type SaveSerializer,
  type VersionedPayload,
} from '../core-engine/SaveLoad';
import { isOptionAffordable, optionAffordability } from './compile';
import type {
  EpisodeManifest,
  LossRule,
  RouteTarget,
  Scene,
  SceneCondition,
  SceneRoute,
} from './content/episode-manifest';
import type { ContentAdapter } from './content/types';
import { evaluateCondition } from './resolve';
import {
  createResourceProjection,
  normaliseResourceKeys,
  readResource,
  type StorylineResourceField,
  type StorylineResourceKey,
  type StorylineResourceProjection,
  type StorylineResources,
} from './resources';
import type {
  BeatEntry,
  ChainLossLedgerEntry,
  ChoiceNext,
  ChoiceResolution,
  EpisodeRunState,
  EpisodeRunner,
  EpisodeRunnerConfig,
  LossLedgerEntry,
  PushedCardCase,
  RouteSelectionContext,
  RouteSelectionRequest,
  RouteTargetResolution,
  RoutingCloseInput,
  RuleLossLedgerEntry,
  SceneCloseResult,
  SceneConditionContext,
  SceneExitRecord,
  SceneOutcomeClassification,
  SceneRouteResult,
  SerializedEpisodeRunState,
  StorylineAffordabilityPolicy,
  StorylineCard,
  StorylineOption,
} from './types';

/**
 * The runner's internal, mutable run state.
 *
 * Never handed out: {@link EpisodeRunner.getState} snapshots it into the
 * read-only {@link EpisodeRunState}. Only this module mutates it, which is
 * what keeps every later §2.3 feature a change here plus a public method.
 */
interface MutableEpisodeRunState {
  seed: number;
  currentActId: string;
  currentSceneId: string;
  currentBeatId: string;
  sceneClockRemaining: number;
  /**
   * Set by a refused beat entry and read by the scene close (GDD §2.3 step 7);
   * cleared on scene entry. Not part of the public {@link EpisodeRunState}
   * snapshot — it is close-path bookkeeping, not persisted run state.
   */
  budgetExhausted: boolean;
  pendingChain: string | null;
  /**
   * The ending card id the run closed on (GDD §2.3 step 10), or `null` while
   * the run is active. Read through `EpisodeRunner.getEndingCardId` and cleared
   * by `resetRun`; deliberately not part of the frozen run-state snapshot.
   */
  endingCardId: string | null;
  readonly sceneHistory: string[];
  readonly routeHistory: string[];
  readonly lossLedger: LossLedgerEntry[];
  readonly sceneExits: SceneExitRecord[];
}

/**
 * Evaluates one scene condition against a close context (GDD §2.3 step 7).
 *
 * The scene-condition vocabulary has exactly three forms and this is the one
 * place they are read — the outcome table's `when` gates now, and the route
 * table's `when` gates when routing ships. Raw `{ field, op, value }` checks
 * delegate to the shipped `@story-line` `evaluateCondition`, so a declared
 * resource that is absent reads as `0` exactly as it does in choice
 * resolution.
 *
 * Pure: reads its arguments, mutates nothing and consumes no RNG.
 *
 * @param condition The authored scene condition (`objective`, `budget` or raw).
 * @param context   The objective verdict, exhaustion flag and resources.
 * @returns Whether the condition holds.
 */
export function evaluateSceneCondition(
  condition: SceneCondition,
  context: SceneConditionContext,
): boolean {
  if ('objective' in condition) {
    return (condition.objective === 'met') === context.objectiveMet;
  }
  if ('budget' in condition) {
    return (condition.budget === 'exhausted') === context.budgetExhausted;
  }
  return evaluateCondition(condition, context.resources);
}

/**
 * Classifies a scene's outcome from its authored outcome table (GDD §2.3
 * step 7).
 *
 * First match wins in **declaration order**. The validator guarantees the last
 * rule is unconditional (`non-total-outcome-rules`), so the table is total and
 * there is no defensive catch-all: a table that classifies nothing is a
 * content defect and is reported loudly rather than silently defaulted.
 *
 * Pure: reads the scene and context, mutates nothing and consumes no RNG.
 *
 * @param scene   The scene whose `outcomeRules` are consulted.
 * @param context The objective verdict, exhaustion flag and resources.
 * @returns The winning rule id and its outcome.
 * @throws Error when no rule matches (an unvalidated, non-total table).
 */
export function classifySceneOutcome(
  scene: Scene,
  context: SceneConditionContext,
): SceneOutcomeClassification {
  for (const rule of scene.outcomeRules) {
    if (rule.when === undefined || evaluateSceneCondition(rule.when, context)) {
      return { ruleId: rule.id, outcome: rule.outcome };
    }
  }

  throw new Error(
    `Episode runner: scene "${scene.id}" has no matching outcome rule for objectiveMet=` +
      `${context.objectiveMet}, budgetExhausted=${context.budgetExhausted}. The last outcome rule ` +
      'must be unconditional (validateEpisodeManifest reports non-total-outcome-rules); fix the content.',
  );
}

/**
 * The persisted run state's schema version (GDD §3.5.2).
 *
 * Bumped when the wire shape changes. Version 1 has **no** `migrate` hook, so
 * `deserializeWithVersion` refuses any other version instead of loading it
 * best-effort — an older or newer payload is a refusal, not a guess.
 */
export const EPISODE_RUN_STATE_SCHEMA_VERSION = 1;

/**
 * Guards one persisted field's shape before it is trusted.
 *
 * @param condition  Whether the field is usable.
 * @param field      The payload field being read, named in the error.
 * @param expectation What the field must be, named in the error.
 * @throws Error when the field is not the shape the schema version promises.
 */
function assertSerializedField(condition: boolean, field: string, expectation: string): void {
  if (condition) return;
  throw new Error(
    `Episode runner: cannot deserialize run state \u2014 field "${field}" ${expectation}. ` +
      'Write the payload with EpisodeRunStateSerializer at the current schema version.',
  );
}

/**
 * Serialises a run state into the nine persisted fields (GDD §3.5.2).
 *
 * Pure: reads its argument, copies every array and ledger line, and returns a
 * JSON-safe payload. The shape is the wire format, not a second source of
 * truth — it has exactly the fields {@link EpisodeRunState} persists, so a
 * field added to the snapshot must be added here deliberately.
 *
 * @param state The frozen run state to serialise.
 * @returns The nine-field persisted payload.
 */
export function serializeRunState(state: EpisodeRunState): SerializedEpisodeRunState {
  return {
    seed: state.seed,
    currentActId: state.currentActId,
    currentSceneId: state.currentSceneId,
    currentBeatId: state.currentBeatId,
    sceneClockRemaining: state.sceneClockRemaining,
    pendingChain: state.pendingChain,
    sceneHistory: [...state.sceneHistory],
    routeHistory: [...state.routeHistory],
    lossLedger: state.lossLedger.map((entry) => ({ ...entry })),
  };
}

/**
 * Reads one persisted payload into a frozen run state, without a manifest.
 *
 * This is `EpisodeRunStateSerializer.deserialize`: it checks the nine fields'
 * shapes, copies the arrays and ledger lines, and freezes the result. It
 * cannot check that the position exists in an episode — that is
 * {@link hydrateRunState}'s job, which has the manifest.
 *
 * Pure: reads its argument, mutates nothing and consumes no RNG.
 *
 * @param payload The persisted payload (normally from `serializeWithVersion`).
 * @returns The frozen run state the payload describes.
 * @throws Error when a field is missing or the wrong shape.
 */
export function deserializeRunState(payload: SerializedEpisodeRunState): EpisodeRunState {
  assertSerializedField(typeof payload === 'object' && payload !== null, 'payload', 'must be an object');
  assertSerializedField(Number.isFinite(payload.seed), 'seed', 'must be a finite number');
  assertSerializedField(typeof payload.currentActId === 'string', 'currentActId', 'must be a string');
  assertSerializedField(
    typeof payload.currentSceneId === 'string',
    'currentSceneId',
    'must be a string',
  );
  assertSerializedField(
    typeof payload.currentBeatId === 'string',
    'currentBeatId',
    'must be a string',
  );
  assertSerializedField(
    Number.isInteger(payload.sceneClockRemaining) && payload.sceneClockRemaining >= 0,
    'sceneClockRemaining',
    'must be an integer \u2265 0',
  );
  assertSerializedField(
    payload.pendingChain === null || typeof payload.pendingChain === 'string',
    'pendingChain',
    'must be a string or null',
  );
  assertSerializedField(Array.isArray(payload.sceneHistory), 'sceneHistory', 'must be an array');
  assertSerializedField(Array.isArray(payload.routeHistory), 'routeHistory', 'must be an array');
  assertSerializedField(Array.isArray(payload.lossLedger), 'lossLedger', 'must be an array');

  return Object.freeze({
    seed: payload.seed,
    currentActId: payload.currentActId,
    currentSceneId: payload.currentSceneId,
    currentBeatId: payload.currentBeatId,
    sceneClockRemaining: payload.sceneClockRemaining,
    pendingChain: payload.pendingChain,
    sceneHistory: Object.freeze([...payload.sceneHistory]),
    routeHistory: Object.freeze([...payload.routeHistory]),
    lossLedger: Object.freeze(payload.lossLedger.map((entry) => Object.freeze({ ...entry }))),
  });
}

/**
 * Hydrates a persisted payload against the manifest it will resume in.
 *
 * The payload is read structurally first ({@link deserializeRunState}), then
 * checked against the manifest: the saved scene must be declared by one of its
 * acts and the saved act must be that scene's act. A checkpoint that names no
 * declared scene is refused, so a runner never resumes into a position the
 * episode cannot describe.
 *
 * Pure: reads its arguments, mutates nothing and consumes no RNG.
 *
 * @param payload  The persisted payload (normally from `serializeWithVersion`).
 * @param manifest The validated manifest the run resumes in.
 * @returns The frozen run state to resume from.
 * @throws Error when the payload's position is not part of the manifest.
 */
export function hydrateRunState(
  payload: SerializedEpisodeRunState,
  manifest: EpisodeManifest,
): EpisodeRunState {
  const state = deserializeRunState(payload);
  const act = manifest.acts.find((candidate) =>
    candidate.scenes.some((scene) => scene.id === state.currentSceneId),
  );
  if (act === undefined) {
    throw new Error(
      `Episode runner: cannot restore run state at scene "${state.currentSceneId}", which no ` +
        `act of episode "${manifest.id}" declares. Save the run against the manifest it belongs to.`,
    );
  }
  if (act.id !== state.currentActId) {
    throw new Error(
      `Episode runner: cannot restore run state that says act "${state.currentActId}" for scene ` +
        `"${state.currentSceneId}", which episode "${manifest.id}" declares under act ` +
        `"${act.id}". The payload is inconsistent with the manifest.`,
    );
  }
  return state;
}

/**
 * The runner's {@link SaveSerializer} (GDD §3.5.2) for the core save/load
 * helpers.
 *
 * `serializeWithVersion(EpisodeRunStateSerializer, runner.getState())` writes
 * the versioned payload and `deserializeWithVersion` reads it; the runner's
 * own `serialize()` / `restore()` wrap both. There is deliberately **no**
 * `migrate` hook at version 1: a version mismatch throws the core
 * `Incompatible save version: expected 1, got N` error rather than loading
 * best-effort.
 */
export const EpisodeRunStateSerializer: SaveSerializer<
  EpisodeRunState,
  SerializedEpisodeRunState
> = Object.freeze({
  schemaVersion: EPISODE_RUN_STATE_SCHEMA_VERSION,
  serialize: serializeRunState,
  deserialize: deserializeRunState,
});

/**
 * Formats a rule loss for the activity log: the authored statement plus the
 * signed amount the engine seam actually applied and the key it fell on.
 *
 * @param entry The loss line the close appended to the ledger.
 */
function formatRuleLossLine(entry: RuleLossLedgerEntry): string {
  const amount = entry.delta < 0 ? `\u2212${Math.abs(entry.delta)}` : `+${entry.delta}`;
  return `${entry.statement} (${amount} ${entry.field})`;
}

/** Finds a scene by id across every act, in declaration order. */
function findScene(manifest: EpisodeManifest, sceneId: string): Scene | undefined {
  for (const act of manifest.acts) {
    const scene = act.scenes.find((candidate) => candidate.id === sceneId);
    if (scene !== undefined) return scene;
  }
  return undefined;
}

/**
 * The manifest's assigned-card index: beat card id → the scene assigning it.
 *
 * A beat id is unique across the episode (validated by `duplicate-beat`), so
 * one map answers "is this card a beat, and of which scene?" without walking
 * the acts on every resolution.
 */
type AssignedCardIndex = ReadonlyMap<string, string>;

/** Builds the assigned-card index once, at construction, from the manifest. */
function buildAssignedCardIndex(manifest: EpisodeManifest): AssignedCardIndex {
  const index = new Map<string, string>();
  for (const act of manifest.acts) {
    for (const scene of act.scenes) {
      for (const beat of scene.beats) {
        index.set(beat.cardId, scene.id);
      }
    }
  }
  return index;
}

/** One scene's owning act, as the scene index stores it. */
interface SceneIndexEntry {
  /** The id of the act declaring the scene. */
  readonly actId: string;
  /** The scene itself (read-only). */
  readonly scene: Scene;
}

/** The manifest's scene index: scene id → its owning act and the scene. */
type SceneIndex = ReadonlyMap<string, SceneIndexEntry>;

/** Builds the scene index once, at construction, from the manifest. */
function buildSceneIndex(manifest: EpisodeManifest): SceneIndex {
  const index = new Map<string, SceneIndexEntry>();
  for (const act of manifest.acts) {
    for (const scene of act.scenes) {
      index.set(scene.id, { actId: act.id, scene });
    }
  }
  return index;
}

/** True when the route opens a `chain` door (GDD §2.3 step 9). */
function isChainRoute(route: SceneRoute): boolean {
  return route.to.kind === 'chain';
}

/**
 * Selects the route a scene close takes (GDD §2.3 step 9).
 *
 * Iterates `scene.routes` in **declaration order** and returns the first entry
 * where all three clauses hold:
 *
 * 1. `on === "*"` or `on === outcome`;
 * 2. `when` is absent or matches the close context (the same
 *    `objective` / `budget` / raw-resource vocabulary the outcome table uses);
 * 3. the route is not `{ kind: "chain" }` while `pendingChain` is `null` — a
 *    chain door with no chain has nothing to open.
 *
 * Pure: reads its arguments, mutates nothing and consumes no RNG.
 *
 * The validator guarantees a total table (every outcome named or an `on: "*"`
 * catch-all) with an unconditional tail, but the chain-skip clause can still
 * leave a close with no door when the only remaining candidates are chain
 * routes — a content defect the validator cannot see from the table alone. It
 * is reported loudly rather than silently defaulted.
 *
 * @param request The scene, its classified outcome and the gate context.
 * @returns The winning route, in declaration order.
 * @throws Error when no route matches (a route table that leaves a close with
 *         no door).
 */
export function selectRoute(request: RouteSelectionRequest): SceneRoute {
  const { scene, outcome, context } = request;

  for (const route of scene.routes) {
    if (route.on !== '*' && route.on !== outcome) continue;
    if (route.when !== undefined && !evaluateSceneCondition(route.when, context)) continue;
    if (isChainRoute(route) && context.pendingChain === null) continue;
    return route;
  }

  throw new Error(
    `Episode runner: scene "${scene.id}" has no route for outcome "${outcome}" ` +
      `(pendingChain=${context.pendingChain === null ? 'null' : `"${context.pendingChain}"`}). ` +
      'The route table must give every close a door; a chain route cannot open without a ' +
      'pending chain. Fix the content (validateEpisodeManifest reports non-total-routes for a ' +
      'table that names no outcome and has no on: "*" catch-all).',
  );
}

/** The resolution an `ending` target produces (shared by chain and ending routes). */
function endingResolution(endingCardId: string): RouteTargetResolution {
  return Object.freeze({
    kind: 'ending' as const,
    actId: null,
    sceneId: null,
    beatId: endingCardId,
    endingCardId,
  });
}

/**
 * Resolves a route target into the run's next action (GDD §2.3 step 10).
 *
 * - `chain` → the pending chain card: a beat of another scene (its scene and
 *   act are read from the manifest's assigned-card index) or an ending card
 *   (``manifest.endings``);
 * - `beat` → `target.beat`, or the target scene's `entryBeat` when the target
 *   names no beat;
 * - `ending` → the named ending card, which closes the run.
 *
 * Pure: reads the manifest and its arguments, mutates nothing and consumes no
 * RNG. The referenced scene / beat / ending is validated by
 * `validateEpisodeManifest` (`unknown-scene`, `unknown-card`, `dangling-chain`),
 * so an unresolvable target is reported loudly here rather than silently
 * skipped.
 *
 * @param manifest     The validated manifest the target resolves in.
 * @param target       The winning route's authored `to`.
 * @param pendingChain The card a resolved choice pushed, or `null`.
 * @returns The frozen {@link RouteTargetResolution}.
 * @throws Error when a `chain` target has no pending chain, or when a beat /
 *         ending / chain target names something the manifest does not declare.
 */
export function resolveRouteTarget(
  manifest: EpisodeManifest,
  target: RouteTarget,
  pendingChain: string | null,
): RouteTargetResolution {
  if (target.kind === 'ending') {
    if (!manifest.endings.includes(target.cardId)) {
      throw new Error(
        `Episode runner: route target names ending "${target.cardId}", which episode ` +
          `"${manifest.id}" does not declare. Fix the route (validateEpisodeManifest reports ` +
          'unknown-card).',
      );
    }
    return endingResolution(target.cardId);
  }

  const sceneIndex = buildSceneIndex(manifest);

  if (target.kind === 'chain') {
    if (pendingChain === null) {
      throw new Error(
        `Episode runner: a chain route has no pending chain to open in episode ` +
          `"${manifest.id}". Route selection skips a chain route while pendingChain is null.`,
      );
    }
    if (manifest.endings.includes(pendingChain)) {
      return endingResolution(pendingChain);
    }

    const entry = sceneIndex.get(findAssignedSceneId(manifest, pendingChain) ?? '');
    if (entry === undefined) {
      throw new Error(
        `Episode runner: the pending chain "${pendingChain}" is neither a declared ending nor a ` +
          `beat of any scene in episode "${manifest.id}". Fix the content ` +
          '(validateEpisodeManifest reports dangling-chain).',
      );
    }
    return Object.freeze({
      kind: 'beat' as const,
      actId: entry.actId,
      sceneId: entry.scene.id,
      beatId: pendingChain,
      endingCardId: null,
    });
  }

  const entry = sceneIndex.get(target.scene);
  if (entry === undefined) {
    throw new Error(
      `Episode runner: route target names scene "${target.scene}", which no act of episode ` +
        `"${manifest.id}" declares. Fix the route (validateEpisodeManifest reports unknown-scene).`,
    );
  }

  const beatId = target.beat ?? entry.scene.entryBeat;
  if (!entry.scene.beats.some((beat) => beat.cardId === beatId)) {
    throw new Error(
      `Episode runner: route target opens beat "${beatId}", which is not a beat of scene ` +
        `"${entry.scene.id}" in episode "${manifest.id}". Fix the route ` +
        '(validateEpisodeManifest reports unknown-card).',
    );
  }

  return Object.freeze({
    kind: 'beat' as const,
    actId: entry.actId,
    sceneId: entry.scene.id,
    beatId,
    endingCardId: null,
  });
}

/** Finds the scene a beat card belongs to, or `undefined` when it is unassigned. */
function findAssignedSceneId(manifest: EpisodeManifest, cardId: string): string | undefined {
  for (const act of manifest.acts) {
    for (const scene of act.scenes) {
      if (scene.beats.some((beat) => beat.cardId === cardId)) return scene.id;
    }
  }
  return undefined;
}

/**
 * Formats a `scene-exit` activity-log line.
 *
 * The record is the single source, so the line is derived from it and never
 * from the scene data it was built out of: the scene id, the outcome and its
 * winning rule, the clock spent against the scene's budget, and the
 * exhaustion flag.
 *
 * @param record The frozen record the route just appended.
 */
function formatSceneExitLine(record: SceneExitRecord): string {
  const budget = record.clockSpent + record.clockRemaining;
  return (
    `Scene exit — ${record.sceneId}: ${record.outcome} (${record.ruleId}), ` +
    `${record.clockSpent} of ${budget} ticks spent, ${record.clockRemaining} left, ` +
    `budget ${record.budgetExhausted ? 'exhausted' : 'intact'}.`
  );
}

/**
 * Formats the route activity-log line for one resolved target.
 *
 * @param route  The winning route.
 * @param target Its resolved target.
 */
function formatRouteLine(route: SceneRoute, target: RouteTargetResolution): string {
  const door =
    target.kind === 'beat' ? `${target.sceneId}:${target.beatId}` : `ending ${target.beatId}`;
  return `Route — ${route.id} → ${door}.`;
}

/** The §2.3 step B.5 classification, before the run state is touched. */
interface PushedCardClassification {
  readonly next: ChoiceNext;
  readonly case: PushedCardCase;
  readonly pendingChain: string | null;
}

/**
 * Classifies the card a resolved choice pushed (GDD §2.3 step B.5).
 *
 * Pure: reads the manifest's assigned-card index and `endings` list, mutates
 * nothing and consumes no RNG. The classified id is the **base** id (the
 * adapter's `getBaseTypeId`), because `@story-line` pushes an **instance** card
 * with a deterministic serial suffix (`le-i-log-0`); the manifest, the scene
 * close and the route targets all speak template ids. A pushed card is a beat
 * of the **current** scene (continue), a beat of another scene, an ending card,
 * or absent. The two closing cases set the pending chain to the base id; the
 * continuing case and the empty case leave it null.
 *
 * A card that is neither an assigned beat nor a declared ending is a content
 * defect the validators already reject (`unassigned-card` / `unknown-card`),
 * so it is reported loudly rather than silently classified.
 *
 * @throws Error when the pushed card is neither an assigned beat nor a
 *         declared ending of the manifest.
 */
function classifyPushedCard(
  manifest: EpisodeManifest,
  assignedCards: AssignedCardIndex,
  currentSceneId: string,
  pushedBaseId: string | null,
): PushedCardClassification {
  if (pushedBaseId === null) {
    return { next: 'close', case: 'none', pendingChain: null };
  }

  const assigningScene = assignedCards.get(pushedBaseId);
  if (assigningScene !== undefined) {
    return assigningScene === currentSceneId
      ? { next: 'continue', case: 'in-scene-beat', pendingChain: null }
      : { next: 'close', case: 'out-of-scene-beat', pendingChain: pushedBaseId };
  }
  if (manifest.endings.includes(pushedBaseId)) {
    return { next: 'close', case: 'ending', pendingChain: pushedBaseId };
  }

  throw new Error(
    `Episode runner: the resolved choice pushed "${pushedBaseId}", which is neither a beat ` +
      `assigned to any scene nor a declared ending of episode "${manifest.id}". A choice ` +
      'successor must be an assigned beat or an ending; fix the content (validateEpisodeManifest ' +
      'reports unassigned-card for an orphan choice card).',
  );
}

/**
 * Reads a beat card's `context` prose.
 *
 * The prose is a **content** field (`ContentCard.context`, mapped from the
 * adapter's `context` column); a bare runtime `StorylineCard` carries none, so
 * the read is total and returns `null` rather than assuming the card shape.
 *
 * @param card The beat's content card.
 */
function readCardContext<TCard extends StorylineCard>(card: TCard): string | null {
  const prose = (card as { context?: unknown }).context;
  return typeof prose === 'string' && prose.length > 0 ? prose : null;
}

/**
 * Applies the declared-key affordability policy to a beat's options.
 *
 * The gate is the shipped {@link isOptionAffordable} / {@link optionAffordability}
 * arithmetic over the manifest's declared keys (`storyline.resources`) — the
 * runner never re-derives affordability.
 *
 * - `'omit'` (the default) presents only the options the gate accepts. This is
 *   what makes step A.3 true for the content path: registry-authored options
 *   are already filtered at draw time, CSV-authored options are not.
 * - `'surface'` keeps every option in authored order and attaches its computed
 *   affordability, so a presenter can render an unaffordable door disabled
 *   with its shortfall. Resolution then refuses it rather than overspending.
 *
 * The policy comes from the choice model's single `affordabilityPolicy`, so
 * this seam and the registry compile can never disagree.
 *
 * @param options          The beat's compiled options, in authored order.
 * @param resources        Current resource values (the engine projection).
 * @param declaredResources The run's declared resource keys.
 * @param policy           The affordability policy in force.
 */
function gateAffordableOptions<TState>(
  options: readonly StorylineOption<TState>[],
  resources: StorylineResources,
  declaredResources: readonly StorylineResourceKey[],
  policy: StorylineAffordabilityPolicy,
): StorylineOption<TState>[] {
  if (policy === 'surface') {
    return options.map((option) =>
      Object.freeze({
        ...option,
        affordability: optionAffordability(
          option,
          resources,
          declaredResources,
        ),
      }),
    );
  }
  return options.filter((option) =>
    isOptionAffordable(option, resources, declaredResources),
  );
}

/**
 * The irreversible subset of a resource bag, in the manifest's declaration
 * order.
 *
 * The diff window is this snapshot, not the whole bag: a change to a reversible
 * key is not a loss the ledger records. An absent key reads as `0` (the
 * shipped {@link readResource} rule), so a bag that omits a zero-valued key
 * still diffs correctly.
 *
 * @param resources  Current declared resources (the engine projection).
 * @param irreversible The manifest's `resources.irreversible` keys.
 */
function snapshotIrreversible(
  resources: StorylineResources,
  irreversible: readonly StorylineResourceKey[],
): Readonly<Record<StorylineResourceKey, number>> {
  const snapshot: Record<StorylineResourceKey, number> = {};
  for (const key of irreversible) {
    snapshot[key] = readResource(resources, key);
  }
  return snapshot;
}

// ── Irreversible-declaration wiring ─────────────────────────

/**
 * Which non-authoritative declaration a divergence was found in.
 *
 * The **manifest** is the authoritative source and therefore never a source of
 * an issue: `adapter` is the authoring declaration the manifest-free CSV
 * validator uses, and `projection` is the engine seam a resolution guard reads.
 */
export type IrreversibleDeclarationSource = 'adapter' | 'projection';

/**
 * How a declaration diverges from the manifest's authoritative set.
 *
 * - `missing` — the declaration omits a key the manifest declares
 *   irreversible, so a grant on that key would not be refused there;
 * - `undeclared` — the declaration names a key the manifest does not declare
 *   irreversible, so it would refuse a grant the manifest allows;
 * - `not-projected` — a projection declares an irreversible key its own
 *   declared resource set cannot read or apply.
 */
export type IrreversibleDeclarationIssueReason =
  | 'missing'
  | 'undeclared'
  | 'not-projected';

/** One divergence between a declaration and the manifest's authoritative set. */
export interface IrreversibleDeclarationIssue {
  /** The non-authoritative declaration the divergence was found in. */
  readonly source: IrreversibleDeclarationSource;
  /** Stable machine-readable reason. */
  readonly reason: IrreversibleDeclarationIssueReason;
  /** The resource key the divergence concerns. */
  readonly key: StorylineResourceKey;
  /** Human-readable explanation naming the key and the authoritative source. */
  readonly message: string;
}

/** The declaration-bearing part of a projection (no state accessors needed). */
export interface IrreversibleProjectionDeclaration {
  /** The projection's declared resource keys, in declaration order. */
  readonly resources: readonly StorylineResourceKey[];
  /** The projection's declared never-restored keys, in declaration order. */
  readonly irreversible: readonly StorylineResourceKey[];
}

/** The declarations to compare against the manifest's authoritative set. */
export interface IrreversibleDeclarationInput {
  /** The validated manifest — the authoritative `resources.irreversible` source. */
  readonly manifest: EpisodeManifest;
  /** The content adapter's authoring declaration, when the caller has one. */
  readonly adapter?: Pick<ContentAdapter, 'irreversibleResources'>;
  /** The engine projection a resolution guard reads, when the caller has one. */
  readonly projection?: IrreversibleProjectionDeclaration;
}

/** The outcome of comparing every declaration with the manifest's set. */
export interface IrreversibleDeclarationAudit {
  /** True when every supplied declaration agrees with the manifest. */
  readonly ok: boolean;
  /** The manifest's authoritative set, normalised and in declaration order. */
  readonly manifest: readonly StorylineResourceKey[];
  /** The adapter's declaration, normalised (empty when none was supplied). */
  readonly adapter: readonly StorylineResourceKey[];
  /** The projection's declaration, normalised (empty when none was supplied). */
  readonly projection: readonly StorylineResourceKey[];
  /** Every divergence found, in declaration order (empty when `ok`). */
  readonly issues: readonly IrreversibleDeclarationIssue[];
}

/**
 * Audits the adapter and projection declarations against the manifest's
 * authoritative `resources.irreversible` set.
 *
 * The manifest is the single source of truth: the episode runner derives the
 * projection's declaration from it ({@link createEpisodeResourceProjection}),
 * while the content adapter must declare its own copy because the CSV
 * validator never sees a manifest. This helper makes that second declaration
 * accountable — every divergence is reported per key and per source rather
 * than silently accepted, so a manifest re-tune cannot leave the authoring
 * vocabulary (or the engine guard) behind.
 *
 * Only supplied declarations are compared: an omitted adapter or projection
 * declares nothing and is reported as an empty set, not as a divergence.
 *
 * @param input The manifest plus the declarations to check.
 * @returns The normalised declarations and every divergence found.
 */
export function auditIrreversibleDeclaration(
  input: IrreversibleDeclarationInput,
): IrreversibleDeclarationAudit {
  const manifest = normaliseResourceKeys(input.manifest.resources.irreversible);
  const adapter = normaliseResourceKeys(input.adapter?.irreversibleResources ?? []);
  const projection = normaliseResourceKeys(input.projection?.irreversible ?? []);
  const authoritative = new Set(manifest);
  const issues: IrreversibleDeclarationIssue[] = [];

  const compare = (
    source: IrreversibleDeclarationSource,
    declared: readonly StorylineResourceKey[],
  ): void => {
    const declaredSet = new Set(declared);
    for (const key of manifest) {
      if (declaredSet.has(key)) continue;
      issues.push({
        source,
        reason: 'missing',
        key,
        message:
          `The ${source} declaration omits "${key}", which the manifest declares ` +
          'irreversible; a grant on it would not be refused there.',
      });
    }
    for (const key of declared) {
      if (authoritative.has(key)) continue;
      issues.push({
        source,
        reason: 'undeclared',
        key,
        message:
          `The ${source} declaration names "${key}" irreversible, but the manifest's ` +
          'resources.irreversible does not; it would refuse a grant the manifest allows.',
      });
    }
  };

  if (input.adapter !== undefined) compare('adapter', adapter);
  if (input.projection !== undefined) compare('projection', projection);

  if (input.projection !== undefined) {
    const projected = new Set(normaliseResourceKeys(input.projection.resources));
    for (const key of projection) {
      if (projected.has(key)) continue;
      issues.push({
        source: 'projection',
        reason: 'not-projected',
        key,
        message:
          `The projection declares "${key}" irreversible but does not project it; ` +
          'the engine seam cannot read or apply that key.',
      });
    }
  }

  return { ok: issues.length === 0, manifest, adapter, projection, issues };
}

/** Options controlling {@link createEpisodeResourceProjection}. */
export interface EpisodeResourceProjectionOptions {
  /**
   * The content adapter whose authoring `irreversibleResources` declaration
   * must agree with the manifest's authoritative set. When supplied, a
   * divergence is a construction error (fail closed) rather than a silently
   * different authoring vocabulary.
   */
  readonly adapter?: Pick<ContentAdapter, 'irreversibleResources'>;
}

/**
 * Builds the run's resource projection with the manifest's irreversible
 * declaration threaded in.
 *
 * This is the one place a run's projection is bound to the manifest, so the
 * projection cannot disagree with the authoritative `resources.irreversible`:
 * the declaration is derived, never re-typed by the game. The projection is
 * structurally assignable to the engine adapter's resource members, so the
 * manifest-declared key reaches the engine seam (and the resolution guard)
 * with no second declaration.
 *
 * When an adapter is supplied its authoring declaration is audited too, and a
 * divergence throws (naming every divergent key) instead of being silently
 * accepted.
 *
 * @param manifest The validated manifest (the authoritative declaration).
 * @param fields   One accessor pair per declared resource key.
 * @param options  Optional adapter whose declaration must agree.
 * @returns The projection, carrying the manifest's irreversible keys.
 * @throws Error when the supplied adapter's declaration diverges from the
 *         manifest (see {@link auditIrreversibleDeclaration}).
 */
export function createEpisodeResourceProjection<TState>(
  manifest: EpisodeManifest,
  fields: Readonly<Record<StorylineResourceKey, StorylineResourceField<TState>>>,
  options: EpisodeResourceProjectionOptions = {},
): StorylineResourceProjection<TState> {
  const projection = createResourceProjection(fields, {
    irreversible: manifest.resources.irreversible,
  });
  if (options.adapter === undefined) return projection;

  const audit = auditIrreversibleDeclaration({
    manifest,
    adapter: options.adapter,
    projection,
  });
  if (audit.ok) return projection;

  throw new Error(
    `Episode resource projection: the irreversible declarations disagree. ${audit.issues
      .map((issue) => issue.message)
      .join(' ')}`,
  );
}

/**
 * Creates an episode runner positioned at the manifest's start.
 *
 * Construction is deliberately light: the manifest is assumed validated (GDD
 * §2.4), so the only check is that the declared entry scene is findable —
 * without it the run has no clock budget and no beat set to walk, which is a
 * loud, actionable configuration error rather than a silent zero clock.
 *
 * The constructed run state carries the manifest's `start` act / scene / beat,
 * the entry scene's `budget.clock` as `sceneClockRemaining`, empty
 * `sceneHistory` / `routeHistory` / `lossLedger`, `pendingChain: null`, and
 * the supplied `seed`. It consumes no RNG and applies no resource delta.
 *
 * A `restored` payload replaces that constructed position with the saved one
 * (GDD §3.5.2): the payload is hydrated **before** any state exists, so a
 * version mismatch or an undeclared scene throws without constructing a
 * partially-restored run.
 *
 * @param config The validated manifest, the one storyline system, the content
 *               card map, the run's seed and an optional restored payload.
 * @returns A runner whose `getState()` reads the constructed run state.
 * @throws Error when the manifest's `start.scene` names no scene in any act,
 *         when a `restored` payload's version or scene is refused, or when
 *         neither a seed nor a restored payload supplies the run's seed.
 */
export function createEpisodeRunner<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
>(config: EpisodeRunnerConfig<TState, TCard>): EpisodeRunner<TState, TCard> {
  const { manifest, storyline, content } = config;
  const start = manifest.start;
  const entryScene = findScene(manifest, start.scene);

  if (entryScene === undefined) {
    throw new Error(
      `Episode runner: manifest "${manifest.id}" starts at unknown scene "${start.scene}". ` +
        'Fix start.scene (validateEpisodeManifest reports unknown-scene).',
    );
  }

  // Hydrate first: a refused payload throws before any run state is built, so
  // construction can never land a partially-restored run.
  const restoredState =
    config.restored === undefined
      ? null
      : hydrateRunState(
          deserializeWithVersion(EpisodeRunStateSerializer, config.restored),
          manifest,
        );

  const seed = restoredState === null ? config.seed : restoredState.seed;
  if (seed === undefined) {
    throw new Error(
      `Episode runner: manifest "${manifest.id}" has no seed. Pass ` +
        'createEpisodeRunner({ …, seed }) for a new run, or a `restored` payload to resume one.',
    );
  }

  const assignedCards = buildAssignedCardIndex(manifest);
  const sceneIndex = buildSceneIndex(manifest);

  const runState: MutableEpisodeRunState = {
    seed,
    currentActId: restoredState?.currentActId ?? start.act,
    currentSceneId: restoredState?.currentSceneId ?? entryScene.id,
    currentBeatId: restoredState?.currentBeatId ?? start.beat,
    sceneClockRemaining: restoredState?.sceneClockRemaining ?? entryScene.budget.clock,
    budgetExhausted: false,
    pendingChain: restoredState?.pendingChain ?? null,
    endingCardId: null,
    sceneHistory: restoredState === null ? [] : [...restoredState.sceneHistory],
    routeHistory: restoredState === null ? [] : [...restoredState.routeHistory],
    lossLedger:
      restoredState === null ? [] : restoredState.lossLedger.map((entry) => ({ ...entry })),
    sceneExits: [],
  };

  /**
   * Refuses a run action once the run has closed on an ending.
   *
   * An ending closes the run (GDD §2.3 step 10): no beat can be entered, no
   * choice resolved and no scene closed until {@link resetRun} begins again.
   *
   * @param action The run action being attempted, named in the error.
   * @throws Error when the run has already reached an ending.
   */
  const assertRunActive = (action: string): void => {
    if (runState.endingCardId === null) return;
    throw new Error(
      `Episode runner: cannot ${action} after the run reached ending ` +
        `"${runState.endingCardId}". Call resetRun() to begin the survey again from ` +
        `"${manifest.start.scene}".`,
    );
  };

  /** The manifest's never-restored resource keys, in declaration order. */
  const irreversibleKeys = manifest.resources.irreversible;

  /**
   * Records every irreversible key that **fell** between two snapshots.
   *
   * This is the chain-loss seam and nothing else: the player's choice spent the
   * resource through the one choice model, and this observes the net change.
   * A positive (refund) or zero net change records nothing — the ledger never
   * holds a positive line — and keys are visited in the manifest's declaration
   * order, so one resolution that costs two keys appends in authored order.
   */
  const recordChainLoss = (
    sceneId: string,
    beatId: string,
    before: Readonly<Record<StorylineResourceKey, number>>,
    after: Readonly<Record<StorylineResourceKey, number>>,
  ): void => {
    for (const field of irreversibleKeys) {
      const delta = after[field] - before[field];
      if (delta < 0) {
        const entry: ChainLossLedgerEntry = Object.freeze({
          kind: 'chain',
          sceneId,
          beatId,
          field,
          delta,
        });
        runState.lossLedger.push(entry);
      }
    }
  };

  /**
   * Applies one authored `LossRule` through the engine seam and records the
   * loss it observed (GDD §2.3 step C.8 / §2.2.8).
   *
   * The manifest authors `amount` as a magnitude removed, so the signed delta
   * handed to `engine.applyResourceDelta` is `-amount` — the same sign
   * convention `selectDeclaredDelta(source, -1, …)` uses for a cost. The value
   * recorded is **not** that authored magnitude: it is the change read back
   * from `engine.getResources` after the seam applied, which is what makes the
   * ledger an observation rather than arithmetic of the runner's own.
   *
   * Total by construction: a scene close calls this once per matching rule, and
   * the validator guarantees each field is irreversible and each amount is an
   * integer ≥ 1. An adapter that omits the optional resource seam applies
   * nothing, so nothing is recorded (a line never exists without its apply).
   *
   * @param rule  The `losses[]` entry that fired, from the validated manifest.
   * @param state The game state the seam mutates.
   * @returns The appended rule line, or `null` when nothing was observed to fall.
   */
  const applyLossRule = (rule: LossRule, state: TState): RuleLossLedgerEntry | null => {
    const engine = storyline.engine;
    if (engine.applyResourceDelta === undefined) return null;

    const before = readResource(engine.getResources(state), rule.field);
    engine.applyResourceDelta(state, { [rule.field]: -rule.amount });
    const after = readResource(engine.getResources(state), rule.field);
    const delta = after - before;
    if (!(delta < 0)) return null;

    const entry: RuleLossLedgerEntry = Object.freeze({
      kind: 'rule',
      sceneId: runState.currentSceneId,
      ruleId: rule.id,
      field: rule.field,
      delta,
      statement: rule.statement,
    });
    runState.lossLedger.push(entry);
    return entry;
  };

  /** Freezes a copy of the run state so a caller can never mutate the run. */
  const snapshot = (): EpisodeRunState =>
    Object.freeze({
      seed: runState.seed,
      currentActId: runState.currentActId,
      currentSceneId: runState.currentSceneId,
      currentBeatId: runState.currentBeatId,
      sceneClockRemaining: runState.sceneClockRemaining,
      pendingChain: runState.pendingChain,
      sceneHistory: Object.freeze([...runState.sceneHistory]),
      routeHistory: Object.freeze([...runState.routeHistory]),
      lossLedger: Object.freeze(
        runState.lossLedger.map((entry) => Object.freeze({ ...entry })),
      ),
    });

  /**
   * Writes the run through the core versioned-save helper (GDD §3.5.2).
   *
   * The payload carries the schema version and exactly the nine persisted
   * fields. Serialising is a read: no RNG draw, no resource delta.
   */
  const serialize = (): VersionedPayload<SerializedEpisodeRunState> =>
    serializeWithVersion(EpisodeRunStateSerializer, snapshot());

  /**
   * Replaces the run with the payload's state (GDD §3.5.2).
   *
   * Everything is hydrated **before** the first mutation, so a version
   * mismatch or an undeclared scene refuses the restore and leaves the run
   * exactly as it was. A successful restore adopts the saved position, clock,
   * pending chain, histories, ledger and seed; the scene-exit list is cleared
   * because it is not persisted, and the run becomes active again even if it
   * had reached an ending (loading a checkpoint is not the reset action).
   */
  const restore = (payload: VersionedPayload<SerializedEpisodeRunState>): void => {
    const hydrated = hydrateRunState(
      deserializeWithVersion(EpisodeRunStateSerializer, payload),
      manifest,
    );

    runState.seed = hydrated.seed;
    runState.currentActId = hydrated.currentActId;
    runState.currentSceneId = hydrated.currentSceneId;
    runState.currentBeatId = hydrated.currentBeatId;
    runState.sceneClockRemaining = hydrated.sceneClockRemaining;
    runState.budgetExhausted = false;
    runState.pendingChain = hydrated.pendingChain;
    runState.endingCardId = null;
    runState.sceneHistory.length = 0;
    runState.sceneHistory.push(...hydrated.sceneHistory);
    runState.routeHistory.length = 0;
    runState.routeHistory.push(...hydrated.routeHistory);
    runState.lossLedger.length = 0;
    runState.lossLedger.push(...hydrated.lossLedger.map((entry) => ({ ...entry })));
    runState.sceneExits.length = 0;
  };

  /**
   * Enters a beat of the current scene (GDD §2.3 steps A.1–A.3).
   *
   * The clock comparison happens before any mutation, so a refusal leaves the
   * run exactly where it was and never plays the beat. On the affordable path
   * the cost is charged only after the beat's content card and its gated
   * options resolve, so a content defect cannot leave a half-charged entry.
   */
  const enterBeat = (cardId: string, gameState: TState): BeatEntry<TState> => {
    assertRunActive(`enter beat "${cardId}"`);
    const scene = findScene(manifest, runState.currentSceneId);
    if (scene === undefined) {
      throw new Error(
        `Episode runner: current scene "${runState.currentSceneId}" is not declared by the ` +
          `manifest "${manifest.id}". Fix the run state before entering a beat.`,
      );
    }

    const beat = scene.beats.find((candidate) => candidate.cardId === cardId);
    if (beat === undefined) {
      throw new Error(
        `Episode runner: beat "${cardId}" is not assigned to the current scene "${scene.id}". ` +
          'A beat of another scene is entered by routing (GDD §2.3 step 12), not by enterBeat.',
      );
    }

    // A.2 — refusal first: no charge, no position change, no options.
    if (beat.clockCost > runState.sceneClockRemaining) {
      runState.budgetExhausted = true;
      return Object.freeze({
        status: 'refused',
        sceneId: scene.id,
        cardId,
        clockCost: beat.clockCost,
        clockRemaining: runState.sceneClockRemaining,
        reason: 'budget-exhausted',
        budgetExhausted: true,
      });
    }

    const card = content.get(cardId);
    if (card === undefined) {
      throw new Error(
        `Episode runner: beat "${cardId}" in scene "${scene.id}" has no content card in the ` +
          `run's card map. Load the manifest's content file before entering the beat.`,
      );
    }

    const resources = storyline.engine.getResources(gameState);
    const options = gateAffordableOptions(
      storyline.getStorylineOptions(card, gameState),
      resources,
      storyline.resources,
      storyline.affordabilityPolicy ?? 'omit',
    );

    // A.3 — charge only once the beat can actually be presented.
    runState.sceneClockRemaining -= beat.clockCost;
    runState.currentBeatId = cardId;

    return Object.freeze({
      status: 'presented',
      sceneId: scene.id,
      cardId,
      clockCost: beat.clockCost,
      clockRemaining: runState.sceneClockRemaining,
      context: readCardContext(card),
      options: Object.freeze(options),
    });
  };

  /**
   * Resolves a chosen option through the one choice model and classifies the
   * card it pushed (GDD §2.3 steps B.4–B.5).
   *
   * B.4 is a delegation and nothing else: the resolution (effect, cost, extra
   * effect, successor push, outcome prose, journal and log) is the supplied
   * `@story-line` system's work, and the record carries its result by
   * reference. B.5 classifies that result's `pushedCard` against the manifest
   * and records the pending chain on the close cases for the scene close to
   * route.
   */
  const resolveChoice = (
    option: StorylineOption<TState>,
    state: TState,
  ): ChoiceResolution<TCard> => {
    assertRunActive('resolve a choice');
    const card = content.get(runState.currentBeatId);
    if (card === undefined) {
      throw new Error(
        `Episode runner: current beat "${runState.currentBeatId}" has no content card in the ` +
          "run's card map. Load the manifest's content file before resolving a choice.",
      );
    }

    // The chain-loss diff window: the irreversible keys immediately before and
    // after the one choice model resolves. The runner applies nothing here — it
    // reads what the model's engine seam applied.
    const lossSceneId = runState.currentSceneId;
    const lossBeatId = runState.currentBeatId;
    const resourcesBefore = snapshotIrreversible(
      storyline.engine.getResources(state),
      irreversibleKeys,
    );
    const resolution = storyline.resolveStorylineOption(state, card, option);
    const resourcesAfter = snapshotIrreversible(
      storyline.engine.getResources(state),
      irreversibleKeys,
    );
    recordChainLoss(lossSceneId, lossBeatId, resourcesBefore, resourcesAfter);

    // A refused resolution (an unaffordable surfaced option) pushes nothing
    // and touches no run state: the run stays at the beat so the caller can
    // present the choice again. Nothing is classified and no pending chain is
    // recorded, because there is no card to route.
    if (resolution.refusal !== undefined) {
      return Object.freeze({
        next: 'continue' as const,
        case: 'none' as const,
        cardId: null,
        pendingChain: null,
        pushedCard: null,
        resolution,
        refusal: resolution.refusal,
      });
    }

    // `@story-line` pushes an instance card (`le-i-log-0`); the manifest, the
    // scene close and the route targets all speak base ids, so classification
    // compares — and the pending chain records — the adapter's base id.
    const pushedBaseId =
      resolution.pushedCard === null
        ? null
        : storyline.engine.getBaseTypeId(resolution.pushedCard.id);
    const classification = classifyPushedCard(
      manifest,
      assignedCards,
      runState.currentSceneId,
      pushedBaseId,
    );

    // The close cases hand the pending chain to the scene close; a continuing
    // scene leaves the run's pending chain untouched (it is already null, and
    // only the scene close and scene entry own it).
    if (classification.next === 'close') {
      runState.pendingChain = classification.pendingChain;
    }

    return Object.freeze({
      next: classification.next,
      case: classification.case,
      cardId: pushedBaseId,
      pendingChain: classification.pendingChain,
      pushedCard: resolution.pushedCard,
      resolution,
    });
  };

  /**
   * Closes the current scene: objective (C.6), outcome (C.7) and losses (C.8).
   *
   * The objective reads `engine.getResources` exactly once and the outcome
   * table shares that same post-resolution snapshot, so a close observes one
   * moment in time. Loss rules then apply in declaration order through the
   * ledger seam, each appending one ledger line and — when the seam really
   * applied a fall — one activity-log line.
   */
  const closeScene = (state: TState): SceneCloseResult => {
    assertRunActive('close a scene');
    const scene = findScene(manifest, runState.currentSceneId);
    if (scene === undefined) {
      throw new Error(
        `Episode runner: current scene "${runState.currentSceneId}" is not declared by the ` +
          `manifest "${manifest.id}". Fix the run state before closing the scene.`,
      );
    }

    // C.6 — one read of the post-resolution resources for the objective, and
    // the same snapshot feeds every raw-resource condition in the table.
    const resources = storyline.engine.getResources(state);
    const objectiveMet = evaluateCondition(scene.objective.check, resources);

    // C.7 — first match wins in declaration order; `budgetExhausted` is an
    // authored input, never a hard-coded outcome.
    const { ruleId, outcome } = classifySceneOutcome(scene, {
      objectiveMet,
      budgetExhausted: runState.budgetExhausted,
      resources,
    });

    // C.8 — every matching loss, in declaration order. A rule the seam did not
    // apply records no ledger line and therefore no log line either.
    const losses: RuleLossLedgerEntry[] = [];
    for (const rule of scene.losses ?? []) {
      if (rule.on !== outcome) continue;
      const entry = applyLossRule(rule, state);
      if (entry === null) continue;
      losses.push(entry);
      storyline.engine.appendLog(state, formatRuleLossLine(entry), 'loss');
    }

    return Object.freeze({
      sceneId: scene.id,
      objectiveMet,
      outcome,
      ruleId,
      budgetExhausted: runState.budgetExhausted,
      losses: Object.freeze(losses),
    });
  };

  /**
   * Appends the scene-exit record and its two derived activity-log lines
   * (GDD §2.3 step 11).
   *
   * The record is frozen and appended **once** per close, in close order; the
   * log lines are derived from it and from the route, never from the scene data
   * they were built out of.
   */
  const emitSceneExit = (
    record: SceneExitRecord,
    route: SceneRoute,
    target: RouteTargetResolution,
    state: TState,
  ): SceneExitRecord => {
    const frozen = Object.freeze(record);
    runState.sceneExits.push(frozen);
    storyline.engine.appendLog(state, formatSceneExitLine(frozen), 'scene-exit');
    storyline.engine.appendLog(state, formatRouteLine(route, target), 'route');
    return frozen;
  };

  /**
   * Enters a scene at one of its beats (GDD §2.3 step 12).
   *
   * The clock is reset to the target scene's own `budget.clock`, the scene id
   * is pushed onto `sceneHistory`, `pendingChain` and `budgetExhausted` are
   * cleared and every resource — irreversible keys included — is left exactly
   * as the game state holds it.
   */
  const enterScene = (sceneId: string, beatId: string): void => {
    const entry = sceneIndex.get(sceneId);
    if (entry === undefined) {
      throw new Error(
        `Episode runner: cannot enter scene "${sceneId}", which no act of episode ` +
          `"${manifest.id}" declares. Fix the route (validateEpisodeManifest reports ` +
          'unknown-scene).',
      );
    }

    runState.currentActId = entry.actId;
    runState.currentSceneId = entry.scene.id;
    runState.currentBeatId = beatId;
    runState.sceneClockRemaining = entry.scene.budget.clock;
    runState.budgetExhausted = false;
    runState.pendingChain = null;
    runState.sceneHistory.push(entry.scene.id);
  };

  /**
   * Routes the scene close into the next scene or ending (GDD §2.3 steps
   * C.9–C.12): select, resolve, emit one nine-field record, then enter.
   *
   * Every validation (the close's scene, the selected route, the resolved
   * target, the ending card's presence in the run's card map) runs before any
   * mutation, so a route that cannot be taken leaves the run, the record list
   * and the activity log untouched.
   */
  const routeScene = (close: RoutingCloseInput, state: TState): SceneRouteResult<TCard> => {
    assertRunActive('route a scene close');

    if (close.sceneId !== runState.currentSceneId) {
      throw new Error(
        `Episode runner: cannot route the close of scene "${close.sceneId}" while the run is in ` +
          `"${runState.currentSceneId}". Route the scene you just closed, in close order.`,
      );
    }

    const scene = sceneIndex.get(runState.currentSceneId)?.scene;
    if (scene === undefined) {
      throw new Error(
        `Episode runner: current scene "${runState.currentSceneId}" is not declared by the ` +
          `manifest "${manifest.id}". Fix the run state before routing the scene close.`,
      );
    }

    // C.9 — first matching route in declaration order. The gate reads the
    // post-loss resources (steps 6–8 ran before step 9), while the objective
    // and the outcome read the pre-loss snapshot the close took.
    const context: RouteSelectionContext = {
      objectiveMet: close.objectiveMet,
      budgetExhausted: close.budgetExhausted,
      resources: storyline.engine.getResources(state),
      pendingChain: runState.pendingChain,
    };
    const route = selectRoute({ scene, outcome: close.outcome, context });

    // C.10 — resolve the target before anything is recorded or entered.
    const target = resolveRouteTarget(manifest, route.to, runState.pendingChain);
    const endingCard = target.kind === 'ending' ? content.get(target.beatId) : undefined;
    if (target.kind === 'ending' && endingCard === undefined) {
      throw new Error(
        `Episode runner: route "${route.id}" opens ending "${target.beatId}", which has no card ` +
          `in the run's card map. Load the manifest's content file before routing the close.`,
      );
    }

    // C.11 — exactly one nine-field record, appended in close order.
    const exit = emitSceneExit(
      {
        sceneId: scene.id,
        objectiveMet: close.objectiveMet,
        outcome: close.outcome,
        ruleId: close.ruleId,
        routeId: route.id,
        clockSpent: scene.budget.clock - runState.sceneClockRemaining,
        clockRemaining: runState.sceneClockRemaining,
        budgetExhausted: close.budgetExhausted,
        nextBeat: target.beatId,
      },
      route,
      target,
      state,
    );
    runState.routeHistory.push(route.id);

    if (target.kind === 'ending') {
      // The ending presents its card and closes the run; position stays where
      // the closed scene left it until resetRun() begins again.
      runState.pendingChain = null;
      runState.endingCardId = target.beatId;
      return Object.freeze({
        exit,
        route,
        target,
        nextBeat: target.beatId,
        runClosed: true,
        endingCard: endingCard as TCard,
      });
    }

    // C.12 — enter the target scene with a fresh clock and no pending chain.
    enterScene(target.sceneId as string, target.beatId);

    return Object.freeze({
      exit,
      route,
      target,
      nextBeat: target.beatId,
      runClosed: false,
      endingCard: null,
    });
  };

  /**
   * Returns a closed run to the manifest's start (the post-ending restart).
   *
   * The construction seed is kept — it is the run's one RNG stream — while
   * position, clock, pending chain, histories, ledger and the scene-exit list
   * return to their constructed values. Resources are the game's state and stay
   * untouched.
   */
  const resetRun = (): void => {
    if (runState.endingCardId === null) {
      throw new Error(
        'Episode runner: cannot reset a run that has not reached an ending. ' +
          'A restart is the post-ending action of GDD §2.3 step 10.',
      );
    }

    runState.currentActId = start.act;
    runState.currentSceneId = entryScene.id;
    runState.currentBeatId = start.beat;
    runState.sceneClockRemaining = entryScene.budget.clock;
    runState.budgetExhausted = false;
    runState.pendingChain = null;
    runState.endingCardId = null;
    runState.sceneHistory.length = 0;
    runState.routeHistory.length = 0;
    runState.lossLedger.length = 0;
    runState.sceneExits.length = 0;
  };

  return {
    manifest,
    storyline,
    content,
    getState: snapshot,
    serialize,
    restore,
    getSceneExits: () =>
      Object.freeze(runState.sceneExits.map((record) => Object.freeze({ ...record }))),
    getLossLedger: () =>
      Object.freeze(runState.lossLedger.map((entry) => Object.freeze({ ...entry }))),
    enterBeat,
    resolveChoice,
    closeScene,
    routeScene,
    applyLossRule,
    getBudgetExhausted: () => runState.budgetExhausted,
    getEndingCardId: () => runState.endingCardId,
    resetRun,
  };
}
