/**
 * IPC surface for the Steam achievement feature (F6, CG-0MUNC7EXO001LITF).
 *
 * The renderer never imports the Steamworks SDK; it calls these channels over
 * the context bridge (`window.tce.achievements`, exposed by `preload.cjs`).
 *
 * The channel names and handler factories are pure (no Electron import) so
 * they are unit-testable; `main.ts` wires them to `ipcMain.handle`.
 */
import type {
  AchievementResyncResult,
  AchievementUnlockResult,
  SteamAchievementService,
} from './steam-achievements.js';

/** Channel names — must stay in sync with `preload.cjs` (plain CJS). */
export const STEAM_ACHIEVEMENT_CHANNELS = {
  unlock: 'steamAchievements:unlock',
  getUnlocked: 'steamAchievements:getUnlocked',
  isAvailable: 'steamAchievements:isAvailable',
  hasManifest: 'steamAchievements:hasManifest',
  resync: 'steamAchievements:resync',
} as const;

/**
 * The handler table registered on `ipcMain`.
 *
 * Every handler is total (never throws) — a failure degrades to a safe value
 * so a broken Steam install cannot crash the renderer.
 */
export interface SteamAchievementHandlers {
  /** Unlock an achievement by engine id and return the result. */
  unlock(achievementId: string): Promise<AchievementUnlockResult>;
  /** All locally-tracked unlocked achievement ids. */
  getUnlocked(): Promise<string[]>;
  /** Whether Steam is currently usable. */
  isAvailable(): Promise<boolean>;
  /** Whether an achievement manifest is loaded. */
  hasManifest(): Promise<boolean>;
  /** Re-send all persisted unlocks to Steam. */
  resync(): Promise<AchievementResyncResult>;
}

/** Build the IPC handlers from the wired service. */
export function createSteamAchievementHandlers(
  service: SteamAchievementService,
): SteamAchievementHandlers {
  return {
    unlock: (achievementId: unknown) => service.unlock(String(achievementId ?? '')),
    getUnlocked: () => service.getUnlocked(),
    isAvailable: async () => service.isSteamAvailable(),
    hasManifest: async () => service.hasManifest(),
    resync: () => service.resync(),
  };
}
