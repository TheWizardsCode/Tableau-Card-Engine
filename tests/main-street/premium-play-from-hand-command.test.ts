/**
 * Main Street premium-aware play-from-hand command tests
 * (CG-0MT76QNJX005UR93 / CG-0MT24X0SX007RLHN).
 *
 * Verifies that the click-to-click composite placement is fully
 * undoable/redoable:
 *  - the premium-priced composite command records the premium coin
 *    deduction in its undo/redo snapshot;
 *  - undo restores coins and returns the card to hand;
 *  - redo re-applies the premium and places the card on the street;
 *  - the held-card (plan-ahead) path stays listed cost + 1 action;
 *  - the premium path does NOT consume an action (premium replaces it).
 *
 * @module tests/main-street/premium-play-from-hand-command
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import {
  moveToHandCommand,
  playBusinessFromHandCommand,
} from '../../example-games/main-street/MainStreetCommands';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';

/** Fresh MarketPhase state with a full action budget. */
function setupMarketState(): ReturnType<typeof setupMainStreetGame> {
  const state = setupMainStreetGame({ seed: 'premium-play-from-hand-command' });
  executeDayStart(state);
  expect(state.actionsRemaining).toBe(1);
  return state;
}

/** Moves the first affordable business card to hand (consuming the action). */
function moveCardToHand(state: any): { cardId: string; handIndex: number; card: any } {
  const mgr = new UndoRedoManager();
  const card = state.market.cards.find(
    (c: any) => c.family === 'business' && state.resourceBank.coins >= Math.ceil(c.cost * 1.5 * 2) / 2,
  );
  expect(card).toBeTruthy();
  mgr.execute(moveToHandCommand(state, card.id));
  expect(state.actionsRemaining).toBe(0);
  const handIndex = state.hand!.findIndex((c: any) => c.id === card.id);
  expect(handIndex).toBeGreaterThanOrEqual(0);
  return { cardId: card.id, handIndex, card };
}

function firstEmptySlot(state: any): number {
  const idx = state.streetGrid.findIndex((s: any) => s === null);
  expect(idx).toBeGreaterThanOrEqual(0);
  return idx;
}

describe('premium-aware playBusinessFromHandCommand', () => {
  it('premium composite placement deducts the premium and consumes NO action', () => {
    const state = setupMarketState();
    const { handIndex, card } = moveCardToHand(state);
    const slot = firstEmptySlot(state);
    const premium = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(playBusinessFromHandCommand(state, handIndex, slot, premium));

    expect(state.resourceBank.coins).toBe(coinsBefore - premium);
    expect(state.streetGrid[slot]?.id).toBe(card.id);
    expect(state.hand?.some((c: any) => c.id === card.id)).toBe(false);
    // Premium replaces the missing action: zero actions consumed.
    expect(state.actionsRemaining).toBe(0);
  });

  it('premium composite placement is undoable (coins restored, card returns to hand)', () => {
    const state = setupMarketState();
    const { handIndex, cardId, card } = moveCardToHand(state);
    const slot = firstEmptySlot(state);
    const premium = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(playBusinessFromHandCommand(state, handIndex, slot, premium));
    expect(state.resourceBank.coins).toBe(coinsBefore - premium);

    mgr.undo();
    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.hand?.some((c: any) => c.id === cardId)).toBe(true);
    expect(state.streetGrid[slot]).toBeNull();
    // Undo also leaves the action budget untouched (premium path never
    // consumed an action).
    expect(state.actionsRemaining).toBe(0);
    expect(mgr.canRedo()).toBe(true);
  });

  it('redo re-applies the premium and places the card on the street', () => {
    const state = setupMarketState();
    const { handIndex, cardId, card } = moveCardToHand(state);
    const slot = firstEmptySlot(state);
    const premium = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(playBusinessFromHandCommand(state, handIndex, slot, premium));
    mgr.undo();
    expect(state.streetGrid[slot]).toBeNull();

    mgr.redo();
    expect(state.resourceBank.coins).toBe(coinsBefore - premium);
    expect(state.streetGrid[slot]?.id).toBe(cardId);
    expect(state.hand?.some((c: any) => c.id === cardId)).toBe(false);
    expect(mgr.canRedo()).toBe(false);
  });

  it('held-card path (no premiumCost) still consumes 1 action at listed cost', () => {
    const state = setupMarketState();
    const { handIndex, card } = moveCardToHand(state);
    // Refill the action budget as if a new day started (held card played
    // on a later turn) — the play itself must consume the action.
    state.actionsRemaining = 1;
    const slot = firstEmptySlot(state);
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(playBusinessFromHandCommand(state, handIndex, slot));

    expect(state.actionsRemaining).toBe(0);
    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
    expect(state.streetGrid[slot]?.id).toBe(card.id);
    // Undo restores the action as well (full snapshot).
    mgr.undo();
    expect(state.actionsRemaining).toBe(1);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('premium path applies to community-space cards too', () => {
    const state = setupMarketState();
    // Manufacture a community-space card in the market and move it to hand.
    const cs = { id: 'cs-prem', name: 'Library', cost: 10, family: 'community-space', tier: 1 } as any;
    state.market.cards = [cs];
    state.resourceBank.coins = 100;
    const mgrMove = new UndoRedoManager();
    mgrMove.execute(moveToHandCommand(state, cs.id));
    const handIndex = state.hand!.findIndex((c: any) => c.id === cs.id);
    const slot = firstEmptySlot(state);
    const premium = Math.ceil(10 * 1.5 * 2) / 2; // 15
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(playBusinessFromHandCommand(state, handIndex, slot, premium));

    expect(state.resourceBank.coins).toBe(coinsBefore - premium);
    expect(state.streetGrid[slot]?.id).toBe(cs.id);
    expect(state.actionsRemaining).toBe(0);
  });
});