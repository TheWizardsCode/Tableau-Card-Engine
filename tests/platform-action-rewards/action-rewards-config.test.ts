/**
 * Unit tests for the action-reward config loader and drift validator
 * (electron/action-rewards-config.ts, CG-0MUZGBS9A002X9DQ — feature F4 of
 * CG-0MUZF156A007OUIT).
 *
 * The drift validator is the guard that keeps the *data* (which action on which
 * platform unlocks which game/DLC) aligned with the *registered* targets,
 * scenes, and verifiers. These tests pin:
 *  - the shipped `electron/action-rewards.json` declares the itch.io follow
 *    action, its URL, and its designated game target;
 *  - the shipped bonus catalog carries the matching gated entry;
 *  - the validator rejects an unregistered target, verifier, scene, or gated-by
 *    rule, and duplicate rule ids/actions;
 *  - malformed/missing config degrades to `null` (never throws);
 *  - the no-hard-coded-titles guarantee: no game display title appears in the
 *    reward-logic modules.
 *
 * Pure Node — no browser, no Electron; runs under `--project unit`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ACTION_REWARDS_CONFIG_VERSION,
  buildActionRewardRegistry,
  loadActionRewardsConfig,
  parseActionRewardsConfig,
  resolveConfiguredVerifierId,
  validateActionRewardsConfig,
  type ActionRewardsConfigFile,
  type ActionRewardRegistry,
} from '../../electron/action-rewards-config';
import {
  ActionVerifierRegistry,
  FakeActionVerifier,
  SELF_ATTEST_VERIFIER_ID,
  SIMULATED_PURCHASE_VERIFIER_ID,
  STEAM_FOLLOW_VERIFIER_ID,
  resolveVerifierForRule,
} from '../../electron/action-verifiers';
import { loadBonusCatalog } from '../../electron/bonus-catalog';
import type { UnlockRule } from '../../electron/unlock-rules';

const ELECTRON_DIR = path.resolve(__dirname, '../../electron');
const CONFIG_PATH = path.join(ELECTRON_DIR, 'action-rewards.json');
const CATALOG_PATH = path.join(ELECTRON_DIR, 'bonus-catalog.json');

/** Verifier ids the launcher ships. */
const KNOWN_VERIFIER_IDS = [
  SELF_ATTEST_VERIFIER_ID,
  STEAM_FOLLOW_VERIFIER_ID,
  SIMULATED_PURCHASE_VERIFIER_ID,
];

/** A platform-action rule that unlocks a whole game. */
function gameRule(id: string, platform: string, action: string, gameId: string): UnlockRule {
  return {
    id,
    trigger: { kind: 'platform-action', platform, action },
    target: { kind: 'game', gameId },
  };
}

/** A minimal valid config, overridable per test. */
function configWith(overrides: Partial<ActionRewardsConfigFile> = {}): ActionRewardsConfigFile {
  return {
    version: ACTION_REWARDS_CONFIG_VERSION,
    rules: [gameRule('r1', 'itch.io', 'follow', 'golf')],
    actionUrls: {},
    verifiers: {},
    ...overrides,
  };
}

/** A registry with only the supplied games/scenes/verifiers. */
function registryWith(
  games: ActionRewardRegistry['games'],
  sceneKeys: readonly string[],
  verifierIds: readonly string[] = KNOWN_VERIFIER_IDS,
): ActionRewardRegistry {
  return { games, sceneKeys, verifierIds };
}

// ── Shipped config ─────────────────────────────────────────

describe('shipped action-rewards.json', () => {
  it('declares the itch.io follow action, its URL, and its designated game', () => {
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });

    expect(config).not.toBeNull();
    expect(config!.version).toBe(ACTION_REWARDS_CONFIG_VERSION);

    const rule = config!.rules.find((r) => r.id === 'itchio-follow');
    expect(rule).toBeDefined();
    expect(rule!.trigger).toEqual({ kind: 'platform-action', platform: 'itch.io', action: 'follow' });
    expect(rule!.target).toEqual({ kind: 'game', gameId: 'golf' });
    expect(config!.actionUrls['itchio-follow']).toBe('https://wizardscode.itch.io/');
    // The verifier is data too: itch.io has no detection API, so it resolves to
    // the manual self-attest default.
    expect(resolveConfiguredVerifierId(rule!, config!.verifiers)).toBe(SELF_ATTEST_VERIFIER_ID);
  });

  it('passes the drift validator against the shipped catalog and verifiers', () => {
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });
    const catalog = loadBonusCatalog({ catalogPath: CATALOG_PATH });
    const registry = buildActionRewardRegistry(catalog, KNOWN_VERIFIER_IDS);

    expect(config).not.toBeNull();
    expect(validateActionRewardsConfig(config, registry)).toEqual([]);
  });

  it('is not hard-coded in logic: retargeting is a config-only change', () => {
    const config = loadActionRewardsConfig({ configPath: CONFIG_PATH });
    const registry = registryWith([{ id: 'some-other-game', sceneKey: 'SomeScene' }], ['SomeScene']);
    const issues = validateActionRewardsConfig(config, registry);

    // The shipped rule targets `golf`, which is not in this registry — proof the
    // validator reads the target from the config, not from hard-coded logic.
    expect(issues.map((issue) => issue.code)).toContain('unknown-target');
  });
});

// ── Bonus-catalog gated entry ──────────────────────────────

describe('bonus-catalog.json gated entry', () => {
  it('records the itch.io-gated game as data linking it to its rule', () => {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as {
      games: { id: string; sceneKey: string; gatedBy?: string }[];
    };
    const gated = raw.games.find((game) => game.id === 'golf');

    expect(gated).toBeDefined();
    expect(gated!.gatedBy).toBe('itchio-follow');
    expect(gated!.sceneKey).toBe('GolfScene');
  });

  it('flags a catalog gated entry whose rule id is not configured', () => {
    const registry = registryWith(
      [{ id: 'golf', sceneKey: 'GolfScene', gatedBy: 'not-a-configured-rule' }],
      ['GolfScene'],
    );
    const issues = validateActionRewardsConfig(configWith({ rules: [] }), registry);

    expect(issues.map((issue) => issue.code)).toContain('unknown-gated-by-rule');
  });
});

// ── Drift validator ────────────────────────────────────────

describe('validateActionRewardsConfig()', () => {
  const golf = { id: 'golf', sceneKey: 'GolfScene' };

  it('rejects a rule whose target is not registered', () => {
    const config = configWith({ rules: [gameRule('r1', 'itch.io', 'follow', 'not-a-game')] });
    const issues = validateActionRewardsConfig(config, registryWith([golf], ['GolfScene']));

    expect(issues).toEqual([
      expect.objectContaining({ code: 'unknown-target', ruleId: 'r1', gameId: 'not-a-game' }),
    ]);
  });

  it('rejects a rule whose verifier is not registered', () => {
    const config = configWith({ verifiers: { defaultVerifierId: 'no-such-verifier' } });
    const issues = validateActionRewardsConfig(config, registryWith([golf], ['GolfScene']));

    expect(issues.map((issue) => issue.code)).toContain('unknown-verifier');
  });

  it('rejects a rule whose target scene is not registered', () => {
    const issues = validateActionRewardsConfig(
      configWith(),
      registryWith([golf], []), // game registered, but its scene is not
    );

    expect(issues.map((issue) => issue.code)).toContain('unknown-scene');
  });

  it('rejects duplicate rule ids', () => {
    const config = configWith({
      rules: [gameRule('dup', 'itch.io', 'follow', 'golf'), gameRule('dup', 'itch.io', 'review', 'golf')],
    });
    const issues = validateActionRewardsConfig(config, registryWith([golf], ['GolfScene']));

    expect(issues.map((issue) => issue.code)).toContain('duplicate-rule-id');
  });

  it('rejects duplicate (platform, action) pairs', () => {
    const config = configWith({
      rules: [gameRule('r1', 'itch.io', 'follow', 'golf'), gameRule('r2', 'itch.io', 'follow', 'golf')],
    });
    const issues = validateActionRewardsConfig(config, registryWith([golf], ['GolfScene']));

    expect(issues.map((issue) => issue.code)).toContain('duplicate-action');
  });

  it('rejects an unsupported config version', () => {
    const issues = validateActionRewardsConfig(
      configWith({ version: ACTION_REWARDS_CONFIG_VERSION + 1 }),
      registryWith([golf], ['GolfScene']),
    );

    expect(issues.map((issue) => issue.code)).toContain('unsupported-version');
  });

  it('is total: missing/malformed config degrades to an issue, never throws', () => {
    expect(validateActionRewardsConfig(null, registryWith([golf], ['GolfScene']))).toEqual([
      expect.objectContaining({ code: 'invalid-config' }),
    ]);
    expect(
      validateActionRewardsConfig(undefined, registryWith([golf], ['GolfScene'])),
    ).toEqual([expect.objectContaining({ code: 'invalid-config' })]);
  });

  it('ignores malformed rules when looking for drift', () => {
    const config = configWith({
      rules: [{ id: '' } as unknown as UnlockRule, gameRule('r1', 'itch.io', 'follow', 'golf')],
    });
    const issues = validateActionRewardsConfig(config, registryWith([golf], ['GolfScene']));

    expect(issues).toEqual([]);
  });
});

// ── Configured verifier resolution ─────────────────────────

describe('resolveConfiguredVerifierId()', () => {
  const rule = gameRule('r1', 'itch.io', 'follow', 'golf');

  it('prefers rule > action > platform > default, then self-attest', () => {
    expect(
      resolveConfiguredVerifierId(rule, {
        defaultVerifierId: 'default-v',
        platforms: { 'itch.io': 'platform-v' },
        actions: { 'itch.io:follow': 'action-v' },
        rules: { r1: 'rule-v' },
      }),
    ).toBe('rule-v');

    expect(
      resolveConfiguredVerifierId(rule, {
        defaultVerifierId: 'default-v',
        platforms: { 'itch.io': 'platform-v' },
        actions: { 'itch.io:follow': 'action-v' },
      }),
    ).toBe('action-v');

    expect(
      resolveConfiguredVerifierId(rule, {
        defaultVerifierId: 'default-v',
        platforms: { 'itch.io': 'platform-v' },
      }),
    ).toBe('platform-v');

    expect(resolveConfiguredVerifierId(rule, { defaultVerifierId: 'default-v' })).toBe('default-v');
    expect(resolveConfiguredVerifierId(rule, {})).toBe(SELF_ATTEST_VERIFIER_ID);
    expect(resolveConfiguredVerifierId(rule, null)).toBe(SELF_ATTEST_VERIFIER_ID);
  });

  it('returns the configured id even when it is not registered (so drift is detectable)', () => {
    expect(resolveConfiguredVerifierId(rule, { defaultVerifierId: 'ghost' })).toBe('ghost');
  });

  it('matches the priority of ActionVerifierRegistry.resolve for registered ids', () => {
    const registry = new ActionVerifierRegistry().register(
      new FakeActionVerifier({ id: 'rule-v' }),
    );
    const config = {
      defaultVerifierId: SELF_ATTEST_VERIFIER_ID,
      platforms: { 'itch.io': 'rule-v' },
    };

    expect(resolveVerifierForRule(registry, rule, config).id).toBe(
      resolveConfiguredVerifierId(rule, config),
    );
  });
});

// ── Loader total-ness ──────────────────────────────────────

describe('loadActionRewardsConfig() / parseActionRewardsConfig()', () => {
  it('returns null for a missing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-action-rewards-'));
    try {
      expect(loadActionRewardsConfig({ configPath: path.join(dir, 'nope.json') })).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null for corrupt JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-action-rewards-'));
    try {
      const file = path.join(dir, 'bad.json');
      fs.writeFileSync(file, '{ not json');
      expect(loadActionRewardsConfig({ configPath: file })).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null when rules is missing (a config with no rules is unusable)', () => {
    expect(parseActionRewardsConfig({ version: 1 })).toBeNull();
    expect(parseActionRewardsConfig('nonsense')).toBeNull();
  });

  it('drops malformed rules and non-string url/verifier values', () => {
    const config = parseActionRewardsConfig({
      version: ACTION_REWARDS_CONFIG_VERSION,
      rules: [gameRule('r1', 'itch.io', 'follow', 'golf'), { id: '' }, 42],
      actionUrls: { r1: 'https://example.test/', bad: 42 },
      verifiers: { defaultVerifierId: 'manual-self-attest', platforms: { 'itch.io': 'manual-self-attest' }, junk: 1 },
    });

    expect(config).toEqual({
      version: ACTION_REWARDS_CONFIG_VERSION,
      rules: [gameRule('r1', 'itch.io', 'follow', 'golf')],
      actionUrls: { r1: 'https://example.test/' },
      verifiers: {
        defaultVerifierId: 'manual-self-attest',
        platforms: { 'itch.io': 'manual-self-attest' },
        actions: {},
        rules: {},
      },
    });
  });
});

// ── No hard-coded titles ───────────────────────────────────

describe('no hard-coded game titles in the reward logic', () => {
  const REWARD_LOGIC_MODULES = [
    'unlock-rules.ts',
    'action-verifiers.ts',
    'action-rewards.ts',
    'action-rewards-config.ts',
  ];

  /** Return the display titles that appear in *source* (empty when clean). */
  function findTitleHits(source: string, titles: readonly string[]): string[] {
    return titles.filter((title) => source.includes(title));
  }

  it('detects a title when one is present (guards against a vacuous scan)', () => {
    const catalogSource = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const titles = catalogSource.match(/"(?:title)":\s*"([^"]+)"/g) ?? [];
    expect(titles.length).toBeGreaterThan(0);

    const rawTitles = (
      JSON.parse(catalogSource) as { games: { title: string }[] }
    ).games.map((game) => game.title);
    expect(rawTitles).toContain('Golf');

    for (const title of rawTitles) {
      expect(findTitleHits(catalogSource, [title])).toEqual([title]);
    }
  });

  it('contains no catalog display title in any reward-logic module', () => {
    const rawTitles = (
      JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as { games: { title: string }[] }
    ).games.map((game) => game.title);
    expect(rawTitles.length).toBeGreaterThan(0);

    for (const moduleFile of REWARD_LOGIC_MODULES) {
      const source = fs.readFileSync(path.join(ELECTRON_DIR, moduleFile), 'utf-8');
      expect(findTitleHits(source, rawTitles)).toEqual([]);
    }
  });
});
