/**
 * Renderer-side client for the generalised content-unlock bridge
 * (CG-0MUZGBSSQ009ISHG, feature F5 of CG-0MUZF156A007OUIT).
 *
 * The renderer never imports the Steamworks SDK or a Node API; it reads the
 * unified, target-keyed unlock state through the additive
 * `window.tce.contentUnlocks` context bridge (exposed by
 * `electron/preload.cjs`). This tiny typed wrapper is the read source the Game
 * Selector's lock computation (F6) and an in-game DLC gate (F7) consume.
 *
 * **Totality contract.** Unlike the Steam-follow client, this client is total
 * and never returns `null`: in a plain browser (no Electron bridge)
 * `isUnlocked()` is `false` and `getUnlocks()` is `[]`, and every call catches
 * a throwing or malformed bridge and degrades safely — content that cannot be
 * read is treated as *not unlocked*, never as a crash.
 *
 * **Structural types.** The target/record shapes mirror `electron/unlock-rules`
 * / `electron/action-rewards` at the UI boundary (the same `*Like` convention
 * as `steam-lock.ts`), so `src/ui` never imports from `electron/`.
 *
 * The bridge is injectable so the client can be unit-tested without Electron.
 */

/** Unlock a whole bundled game (mirrors `GameTarget`). */
export interface GameUnlockTarget {
  kind: 'game';
  gameId: string;
}

/** Unlock DLC within a game (mirrors `DlcTarget`). */
export interface DlcUnlockTarget {
  kind: 'dlc';
  gameId: string;
  dlcId: string;
}

/** A content target the unified unlock state can key on. */
export type UnlockTargetLike = GameUnlockTarget | DlcUnlockTarget;

/** One persisted unlock record (mirrors `ContentUnlockRecord`). */
export interface ContentUnlockRecordLike {
  /** Stable target key (`game:<id>` / `dlc:<gameId>:<dlcId>`). */
  key: string;
  target: UnlockTargetLike;
  /** ISO timestamp of the unlock. */
  unlockedAt: string;
}

/** The subset of the `window.tce.contentUnlocks` bridge the client needs. */
export interface ContentUnlockBridge {
  isUnlocked(target: UnlockTargetLike): Promise<boolean>;
  getUnlocks(): Promise<ContentUnlockRecordLike[]>;
}

/** Total read API over the unified content-unlock state. */
export interface ContentUnlockClient {
  /** Whether a target is unlocked. Missing/erroring bridge → `false`. */
  isUnlocked(target: UnlockTargetLike): Promise<boolean>;
  /** Every persisted unlock record. Missing/erroring bridge → `[]`. */
  getUnlocks(): Promise<ContentUnlockRecordLike[]>;
}

/**
 * Wrap a bridge (or `null`) in a total read client.
 *
 * With no bridge the client is a safe no-op that reports "not unlocked", so a
 * plain-browser build needs no branching at the call site.
 */
export function createContentUnlockClient(
  bridge: ContentUnlockBridge | null | undefined,
): ContentUnlockClient {
  return {
    async isUnlocked(target: UnlockTargetLike): Promise<boolean> {
      if (!bridge || !isUnlockTarget(target)) return false;
      try {
        return (await bridge.isUnlocked(target)) === true;
      } catch {
        return false;
      }
    },
    async getUnlocks(): Promise<ContentUnlockRecordLike[]> {
      if (!bridge) return [];
      try {
        const records = await bridge.getUnlocks();
        return Array.isArray(records) ? records : [];
      } catch {
        return [];
      }
    },
  };
}

/** The subset of `window.tce` the client needs. */
interface TceWindow {
  tce?: { contentUnlocks?: ContentUnlockBridge };
}

/**
 * Return a total client bound to the preload bridge.
 *
 * Always returns a client — in a plain browser (no `window` / no
 * `window.tce.contentUnlocks`) it reports "not unlocked" rather than `null`,
 * so callers never branch on the runtime.
 */
export function contentUnlockClientFromWindow(): ContentUnlockClient {
  if (typeof window === 'undefined') return createContentUnlockClient(null);
  const bridge = (window as unknown as TceWindow).tce?.contentUnlocks;
  return createContentUnlockClient(bridge);
}

/** Structural guard mirroring `isUnlockTarget` in `electron/action-rewards-ipc`. */
function isUnlockTarget(value: unknown): value is UnlockTargetLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'game') {
    return typeof candidate.gameId === 'string' && candidate.gameId.length > 0;
  }
  if (candidate.kind === 'dlc') {
    return (
      typeof candidate.gameId === 'string' &&
      candidate.gameId.length > 0 &&
      typeof candidate.dlcId === 'string' &&
      candidate.dlcId.length > 0
    );
  }
  return false;
}
