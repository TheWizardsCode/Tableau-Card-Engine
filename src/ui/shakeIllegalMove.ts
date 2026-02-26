/**
 * shakeIllegalMove -- reusable illegal-move shake animation helper.
 *
 * Applies a red tint, shakes the target horizontally, then clears the
 * tint and resets the x position.  Encapsulates the common
 * "illegal move feedback" pattern used by multiple game scenes.
 *
 * @module ui/shakeIllegalMove
 */

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
   * Called after the tint is cleared and x is reset.
   */
  onComplete?: () => void;
}

/**
 * Play an illegal-move shake animation on a sprite.
 *
 * 1. Applies a red tint (configurable via `tint`).
 * 2. Shakes the sprite left by `shakeDistance` pixels with `yoyo: true`.
 * 3. On completion, clears the tint and resets the x position.
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
    onComplete,
  } = opts;

  if (!target) return undefined;

  const originalX = target.x;

  target.setTint(tint);

  return scene.tweens.add({
    targets: target,
    x: originalX - shakeDistance,
    duration,
    yoyo: true,
    repeat,
    ease,
    onComplete: () => {
      target.clearTint();
      target.setX(originalX);
      onComplete?.();
    },
  });
}
