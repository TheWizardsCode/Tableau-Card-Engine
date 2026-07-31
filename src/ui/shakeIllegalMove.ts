/**
 * shakeIllegalMove -- reusable illegal-move shake animation helper.
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
 * @module ui/shakeIllegalMove
 */

import { safePlaySound, COMMON_SFX_KEYS } from '../core-engine/SoundManager';

/** Options for the {@link shakeIllegalMove} animation. */
export interface ShakeIllegalMoveOptions {
  /** The Phaser scene that owns the tween. */
  scene: Phaser.Scene;

  /**
   * The sprite (or Image) to shake.
   * Must support `setTint()`, `clearTint()`, and `setX()`.
   */
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null | undefined;

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
   * Called after the tint is cleared and x is reset.
   */
  onComplete?: () => void;
}

/**
 * Play an illegal-move shake animation on a sprite.
 *
 * 1. (Optional) Plays the `soundKey` SFX if provided (defaults to
 *    {@link COMMON_SFX_KEYS.ILLEGAL_MOVE}).
 * 2. Applies a red tint (configurable via `tint`).
 * 3. Shakes the sprite left by `shakeDistance` pixels with `yoyo: true`.
 * 4. On completion, clears the tint and resets the x position.
 *
 * If `target` is `null` or `undefined` the function returns `undefined`
 * without creating a tween, making it safe to call without a guard.
 *
 * @returns The shake tween so the caller can cancel/chain, or `undefined`
 *          if no tween was created (null target).
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
    onComplete,
  } = opts;

  if (!target) return undefined;

  // Play the illegal-move sound if a key is provided
  if (soundKey) {
    safePlaySound(scene as any, soundKey);
  }

  const originalX = target.x;

  // Apply tint. In Phaser 4 Canvas renderer setTint on Image/Sprite
  // does not render visibly, so we add a Rectangle overlay as well.
  target.setTint(tint);

  // Canvas-compatible tint overlay (also works under WebGL)
  const tgt = target as any;
  const overlayW = tgt.displayWidth ?? tgt.width ?? 96;
  const overlayH = tgt.displayHeight ?? tgt.height ?? 130;
  const tintOverlay = scene.add.rectangle(
    target.x, target.y,
    overlayW, overlayH,
    tint,
  )
    .setAlpha(0.4)
    .setOrigin(tgt.originX ?? 0.5, tgt.originY ?? 0.5)
    .setRotation(tgt.rotation ?? 0)
    .setDepth((tgt.depth ?? 0) + 0.1);

  return scene.tweens.add({
    targets: target,
    x: originalX - shakeDistance,
    duration,
    yoyo: true,
    repeat,
    ease,
    onComplete: () => {
      target.clearTint();
      tintOverlay.destroy();
      target.setX(originalX);
      onComplete?.();
    },
  });
}
