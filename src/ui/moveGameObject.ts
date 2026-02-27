/**
 * moveGameObject -- reusable positional movement tween helper.
 *
 * Tweens a Phaser game object from its current position to a target
 * (x, y) with configurable duration, easing, and an onComplete callback.
 * Position-only translation -- no scaling or rotation.
 *
 * @module ui/moveGameObject
 */

/** Options for the {@link moveGameObject} animation. */
export interface MoveGameObjectOptions {
  /** The Phaser scene that owns the tween. */
  scene: Phaser.Scene;

  /**
   * The game object to move.
   * Must have `x` and `y` properties (any Phaser display object).
   */
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

  /** Destination X coordinate. */
  destX: number;

  /** Destination Y coordinate. */
  destY: number;

  /**
   * Duration of the movement in milliseconds.
   * @default 350
   */
  duration?: number;

  /**
   * Easing function name for the movement.
   * @default 'Quad.easeOut'
   */
  ease?: string;

  /**
   * Called after the movement animation completes.
   */
  onComplete?: () => void;
}

/**
 * Play a positional movement tween on a Phaser game object.
 *
 * Tweens the target from its current `(x, y)` to `(destX, destY)` using
 * the specified easing curve.  Only position is affected -- no scaling,
 * rotation, or alpha changes.
 *
 * @returns The movement tween so the caller can cancel/chain if needed.
 */
export function moveGameObject(opts: MoveGameObjectOptions): Phaser.Tweens.Tween {
  const {
    scene,
    target,
    destX,
    destY,
    duration = 700,
    ease = 'Quad.easeOut',
    onComplete,
  } = opts;

  return scene.tweens.add({
    targets: target,
    x: destX,
    y: destY,
    duration,
    ease,
    onComplete: onComplete ? () => onComplete() : undefined,
  });
}
