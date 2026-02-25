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
import { LostCitiesReplayAdapter } from './LostCitiesReplayAdapter';
import { TheMindReplayAdapter } from './TheMindReplayAdapter';
import { SushiGoReplayAdapter } from './SushiGoReplayAdapter';
import { SplendorReplayAdapter } from './SplendorReplayAdapter';
import { GolfReplayAdapter } from './GolfReplayAdapter';
import { adapterRegistry } from './AdapterRegistry';

// BC has an explicit `game: 'beleaguered-castle'` field -- register first
adapterRegistry.register(new BeleagueredCastleReplayAdapter());

// LC has an explicit `gameType: 'lost-cities'` field -- register before Golf
adapterRegistry.register(new LostCitiesReplayAdapter());

// The Mind has an explicit `gameType: 'the-mind'` field -- register before Golf
adapterRegistry.register(new TheMindReplayAdapter());

// Sushi Go has an explicit `gameType: 'sushi-go'` field -- register before Golf
adapterRegistry.register(new SushiGoReplayAdapter());

// Splendor has an explicit `gameType: 'splendor'` field -- register before Golf
adapterRegistry.register(new SplendorReplayAdapter());

// Golf uses structural detection (no `gameType` field) -- register last
adapterRegistry.register(new GolfReplayAdapter());
