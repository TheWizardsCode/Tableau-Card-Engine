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
  refillMarket,
  getAffordableBusinessCards,
  getEmptySlots,
} from '../../example-games/main-street/MainStreetMarket';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
} from '../../example-games/main-street/MainStreetEngine';
import {
  MARKET_TOTAL_SLOTS,
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
      const dupes = hasDuplicateIds(state.market.cards);
      expect(dupes).toEqual([]);
    });

    it('investments row has no duplicate ids after initial setup', () => {
      const state = createState('market-int-2');
      const dupes = hasDuplicateIds(state.market.cards);
      expect(dupes).toEqual([]);
    });

    it('business market has no duplicates after multiple refills', () => {
      const state = createState('market-int-refill');
      for (let i = 0; i < 10; i++) {
        // Remove one card and refill
        if (state.market.cards.length > 0) {
          state.market.cards.pop();
        }
        refillMarket(state);
        const dupes = hasDuplicateIds(state.market.cards);
        expect(dupes, `Duplicate at iteration ${i}`).toEqual([]);
      }
    });

    it('investments row has no duplicates after multiple refills', () => {
      const state = createState('market-int-inv-refill');
      for (let i = 0; i < 10; i++) {
        if (state.market.cards.length > 0) {
          state.market.cards.pop();
        }
        refillMarket(state);
        const dupes = hasDuplicateIds(state.market.cards);
        expect(dupes, `Duplicate at iteration ${i}`).toEqual([]);
      }
    });
  });

  describe('market slot counts stay within bounds across turns', () => {
    it('business market never exceeds MARKET_TOTAL_SLOTS over 15 turns', () => {
      const state = createState('market-bounds-biz');
      state.resourceBank.coins = 200;
      state.resourceBank.reputation = 10;

      for (let turn = 0; turn < 15; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);
        expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
        expect(state.market.cards.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('investments row never exceeds MARKET_TOTAL_SLOTS over 15 turns', () => {
      const state = createState('market-bounds-inv');
      state.resourceBank.coins = 200;
      state.resourceBank.reputation = 10;

      for (let turn = 0; turn < 15; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);
        expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
      }
    });
  });

  describe('incident deck integrity', () => {
    it('incident deck is fully populated at setup (face-down, no refill loop)', () => {
      const state = createState('queue-refill-int');
      // All Incident-trigger cards are moved out of decks.event into
      // incidentDeck at setup (no visible refill loop).
      expect(state.decks.event.filter(e => e.trigger === 'Incident').length).toBe(0);
      expect(state.incidentDeck.length).toBeGreaterThan(0);
      expect(state.incidentDeck.every(c => c.trigger === 'Incident')).toBe(true);
    });

    it('incident deck has no duplicate ids', () => {
      const state = createState('queue-dupes');
      const dupes = hasDuplicateIds(state.incidentDeck);
      expect(dupes).toEqual([]);
    });

    it('incident deck contains only Incident-trigger cards', () => {
      const state = createState('queue-trigger-check');
      for (const card of state.incidentDeck) {
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
      const inMarket = state.market.cards.filter(c => c.family === 'business').length;
      expect(inDeck + inMarket).toBe(totalBusinessCards);
    });

    it('event deck has correct count (templates x 3 copies minus queue/market)', () => {
      const state = createState('deck-size-evt');
    const multiplier = getPreset(undefined).positiveIncidentMultiplier;
    const _rng = createSeededRng(42);
    const totalEventCards = createEventDeck(3, undefined, _rng, multiplier).length;
      const inDeck = state.decks.event.length;
      const inQueue = state.incidentDeck.length;
      const investmentEvents = state.market.cards.filter(c => c.family === 'event').length;
      expect(inDeck + inQueue + investmentEvents).toBe(totalEventCards);
    });

    it('upgrade deck has correct count (templates x 2 copies minus market)', () => {
      const state = createState('deck-size-upg');
      const totalUpgradeCards = createUpgradeDeck().length;
      const inDeck = state.decks.upgrade.length;
      const inMarket = state.market.cards.filter(c => c.family === 'upgrade').length;
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
          if (state.market.cards.length > MARKET_TOTAL_SLOTS) {
            failures.push(`seed=${seed} turn=${turnCount}: business market overflow (${state.market.cards.length})`);
          }
          if (state.market.cards.length > MARKET_TOTAL_SLOTS) {
            failures.push(`seed=${seed} turn=${turnCount}: investments overflow (${state.market.cards.length})`);
          }
          const incDupes = hasDuplicateIds(state.incidentDeck);
          if (incDupes.length > 0) {
            failures.push(`seed=${seed} turn=${turnCount}: incident deck duplicates: ${incDupes.join(',')}`);
          }

          const bizDupes = hasDuplicateIds(state.market.cards);
          if (bizDupes.length > 0) {
            failures.push(`seed=${seed} turn=${turnCount}: business market duplicates: ${bizDupes.join(',')}`);
          }
          const invDupes = hasDuplicateIds(state.market.cards);
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
