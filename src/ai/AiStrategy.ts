/**
 * Shared AI Strategy abstractions
 *
 * Provides the base interface and generic player wrapper used by all
 * example games.  Game-specific strategy interfaces extend
 * {@link AiStrategyBase} with their own decision methods.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Strategy base
// ---------------------------------------------------------------------------

/**
 * Base constraint for any AI strategy.
 *
 * Every game-specific strategy interface should extend this.  The only
 * requirement is a human-readable `name` used for display and logging.
 *
 * @example
 * ```ts
 * interface MyGameStrategy extends AiStrategyBase {
 *   chooseMove(state: MyState, rng: () => number): MyAction;
 * }
 * ```
 */
export interface AiStrategyBase {
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Generic AI player wrapper
// ---------------------------------------------------------------------------

/**
 * Generic AI player that binds a strategy to an RNG source.
 *
 * Game-specific player classes extend this and expose decision methods
 * that delegate to the strategy while hiding the `rng` parameter from
 * callers.
 *
 * @typeParam TStrategy - The game-specific strategy interface.
 *
 * @example
 * ```ts
 * class MyAiPlayer extends AiPlayer<MyGameStrategy> {
 *   chooseMove(state: MyState): MyAction {
 *     return this.strategy.chooseMove(state, this.rng);
 *   }
 * }
 * ```
 */
export class AiPlayer<TStrategy extends AiStrategyBase> {
  readonly strategy: TStrategy;
  protected readonly rng: () => number;

  constructor(strategy: TStrategy, rng: () => number = Math.random) {
    this.strategy = strategy;
    this.rng = rng;
  }

  /** Human-readable name of the current strategy. */
  get strategyName(): string {
    return this.strategy.name;
  }
}
