/**
 * IPC surface for the generalised action-reward / content-unlock mechanism
 * (CG-0MUZGBSSQ009ISHG, feature F5 of CG-0MUZF156A007OUIT).
 *
 * The renderer never imports the Steamworks SDK or a Node API; it reads the
 * unified, target-keyed unlock state through the additive
 * `window.tce.contentUnlocks` context bridge (exposed by `electron/preload.cjs`).
 * This module defines the channel names and the pure handler table that
 * `main.ts` wires to `ipcMain.handle`.
 *
 * The existing `steamFollow:*` channels and `window.tce.steamFollow` surface
 * are deliberately untouched — this is a parallel, additive bridge.
 *
 * **Totality contract.** Every handler is total: a missing service, a throwing
 * service, and a malformed renderer-supplied target all degrade to a
 * documented safe value (`false` / `[]`) and never throw. A DLC or game gate
 * that cannot read the unlock state must never crash the owning game.
 */
import {
  ActionRewardService,
  type ActionRewardResult,
  type ContentUnlockRecord,
} from './action-rewards.js';
import type { UnlockTarget } from './unlock-rules.js';

/** Channel names — must stay in sync with `preload.cjs` (plain CJS). */
export const ACTION_REWARD_CHANNELS = {
  isUnlocked: 'contentUnlocks:isUnlocked',
  getUnlocks: 'contentUnlocks:getUnlocks',
  refresh: 'contentUnlocks:refresh',
} as const;

/** Per-refresh inputs from the renderer (attestation, URLs, scope). */
export interface ActionRewardRefreshRequest {
  /** Whether the player self-attested to completing every configured action. */
  attested?: boolean;
  /** `ruleId` → action URL, passed through to the resolved verifier. */
  actionUrls?: Record<string, string>;
  /**
   * Rule-scope filter: only these rule ids are evaluated. An empty array
   * evaluates nothing; an absent value evaluates every rule.
   */
  ruleIds?: string[];
  /** Explicit dev/QA simulated-purchase signal (see `SimulatedPurchaseVerifier`). */
  simulatePurchase?: boolean;
}

/** The handler table registered on `ipcMain`. */
export interface ActionRewardHandlers {
  /** Total read API: whether a target is unlocked. Never throws. */
  isUnlocked(target: UnlockTarget): Promise<boolean>;
  /** Total read API: every persisted unlock record. Never throws. */
  getUnlocks(): Promise<ContentUnlockRecord[]>;
  /** Re-evaluate every platform-action rule (idempotent). Never throws. */
  refresh(options?: ActionRewardRefreshRequest): Promise<ActionRewardResult[]>;
}

/**
 * Build the IPC handlers from a wired `ActionRewardService`.
 *
 * Every handler is total (never throws) — a missing service or a failure in
 * the unified store degrades to a safe value, so the renderer's DLC/game gate
 * can never crash the owning game.
 */
export function createActionRewardHandlers(
  service: ActionRewardService | null | undefined,
): ActionRewardHandlers {
  return {
    async isUnlocked(target: UnlockTarget): Promise<boolean> {
      if (!service || !isUnlockTarget(target)) return false;
      try {
        return (await service.isUnlocked(target)) === true;
      } catch {
        return false;
      }
    },
    async getUnlocks(): Promise<ContentUnlockRecord[]> {
      if (!service) return [];
      try {
        const records = await service.getUnlocks();
        return Array.isArray(records) ? records : [];
      } catch {
        return [];
      }
    },
    async refresh(options?: ActionRewardRefreshRequest): Promise<ActionRewardResult[]> {
      if (!service) return [];
      try {
        const results = await service.refresh(normaliseRefreshRequest(options));
        return Array.isArray(results) ? results : [];
      } catch {
        return [];
      }
    },
  };
}

/**
 * Structural guard: is `value` a well-formed game or DLC unlock target?
 *
 * Guards the IPC boundary so a malformed renderer payload is rejected before
 * it reaches the service — the handler returns `false` rather than throwing.
 */
export function isUnlockTarget(value: unknown): value is UnlockTarget {
  if (!isRecord(value)) return false;
  if (value.kind === 'game') {
    return typeof value.gameId === 'string' && value.gameId.length > 0;
  }
  if (value.kind === 'dlc') {
    return (
      typeof value.gameId === 'string' &&
      value.gameId.length > 0 &&
      typeof value.dlcId === 'string' &&
      value.dlcId.length > 0
    );
  }
  return false;
}

/**
 * Normalise a renderer-supplied refresh request to the safe subset the service
 * understands: an explicit `attested: true`, string action URLs, a string-only
 * `ruleIds` scope, and an explicit `simulatePurchase: true`.
 */
function normaliseRefreshRequest(
  options: ActionRewardRefreshRequest | null | undefined,
): {
  attested?: boolean;
  actionUrls?: Record<string, string>;
  ruleIds?: string[];
  simulatePurchase?: boolean;
} {
  if (!isRecord(options)) return {};
  const request: {
    attested?: boolean;
    actionUrls?: Record<string, string>;
    ruleIds?: string[];
    simulatePurchase?: boolean;
  } = {};
  if (options.attested === true) request.attested = true;
  if (options.simulatePurchase === true) request.simulatePurchase = true;
  if (Array.isArray(options.ruleIds)) {
    request.ruleIds = options.ruleIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
  }
  if (isRecord(options.actionUrls)) {
    const urls: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.actionUrls)) {
      if (typeof value === 'string') urls[key] = value;
    }
    request.actionUrls = urls;
  }
  return request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
