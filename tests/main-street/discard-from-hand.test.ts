/**
 * Main Street: Discard from Hand — Reputation Cost (CG-0MTQ7KUVF009ELQK)
 *
 * Validates that discarding a card from hand deducts the card's coin cost
 * from the player's reputation (clamped at 0), applies to all families,
 * and remains action-free.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { executeWeekStart, executeAction } from '../../example-games/main-street/MainStreetEngine';
import { discardFromHand } from '../../example-games/main-street/MainStreetMarketHand';
import type { BusinessCard, CommunitySpaceCard, UpgradeCard, EventCard } from '../../example-games/main-street/MainStreetCards';
import { UndoRedoManager } from '@core-engine/UndoRedoManager';
import { discardFromHandCommand } from '../../example-games/main-street/MainStreetCommands';

// ── Helpers ────────────────────────────────────────────────────

function makeBiz(id: string, name: string, cost: number): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 0.5,
    synergyTypes: [],
    maxLevel: 1,
    description: 'test card',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

function makeCommunitySpace(id: string, name: string, cost: number): CommunitySpaceCard {
  return {
    family: 'community-space' as const,
    id,
    name,
    cost,
    baseIncome: 0,
    ongoingCost: 0,
    synergyTypes: [],
    maxLevel: 1,
    description: 'test',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
}

function makeUpgrade(id: string, name: string, cost: number): UpgradeCard {
  return {
    family: 'upgrade' as const,
    id,
    name,
    targetBusiness: '',
    cost,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    description: 'test',
    appliedUpgrades: [],
  } as UpgradeCard;
}

function makeEvent(id: string, name: string, cost: number): EventCard {
  return {
    family: 'event' as const,
    id,
    name,
    trigger: 'Investment' as const,
    cost,
    effect: 'test effect',
    target: 'All' as const,
    coinDelta: 1,
    reputationDelta: 0,
  };
}

function makeZeroCostBiz(id: string, name: string): BusinessCard {
  return makeBiz(id, name, 0);
}

// ── Reputation Cost ────────────────────────────────────────────

describe('discard deducts reputation equal to card cost', () => {
  it('deducts card.cost from reputation for a business card', () => {
    const state = setupMainStreetGame({ seed: 'disc-rep-biz' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeBiz('disc-biz', 'Business Card', 3);
    state.hand.push(card);
    const repBefore = state.resourceBank.reputation;
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(repBefore - card.cost);
    expect(state.hand.length).toBe(0);
  });

  it('deducts card.cost for a community-space card', () => {
    const state = setupMainStreetGame({ seed: 'disc-rep-cs' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeCommunitySpace('disc-cs', 'Community Space', 4);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(6);
  });

  it('deducts card.cost for an upgrade card', () => {
    const state = setupMainStreetGame({ seed: 'disc-rep-upg' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeUpgrade('disc-upg', 'Upgrade Card', 5);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(5);
  });

  it('deducts card.cost for an event card', () => {
    const state = setupMainStreetGame({ seed: 'disc-rep-evt' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeEvent('disc-evt', 'Event Card', 2);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(8);
  });
});

// ── Clamp at 0 ─────────────────────────────────────────────────

describe('reputation clamped at 0', () => {
  it('clamps at 0 when the card cost exceeds reputation', () => {
    const state = setupMainStreetGame({ seed: 'disc-clamp' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 2;
    const card = makeBiz('disc-clamp-biz', 'Expensive', 5);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(0);
    expect(state.hand.length).toBe(0);
  });

  it('allows discard even when reputation would go negative', () => {
    const state = setupMainStreetGame({ seed: 'disc-poor' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 1;
    const card = makeBiz('disc-poor-biz', 'Very Expensive', 10);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(0);
  });

  it('deducts nothing for a 0-cost card', () => {
    const state = setupMainStreetGame({ seed: 'disc-zero' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeZeroCostBiz('disc-zero-biz', 'Free to Discard');
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.resourceBank.reputation).toBe(10);
  });
});

// ── Action Economy ─────────────────────────────────────────────

describe('discard remains action-free', () => {
  it('does not change actionsRemaining', () => {
    const state = setupMainStreetGame({ seed: 'disc-no-action' });
    executeWeekStart(state, true);
    const card = makeBiz('disc-na', 'No Action', 2);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.actionsRemaining).toBe(1);
  });

  it('does not change actionsRemaining when actions are 0', () => {
    const state = setupMainStreetGame({ seed: 'disc-no-action-0' });
    executeWeekStart(state, true);
    const card = makeBiz('disc-na0', 'No Action 0', 2);
    state.hand.push(card);
    state.actionsRemaining = 0;
    discardFromHand(state, 0);
    expect(state.actionsRemaining).toBe(0);
  });
});

// ── Family Discard Piles ───────────────────────────────────────

describe('cards routed to correct family discard piles', () => {
  it('business card goes to discards.business', () => {
    const state = setupMainStreetGame({ seed: 'disc-fam-biz' });
    executeWeekStart(state, true);
    const card = makeBiz('disc-fam-biz', 'Biz', 1);
    state.hand.push(card);
    const before = state.discards.business.length;
    discardFromHand(state, 0);
    expect(state.discards.business.length).toBe(before + 1);
    expect(state.discards.business[before].id).toBe('disc-fam-biz');
  });

  it('community-space card goes to discards.communitySpace', () => {
    const state = setupMainStreetGame({ seed: 'disc-fam-cs' });
    executeWeekStart(state, true);
    const card = makeCommunitySpace('disc-fam-cs', 'CS', 1);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.discards.communitySpace.some(c => c.id === 'disc-fam-cs')).toBe(true);
  });

  it('upgrade card goes to discards.upgrade', () => {
    const state = setupMainStreetGame({ seed: 'disc-fam-upg' });
    executeWeekStart(state, true);
    const card = makeUpgrade('disc-fam-upg', 'Upg', 1);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.discards.upgrade.some(c => c.id === 'disc-fam-upg')).toBe(true);
  });

  it('event card goes to discards.event', () => {
    const state = setupMainStreetGame({ seed: 'disc-fam-evt' });
    executeWeekStart(state, true);
    const card = makeEvent('disc-fam-evt', 'Evt', 1);
    state.hand.push(card);
    discardFromHand(state, 0);
    expect(state.discards.event.some(c => c.id === 'disc-fam-evt')).toBe(true);
  });
});

// ── Undo/Redo (command path — reputation is captured via resourceBank snapshot) ─

describe('undo/redo via discardFromHandCommand', () => {
  it('undo restores reputation', () => {
    const state = setupMainStreetGame({ seed: 'disc-undo-rep' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeBiz('disc-undo', 'Undo Card', 3);
    state.hand.push(card);
    const mgr = new UndoRedoManager();
    mgr.execute(discardFromHandCommand(state, 0));
    expect(state.resourceBank.reputation).toBe(7);
    expect(state.hand.length).toBe(0);

    mgr.undo();
    expect(state.resourceBank.reputation).toBe(10);
    expect(state.hand.length).toBe(1);
    expect(state.hand[0].id).toBe('disc-undo');
  });

  it('redo re-applies the reputation deduction', () => {
    const state = setupMainStreetGame({ seed: 'disc-redo-rep' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeBiz('disc-redo', 'Redo Card', 4);
    state.hand.push(card);
    const mgr = new UndoRedoManager();
    mgr.execute(discardFromHandCommand(state, 0));
    expect(state.resourceBank.reputation).toBe(6);
    mgr.undo();
    expect(state.resourceBank.reputation).toBe(10);
    mgr.redo();
    expect(state.resourceBank.reputation).toBe(6);
    expect(state.hand.length).toBe(0);
  });

  it('undo restores the hand, the business discard pile and reputation (no duplicate)', () => {
    const state = setupMainStreetGame({ seed: 'disc-undo-pile-biz' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeBiz('disc-pile-biz', 'Pile Business', 3);
    state.hand.push(card);
    const mgr = new UndoRedoManager();

    mgr.execute(discardFromHandCommand(state, 0));
    expect(state.hand.length).toBe(0);
    expect(state.discards.business.some(c => c.id === 'disc-pile-biz')).toBe(true);
    expect(state.resourceBank.reputation).toBe(7);

    mgr.undo();
    expect(state.hand.some(c => c.id === 'disc-pile-biz')).toBe(true);
    // The card must NOT remain in the discard pile while also in the hand.
    expect(state.discards.business.some(c => c.id === 'disc-pile-biz')).toBe(false);
    expect(state.resourceBank.reputation).toBe(10);

    mgr.redo();
    expect(state.hand.length).toBe(0);
    expect(state.discards.business.some(c => c.id === 'disc-pile-biz')).toBe(true);
    expect(state.resourceBank.reputation).toBe(7);
  });

  it('undo restores the community-space discard pile (non-business family)', () => {
    const state = setupMainStreetGame({ seed: 'disc-undo-pile-cs' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    const card = makeCommunitySpace('disc-pile-cs', 'Pile Community Space', 4);
    state.hand.push(card);
    const mgr = new UndoRedoManager();

    mgr.execute(discardFromHandCommand(state, 0));
    expect(state.discards.communitySpace.some(c => c.id === 'disc-pile-cs')).toBe(true);

    mgr.undo();
    expect(state.hand.some(c => c.id === 'disc-pile-cs')).toBe(true);
    expect(state.discards.communitySpace.some(c => c.id === 'disc-pile-cs')).toBe(false);

    mgr.redo();
    expect(state.discards.communitySpace.some(c => c.id === 'disc-pile-cs')).toBe(true);
    expect(state.hand.some(c => c.id === 'disc-pile-cs')).toBe(false);
  });

  it('undo restores the upgrade and event discard piles', () => {
    const state = setupMainStreetGame({ seed: 'disc-undo-pile-multi' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 10;
    state.hand.push(makeUpgrade('disc-pile-upg', 'Pile Upgrade', 2));
    state.hand.push(makeEvent('disc-pile-evt', 'Pile Event', 1));
    const mgr = new UndoRedoManager();

    // Discard the event first (index 1), then the upgrade (now index 0).
    mgr.execute(discardFromHandCommand(state, 1));
    mgr.execute(discardFromHandCommand(state, 0));
    expect(state.discards.event.some(c => c.id === 'disc-pile-evt')).toBe(true);
    expect(state.discards.upgrade.some(c => c.id === 'disc-pile-upg')).toBe(true);

    mgr.undo();
    expect(state.discards.upgrade.some(c => c.id === 'disc-pile-upg')).toBe(false);
    expect(state.discards.event.some(c => c.id === 'disc-pile-evt')).toBe(true);
    expect(state.hand.some(c => c.id === 'disc-pile-upg')).toBe(true);

    mgr.undo();
    expect(state.discards.event.some(c => c.id === 'disc-pile-evt')).toBe(false);
    expect(state.hand.some(c => c.id === 'disc-pile-evt')).toBe(true);
  });
});

// ── executeAction path ────────────────────────────────────────

describe('discard-from-hand via executeAction', () => {
  it('deducts reputation and does not consume an action', () => {
    const state = setupMainStreetGame({ seed: 'disc-act' });
    executeWeekStart(state, true);
    state.resourceBank.reputation = 8;
    const card = makeBiz('disc-act-biz', 'Action Test', 2);
    state.hand.push(card);
    executeAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(state.resourceBank.reputation).toBe(6);
    expect(state.actionsRemaining).toBe(1);
    expect(state.hand.length).toBe(0);
  });
});
