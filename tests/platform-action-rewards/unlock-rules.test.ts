/**
 * Contract tests for the unified unlock-rule model
 * (electron/unlock-rules.ts, CG-0MUZGBQHU002NQ9C).
 *
 * These assert observable behaviour of the pure evaluator and its
 * deterministic fake: game targets, DLC targets, achievement requirements,
 * already-unlocked precedence, the total no-op guarantee for missing/malformed
 * config, determinism, and that every game/DLC/platform/action name is data
 * rather than something baked into the logic.
 */
import { describe, it, expect } from 'vitest';

import {
  EMPTY_UNLOCK_STATE,
  FakeUnlockState,
  UNLOCK_RULE_SET_VERSION,
  createUnlockRuleSet,
  evaluateUnlockRules,
  platformActionKey,
  targetKey,
  type UnlockRule,
  type UnlockRuleSet,
} from '../../electron/unlock-rules';

/** A platform-action rule unlocking a game. */
function gameRule(id: string, platform: string, action: string, gameId: string): UnlockRule {
  return {
    id,
    trigger: { kind: 'platform-action', platform, action },
    target: { kind: 'game', gameId },
  };
}

/** An achievement rule unlocking a game. */
function achievementGameRule(id: string, achievementIds: string[], gameId: string): UnlockRule {
  return {
    id,
    trigger: { kind: 'achievement', achievementIds },
    target: { kind: 'game', gameId },
  };
}

/** A platform-action rule unlocking DLC inside a game. */
function dlcRule(
  id: string,
  platform: string,
  action: string,
  gameId: string,
  dlcId: string,
): UnlockRule {
  return {
    id,
    trigger: { kind: 'platform-action', platform, action },
    target: { kind: 'dlc', gameId, dlcId },
  };
}

// ── Stable keys ────────────────────────────────────────────

describe('targetKey()', () => {
  it('produces distinct, stable keys for game and DLC targets', () => {
    expect(targetKey({ kind: 'game', gameId: 'alpha' })).toBe('game:alpha');
    expect(targetKey({ kind: 'dlc', gameId: 'alpha', dlcId: 'cosmetic' })).toBe(
      'dlc:alpha:cosmetic',
    );
    // A game and a DLC of the same game never collide.
    expect(targetKey({ kind: 'game', gameId: 'alpha' })).not.toBe(
      targetKey({ kind: 'dlc', gameId: 'alpha', dlcId: 'cosmetic' }),
    );
  });

  it('keeps the `:` separator unambiguous when ids contain one', () => {
    const key = targetKey({ kind: 'dlc', gameId: 'a:b', dlcId: 'c:d' });
    expect(key).toBe('dlc:a%3Ab:c%3Ad');
    expect(key.split(':')).toHaveLength(3);
  });
});

describe('platformActionKey()', () => {
  it('keys a (platform, action) pair without ambiguity', () => {
    expect(platformActionKey({ platform: 'storefront', action: 'follow' })).toBe(
      'action:storefront:follow',
    );
    // A `:` inside a name is encoded, so the separator stays meaningful.
    expect(platformActionKey({ platform: 'a:b', action: 'c' })).toBe('action:a%3Ab:c');
  });
});

// ── Game-target evaluation ─────────────────────────────────

describe('evaluateUnlockRules() — game targets', () => {
  it('reports an unlock when a platform action is satisfied', () => {
    const rules = createUnlockRuleSet([gameRule('r1', 'storefront', 'follow', 'bundled-game')]);
    const state = new FakeUnlockState().satisfyAction('storefront', 'follow');

    const [result] = evaluateUnlockRules(rules, state);

    expect(result).toMatchObject({
      ruleId: 'r1',
      kind: 'game',
      gameId: 'bundled-game',
      outcome: 'unlock',
      satisfied: true,
      unlocked: true,
      missingAchievementIds: [],
    });
  });

  it('reports trigger-unmet when the platform action is absent', () => {
    const rules = createUnlockRuleSet([gameRule('r1', 'storefront', 'follow', 'bundled-game')]);

    const [result] = evaluateUnlockRules(rules, EMPTY_UNLOCK_STATE);

    expect(result.outcome).toBe('trigger-unmet');
    expect(result.satisfied).toBe(false);
    expect(result.unlocked).toBe(false);
  });

  it('unlocks an achievement rule only when every required achievement is present', () => {
    const rules = createUnlockRuleSet([
      achievementGameRule('r1', ['ach-a', 'ach-b'], 'bundled-game'),
    ]);

    const partial = new FakeUnlockState().unlockAchievement('ach-a');
    const [partialResult] = evaluateUnlockRules(rules, partial);
    expect(partialResult.outcome).toBe('trigger-unmet');
    expect(partialResult.missingAchievementIds).toEqual(['ach-b']);

    const complete = new FakeUnlockState().unlockAchievement('ach-a').unlockAchievement('ach-b');
    const [completeResult] = evaluateUnlockRules(rules, complete);
    expect(completeResult.outcome).toBe('unlock');
    expect(completeResult.missingAchievementIds).toEqual([]);
  });

  it('deduplicates missing achievement ids reported back to the caller', () => {
    const rules = createUnlockRuleSet([
      achievementGameRule('r1', ['ach-a', 'ach-a', 'ach-b'], 'bundled-game'),
    ]);
    const [result] = evaluateUnlockRules(rules, EMPTY_UNLOCK_STATE);
    expect(result.missingAchievementIds).toEqual(['ach-a', 'ach-b']);
  });

  it('reports already-unlocked (not unlock) when persistence holds the target', () => {
    const rules = createUnlockRuleSet([gameRule('r1', 'storefront', 'follow', 'bundled-game')]);
    const state = new FakeUnlockState()
      .satisfyAction('storefront', 'follow')
      .markUnlocked({ kind: 'game', gameId: 'bundled-game' });

    const [result] = evaluateUnlockRules(rules, state);

    expect(result.outcome).toBe('already-unlocked');
    expect(result.unlocked).toBe(true);
  });

  it('treats an already-unlocked target as unlocked even when the trigger is unmet', () => {
    const rules = createUnlockRuleSet([gameRule('r1', 'storefront', 'follow', 'bundled-game')]);
    const state = new FakeUnlockState().markUnlocked({ kind: 'game', gameId: 'bundled-game' });

    const [result] = evaluateUnlockRules(rules, state);

    expect(result.outcome).toBe('already-unlocked');
    expect(result.satisfied).toBe(false);
    expect(result.unlocked).toBe(true);
  });
});

// ── DLC-target evaluation ──────────────────────────────────

describe('evaluateUnlockRules() — DLC targets', () => {
  it('returns a discriminated result carrying gameId and dlcId', () => {
    const rules = createUnlockRuleSet([
      dlcRule('r1', 'storefront', 'follow', 'base-game', 'bonus-pack'),
    ]);
    const state = new FakeUnlockState().satisfyAction('storefront', 'follow');

    const [result] = evaluateUnlockRules(rules, state);

    expect(result).toMatchObject({
      kind: 'dlc',
      gameId: 'base-game',
      dlcId: 'bonus-pack',
      outcome: 'unlock',
      unlocked: true,
    });
  });

  it('does not conflate DLC with its owning game', () => {
    const gameRules = createUnlockRuleSet([
      gameRule('r-game', 'storefront', 'follow', 'base-game'),
      dlcRule('r-dlc', 'storefront', 'follow', 'base-game', 'bonus-pack'),
    ]);
    // Only the whole game is persisted as unlocked.
    const state = new FakeUnlockState()
      .satisfyAction('storefront', 'follow')
      .markUnlocked({ kind: 'game', gameId: 'base-game' });

    const results = evaluateUnlockRules(gameRules, state);
    const dlc = results.find((r) => r.ruleId === 'r-dlc');
    const game = results.find((r) => r.ruleId === 'r-game');

    expect(game?.outcome).toBe('already-unlocked');
    expect(dlc?.outcome).toBe('unlock');
    expect(dlc?.unlocked).toBe(true);
  });

  it('gates DLC on an achievement trigger', () => {
    const rules = createUnlockRuleSet([
      {
        id: 'r1',
        trigger: { kind: 'achievement', achievementIds: ['ach-finish'] },
        target: { kind: 'dlc', gameId: 'base-game', dlcId: 'epilogue' },
      },
    ]);

    expect(evaluateUnlockRules(rules, EMPTY_UNLOCK_STATE)[0].outcome).toBe('trigger-unmet');
    const unlocked = new FakeUnlockState().unlockAchievement('ach-finish');
    expect(evaluateUnlockRules(rules, unlocked)[0].outcome).toBe('unlock');
  });
});

// ── Total no-op for missing / unknown config ───────────────

describe('evaluateUnlockRules() — missing/unknown config is a total no-op', () => {
  it('returns [] and never throws for missing or empty rule sets', () => {
    expect(evaluateUnlockRules(null)).toEqual([]);
    expect(evaluateUnlockRules(undefined)).toEqual([]);
    expect(evaluateUnlockRules({ rules: [] })).toEqual([]);
    expect(() => evaluateUnlockRules({ rules: [] })).not.toThrow();
  });

  it('tolerates malformed config without throwing', () => {
    const garbage = [
      {} as UnlockRuleSet,
      { rules: 'not-an-array' } as unknown as UnlockRuleSet,
      { rules: [null, 42, 'nope', {}, []] } as unknown as UnlockRuleSet,
      {
        rules: [
          { id: '', trigger: { kind: 'platform-action', platform: 'p', action: 'a' }, target: { kind: 'game', gameId: 'g' } },
          { id: 'no-trigger', target: { kind: 'game', gameId: 'g' } },
          { id: 'no-target', trigger: { kind: 'platform-action', platform: 'p', action: 'a' } },
          { id: 'unknown-trigger', trigger: { kind: 'mystery' }, target: { kind: 'game', gameId: 'g' } },
          { id: 'unknown-target', trigger: { kind: 'achievement', achievementIds: ['x'] }, target: { kind: 'mystery' } },
          { id: 'empty-achievements', trigger: { kind: 'achievement', achievementIds: [] }, target: { kind: 'game', gameId: 'g' } },
        ],
      } as unknown as UnlockRuleSet,
    ];

    for (const candidate of garbage) {
      expect(() => evaluateUnlockRules(candidate)).not.toThrow();
      expect(evaluateUnlockRules(candidate)).toEqual([]);
    }
  });

  it('skips only the invalid rules and still evaluates the valid ones', () => {
    const mixed = {
      rules: [
        { bogus: true },
        gameRule('good', 'storefront', 'follow', 'bundled-game'),
      ],
    } as unknown as UnlockRuleSet;

    const results = evaluateUnlockRules(mixed, new FakeUnlockState().satisfyAction('storefront', 'follow'));

    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe('good');
  });

  it('degrades DLC evaluation to trigger-unmet when the snapshot is malformed', () => {
    const rules = createUnlockRuleSet([
      dlcRule('r1', 'storefront', 'follow', 'base-game', 'bonus-pack'),
    ]);
    const broken = {
      unlockedAchievementIds: 'nope',
      satisfiedActions: [null, { platform: 5 }],
      alreadyUnlockedKeys: [null],
    } as unknown as typeof EMPTY_UNLOCK_STATE;

    expect(() => evaluateUnlockRules(rules, broken)).not.toThrow();
    expect(evaluateUnlockRules(rules, broken)[0].outcome).toBe('trigger-unmet');
  });

  it('never treats a non-array string as a list of ids (no character iteration)', () => {
    // A malformed `finished` achievement id of one character must not be
    // satisfied by iterating the characters of a string snapshot.
    const rules = createUnlockRuleSet([achievementGameRule('r1', ['x'], 'game-a')]);
    const broken = { unlockedAchievementIds: 'x' } as unknown as typeof EMPTY_UNLOCK_STATE;

    const [result] = evaluateUnlockRules(rules, broken);
    expect(result.outcome).toBe('trigger-unmet');
    expect(result.missingAchievementIds).toEqual(['x']);
  });
});

// ── Determinism ────────────────────────────────────────────

describe('evaluateUnlockRules() — determinism', () => {
  it('produces deeply-equal output for equal inputs', () => {
    const rules = createUnlockRuleSet([
      gameRule('r1', 'storefront', 'follow', 'game-a'),
      dlcRule('r2', 'storefront', 'follow', 'game-a', 'dlc-b'),
      achievementGameRule('r3', ['ach-1'], 'game-c'),
    ]);
    const state = new FakeUnlockState().satisfyAction('storefront', 'follow');

    const first = evaluateUnlockRules(rules, state);
    const second = evaluateUnlockRules(rules, state);

    expect(second).toEqual(first);
  });

  it('preserves rule order in the result', () => {
    const rules = createUnlockRuleSet([
      gameRule('first', 'p', 'a', 'g1'),
      gameRule('second', 'p', 'a', 'g2'),
      gameRule('third', 'p', 'a', 'g3'),
    ]);

    expect(evaluateUnlockRules(rules, EMPTY_UNLOCK_STATE).map((r) => r.ruleId)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('does not mutate the rule set or the state snapshot', () => {
    const rule: UnlockRule = gameRule('r1', 'storefront', 'follow', 'game-a');
    const rules = createUnlockRuleSet([rule]);
    const state = new FakeUnlockState().satisfyAction('storefront', 'follow');
    const before = {
      achievements: [...state.unlockedAchievementIds],
      actions: [...state.satisfiedActions],
      targets: [...state.alreadyUnlockedKeys],
      rules: rules.rules.length,
    };

    evaluateUnlockRules(rules, state);

    expect(state.unlockedAchievementIds).toEqual(before.achievements);
    expect(state.satisfiedActions).toEqual(before.actions);
    expect(state.alreadyUnlockedKeys).toEqual(before.targets);
    expect(rules.rules).toHaveLength(before.rules);
  });

  it('defaults to the empty snapshot when none is supplied', () => {
    const rules = createUnlockRuleSet([gameRule('r1', 'storefront', 'follow', 'game-a')]);
    const [result] = evaluateUnlockRules(rules);
    expect(result.outcome).toBe('trigger-unmet');
    expect(result.unlocked).toBe(false);
  });

  it('stamps the current schema version when building a rule set', () => {
    expect(createUnlockRuleSet([]).version).toBe(UNLOCK_RULE_SET_VERSION);
  });
});

// ── Names are data, not code ───────────────────────────────

describe('evaluateUnlockRules() — no hard-coded names', () => {
  it('operates purely on the supplied platform, action, game, and DLC names', () => {
    // Deliberately arbitrary values: if any name were hard-coded in the module,
    // these rules could not behave correctly.
    const platform = 'storefront-xyz-42';
    const action = 'perform-the-thing';
    const gameId = 'game-007-unlikely';
    const dlcId = 'dlc-extra-content-42';

    const rules = createUnlockRuleSet([dlcRule('r1', platform, action, gameId, dlcId)]);

    // Wrong platform -> unmet.
    const wrong = new FakeUnlockState().satisfyAction('a-different-storefront', action);
    expect(evaluateUnlockRules(rules, wrong)[0].outcome).toBe('trigger-unmet');

    // Wrong action -> unmet.
    const wrongAction = new FakeUnlockState().satisfyAction(platform, 'a-different-action');
    expect(evaluateUnlockRules(rules, wrongAction)[0].outcome).toBe('trigger-unmet');

    // Exact configured pair -> unlock, targeting exactly the configured ids.
    const right = new FakeUnlockState().satisfyAction(platform, action);
    const [result] = evaluateUnlockRules(rules, right);
    expect(result.outcome).toBe('unlock');
    expect(result).toMatchObject({ kind: 'dlc', gameId, dlcId });
  });

  it('changes its result when only the config data changes', () => {
    const state = new FakeUnlockState().satisfyAction('platform-x', 'action-x');

    const unlocksGame = createUnlockRuleSet([gameRule('r1', 'platform-x', 'action-x', 'game-111')]);
    const unlocksOther = createUnlockRuleSet([gameRule('r1', 'platform-x', 'action-x', 'game-222')]);

    expect(evaluateUnlockRules(unlocksGame, state)[0]).toMatchObject({ gameId: 'game-111' });
    expect(evaluateUnlockRules(unlocksOther, state)[0]).toMatchObject({ gameId: 'game-222' });
  });
});

// ── Deterministic fake ─────────────────────────────────────

describe('FakeUnlockState', () => {
  it('records achievements, actions, and targets idempotently', () => {
    const state = new FakeUnlockState()
      .unlockAchievement('ach-1')
      .unlockAchievement('ach-1')
      .satisfyAction('storefront', 'follow')
      .satisfyAction('storefront', 'follow')
      .markUnlocked({ kind: 'game', gameId: 'g' })
      .markUnlocked({ kind: 'game', gameId: 'g' });

    expect(state.unlockedAchievementIds).toEqual(['ach-1']);
    expect(state.satisfiedActions).toEqual([{ platform: 'storefront', action: 'follow' }]);
    expect(state.alreadyUnlockedKeys).toEqual(['game:g']);
  });

  it('supports reset for test isolation', () => {
    const state = new FakeUnlockState()
      .unlockAchievement('ach-1')
      .satisfyAction('p', 'a')
      .markUnlocked({ kind: 'game', gameId: 'g' });

    state.reset();

    expect(state.unlockedAchievementIds).toEqual([]);
    expect(state.satisfiedActions).toEqual([]);
    expect(state.alreadyUnlockedKeys).toEqual([]);
  });

  it('drives the evaluator end-to-end for a game and a DLC rule', () => {
    const rules = createUnlockRuleSet([
      gameRule('r-game', 'storefront', 'follow', 'game-a'),
      dlcRule('r-dlc', 'storefront', 'follow', 'game-a', 'dlc-a'),
    ]);
    const state = new FakeUnlockState().satisfyAction('storefront', 'follow');

    const results = evaluateUnlockRules(rules, state);

    expect(results.map((r) => [r.ruleId, r.kind, r.outcome])).toEqual([
      ['r-game', 'game', 'unlock'],
      ['r-dlc', 'dlc', 'unlock'],
    ]);
  });
});
