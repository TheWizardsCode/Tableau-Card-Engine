/**
 * Main Street: Banking-Aware AI Strategy Tests (CG-0MT3JMGA60091J8W)
 *
 * Contracts the additive `BankingGreedyStrategy` — the deliberate-hoarding
 * variant of the pure `GreedyStrategy` baseline:
 *   - `scoreBankOption()`: expected value of banking (visible + pipeline)
 *   - `BankingGreedyStrategy.chooseAction()`: bank vs. spend decision
 *   - Hoarding when a high-cost target is (nearly) affordable
 *   - Spending when no valuable future exists
 *   - Not over-hoarding at the bank cap
 *   - Respecting action-budget and legality constraints
 *   - Difficulty scaling (Easy hoards less than Hard)
 *   - Pipeline look-ahead (Hard sees deck targets, Easy does not)
 *
 * `GreedyStrategy` is asserted to remain the pure, never-banking baseline.
 *
 * @module tests/main-street/ai-banking-strategy
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  endTurnHeadless,
  executeAction,
  executeWeekStart,
} from '../../example-games/main-street/MainStreetEngine';
import {
  enumerateLegalActions,
  GreedyStrategy,
  BankingGreedyStrategy,
  RandomStrategy,
  scoreAction,
  scoreBankOption,
  aiPlanningHorizon,
  BANKING_DIFFICULTY_PROFILES,
  MainStreetAiPlayer,
} from '../../example-games/main-street/MainStreetAiStrategy';
import {
  ALL_STRATEGIES,
  runMonteCarlo,
} from '../../example-games/main-street/MainStreetMonteCarlo';
import type { BusinessCard, UpgradeCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'banking-ai-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeWeekStart(state);
  return state;
}

function makeRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function makeBusiness(overrides: Partial<BusinessCard> & Pick<BusinessCard, 'id' | 'name' | 'cost'>): BusinessCard {
  return {
    family: 'business',
    baseIncome: 1,
    synergyTypes: [],
    description: 'Test business.',
    maxLevel: 1,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    ...overrides,
  } as BusinessCard;
}

function makeUpgrade(
  overrides: Partial<UpgradeCard> & Pick<UpgradeCard, 'id' | 'name' | 'cost' | 'targetBusiness' | 'incomeBonus'>,
): UpgradeCard {
  return {
    family: 'upgrade',
    synergyRangeBonus: 0,
    description: 'Test upgrade.',
    requiredLevel: 0,
    ...overrides,
  } as UpgradeCard;
}

/**
 * Budgets the state down to a single-action turn with no banked reserve and
 * a known coin balance, then wipes visible cards so each test controls the
 * full decision surface.
 */
function resetDecisionSurface(state: MainStreetState, coins: number): void {
  state.bankedActions = 0;
  state.actionsRemaining = 1;
  state.resourceBank.coins = coins;
  state.resourceBank.reputation = 3;
  state.hand = [];
  state.market.cards = [];
  // Clear the pipeline so look-ahead is only what a test deliberately seeds.
  state.decks.business = [];
  state.decks.communitySpace = [];
  state.decks.upgrade = [];
  state.decks.event = [];
  state.decks.staff = [];
}

// ── AC1 · Additive strategy contract ────────────────────────

describe('AC1 · additive BankingGreedyStrategy', () => {
  it('exposes BankingGreedy as a distinct selectable name', () => {
    expect(BankingGreedyStrategy.name).toBe('BankingGreedy');
  });

  it('keeps GreedyStrategy as the unchanged pure baseline', () => {
    expect(GreedyStrategy.name).toBe('Greedy');
    expect(RandomStrategy.name).toBe('Random');
  });

  it('Greedy spends (never banks) on a hoard-trigger state where BankingGreedy banks', () => {
    const build = (): MainStreetState => {
      const state = createTestState('greedy-vs-banking');
      resetDecisionSurface(state, 1000);
      state.market.cards = [
        makeBusiness({ id: 'mega', name: 'Mega Mall', cost: 5000, baseIncome: 1000 }),
      ];
      return state;
    };

    const greedyState = build();
    const greedyAction = GreedyStrategy.chooseAction(greedyState, makeRng());
    expect(greedyAction.type).not.toBe('end-turn'); // baseline never hoards
    expect(greedyAction.type).toBe('move-to-hand'); // it locks the card in instead

    const bankingState = build();
    const bankingAction = BankingGreedyStrategy.chooseAction(bankingState, makeRng());
    expect(bankingAction.type).toBe('end-turn'); // deliberate hoard
    expect(bankingState.actionsRemaining).toBeGreaterThan(0);
  });

  it('RandomStrategy is unchanged (still returns a random legal action)', () => {
    const state = createTestState('random-unchanged');
    const legalTypes = new Set(enumerateLegalActions(state).map(a => a.type));

    for (let i = 0; i < 10; i++) {
      const action = RandomStrategy.chooseAction(state, makeRng(i));
      expect(legalTypes.has(action.type)).toBe(true);
    }
  });
});

// ── AC2 · Deliberate hoarding behaviour ─────────────────────

describe('AC2 · deliberate hoarding behaviour', () => {
  it('banks when a high-cost unaffordable target exists in the market', () => {
    const state = createTestState('hoard-high-cost');
    resetDecisionSurface(state, 1000);
    state.market.cards = [
      makeBusiness({ id: 'expensive-biz', name: 'Mega Mall', cost: 5000, baseIncome: 1000 }),
    ];

    const action = BankingGreedyStrategy.chooseAction(state, makeRng());
    expect(action.type).toBe('end-turn');
    expect(state.actionsRemaining).toBeGreaterThan(0); // still has actions → banking
  });

  it('spends when an affordable, high-value action is available', () => {
    const state = createTestState('spend-affordable');
    resetDecisionSurface(state, 20);
    state.market.cards = [
      makeUpgrade({ id: 'valuable-upgrade', name: 'Valuable Upgrade', cost: 3, targetBusiness: 'Bakery', incomeBonus: 50000 }),
    ];
    state.streetGrid[0] = makeBusiness({ id: 'bakery', name: 'Bakery', cost: 6, maxLevel: 2 });

    const action = BankingGreedyStrategy.chooseAction(state, makeRng());
    expect(action.type).toBe('buy-upgrade');
  });

  it('bank score is positive when the only target is unaffordable, zero when affordable', () => {
    const unaffordable = createTestState('bank-score');
    resetDecisionSurface(unaffordable, 10);
    unaffordable.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 20, baseIncome: 1000 }),
    ];
    expect(scoreBankOption(unaffordable)).toBeGreaterThan(0);

    const affordable = createTestState('bank-score-affordable');
    resetDecisionSurface(affordable, 100);
    affordable.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 20, baseIncome: 1000 }),
    ];
    expect(scoreBankOption(affordable)).toBe(0);
  });
});

// ── AC3 · Bank-cap handling (natural via heuristic) ─────────

describe('AC3 · bank-cap handling', () => {
  it('scores zero at the cap and starts spending', () => {
    const state = createTestState('cap');
    resetDecisionSurface(state, 20);
    state.bankedActions = 2; // at cap
    state.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 5000, baseIncome: 1000 }),
    ];
    expect(scoreBankOption(state)).toBe(0);

    state.market.cards = [
      makeUpgrade({ id: 'must-buy', name: 'Must Buy', cost: 5, targetBusiness: 'Bakery', incomeBonus: 100000 }),
    ];
    state.streetGrid[0] = makeBusiness({ id: 'bakery', name: 'Bakery', cost: 6, maxLevel: 2 });
    const action = BankingGreedyStrategy.chooseAction(state, makeRng());
    expect(action.type).toBe('buy-upgrade');
  });

  it('scores zero once the action budget is spent', () => {
    const state = createTestState('no-actions');
    resetDecisionSurface(state, 10);
    state.actionsRemaining = 0;
    state.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 20, baseIncome: 1000 }),
    ];
    expect(scoreBankOption(state)).toBe(0);
  });
});

// ── AC4 · Hybrid heuristic (visible + pipeline look-ahead) ──

describe('AC4 · hybrid banking heuristic', () => {
  it('banks for a visible unaffordable target, weighted by closeness', () => {
    const near = createTestState('visible-near');
    resetDecisionSurface(near, 15);
    near.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 18, baseIncome: 1000 }),
    ];

    const far = createTestState('visible-far');
    resetDecisionSurface(far, 15);
    far.market.cards = [
      makeBusiness({ id: 'far', name: 'Distant Dome', cost: 5000, baseIncome: 1000 }),
    ];

    const nearScore = scoreBankOption(near);
    const farScore = scoreBankOption(far);
    expect(nearScore).toBeGreaterThan(0);
    // A target almost in reach is worth waiting for; a distant one is not.
    expect(nearScore).toBeGreaterThan(farScore);
  });

  it('considers the planning horizon (early-game banking is worth more)', () => {
    const state = createTestState('horizon');
    resetDecisionSurface(state, 15);
    state.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 18, baseIncome: 1000 }),
    ];

    const earlyHorizon = aiPlanningHorizon(state);
    const earlyScore = scoreBankOption(state);

    // Push the score near the win threshold → short horizon → less banking value.
    state.resourceBank.coins = state.config.winThreshold;
    const lateHorizon = aiPlanningHorizon(state);
    const lateScore = scoreBankOption(state);

    expect(earlyHorizon).toBeGreaterThan(lateHorizon);
    expect(earlyScore).toBeGreaterThan(lateScore);
  });

  it('sees an unaffordable target sitting in the market pipeline (deck)', () => {
    const state = createTestState('pipeline');
    resetDecisionSurface(state, 15);
    // Single affordable, low-value visible card; the valuable target is only
    // in the business deck (end of array = next drawn).
    state.market.cards = [
      makeBusiness({ id: 'cheap', name: 'Small Shop', cost: 5, baseIncome: 0 }),
    ];
    state.decks.business = [
      makeBusiness({ id: 'pipeline-target', name: 'Pipeline Plaza', cost: 20, baseIncome: 1000 }),
    ];

    expect(scoreBankOption(state, 'Easy')).toBe(0); // Easy has no look-ahead
    expect(scoreBankOption(state, 'Medium')).toBeGreaterThan(0);
    expect(scoreBankOption(state, 'Hard')).toBeGreaterThan(0);
  });

  it('Hard lets the pipeline target drive a hoard that Easy spends through', () => {
    const build = (): MainStreetState => {
      const state = createTestState('pipeline-strategy');
      resetDecisionSurface(state, 15);
      state.market.cards = [
        makeBusiness({ id: 'cheap', name: 'Small Shop', cost: 5, baseIncome: 0 }),
      ];
      state.decks.business = [
        makeBusiness({ id: 'pipeline-target', name: 'Pipeline Plaza', cost: 20, baseIncome: 1000 }),
      ];
      return state;
    };

    const easyState = build();
    const hardState = build();
    // Same state, same decision surface — drive the strategy at each difficulty.
    const easyAction = BankingGreedyStrategyFor('Easy').chooseAction(easyState, makeRng());
    const hardAction = BankingGreedyStrategyFor('Hard').chooseAction(hardState, makeRng());

    expect(easyAction.type).not.toBe('end-turn'); // spends on the visible card
    expect(hardAction.type).toBe('end-turn'); // banks for the pipeline target
  });
});

/**
 * Returns the shared BankingGreedyStrategy with the state's configured
 * difficulty temporarily overridden — a tiny shim so a test can drive the
 * same strategy against two difficulty presets without duplicating it.
 */
function BankingGreedyStrategyFor(difficulty: 'Easy' | 'Medium' | 'Hard') {
  return {
    name: 'BankingGreedy',
    chooseAction(state: MainStreetState, rng: () => number) {
      const original = state.config.difficultyName;
      (state.config as { difficultyName: string }).difficultyName = difficulty;
      try {
        return BankingGreedyStrategy.chooseAction(state, rng);
      } finally {
        (state.config as { difficultyName: string }).difficultyName = original;
      }
    },
  };
}

// ── AC5 · Difficulty scaling ────────────────────────────────

describe('AC5 · difficulty scaling', () => {
  it('profiles gate look-ahead depth and aggressiveness monotonically', () => {
    expect(BANKING_DIFFICULTY_PROFILES.Easy.lookAheadDepth).toBe(0);
    expect(BANKING_DIFFICULTY_PROFILES.Medium.lookAheadDepth).toBeGreaterThan(
      BANKING_DIFFICULTY_PROFILES.Easy.lookAheadDepth,
    );
    expect(BANKING_DIFFICULTY_PROFILES.Hard.lookAheadDepth).toBeGreaterThan(
      BANKING_DIFFICULTY_PROFILES.Medium.lookAheadDepth,
    );
    expect(BANKING_DIFFICULTY_PROFILES.Easy.aggressiveness).toBeLessThan(
      BANKING_DIFFICULTY_PROFILES.Medium.aggressiveness,
    );
    expect(BANKING_DIFFICULTY_PROFILES.Hard.aggressiveness).toBeGreaterThan(
      BANKING_DIFFICULTY_PROFILES.Medium.aggressiveness,
    );
  });

  it('Easy hoards less than Hard given the same visible-target state', () => {
    const state = createTestState('difficulty-visible');
    resetDecisionSurface(state, 15);
    state.market.cards = [
      makeBusiness({ id: 'near', name: 'Near Nook', cost: 18, baseIncome: 1000 }),
    ];

    const easy = scoreBankOption(state, 'Easy');
    const medium = scoreBankOption(state, 'Medium');
    const hard = scoreBankOption(state, 'Hard');

    expect(easy).toBeLessThan(medium);
    expect(medium).toBeLessThan(hard);
  });

  it('Easy banks less than Hard across an identical pipeline-only state', () => {
    const state = createTestState('difficulty-pipeline');
    resetDecisionSurface(state, 15);
    state.decks.business = [
      makeBusiness({ id: 'pipeline-target', name: 'Pipeline Plaza', cost: 20, baseIncome: 1000 }),
    ];

    expect(scoreBankOption(state, 'Easy')).toBe(0);
    expect(scoreBankOption(state, 'Hard')).toBeGreaterThan(0);
  });
});

// ── AC6 · Deterministic scenario coverage ───────────────────

describe('AC6 · deterministic banking scenarios', () => {
  describe('(a) hoards when a high-cost target is unaffordable', () => {
    it('banks rather than wasting the action on an unaffordable-only market', () => {
      const state = createTestState('scenario-hoard');
      resetDecisionSurface(state, 1000);
      state.market.cards = [
        makeBusiness({ id: 'mega-biz', name: 'Mega Business', cost: 5000, baseIncome: 800, incomeBonus: 400 }),
      ];

      const action = BankingGreedyStrategy.chooseAction(state, makeRng());
      expect(action.type).toBe('end-turn');
      expect(state.actionsRemaining).toBeGreaterThan(0);
    });
  });

  describe('(b) spends when no valuable future target exists', () => {
    it('spends on an affordable upgrade when no future target is visible', () => {
      const state = createTestState('scenario-spend');
      resetDecisionSurface(state, 20);
      state.market.cards = [
        makeUpgrade({ id: 'good-upgrade', name: 'Good Upgrade', cost: 5, targetBusiness: 'Bakery', incomeBonus: 50000 }),
      ];
      state.streetGrid[0] = makeBusiness({ id: 'bakery-upgrade-target', name: 'Bakery', cost: 6, maxLevel: 2 });

      const action = BankingGreedyStrategy.chooseAction(state, makeRng());
      expect(action.type).toBe('buy-upgrade');
    });
  });

  describe('(c) does not over-hoard (banks toward cap then spends)', () => {
    it('spends when the bank is already at the cap', () => {
      const state = createTestState('scenario-cap');
      resetDecisionSurface(state, 20);
      state.bankedActions = 2;
      state.market.cards = [
        makeUpgrade({ id: 'must-buy', name: 'Must Buy Upgrade', cost: 5, targetBusiness: 'Bakery', incomeBonus: 4 }),
      ];
      state.streetGrid[0] = makeBusiness({ id: 'bakery-must-buy', name: 'Bakery', cost: 6, maxLevel: 2 });

      const action = BankingGreedyStrategy.chooseAction(state, makeRng());
      expect(action.type).toBe('buy-upgrade');
    });
  });

  describe('(d) respects action-budget limits and legality', () => {
    it('never chooses a non-legal action across many trials', () => {
      const state = createTestState('scenario-budget');
      resetDecisionSurface(state, 15);

      for (let i = 0; i < 50; i++) {
        const action = BankingGreedyStrategy.chooseAction(state, makeRng(i));
        expect(action).toBeDefined();
        const legal = enumerateLegalActions(state);
        expect(legal.some(a => a.type === action.type)).toBe(true);
      }
    });

    it('completes a full game without violating the action budget', () => {
      const state = setupMainStreetGame({ seed: 'scenario-budget-game' });
      const player = new MainStreetAiPlayer(BankingGreedyStrategy, makeRng());
      expect(() => player.playGame(state)).not.toThrow();
      expect(['win', 'loss']).toContain(state.gameResult);
    });

    it('does not loop forever across multi-day cycles', () => {
      const state = setupMainStreetGame({ seed: 'scenario-no-loop' });
      const player = new MainStreetAiPlayer(BankingGreedyStrategy, makeRng());

      let turnCount = 0;
      const maxTurns = 100;
      while (state.gameResult === 'playing' && turnCount < maxTurns) {
        executeWeekStart(state);
        let action = player.chooseAction(state);
        let actionsInTurn = 0;
        while (action.type !== 'end-turn' && state.gameResult === 'playing' && actionsInTurn < 10) {
          executeAction(state, action);
          action = player.chooseAction(state);
          actionsInTurn++;
        }
        endTurnHeadless(state);
        turnCount++;
      }

      expect(turnCount).toBeLessThanOrEqual(maxTurns);
      expect(state.gameResult).not.toBe('playing');
    });
  });

  describe('(e) difficulty scaling', () => {
    it('Easy hoards less than Hard given the same state', () => {
      const state = createTestState('scenario-difficulty');
      resetDecisionSurface(state, 15);
      state.market.cards = [
        makeBusiness({ id: 'near', name: 'Near Nook', cost: 18, baseIncome: 1000 }),
      ];

      expect(scoreBankOption(state, 'Easy')).toBeLessThan(scoreBankOption(state, 'Hard'));
    });
  });
});

// ── Monte Carlo harness integration ─────────────────────────

describe('Monte Carlo harness integration', () => {
  it('registers banking-greedy as a distinct strategy', () => {
    expect(ALL_STRATEGIES).toContain('banking-greedy');
    expect(ALL_STRATEGIES).toContain('greedy');
  });

  it('runs the banking-greedy variant end-to-end', () => {
    const seeds = ['monte-bank-1', 'monte-bank-2', 'monte-bank-3'];
    const result = runMonteCarlo({ seeds, strategy: 'banking-greedy' });

    expect(result.metrics.runs).toBe(3);
    expect(result.runs).toHaveLength(3);
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(1);
  });

  it('completes many banking-greedy runs without error', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `banking-seed-${i}`);
    expect(() => runMonteCarlo({ seeds, strategy: 'banking-greedy' })).not.toThrow();
  });

  it('keeps the greedy baseline runnable alongside banking-greedy', () => {
    const seeds = ['baseline-1', 'baseline-2'];
    expect(() => runMonteCarlo({ seeds, strategy: 'greedy' })).not.toThrow();
  });
});

// ── Determinism ─────────────────────────────────────────────

describe('determinism', () => {
  it('produces the same action for the same seed and state', () => {
    const makeState = (): MainStreetState => {
      const state = createTestState('determinism');
      resetDecisionSurface(state, 15);
      state.market.cards = [
        makeBusiness({ id: 'near', name: 'Near Nook', cost: 18, baseIncome: 1000 }),
      ];
      return state;
    };

    const action1 = BankingGreedyStrategy.chooseAction(makeState(), makeRng(42));
    const action2 = BankingGreedyStrategy.chooseAction(makeState(), makeRng(42));
    expect(action1.type).toBe(action2.type);
  });

  it('scoreAction returns 0 for end-turn (banking delegates to the spend chain)', () => {
    const state = createTestState('score-end-turn');
    expect(scoreAction(state, { type: 'end-turn' })).toBe(0);
  });
});
