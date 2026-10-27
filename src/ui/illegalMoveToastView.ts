/**
 * illegalMoveToastView -- Phaser rendering half of the illegal-move reason
 * toast.
 *
 * `showIllegalMoveToast` renders the rules-layer rejection reason (from
 * {@link module:ui/shakeIllegalMove}'s `reason` option, itself supplied by
 * the caller) as a single **transient** toast: non-interactive text that sits
 * above the board, auto-dismisses after the dwell, can be dismissed early,
 * and is destroyed on scene shutdown so it can never leak across scenes.
 *
 * Guarantees (CG-0MVPXFHBZ004LGEB):
 * - At most **one** live toast per scene (AC "performance"): a second
 *   `showIllegalMoveToast` inside the dwell window replaces the text and
 *   restarts the timer instead of stacking (AC4).
 * - The toast is never interactive and renders with a plain text object
 *   (via `createHudText`), so it never swallows pointer input intended for
 *   cards, slots or buttons (AC2). Text objects are not interactive by
 *   default; no `input` code is touched.
 * - No slide/fade/scale animation in **any** mode — not even reduced motion.
 *   The toast appears instantly, holds for its full dwell, and disappears
 *   instantly, so the explanation channel never depends on animation
 *   (AC3). Dismissal schedules a single `delayedCall`; no per-frame tweens
 *   are ever left running (AC "performance").
 * - Rendering is best-effort: in headless/test environments that lack
 *   `scene.add.text` or `scene.time` the model clock still ticks correctly
 *   and the function degrades to `undefined` instead of throwing.
 *
 * The text/timing model is framework-free and lives in
 * {@link module:ui/illegalMoveToast}.
 *
 * @module ui/illegalMoveToastView
 */

import Phaser from 'phaser';
import { createHudText } from './Renderer';
import { IllegalMoveToastModel } from './illegalMoveToast';
import {
  GAME_W,
  ILLEGAL_MOVE_TOAST_COLOR,
  ILLEGAL_MOVE_TOAST_DEPTH,
  ILLEGAL_MOVE_TOAST_FONT_SIZE,
  ILLEGAL_MOVE_TOAST_MAX_WIDTH,
  ILLEGAL_MOVE_TOAST_STROKE_COLOR,
  ILLEGAL_MOVE_TOAST_STROKE_THICKNESS,
  ILLEGAL_MOVE_TOAST_Y,
} from './constants';

/** Options for {@link showIllegalMoveToast}. */
export interface ShowIllegalMoveToastOptions {
  /** The Phaser scene that owns the toast text object. */
  scene: Phaser.Scene;
  /**
   * The player-facing explanation to display. Shown verbatim — the rules
   * layer owns the copy (AC8). Empty/whitespace-only text is a no-op.
   */
  text: string;
  /**
   * Dwell time in milliseconds before auto-dismissal.
   * @default 2500 ({@link ILLEGAL_MOVE_TOAST_DWELL_MS})
   */
  dwellMs?: number;
}

/**
 * Handle to a live illegal-move toast, returned by
 * {@link showIllegalMoveToast}. Lets the caller inspect and dismiss the
 * toast early (AC2).
 */
export interface IllegalMoveToastHandle {
  /** The text currently shown (the model's view of it). */
  readonly text: string | null;
  /** The underlying text/timing model. */
  readonly model: IllegalMoveToastModel;
  /** The Phaser text object backing the toast. */
  readonly gameObject: Phaser.GameObjects.Text;
  /** Hide the toast immediately and destroy its text object. */
  dismiss(): void;
}

/** Per-scene live toast state. */
interface ToastEntry {
  model: IllegalMoveToastModel;
  gameObject: Phaser.GameObjects.Text;
  timer?: Phaser.Time.TimerEvent;
}

/** Scene events after which any live toast must be destroyed (AC4). */
const SHUTDOWN_EVENTS = ['shutdown', 'destroy'] as const;

/** At most one live toast per scene, keyed weakly so scenes can be GC'd. */
const entries = new WeakMap<Phaser.Scene, ToastEntry>();

/** Scenes whose shutdown listeners are already registered (dedupe). */
const cleanupBound = new WeakSet<Phaser.Scene>();

/** Drain a scene's live toast (timer + text object), no-throw. */
function drainEntry(entry: ToastEntry): void {
  try {
    entry.timer?.remove?.(false);
  } catch {
    // ignore: timer may already be gone
  }
  entry.timer = undefined;
  try {
    entry.gameObject.destroy();
  } catch {
    // ignore: headless test doubles may lack destroy
  }
  entry.model.dismiss();
}

/** Destroy the toast for `scene` if it is still the live one. */
function dismissEntry(scene: Phaser.Scene, entry: ToastEntry): void {
  if (entries.get(scene) !== entry) return;
  entries.delete(scene);
  drainEntry(entry);
}

/** Schedule auto-dismissal for `entry`, replacing any pending timer. */
function schedule(scene: Phaser.Scene, entry: ToastEntry): void {
  try {
    entry.timer?.remove?.(false);
  } catch {
    // ignore
  }
  entry.timer = undefined;
  const time = (scene as SceneWithTime).time;
  if (!time || typeof time.delayedCall !== 'function') return;
  entry.timer = time.delayedCall(entry.model.dwellMs, () => dismissEntry(scene, entry));
}

/** Minimal time-plugin surface used by the toast (headless-tolerant). */
interface SceneWithTime {
  time?: { delayedCall?: (delay: number, callback: () => void) => Phaser.Time.TimerEvent };
}

/** Register once-per-scene shutdown cleanup so toasts cannot leak (AC4). */
function bindSceneCleanup(scene: Phaser.Scene): void {
  if (cleanupBound.has(scene)) return;
  const events = (scene as Phaser.Scene).events as
    | { once?: (event: string, listener: () => void) => void }
    | undefined;
  if (!events || typeof events.once !== 'function') return;
  cleanupBound.add(scene);
  for (const event of SHUTDOWN_EVENTS) {
    events.once(event, () => {
      dismissIllegalMoveToast(scene);
      cleanupBound.delete(scene);
    });
  }
}

/**
 * Show (or replace) the illegal-move reason toast on `scene`.
 *
 * Non-blocking by construction: the rendered text object is never made
 * interactive, so pointer input targeted at cards, slots or buttons passes
 * straight through (AC2). A second call inside the dwell window replaces the
 * current text and restarts the timer — duplicates never stack (AC4).
 *
 * @returns A handle to the live toast, or `undefined` when nothing was shown
 *   (empty text, or the scene lacks the primitives to render).
 */
export function showIllegalMoveToast(
  options: ShowIllegalMoveToastOptions,
): IllegalMoveToastHandle | undefined {
  const { scene, text, dwellMs } = options;
  const model = new IllegalMoveToastModel({ dwellMs });
  if (!model.show(text)) {
    // Nothing to explain: clear any stale toast (replace-with-empty).
    dismissIllegalMoveToast(scene);
    return undefined;
  }

  try {
    const existing = entries.get(scene);
    if (existing) {
      // Replace-on-show: same single toast object, new text + timer (AC4).
      existing.model = model;
      existing.gameObject.setText(text);
      schedule(scene, existing);
      return makeHandle(scene, existing);
    }

    const gameObject = createHudText(
      scene,
      GAME_W / 2,
      ILLEGAL_MOVE_TOAST_Y,
      text,
      ILLEGAL_MOVE_TOAST_COLOR,
      {
        fontSize: ILLEGAL_MOVE_TOAST_FONT_SIZE,
        originX: 0.5,
        originY: 0.5,
        align: 'center',
      },
    );
    gameObject
      .setDepth(ILLEGAL_MOVE_TOAST_DEPTH)
      .setWordWrapWidth(ILLEGAL_MOVE_TOAST_MAX_WIDTH)
      .setStroke(ILLEGAL_MOVE_TOAST_STROKE_COLOR, ILLEGAL_MOVE_TOAST_STROKE_THICKNESS);

    const entry: ToastEntry = { model, gameObject };
    entries.set(scene, entry);
    bindSceneCleanup(scene);
    schedule(scene, entry);
    return makeHandle(scene, entry);
  } catch {
    // Best-effort: a headless/test scene without add.text must not break the
    // caller's illegal-feedback flow. Drain any partial state and degrade.
    const stale = entries.get(scene);
    if (stale) {
      entries.delete(scene);
      drainEntry(stale);
    }
    return undefined;
  }
}

/** Build a stable handle for the live toast. */
function makeHandle(scene: Phaser.Scene, entry: ToastEntry): IllegalMoveToastHandle {
  return {
    get text() {
      return entry.model.text;
    },
    get model() {
      return entry.model;
    },
    get gameObject() {
      return entry.gameObject;
    },
    dismiss() {
      dismissEntry(scene, entry);
    },
  };
}

/**
 * Dismiss the live illegal-move toast on `scene` immediately (early
 * dismissal — AC2). The toast's text object is destroyed and the handling for
 * that scene is cleared; a later show starts fresh.
 */
export function dismissIllegalMoveToast(scene: Phaser.Scene): void {
  const entry = entries.get(scene);
  if (entry) {
    entries.delete(scene);
    drainEntry(entry);
  }
}
