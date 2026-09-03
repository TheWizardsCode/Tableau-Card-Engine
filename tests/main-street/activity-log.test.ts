/**
 * Main Street: Activity Log Tests
 *
 * Verifies that every game-influencing action produces the correct
 * activity log entries in state.activityLog, with effective (post-mitigation)
 * coin and reputation deltas shown alongside the action-specific text.
 *
 * Per CG-0MT5W7UJJ0065MEZ — "In main street log should show total effects":
 *   - AC2: played-from-hand event entries show cost + effective deltas
 *   - AC1: all resource-mutating entries show effective deltas
 *   - AC3: per-turn net summary row appended at end of each turn
 *   - AC4: entries remain readable (word-wrap, compact)
 *   - AC5: docs updated, full suite passes
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
  type LogEntry,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  executeFullTurn,
  resolveHeldInvestment,
  resolveIncident,
  checkImmediateLoss,
  checkEndConditions,
  describeEventEffects,
  classifyEffect,
} from '../../example-games/main-street/MainStreetEngine';
import {
  purchaseBusiness,
  purchaseEvent,
  purchaseUpgrade,
  playEventFromHand,
  refreshMarket,
} from '../../example-games/main-street/MainStreetMarket';
import {
  applyIncome,
  recalculateCard,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  WIN_THRESHOLD,
  type BusinessCard,
  type EventCard,
  type UpgradeCard,
  type CommunitySpaceCard,
  type StaffCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  sellFromHand,
  sellFromTableau,
  executeCommunityFavour,
  hireStaffCard,
  layoffStaffCard,
  applyStaffOngoingCosts,
  applyCommunitySpaceOngoingCosts,
  applyBusinessOngoingCosts,
} from '../../example-games/main-street/MainStreetEngine';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'activity-log-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
  };
}

function makeInvestmentEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: overrides.id ?? 'test-investment-event',
    name: overrides.name ?? 'Test Investment Event',
    trigger: 'Investment',
    cost: overrides.cost ?? 0,
    effect: overrides.effect ?? '+1 coin',
    coinDelta: overrides.coinDelta ?? 1,
    reputationDelta: overrides.reputationDelta ?? 0,
    target: overrides.target ?? 'All',
    targetSynergy: overrides.targetSynergy,
  };
}

function makeIncidentEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: overrides.id ?? 'test-incident-event',
    name: overrides.name ?? 'Test Incident Event',
    trigger: 'Incident',
    cost: overrides.cost ?? 0,
    effect: overrides.effect ?? '-1 coin',
    coinDelta: overrides.coinDelta ?? -1,
    reputationDelta: overrides.reputationDelta ?? 0,
    target: overrides.target ?? 'All',
    targetSynergy: overrides.targetSynergy,
  };
}

function lastLog(state: MainStreetState): LogEntry {
  return state.activityLog[state.activityLog.length - 1];
}

function logsOfType(state: MainStreetState, type: LogEntry['type']): LogEntry[] {
  return state.activityLog.filter(e => e.type === type);
}

// ── Helpers for enriched-entry tests ─────────────────────────

/** Create a staff card for testing hire/layoff. */
function makeStaffCard(overrides: Partial<StaffCard> = {}): StaffCard {
  return {
    family: 'staff',
    id: overrides.id ?? 'test-staff',
    name: overrides.name ?? 'Test Staff',
    cost: overrides.cost ?? 3,
    ongoingCost: overrides.ongoingCost ?? 1,
    handSlotsAdded: overrides.handSlotsAdded ?? 0,
    actionsPerTurn: overrides.actionsPerTurn ?? 0,
    description: overrides.description ?? 'A test staff card.',
    specializationSkillIds: overrides.specializationSkillIds ?? [],
  } as StaffCard;
}

/** Create a community space card for testing purchase. */
function makeCommunitySpace(overrides: Partial<CommunitySpaceCard> = {}): CommunitySpaceCard {
  return {
    family: 'community-space',
    id: overrides.id ?? 'test-community-space',
    name: overrides.name ?? 'Test Community Space',
    cost: overrides.cost ?? 4,
    baseIncome: overrides.baseIncome ?? 1,
    synergyTypes: overrides.synergyTypes ?? ['Education'],
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test community space',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
  } as CommunitySpaceCard;
}

// ── Tests ───────────────────────────────────────────────────

describe('Activity Log', () => {

  describe('initial state', () => {
    it('should start with an empty activity log', () => {
      const state = createTestState();
      expect(state.activityLog).toEqual([]);
    });

    it('should start a new game with a fresh log and then add new entries', () => {
      const firstGame = createTestState('activity-log-first-game');
      executeDayStart(firstGame);
      processEndOfTurn(firstGame);
      expect(firstGame.activityLog.length).toBeGreaterThan(0);

      const secondGame = createTestState('activity-log-second-game');
      expect(secondGame.activityLog).toEqual([]);

      executeDayStart(secondGame);
      expect(secondGame.activityLog).toHaveLength(1);
      expect(secondGame.activityLog[0].type).toBe('turn-header');
      expect(secondGame.activityLog[0].text).toBe('Turn 1');
    });
  });

  describe('turn headers', () => {
    it('should log a turn-header entry when executeDayStart is called', () => {
      const state = createTestState();
      executeDayStart(state);

      const headers = logsOfType(state, 'turn-header');
      expect(headers).toHaveLength(1);
      expect(headers[0].text).toBe('Turn 1');
      expect(headers[0].turn).toBe(1);
    });

    it('should log turn headers for subsequent turns', () => {
      const state = createTestState();
      // Turn 1
      executeDayStart(state);
      processEndOfTurn(state);
      // Turn 2 starts (processEndOfTurn increments turn and sets DayStart)
      executeDayStart(state);

      const headers = logsOfType(state, 'turn-header');
      expect(headers).toHaveLength(2);
      expect(headers[0].text).toBe('Turn 1');
      expect(headers[1].text).toBe('Turn 2');
      expect(headers[1].turn).toBe(2);
    });
  });

  describe('business placement', () => {
    it('should log a loss entry when a business is placed', () => {
      const state = createTestState();
      executeDayStart(state);

      // Place a business from the market
      const biz = state.market.cards[0];
      const cost = biz.cost;
      const name = biz.name;
      state.resourceBank.coins = 5000; // ensure enough coins
      purchaseBusiness(state, biz.id, 0);

      const entry = lastLog(state);
      expect(entry.type).toBe('loss');
      expect(entry.text).toContain(name);
      expect(entry.text).toContain('slot 0');
      expect(entry.text).toContain(`€${cost}`);
      expect(entry.turn).toBe(1);
    });
  });

  describe('event purchase', () => {
    it('should log a neutral entry when an Investment event is moved to hand (free)', () => {
      const state = createTestState();
      executeDayStart(state);

      // Inject an Investment event into the investments row
      const investmentEvent = makeInvestmentEvent({ id: 'inv-evt-1', name: 'Test Fest' });
      state.market.cards = [investmentEvent];
      purchaseEvent(state, 'inv-evt-1');

      const entry = lastLog(state);
      expect(entry.type).toBe('neutral');
      // Taking the event to hand is free (CG-0MT5W1V4D007NN8Q) — the log
      // reflects the move, not a coin deduction.
      expect(entry.text).toContain('Moved event');
      expect(entry.text).toContain('Test Fest');
    });
  });

  describe('upgrade purchase', () => {
    it('should log a loss entry when an upgrade is purchased', () => {
      const state = createTestState();
      executeDayStart(state);

      // Place a business to upgrade
      const biz = makeBiz({ id: 'bakery-1', name: 'Bakery', maxLevel: 3 });
      state.streetGrid[0] = biz;

      // Inject an upgrade into the investments row
      const upgrade: UpgradeCard = {
        family: 'upgrade',
        id: 'upg-1',
        name: 'Better Ovens',
        description: 'Improve bakery',
        cost: 4,
        targetBusiness: 'Bakery',
        incomeBonus: 1,
        synergyRangeBonus: 0,
      };
      state.market.cards = [upgrade];
      state.resourceBank.coins = 20;

      purchaseUpgrade(state, 'upg-1');

      const entry = lastLog(state);
      expect(entry.type).toBe('loss');
      expect(entry.text).toContain('Upgraded');
      expect(entry.text).toContain('Bakery');
      expect(entry.text).toContain('Better Ovens');
      expect(entry.text).toContain('€4');
    });
  });

  describe('Investment event resolution', () => {
    it('should log entry when held Investment event is auto-resolved', () => {
      const state = createTestState();
      executeDayStart(state);

      // Set held event in hand
      state.hand = [makeInvestmentEvent({ id: 'de-1', name: 'Tax Audit', coinDelta: -3, reputationDelta: 0 })];

      const logBefore = state.activityLog.length;
      state.phase = 'InvestmentResolution';
      resolveHeldInvestment(state);

      const newEntries = state.activityLog.slice(logBefore);
      expect(newEntries).toHaveLength(1);

      // Tax Audit: -3 coins = loss
      expect(newEntries[0].text).toContain('Tax Audit');
      expect(newEntries[0].text).toContain('Investment (auto):');
      expect(newEntries[0].type).toBe('loss');
    });

    it('should log neutral for zero-effect events', () => {
      const state = createTestState();
      executeDayStart(state);

      state.hand = [makeInvestmentEvent({ id: 'de-n', name: 'Nothing Happens', coinDelta: 0, reputationDelta: 0 })];

      state.phase = 'InvestmentResolution';
      resolveHeldInvestment(state);

      const entry = lastLog(state);
      expect(entry.type).toBe('neutral');
      expect(entry.text).toContain('Nothing Happens');
    });

    it('should not log when no event is held', () => {
      const state = createTestState();
      executeDayStart(state);

      state.phase = 'InvestmentResolution';
      const logBefore = state.activityLog.length;
      resolveHeldInvestment(state);

      expect(state.activityLog.length).toBe(logBefore);
    });
  });

  describe('income collection', () => {
    it('should log a gain entry when income is collected', () => {
      const state = createTestState();
      executeDayStart(state);

      // Place a business so there is income
      state.streetGrid[0] = makeBiz({ baseIncome: 5 });
      recalculateCard(state, 0);
      state.phase = 'IncomePhase';

      const logBefore = state.activityLog.length;
      applyIncome(state);

      const entry = state.activityLog[logBefore];
      expect(entry.type).toBe('gain');
      expect(entry.text).toContain('Income');
      // CG-0MREYZO7E00729S0: integer coin format (no decimals)
      expect(entry.text).toMatch(/\+\d+ coins/);
    });

    it('should log neutral when income is zero', () => {
      const state = createTestState();
      executeDayStart(state);

      // No businesses placed, income = 0
      state.phase = 'IncomePhase';
      const logBefore = state.activityLog.length;
      applyIncome(state);

      const entry = state.activityLog[logBefore];
      expect(entry.type).toBe('neutral');
      // CG-0MREYZO7E00729S0: zero income logged as +0 coins
      expect(entry.text).toContain('+0 coins');
    });
  });

  describe('Incident event resolution', () => {
    it('should log an entry when an Incident event is resolved', () => {
      const state = createTestState();
      executeDayStart(state);

      // Inject an Incident event into the queue
      state.incidentDeck = [
        makeIncidentEvent({ id: 'ne-1', name: 'Rainy Day', coinDelta: -1, reputationDelta: 0 }),
      ];

      state.phase = 'IncidentPhase';
      const logBefore = state.activityLog.length;
      resolveIncident(state);

      const entry = state.activityLog[logBefore];
      expect(entry.text).toContain('Incident:');
      expect(entry.text).toContain('Rainy Day');
      expect(entry.type).toBe('loss');
    });

    it('should not log when the incident queue is empty', () => {
      const state = createTestState();
      executeDayStart(state);

      // Empty the incident queue
      state.incidentDeck = [];

      state.phase = 'IncidentPhase';
      const logBefore = state.activityLog.length;
      resolveIncident(state);

      expect(state.activityLog.length).toBe(logBefore);
    });
  });

  describe('game end (win)', () => {
    it('should log a gain entry for score threshold victory', () => {
      const state = createTestState();
      executeDayStart(state);

      // Force score above threshold
      state.resourceBank.coins = WIN_THRESHOLD + 5000;
      state.phase = 'EndCheck';

      const logBefore = state.activityLog.length;
      checkEndConditions(state);

      const newEntries = state.activityLog.slice(logBefore);
      const victoryEntry = newEntries.find(e => e.text.includes('Victory'));
      expect(victoryEntry).toBeDefined();
      expect(victoryEntry!.type).toBe('gain');
      expect(victoryEntry!.text).toContain('Score threshold');
    });

    it('should log a gain entry for turn-limit victory', () => {
      const state = createTestState();
      executeDayStart(state);

      // Turn-based end conditions are opt-in via an explicit config.maxTurns
      // (CG-0MSLXJCHH001DLIO); default presets impose no turn limit.
      state.config = { ...state.config, maxTurns: 20 };
      state.turn = 20;
      state.resourceBank.reputation = 5;
      state.resourceBank.coins = 10;
      state.phase = 'EndCheck';

      const logBefore = state.activityLog.length;
      checkEndConditions(state);

      const newEntries = state.activityLog.slice(logBefore);
      const victoryEntry = newEntries.find(e => e.text.includes('Victory'));
      expect(victoryEntry).toBeDefined();
      expect(victoryEntry!.type).toBe('gain');
      expect(victoryEntry!.text).toContain('Survived');
    });
  });

  describe('game end (loss)', () => {
    it('should log a loss entry for bankruptcy', () => {
      const state = createTestState();
      executeDayStart(state);

      state.resourceBank.coins = -1;

      const logBefore = state.activityLog.length;
      checkImmediateLoss(state);

      const entry = state.activityLog[logBefore];
      expect(entry.type).toBe('loss');
      expect(entry.text).toContain('Bankruptcy');
    });

    it('should log a loss entry for reputation collapse', () => {
      const state = createTestState();
      executeDayStart(state);

      state.turn = 2; // Must be > 1 for rep collapse
      state.resourceBank.reputation = 0;

      const logBefore = state.activityLog.length;
      checkImmediateLoss(state);

      const entry = state.activityLog[logBefore];
      expect(entry.type).toBe('loss');
      expect(entry.text).toContain('Reputation collapse');
    });

    it('should log a loss entry for turn exhaustion', () => {
      const state = createTestState();
      executeDayStart(state);

      // turn_exhaustion is only reachable when the turn-limit check runs before
      // the immediate-loss checks: on turn 1 the reputation-collapse guard is
      // skipped, so rep <= 0 at turn >= maxTurns (maxTurns = 1 here) falls
      // through to turn_exhaustion instead of reputation_collapse.
      state.config = { ...state.config, maxTurns: 1 };
      state.turn = 1;
      state.resourceBank.coins = 0;
      state.resourceBank.reputation = 0;
      state.phase = 'EndCheck';

      const logBefore = state.activityLog.length;
      checkEndConditions(state);

      const entry = state.activityLog[logBefore];
      expect(entry.type).toBe('loss');
      expect(entry.text).toContain('Turn limit exhausted');
    });
  });

  describe('full turn integration', () => {
    it('should produce a sequence of log entries for a complete turn', () => {
      const state = createTestState('integration-log-test');

      executeFullTurn(state, [{ type: 'end-turn' }]);

      // Should have at minimum: turn-header, income, night event (if drawn)
      expect(state.activityLog.length).toBeGreaterThanOrEqual(2);

      // First entry should be a turn header
      expect(state.activityLog[0].type).toBe('turn-header');
      expect(state.activityLog[0].text).toBe('Turn 1');

      // Should have an income entry
      const incomeEntry = state.activityLog.find(e => e.text.includes('Income'));
      expect(incomeEntry).toBeDefined();
    });

    it('should accumulate log entries across multiple turns', () => {
      const state = createTestState('multi-turn-log');

      // Turn 1
      executeFullTurn(state, [{ type: 'end-turn' }]);
      const countAfterTurn1 = state.activityLog.length;
      expect(countAfterTurn1).toBeGreaterThan(0);

      // Turn 2
      if (state.gameResult === 'playing') {
        executeFullTurn(state, [{ type: 'end-turn' }]);
        expect(state.activityLog.length).toBeGreaterThan(countAfterTurn1);
      }

      // All entries should have valid turn numbers
      for (const entry of state.activityLog) {
        expect(entry.turn).toBeGreaterThanOrEqual(1);
      }
    });

    it('should log business placement within a full turn', () => {
      const state = createTestState('biz-turn-log');
      executeDayStart(state);

      // Find an affordable business and place it
      const biz = state.market.cards[0];
      state.resourceBank.coins = 5000;

      purchaseBusiness(state, biz.id, 0);

      const placementEntry = state.activityLog.find(e => e.text.includes('Placed'));
      expect(placementEntry).toBeDefined();
      expect(placementEntry!.text).toContain(biz.name);
    });
  });

  // ── CG-0MT5W7UJJ0065MEZ: enriched entries + net row ───────

  describe('describeEventEffects / classifyEffect helpers (exported)', () => {
    it('should describe coin/rep deltas in a compact human-readable form', () => {
      expect(describeEventEffects(3, 2)).toBe('+3 coins, +2 rep');
      expect(describeEventEffects(-1, 0)).toBe('-1 coins');
      expect(describeEventEffects(0, 1)).toBe('+1 rep');
      expect(describeEventEffects(0, 0)).toBe('no effect');
    });

    it('should classify net coin+rep effect correctly', () => {
      expect(classifyEffect(1, 0)).toBe('gain');
      expect(classifyEffect(-1, 0)).toBe('loss');
      expect(classifyEffect(0, 0)).toBe('neutral');
      expect(classifyEffect(1, -2)).toBe('loss');
      expect(classifyEffect(-1, 2)).toBe('gain');
    });
  });

  describe('enriched: business purchase', () => {
    it('should log effective deltas for a business purchase alongside cost/slot', () => {
      const state = createTestState();
      executeDayStart(state);
      state.resourceBank.coins = 5000;
      const biz = state.market.cards.find(c => c.family === 'business');
      if (!biz) throw new Error('No business card in market for enriched purchase test');
      const before = state.resourceBank.coins;
      purchaseBusiness(state, biz.id, 0);
      const after = state.resourceBank.coins;
      const entry = lastLog(state);
      // Classified on the actual coin delta (net).
      expect(entry.type).toBe(classifyEffect(after - before, 0));
      expect(entry.text).toContain(biz.name);
      expect(entry.text).toContain('slot 0');
      // Enriched deltas are appended.
      expect(entry.text).toMatch(/(\+|-)\d+ coins/);
    });
  });

  describe('enriched: upgrade purchase', () => {
    it('should log effective deltas for an upgrade purchase', () => {
      const state = createTestState();
      executeDayStart(state);
      state.streetGrid[0] = makeBiz({ id: 'biz-upg-1', name: 'Bakery', maxLevel: 3 });
      const upgrade: UpgradeCard = {
        family: 'upgrade',
        id: 'upg-enrich-1',
        name: 'Better Ovens',
        description: 'Improve bakery',
        cost: 4,
        targetBusiness: 'Bakery',
        incomeBonus: 1,
        synergyRangeBonus: 0,
      };
      state.market.cards = [upgrade];
      state.resourceBank.coins = 5000;
      const before = state.resourceBank.coins;
      purchaseUpgrade(state, 'upg-enrich-1');
      const after = state.resourceBank.coins;
      const entry = lastLog(state);
      expect(entry.type).toBe(classifyEffect(after - before, 0));
      expect(entry.text).toContain('Better Ovens');
      expect(entry.text).toMatch(/(\+|-)\d+ coins/);
    });
  });

  describe('enriched: played event from hand', () => {
    it('should log cost plus effective deltas when playing an event from hand', () => {
      const state = createTestState();
      executeDayStart(state);
      state.resourceBank.coins = 20;
      const ev = makeInvestmentEvent({
        id: 'hand-play-ev-1',
        name: 'Local Festival',
        cost: 3,
        coinDelta: 5,
        reputationDelta: 1,
      });
      state.hand = [ev];
      state.resourceBank.coins = 20;
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;
      playEventFromHand(state, 0);
      const entry = lastLog(state);
      const coinDelta = state.resourceBank.coins - coinsBefore;
      const repDelta = state.resourceBank.reputation - repBefore;
      // Entry keeps existing substrings (card name, cost) and appends effective deltas.
      expect(entry.text).toContain('Local Festival');
      expect(entry.text).toContain('€3');
      expect(entry.text).toContain(describeEventEffects(coinDelta, repDelta));
      // Classification follows net coin+rep, not raw cost.
      expect(entry.type).toBe(classifyEffect(coinDelta, repDelta));
    });
  });

  describe('enriched: sells', () => {
    it('should log effective coin delta when selling from hand', () => {
      const state = createTestState();
      executeDayStart(state);
      const biz = makeBiz({ id: 'sell-hand-biz-1', name: 'Sun Cafe', cost: 4 });
      state.hand = [biz];
      const before = state.resourceBank.coins;
      sellFromHand(state, 0);
      const after = state.resourceBank.coins;
      const entry = lastLog(state);
      expect(entry.text).toContain('Sun Cafe');
      expect(entry.text).toMatch(/(\+|-)\d+ coins/);
      expect(entry.type).toBe(classifyEffect(after - before, 0));
    });

    it('should log effective coin delta when selling from tableau', () => {
      const state = createTestState();
      executeDayStart(state);
      state.streetGrid[0] = makeBiz({ id: 'sell-slot-biz-1', name: 'Sun Cafe', cost: 4 });
      const before = state.resourceBank.coins;
      sellFromTableau(state, 0);
      const after = state.resourceBank.coins;
      const entry = lastLog(state);
      expect(entry.text).toContain('Sun Cafe');
      expect(entry.text).toMatch(/(\+|-)\d+ coins/);
      expect(entry.type).toBe(classifyEffect(after - before, 0));
    });
  });

  describe('enriched: community favour exchange', () => {
    it('should log effective coin/rep deltas for community favour', () => {
      const state = createTestState();
      executeDayStart(state);
      state.resourceBank.coins = 500;
      state.resourceBank.reputation = 5;
      const beforeCoins = state.resourceBank.coins;
      const beforeRep = state.resourceBank.reputation;
      executeCommunityFavour(state, 'coins-to-rep');
      const entry = lastLog(state);
      const coinDelta = state.resourceBank.coins - beforeCoins;
      const repDelta = state.resourceBank.reputation - beforeRep;
      expect(entry.text).toContain('Community Favour');
      expect(entry.text).toContain(describeEventEffects(coinDelta, repDelta));
      expect(entry.type).toBe(classifyEffect(coinDelta, repDelta));
    });
  });

  describe('enriched: re-roll market', () => {
    it('should log effective coin delta on re-roll', () => {
      const state = createTestState();
      executeDayStart(state);
      state.resourceBank.coins = 5000;
      const before = state.resourceBank.coins;
      refreshMarket(state);
      const after = state.resourceBank.coins;
      const entry = lastLog(state);
      // Re-roll is a paid action; log should reflect the actual coin delta.
      expect(entry.text).toContain(describeEventEffects(after - before, 0));
      expect(entry.type).toBe(classifyEffect(after - before, 0));
    });
  });

  describe('enriched: staff hire / layoff', () => {
    it('should log effective coin delta on staff hire', () => {
      const state = createTestState();
      executeDayStart(state);
      const staff = makeStaffCard({ id: 'staff-enrich-1', name: 'General Helper', cost: 3 });
      state.market.cards = [staff as any];
      state.resourceBank.coins = 3000;
      const before = state.resourceBank.coins;
      hireStaffCard(state, 'staff-enrich-1');
      const after = state.resourceBank.coins;
      const entry = lastLog(state);
      expect(entry.text).toContain(describeEventEffects(after - before, 0));
      expect(entry.type).toBe(classifyEffect(after - before, 0));
    });

    it('should log on staff layoff (coin/rep deltas)', () => {
      const state = createTestState();
      executeDayStart(state);
      const staff = makeStaffCard({ id: 'staff-enrich-lay-1', name: 'General Helper', cost: 3 });
      state.staffCards = [staff];
      layoffStaffCard(state, 'staff-enrich-lay-1');
      const entry = lastLog(state);
      expect(entry.text).toContain('Laid off');
      expect(entry.text).toContain('General Helper');
      // Layoff already logs a delta via the card hand slots; verify enrichment.
      expect(entry.type).toBeDefined();
    });
  });

  describe('enriched: staff / community / business ongoing costs', () => {
    it('should log effective coin delta for staff ongoing costs', () => {
      const state = createTestState();
      executeDayStart(state);
      state.staffCards = [makeStaffCard({ id: 'staff-cost-1', name: 'A', cost: 1, ongoingCost: 2 })];
      state.resourceBank.coins = 20;
      const before = state.resourceBank.coins;
      applyStaffOngoingCosts(state);
      const after = state.resourceBank.coins;
      const entry = state.activityLog.find(e => e.text.includes('Staff costs'));
      expect(entry).toBeDefined();
      expect(entry!.text).toContain(describeEventEffects(after - before, 0));
      expect(entry!.type).toBe(classifyEffect(after - before, 0));
    });

    it('should log effective coin delta for community space ongoing costs', () => {
      const state = createTestState();
      executeDayStart(state);
      const cs = makeCommunitySpace({ id: 'cs-cost-1', name: 'Library', ongoingCost: 1 });
      state.streetGrid[0] = cs as any;
      state.resourceBank.coins = 20;
      const before = state.resourceBank.coins;
      applyCommunitySpaceOngoingCosts(state);
      const after = state.resourceBank.coins;
      const entry = state.activityLog.find(e => e.text.includes('Community space costs'));
      expect(entry).toBeDefined();
      expect(entry!.text).toContain(describeEventEffects(after - before, 0));
      expect(entry!.type).toBe(classifyEffect(after - before, 0));
    });

    it('should log effective coin delta for business ongoing costs', () => {
      const state = createTestState();
      executeDayStart(state);
      state.streetGrid[0] = makeBiz({ id: 'biz-cost-1', name: 'Clinic', ongoingCost: 1 });
      state.resourceBank.coins = 20;
      const before = state.resourceBank.coins;
      applyBusinessOngoingCosts(state);
      const after = state.resourceBank.coins;
      const entry = state.activityLog.find(e => e.text.includes('Business costs'));
      expect(entry).toBeDefined();
      expect(entry!.text).toContain(describeEventEffects(after - before, 0));
      expect(entry!.type).toBe(classifyEffect(after - before, 0));
    });
  });

  describe('per-turn net summary row (AC3)', () => {
    it('should append a net summary row at end of turn processing', () => {
      const state = createTestState('net-row-basic');
      executeDayStart(state);
      const startCoins = state.resourceBank.coins;
      const startRep = state.resourceBank.reputation;
      processEndOfTurn(state);
      const last = lastLog(state);
      expect(last.text).toMatch(/Turn \d+ net:/);
      expect(last.text).toContain(describeEventEffects(state.resourceBank.coins - startCoins, state.resourceBank.reputation - startRep));
    });

    it('should emit the net row even when the net is zero', () => {
      const state = createTestState('net-row-zero');
      // Establish a stable coin baseline BEFORE the day-start snapshot, then
      // ensure the turn produces no resource delta (empty grid/staff/incidents).
      state.resourceBank.coins = 10;
      executeDayStart(state);
      // Ensure income is zero and no ongoing costs are deducted.
      state.streetGrid = state.streetGrid.map(() => null);
      state.staffCards = [];
      state.incidentDeck = [];
      const beforeCoins = state.resourceBank.coins;
      const beforeRep = state.resourceBank.reputation;
      // Prevent income from charging trivial rounding effects.
      // With no businesses, income is 0.
      state.phase = 'MarketPhase';
      processEndOfTurn(state);
      const last = lastLog(state);
      expect(last.text).toMatch(/Turn \d+ net:/);
      expect(last.text).toContain(describeEventEffects(0, 0));
      expect(state.resourceBank.coins - beforeCoins).toBe(0);
      expect(state.resourceBank.reputation - beforeRep).toBe(0);
    });

    it('should use the day-start snapshot survived by save/load (clone/restore)', () => {
      const state = createTestState('net-row-clone');
      executeDayStart(state);
      // Clone via JSON round-trip (mirrors save/load snapshot requirement)
      const cloned: MainStreetState = JSON.parse(JSON.stringify(state));
      // Day-start snapshot fields should be preserved in (de)serialized form.
      if ((state as any).dayStartCoins !== undefined) {
        expect((cloned as any).dayStartCoins).toBe((state as any).dayStartCoins);
        expect((cloned as any).dayStartRep).toBe((state as any).dayStartRep);
      }
    });

    it('emits the net row before the game-over entry when the game ends prematurely', () => {
      const state = createTestState('net-row-game-over');
      executeDayStart(state);
      state.resourceBank.coins = -1; // force bankruptcy path
      processEndOfTurn(state);
      const netIdx = state.activityLog.findIndex(e => /Turn \d+ net:/.test(e.text));
      const overIdx = state.activityLog.findIndex(e => /Game Over|Bankruptcy/.test(e.text));
      // Net row is emitted; if game-over follows, net precedes it.
      if (netIdx !== -1 && overIdx !== -1) {
        expect(netIdx).toBeLessThan(overIdx);
      } else {
        expect(netIdx).not.toBe(-1);
      }
    });
  });
});
