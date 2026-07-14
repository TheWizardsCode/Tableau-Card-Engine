/**
 * Adapter Registry -- selects the correct ReplayAdapter for a transcript.
 *
 * The registry maintains an ordered list of adapters.  Selection uses
 * two strategies:
 *
 * 1. **Explicit override** -- The `--game <type>` CLI flag selects an
 *    adapter by its `gameType` property.
 * 2. **Auto-detection** -- Each adapter's `canHandle(raw)` method is
 *    called in registration order.  The first match wins.
 *
 * Adapters are registered with `register()` and can be listed with
 * `getRegistered()`.  The registry is pre-populated with all known
 * adapters in `index.ts`.
 *
 * @see ReplayAdapter -- interface definition
 * @see scripts/replay.ts -- consumer
 *
 * Related work item: CG-0MLTFUL061DWDGA2
 */

import type { ReplayAdapter } from './ReplayAdapter';

/** Singleton adapter registry. */
class AdapterRegistry {
  private readonly adapters: ReplayAdapter[] = [];

  /**
   * Register an adapter.  Order matters for auto-detection:
   * adapters registered first take priority.
   *
   * @param adapter - The adapter instance to register.
   * @throws If an adapter with the same `gameType` is already registered.
   */
  register(adapter: ReplayAdapter): void {
    if (this.adapters.some((a) => a.gameType === adapter.gameType)) {
      throw new Error(
        `Adapter for game type '${adapter.gameType}' is already registered.`,
      );
    }
    this.adapters.push(adapter);
  }

  /**
   * Select an adapter by explicit game type.
   *
   * @param gameType - The game type identifier (e.g. `'golf'`).
   * @returns The matching adapter, or `undefined` if not found.
   */
  getByType(gameType: string): ReplayAdapter | undefined {
    return this.adapters.find((a) => a.gameType === gameType);
  }

  /**
   * Auto-detect the adapter for a parsed transcript by calling
   * `canHandle()` on each registered adapter in order.
   *
   * @param raw - The parsed (but untyped) transcript JSON.
   * @returns The first matching adapter, or `undefined`.
   */
  detect(raw: unknown): ReplayAdapter | undefined {
    return this.adapters.find((a) => a.canHandle(raw));
  }

  /**
   * Resolve an adapter for a transcript, using explicit override
   * if provided, otherwise auto-detection.
   *
   * @param raw - The parsed transcript JSON.
   * @param gameTypeOverride - Optional explicit game type from CLI.
   * @returns The selected adapter.
   * @throws If no adapter matches.
   */
  resolve(raw: unknown, gameTypeOverride?: string): ReplayAdapter {
    if (gameTypeOverride) {
      const adapter = this.getByType(gameTypeOverride);
      if (!adapter) {
        const available = this.adapters.map((a) => a.gameType).join(', ');
        throw new Error(
          `Unknown game type '${gameTypeOverride}'. ` +
            `Available adapters: ${available || 'none'}`,
        );
      }
      return adapter;
    }

    const adapter = this.detect(raw);
    if (!adapter) {
      const available = this.adapters.map((a) => a.gameType).join(', ');
      throw new Error(
        'Could not auto-detect game type from transcript. ' +
          `Available adapters: ${available || 'none'}. ` +
          'Use --game <type> to specify explicitly.',
      );
    }
    return adapter;
  }

  /**
   * Return a copy of all registered adapters.
   */
  getRegistered(): readonly ReplayAdapter[] {
    return [...this.adapters];
  }

  /**
   * Return all registered game type identifiers.
   */
  getRegisteredTypes(): string[] {
    return this.adapters.map((a) => a.gameType);
  }

  /**
   * Remove all registered adapters.  Primarily for testing.
   */
  clear(): void {
    this.adapters.length = 0;
  }
}

/**
 * The global adapter registry instance.
 *
 * Pre-populated with known adapters in `scripts/adapters/index.ts`.
 */
export const adapterRegistry = new AdapterRegistry();
