/**
 * discardCard -- reusable card discard animation helper.
 *
 * Animates a card being discarded from play:
 * - Fades out (alpha → 0)
 * - Shrinks (scale → 0)
 * - Moves slightly downward (gravity effect)
 * - Rotates slightly for natural discard feel
 *
 * Fires 'card:discarded' event via GameEventEmitter on completion.
 *
 * @module ui/discardCard
 */

/** Default discard animation duration in milliseconds. */
export const DEFAULT_DISCARD_DURATION = 400;

/** Options for the {@link discardCard} animation. */
export interface DiscardCardOptions {
  /** The Phaser scene that owns the animation. */
  scene: Phaser.Scene;

  /**
   * The card sprite to animate.
   * Must have `x`, `y`, `alpha`, and `scale` properties.
   */
  target: Phaser.GameObjects.Components.Transform &
    Phaser.GameObjects.GameObject & {
      alpha: number;
      setAlpha(value: number): void;
      setScale(value: number): void;
    };

  /**
   * Vertical offset for discard direction (negative = move up, positive = move down).
   * @default 30
   */
  offsetY?: number;

  /**
   * Horizontal offset for discard direction.
   * @default 0
   */
  offsetX?: number;

  /**
   * Duration of the discard animation in milliseconds.
   * @default 400
   */
  duration?: number;

  /**
   * Easing function for the movement.
   * @default 'Quad.easeIn'
   */
  ease?: string;

  /**
   * Rotation to apply during discard (in radians).
   * @default 0.1
   */
  rotation?: number;

  /**
   * Optional GameEventEmitter to emit events on completion.
   * If not provided, the animation still plays but no event is emitted.
   */
  gameEvents?: {
    emit(event: 'card:discarded', payload: CardDiscardedPayload): void;
  };

  /**
   * Optional card ID to include in the event payload.
   */
  cardId?: string;

  /**
   * Optional player index to include in the event payload.
   */
  playerIndex?: number;

  /**
   * Whether to destroy the sprite after animation completes.
   * Set to false if you'll reuse the sprite.
   * @default true
   */
  destroyAfter?: boolean;
}

/** Payload for the 'card:discarded' event. */
export interface CardDiscardedPayload {
  /** Card ID (optional, for tracking). */
  cardId?: string;
  /** Player index (optional, for multi-player). */
  playerIndex?: number;
}

/**
 * Check if reduced motion is preferred (accessibility).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Play a card discard animation.
 *
 * The card fades out, shrinks slightly, and moves in the discard direction.
 * On completion, emits 'card:discarded' event if gameEvents is provided.
 * The sprite is optionally destroyed after the animation.
 *
 * @returns The Phaser tween for the animation (can be cancelled/changed).
 */
export function discardCard(opts: DiscardCardOptions): Phaser.Tweens.Tween {
  const {
    scene,
    target,
    offsetY = 30,
    offsetX = 0,
    duration = DEFAULT_DISCARD_DURATION,
    ease = 'Quad.easeIn',
    rotation = 0.1,
    gameEvents,
    cardId,
    playerIndex,
    destroyAfter = true,
  } = opts;

  // Check for reduced motion preference
  const reducedMotion = prefersReducedMotion();

  // If reduced motion, just hide immediately
  if (reducedMotion) {
    target.setAlpha(0);
    target.setScale(0);
    if (gameEvents && cardId) {
      gameEvents.emit('card:discarded', { cardId, playerIndex });
    }
    if (destroyAfter) {
      target.destroy();
    }
    return scene.tweens.add({
      targets: target,
      duration: 50,
    });
  }

  // Current position
  const startX = target.x;
  const startY = target.y;

  // Phase 1: Quick fade + shrink + move
  const tween = scene.tweens.add({
    targets: target,
    x: startX + offsetX,
    y: startY + offsetY,
    alpha: 0,
    scaleX: 0.1,
    scaleY: 0.1,
    rotation: rotation,
    duration: duration,
    ease: ease,
    onComplete: () => {
      if (gameEvents && cardId) {
        gameEvents.emit('card:discarded', { cardId, playerIndex });
      }
      if (destroyAfter) {
        target.destroy();
      }
    },
  });

  return tween;
}