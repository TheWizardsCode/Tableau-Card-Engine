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
 * - the loss ledger (GDD §2.2.8): one `chain` line per irreversible key that
 *   fell across a resolution (observed by diffing `engine.getResources`, never
 *   computed), and one `rule` line per authored `LossRule` the scene close
 *   applies through the engine seam. The ledger never holds a positive line.
 *
 * The single-choice model (compilation, resolution, resource projection and
 * RNG), the game's state and the activity log all stay with the supplied
 * `@story-line` system; this layer adds no second copy of any of them.
 * Nothing here depends on Phaser.
 *
 * @module
 */

import { isOptionAffordable } from './compile';
import type { EpisodeManifest, LossRule, Scene } from './content/episode-manifest';
import { readResource, type StorylineResourceKey, type StorylineResources } from './resources';
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
  RuleLossLedgerEntry,
  SceneExitRecord,
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
  readonly seed: number;
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
  readonly sceneHistory: string[];
  readonly routeHistory: string[];
  readonly lossLedger: LossLedgerEntry[];
  readonly sceneExits: SceneExitRecord[];
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
 * Presents only the options the declared-key affordability gate accepts.
 *
 * The gate is the shipped {@link isOptionAffordable} helper over the manifest's
 * declared keys (`storyline.resources`) — the runner never re-derives
 * affordability. Registry-authored options are already filtered at draw time;
 * CSV-authored options are not, so this gate is what makes step A.3 true for
 * the content path.
 *
 * @param options          The beat's compiled options, in authored order.
 * @param resources        Current resource values (the engine projection).
 * @param declaredResources The run's declared resource keys.
 */
function gateAffordableOptions<TState>(
  options: readonly StorylineOption<TState>[],
  resources: StorylineResources,
  declaredResources: readonly StorylineResourceKey[],
): StorylineOption<TState>[] {
  return options.filter((option) => isOptionAffordable(option, resources, declaredResources));
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
 * @param config The validated manifest, the one storyline system, the content
 *               card map and the run's seed.
 * @returns A runner whose `getState()` reads the constructed run state.
 * @throws Error when the manifest's `start.scene` names no scene in any act.
 */
export function createEpisodeRunner<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
>(config: EpisodeRunnerConfig<TState, TCard>): EpisodeRunner<TState, TCard> {
  const { manifest, storyline, content, seed } = config;
  const start = manifest.start;
  const entryScene = findScene(manifest, start.scene);

  if (entryScene === undefined) {
    throw new Error(
      `Episode runner: manifest "${manifest.id}" starts at unknown scene "${start.scene}". ` +
        'Fix start.scene (validateEpisodeManifest reports unknown-scene).',
    );
  }

  const assignedCards = buildAssignedCardIndex(manifest);

  const runState: MutableEpisodeRunState = {
    seed,
    currentActId: start.act,
    currentSceneId: entryScene.id,
    currentBeatId: start.beat,
    sceneClockRemaining: entryScene.budget.clock,
    budgetExhausted: false,
    pendingChain: null,
    sceneHistory: [],
    routeHistory: [],
    lossLedger: [],
    sceneExits: [],
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
   * Enters a beat of the current scene (GDD §2.3 steps A.1–A.3).
   *
   * The clock comparison happens before any mutation, so a refusal leaves the
   * run exactly where it was and never plays the beat. On the affordable path
   * the cost is charged only after the beat's content card and its gated
   * options resolve, so a content defect cannot leave a half-charged entry.
   */
  const enterBeat = (cardId: string, gameState: TState): BeatEntry<TState> => {
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

  return {
    manifest,
    storyline,
    content,
    getState: snapshot,
    getSceneExits: () =>
      Object.freeze(runState.sceneExits.map((record) => Object.freeze({ ...record }))),
    getLossLedger: () =>
      Object.freeze(runState.lossLedger.map((entry) => Object.freeze({ ...entry }))),
    enterBeat,
    resolveChoice,
    applyLossRule,
    getBudgetExhausted: () => runState.budgetExhausted,
  };
}
