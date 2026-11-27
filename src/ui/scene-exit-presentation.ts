/**
 * scene-exit-presentation -- shared act/scene exit presentation
 * (CG-0MWR0BJBU005TDTT).
 *
 * A scene's close should read as a *consequence*: the act/scene that just
 * finished, what the objective came to, and which way the story opens next —
 * in that order, not as a single text swap. This module owns the presentation's
 * **schedule**: {@link planSceneExitPresentation} is a pure, Phaser-free
 * function that turns the four presentation fields into an ordered, timed step
 * sequence. The Phaser rendering layer (a later slice) consumes the plan and
 * only has to play it.
 *
 * ## Contract
 *
 * - **Sequenced, never interleaved.** A non-instant plan has exactly three
 *   steps in this order: `title` (act title + optional scene title), `outcome`
 *   (the outcome word) and `route` (where the story goes next). The **last**
 *   step always carries the route, so "what happens next" is the final thing
 *   the player reads.
 * - **Reduced motion presents, never omits.** With `reducedMotion: true` the
 *   plan collapses to a **single** instant step whose text merges all four
 *   fields (act title, scene title, outcome word, route). The information is
 *   identical; only the sequencing is removed. There is no timer, so
 *   `totalMs` and the step's `ms` are `0` and {@link SceneExitPlan.instant} is
 *   `true`.
 * - **Durations are total and testable.** `totalMs` is exactly the sum of the
 *   step durations, `stepMs` defaults to {@link SCENE_EXIT_STEP_MS} and
 *   `autoAdvanceMs` (the dwell after the last step, used by the renderer)
 *   defaults to {@link SCENE_EXIT_AUTO_ADVANCE_MS}. A non-finite or
 *   non-positive timing override falls back to the default rather than
 *   producing a zero-length or `NaN` schedule.
 * - **Plain data only.** Inputs and outputs are plain objects: no Phaser
 *   reference, no scene, no timer. That is what makes the step order, the
 *   reduced-motion collapse and the dwell times assertable in a Node unit test
 *   (and why this module is a candidate for the node-safe manifest once the
 *   Phaser rendering layer is adjacent — that decision belongs to the
 *   exports/node-safety slice, not here).
 * - **Audio is one shared key per stage, and never blocks text.**
 *   {@link resolveSceneExitSfxKey} is a separate pure function that returns a
 *   `COMMON_SFX_KEYS` value — `ROUND_END` when the act closes, `TURN_CHANGE`
 *   when a scene closes inside an act — or `null` to silence it. A game-scoped
 *   or unknown string never leaks through: it falls back to the stage default.
 *   {@link playSceneExitSfx} plays that key best-effort, so a missing,
 *   unplayable or throwing backend cannot abort the presentation; the textual
 *   channel (the plan) is unconditional. The planner itself carries no SFX key
 *   and no tint: the outcome is carried by its printed word
 *   (`success` / `partial` / `failure`).
 *
 * @module ui/scene-exit-presentation
 */

import {
  COMMON_SFX_KEYS,
  type CommonSfxKey,
} from '../core-engine/SoundManager';

// ── Pacing constants ────────────────────────────────────────

/** Default dwell per presentation step, in milliseconds. */
export const SCENE_EXIT_STEP_MS = 1200;

/** Default dwell after the last step before auto-advancing, in milliseconds. */
export const SCENE_EXIT_AUTO_ADVANCE_MS = 3000;

/** Separator used between fields merged into one line of text. */
export const SCENE_EXIT_TEXT_SEPARATOR = ' — ';

/**
 * Shared SFX played when an **act** closes (the round is over).
 *
 * A `COMMON_SFX_KEYS` value, never a game-scoped literal: the key ships in
 * `public/assets/audio/default/` so every distribution can play it.
 */
export const SCENE_EXIT_ACT_CLOSED_SFX: CommonSfxKey =
  COMMON_SFX_KEYS.ROUND_END;

/**
 * Shared SFX played when a **scene** closes inside an act.
 *
 * The closer, smaller beat of the pair: the act is still running, only the
 * scene boundary moved.
 */
export const SCENE_EXIT_SCENE_CLOSED_SFX: CommonSfxKey =
  COMMON_SFX_KEYS.TURN_CHANGE;

// ── Plan shapes ─────────────────────────────────────────────

/**
 * The outcome word a scene exit presents.
 *
 * The word is the presentation's **primary** channel (GDD §3.4.3): colour may
 * only ever be a secondary cue, so the planner carries the word itself.
 */
export type SceneExitOutcome = 'success' | 'partial' | 'failure';

/** Ordered stage a step presents. */
export type SceneExitStepKey = 'title' | 'outcome' | 'route';

/** One timed stage of a scene-exit presentation. */
export interface SceneExitStep {
  /** Which stage this step presents. */
  readonly key: SceneExitStepKey;
  /** The exact text to show for this stage. */
  readonly text: string;
  /** How long the step dwells, in milliseconds (`0` when instant). */
  readonly ms: number;
}

/** Deterministic presentation schedule produced by {@link planSceneExitPresentation}. */
export interface SceneExitPlan {
  /**
   * Ordered steps. A non-instant plan always has exactly three
   * (`title` → `outcome` → `route`); an instant plan has exactly one merged
   * step. The last step of a non-instant plan always carries the route.
   */
  readonly steps: readonly SceneExitStep[];
  /** Sum of every step's `ms` (`0` when instant). */
  readonly totalMs: number;
  /** `true` when the plan must be presented synchronously (reduced motion). */
  readonly instant: boolean;
  /** Resolved per-step dwell, in milliseconds (`0` when instant). */
  readonly stepMs: number;
  /** Resolved dwell after the last step before auto-advancing, in milliseconds. */
  readonly autoAdvanceMs: number;
}

/** Options accepted by {@link planSceneExitPresentation}. */
export interface SceneExitPlanOptions {
  /** The act that is closing. Required and non-blank. */
  readonly actTitle: string;
  /**
   * The scene that is closing. Optional: a game with acts but no scenes (the
   * Gym Long Erasure spike) presents the act alone, and the slot fills once a
   * game has scene-exit data.
   */
  readonly sceneTitle?: string;
  /** The objective's outcome word. Required; one of {@link SceneExitOutcome}. */
  readonly outcome: SceneExitOutcome;
  /** Where the story opens next (the route/beat ahead). Required and non-blank. */
  readonly route: string;
  /**
   * When `true`, collapse to a single instant step carrying all four fields.
   * Defaults to `false`.
   */
  readonly reducedMotion?: boolean;
  /**
   * Dwell per step, in milliseconds. Defaults to {@link SCENE_EXIT_STEP_MS};
   * non-finite or non-positive values fall back to that default.
   */
  readonly stepMs?: number;
  /**
   * Dwell after the last step before auto-advancing, in milliseconds. Defaults
   * to {@link SCENE_EXIT_AUTO_ADVANCE_MS}; non-finite or non-positive values
   * fall back to that default.
   */
  readonly autoAdvanceMs?: number;
}

// ── Internals ───────────────────────────────────────────────

const SCENE_EXIT_OUTCOMES: ReadonlySet<string> = new Set<string>([
  'success',
  'partial',
  'failure',
]);

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveMsOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

function requiredText(value: unknown, field: string): string {
  const text = trimmedString(value);
  if (text.length === 0) {
    throw new TypeError(
      `planSceneExitPresentation: \`${field}\` must be a non-blank string.`,
    );
  }
  return text;
}

/**
 * Resolve the outcome word, rejecting anything that is not one of
 * {@link SceneExitOutcome}. Rejecting (rather than coercing) keeps the printed
 * word honest: the presentation never invents an outcome it was not given.
 */
function requiredOutcome(value: unknown): SceneExitOutcome {
  if (typeof value === 'string' && SCENE_EXIT_OUTCOMES.has(value)) {
    return value as SceneExitOutcome;
  }
  throw new TypeError(
    'planSceneExitPresentation: `outcome` must be one of ' +
      `"success", "partial" or "failure" (received ${JSON.stringify(value)}).`,
  );
}

/** Join the non-blank fields into one line, preserving the given order. */
function mergeText(fields: readonly string[]): string {
  return fields.filter((field) => field.length > 0).join(SCENE_EXIT_TEXT_SEPARATOR);
}

// ── Public API ──────────────────────────────────────────────

/**
 * Plan a scene-exit presentation.
 *
 * Pure and deterministic: the same options always produce the same plan, the
 * input object is never mutated, and no Phaser object is touched — so the step
 * order, the reduced-motion collapse and the dwell times are assertable in a
 * Node unit test.
 *
 * @param options - The four presentation fields plus optional reduced-motion
 *   and timing overrides.
 * @returns The ordered, timed step sequence and its resolved timings.
 * @throws {TypeError} when the options object is missing, or when a required
 *   field (`actTitle`, `route`) is blank or `outcome` is not a known word.
 */
export function planSceneExitPresentation(
  options: SceneExitPlanOptions,
): SceneExitPlan {
  if (!options || typeof options !== 'object') {
    throw new TypeError(
      'planSceneExitPresentation: options must be an object with `actTitle`, ' +
        '`outcome` and `route`.',
    );
  }

  const actTitle = requiredText(options.actTitle, 'actTitle');
  const sceneTitle = trimmedString(options.sceneTitle);
  const outcome = requiredOutcome(options.outcome);
  const route = requiredText(options.route, 'route');
  const autoAdvanceMs = positiveMsOr(
    options.autoAdvanceMs,
    SCENE_EXIT_AUTO_ADVANCE_MS,
  );

  // Reduced motion: the same four fields, one instant step, no schedule.
  if (options.reducedMotion === true) {
    const merged = mergeText([actTitle, sceneTitle, outcome, route]);
    return {
      steps: [{ key: 'title', text: merged, ms: 0 }],
      totalMs: 0,
      instant: true,
      stepMs: 0,
      autoAdvanceMs,
    };
  }

  const stepMs = positiveMsOr(options.stepMs, SCENE_EXIT_STEP_MS);
  const steps: readonly SceneExitStep[] = [
    {
      key: 'title',
      text: mergeText([actTitle, sceneTitle]),
      ms: stepMs,
    },
    { key: 'outcome', text: outcome, ms: stepMs },
    { key: 'route', text: route, ms: stepMs },
  ];

  return {
    steps,
    totalMs: steps.reduce((total, step) => total + step.ms, 0),
    instant: false,
    stepMs,
    autoAdvanceMs,
  };
}

// ── SFX selection (pure, Phaser-free) ──────────────────────

/**
 * SFX selection accepted by a scene exit: a shared {@link CommonSfxKey},
 * `null` to silence it, or `undefined` for the stage default.
 */
export type SceneExitSfxSelection = CommonSfxKey | null | undefined;

/** Options accepted by {@link resolveSceneExitSfxKey}. */
export interface SceneExitSfxOptions {
  /**
   * `true` when the **act** itself closes (the round is over); `false` or
   * omitted when a scene closes inside a running act. Only a strict `true`
   * selects the act-close key.
   */
  readonly actClosed?: boolean;
  /**
   * `true` to silence the presentation entirely (an explicit mute or the
   * reduced-motion contract). Mute wins over any `sfx` override.
   */
  readonly mute?: boolean;
  /**
   * Optional override: a shared {@link CommonSfxKey}, `null` to silence, or
   * `undefined` for the stage default. Any other string (e.g. a game-scoped
   * literal) falls back to the stage default — an unknown key is never played.
   */
  readonly sfx?: SceneExitSfxSelection | string;
}

const COMMON_SFX_VALUES: ReadonlySet<string> = new Set<string>(
  Object.values(COMMON_SFX_KEYS),
);

/**
 * Resolve the single SFX key a scene exit should play.
 *
 * Pure and Phaser-free, so the mapping is assertable in a Node unit test:
 *
 * - `mute: true` → `null` (silence wins over everything);
 * - `sfx: null` → `null` (the caller asked for a silent presentation);
 * - `sfx` is a shared `COMMON_SFX_KEYS` value → that value;
 * - `actClosed: true` → {@link SCENE_EXIT_ACT_CLOSED_SFX} (`ROUND_END`);
 * - otherwise (including an unknown/game-scoped `sfx` string) →
 *   {@link SCENE_EXIT_SCENE_CLOSED_SFX} (`TURN_CHANGE`).
 *
 * Exactly **one** key is ever returned — never a stack of keys — and it is
 * always a shared key or `null`.
 *
 * @param options - The stage (`actClosed`) plus optional `mute`/`sfx` overrides.
 * @returns The shared SFX key to play, or `null` to stay silent.
 */
export function resolveSceneExitSfxKey(
  options?: SceneExitSfxOptions | null,
): CommonSfxKey | null {
  if (options?.mute === true) return null;

  const sfx = options?.sfx;
  if (sfx === null) return null;
  if (typeof sfx === 'string' && COMMON_SFX_VALUES.has(sfx)) {
    return sfx as CommonSfxKey;
  }

  return options?.actClosed === true
    ? SCENE_EXIT_ACT_CLOSED_SFX
    : SCENE_EXIT_SCENE_CLOSED_SFX;
}

/**
 * Minimal sound surface a scene-exit presentation plays through.
 *
 * Satisfied by the engine's `SoundManager` (`play(key): void`) as well as by a
 * lighter backend that reports whether it handled the key.
 */
export interface SceneExitSoundPlayer {
  play(key: string): boolean | void;
}

/**
 * Play a resolved scene-exit SFX, best-effort and total.
 *
 * Audio is a **secondary** channel: it may be missing (no manager), unplayable
 * (no registered/loaded key, or a backend returning `false`) or throw. None of
 * those outcomes may abort the presentation, so every failure is swallowed and
 * reported as `false` — the caller always proceeds with the textual steps.
 *
 * @param soundManager - The injected backend (typically the scene's
 *   `SoundManager`), or `null`/`undefined` when audio is unavailable.
 * @param key - A key from {@link resolveSceneExitSfxKey}; `null` means silent.
 * @returns `true` when the backend accepted playback, `false` when there was
 *   nothing to play, no usable backend, the backend declined, or it threw.
 */
export function playSceneExitSfx(
  soundManager: SceneExitSoundPlayer | null | undefined,
  key: CommonSfxKey | null | undefined,
): boolean {
  if (key === null || key === undefined) return false;
  if (!soundManager || typeof soundManager.play !== 'function') return false;
  try {
    return soundManager.play(key) !== false;
  } catch {
    return false;
  }
}
