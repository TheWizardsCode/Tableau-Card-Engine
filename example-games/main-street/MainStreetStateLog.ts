/**
 * Main Street: Activity Log Helpers
 *
 * Appends and classifies activity-log entries, describes effective effect
 * deltas, and keeps the shared EconomyLedger consistent with resourceBank.
 *
 * Import graph: depends on `MainStreetStateTypes` (state shape).
 *
 * @module
 */

import type { MainStreetState, LogEntryType } from './MainStreetStateTypes';

/**
 * Builds a compact, human-readable description of an effective (post-mitigation)
 * coin/reputation change pair for activity-log entries (CG-0MT5W7UJJ0065MEZ).
 *
 * Examples:
 *   - `+3 coins, +2 rep` for a gain of 3 coins and 2 reputation
 *   - `-1 coins` for a pure coin loss
 *   - `+1 rep` for a pure reputation gain
 *   - `no effect` when both deltas are zero
 *
 * @param coinChange Effective coins delta (integer).
 * @param repChange  Effective reputation delta.
 */
export function describeEventEffects(coinChange: number, repChange: number): string {
  const parts: string[] = [];
  if (coinChange !== 0) parts.push(`${coinChange > 0 ? '+' : ''}${Math.round(coinChange)} coins`);
  if (repChange !== 0) parts.push(`${repChange > 0 ? '+' : ''}${Math.round(repChange)} rep`);
  return parts.length > 0 ? parts.join(', ') : 'no effect';
}

/**
 * Classifies a coin/rep change pair as gain, loss, or neutral for log coloring.
 *
 * Uses the NET coin+rep heuristic (sum of both deltas); shared by every
 * enriched log site so a mixed exchange (e.g. -2 coins +1 rep) colours
 * consistently with its effective net effect.
 */
export function classifyEffect(
  coinChange: number,
  repChange: number,
): 'gain' | 'loss' | 'neutral' {
  const net = coinChange + repChange;
  if (net > 0) return 'gain';
  if (net < 0) return 'loss';
  return 'neutral';
}

/**
 * Appends a log entry to the activity log.
 *
 * Convenience helper so engine/market functions don't need to
 * construct the object themselves.
 */
export function addLog(
  state: MainStreetState,
  text: string,
  type: LogEntryType,
): void {
  state.activityLog.push({ turn: state.turn, text, type });
}

/**
 * Syncs the shared EconomyLedger from resourceBank values.
 * Called after direct resourceBank mutations to keep the ledger consistent.
 */
export function syncResourceBankToLedger(state: MainStreetState): void {
  const coins = state.resourceBank.coins;
  const rep = state.resourceBank.reputation;
  const coinDelta = coins - state.ledger.get('coins');
  const repDelta = rep - state.ledger.get('reputation');
  if (coinDelta !== 0 || repDelta !== 0) {
    state.ledger.apply({ coins: coinDelta, reputation: repDelta }, 'sync-from-resourceBank');
  }
}

