# Main Street: PRD Milestone 3 -- AI, Hints, and Undo System

**Work Item:** CG-0MM4REQ4C01X8C08
**Parent Epic:** Main Street (CG-0MM4R9UJF1DGI0ZF)
**Author:** opencode
**Date:** 2026-03-12
**Status:** DRAFT -- Awaiting Producer Review

---

## Executive Summary

Milestone 3 adds three player-facing systems and a developer-facing balance-testing harness to Main Street:

1. **AI Auto-Play** -- Two strategy tiers (Random and Greedy) that can pilot a full game headlessly, used for automated balance validation and as the foundation for hints.
2. **Hint System** -- A per-turn "Hint" button that highlights the Greedy AI's recommended move with a one-line rationale, helping new players learn good play without breaking flow.
3. **Undo/Redo** -- A Command-pattern integration with the existing engine `UndoRedoManager`, allowing players to undo their last market action and redo if they change their mind.
4. **Monte Carlo Balance Harness** -- Extension of the existing Monte Carlo test infrastructure to run AI strategies across 200 seeds x 25 turns, exporting win rate, score distribution, and loss-reason metrics for balance validation of M2's expanded content.

This milestone produces no new card content or visual polish. It builds on the M2 card pool and reuses existing engine abstractions (`AiStrategyBase`, `AiPlayer`, `pickRandom`, `pickBest`, `UndoRedoManager`, `Command`, `CompoundCommand`, `TranscriptRecorderBase`).

---

## Table of Contents

1. [Goal and Success Criteria](#1-goal-and-success-criteria)
2. [Scope](#2-scope)
3. [User Stories](#3-user-stories)
4. [Technical Design](#4-technical-design)
5. [API Sketches](#5-api-sketches)
6. [Monte Carlo Balance Harness](#6-monte-carlo-balance-harness)
7. [Suggested Engineering Tasks](#7-suggested-engineering-tasks)
8. [Dependencies](#8-dependencies)
9. [Risks and Assumptions](#9-risks-and-assumptions)
10. [Appendix A: Move Evaluation Heuristics](#appendix-a-move-evaluation-heuristics)
11. [Appendix B: Acceptance Test Scenarios](#appendix-b-acceptance-test-scenarios)

---

## 1. Goal and Success Criteria

### Goal

Deliver AI auto-play, a player-facing hint system, and undo/redo functionality for Main Street, enabling automated balance testing of M2 content and improving the player experience with learning aids and forgiving interaction.

### Success Criteria

| # | Criterion | Measurement |
|---|-----------|-------------|
| SC-1 | Two AI strategy tiers (Random, Greedy) are implemented and can complete full games headlessly | Unit test: both strategies complete 100 seeds without error; Greedy wins more than Random |
| SC-2 | Hint system displays the Greedy AI's recommended move with a one-line rationale | Manual playtest: pressing Hint highlights a move and shows explanation text |
| SC-3 | Hint usage is limited to 1 per turn | Unit test: second hint request in same turn returns null / is rejected |
| SC-4 | Undo reverses the last market action; Redo re-applies it | Unit test: buy -> undo -> state matches pre-buy; undo -> redo -> state matches post-buy |
| SC-5 | Undo/Redo buttons are visible and correctly enabled/disabled | Manual playtest: buttons grey out when stack is empty |
| SC-6 | Monte Carlo harness runs both strategies across 200 seeds x 25 turns and exports metrics | `npm run monte-carlo` completes and outputs JSON + CSV with win rate, median score, avg game length |
| SC-7 | Greedy AI wins 30-60% of runs on Medium difficulty (market-greedy baseline) | Monte Carlo output shows win rate within range |
| SC-8 | All existing tests pass and build succeeds | `npm test` and `npm run build` pass with zero errors |
| SC-9 | Game transcript records undo/redo actions and hint requests | Unit test: transcript contains undo/redo/hint events |

---

## 2. Scope

### IN Scope

| Area | Details |
|------|---------|
| **AI Strategy: Random** | Makes valid moves uniformly at random. Useful as a baseline for Monte Carlo testing. |
| **AI Strategy: Greedy** | Evaluates all legal actions using a scoring heuristic; picks the highest-scoring move with random tie-breaking. Used for hints and balance testing. |
| **Hint System** | "Hint" button in the UI during MarketPhase. Queries the Greedy strategy for its recommended action. Highlights the target card and slot with a one-line explanation. Limited to 1 hint per turn. |
| **Undo/Redo** | Wraps player market actions as `Command` objects. Integrates with `UndoRedoManager` from `@core-engine`. UI buttons for Undo and Redo with enabled/disabled state. Undo stack clears at end-of-turn (actions during resolution phases are not undoable). |
| **Monte Carlo Extension** | Extends `MonteCarloStrategy` type to accept AI strategy names. Runs Random and Greedy strategies through the existing harness. Outputs `MonteCarloMetrics` including per-strategy comparison. |
| **Transcript Extension** | Records hint requests, undo actions, and redo actions as transcript events. |
| **Tests** | Unit tests for AI strategies, hint generation, undo/redo correctness, and Monte Carlo output. |

### OUT of Scope (Deferred to Future Milestones)

| Area | Reason | Milestone |
|------|--------|-----------|
| Lookahead/Smart AI strategy | Optional tier; deferred until Greedy baseline is validated | Future |
| Tutorial / onboarding | Requires UX design; deferred to M5 | M5 |
| Difficulty adjustment via AI | Requires Lookahead strategy and tuning | Future |
| Progressive hints (vague to specific) | Single-move highlight is sufficient for M3 | Future |
| Multi-action hint sequences | Greedy evaluates one action at a time; chained suggestions deferred | Future |
| Undo across turn boundaries | Undo stack clears at end-of-turn; cross-turn undo adds complexity | Future |
| AI vs. player (competitive mode) | Main Street is single-player; AI is used for auto-play and hints only | N/A |
| Visual polish for hint/undo UI | Placeholder styling; polish deferred to M4 | M4 |

---

## 3. User Stories

### US-1: AI Auto-Play (Random Strategy)

**As a** developer,
**I want** to run a full Main Street game driven by a Random AI strategy,
**so that** I have a naive baseline for Monte Carlo balance testing.

**Acceptance Criteria:**
- [ ] AC-1.1: `RandomStrategy` implements `MainStreetAiStrategy` and makes valid moves by selecting uniformly at random from all legal actions.
- [ ] AC-1.2: Given 100 different seeds, `RandomStrategy` completes every game (reaches win or loss) without throwing errors.
- [ ] AC-1.3: Random strategy uses the game's seeded RNG to ensure deterministic replays.
- [ ] AC-1.4: Random strategy never attempts an illegal action (all actions pass `executeAction` validation).

### US-2: AI Auto-Play (Greedy Strategy)

**As a** developer,
**I want** to run a full Main Street game driven by a Greedy AI strategy that follows heuristic priorities,
**so that** I can measure how well the economy and scoring systems work under competent play.

**Acceptance Criteria:**
- [ ] AC-2.1: `GreedyStrategy` implements `MainStreetAiStrategy` and evaluates all legal actions using a scoring function.
- [ ] AC-2.2: Greedy strategy follows the priority chain: upgrade (if available and affordable) > buy business (best placement score) > buy event (positive ROI) > play held event > end turn.
- [ ] AC-2.3: Business placement scoring considers adjacency synergy bonus for each candidate slot.
- [ ] AC-2.4: Given 100 different seeds, `GreedyStrategy` achieves a higher win rate than `RandomStrategy`.
- [ ] AC-2.5: Given the same seed, Greedy strategy produces identical game outcomes across repeated runs (deterministic).

### US-3: Request a Hint

**As a** player,
**I want to** press a "Hint" button during my turn to see a suggested move highlighted with a brief explanation,
**so that** I can learn effective strategies without reading a manual.

**Acceptance Criteria:**
- [ ] AC-3.1: A "Hint" button is visible during the MarketPhase.
- [ ] AC-3.2: Pressing Hint queries the Greedy strategy for the recommended action.
- [ ] AC-3.3: The recommended card is highlighted in the market (or held-event area) and the target slot is highlighted on the street grid (for buy-business actions).
- [ ] AC-3.4: A one-line rationale is displayed (e.g., "Buy Cafe and place at slot 5 for 50% synergy bonus").
- [ ] AC-3.5: If the recommended action is "end turn", the hint displays "No good buys available -- end your turn."
- [ ] AC-3.6: The hint does not auto-execute the action; the player must act manually.
- [ ] AC-3.7: Hint is limited to 1 use per turn. After use, the Hint button is disabled until the next turn.
- [ ] AC-3.8: The hint request is recorded in the game transcript.

### US-4: Undo Last Action

**As a** player,
**I want to** undo my last market action (buy-business, buy-upgrade, buy-event, or play-event),
**so that** I can recover from accidental purchases or experiment with placement.

**Acceptance Criteria:**
- [ ] AC-4.1: An "Undo" button is visible during the MarketPhase.
- [ ] AC-4.2: Pressing Undo reverses the last executed action: the purchased card is returned to the market, coins are refunded, and the business/upgrade/event is removed from its target.
- [ ] AC-4.3: Undo correctly restores all state mutations from the action, including: street grid, resource bank, market slots, held event, activity log entries, and applied upgrades.
- [ ] AC-4.4: The Undo button is disabled when the undo stack is empty (no actions to undo).
- [ ] AC-4.5: Undo/redo stack is cleared when the turn ends (processEndOfTurn). Actions during Income/Incident/EndCheck phases are not undoable.
- [ ] AC-4.6: Undo actions are recorded in the game transcript.

### US-5: Redo After Undo

**As a** player,
**I want to** redo an action I just undid,
**so that** I can change my mind without re-executing the action manually.

**Acceptance Criteria:**
- [ ] AC-5.1: A "Redo" button is visible during the MarketPhase.
- [ ] AC-5.2: Pressing Redo re-executes the last undone action.
- [ ] AC-5.3: The Redo button is disabled when the redo stack is empty.
- [ ] AC-5.4: Executing a new action after undo clears the redo stack (no branching history).
- [ ] AC-5.5: Redo actions are recorded in the game transcript.

### US-6: Compound Action Undo

**As a** player,
**I want** actions that trigger multiple state changes (e.g., buy-upgrade that applies to a specific business) to undo as a single step,
**so that** I don't have to undo each sub-effect individually.

**Acceptance Criteria:**
- [ ] AC-6.1: Buy-upgrade actions that modify both market state and business card state are wrapped as a `CompoundCommand`.
- [ ] AC-6.2: Undoing a compound action reverses all sub-effects in a single Undo press.
- [ ] AC-6.3: The undo stack shows compound actions as a single entry (not individual sub-commands).

### US-7: Monte Carlo Balance Validation

**As a** developer,
**I want to** run both AI strategies through the Monte Carlo harness (200 seeds x 25 turns) and compare metrics,
**so that** I can validate that M2's economy and difficulty presets produce balanced gameplay.

**Acceptance Criteria:**
- [ ] AC-7.1: `npm run monte-carlo` accepts a `--strategy` flag to select `random`, `greedy`, `market-greedy` (existing), or `demo-greedy` (existing).
- [ ] AC-7.2: Default strategy is `greedy` (replacing `market-greedy` as the primary balance metric).
- [ ] AC-7.3: Output includes `MonteCarloMetrics` with: runs, wins, losses, winRate, medianScore, averageScore, averageTurns, lossReasons, lossReasonRates.
- [ ] AC-7.4: Output is available in both JSON and CSV formats.
- [ ] AC-7.5: Greedy strategy win rate on Medium difficulty is within 30-60% (matching M2 balance targets).
- [ ] AC-7.6: Greedy strategy median score on Medium difficulty is within 120-180.
- [ ] AC-7.7: Random strategy win rate is significantly lower than Greedy (validates strategy differentiation).

### US-8: Transcript Records AI, Hint, and Undo Events

**As a** developer,
**I want** the game transcript to record AI moves, hint requests, undo actions, and redo actions,
**so that** I can replay and debug games that include these features.

**Acceptance Criteria:**
- [ ] AC-8.1: When AI auto-play completes a game, each AI-chosen action is recorded as a transcript event with the strategy name and action details.
- [ ] AC-8.2: Hint requests are recorded with the recommended action and rationale.
- [ ] AC-8.3: Undo events are recorded with the reversed action details.
- [ ] AC-8.4: Redo events are recorded with the re-applied action details.
- [ ] AC-8.5: Transcript format is backwards-compatible with existing M1/M2 transcripts.

---

## 4. Technical Design

### 4.1 Engine Modules Used

| Module | Usage |
|--------|-------|
| `@ai/AiStrategy` | `AiStrategyBase` interface, `AiPlayer<T>` generic wrapper |
| `@ai/AiUtils` | `pickRandom<T>()` for Random strategy, `pickBest<T>()` for Greedy strategy |
| `@core-engine/UndoRedoManager` | `UndoRedoManager`, `Command`, `CompoundCommand` for undo/redo |
| `@core-engine/TranscriptRecorder` | `TranscriptRecorderBase<T>`, `BaseTranscript` for event recording |
| `@core-engine/SeededRng` | `createSeededRng()` for deterministic AI decisions |

### 4.2 AI Strategy Architecture

Main Street's AI follows the same pattern established by five other example games (Golf, Sushi Go, Lost Cities, The Mind, Feudalism):

1. **Game-specific strategy interface** extends `AiStrategyBase` with a `chooseAction` method.
2. **RandomStrategy** makes valid moves uniformly at random.
3. **GreedyStrategy** evaluates all legal actions with a scoring function and picks the best.
4. **MainStreetAiPlayer** extends `AiPlayer<MainStreetAiStrategy>` to bind strategy + RNG.

The AI interacts with the game exclusively through the public engine API:
- `getAffordableBusinessCards(state)` -- available business purchases
- `getAffordableUpgradeCards(state)` -- available upgrade purchases
- `getEmptySlots(state)` -- open grid positions
- `computeSynergyBonus(grid, slotIndex)` -- evaluate placement quality
- `executeAction(state, action)` -- execute chosen action
- `executeDayStart(state)` / `processEndOfTurn(state)` -- turn lifecycle

The AI never accesses deck contents or hidden information, ensuring fair evaluation.

### 4.3 Greedy Strategy Decision Logic

The Greedy strategy follows a priority chain, evaluating all legal actions and selecting the highest-scoring one:

**Priority 1: Upgrade** -- If an affordable upgrade exists for a placed business, evaluate the income increase. Score = `(incomeBonus * remainingTurns) - cost`.

**Priority 2: Buy Business** -- For each affordable business card, evaluate every empty slot. Score = `(baseIncome + projectedSynergyBonus) * remainingTurns - cost`. The projected synergy bonus is computed by `computeSynergyBonus()` assuming the card is placed at that slot.

**Priority 3: Buy Event** -- If an affordable Investment event has positive expected value (`coinDelta + reputationDelta * reputationScoreMultiplier > cost`), buy it. Score = `expectedValue - cost`.

**Priority 4: Play Held Event** -- If the player holds an Investment event, play it. Score = a fixed bonus (ensures held events are played before end-of-turn auto-resolution).

**Priority 5: End Turn** -- If no action scores positively, end the turn. Score = 0.

All actions with the same priority tier are compared by score. Ties are broken randomly using the seeded RNG via `pickBest()`.

### 4.4 Hint System Architecture

The hint system reuses the Greedy strategy to generate recommendations:

1. Player presses "Hint" button during MarketPhase.
2. `HintGenerator.getHint(state)` creates a temporary `GreedyStrategy` instance, calls `chooseAction(state)`, and captures the recommended `PlayerAction` and its score.
3. The hint response includes:
   - `action: PlayerAction` -- the recommended action
   - `rationale: string` -- a human-readable one-line explanation
   - `score: number` -- the heuristic score (for debugging; not shown to player)
4. The UI highlights the relevant card and target slot.
5. A `hintUsedThisTurn` flag on the state (or scene) prevents additional hints until the next `DayStart`.

**Rationale generation** maps action types to templates:
- `buy-business`: "Buy {cardName} at slot {slot} for {synergyRate} synergy bonus" (synergyRate is the effective difficulty-aware percentage, e.g. 50%)
- `buy-upgrade`: "Upgrade {businessName} for +{incomeBonus}/turn income"
- `buy-event`: "Buy {eventName} for {coinDelta} coins and {repDelta} reputation"
- `play-event`: "Play {eventName} now for immediate benefit"
- `end-turn`: "No good buys available -- end your turn"

### 4.5 Undo/Redo Architecture

Each player market action is wrapped as a `Command` object before execution:

```
Player clicks "Buy Bakery at slot 3"
    |
    v
Create BuyBusinessCommand(state, cardId, slotIndex)
    |
    v
undoRedoManager.execute(command)
    |-- command.execute() calls executeAction(state, action)
    |-- command pushed to undo stack
    |-- redo stack cleared
    |
    v
UI updates to reflect new state
```

**Command implementations** capture a state snapshot of the affected areas before execution, and restore them on undo:

- `BuyBusinessCommand` -- snapshots: coins, market business slot, grid slot, activity log length
- `BuyUpgradeCommand` -- snapshots: coins, market investment slot, target business card state (level, incomeBonus, synergyRangeBonus, appliedUpgrades), activity log length. Wrapped as `CompoundCommand` since it modifies both market and business.
- `BuyEventCommand` -- snapshots: coins, market investment slot, heldEvent, activity log length
- `PlayEventCommand` -- snapshots: heldEvent, coins, reputation, activity log length

**Lifecycle:**
- `UndoRedoManager` instance is created per game (stored on scene or state).
- Stack clears at end-of-turn (`undoRedoManager.clear()` called in `processEndOfTurn`).
- Actions during resolution phases (Income, Incident, EndCheck) are engine-driven and not wrapped as commands.
- The activity log is truncated on undo to remove entries added by the undone action.

### 4.6 Transcript Extension

The existing `MainStreetTranscript` (or equivalent) is extended with new event types:

```typescript
type MainStreetTranscriptEvent =
  | { type: 'action'; turn: number; action: PlayerAction; result: PurchaseResult | null }
  | { type: 'ai-action'; turn: number; strategy: string; action: PlayerAction }
  | { type: 'hint'; turn: number; recommendedAction: PlayerAction; rationale: string }
  | { type: 'undo'; turn: number; reversedAction: PlayerAction }
  | { type: 'redo'; turn: number; reappliedAction: PlayerAction }
  | { type: 'turn-end'; turn: number; result: TurnResult }
  | { type: 'game-end'; result: GameResult; finalScore: number; endReason: EndReason };
```

This is backwards-compatible: existing events retain their structure; new event types are additive.

---

## 5. API Sketches

### 5.1 MainStreetAiStrategy Interface

```typescript
// example-games/main-street/MainStreetAiStrategy.ts

import type { AiStrategyBase } from '@ai/AiStrategy';
import type { MainStreetState } from './MainStreetState';
import type { PlayerAction } from './MainStreetEngine';

/**
 * Game-specific AI strategy interface for Main Street.
 * Each strategy evaluates the current game state and returns
 * the best action according to its decision logic.
 */
export interface MainStreetAiStrategy extends AiStrategyBase {
  /**
   * Choose the next action to take given the current game state.
   * @param state - Current game state (read-only for strategy evaluation)
   * @param rng - Seeded random number generator for tie-breaking
   * @returns The chosen player action
   */
  chooseAction(state: Readonly<MainStreetState>, rng: () => number): PlayerAction;
}
```

### 5.2 RandomStrategy

```typescript
// example-games/main-street/MainStreetAiStrategy.ts (continued)

import { pickRandom } from '@ai/AiUtils';

export const RandomStrategy: MainStreetAiStrategy = {
  name: 'Random',

  chooseAction(state: Readonly<MainStreetState>, rng: () => number): PlayerAction {
    const legalActions = enumerateLegalActions(state);
    return pickRandom(legalActions, rng);
  },
};
```

### 5.3 GreedyStrategy

```typescript
// example-games/main-street/MainStreetAiStrategy.ts (continued)

import { pickBest } from '@ai/AiUtils';

export const GreedyStrategy: MainStreetAiStrategy = {
  name: 'Greedy',

  chooseAction(state: Readonly<MainStreetState>, rng: () => number): PlayerAction {
    const scoredActions = enumerateAndScoreActions(state);
    return pickBest(scoredActions, (a) => a.score, rng).action;
  },
};
```

### 5.4 MainStreetAiPlayer

```typescript
// example-games/main-street/MainStreetAiStrategy.ts (continued)

import { AiPlayer } from '@ai/AiStrategy';

export class MainStreetAiPlayer extends AiPlayer<MainStreetAiStrategy> {
  /** Run a complete game from the current state until game-end. */
  playGame(state: MainStreetState): void {
    while (state.gameResult === 'playing') {
      executeDayStart(state);
      while (state.phase === 'MarketPhase') {
        const action = this.strategy.chooseAction(state, this.rng);
        executeAction(state, action);
        if (action.type === 'end-turn') break;
      }
      processEndOfTurn(state);
    }
  }
}
```

### 5.5 HintGenerator

```typescript
// example-games/main-street/MainStreetHint.ts

export interface HintResult {
  action: PlayerAction;
  rationale: string;
  score: number;
}

/**
 * Generates a hint by querying the Greedy strategy.
 * Returns null if the game is not in MarketPhase.
 */
export function generateHint(state: Readonly<MainStreetState>): HintResult | null {
  if (state.phase !== 'MarketPhase') return null;

  const scoredActions = enumerateAndScoreActions(state);
  const best = pickBest(scoredActions, (a) => a.score, state.rng);
  const rationale = buildRationale(best.action, best.score, state);

  return { action: best.action, rationale, score: best.score };
}
```

### 5.6 Command Implementations (Undo/Redo)

```typescript
// example-games/main-street/MainStreetCommands.ts

import type { Command } from '@core-engine/UndoRedoManager';

export class BuyBusinessCommand implements Command {
  readonly description: string;

  private readonly state: MainStreetState;
  private readonly cardId: string;
  private readonly slotIndex: number;

  // Snapshot fields for undo
  private snapshot: {
    coins: number;
    marketBusinessSlot: BusinessCard | null;
    gridSlot: BusinessCard | null;
    logLength: number;
  } | null = null;

  constructor(state: MainStreetState, cardId: string, slotIndex: number) {
    this.state = state;
    this.cardId = cardId;
    this.slotIndex = slotIndex;
    this.description = `Buy business ${cardId} at slot ${slotIndex}`;
  }

  execute(): void {
    // Capture snapshot before execution
    this.snapshot = {
      coins: this.state.resourceBank.coins,
      marketBusinessSlot: /* card reference */,
      gridSlot: this.state.streetGrid[this.slotIndex],
      logLength: this.state.activityLog.length,
    };
    executeAction(this.state, {
      type: 'buy-business',
      cardId: this.cardId,
      slotIndex: this.slotIndex,
    });
  }

  undo(): void {
    if (!this.snapshot) throw new Error('Cannot undo: not yet executed');
    // Restore state from snapshot
    this.state.resourceBank.coins = this.snapshot.coins;
    // Return card to market, clear grid slot, truncate log
    this.state.streetGrid[this.slotIndex] = this.snapshot.gridSlot;
    this.state.activityLog.length = this.snapshot.logLength;
    // ... restore market slot
  }
}

// Similar: BuyUpgradeCommand, BuyEventCommand, PlayEventCommand
// BuyUpgradeCommand uses CompoundCommand to group market + business mutations
```

### 5.7 Monte Carlo Extension

```typescript
// example-games/main-street/MainStreetMonteCarlo.ts (extended)

// Extend the strategy type to include AI strategies
export type MonteCarloStrategy =
  | 'market-greedy'    // existing: buys cheapest business only
  | 'demo-greedy'      // existing: buys + plays events + upgrades
  | 'random'           // new: RandomStrategy via AI module
  | 'greedy';          // new: GreedyStrategy via AI module

// RunMonteCarloOptions unchanged; strategy field accepts new values
```

---

## 6. Monte Carlo Balance Harness

### 6.1 Existing Baseline

The M2 Monte Carlo harness (`MainStreetMonteCarlo.ts`) runs 200 seeds x 25 turns with two built-in strategies (`market-greedy` and `demo-greedy`). The `market-greedy` strategy buys the cheapest affordable business each turn. The `demo-greedy` strategy additionally plays held events, buys investment events, and attempts upgrades.

**M2 balance targets (Medium difficulty):**
- Win rate: 30-60% (market-greedy)
- Median score: 120-180

### 6.2 M3 Extension

M3 adds the `random` and `greedy` AI strategies to the Monte Carlo harness:

| Strategy | Description | Expected Win Rate (Medium) |
|----------|-------------|---------------------------|
| `market-greedy` | Cheapest business only (M2 baseline) | 30-60% |
| `demo-greedy` | Business + events + upgrades (M2 baseline) | 35-65% |
| `random` | Uniform random valid actions | 5-20% |
| `greedy` | Heuristic-scored actions (M3 primary) | 40-70% |

The `greedy` strategy replaces `market-greedy` as the primary balance reference because it exercises the full action space (upgrades, events, placement optimization) and better approximates competent human play.

### 6.3 Metrics Collected

All metrics from the existing `MonteCarloMetrics` interface are retained:

| Metric | Description |
|--------|-------------|
| `runs` | Total seeds run |
| `wins` / `losses` | Count by outcome |
| `winRate` | wins / runs |
| `medianScore` | Median final score across all runs |
| `averageScore` | Mean final score |
| `averageTurns` | Mean turns to game end |
| `averageNoActionTurns` | Mean turns where AI took no buy/upgrade action |
| `averageTurnWhenGridHalf` | Mean turn when 5+ slots filled |
| `averageTurnWhenGridFull` | Mean turn when all 10 slots filled |
| `lossReasons` | Count by end reason (bankruptcy, reputation_collapse, turn_exhaustion) |
| `lossReasonRates` | Percentage by end reason |

### 6.4 Balance Validation Targets

The following targets validate M2's economy across difficulty presets:

| Difficulty | Strategy | Win Rate | Median Score | Avg Turns |
|------------|----------|----------|-------------|-----------|
| Easy | Greedy | 60-85% | 140-200 | 12-20 |
| Medium | Greedy | 40-70% | 120-180 | 14-22 |
| Hard | Greedy | 15-40% | 100-160 | 13-15 |
| Medium | Random | 5-20% | 60-120 | 15-25 |

These targets are guidelines, not hard gates. If results fall outside ranges, they indicate areas for economy tuning rather than test failures. The Monte Carlo test suite should include a "CI guardrail" test that fails only if Greedy win rate on Medium is outside 20-80% (wide band to catch regressions, not tune balance).

> **See also:** The **[Balance Process & Tooling PRD](prd-balance-process-and-tooling.md)** extends this section with 7 micro-level and 8 macro-level metrics, CLI tools for structured balance analysis, and a baseline management strategy.

---

## 7. Suggested Engineering Tasks

The following tasks represent a suggested implementation order. Each task should become a child work item under the M3 parent.

### Phase 1: AI Foundation

| # | Task | Description | Dependencies |
|---|------|-------------|-------------|
| T-1 | Create `MainStreetAiStrategy` interface | Define `MainStreetAiStrategy` interface extending `AiStrategyBase`, implement `enumerateLegalActions()` helper | None |
| T-2 | Implement `RandomStrategy` | Random action selection using `pickRandom()` | T-1 |
| T-3 | Implement scoring heuristics | `scoreAction()` and `enumerateAndScoreActions()` functions | T-1 |
| T-4 | Implement `GreedyStrategy` | Scored action selection using `pickBest()` | T-1, T-3 |
| T-5 | Implement `MainStreetAiPlayer` | `playGame()` method for headless auto-play | T-1 |
| T-6 | AI unit tests | Tests for both strategies: legal actions only, determinism, win rate comparison | T-2, T-4, T-5 |

### Phase 2: Monte Carlo Extension

| # | Task | Description | Dependencies |
|---|------|-------------|-------------|
| T-7 | Extend `MonteCarloStrategy` type | Add `random` and `greedy` to the strategy union | T-2, T-4 |
| T-8 | Wire AI strategies into Monte Carlo runner | Route `random`/`greedy` strategy selections to `MainStreetAiPlayer` | T-5, T-7 |
| T-9 | Update `npm run monte-carlo` script | Accept `--strategy` flag; default to `greedy` | T-8 |
| T-10 | Monte Carlo balance tests | CI guardrail test (wide band) + documented balance validation | T-8 |

### Phase 3: Hint System

| # | Task | Description | Dependencies |
|---|------|-------------|-------------|
| T-11 | Implement `HintGenerator` | `generateHint()` function, `buildRationale()` templates | T-3, T-4 |
| T-12 | Add hint state tracking | `hintUsedThisTurn` flag, reset on DayStart | T-11 |
| T-13 | Hint UI integration | "Hint" button in `MainStreetScene`, highlight rendering, rationale text | T-11, T-12 |
| T-14 | Hint unit tests | Correct recommendation, per-turn limit, rationale text | T-11 |

### Phase 4: Undo/Redo

| # | Task | Description | Dependencies |
|---|------|-------------|-------------|
| T-15 | Implement Command classes | `BuyBusinessCommand`, `BuyUpgradeCommand` (CompoundCommand), `BuyEventCommand`, `PlayEventCommand` | None |
| T-16 | Integrate `UndoRedoManager` | Create manager per game, wire commands through action execution path | T-15 |
| T-17 | Clear undo stack on end-of-turn | Call `undoRedoManager.clear()` in `processEndOfTurn` | T-16 |
| T-18 | Undo/Redo UI integration | Buttons in `MainStreetScene`, enabled/disabled state binding | T-16 |
| T-19 | Undo/Redo unit tests | Single action, compound action, stack clear, edge cases (empty stack, undo-then-new-action) | T-15, T-16 |

### Phase 5: Transcript Extension

| # | Task | Description | Dependencies |
|---|------|-------------|-------------|
| T-20 | Extend transcript event types | Add `ai-action`, `hint`, `undo`, `redo` event types | None |
| T-21 | Wire transcript recording | Record events from AI player, hint generator, and undo/redo manager | T-5, T-11, T-16, T-20 |
| T-22 | Transcript unit tests | Verify all new event types are recorded correctly | T-21 |

### Phase 6: Integration & Validation

| # | Task | Description | Dependencies |
|---|------|-------------|-------------|
| T-23 | Full integration test | AI-driven game with undo/redo and hints exercised | All above |
| T-24 | Monte Carlo balance run | Full 200-seed sweep on all strategies + all difficulties | T-10 |
| T-25 | Update playtest-scenarios.md | Add AI strategy results to playtest documentation | T-24 |

---

## 8. Dependencies

### Upstream (Required Before M3)

| Dependency | Status | Notes |
|------------|--------|-------|
| M2 -- Full Content and Card Pool (CG-0MM4REC2Z0GS2YKT) | Completed | M3 tests against M2's expanded card pool |
| `UndoRedoManager` in `@core-engine` | Implemented | Available at `src/core-engine/UndoRedoManager.ts` |
| `AiStrategyBase`, `AiPlayer`, `pickRandom`, `pickBest` in `@ai` | Implemented | Available at `src/ai/` |
| `TranscriptRecorderBase` in `@core-engine` | Implemented | Available at `src/core-engine/TranscriptRecorder.ts` |
| Existing Monte Carlo harness | Implemented | Available at `example-games/main-street/MainStreetMonteCarlo.ts` |

### Downstream (Blocked by M3)

| Dependency | Work Item | Notes |
|------------|-----------|-------|
| M4 -- Visual Polish | CG-0MM4RF91E1LR5RSY | Will polish hint and undo/redo UI. Acceptance: produce and commit the finalized Main Street menu thumbnail (public/assets/games/main-street/thumbnail.png) generated from replay screenshots; include the fixture transcript (tests/fixtures/transcripts/main-street/fixture-game.json) and a registered ReplayAdapter so thumbnails can be regenerated; update Game Selector to reference the thumbnail. |
| M5 -- Tutorial, Onboarding | CG-0MM4RFN5N0KTUR66 | May use hints as part of tutorial flow |
| M6 -- Engine Extraction | CG-0MM4RG1GM0SRVENC | May extract hint generation pattern as engine component |

### Cross-Cutting

| Item | Notes |
|------|-------|
| GDD: AI Strategy and Hint System (CG-0MM4RD5I00L2QV7W) | Completed design reference; M3 implements the specified tiers |

---

## 9. Risks and Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Greedy heuristic produces poor hints (recommendations that experienced players would disagree with) | Medium | Medium | Include acceptance test where hint matches human-expected move in >=3 of 5 curated scenarios. Heuristic weights can be tuned post-M3 without API changes. |
| Undo snapshot approach misses state mutations (e.g., market refill side effects) | Medium | High | Market refill happens during `executeDayStart`, not during action execution. Command snapshots only need to capture action-local state. Comprehensive undo/redo tests cover all action types. |
| Undo/redo of buy-upgrade with branching paths introduces edge cases | Low | Medium | Buy-upgrade commands snapshot the full business card state (level, incomeBonus, synergyRangeBonus, appliedUpgrades). Restoration is a direct property overwrite. Test branching upgrade undo explicitly. |
| AI strategies slow down Monte Carlo runs significantly | Low | Low | Strategies evaluate <50 candidate actions per turn (market has at most 7 cards x 10 slots). No deep lookahead. Profile if runs exceed 10 seconds for 200 seeds. |
| Balance targets from M2 PRD may need adjustment after AI testing | High | Low | Balance targets are guidelines, not hard gates. Wide CI guardrail band (20-80%) catches regressions; narrow targets are documented for human review. |
| Hint system creates a "crutch" that reduces strategic learning | Low | Low | 1-hint-per-turn limit and textual rationale encourage understanding over dependency. No progressive hint escalation in M3. |

### Assumptions

- M2's expanded card pool is stable and all tests pass on main.
- The existing `UndoRedoManager` API is sufficient; no engine changes are needed.
- The existing `AiStrategyBase` / `AiPlayer` pattern is sufficient for Main Street's single-player auto-play.
- Main Street's action space is small enough (< 50 legal actions per turn) that Greedy evaluation does not require performance optimization.
- Hint generation can reuse the Greedy strategy directly without a separate, simplified evaluator.
- Activity log truncation is sufficient for undo (no need to reconstruct log entries -- just remove the ones added by the undone action).

---

## Appendix A: Move Evaluation Heuristics

### A.1 Action Scoring Functions

The Greedy strategy uses the following scoring functions. All scores are in "net coin-equivalent value" units to enable cross-action comparison.

#### Buy Business

```
score = (baseIncome + projectedSynergyBonus) * remainingTurns - cost

where:
  projectedSynergyBonus = computeSynergyBonus(grid, candidateSlot, config.synergyBonusPerNeighbor)
                          // evaluated as if the business were placed at candidateSlot
  remainingTurns = config.maxTurns - state.turn
```

For each affordable business card, evaluate every empty slot and take the best (slot, score) pair.

#### Buy Upgrade

```
score = incomeBonus * remainingTurns - cost

where:
  incomeBonus = upgrade.incomeBonus
  remainingTurns = config.maxTurns - state.turn
```

For branching upgrades, evaluate each branch independently and pick the higher-scoring one.

#### Buy Event (Investment)

```
score = coinDelta + (reputationDelta * config.reputationScoreMultiplier) - cost
```

Only consider events with positive score (i.e., expected value exceeds cost).

#### Play Held Event

```
score = 5  (fixed bonus to ensure held events are played before auto-resolution)
```

#### End Turn

```
score = 0  (fallback when no positive-scoring action exists)
```

### A.2 Worked Example

**State:** Turn 5, Medium difficulty (maxTurns=20), 12 coins, empty slots [2, 5, 8].
**Market business cards:** Cafe (cost 4, Food+Culture bridge), Hardware Store (cost 3, Commerce).
**Grid:** slot 0 = Bakery (Food), slot 1 = Diner (Food), slot 3 = Bookshop (Culture), slot 4 = Park (Culture).

**Evaluating Cafe at slot 2:**
- `projectedSynergyBonus = computeSynergyBonus([..., Cafe@2, ...], 2, 1)` -> Diner@1 is Food (matches Cafe's Food), Bookshop@3 is Culture (matches Cafe's Culture) -> bonus = 2
- `baseIncome = 2` (Cafe)
- `remainingTurns = 20 - 5 = 15`
- `score = (2 + 2) * 15 - 4 = 56`

**Evaluating Hardware Store at slot 2:**
- `projectedSynergyBonus = 0` (Diner@1 is Food, Bookshop@3 is Culture; neither matches Commerce)
- `baseIncome = 2`
- `score = (2 + 0) * 15 - 3 = 27`

**Result:** Greedy recommends "Buy Cafe at slot 2" with rationale "Buy Cafe at slot 2 for 50% synergy bonus".

---

## Appendix B: Acceptance Test Scenarios

### B.1 AI Strategy Tests

| Test | Setup | Expected |
|------|-------|----------|
| Random completes game | 100 seeds, Medium difficulty | All seeds reach win/loss, no errors |
| Greedy completes game | 100 seeds, Medium difficulty | All seeds reach win/loss, no errors |
| Greedy beats Random | 200 seeds, Medium difficulty | Greedy win rate > Random win rate |
| Deterministic replay | Seed "test-determinism", Greedy | Two runs produce identical final state |
| Greedy never makes illegal move | 50 seeds | No `executeAction` throws |

### B.2 Hint Tests

| Test | Setup | Expected |
|------|-------|----------|
| Hint returns best Greedy action | Seed "Scenario-FoodFocus", turn 1 | Hint action matches standalone Greedy evaluation |
| Hint limited to 1 per turn | Request hint twice in same turn | Second call returns null |
| Hint resets on new turn | Use hint, end turn, new turn | Hint available again |
| Hint only during MarketPhase | Request during IncomePhase | Returns null |
| Hint rationale includes card name | Any seed | Rationale string contains the card's display name |

### B.3 Undo/Redo Tests

| Test | Setup | Expected |
|------|-------|----------|
| Undo buy-business | Buy Bakery at slot 0, then undo | Coins restored, slot 0 empty, Bakery back in market |
| Undo buy-upgrade (compound) | Upgrade Bakery -> Patisserie, then undo | Bakery level/bonuses restored, Patisserie back in market, coins restored |
| Redo after undo | Buy, undo, redo | State matches post-buy state |
| New action clears redo | Buy A, undo A, buy B | Redo stack empty; cannot redo A |
| Stack clears on end-turn | Buy, end turn | Undo stack empty in next turn |
| Empty stack no-op | Undo with empty stack | No error, no state change |
| Multiple undos | Buy A, buy B, undo, undo | Both reversed; state matches initial |
| Activity log consistency | Buy, undo | Activity log matches pre-buy state (entries removed) |

### B.4 Hint Quality Validation

To validate that hints are useful, the following curated scenarios (from `playtest-scenarios.md`) should produce expected recommendations:

| Scenario | Seed | Turn | Expected Hint Category |
|----------|------|------|----------------------|
| Quick Bankruptcy | `sweep-63` | 1 | Buy cheapest business (survival) |
| Comfortable Win | `Scenario-FoodFocus` | 3 | Buy bridge card for synergy (Cafe or similar) |
| Bridge Synergy Powerhouse | `Bridge-Master-7` | 5 | Upgrade or buy bridge card |

These are manual validation scenarios, not automated test gates. The hint should match the Greedy strategy's recommendation; whether the recommendation is "good advice" is evaluated qualitatively.
