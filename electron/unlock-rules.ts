/**
 * Unified, platform-agnostic unlock-rule contract — pure Node, no I/O, no
 * Electron import (CG-0MUZGBQHU002NQ9C).
 *
 * The launcher rewards content for **arbitrary actions on any platform**
 * (follow on Steam, follow on itch.io, review elsewhere, …) and for
 * **achievements**. Rather than one Steam-shaped mechanism plus a parallel
 * achievement mechanism, both share this single discriminated model:
 *
 *   - `UnlockTrigger` — discriminated on `kind`: `'platform-action'` (a
 *     `(platform, action)` pair) or `'achievement'` (a set of achievement ids
 *     that must all be unlocked).
 *   - `UnlockTarget` — discriminated on `kind`: `'game'` (a bundled game) or
 *     `'dlc'` (extra content inside a game, identified by `gameId` + `dlcId`).
 *   - `UnlockRule` / `UnlockRuleSet` — the typed, config-shaped rules.
 *   - `evaluateUnlockRules(...)` — a pure evaluator returning one
 *     discriminated result per valid rule.
 *
 * **All names are data.** No game title, DLC id, platform name, action name,
 * or URL appears in this module's logic; every such value is supplied by the
 * caller (config). The evaluator never throws: an empty, missing, or malformed
 * rule set is a total no-op.
 *
 * The achievement give-away contract (CG-0MUNW63UL0086J3G) and the launcher
 * lock computation consume these types instead of redefining a divergent rule
 * model, so the Game Selector reads one source of truth.
 */

// ── Triggers ───────────────────────────────────────────────

/**
 * A platform-action trigger: an action performed on a storefront/platform.
 *
 * Both `platform` and `action` are opaque data — the module never branches on
 * a specific value.
 */
export interface PlatformActionTrigger {
  kind: 'platform-action';
  /** Platform identifier (storefront/community) — data, never hard-coded. */
  platform: string;
  /** Action identifier performed on that platform — data. */
  action: string;
}

/** An achievement trigger: every listed achievement must be unlocked. */
export interface AchievementTrigger {
  kind: 'achievement';
  /** Achievement ids that must ALL be unlocked for the rule to be satisfied. */
  achievementIds: readonly string[];
}

/** What the player must do for a rule to fire. */
export type UnlockTrigger = PlatformActionTrigger | AchievementTrigger;

/** A `(platform, action)` pair the player has satisfied. */
export interface PlatformActionRef {
  platform: string;
  action: string;
}

// ── Targets ────────────────────────────────────────────────

/** Unlock a whole bundled game. */
export interface GameTarget {
  kind: 'game';
  /** Stable game identifier (never the display title). */
  gameId: string;
}

/** Unlock DLC within a game the player already has. */
export interface DlcTarget {
  kind: 'dlc';
  /** Stable game identifier that owns the DLC. */
  gameId: string;
  /** Stable DLC identifier, owned by the game repo's content definition. */
  dlcId: string;
}

/** The content a rule unlocks. */
export type UnlockTarget = GameTarget | DlcTarget;

// ── Rules ──────────────────────────────────────────────────

/** Fields shared by every rule variant. */
export interface UnlockRuleCommon {
  /** Stable rule id used for diagnostics and de-duplication. */
  id: string;
  /** The content that becomes unlocked when the trigger is satisfied. */
  target: UnlockTarget;
}

/** A rule fired by a platform action. */
export interface PlatformActionUnlockRule extends UnlockRuleCommon {
  trigger: PlatformActionTrigger;
}

/** A rule fired by one or more achievements. */
export interface AchievementUnlockRule extends UnlockRuleCommon {
  trigger: AchievementTrigger;
}

/**
 * A single unlock rule — a discriminated union over `trigger.kind`.
 *
 * The `target` is itself a discriminated union (`game` | `dlc`), so a rule can
 * reward a whole game or in-game DLC through one model.
 */
export type UnlockRule = PlatformActionUnlockRule | AchievementUnlockRule;

/** Current `UnlockRuleSet` schema version. */
export const UNLOCK_RULE_SET_VERSION = 1;

/** The typed config shape: a versioned collection of unlock rules. */
export interface UnlockRuleSet {
  /** Optional config schema version (omitted → current version). */
  version?: number;
  /** The configured rules (order is preserved and is not significant). */
  rules: readonly UnlockRule[];
}

// ── Evaluation state ───────────────────────────────────────

/**
 * The read-only inputs an evaluation needs: what the player has already
 * achieved, and which targets are already unlocked (persistence).
 *
 * Every field is optional-friendly at runtime — `evaluateUnlockRules` tolerates
 * `undefined`/malformed entries and never throws.
 */
export interface UnlockStateSnapshot {
  /** Achievement ids the player has unlocked. */
  readonly unlockedAchievementIds: readonly string[];
  /** Platform actions the player has satisfied. */
  readonly satisfiedActions: readonly PlatformActionRef[];
  /** Target keys (`targetKey(...)`) already unlocked in persistence. */
  readonly alreadyUnlockedKeys: readonly string[];
}

/** A snapshot with nothing achieved and nothing unlocked. */
export const EMPTY_UNLOCK_STATE: UnlockStateSnapshot = {
  unlockedAchievementIds: [],
  satisfiedActions: [],
  alreadyUnlockedKeys: [],
};

// ── Stable keys ────────────────────────────────────────────

/**
 * Stable, collision-free persistence key for an unlock target.
 *
 * Format (ids are percent-encoded so the `:` separator is unambiguous):
 *   `game:<gameId>` and `dlc:<gameId>:<dlcId>`.
 *
 * Exported so the unified `ContentUnlockStore` (CG-0MUNW63UL0086J3G) and the
 * lock computation key targets identically.
 */
export function targetKey(target: UnlockTarget): string {
  if (target.kind === 'game') return `game:${encodePart(target.gameId)}`;
  return `dlc:${encodePart(target.gameId)}:${encodePart(target.dlcId)}`;
}

/**
 * Stable key for a satisfied `(platform, action)` pair. Percent-encoded so the
 * `:` separator is unambiguous.
 */
export function platformActionKey(ref: PlatformActionRef): string {
  return `action:${encodePart(ref.platform)}:${encodePart(ref.action)}`;
}

function encodePart(part: string): string {
  return encodeURIComponent(part);
}

// ── Evaluation results ─────────────────────────────────────

/**
 * Outcome of evaluating one rule:
 *   - `'unlock'`           — trigger satisfied and target not yet unlocked;
 *                            the caller should unlock (and persist) it.
 *   - `'already-unlocked'` — the target is already unlocked in persistence.
 *   - `'trigger-unmet'`    — the trigger condition is not satisfied yet.
 */
export type UnlockOutcome = 'unlock' | 'already-unlocked' | 'trigger-unmet';

/** Fields common to every evaluation result. */
export interface UnlockEvaluationBase {
  /** `id` of the rule that produced this result. */
  ruleId: string;
  /** The rule's trigger (echoed back for diagnostics). */
  trigger: UnlockTrigger;
  outcome: UnlockOutcome;
  /** Whether the trigger condition is satisfied by the snapshot. */
  satisfied: boolean;
  /** Whether the target is unlocked (ready to unlock, or already unlocked). */
  unlocked: boolean;
  /**
   * Required achievement ids still missing. Always empty for
   * platform-action triggers.
   */
  missingAchievementIds: string[];
}

/** Evaluation of a rule whose target is a whole game. */
export interface GameUnlockEvaluation extends UnlockEvaluationBase {
  kind: 'game';
  gameId: string;
}

/** Evaluation of a rule whose target is in-game DLC. */
export interface DlcUnlockEvaluation extends UnlockEvaluationBase {
  kind: 'dlc';
  gameId: string;
  dlcId: string;
}

/** One discriminated evaluation result for a game or a DLC target. */
export type UnlockEvaluation = GameUnlockEvaluation | DlcUnlockEvaluation;

// ── Pure evaluator ─────────────────────────────────────────

/**
 * Evaluate every valid rule in `ruleSet` against `state`.
 *
 * Pure and total: it performs no I/O, mutates nothing, and never throws. An
 * empty/missing/malformed rule set — or an individual malformed rule — is
 * skipped rather than raising. Returns one result per valid rule, in rule
 * order, so the same inputs always produce deeply-equal output.
 */
export function evaluateUnlockRules(
  ruleSet: UnlockRuleSet | null | undefined,
  state: UnlockStateSnapshot = EMPTY_UNLOCK_STATE,
): UnlockEvaluation[] {
  const rules = (ruleSet as { rules?: unknown } | null | undefined)?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return [];

  const snapshot = normaliseState(state);
  const evaluations: UnlockEvaluation[] = [];
  for (const rule of rules) {
    const evaluation = evaluateRule(rule, snapshot);
    if (evaluation) evaluations.push(evaluation);
  }
  return evaluations;
}

interface NormalisedState {
  achievementIds: Set<string>;
  actionKeys: Set<string>;
  targetKeys: Set<string>;
}

function firstArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function normaliseState(state: UnlockStateSnapshot): NormalisedState {
  const achievementIds = new Set<string>();
  for (const id of firstArray(state?.unlockedAchievementIds)) {
    if (typeof id === 'string' && id.length > 0) achievementIds.add(id);
  }

  const actionKeys = new Set<string>();
  for (const ref of firstArray(state?.satisfiedActions)) {
    if (isRecord(ref) && typeof ref.platform === 'string' && typeof ref.action === 'string') {
      actionKeys.add(platformActionKey({ platform: ref.platform, action: ref.action }));
    }
  }

  const targetKeys = new Set<string>();
  for (const key of firstArray(state?.alreadyUnlockedKeys)) {
    if (typeof key === 'string') targetKeys.add(key);
  }

  return { achievementIds, actionKeys, targetKeys };
}

function evaluateRule(rule: unknown, snapshot: NormalisedState): UnlockEvaluation | null {
  if (!isRecord(rule)) return null;
  if (typeof rule.id !== 'string' || rule.id.length === 0) return null;

  const trigger = normaliseTrigger(rule.trigger);
  const target = normaliseTarget(rule.target);
  if (!trigger || !target) return null;

  let satisfied: boolean;
  let missingAchievementIds: string[] = [];
  if (trigger.kind === 'platform-action') {
    satisfied = snapshot.actionKeys.has(platformActionKey(trigger));
  } else {
    missingAchievementIds = trigger.achievementIds.filter(
      (id, index) => !snapshot.achievementIds.has(id) && trigger.achievementIds.indexOf(id) === index,
    );
    satisfied = missingAchievementIds.length === 0;
  }

  const alreadyUnlocked = snapshot.targetKeys.has(targetKey(target));
  const outcome: UnlockOutcome = alreadyUnlocked
    ? 'already-unlocked'
    : satisfied
      ? 'unlock'
      : 'trigger-unmet';

  const base: UnlockEvaluationBase = {
    ruleId: rule.id,
    trigger,
    outcome,
    satisfied,
    unlocked: alreadyUnlocked || satisfied,
    missingAchievementIds,
  };

  if (target.kind === 'game') return { ...base, kind: 'game', gameId: target.gameId };
  return { ...base, kind: 'dlc', gameId: target.gameId, dlcId: target.dlcId };
}

function normaliseTrigger(value: unknown): UnlockTrigger | null {
  if (!isRecord(value)) return null;

  if (value.kind === 'platform-action') {
    if (typeof value.platform !== 'string' || value.platform.length === 0) return null;
    if (typeof value.action !== 'string' || value.action.length === 0) return null;
    return { kind: 'platform-action', platform: value.platform, action: value.action };
  }

  if (value.kind === 'achievement') {
    const ids = value.achievementIds;
    if (!Array.isArray(ids) || ids.length === 0) return null;
    if (!ids.every((id): id is string => typeof id === 'string' && id.length > 0)) return null;
    return { kind: 'achievement', achievementIds: [...ids] };
  }

  return null;
}

function normaliseTarget(value: unknown): UnlockTarget | null {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ── Deterministic fakes / test fixtures ────────────────────

/**
 * Build a deterministic `UnlockRuleSet` from rules (test/config fixture).
 *
 * Keeps test setup declarative without hand-writing the wrapper object.
 */
export function createUnlockRuleSet(rules: readonly UnlockRule[]): UnlockRuleSet {
  return { version: UNLOCK_RULE_SET_VERSION, rules: [...rules] };
}

/**
 * Deterministic in-memory `UnlockStateSnapshot` for unit tests.
 *
 * No timers, no RNG, no I/O — every mutation is explicit, so evaluator tests
 * are reproducible. The collection methods are chainable and idempotent.
 */
export class FakeUnlockState implements UnlockStateSnapshot {
  readonly unlockedAchievementIds: string[] = [];
  readonly satisfiedActions: PlatformActionRef[] = [];
  readonly alreadyUnlockedKeys: string[] = [];

  /** Mark an achievement as unlocked (idempotent). */
  unlockAchievement(achievementId: string): this {
    if (!this.unlockedAchievementIds.includes(achievementId)) {
      this.unlockedAchievementIds.push(achievementId);
    }
    return this;
  }

  /** Mark a `(platform, action)` pair as satisfied (idempotent). */
  satisfyAction(platform: string, action: string): this {
    return this.satisfyActionRef({ platform, action });
  }

  /** Mark a `(platform, action)` pair as satisfied (idempotent). */
  satisfyActionRef(ref: PlatformActionRef): this {
    const key = platformActionKey(ref);
    if (!this.satisfiedActions.some((existing) => platformActionKey(existing) === key)) {
      this.satisfiedActions.push({ platform: ref.platform, action: ref.action });
    }
    return this;
  }

  /** Mark a target as already unlocked (idempotent). */
  markUnlocked(target: UnlockTarget): this {
    const key = targetKey(target);
    if (!this.alreadyUnlockedKeys.includes(key)) {
      this.alreadyUnlockedKeys.push(key);
    }
    return this;
  }

  /** Clear all recorded state (for test isolation between cases). */
  reset(): this {
    this.unlockedAchievementIds.length = 0;
    this.satisfiedActions.length = 0;
    this.alreadyUnlockedKeys.length = 0;
    return this;
  }
}
