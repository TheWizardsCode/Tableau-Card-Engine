/**
 * Main Street: Turn Controller Utilities
 *
 * Module-level helper functions (illegal-move feedback, required-card
 * matching).
 *
 * @module
 */

import { COMMON_SFX_KEYS, safePlaySound } from '@core-engine/SoundManager';
import { shakeIllegalMove } from '@ui/shakeIllegalMove';

/**
 * Play illegal-move sound and shake animation on a card target.
 *
 * Wraps {@link shakeIllegalMove} with a container-safe fallback:
 * sprites are shaken directly (with red tint + x-oscillation), while
 * container objects (market cards) receive a simple x-oscillation
 * tween without tint (Containers don't have setTint).
 *
 * Sound plays via `safePlaySound` so mute/volume settings apply
 * and missing audio assets are silently ignored.
 * Reduced-motion is respected: when `scene.settingsPanel.reducedMotion`
 * is true the shake distance is halved and duration shortened.
 *
 * Safe in headless / replay / transcript modes — if the target is
 * null/undefined no tween is created and no sound is attempted.
 *
 * @param target  - Sprite (hand cards) or Container (market cards).
 * @param scene   - Phaser scene for tween + sound plumbing.
 */
export function playIllegalFeedback(target: Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null | undefined, scene: any): void {
  // Always attempt to play the sound (safe even with no audio asset).
  safePlaySound(scene as any, COMMON_SFX_KEYS.ILLEGAL_MOVE);

  if (!target) return;

  const reducedMotion = scene.settingsPanel?.reducedMotion ?? false;
  const shakeDistance = reducedMotion ? 3 : 5;
  const shakeDuration = reducedMotion ? 30 : 50;
  const shakeRepeats = reducedMotion ? 1 : 2;

  // Duck-typed Container detection: Containers lack setTint (they're
  // plain groups), while Sprites/Images have setTint/clearTint.
  const isContainer = (target as any).setTint === undefined;

  if (isContainer) {
    // Container-safe shake: position oscillation only (no tint).
    // Sound is already played above (Containers don't support tint).
    const originalX = (target as any).x;
    scene.tweens.add({
      targets: target,
      x: originalX - shakeDistance,
      duration: shakeDuration,
      yoyo: true,
      repeat: shakeRepeats,
      ease: 'Sine.inOut',
      onComplete: () => { (target as any).x = originalX; },
    });
  } else {
    // Sprite/Image shake with red tint + sound via shakeIllegalMove.
    shakeIllegalMove({ scene, target: target as Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, shakeDistance, duration: shakeDuration, repeat: shakeRepeats });
  }
}

/**
 * Match a card ID against a requiredCardId using prefix matching.
 *
 * Card IDs include a copy-number suffix (e.g. `biz-laundromat-2`). The
 * `requiredCardId` in tutorial steps is the template ID with a specific copy
 * number (e.g. `biz-laundromat-0`). This helper strips trailing `-<number>`
 * from both IDs and compares the template prefix, so any copy of the required
 * card template satisfies the requirement.
 */
export function matchesRequiredCard(cardId: string, requiredCardId: string): boolean {
  const stripCopy = (id: string): string => id.replace(/-\d+$/, '');
  return stripCopy(cardId) === stripCopy(requiredCardId);
}

