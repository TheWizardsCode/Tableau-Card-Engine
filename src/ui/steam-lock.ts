/**
 * Steam bonus lock computation for the Game Selector (F4,
 * CG-0MSMAJQQT004SDCC).
 *
 * Pure and framework-free so it is unit-testable in Node. Given the launcher's
 * game list, the config-driven bonus catalog, and the current Steam follow
 * status, it returns which games must render locked and why.
 *
 * Rules (intake AC4/AC5 — game-agnostic, graceful in the browser):
 *  - No catalog (plain browser / Steam feature disabled) → nothing is locked;
 *    the web app stays fully functional.
 *  - The designated `bonusGameId` is locked until the follow is confirmed, then
 *    unlocked.
 *  - Other catalog entries stay locked with milestone messaging
 *    (reserved for future milestones).
 *  - Games absent from the catalog are base content and are never locked.
 */
import type { GameEntry } from './GameSelectorScene';

/** Minimal catalog shape shared with the Electron main process. */
export interface BonusCatalogEntryLike {
  id: string;
  title: string;
  sceneKey: string;
  description: string;
}

export interface BonusCatalogLike {
  bonusGameId: string;
  games: BonusCatalogEntryLike[];
}

/** Minimal follow-status shape shared with the Electron main process. */
export type SteamFollowStatusLike =
  | { state: 'steam-unavailable' }
  | { state: 'config-missing' }
  | { state: 'locked' }
  | { state: 'unlocked'; unlock: { unlocked: boolean; chosenGameId: string | null } };

/** Lock message shown on the designated bonus before following. */
export const STEAM_LOCK_FOLLOW = 'Follow us on Steam to unlock';
/** Lock message shown on catalog games reserved for a later milestone. */
export const STEAM_LOCK_MILESTONE = 'Reserved for a future milestone';
/** Lock message when Steam cannot be reached to verify the follow. */
export const STEAM_LOCK_UNAVAILABLE = 'Steam unavailable — cannot verify follow';

/**
 * Compute a `sceneKey → lockMessage` map for the games to render locked.
 *
 * Returns an empty map when there is no catalog (browser mode) or no game is
 * gated.
 */
export function computeSteamLocks(
  entries: readonly GameEntry[],
  catalog: BonusCatalogLike | null | undefined,
  status: SteamFollowStatusLike | null | undefined,
): Map<string, string> {
  const locks = new Map<string, string>();
  if (!catalog) return locks;

  const unlockedGameId =
    status?.state === 'unlocked' ? (status.unlock.chosenGameId ?? null) : null;

  const gatedByScene = new Map<string, BonusCatalogEntryLike>();
  for (const game of catalog.games) gatedByScene.set(game.sceneKey, game);

  for (const entry of entries) {
    const gated = gatedByScene.get(entry.sceneKey);
    if (!gated) continue; // base content — never locked
    if (gated.id === unlockedGameId) continue; // already unlocked

    if (gated.id === catalog.bonusGameId) {
      locks.set(entry.sceneKey, status?.state === 'steam-unavailable' ? STEAM_LOCK_UNAVAILABLE : STEAM_LOCK_FOLLOW);
    } else {
      locks.set(entry.sceneKey, STEAM_LOCK_MILESTONE);
    }
  }

  return locks;
}

/**
 * Apply a lock map to the game list, returning new entries (the input is not
 * mutated). Games absent from the map are returned unlocked.
 */
export function applySteamLocks(
  entries: readonly GameEntry[],
  locks: ReadonlyMap<string, string>,
): GameEntry[] {
  return entries.map((entry) => {
    const message = locks.get(entry.sceneKey);
    return message ? { ...entry, locked: true, lockMessage: message } : { ...entry, locked: false };
  });
}
