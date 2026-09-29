/**
 * Renderer-side client for the Steam follow/unlock bridge (F3/F5,
 * CG-0MSMAJQQT004SDCC).
 *
 * The renderer NEVER imports the Steamworks SDK. It talks to the main process
 * through `window.tce.steamFollow` (exposed by electron/preload.cjs) via this
 * tiny typed wrapper. In a plain browser (non-Electron) `fromWindow()` returns
 * `null`, and UI callers degrade gracefully (intake AC5).
 *
 * The bridge is injectable so the client can be unit-tested without Electron.
 */

/** Unlock status shape shared with the main process. */
export type SteamFollowStatus =
  | { state: 'steam-unavailable' }
  | { state: 'config-missing' }
  | { state: 'locked' }
  | { state: 'unlocked'; unlock: { unlocked: boolean; chosenGameId: string | null; unlockedAt: string | null } };

export type SteamUnlockReason =
  | 'already-unlocked'
  | 'follow-confirmed'
  | 'not-following'
  | 'steam-unavailable'
  | 'config-missing'
  | 'manual-claim';

export interface SteamUnlockResult {
  unlocked: boolean;
  chosenGameId: string | null;
  reason: SteamUnlockReason;
}

/** The context-bridge surface exposed by the preload script. */
export interface SteamFollowBridge {
  getStatus(): Promise<SteamFollowStatus>;
  isSteamAvailable(): Promise<boolean>;
  supportsAutomaticFollowCheck(): Promise<boolean>;
  openStorePage(): Promise<boolean>;
  isFollowing(): Promise<boolean>;
  claim(): Promise<SteamUnlockResult>;
  claimManually(): Promise<SteamUnlockResult>;
}

/** Thin wrapper over a bridge; adds a browser fallback for the store page. */
export interface SteamFollowClient {
  getStatus(): Promise<SteamFollowStatus>;
  isSteamAvailable(): Promise<boolean>;
  supportsAutomaticFollowCheck(): Promise<boolean>;
  /** Open the store page. Falls back to opening *fallbackUrl* in a new tab. */
  openStorePage(fallbackUrl?: string): Promise<boolean>;
  isFollowing(): Promise<boolean>;
  claim(): Promise<SteamUnlockResult>;
  claimManually(): Promise<SteamUnlockResult>;
}

export function createSteamFollowClient(bridge: SteamFollowBridge): SteamFollowClient {
  return {
    getStatus: () => bridge.getStatus(),
    isSteamAvailable: () => bridge.isSteamAvailable(),
    supportsAutomaticFollowCheck: () => bridge.supportsAutomaticFollowCheck(),
    async openStorePage(fallbackUrl?: string): Promise<boolean> {
      const openedInSteam = await bridge.openStorePage();
      if (openedInSteam) return true;
      if (fallbackUrl && typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(fallbackUrl, '_blank', 'noopener');
        return true;
      }
      return false;
    },
    isFollowing: () => bridge.isFollowing(),
    claim: () => bridge.claim(),
    claimManually: () => bridge.claimManually(),
  };
}

/** The subset of `window.tce` the client needs. */
interface TceWindow {
  tce?: { steamFollow?: SteamFollowBridge };
}

/**
 * Return a client bound to the preload bridge, or `null` when running in a
 * plain browser (no Electron launcher).
 */
export function steamFollowClientFromWindow(): SteamFollowClient | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as TceWindow).tce?.steamFollow;
  if (!bridge) return null;
  return createSteamFollowClient(bridge);
}
