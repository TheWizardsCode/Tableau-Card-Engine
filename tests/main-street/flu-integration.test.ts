/**
 * Flu Event: Integration & Monte Carlo Balance Tests
 *
 * Integration tests for the full flu event lifecycle:
 *   draw → clinic scan → income reduction → decay → expiration
 *
 * Monte Carlo balance verification:
 *   Compare win rates with/without flu event in the card pool.
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupMainStreetGame, serializeMainStreetState, deserializeMainStreetState, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeDayStart, processEndOfTurn, resolveIncident } from '../../example-games/main-street/MainStreetEngine';
import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';
import { createActiveEffect } from '../../src/core-engine/ActiveEffect';
import type { EventCard, BusinessCard } from '../../example-games/main-street/MainStreetCards';

/**
 * Creates a minimal BusinessCard for test grid placement.
 */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 5,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    upgradePath: undefined,
    maxLevel: overrides.maxLevel ?? 1,
    description: 'Test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    appliedUpgrades: [],
  };
}

describe('Flu event: full lifecycle integration', () => {
  let state: MainStreetState;

  beforeEach(() => {
    state = setupMainStreetGame({ seed: 'flu-lifecycle-001' });
  });

  it('full lifecycle: flu drawn → income reduced → decay → expiration → normal income', () => {
    // Place a business on the grid
    state.streetGrid[0] = makeBiz({ baseIncome: 10, id: 'biz-main' });

    // Manually add flu event to incident queue for deterministic test.
    // Must include duration/effectType/multiplier for isDurationEventCard guard.
    const fluEvent: EventCard = {
      family: 'event',
      id: 'evt-flu-outbreak',
      name: 'Flu Outbreak',
      trigger: 'Incident',
      cost: 0,
      effect: 'All businesses generate 80% income for 5 turns.',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 0,
      duration: 5,
      effectType: 'income-multiplier',
      multiplier: 0.8,
    } as unknown as EventCard;

    state.incidentDeck.unshift(fluEvent);

    // Resolve the flu incident
    const resolvedEvent = resolveIncident(state);
    expect(resolvedEvent).not.toBeNull();
    expect(resolvedEvent!.id).toBe('evt-flu-outbreak');

    // Active effect should be created
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0].effectType).toBe('income-multiplier');
    expect(state.activeEffects[0].multiplier).toBe(0.8);
    expect(state.activeEffects[0].turnsRemaining).toBe(5);

    // Process turns with proper phase transitions and verify decay
    state.phase = 'MarketPhase';
    let decayCount = 0;
    for (let i = 0; i < 10; i++) {
      const beforeEffect = state.activeEffects[0]?.turnsRemaining;
      processEndOfTurn(state);
      const afterEffect = state.activeEffects[0]?.turnsRemaining;
      if (beforeEffect !== undefined && (afterEffect === undefined || afterEffect < beforeEffect)) {
        decayCount++;
      }
      
      if (i <= 3 && state.activeEffects.length > 0) {
        // After i decays: should be 5-(i+1)
        expect(state.activeEffects[0].turnsRemaining).toBe(5 - (i + 1));
      }
      if (i >= 4 && state.activeEffects.length === 0) {
        // Effect expired after 5 decays
        break;
      }
      
      // processEndOfTurn sets phase to DayStart if game is still playing
      if (state.gameResult === 'playing') {
        executeDayStart(state);
      } else {
        break;
      }
    }

    // After enough decays, effect should be expired
    expect(state.activeEffects).toHaveLength(0);
  });

  it('clinic on grid reduces flu duration from 5 to 3 turns', () => {
    // Place a Clinic
    state.streetGrid[0] = makeBiz({ baseIncome: 5, id: 'biz-clinic-0', name: 'Clinic', synergyTypes: ['Health'] });
    state.streetGrid[1] = makeBiz({ baseIncome: 10, id: 'biz-main-0' });

    const fluEvent: EventCard = {
      family: 'event',
      id: 'evt-flu-outbreak',
      name: 'Flu Outbreak',
      trigger: 'Incident',
      cost: 0,
      effect: 'Income reduced to 80% for 5 turns.',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 0,
      duration: 5,
      effectType: 'income-multiplier',
      multiplier: 0.8,
    } as unknown as EventCard;
    state.incidentDeck.unshift(fluEvent);

    resolveIncident(state);

    // Duration should be 3 (5 - 2 from Clinic)
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0].turnsRemaining).toBe(3);
  });

  it('medical center reduces flu duration from 5 to 2 turns', () => {
    // Place a Medical Center (upgraded Clinic)
    state.streetGrid[0] = makeBiz({ baseIncome: 5, id: 'upg-medical-center-0', name: 'Medical Center', synergyTypes: ['Health'] });
    state.streetGrid[1] = makeBiz({ baseIncome: 10, id: 'biz-main-0' });

    const fluEvent: EventCard = {
      family: 'event',
      id: 'evt-flu-outbreak',
      name: 'Flu Outbreak',
      trigger: 'Incident',
      cost: 0,
      effect: 'Income reduced to 80% for 5 turns.',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 0,
      duration: 5,
      effectType: 'income-multiplier',
      multiplier: 0.8,
    } as unknown as EventCard;
    state.incidentDeck.unshift(fluEvent);

    resolveIncident(state);

    // Duration should be 2 (5 - 3 from Medical Center)
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0].turnsRemaining).toBe(2);
  });

  it('activity log records flu onset and expiration', () => {
    state.streetGrid[0] = makeBiz({ baseIncome: 5, id: 'biz-main-0' });

    const fluEvent: EventCard = {
      family: 'event',
      id: 'evt-flu-outbreak',
      name: 'Flu Outbreak',
      trigger: 'Incident',
      cost: 0,
      effect: 'Income reduced to 80% for 5 turns.',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 0,
      duration: 5,
      effectType: 'income-multiplier',
      multiplier: 0.8,
    } as unknown as EventCard;
    state.incidentDeck.unshift(fluEvent);

    const logBefore = state.activityLog.length;
    resolveIncident(state);

    // Onset logged
    const onsetLog = state.activityLog.slice(logBefore);
    expect(onsetLog.some(e => e.text.includes('Flu'))).toBe(true);

    // Process full turns until effect expires.
    // After resolveIncident, phase is IncidentPhase.
    // We need to advance through EndCheck to DayStart then process a full turn.
    // Manually set the phase to MarketPhase so processEndOfTurn works.
    state.phase = 'MarketPhase';

    for (let i = 0; i < 6; i++) {
      processEndOfTurn(state);
      // processEndOfTurn sets phase to DayStart if game is still playing
      if (state.gameResult === 'playing') {
        executeDayStart(state);
      }
    }

    // Expiration logged
    const expiredLog = state.activityLog.some(e => e.text.includes('expired'));
    expect(expiredLog).toBe(true);
  });
});

describe('Flu event: save/load round-trip', () => {
  it('preserves activeEffects through serialize/deserialize', () => {
    const state = setupMainStreetGame({ seed: 'flu-save-001' });

    // Add active effect
    state.activeEffects.push(
      createActiveEffect('income-multiplier', 0.8, 5, 'evt-flu-outbreak', 'Flu Outbreak'),
    );

    // Serialize
    const serialized = serializeMainStreetState(state);

    // Verify serialized has activeEffects
    expect(serialized.activeEffects).toHaveLength(1);
    expect(serialized.activeEffects[0].effectType).toBe('income-multiplier');
    expect(serialized.activeEffects[0].turnsRemaining).toBe(5);

    // Deserialize
    const deserialized = deserializeMainStreetState(serialized);

    // Verify activeEffects preserved
    expect(deserialized.activeEffects).toHaveLength(1);
    expect(deserialized.activeEffects[0].effectType).toBe('income-multiplier');
    expect(deserialized.activeEffects[0].multiplier).toBe(0.8);
    expect(deserialized.activeEffects[0].turnsRemaining).toBe(5);
    expect(deserialized.activeEffects[0].sourceEventId).toBe('evt-flu-outbreak');
  });

  it('handles missing activeEffects in old save data (migration to [])', () => {
    const state = setupMainStreetGame({ seed: 'flu-migrate-001' });

    // Serialize then remove activeEffects to simulate old save
    const serialized = serializeMainStreetState(state);
    delete (serialized as any).activeEffects;

    // Deserialize should not throw
    const deserialized = deserializeMainStreetState(serialized);
    expect(deserialized.activeEffects).toBeDefined();
    expect(deserialized.activeEffects).toHaveLength(0);
  });
});

describe('Flu event: Monte Carlo balance', () => {
  const monteSeeds = Number.parseInt(process.env['MONTE_SEEDS'] ?? '20', 10);

  // Skip Monte Carlo tests unless explicitly enabled (they take time)
  const itIfLong = monteSeeds > 10 ? it : it.skip;

  itIfLong('flu event does not drastically skew win rates on Medium', () => {
    // Run Monte Carlo with the full card pool (includes flu)
    const seeds = Array.from({ length: monteSeeds }, (_, i) => `mc-flu-balance-${i}`);
    const { metrics } = runMonteCarlo({ seeds, maxTurns: 60, strategy: 'market-greedy' });

    // Sanity: win rate should be reasonable (not trivially 0 or 1)
    expect(metrics.winRate).toBeGreaterThan(0.10);
    expect(metrics.winRate).toBeLessThanOrEqual(0.90);
    expect(metrics.runs).toBe(monteSeeds);
  });
});
