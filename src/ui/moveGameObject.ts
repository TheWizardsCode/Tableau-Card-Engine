/**
 * moveGameObject -- reusable positional movement tween helper.
 *
 * Tweens a Phaser game object from its current position to a target
 * (x, y) with configurable duration, easing, and an onComplete callback.
 * Position-only translation -- no scaling or rotation.
 *
 * @module ui/moveGameObject
 */

import { SoundManager } from '../core-engine';

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

  /**
   * When true, animation is skipped and the target snaps to the destination
   * immediately.  `onComplete` fires synchronously.  Default: false (animate).
   */
  reducedMotion?: boolean;

  /** Optional SoundManager to play SFX during the animation. */
  soundManager?: SoundManager | null;

  /**
   * Optional SFX keys. Each key refers to a registered logical sound name.
   * - start: played when the tween starts
   * - move: played periodically during movement (throttled)
   * - end: played when the tween completes
   * - moveIntervalMs: throttle interval for move SFX in milliseconds (default 120)
   */
  sfx?: {
    start?: string;
    move?: string;
    end?: string;
    moveIntervalMs?: number;
    /** If true, play the `move` SFX as a looping sound during the tween. */
    moveLoop?: boolean;
  };
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
    reducedMotion = false,
    soundManager = null,
    sfx,
  } = opts;

  // When reduced motion is enabled, snap to destination immediately and fire callbacks
  if (reducedMotion) {
    target.x = destX;
    target.y = destY;
    onComplete?.();
    return scene.tweens.add({
      targets: target,
      duration: 0,
    });
  }

  const moveInterval = sfx?.moveIntervalMs ?? 120;
  let lastMovePlay = 0;
  let loopSound: Phaser.Sound.BaseSound | null = null;

  return scene.tweens.add({
    targets: target,
    x: destX,
    y: destY,
    duration,
    ease,
    onStart: () => {
      // Play start SFX (prefers SoundManager, fall back to scene.sound)
      if (sfx?.start) {
        if (soundManager) soundManager.play(sfx.start);
        else { try { scene.sound?.play(sfx.start); } catch { /* ignore */ } }
      }

      if (sfx?.move) {
        if (sfx.moveLoop && scene.sound && typeof scene.sound.add === 'function') {
          // Start a looping sound via Phaser's sound system
          try {
            const created = scene.sound.add(sfx.move, { loop: true });
            created.play();
            loopSound = created;
          } catch {
            loopSound = null;
          }
        } else {
          // Play initial move sound immediately and allow throttled repeats
          if (soundManager) {
            soundManager.play(sfx.move);
          } else {
            try { scene.sound?.play(sfx.move); } catch { /* ignore */ }
          }
          lastMovePlay = Date.now();
        }
      }
    },
    onUpdate: () => {
      if (!sfx?.move) return;
      if (sfx.moveLoop) return; // loop sound handles continuous playback

      const now = Date.now();
      if (now - lastMovePlay >= moveInterval) {
        if (soundManager) soundManager.play(sfx.move);
        else { try { scene.sound?.play(sfx.move); } catch { /* ignore */ } }
        lastMovePlay = now;
      }
    },
    onComplete: () => {
      // Stop loop if playing
      if (loopSound) {
        try { loopSound.stop(); } catch {}
        loopSound = null;
      }

      if (sfx?.end) {
        if (soundManager) soundManager.play(sfx.end);
        else { try { scene.sound?.play(sfx.end); } catch { /* ignore */ } }
      }
      onComplete?.();
    },
  });
}
