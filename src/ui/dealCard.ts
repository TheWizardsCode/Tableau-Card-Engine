/**
 * dealCard -- reusable card dealing animation helper.
 *
 * Animates a card being dealt from a source position into a player's hand.
 * Uses "arc" motion: card starts at source, flies in an arc to destination,
 * optionally rotates during flight for a more natural dealing motion.
 * Fires 'card:dealt' event via GameEventEmitter on completion.
 *
 * @module ui/dealCard
 */

/** Default deal animation duration in milliseconds. */
export const DEFAULT_DEAL_DURATION = 400;

/** Default arc height (pixels) for dealing motion. */
export const DEFAULT_DEAL_ARC_HEIGHT = -50;

/** Options for the {@link dealCard} animation. */
export interface DealCardOptions {
  /** The Phaser scene that owns the animation. */
  scene: Phaser.Scene;

  /**
   * The card sprite to animate.
   * Must have `x` and `y` properties.
   */
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

  /** Destination X coordinate (where the hand is). */
  destX: number;

  /** Destination Y coordinate. */
  destY: number;

  /**
   * Optional source X coordinate (where the card is dealt from).
   * If not provided, uses the target's current position.
   */
  sourceX?: number;

  /**
   * Optional source Y coordinate.
   * If not provided, uses the target's current position.
   */
  sourceY?: number;

  /**
   * Duration of the dealing animation in milliseconds.
   * @default 400
   */
  duration?: number;

  /**
   * Arc height for the dealing motion (negative = upward arc).
   * Set to 0 for straight-line movement.
   * @default -50
   */
  arcHeight?: number;

  /**
   * Easing function for the movement.
   * @default 'Quad.easeOut'
   */
  ease?: string;

  /**
   * Optional rotation to apply during the deal (in radians).
   * Set to a small value (e.g., 0.1) for a slight spin effect.
   * @default 0.05
   */
  rotation?: number;

  /**
   * Optional GameEventEmitter to emit events on completion.
   * If not provided, the animation still plays but no event is emitted.
   */
  gameEvents?: {
    emit(event: 'card:dealt', payload: CardDealtPayload): void;
  };

  /**
   * Optional card ID to include in the event payload.
   */
  cardId?: string;

  /**
   * Optional player index to include in the event payload.
   */
  playerIndex?: number;
}

/** Payload for the 'card:dealt' event. */
export interface CardDealtPayload {
  /** Card ID (optional, for tracking). */
  cardId?: string;
  /** Player index (optional, for multi-player). */
  playerIndex?: number;
}

/**
 * Check if reduced motion is preferred (accessibility).
 *
 * Checks the `prefers-reduced-motion` media query.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Play a card-dealing animation.
 *
 * The card moves from source to destination in a smooth arc,
 * optionally with a slight rotation during flight.
 * On completion, emits 'card:dealt' event if gameEvents is provided.
 *
 * @returns The Phaser tween for the animation (can be cancelled/chained).
 */
export function dealCard(opts: DealCardOptions): Phaser.Tweens.Tween {
  const {
    scene,
    target,
    destX,
    destY,
    sourceX,
    sourceY,
    duration = DEFAULT_DEAL_DURATION,
    arcHeight = DEFAULT_DEAL_ARC_HEIGHT,
    ease = 'Quad.easeOut',
    rotation = 0.05,
    gameEvents,
    cardId,
    playerIndex,
  } = opts;

  // Determine source position
  const startX = sourceX ?? target.x;
  const startY = sourceY ?? target.y;

  // Set initial position
  target.setPosition(startX, startY);
  target.setRotation(0);

  // Check for reduced motion preference
  const reducedMotion = prefersReducedMotion();

  // Handle reduced motion - just jump to destination (ease is not used in reduced motion mode)
  if (reducedMotion) {
    target.setPosition(destX, destY);
    if (gameEvents && cardId) {
      gameEvents.emit('card:dealt', { cardId, playerIndex });
    }
    return scene.tweens.add({
      targets: target,
      duration: 50,
    });
  }

  // Use an "arc" motion with two tweens chained together
  const midX = (startX + destX) / 2;
  const midY = (startY + destY) / 2 + arcHeight;
  const phase1Duration = duration * 0.4;
  const phase2Duration = duration * 0.6;

  // Phase 1: Rise and move toward midpoint
  const phase1 = scene.tweens.add({
    targets: target,
    x: midX,
    y: midY,
    rotation: rotation,
    duration: phase1Duration,
    ease: ease,
    onComplete: () => {
      // Phase 2: Fall to destination
      scene.tweens.add({
        targets: target,
        x: destX,
        y: destY,
        rotation: 0,
        duration: phase2Duration,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (gameEvents && cardId) {
            gameEvents.emit('card:dealt', { cardId, playerIndex });
          }
        },
      });
    },
  });

  return phase1;
}