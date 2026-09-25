/**
 * Main Street: Per-Action Challenge Evaluation (Command Path)
 *
 * Verifies that the interactive command layer (MainStreetCommands.ts)
 * evaluates challenges after each command's forward mutation, stores the
 * newly completed challenge IDs on the command object, and restores the
 * pre-action challenge completion state on undo (with redo re-completing
 * consistently and without duplicating log entries).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  syncResourceBankToLedger,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { executeWeekStart } from '../../example-games/main-street/MainStreetEngine';
import { buyAndPlaceBusinessCommand } from '../../example-games/main-street/MainStreetCommands';
import {
  CHALLENGE_TEMPLATES,
  type ActiveChallenge,
} from '../../example-games/main-street/MainStreetChallenges';
import {
  GRID_SIZE,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import { UndoRedoManager } from '@core-engine/UndoRedoManager';

// ── Helpers ─────────────────────────────────────────────────

function template(id: string): ActiveChallenge['challenge'] {
  const t = CHALLENGE_TEMPLATES.find(c => c.id === id);
  if (!t) throw new Error(`Challenge template '${id}' not found`);
  return t;
}

/** Replaces active challenges with the given IDs (incomplete). */
function activate(state: MainStreetState, ...ids: string[]): void {
  state.activeChallenges = ids.map(id => ({ challenge: template(id), completed: false }));
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

function setupMarketState(seed: string): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeWeekStart(state);
  return state;
}

function challengeLogCount(state: MainStreetState, title: string): number {
  return state.activityLog.filter(
    e => e.text.includes('Challenge completed:') && e.text.includes(title),
  ).length;
}

/** Returns a market business card, pushing one from the deck if needed. */
function marketBusinessCard(state: MainStreetState) {
  let card = state.market.cards.find(c => c.family === 'business');
  if (!card) {
    const deckCard = state.decks.business?.find((c: BusinessCard) => c.family === 'business');
    if (!deckCard) throw new Error('No business cards available in market or deck');
    card = { ...deckCard };
    state.market.cards.push(card);
  }
  return card;
}

/** Plays the 8th business via a command, returning state + command + manager. */
function placeCompletingBusiness(seed: string) {
  const state = setupMarketState(seed);
  activate(state, 'ch-bustling-street');
  state.resourceBank.coins = 100000;
  syncResourceBankToLedger(state);
  fillStreet(state, 7);

  const card = marketBusinessCard(state);
  const cmd = buyAndPlaceBusinessCommand(state, card.id, 7);
  const mgr = new UndoRedoManager();
  return { state, cmd, mgr, cardId: card.id };
}

// ── AC2/AC3 · Forward evaluation + completed IDs on the command ──

describe('command path · per-action challenge evaluation', () => {
  it('stores newly completed challenge IDs on the command object', () => {
    const { state, cmd, mgr } = placeCompletingBusiness('cmd-per-action-store');

    mgr.execute(cmd);

    expect(cmd.completedChallengeIds).toEqual(['ch-bustling-street']);
    expect(state.activeChallenges[0].completed).toBe(true);
    expect(state.challengesCompleted).toContain('ch-bustling-street');
    expect(challengeLogCount(state, 'Bustling Street')).toBe(1);
  });

  it('leaves completedChallengeIds empty for a command that completes nothing', () => {
    const state = setupMarketState('cmd-per-action-empty');
    activate(state, 'ch-beloved-mayor');
    state.resourceBank.reputation = 0;
    state.resourceBank.coins = 100000;
    syncResourceBankToLedger(state);

    const card = marketBusinessCard(state);
    const cmd = buyAndPlaceBusinessCommand(state, card.id, 0);
    const mgr = new UndoRedoManager();
    mgr.execute(cmd);

    expect(cmd.completedChallengeIds).toEqual([]);
    expect(state.challengesCompleted).toHaveLength(0);
  });
});

// ── AC4 · Undo restores challenge state; redo re-completes ──

describe('command path · undo/redo challenge state', () => {
  it('undo restores challengesCompleted and per-challenge completed flags', () => {
    const { state, cmd, mgr } = placeCompletingBusiness('cmd-per-action-undo');
    mgr.execute(cmd);
    expect(state.challengesCompleted).toContain('ch-bustling-street');

    mgr.undo();

    expect(state.challengesCompleted).not.toContain('ch-bustling-street');
    expect(state.activeChallenges[0].completed).toBe(false);
    // The "Challenge completed" log entry is part of the snapshot and reverts too.
    expect(challengeLogCount(state, 'Bustling Street')).toBe(0);
  });

  it('redo re-completes the challenge without duplicating state or log entries', () => {
    const { state, cmd, mgr } = placeCompletingBusiness('cmd-per-action-redo');
    mgr.execute(cmd);
    mgr.undo();
    mgr.redo();

    expect(cmd.completedChallengeIds).toEqual(['ch-bustling-street']);
    expect(state.challengesCompleted.filter(id => id === 'ch-bustling-street')).toHaveLength(1);
    expect(state.activeChallenges[0].completed).toBe(true);
    expect(challengeLogCount(state, 'Bustling Street')).toBe(1);
  });

  it('undo clears the transient per-action buffer', () => {
    const { state, cmd, mgr } = placeCompletingBusiness('cmd-per-action-buffer');
    mgr.execute(cmd);
    expect(state._newlyCompletedThisAction).toEqual(['ch-bustling-street']);

    mgr.undo();
    expect(state._newlyCompletedThisAction).toEqual([]);
  });
});
