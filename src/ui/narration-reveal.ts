/**
 * narration-reveal -- shared progressive prose reveal helper
 * (CG-0MWO7CULE001IWU1).
 *
 * A choice's consequence should arrive as a **story beat**, not a silent text
 * swap. `revealNarration()` progressively reveals a prose block into an
 * existing text object (or a container holding one) with a shared
 * `COMMON_SFX_KEYS` sound, and exposes a handle so the caller can finish the
 * reveal instantly (`complete()`) or abort it (`destroy()`).
 *
 * ## Contract
 *
 * - **Progressive by default.** The prose is revealed in ordered slices
 *   (typewriter style) on a single repeating timer. The whole reveal is
 *   bounded: short prose still takes at least {@link
 *   NARRATION_REVEAL_MIN_TOTAL_MS}, long prose never exceeds {@link
 *   NARRATION_REVEAL_MAX_TOTAL_MS}.
 * - **Always readable instantly.** `reducedMotion: true` (or the effective
 *   reduced-motion preference) and a `skipOnInput` pointer/key press both put
 *   the **full prose** on screen synchronously. The textual channel is never
 *   conditional on animation or audio.
 * - **Audio never blocks text.** The SFX is played through an injected
 *   `SoundManager` using a {@link CommonSfxKey}; a missing key, a throwing
 *   backend or no sound manager at all cannot stop the reveal. Per the shared
 *   accessibility contract (`docs/ui-animations.md` → Accessibility), SFX are
 *   suppressed when reduced motion is in effect.
 * - **No leaks.** `complete()` and `destroy()` are idempotent. A destroyed
 *   handle cancels its timer, detaches every input listener it registered and
 *   leaves the target with the text revealed so far (the target itself is
 *   owned by the caller and is never destroyed by the helper).
 *
 * ## Node safety
 *
 * This module is listed in `src/ui/node-safe-modules.ts`: it references Phaser
 * **only** through `import type` (elided at compile time), so it imports
 * cleanly in a plain Node environment. Unit tests drive it with a fake system
 * scheduler (the `scheduler` seam), which is why the scheduling decision —
 * {@link planNarrationReveal} — is a pure function.
 *
 * @module ui/narration-reveal
 */

import type Phaser from 'phaser';
import {
  COMMON_SFX_KEYS,
  type CommonSfxKey,
} from '../core-engine/SoundManager';
import { getEffectiveReducedMotion } from './ReducedMotion';

// ── Pacing constants ────────────────────────────────────────

/** Default milliseconds of reveal time per prose character. */
export const NARRATION_REVEAL_MS_PER_CHARACTER = 28;

/** Fastest permitted step interval (ms) — keeps the reveal readable. */
export const NARRATION_REVEAL_MIN_STEP_MS = 16;

/** Slowest permitted step interval (ms). */
export const NARRATION_REVEAL_MAX_STEP_MS = 60;

/** Shortest total reveal duration (ms), so a one-word beat is still visible. */
export const NARRATION_REVEAL_MIN_TOTAL_MS = 400;

/** Longest total reveal duration (ms), so a long paragraph cannot crawl. */
export const NARRATION_REVEAL_MAX_TOTAL_MS = 9000;

/**
 * Default SFX key for a narration reveal.
 *
 * The helper only ever plays a {@link CommonSfxKey} — never a game-scoped SFX
 * literal (AC3). A "reveal" beat is the closest shared semantic, and the key
 * ships in `public/assets/audio/default/` so every distribution can play it.
 */
export const NARRATION_REVEAL_DEFAULT_SFX: CommonSfxKey =
  COMMON_SFX_KEYS.SCORE_REVEAL;

// ── Scheduling decision (pure, Phaser-free) ─────────────────

/** Options accepted by {@link planNarrationReveal}. */
export interface NarrationRevealPlanOptions {
  /**
   * When `true`, the plan is instant: one step containing the full prose and a
   * zero duration. Defaults to `false`.
   */
  reducedMotion?: boolean;
  /**
   * Milliseconds of reveal time per prose character.
   * Non-finite or non-positive values fall back to
   * {@link NARRATION_REVEAL_MS_PER_CHARACTER}.
   */
  msPerCharacter?: number;
  /** Override for the total-duration ceiling. */
  maxTotalMs?: number;
}

/** Ordered, deterministic reveal schedule produced by {@link planNarrationReveal}. */
export interface NarrationRevealPlan {
  /** The prose being revealed, verbatim. */
  readonly prose: string;
  /** Milliseconds between visible steps (`0` when instant). */
  readonly stepMs: number;
  /**
   * Progressive text states in order; the last entry is always the full prose.
   * An instant plan has a single entry.
   */
  readonly steps: readonly string[];
  /** Total reveal duration in milliseconds (`0` when instant). */
  readonly totalMs: number;
  /** `true` when the reveal must complete synchronously (reduced motion/empty). */
  readonly instant: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/**
 * Plan a narration reveal.
 *
 * Pure and deterministic, so the step schedule (and therefore the reveal's
 * pacing) is unit-testable without a Phaser scene or a timer:
 *
 * - Empty prose and `reducedMotion: true` produce an **instant** plan whose
 *   single step is the full prose.
 * - Otherwise the total duration is `length * msPerCharacter`, clamped to
 *   [`NARRATION_REVEAL_MIN_TOTAL_MS`, `maxTotalMs`], and the step interval is
 *   the per-character duration clamped to
 *   [`NARRATION_REVEAL_MIN_STEP_MS`, `NARRATION_REVEAL_MAX_STEP_MS`]. The step
 *   count is `ceil(totalMs / stepMs)` and step *i* reveals the first
 *   `ceil(length * i / stepCount)` characters — monotonic, never longer than
 *   the prose, and exactly the full prose on the final step.
 */
export function planNarrationReveal(
  prose: string,
  options: NarrationRevealPlanOptions = {},
): NarrationRevealPlan {
  const text = typeof prose === 'string' ? prose : String(prose ?? '');
  const shouldReduce = options.reducedMotion === true;
  if (text.length === 0 || shouldReduce) {
    return {
      prose: text,
      stepMs: 0,
      steps: [text],
      totalMs: 0,
      instant: true,
    };
  }

  const msPerCharacter = positiveOr(
    options.msPerCharacter,
    NARRATION_REVEAL_MS_PER_CHARACTER,
  );
  const maxTotalMs = positiveOr(
    options.maxTotalMs,
    NARRATION_REVEAL_MAX_TOTAL_MS,
  );
  const totalMs = Math.min(
    maxTotalMs,
    Math.max(
      NARRATION_REVEAL_MIN_TOTAL_MS,
      Math.min(NARRATION_REVEAL_MAX_TOTAL_MS, Math.round(text.length * msPerCharacter)),
    ),
  );
  const stepMs = clamp(
    Math.round(msPerCharacter),
    NARRATION_REVEAL_MIN_STEP_MS,
    NARRATION_REVEAL_MAX_STEP_MS,
  );
  const stepCount = Math.max(1, Math.ceil(totalMs / stepMs));
  const steps = Array.from({ length: stepCount }, (_unused, index) =>
    text.slice(0, Math.ceil((text.length * (index + 1)) / stepCount)),
  );

  return {
    prose: text,
    stepMs,
    steps,
    totalMs,
    instant: false,
  };
}

// ── SFX key selection (pure) ────────────────────────────────

const COMMON_SFX_VALUES: ReadonlySet<string> = new Set<string>(
  Object.values(COMMON_SFX_KEYS),
);

/**
 * SFX selection accepted by a reveal: a shared {@link CommonSfxKey}, `null` to
 * silence the reveal, or `undefined` for {@link NARRATION_REVEAL_DEFAULT_SFX}.
 */
export type NarrationSfxSelection = CommonSfxKey | null | undefined;

/**
 * Resolve the SFX key a reveal should play.
 *
 * Only a {@link CommonSfxKey} is ever played (AC3):
 *
 * - `undefined` → {@link NARRATION_REVEAL_DEFAULT_SFX};
 * - a shared `COMMON_SFX_KEYS` value → that value;
 * - `null` → `null` (the caller asked for a silent reveal);
 * - anything else (e.g. a game-scoped literal) → {@link
 *   NARRATION_REVEAL_DEFAULT_SFX}, never the unknown key.
 */
export function resolveNarrationSfxKey(
  sfx?: NarrationSfxSelection | string,
): CommonSfxKey | null {
  if (sfx === null) return null;
  if (typeof sfx === 'string' && COMMON_SFX_VALUES.has(sfx)) {
    return sfx as CommonSfxKey;
  }
  return NARRATION_REVEAL_DEFAULT_SFX;
}

// ── Target resolution (pure enough to unit-test) ────────────

/** Writes the visible text state; the only thing the reveal needs from a target. */
export type NarrationTextWriter = (text: string) => void;

/** A Phaser text object or a container holding one. */
export type NarrationRevealTarget =
  | Phaser.GameObjects.Text
  | Phaser.GameObjects.Container;

interface TextLike {
  setText?: (text: string) => unknown;
}

interface ContainerLike {
  list?: unknown;
}

/**
 * Resolve a target to a text writer.
 *
 * Accepts a text object directly (anything with `setText`) or a container whose
 * first text-like child is used — so a scene can lay its narration block out
 * inside a container and still reveal into it. Returns `null` when the target
 * exposes nothing writable; the reveal then still runs (the textual channel
 * degrades quietly rather than throwing).
 */
export function resolveNarrationTextWriter(
  target: NarrationRevealTarget | null | undefined,
): NarrationTextWriter | null {
  if (!target || typeof target !== 'object') return null;

  const direct = (target as TextLike).setText;
  if (typeof direct === 'function') {
    return (text: string) => {
      direct.call(target, text);
    };
  }

  const list = (target as ContainerLike).list;
  if (Array.isArray(list)) {
    for (const child of list) {
      const setText = (child as TextLike | null)?.setText;
      if (typeof setText === 'function') {
        return (text: string) => {
          setText.call(child, text);
        };
      }
    }
  }

  return null;
}

// ── Scheduler seam ──────────────────────────────────────────

/** A scheduled repeating tick that can be cancelled. */
export interface NarrationRevealTimer {
  cancel(): void;
}

/**
 * Repeating-timer seam.
 *
 * The default implementation wraps Phaser's time plugin; unit tests inject a
 * fake and drive the reveal by hand, so the full reveal lifecycle runs in a
 * plain Node environment with no scene and no wall-clock waiting.
 */
export interface NarrationRevealScheduler {
  /** Run `onStep` every `stepMs` milliseconds until the timer is cancelled. */
  every(stepMs: number, onStep: () => void): NarrationRevealTimer;
}

interface EmitterLike {
  on?: (event: string, handler: () => void) => unknown;
  off?: (event: string, handler: () => void) => unknown;
}

interface SceneWithTimers {
  time?: {
    addEvent?: (config: {
      delay: number;
      loop: boolean;
      callback: () => void;
    }) => { remove?: (dispatchCallback?: boolean) => unknown } | undefined;
  };
  input?: EmitterLike & { keyboard?: EmitterLike | null };
  events?: EmitterLike;
}

/**
 * Build the default scheduler over a scene's Phaser time plugin.
 *
 * Returns `null` when the scene exposes no usable timer (headless test scene,
 * minimal double). The caller then completes the reveal immediately: the text
 * is the unconditional channel, so a missing timer degrades to "instant"
 * rather than leaving the prose half-revealed.
 */
function createSceneScheduler(
  scene: Phaser.Scene,
): NarrationRevealScheduler | null {
  const time = (scene as unknown as SceneWithTimers | null)?.time;
  if (!time || typeof time.addEvent !== 'function') return null;

  return {
    every(stepMs, onStep) {
      const event = time.addEvent!({
        delay: stepMs,
        loop: true,
        callback: onStep,
      });
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

// ── Public API ──────────────────────────────────────────────

/** Minimal sound surface the reveal needs — satisfied by `SoundManager`. */
export interface NarrationSoundPlayer {
  play(key: string): void;
}

/** Options for {@link revealNarration}. */
export interface RevealNarrationOptions {
  /** The scene that owns the reveal timer and the input listeners. */
  scene: Phaser.Scene;
  /**
   * The text object to write into, or a container holding one. The helper never
   * destroys the target — its lifecycle stays with the caller.
   */
  target: NarrationRevealTarget;
  /**
   * The prose to reveal, verbatim. The rules/content layer owns the copy; the
   * helper never re-words or truncates it.
   */
  prose: string;
  /**
   * Explicit reduced-motion override. When omitted the effective preference is
   * read via `getEffectiveReducedMotion()` (explicit setting → media query).
   */
  reducedMotion?: boolean;
  /** Injected audio backend (typically the scene's `SoundManager`). */
  soundManager?: NarrationSoundPlayer | null;
  /**
   * SFX to play when the reveal starts. Defaults to
   * {@link NARRATION_REVEAL_DEFAULT_SFX}; `null` silences the reveal.
   */
  sfx?: NarrationSfxSelection;
  /**
   * When `true` (default), the first pointer or key input completes the reveal
   * instantly with the full prose. Set `false` to let the reveal run to the end
   * regardless of input.
   * @default true
   */
  skipOnInput?: boolean;
  /** Reveal speed override (milliseconds per character). */
  msPerCharacter?: number;
  /** Timer seam override (unit tests inject a fake). */
  scheduler?: NarrationRevealScheduler;
  /** Called at most once when the reveal reaches the full prose. */
  onComplete?: () => void;
}

/**
 * Handle to a live narration reveal, returned by {@link revealNarration}.
 *
 * `complete()` and `destroy()` are safe to call at any time, in any order, and
 * more than once.
 */
export interface NarrationRevealHandle {
  /** The prose being revealed, verbatim. */
  readonly prose: string;
  /** The deterministic schedule this reveal is running. */
  readonly plan: NarrationRevealPlan;
  /** The text currently applied to the target. */
  readonly text: string;
  /** `true` once the full prose is on screen. */
  readonly done: boolean;
  /** `true` once {@link NarrationRevealHandle.destroy} has run. */
  readonly destroyed: boolean;
  /** Finish instantly: put the full prose on screen and release all resources. */
  complete(): void;
  /** Abort: cancel the timer, detach listeners, leave the text as it stands. */
  destroy(): void;
}

interface ListenerBinding {
  emitter: EmitterLike;
  event: string;
  handler: () => void;
}

/**
 * Progressively reveal `prose` into `target`, with a shared SFX.
 *
 * Under reduced motion (explicit flag or effective preference) the full prose
 * is applied synchronously, no timer is created and no SFX plays. Otherwise the
 * reveal schedules one repeating timer from the `scheduler` seam (Phaser's time
 * plugin by default), plays a `COMMON_SFX_KEYS` sound through the injected
 * `soundManager`, and — when `skipOnInput` is on — completes on the first
 * pointer or key input.
 */
export function revealNarration(
  options: RevealNarrationOptions,
): NarrationRevealHandle {
  const {
    scene,
    target,
    prose,
    reducedMotion,
    soundManager,
    sfx,
    skipOnInput = true,
    msPerCharacter,
    scheduler,
    onComplete,
  } = options;

  const shouldReduce = reducedMotion ?? getEffectiveReducedMotion();
  const plan = planNarrationReveal(prose, { reducedMotion: shouldReduce, msPerCharacter });
  const writeText = resolveNarrationTextWriter(target);

  let currentText = '';
  let stepIndex = 0;
  let completed = false;
  let destroyed = false;
  let completionFired = false;
  let timer: NarrationRevealTimer | null = null;
  const bindings: ListenerBinding[] = [];

  const applyText = (text: string): void => {
    currentText = text;
    if (!writeText) return;
    try {
      writeText(text);
    } catch {
      // A target that rejects writes must not break the reveal lifecycle.
    }
  };

  const fireComplete = (): void => {
    if (completionFired) return;
    completionFired = true;
    if (!onComplete) return;
    try {
      onComplete();
    } catch {
      // A caller callback must not leave the reveal half-released.
    }
  };

  const stopTimer = (): void => {
    const pending = timer;
    timer = null;
    if (!pending) return;
    try {
      pending.cancel();
    } catch {
      // ignore: timer may already be gone
    }
  };

  const detach = (binding: ListenerBinding): void => {
    const index = bindings.indexOf(binding);
    if (index >= 0) bindings.splice(index, 1);
    try {
      binding.emitter.off?.(binding.event, binding.handler);
    } catch {
      // ignore: emitter may already be torn down
    }
  };

  const detachAll = (): void => {
    for (const binding of bindings.slice()) detach(binding);
  };

  const finish = (): void => {
    if (completed || destroyed) return;
    applyText(plan.prose);
    completed = true;
    stopTimer();
    detachAll();
    fireComplete();
  };

  const destroyNow = (): void => {
    if (destroyed) return;
    destroyed = true;
    stopTimer();
    detachAll();
  };

  const onStep = (): void => {
    if (destroyed || completed) return;
    const next = plan.steps[stepIndex];
    if (next === undefined) {
      finish();
      return;
    }
    stepIndex += 1;
    applyText(next);
    if (stepIndex >= plan.steps.length) finish();
  };

  const bindInput = (
    emitter: EmitterLike | null | undefined,
    event: string,
    handler: () => void,
  ): void => {
    if (!emitter || typeof emitter.on !== 'function') return;
    const binding: ListenerBinding = { emitter, event, handler };
    try {
      emitter.on(event, binding.handler);
      bindings.push(binding);
    } catch {
      // ignore: an emitter without working listeners cannot be wired
    }
  };

  // Reduced motion (or empty prose): full text now, no timer, no listeners, no
  // SFX. Callbacks fire synchronously, matching the shared reduced-motion
  // contract (`docs/ui-animations.md` → Accessibility).
  if (plan.instant) {
    applyText(plan.prose);
    completed = true;
    fireComplete();
  } else {
    applyText('');
    const key = resolveNarrationSfxKey(sfx);
    if (key !== null) {
      try {
        soundManager?.play?.(key);
      } catch {
        // A throwing/missing backend must never block the textual channel.
      }
    }

    if (skipOnInput) {
      const sceneLike = scene as unknown as SceneWithTimers | null;
      bindInput(sceneLike?.input, 'pointerdown', finish);
      bindInput(sceneLike?.input?.keyboard, 'keydown', finish);
    }
    // Scene shutdown must not leave a timer or listeners behind — and must not
    // fire `onComplete`: the narration was aborted, not finished.
    bindInput((scene as unknown as SceneWithTimers | null)?.events, 'shutdown', destroyNow);

    const activeScheduler = scheduler ?? createSceneScheduler(scene);
    if (!activeScheduler) {
      // No timer available (headless): the text is unconditional, so finish.
      finish();
    } else {
      try {
        const scheduled = activeScheduler.every(plan.stepMs, onStep);
        if (completed || destroyed) {
          try {
            scheduled.cancel();
          } catch {
            // ignore
          }
        } else {
          timer = scheduled;
        }
      } catch {
        finish();
      }
    }
  }

  return {
    get prose() {
      return plan.prose;
    },
    get plan() {
      return plan;
    },
    get text() {
      return currentText;
    },
    get done() {
      return completed;
    },
    get destroyed() {
      return destroyed;
    },
    complete() {
      finish();
    },
    destroy() {
      destroyNow();
    },
  };
}
