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
 *   constructed shape.
 *
 * The single-choice model (compilation, resolution, resource projection and
 * RNG), the game's state and the activity log all stay with the supplied
 * `@story-line` system; this layer adds no second copy of any of them.
 * Nothing here depends on Phaser.
 *
 * @module
 */

import type { EpisodeManifest, Scene } from './content/episode-manifest';
import type {
  EpisodeRunState,
  EpisodeRunner,
  EpisodeRunnerConfig,
  LossLedgerEntry,
  SceneExitRecord,
  StorylineCard,
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

  const state: MutableEpisodeRunState = {
    seed,
    currentActId: start.act,
    currentSceneId: entryScene.id,
    currentBeatId: start.beat,
    sceneClockRemaining: entryScene.budget.clock,
    pendingChain: null,
    sceneHistory: [],
    routeHistory: [],
    lossLedger: [],
    sceneExits: [],
  };

  /** Freezes a copy of the run state so a caller can never mutate the run. */
  const snapshot = (): EpisodeRunState =>
    Object.freeze({
      seed: state.seed,
      currentActId: state.currentActId,
      currentSceneId: state.currentSceneId,
      currentBeatId: state.currentBeatId,
      sceneClockRemaining: state.sceneClockRemaining,
      pendingChain: state.pendingChain,
      sceneHistory: Object.freeze([...state.sceneHistory]),
      routeHistory: Object.freeze([...state.routeHistory]),
      lossLedger: Object.freeze(
        state.lossLedger.map((entry) => Object.freeze({ ...entry })),
      ),
    });

  return {
    manifest,
    storyline,
    content,
    getState: snapshot,
    getSceneExits: () =>
      Object.freeze(state.sceneExits.map((record) => Object.freeze({ ...record }))),
  };
}
