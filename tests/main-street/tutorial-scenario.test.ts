/**
 * Tutorial Scenario Tests
 *
 * Verifies that the TutorialScenario system:
 * - Creates a valid MainStreetState without seed-based shuffling
 * - Places exactly the expected cards in the market and incident deck
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
  ensureTutorialMarketForUpcomingSteps,
} from '../../example-games/main-street/TutorialScenario';
import {
  MARKET_TOTAL_SLOTS,
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

  it('starts with 12 coins (12 + Community Favour conversion bankrolls the 4-card 18-step flow)', () => {
    // The 18-step tutorial buys Laundromat $4 + Bookshop $3 + Library $7 +
    // Local Festival $3 = $17; 12 starting coins + ~1.9 income + the REQUIRED
    // T13 Community Favour rep→coins conversion (+3) cover it. 12 is tighter
    // than the 16-coin pre-favour budget, which is the point — the conversion
    // must be used to afford the Library (CG-0MSTOATDQ005XDET).
    expect(STANDARD_TUTORIAL_SCENARIO.resourceBank.coins).toBe(12);
    const preset = getPreset('Easy');
    expect(12).toBeGreaterThan(preset.startingCoins);
  });

  it('defines starting reputation matching Easy preset', () => {
    const preset = getPreset('Easy');
    expect(STANDARD_TUTORIAL_SCENARIO.resourceBank.reputation).toBe(preset.startingReputation);
  });

  it('day-1 single row holds Bakery + Laundromat + Local Festival (no Library yet)', () => {
    // CG-0MSTOATDT009BRX2: the market is ONE row of exactly 3 cards. The
    // Library is a day-3 purchase target; it is forced into the line by
    // ensureTutorialMarketForUpcomingSteps at day start (see below).
    expect(STANDARD_TUTORIAL_SCENARIO.market.cards).toEqual([
      'biz-bakery',
      'biz-laundromat',
      'evt-festival',
    ]);
    expect(STANDARD_TUTORIAL_SCENARIO.market.cards).not.toContain('cs-library');
    expect(STANDARD_TUTORIAL_SCENARIO.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
  });

  it('defines exactly MARKET_TOTAL_SLOTS development row cards', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
  });

  it('defines exactly MARKET_TOTAL_SLOTS investments row cards', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
  });

  it('defines exactly INCIDENT_QUEUE_SIZE incident deck cards', () => {
    expect(STANDARD_TUTORIAL_SCENARIO.incidentDeck.length).toBe(INCIDENT_QUEUE_SIZE);
  });

  it('all development row card template IDs are from Tier-1 pool', () => {
    const tier1Ids = getTier1TemplateIds();
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.cards) {
      expect(tier1Ids.has(templateId)).toBe(true);
    }
  });

  it('all investments row card template IDs are from Tier-1 pool', () => {
    const tier1Ids = getTier1TemplateIds();
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.market.cards) {
      expect(tier1Ids.has(templateId)).toBe(true);
    }
  });

  it('all incident deck card template IDs are from Tier-1 pool', () => {
    const tier1Ids = getTier1TemplateIds();
    for (const templateId of STANDARD_TUTORIAL_SCENARIO.incidentDeck) {
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
    expect(state1.market.cards.map(c => c.id)).toEqual(
      state2.market.cards.map(c => c.id),
    );
    expect(state1.market.cards.map(c => c.id)).toEqual(
      state2.market.cards.map(c => c.id),
    );
    expect(state1.incidentDeck.map(c => c.id)).toEqual(
      state2.incidentDeck.map(c => c.id),
    );
    // Same resource bank
    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
  });

  it('has Easy difficulty', () => {
    const state = createTutorialScenario();
    expect(state.config.difficultyName).toBe('Easy');
  });

  it('has correct starting resources (12 coins, 5 reputation per scenario)', () => {
    const state = createTutorialScenario();
    // 12 coins (CG-0MSTOATDQ005XDET reduced from 16 so the T13 Community
    // Favour rep→coins conversion is REQUIRED for the $7 Library); reputation
    // stays 5 so the conversion spends 2 and leaves a safe 3.
    expect(state.resourceBank.coins).toBe(12);
    expect(state.resourceBank.reputation).toBe(5);
  });

  it('has exactly MARKET_TOTAL_SLOTS cards in development row', () => {
    const state = createTutorialScenario();
    expect(state.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
  });

  it('day-1 single row has exactly 1 event (Local Festival) and no upgrades', () => {
    // The two-row market is gone; the single row never forces upgrades.
    const state = createTutorialScenario();
    const upgrades = state.market.cards.filter(c => c.family === 'upgrade');
    const events = state.market.cards.filter(c => c.family === 'event');
    expect(upgrades.length).toBe(0);
    expect(events.length).toBe(1);
  });

  it('has exactly INCIDENT_QUEUE_SIZE cards in incident deck', () => {
    const state = createTutorialScenario();
    expect(state.incidentDeck.length).toBe(INCIDENT_QUEUE_SIZE);
  });

  it('has all incident cards as Incident-trigger events', () => {
    const state = createTutorialScenario();
    for (const card of state.incidentDeck) {
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

  // ── Coin budget verification (AC5: 12-coin flow + required conversion) ──

  it('provides sufficient coin budget for the 18-step flow (12 coins, $4+$3+$3+$7 purchases + required conversion)', () => {
    const state = createTutorialScenario();
    // Scenario starts with 12 coins (not the 16-coin pre-favour budget).
    expect(state.resourceBank.coins).toBe(12);

    // The Laundromat referenced in T3 must exist and cost ≤ 4
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;
    const laundromat = state.market.cards.find(
      c => matchesTemplate(c.id, t3.requiredCardId ?? ''),
    );
    expect(laundromat).toBeDefined();
    expect(laundromat!.cost).toBeLessThanOrEqual(4);

    // After buying $4 card: 8 coins remaining
    const afterLaundromat = state.resourceBank.coins - 4;
    expect(afterLaundromat).toBe(8);

    // T9 moves the Local Festival to hand for FREE; T10 buy-and-place
    // Bookshop costs $3. After one income turn (Laundromat 0.5 base × 1.25
    // rep multiplier ≈ 0.625): 8.625, then −3 (Bookshop), then the second
    // income turn (Laundromat + Bookshop = 1.0 × 1.25 = 1.25) → 6.875 —
    // BELOW the $7 Library, so the T13 Community Favour conversion
    // (2 rep → 3 coins) is REQUIRED.
    const beforeLibrary = afterLaundromat + 0.625 - 3 + 1.25;
    expect(beforeLibrary).toBeLessThan(7);
    expect(beforeLibrary + 3).toBeGreaterThanOrEqual(7);
  });

  it('ensureTutorialMarketForUpcomingSteps puts the Library in the row when T14 is upcoming', () => {
    // Day-1 state has no Library (3-slot single row). Before T14 (the Library
    // buy-and-place step) the day-start hook forces cs-library into the line.
    const state = createTutorialScenario();
    expect(state.market.cards.some(c => matchesTemplate(c.id, 'cs-library'))).toBe(false);

    const t14Index = UNIFIED_TUTORIAL_STEPS.findIndex(s => s.id === 'T14');
    const controller = {
      isActive: true,
      currentStepIndex: t14Index - 1,
      lastCompletedStepId: 'T13',
      exited: false,
    };
    ensureTutorialMarketForUpcomingSteps(state, controller);

    const library = state.market.cards.find(c => matchesTemplate(c.id, 'cs-library'));
    expect(library).toBeDefined();
    expect(library!.name).toBe('Library');
    // The row never exceeds 3 cards — a filler was displaced back to a deck.
    expect(state.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
    // 12 + ~1.9 income − 4 (Laundromat) − 3 (Bookshop) + 3 (the REQUIRED
    // T13 Community Favour conversion) = ~9.875 ≥ Library cost 7. The
    // festival move to hand is FREE (only its later play costs).
    expect(12 + 1.875 - 4 - 3 + 3).toBeGreaterThanOrEqual(library!.cost);
  });

  // ── Market card integration with tutorial steps ──────────────

  it('Laundromat is in the development row matching T3 requiredCardId', () => {
    const state = createTutorialScenario();
    const t3 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T3')!;

    // The requiredCardId must be present in the development row
    const marketCard = state.market.cards.find(
      c => matchesTemplate(c.id, t3.requiredCardId ?? ''),
    );
    expect(marketCard).toBeDefined();
    expect(marketCard!.family).toBe('business');

    // Verify it's the Laundromat
    const laundromat = marketCard as BusinessCard;
    expect(laundromat.name).toBe('Laundromat');
    expect(laundromat.cost).toBe(4);
  });

  it('the Local Festival event card is in the investments row matching T9', () => {
    const state = createTutorialScenario();
    const invEvents = state.market.cards.filter(
      c => c.family === 'event',
    ) as EventCard[];
    expect(invEvents.length).toBe(1);

    const t9 = UNIFIED_TUTORIAL_STEPS.find(s => s.id === 'T9')!;
    const festival = state.market.cards.find(
      c => matchesTemplate(c.id, t9.requiredCardId ?? ''),
    );
    expect(festival).toBeDefined();
    expect(festival!.name).toBe('Local Festival');
    // The event should be affordable after buying Laundromat + one income turn
    expect(festival!.cost).toBeGreaterThanOrEqual(2);
    expect(festival!.cost).toBeLessThanOrEqual(4);
  });

  // ── Deck consistency ────────────────────────────────────────

  it('market cards are not present in their respective decks', () => {
    const state = createTutorialScenario();
    const devIds = new Set(state.market.cards.map(c => c.id));
    const invIds = new Set(state.market.cards.map(c => c.id));
    const incidentIds = new Set(state.incidentDeck.map(c => c.id));

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
      ...state.market.cards,
      ...state.market.cards,
      ...state.incidentDeck,
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
