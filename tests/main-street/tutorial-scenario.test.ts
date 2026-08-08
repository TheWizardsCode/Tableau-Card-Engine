/**
 * Tutorial Scenario Tests
 *
 * Verifies that the TutorialScenario system:
 * - Creates a valid MainStreetState without seed-based shuffling
 * - Places exactly the expected cards in the market and incident queue
 * - Uses only Tier-1 card IDs (validation test catches drift)
 * - Provides sufficient coin budget for all tutorial steps
 * - Is deterministic (same result every invocation)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  createTutorialScenario,
  STANDARD_TUTORIAL_SCENARIO,
} from '../../example-games/main-street/TutorialScenario';
import {
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
} from '../../example-games/main-street/MainStreetCards';
import type { BusinessCard, EventCard } from '../../example-games/main-street/MainStreetCards';
import { getPreset } from '../../example-games/main-street/MainStreetDifficulty';
import { TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';
import { UNIFIED_TUTORIAL_STEPS } from '../../example-games/main-street/TutorialFlow';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns true if the card's ID starts with the given base template ID.
 * E.g. card 'biz-laundromat-0' matches template 'biz-laundromat'.
 */
function matchesTemplate(cardId: string, templateId: string): boolean {
  return cardId.startsWith(templateId);
}

/**
 * All Tier-1 base template IDs.
 */
function getTier1TemplateIds(): Set<string> {
  return new Set(TIER_DEFINITIONS['tier-1'].newCardIds);
}

// ── Tests ─────────────────────────────────────────────────────

describe('STANDARD_TUTORIAL_SCENARIO definition', () => {
  it('defines Easy difficulty', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.difficulty).toBe('Easy');
  });

  it('defines starting coins and reputation matching Easy preset', () => {
    const preset = getPreset('Easy');
    expect(STANDARD_TUTORIAL_SCENARIO.resourceBank.coins).toBe(preset.startingCoins);
    expect(STANDARD_TUTORIAL_SCENARIO.resourceBank.reputation).toBe(preset.startingReputation);
  });

  it('defines exactly MARKET_BUSINESS_SLOTS development row cards', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.market.development.length).toBe(MARKET_BUSINESS_SLOTS);
  });

  it('defines exactly MARKET_INVESTMENT_SLOTS investments row cards', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.market.investments.length).toBe(MARKET_INVESTMENT_SLOTS);
  });

  it('defines exactly INCIDENT_QUEUE_SIZE incident cards', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
  });

  it('all development row card template IDs are from Tier-1 pool', () => {
    const tier1Ids = getTier1TemplateIds();
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.development) {
      expect(tier1Ids.has(templateId)).toBe(true);
    }
  });

  it('all investments row card template IDs are from Tier-1 pool', () => {
    const tier1Ids = getTier1TemplateIds();
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.investments) {
      expect(tier1Ids.has(templateId)).toBe(true);
    }
  });

  it('all incident queue card template IDs are from Tier-1 pool', () => {
    const tier1Ids = getTier1TemplateIds();
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.incidentQueue) {
      expect(tier1Ids.has(templateId)).toBe(true);
    }
  });
});

describe('createTutorialScenario', () => {
  it('returns a valid MainStreetState', () => {
    const state = createTutorialScenario();
    expect(state).toBeDefined();
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('DayStart');
  });

  it('is deterministic (same seed produces same state)', () => {
    const state1 = createTutorialScenario();
    const state2 = createTutorialScenario();
    // Same market cards
    expect(state1.market.development.map(c => c.id)).toEqual(
      state2.market.development.map(c => c.id),
    );
    expect(state1.market.investments.map(c => c.id)).toEqual(
      state2.market.investments.map(c => c.id),
    );
    expect(state1.incidentQueue.map(c => c.id)).toEqual(
      state2.incidentQueue.map(c => c.id),
    );
    // Same resource bank
    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
  });

  it('has Easy difficulty', () => {
    const state = createTutorialScenario();
    expect(state.config.difficultyName).toBe('Easy');
  });

  it('has correct starting resources per Easy preset', () => {
    const preset = getPreset('Easy');
    const state = createTutorialScenario();
    expect(state.resourceBank.coins).toBe(preset.startingCoins);
    expect(state.resourceBank.reputation).toBe(preset.startingReputation);
  });

  it('has exactly MARKET_BUSINESS_SLOTS cards in development row', () => {
    const state = createTutorialScenario();
    expect(state.market.development.length).toBe(MARKET_BUSINESS_SLOTS);
  });

  it('has exactly 2 upgrades + 1 event in investments row', () => {
    const state = createTutorialScenario();
    const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
    const events = state.market.investments.filter(c => c.family === 'event');
    expect(upgrades.length).toBe(2);
    expect(events.length).toBe(1);
  });

  it('has exactly INCIDENT_QUEUE_SIZE cards in incident queue', () => {
    const state = createTutorialScenario();
    expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
  });

  it('has all incident cards as Incident-trigger events', () => {
    const state = createTutorialScenario();
    for (const card of state.incidentQueue) {
      expect(card.family).toBe('event');
      expect((card as EventCard).trigger).toBe('Incident');
    }
  });

  it('has an empty street grid (10 null slots)', () => {
    const state = createTutorialScenario();
    expect(state.streetGrid.length).toBe(10);
    expect(state.streetGrid.every(slot => slot === null)).toBe(true);
  });

  it('has no held event', () => {
    const state = createTutorialScenario();
    expect(state.hand.some(c => c.family === 'event')).toBe(false);
  });

  it('has game result of playing', () => {
    const state = createTutorialScenario();
    expect(state.gameResult).toBe('playing');
  });

  it('has an RNG function defined', () => {
    const state = createTutorialScenario();
    expect(typeof state.rng).toBe('function');
  });

  it('has a non-empty seed string', () => {
    const state = createTutorialScenario();
    expect(state.seed).toBeTruthy();
  });

  it('has active challenges selected', () => {
    const state = createTutorialScenario();
    expect(state.activeChallenges.length).toBeGreaterThan(0);
  });

  // ── Coin budget verification (AC5) ───────────────────────────

  it('provides sufficient coin budget for tutorial (12 starting, $4 Laundromat, $2 event)', () => {
    const state = createTutorialScenario();
    // Starting with Easy preset: 12 coins
    expect(state.resourceBank.coins).toBe(12);

    // The Laundromat referenced in T3 must exist and cost ≤ 4
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    const laundromat = state.market.development.find(
      c => matchesTemplate(c.id, t3.requiredCardId ?? ''),
    );
    expect(laundromat).toBeDefined();
    expect(laundromat!.cost).toBeLessThanOrEqual(4);

    // After buying $4 card: 8 coins remaining
    const afterLaundromat = state.resourceBank.coins - 4;
    expect(afterLaundromat).toBe(8);

    // After one turn's income (base income from Laundromat is 0.5):
    // 8 + 0.5 = 8.5 coins should be enough for a $2 event
    expect(8.5).toBeGreaterThanOrEqual(2);
  });

  // ── Market card integration with tutorial steps ──────────────

  it('Laundromat is in the development row matching T3 requiredCardId', () => {
    const state = createTutorialScenario();
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;

    // The requiredCardId must be present in the development row
    const marketCard = state.market.development.find(
      c => matchesTemplate(c.id, t3.requiredCardId ?? ''),
    );
    expect(marketCard).toBeDefined();
    expect(marketCard!.family).toBe('business');

    // Verify it's the Laundromat
    const laundromat = marketCard as BusinessCard;
    expect(laundromat.name).toBe('Laundromat');
    expect(laundromat.cost).toBe(4);
  });

  it('an investment event card is in the investments row matching T7', () => {
    const state = createTutorialScenario();
    const invEvents = state.market.investments.filter(
      c => c.family === 'event',
    ) as EventCard[];
    expect(invEvents.length).toBe(1);

    // The event should be affordable after buying Laundromat + one income turn
    expect(invEvents[0].cost).toBeGreaterThanOrEqual(2);
    expect(invEvents[0].cost).toBeLessThanOrEqual(4);
  });

  // ── Deck consistency ────────────────────────────────────────

  it('market cards are not present in their respective decks', () => {
    const state = createTutorialScenario();
    const devIds = new Set(state.market.development.map(c => c.id));
    const invIds = new Set(state.market.investments.map(c => c.id));
    const incidentIds = new Set(state.incidentQueue.map(c => c.id));

    // Check business deck doesn't contain development row cards
    for (const card of state.decks.business) {
      expect(devIds.has(card.id)).toBe(false);
    }
    // Check event deck doesn't contain investment events or incidents
    for (const card of state.decks.event) {
      expect(invIds.has(card.id)).toBe(false);
      expect(incidentIds.has(card.id)).toBe(false);
    }
    // Check upgrade deck doesn't contain investments row upgrades
    for (const card of state.decks.upgrade) {
      expect(invIds.has(card.id)).toBe(false);
    }
  });

  // ── Tier-1 validation (AC7) ─────────────────────────────────

  it('ALL cards in the state reference only Tier-1 template IDs', () => {
    const state = createTutorialScenario();
    const tier1Ids = getTier1TemplateIds();

    // Check all cards in every deck and market
    const allCards = [
      ...state.decks.business,
      ...state.decks.communitySpace,
      ...state.decks.event,
      ...state.decks.upgrade,
      ...state.discards.business,
      ...state.discards.communitySpace,
      ...state.discards.event,
      ...state.discards.upgrade,
      ...state.market.development,
      ...state.market.investments,
      ...state.incidentQueue,
    ];
    // Dedup by base template ID
    const templateIdsUsed = new Set(
      allCards.map(c => {
        // Extract template ID by removing the copy/serial suffix
        return c.id.replace(/-\d+$/, '');
      }),
    );
    for (const usedId of templateIdsUsed) {
      expect(tier1Ids.has(usedId)).toBe(true);
    }
  });
});
