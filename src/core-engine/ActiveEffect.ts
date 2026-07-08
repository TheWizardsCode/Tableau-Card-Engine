/**
 * ActiveEffect: Duration-Based Modifier System
 *
 * Tracks ongoing modifiers with a turn-based duration (decay).
 * Effects are created by duration-based events, decay each turn,
 * and expire automatically when turnsRemaining reaches 0.
 *
 * Designed to be extensible for future duration-based effect types
 * (e.g. income reduction, reputation modifiers, bonus effects).
 *
 * @module
 */

// ── Types ───────────────────────────────────────────────────

/**
 * An active modifier effect with a fixed duration.
 *
 * Each effect carries:
 * - `effectType`: discriminator for which aspect of the game is modified
 *   (e.g. 'income-multiplier', 'rep-multiplier')
 * - `multiplier`: the scalar value applied (e.g. 0.8 for 80% income)
 * - `turnsRemaining`: number of turns (including current) before expiry
 * - `sourceEventId`: the card/event ID that created this effect
 * - `description`: human-readable summary for UI/log display
 */
export interface ActiveEffect {
  readonly effectType: string;
  readonly multiplier: number;
  turnsRemaining: number;
  readonly sourceEventId: string;
  readonly description: string;
}

// ── Result Types ────────────────────────────────────────────

/** Result of applying decay to a list of active effects. */
export interface DecayResult {
  /** Effects that are still active after decay (turnsRemaining > 0). */
  active: ActiveEffect[];
  /** Effects that expired during this decay cycle (turnsRemaining <= 0). */
  expired: ActiveEffect[];
  /**
   * All effects after the decay pass (same as `active`).
   * Provided for convenience to avoid destructuring when only the
   * post-decay array is needed.
   */
  effects: ActiveEffect[];
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Creates a new ActiveEffect with the given properties.
 *
 * @param effectType    The type of modifier effect
 * @param multiplier    The scalar multiplier (e.g. 0.8 for 80%)
 * @param turnsRemaining Number of turns the effect lasts
 * @param sourceEventId The card/event ID that created this effect
 * @param description   Human-readable description
 * @returns A new ActiveEffect instance
 */
export function createActiveEffect(
  effectType: string,
  multiplier: number,
  turnsRemaining: number,
  sourceEventId: string,
  description: string,
): ActiveEffect {
  return {
    effectType,
    multiplier,
    turnsRemaining,
    sourceEventId,
    description,
  };
}

// ── Decay Logic ─────────────────────────────────────────────

/**
 * Decrements turnsRemaining on all active effects and returns
 * two sets: effects that are still active and effects that have expired.
 *
 * Expired effects are those with turnsRemaining <= 0 after decrement.
 *
 * @param effects  Array of active effects to decay.
 * @returns DecayResult with active, expired, and effects arrays.
 */
export function decayActiveEffects(effects: ActiveEffect[]): DecayResult {
  const active: ActiveEffect[] = [];
  const expired: ActiveEffect[] = [];

  for (const effect of effects) {
    effect.turnsRemaining -= 1;
    if (effect.turnsRemaining <= 0) {
      expired.push(effect);
    } else {
      active.push(effect);
    }
  }

  return { active, expired, effects: [...active, ...expired] };
}

// ── Multiplier Application ──────────────────────────────────

/**
 * Applies all active multipliers of the given effectType to a base value.
 *
 * Multipliers are composed multiplicatively. For example, two 0.8×
 * effects produce 0.8 × 0.8 = 0.64 × the base value.
 *
 * @param effects     Array of active effects to check.
 * @param effectType  The type of effects to apply.
 * @param baseValue   The value to apply multipliers to.
 * @returns The modified value (rounded to nearest integer).
 */
export function applyActiveEffectMultiplier(
  effects: ActiveEffect[],
  effectType: string,
  baseValue: number,
): number {
  let multiplier = 1;
  for (const effect of effects) {
    if (effect.effectType === effectType) {
      multiplier *= effect.multiplier;
    }
  }
  return Math.round(baseValue * multiplier);
}

// ── Type Check ──────────────────────────────────────────────

/**
 * Returns true if at least one active effect of the given type exists.
 *
 * @param effects     Array of active effects to search.
 * @param effectType  The effect type to check for.
 * @returns True if a matching effect exists.
 */
export function hasActiveEffectOfType(
  effects: ActiveEffect[],
  effectType: string,
): boolean {
  return effects.some(e => e.effectType === effectType);
}
