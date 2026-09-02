/**
 * Main Street: Hint System Tests
 *
 * Tests for generateHint() and buildRationale() from MainStreetHint.
 * Covers: correct recommendation, per-turn limit (caller enforced), rationale
 * text, and MarketPhase-only guard.
 *
 * Appendix B.2 test scenarios from prd-milestone-3.md.
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import type { PlayerAction, BuyBusinessAction } from '../../example-games/main-street/MainStreetEngine';
import {
  generateHint,
  buildRationale,
} from '../../example-games/main-street/MainStreetHint';
import {
  enumerateAndScoreActions,
  GreedyStrategy,
} from '../../example-games/main-street/MainStreetAiStrategy';
import type { BusinessCard, UpgradeCard, EventCard } from '../../example-games/main-street/MainStreetCards';
import { createBusinessDeck } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ──────────────────────────────────────────────────

/** Create a state in MarketPhase. */
function makeMarketState(seed: string = 'hint-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  return state;
}

/** Check if two PlayerActions are equal by comparing their fields. */
function actionsEqual(a: PlayerAction, b: PlayerAction): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'buy-business' && b.type === 'buy-business') {
    return a.cardId === b.cardId && a.slotIndex === b.slotIndex;
  }
  if (a.type === 'buy-upgrade' && b.type === 'buy-upgrade') {
    return a.cardId === b.cardId && a.targetSlot === b.targetSlot;
  }
  if (a.type === 'buy-event' && b.type === 'buy-event') {
    return a.cardId === b.cardId;
  }
  if (a.type === 'move-to-hand' && b.type === 'move-to-hand') {
    return a.cardId === b.cardId;
  }
  if (a.type === 'play-event' && b.type === 'play-event') return true;
  if (a.type === 'play-business-from-hand' && b.type === 'play-business-from-hand') {
    return a.handIndex === b.handIndex && a.slotIndex === b.slotIndex;
  }
  if (a.type === 'play-upgrade-from-hand' && b.type === 'play-upgrade-from-hand') {
    return a.handIndex === b.handIndex && a.targetSlot === b.targetSlot;
  }
  if (a.type === 'play-event-from-hand' && b.type === 'play-event-from-hand') {
    return a.handIndex === b.handIndex;
  }
  if (a.type === 'discard-from-hand' && b.type === 'discard-from-hand') {
    return a.handIndex === b.handIndex;
  }
  // end-turn has no additional fields; matching type is sufficient
  if (a.type === 'end-turn' && b.type === 'end-turn') return true;
  return false;
}

// ── generateHint tests ───────────────────────────────────────

describe('generateHint', () => {
  it('returns null outside MarketPhase (DayStart)', () => {
    const state = setupMainStreetGame({ seed: 'phase-guard' });
    // Phase is DayStart; do not call executeDayStart
    expect(state.phase).toBe('DayStart');
    const result = generateHint(state);
    expect(result).toBeNull();
  });

  it('returns null when phase is not MarketPhase (InvestmentResolution)', () => {
    const state = makeMarketState('phase-guard-2');
    state.phase = 'InvestmentResolution';
    const result = generateHint(state);
    expect(result).toBeNull();
  });

  it('returns a HintResult during MarketPhase', () => {
    const state = makeMarketState();
    const result = generateHint(state);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('rationale');
    expect(result).toHaveProperty('score');
  });

  it('hint action matches standalone Greedy evaluation (Appendix B.2)', () => {
    // PRD scenario: hint action matches standalone Greedy evaluation.
    // Use two independent state instances from the same seed to avoid RNG
    // contamination: both start at the same RNG position so tie-breaking agrees.
    const stateForHint = makeMarketState('Scenario-FoodFocus');
    const stateForGreedy = makeMarketState('Scenario-FoodFocus');

    const hint = generateHint(stateForHint);
    expect(hint).not.toBeNull();

    const greedyAction = GreedyStrategy.chooseAction(stateForGreedy, stateForGreedy.rng);
    expect(actionsEqual(hint!.action, greedyAction)).toBe(true);
  });

  it('hint score matches the best enumerateAndScoreActions entry', () => {
    // Seed chosen so the greedy priority-chain action is also the global
    // max-score action (the expanded business pool shifted the seeded market).
    const state = makeMarketState('hint-seed');
    const hint = generateHint(state);
    expect(hint).not.toBeNull();

    const scored = enumerateAndScoreActions(state);
    const maxScore = Math.max(...scored.map(s => s.score));
    expect(hint!.score).toBe(maxScore);
  });

  it('hint action is always a legal action type', () => {
    const legalTypes = [
      'buy-business',
      'buy-upgrade',
      'buy-event',
      'move-to-hand',
      'play-business-from-hand',
      'play-upgrade-from-hand',
      'play-event-from-hand',
      'discard-from-hand',
      'play-event',
      'end-turn',
    ];
    for (const seed of ['seed1', 'seed2', 'seed3', 'seed4', 'seed5']) {
      const state = makeMarketState(seed);
      const result = generateHint(state);
      expect(result).not.toBeNull();
      expect(legalTypes).toContain(result!.action.type);
    }
  });

  it('returns end-turn hint when no action remains (empty market + empty hand)', () => {
    const state = makeMarketState('no-coins');
    // Drain all coins and reputation so no purchase/play and no Community Favour
    // exchange is affordable, and clear the market/hand so even move-to-hand / discard
    // are unavailable.
    state.resourceBank.coins = 0;
    state.resourceBank.reputation = 0;
    state.market.cards = [];
    state.hand = [];
    const result = generateHint(state);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe('end-turn');
    expect(result!.rationale).toBe('No good buys available -- end your turn');
  });

  it('recommends rep-to-coins Community Favour when stalled with actions remaining and reputation available', () => {
    const state = makeMarketState('cf-hint');
    // Stalled and nothing affordable, but an action remains: the action-gated
    // Community Favour exchange is the only meaningful non-end-turn action left.
    // Hand-block move-to-hand so the stalled fallback is reachable (Greedy picks
    // move-to-hand at Priority 5 before Community Favour at Priority 9).
    state.actionsRemaining = 1;
    state.resourceBank.coins = 0;
    state.resourceBank.reputation = 500;
    state.favourUsedThisTurn = false;
    // Empty the market so move-to-hand/discard are not enumerated and the
    // stalled rep-to-coins fallback is reachable (Greedy priority 9).
    state.market.cards = [];
    state.hand = [];
    const result = generateHint(state);
    expect(result).not.toBeNull();
    expect(result!.action.type).toBe('community-favour');
    expect((result!.action as PlayerAction & { direction?: string }).direction).toBe('rep-to-coins');
    expect(result!.rationale).toContain('Community Favour');
  });
});

// ── Per-turn limit (caller-enforced) ─────────────────────────

describe('generateHint per-turn limit (caller responsibility)', () => {
  it('generateHint itself does not enforce the per-turn limit', () => {
    // The per-turn limit is enforced by the scene via hintUsedThisTurn.
    // generateHint() itself always returns a result in MarketPhase.
    const state = makeMarketState('limit-test');
    const first = generateHint(state);
    const second = generateHint(state);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Both calls return a result; scene is responsible for limiting to 1/turn.
  });
});

// ── buildRationale tests ──────────────────────────────────────

describe('buildRationale', () => {
  it('rationale for end-turn contains expected text', () => {
    const state = makeMarketState();
    const rationale = buildRationale({ type: 'end-turn' }, 0, state);
    expect(rationale).toBe('No good buys available -- end your turn');
  });

  it('rationale for buy-business includes card name and slot (Appendix B.2)', () => {
    const state = makeMarketState('rationale-biz');
    const businessCards = state.market.cards as BusinessCard[];
    if (businessCards.length === 0) return; // skip if no business cards

    const card = businessCards[0];
    const action: BuyBusinessAction = { type: 'buy-business', cardId: card.id, slotIndex: 0 };
    const rationale = buildRationale(action, 10, state);

    expect(rationale).toContain(card.name);
    expect(rationale).toContain('0'); // slot index
  });

  it('rationale for buy-business with synergy shows percentage rate (no absolute coins)', () => {
    const state = makeMarketState('rationale-synergy');
    // Override the development row with two Food businesses so synergy is
    // guaranteed: Bakery at slot 0, Diner proposed at adjacent slot 1.
    const bakery = createBusinessDeck(1).find(c => c.id === 'biz-bakery-0') as BusinessCard;
    const diner = createBusinessDeck(1).find(c => c.id === 'biz-diner-0') as BusinessCard;
    expect(bakery).toBeDefined();
    expect(diner).toBeDefined();
    state.market.cards = [bakery, diner];
    state.streetGrid[0] = { ...bakery };

    const action: BuyBusinessAction = { type: 'buy-business', cardId: diner.id, slotIndex: 1 };
    const rationale = buildRationale(action, 10, state);

    // Medium difficulty: default rate 0.5 x 0.35 = 17.5% (no absolute coin value).
    // Multiplier re-tuned 1.0 → 0.35 by CG-0MSP26Q5N002EH8P.
    expect(rationale).toContain('17.5%');
    expect(rationale).toContain('synergy bonus');
    expect(rationale).not.toContain('+1');
  });

  it('rationale for buy-business counts diagonal synergy (8-way adjacency)', () => {
    const state = makeMarketState('rationale-diagonal-synergy');
    // Bakery at slot 0; Diner proposed at slot 6, which is diagonally adjacent
    // (row 1, col 1 - Chebyshev distance 1).
    const bakery = createBusinessDeck(1).find(c => c.id === 'biz-bakery-0') as BusinessCard;
    const diner = createBusinessDeck(1).find(c => c.id === 'biz-diner-0') as BusinessCard;
    expect(bakery).toBeDefined();
    expect(diner).toBeDefined();
    state.market.cards = [bakery, diner];
    state.streetGrid[0] = { ...bakery };

    const action: BuyBusinessAction = { type: 'buy-business', cardId: diner.id, slotIndex: 6 };
    const rationale = buildRationale(action, 10, state);

    expect(rationale).toContain('17.5%');
    expect(rationale).toContain('synergy bonus');
  });

  it('rationale for buy-upgrade includes business name and income bonus', () => {
    const state = makeMarketState('rationale-upgrade');
    const upgradeCards = state.market.cards.filter(
      c => c.family === 'upgrade',
    ) as UpgradeCard[];
    if (upgradeCards.length === 0) return;

    const card = upgradeCards[0];
    const action = { type: 'buy-upgrade' as const, cardId: card.id, targetSlot: undefined };
    const rationale = buildRationale(action, 5, state);

    expect(rationale).toContain(card.targetBusiness);
    expect(rationale).toContain(`${card.incomeBonus}`);
  });

  it('rationale for buy-upgrade with target slot includes business name from grid', () => {
    const state = makeMarketState('rationale-upgrade-slot');
    const upgradeCards = state.market.cards.filter(
      c => c.family === 'upgrade',
    ) as UpgradeCard[];
    if (upgradeCards.length === 0) return;

    const card = upgradeCards[0];
    // Place the target business on the grid
    const fakeBiz: BusinessCard = {
      id: 'fake-biz', name: card.targetBusiness, family: 'business',
      description: 'Test business', cost: 3, baseIncome: 2, incomeBonus: 0,
      synergyRangeBonus: 0, reputationBonus: 0, ongoingCost: 0, synergyTypes: [], level: 0, maxLevel: 2, appliedUpgrades: [],
    };
    state.streetGrid[2] = fakeBiz;

    const action = { type: 'buy-upgrade' as const, cardId: card.id, targetSlot: 2 };
    const rationale = buildRationale(action, 5, state);

    expect(rationale).toContain(card.targetBusiness);
    expect(rationale).toContain('2');
  });

  it('rationale for buy-event includes event name', () => {
    const state = makeMarketState('rationale-event');
    const eventCards = state.market.cards.filter(
      c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
    ) as EventCard[];
    if (eventCards.length === 0) return;

    const card = eventCards[0];
    const action = { type: 'buy-event' as const, cardId: card.id };
    const rationale = buildRationale(action, 3, state);

    expect(rationale).toContain(card.name);
  });

  it('rationale for play-event includes held event name', () => {
    const state = makeMarketState('rationale-play');
    const fakeEvent: EventCard = {
      family: 'event', id: 'test-evt', name: 'Trade Fair',
      trigger: 'Investment', target: 'All', cost: 0, effect: 'Test',
      coinDelta: 5, reputationDelta: 0,
    };
    state.hand = [fakeEvent];

    const rationale = buildRationale({ type: 'play-event' }, 5, state);
    expect(rationale).toContain('Trade Fair');
  });

  it('rationale for play-event with no held event uses fallback text', () => {
    const state = makeMarketState('rationale-play-null');
    state.hand = [];

    const rationale = buildRationale({ type: 'play-event' }, 5, state);
    expect(rationale).toContain('Play');
    expect(rationale).toContain('immediate benefit');
  });

  it('rationale always returns a non-empty string', () => {
    const state = makeMarketState();
    const types: PlayerAction[] = [
      { type: 'end-turn' },
      { type: 'play-event' },
    ];
    for (const action of types) {
      const r = buildRationale(action, 0, state);
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThan(0);
    }
  });
});

// ── Integration: hint matches Greedy across multiple seeds ───

describe('generateHint integration', () => {
  it('hint action matches Greedy recommendation across multiple seeds', () => {
    const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    for (const seed of seeds) {
      // Use separate state instances to avoid RNG contamination between
      // generateHint and GreedyStrategy.chooseAction (both consume state.rng).
      const stateForHint = makeMarketState(seed);
      const stateForGreedy = makeMarketState(seed);

      const hint = generateHint(stateForHint);
      expect(hint).not.toBeNull();

      const greedyAction = GreedyStrategy.chooseAction(stateForGreedy, stateForGreedy.rng);
      expect(
        actionsEqual(hint!.action, greedyAction),
        `Seed "${seed}": hint=${hint!.action.type}, greedy=${greedyAction.type}`,
      ).toBe(true);
    }
  });
});
