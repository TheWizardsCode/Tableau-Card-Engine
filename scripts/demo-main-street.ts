#!/usr/bin/env node
/**
 * Demo: Main Street -- Headless Deterministic Playthrough
 *
 * Runs a headless game with a fixed seed, executing a simple greedy
 * strategy (buy the cheapest affordable business, place in the first
 * empty slot, buy events when cheap, skip otherwise). Emits a JSON
 * transcript to stdout.
 *
 * Usage:
 *   npx tsx scripts/demo-main-street.ts
 *   npx tsx scripts/demo-main-street.ts --seed MySeed
 *
 * @module
 */

import { setupMainStreetGame } from '../example-games/main-street/MainStreetState';
import type { MainStreetState } from '../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  computeScore,
  type PlayerAction,
  type TurnResult,
} from '../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canPurchaseEvent,
} from '../example-games/main-street/MainStreetMarket';
// Card types used only for type narrowing in inline action casting

// ── CLI Args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const seedIdx = args.indexOf('--seed');
const seed = seedIdx >= 0 && args[seedIdx + 1] ? args[seedIdx + 1] : 'DemoSeed42';

// ── Transcript Types ────────────────────────────────────────

interface TurnRecord {
  turn: number;
  actions: { type: string; detail: string }[];
  income: number | null;
  incident: string | null;
  coinsAfter: number;
  reputationAfter: number;
  score: number;
  gridOccupied: number;
}

interface DemoTranscript {
  game: 'main-street';
  version: '1.0.0';
  seed: string;
  startedAt: string;
  endedAt: string;
  totalTurns: number;
  result: 'win' | 'loss';
  endReason: string | null;
  finalScore: number;
  turns: TurnRecord[];
}

// ── Greedy Strategy ─────────────────────────────────────────

/**
 * Simple greedy strategy: buy the cheapest affordable business and place
 * it in the first empty slot. If no business is affordable, try to buy
 * an upgrade. If nothing works, end turn.
 */
function chooseActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];

  // Try to buy affordable businesses (cheapest first)
  const emptySlots = getEmptySlots(state);
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);

  for (const card of affordable) {
    if (emptySlots.length === 0) break;
    if (state.resourceBank.coins < card.cost) break;
    const slot = emptySlots.shift()!;
    actions.push({ type: 'buy-business', cardId: card.id, slotIndex: slot });
    // Simulate cost deduction for subsequent decisions
    state.resourceBank.coins -= card.cost;
    // Note: we re-add this after because executeAction does the real deduction
    state.resourceBank.coins += card.cost;
    break; // One business per turn is a safe strategy
  }

  // Play held Investment event if we have one
  if (state.heldEvent !== null) {
    actions.push({ type: 'play-event' });
  }

  // Try to buy an affordable event (if not already holding one)
  for (const eventCard of state.market.event) {
    const result = canPurchaseEvent(state, eventCard.id);
    if (result.legal) {
      actions.push({ type: 'buy-event', cardId: eventCard.id });
      break;
    }
  }

  // Try to buy an upgrade if we have matching businesses
  const upgrades = getAffordableUpgradeCards(state);
  if (upgrades.length > 0) {
    const upg = upgrades[0];
    // Find a matching business slot
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

// ── Main ────────────────────────────────────────────────────

const startedAt = new Date().toISOString();
const state = setupMainStreetGame({ seed });
const turns: TurnRecord[] = [];

while (state.gameResult === 'playing' && state.turn <= 20) {
  // DayStart
  executeDayStart(state);

  // Choose and execute actions
  const planned = chooseActions(state);
  const executedActions: { type: string; detail: string }[] = [];

  for (const action of planned) {
    if (action.type === 'end-turn') break;
    try {
      executeAction(state, action);
      switch (action.type) {
        case 'buy-business': {
          const a = action as { type: string; cardId: string; slotIndex: number };
          executedActions.push({ type: 'buy-business', detail: `${a.cardId} -> slot ${a.slotIndex}` });
          break;
        }
        case 'buy-upgrade': {
          const a = action as { type: string; cardId: string; targetSlot?: number };
          executedActions.push({ type: 'buy-upgrade', detail: `${a.cardId} -> slot ${a.targetSlot}` });
          break;
        }
        case 'buy-event': {
          const a = action as { type: string; cardId: string };
          executedActions.push({ type: 'buy-event', detail: a.cardId });
          break;
        }
      }
    } catch {
      // Action was illegal, skip it
    }
  }

  if (executedActions.length === 0) {
    executedActions.push({ type: 'skip', detail: 'No affordable actions' });
  }

  // Process end of turn
  const turnResult: TurnResult = processEndOfTurn(state);
  const gridOccupied = state.streetGrid.filter(s => s !== null).length;

  turns.push({
    turn: turns.length + 1,
    actions: executedActions,
    income: turnResult.income ? turnResult.income.total : null,
    incident: turnResult.incident ? turnResult.incident.name : null,
    coinsAfter: state.resourceBank.coins,
    reputationAfter: state.resourceBank.reputation,
    score: computeScore(state),
    gridOccupied,
  });

  if (state.gameResult !== 'playing') break;
}

const endedAt = new Date().toISOString();

const transcript: DemoTranscript = {
  game: 'main-street',
  version: '1.0.0',
  seed,
  startedAt,
  endedAt,
  totalTurns: turns.length,
  result: state.gameResult === 'win' ? 'win' : 'loss',
  endReason: state.endReason,
  finalScore: state.finalScore,
  turns,
};

// Emit JSON transcript to stdout
console.log(JSON.stringify(transcript, null, 2));

// Summary to stderr so it doesn't pollute the JSON output
process.stderr.write(`\nMain Street Demo Complete\n`);
process.stderr.write(`  Seed:    ${seed}\n`);
process.stderr.write(`  Turns:   ${turns.length}\n`);
process.stderr.write(`  Result:  ${state.gameResult} (${state.endReason})\n`);
process.stderr.write(`  Score:   ${state.finalScore}\n`);
process.stderr.write(`  Grid:    ${state.streetGrid.filter(s => s !== null).length}/10 occupied\n`);
