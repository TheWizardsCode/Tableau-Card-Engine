/**
 * Rule Engine Module
 *
 * Provides a component for creating and enforcing game rules,
 * enabling complex gameplay mechanics, turn logic, and validation.
 */
export const RULE_ENGINE_VERSION = '0.1.0';

// ── Legality types ──────────────────────────────────────────

/**
 * Result of a legality check on a game action or move.
 *
 * Discriminated union on the `legal` property:
 * - `{ legal: true }` when the action is permitted.
 * - `{ legal: false; reason: string }` when the action is
 *   forbidden, with a human-readable explanation.
 *
 * @example
 * ```ts
 * function checkMove(move: Move): LegalityResult {
 *   if (!isValid(move)) {
 *     return { legal: false, reason: 'Invalid move' };
 *   }
 *   return { legal: true };
 * }
 *
 * const result = checkMove(someMove);
 * if (!result.legal) {
 *   console.warn(result.reason);
 * }
 * ```
 */
export type LegalityResult =
  | { legal: true }
  | { legal: false; reason: string };
