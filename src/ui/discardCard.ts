import { SoundManager } from '../core-engine';

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
   * Only used in shrink mode (when destX/destY are not provided).
   * @default 30
   */
  offsetY?: number;

  /**
   * Horizontal offset for discard direction.
   * Only used in shrink mode (when destX/destY are not provided).
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
   * Used for the shrink path (when destX/destY not provided).
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
   * When true, discarding is instant — sprite is hidden/destroyed immediately
   * without tweens.  Overrides CSS media query.  Default: false (animate).
   */
  reducedMotion?: boolean;

  /**
   * Whether to destroy the sprite after animation completes.
   * Set to false if you'll reuse the sprite.
   * @default true
   */
  destroyAfter?: boolean;

  /**
   * Destination X for animated discard (animate to discard pile position).
   * When provided together with destY, the card animates from its current
   * position to (destX, destY) instead of shrinking in place.
   */
  destX?: number;

  /**
   * Destination Y for animated discard (animate to discard pile position).
   * When provided together with destX, the card animates from its current
   * position to (destX, destY) instead of shrinking in place.
   */
  destY?: number;

  /**
   * Optional texture key to flip to when the card arrives at the destination.
   * When set, the card performs a two-phase flip animation (scaleX→0, change
   * texture, scaleX→1) after reaching the destination. This is used when
   * discarding a face-up card to show it face-down in the discard pile.
   * Only applies when destX and destY are provided.
   */
  flipOnArrivalTexture?: string;

  /**
   * Optional depth to set on the target during the destination animation.
   * Use this to ensure the animating card renders above other game objects
   * (e.g. above a discard pile sprite). The depth is restored to its
   * original value on completion (if destroyAfter is false) or ignored
   * (the sprite is destroyed anyway).
   */
  depth?: number;

  /** Optional SoundManager to play SFX during discard. */
  soundManager?: SoundManager | null;

  /** Optional SFX keys for discard: start/move/end. */
  sfx?: {
    start?: string;
    move?: string;
    end?: string;
    moveIntervalMs?: number;
    /** If true, play the `move` SFX as a looping sound during discard. */
    moveLoop?: boolean;
  };
}

import type { CardDiscardedPayload } from '../core-engine';
export type { CardDiscardedPayload };

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
    reducedMotion,
    soundManager = null,
    sfx,
    destX,
    destY,
    flipOnArrivalTexture,
    depth,
  } = opts;

  // Store original depth for restoration after animation
  const originalDepth = depth !== undefined ? (target as any).depth : undefined;

  // Set depth if provided (e.g. to render above the discard pile)
  if (depth !== undefined && typeof (target as any).setDepth === 'function') {
    (target as any).setDepth(depth);
  }

  // Emit completion event, restore depth, and optionally destroy the target.
  function emitComplete(): void {
    // Restore original depth if we're not destroying the sprite
    if (depth !== undefined && !destroyAfter && originalDepth !== undefined) {
      if (typeof (target as any).setDepth === 'function') {
        (target as any).setDepth(originalDepth);
      }
    }
    if (gameEvents && cardId) {
      gameEvents.emit('card:discarded', { cardId, playerIndex });
    }
    if (destroyAfter) {
      target.destroy();
    }
  }

  // Check for reduced motion preference (explicit param takes precedence)
  const shouldReduce = reducedMotion ?? prefersReducedMotion();

  // If reduced motion, snap to final state immediately
  if (shouldReduce) {
    if (destX !== undefined && destY !== undefined) {
      target.x = destX;
      target.y = destY;
      if (flipOnArrivalTexture && typeof (target as any).setTexture === 'function') {
        (target as any).setTexture(flipOnArrivalTexture);
      }
    }
    target.setAlpha(0);
    target.setScale(0);
    emitComplete();
    return scene.tweens.add({
      targets: target,
      duration: 50,
    });
  }

  // ── Destination animation path (animate to discard pile) ──
  if (destX !== undefined && destY !== undefined) {
    const moveDuration = duration * 0.65;
    const flipHalfDuration = duration * 0.175;
    const initialScaleX = target.scaleX ?? 1;

    if (flipOnArrivalTexture) {
      // Phase 1: Move from current position to destination, rotating to match pile orientation
      const tween = scene.tweens.add({
        targets: target,
        x: destX,
        y: destY,
        rotation: 0,
        duration: moveDuration,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // Phase 2a: Flip close (scaleX → 0)
          scene.tweens.add({
            targets: target,
            scaleX: 0,
            duration: flipHalfDuration,
            ease: 'Power2',
            onComplete: () => {
              // Apply new texture at the midpoint of the flip
              if (typeof (target as any).setTexture === 'function') {
                (target as any).setTexture(flipOnArrivalTexture);
              }

              // Phase 2b: Flip open (scaleX → 1)
              scene.tweens.add({
                targets: target,
                scaleX: initialScaleX,
                duration: flipHalfDuration,
                ease: 'Power2',
                onComplete: () => {
                  emitComplete();
                },
              });
            },
          });
        },
      });

      return tween;
    }

    // Move to destination without flip, rotating to match pile orientation
    return scene.tweens.add({
      targets: target,
      x: destX,
      y: destY,
      rotation: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => {
        emitComplete();
      },
    });
  }

  // ── Original shrink/fade behavior (no destination) ──
  const moveInterval = sfx?.moveIntervalMs ?? 120;
  let lastMovePlay = 0;
  let loopSound: Phaser.Sound.BaseSound | null = null;

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
      if (gameEvents && cardId) {
        gameEvents.emit('card:discarded', { cardId, playerIndex });
      }
      if (loopSound) { try { loopSound.stop(); } catch {} loopSound = null; }
      if (sfx?.end) {
        if (soundManager) soundManager.play(sfx.end);
        else { try { scene.sound?.play(sfx.end); } catch { /* ignore */ } }
      }
      if (destroyAfter) {
        target.destroy();
      }
    },
  });

  return tween;
}
