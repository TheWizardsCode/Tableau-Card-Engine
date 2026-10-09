/**
 * TheRisingAnimator -- card animations for 1916: The Rising.
 *
 * Every animation is wired to the core-engine movement helpers (`dealCard`,
 * `placeCard`, `shakeIllegalMove`) so it is both animated and audible through
 * the shared `SoundManager` (AC5). When reduced motion is requested, movement
 * helpers snap to their destination and the reject feedback skips the shake —
 * but the illegal-move SFX still plays so feedback is never lost.
 *
 * @module src/scenes/TheRisingAnimator
 */

import Phaser from 'phaser';
import { dealCard, placeCard, popTextOrIcon, shakeIllegalMove } from '@ui';
import { safePlaySound, type SoundManager } from '@core-engine';
import { THERISING_SFX_KEYS } from './TheRisingConstants';

/** Duration (ms) of the deal/place animations. */
export const RISING_ANIM_DURATION = 380;

/** A transformable card display object (a sprite or container). */
export type RisingCardTarget = Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.GameObject;

/** Options for dealing a spirit from the Spirit Row. */
export interface DealFromMarketOptions {
  /** The card display object to animate. */
  readonly target: RisingCardTarget;
  /** Source position (usually the Spirit Row slot). */
  readonly source: { x: number; y: number };
  /** Destination position (usually the hand). */
  readonly destination: { x: number; y: number };
  /** Called once the deal animation completes. */
  readonly onComplete?: () => void;
}

/** Options for placing a spirit on the timeline. */
export interface PlaceOnTimelineOptions {
  /** The card display object to animate. */
  readonly target: RisingCardTarget;
  /** Destination position (the timeline slot). */
  readonly destination: { x: number; y: number };
  /** Called once the place animation completes. */
  readonly onComplete?: () => void;
}

/**
 * Drives card movement and feedback animations for The Rising.
 */
export class TheRisingAnimator {
  /** When true, movement snaps and the reject shake is skipped. */
  reducedMotion = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly soundManager: SoundManager | null,
  ) {}

  /**
   * Animate a spirit being dealt from the Spirit Row into the hand.
   *
   * Plays `sfx-card-draw` at the start; the reveal sound plays at the end so a
   * card entering the hand is both seen and heard.
   */
  dealFromMarket(options: DealFromMarketOptions): Phaser.Tweens.Tween {
    const tween = dealCard({
      scene: this.scene,
      target: options.target,
      sourceX: options.source.x,
      sourceY: options.source.y,
      destX: options.destination.x,
      destY: options.destination.y,
      duration: RISING_ANIM_DURATION,
      reducedMotion: this.reducedMotion,
      soundManager: this.soundManager,
      sfx: { start: THERISING_SFX_KEYS.SPIRIT_DEAL, end: THERISING_SFX_KEYS.SPIRIT_REVEAL },
    });
    this.scheduleCompletion(options.onComplete, RISING_ANIM_DURATION);
    return tween;
  }

  /**
   * Animate a spirit snapping onto the timeline.
   *
   * Plays `sfx-card-swap` at the start of the placement motion.
   */
  placeOnTimeline(options: PlaceOnTimelineOptions): Phaser.Tweens.Tween {
    const tween = placeCard({
      scene: this.scene,
      target: options.target,
      destX: options.destination.x,
      destY: options.destination.y,
      duration: RISING_ANIM_DURATION,
      reducedMotion: this.reducedMotion,
      soundManager: this.soundManager,
      sfx: { start: THERISING_SFX_KEYS.SPIRIT_PLACE },
    });
    this.scheduleCompletion(options.onComplete, RISING_ANIM_DURATION);
    return tween;
  }

  /**
   * Play rejection feedback for an illegal placement / unaffordable meet.
   *
   * Uses the shared `shakeIllegalMove` helper (which plays `sfx-illegal-move`
   * itself) for Image/Sprite targets. Spirit cards are custom-rendered
   * `Container`s with no tint component, so a container-safe position shake +
   * SFX is used instead. Under reduced motion the shake is skipped but the SFX
   * still plays, so the rejection is audible without motion.
   */
  rejectPlacement(
    target: RisingCardTarget | null | undefined,
    onComplete?: () => void,
  ): void {
    if (this.reducedMotion) {
      this.playIllegalMoveSound();
      onComplete?.();
      return;
    }

    const tintable = target as unknown as
      | (RisingCardTarget & { setTint?: (tint: number) => void })
      | null
      | undefined;

    if (tintable && typeof tintable.setTint === 'function') {
      shakeIllegalMove({
        scene: this.scene,
        target: tintable as Phaser.GameObjects.Image,
        soundKey: THERISING_SFX_KEYS.ILLEGAL_MOVE,
        onComplete,
      });
      return;
    }

    if (!target) {
      this.playIllegalMoveSound();
      onComplete?.();
      return;
    }

    // Container-safe shake: no tint component, so shake the x position and
    // play the illegal-move SFX ourselves (never double-played — this branch
    // does not call `shakeIllegalMove`).
    this.playIllegalMoveSound();
    const originalX = target.x;
    this.scene.tweens.add({
      targets: target as unknown as object,
      x: originalX - 5,
      duration: 50,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.inOut',
      onComplete: () => {
        target.setX(originalX);
        onComplete?.();
      },
    });
  }

  /**
   * Pop a `+N Insight` notification and play the shared score-reveal SFX.
   *
   * The popup uses the shared `popTextOrIcon` helper; the SFX is played
   * explicitly (and exactly once) because that helper has no audio of its own.
   * Under reduced motion the popup is skipped by the helper but the SFX still
   * plays, so the award is never silent.
   */
  popInsight(amount: number, at?: { x: number; y: number }): void {
    this.playSfx(THERISING_SFX_KEYS.INSIGHT_REVEAL);
    if (!at) return;
    void popTextOrIcon({
      scene: this.scene,
      x: at.x,
      y: at.y,
      label: `+${amount} Insight`,
      reducedMotion: this.reducedMotion,
      style: { color: '#88ff88' },
    });
  }

  /**
   * Pop the advanced Rising Clock year and play the shared turn-change SFX.
   *
   * As with {@link popInsight}, the SFX plays once regardless of reduced motion
   * so the turn transition is always audible.
   */
  popClockAdvance(year: number, at?: { x: number; y: number }): void {
    this.playSfx(THERISING_SFX_KEYS.TURN_CHANGE);
    if (!at) return;
    void popTextOrIcon({
      scene: this.scene,
      x: at.x,
      y: at.y,
      label: `Rising Clock ${year}`,
      reducedMotion: this.reducedMotion,
      style: { color: '#e8e2d0' },
    });
  }

  /** Play the win or loss sting for a finished session. */
  playGameResult(outcome: 'won' | 'lost' | 'in-progress'): void {
    if (outcome === 'won') {
      this.playSfx(THERISING_SFX_KEYS.GAME_WIN);
    } else if (outcome === 'lost') {
      this.playSfx(THERISING_SFX_KEYS.GAME_LOST);
    }
  }

  /**
   * Schedule an optional completion callback after an animation.
   *
   * The core movement helpers (`dealCard` / `placeCard`) chain their own
   * sub-tweens internally and expose no completion option, so the callback is
   * timed against the helper's known total duration (and snaps to the reduced-
   * motion duration when motion is off).
   */
  private scheduleCompletion(
    onComplete: (() => void) | undefined,
    duration: number,
  ): void {
    if (!onComplete) return;
    this.scene.time.delayedCall(this.reducedMotion ? 50 : duration, onComplete);
  }

  private playIllegalMoveSound(): void {
    this.playSfx(THERISING_SFX_KEYS.ILLEGAL_MOVE);
  }

  /** Play an SFX through the shared SoundManager, falling back to scene audio. */
  private playSfx(key: string): void {
    if (this.soundManager) {
      this.soundManager.play(key);
      return;
    }
    safePlaySound(this.scene, key);
  }
}
