#!/usr/bin/env node
/**
 * Playtest Scenario Runner: Main Street
 *
 * Runs the 5 curated playtest scenarios defined in
 * docs/main-street/playtest-scenarios.md and reports pass/fail
 * against expected outcomes.
 *
 * Usage:
 *   npx tsx scripts/playtest-scenarios.ts
 *   npx tsx scripts/playtest-scenarios.ts --verbose
 *
 * @module
 */

import { setupMainStreetGame } from '../example-games/main-street/MainStreetState';
import type { MainStreetState } from '../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  type PlayerAction,
} from '../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canPurchaseEvent,
} from '../example-games/main-street/MainStreetMarket';

// ── CLI Args ────────────────────────────────────────────────

const verbose = process.argv.includes('--verbose');

// ── Scenario Definitions ────────────────────────────────────

interface ScenarioExpectation {
  name: string;
  seed: string;
  expectResult: 'win' | 'loss';
  expectReason?: string;
  scoreMin?: number;
  scoreMax?: number;
  turnsMin?: number;
  turnsMax?: number;
}

const SCENARIOS: ScenarioExpectation[] = [
  {
    name: 'Quick Bankruptcy',
    seed: 'sweep-63',
    expectResult: 'loss',
    expectReason: 'bankruptcy',
    scoreMax: 20,
  },
  {
    name: 'Reputation Collapse',
    seed: 'sweep-75',
    expectResult: 'loss',
    expectReason: 'reputation_collapse',
    turnsMax: 6,
  },
  {
    name: 'Slow Grind',
    seed: 'sweep-14',
    expectResult: 'win',
    scoreMin: 150,
    scoreMax: 165,
    turnsMin: 15,
  },
  {
    name: 'Comfortable Win',
    seed: 'Scenario-FoodFocus',
    expectResult: 'win',
    scoreMin: 150,
    scoreMax: 170,
    turnsMin: 10,
    turnsMax: 15,
  },
  {
    name: 'Bridge Synergy Powerhouse',
    seed: 'Bridge-Master-7',
    expectResult: 'win',
    scoreMin: 165,
    turnsMax: 12,
  },
];

// ── Greedy Strategy (same as demo-main-street.ts) ───────────

function chooseActions(state: MainStreetState): PlayerAction[] {
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

  if (state.heldEvent !== null) {
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

// ── Runner ──────────────────────────────────────────────────

interface ScenarioResult {
  scenario: ScenarioExpectation;
  actualResult: string;
  actualScore: number;
  actualTurns: number;
  actualReason: string;
  passed: boolean;
  failures: string[];
}

function runScenario(scenario: ScenarioExpectation): ScenarioResult {
  const state = setupMainStreetGame({ seed: scenario.seed });
  let turnCount = 0;

  while (state.gameResult === 'playing' && state.turn <= 20) {
    executeDayStart(state);
    const planned = chooseActions(state);
    for (const action of planned) {
      if (action.type === 'end-turn') break;
      try { executeAction(state, action); } catch { /* skip */ }
    }
    processEndOfTurn(state);
    turnCount++;
    if (state.gameResult !== 'playing') break;
  }

  const score = state.finalScore;
  const failures: string[] = [];

  if (state.gameResult !== scenario.expectResult) {
    failures.push(`result: expected ${scenario.expectResult}, got ${state.gameResult}`);
  }
  if (scenario.expectReason && state.endReason !== scenario.expectReason) {
    failures.push(`reason: expected ${scenario.expectReason}, got ${state.endReason}`);
  }
  if (scenario.scoreMin !== undefined && score < scenario.scoreMin) {
    failures.push(`score too low: ${score} < ${scenario.scoreMin}`);
  }
  if (scenario.scoreMax !== undefined && score > scenario.scoreMax) {
    failures.push(`score too high: ${score} > ${scenario.scoreMax}`);
  }
  if (scenario.turnsMin !== undefined && turnCount < scenario.turnsMin) {
    failures.push(`too few turns: ${turnCount} < ${scenario.turnsMin}`);
  }
  if (scenario.turnsMax !== undefined && turnCount > scenario.turnsMax) {
    failures.push(`too many turns: ${turnCount} > ${scenario.turnsMax}`);
  }

  return {
    scenario,
    actualResult: state.gameResult,
    actualScore: score,
    actualTurns: turnCount,
    actualReason: state.endReason ?? 'none',
    passed: failures.length === 0,
    failures,
  };
}

// ── Main ────────────────────────────────────────────────────

console.log('Main Street: Playtest Scenario Runner');
console.log('=====================================\n');

let allPassed = true;

for (const scenario of SCENARIOS) {
  const result = runScenario(scenario);
  const icon = result.passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${scenario.name} (seed: ${scenario.seed})`);
  console.log(`       Result: ${result.actualResult} | Score: ${result.actualScore} | Turns: ${result.actualTurns} | Reason: ${result.actualReason}`);

  if (!result.passed) {
    allPassed = false;
    for (const f of result.failures) {
      console.log(`       >> ${f}`);
    }
  }

  if (verbose) {
    console.log(`       Expected: result=${scenario.expectResult} reason=${scenario.expectReason ?? 'any'} score=${scenario.scoreMin ?? '*'}-${scenario.scoreMax ?? '*'} turns=${scenario.turnsMin ?? '*'}-${scenario.turnsMax ?? '*'}`);
  }

  console.log();
}

console.log('-------------------------------------');
console.log(allPassed ? 'All scenarios passed.' : 'Some scenarios FAILED.');
process.exit(allPassed ? 0 : 1);
