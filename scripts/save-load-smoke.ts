#!/usr/bin/env node
/**
 * Smoke Test: Save/Load -- Deterministic Checkpoint Restore
 *
 * Exercises the full save/load pipeline in a headless Main Street game:
 *   1. Start a seeded game and play several turns (greedy strategy).
 *   2. Save a turn-start checkpoint after turn N.
 *   3. Continue playing to completion from the live state  (path A).
 *   4. Restore the checkpoint and replay from the saved state (path B).
 *   5. Assert final states from path A and path B are identical
 *      (deterministic restore proof).
 *   6. Exercise campaign-persistence save/load round-trip.
 *
 * Usage:
 *   npx tsx scripts/save-load-smoke.ts
 *   npx tsx scripts/save-load-smoke.ts --seed MySeed --checkpoint-after 3
 *
 * Exit code 0 = all assertions passed. Non-zero = failure.
 *
 * @module
 */

// ── Node.js localStorage stub ───────────────────────────────
// SaveLoadStore requires browser globals. In Node (tsx) we stub
// localStorage the same way the test suite does.

function createLocalStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

// Stub before any engine imports touch the globals
(globalThis as unknown as Record<string, unknown>).indexedDB = undefined;
(globalThis as unknown as Record<string, unknown>).localStorage = createLocalStorageMock();

// ── Imports ─────────────────────────────────────────────────

import { SaveLoadStore } from '../src/core-engine';
import { setupMainStreetGame } from '../example-games/main-street/MainStreetState';
import type { MainStreetState } from '../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  computeScore,
  type PlayerAction,
} from '../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canPurchaseEvent,
} from '../example-games/main-street/MainStreetMarket';
import {
  saveTurnStartCheckpoint,
  loadTurnStartCheckpoint,
  saveCampaignProgress,
  loadCampaignProgress,
  createDefaultCampaignProgress,
} from '../example-games/main-street/MainStreetSaveLoad';

// ── CLI Args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const seedIdx = args.indexOf('--seed');
const seed = seedIdx >= 0 && args[seedIdx + 1] ? args[seedIdx + 1] : 'SaveLoadSmoke42';

const cpIdx = args.indexOf('--checkpoint-after');
const checkpointAfterTurn =
  cpIdx >= 0 && args[cpIdx + 1] ? Math.max(1, parseInt(args[cpIdx + 1], 10)) : 3;

const MAX_TURNS = 20;

// ── Greedy Strategy (same as tests/main-street/smoke-scenario.test.ts) ──

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
      (b) => b !== null && b.upgradePath === upg.targetBusiness && b.level < b.maxLevel,
    );
    if (matchSlot >= 0) {
      actions.push({ type: 'buy-upgrade', cardId: upg.id, targetSlot: matchSlot });
    }
  }

  actions.push({ type: 'end-turn' });
  return actions;
}

// ── Game runner ──────────────────────────────────────────────

interface TurnSnapshot {
  turn: number;
  coins: number;
  reputation: number;
  score: number;
  gridIds: (string | null)[];
  gameResult: string;
}

function snapshotTurn(state: MainStreetState): TurnSnapshot {
  return {
    turn: state.turn,
    coins: state.resourceBank.coins,
    reputation: state.resourceBank.reputation,
    score: computeScore(state),
    gridIds: state.streetGrid.map((b) => b?.id ?? null),
    gameResult: state.gameResult,
  };
}

/**
 * Plays the game from the given state until completion or MAX_TURNS,
 * returning per-turn snapshots.
 */
function playToCompletion(state: MainStreetState): TurnSnapshot[] {
  const snapshots: TurnSnapshot[] = [];

  while (state.gameResult === 'playing' && state.turn <= MAX_TURNS) {
    executeDayStart(state);
    const planned = chooseActions(state);
    for (const action of planned) {
      if (action.type === 'end-turn') break;
      try {
        executeAction(state, action);
      } catch {
        // illegal action, skip
      }
    }
    processEndOfTurn(state);
    snapshots.push(snapshotTurn(state));
    if (state.gameResult !== 'playing') break;
  }

  return snapshots;
}

// ── Assertion helpers ───────────────────────────────────────

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    process.stderr.write(`  PASS  ${label}\n`);
  } else {
    process.stderr.write(`  FAIL  ${label}\n`);
    failures += 1;
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    process.stderr.write(`  PASS  ${label}\n`);
  } else {
    process.stderr.write(`  FAIL  ${label}\n`);
    process.stderr.write(`    expected: ${b.slice(0, 200)}\n`);
    process.stderr.write(`    actual:   ${a.slice(0, 200)}\n`);
    failures += 1;
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  process.stderr.write(`\nSave/Load Smoke Test\n`);
  process.stderr.write(`  Seed:             ${seed}\n`);
  process.stderr.write(`  Checkpoint after: turn ${checkpointAfterTurn}\n`);
  process.stderr.write(`  Max turns:        ${MAX_TURNS}\n\n`);

  const store = new SaveLoadStore();

  // ── Phase 1: Play N turns, save checkpoint ───────────────
  process.stderr.write(`--- Phase 1: Play ${checkpointAfterTurn} turn(s) and save checkpoint ---\n`);
  const stateA = setupMainStreetGame({ seed });
  const earlySnapshots: TurnSnapshot[] = [];

  for (let t = 0; t < checkpointAfterTurn; t++) {
    if (stateA.gameResult !== 'playing' || stateA.turn > MAX_TURNS) break;
    executeDayStart(stateA);
    const planned = chooseActions(stateA);
    for (const action of planned) {
      if (action.type === 'end-turn') break;
      try {
        executeAction(stateA, action);
      } catch {
        // skip
      }
    }
    processEndOfTurn(stateA);
    earlySnapshots.push(snapshotTurn(stateA));
  }

  process.stderr.write(`  Played ${earlySnapshots.length} turn(s) before checkpoint.\n`);
  const checkpointTurn = stateA.turn;
  const checkpointCoins = stateA.resourceBank.coins;
  const checkpointReputation = stateA.resourceBank.reputation;
  process.stderr.write(`  State at checkpoint: turn=${checkpointTurn}, coins=${checkpointCoins}, rep=${checkpointReputation}\n`);

  await saveTurnStartCheckpoint(store, stateA);
  process.stderr.write(`  Checkpoint saved.\n\n`);

  // ── Phase 2: Continue from live state (path A) ───────────
  process.stderr.write(`--- Phase 2: Continue to completion from live state (path A) ---\n`);
  const pathASnapshots = playToCompletion(stateA);
  const pathAFinal = snapshotTurn(stateA);
  process.stderr.write(`  Path A: ${pathASnapshots.length} additional turn(s), result=${stateA.gameResult}, score=${stateA.finalScore}\n\n`);

  // ── Phase 3: Restore checkpoint and replay (path B) ──────
  process.stderr.write(`--- Phase 3: Restore checkpoint and replay (path B) ---\n`);
  const restoredState = await loadTurnStartCheckpoint(store);
  assert(restoredState !== null, 'Checkpoint loaded successfully');

  if (restoredState === null) {
    process.stderr.write(`  ABORT: could not load checkpoint.\n`);
    process.exit(1);
  }

  // Verify restored state matches checkpoint
  assert(restoredState.turn === checkpointTurn, `Restored turn (${restoredState.turn}) matches checkpoint turn (${checkpointTurn})`);
  assertDeepEqual(
    { coins: restoredState.resourceBank.coins, reputation: restoredState.resourceBank.reputation },
    { coins: checkpointCoins, reputation: checkpointReputation },
    'Restored resources match checkpoint (coins & reputation)',
  );

  const pathBSnapshots = playToCompletion(restoredState);
  const pathBFinal = snapshotTurn(restoredState);
  process.stderr.write(`  Path B: ${pathBSnapshots.length} additional turn(s), result=${restoredState.gameResult}, score=${restoredState.finalScore}\n\n`);

  // ── Phase 4: Compare path A vs path B ────────────────────
  process.stderr.write(`--- Phase 4: Deterministic restore verification ---\n`);
  assert(pathASnapshots.length === pathBSnapshots.length, 'Same number of turns in path A and path B');
  assertDeepEqual(pathAFinal.coins, pathBFinal.coins, 'Final coins match');
  assertDeepEqual(pathAFinal.reputation, pathBFinal.reputation, 'Final reputation match');
  assertDeepEqual(pathAFinal.score, pathBFinal.score, 'Final score match');
  assertDeepEqual(pathAFinal.gridIds, pathBFinal.gridIds, 'Final grid IDs match');
  assertDeepEqual(pathAFinal.gameResult, pathBFinal.gameResult, 'Final game result match');

  // Compare every turn snapshot
  let turnMismatches = 0;
  for (let i = 0; i < Math.min(pathASnapshots.length, pathBSnapshots.length); i++) {
    const a = pathASnapshots[i];
    const b = pathBSnapshots[i];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      turnMismatches += 1;
      if (turnMismatches <= 3) {
        process.stderr.write(`  FAIL  Turn ${i + 1} mismatch (first 3 shown)\n`);
        process.stderr.write(`    A: ${JSON.stringify(a).slice(0, 200)}\n`);
        process.stderr.write(`    B: ${JSON.stringify(b).slice(0, 200)}\n`);
      }
    }
  }
  if (turnMismatches === 0) {
    process.stderr.write(`  PASS  All ${pathASnapshots.length} turn snapshots identical\n`);
  } else {
    process.stderr.write(`  FAIL  ${turnMismatches}/${pathASnapshots.length} turn snapshots differ\n`);
    failures += turnMismatches;
  }

  process.stderr.write(`\n`);

  // ── Phase 5: Campaign persistence round-trip ─────────────
  process.stderr.write(`--- Phase 5: Campaign persistence round-trip ---\n`);
  const campaign = createDefaultCampaignProgress();
  campaign.totalRuns = 5;
  campaign.totalWins = 2;
  campaign.persistentReputation = 14;
  campaign.highestScore = pathAFinal.score;
  campaign.unlockedTiers.push('tier-2');

  await saveCampaignProgress(store, campaign);
  const loadedCampaign = await loadCampaignProgress(store);
  assert(loadedCampaign !== null, 'Campaign progress loaded successfully');
  if (loadedCampaign) {
    assertDeepEqual(loadedCampaign.totalRuns, 5, 'Campaign totalRuns preserved');
    assertDeepEqual(loadedCampaign.totalWins, 2, 'Campaign totalWins preserved');
    assertDeepEqual(loadedCampaign.persistentReputation, 14, 'Campaign reputation preserved');
    assertDeepEqual(loadedCampaign.highestScore, pathAFinal.score, 'Campaign highestScore preserved');
    assert(loadedCampaign.unlockedTiers.includes('tier-2'), 'Campaign tier-2 unlock preserved');
  }

  // Verify campaign data is separate from run checkpoint
  const runSlots = await store.list('run-checkpoint', 'main-street');
  const campaignSlots = await store.list('campaign', 'main-street');
  assert(runSlots.length > 0, 'Run checkpoint slot exists');
  assert(campaignSlots.length > 0, 'Campaign slot exists');

  // ── Summary ──────────────────────────────────────────────
  process.stderr.write(`\n========================================\n`);
  if (failures === 0) {
    process.stderr.write(`ALL CHECKS PASSED\n`);
  } else {
    process.stderr.write(`${failures} CHECK(S) FAILED\n`);
  }
  process.stderr.write(`========================================\n\n`);

  // JSON output to stdout (machine-readable)
  const report = {
    test: 'save-load-smoke',
    seed,
    checkpointAfterTurn,
    earlyTurns: earlySnapshots.length,
    pathATurns: pathASnapshots.length,
    pathBTurns: pathBSnapshots.length,
    pathAFinal,
    pathBFinal,
    deterministic: failures === 0,
    campaignRoundTrip: loadedCampaign !== null,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`\nFATAL: ${err}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(2);
});
