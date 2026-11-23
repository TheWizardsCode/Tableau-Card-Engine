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
 *   `budget-exhausted` close trigger.
 *
 * The single-choice model (compilation, resolution, resource projection and
 * RNG), the game's state and the activity log all stay with the supplied
 * `@story-line` system; this layer adds no second copy of any of them.
 * Nothing here depends on Phaser.
 *
 * @module
 */

import { isOptionAffordable } from './compile';
import type { EpisodeManifest, Scene } from './content/episode-manifest';
import type { StorylineResourceKey, StorylineResources } from './resources';
import type {
  BeatEntry,
  EpisodeRunState,
  EpisodeRunner,
  EpisodeRunnerConfig,
  LossLedgerEntry,
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

  return {
    manifest,
    storyline,
    content,
    getState: snapshot,
    getSceneExits: () =>
      Object.freeze(runState.sceneExits.map((record) => Object.freeze({ ...record }))),
    enterBeat,
    getBudgetExhausted: () => runState.budgetExhausted,
  };
}
