/**
 * Economy Ledger
 *
 * A generic resource-tracking component for managing mutable game economy
 * values (coins, reputation, score). Captures the baseline mutation
 * semantics extracted from Main Street so that future games can reuse
 * the same resource-delta patterns without copying game-specific code.
 *
 * Key design decisions inherited from Main Street baseline:
 *  - Coins are allowed to go negative (bankruptcy is checked downstream).
 *  - Reputation is allowed to go negative (collapse is checked downstream).
 *  - Score is a read-only derived value by default (computed from coins +
 *    reputation), but can be set directly via `setScore()` for games that
 *    treat score as an independent resource.
 *  - No `canApply` guard prevents negative balances — the game engine is
 *    responsible for loss-condition checks after mutations.
 *
 * @module
 */

// ── Types ───────────────────────────────────────────────────

/**
 * A delta to apply to one or more economy resources.
 * Each field is optional — only specified resources are mutated.
 */
export interface ResourceDelta {
  coins?: number;
  reputation?: number;
  score?: number;
}

/**
 * Readonly snapshot of current resource values.
 */
export interface ResourceSnapshot {
  coins: number;
  reputation: number;
  score: number;
}

/**
 * Optional constraints applied during `canApply` checks.
 * When omitted, `canApply` always returns true (matching Main Street's
 * baseline where negative balances are permitted and checked later).
 */
export interface EconomyConstraints {
  /** If set, `canApply` returns false when coins would drop below this floor. */
  minCoins?: number;
  /** If set, `canApply` returns false when reputation would drop below this floor. */
  minReputation?: number;
}

// ── EconomyLedger ───────────────────────────────────────────

/**
 * Manages a set of economy resources with get/apply semantics.
 *
 * The ledger does NOT enforce loss conditions (bankruptcy, reputation
 * collapse, etc.). Those are the responsibility of the game engine's
 * win/loss detection logic, which reads from the ledger after mutations.
 *
 * @example
 * ```ts
 * const ledger = createEconomyLedger({ coins: 10, reputation: 3 });
 *
 * // Purchase a business
 * if (ledger.canApply({ coins: -cost })) {
 *   ledger.apply({ coins: -cost }, 'buy-business');
 * }
 *
 * // Earn income (with reputation multiplier applied upstream)
 * ledger.apply({ coins: incomeAmount }, 'income');
 *
 * // Event resolution
 * ledger.apply({ coins: coinDelta, reputation: repDelta }, 'event-resolve');
 * ```
 */
export interface EconomyLedger {
  /** Returns the current value of a resource. */
  get(resource: keyof ResourceDelta): number;

  /** Returns a snapshot of all resource values. */
  snapshot(): ResourceSnapshot;

  /**
   * Checks whether a delta can be applied given the current constraints.
   *
   * With no constraints (the default), always returns true — matching
   * Main Street's baseline where negative balances are allowed.
   */
  canApply(delta: ResourceDelta): boolean;

  /**
   * Applies a resource delta. Mutates the ledger state in-place.
   *
   * @param delta  The resource changes to apply (each field is additive).
   * @param reason A label for logging/debugging (not stored).
   */
  apply(delta: ResourceDelta, reason?: string): void;

  /**
   * Sets the score to an absolute value (for games where score is an
   * independent resource rather than a derived computation).
   */
  setScore(value: number): void;
}

/**
 * Configuration for creating an EconomyLedger.
 */
export interface EconomyLedgerConfig {
  /** Initial coins (default: 0). */
  coins?: number;
  /** Initial reputation (default: 0). */
  reputation?: number;
  /** Initial score (default: 0). */
  score?: number;
  /** Optional constraints for `canApply` checks. */
  constraints?: EconomyConstraints;
}

/**
 * Creates an EconomyLedger with the given initial values and constraints.
 *
 * @param config  Initial resource values and optional constraints.
 * @returns A new EconomyLedger instance.
 */
export function createEconomyLedger(config: EconomyLedgerConfig = {}): EconomyLedger {
  let coins = config.coins ?? 0;
  let reputation = config.reputation ?? 0;
  let score = config.score ?? 0;
  const constraints = config.constraints ?? {};

  return {
    get(resource: keyof ResourceDelta): number {
      switch (resource) {
        case 'coins':
          return coins;
        case 'reputation':
          return reputation;
        case 'score':
          return score;
      }
    },

    snapshot(): ResourceSnapshot {
      return { coins, reputation, score };
    },

    canApply(delta: ResourceDelta): boolean {
      if (delta.coins !== undefined && constraints.minCoins !== undefined) {
        if (coins + delta.coins < constraints.minCoins) return false;
      }
      if (delta.reputation !== undefined && constraints.minReputation !== undefined) {
        if (reputation + delta.reputation < constraints.minReputation) return false;
      }
      return true;
    },

    apply(delta: ResourceDelta, _reason?: string): void {
      if (delta.coins !== undefined) coins += delta.coins;
      if (delta.reputation !== undefined) reputation += delta.reputation;
      if (delta.score !== undefined) score += delta.score;
    },

    setScore(value: number): void {
      score = value;
    },
  };
}
