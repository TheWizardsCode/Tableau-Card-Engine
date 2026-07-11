/**
 * Challenge System -- Generic API Sketch
 *
 * Provides game-agnostic interfaces and utility functions for challenge
 * (meta-goal) systems. Games define concrete challenge templates with
 * game-specific state types; the generic API handles selection,
 * evaluation, and completion tracking uniformly.
 *
 * ## Design Notes for M6 Extraction
 *
 * These interfaces are intentionally generic over `TState` so they can
 * be extracted to a standalone `@core-engine/ChallengeSystem` module
 * without modification. The extraction path is:
 *
 * 1. Move this file to `src/core-engine/ChallengeSystem.ts` (already here).
 * 2. Update the barrel export in `src/core-engine/index.ts` (already done).
 * 3. Game-specific code (e.g. Main Street) imports from `@core-engine`
 *    and provides concrete `TState` and evaluator implementations.
 *
 * No game-specific imports exist in this file.
 *
 * @module
 */

// ── Challenge Definition ────────────────────────────────────

/**
 * A challenge definition: a meta-goal that can be selected for a run.
 *
 * Each challenge has a pure evaluator function that returns `true`
 * when the challenge condition is met based on the current game state.
 *
 * @typeParam TState - The game-specific state type that the evaluator reads.
 *
 * @example
 * ```ts
 * // Main Street concrete challenge
 * const foodieRow: ChallengeDefinition<MainStreetState> = {
 *   id: 'ch-foodie-row',
 *   title: 'Foodie Row',
 *   description: 'Place 3+ adjacent Food businesses.',
 *   category: 'synergy',
 *   evaluator: (state) => countAdjacentFood(state) >= 3,
 *   rewardPoints: 10,
 * };
 * ```
 */
export interface ChallengeDefinition<TState> {
  /** Unique identifier for the challenge. */
  readonly id: string;
  /** Short human-readable title. */
  readonly title: string;
  /** Longer description of what the player needs to accomplish. */
  readonly description: string;
  /** Category for organization and UI display (game-defined string). */
  readonly category: string;
  /**
   * Pure evaluator function. Returns `true` when the challenge condition
   * is satisfied by the current game state.
   */
  readonly evaluator: (state: TState) => boolean;
  /** Bonus points awarded when the challenge is completed. */
  readonly rewardPoints: number;
}

// ── Active Challenge Tracking ───────────────────────────────

/**
 * An active challenge during a game run, tracking completion state.
 *
 * Wraps a {@link ChallengeDefinition} with mutable completion tracking.
 * Once completed, a challenge stays completed (no revocation).
 *
 * @typeParam TState - The game-specific state type.
 */
export interface ActiveChallengeRecord<TState> {
  /** The challenge definition. */
  readonly challenge: ChallengeDefinition<TState>;
  /** Whether this challenge has been completed in the current run. */
  completed: boolean;
}

// ── Selection ───────────────────────────────────────────────

/**
 * Selects N challenges from a template pool using seeded RNG.
 *
 * Uses Fisher-Yates shuffle on a copy of the templates array,
 * then takes the first `count` elements. This ensures deterministic
 * selection: same seed + same templates = same challenges.
 *
 * Edge cases:
 * - `count > templates.length` -> returns all templates
 * - `count <= 0` -> returns empty array
 *
 * @typeParam TState - The game-specific state type.
 * @param templates  The challenge template pool to select from.
 * @param count      Number of challenges to select.
 * @param rng        Seeded RNG function returning values in [0, 1).
 * @returns Array of selected challenge definitions.
 */
export function selectChallenges<TState>(
  templates: readonly ChallengeDefinition<TState>[],
  count: number,
  rng: () => number,
): ChallengeDefinition<TState>[] {
  if (count <= 0) return [];

  // Work on a mutable copy
  const pool = [...templates];
  const n = Math.min(count, pool.length);

  // Fisher-Yates shuffle (full shuffle for uniform distribution)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, n);
}

// ── Evaluation ──────────────────────────────────────────────

/**
 * Callback invoked when a challenge is newly completed during evaluation.
 *
 * Games use this to update their state (e.g. push to a completed-IDs
 * array, add an activity log entry, trigger UI effects).
 *
 * @typeParam TState - The game-specific state type.
 */
export type ChallengeCompletionCallback<TState> = (
  challenge: ChallengeDefinition<TState>,
  state: TState,
) => void;

/**
 * Evaluates all active challenges against the current game state.
 *
 * For each active challenge that is not yet completed, runs its
 * evaluator function. If the evaluator returns `true`, marks the
 * challenge as completed and invokes the optional `onComplete` callback.
 *
 * Once a challenge is marked complete it stays complete (no revocation).
 *
 * @typeParam TState - The game-specific state type.
 * @param activeChallenges  The active challenges to evaluate.
 * @param state             Current game state (read by evaluators).
 * @param onComplete        Optional callback for each newly completed challenge.
 * @returns Array of challenge IDs that were newly completed this call.
 */
export function evaluateChallenges<TState>(
  activeChallenges: ActiveChallengeRecord<TState>[],
  state: TState,
  onComplete?: ChallengeCompletionCallback<TState>,
): string[] {
  const newlyCompleted: string[] = [];

  for (const ac of activeChallenges) {
    if (ac.completed) continue;

    if (ac.challenge.evaluator(state)) {
      ac.completed = true;
      newlyCompleted.push(ac.challenge.id);
      onComplete?.(ac.challenge, state);
    }
  }

  return newlyCompleted;
}
