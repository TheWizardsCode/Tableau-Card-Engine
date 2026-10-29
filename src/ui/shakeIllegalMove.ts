/**
 * shakeIllegalMove -- reusable illegal-move feedback routine.
 *
 * Applies a red tint, shakes the target horizontally, then clears the
 * tint and resets the x position.  Encapsulates the common
 * "illegal move feedback" pattern used by multiple game scenes.
 *
 * When a {@link ShakeIllegalMoveOptions.soundKey} is provided, the
 * sound is played via {@link safePlaySound} at the start of the shake.
 * By default this plays the `sfx-illegal-move` key if the asset has
 * been loaded. Callers can suppress the sound by passing `soundKey: ''`.
 *
 * ## Explaining the rejection (reason toast)
 *
 * Pass {@link ShakeIllegalMoveOptions.reason} — normally the rules layer's
 * player-facing {@link LegalityResult.reason} — and the routine also renders a
 * transient toast containing that text via
 * {@link showIllegalMoveToast} (`./illegalMoveToastView`). The toast is
 * rendered **independently of the shake branch**, so it still appears when:
 *
 * - the target is a non-tintable `Container` (position shake only);
 * - the target is `null`/`undefined` (nothing to shake, but the player still
 *   deserves to know why the move was refused);
 * - reduced motion suppresses the shake entirely.
 *
 * The reason is optional: callers that pass no reason keep the historical
 * tint + shake + `sfx-illegal-move` behaviour (AC1), and the rules layer is
 * never touched — the routine only displays text that already exists (AC8).
 *
 * @module ui/shakeIllegalMove
 */

import { safePlaySound, COMMON_SFX_KEYS } from '../core-engine/SoundManager';
import { getEffectiveReducedMotion } from './ReducedMotion';
import { showIllegalMoveToast } from './illegalMoveToastView';

/**
 * A target that can receive illegal-move feedback.
 *
 * `Image`/`Sprite` targets are tinted and shaken; `Container` targets (which
 * have no `setTint`) are shaken by position only. The routine is
 * container-safe because `createDragDropManager` feeds it whatever the
 * draggable happens to be.
 */
export type IllegalMoveTarget =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Sprite
  | Phaser.GameObjects.Container;

/** Options for the {@link shakeIllegalMove} animation. */
export interface ShakeIllegalMoveOptions {
  /** The Phaser scene that owns the tween. */
  scene: Phaser.Scene;

  /**
   * The sprite (or Image) to shake, or a Container.
   * `Image`/`Sprite` must support `setTint()`/`clearTint()`; `Container` is
   * shaken by position only. May be `null` when only the reason toast is
   * wanted.
   */
  target: IllegalMoveTarget | null | undefined;

  /**
   * Tint colour applied during the shake.
   * @default 0xff4444
   */
  tint?: number;

  /**
   * Horizontal distance (in pixels) to offset on each oscillation.
   * @default 5
   */
  shakeDistance?: number;

  /**
   * Duration of each oscillation in milliseconds.
   * The total animation length is roughly `duration * (repeat + 1) * 2`
   * because the tween uses `yoyo: true`.
   * @default 50
   */
  duration?: number;

  /**
   * Number of extra oscillation repeats (the first oscillation is implicit).
   * @default 2
   */
  repeat?: number;

  /**
   * Easing function name for the oscillation.
   * @default 'Sine.inOut'
   */
  ease?: string;

  /**
   * Optional SFX key to play when the shake starts.
   *
   * Defaults to {@link COMMON_SFX_KEYS.ILLEGAL_MOVE} (`'sfx-illegal-move'`).
   * Set to `''` or `undefined` to suppress the sound.
   *
   * The sound is played via {@link safePlaySound} which silently ignores
   * missing audio keys, so callers do not need to check whether the asset
   * was loaded.
   */
  soundKey?: string;

  /**
   * Player-facing explanation for the rejection (for example
   * `LegalityResult.reason`). When present — and non-empty — a transient
   * toast containing this exact text is rendered (AC1/AC3).
   *
   * Optional: omitting it preserves the existing animation-only behaviour for
   * every current caller (AC1).
   */
  reason?: string;

  /**
   * Dwell time in milliseconds for the reason toast.
   * @default 2500 ({@link ILLEGAL_MOVE_TOAST_DWELL_MS})
   */
  reasonDwellMs?: number;

  /**
   * Suppress the shake/ tint animation (the reason toast and the sound still
   * happen). Callers that already resolve the preference should pass it;
   * otherwise {@link getEffectiveReducedMotion} is consulted (in-game setting
   * → `prefers-reduced-motion`), so the toast is the feedback channel for
   * players who prefer reduced motion (AC3).
   */
  reducedMotion?: boolean;

  /**
   * Called after the tint is cleared and x is reset (or immediately when
   * reduced motion suppresses the shake). Under reduced motion it still fires
   * so callers that chain on it are not stranded.
   */
  onComplete?: () => void;
}

/**
 * Play an illegal-move feedback routine on a sprite or container.
 *
 * 1. (When `reason` is provided) Renders the reason toast — independently of
 *    every shake early-return, so `null`/`Container`/reduced-motion targets
 *    still explain the rejection (AC3).
 * 2. Returns `undefined` for a `null`/`undefined` target (nothing to shake).
 * 3. (Optional) Plays the `soundKey` SFX if provided (defaults to
 *    {@link COMMON_SFX_KEYS.ILLEGAL_MOVE}).
 * 4. Under reduced motion, skips steps 5–6, calls `onComplete` and returns
 *    `undefined` (no tween created).
 * 5. Applies a red tint (configurable via `tint`) for tintable targets.
 * 6. Shakes the target left by `shakeDistance` pixels with `yoyo: true`; on
 *    completion clears the tint, destroys the Canvas tint overlay and resets
 *    the x position.
 *
 * If `target` is `null` or `undefined` the function returns `undefined`
 * without creating a tween, making it safe to call without a guard.
 *
 * @returns The shake tween so the caller can cancel/chain, or `undefined`
 *          if no tween was created (null target, reduced motion, or a
 *          container-free branch).
 */
export function shakeIllegalMove(
  opts: ShakeIllegalMoveOptions,
): Phaser.Tweens.Tween | undefined {
  const {
    scene,
    target,
    tint = 0xff4444,
    shakeDistance = 5,
    duration = 50,
    repeat = 2,
    ease = 'Sine.inOut',
    soundKey = COMMON_SFX_KEYS.ILLEGAL_MOVE,
    reason,
    reasonDwellMs,
    onComplete,
  } = opts;

  // The reason toast is rendered first and independently of the shake branch:
  // a missing target, a non-tintable Container, or reduced motion must never
  // cost the player the explanation (AC3).
  if (typeof reason === 'string' && reason.trim() !== '') {
    try {
      showIllegalMoveToast({ scene, text: reason, dwellMs: reasonDwellMs });
    } catch {
      // Best-effort: illegal feedback must never crash the game loop.
    }
  }

  if (!target) return undefined;

  // Reduced motion: the toast already carried the explanation, and the
  // project-wide reduced-motion contract also suppresses SFX. Skip both the
  // shake and the sound so we never animate or talk over the preference
  // (AC3); callbacks still fire so callers are not stranded.
  const shouldReduce = opts.reducedMotion ?? getEffectiveReducedMotion();
  if (shouldReduce) {
    onComplete?.();
    return undefined;
  }

  // Play the illegal-move sound if a key is provided
  if (soundKey) {
    safePlaySound(scene as any, soundKey);
  }

  const originalX = target.x;
  // `setTint` is the capability probe: Image/Sprite have it, Container does
  // not (a Container has no tint component).
  const tintable = typeof (target as { setTint?: unknown }).setTint === 'function';

  // Apply tint. In Phaser 4 Canvas renderer setTint on Image/Sprite
  // does not render visibly, so we add a Rectangle overlay as well.
  if (tintable) {
    (target as Phaser.GameObjects.Image).setTint(tint);
  }

  // Canvas-compatible tint overlay (also works under WebGL). Only meaningful
  // for tintable targets — a Container has no texture frame to overlay.
  const tgt = target as any;
  let tintOverlay: Phaser.GameObjects.Rectangle | undefined;
  if (tintable) {
    const overlayW = tgt.displayWidth ?? tgt.width ?? 96;
    const overlayH = tgt.displayHeight ?? tgt.height ?? 130;
    tintOverlay = scene.add.rectangle(
      target.x, target.y,
      overlayW, overlayH,
      tint,
    )
      .setAlpha(0.4)
      .setOrigin(tgt.originX ?? 0.5, tgt.originY ?? 0.5)
      .setRotation(tgt.rotation ?? 0)
      .setDepth((tgt.depth ?? 0) + 0.1);
  }

  return scene.tweens.add({
    targets: target,
    x: originalX - shakeDistance,
    duration,
    yoyo: true,
    repeat,
    ease,
    onComplete: () => {
      if (tintable) {
        (target as Phaser.GameObjects.Image).clearTint();
      }
      tintOverlay?.destroy();
      // Prefer the Transform setter; fall back to direct assignment for
      // container-like test doubles that only expose `x`.
      if (typeof (target as { setX?: unknown }).setX === 'function') {
        target.setX(originalX);
      } else {
        target.x = originalX;
      }
      onComplete?.();
    },
  });
}
