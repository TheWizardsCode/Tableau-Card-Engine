/** Type declarations for the `check-steam-friends.mjs` build script (P4). */

export declare const NATIVE_FRIENDS_MODULE: string;

export interface SteamFriendsPreflightOptions {
  /** `process.platform` override. */
  platform?: string;
  /** Module resolver override (defaults to `require.resolve`). */
  resolveModule?: (name: string) => string;
}

export interface SteamFriendsPreflightResult {
  ok: boolean;
  warning?: string;
  guidance?: string;
}

export declare function evaluateSteamFriends(
  options?: SteamFriendsPreflightOptions,
): SteamFriendsPreflightResult;
