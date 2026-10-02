/**
 * Renderer-side client for the Steam achievement bridge (F6,
 * CG-0MUNC7EXO001LITF).
 *
 * The renderer NEVER imports the Steamworks SDK. It talks to the main process
 * through `window.tce.achievements` (exposed by electron/preload.cjs) via this
 * tiny typed wrapper. In a plain browser (non-Electron)
 * `steamAchievementsClientFromWindow()` returns `null`, and callers fall back
 * to the engine's `NoOpAchievementSink` — the web build is fully playable
 * (intake AC3).
 *
 * The bridge is injectable so the client can be unit-tested without Electron.
 */
import type { AchievementSink } from '@core-engine/AchievementSystem';

/**
 * Result of an unlock attempt, mirroring the main-process
 * `AchievementUnlockResult` (kept structurally compatible here so the
 * renderer does not import from `electron/`).
 */
export type AchievementUnlockReason =
  | 'unlocked'
  | 'already-unlocked'
  | 'unknown-achievement'
  | 'manifest-missing'
  | 'steam-unavailable'
  | 'store-failed';

export interface AchievementUnlockResult {
  achievementId: string;
  unlocked: boolean;
  synced: boolean;
  reason: AchievementUnlockReason;
}

/** Summary of a re-sync pass (mirrors the main-process shape). */
export interface AchievementResyncResult {
  synced: number;
  failed: number;
  unknown: string[];
  steamAvailable: boolean;
}

/** The context-bridge surface exposed by the preload script. */
export interface SteamAchievementsBridge {
  unlock(achievementId: string): Promise<AchievementUnlockResult>;
  getUnlocked(): Promise<string[]>;
  isAvailable(): Promise<boolean>;
  hasManifest(): Promise<boolean>;
  resync(): Promise<AchievementResyncResult>;
}

/** Thin wrapper over the bridge. */
export interface SteamAchievementsClient {
  unlock(achievementId: string): Promise<AchievementUnlockResult>;
  getUnlocked(): Promise<string[]>;
  isAvailable(): Promise<boolean>;
  hasManifest(): Promise<boolean>;
  resync(): Promise<AchievementResyncResult>;
}

export function createSteamAchievementsClient(
  bridge: SteamAchievementsBridge,
): SteamAchievementsClient {
  return {
    unlock: (achievementId) => bridge.unlock(achievementId),
    getUnlocked: () => bridge.getUnlocked(),
    isAvailable: () => bridge.isAvailable(),
    hasManifest: () => bridge.hasManifest(),
    resync: () => bridge.resync(),
  };
}

/** The subset of `window.tce` the client needs. */
interface TceWindow {
  tce?: { achievements?: SteamAchievementsBridge };
}

/**
 * Return a client bound to the preload bridge, or `null` when running in a
 * plain browser (no Electron launcher).
 */
export function steamAchievementsClientFromWindow(): SteamAchievementsClient | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as TceWindow).tce?.achievements;
  if (!bridge) return null;
  return createSteamAchievementsClient(bridge);
}

/**
 * Engine `AchievementSink` that forwards unlocks to the main process.
 *
 * The engine's sink contract is synchronous (`unlock(): void`), while the
 * bridge is async. This adapter records the unlock locally (optimistically)
 * so the engine's idempotence check works immediately, and forwards the
 * request asynchronously. A transport failure is swallowed — the main
 * process persists before syncing, and the launch-time `resync()` replays
 * anything that did not reach Steam, so a dropped IPC call is not data loss.
 *
 * Use this in the Electron launcher; in the browser, leave the
 * `AchievementSystem` on its default `NoOpAchievementSink`.
 */
export function createSteamAchievementSink(
  client: SteamAchievementsClient,
  initialUnlocked: string[] = [],
): AchievementSink {
  const unlocked = new Set<string>(initialUnlocked);

  return {
    unlock(achievementId: string): void {
      if (unlocked.has(achievementId)) return;
      unlocked.add(achievementId);
      void client.unlock(achievementId).catch(() => {
        // Transport failure: the main process owns persistence. On the next
        // launch, `resync()` replays whatever was persisted; nothing is lost.
      });
    },
    getUnlocked(): string[] {
      return [...unlocked];
    },
    isUnlocked(achievementId: string): boolean {
      return unlocked.has(achievementId);
    },
  };
}
