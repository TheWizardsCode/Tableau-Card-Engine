/**
 * Unified lock computation for the Game Selector (F4/F6, CG-0MSMAJQQT004SDCC /
 * CG-0MUZGBTD1007G84S).
 *
 * Pure and framework-free so it is unit-testable in Node. It consumes the
 * launcher's **unified unlock state** — the legacy Steam follow status plus the
 * generalised action-reward unlocked targets — and returns which games must
 * render locked and why. The same pure predicate (`isTargetUnlocked`) answers
 * **game and DLC** targets, so the Game Selector and an in-game DLC gate read
 * one source of truth instead of each re-deriving lock state.
 *
 * Rules (intake AC4/AC5 — game-agnostic, graceful in the browser):
 *  - No catalog (plain browser / Steam feature disabled) → nothing is locked;
 *    the web app stays fully functional.
 *  - A game target unlocked by the follow reward or by a persisted
 *    action-reward record is unlocked.
 *  - The follow-designated game (`bonusGameId`) is locked until the follow is
 *    confirmed, with follow messaging (or "Steam unavailable" when Steam cannot
 *    be reached).
 *  - A catalog entry gated by an action-reward rule (`gatedBy`) shows an action
 *    message until its target is unlocked.
 *  - Other catalog entries stay locked with milestone messaging.
 *  - Games absent from the catalog are base content and are never locked.
 */
import type { GameEntry } from './GameSelectorScene';
import { isUnlockTarget, type UnlockTargetLike } from './content-unlock-client';

/** Re-exported so consumers of the lock computation share the target shape. */
export type { UnlockTargetLike } from './content-unlock-client';

/** Minimal catalog shape shared with the Electron main process. */
export interface BonusCatalogEntryLike {
  id: string;
  title: string;
  sceneKey: string;
  description: string;
  /**
   * Optional action-reward rule id (`electron/action-rewards.json`) gating this
   * entry (from `bonus-catalog.json`). Data only — validated for drift by the
   * main process; the lock computation only uses its presence to pick the lock
   * message.
   */
  gatedBy?: string;
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

/**
 * The unified unlock state the lock computation consumes.
 *
 * `follow` is the legacy Steam follow reward status; `unlockedTargets` is the
 * generalised half — the `target` of every persisted `contentUnlocks` record
 * (`contentUnlockClient.getUnlocks()`), covering action-reward and achievement
 * unlocks for both game and DLC targets. Missing/empty state means "nothing
 * unlocked", never an error.
 */
export interface UnlockStateLike {
  /** Steam follow status (legacy follow reward). Missing → not followed. */
  follow?: SteamFollowStatusLike | null;
  /** Targets unlocked by any unified rule. Missing → none unlocked. */
  unlockedTargets?: readonly UnlockTargetLike[];
}

/** Lock message shown on the designated bonus before following. */
export const STEAM_LOCK_FOLLOW = 'Follow us on Steam to unlock';
/** Lock message shown on catalog games reserved for a later milestone. */
export const STEAM_LOCK_MILESTONE = 'Reserved for a future milestone';
/** Lock message when Steam cannot be reached to verify the follow. */
export const STEAM_LOCK_UNAVAILABLE = 'Steam unavailable — cannot verify follow';
/** Lock message shown on a catalog game gated by an action-reward rule. */
export const STEAM_LOCK_ACTION = 'Complete the action to unlock';

/**
 * Whether a game or DLC target is unlocked in the unified state.
 *
 * This is the single source of truth for "is this target unlocked?": the Game
 * Selector evaluates its game targets through it, and an in-game DLC gate
 * evaluates its DLC targets through the same predicate over the same state.
 * Total — a missing, empty, or malformed state/target reports `false` and never
 * throws.
 */
export function isTargetUnlocked(
  target: UnlockTargetLike | null | undefined,
  state: UnlockStateLike | null | undefined,
): boolean {
  if (!isUnlockTarget(target)) return false;

  // Legacy Steam follow reward: the follow-unlocked game is chosen at claim
  // time. DLC is never unlocked by the follow.
  if (target.kind === 'game') {
    const follow = state?.follow;
    const chosenGameId = follow?.state === 'unlocked' ? follow.unlock.chosenGameId : null;
    if (chosenGameId !== null && chosenGameId === target.gameId) return true;
  }

  const unlocked = state?.unlockedTargets;
  if (!Array.isArray(unlocked)) return false;
  return unlocked.some((candidate) => isUnlockTarget(candidate) && sameTarget(candidate, target));
}

/**
 * DLC-target check: whether DLC within a game is unlocked in the unified state.
 *
 * A thin, discoverable wrapper over {@link isTargetUnlocked} so an in-game DLC
 * gate and the Game Selector answer the same question the same way. Total: an
 * unknown or unreadable state reports `false`, never an error.
 */
export function isDlcUnlocked(
  gameId: string,
  dlcId: string,
  state: UnlockStateLike | null | undefined,
): boolean {
  return isTargetUnlocked({ kind: 'dlc', gameId, dlcId }, state);
}

function sameTarget(a: UnlockTargetLike, b: UnlockTargetLike): boolean {
  if (a.kind === 'game' && b.kind === 'game') return a.gameId === b.gameId;
  if (a.kind === 'dlc' && b.kind === 'dlc') return a.gameId === b.gameId && a.dlcId === b.dlcId;
  return false;
}

/**
 * Compute a `sceneKey → lockMessage` map for the games to render locked.
 *
 * `unlockedTargets` is the action-reward half of the unified state (the
 * `target` of every persisted `contentUnlocks` record); the follow half is
 * `status`. Returns an empty map when there is no catalog (browser mode) or no
 * game is gated.
 */
export function computeSteamLocks(
  entries: readonly GameEntry[],
  catalog: BonusCatalogLike | null | undefined,
  status: SteamFollowStatusLike | null | undefined,
  unlockedTargets: readonly UnlockTargetLike[] | null | undefined = [],
): Map<string, string> {
  const locks = new Map<string, string>();
  if (!catalog) return locks;

  const state: UnlockStateLike = { follow: status, unlockedTargets: unlockedTargets ?? [] };

  const gatedByScene = new Map<string, BonusCatalogEntryLike>();
  for (const game of catalog.games) gatedByScene.set(game.sceneKey, game);

  for (const entry of entries) {
    const gated = gatedByScene.get(entry.sceneKey);
    if (!gated) continue; // base content — never locked

    const target: UnlockTargetLike = { kind: 'game', gameId: gated.id };
    if (isTargetUnlocked(target, state)) continue; // already unlocked

    if (gated.id === catalog.bonusGameId) {
      locks.set(
        entry.sceneKey,
        status?.state === 'steam-unavailable' ? STEAM_LOCK_UNAVAILABLE : STEAM_LOCK_FOLLOW,
      );
    } else if (gated.gatedBy) {
      locks.set(entry.sceneKey, STEAM_LOCK_ACTION);
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
