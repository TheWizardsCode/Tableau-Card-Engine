import { SoundManager } from '../core-engine';

/**
 * placeCard -- reusable card placement/moving animation helper.
 *
 * Animates a card being placed onto a destination (street grid, tableau, etc.).
 * Uses smooth "spring" motion with slight overshoot for a satisfying "snap" effect.
 * Fires 'card:placed' event via GameEventEmitter on completion.
 *
 * @module ui/placeCard
 */

/** Default place animation duration in milliseconds. */
export const DEFAULT_PLACE_DURATION = 350;

/** Options for the {@link placeCard} animation. */
export interface PlaceCardOptions {
  /** The Phaser scene that owns the animation. */
  scene: Phaser.Scene;

  /**
   * The card sprite to animate.
   * Must have `x` and `y` properties.
   */
  target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;

  /** Destination X coordinate. */
  destX: number;

  /** Destination Y coordinate. */
  destY: number;

  /**
   * Duration of the placement animation in milliseconds.
   * @default 350
   */
  duration?: number;

  /**
   * Easing function for the movement.
   * Use 'Back.easeOut' for a satisfying "snap" effect.
   * @default 'Back.easeOut'
   */
  ease?: string;

  /**
   * Optional scale to animate to during placement (e.g., 1.05 for a pop effect).
   * Set to 1 for no scale change.
   * @default 1
   */
  scale?: number;

  /**
   * Optional scale duration ratio (how much of duration to spend scaling).
   * @default 0.6
   */
  scaleDurationRatio?: number;

  /**
   * Optional GameEventEmitter to emit events on completion.
   * If not provided, the animation still plays but no event is emitted.
   */
  gameEvents?: {
    emit(event: 'card:placed', payload: CardPlacedPayload): void;
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
   * Optional slot index to include in the event payload.
   */
  slotIndex?: number;

  /** Optional SoundManager to play SFX during the placement. */
  soundManager?: SoundManager | null;

  /** Optional SFX keys for placement: start/move/end. */
  sfx?: {
    start?: string;
    move?: string;
    end?: string;
    moveIntervalMs?: number;
    /** If true, play the `move` SFX as a looping sound during the animation. */
    moveLoop?: boolean;
  };
}

/** Payload for the 'card:placed' event. */
export interface CardPlacedPayload {
  /** Card ID (optional, for tracking). */
  cardId?: string;
  /** Player index (optional, for multi-player). */
  playerIndex?: number;
  /** Slot/target index (optional, for locating). */
  slotIndex?: number;
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
 * Play a card placement animation.
 *
 * The card moves smoothly to the destination with optional scale "pop" effect.
 * On completion, emits 'card:placed' event if gameEvents is provided.
 *
 * @returns The Phaser tween for the animation (can be cancelled/changed).
 */
export function placeCard(opts: PlaceCardOptions): Phaser.Tweens.Tween {
  const {
    scene,
    target,
    destX,
    destY,
    duration = DEFAULT_PLACE_DURATION,
    ease = 'Back.easeOut',
    scale = 1,
    scaleDurationRatio = 0.6,
    gameEvents,
    cardId,
    playerIndex,
    slotIndex,
    soundManager = null,
    sfx,
  } = opts;

  // Check for reduced motion preference
  const reducedMotion = prefersReducedMotion();

  // Handle simple case for reduced motion
  if (reducedMotion) {
    target.setPosition(destX, destY);
    // Emit event after reduced motion placement
    if (gameEvents && cardId) {
      setTimeout(() => {
        gameEvents.emit('card:placed', { cardId, playerIndex, slotIndex });
      }, 0);
    }
    return scene.tweens.add({
      targets: target,
      duration: 50,
    });
  }

  const moveInterval = sfx?.moveIntervalMs ?? 120;
  let lastMovePlay = 0;
  let loopSound: Phaser.Sound.BaseSound | null = null;

  // Determine scale values
  const startScaleX = target.scaleX;
  const startScaleY = target.scaleY;

  // Phase 1: Move and scale up
  const phase1Duration = duration * scaleDurationRatio;
  const phase1 = scene.tweens.add({
    targets: target,
    x: destX,
    y: destY,
    scaleX: scale,
    scaleY: scale,
    duration: phase1Duration,
    ease: ease,
    onStart: () => {
      if (sfx?.start) {
        if (soundManager) soundManager.play(sfx.start);
        else { try { scene.sound?.play(sfx.start); } catch { /* ignore */ } }
      }

      if (sfx?.move) {
        if (sfx.moveLoop && scene.sound && typeof scene.sound.add === 'function') {
          try {
            const created = scene.sound.add(sfx.move, { loop: true });
            created.play();
            loopSound = created;
          } catch { loopSound = null; }
        } else {
          if (soundManager) soundManager.play(sfx.move);
          else { try { scene.sound?.play(sfx.move); } catch { /* ignore */ } }
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
        else { try { scene.sound?.play(sfx.move); } catch { /* ignore */ } }
        lastMovePlay = now;
      }
    },
    onComplete: () => {
      // Phase 2: Scale back to normal (simplified)
      scene.tweens.add({
        targets: target,
        scaleX: startScaleX,
        scaleY: startScaleY,
        duration: duration - phase1Duration,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (loopSound) {
            try { loopSound.stop(); } catch {}
            loopSound = null;
          }
          if (sfx?.end) {
            if (soundManager) soundManager.play(sfx.end);
            else { try { scene.sound?.play(sfx.end); } catch { /* ignore */ } }
          }
          // Emit event after animation completes
          if (gameEvents && cardId) {
            setTimeout(() => {
              gameEvents.emit('card:placed', { cardId, playerIndex, slotIndex });
            }, 0);
          }
        },
      });
    },
  });

  // Ensure event is emitted even if phase2 somehow not called (fallback)
  if (gameEvents && cardId) {
    setTimeout(() => {
      gameEvents.emit('card:placed', { cardId, playerIndex, slotIndex });
    }, 0);
  }

  return phase1;
}
