/**
 * Steamworks-backed `FollowSource` — the real Steam adapter (F3,
 * CG-0MSMAJQQT004SDCC).
 *
 * Uses the optional native module `steamworks.js` **dynamically**, so the
 * launcher still builds and runs on machines without it (a set `app_id` but
 * no Steam client yields `'unavailable'`; no crash — intake AC5).
 *
 * IMPORTANT FINDING (F1 follow-up): `steamworks.js` 0.4.0 does not expose
 * `ISteamFriends::IsFollowing`. This adapter therefore:
 *  - opens the store page via `overlay.activateToStore` / `activateToWebPage`
 *    (both are real SDK calls), and
 *  - implements `isFollowing()` with **capability detection**: if a follow API
 *    is present on the loaded module it is used, otherwise the source reports
 *    `followCheckSupported = false` and the UI falls back to a manual claim.
 *
 * Swapping in a custom native addon (or a future `steamworks.js` release) that
 * exposes `friends.isFollowing` requires no change here — only the returned
 * module shape.
 *
 * Pure Node (no Electron import) so the adapter is unit-testable with a fake
 * module object.
 */
import type { FollowSource, SteamAvailability } from './steam-follow.js';

/** Minimal shape of a `steamworks.js` client used here. */
export interface SteamworksClientLike {
  overlay?: {
    activateToStore?: (appId: number, flag?: number) => void;
    activateToWebPage?: (url: string) => void;
  };
  friends?: {
    isFollowing?: (steamId: bigint) => boolean;
  };
}

/** Minimal shape of the `steamworks.js` module used here. */
export interface SteamworksModuleLike {
  init: (appId?: number) => SteamworksClientLike;
  restartAppIfNecessary?: (appId: number) => boolean;
  electronEnableSteamOverlay?: (disableEachFrameInvalidation?: boolean) => void;
}

/** Loads the optional native module; resolves `null` when it is absent. */
export type SteamworksModuleLoader = () => Promise<SteamworksModuleLike | null>;

export interface SteamworksFollowSourceOptions {
  /** Steam App ID (as a number). Omit/0 → unavailable. */
  appId?: number;
  /** Override the module loader (tests inject a fake). */
  loader?: SteamworksModuleLoader;
  /** Enable the Electron Steam overlay hook (main process only). */
  enableOverlay?: boolean;
}

/** `overlay.StoreFlag` — open the store page without adding to cart. */
export const STORE_FLAG_NONE = 0;

/**
 * Default loader: dynamically imports the optional `steamworks.js` native
 * module. Any failure (module not installed, native ABI mismatch, no Steam) is
 * reported as `null` so the caller degrades gracefully.
 *
 * The specifier is held in a variable so TypeScript/Vite do not try to resolve
 * the optional module at build time (it is intentionally not a dependency).
 */
export const defaultSteamworksLoader: SteamworksModuleLoader = async () => {
  const specifier = 'steamworks.js';
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown as SteamworksModuleLike;
    return typeof mod?.init === 'function' ? mod : null;
  } catch {
    return null;
  }
};

export class SteamworksFollowSource implements FollowSource {
  private availability: SteamAvailability = 'uninitialised';
  private client: SteamworksClientLike | null = null;
  /** Set when `restartAppIfNecessary` asked Steam to relaunch the app. */
  restartRequested = false;
  /** Capability flag exposed on the `FollowSource` contract. */
  followCheckSupported = false;

  private readonly appId?: number;
  private readonly loader: SteamworksModuleLoader;
  private readonly enableOverlay: boolean;

  constructor(options: SteamworksFollowSourceOptions = {}) {
    this.appId = options.appId;
    this.loader = options.loader ?? defaultSteamworksLoader;
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

      this.followCheckSupported = typeof this.client?.friends?.isFollowing === 'function';
      this.availability = 'available';
      return this.availability;
    } catch {
      this.client = null;
      this.availability = 'unavailable';
      return this.availability;
    }
  }

  isSteamAvailable(): boolean {
    return this.availability === 'available';
  }

  async openStorePage(url: string): Promise<boolean> {
    if (!this.isSteamAvailable() || !this.client) return false;
    const overlay = this.client.overlay;

    if (this.appId && typeof overlay?.activateToStore === 'function') {
      overlay.activateToStore(this.appId, STORE_FLAG_NONE);
      return true;
    }
    if (typeof overlay?.activateToWebPage === 'function') {
      overlay.activateToWebPage(url);
      return true;
    }
    return false;
  }

  async isFollowing(developerSteamId: string): Promise<boolean> {
    if (!this.isSteamAvailable() || !this.client) return false;
    const check = this.client.friends?.isFollowing;
    if (typeof check !== 'function') {
      // No SDK detection available (steamworks.js 0.4.0). The UI offers a
      // manual claim instead; never fabricate a `true`.
      this.followCheckSupported = false;
      return false;
    }
    this.followCheckSupported = true;
    try {
      return check.call(this.client.friends, BigInt(developerSteamId));
    } catch {
      return false;
    }
  }

  close(): void {
    this.client = null;
    this.availability = 'uninitialised';
  }
}
