/**
 * AiStrategy.ts
 *
 * AI timing strategy for The Mind.
 * Pure logic — no Phaser dependency. Computes per-card play delays using
 * a linear proportional formula with seeded jitter:
 *
 *   delay = (cardValue / 100) × baseDuration + jitter
 *
 * where jitter is drawn from [−jitterRange, +jitterRange] using a seeded
 * RNG for deterministic replay. Each card gets its own independent timer;
 * timers are committed once at the start of each level and never reset
 * (even when the pile top changes from a partner play).
 *
 * Scene integration (Feature 6) will schedule these computed delays using
 * Phaser time events.
 *
 * @module
 */

import type { MindCard } from './MindCard';
import type { AiStrategyBase } from '../../src/ai';
import { AiPlayer as AiPlayerBase } from '../../src/ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base duration in milliseconds. */
export const DEFAULT_BASE_DURATION = 10000;

/** Default jitter range (±ms). */
export const DEFAULT_JITTER_RANGE = 800;

/** Minimum delay in ms — prevents the AI from playing instantly. */
export const MIN_PLAY_DELAY = 1500;

/**
 * Short delay (ms) used when the opponent's hand is empty.  Once one
 * player has finished, the remaining player's cards are obvious plays so
 * a long wait feels unnatural.
 */
export const AI_LAST_CARD_DELAY = 400;

/**
 * Compute the effective AI play delay for a scheduled card.
 *
 * When the opponent's hand is empty, returns {@link AI_LAST_CARD_DELAY}
 * so the remaining cards are played quickly.  Otherwise falls back to the
 * normal elapsed-time calculation (clamped to a 100 ms floor).
 */
export function computeEffectiveDelay(
  committedDelay: number,
  elapsedSinceLevelStart: number,
  _playerHandSize: number,
  opponentHandSize: number,
): number {
  if (opponentHandSize === 0) {
    return AI_LAST_CARD_DELAY;
  }
  return Math.max(committedDelay - elapsedSinceLevelStart, 100);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single card's computed delay. */
export interface CardDelay {
  /** The card this delay applies to. */
  readonly card: MindCard;
  /** Computed delay in milliseconds (may be negative before clamping). */
  readonly delay: number;
}

/** Configuration for the timing strategy. */
export interface MindAiTimingConfig {
  /**
   * Base duration in milliseconds used to scale card values.
   * Must be > 0 (throws otherwise).
   */
  readonly baseDuration: number;
  /**
   * Symmetric jitter range in milliseconds.
   * Jitter is drawn uniformly from [−jitterRange, +jitterRange].
   * Must be >= 0. Defaults to {@link DEFAULT_JITTER_RANGE}.
   */
  readonly jitterRange: number;
}

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

/**
 * AI strategy for The Mind.
 *
 * Extends {@link AiStrategyBase} with a method to compute per-card play
 * delays for all held cards.
 */
export interface MindAiStrategy extends AiStrategyBase {
  /**
   * Compute play delays for every card in the provided hand.
   *
   * Each card's delay is independent:
   *   delay = (card.value / 100) × baseDuration + jitter
   *
   * Jitter is drawn from a seeded RNG so results are deterministic
   * for a given seed.
   *
   * @param hand - The cards currently held (not mutated).
   * @param config - Timing parameters (baseDuration, jitterRange).
   * @param rng - Seeded RNG returning values in [0, 1).
   * @returns An array of CardDelay entries (unsorted).
   */
  computeDelays(
    hand: ReadonlyArray<MindCard>,
    config: MindAiTimingConfig,
    rng: () => number,
  ): CardDelay[];
}

// ---------------------------------------------------------------------------
// Linear proportional strategy
// ---------------------------------------------------------------------------

/**
 * The standard timing strategy.
 *
 * Uses a linear proportional model where higher-value cards have longer
 * delays, with random jitter to add unpredictability.
 */
export const LinearTimingStrategy: MindAiStrategy = {
  name: 'LinearTiming',

  computeDelays(
    hand: ReadonlyArray<MindCard>,
    config: MindAiTimingConfig,
    rng: () => number,
  ): CardDelay[] {
    if (config.baseDuration <= 0) {
      throw new Error(
        `baseDuration must be positive, got ${config.baseDuration}`,
      );
    }

    return hand.map((card) => {
      // jitter ∈ [−jitterRange, +jitterRange]
      const jitter = (rng() * 2 - 1) * config.jitterRange;
      const raw = (card.value / 100) * config.baseDuration + jitter;
      // Enforce minimum delay so the AI never plays instantly
      const delay = Math.max(raw, MIN_PLAY_DELAY);
      return { card, delay };
    });
  },
};

// ---------------------------------------------------------------------------
// AI Player class
// ---------------------------------------------------------------------------

/**
 * AI player for The Mind that wraps a timing strategy and manages
 * committed per-card delays across a level.
 *
 * Usage:
 * 1. Call {@link commitLevel} at the start of each level to compute
 *    and lock in delays for the AI's hand.
 * 2. Call {@link getCardDelays} to retrieve all committed delays
 *    sorted by earliest fire time.
 * 3. Call {@link getNextCard} to get the card with the shortest delay.
 * 4. Call {@link removeCard} when a card is played (by AI or discarded
 *    via penalty) — remaining timers are NOT reset.
 *
 * Scene integration will poll {@link getNextCard} and schedule a Phaser
 * time event for its delay, cancelling/rescheduling if a penalty
 * removes the card before it fires.
 */
export class MindAiPlayer extends AiPlayerBase<MindAiStrategy> {
  private committedDelays: CardDelay[] = [];
  private readonly config: MindAiTimingConfig;

  constructor(
    strategy: MindAiStrategy = LinearTimingStrategy,
    rng: () => number = Math.random,
    config?: Partial<MindAiTimingConfig>,
  ) {
    super(strategy, rng);
    this.config = {
      baseDuration: config?.baseDuration ?? DEFAULT_BASE_DURATION,
      jitterRange: config?.jitterRange ?? DEFAULT_JITTER_RANGE,
    };
  }

  /**
   * Commit delays for a new level.
   *
   * Computes independent delays for every card in the AI's hand
   * and locks them in for the duration of the level. Must be called
   * once at the start of each level.
   *
   * @param hand - The AI's dealt hand for this level.
   */
  commitLevel(hand: ReadonlyArray<MindCard>): void {
    const raw = this.strategy.computeDelays(hand, this.config, this.rng);
    // Sort by delay ascending (earliest first)
    this.committedDelays = raw.sort((a, b) => a.delay - b.delay);
  }

  /**
   * Get all committed card delays, sorted by earliest fire time.
   *
   * Returns a defensive copy so callers cannot mutate internal state.
   */
  getCardDelays(): CardDelay[] {
    return [...this.committedDelays];
  }

  /**
   * Get the card with the shortest remaining delay (next to play).
   *
   * @returns The CardDelay with the smallest delay, or `undefined`
   *          if no cards remain.
   */
  getNextCard(): CardDelay | undefined {
    return this.committedDelays[0];
  }

  /**
   * Remove a card from the committed delays.
   *
   * Called when the card is played or discarded via penalty.
   * Remaining card timers are NOT reset — they continue as committed.
   *
   * @param cardValue - The value of the card to remove.
   * @returns `true` if the card was found and removed.
   */
  removeCard(cardValue: number): boolean {
    const idx = this.committedDelays.findIndex(
      (d) => d.card.value === cardValue,
    );
    if (idx === -1) return false;
    this.committedDelays.splice(idx, 1);
    return true;
  }

  /**
   * Check whether the AI has any committed cards remaining.
   */
  hasCards(): boolean {
    return this.committedDelays.length > 0;
  }

  /**
   * Get the timing configuration.
   */
  getConfig(): Readonly<MindAiTimingConfig> {
    return this.config;
  }
}
