/**
 * scene-exit-presentation -- shared act/scene exit presentation
 * (CG-0MWR0BJBU005TDTT).
 *
 * A scene's close should read as a *consequence*: the act/scene that just
 * finished, what the objective came to, and which way the story opens next —
 * in that order, not as a single text swap. This module owns both halves of
 * that presentation:
 *
 * - {@link planSceneExitPresentation} is the **schedule**: a pure, Phaser-free
 *   function that turns the four presentation fields into an ordered, timed
 *   step sequence (plus {@link resolveSceneExitSfxKey} for the audio cue);
 * - {@link presentSceneExit} is the **rendered layer**: it draws the four
 *   fields as text objects positioned from injected SLL anchors and plays the
 *   plan, resolving a promise when the banner is dismissed.
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
 * - **Plain data only.** Inputs and outputs of the planner are plain objects:
 *   no Phaser reference, no scene, no timer. That is what makes the step
 *   order, the reduced-motion collapse and the dwell times assertable in a
 *   Node unit test. The rendered {@link presentSceneExit} references Phaser
 *   through `import type` only (positions arrive from an injected SLL anchor
 *   callback), so the module can be considered for the node-safe manifest —
 *   that decision belongs to the exports/node-safety slice.
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

import type Phaser from 'phaser';

import {
  COMMON_SFX_KEYS,
  type CommonSfxKey,
} from '../core-engine/SoundManager';
import { FONT_FAMILY } from './constants';
import { getEffectiveReducedMotion } from './ReducedMotion';

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

// ── Rendered presentation (Phaser layer) ────────────────────

/**
 * Display depth of the banner.
 *
 * In-layout, not an overlay (GDD §3.2): above the game board (0–999) so the
 * board cannot draw over it, and **below** the HUD panel depth (1000) so help
 * and settings chrome still sit on top of it.
 */
export const SCENE_EXIT_PRESENTATION_DEPTH = 900;

/**
 * Secondary colour cue per outcome.
 *
 * Colour is **never** the primary channel (GDD §3.4.3): the banner always
 * prints the outcome word, and the tint only reinforces it.
 */
export const SCENE_EXIT_OUTCOME_COLOURS: Readonly<
  Record<SceneExitOutcome, string>
> = {
  success: '#8fe388',
  partial: '#ffd166',
  failure: '#ff8c8c',
};

/**
 * The four SLL anchor names the banner reads.
 *
 * They match the `sceneBanner` zone in the GDD contract fixture
 * (`tests/fixtures/story-line/gdd-presentation-layout.json`), so a game passes
 * a `resolveAnchor` callback backed by `anchorPoint()` and never a pixel.
 */
export type SceneExitAnchorName = 'actTitle' | 'sceneTitle' | 'outcome' | 'route';

/** A resolved SLL anchor, in screen pixels. */
export interface SceneExitAnchorPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Callback that resolves one banner anchor to a screen point.
 *
 * The helper never computes a position itself: every element is placed from
 * this callback (normally `(name) => anchorPoint(layout, 'sceneBanner', name,
 * viewport)`), which is what keeps absolute pixel coordinates out of the
 * presentation (AC1). Returning `null`/`undefined` for an anchor skips that
 * element rather than falling back to a guessed position.
 */
export type SceneExitAnchorResolver = (
  anchor: SceneExitAnchorName,
) => SceneExitAnchorPoint | null | undefined;

/** Pre-resolved anchor map, for callers that already hold the points. */
export type SceneExitAnchors = Partial<
  Record<SceneExitAnchorName, SceneExitAnchorPoint>
>;

/** A scheduled timer that can be cancelled. */
export interface SceneExitPresentationTimer {
  cancel(): void;
}

/**
 * Timer seam used to sequence the presentation.
 *
 * The default implementation wraps Phaser's time plugin; tests inject a manual
 * scheduler so the full sequence runs without waiting on wall-clock time.
 */
export interface SceneExitPresentationScheduler {
  /** Run `callback` once after `delayMs` milliseconds. */
  after(delayMs: number, callback: () => void): SceneExitPresentationTimer;
}

/** Options accepted by {@link presentSceneExit}. */
export interface PresentSceneExitOptions {
  /** The act that is closing. Required and non-blank. */
  readonly actTitle: string;
  /**
   * The scene that is closing. Optional: a game with acts but no scenes (the
   * Gym Long Erasure spike) presents the act alone.
   */
  readonly sceneTitle?: string;
  /** The objective's outcome word — the presentation's primary channel. */
  readonly outcome: SceneExitOutcome;
  /** Where the story opens next. Required and non-blank. */
  readonly route: string;
  /**
   * Resolve one `sceneBanner` SLL anchor. Required unless `anchors` is given —
   * positions must come from the layout, never from absolute pixels.
   */
  readonly resolveAnchor?: SceneExitAnchorResolver;
  /** Pre-resolved `sceneBanner` anchors (alternative to `resolveAnchor`). */
  readonly anchors?: SceneExitAnchors;
  /** Explicit reduced-motion override; defaults to the effective preference. */
  readonly reducedMotion?: boolean;
  /** Injected audio backend (typically the scene's `SoundManager`). */
  readonly soundManager?: SceneExitSoundPlayer | null;
  /** SFX override; `null` silences, an unknown string falls back to the stage key. */
  readonly sfx?: SceneExitSfxSelection | string;
  /** `true` when the act itself closes (selects `ROUND_END` over `TURN_CHANGE`). */
  readonly actClosed?: boolean;
  /** Dwell per step, in milliseconds. Defaults to {@link SCENE_EXIT_STEP_MS}. */
  readonly stepMs?: number;
  /**
   * Dwell after the last step before auto-advancing, in milliseconds.
   * Defaults to {@link SCENE_EXIT_AUTO_ADVANCE_MS}.
   */
  readonly autoAdvanceMs?: number;
  /**
   * When `true` (default), the first pointer/key press reveals every field and
   * dismisses the presentation immediately (no further animation).
   * @default true
   */
  readonly skipOnInput?: boolean;
  /**
   * When `true` (default), the outcome keeps its shared colour as a secondary
   * cue. Set `false` to prove the printed word carries the outcome alone.
   * @default true
   */
  readonly tintOutcome?: boolean;
  /** Timer seam override (tests inject a manual scheduler). */
  readonly scheduler?: SceneExitPresentationScheduler;
  /** Called at most once when the presentation is dismissed or destroyed. */
  readonly onComplete?: () => void;
}

/**
 * Handle to a live scene-exit presentation, returned by
 * {@link presentSceneExit}.
 *
 * `skip()` and `destroy()` are safe to call at any time, in any order, and more
 * than once.
 */
export interface SceneExitPresentationHandle {
  /** The deterministic schedule the presentation is playing. */
  readonly plan: SceneExitPlan;
  /** `true` once the presentation is dismissed (the promise has settled). */
  readonly done: boolean;
  /** `true` once {@link SceneExitPresentationHandle.destroy} has run. */
  readonly destroyed: boolean;
  /**
   * Resolves exactly once — on auto-advance, skip-on-input or `destroy()` — so
   * a caller can sequence its own transition without polling.
   */
  readonly promise: Promise<void>;
  /**
   * Show every field instantly and dismiss with no further animation.
   * Idempotent, and a no-op once the presentation is dismissed or destroyed.
   */
  skip(): void;
  /**
   * Cancel the pending timer, detach every listener (input and scene
   * `shutdown`) and destroy every created text object. Idempotent; a destroy
   * before dismissal also settles the promise and fires `onComplete` once.
   */
  destroy(): void;
}

interface EmitterLike {
  on?: (event: string, handler: () => void) => unknown;
  off?: (event: string, handler: () => void) => unknown;
}

interface BannerTextObjectLike {
  setVisible?: (visible: boolean) => unknown;
  setDepth?: (depth: number) => unknown;
  setOrigin?: (x: number, y: number) => unknown;
  setColor?: (color: string) => unknown;
  setScrollFactor?: (x: number, y?: number) => unknown;
  setText?: (text: string) => unknown;
  destroy?: () => void;
}

interface SceneWithBannerHost {
  add?: {
    text?: (
      x: number,
      y: number,
      text: string,
      style?: Phaser.Types.GameObjects.Text.TextStyle,
    ) => BannerTextObjectLike | null | undefined;
  };
  time?: {
    delayedCall?: (
      delayMs: number,
      callback: () => void,
    ) => { remove?: (dispatchCallback?: boolean) => unknown } | undefined;
  };
  input?: EmitterLike & { keyboard?: EmitterLike | null };
  events?: EmitterLike;
}

interface ListenerBinding {
  emitter: EmitterLike;
  event: string;
  handler: () => void;
  /**
   * `input` bindings (pointer/key skip) belong to the presentation's live
   * phase and are released on dismissal; the `shutdown` binding is the
   * last-resort teardown hook and stays attached until `destroy()`.
   */
  readonly kind: 'input' | 'shutdown';
}

interface BannerFieldStyle {
  readonly fontSize: string;
  readonly fontStyle?: string;
  readonly color: string;
  /** Horizontal origin: `0` for left-anchored labels, `1` for right-anchored. */
  readonly originX: number;
}

/**
 * Build the resolver the presentation uses, preferring the injected callback
 * and falling back to a pre-resolved anchor map.
 */
function createAnchorResolver(
  options: PresentSceneExitOptions,
): SceneExitAnchorResolver {
  if (typeof options.resolveAnchor === 'function') {
    return options.resolveAnchor;
  }
  const anchors = options.anchors;
  if (anchors && typeof anchors === 'object') {
    return (anchor) => anchors[anchor] ?? null;
  }
  throw new TypeError(
    'presentSceneExit: `resolveAnchor` (or `anchors`) is required — every ' +
      'banner element must be positioned from an SLL anchor, never an absolute ' +
      'pixel coordinate.',
  );
}

/** Resolve an anchor to a finite point, or `null` when it is missing/invalid. */
function resolveAnchorPoint(
  resolver: SceneExitAnchorResolver,
  anchor: SceneExitAnchorName,
): SceneExitAnchorPoint | null {
  let point: SceneExitAnchorPoint | null | undefined;
  try {
    point = resolver(anchor);
  } catch {
    return null;
  }
  if (!point || typeof point !== 'object') return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

/** Build the default scheduler over a scene's Phaser time plugin. */
function createSceneScheduler(
  scene: Phaser.Scene,
): SceneExitPresentationScheduler | null {
  const time = (scene as unknown as SceneWithBannerHost | null)?.time;
  if (!time || typeof time.delayedCall !== 'function') return null;
  return {
    after(delayMs, callback) {
      const event = time.delayedCall!(delayMs, callback);
      return {
        cancel() {
          try {
            event?.remove?.(false);
          } catch {
            // ignore: the timer may already be gone (scene shutdown)
          }
        },
      };
    },
  };
}

/**
 * Present an act/scene exit banner.
 *
 * Renders the four presentation fields as **separate** text objects, each
 * positioned from an injected SLL anchor (`actTitle` and `sceneTitle` on the
 * left, `outcome` and `route` on the right — the GDD `sceneBanner` zone
 * geometry) and sequences them in plan order: title → outcome → route. The
 * outcome is printed as a word; colour is only a secondary cue.
 *
 * The returned promise resolves exactly once, on auto-advance, skip-on-input or
 * `destroy()`, so a caller can layer its own scene transition after the banner.
 *
 * ## Camera ownership
 *
 * The helper **never moves the camera**. `runSceneTransition()` (or the game)
 * owns the fade/slide; this presentation only draws in-layout text. That keeps
 * the two layers from double-playing motion (parent AC6).
 *
 * ## Reduced motion
 *
 * With reduced motion (`reducedMotion: true` or the effective preference) every
 * field is shown synchronously in one step: no timer, no input listener and no
 * SFX, and the promise settles immediately. The information is never omitted.
 *
 * ## Teardown
 *
 * Dismissal (auto-advance/skip) resolves the promise and leaves the text on
 * screen for the caller to read during its own transition; only the
 * skip-on-input listeners are released. `destroy()` — also wired to the
 * scene's `shutdown` event, and kept wired after dismissal so a late scene
 * teardown is still total — cancels the pending timer, detaches every listener
 * and destroys every created object. Both are idempotent, `skip()` after
 * `destroy()` is a no-op, and `destroy()` settles the promise (the caller never
 * hangs) exactly once. The reveal is visibility-based, not tween-based, so the
 * helper creates no tweens and teardown cannot strand one; the browser suite
 * asserts both no orphaned objects and no tween residue.
 */
export function presentSceneExit(
  scene: Phaser.Scene,
  options: PresentSceneExitOptions,
): SceneExitPresentationHandle {
  if (!options || typeof options !== 'object') {
    throw new TypeError(
      'presentSceneExit: options must be an object with `actTitle`, ' +
        '`outcome`, `route` and an anchor source.',
    );
  }

  const resolveAnchor = createAnchorResolver(options);
  const shouldReduce = options.reducedMotion ?? getEffectiveReducedMotion();
  const plan = planSceneExitPresentation({
    actTitle: options.actTitle,
    sceneTitle: options.sceneTitle,
    outcome: options.outcome,
    route: options.route,
    reducedMotion: shouldReduce,
    stepMs: options.stepMs,
    autoAdvanceMs: options.autoAdvanceMs,
  });

  const trimmedField = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';
  const fieldTexts: Record<SceneExitAnchorName, string | null> = {
    actTitle: trimmedField(options.actTitle),
    sceneTitle: trimmedField(options.sceneTitle) || null,
    outcome: options.outcome,
    route: trimmedField(options.route),
  };

  const styles: Record<SceneExitAnchorName, BannerFieldStyle> = {
    actTitle: { fontSize: '22px', fontStyle: 'bold', color: '#ffffff', originX: 0 },
    sceneTitle: { fontSize: '16px', color: '#c9d4e5', originX: 0 },
    outcome: {
      fontSize: '22px',
      fontStyle: 'bold',
      color:
        options.tintOutcome === false
          ? '#ffffff'
          : SCENE_EXIT_OUTCOME_COLOURS[options.outcome],
      originX: 1,
    },
    route: { fontSize: '16px', color: '#a9c8ff', originX: 1 },
  };

  const created: Array<{
    field: SceneExitAnchorName;
    object: BannerTextObjectLike;
  }> = [];
  const host = scene as unknown as SceneWithBannerHost | null;
  const add = host?.add;

  let settled = false;
  let destroyed = false;
  let completionFired = false;
  let timer: SceneExitPresentationTimer | null = null;
  const bindings: ListenerBinding[] = [];

  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const stopTimer = (): void => {
    const pending = timer;
    timer = null;
    if (!pending) return;
    try {
      pending.cancel();
    } catch {
      // ignore: the timer may already be gone
    }
  };

  const detach = (binding: ListenerBinding): void => {
    const index = bindings.indexOf(binding);
    if (index >= 0) bindings.splice(index, 1);
    try {
      binding.emitter.off?.(binding.event, binding.handler);
    } catch {
      // ignore: the emitter may already be torn down
    }
  };

  const detachAll = (): void => {
    for (const binding of bindings.slice()) detach(binding);
  };

  /** Release the skip-on-input listeners, keeping the shutdown hook alive. */
  const detachInputBindings = (): void => {
    for (const binding of bindings.slice()) {
      if (binding.kind === 'input') detach(binding);
    }
  };

  const fireComplete = (): void => {
    if (completionFired) return;
    completionFired = true;
    if (!options.onComplete) return;
    try {
      options.onComplete();
    } catch {
      // A caller callback must not leave the presentation half-released.
    }
  };

  const settle = (): void => {
    if (settled) return;
    settled = true;
    stopTimer();
    // The banner stays readable until the caller's own transition ends, so
    // only the skip listeners go; the shutdown hook remains until destroy()
    // so a scene torn down after dismissal still reaches full teardown.
    detachInputBindings();
    resolvePromise();
    fireComplete();
  };

  const showFields = (fields: readonly SceneExitAnchorName[]): void => {
    for (const entry of created) {
      if (!fields.includes(entry.field)) continue;
      try {
        entry.object.setVisible?.(true);
      } catch {
        // A renderer that rejects a visibility change must not abort the step.
      }
    }
  };

  const showAll = (): void => {
    showFields(created.map((entry) => entry.field));
  };

  // Create every field up front (hidden), so nothing is added after the first
  // frame and a skipped presentation can reveal all of it in one pass.
  if (add && typeof add.text === 'function') {
    for (const field of [
      'actTitle',
      'sceneTitle',
      'outcome',
      'route',
    ] as const) {
      const text = fieldTexts[field];
      if (text === null) continue;
      const point = resolveAnchorPoint(resolveAnchor, field);
      if (!point) continue;
      const style = styles[field];
      let object: BannerTextObjectLike | null | undefined;
      try {
        object = add.text(point.x, point.y, text, {
          fontFamily: FONT_FAMILY,
          fontSize: style.fontSize,
          fontStyle: style.fontStyle,
          color: style.color,
        });
      } catch {
        object = null;
      }
      if (!object) continue;
      try {
        object.setOrigin?.(style.originX, 0.5);
        object.setDepth?.(SCENE_EXIT_PRESENTATION_DEPTH);
        // SLL anchors are screen-space: pin the banner so a camera slide does
        // not carry it out of the layout band.
        object.setScrollFactor?.(0);
        object.setVisible?.(false);
      } catch {
        // ignore: a partial text object still renders where it was added
      }
      created.push({ field, object });
    }
  }

  const bindInput = (
    emitter: EmitterLike | null | undefined,
    event: string,
    handler: () => void,
    kind: ListenerBinding['kind'] = 'input',
  ): void => {
    if (!emitter || typeof emitter.on !== 'function') return;
    const binding: ListenerBinding = { emitter, event, handler, kind };
    try {
      emitter.on(event, binding.handler);
      bindings.push(binding);
    } catch {
      // ignore: an emitter without working listeners cannot be wired
    }
  };

  const skip = (): void => {
    if (destroyed || settled) return;
    showAll();
    settle();
  };

  const destroyNow = (): void => {
    if (destroyed) return;
    destroyed = true;
    stopTimer();
    detachAll();
    for (const entry of created.splice(0)) {
      try {
        entry.object.destroy?.();
      } catch {
        // ignore: the object may already be destroyed with the scene
      }
    }
    // A caller awaiting the promise must never hang on an abort.
    if (!settled) {
      settled = true;
      resolvePromise();
    }
    // A destroy before dismissal is also a dismissal: fire the completion
    // callback exactly once (idempotent when a skip/auto-advance got there
    // first).
    fireComplete();
  };

  // Scene shutdown removes the banner even if the caller never destroys it.
  // Bound on every path — including reduced motion, which creates no timer or
  // input listeners — and kept alive after dismissal (see `settle`).
  bindInput(host?.events, 'shutdown', destroyNow, 'shutdown');

  // Reduced motion (or a scene without a renderer/timer): present everything
  // now, with no timer, no input listener and no SFX.
  if (plan.instant) {
    showAll();
    settle();
  } else {
    const key = resolveSceneExitSfxKey({
      actClosed: options.actClosed,
      sfx: options.sfx,
    });
    playSceneExitSfx(options.soundManager, key);

    if (options.skipOnInput !== false) {
      bindInput(host?.input, 'pointerdown', skip);
      bindInput(host?.input?.keyboard, 'keydown', skip);
    }

    const scheduler = options.scheduler ?? (scene ? createSceneScheduler(scene) : null);
    let stepIndex = 0;

    const advance = (): void => {
      if (destroyed || settled) return;
      const step = plan.steps[stepIndex];
      if (!step) {
        settle();
        return;
      }
      showFields(
        step.key === 'title'
          ? ['actTitle', 'sceneTitle']
          : step.key === 'outcome'
            ? ['outcome']
            : ['route'],
      );
      const isLast = stepIndex === plan.steps.length - 1;
      const delay = step.ms + (isLast ? plan.autoAdvanceMs : 0);
      stepIndex += 1;
      if (!scheduler) {
        // No timer available (headless scene): the text is unconditional, so
        // reveal the rest and dismiss immediately.
        showAll();
        settle();
        return;
      }
      try {
        timer = scheduler.after(delay, () => {
          timer = null;
          if (destroyed || settled) return;
          if (stepIndex >= plan.steps.length) {
            settle();
          } else {
            advance();
          }
        });
      } catch {
        // A throwing scheduler must never block the textual channel.
        showAll();
        settle();
      }
    };

    advance();
  }

  return {
    get plan() {
      return plan;
    },
    get done() {
      return settled;
    },
    get destroyed() {
      return destroyed;
    },
    promise,
    skip,
    destroy: destroyNow,
  };
}
