/**
 * Action-reward config loader and drift validator — pure Node, no Electron
 * import (CG-0MUZGBS9A002X9DQ, feature F4 of CG-0MUZF156A007OUIT).
 *
 * `electron/action-rewards.json` is the **data** that says which action on
 * which platform unlocks which target (game or DLC), which verifier checks it,
 * and which URL the player visits. This module loads that file and validates it
 * against the launcher's **registered** entities so config and logic cannot
 * silently diverge:
 *
 *   - a rule targeting a game that is not in the bonus catalog;
 *   - a rule targeting a game whose scene is not registered in the build;
 *   - a rule resolving to a verifier that is not registered;
 *   - a catalog `gatedBy` entry naming a rule that is not configured;
 *   - duplicate rule ids, or duplicate `(platform, action)` pairs.
 *
 * **All names are data.** No game title, DLC id, platform name, action name, or
 * URL is hard-coded here — the registered ids/scenes come from the bonus
 * catalog and the verifier registry. The file is therefore retargetable with a
 * config edit and no code change, and the shipped config passes cleanly.
 *
 * Together with the unified `UnlockRule` model (`unlock-rules.ts`, F1) and the
 * pluggable verifier seam (`action-verifiers.ts`, F2), the config completes the
 * declared reward data layer the service (`action-rewards.ts`, F3) executes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SELF_ATTEST_VERIFIER_ID,
  verifierKey,
  type ActionVerifierConfig,
} from './action-verifiers.js';
import {
  evaluateUnlockRules,
  type UnlockEvaluation,
  type UnlockRule,
  type UnlockTarget,
} from './unlock-rules.js';

// ── Config file shape ──────────────────────────────────────

/** File name of the shipped config (next to this module). */
export const DEFAULT_ACTION_REWARDS_FILE = 'action-rewards.json';

/** Current `action-rewards.json` schema version. */
export const ACTION_REWARDS_CONFIG_VERSION = 1;

/**
 * The typed shape of `action-rewards.json`.
 *
 * `rules` uses the unified F1 `UnlockRule` model; `verifiers` is the F2
 * `ActionVerifierConfig` resolution map; `actionUrls` maps a rule id to the URL
 * opened for the player to perform the action.
 */
export interface ActionRewardsConfigFile {
  /** Config schema version (omitted → current version). */
  version: number;
  /** The configured reward rules. */
  rules: UnlockRule[];
  /** `ruleId` → action URL (data, opened by the caller/verifier). */
  actionUrls: Record<string, string>;
  /** Verifier resolution config (rule/action/platform/default). */
  verifiers: ActionVerifierConfig;
}

/** Directory of the loaded module (works under ESM). */
function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

// ── Loading / parsing ──────────────────────────────────────

export interface LoadActionRewardsConfigOptions {
  /** Explicit config path (tests). Defaults to the module directory. */
  configPath?: string;
}

/**
 * Load `action-rewards.json`.
 *
 * Returns `null` when the file is missing, unreadable, invalid JSON, or has no
 * usable `rules` array — callers treat that as "no action rewards configured"
 * and degrade gracefully. Never throws.
 */
export function loadActionRewardsConfig(
  options: LoadActionRewardsConfigOptions = {},
): ActionRewardsConfigFile | null {
  const configPath =
    options.configPath ?? path.join(moduleDir(), DEFAULT_ACTION_REWARDS_FILE);

  try {
    if (!fs.existsSync(configPath)) return null;
    return parseActionRewardsConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
  } catch {
    return null;
  }
}

/**
 * Parse and structurally validate a config object.
 *
 * Returns `null` when the shape is unusable (not an object, or no `rules`
 * array). Malformed individual rules/urls/verifier entries are dropped rather
 * than disabling the whole config, so one bad row cannot break every reward.
 */
export function parseActionRewardsConfig(value: unknown): ActionRewardsConfigFile | null {
  if (!isRecord(value) || !Array.isArray(value.rules)) return null;

  return {
    version: typeof value.version === 'number' ? value.version : ACTION_REWARDS_CONFIG_VERSION,
    rules: normaliseRules(value.rules),
    actionUrls: normaliseStringMap(value.actionUrls),
    verifiers: normaliseVerifierConfig(value.verifiers),
  };
}

/**
 * Structurally normalise a raw rules array.
 *
 * F1's pure `evaluateUnlockRules` doubles as a total structural normaliser: it
 * skips malformed rules (bad id/trigger/target) rather than throwing, and echoes
 * each valid rule's id, trigger, and target back. Re-using it keeps this module
 * from duplicating the rule shape.
 */
function normaliseRules(rawRules: unknown): UnlockRule[] {
  if (!Array.isArray(rawRules)) return [];
  return evaluateUnlockRules({ rules: rawRules as UnlockRule[] }).map(toUnlockRule);
}

/** Rebuild an F1 rule from its normalised evaluation (shape is guaranteed). */
function toUnlockRule(evaluation: UnlockEvaluation): UnlockRule {
  const target: UnlockTarget =
    evaluation.kind === 'game'
      ? { kind: 'game', gameId: evaluation.gameId }
      : { kind: 'dlc', gameId: evaluation.gameId, dlcId: evaluation.dlcId };
  const { trigger } = evaluation;
  if (trigger.kind === 'platform-action') {
    return { id: evaluation.ruleId, trigger, target };
  }
  return { id: evaluation.ruleId, trigger, target };
}

function normaliseStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function normaliseVerifierConfig(value: unknown): ActionVerifierConfig {
  const out: ActionVerifierConfig = { actions: {}, rules: {} };
  if (!isRecord(value)) return out;
  if (typeof value.defaultVerifierId === 'string') out.defaultVerifierId = value.defaultVerifierId;
  out.platforms = normaliseStringMap(value.platforms);
  out.actions = normaliseStringMap(value.actions);
  out.rules = normaliseStringMap(value.rules);
  return out;
}

// ── Registered entities (the drift reference) ──────────────

/** A game the launcher knows about, with the scene that renders it. */
export interface RegisteredGame {
  /** Stable game id. */
  id: string;
  /** Phaser scene key that renders the game (registered in the build). */
  sceneKey: string;
  /**
   * Optional rule id that gates this game (from the bonus catalog). When
   * present it must reference a configured rule.
   */
  gatedBy?: string;
}

/**
 * Everything the validator checks a config against: the registered game
 * targets, scene keys, and verifier ids.
 *
 * Built from the bonus catalog and the verifier registry so the config is
 * validated against the launcher's real capabilities, never a hard-coded list.
 */
export interface ActionRewardRegistry {
  games: readonly RegisteredGame[];
  sceneKeys: readonly string[];
  verifierIds: readonly string[];
}

/**
 * Build a registry from a bonus catalog and the registered verifier ids.
 *
 * Tolerant by design: malformed catalog entries are skipped and `sceneKeys`
 * defaults to the scene keys declared by the catalog, so a caller need only
 * supply the catalog + verifier ids. Never throws.
 */
export function buildActionRewardRegistry(
  catalog: { games?: readonly unknown[] } | null | undefined,
  verifierIds: readonly string[],
  sceneKeys?: readonly string[],
): ActionRewardRegistry {
  const games: RegisteredGame[] = [];
  const rawGames = catalog && Array.isArray(catalog.games) ? catalog.games : [];
  for (const entry of rawGames) {
    if (!isRecord(entry)) continue;
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue;
    const game: RegisteredGame = {
      id: entry.id,
      sceneKey: typeof entry.sceneKey === 'string' ? entry.sceneKey : '',
    };
    if (typeof entry.gatedBy === 'string' && entry.gatedBy.length > 0) {
      game.gatedBy = entry.gatedBy;
    }
    games.push(game);
  }

  const declaredScenes = Array.isArray(sceneKeys)
    ? sceneKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    : games.map((game) => game.sceneKey).filter((key) => key.length > 0);

  return {
    games,
    sceneKeys: [...new Set(declaredScenes)],
    verifierIds: [
      ...new Set((verifierIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)),
    ],
  };
}

// ── Drift validation ───────────────────────────────────────

/** The kinds of drift the validator can report. */
export type ActionRewardIssueCode =
  | 'invalid-config'
  | 'unsupported-version'
  | 'duplicate-rule-id'
  | 'duplicate-action'
  | 'unknown-target'
  | 'unknown-scene'
  | 'unknown-verifier'
  | 'unknown-gated-by-rule';

/** A single non-fatal drift issue. */
export interface ActionRewardIssue {
  code: ActionRewardIssueCode;
  /** Human-readable diagnostic for logs. */
  message: string;
  /** The offending rule id, when the issue is rule-scoped. */
  ruleId?: string;
  /** The offending game id, when applicable. */
  gameId?: string;
  /** The offending scene key, when applicable. */
  sceneKey?: string;
  /** The offending verifier id, when applicable. */
  verifierId?: string;
  /** The offending platform, when applicable. */
  platform?: string;
  /** The offending action, when applicable. */
  action?: string;
}

/**
 * Resolve the verifier id a rule is *configured* to use, without looking it up.
 *
 * Mirrors the precedence of `ActionVerifierRegistry.resolve` (rule override →
 * `(platform, action)` → platform → default → manual self-attest) but returns
 * the configured id even when it is not registered — that is exactly what lets
 * the validator report an unregistered verifier instead of silently falling
 * back.
 */
export function resolveConfiguredVerifierId(
  rule: UnlockRule | null | undefined,
  verifierConfig?: ActionVerifierConfig | null,
): string {
  const config: ActionVerifierConfig | null =
    typeof verifierConfig === 'object' && verifierConfig !== null ? verifierConfig : null;
  const ruleId = isRecord(rule) && typeof rule.id === 'string' ? rule.id : '';
  const trigger = isRecord(rule) ? (rule as { trigger?: unknown }).trigger : undefined;
  const isPlatformAction = isRecord(trigger) && trigger.kind === 'platform-action';
  const platform =
    isPlatformAction && typeof trigger.platform === 'string' ? trigger.platform : '';
  const action = isPlatformAction && typeof trigger.action === 'string' ? trigger.action : '';

  if (config) {
    if (config.rules && ruleId) {
      const byRule = config.rules[ruleId];
      if (typeof byRule === 'string' && byRule.length > 0) return byRule;
    }
    if (config.actions && platform && action) {
      const byAction = config.actions[verifierKey(platform, action)];
      if (typeof byAction === 'string' && byAction.length > 0) return byAction;
    }
    if (config.platforms && platform) {
      const byPlatform = config.platforms[platform];
      if (typeof byPlatform === 'string' && byPlatform.length > 0) return byPlatform;
    }
    if (typeof config.defaultVerifierId === 'string' && config.defaultVerifierId.length > 0) {
      return config.defaultVerifierId;
    }
  }

  return SELF_ATTEST_VERIFIER_ID;
}

/**
 * Validate a config against a registry, returning every drift issue found.
 *
 * Non-fatal (the caller logs and continues) and total (never throws). Returns an
 * empty array when the config is clean — as the shipped config is.
 */
export function validateActionRewardsConfig(
  config: ActionRewardsConfigFile | null | undefined,
  registry: ActionRewardRegistry,
): ActionRewardIssue[] {
  if (!isRecord(config)) {
    return [{ code: 'invalid-config', message: 'Action-rewards config is missing or not an object.' }];
  }

  const issues: ActionRewardIssue[] = [];
  const version = typeof config.version === 'number' ? config.version : ACTION_REWARDS_CONFIG_VERSION;
  if (version !== ACTION_REWARDS_CONFIG_VERSION) {
    issues.push({
      code: 'unsupported-version',
      message: `Unsupported action-rewards config version ${version} (expected ${ACTION_REWARDS_CONFIG_VERSION}).`,
    });
  }

  const safeRegistry = normaliseRegistry(registry);
  const gamesById = new Map(safeRegistry.games.map((game) => [game.id, game]));
  const sceneKeys = new Set(safeRegistry.sceneKeys);
  const verifierIds = new Set(safeRegistry.verifierIds);

  const rules = normaliseRules(config.rules);
  const seenRuleIds = new Set<string>();
  const seenActions = new Map<string, string>();

  for (const rule of rules) {
    if (seenRuleIds.has(rule.id)) {
      issues.push({
        code: 'duplicate-rule-id',
        ruleId: rule.id,
        message: `Duplicate rule id '${rule.id}'.`,
      });
    }
    seenRuleIds.add(rule.id);

    if (rule.trigger.kind === 'platform-action') {
      const { platform, action } = rule.trigger;
      const key = verifierKey(platform, action);
      const existingRuleId = seenActions.get(key);
      if (existingRuleId !== undefined) {
        issues.push({
          code: 'duplicate-action',
          ruleId: rule.id,
          platform,
          action,
          message: `Duplicate platform action '${platform}/${action}' (also in rule '${existingRuleId}').`,
        });
      } else {
        seenActions.set(key, rule.id);
      }
    }

    const { gameId } = rule.target;
    const registered = gamesById.get(gameId);
    if (!registered) {
      issues.push({
        code: 'unknown-target',
        ruleId: rule.id,
        gameId,
        message: `Rule '${rule.id}' targets unknown game '${gameId}'.`,
      });
    } else if (!registered.sceneKey || !sceneKeys.has(registered.sceneKey)) {
      issues.push({
        code: 'unknown-scene',
        ruleId: rule.id,
        gameId,
        sceneKey: registered.sceneKey,
        message: `Rule '${rule.id}' targets game '${gameId}' whose scene '${registered.sceneKey || '(missing)'}' is not registered.`,
      });
    }

    const verifierId = resolveConfiguredVerifierId(rule, config.verifiers);
    if (!verifierIds.has(verifierId)) {
      issues.push({
        code: 'unknown-verifier',
        ruleId: rule.id,
        verifierId,
        message: `Rule '${rule.id}' resolves to unknown verifier '${verifierId}'.`,
      });
    }
  }

  // A configured default verifier must itself be registered, even with no rules.
  const defaultVerifierId = isRecord(config.verifiers) ? config.verifiers.defaultVerifierId : undefined;
  if (
    typeof defaultVerifierId === 'string' &&
    defaultVerifierId.length > 0 &&
    !verifierIds.has(defaultVerifierId)
  ) {
    issues.push({
      code: 'unknown-verifier',
      verifierId: defaultVerifierId,
      message: `Configured default verifier '${defaultVerifierId}' is not registered.`,
    });
  }

  // Every catalog `gatedBy` reference must name a configured rule.
  const configuredRuleIds = new Set(rules.map((rule) => rule.id));
  for (const game of safeRegistry.games) {
    if (game.gatedBy && !configuredRuleIds.has(game.gatedBy)) {
      issues.push({
        code: 'unknown-gated-by-rule',
        gameId: game.id,
        message: `Game '${game.id}' is gated by unknown rule '${game.gatedBy}'.`,
      });
    }
  }

  return issues;
}

function normaliseRegistry(registry: ActionRewardRegistry): ActionRewardRegistry {
  if (!isRecord(registry)) return { games: [], sceneKeys: [], verifierIds: [] };
  return {
    games: Array.isArray(registry.games) ? registry.games.filter(isRecord).map(toRegisteredGame) : [],
    sceneKeys: Array.isArray(registry.sceneKeys) ? registry.sceneKeys : [],
    verifierIds: Array.isArray(registry.verifierIds) ? registry.verifierIds : [],
  };
}

function toRegisteredGame(value: Record<string, unknown>): RegisteredGame {
  const game: RegisteredGame = {
    id: typeof value.id === 'string' ? value.id : '',
    sceneKey: typeof value.sceneKey === 'string' ? value.sceneKey : '',
  };
  if (typeof value.gatedBy === 'string' && value.gatedBy.length > 0) game.gatedBy = value.gatedBy;
  return game;
}

// ── Internal guards ────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
