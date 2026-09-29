/**
 * IPC surface for the Steam follow/unlock feature (F3, CG-0MSMAJQQT004SDCC).
 *
 * The renderer never imports the Steamworks SDK; it calls these channels over
 * the context bridge (`window.tce.steamFollow`, exposed by `preload.cjs`).
 *
 * The channel names and handler factories are pure (no Electron import) so
 * they are unit-testable; `main.ts` wires them to `ipcMain.handle`.
 */
import {
  SteamFollowService,
  type BonusCatalog,
  type FollowSource,
  type FollowStatus,
  type UnlockResult,
} from './steam-follow.js';
import type { SteamConfig } from './steam-config.js';

/** Channel names — must stay in sync with `preload.cjs` (plain CJS). */
export const STEAM_FOLLOW_CHANNELS = {
  getStatus: 'steamFollow:getStatus',
  isSteamAvailable: 'steamFollow:isSteamAvailable',
  supportsAutomaticFollowCheck: 'steamFollow:supportsAutomaticFollowCheck',
  getBonusCatalog: 'steamFollow:getBonusCatalog',
  openStorePage: 'steamFollow:openStorePage',
  isFollowing: 'steamFollow:isFollowing',
  claim: 'steamFollow:claim',
  claimManually: 'steamFollow:claimManually',
} as const;

/** The handler table registered on `ipcMain`. */
export interface SteamFollowHandlers {
  getStatus(): Promise<FollowStatus>;
  isSteamAvailable(): Promise<boolean>;
  supportsAutomaticFollowCheck(): Promise<boolean>;
  /** The config-driven bonus catalog (for the Game Selector lock state). */
  getBonusCatalog(): Promise<BonusCatalog | null>;
  /** Open the store page. Returns `false` so the renderer can fall back. */
  openStorePage(): Promise<boolean>;
  /** Check the configured developer account follow state. */
  isFollowing(): Promise<boolean>;
  /** Re-check the follow and unlock when confirmed. */
  claim(): Promise<UnlockResult>;
  /** Self-attest fallback when the SDK exposes no follow check. */
  claimManually(): Promise<UnlockResult>;
}

/**
 * Build the IPC handlers from the wired service.
 *
 * Every handler is total (never throws) — a failure degrades to a safe value
 * so a broken Steam install cannot crash the renderer.
 */
export function createSteamFollowHandlers(
  service: SteamFollowService,
  source: FollowSource,
  config: SteamConfig | null,
  catalog: BonusCatalog | null,
): SteamFollowHandlers {
  return {
    getStatus: () => service.getStatus(),
    isSteamAvailable: async () => source.isSteamAvailable(),
    supportsAutomaticFollowCheck: async () => service.supportsAutomaticFollowCheck(),
    getBonusCatalog: async () => catalog,
    openStorePage: () => service.openFollowPage(),
    isFollowing: async () => {
      if (!config) return false;
      return source.isFollowing(config.developerSteamId);
    },
    claim: () => service.refresh(),
    claimManually: () => service.claimManually(),
  };
}
