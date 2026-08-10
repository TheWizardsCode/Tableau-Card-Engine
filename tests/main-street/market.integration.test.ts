/**
 * Main Street: Market Refill Integration Tests
 *
 * Validates market refill behaviour across the expanded M2 card pool:
 * - No illegal duplicate cards in market at any point
 * - Market slot counts remain within bounds after multi-turn sequences
 * - Incident queue refills correctly over many turns
 * - Monte Carlo sweep over many seeds detects no starvation or infinite loops
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { createSeededRng } from '../../src/core-engine';
import {
  refillDevelopmentMarket,
  refillInvestmentsMarket,
  refillIncidentQueue,
  getAffordableBusinessCards,
  getEmptySlots,
} from '../../example-games/main-street/MainStreetMarket';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
} from '../../example-games/main-street/MainStreetEngine';
import {
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import { getPreset } from '../../example-games/main-street/MainStreetDifficulty';

// ── Helpers ─────────────────────────────────────────────────

function createState(seed: string): MainStreetState {
  return setupMainStreetGame({ seed });
}

/** Returns true if there are duplicate ids in the given array. */
function hasDuplicateIds(items: { id: string }[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) dupes.push(item.id);
    seen.add(item.id);
  }
  return dupes;
}

/** Play one greedy turn: buy cheapest business if possible, end turn. */
function playGreedyTurn(state: MainStreetState): void {
  executeDayStart(state);
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);
  const empty = getEmptySlots(state);
  if (affordable.length > 0 && empty.length > 0) {
    const card = affordable[0];
    const slot = empty[0];
    executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: slot });
  }
  processEndOfTurn(state);
}

// ── Market Integrity ────────────────────────────────────────

describe('Market Refill Integration (Expanded Pool)', () => {
  describe('no duplicate cards in market', () => {
    it('business market has no duplicate ids after initial setup', () => {
      const state = createState('market-int-1');
      const dupes = hasDuplicateIds(state.market.development);
      expect(dupes).toEqual([]);
    });

    it('investments row has no duplicate ids after initial setup', () => {
      const state = createState('market-int-2');
      const dupes = hasDuplicateIds(state.market.investments);
      expect(dupes).toEqual([]);
    });

    it('business market has no duplicates after multiple refills', () => {
      const state = createState('market-int-refill');
      for (let i = 0; i < 10; i++) {
        // Remove one card and refill
        if (state.market.development.length > 0) {
          state.market.development.pop();
        }
        refillDevelopmentMarket(state);
        const dupes = hasDuplicateIds(state.market.development);
        expect(dupes, `Duplicate at iteration ${i}`).toEqual([]);
      }
    });

    it('investments row has no duplicates after multiple refills', () => {
      const state = createState('market-int-inv-refill');
      for (let i = 0; i < 10; i++) {
        if (state.market.investments.length > 0) {
          state.market.investments.pop();
        }
        refillInvestmentsMarket(state);
        const dupes = hasDuplicateIds(state.market.investments);
        expect(dupes, `Duplicate at iteration ${i}`).toEqual([]);
      }
    });
  });

  describe('market slot counts stay within bounds across turns', () => {
    it('business market never exceeds MARKET_BUSINESS_SLOTS over 15 turns', () => {
      const state = createState('market-bounds-biz');
      state.resourceBank.coins = 200;
      state.resourceBank.reputation = 10;

      for (let turn = 0; turn < 15; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);
        expect(state.market.development.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
        expect(state.market.development.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('investments row never exceeds MARKET_INVESTMENT_SLOTS over 15 turns', () => {
      const state = createState('market-bounds-inv');
      state.resourceBank.coins = 200;
      state.resourceBank.reputation = 10;

      for (let turn = 0; turn < 15; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);
        expect(state.market.investments.length).toBeLessThanOrEqual(MARKET_INVESTMENT_SLOTS);
      }
    });
  });

  describe('incident queue integrity', () => {
    it('incident queue refills to INCIDENT_QUEUE_SIZE when deck has incidents', () => {
      const state = createState('queue-refill-int');
      // Drain queue
      state.incidentQueue = [];
      refillIncidentQueue(state);

      const incidentsInDeck = state.decks.event.filter(e => e.trigger === 'Incident').length;
      if (incidentsInDeck >= INCIDENT_QUEUE_SIZE) {
        expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
      } else {
        // Queue should be however many incidents remain
        expect(state.incidentQueue.length).toBeLessThanOrEqual(INCIDENT_QUEUE_SIZE);
      }
    });

    it('incident queue has no duplicate ids', () => {
      const state = createState('queue-dupes');
      const dupes = hasDuplicateIds(state.incidentQueue);
      expect(dupes).toEqual([]);
    });

    it('incident queue contains only Incident-trigger cards', () => {
      const state = createState('queue-trigger-check');
      for (const card of state.incidentQueue) {
        expect(card.trigger).toBe('Incident');
      }
    });
  });

  describe('expanded pool deck sizes', () => {
    it('business deck has correct count (templates x 3 copies)', () => {
      const state = createState('deck-size-biz');
      const totalBusinessCards = createBusinessDeck().length;
      // Initial deck + market = total
      const inDeck = state.decks.business.length;
      const inMarket = state.market.development.length;
      expect(inDeck + inMarket).toBe(totalBusinessCards);
    });

    it('event deck has correct count (templates x 3 copies minus queue/market)', () => {
      const state = createState('deck-size-evt');
    const multiplier = getPreset(undefined).positiveIncidentMultiplier;
    const _rng = createSeededRng(42);
    const totalEventCards = createEventDeck(3, undefined, _rng, multiplier).length;
      const inDeck = state.decks.event.length;
      const inQueue = state.incidentQueue.length;
      const investmentEvents = state.market.investments.filter(c => c.family === 'event').length;
      expect(inDeck + inQueue + investmentEvents).toBe(totalEventCards);
    });

    it('upgrade deck has correct count (templates x 2 copies minus market)', () => {
      const state = createState('deck-size-upg');
      const totalUpgradeCards = createUpgradeDeck().length;
      const inDeck = state.decks.upgrade.length;
      const inMarket = state.market.investments.filter(c => c.family === 'upgrade').length;
      expect(inDeck + inMarket).toBe(totalUpgradeCards);
    });
  });
});

// ── Monte Carlo: Market Stability ───────────────────────────

describe('Monte Carlo: Market Refill Stability', () => {
  const SEED_COUNT = 200; // Run 200 seeds for reasonable coverage in test suite
  // Harness-only termination guard (CG-0MSLXJCHH001DLIO): default presets
  // impose no turn limit, so the simulation loop uses a generous fixed cap.
  const MAX_TURNS = 60;

  it(`no refill starvation or infinite loops across ${SEED_COUNT} seeds`, () => {
    const failures: string[] = [];

    for (let s = 0; s < SEED_COUNT; s++) {
      const seed = `mc-market-${s}`;
      const state = createState(seed);
      state.resourceBank.coins = 100;
      state.resourceBank.reputation = 10;

      let turnCount = 0;
      try {
        while (state.gameResult === 'playing' && turnCount < MAX_TURNS) {
          playGreedyTurn(state);
          turnCount++;

          // Invariant checks
          if (state.market.development.length > MARKET_BUSINESS_SLOTS) {
            failures.push(`seed=${seed} turn=${turnCount}: business market overflow (${state.market.development.length})`);
          }
          if (state.market.investments.length > MARKET_INVESTMENT_SLOTS) {
            failures.push(`seed=${seed} turn=${turnCount}: investments overflow (${state.market.investments.length})`);
          }
          if (state.incidentQueue.length > INCIDENT_QUEUE_SIZE) {
            failures.push(`seed=${seed} turn=${turnCount}: incident queue overflow (${state.incidentQueue.length})`);
          }

          const bizDupes = hasDuplicateIds(state.market.development);
          if (bizDupes.length > 0) {
            failures.push(`seed=${seed} turn=${turnCount}: business market duplicates: ${bizDupes.join(',')}`);
          }
          const invDupes = hasDuplicateIds(state.market.investments);
          if (invDupes.length > 0) {
            failures.push(`seed=${seed} turn=${turnCount}: investments duplicates: ${invDupes.join(',')}`);
          }
        }
      } catch (err) {
        failures.push(`seed=${seed} turn=${turnCount}: exception: ${(err as Error).message}`);
      }
    }

    expect(failures, `Failures across ${SEED_COUNT} seeds:\n${failures.join('\n')}`).toEqual([]);
  });

  it(`all ${SEED_COUNT} seeds reach a definite game result`, () => {
    let incompleteCount = 0;
    const incompleteSeeds: string[] = [];

    for (let s = 0; s < SEED_COUNT; s++) {
      const seed = `mc-completion-${s}`;
      const state = createState(seed);
      state.resourceBank.coins = 50;
      state.resourceBank.reputation = 5;

      let turnCount = 0;
      while (state.gameResult === 'playing' && turnCount < MAX_TURNS) {
        playGreedyTurn(state);
        turnCount++;
      }

      if (state.gameResult === 'playing') {
        incompleteCount++;
        incompleteSeeds.push(seed);
      }
    }

    expect(
      incompleteCount,
      `${incompleteCount} seeds did not complete: ${incompleteSeeds.slice(0, 5).join(', ')}`,
    ).toBe(0);
  });
});
