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
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * Register every adapter listed in the selected game config.
 *
 * The replay tool is core-owned and must run with no games checked out, so it
 * cannot import game adapters statically. Instead it reads the active preset
 * (`configs/<preset>.json`, selected via `GAMES_CONFIG`) and dynamically
 * imports each entry's optional `adapterPath`. A core-only preset registers
 * nothing, which is correct — there are no games to replay.
 *
 * Registration follows the preset order, which is also the auto-detection
 * priority order.
 *
 * @param projectRoot Absolute core-repo root (where `configs/` lives).
 * @param env Environment-like record (defaults to `process.env`).
 * @returns The number of adapters registered.
 */
export async function registerConfiguredAdapters(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const { selectConfigPath, loadGamesConfig } = await import(
    '../vite-game-discovery-plugin'
  );

  let config;
  try {
    config = loadGamesConfig(selectConfigPath(projectRoot, env));
  } catch {
    // No config / unknown preset: nothing to register. The caller reports the
    // "no adapters" error with its own actionable message.
    return 0;
  }

  let registered = 0;
  for (const entry of config.games) {
    const e = entry as {
      id?: string;
      path?: string;
      adapterPath?: string;
      siblingAdapterPath?: string;
    };
    // Option C (F9/C1): resolve the adapter in the monorepo layout, then the
    // `src/`-layout sibling repo, then the legacy sibling layout.
    const candidates = [
      ...(e.adapterPath ? [path.resolve(projectRoot, e.adapterPath)] : []),
      ...(e.siblingAdapterPath && e.path
        ? [path.resolve(projectRoot, e.path, e.siblingAdapterPath)]
        : []),
      ...(e.adapterPath && e.path
        ? [path.resolve(projectRoot, e.path, e.adapterPath)]
        : []),
    ];
    const moduleFile = candidates.find((candidate) => fs.existsSync(candidate));
    if (!moduleFile) continue;
    const modulePath = pathToFileUrl(moduleFile);
    let mod: Record<string, unknown>;
    try {
      mod = (await import(/* @vite-ignore */ modulePath)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const AdapterClass = findAdapterClass(mod);
    if (!AdapterClass) continue;
    adapterRegistry.register(new AdapterClass() as ReplayAdapter);
    registered += 1;
  }
  return registered;
}

/** Convert an absolute filesystem path to a `file://` URL for dynamic import. */
function pathToFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : normalized;
}

/** Find a `*ReplayAdapter` class export in a dynamically imported module. */
function findAdapterClass(
  mod: Record<string, unknown>,
): (new () => unknown) | undefined {
  const candidates = Object.values(mod).filter(
    (v): v is new () => unknown =>
      typeof v === 'function' && (v as { name?: string }).name?.endsWith('ReplayAdapter') === true,
  );
  return candidates[0];
}
