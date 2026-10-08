/**
 * Generalised action-reward service and unified, target-keyed content-unlock
 * persistence — pure Node, no Electron import (CG-0MUZGBRP2001XOUA, feature F3
 * of CG-0MUZF156A007OUIT).
 *
 * The launcher rewards content for arbitrary actions on arbitrary platforms
 * (follow on Steam, follow on itch.io, review elsewhere, …). `unlock-rules.ts`
 * (F1) defines the unified `UnlockRule` model and `action-verifiers.ts` (F2)
 * the pluggable verification seam; this module supplies the two remaining
 * pieces:
 *
 *   - `ContentUnlockStore` — unified, **target-keyed** persistence
 *     (`game:<id>` / `dlc:<gameId>:<dlcId>`, keys from `unlock-rules`'s
 *     `targetKey`) replacing the single-game `UnlockStore`. Memory and
 *     file-backed implementations are provided; the file store is
 *     corrupt-file-safe and never throws.
 *   - `ActionRewardService` — evaluates every **platform-action** rule against
 *     the store through the verifier resolved for it, unlocking idempotently.
 *     An already-unlocked target is never re-verified.
 *
 * **Totality contract.** Every method is total: missing/empty/malformed rules,
 * a missing verifier, a throwing verifier, and a broken store all degrade to a
 * documented safe value and never throw — the launcher must never crash, and
 * an unlock is never fabricated.
 *
 * **Backward compatibility.** `SteamFollowService` (in `steam-follow.ts`)
 * delegates its unlock/self-attest flow to this service through a thin
 * adapter over the legacy `UnlockStore`, so the existing Steam follow reward
 * uses the same service path while its callers and tests stay unchanged.
 */
import fs from 'fs/promises';
import path from 'path';
import {
  targetKey,
  type PlatformActionUnlockRule,
  type UnlockRuleSet,
  type UnlockTarget,
} from './unlock-rules.js';
import {
  ActionVerifierRegistry,
  resolveVerifierForRule,
  type ActionVerificationRequest,
  type ActionVerificationResult,
  type ActionVerifierConfig,
} from './action-verifiers.js';

// ── Unified content-unlock persistence ─────────────────────

/** One persisted unlock, keyed by its stable target key. */
export interface ContentUnlockRecord {
  /** Stable key from `targetKey(target)` (`game:<id>` / `dlc:<g>:<d>`). */
  key: string;
  /** The decoded target that became unlocked. */
  target: UnlockTarget;
  /** ISO timestamp of the unlock (preserved across idempotent re-unlocks). */
  unlockedAt: string;
}

/**
 * Unified, target-keyed persistence for unlocked content.
 *
 * Generalises the single-game `UnlockStore` so every caller (platform-action
 * rewards, achievement give-aways, the launcher lock computation) reads and
 * writes one source of truth. Implementations must be total: a missing or
 * corrupt backing store degrades to "nothing unlocked", never an exception.
 */
export interface ContentUnlockStore {
  /** Every persisted unlock record. Missing/corrupt → empty. Never throws. */
  getAll(): Promise<ContentUnlockRecord[]>;
  /** Whether a target is already unlocked. Never throws. */
  isUnlocked(target: UnlockTarget): Promise<boolean>;
  /**
   * Persist an unlock. Idempotent: re-unlocking keeps the original timestamp.
   * Returns the stored record. Never throws (best-effort persistence).
   */
  unlock(target: UnlockTarget, unlockedAt?: string): Promise<ContentUnlockRecord>;
}

/** Current on-disk schema version for the file content-unlock store. */
export const CONTENT_UNLOCK_STORE_VERSION = 1;

/** The file-backed on-disk shape. */
export interface ContentUnlockFile {
  version?: number;
  unlocks: ContentUnlockRecord[];
}

/**
 * Serialise unlock records for the file store. Pure; the caller handles I/O.
 */
export function serializeContentUnlocks(records: readonly ContentUnlockRecord[]): string {
  const payload: ContentUnlockFile = {
    version: CONTENT_UNLOCK_STORE_VERSION,
    unlocks: [...records],
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Parse unlock records from file-store JSON.
 *
 * Total: malformed JSON, a missing/non-array `unlocks` field, and individual
 * malformed entries all degrade to the valid records (ultimately `[]`) without
 * throwing. The stored `key` is ignored in favour of the canonical
 * `targetKey(target)`, so a stale/forged key cannot masquerade as another
 * target.
 */
export function parseContentUnlocks(raw: string): ContentUnlockRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const list = isRecord(parsed) ? parsed.unlocks : undefined;
  if (!Array.isArray(list)) return [];

  const records: ContentUnlockRecord[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const target = toUnlockTarget(isRecord(entry) ? entry.target : undefined);
    if (!target) continue;
    const unlockedAt = isRecord(entry) && typeof entry.unlockedAt === 'string' ? entry.unlockedAt : '';
    const key = targetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ key, target, unlockedAt });
  }
  return records;
}

/** In-memory `ContentUnlockStore` for tests and ephemeral runs. */
export class MemoryContentUnlockStore implements ContentUnlockStore {
  private readonly records = new Map<string, ContentUnlockRecord>();

  constructor(initial: readonly ContentUnlockRecord[] = []) {
    for (const record of initial ?? []) {
      const target = toUnlockTarget(record?.target);
      if (!target) continue;
      const key = targetKey(target);
      this.records.set(key, {
        key,
        target,
        unlockedAt: typeof record.unlockedAt === 'string' ? record.unlockedAt : '',
      });
    }
  }

  async getAll(): Promise<ContentUnlockRecord[]> {
    return [...this.records.values()].map((record) => ({ ...record, target: cloneTarget(record.target) }));
  }

  async isUnlocked(target: UnlockTarget): Promise<boolean> {
    return this.records.has(targetKey(target));
  }

  async unlock(target: UnlockTarget, unlockedAt: string = new Date().toISOString()): Promise<ContentUnlockRecord> {
    const key = targetKey(target);
    const existing = this.records.get(key);
    if (existing) return { ...existing, target: cloneTarget(existing.target) };
    const record: ContentUnlockRecord = { key, target: cloneTarget(target), unlockedAt };
    this.records.set(key, record);
    return { ...record, target: cloneTarget(record.target) };
  }
}

/**
 * JSON-file `ContentUnlockStore` — the production persistence mechanism.
 *
 * A missing or corrupt file is treated as "nothing unlocked" (never throws),
 * so a first launch or a wiped file degrades gracefully. Writes are
 * best-effort and also never throw; an unwritable path leaves the in-memory
 * result correct while persistence is simply skipped.
 */
export class FileContentUnlockStore implements ContentUnlockStore {
  constructor(private readonly filePath: string) {}

  async getAll(): Promise<ContentUnlockRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return parseContentUnlocks(raw);
    } catch {
      return [];
    }
  }

  async isUnlocked(target: UnlockTarget): Promise<boolean> {
    const key = targetKey(target);
    return (await this.getAll()).some((record) => record.key === key);
  }

  async unlock(target: UnlockTarget, unlockedAt: string = new Date().toISOString()): Promise<ContentUnlockRecord> {
    const records = await this.getAll();
    const key = targetKey(target);
    const existing = records.find((record) => record.key === key);
    if (existing) return existing;

    const record: ContentUnlockRecord = { key, target: cloneTarget(target), unlockedAt };
    records.push(record);
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, serializeContentUnlocks(records), 'utf-8');
    } catch {
      // Best-effort persistence — the store contract is total (never throws).
    }
    return record;
  }
}

// ── Action-reward service ──────────────────────────────────

/** Construction inputs for `ActionRewardService`. */
export interface ActionRewardConfig {
  /** The configured rules (`null`/empty → the service is a no-op). */
  rules: UnlockRuleSet | null | undefined;
  /** Unified, target-keyed persistence. */
  store: ContentUnlockStore;
  /** Verifier registry; defaults to a self-attest-only registry. */
  verifiers?: ActionVerifierRegistry;
  /** Verifier resolution config (platform/action/rule overrides). */
  verifierConfig?: ActionVerifierConfig | null;
}

/** Per-refresh inputs (player attestation, configured action URLs). */
export interface ActionRewardRefreshOptions {
  /**
   * Whether the player self-attested to completing every action. Only an
   * explicit `true` counts; the verifier ultimately decides.
   */
  attested?: boolean;
  /** `ruleId` → action URL, passed through to the verifier's request. */
  actionUrls?: Record<string, string>;
}

/**
 * Outcome of processing one platform-action rule:
 *   - `'unlocked'`                — verified and newly persisted.
 *   - `'already-unlocked'`        — present in the store; verification skipped.
 *   - `'not-verified'`            — verification ran and did not satisfy.
 *   - `'verification-unavailable'`— verification could not run; offer a
 *                                   self-attest fallback.
 */
export type ActionRewardOutcome =
  | 'unlocked'
  | 'already-unlocked'
  | 'not-verified'
  | 'verification-unavailable';

/** Result of processing one platform-action rule. */
export interface ActionRewardResult {
  /** `id` of the rule that produced this result. */
  ruleId: string;
  /** The rule's target. */
  target: UnlockTarget;
  /** The target's stable key (`targetKey(target)`). */
  key: string;
  outcome: ActionRewardOutcome;
  /** The verification result, or `null` when verification was skipped. */
  verification: ActionVerificationResult | null;
}

/**
 * Evaluates every configured platform-action rule against the unified store
 * through the verifier resolved for that rule.
 *
 * Game-agnostic and total: the service never names a platform, action, or
 * game, and every failure mode degrades safely. Achievement rules are
 * deliberately ignored here — they are owned by the achievement give-away
 * mechanism, which shares the same store and rule model.
 */
export class ActionRewardService {
  private readonly store: ContentUnlockStore;
  private readonly ruleSet: UnlockRuleSet | null;
  private readonly verifiers: ActionVerifierRegistry;
  private readonly verifierConfig: ActionVerifierConfig | null;

  constructor(config: ActionRewardConfig) {
    this.store = config.store;
    this.ruleSet = normaliseRuleSet(config.rules);
    this.verifiers = config.verifiers ?? new ActionVerifierRegistry();
    this.verifierConfig = config.verifierConfig ?? null;
  }

  /** Whether a target is unlocked (total read API). Never throws. */
  async isUnlocked(target: UnlockTarget): Promise<boolean> {
    try {
      return await this.store.isUnlocked(target);
    } catch {
      return false;
    }
  }

  /** Every persisted unlock record (total read API). Never throws. */
  async getUnlocks(): Promise<ContentUnlockRecord[]> {
    try {
      return await this.store.getAll();
    } catch {
      return [];
    }
  }

  /**
   * Process every valid platform-action rule once.
   *
   * For each rule: an already-unlocked target is reported and **not**
   * re-verified; otherwise the resolved verifier runs and a satisfied action
   * is persisted idempotently. Returns one result per valid platform-action
   * rule, in rule order. Never throws.
   */
  async refresh(options: ActionRewardRefreshOptions = {}): Promise<ActionRewardResult[]> {
    const rules = this.ruleSet?.rules ?? [];
    const results: ActionRewardResult[] = [];
    const unlockedKeys = await this.loadUnlockedKeys();

    for (const rule of rules) {
      const platformRule = asPlatformActionRule(rule);
      if (!platformRule) continue;

      const key = targetKey(platformRule.target);
      if (unlockedKeys.has(key)) {
        results.push({
          ruleId: platformRule.id,
          target: platformRule.target,
          key,
          outcome: 'already-unlocked',
          verification: null,
        });
        continue;
      }

      const verification = await this.verify(platformRule, options);
      if (verification.verified) {
        await this.safeUnlock(platformRule.target);
        unlockedKeys.add(key);
        results.push({
          ruleId: platformRule.id,
          target: platformRule.target,
          key,
          outcome: 'unlocked',
          verification,
        });
      } else {
        results.push({
          ruleId: platformRule.id,
          target: platformRule.target,
          key,
          outcome: verification.outcome === 'unavailable' ? 'verification-unavailable' : 'not-verified',
          verification,
        });
      }
    }

    return results;
  }

  private async loadUnlockedKeys(): Promise<Set<string>> {
    try {
      return new Set((await this.store.getAll()).map((record) => record.key));
    } catch {
      return new Set();
    }
  }

  private async verify(
    rule: PlatformActionUnlockRule,
    options: ActionRewardRefreshOptions,
  ): Promise<ActionVerificationResult> {
    const verifier = resolveVerifierForRule(this.verifiers, rule, this.verifierConfig);
    const request: ActionVerificationRequest = {
      platform: rule.trigger.platform,
      action: rule.trigger.action,
      attested: options.attested === true,
    };
    const actionUrl = options.actionUrls?.[rule.id];
    if (typeof actionUrl === 'string') request.actionUrl = actionUrl;

    try {
      return await verifier.verify(request);
    } catch {
      return {
        verifierId: verifier.id,
        outcome: 'unavailable',
        verified: false,
        automatic: false,
        reason: 'Verifier threw while verifying the action',
      };
    }
  }

  private async safeUnlock(target: UnlockTarget): Promise<void> {
    try {
      await this.store.unlock(target);
    } catch {
      // Total by contract — a broken store must not crash the reward flow.
    }
  }
}

// ── Internal guards ────────────────────────────────────────

function normaliseRuleSet(ruleSet: UnlockRuleSet | null | undefined): UnlockRuleSet | null {
  if (!isRecord(ruleSet)) return null;
  const rules = ruleSet.rules;
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const version = typeof ruleSet.version === 'number' ? ruleSet.version : undefined;
  return { version, rules };
}

function asPlatformActionRule(rule: unknown): PlatformActionUnlockRule | null {
  if (!isRecord(rule)) return null;
  if (typeof rule.id !== 'string' || rule.id.length === 0) return null;

  const trigger = isRecord(rule.trigger) ? rule.trigger : null;
  if (!trigger || trigger.kind !== 'platform-action') return null;
  if (typeof trigger.platform !== 'string' || trigger.platform.length === 0) return null;
  if (typeof trigger.action !== 'string' || trigger.action.length === 0) return null;

  const target = toUnlockTarget(rule.target);
  if (!target) return null;

  return {
    id: rule.id,
    trigger: { kind: 'platform-action', platform: trigger.platform, action: trigger.action },
    target,
  };
}

function toUnlockTarget(value: unknown): UnlockTarget | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'game') {
    if (typeof value.gameId !== 'string' || value.gameId.length === 0) return null;
    return { kind: 'game', gameId: value.gameId };
  }
  if (value.kind === 'dlc') {
    if (typeof value.gameId !== 'string' || value.gameId.length === 0) return null;
    if (typeof value.dlcId !== 'string' || value.dlcId.length === 0) return null;
    return { kind: 'dlc', gameId: value.gameId, dlcId: value.dlcId };
  }
  return null;
}

function cloneTarget(target: UnlockTarget): UnlockTarget {
  if (target.kind === 'game') return { kind: 'game', gameId: target.gameId };
  return { kind: 'dlc', gameId: target.gameId, dlcId: target.dlcId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
