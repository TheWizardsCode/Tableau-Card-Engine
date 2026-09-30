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
    isFollowing?: (steamId: bigint) => boolean | Promise<boolean>;
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

/**
 * Minimal shape of the optional custom native friends addon (Option A, P1
 * `CG-0MUNBHWY90051NAU`).
 *
 * The underlying SDK call (`ISteamFriends::IsFollowing`) is asynchronous, so
 * `isFollowing` may return either a boolean or a promise for one; the adapter
 * accepts both. The addon must resolve `false` (never reject) when Steam is
 * not running or no user is logged in — detection must not assume a logged-in
 * client.
 */
export interface NativeFriendsModuleLike {
  /**
   * Optional one-time initialisation. Returning `false` (or throwing) means
   * the addon cannot provide follow detection on this build.
   */
  init?: () => boolean | void;
  /** Whether the current user follows *steamId*. */
  isFollowing: (steamId: bigint) => boolean | Promise<boolean>;
}

/** Loads the optional native friends addon; resolves `null` when absent. */
export type NativeFriendsLoader = () => Promise<NativeFriendsModuleLike | null>;

export interface SteamworksFollowSourceOptions {
  /** Steam App ID (as a number). Omit/0 → unavailable. */
  appId?: number;
  /** Override the module loader (tests inject a fake). */
  loader?: SteamworksModuleLoader;
  /**
   * Fallback loader for the custom native friends addon (Option A). Consulted
   * only when the `steamworks.js` binding exposes no `friends.isFollowing`.
   * Tests inject a fake; the real loader is wired in P3/P4.
   */
  nativeFriendsLoader?: NativeFriendsLoader;
  /** Enable the Electron Steam overlay hook (main process only). */
  enableOverlay?: boolean;
  /**
   * Upper bound (ms) for a follow check before it is treated as `false`.
   * Guards against a hung native call; defaults to 1500 ms.
   */
  followCheckTimeoutMs?: number;
}

/**
 * Resolve *promise* or, after *ms*, the *fallback* — whichever comes first.
 * Bounds a hung native check so the IPC handler can never block forever.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
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
  /** Loaded fallback addon (Option A), when the binding lacks the API. */
  private nativeFriends: NativeFriendsModuleLike | null = null;
  /** Set when `restartAppIfNecessary` asked Steam to relaunch the app. */
  restartRequested = false;
  /** Capability flag exposed on the `FollowSource` contract. */
  followCheckSupported = false;

  private readonly appId?: number;
  private readonly loader: SteamworksModuleLoader;
  private readonly nativeFriendsLoader?: NativeFriendsLoader;
  private readonly enableOverlay: boolean;
  private readonly followCheckTimeoutMs: number;

  constructor(options: SteamworksFollowSourceOptions = {}) {
    this.appId = options.appId;
    this.loader = options.loader ?? defaultSteamworksLoader;
    this.nativeFriendsLoader = options.nativeFriendsLoader;
    this.enableOverlay = options.enableOverlay ?? false;
    this.followCheckTimeoutMs = options.followCheckTimeoutMs ?? 1500;
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

      if (typeof this.client?.friends?.isFollowing === 'function') {
        this.followCheckSupported = true;
      } else {
        // Binding lacks the API (steamworks.js 0.4.0) — try the custom addon.
        this.followCheckSupported = await this.loadNativeFriends();
      }
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

  /**
   * Load and validate the optional native friends addon. Returns `true` when
   * it provides a usable follow check. Never throws.
   */
  private async loadNativeFriends(): Promise<boolean> {
    if (!this.nativeFriendsLoader) return false;
    try {
      const native = await this.nativeFriendsLoader();
      if (!native || typeof native.isFollowing !== 'function') return false;
      if (typeof native.init === 'function' && native.init() === false) return false;
      this.nativeFriends = native;
      return true;
    } catch {
      this.nativeFriends = null;
      return false;
    }
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

    // Capability order: steamworks.js binding → native addon → manual claim.
    const bindingCheck = this.client.friends?.isFollowing;
    if (typeof bindingCheck === 'function') {
      this.followCheckSupported = true;
      return this.awaitCheck(() => bindingCheck.call(this.client!.friends, BigInt(developerSteamId)));
    }

    const native = this.nativeFriends;
    if (native) {
      this.followCheckSupported = true;
      return this.awaitCheck(() => native.isFollowing(BigInt(developerSteamId)));
    }

    // No SDK detection available. The UI offers a manual claim instead; never
    // fabricate a `true`.
    this.followCheckSupported = false;
    return false;
  }

  /**
   * Await a follow check, bound it by a timeout, and coerce to a strict
   * boolean. A throw, rejection, timeout, or non-`true` result is `false` —
   * the adapter never fabricates a follow.
   */
  private async awaitCheck(check: () => boolean | Promise<boolean>): Promise<boolean> {
    try {
      const result = await withTimeout(Promise.resolve().then(check), this.followCheckTimeoutMs, false);
      return result === true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.client = null;
    this.nativeFriends = null;
    this.availability = 'uninitialised';
  }
}
