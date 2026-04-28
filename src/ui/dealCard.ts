import { SoundManager } from '../core-engine';

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

  /** Optional SoundManager to play SFX during the deal. */
  soundManager?: SoundManager | null;

  /** Optional SFX keys for the deal: start/move/end. */
  sfx?: {
    start?: string;
    move?: string;
    end?: string;
    moveIntervalMs?: number;
    /** If true, play the `move` SFX as a looping sound during the deal. */
    moveLoop?: boolean;
  };
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
    soundManager = null,
    sfx,
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

  const moveInterval = sfx?.moveIntervalMs ?? 120;
  let lastMovePlay = 0;
  let loopSound: Phaser.Sound.BaseSound | null = null;

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
    onStart: () => {
      if (sfx?.start) {
        if (soundManager) soundManager.play(sfx.start);
        else scene.sound?.play(sfx.start);
      }

      if (sfx?.move) {
        if (sfx.moveLoop && scene.sound && typeof scene.sound.play === 'function') {
          try { loopSound = scene.sound.play(sfx.move, { loop: true }) as Phaser.Sound.BaseSound; } catch { loopSound = null; }
        } else {
          if (soundManager) soundManager.play(sfx.move);
          else scene.sound?.play(sfx.move);
          lastMovePlay = Date.now();
        }
      }
    },
    onUpdate: () => {
      if (!sfx?.move) return;
      if (sfx.moveLoop) return;
      const now = Date.now();
      if (now - lastMovePlay >= moveInterval) {
        if (soundManager) soundManager.play(sfx.move);
        else scene.sound?.play(sfx.move);
        lastMovePlay = now;
      }
    },
    onComplete: () => {
      // Phase 2: Fall to destination
      scene.tweens.add({
        targets: target,
        x: destX,
        y: destY,
        rotation: 0,
        duration: phase2Duration,
        ease: 'Quad.easeIn',
        onStart: () => {
          // continue move SFX timing
        },
        onUpdate: () => {
          if (!sfx?.move) return;
          if (sfx.moveLoop) return;
          const now = Date.now();
          if (now - lastMovePlay >= moveInterval) {
            if (soundManager) soundManager.play(sfx.move);
            else scene.sound?.play(sfx.move);
            lastMovePlay = now;
          }
        },
        onComplete: () => {
          if (loopSound) { try { loopSound.stop(); } catch {} loopSound = null; }
          if (sfx?.end) {
            if (soundManager) soundManager.play(sfx.end);
            else scene.sound?.play(sfx.end);
          }
          if (gameEvents && cardId) {
            gameEvents.emit('card:dealt', { cardId, playerIndex });
          }
        },
      });
    },
  });

  return phase1;
}
