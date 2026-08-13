/**
 * Main Street: Integration Tests
 *
 * Tests that exercise the full game loop end-to-end:
 * - Full single-turn cycle (buy, place, income, night event, end check)
 * - Full multi-turn game to victory/loss
 * - Seeded determinism (same seed + same actions = same final state)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import type { MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  executeFullTurn,
  computeScore,
  resolveIncident,
  type PlayerAction,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';
import { updateNeighborsOnPlacement } from '../../example-games/main-street/MainStreetAdjacency';
import {
  getAffordableBusinessCards,
  getEmptySlots,
} from '../../example-games/main-street/MainStreetMarket';
import {
  INCIDENT_QUEUE_SIZE,
  CHALLENGE_BONUS_POINTS,
  createBusinessDeck,
  type EventCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  DEFAULT_CHALLENGES_PER_RUN,
  CHALLENGE_TEMPLATES,
} from '../../example-games/main-street/MainStreetChallenges';

// ── Helpers ─────────────────────────────────────────────────

/** Runs a simple greedy strategy for one turn: buy cheapest business, end turn. */
function playGreedyTurn(state: MainStreetState): { actions: PlayerAction[]; result: TurnResult } {
  executeDayStart(state);

  const actions: PlayerAction[] = [];
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);
  const empty = getEmptySlots(state);

  if (affordable.length > 0 && empty.length > 0) {
    const card = affordable[0];
    const slot = empty[0];
    const action: PlayerAction = { type: 'buy-business', cardId: card.id, slotIndex: slot };
    executeAction(state, action);
    actions.push(action);
  }

  actions.push({ type: 'end-turn' });
  const result = processEndOfTurn(state);
  return { actions, result };
}

/**
 * Runs a full game with a greedy strategy until it ends or hits a safety limit.
 * Returns array of turn records.
 *
 * The maxTurns cap is a harness-only termination guard (CG-0MSLXJCHH001DLIO):
 * default presets impose no turn limit, so long-running simulations need an
 * explicit bound to terminate deterministically.
 */
function playFullGame(
  state: MainStreetState,
  maxTurns = 60,
): { turnResults: TurnResult[]; totalTurns: number } {
  const turnResults: TurnResult[] = [];
  let count = 0;

  while (state.gameResult === 'playing' && count < maxTurns) {
    const { result } = playGreedyTurn(state);
    turnResults.push(result);
    count++;
  }

  return { turnResults, totalTurns: count };
}

// ── Full Turn Cycle ─────────────────────────────────────────

describe('Integration: Full Turn Cycle', () => {
  it('completes a single turn cycle with buy-business action', () => {
    const state = setupMainStreetGame({ seed: 'integration-turn-1' });

    // Start in DayStart phase
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(1);

    // Execute DayStart
    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');
    expect(state.market.development.length).toBeGreaterThan(0);

    // Buy the first affordable business
    const affordable = getAffordableBusinessCards(state);
    expect(affordable.length).toBeGreaterThan(0);
    const card = affordable[0];
    const coinsBefore = state.resourceBank.coins;

    executeAction(state, {
      type: 'buy-business',
      cardId: card.id,
      slotIndex: 0,
    });

    // Verify purchase
    expect(state.streetGrid[0]).not.toBeNull();
    expect(state.streetGrid[0]!.id).toBe(card.id);
    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);

    // Process end of turn (events, income, night, end check)
    const result = processEndOfTurn(state);

    // Should have received some income (at least base income of the placed business)
    if (result.income) {
      expect(result.income.total).toBeGreaterThanOrEqual(0);
    }

    // Game may still be playing or lost (depending on events)
    expect(['playing', 'win', 'loss']).toContain(result.gameResult);
  });

  it('handles a turn with no affordable actions (skip)', () => {
    const state = setupMainStreetGame({ seed: 'integration-skip' });

    // Drain coins to force no-buy
    state.resourceBank.coins = 0;

    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');

    // No affordable business
    const affordable = getAffordableBusinessCards(state);
    expect(affordable.length).toBe(0);

    // Just end turn
    const result = processEndOfTurn(state);
    expect(result).toBeDefined();
    expect(result.income).not.toBeNull();
    // With no businesses, income total should be 0
    expect(result.income!.total).toBe(0);
  });

  it('transitions through all phases in correct order', () => {
    const state = setupMainStreetGame({ seed: 'integration-phases' });
    const phasesSeen: string[] = [];

    // Capture DayStart
    expect(state.phase).toBe('DayStart');
    phasesSeen.push(state.phase);

    executeDayStart(state);
    phasesSeen.push(state.phase); // MarketPhase

    // End turn triggers remaining phases automatically
    processEndOfTurn(state);

    // After processEndOfTurn, state is either in DayStart (next turn) or game over
    if (state.gameResult === 'playing') {
      expect(state.phase).toBe('DayStart');
    }

    expect(phasesSeen).toContain('DayStart');
    expect(phasesSeen).toContain('MarketPhase');
  });
});

// ── Full Game ───────────────────────────────────────────────

describe('Integration: Full Game', () => {
  it('runs a complete game to a definite result', () => {
    const state = setupMainStreetGame({ seed: 'integration-full-game' });
    const { turnResults, totalTurns } = playFullGame(state);

    // Game must have ended
    expect(state.gameResult).not.toBe('playing');
    expect(['win', 'loss']).toContain(state.gameResult);
    expect(state.endReason).not.toBeNull();
    expect(totalTurns).toBeGreaterThanOrEqual(1);
    // Harness termination guard: default presets are unlimited, so this is a
    // bound on the simulation loop, not a game mechanic (CG-0MSLXJCHH001DLIO).
    expect(totalTurns).toBeLessThanOrEqual(60);
    expect(turnResults.length).toBe(totalTurns);

    // Final score should be computed
    expect(state.finalScore).toBe(computeScore(state));
  });

  it('reaches score threshold with enough income to survive', () => {
    // Manually set up a state with high coins to survive
    const state = setupMainStreetGame({ seed: 'integration-survive' });
    state.resourceBank.coins = 100;
    state.resourceBank.reputation = 5;

    const { totalTurns: _totalTurns } = playFullGame(state);

    // With high starting resources and reputation, the game ends via the
    // score threshold (default presets impose no turn limit, so
    // turn_limit_victory is not reachable — CG-0MSLXJCHH001DLIO).
    expect(state.gameResult).toBe('win');
    expect(state.endReason).toBe('score_threshold');
  });

  it('ends in bankruptcy when coins go below 0', () => {
    const state = setupMainStreetGame({ seed: 'integration-bankrupt' });
    // Set coins just barely enough to buy something, then drain
    state.resourceBank.coins = 1;
    state.resourceBank.reputation = 5; // Avoid rep collapse

    // Put a tax event into the hand to trigger bankruptcy when played
    state.hand = [{
      family: 'event',
      id: 'evt-tax-test',
      name: 'Heavy Tax',
      trigger: 'Investment',
      effect: 'Lose 10 coins.',
      target: 'All',
      coinDelta: -10,
      reputationDelta: 0,
      cost: 0,
    }];

    executeDayStart(state);
    // Player actively plays the held event during MarketPhase
    executeAction(state, { type: 'play-event' });
    processEndOfTurn(state);

    expect(state.gameResult).toBe('loss');
    expect(state.endReason).toBe('bankruptcy');
    expect(state.resourceBank.coins).toBeLessThan(0);
  });

  it('ends in reputation collapse when reputation drops to 0', () => {
    const state = setupMainStreetGame({ seed: 'integration-rep-collapse' });
    state.resourceBank.reputation = 1;
    state.turn = 2; // Must be past turn 1 for rep collapse check

    // Add an event that drops reputation to 0
    state.hand = [{
      family: 'event',
      id: 'evt-scandal-test',
      name: 'Scandal',
      trigger: 'Investment',
      effect: 'Lose 1 reputation.',
      target: 'All',
      coinDelta: 0,
      reputationDelta: -1,
      cost: 0,
    }];

    executeDayStart(state);
    // Player actively plays the held event during MarketPhase
    executeAction(state, { type: 'play-event' });
    processEndOfTurn(state);

    expect(state.gameResult).toBe('loss');
    expect(state.endReason).toBe('reputation_collapse');
  });
});

// ── Seeded Determinism ──────────────────────────────────────

describe('Integration: Seeded Determinism', () => {
  it('same seed + same actions produce identical final state', () => {
    const seed = 'determinism-test-42';

    // Run game 1
    const state1 = setupMainStreetGame({ seed });
    playFullGame(state1);

    // Run game 2 with same seed
    const state2 = setupMainStreetGame({ seed });
    playFullGame(state2);

    // Both games should produce identical results
    expect(state1.gameResult).toBe(state2.gameResult);
    expect(state1.endReason).toBe(state2.endReason);
    expect(state1.finalScore).toBe(state2.finalScore);
    expect(state1.turn).toBe(state2.turn);
    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);

    // Grid should be identical
    for (let i = 0; i < state1.streetGrid.length; i++) {
      const g1 = state1.streetGrid[i];
      const g2 = state2.streetGrid[i];
      if (g1 === null) {
        expect(g2).toBeNull();
      } else {
        expect(g2).not.toBeNull();
        expect(g1.id).toBe(g2!.id);
        expect(g1.level).toBe(g2!.level);
      }
    }
  });

  it('different seeds produce different games', () => {
    const state1 = setupMainStreetGame({ seed: 'seed-A' });
    const state2 = setupMainStreetGame({ seed: 'seed-B' });

    // Markets should differ (different shuffle order)
    const market1Ids = state1.market.development.map(c => c.id).sort().join(',');
    const market2Ids = state2.market.development.map(c => c.id).sort().join(',');

    // While it's theoretically possible for two different seeds to produce
    // the same shuffle, it's extremely unlikely. We check that at least
    // the full game plays out differently.
    playFullGame(state1);
    playFullGame(state2);

    // At least one of these should differ
    const differ =
      state1.finalScore !== state2.finalScore ||
      state1.turn !== state2.turn ||
      state1.gameResult !== state2.gameResult ||
      market1Ids !== market2Ids;
    expect(differ).toBe(true);
  });

  it('executeFullTurn convenience function matches manual turn execution', () => {
    const seed = 'fullTurn-equiv';

    // Manual: setup + executeDayStart + executeAction + processEndOfTurn
    const state1 = setupMainStreetGame({ seed });
    executeDayStart(state1);
    const affordable = getAffordableBusinessCards(state1);
    const actions: PlayerAction[] = [];
    if (affordable.length > 0) {
      const card = affordable[0];
      const slot = getEmptySlots(state1)[0];
      const action: PlayerAction = { type: 'buy-business', cardId: card.id, slotIndex: slot };
      executeAction(state1, action);
      actions.push(action);
    }
    const result1 = processEndOfTurn(state1);

    // Convenience: setup + executeFullTurn with same actions
    const state2 = setupMainStreetGame({ seed });
    const result2 = executeFullTurn(state2, actions);

    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
    expect(state1.finalScore).toBe(state2.finalScore);
    expect(state1.gameResult).toBe(state2.gameResult);
    expect(result1.gameResult).toBe(result2.gameResult);
  });
});

// ── Income & Synergy Integration ────────────────────────────

describe('Integration: Income & Synergy', () => {
  it('placing adjacent Food businesses increases income via synergy', () => {
    const s = setupMainStreetGame({ seed: 'synergy-income-2' });
    s.resourceBank.coins = 50;
    s.resourceBank.reputation = 5;

    // Deterministically place two different-template Food cards in adjacent
    // slots (0 and 1 on the 2x5 grid). The same-type rule excludes
    // same-template neighbors, so Bakery (Food) + Cafe (Food|Culture) both
    // gain a real synergy bonus — no dependence on the seeded market.
    const bakery = createBusinessDeck(1).find(c => c.name === 'Bakery')!;
    const cafe = createBusinessDeck(1).find(c => c.name === 'Cafe')!;
    s.streetGrid[0] = { ...bakery, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
    updateNeighborsOnPlacement(s, 0);

    executeDayStart(s);
    const result1 = processEndOfTurn(s);
    const income1 = result1.income?.total ?? 0; // Bakery alone: 0.5

    s.streetGrid[1] = { ...cafe, level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
    updateNeighborsOnPlacement(s, 1);
    executeDayStart(s);
    const result2 = processEndOfTurn(s);
    const income2 = result2.income?.total ?? 0; // + Cafe and both synergy bonuses

    // Income should increase due to synergy bonus between adjacent Food businesses
    expect(income2).toBeGreaterThan(income1);
  });
});

// ── Incident Queue Integration ──────────────────────────────

describe('Integration: Incident Queue', () => {
  it('drains and refills the incident queue across multiple turns', () => {
    const state = setupMainStreetGame({ seed: 'queue-drain' });
    state.resourceBank.coins = 100;
    state.resourceBank.reputation = 10;

    // Record initial queue IDs
    const initialQueueIds = state.incidentQueue.map(c => c.id);
    expect(initialQueueIds).toHaveLength(INCIDENT_QUEUE_SIZE);

    // Turn 1: resolve front incident, queue should refill
    executeDayStart(state);
    const result1 = processEndOfTurn(state);
    expect(result1.incident).not.toBeNull();
    expect(result1.incident!.id).toBe(initialQueueIds[0]);

    if (state.gameResult !== 'playing') return;

    // After turn 1, queue should still have INCIDENT_QUEUE_SIZE if deck has incidents
    const incidentsInDeck1 = state.decks.event.filter(e => e.trigger === 'Incident').length;
    if (incidentsInDeck1 > 0) {
      expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
    }

    // Turn 2: next front resolved
    executeDayStart(state);
    const result2 = processEndOfTurn(state);
    expect(result2.incident).not.toBeNull();
    // The second resolved should be the card that was at position [1] initially
    // (or a deck-drawn card that replaced it — either way it's a valid Incident)
    expect(result2.incident!.trigger).toBe('Incident');
  });

  it('queue shrinks naturally when deck runs out of incident cards', () => {
    const state = setupMainStreetGame({ seed: 'queue-exhaust' });
    state.resourceBank.coins = 100;
    state.resourceBank.reputation = 10;

    // Remove all Incident cards from the deck
    state.decks.event = state.decks.event.filter(e => e.trigger !== 'Incident');

    // Queue should still have its initial cards
    const queueSizeBefore = state.incidentQueue.length;
    expect(queueSizeBefore).toBe(INCIDENT_QUEUE_SIZE);

    // Resolve all queued incidents
    for (let i = 0; i < queueSizeBefore; i++) {
      if (state.incidentQueue.length === 0) break;
      resolveIncident(state);
    }

    // Queue should be empty — no deck cards to refill
    expect(state.incidentQueue.length).toBe(0);
  });

  it('resolveIncident draws only Incident-trigger cards, not Investment-trigger', () => {
    const state = setupMainStreetGame({ seed: 'queue-filter' });
    state.resourceBank.coins = 100;

    // Set up: queue with 1 incident, deck has only Investment events
    const incident: EventCard = {
      family: 'event',
      id: 'test-incident-only',
      name: 'Test Incident',
      trigger: 'Incident',
      effect: '-1 coin',
      target: 'All',
      coinDelta: -1,
      reputationDelta: 0,
      cost: 0,
    };
    state.incidentQueue = [incident];
    state.decks.event = [
      {
        family: 'event',
        id: 'investment-in-deck',
        name: 'Investment Card',
        trigger: 'Investment',
        effect: '+1 coin',
        target: 'All',
        coinDelta: 1,
        reputationDelta: 0,
        cost: 3,
      },
    ];

    resolveIncident(state);

    // Queue should NOT have the Investment card
    expect(state.incidentQueue.length).toBe(0);
    // Investment card should still be in the deck
    expect(state.decks.event.length).toBe(1);
    expect(state.decks.event[0].trigger).toBe('Investment');
  });
});

// ── Held Event Integration ──────────────────────────────────

describe('Integration: Held Investment Event', () => {
  it('held event persists across turns when not played', () => {
    const state = setupMainStreetGame({ seed: 'held-auto' });
    state.resourceBank.coins = 50;
    state.resourceBank.reputation = 5;

    // Give the player a held Investment event (in hand)
    state.hand = [{
      family: 'event',
      id: 'evt-held-auto',
      name: 'Auto Festival',
      trigger: 'Investment',
      effect: '+3 coins',
      target: 'All',
      coinDelta: 3,
      reputationDelta: 0,
      cost: 3,
    }];

    executeDayStart(state);
    // Don't play the event during MarketPhase — just end turn
    const result = processEndOfTurn(state);

    // The event should NOT have been auto-resolved — it persists in hand
    expect((state.hand ?? []).some(c => c.family === 'event' && c.id === 'evt-held-auto')).toBe(true);
    // Coins should NOT include the +3 from the event (event was not played)
    // Income and incident effects still apply, but the event delta should not
    expect(result).toBeDefined();
  });

  it('held event played during MarketPhase does not auto-resolve again', () => {
    const state = setupMainStreetGame({ seed: 'held-play' });
    state.resourceBank.coins = 50;
    state.resourceBank.reputation = 5;

    // Give the player a held Investment event (in hand)
    state.hand = [{
      family: 'event',
      id: 'evt-held-play',
      name: 'Manual Festival',
      trigger: 'Investment',
      effect: '+5 coins',
      target: 'All',
      coinDelta: 5,
      reputationDelta: 0,
      cost: 3,
    }];

    executeDayStart(state);

    // Play the event during MarketPhase
    executeAction(state, { type: 'play-event' });
    expect((state.hand ?? []).some(c => c.family === 'event')).toBe(false);

    const coinsAfterPlay = state.resourceBank.coins;
    // Reputation multiplier: rep=5, divisor=20 → 1 + 5/20 = 1.25
    // CG-0MRER3RE300418SG: Math.floor removed; 5 * 1.25 = 6.25 (was 6 before fix)
    expect(coinsAfterPlay).toBeCloseTo(50 + 6.25); // Event delta scaled by reputation multiplier

    // End turn — InvestmentResolution should have nothing to auto-resolve
    const result = processEndOfTurn(state);

    // The +5 should only have been applied once (during play-event, not again during auto-resolve)
    // Income phase adds income, incident phase subtracts — but the event shouldn't double-apply
    expect(result).toBeDefined();
    // Hand still has no event
    expect((state.hand ?? []).some(c => c.family === 'event')).toBe(false);
  });

  it('purchasing an Investment event during one turn and playing it the next', () => {
    const state = setupMainStreetGame({ seed: 'held-next-turn' });
    state.resourceBank.coins = 50;
    state.resourceBank.reputation = 5;

    // Inject an Investment event into the market
    const investmentEvt: EventCard = {
      family: 'event',
      id: 'evt-buy-then-play',
      name: 'Deferred Festival',
      trigger: 'Investment',
      effect: '+4 coins',
      target: 'All',
      coinDelta: 4,
      reputationDelta: 0,
      cost: 3,
    };
    state.market.investments.push(investmentEvt);

    // Turn 1: buy the event
    executeDayStart(state);
    executeAction(state, { type: 'buy-event', cardId: 'evt-buy-then-play' });
    expect((state.hand ?? []).some(c => c.family === 'event' && c.id === 'evt-buy-then-play')).toBe(true);

    // End turn 1 — held event persists (no longer auto-resolved)
    const result1 = processEndOfTurn(state);
    expect((state.hand ?? []).some(c => c.family === 'event' && c.id === 'evt-buy-then-play')).toBe(true); // Persists across turns
    expect(result1).toBeDefined();

    if (state.gameResult !== 'playing') return; // Game ended

    // Turn 2: play the held event manually
    executeDayStart(state);
    const coinsBeforePlay = state.resourceBank.coins;
    // Reputation multiplier: 1 + rep/20. Turn 1's incident phase can change
    // reputation (seed-dependent incident queue), so compute from the live
    // value rather than assuming rep stayed at 5.
    const repMultiplier = 1 + state.resourceBank.reputation / 20;
    executeAction(state, { type: 'play-event' });
    expect((state.hand ?? []).some(c => c.family === 'event')).toBe(false); // Now resolved
    expect(state.resourceBank.coins).toBeCloseTo(coinsBeforePlay + 4 * repMultiplier); // +4 base scaled by rep

    const result2 = processEndOfTurn(state);
    expect(result2).toBeDefined();
  });
});

// ── Challenge System Integration ────────────────────────────

describe('Integration: Challenge System', () => {
  it('challenges are selected at game setup and persist through a full game', () => {
    const state = setupMainStreetGame({ seed: 'challenge-persist-1' });

    // Challenges populated at setup
    expect(state.activeChallenges).toHaveLength(DEFAULT_CHALLENGES_PER_RUN);
    const initialIds = state.activeChallenges.map(ac => ac.challenge.id);

    // Run a full game
    const { totalTurns } = playFullGame(state);
    expect(totalTurns).toBeGreaterThanOrEqual(1);
    expect(state.gameResult).not.toBe('playing');

    // All original challenges are still present (never removed)
    const finalIds = state.activeChallenges.map(ac => ac.challenge.id);
    expect(finalIds).toEqual(initialIds);
  });

  it('challenge determinism: same seed produces same completions in a full game', () => {
    const seed = 'challenge-determinism-99';

    const state1 = setupMainStreetGame({ seed });
    playFullGame(state1);

    const state2 = setupMainStreetGame({ seed });
    playFullGame(state2);

    // Same challenge IDs
    expect(state1.activeChallenges.map(ac => ac.challenge.id))
      .toEqual(state2.activeChallenges.map(ac => ac.challenge.id));

    // Same completion status
    expect(state1.activeChallenges.map(ac => ac.completed))
      .toEqual(state2.activeChallenges.map(ac => ac.completed));

    // Same challengesCompleted list
    expect(state1.challengesCompleted).toEqual(state2.challengesCompleted);
  });

  it('computeScore includes CHALLENGE_BONUS_POINTS per completed challenge', () => {
    const state = setupMainStreetGame({ seed: 'challenge-score-bonus' });
    state.resourceBank.coins = 100;
    state.resourceBank.reputation = 10;

    // Manually complete one challenge
    const ac = state.activeChallenges[0];
    ac.completed = true;
    state.challengesCompleted.push(ac.challenge.id);

    const score = computeScore(state);
    const expectedBase = state.resourceBank.coins + (state.resourceBank.reputation * 5);
    const expectedChallengeBonus = state.challengesCompleted.length * CHALLENGE_BONUS_POINTS;
    expect(score).toBe(expectedBase + expectedChallengeBonus);
  });

  it('challenges can complete during a multi-turn game via EndCheck evaluation', () => {
    const state = setupMainStreetGame({ seed: 'challenge-multi-turn-eval' });
    state.resourceBank.coins = 100;
    state.resourceBank.reputation = 10;

    // Run up to 10 turns and track challenge completions per turn
    const completionTimeline: number[] = [];
    for (let i = 0; i < 10 && state.gameResult === 'playing'; i++) {
      playGreedyTurn(state);
      completionTimeline.push(state.challengesCompleted.length);
    }

    // Completion count should be monotonically non-decreasing (no revocation)
    for (let i = 1; i < completionTimeline.length; i++) {
      expect(completionTimeline[i]).toBeGreaterThanOrEqual(completionTimeline[i - 1]);
    }
  });

  it('all-challenges win triggers before turn limit in a rigged scenario', () => {
    const state = setupMainStreetGame({ seed: 'challenge-all-win' });
    state.resourceBank.coins = 200;
    state.resourceBank.reputation = 30;

    // Pre-complete all but one challenge
    for (let i = 0; i < state.activeChallenges.length - 1; i++) {
      state.activeChallenges[i].completed = true;
      state.challengesCompleted.push(state.activeChallenges[i].challenge.id);
    }

    // Force the last challenge to be Deep Pockets (coins >= 25)
    const lastAc = state.activeChallenges[state.activeChallenges.length - 1];
    const deepPockets = CHALLENGE_TEMPLATES.find(t => t.id === 'ch-deep-pockets')!;
    // Replace with Deep Pockets if different
    if (lastAc.challenge.id !== 'ch-deep-pockets') {
      state.activeChallenges[state.activeChallenges.length - 1] = {
        challenge: deepPockets,
        completed: false,
      };
    }

    // With 200 coins, Deep Pockets (>= 25 coins) should complete on next EndCheck
    executeDayStart(state);
    const result = processEndOfTurn(state);

    expect(state.gameResult).toBe('win');
    expect(state.endReason).toBe('all_challenges');
    expect(result.gameResult).toBe('win');
  });

  it('challenge completions survive across turns (no revocation)', () => {
    const state = setupMainStreetGame({ seed: 'challenge-no-revoke' });
    state.resourceBank.coins = 200;
    state.resourceBank.reputation = 20;

    // Find and rig a Deep Pockets challenge
    const deepPockets = CHALLENGE_TEMPLATES.find(t => t.id === 'ch-deep-pockets')!;
    state.activeChallenges = [{ challenge: deepPockets, completed: false }];

    // Turn 1: coins >= 25, should complete
    executeDayStart(state);
    processEndOfTurn(state);

    if (state.gameResult !== 'playing') return;

    expect(state.activeChallenges[0].completed).toBe(true);
    expect(state.challengesCompleted).toContain('ch-deep-pockets');

    // Drain coins below threshold
    state.resourceBank.coins = 5;

    // Turn 2: challenge should remain completed despite coins < 25
    executeDayStart(state);
    processEndOfTurn(state);

    expect(state.activeChallenges[0].completed).toBe(true);
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
  });

  it('zero active challenges does not trigger all-challenges win', () => {
    const state = setupMainStreetGame({ seed: 'challenge-zero-no-win' });
    state.resourceBank.coins = 200;
    state.resourceBank.reputation = 20;
    state.activeChallenges = [];

    executeDayStart(state);
    const result = processEndOfTurn(state);

    // Game should not end with all_challenges when there are 0 challenges
    if (state.endReason === 'all_challenges') {
      throw new Error('all_challenges win should not trigger with 0 active challenges');
    }
    // Game either continues or ends for another reason
    expect(result).toBeDefined();
  });
});
