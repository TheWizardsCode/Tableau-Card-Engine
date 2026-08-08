import { createSeededRng } from '../../src/core-engine';
import { setupMainStreetGame, seedToNumber, type MainStreetState } from './MainStreetState';
import { executeAction, executeDayStart, processEndOfTurn, type PlayerAction } from './MainStreetEngine';
import { canPurchaseEvent, getAffordableBusinessCards, getAffordableUpgradeCards, getEmptySlots } from './MainStreetMarket';
import { GreedyStrategy, RandomStrategy, MainStreetAiPlayer } from './MainStreetAiStrategy';
import { DIFFICULTY_NAMES } from './MainStreetDifficulty';
import type { DifficultyName } from './MainStreetDifficulty';

export interface MonteCarloRunSummary {
  seed: string;
  result: 'win' | 'loss';
  endReason: string;
  finalScore: number;
  finalCoins: number;
  turns: number;
  turnWhenGridHalf: number | null;
  turnWhenGridFull: number | null;
  noActionTurns: number;
  /** Card IDs purchased during the run (business, event, and upgrade cards). */
  cardsOwned: string[];
  /** Card IDs that appeared in the market (offered for purchase) across all turns. */
  marketOffers: string[];
  /**
   * Turn-by-turn economy history recorded after each economy mutation.
   * Each entry contains a sequence number (turn), coins, reputation, and score
   * at that point. Captured via EconomyLedger.getHistory() at run end.
   */
  economyHistory: Array<{ turn: number; coins: number; reputation: number; score: number }>;
}

export interface MonteCarloMetrics {
  runs: number;
  wins: number;
  losses: number;
  winRate: number;
  medianScore: number;
  averageScore: number;
  averageCoinsPerTurn: number;
  averageTurns: number;
  averageNoActionTurns: number;
  averageTurnWhenGridHalf: number | null;
  averageTurnWhenGridFull: number | null;
  lossReasons: Record<string, number>;
  lossReasonRates: Record<string, number>;
}

export interface MonteCarloResult {
  metrics: MonteCarloMetrics;
  runs: MonteCarloRunSummary[];
}

export interface RunMonteCarloOptions {
  seeds: readonly string[];
  maxTurns?: number;
  strategy?: MonteCarloStrategy;
}

export type MonteCarloStrategy = 'market-greedy' | 'demo-greedy' | 'greedy' | 'random';

/** All available Monte Carlo strategies. */
export const ALL_STRATEGIES: readonly MonteCarloStrategy[] = [
  'market-greedy',
  'demo-greedy',
  'greedy',
  'random',
];

/** All available difficulty levels. */
export const ALL_DIFFICULTIES: readonly DifficultyName[] = DIFFICULTY_NAMES;

/**
 * Result of running Monte Carlo for a single strategy×difficulty combination.
 */
export interface CombinationResult {
  /** The strategy used for this combination. */
  strategy: MonteCarloStrategy;
  /** The difficulty level used for this combination. */
  difficulty: DifficultyName;
  /** Aggregate metrics across all runs. */
  metrics: MonteCarloMetrics;
  /** Per-run summaries for all seeds. */
  runs: MonteCarloRunSummary[];
}

/**
 * Options for `runAllCombinations()`.
 */
export interface RunAllCombinationsOptions {
  /** Seeds to run for each combination. */
  seeds: readonly string[];
  /** Max turns per seed (default: 30). */
  maxTurns?: number;
  /**
   * Optional filter: only run these strategies.
   * Defaults to all strategies if omitted.
   */
  strategies?: readonly MonteCarloStrategy[];
  /**
   * Optional filter: only run these difficulties.
   * Defaults to all difficulties if omitted.
   */
  difficulties?: readonly DifficultyName[];
}

function chooseMarketGreedyActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];

  const emptySlots = getEmptySlots(state);
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);

  if (affordable.length > 0 && emptySlots.length > 0) {
    const card = affordable[0];
    const slot = emptySlots[0];
    actions.push({ type: 'buy-business', cardId: card.id, slotIndex: slot });
  }

  actions.push({ type: 'end-turn' });
  return actions;
}

function chooseDemoGreedyActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];

  const emptySlots = getEmptySlots(state);
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);

  for (const card of affordable) {
    if (emptySlots.length === 0) break;
    if (state.resourceBank.coins < card.cost) break;
    const slot = emptySlots.shift()!;
    actions.push({ type: 'buy-business', cardId: card.id, slotIndex: slot });
    break;
  }

  if ((state.hand ?? []).some(c => c.family === 'event')) {
    actions.push({ type: 'play-event' });
  }

  for (const card of state.market.investments) {
    if (card.family !== 'event') continue;
    const result = canPurchaseEvent(state, card.id);
    if (result.legal) {
      actions.push({ type: 'buy-event', cardId: card.id });
      break;
    }
  }

  const upgrades = getAffordableUpgradeCards(state);
  if (upgrades.length > 0) {
    const upg = upgrades[0];
    const matchSlot = state.streetGrid.findIndex(
      b => b !== null && b.upgradePath === upg.targetBusiness && b.level < b.maxLevel,
    );
    if (matchSlot >= 0) {
      actions.push({ type: 'buy-upgrade', cardId: upg.id, targetSlot: matchSlot });
    }
  }

  actions.push({ type: 'end-turn' });
  return actions;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function chooseActionsForStrategy(state: MainStreetState, strategy: MonteCarloStrategy): PlayerAction[] {
  if (strategy === 'demo-greedy') {
    return chooseDemoGreedyActions(state);
  }
  return chooseMarketGreedyActions(state);
}

/**
 * Creates a `MainStreetAiPlayer` bound to the named strategy and a deterministic
 * RNG derived from the run seed.  Returns a `MainStreetAiPlayer` for `greedy` and
 * `random` strategies, or `null` for legacy harness strategies (`market-greedy`,
 * `demo-greedy`) that use their own action choosers.
 */
function createAiPlayerForStrategy(strategy: MonteCarloStrategy, seed: string): MainStreetAiPlayer | null {
  if (strategy === 'greedy') {
    return new MainStreetAiPlayer(GreedyStrategy, createSeededRng(seedToNumber(`${seed}-ai`)));
  }
  if (strategy === 'random') {
    return new MainStreetAiPlayer(RandomStrategy, createSeededRng(seedToNumber(`${seed}-ai`)));
  }
  return null;
}

function runSeed(seed: string, maxTurns: number, strategy: MonteCarloStrategy): MonteCarloRunSummary {
  const state = setupMainStreetGame({ seed });
  const aiPlayer = createAiPlayerForStrategy(strategy, seed);

  let turns = 0;
  let noActionTurns = 0;
  let turnWhenGridHalf: number | null = null;
  let turnWhenGridFull: number | null = null;
  /** Card IDs purchased during this run. */
  const cardsOwned: string[] = [];
  /** Set of card IDs seen in the market (across all turns). No duplicates. */
  const marketOfferSet = new Set<string>();

  while (state.gameResult === 'playing' && turns < maxTurns) {
    executeDayStart(state);

    // Record all card IDs currently in the market as offers for this turn.
    for (const card of state.market.development) {
      marketOfferSet.add(card.id);
    }
    for (const card of state.market.investments) {
      marketOfferSet.add(card.id);
    }

    let executedAction = false;

    if (aiPlayer !== null) {
      // AI strategy: choose actions one at a time until end-turn or game ends.
      let action = aiPlayer.chooseAction(state);
      while (action.type !== 'end-turn' && state.gameResult === 'playing') {
        // Track purchases before executing the action.
        if (action.type === 'buy-business' || action.type === 'buy-upgrade' || action.type === 'buy-event') {
          cardsOwned.push(action.cardId);
        }
        executeAction(state, action);
        executedAction = true;
        // Record AI action in transcript (if recorder is present)
        try {
          // recordMainStreetEvent is imported lazily to avoid circular deps when not present
           
          const { recordMainStreetEvent } = require('./MainStreetTranscript');
          recordMainStreetEvent({ type: 'ai-action', turn: state.turn, strategy: aiPlayer.strategy.name, action });
        } catch (_) {
          // ignore if recorder not wired
        }
        action = aiPlayer.chooseAction(state);
      }
    } else {
      // Legacy harness strategies: plan a list of actions upfront.
      const planned = chooseActionsForStrategy(state, strategy);
      for (const action of planned) {
        if (action.type === 'end-turn') break;
        // Track purchases before executing the action.
        if (action.type === 'buy-business' || action.type === 'buy-upgrade' || action.type === 'buy-event') {
          cardsOwned.push(action.cardId);
        }
        try {
          executeAction(state, action);
          executedAction = true;
        } catch {
          // Ignore illegal actions selected by legacy strategy.
        }
      }
    }

    if (!executedAction) {
      noActionTurns++;
    }

    processEndOfTurn(state);
    turns++;

    const occupied = state.streetGrid.filter(slot => slot !== null).length;
    if (turnWhenGridHalf === null && occupied >= 5) {
      turnWhenGridHalf = turns;
    }
    if (turnWhenGridFull === null && occupied >= 10) {
      turnWhenGridFull = turns;
    }
  }

  const result = state.gameResult === 'playing' ? 'loss' : state.gameResult;
  const endReason = state.gameResult === 'playing' ? 'max_turns_cap' : (state.endReason ?? 'unknown');

  return {
    seed,
    result,
    endReason,
    finalScore: state.finalScore,
    finalCoins: state.resourceBank.coins,
    turns,
    turnWhenGridHalf,
    turnWhenGridFull,
    noActionTurns,
    cardsOwned,
    marketOffers: [...marketOfferSet],
    economyHistory: [...state.ledger.getHistory()],
  };
}

export function runMonteCarlo(options: RunMonteCarloOptions): MonteCarloResult {
  const maxTurns = options.maxTurns ?? 30;
  const strategy = options.strategy ?? 'market-greedy';
  const runs = options.seeds.map(seed => runSeed(seed, maxTurns, strategy));

  const wins = runs.filter(run => run.result === 'win').length;
  const losses = runs.length - wins;

  const lossReasons: Record<string, number> = {};
  for (const run of runs) {
    if (run.result !== 'loss') continue;
    lossReasons[run.endReason] = (lossReasons[run.endReason] ?? 0) + 1;
  }

  const lossReasonRates: Record<string, number> = {};
  for (const [reason, count] of Object.entries(lossReasons)) {
    lossReasonRates[reason] = losses > 0 ? count / losses : 0;
  }

  const metrics = computeMetrics(runs);
  return { metrics, runs };
}

/**
 * Runs Monte Carlo simulations for all strategy×difficulty combinations
 * (default: 4 strategies × 3 difficulties = 12 combos).
 *
 * Accepts optional `strategies` and `difficulties` filters to run a subset.
 *
 * @param options  Seeds, max turns, and optional strategy/difficulty filters.
 * @returns Array of `CombinationResult` for each combination.
 */
export function runAllCombinations(options: RunAllCombinationsOptions): CombinationResult[] {
  const maxTurns = options.maxTurns ?? 30;
  const strategies = options.strategies ?? ALL_STRATEGIES;
  const difficulties = options.difficulties ?? ALL_DIFFICULTIES;

  const results: CombinationResult[] = [];

  for (const strategy of strategies) {
    for (const difficulty of difficulties) {
      const runs = options.seeds.map(seed => runSeedWithDifficulty(seed, maxTurns, strategy, difficulty));
      const metrics = computeMetrics(runs);
      results.push({ strategy, difficulty, metrics, runs });
    }
  }

  return results;
}

/**
 * Runs a single seed with a specific difficulty preset.
 */
function runSeedWithDifficulty(
  seed: string,
  maxTurns: number,
  strategy: MonteCarloStrategy,
  difficulty: DifficultyName,
): MonteCarloRunSummary {
  const state = setupMainStreetGame({ seed, difficulty });
  const aiPlayer = createAiPlayerForStrategy(strategy, seed);

  let turns = 0;
  let noActionTurns = 0;
  let turnWhenGridHalf: number | null = null;
  let turnWhenGridFull: number | null = null;
  const cardsOwned: string[] = [];
  const marketOfferSet = new Set<string>();

  while (state.gameResult === 'playing' && turns < maxTurns) {
    executeDayStart(state);

    for (const card of state.market.development) {
      marketOfferSet.add(card.id);
    }
    for (const card of state.market.investments) {
      marketOfferSet.add(card.id);
    }

    let executedAction = false;

    if (aiPlayer !== null) {
      let action = aiPlayer.chooseAction(state);
      while (action.type !== 'end-turn' && state.gameResult === 'playing') {
        if (action.type === 'buy-business' || action.type === 'buy-upgrade' || action.type === 'buy-event') {
          cardsOwned.push(action.cardId);
        }
        executeAction(state, action);
        executedAction = true;
        try {
          const { recordMainStreetEvent } = require('./MainStreetTranscript');
          recordMainStreetEvent({ type: 'ai-action', turn: state.turn, strategy: aiPlayer.strategy.name, action });
        } catch (_) {
          // ignore if recorder not wired
        }
        action = aiPlayer.chooseAction(state);
      }
    } else {
      const planned = chooseActionsForStrategy(state, strategy);
      for (const action of planned) {
        if (action.type === 'end-turn') break;
        if (action.type === 'buy-business' || action.type === 'buy-upgrade' || action.type === 'buy-event') {
          cardsOwned.push(action.cardId);
        }
        try {
          executeAction(state, action);
          executedAction = true;
        } catch {
          // ignore
        }
      }
    }

    if (!executedAction) {
      noActionTurns++;
    }

    processEndOfTurn(state);
    turns++;

    const occupied = state.streetGrid.filter(slot => slot !== null).length;
    if (turnWhenGridHalf === null && occupied >= 5) {
      turnWhenGridHalf = turns;
    }
    if (turnWhenGridFull === null && occupied >= 10) {
      turnWhenGridFull = turns;
    }
  }

  const result = state.gameResult === 'playing' ? 'loss' : state.gameResult;
  const endReason = state.gameResult === 'playing' ? 'max_turns_cap' : (state.endReason ?? 'unknown');

  return {
    seed,
    result,
    endReason,
    finalScore: state.finalScore,
    finalCoins: state.resourceBank.coins,
    turns,
    turnWhenGridHalf,
    turnWhenGridFull,
    noActionTurns,
    cardsOwned,
    marketOffers: [...marketOfferSet],
    economyHistory: [...state.ledger.getHistory()],
  };
}

/**
 * Computes aggregate metrics from an array of run summaries.
 * Extracted to share between `runMonteCarlo()` and `runAllCombinations()`.
 */
function computeMetrics(runs: MonteCarloRunSummary[]): MonteCarloMetrics {
  const wins = runs.filter(run => run.result === 'win').length;
  const losses = runs.length - wins;

  const lossReasons: Record<string, number> = {};
  for (const run of runs) {
    if (run.result !== 'loss') continue;
    lossReasons[run.endReason] = (lossReasons[run.endReason] ?? 0) + 1;
  }

  const lossReasonRates: Record<string, number> = {};
  for (const [reason, count] of Object.entries(lossReasons)) {
    lossReasonRates[reason] = losses > 0 ? count / losses : 0;
  }

  const metrics: MonteCarloMetrics = {
    runs: runs.length,
    wins,
    losses,
    winRate: runs.length > 0 ? wins / runs.length : 0,
    medianScore: median(runs.map(run => run.finalScore)),
    averageScore: average(runs.map(run => run.finalScore)),
    averageCoinsPerTurn: average(
      runs.map(run => (run.turns > 0 ? run.finalCoins / run.turns : 0)),
    ),
    averageTurns: average(runs.map(run => run.turns)),
    averageNoActionTurns: average(runs.map(run => run.noActionTurns)),
    averageTurnWhenGridHalf: average(
      runs.map(run => run.turnWhenGridHalf).filter((v): v is number => v !== null),
    ),
    averageTurnWhenGridFull: average(
      runs.map(run => run.turnWhenGridFull).filter((v): v is number => v !== null),
    ),
    lossReasons,
    lossReasonRates,
  };

  if (!runs.some(run => run.turnWhenGridHalf !== null)) {
    metrics.averageTurnWhenGridHalf = null;
  }
  if (!runs.some(run => run.turnWhenGridFull !== null)) {
    metrics.averageTurnWhenGridFull = null;
  }

  return metrics;
}

export function toCsv(runs: readonly MonteCarloRunSummary[]): string {
  const header = [
    'seed',
    'result',
    'endReason',
    'finalScore',
    'finalCoins',
    'turns',
    'turnWhenGridHalf',
    'turnWhenGridFull',
    'noActionTurns',
  ];
  const rows = runs.map(run => [
    run.seed,
    run.result,
    run.endReason,
    String(run.finalScore),
    String(run.finalCoins),
    String(run.turns),
    run.turnWhenGridHalf === null ? '' : String(run.turnWhenGridHalf),
    run.turnWhenGridFull === null ? '' : String(run.turnWhenGridFull),
    String(run.noActionTurns),
  ]);
  return [header.join(','), ...rows.map(row => row.join(','))].join('\n');
}
