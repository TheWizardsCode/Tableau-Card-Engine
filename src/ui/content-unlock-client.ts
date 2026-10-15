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

/**
 * Scoped refresh inputs (`contentUnlocks:refresh`).
 *
 * `ruleIds` scopes verification to the named reward rule(s) so unrelated
 * rewards are never evaluated; `simulatePurchase` is the explicit dev/QA
 * simulated-purchase signal consumed by the simulated-purchase verifier.
 */
export interface ContentUnlockRefreshOptions {
  /** Rule-scope filter; absent evaluates every rule, `[]` evaluates none. */
  ruleIds?: string[];
  /** Explicit dev/QA simulated-purchase signal. */
  simulatePurchase?: boolean;
  /** Self-attestation flag (unchanged semantics; ignored by scoped rules). */
  attested?: boolean;
}

/** One rule outcome returned by a refresh (structural subset of the main result). */
export interface ContentUnlockRefreshResult {
  /** The rule that produced the result. */
  ruleId: string;
  /** The rule's target key (`game:<id>` / `dlc:<g>:<d>`). */
  key: string;
  /** `unlocked` / `already-unlocked` / `not-verified` / … (opaque string). */
  outcome: string;
}

/** The subset of the `window.tce.contentUnlocks` bridge the client needs. */
export interface ContentUnlockBridge {
  isUnlocked(target: UnlockTargetLike): Promise<boolean>;
  getUnlocks(): Promise<ContentUnlockRecordLike[]>;
  refresh?(options?: ContentUnlockRefreshOptions): Promise<ContentUnlockRefreshResult[]>;
}

/** Total read/refresh API over the unified content-unlock state. */
export interface ContentUnlockClient {
  /** Whether a target is unlocked. Missing/erroring bridge → `false`. */
  isUnlocked(target: UnlockTargetLike): Promise<boolean>;
  /** Every persisted unlock record. Missing/erroring bridge → `[]`. */
  getUnlocks(): Promise<ContentUnlockRecordLike[]>;
  /**
   * Re-evaluate content-unlock rules, optionally scoped. Missing/erroring
   * bridge → `[]`. Never throws; the caller always gets an array.
   */
  refresh(options?: ContentUnlockRefreshOptions): Promise<ContentUnlockRefreshResult[]>;
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
    async refresh(options?: ContentUnlockRefreshOptions): Promise<ContentUnlockRefreshResult[]> {
      if (!bridge || typeof bridge.refresh !== 'function') return [];
      try {
        const results = await bridge.refresh(normaliseRefreshOptions(options));
        return Array.isArray(results) ? results : [];
      } catch {
        return [];
      }
    },
  };
}

/**
 * Normalise client-supplied refresh options to the safe subset the bridge
 * understands: a string-only `ruleIds` scope, an explicit `simulatePurchase`,
 * and an explicit `attested`. Never throws.
 */
function normaliseRefreshOptions(
  options?: ContentUnlockRefreshOptions | null,
): ContentUnlockRefreshOptions {
  if (typeof options !== 'object' || options === null) return {};
  const normalised: ContentUnlockRefreshOptions = {};
  if (Array.isArray(options.ruleIds)) {
    normalised.ruleIds = options.ruleIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
  }
  if (options.simulatePurchase === true) normalised.simulatePurchase = true;
  if (options.attested === true) normalised.attested = true;
  return normalised;
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

/**
 * Structural guard mirroring `isUnlockTarget` in `electron/action-rewards-ipc`.
 *
 * Exported so the pure lock computation (`steam-lock.ts`, F6) shares one
 * definition of a well-formed game/DLC target and never diverges from the
 * renderer read client.
 */
export function isUnlockTarget(value: unknown): value is UnlockTargetLike {
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
