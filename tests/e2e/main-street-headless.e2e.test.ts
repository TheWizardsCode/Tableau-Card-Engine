import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateTranscriptFile } from '../../scripts/validate-transcript';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  computeScore,
  type PlayerAction,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canPurchaseEvent,
} from '../../example-games/main-street/MainStreetMarket';

const OUT_DIR = path.join('tmp', 'test-e2e-main-street');
fs.mkdirSync(OUT_DIR, { recursive: true });

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

/**
 * Runs a full greedy headless game (mirrors tests/main-street/smoke-scenario.test.ts).
 */
function runGreedyGame(seed: string, maxTurns = 30): {
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
} {
  const startedAt = new Date().toISOString();
  const state = setupMainStreetGame({ seed });
  const turns: TurnRecord[] = [];

  while (state.gameResult === 'playing' && state.turn <= maxTurns) {
    executeDayStart(state);

    const actions: PlayerAction[] = [];
    const executed: { type: string; detail: string }[] = [];

    const emptySlots = getEmptySlots(state);
    const affordable = getAffordableBusinessCards(state);
    affordable.sort((a, b) => a.cost - b.cost);
    if (affordable.length > 0 && emptySlots.length > 0) {
      const card = affordable[0];
      const slot = emptySlots[0];
      actions.push({ type: 'buy-business', cardId: card.id, slotIndex: slot });
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

    for (const action of actions) {
      if (action.type === 'end-turn') break;
      try {
        executeAction(state, action);
        switch (action.type) {
          case 'buy-business': {
            const a = action as { type: string; cardId: string; slotIndex: number };
            executed.push({ type: 'buy-business', detail: `${a.cardId} -> slot ${a.slotIndex}` });
            break;
          }
          case 'buy-upgrade': {
            const a = action as { type: string; cardId: string; targetSlot?: number };
            executed.push({ type: 'buy-upgrade', detail: `${a.cardId} -> slot ${a.targetSlot}` });
            break;
          }
          case 'buy-event': {
            const a = action as { type: string; cardId: string };
            executed.push({ type: 'buy-event', detail: a.cardId });
            break;
          }
        }
      } catch {
        // Illegal action — skip
      }
    }

    if (executed.length === 0) {
      executed.push({ type: 'skip', detail: 'No affordable actions' });
    }

    const turnResult: TurnResult = processEndOfTurn(state);

    turns.push({
      turn: turns.length + 1,
      actions: executed,
      income: turnResult.income ? turnResult.income.total : null,
      incident: turnResult.incident ? turnResult.incident.name : null,
      coinsAfter: state.resourceBank.coins,
      reputationAfter: state.resourceBank.reputation,
      score: computeScore(state),
      gridOccupied: state.streetGrid.filter(s => s !== null).length,
    });

    if (state.gameResult !== 'playing') break;
  }

  const endedAt = new Date().toISOString();

  return {
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
}

function convertDemoToSchema(demo: ReturnType<typeof runGreedyGame>): any {
  const events: any[] = [];
  for (const t of demo.turns) {
    const turn = t.turn;
    for (const a of t.actions) {
      events.push({ type: 'action', turn, action: { type: a.type, detail: a.detail } });
    }
    events.push({ type: 'turn-end', turn });
  }
  events.push({ type: 'game-end', turn: demo.totalTurns, finalScore: demo.finalScore, result: { outcome: demo.result }, endReason: demo.endReason });

  const converted = {
    version: 1,
    gameType: 'main-street',
    startedAt: demo.startedAt,
    endedAt: demo.endedAt,
    initialState: { seed: demo.seed },
    events,
    results: { finalScore: demo.finalScore, result: demo.result, endReason: demo.endReason },
  };
  return converted;
}

describe('Main Street headless demo e2e', () => {
  it('runs a short headless Main Street session and validates output', () => {
    const seed = `e2e-${Date.now()}`;
    const demo = runGreedyGame(seed);

    // Basic smoke assertions on demo output
    expect(demo).toBeDefined();
    expect(demo.game).toBe('main-street');
    expect(typeof demo.finalScore).toBe('number');
    expect(Array.isArray(demo.turns)).toBe(true);
    expect(demo.turns.length).toBeGreaterThan(0);

    const outPath = path.join(OUT_DIR, `main-street-demo-${seed}.json`);
    fs.writeFileSync(outPath, JSON.stringify(demo, null, 2));

    // Convert to canonical-ish schema and run AJV validation
    const converted = convertDemoToSchema(demo);
    const convertedPath = path.join(OUT_DIR, `main-street-demo-${seed}.converted.json`);
    fs.writeFileSync(convertedPath, JSON.stringify(converted, null, 2));

    const schemaPath = path.resolve('schemas', 'main-street-transcript.schema.json');
    const result = validateTranscriptFile(schemaPath, convertedPath);
    if (!result.valid) {
      console.error('Schema validation errors:', result.errors);
    }
    expect(result.valid).toBe(true);
  }, 60_000);
});
