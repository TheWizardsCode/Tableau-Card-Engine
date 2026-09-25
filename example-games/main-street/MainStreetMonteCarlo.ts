import { createSeededRng } from '@core-engine';
import { setupMainStreetGame, createCompetitiveState, seedToNumber, type MainStreetState } from './MainStreetState';
import { executeAction, executeWeekStart, executeCompetitiveWeekStart, endCompetitiveMarketTurn, resolveCompetitiveClosingPhases, resolveCompetitivePendingChoice, processEndOfTurn, type PlayerAction } from './MainStreetEngine';
import { canPurchaseEvent, getAffordableBusinessCards, getAffordableUpgradeCards, getEmptySlots } from './MainStreetMarket';
import { GreedyStrategy, BankingGreedyStrategy, RandomStrategy, MainStreetAiPlayer, resolveAiEventChoice, bindCompetitiveSeat, restoreCompetitiveSeat, CompetitiveGreedyStrategy, type MainStreetAiStrategy } from './MainStreetAiStrategy';
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

export type MonteCarloStrategy = 'market-greedy' | 'demo-greedy' | 'greedy' | 'banking-greedy' | 'random';

/** All available Monte Carlo strategies. */
export const ALL_STRATEGIES: readonly MonteCarloStrategy[] = [
  'market-greedy',
  'demo-greedy',
  'greedy',
  'banking-greedy',
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
  /** Max turns per seed (default: 60). */
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

/**
 * Legacy `demo-greedy` turn planner.
 *
 * Builds the whole turn's action list upfront, so it tracks the daily action
 * budget itself: every action it plans except `end-turn` consumes one action
 * (CG-0MSTOF1N5005PK2R / CG-0MT40HTYN008TJ6Q — `buy-upgrade` included, as the
 * headless equivalent of the same-week click composite). Once the budget is
 * committed the planner stops, so a plan can never over-commit actions that
 * the engine would then reject.
 *
 * Exported for budget-accounting tests.
 *
 * @param state Current game state (read-only by convention).
 * @returns The planned actions for this turn, always ending with `end-turn`.
 */
export function chooseDemoGreedyActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];

  // Daily action budget available to this plan. Every planned action below
  // (except end-turn) spends one.
  let actionBudget = state.actionsRemaining ?? 1;
  const spendAction = (): boolean => {
    if (actionBudget <= 0) return false;
    actionBudget -= 1;
    return true;
  };

  const emptySlots = getEmptySlots(state);
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);

  for (const card of affordable) {
    if (emptySlots.length === 0) break;
    if (state.resourceBank.coins < card.cost) break;
    if (!spendAction()) break;
    const slot = emptySlots.shift()!;
    actions.push({ type: 'buy-business', cardId: card.id, slotIndex: slot });
    break;
  }

  if ((state.hand ?? []).some(c => c.family === 'event') && spendAction()) {
    actions.push({ type: 'play-event' });
  }

  for (const card of state.market.cards) {
    if (card.family !== 'event') continue;
    const result = canPurchaseEvent(state, card.id);
    if (result.legal && spendAction()) {
      actions.push({ type: 'buy-event', cardId: card.id });
      break;
    }
  }

  const upgrades = getAffordableUpgradeCards(state);
  if (upgrades.length > 0 && actionBudget > 0) {
    const upg = upgrades[0];
    const matchSlot = state.streetGrid.findIndex(
      b => b !== null && b.upgradePath === upg.targetBusiness && b.level < b.maxLevel,
    );
    if (matchSlot >= 0 && spendAction()) {
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
 * RNG derived from the run seed.  Returns a `MainStreetAiPlayer` for the AI
 * strategies (`greedy`, `banking-greedy`, `random`), or `null` for legacy
 * harness strategies (`market-greedy`, `demo-greedy`) that use their own
 * action choosers.
 */
function createAiPlayerForStrategy(strategy: MonteCarloStrategy, seed: string): MainStreetAiPlayer | null {
  if (strategy === 'greedy') {
    return new MainStreetAiPlayer(GreedyStrategy, createSeededRng(seedToNumber(`${seed}-ai`)));
  }
  if (strategy === 'banking-greedy') {
    return new MainStreetAiPlayer(BankingGreedyStrategy, createSeededRng(seedToNumber(`${seed}-ai`)));
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
    executeWeekStart(state);

    // Record all card IDs currently in the market as offers for this turn.
    for (const card of state.market.cards) {
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

    const turnResult = processEndOfTurn(state);
    // Dual-choice incident (CG-0MTSHG8RP008E128): resolve any pending choice
    // per the AI difficulty strategy so the sim never stalls.
    if (turnResult.choicePending) {
      resolveAiEventChoice(state);
    }
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
 * Default harness termination cap for Monte Carlo runs (CG-0MSLXJCHH001DLIO).
 *
 * This is a harness-only guard, not a game mechanic: default presets impose
 * no turn limit, so simulations need an explicit bound to terminate
 * deterministically. 60 turns is generous enough that market-greedy runs on
 * Medium reach a definite result (score threshold, bankruptcy, or reputation
 * collapse) before the cap; see the balance guardrail tests.
 */
const DEFAULT_MONTE_CARLO_MAX_TURNS = 60;

export function runMonteCarlo(options: RunMonteCarloOptions): MonteCarloResult {
  const maxTurns = options.maxTurns ?? DEFAULT_MONTE_CARLO_MAX_TURNS;
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
  const maxTurns = options.maxTurns ?? DEFAULT_MONTE_CARLO_MAX_TURNS;
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
    executeWeekStart(state);

    for (const card of state.market.cards) {
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

    const turnResult = processEndOfTurn(state);
    // Dual-choice incident (CG-0MTSHG8RP008E128): resolve any pending choice
    // per the AI difficulty strategy so the sim never stalls.
    if (turnResult.choicePending) {
      resolveAiEventChoice(state);
    }
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

// ── Competitive head-to-head harness (CG-0MTIILDBB001F01S) ─────────
//
// Extends this module (never replaces): the single-player `runMonteCarlo` /
// `runAllCombinations` stay untouched (AC3). The head-to-head harness runs a
// shared-day competitive game per seed — every player alternates MarketPhases
// within each day (Option A), then the shared closing phases resolve once.
// Per-seed determinism comes from the state seed (deck/incident order) plus
// per-player seeded AI RNGs, so the same seed reproduces identical per-owner
// outcomes (AC1). Each seed's per-player summaries feed win/score
// distributions and per-player diagnostics (AC2). The harness is validated
// against the ownership-aware competitive AI (AC4) and is N-player-ready via
// a per-player strategy list (default head-to-head: player 0 vs 1).

/** Per-player outcome of a single competitive run. */
export interface CompetitivePlayerRunSummary {
  /** Owner index (index into the run's strategy list). */
  playerId: number;
  /** Outcome for this player within the run. */
  result: 'win' | 'loss' | 'draw';
  /** Final per-player score at run end. */
  finalScore: number;
  /** Final per-player coins. */
  finalCoins: number;
  /** Final per-player reputation. */
  finalReputation: number;
  /**
   * Why the player lost ('' for wins/draws): 'outraced' (opponent hit the
   * threshold first), 'bankruptcy', 'reputation_collapse', 'max_turns_cap',
   * or the engine's endReason (e.g. 'turn_exhaustion').
   */
  lossReason: string;
  /** Card IDs the player acquired (buy-business / buy-upgrade / buy-event). */
  cardsOwned: string[];
}

/** Summary of a single competitive head-to-head run. */
export interface CompetitiveRunSummary {
  /** The seed this run was executed with. */
  seed: string;
  /** Winning owner index, or null on a draw / no winner. */
  winnerId: number | null;
  /** How the run ended: engine endReason, 'max_turns_cap', or 'unknown'. */
  endReason: string;
  /** Number of shared days executed before termination. */
  turns: number;
  /** Per-player summaries (length = playerCount). */
  players: CompetitivePlayerRunSummary[];
}

/** Aggregate metrics for a single owner across a batch of seeds. */
export interface CompetitivePerPlayerMetrics {
  playerId: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  medianScore: number;
  averageScore: number;
  averageCoins: number;
  lossReasons: Record<string, number>;
  lossReasonRates: Record<string, number>;
}

/** Aggregate competitive metrics across all seeds. */
export interface CompetitiveMonteCarloMetrics {
  /** Number of seeds run. */
  runs: number;
  /** Number of runs that ended in a draw (tie at the turn cap). */
  draws: number;
  averageTurns: number;
  /** Distribution of run end reasons across all runs. */
  endReasons: Record<string, number>;
  /** Per-owner metrics (length = playerCount). */
  players: CompetitivePerPlayerMetrics[];
}

/** Result of a competitive Monte Carlo batch. */
export interface CompetitiveMonteCarloResult {
  metrics: CompetitiveMonteCarloMetrics;
  runs: CompetitiveRunSummary[];
}

/** Options for the competitive head-to-head harness. */
export interface RunCompetitiveMonteCarloOptions {
  /** Seeds to run. */
  seeds: readonly string[];
  /** Harness-only turn cap per run (default 40 shared days). */
  maxTurns?: number;
  /**
   * Strategy per player (length = playerCount). Defaults to
   * `CompetitiveGreedyStrategy` for every player.
   */
  strategies?: readonly MainStreetAiStrategy[];
  /** Number of players (default 2 — head-to-head; N>2 via longer list). */
  playerCount?: number;
}

/** Harness-only cap for competitive runs (see DEFAULT_MONTE_CARLO_MAX_TURNS). */
const DEFAULT_COMPETITIVE_MAX_TURNS = 40;

/**
 * Plays one shared day of alternating MarketPhases for every player, binding
 * each player's seat before acting so the engine executes against the correct
 * per-player wallet/hand, then restoring it. Ends with the final player's
 * MarketPhase advanced to InvestmentResolution (closing handled by caller).
 * Never throws on a stray AI/illegal action — the phase simply ends.
 */
function playCompetitiveMarketPhases(
  state: MainStreetState,
  strategies: readonly MainStreetAiStrategy[],
  rngs: readonly (() => number)[],
  cardsOwnedByPlayer: string[][],
): void {
  executeCompetitiveWeekStart(state);
  const n = state.players!.length;
  for (let pid = 0; pid < n; pid++) {
    state.activePlayerId = pid;
    let guard = 0;
    for (;;) {
      if (guard++ > 24) break; // defensive: never spin inside one phase
      bindCompetitiveSeat(state, pid);
      let action: PlayerAction;
      try {
        action = strategies[pid].chooseAction(state, rngs[pid]);
      } catch {
        action = { type: 'end-turn' };
      }
      if (action.type === 'end-turn') break;
      // Track acquisitions for the acting player.
      if (
        action.type === 'buy-business' ||
        action.type === 'buy-upgrade' ||
        action.type === 'buy-event'
      ) {
        cardsOwnedByPlayer[pid].push(action.cardId);
      }
      try {
        executeAction(state, action);
      } catch {
        break; // illegal action — end this player's MarketPhase
      }
      restoreCompetitiveSeat(state, pid);
      if (state.gameResult !== 'playing') break;
    }
    restoreCompetitiveSeat(state, pid);
    endCompetitiveMarketTurn(state);
  }
}

/**
 * Runs a single competitive head-to-head seed to completion.
 *
 * Day loop: alternating MarketPhases per player → shared closing phases
 * (Income/Incident/EndCheck). A dual-choice incident pauses the closing; it is
 * resolved via the difficulty policy and the closing completed through
 * `resolveCompetitivePendingChoice` so per-owner routing stays correct.
 *
 * @param seed       Run seed (drives decks, incidents, and per-player AI RNGs).
 * @param maxTurns   Harness cap on shared days.
 * @param strategies Strategy per player.
 * @param playerCount Number of players.
 * @returns The per-player run summary.
 */
export function runCompetitiveSeed(
  seed: string,
  maxTurns: number,
  strategies?: readonly MainStreetAiStrategy[],
  playerCount: number = 2,
): CompetitiveRunSummary {
  const state = createCompetitiveState({ seed, playerCount });
  const resolvedStrategies: readonly MainStreetAiStrategy[] =
    strategies && strategies.length === playerCount
      ? strategies
      : Array.from({ length: playerCount }, () => CompetitiveGreedyStrategy);
  const rngs = resolvedStrategies.map((_, pid) =>
    createSeededRng(seedToNumber(`${seed}-comp-p${pid}`)),
  );
  const cardsOwnedByPlayer: string[][] = Array.from({ length: playerCount }, () => []);
  let turns = 0;

  while (state.gameResult === 'playing' && turns < maxTurns) {
    playCompetitiveMarketPhases(state, resolvedStrategies, rngs, cardsOwnedByPlayer);
    const closing = resolveCompetitiveClosingPhases(state);
    if (closing.choicePending) {
      // Dual-choice incident: apply the AI policy and finish the shared-day
      // closing (per-owner routing retained).
      resolveCompetitivePendingChoice(state);
    }
    turns++;
  }

  const endReason =
    state.gameResult === 'playing' ? 'max_turns_cap' : (state.endReason ?? 'unknown');
  let winnerId = state.competitiveWinnerId ?? null;

  const players: CompetitivePlayerRunSummary[] = (state.players ?? []).map(p => {
    const pid = p.playerId;
    let result: 'win' | 'loss' | 'draw' = 'loss';
    let lossReason = endReason;
    if (winnerId !== null) {
      result = pid === winnerId ? 'win' : 'loss';
      lossReason = pid === winnerId ? '' : 'outraced';
    } else if (state.gameResult === 'loss') {
      result = 'loss';
      lossReason =
        p.coins < 0
          ? 'bankruptcy'
          : state.turn > 1 && p.reputation <= 0
            ? 'reputation_collapse'
            : (state.endReason ?? 'unknown');
    } else {
      // Harness cap reached while still playing: highest score wins; a tie
      // for the lead is a draw.
      const scores = state.players!.map(x => x.score);
      const maxScore = Math.max(...scores);
      const leaders = state.players!.filter(x => x.score === maxScore);
      if (leaders.length === 1) {
        result = pid === leaders[0].playerId ? 'win' : 'loss';
        lossReason = pid === leaders[0].playerId ? '' : 'max_turns_cap';
        if (pid === leaders[0].playerId) winnerId = pid;
      } else if (leaders.some(x => x.playerId === pid)) {
        result = 'draw';
        lossReason = '';
      } else {
        result = 'loss';
        lossReason = 'max_turns_cap';
      }
    }
    return {
      playerId: pid,
      result,
      finalScore: p.score,
      finalCoins: p.coins,
      finalReputation: p.reputation,
      lossReason,
      cardsOwned: cardsOwnedByPlayer[pid],
    };
  });

  return { seed, winnerId, endReason, turns, players };
}

/**
 * Runs the competitive head-to-head Monte Carlo batch over `seeds` and
 * aggregates win/score distributions plus per-owner metrics (AC1/AC2).
 *
 * @param options Seeds, optional maxTurns, per-player strategies, playerCount.
 * @returns Per-run summaries plus aggregate per-owner metrics.
 */
export function runCompetitiveMonteCarlo(
  options: RunCompetitiveMonteCarloOptions,
): CompetitiveMonteCarloResult {
  const maxTurns = options.maxTurns ?? DEFAULT_COMPETITIVE_MAX_TURNS;
  const playerCount = options.playerCount ?? 2;
  const runs = options.seeds.map(seed =>
    runCompetitiveSeed(seed, maxTurns, options.strategies, playerCount),
  );
  return {
    metrics: computeCompetitiveMetrics(runs, playerCount),
    runs,
  };
}

/** Aggregates per-owner win/score/loss metrics over all runs. */
export function computeCompetitiveMetrics(
  runs: readonly CompetitiveRunSummary[],
  playerCount: number = 2,
): CompetitiveMonteCarloMetrics {
  const endReasons: Record<string, number> = {};
  for (const run of runs) {
    endReasons[run.endReason] = (endReasons[run.endReason] ?? 0) + 1;
  }

  const players: CompetitivePerPlayerMetrics[] = Array.from(
    { length: playerCount },
    (_, pid) => {
      const pRuns = runs.map(r => r.players[pid]).filter(r => r !== undefined);
      const wins = pRuns.filter(r => r.result === 'win').length;
      const losses = pRuns.filter(r => r.result === 'loss').length;
      const draws = pRuns.filter(r => r.result === 'draw').length;
      const lossReasons: Record<string, number> = {};
      for (const r of pRuns) {
        if (r.result !== 'loss') continue;
        lossReasons[r.lossReason] = (lossReasons[r.lossReason] ?? 0) + 1;
      }
      const lossReasonRates: Record<string, number> = {};
      for (const [reason, count] of Object.entries(lossReasons)) {
        lossReasonRates[reason] = losses > 0 ? count / losses : 0;
      }
      return {
        playerId: pid,
        wins,
        losses,
        draws,
        winRate: runs.length > 0 ? wins / runs.length : 0,
        medianScore: median(pRuns.map(r => r.finalScore)),
        averageScore: average(pRuns.map(r => r.finalScore)),
        averageCoins: average(pRuns.map(r => r.finalCoins)),
        lossReasons,
        lossReasonRates,
      };
    },
  );

  const draws = runs.filter(r => r.players.every(p => p.result === 'draw')).length;

  return {
    runs: runs.length,
    draws,
    averageTurns: average(runs.map(r => r.turns)),
    endReasons,
    players,
  };
}

/** Serializes competitive run summaries to CSV (seed + per-player columns). */
export function toCompetitiveCsv(runs: readonly CompetitiveRunSummary[]): string {
  const playerCols = (p: CompetitivePlayerRunSummary) => [
    p.result,
    String(p.finalScore),
    String(p.finalCoins),
    p.lossReason,
  ];
  const header = [
    'seed',
    'winnerId',
    'endReason',
    'turns',
    ...(runs[0]?.players ?? []).flatMap(p => [
      `p${p.playerId}_result`,
      `p${p.playerId}_score`,
      `p${p.playerId}_coins`,
      `p${p.playerId}_lossReason`,
    ]),
  ];
  const rows = runs.map(run => [
    run.seed,
    run.winnerId === null ? '' : String(run.winnerId),
    run.endReason,
    String(run.turns),
    ...run.players.flatMap(playerCols),
  ]);
  return [header.join(','), ...rows.map(row => row.join(','))].join('\n');
}
