/**
 * Duration Event Resolution: Tests
 *
 * Tests for DurationEventCard resolution in MainStreetEngine,
 * including clinic/medical center duration reduction.
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { resolveEvent } from '../../example-games/main-street/MainStreetEngine';
import type { DurationEventCard } from '../../example-games/main-street/MainStreetCards';

/**
 * Creates a sample DurationEventCard for testing.
 */
function makeFluEvent(overrides: Partial<DurationEventCard> = {}): DurationEventCard {
  return {
    family: 'event',
    id: overrides.id ?? 'evt-flu-outbreak',
    name: overrides.name ?? 'Flu Outbreak',
    trigger: 'Incident',
    cost: 0,
    effect: overrides.effect ?? 'Income reduced to 80% for 5 turns.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 0,
    duration: overrides.duration ?? 5,
    effectType: overrides.effectType ?? 'income-multiplier',
    multiplier: overrides.multiplier ?? 0.8,
  };
}

/**
 * Helper: place a card (by template ID) on the street grid at a given slot.
 */
function placeCardOnGrid(state: MainStreetState, templateId: string, slotIndex: number): void {
  // Find a business card from the business deck
  const bizIdx = state.decks.business.findIndex(b => b.id.startsWith(templateId));
  if (bizIdx >= 0) {
    const card = state.decks.business.splice(bizIdx, 1)[0];
    state.streetGrid[slotIndex] = card;
    return;
  }

  // If not in business deck, create a minimal business card matching the template ID
  const card = {
    family: 'business' as const,
    id: `${templateId}-test-0`,
    name: templateId === 'biz-clinic' ? 'Clinic' : templateId === 'upg-medical-center' ? 'Medical Center' : 'Test',
    cost: 0,
    baseIncome: 1,
    synergyTypes: ['Health'] as readonly ('Health')[],
    upgradePath: undefined,
    maxLevel: 1,
    description: '',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
  state.streetGrid[slotIndex] = card;
}

describe('Duration event resolution in MainStreetEngine', () => {
  let state: MainStreetState;

  beforeEach(() => {
    state = setupMainStreetGame({
      seed: 'test-flu-001',
      unlockedCardIds: [
        'biz-bakery', 'biz-diner', 'biz-bookshop',
        'biz-clinic', 'biz-hardware',
      ],
    });
  });

  describe('resolveEvent with DurationEventCard', () => {
    it('creates an ActiveEffect when resolving a DurationEventCard', () => {
      const fluEvent = makeFluEvent();

      resolveEvent(state, fluEvent);

      expect(state.activeEffects).toHaveLength(1);
      expect(state.activeEffects[0].effectType).toBe('income-multiplier');
      expect(state.activeEffects[0].multiplier).toBe(0.8);
      expect(state.activeEffects[0].sourceEventId).toBe('evt-flu-outbreak');
      expect(state.activeEffects[0].turnsRemaining).toBe(5);
    });

    it('does not modify coinDelta or reputationDelta resources for DurationEventCard', () => {
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;
      const fluEvent = makeFluEvent();

      resolveEvent(state, fluEvent);

      // Resources should be unchanged (duration events don't apply deltas directly)
      expect(state.resourceBank.coins).toBe(coinsBefore);
      expect(state.resourceBank.reputation).toBe(repBefore);
    });

    it('resolves a regular EventCard normally (does not create ActiveEffect)', () => {
      const regularEvent = {
        family: 'event' as const,
        id: 'evt-festival',
        name: 'Local Festival',
        trigger: 'Investment' as const,
        cost: 3,
        effect: '+2 coins to all Culture businesses and +1 reputation.',
        target: 'All' as const,
        coinDelta: 2,
        reputationDelta: 1,
      };

      const repBefore = state.resourceBank.reputation;

      resolveEvent(state, regularEvent);

      // No active effect created
      expect(state.activeEffects).toHaveLength(0);
      // Resources are modified as usual (reputation delta applied)
      // Note: coinDelta is per-matching-business, and there are no
      // Culture businesses on the grid in this test setup, so only
      // reputation changes
      expect(state.resourceBank.reputation).toBeGreaterThan(repBefore);
    });

    it('logs the flu onset to activityLog', () => {
      const fluEvent = makeFluEvent();
      const logBefore = state.activityLog.length;

      resolveEvent(state, fluEvent);

      expect(state.activityLog.length).toBe(logBefore + 1);
      expect(state.activityLog[logBefore].text).toContain('Flu');
      expect(state.activityLog[logBefore].text).toContain('5');
    });
  });

  describe('Clinic/Medical Center duration reduction for flu', () => {
    it('reduces duration from 5 to 3 when a Clinic is present', () => {
      // Place a Clinic on the grid
      placeCardOnGrid(state, 'biz-clinic', 0);

      const fluEvent = makeFluEvent();
      resolveEvent(state, fluEvent);

      expect(state.activeEffects).toHaveLength(1);
      // Clinic reduces duration by 2: 5 - 2 = 3
      expect(state.activeEffects[0].turnsRemaining).toBe(3);
    });

    it('reduces duration from 5 to 2 when a Medical Center is present', () => {
      // Place a Medical Center on the grid
      placeCardOnGrid(state, 'upg-medical-center', 0);

      const fluEvent = makeFluEvent();
      resolveEvent(state, fluEvent);

      expect(state.activeEffects).toHaveLength(1);
      // Medical Center reduces duration by 3: 5 - 3 = 2
      expect(state.activeEffects[0].turnsRemaining).toBe(2);
    });

    it('applies only the stronger reduction (Medical Center) when both Clinic and Medical Center exist', () => {
      placeCardOnGrid(state, 'biz-clinic', 0);
      placeCardOnGrid(state, 'upg-medical-center', 1);

      const fluEvent = makeFluEvent();
      resolveEvent(state, fluEvent);

      expect(state.activeEffects).toHaveLength(1);
      // Medical Center (-3) is stronger than Clinic (-2), so 5 - 3 = 2
      expect(state.activeEffects[0].turnsRemaining).toBe(2);
    });

    it('enforces minimum duration of 1 turn even with strong coverage', () => {
      // Place two Medical Centers
      placeCardOnGrid(state, 'upg-medical-center', 0);

      // With base 5 and medical center reduction of 3, we get 2 (not below 1)
      // To test floor, use a shorter duration
      const shortFlu = makeFluEvent({ duration: 2 });
      resolveEvent(state, shortFlu);

      expect(state.activeEffects).toHaveLength(1);
      // 2 - 3 = -1, floor at 1
      expect(state.activeEffects[0].turnsRemaining).toBe(1);
    });

    it('does NOT reduce duration when no Clinic or Medical Center is present', () => {
      // Place a non-health business
      placeCardOnGrid(state, 'biz-bakery', 0);

      const fluEvent = makeFluEvent();
      resolveEvent(state, fluEvent);

      expect(state.activeEffects).toHaveLength(1);
      // No reduction: 5 turns
      expect(state.activeEffects[0].turnsRemaining).toBe(5);
    });
  });
});
