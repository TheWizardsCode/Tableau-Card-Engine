/**
 * Main Street: Challenge Undo/Redo Integration (CG-0MU8N7JND002I7CG)
 *
 * End-to-end integration tests spanning the command layer, the challenge
 * evaluator, the undo snapshot and the `performUndo` warning dialog:
 *
 *  1. undo-cancel  — "Keep Completed" leaves the completion and bonus intact.
 *  2. undo-confirm — the completion is revoked (list, flag, log, score).
 *  3. redo (after confirm) re-completes without duplicating state or log.
 *  4. redo (after cancel) — state unchanged, no redo entry created.
 *  5. no double-report at end of turn after a mid-turn completion.
 *  6. coverage spans a resource and a placement challenge.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';

import {
  setupMainStreetGame,
  syncResourceBankToLedger,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeWeekStart,
  endTurnHeadless,
  computeScore,
} from '../../example-games/main-street/MainStreetEngine';
import {
  buyAndPlaceBusinessCommand,
  moveToHandCommand,
} from '../../example-games/main-street/MainStreetCommands';
import {
  CHALLENGE_TEMPLATES,
  type ActiveChallenge,
} from '../../example-games/main-street/MainStreetChallenges';
import {
  GRID_SIZE,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import { performUndo } from '../../example-games/main-street/scenes/MainStreetTurnControllerTurnFlow';
import { UndoRedoManager } from '@core-engine/UndoRedoManager';

// ── Helpers ─────────────────────────────────────────────────

function template(id: string): ActiveChallenge['challenge'] {
  const t = CHALLENGE_TEMPLATES.find(c => c.id === id);
  if (!t) throw new Error(`Challenge template '${id}' not found`);
  return t;
}

function activate(state: MainStreetState, ...ids: string[]): void {
  state.activeChallenges = ids.map(id => ({ challenge: template(id), completed: false }));
}

function setupMarketState(seed: string): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeWeekStart(state);
  return state;
}

function makeBiz(id: string): BusinessCard {
  return {
    family: 'business',
    id,
    name: id,
    cost: 100,
    baseIncome: 50,
    synergyTypes: ['Food'],
    maxLevel: 1,
    description: 'test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

function fillStreet(state: MainStreetState, count: number): void {
  for (let i = 0; i < count && i < GRID_SIZE; i++) {
    state.streetGrid[i] = makeBiz(`fill-biz-${i}`);
  }
}

function marketBusinessCard(state: MainStreetState) {
  let card = state.market.cards.find(c => c.family === 'business');
  if (!card) {
    const deckCard = state.decks.business?.find((c: BusinessCard) => c.family === 'business');
    if (!deckCard) throw new Error('No business cards available');
    card = { ...deckCard };
    state.market.cards.push(card);
  }
  return card;
}

function challengeLogCount(state: MainStreetState, title: string): number {
  return state.activityLog.filter(
    e => e.text.includes('Challenge completed:') && e.text.includes(title),
  ).length;
}

/** Mock scene supporting `performUndo` (captures the warning-dialog callbacks). */
function makeUndoScene(state: MainStreetState, undoManager: UndoRedoManager) {
  const dialogCalls: Array<{ titles: string[]; onConfirm: () => void; onCancel: () => void }> = [];
  const scene: any = {
    uiPhase: 'market',
    undoManager,
    state,
    justMovedHandCardId: null,
    showUndoChallengeWarningDialog: vi.fn((titles: string[], onConfirm: () => void, onCancel: () => void) => {
      dialogCalls.push({ titles, onConfirm, onCancel });
    }),
    refreshUndoRedoButtons: vi.fn(),
    refreshAll: vi.fn(),
    msAnimator: { animateUndoRedo: vi.fn() },
  };
  return { scene, tcCtx: { scene } as any, dialogCalls };
}

/** Sets up an 8th-business placement that completes Bustling Street. */
function setupPlacementCompletion(seed: string) {
  const state = setupMarketState(seed);
  activate(state, 'ch-bustling-street');
  state.resourceBank.coins = 100000;
  syncResourceBankToLedger(state);
  fillStreet(state, 7);
  const card = marketBusinessCard(state);
  const cmd = buyAndPlaceBusinessCommand(state, card.id, 7);
  const undoManager = new UndoRedoManager();
  return { state, cmd, undoManager };
}

// ── 1 · undo-cancel ─────────────────────────────────────────

describe('undo-cancel keeps the completion', () => {
  it('"Keep Completed" revokes nothing (placement challenge)', () => {
    const { state, cmd, undoManager } = setupPlacementCompletion('undo-cancel-placement');
    undoManager.execute(cmd);
    const scoreAfterCompletion = computeScore(state);
    expect(state.challengesCompleted).toContain('ch-bustling-street');

    const { tcCtx, dialogCalls } = makeUndoScene(state, undoManager);
    performUndo(tcCtx);
    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].titles).toEqual(['Bustling Street']);
    dialogCalls[0].onCancel();

    expect(state.challengesCompleted).toContain('ch-bustling-street');
    expect(state.activeChallenges[0].completed).toBe(true);
    expect(challengeLogCount(state, 'Bustling Street')).toBe(1);
    expect(computeScore(state)).toBe(scoreAfterCompletion);
    // The action is still undoable (state unchanged, nothing popped).
    expect(undoManager.canUndo()).toBe(true);
    expect(undoManager.canRedo()).toBe(false);
  });
});

// ── 2 · undo-confirm (resource + placement) ─────────────────

describe('undo-confirm revokes the completion', () => {
  it('revokes a placement challenge: list, flag, log and score', () => {
    const { state, cmd, undoManager } = setupPlacementCompletion('undo-confirm-placement');
    const scoreBeforeCommand = computeScore(state);
    undoManager.execute(cmd);

    const { tcCtx, dialogCalls } = makeUndoScene(state, undoManager);
    performUndo(tcCtx);
    dialogCalls[0].onConfirm();

    expect(state.challengesCompleted).not.toContain('ch-bustling-street');
    expect(state.activeChallenges[0].completed).toBe(false);
    expect(challengeLogCount(state, 'Bustling Street')).toBe(0);
    // Undo restores both the challenge state and the coins spent by the
    // command, so the score returns exactly to its pre-command value (the
    // +challenge bonus is gone).
    expect(computeScore(state)).toBe(scoreBeforeCommand);
  });

  it('revokes a resource challenge (Deep Pockets)', () => {
    const state = setupMarketState('undo-confirm-resource');
    activate(state, 'ch-deep-pockets');
    state.resourceBank.coins = 3000;
    syncResourceBankToLedger(state);
    state.maxHandSize = 5;
    const card = marketBusinessCard(state);
    const cmd = moveToHandCommand(state, card.id);
    const undoManager = new UndoRedoManager();
    undoManager.execute(cmd);

    expect(state.challengesCompleted).toContain('ch-deep-pockets');
    expect(challengeLogCount(state, 'Deep Pockets')).toBe(1);

    const { tcCtx, dialogCalls } = makeUndoScene(state, undoManager);
    performUndo(tcCtx);
    expect(dialogCalls[0].titles).toEqual(['Deep Pockets']);
    dialogCalls[0].onConfirm();

    expect(state.challengesCompleted).not.toContain('ch-deep-pockets');
    expect(state.activeChallenges[0].completed).toBe(false);
    expect(challengeLogCount(state, 'Deep Pockets')).toBe(0);
  });
});

// ── 3 · redo after undo-confirm ─────────────────────────────

describe('redo after undo-confirm', () => {
  it('re-completes the challenge without duplicating state or log entries', () => {
    const { state, cmd, undoManager } = setupPlacementCompletion('redo-after-confirm');
    undoManager.execute(cmd);
    const { tcCtx, dialogCalls } = makeUndoScene(state, undoManager);
    performUndo(tcCtx);
    dialogCalls[0].onConfirm();
    expect(state.challengesCompleted).not.toContain('ch-bustling-street');

    undoManager.redo();

    expect(state.challengesCompleted.filter(id => id === 'ch-bustling-street')).toHaveLength(1);
    expect(state.activeChallenges[0].completed).toBe(true);
    expect(challengeLogCount(state, 'Bustling Street')).toBe(1);
  });
});

// ── 4 · redo after undo-cancel ──────────────────────────────

describe('redo after undo-cancel', () => {
  it('leaves state unchanged and does not create a redo entry', () => {
    const { state, cmd, undoManager } = setupPlacementCompletion('redo-after-cancel');
    undoManager.execute(cmd);
    const { tcCtx, dialogCalls } = makeUndoScene(state, undoManager);
    performUndo(tcCtx);
    dialogCalls[0].onCancel();

    // Undo was aborted, so there is nothing on the redo stack.
    expect(undoManager.canRedo()).toBe(false);
    expect(state.challengesCompleted.filter(id => id === 'ch-bustling-street')).toHaveLength(1);
    expect(challengeLogCount(state, 'Bustling Street')).toBe(1);
    // The command is still the top of the undo stack, so re-running undo
    // would warn again (idempotent, no duplicate log).
    expect(undoManager.canUndo()).toBe(true);
  });
});

// ── 5 · no double-report at end of turn ─────────────────────

describe('no double-report at end of turn', () => {
  it('does not re-report a mid-turn challenge completion in TurnResult', () => {
    const state = setupMarketState('no-double-report');
    activate(state, 'ch-deep-pockets');
    state.resourceBank.coins = 3000;
    syncResourceBankToLedger(state);
    state.maxHandSize = 5;
    const card = marketBusinessCard(state);
    const undoManager = new UndoRedoManager();
    undoManager.execute(moveToHandCommand(state, card.id));

    expect(state.challengesCompleted).toContain('ch-deep-pockets');

    const result = endTurnHeadless(state);
    expect(result.newlyCompletedChallenges).not.toContain('ch-deep-pockets');
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
    expect(challengeLogCount(state, 'Deep Pockets')).toBe(1);
  });
});
