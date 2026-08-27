/**
 * Main Street: Activity Log Tests
 *
 * Verifies that every game-influencing action produces the correct
 * activity log entries in state.activityLog.
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
} from '../../example-games/main-street/MainStreetEngine';
import {
  purchaseBusiness,
  purchaseEvent,
  purchaseUpgrade,
} from '../../example-games/main-street/MainStreetMarket';
import { applyIncome, recalculateCard } from '../../example-games/main-street/MainStreetAdjacency';
import {
  WIN_THRESHOLD,
  type BusinessCard,
  type EventCard,
  type UpgradeCard,
} from '../../example-games/main-street/MainStreetCards';

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
      state.resourceBank.coins = 20; // ensure enough coins
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
    it('should log a neutral entry when an Investment event is purchased', () => {
      const state = createTestState();
      executeDayStart(state);

      // Inject an Investment event into the investments row
      const investmentEvent = makeInvestmentEvent({ id: 'inv-evt-1', name: 'Test Fest' });
      state.market.cards = [investmentEvent];
      purchaseEvent(state, 'inv-evt-1');

      const entry = lastLog(state);
      expect(entry.type).toBe('neutral');
      expect(entry.text).toContain('Bought event');
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
      // CG-0MREYZO7E00729S0: fractional coin format uses 3 decimal places
      expect(entry.text).toMatch(/\+\d+\.\d{3} coins/);
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
      // CG-0MREYZO7E00729S0: zero income logged as +0.000 coins
      expect(entry.text).toContain('0.000 coins');
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
      state.resourceBank.coins = WIN_THRESHOLD + 50;
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
      state.resourceBank.coins = 50;

      purchaseBusiness(state, biz.id, 0);

      const placementEntry = state.activityLog.find(e => e.text.includes('Placed'));
      expect(placementEntry).toBeDefined();
      expect(placementEntry!.text).toContain(biz.name);
    });
  });
});
