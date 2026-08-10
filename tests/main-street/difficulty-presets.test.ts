/**
 * Main Street: Difficulty Presets Tests
 *
 * Tests for the DifficultyPresets module, preset application via
 * setupMainStreetGame, and integration with engine scoring and
 * win/loss conditions.
 *
 * Work items: CG-0MMJ8S87N06Q5GP1, CG-0MMJ9O4K403TOIWA
 */
import { describe, it, expect } from 'vitest';

import {
  type GameConfig,
  type DifficultyName,
  EASY_PRESET,
  MEDIUM_PRESET,
  HARD_PRESET,
  DIFFICULTY_PRESETS,
  DIFFICULTY_NAMES,
  getPreset,
} from '../../example-games/main-street/MainStreetDifficulty';

import type {
  DifficultyConfig,
  DifficultyPresetRegistry,
} from '../../src/core-engine/DifficultyPresets';
import {
  createPresetLookup,
  getPresetNames,
} from '../../src/core-engine/DifficultyPresets';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

import {
  STARTING_COINS,
  STARTING_REPUTATION,
  WIN_THRESHOLD,
  SYNERGY_BONUS_PER_NEIGHBOR,
  REPUTATION_SCORE_MULTIPLIER,
  CHALLENGE_BONUS_POINTS,
  createIncidentBalanceState,
  DEFAULT_INCIDENT_REPEAT_SPACING,
  DEFAULT_INCIDENT_MAX_STREAK,
} from '../../example-games/main-street/MainStreetCards';

import { DEFAULT_CHALLENGES_PER_RUN } from '../../example-games/main-street/MainStreetChallenges';

import {
  computeScore,
  checkEndConditions,
} from '../../example-games/main-street/MainStreetEngine';

import {
  computeSynergyBonus,
} from '../../example-games/main-street/MainStreetAdjacency';

import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(
  seed: string = 'test-diff',
  difficulty?: DifficultyName,
): MainStreetState {
  return setupMainStreetGame({ seed, difficulty });
}

function makeTestBusiness(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: 'test-biz',
    name: 'Test Business',
    cost: 3,
    baseIncome: 2,
    synergyTypes: ['Food'],
    maxLevel: 1,
    description: 'Test',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ...overrides,
  };
}

// ── Preset Definition Tests ─────────────────────────────────

describe('DifficultyPresets Module', () => {
  describe('preset definitions', () => {
    it('should define exactly 3 presets', () => {
      expect(DIFFICULTY_NAMES).toHaveLength(3);
      expect(Object.keys(DIFFICULTY_PRESETS)).toHaveLength(3);
    });

    it('should have Easy, Medium, and Hard presets', () => {
      expect(DIFFICULTY_NAMES).toEqual(['Easy', 'Medium', 'Hard']);
      expect(DIFFICULTY_PRESETS.Easy).toBeDefined();
      expect(DIFFICULTY_PRESETS.Medium).toBeDefined();
      expect(DIFFICULTY_PRESETS.Hard).toBeDefined();
    });

    it('should have correct difficulty names on each preset', () => {
      expect(EASY_PRESET.difficultyName).toBe('Easy');
      expect(MEDIUM_PRESET.difficultyName).toBe('Medium');
      expect(HARD_PRESET.difficultyName).toBe('Hard');
    });

    it('should have all required config fields on every preset', () => {
      const requiredKeys: (keyof GameConfig)[] = [
        'difficultyName',
        'startingCoins',
        'startingReputation',
        'winThreshold',
        'reputationScoreMultiplier',
        'challengeBonusPoints',
        'synergyBonusPerNeighbor',
        'challengesPerRun',
        'incidentRepeatSpacing',
        'incidentMaxStreak',
      ];
      for (const preset of [EASY_PRESET, MEDIUM_PRESET, HARD_PRESET]) {
        for (const key of requiredKeys) {
          expect(preset).toHaveProperty(key);
        }
      }
    });

    it('should have positive numeric values for all parameter fields', () => {
      const numericKeys: (keyof GameConfig)[] = [
        'startingCoins',
        'startingReputation',
        'winThreshold',
        'reputationScoreMultiplier',
        'challengeBonusPoints',
        'synergyBonusPerNeighbor',
        'challengesPerRun',
        'incidentRepeatSpacing',
        'incidentMaxStreak',
      ];
      for (const preset of [EASY_PRESET, MEDIUM_PRESET, HARD_PRESET]) {
        for (const key of numericKeys) {
          const value = preset[key];
          expect(typeof value).toBe('number');
          expect(value as number).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Medium preset matches original constants', () => {
    it('should match STARTING_COINS', () => {
      expect(MEDIUM_PRESET.startingCoins).toBe(STARTING_COINS);
    });

    it('should match STARTING_REPUTATION', () => {
      expect(MEDIUM_PRESET.startingReputation).toBe(STARTING_REPUTATION);
    });

    it('should match WIN_THRESHOLD', () => {
      expect(MEDIUM_PRESET.winThreshold).toBe(WIN_THRESHOLD);
    });

    it('should match SYNERGY_BONUS_PER_NEIGHBOR', () => {
      expect(MEDIUM_PRESET.synergyBonusPerNeighbor).toBe(SYNERGY_BONUS_PER_NEIGHBOR);
    });

    it('should match REPUTATION_SCORE_MULTIPLIER', () => {
      expect(MEDIUM_PRESET.reputationScoreMultiplier).toBe(REPUTATION_SCORE_MULTIPLIER);
    });

    it('should match CHALLENGE_BONUS_POINTS', () => {
      expect(MEDIUM_PRESET.challengeBonusPoints).toBe(CHALLENGE_BONUS_POINTS);
    });

    it('should match DEFAULT_CHALLENGES_PER_RUN', () => {
      expect(MEDIUM_PRESET.challengesPerRun).toBe(DEFAULT_CHALLENGES_PER_RUN);
    });
  });

  describe('Easy preset is more generous than Medium', () => {
    it('should have more starting coins', () => {
      expect(EASY_PRESET.startingCoins).toBeGreaterThan(MEDIUM_PRESET.startingCoins);
    });

    it('should have more starting reputation', () => {
      expect(EASY_PRESET.startingReputation).toBeGreaterThan(MEDIUM_PRESET.startingReputation);
    });

    it('should have lower win threshold', () => {
      expect(EASY_PRESET.winThreshold).toBeLessThan(MEDIUM_PRESET.winThreshold);
    });

    it('should have higher synergy bonus per neighbor', () => {
      expect(EASY_PRESET.synergyBonusPerNeighbor).toBeGreaterThanOrEqual(
        MEDIUM_PRESET.synergyBonusPerNeighbor,
      );
    });

    it('should have fewer challenges per run', () => {
      expect(EASY_PRESET.challengesPerRun).toBeLessThan(MEDIUM_PRESET.challengesPerRun);
    });
  });

  describe('Hard preset is more challenging than Medium', () => {
    it('should have fewer starting coins', () => {
      expect(HARD_PRESET.startingCoins).toBeLessThan(MEDIUM_PRESET.startingCoins);
    });

    it('should have fewer starting reputation', () => {
      expect(HARD_PRESET.startingReputation).toBeLessThan(MEDIUM_PRESET.startingReputation);
    });

    it('should have higher win threshold', () => {
      expect(HARD_PRESET.winThreshold).toBeGreaterThan(MEDIUM_PRESET.winThreshold);
    });

    it('should have more challenges per run', () => {
      expect(HARD_PRESET.challengesPerRun).toBeGreaterThan(MEDIUM_PRESET.challengesPerRun);
    });
  });

  describe('positiveIncidentMultiplier across presets (US-21 AC#3)', () => {
    it('Easy should have a higher positiveIncidentMultiplier than Hard', () => {
      expect(EASY_PRESET.positiveIncidentMultiplier).toBeGreaterThan(
        HARD_PRESET.positiveIncidentMultiplier,
      );
    });

    it('all presets should have positiveIncidentMultiplier >= 1', () => {
      for (const preset of [EASY_PRESET, MEDIUM_PRESET, HARD_PRESET]) {
        expect(preset.positiveIncidentMultiplier).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('incident balance limits (CG-0MSL0OU1E005WFJB)', () => {
    describe('preset values', () => {
      it('Easy defines incidentRepeatSpacing=4 and incidentMaxStreak=2', () => {
        expect(EASY_PRESET.incidentRepeatSpacing).toBe(4);
        expect(EASY_PRESET.incidentMaxStreak).toBe(2);
      });

      it('Medium defines incidentRepeatSpacing=3 and incidentMaxStreak=2', () => {
        expect(MEDIUM_PRESET.incidentRepeatSpacing).toBe(3);
        expect(MEDIUM_PRESET.incidentMaxStreak).toBe(2);
      });

      it('Hard defines incidentRepeatSpacing=2 and incidentMaxStreak=3', () => {
        expect(HARD_PRESET.incidentRepeatSpacing).toBe(2);
        expect(HARD_PRESET.incidentMaxStreak).toBe(3);
      });

      it('Medium limits equal the engine defaults (backward-compat invariant)', () => {
        expect(MEDIUM_PRESET.incidentRepeatSpacing).toBe(DEFAULT_INCIDENT_REPEAT_SPACING);
        expect(MEDIUM_PRESET.incidentMaxStreak).toBe(DEFAULT_INCIDENT_MAX_STREAK);
      });
    });

    describe('setup wiring into state.incidentBalance', () => {
      it.each([
        ['Easy', 4, 2],
        ['Medium', 3, 2],
        ['Hard', 2, 3],
      ] as const)(
        '%s state.incidentBalance matches the preset limits (N=%i, M=%i)',
        (difficulty, n, m) => {
          const state = createTestState('wiring-' + difficulty, difficulty);
          expect(state.incidentBalance.repeatSpacing).toBe(n);
          expect(state.incidentBalance.maxStreak).toBe(m);
        },
      );
    });

    describe('seeded determinism per difficulty', () => {
      it('same seed + same difficulty => identical incident-queue name sequences', () => {
        for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
          const a = createTestState('incident-determ', difficulty);
          const b = createTestState('incident-determ', difficulty);
          expect(a.incidentQueue.map(c => c.name)).toEqual(b.incidentQueue.map(c => c.name));
        }
      });

      it('Medium incident-queue sequence is unchanged from default-limit behavior', () => {
        // Default (no difficulty) also resolves to the Medium preset; both use
        // N=3/M=2, so the seeded queue must be identical for the same seed.
        const medium = createTestState('medium-seq-invariant', 'Medium');
        const defaulted = createTestState('medium-seq-invariant');
        expect(medium.incidentQueue.map(c => c.name)).toEqual(
          defaulted.incidentQueue.map(c => c.name),
        );
      });
    });

    describe('omitted-field fallback (legacy saves)', () => {
      it('config missing the new fields falls back to defaults with no crash', () => {
        // structuredClone mirrors deserializeMainStreetState's restore path
        // (config: structuredClone(saved.config)); a save predating the
        // incident-limit feature lacks both fields.
        const legacyConfig = structuredClone(MEDIUM_PRESET) as unknown as Record<string, unknown>;
        delete legacyConfig.incidentRepeatSpacing;
        delete legacyConfig.incidentMaxStreak;
        const balance = createIncidentBalanceState({
          repeatSpacing: legacyConfig.incidentRepeatSpacing as number,
          maxStreak: legacyConfig.incidentMaxStreak as number,
        });
        expect(balance.repeatSpacing).toBe(DEFAULT_INCIDENT_REPEAT_SPACING);
        expect(balance.maxStreak).toBe(DEFAULT_INCIDENT_MAX_STREAK);
      });
    });
  });

  describe('getPreset()', () => {
    it('should return the correct preset for each difficulty name', () => {
      expect(getPreset('Easy')).toBe(EASY_PRESET);
      expect(getPreset('Medium')).toBe(MEDIUM_PRESET);
      expect(getPreset('Hard')).toBe(HARD_PRESET);
    });

    it('should default to Medium when undefined', () => {
      expect(getPreset(undefined)).toBe(MEDIUM_PRESET);
    });
  });
});

// ── Setup Integration Tests ─────────────────────────────────

describe('setupMainStreetGame with difficulty', () => {
  describe('default (no difficulty specified)', () => {
    it('should use Medium config', () => {
      const state = createTestState('default-test');
      expect(state.config).toBe(MEDIUM_PRESET);
      expect(state.config.difficultyName).toBe('Medium');
    });

    it('should have Medium starting coins', () => {
      const state = createTestState('default-test');
      expect(state.resourceBank.coins).toBe(MEDIUM_PRESET.startingCoins);
    });

    it('should have Medium starting reputation', () => {
      const state = createTestState('default-test');
      expect(state.resourceBank.reputation).toBe(MEDIUM_PRESET.startingReputation);
    });

    it('should select Medium challenge count', () => {
      const state = createTestState('default-test');
      expect(state.activeChallenges).toHaveLength(MEDIUM_PRESET.challengesPerRun);
    });
  });

  describe('Easy difficulty', () => {
    it('should use Easy config', () => {
      const state = createTestState('easy-test', 'Easy');
      expect(state.config).toBe(EASY_PRESET);
    });

    it('should have Easy starting coins', () => {
      const state = createTestState('easy-test', 'Easy');
      expect(state.resourceBank.coins).toBe(EASY_PRESET.startingCoins);
    });

    it('should have Easy starting reputation', () => {
      const state = createTestState('easy-test', 'Easy');
      expect(state.resourceBank.reputation).toBe(EASY_PRESET.startingReputation);
    });

    it('should select Easy challenge count', () => {
      const state = createTestState('easy-test', 'Easy');
      expect(state.activeChallenges).toHaveLength(EASY_PRESET.challengesPerRun);
    });
  });

  describe('Hard difficulty', () => {
    it('should use Hard config', () => {
      const state = createTestState('hard-test', 'Hard');
      expect(state.config).toBe(HARD_PRESET);
    });

    it('should have Hard starting coins', () => {
      const state = createTestState('hard-test', 'Hard');
      expect(state.resourceBank.coins).toBe(HARD_PRESET.startingCoins);
    });

    it('should have Hard starting reputation', () => {
      const state = createTestState('hard-test', 'Hard');
      expect(state.resourceBank.reputation).toBe(HARD_PRESET.startingReputation);
    });

    it('should select Hard challenge count', () => {
      const state = createTestState('hard-test', 'Hard');
      expect(state.activeChallenges).toHaveLength(HARD_PRESET.challengesPerRun);
    });
  });

  describe('seed determinism with difficulty', () => {
    it('should produce identical states for the same seed and difficulty', () => {
      const a = createTestState('determ-1', 'Hard');
      const b = createTestState('determ-1', 'Hard');
      expect(a.resourceBank.coins).toBe(b.resourceBank.coins);
      expect(a.resourceBank.reputation).toBe(b.resourceBank.reputation);
      expect(a.activeChallenges.map(c => c.challenge.id))
        .toEqual(b.activeChallenges.map(c => c.challenge.id));
    });

    it('should produce different challenge selections for different seeds', () => {
      // With enough seeds, at least one pair should differ
      const seeds = ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e'];
      const selections = seeds.map(s =>
        createTestState(s, 'Medium').activeChallenges.map(c => c.challenge.id).sort().join(','),
      );
      const unique = new Set(selections);
      expect(unique.size).toBeGreaterThan(1);
    });
  });
});

// ── Engine Integration Tests ────────────────────────────────

describe('Engine uses config values', () => {
  describe('computeScore', () => {
    it('should use config.reputationScoreMultiplier for Easy', () => {
      const state = createTestState('score-easy', 'Easy');
      state.resourceBank.coins = 10;
      state.resourceBank.reputation = 4;
      state.challengesCompleted = ['ch-1'];
      const expected =
        10 +
        4 * EASY_PRESET.reputationScoreMultiplier +
        1 * EASY_PRESET.challengeBonusPoints;
      expect(computeScore(state)).toBe(expected);
    });

    it('should use config.challengeBonusPoints for Hard', () => {
      const state = createTestState('score-hard', 'Hard');
      state.resourceBank.coins = 5;
      state.resourceBank.reputation = 2;
      state.challengesCompleted = ['ch-1', 'ch-2'];
      const expected =
        5 +
        2 * HARD_PRESET.reputationScoreMultiplier +
        2 * HARD_PRESET.challengeBonusPoints;
      expect(computeScore(state)).toBe(expected);
    });
  });

  describe('checkEndConditions uses config.winThreshold', () => {
    it('should not win below Easy winThreshold', () => {
      const state = createTestState('threshold-easy', 'Easy');
      state.phase = 'EndCheck';
      state.resourceBank.coins = EASY_PRESET.winThreshold - 50;
      state.resourceBank.reputation = 1;
      state.challengesCompleted = [];
      state.activeChallenges = [];
      const ended = checkEndConditions(state);
      // Default presets impose no turn limit (CG-0MSLXJCHH001DLIO), so a
      // sub-threshold score can never end the game via any reason.
      expect(ended).toBe(false);
    });

    it('should win when score meets Easy winThreshold', () => {
      const state = createTestState('threshold-easy-win', 'Easy');
      state.phase = 'EndCheck';
      state.resourceBank.coins = EASY_PRESET.winThreshold;
      state.resourceBank.reputation = 1;
      state.challengesCompleted = [];
      state.activeChallenges = [];
      const ended = checkEndConditions(state);
      expect(ended).toBe(true);
      expect(state.gameResult).toBe('win');
      expect(state.endReason).toBe('score_threshold');
    });

    it('should require higher score for Hard winThreshold', () => {
      const state = createTestState('threshold-hard', 'Hard');
      state.phase = 'EndCheck';
      // A score that would win on Easy but not on Hard
      state.resourceBank.coins = EASY_PRESET.winThreshold;
      state.resourceBank.reputation = 1;
      state.challengesCompleted = [];
      state.activeChallenges = [];
      checkEndConditions(state);
      // The score is EASY_PRESET.winThreshold + 1*5 = 125
      // That's below Hard's 180 threshold; no turn limit applies.
      expect(state.endReason).not.toBe('score_threshold');
    });
  });

  describe('no turn-based end conditions by default (CG-0MSLXJCHH001DLIO)', () => {
    it.each(['Easy', 'Medium', 'Hard'] as const)(
      '%s preset never ends via a turn-based reason over a 200-turn horizon',
      (difficulty) => {
        const state = createTestState('unlimited-horizon-' + difficulty, difficulty);
        // Keep the game structurally unable to end except via the turn limit:
        // coins >= 0 (no bankruptcy), rep > 0 (no reputation collapse), score
        // below winThreshold (no score_threshold), no active challenges.
        state.resourceBank.coins = 50;
        state.resourceBank.reputation = 5;
        state.challengesCompleted = [];
        state.activeChallenges = [];

        for (let turn = 1; turn <= 200; turn++) {
          state.turn = turn;
          state.phase = 'EndCheck';
          const ended = checkEndConditions(state);
          expect(ended, `ended at turn ${turn}`).toBe(false);
        }
        expect(state.gameResult).toBe('playing');
        expect(state.endReason).toBeNull();
      },
    );

    it('default presets have no maxTurns field (undefined = unlimited)', () => {
      for (const preset of [EASY_PRESET, MEDIUM_PRESET, HARD_PRESET]) {
        expect(preset.maxTurns).toBeUndefined();
      }
    });
  });

  describe('explicit maxTurns remains opt-in (CG-0MSLXJCHH001DLIO)', () => {
    it('ends via turn_limit_victory at exactly maxTurns when rep > 0 and coins >= 0', () => {
      const state = createTestState('explicit-limit');
      state.config = { ...state.config, maxTurns: 8 };
      state.phase = 'EndCheck';
      state.resourceBank.coins = 10;
      state.resourceBank.reputation = 3;
      state.challengesCompleted = [];
      state.activeChallenges = [];

      state.turn = 7;
      expect(checkEndConditions(state)).toBe(false);

      state.turn = 8;
      const ended = checkEndConditions(state);
      expect(ended).toBe(true);
      expect(state.gameResult).toBe('win');
      expect(state.endReason).toBe('turn_limit_victory');
    });

    it('ends via turn_exhaustion at maxTurns when the victory condition is not met', () => {
      const state = createTestState('explicit-limit-exhaust');
      state.config = { ...state.config, maxTurns: 1 };
      state.phase = 'EndCheck';
      state.turn = 1; // turn-1 guard: reputation collapse is not checked on turn 1
      state.resourceBank.coins = 10;
      state.resourceBank.reputation = 0; // <= 0: not a turn-limit victory
      state.challengesCompleted = [];
      state.activeChallenges = [];

      const ended = checkEndConditions(state);
      expect(ended).toBe(true);
      expect(state.gameResult).toBe('loss');
      expect(state.endReason).toBe('turn_exhaustion');
    });
  });
});

// ── Adjacency Integration Tests ─────────────────────────────

describe('Adjacency uses config.synergyBonusPerNeighbor', () => {
  it('should compute bonus of 1 per neighbor with SYNERGY_BONUS_PER_NEIGHBOR=1 (default)', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);
    grid[0] = makeTestBusiness({ id: 'a', synergyTypes: ['Food'] });
    grid[1] = makeTestBusiness({ id: 'b', synergyTypes: ['Food'] });
    // Default bonus = 1
    expect(computeSynergyBonus(grid, 0)).toBe(1);
    expect(computeSynergyBonus(grid, 1)).toBe(1);
  });

  it('should compute bonus of 2 per neighbor when bonusPerNeighbor=2', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);
    grid[0] = makeTestBusiness({ id: 'a', synergyTypes: ['Food'] });
    grid[1] = makeTestBusiness({ id: 'b', synergyTypes: ['Food'] });
    // Easy bonus = 2
    expect(computeSynergyBonus(grid, 0, 2)).toBe(2);
    expect(computeSynergyBonus(grid, 1, 2)).toBe(2);
  });

  it('should scale correctly with multiple neighbors', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);
    grid[5] = makeTestBusiness({ id: 'a', synergyTypes: ['Food'] });
    grid[6] = makeTestBusiness({ id: 'b', synergyTypes: ['Food'] });
    grid[7] = makeTestBusiness({ id: 'c', synergyTypes: ['Food'] });
    // Index 6 has two matching orthogonal neighbors (5 and 7)
    expect(computeSynergyBonus(grid, 6, 1)).toBe(2); // 2 neighbors * 1
    expect(computeSynergyBonus(grid, 6, 2)).toBe(4); // 2 neighbors * 2
  });
});

// ── Adapter Conformance Tests (CG-0MMJ8S9850MV4L0A) ────────

describe('Difficulty adapter conformance to core-engine generics', () => {
  it('GameConfig satisfies DifficultyConfig interface', () => {
    // Type-level conformance: GameConfig extends DifficultyConfig.
    // If this compiles, the structural subtype relationship holds.
    const config: GameConfig = MEDIUM_PRESET;
    const generic: DifficultyConfig = config;

    expect(generic.difficultyName).toBe('Medium');
  });

  it('all presets satisfy DifficultyConfig', () => {
    const presets: Readonly<GameConfig>[] = [EASY_PRESET, MEDIUM_PRESET, HARD_PRESET];
    for (const preset of presets) {
      const generic: DifficultyConfig = preset;
      expect(typeof generic.difficultyName).toBe('string');
      expect(generic.difficultyName.length).toBeGreaterThan(0);
    }
  });

  it('DIFFICULTY_PRESETS is assignable to DifficultyPresetRegistry<GameConfig>', () => {
    // Type-level conformance: the Main Street registry satisfies the generic registry type.
    const generic: DifficultyPresetRegistry<GameConfig> = DIFFICULTY_PRESETS;
    expect(Object.keys(generic)).toHaveLength(3);
  });

  it('createPresetLookup works with Main Street DIFFICULTY_PRESETS', () => {
    const lookup = createPresetLookup(DIFFICULTY_PRESETS, MEDIUM_PRESET);
    expect(lookup('Easy')).toBe(EASY_PRESET);
    expect(lookup('Medium')).toBe(MEDIUM_PRESET);
    expect(lookup('Hard')).toBe(HARD_PRESET);
    expect(lookup(undefined)).toBe(MEDIUM_PRESET);
    expect(lookup('Unknown')).toBe(MEDIUM_PRESET);
  });

  it('getPresetNames returns the same names as DIFFICULTY_NAMES', () => {
    const names = getPresetNames(DIFFICULTY_PRESETS);
    for (const dn of DIFFICULTY_NAMES) {
      expect(names).toContain(dn);
    }
    expect(names).toHaveLength(DIFFICULTY_NAMES.length);
  });

  it('getPreset and createPresetLookup produce equivalent results', () => {
    const lookup = createPresetLookup(DIFFICULTY_PRESETS, MEDIUM_PRESET);
    for (const name of DIFFICULTY_NAMES) {
      expect(lookup(name)).toBe(getPreset(name));
    }
    expect(lookup(undefined)).toBe(getPreset(undefined));
  });
});
