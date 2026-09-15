/**
 * Main Street: budget-aware event actions for the AI and Monte Carlo
 * (CG-0MTH5CC4H003Q4B3, parent CG-0MTFWBNL30043ZBM).
 *
 * Investment events follow the same action economy as business cards:
 *
 * - taking an event to hand (`buy-event`) costs one daily action and no coins;
 * - playing a held event from a previous day (`play-event-from-hand`) costs
 *   one action and the event's listed cost;
 * - a same-day move + play composite costs a single action in total (the move
 *   already spent it, so the same-day play is free);
 * - no event action is proposed or chosen once the daily budget is spent,
 *   except the free same-day composite.
 *
 * These tests assert observable decision output (`enumerateLegalActions`,
 * `scoreAction`, `GreedyStrategy.chooseAction`, `chooseDemoGreedyActions`)
 * and the engine's action accounting — never source text.
 *
 * @module tests/main-street/ai-event-budget
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeAction,
  executeDayStart,
} from '../../example-games/main-street/MainStreetEngine';
import type { PlayerAction } from '../../example-games/main-street/MainStreetEngine';
import {
  enumerateLegalActions,
  GreedyStrategy,
  scoreAction,
} from '../../example-games/main-street/MainStreetAiStrategy';
import type { BusinessCard, EventCard } from '../../example-games/main-street/MainStreetCards';
import { chooseDemoGreedyActions } from '../../example-games/main-street/MainStreetMonteCarlo';

// ── Fixtures ────────────────────────────────────────────────

/** Deterministic RNG so `pickBest` tie-breaks are reproducible. */
function makeRng(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function makeBusiness(id: string, name: string, cost: number): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 120,
    synergyTypes: ['Food'],
    maxLevel: 3,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'test business',
    appliedUpgrades: [],
    ongoingCost: 0,
  } as BusinessCard;
}

function makeEvent(
  id: string,
  name: string,
  cost: number,
  coinDelta: number,
  reputationDelta = 0,
): EventCard {
  return {
    family: 'event',
    id,
    name,
    trigger: 'Investment',
    cost,
    effect: 'test effect',
    target: 'All',
    coinDelta,
    reputationDelta,
  } as EventCard;
}

/** Fresh day-1 state with a generous coin bank and an empty market. */
function freshDay(seed: string): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  state.resourceBank.coins = 10000;
  state.market.cards = [];
  state.hand = [];
  return state;
}

const EVENTS = new Set(['buy-event', 'play-event-from-hand', 'play-event']);

// ── Enumeration (budget awareness) ──────────────────────────

describe('event actions respect the daily action budget', () => {
  it('excludes event actions once the budget is spent (no composite pending)', () => {
    const state = freshDay('ai-evt-budget-zero');
    state.actionsRemaining = 0;
    state.justMovedEventCardId = null;
    state.market.cards = [makeEvent('evt-market', 'Market Event', 2, 3)];
    state.hand = [makeEvent('evt-held', 'Held Event', 2, 3)];

    const actions = enumerateLegalActions(state);

    expect(actions.some(a => EVENTS.has(a.type))).toBe(false);
    expect(actions.map(a => a.type)).toEqual(['end-turn']);
  });

  it('includes the free same-day composite play even at zero actions', () => {
    const state = freshDay('ai-evt-composite');
    state.market.cards = [makeEvent('evt-comp', 'Composite Event', 2, 3)];

    // Take the event to hand — this spends the day's single action.
    executeAction(state, { type: 'buy-event', cardId: 'evt-comp' });
    expect(state.actionsRemaining).toBe(0);
    expect(state.justMovedEventCardId).toBe('evt-comp');

    const handIndex = state.hand.findIndex(c => c.id === 'evt-comp');
    const actions = enumerateLegalActions(state);
    const composite = actions.filter(a => a.type === 'play-event-from-hand');

    expect(composite).toHaveLength(1);
    expect((composite[0] as { handIndex: number }).handIndex).toBe(handIndex);

    // Playing it is free — the move already paid the action.
    executeAction(state, composite[0]);
    expect(state.actionsRemaining).toBe(0);
    expect(state.hand.some(c => c.id === 'evt-comp')).toBe(false);
  });

  it('does not offer a held event from a previous day at zero actions', () => {
    const state = freshDay('ai-evt-prior-day');
    state.hand = [makeEvent('evt-prior', 'Prior Day Event', 2, 3)];
    state.justMovedEventCardId = null;
    state.actionsRemaining = 0;

    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'play-event-from-hand')).toBe(false);
  });
});

// ── Scoring (event move/play is an action, not a free extra) ─

describe('event scoring is action-aware', () => {
  it('scores buy-event as the net value of playing it (cost included)', () => {
    const state = freshDay('ai-evt-score');
    const event = makeEvent('evt-score', 'Scored Event', 5, 2, 1);
    state.market.cards = [event];

    // Net value = coinDelta + reputationDelta - cost = 2 + 1 - 5 = -2.
    // The take spends the day's action, so the AI must judge the eventual
    // play value, not treat acquisition as free.
    expect(scoreAction(state, { type: 'buy-event', cardId: 'evt-score' })).toBe(-2);
  });

  it('scores a value-positive event positively', () => {
    const state = freshDay('ai-evt-score-pos');
    state.market.cards = [makeEvent('evt-good', 'Good Event', 2, 3, 1)];
    expect(scoreAction(state, { type: 'buy-event', cardId: 'evt-good' })).toBe(2);
  });

  it('does not choose a value-negative event over ending the turn', () => {
    const state = freshDay('ai-evt-negative');
    state.actionsRemaining = 1;
    state.market.cards = [makeEvent('evt-bad', 'Bad Event', 9, 1, 0)];

    const action = GreedyStrategy.chooseAction(state, makeRng());
    expect(EVENTS.has(action.type)).toBe(false);
  });

  it('chooses a value-positive event when it is the best available action', () => {
    const state = freshDay('ai-evt-positive');
    state.actionsRemaining = 1;
    state.market.cards = [makeEvent('evt-win', 'Winning Event', 1, 6, 2)];

    const action = GreedyStrategy.chooseAction(state, makeRng());
    expect(action.type).toBe('buy-event');

    // Spending the single action leaves only the free same-day composite
    // play — the event is not a free extra action, and once the composite is
    // played the day is over.
    executeAction(state, action);
    expect(state.actionsRemaining).toBe(0);

    const composite = GreedyStrategy.chooseAction(state, makeRng());
    expect(composite.type).toBe('play-event-from-hand');
    executeAction(state, composite);
    expect(state.actionsRemaining).toBe(0);
    expect(GreedyStrategy.chooseAction(state, makeRng()).type).toBe('end-turn');
  });

  it('is deterministic for the same seed and state', () => {
    const build = (): MainStreetState => {
      const state = freshDay('ai-evt-determinism');
      state.actionsRemaining = 1;
      state.market.cards = [
        makeBusiness('biz-a', 'Biz A', 3),
        makeEvent('evt-a', 'Event A', 2, 3, 1),
      ];
      return state;
    };

    const first = GreedyStrategy.chooseAction(build(), makeRng(11));
    const second = GreedyStrategy.chooseAction(build(), makeRng(11));
    expect(second).toEqual(first);
  });
});

// ── Monte Carlo planner accounting ──────────────────────────

describe('Monte Carlo planner counts event actions against the cap', () => {
  it('never plans more event/action spend than the budget provides', () => {
    const state = freshDay('mc-evt-plan');
    state.actionsRemaining = 1;
    state.market.cards = [
      makeBusiness('biz-mc', 'MC Business', 3),
      makeEvent('evt-mc', 'MC Event', 2, 3),
    ];
    state.hand = [makeEvent('evt-held-mc', 'MC Held Event', 2, 3)];

    const planned = chooseDemoGreedyActions(state);
    expect(planned[planned.length - 1].type).toBe('end-turn');

    const spend = planned.filter((a: PlayerAction) => a.type !== 'end-turn').length;
    expect(spend).toBeLessThanOrEqual(1);
    // At most one event action is planned for the single action.
    expect(planned.filter(a => EVENTS.has(a.type)).length).toBeLessThanOrEqual(1);
  });

  it('plans up to two action-consuming operations on a General Manager day', () => {
    const state = freshDay('mc-evt-plan-gm');
    state.actionsRemaining = 2;
    state.market.cards = [
      makeBusiness('biz-gm', 'GM Business', 3),
      makeEvent('evt-gm', 'GM Event', 2, 3),
    ];
    state.hand = [makeEvent('evt-held-gm', 'GM Held Event', 2, 3)];

    const planned = chooseDemoGreedyActions(state);
    const spend = planned.filter((a: PlayerAction) => a.type !== 'end-turn').length;
    expect(spend).toBeLessThanOrEqual(2);
  });
});
