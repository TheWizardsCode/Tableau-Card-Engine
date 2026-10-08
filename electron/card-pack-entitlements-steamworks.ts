/**
 * Steamworks-backed `PackEntitlementSource` — the real Steam adapter
 * (feature F5, CG-0MUZIS2B8005WG4S).
 *
 * Uses the optional native module `steamworks.js` **dynamically**, so the
 * launcher still builds and runs on machines without it (a set `app_id` but
 * no Steam client yields `'unavailable'`; no crash).
 *
 * ## API shape
 *
 * `steamworks.js` `init(appId)` returns the client API object, whose `apps`
 * namespace exposes DLC ownership detection:
 *
 * ```ts
 * const client = steamworks.init(appId);
 * client.apps.isDlcInstalled(dlcAppId); // boolean
 * ```
 *
 * `checkEntitlementSupport()` performs capability detection: if the loaded
 * binding lacks `apps.isDlcInstalled`, the source reports
 * `dlcCheckSupported = false` and `isEntitled()` degrades to `false` (locked)
 * — never a fabricated unlock, never a throw.
 *
 * Pure Node (no Electron import) so the adapter is unit-testable with a fake
 * module object.
 */
import type {
  EntitlementPackRef,
  PackEntitlementSource,
  SteamAvailability,
} from './card-pack-entitlements.js';
import { normaliseSteamAppId } from './card-pack-entitlements.js';

/** Minimal shape of the `apps` namespace used here. */
export interface SteamworksAppsNamespaceLike {
  isDlcInstalled?: (appId: number) => boolean;
}

/** Minimal shape of a `steamworks.js` client returned by `init()`. */
export interface SteamworksEntitlementClientLike {
  apps?: SteamworksAppsNamespaceLike;
}

/** Minimal shape of the `steamworks.js` module used here. */
export interface SteamworksEntitlementModuleLike {
  init: (appId?: number) => SteamworksEntitlementClientLike;
  restartAppIfNecessary?: (appId: number) => boolean;
  electronEnableSteamOverlay?: (disableEachFrameInvalidation?: boolean) => void;
}

/** Loads the optional native module; resolves `null` when it is absent. */
export type SteamworksEntitlementModuleLoader = () => Promise<SteamworksEntitlementModuleLike | null>;

export interface SteamworksEntitlementSourceOptions {
  /** Steam App ID of the launcher (as a number). Omit/0 → unavailable. */
  appId?: number;
  /** Override the module loader (tests inject a fake). */
  loader?: SteamworksEntitlementModuleLoader;
  /** Enable the Electron Steam overlay hook (main process only). */
  enableOverlay?: boolean;
}

/**
 * Default loader: dynamically imports the optional `steamworks.js` native
 * module. Any failure (module not installed, native ABI mismatch, no Steam) is
 * reported as `null` so the caller degrades gracefully.
 *
 * The specifier is held in a variable so TypeScript/Vite do not resolve the
 * module eagerly at build time; it is loaded dynamically at runtime.
 */
export const defaultSteamworksEntitlementLoader: SteamworksEntitlementModuleLoader = async () => {
  const specifier = 'steamworks.js';
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown as SteamworksEntitlementModuleLike;
    return typeof mod?.init === 'function' ? mod : null;
  } catch {
    return null;
  }
};

/**
 * Whether a client object exposes the DLC-ownership API needed by this source.
 * Exported for tests and for a diagnostics report.
 */
export function checkEntitlementSupport(
  client: SteamworksEntitlementClientLike | null,
): boolean {
  return typeof client?.apps?.isDlcInstalled === 'function';
}

export class SteamPackEntitlementSource implements PackEntitlementSource {
  private availability: SteamAvailability = 'uninitialised';
  private client: SteamworksEntitlementClientLike | null = null;
  /** Set when `restartAppIfNecessary` asked Steam to relaunch the app. */
  restartRequested = false;
  /** Whether the loaded binding exposes `apps.isDlcInstalled`. */
  dlcCheckSupported = false;

  private readonly appId?: number;
  private readonly loader: SteamworksEntitlementModuleLoader;
  private readonly enableOverlay: boolean;

  constructor(options: SteamworksEntitlementSourceOptions = {}) {
    this.appId = options.appId;
    this.loader = options.loader ?? defaultSteamworksEntitlementLoader;
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

      this.dlcCheckSupported = checkEntitlementSupport(this.client);
      this.availability = 'available';
      return this.availability;
    } catch {
      this.client = null;
      this.dlcCheckSupported = false;
      this.availability = 'unavailable';
      return this.availability;
    }
  }

  isSteamAvailable(): boolean {
    return this.availability === 'available' && this.client !== null;
  }

  async isEntitled(pack: EntitlementPackRef): Promise<boolean> {
    if (!this.isSteamAvailable() || !this.client) return false;

    const appId = normaliseSteamAppId(pack.steamAppId);
    if (appId === null) return false;

    const isDlcInstalled = this.client.apps?.isDlcInstalled;
    if (typeof isDlcInstalled !== 'function') {
      // Capability gap: the binding exposes no DLC-ownership API. Never
      // fabricate an unlock; the pack stays locked.
      this.dlcCheckSupported = false;
      return false;
    }

    try {
      return isDlcInstalled.call(this.client.apps, appId) === true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.client = null;
    this.dlcCheckSupported = false;
    this.availability = 'uninitialised';
  }
}
