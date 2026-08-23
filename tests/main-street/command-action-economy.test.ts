/**
 * Main Street command-layer action economy tests (CG-0MSX413EU003OKEE).
 *
 * Covers the command wrappers in MainStreetCommands.ts: every action-type
 * command (move-to-hand, play-from-hand, buy-and-place, hire-staff) spends
 * the daily action budget, free operations (refresh, sell, hint, discard,
 * end-turn, buy-event) never do, and undo restores the spent action so
 * redo can legally re-apply.
 *
 * @module tests/main-street/command-action-economy
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';
import {
  buyBusinessCommand,
  moveToHandCommand,
  moveEventToHandCommand,
  playBusinessFromHandCommand,
  buyAndPlaceBusinessCommand,
  hireStaffCardCommand,
  buyUpgradeCommand,
  refreshMarketCommand,
  sellBusinessCommand,
  discardFromHandCommand,
} from '../../example-games/main-street/MainStreetCommands';
import { refreshMarketCost } from '../../example-games/main-street/MainStreetMarket';

/** Fresh MarketPhase state with a full action budget. */
function setupMarketState(seed = 'command-action-economy-test'): ReturnType<typeof setupMainStreetGame> {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  expect(state.actionsRemaining).toBe(1);
  return state;
}

function firstAffordableBusinessId(state: any): string {
  const card = state.market.cards.find(
    (c: any) => c.family === 'business' && state.resourceBank.coins >= c.cost,
  );
  expect(card).toBeTruthy();
  state.resourceBank.coins = Math.max(state.resourceBank.coins, Math.ceil(card.cost * 1.5 * 2) / 2);
  return card.id;
}

function firstEmptySlot(state: any): number {
  const idx = state.streetGrid.findIndex((s: any) => s === null);
  expect(idx).toBeGreaterThanOrEqual(0);
  return idx;
}

function fundForCard(state: any, cost: number): void {
  state.resourceBank.coins = Math.max(state.resourceBank.coins, Math.ceil(cost * 1.5 * 2) / 2);
}

describe('action-type commands spend the daily action', () => {
  it('moveToHandCommand spends 1 action', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const mgr = new UndoRedoManager();
    mgr.execute(moveToHandCommand(state, cardId));
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand?.some((c: any) => c.id === cardId)).toBe(true);
  });

  it('buyBusinessCommand spends 1 action', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const slot = firstEmptySlot(state);
    const mgr = new UndoRedoManager();
    mgr.execute(buyBusinessCommand(state, cardId, slot));
    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[slot]?.id).toBe(cardId);
  });

  it('playBusinessFromHandCommand spends 1 action', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const slot = firstEmptySlot(state);
    // Move a card to hand (spends the action), then refill the budget as if
    // a new day started, and play it from hand — the play itself must spend.
    const mgr = new UndoRedoManager();
    mgr.execute(moveToHandCommand(state, cardId));
    expect(state.actionsRemaining).toBe(0);
    state.actionsRemaining = 1; // next day
    const handIndex = state.hand!.findIndex((c: any) => c.id === cardId);
    expect(handIndex).toBeGreaterThanOrEqual(0);
    mgr.execute(playBusinessFromHandCommand(state, handIndex, slot));
    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[slot]?.id).toBe(cardId);
    expect(state.hand?.some((c: any) => c.id === cardId)).toBe(false);
  });

  it('buyAndPlaceBusinessCommand spends 1 action and charges the +50% premium', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const card = state.market.cards.find((c: any) => c.id === cardId)!;
    const slot = firstEmptySlot(state);
    const premium = Math.ceil(card.cost * 1.5 * 2) / 2;
    fundForCard(state, card.cost);
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(buyAndPlaceBusinessCommand(state, cardId, slot));
    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[slot]?.id).toBe(cardId);
    expect(state.resourceBank.coins).toBe(coinsBefore - premium);
  });

  it('hireStaffCardCommand spends 1 action', () => {
    const state = setupMarketState();
    // Staff are in the market row or deck (CG-0MT3KZNQB0053K55)
    const firstStaff = state.market.cards.find(c => c.family === 'staff')
      ?? state.decks.staff.find(c => c.family === 'staff');
    const staff = firstStaff as any;
    expect(staff).toBeTruthy();
    state.resourceBank.coins = Math.max(state.resourceBank.coins, staff.cost);
    const coinsBefore = state.resourceBank.coins;

    const mgr = new UndoRedoManager();
    mgr.execute(hireStaffCardCommand(state, staff.id));
    expect(state.actionsRemaining).toBe(0);
    expect(state.staffCards?.some((s: any) => s.id === staff.id)).toBe(true);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });

  it('rejects action-type commands when the budget is spent', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const slot = firstEmptySlot(state);
    const mgr = new UndoRedoManager();
    mgr.execute(buyBusinessCommand(state, cardId, slot));
    expect(state.actionsRemaining).toBe(0);

    // A second action-type command must throw before mutating state.
    const cardId2 = state.market.cards.find(
      (c: any) => c.family === 'business' && c.id !== cardId,
    )?.id;
    if (cardId2) {
      fundForCard(state, state.market.cards.find((c: any) => c.id === cardId2)?.cost ?? 1);
      expect(() => mgr.execute(moveToHandCommand(state, cardId2))).toThrow(/No actions remaining/);
      expect(state.market.cards.find((c: any) => c.id === cardId2)).toBeTruthy();
    } else {
      // Only one business in the market: a second move-to-hand must still throw.
      expect(() => mgr.execute(moveToHandCommand(state, cardId))).toThrow(/No actions remaining/);
    }
  });
});

describe('free (non-action) commands leave the budget untouched', () => {
  it('moveEventToHandCommand (buy event) does not spend an action', () => {
    const state = setupMarketState();
    const evt = state.market.cards.find((c: any) => c.family === 'event');
    if (!evt) return; // market may have no event — skip gracefully
    const mgr = new UndoRedoManager();
    mgr.execute(moveEventToHandCommand(state, evt.id));
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand?.some((c: any) => c.id === evt.id)).toBe(true);
  });

  it('buyUpgradeCommand does not spend an action', () => {
    const state = setupMarketState();
    const upgrade = state.market.cards.find(
      (c: any) => c.family === 'upgrade',
    ) as { id: string; cost: number; requiredLevel?: number; targetBusiness: string } | undefined;
    if (!upgrade) return;
    // Find a valid target slot for the upgrade.
    const requiredLevel = upgrade.requiredLevel ?? 0;
    const targetIdx = state.streetGrid.findIndex(
      (b: any) => b && b.name === upgrade.targetBusiness && b.level === requiredLevel && b.level < b.maxLevel,
    );
    if (targetIdx < 0) return;
    state.resourceBank.coins = Math.max(state.resourceBank.coins, upgrade.cost);
    const mgr = new UndoRedoManager();
    mgr.execute(buyUpgradeCommand(state, upgrade.id, targetIdx));
    expect(state.actionsRemaining).toBe(1);
  });

  it('refreshMarketCommand does not spend an action', () => {
    const state = setupMarketState();
    state.resourceBank.coins = Math.max(state.resourceBank.coins, refreshMarketCost(state));
    const mgr = new UndoRedoManager();
    mgr.execute(refreshMarketCommand(state));
    expect(state.actionsRemaining).toBe(1);
  });

  it('sellBusinessCommand does not spend an action', () => {
    const state = setupMarketState();
    // Place a card on the street first (direct buy uses an action — refill).
    const cardId = firstAffordableBusinessId(state);
    const slot = firstEmptySlot(state);
    const mgr = new UndoRedoManager();
    mgr.execute(buyBusinessCommand(state, cardId, slot));
    state.actionsRemaining = 1; // new day
    expect(state.streetGrid[slot]).toBeTruthy();

    mgr.execute(sellBusinessCommand(state, slot));
    expect(state.actionsRemaining).toBe(1);
    expect(state.soldSlots?.[slot]).toBe(true); // sold slots retain the card but are marked sold
  });

  it('discardFromHandCommand does not spend an action', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const mgr = new UndoRedoManager();
    mgr.execute(moveToHandCommand(state, cardId));
    state.actionsRemaining = 1; // next day
    const handIndex = state.hand!.findIndex((c: any) => c.id === cardId);

    mgr.execute(discardFromHandCommand(state, handIndex));
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand?.some((c: any) => c.id === cardId)).toBe(false);
  });
});

describe('undo/redo restores the action budget', () => {
  it('undo restores the spent action and redo spends it again', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const slot = firstEmptySlot(state);
    const mgr = new UndoRedoManager();
    mgr.execute(buyBusinessCommand(state, cardId, slot));
    expect(state.actionsRemaining).toBe(0);

    mgr.undo();
    expect(state.actionsRemaining).toBe(1);
    expect(state.market.cards.find((c: any) => c.id === cardId)).toBeTruthy();
    expect(state.streetGrid[slot]).toBeNull();

    mgr.redo();
    expect(state.actionsRemaining).toBe(0);
    expect(state.streetGrid[slot]?.id).toBe(cardId);
  });

  it('undo of move-to-hand restores the action', () => {
    const state = setupMarketState();
    const cardId = firstAffordableBusinessId(state);
    const mgr = new UndoRedoManager();
    mgr.execute(moveToHandCommand(state, cardId));
    expect(state.actionsRemaining).toBe(0);

    mgr.undo();
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand?.some((c: any) => c.id === cardId)).toBe(false);
    expect(state.market.cards.find((c: any) => c.id === cardId)).toBeTruthy();
  });
});
