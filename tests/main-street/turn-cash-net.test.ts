/**
 * Main Street: Turn Net Row & Activity Log Ordering Tests
 *
 * Verifies that the per-turn net summary row is the canonical accounting
 * record at the end of every turn, including premature exits and competitive
 * closing (CG-0MTJP6XU5009KN5L).
 *
 * Core invariants (CG-0MT5W7UJJ0065MEZ + CG-0MTJP6XU5009KN5L):
 *   - Net row uses `dayStartCoins` / `dayStartRep` snapshots.
 *   - Net row = `resourceBank - dayStartSnapshot` for both coins and rep.
 *   - Log ordering: income → costs → incident (or averted) → net row.
 *   - Net row is the final log entry of a completed turn (including premature
 *     exits and competitive closing phases).
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  createCompetitiveState,
  type MainStreetState,
  type LogEntry,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  describeEventEffects,
} from '../../example-games/main-street/MainStreetEngine';
import {
  type BusinessCard,
  type StaffCard,
  type EventCard,
} from '../../example-games/main-street/MainStreetCards';
import { recalculateCard } from '../../example-games/main-street/MainStreetAdjacency';

// ── Helpers ────────────────────────────────────────────────────────────────────

function createTestState(seed: string = 'turn-cash-net'): MainStreetState {
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
    reputationPerTurn: overrides.reputationPerTurn,
  };
}

function lastLog(state: MainStreetState): LogEntry {
  return state.activityLog[state.activityLog.length - 1];
}

/**
 * Find all log entry indices matching a predicate, returning sorted indices.
 */
function findLogEntries(state: MainStreetState, predicate: (entry: LogEntry) => boolean): number[] {
  return state.activityLog.reduce<number[]>((acc, entry, idx) => {
    if (predicate(entry)) acc.push(idx);
    return acc;
  }, []);
}

/** Net-row regex — matches "Turn N net:" but NOT "Turn N" headers. */
const NET_ROW_RE = /^Turn \d+ net:/;

/**
 * Create a Risk Manager staff card: probabilityReductionPct = 0.15.
 */
function createRiskManager(): StaffCard {
  return {
    family: 'staff',
    id: 'risk-manager-1',
    name: 'Risk Manager',
    cost: 5,
    ongoingCost: 0,
    handSlotsAdded: 0,
    description: 'A risk manager',
    specializationSkillIds: ['skill-risk-manager'],
  };
}

function makeNoiseComplaint(): EventCard {
  return {
    family: 'event',
    id: 'noise-1',
    name: 'Noise Complaint',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin, -1 rep',
    coinDelta: -1,
    reputationDelta: -1,
    target: 'All',
  };
}

// ── Scenario 1: Standard turn decomposition (no incident) ──────────────────────

describe('Turn net row and activity log ordering', () => {
  describe('processEndOfTurn — standard turn (no incident)', () => {
    it('emits log entries in correct order: income → costs → net', () => {
      const state = createTestState('std-no-incident');
      executeDayStart(state);

      // Place one business (Bakery, baseIncome=2, ongoingCost=0) on the grid
      const bakery = makeBiz({ id: 'bakery-1', name: 'Bakery', baseIncome: 2, ongoingCost: 0 });
      state.streetGrid[0] = bakery;

      // Clear the incident deck so resolveIncident returns null
      state.incidentDeck = [];

      recalculateCard(state, 0);

      processEndOfTurn(state);

      // The net row is the last entry
      const netEntry = lastLog(state);
      expect(netEntry.text).toMatch(NET_ROW_RE);

      // Verify net = coins_now - dayStartCoins, rep_now - dayStartRep
      const deltaCoins = state.resourceBank.coins - state.dayStartCoins!;
      const deltaRep = state.resourceBank.reputation - state.dayStartRep!;
      expect(netEntry.text).toContain(describeEventEffects(deltaCoins, deltaRep));

      // Verify ordering: income before costs before net
      const incomeIdx = findLogEntries(state, e => e.text.includes('Income:'));
      const costIdx = findLogEntries(state, e => e.text.includes('Business costs:'));
      const netIdx = findLogEntries(state, e => NET_ROW_RE.test(e.text));

      expect(incomeIdx.length).toBeGreaterThan(0);
      if (costIdx.length > 0) {
        expect(incomeIdx[0]).toBeLessThan(costIdx[0]);
      }
      // Net is always last
      expect(netIdx[0]).toBe(state.activityLog.length - 1);
    });

    it('net row delta equals sum of all resource changes in the turn', () => {
      const state = createTestState('std-no-incident-delta');
      executeDayStart(state);

      // Place one business with known income
      const bakery = makeBiz({ id: 'bakery-1', name: 'Bakery', baseIncome: 3, ongoingCost: 1, reputationPerTurn: 1 });
      state.streetGrid[0] = bakery;
      state.incidentDeck = [];

      recalculateCard(state, 0);

      const dayStartCoins = state.dayStartCoins!;
      const dayStartRep = state.dayStartRep!;

      processEndOfTurn(state);

      const netEntry = lastLog(state);
      const deltaCoins = state.resourceBank.coins - dayStartCoins;
      const deltaRep = state.resourceBank.reputation - dayStartRep;

      // The net row must reflect the exact deltas
      expect(netEntry.text).toContain(describeEventEffects(deltaCoins, deltaRep));
    });
  });

  // ── Scenario 2: Forced incident ──────────────────────────────────────────────

  describe('processEndOfTurn — forced incident (Noise Complaint)', () => {
    it('emits log entries in order: income → costs → incident → net', () => {
      const state = createTestState('forced-incident');
      executeDayStart(state);

      // Place an Arcade (baseIncome=2, ongoingCost=1, reputationPerTurn=5)
      const arcade = makeBiz({
        id: 'arcade-1',
        name: 'Arcade',
        baseIncome: 2,
        ongoingCost: 1,
        synergyTypes: ['Entertainment'],
        reputationPerTurn: 5,
      });
      state.streetGrid[0] = arcade;

      // Force the Noise Complaint incident
      state.incidentDeck = [makeNoiseComplaint()];

      recalculateCard(state, 0);

      processEndOfTurn(state);

      const entries = state.activityLog;

      // Find indices of key entries
      const incomeIdx = findLogEntries(state, e => e.text.includes('Income:'));
      const costIdx = findLogEntries(state, e => e.text.includes('Business costs:'));
      const incidentIdx = findLogEntries(state, e => e.text.includes('Incident:'));
      const netIdx = findLogEntries(state, e => NET_ROW_RE.test(e.text));

      // All four entry types should be present
      expect(incomeIdx.length).toBeGreaterThan(0);
      expect(costIdx.length).toBeGreaterThan(0);
      expect(incidentIdx.length).toBe(1);
      expect(netIdx.length).toBe(1);

      // Verify ordering
      expect(incomeIdx[0]).toBeLessThan(costIdx[0]);
      expect(costIdx[0]).toBeLessThan(incidentIdx[0]);
      expect(incidentIdx[0]).toBeLessThan(netIdx[0]);
      expect(netIdx[0]).toBe(entries.length - 1); // net is final
    });
  });

  // ── Scenario 3: Risk Manager averted path ────────────────────────────────────

  describe('processEndOfTurn — Risk Manager averted path', () => {
    it('emits log entries in order: income → costs → averted → net', () => {
      const state = createTestState('risk-manager-averted');
      executeDayStart(state);

      // Place an Arcade with known income and ongoing cost
      const arcade = makeBiz({
        id: 'arcade-1',
        name: 'Arcade',
        baseIncome: 2,
        ongoingCost: 1,
        synergyTypes: ['Entertainment'],
        reputationPerTurn: 5,
      });
      state.streetGrid[0] = arcade;

      // Employ a Risk Manager (probabilityReductionPct = 0.15)
      const riskManager = createRiskManager();
      riskManager.employedAtSlot = 0;
      state.staffCards = [riskManager];

      // Force a Noise Complaint into the incident deck
      state.incidentDeck = [makeNoiseComplaint()];

      // Override rng to deterministically trigger the avert path
      // Risk Manager averts when state.rng() < 0.15
      state.rng = () => 0.05; // deterministic: 0.05 < 0.15 → avert

      recalculateCard(state, 0);

      processEndOfTurn(state);

      const entries = state.activityLog;

      // Verify ordering: income → costs → averted → net
      const incomeIdx = findLogEntries(state, e => e.text.includes('Income:'));
      const costIdx = findLogEntries(state, e => e.text.includes('Business costs:'));
      const avertedIdx = findLogEntries(state, e => e.text.includes('Risk Manager averted'));
      const netIdx = findLogEntries(state, e => NET_ROW_RE.test(e.text));

      expect(incomeIdx.length).toBeGreaterThan(0);
      expect(costIdx.length).toBeGreaterThan(0);
      expect(avertedIdx.length).toBe(1);
      expect(netIdx.length).toBe(1);

      expect(incomeIdx[0]).toBeLessThan(costIdx[0]);
      expect(costIdx[0]).toBeLessThan(avertedIdx[0]);
      expect(avertedIdx[0]).toBeLessThan(netIdx[0]);
      expect(netIdx[0]).toBe(entries.length - 1);

      // Verify no Incident log entry was produced
      const incidentEntries = findLogEntries(state, e => e.text.includes('Incident:'));
      expect(incidentEntries.length).toBe(0);

      // Verify the incident deck is untouched (still has 1 card)
      expect(state.incidentDeck.length).toBe(1);
    });

    it('net row does not include incident delta when averted', () => {
      const state = createTestState('rm-averted-no-incident-delta');
      executeDayStart(state);

      const arcade = makeBiz({
        id: 'arcade-1',
        name: 'Arcade',
        baseIncome: 3,
        ongoingCost: 1,
        synergyTypes: ['Entertainment'],
        reputationPerTurn: 5,
      });
      state.streetGrid[0] = arcade;

      const riskManager = createRiskManager();
      riskManager.employedAtSlot = 0;
      state.staffCards = [riskManager];

      state.incidentDeck = [makeNoiseComplaint()];

      state.rng = () => 0.05;

      recalculateCard(state, 0);

      const dayStartCoins = state.dayStartCoins!;
      const dayStartRep = state.dayStartRep!;

      processEndOfTurn(state);

      const netEntry = lastLog(state);
      const deltaCoins = state.resourceBank.coins - dayStartCoins;
      const deltaRep = state.resourceBank.reputation - dayStartRep;

      // Net should reflect income + costs only (no incident delta)
      expect(netEntry.text).toContain(describeEventEffects(deltaCoins, deltaRep));
    });
  });

  // ── Scenario 4: Premature bankruptcy exit ────────────────────────────────────

  describe('processEndOfTurn — premature bankruptcy exit', () => {
    it('emits net row and game-over banner; net row is final entry', () => {
      const state = createTestState('premature-bankruptcy');
      executeDayStart(state);

      // Place a business that generates low income but has high ongoing cost
      // Bankruptcy requires coins < 0. We set coins to 0 and use a large
      // incident delta to push below zero (the turn header already set
      // dayStartCoins to ~600, so we reset it to 0 after day start).
      const arcade = makeBiz({
        id: 'arcade-1',
        name: 'Arcade',
        baseIncome: 0,
        ongoingCost: 0,
        synergyTypes: ['Entertainment'],
      });
      state.streetGrid[0] = arcade;
      // Incident that pushes coins negative
      const bankruptcy: EventCard = {
        family: 'event',
        id: 'evt-bank',
        name: 'Bankruptcy Incident',
        trigger: 'Incident',
        cost: 0,
        effect: '-10 coins',
        coinDelta: -10,
        reputationDelta: 0,
        target: 'All',
      };
      state.incidentDeck = [bankruptcy];
      state.resourceBank.coins = 0;

      recalculateCard(state, 0);

      processEndOfTurn(state);

      const entries = state.activityLog;

      // Net row must be present
      const netIdx = findLogEntries(state, e => NET_ROW_RE.test(e.text));
      expect(netIdx.length).toBeGreaterThanOrEqual(1);

      // Game-over banner should be present
      const bannerIdx = findLogEntries(state, e =>
        e.text.includes('Game Over') || e.text.includes('Bankruptcy'),
      );
      expect(bannerIdx.length).toBeGreaterThan(0);

      // Net row must be the final entry (banner comes before it)
      expect(netIdx[netIdx.length - 1]).toBe(entries.length - 1);

      // Game should have ended
      expect(state.gameResult).toBe('loss');
    });

    it('net row delta reflects full turn effects even on premature exit', () => {
      const state = createTestState('premature-bankruptcy-delta');
      executeDayStart(state);

      // Low income, high ongoing cost — net is negative
      const arcade = makeBiz({
        id: 'arcade-1',
        name: 'Arcade',
        baseIncome: 0,
        ongoingCost: 3,
        synergyTypes: ['Entertainment'],
      });
      state.streetGrid[0] = arcade;
      state.incidentDeck = [];
      state.resourceBank.coins = 0;

      recalculateCard(state, 0);

      const dayStartCoins = state.dayStartCoins!;

      processEndOfTurn(state);

      const netEntry = lastLog(state);
      const deltaCoins = state.resourceBank.coins - dayStartCoins;

      // Even though the turn ends prematurely, the net row should
      // correctly reflect the actual delta
      const deltaRep = state.resourceBank.reputation - state.dayStartRep!;
      expect(netEntry.text).toContain(describeEventEffects(deltaCoins, deltaRep));
    });
  });

  // ── Scenario 5: Premature rep-collapse exit ──────────────────────────────────

  describe('processEndOfTurn — rep collapse exit', () => {
    it('emits net row and game-over banner; net row is final entry', () => {
      const state = createTestState('rep-collapse');
      executeDayStart(state);

      state.incidentDeck = [];
      state.resourceBank.reputation = 0;
      state.turn = 2; // rep collapse only triggers turn > 1

      processEndOfTurn(state);

      const entries = state.activityLog;

      // Banner is emitted first, then net row as the final entry
      // (fixed ordering — net is the canonical closing record; CG-0MTJP6XU5009KN5L).
      const netIdx = findLogEntries(state, e => NET_ROW_RE.test(e.text));
      expect(netIdx.length).toBeGreaterThanOrEqual(1);

      const bannerIdx = findLogEntries(state, e =>
        e.text.includes('Game Over') || e.text.includes('Reputation collapse'),
      );
      expect(bannerIdx.length).toBeGreaterThan(0);

      // Net row must be the final entry (banner comes before it)
      expect(netIdx[netIdx.length - 1]).toBe(entries.length - 1);

      expect(state.gameResult).toBe('loss');
    });
  });

  // ── Scenario 6: Competitive resolveCompetitiveClosingPhases ───────────────────

  describe('resolveCompetitiveClosingPhases', () => {
    it('emits per-owner income then net row as final entry', () => {
      // Use createCompetitiveState so players[] is populated
      const state = createCompetitiveState({
        seed: 'comp-net-ordering',
        playerCount: 2,
      });

      // Both players start with enough coins
      state.players![0].coins = 200;
      state.players![1].coins = 200;
      state.resourceBank.coins = 200; // host wallet

      executeDayStart(state);

      // Place a business in the shared grid
      const bakery = makeBiz({
        id: 'bakery-1',
        name: 'Bakery',
        baseIncome: 3,
        ongoingCost: 1,
        synergyTypes: ['Food'],
      });
      state.streetGrid[0] = bakery;
      recalculateCard(state, 0);

      state.incidentDeck = [];

      processEndOfTurn(state);

      const entries = state.activityLog;

      // Should have per-owner income entries or shared income entries
      const incomeEntries = findLogEntries(state, e =>
        e.text.includes('Income:') || e.text.match(/P\d Income:/) !== null,
      );
      expect(incomeEntries.length).toBeGreaterThan(0);

      // Net row should be final
      const netIdx = findLogEntries(state, e => NET_ROW_RE.test(e.text));
      expect(netIdx.length).toBeGreaterThanOrEqual(1);
      expect(netIdx[netIdx.length - 1]).toBe(entries.length - 1);
    });
  });

  // ── Snapshot integrity ───────────────────────────────────────────────────────

  describe('dayStart snapshot integrity', () => {
    it('net row uses dayStart snapshot, not current values', () => {
      const state = createTestState('snapshot-integrity');
      executeDayStart(state);

      const arcade = makeBiz({
        id: 'arcade-1',
        name: 'Arcade',
        baseIncome: 5,
        ongoingCost: 0,
        synergyTypes: ['Entertainment'],
      });
      state.streetGrid[0] = arcade;
      state.incidentDeck = [];

      recalculateCard(state, 0);

      // Mutate dayStartCoins AFTER snapshot to verify net uses the snapshot
      const originalDayStartCoins = state.dayStartCoins;
      state.dayStartCoins = 0; // corrupt snapshot

      processEndOfTurn(state);

      const netEntry = lastLog(state);
      // Net should use the corrupted snapshot (0), so delta = coins_now - 0 = coins_now
      const expectedDeltaCoins = state.resourceBank.coins;
      const deltaRep = state.resourceBank.reputation - (state.dayStartRep ?? state.resourceBank.reputation);
      expect(netEntry.text).toContain(describeEventEffects(expectedDeltaCoins, deltaRep));

      // Restore
      state.dayStartCoins = originalDayStartCoins;
    });
  });
});
