/**
 * flipCard – reusable two-phase card-flip animation helper.
 *
 * Performs the classic "scaleX → 0 → change texture → scaleX → 1" card flip.
 * Optionally translates the sprite to a destination during the flip.
 *
 * @module ui/flipCard
 */

/** Options for the {@link flipCard} animation. */
export interface FlipCardOptions {
  /** The Phaser scene that owns the tween timeline. */
  scene: Phaser.Scene;

  /**
   * The sprite (or Image) to flip.
   * Must support `setTexture()` and be a valid Phaser tween target.
   */
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

  /** The texture key to apply at the midpoint of the flip. */
  newTexture: string;

  /**
   * Total duration of the flip in milliseconds.
   * Each half (close + open) takes `duration / 2`.
   * @default 300
   */
  duration?: number;

  /**
   * Easing for the first half (scaleX → 0).
   * @default 'Power2'
   */
  easeClose?: string;

  /**
   * Easing for the second half (scaleX → 1).
   * Defaults to the value of `easeClose` for symmetric easing.
   */
  easeOpen?: string;

  /**
   * Optional destination to translate to during the flip.
   * When set, the sprite moves to `(destX, destY)` over both halves:
   * halfway during close, the rest during open.
   */
  destX?: number;

  /**
   * Optional destination Y.  Required if `destX` is provided.
   */
  destY?: number;

  /**
   * Called at the midpoint of the flip, immediately after the new texture
   * is applied.  Use this for side effects such as `setDisplaySize()`.
   */
  onMidpoint?: () => void;

  /**
   * Called after the full flip animation completes (end of the open phase).
   */
  onComplete?: () => void;
}

/**
 * Play a two-phase card-flip animation on a sprite.
 *
 * Phase 1 (close): scaleX tweens from current value to 0.
 * At the midpoint the texture is swapped and `onMidpoint` fires.
 * Phase 2 (open): scaleX tweens from 0 back to 1.
 *
 * If `destX`/`destY` are provided the sprite also translates — halfway
 * during phase 1 and the rest during phase 2 — so the flip and slide
 * are combined into a single smooth motion.
 *
 * @returns The phase-1 tween so the caller can cancel/chain if needed.
 */
export function flipCard(opts: FlipCardOptions): Phaser.Tweens.Tween {
  const {
    scene,
    target,
    newTexture,
    duration = 300,
    easeClose = 'Power2',
    easeOpen = easeClose,
    destX,
    destY,
    onMidpoint,
    onComplete,
  } = opts;

  const half = duration / 2;

  // Build the close-phase tween config
  const closeConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
    targets: target,
    scaleX: 0,
    duration: half,
    ease: easeClose,
    onComplete: () => {
      target.setTexture(newTexture);
      onMidpoint?.();

      // Build the open-phase tween config
      const openConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
        targets: target,
        scaleX: 1,
        duration: half,
        ease: easeOpen,
        onComplete: onComplete ? () => onComplete() : undefined,
      };

      // Add translation for the second half if destination was provided
      if (destX !== undefined && destY !== undefined) {
        openConfig.x = destX;
        openConfig.y = destY;
      }

      scene.tweens.add(openConfig);
    },
  };

  // Add translation for the first half (to the midpoint position)
  if (destX !== undefined && destY !== undefined) {
    const startX = (target as Phaser.GameObjects.Image).x;
    const startY = (target as Phaser.GameObjects.Image).y;
    closeConfig.x = (startX + destX) / 2;
    closeConfig.y = (startY + destY) / 2;
  }

  return scene.tweens.add(closeConfig);
}
