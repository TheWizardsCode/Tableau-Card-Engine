/**
 * Steamworks-backed `AchievementSource` — the real Steam adapter (F5,
 * CG-0MUNC7EAM004E6GN).
 *
 * Uses the optional native module `steamworks.js` **dynamically**, so the
 * launcher still builds and runs on machines without it (a set `app_id` but
 * no Steam client yields `'unavailable'`; no crash — intake AC3/AC5).
 *
 * ## API shape (confirmed by the F1 spike, CG-0MUNC7BR0003PFKU)
 *
 * `steamworks.js` `init(appId)` returns the client API object, which carries
 * the `achievement` and `stats` namespaces:
 *
 * ```ts
 * const client = steamworks.init(appId);
 * client.achievement.activate(apiName);      // boolean
 * client.achievement.isActivated(apiName);   // boolean
 * client.achievement.names();                // string[]
 * client.stats.store();                      // boolean
 * ```
 *
 * `checkAchievementSupport()` performs capability detection: if the loaded
 * binding lacks the achievement or stats namespace, the source reports
 * `achievementApiSupported = false` and every method degrades to a safe value
 * (never a fabricated unlock, never a throw).
 *
 * Pure Node (no Electron import) so the adapter is unit-testable with a fake
 * module object.
 */
import type { AchievementSource, SteamAvailability } from './steam-achievements.js';

/** Minimal shape of the `achievement` namespace used here. */
export interface SteamworksAchievementNamespaceLike {
  activate?: (achievement: string) => boolean;
  isActivated?: (achievement: string) => boolean;
  clear?: (achievement: string) => boolean;
  names?: () => string[];
}

/** Minimal shape of the `stats` namespace used here. */
export interface SteamworksStatsNamespaceLike {
  store?: () => boolean;
}

/** Minimal shape of a `steamworks.js` client returned by `init()`. */
export interface SteamworksAchievementClientLike {
  achievement?: SteamworksAchievementNamespaceLike;
  stats?: SteamworksStatsNamespaceLike;
}

/** Minimal shape of the `steamworks.js` module used here. */
export interface SteamworksAchievementModuleLike {
  init: (appId?: number) => SteamworksAchievementClientLike;
  restartAppIfNecessary?: (appId: number) => boolean;
  electronEnableSteamOverlay?: (disableEachFrameInvalidation?: boolean) => void;
}

/** Loads the optional native module; resolves `null` when it is absent. */
export type SteamworksAchievementModuleLoader = () => Promise<SteamworksAchievementModuleLike | null>;

export interface SteamworksAchievementSourceOptions {
  /** Steam App ID (as a number). Omit/0 → unavailable. */
  appId?: number;
  /** Override the module loader (tests inject a fake). */
  loader?: SteamworksAchievementModuleLoader;
  /** Enable the Electron Steam overlay hook (main process only). */
  enableOverlay?: boolean;
}

/**
 * Default loader: dynamically imports the optional `steamworks.js` native
 * module. Any failure (module not installed, native ABI mismatch, no Steam) is
 * reported as `null` so the caller degrades gracefully.
 *
 * The specifier is held in a variable so TypeScript/Vite do not try to resolve
 * the optional module at build time (it is intentionally not a dependency).
 */
export const defaultSteamworksAchievementLoader: SteamworksAchievementModuleLoader = async () => {
  const specifier = 'steamworks.js';
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown as SteamworksAchievementModuleLike;
    return typeof mod?.init === 'function' ? mod : null;
  } catch {
    return null;
  }
};

/**
 * Whether a client object exposes the achievement + stats API needed by this
 * source. Exported for tests and for a diagnostics report.
 */
export function checkAchievementSupport(client: SteamworksAchievementClientLike | null): boolean {
  if (!client) return false;
  const activate = client.achievement?.activate;
  const store = client.stats?.store;
  return typeof activate === 'function' && typeof store === 'function';
}

export class SteamworksAchievementSource implements AchievementSource {
  private availability: SteamAvailability = 'uninitialised';
  private client: SteamworksAchievementClientLike | null = null;
  /** Set when `restartAppIfNecessary` asked Steam to relaunch the app. */
  restartRequested = false;
  /** Whether the loaded binding exposes the achievement + stats API. */
  achievementApiSupported = false;

  private readonly appId?: number;
  private readonly loader: SteamworksAchievementModuleLoader;
  private readonly enableOverlay: boolean;

  constructor(options: SteamworksAchievementSourceOptions = {}) {
    this.appId = options.appId;
    this.loader = options.loader ?? defaultSteamworksAchievementLoader;
    this.enableOverlay = options.enableOverlay ?? false;
  }

  async init(): Promise<SteamAvailability> {
    if (!this.appId) {
      this.availability = 'unavailable';
      return this.availability;
    }

    try {
      const mod = await this.loader();
      if (!mod) {
        this.availability = 'unavailable';
        return this.availability;
      }

      if (typeof mod.restartAppIfNecessary === 'function' && mod.restartAppIfNecessary(this.appId)) {
        // Steam is relaunching the app; this process must exit. Caller checks
        // `restartRequested` and quits without treating it as an error.
        this.restartRequested = true;
        this.availability = 'unavailable';
        return this.availability;
      }

      this.client = mod.init(this.appId);
      if (this.enableOverlay) mod.electronEnableSteamOverlay?.(true);

      this.achievementApiSupported = checkAchievementSupport(this.client);
      this.availability = 'available';
      return this.availability;
    } catch {
      this.client = null;
      this.achievementApiSupported = false;
      this.availability = 'unavailable';
      return this.availability;
    }
  }

  isSteamAvailable(): boolean {
    return this.availability === 'available' && this.client !== null;
  }

  async setAchievement(steamApiName: string): Promise<boolean> {
    if (!this.isSteamAvailable() || !this.client) return false;
    const activate = this.client.achievement?.activate;
    if (typeof activate !== 'function') {
      // Capability gap: the binding exposes no achievement API. Never
      // fabricate an unlock; the caller persists locally and retries later.
      this.achievementApiSupported = false;
      return false;
    }
    try {
      return activate.call(this.client.achievement, steamApiName) === true;
    } catch {
      return false;
    }
  }

  async storeStats(): Promise<boolean> {
    if (!this.isSteamAvailable() || !this.client) return false;
    const store = this.client.stats?.store;
    if (typeof store !== 'function') {
      this.achievementApiSupported = false;
      return false;
    }
    try {
      return store.call(this.client.stats) === true;
    } catch {
      return false;
    }
  }

  async isUnlocked(steamApiName: string): Promise<boolean> {
    if (!this.isSteamAvailable() || !this.client) return false;
    const isActivated = this.client.achievement?.isActivated;
    if (typeof isActivated !== 'function') return false;
    try {
      return isActivated.call(this.client.achievement, steamApiName) === true;
    } catch {
      return false;
    }
  }

  async getUnlockedNames(): Promise<string[]> {
    if (!this.isSteamAvailable() || !this.client) return [];
    const names = this.client.achievement?.names;
    const isActivated = this.client.achievement?.isActivated;
    if (typeof names !== 'function' || typeof isActivated !== 'function') return [];
    try {
      const all = names.call(this.client.achievement);
      if (!Array.isArray(all)) return [];
      return all.filter((name) => {
        try {
          return isActivated.call(this.client!.achievement, name) === true;
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  close(): void {
    this.client = null;
    this.availability = 'uninitialised';
    this.achievementApiSupported = false;
  }
}
