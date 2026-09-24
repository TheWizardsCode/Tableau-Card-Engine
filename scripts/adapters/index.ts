/**
 * Replay Adapters -- barrel file (core).
 *
 * Exposes the shared replay-adapter framework and the global adapter
 * registry. Per-game adapters live with their games (e.g.
 * `example-games/golf/scripts/adapters/GolfReplayAdapter.ts`) and register
 * themselves at startup, so this module carries no game imports and the core
 * repo builds with no games checked out.
 *
 * ## Registration
 *
 * `adapterRegistry` is a plain registry: callers (a game's entry point, the
 * game-discovery plugin, or a test) register their adapters in the order they
 * wish auto-detection to run. Adapters with an explicit `game`/`gameType`
 * field should be registered before structural-match adapters (such as Golf,
 * which has no `gameType` field and relies on shape matching).
 *
 * @example
 * ```ts
 * import { adapterRegistry, type ReplayAdapter } from './scripts/adapters';
 *
 * adapterRegistry.register(new MyGameReplayAdapter());
 * const adapter = adapterRegistry.resolve(parsedTranscript, cliGameType);
 * ```
 *
 * Related work item: CG-0MLTFUL061DWDGA2
 */

// Re-export public API
export type { ReplayAdapter, ValidationResult, TakeoverOptions } from './ReplayAdapter';
export { adapterRegistry } from './AdapterRegistry';

import { adapterRegistry } from './AdapterRegistry';
import type { ReplayAdapter } from './ReplayAdapter';

/**
 * Register a batch of adapters in the given order.
 *
 * Provided so a composition root (a game repo's entry point, or a
 * distribution's generated registry) can install its adapters without this
 * core module importing any game.
 *
 * @param adapters Adapters to register, in auto-detection priority order.
 */
export function registerAdapters(adapters: readonly ReplayAdapter[]): void {
  for (const adapter of adapters) {
    adapterRegistry.register(adapter);
  }
}
