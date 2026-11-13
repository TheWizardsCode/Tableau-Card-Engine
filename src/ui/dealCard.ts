import { SoundManager, applyDefaults, DEFAULT_MOVE_SFX_INTERVAL_MS } from '../core-engine';
import { emitEventOrCallback } from '../core-engine/event-emission';
import type { CardDealtPayload } from '../core-engine/CardEventPayloads';

/**
 * dealCard -- reusable card dealing animation helper.
 *
 * The flight is **one continuous motion**: a single tween drives a normalised
 * progress value from 0 to 1 across the whole duration, and the card's
 * position is evaluated from that progress on a single quadratic arc joining
 * the source to the destination. There is no phase join, so there is no
 * velocity discontinuity — the card never decelerates to a halt part-way
 * through and never restarts its easing (CG-0MWC07OBB004YD5E).
 *
 * @module ui/dealCard
 */

/** Default deal animation duration in milliseconds (bounds the whole flight). */
export const DEFAULT_DEAL_DURATION = 400;

/**
 * Default arc height in pixels.
 *
 * The arc height is the peak displacement of the flight from the straight
 * source→destination chord, reached at {@link DEAL_ARC_PEAK_PROGRESS} of the
 * flight. A negative value lifts the arc upward, giving the classic "card
 * flicks out of the pack and settles into the hand" look; `0` produces a
 * straight-line flight.
 */
export const DEFAULT_DEAL_ARC_HEIGHT = -50;

/**
 * Fraction of the flight (0–1) at which the arc reaches its peak.
 *
 * The arc is a single quadratic bump: zero displacement at both endpoints and
 * maximum displacement at this progress. It must lie strictly between 0 and 1.
 * Re-pacing the arc's shape is a change to this one constant.
 */
export const DEAL_ARC_PEAK_PROGRESS = 0.5;

/**
 * Minimum travel speed, as a fraction of the flight's peak speed, that the
 * card keeps at every **interior** sample of the flight.
 *
 * This is the documented epsilon behind the "no mid-flight stall" guarantee:
 * the speed profile of the flight must stay well clear of zero between launch
 * and landing. The symmetric sine ease-in-out used by {@link DEFAULT_DEAL_EASE}
 * still accelerates from rest and decelerates into the landing frame (the
 * endpoints are the only near-stationary moments), while every interior sample
 * retains at least this fraction of the peak speed.
 */
export const DEAL_MIN_INTERIOR_SPEED_RATIO = 0.05;

/**
 * Default easing for the deal flight — a symmetric sine ease-in-out applied
 * **once across the whole arc** (not per phase).
 *
 * The card starts from rest, whips through the arc peak at its fastest, and
 * settles into the destination: one gesture rather than two. Exported so the
 * pacing of the deal can be tuned in one place; pass any other Phaser easing
 * name (or easing function) via {@link DealCardOptions.ease} to override it.
 */
export function DEFAULT_DEAL_EASE(progress: number): number {
  return (1 - Math.cos(Math.PI * clamp01(progress))) / 2;
}

/** An easing curve: a Phaser easing name, or a function of normalised progress. */
export type DealCardEase = string | ((progress: number) => number);

/**
 * Pure description of the flight the card travels: its endpoints, its arc and
 * the peak rotation applied at the arc peak.
 */
export interface DealPathGeometry {
  /** Starting X coordinate (where the card is dealt from). */
  startX: number;
  /** Starting Y coordinate. */
  startY: number;
  /** Destination X coordinate. */
  destX: number;
  /** Destination Y coordinate. */
  destY: number;
  /** Peak displacement from the source→destination chord (negative = upward). */
  arcHeight: number;
  /** Peak rotation in radians, reached at the arc peak; `0` for no spin. */
  rotation: number;
}

/** A point on the deal flight: position plus rotation. */
export interface DealPathPoint {
  x: number;
  y: number;
  rotation: number;
}

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
   * Duration of the dealing animation in milliseconds. Bounds the **whole**
   * flight (there are no sub-phases with their own durations).
   * @default 400
   */
  duration?: number;

  /**
   * Arc height for the dealing motion (negative = upward arc): the peak
   * displacement from the straight source→destination chord.
   * Set to 0 for straight-line movement.
   * @default -50
   */
  arcHeight?: number;

  /**
   * Easing applied **once across the whole flight** (no mid-flight restart).
   *
   * Accepts a Phaser easing name (e.g. `'Sine.easeInOut'`) or an easing
   * function of normalised progress. Today the caller-supplied easing shapes
   * the entire arc; it no longer shapes only the first portion of the travel.
   * @default DEFAULT_DEAL_EASE
   */
  ease?: DealCardEase;

  /**
   * Optional peak rotation to apply during the deal (in radians), reached at
   * the arc peak. The rotation is driven by the same progress as the position,
   * so it eases out of 0 and back into 0 with no abrupt reversal.
   * Set to a small value (e.g., 0.1) for a slight spin effect.
   * @default 0.05
   */
  rotation?: number;

  /**
   * Optional event emitter to emit events on completion.
   * If not provided, the animation still plays but no event is emitted.
   */
  gameEvents?: { emit(event: string, payload: unknown): void };

  /**
   * Optional card ID to include in the event payload.
   */
  cardId?: string;

  /**
   * Optional player index to include in the event payload.
   */
  playerIndex?: number;

  /**
   * When true, dealing is instant — target snaps to destination without tweens.
   * Overrides CSS media query.  Default: false (animate).
   */
  reducedMotion?: boolean;

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

/** Clamp a value to the normalised progress range `[0, 1]`. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * The arc bump profile: `0` at both endpoints, `1` at
 * {@link DEAL_ARC_PEAK_PROGRESS}.
 *
 * This single quadratic bump replaces the old rise-then-fall pair of tweens:
 * displacement is a continuous function of progress, so the arc has no join to
 * match and the card cannot stall part-way through.
 */
export function dealArcProfile(progress: number): number {
  const t = clamp01(progress);
  const peak = DEAL_ARC_PEAK_PROGRESS;
  return (t * (1 - t)) / (peak * (1 - peak));
}

/**
 * Evaluate the deal flight at a normalised progress value (`0` = source,
 * `1` = destination).
 *
 * The path is a straight line from source to destination plus a single
 * quadratic arc bump of `arcHeight` pixels, and the rotation follows the same
 * bump so its rate is continuous across the flight (it peaks at the arc peak
 * rather than reversing at a phase boundary). Being a pure function of
 * progress, the motion is fully testable without a running tween and is the
 * same code the tween drives in {@link dealCard}.
 */
export function evaluateDealPath(
  geometry: DealPathGeometry,
  progress: number,
): DealPathPoint {
  const t = clamp01(progress);
  const bump = dealArcProfile(t);
  return {
    x: geometry.startX + (geometry.destX - geometry.startX) * t,
    y: geometry.startY + (geometry.destY - geometry.startY) * t + geometry.arcHeight * bump,
    rotation: geometry.rotation * bump,
  };
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
 * The card flies from source to destination in **one continuous arc**: a
 * single tween drives a normalised progress value across the whole duration
 * and the position/rotation are evaluated from it via
 * {@link evaluateDealPath}. Because there is no phase boundary, the card
 * never decelerates to a halt at the arc peak and never restarts its easing
 * — drawing a card reads as one fluid gesture.
 *
 * On completion, emits 'card:dealt' event if gameEvents is provided.
 *
 * @returns The Phaser tween driving the whole flight (can be cancelled; the
 *          card stops wherever it is at that moment).
 */
export function dealCard(opts: DealCardOptions): Phaser.Tweens.Tween {
  const {
    scene,
    target,
    destX,
    destY,
    sourceX,
    sourceY,
    duration,
    arcHeight,
    ease,
    rotation,
    gameEvents,
    cardId,
    playerIndex,
    reducedMotion,
    soundManager,
    sfx,
  } = applyDefaults(opts, {
    duration: DEFAULT_DEAL_DURATION,
    arcHeight: DEFAULT_DEAL_ARC_HEIGHT,
    ease: DEFAULT_DEAL_EASE,
    rotation: 0.05,
    soundManager: null,
  });

  // Determine source position
  const startX = sourceX ?? target.x;
  const startY = sourceY ?? target.y;

  // Set initial position
  target.setPosition(startX, startY);
  target.setRotation(0);

  // Check for reduced motion preference (explicit param takes precedence)
  const shouldReduce = reducedMotion ?? prefersReducedMotion();

  // Handle reduced motion - just jump to destination (ease is not used in reduced motion mode)
  if (shouldReduce) {
    target.setPosition(destX, destY);
    if (gameEvents && cardId) {
      emitEventOrCallback({ gameEvents, event: 'card:dealt', payload: { cardId, playerIndex } as CardDealtPayload });
    }
    return scene.tweens.add({
      targets: target,
      duration: 50,
    });
  }

  const moveInterval = sfx?.moveIntervalMs ?? DEFAULT_MOVE_SFX_INTERVAL_MS;
  let lastMovePlay = 0;
  let loopSound: Phaser.Sound.BaseSound | null = null;

  const geometry: DealPathGeometry = { startX, startY, destX, destY, arcHeight, rotation };

  // A single progress value drives the whole flight. The tween only animates
  // this plain object; the card's transform is evaluated from it on every
  // update, so position and rotation share one continuous curve. The object is
  // local to this call and is released with the tween — no proxy outlives the
  // animation.
  const flight = { progress: 0 };

  const playMoveSfx = () => {
    if (!sfx?.move || sfx.moveLoop) return;
    const now = Date.now();
    if (now - lastMovePlay < moveInterval) return;
    if (soundManager) soundManager.play(sfx.move);
    else { try { scene.sound?.play(sfx.move); } catch { /* ignore */ } }
    lastMovePlay = now;
  };

  return scene.tweens.add({
    targets: flight,
    progress: 1,
    duration,
    ease,
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
      const point = evaluateDealPath(geometry, flight.progress);
      target.setPosition(point.x, point.y);
      target.setRotation(point.rotation);
      playMoveSfx();
    },
    onComplete: () => {
      // Land exactly on the destination (the arc's endpoints already map there;
      // this pins the final transform against any tween rounding).
      target.setPosition(destX, destY);
      target.setRotation(0);
      if (loopSound) { try { loopSound.stop(); } catch { /* ignore */ } loopSound = null; }
      if (sfx?.end) {
        if (soundManager) soundManager.play(sfx.end);
        else { try { scene.sound?.play(sfx.end); } catch { /* ignore */ } }
      }
      if (gameEvents && cardId) {
        emitEventOrCallback({ gameEvents, event: 'card:dealt', payload: { cardId, playerIndex } as CardDealtPayload });
      }
    },
  });
}
