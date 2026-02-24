/**
 * Replay Adapters -- barrel file.
 *
 * Imports all known replay adapters and registers them with the
 * global adapter registry.  Import this module to get a fully
 * configured registry.
 *
 * Registration order determines auto-detection priority.  Adapters
 * with explicit `game`/`gameType` fields (like BC) are registered
 * first so they match before structural detection (like Golf, which
 * has no `gameType` field and relies on shape matching).
 *
 * @example
 * ```ts
 * import { adapterRegistry } from './adapters';
 *
 * const adapter = adapterRegistry.resolve(parsedTranscript, cliGameType);
 * ```
 *
 * Related work item: CG-0MLTFUL061DWDGA2
 */

// Re-export public API
export type { ReplayAdapter, ValidationResult, TakeoverOptions } from './ReplayAdapter';
export { adapterRegistry } from './AdapterRegistry';

// Import and register adapters
// Order matters: explicit-field adapters first, structural-match last
import { BeleagueredCastleReplayAdapter } from './BeleagueredCastleReplayAdapter';
import { GolfReplayAdapter } from './GolfReplayAdapter';
import { adapterRegistry } from './AdapterRegistry';

// BC has an explicit `game: 'beleaguered-castle'` field -- register first
adapterRegistry.register(new BeleagueredCastleReplayAdapter());

// Golf uses structural detection (no `gameType` field) -- register last
adapterRegistry.register(new GolfReplayAdapter());
