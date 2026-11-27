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
 * - **Audio and colour belong to the presentation layer.** The planner carries
 *   no SFX key and no tint: the outcome is carried by its printed word
 *   (`success` / `partial` / `failure`), and the SFX resolver is a separate
 *   pure function in this module's sibling slice.
 *
 * @module ui/scene-exit-presentation
 */

// ── Pacing constants ────────────────────────────────────────

/** Default dwell per presentation step, in milliseconds. */
export const SCENE_EXIT_STEP_MS = 1200;

/** Default dwell after the last step before auto-advancing, in milliseconds. */
export const SCENE_EXIT_AUTO_ADVANCE_MS = 3000;

/** Separator used between fields merged into one line of text. */
export const SCENE_EXIT_TEXT_SEPARATOR = ' — ';

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
