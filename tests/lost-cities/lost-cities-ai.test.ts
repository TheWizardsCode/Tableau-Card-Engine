import { describe, it, expect } from 'vitest';
import type {
  ExpeditionColor,
  LostCitiesCard,
} from '../../example-games/lost-cities/LostCitiesCards';
import {
  EXPEDITION_COLORS,
} from '../../example-games/lost-cities/LostCitiesCards';
import {
  setupLostCitiesGame,
  executeAction,
  getVisibleState,
  isMatchOver,
  startNextRound,
  type VisibleState,
} from '../../example-games/lost-cities/LostCitiesGame';
import {
  RandomStrategy,
  GreedyStrategy,
  LostCitiesAiPlayer,
  createOpponentDrawHistory,
  estimatePositiveScoreProbability,
} from '../../example-games/lost-cities/AiStrategy';
import { createSeededRng } from '../../src/core-engine/SeededRng';
import type {
  InvestmentCard,
} from '../../example-games/lost-cities/LostCitiesCards';



// ── Helpers ─────────────────────────────────────────────────

/** Build a visible state for testing with specific hand/expeditions. */
function makeTestVisibleState(overrides: Partial<VisibleState>): VisibleState {
  const emptyExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
    EXPEDITION_COLORS.map(c => [c, []]),
  );
  const emptyDiscardTops = new Map<ExpeditionColor, LostCitiesCard | null>(
    EXPEDITION_COLORS.map(c => [c, null]),
  );
  return {
    hand: [],
    myExpeditions: new Map(emptyExpeditions),
    opponentExpeditions: new Map(emptyExpeditions),
    discardTops: new Map(emptyDiscardTops),
    drawPileSize: 44,
    turnPhase: 'PlayOrDiscard',
    justDiscardedColor: null,
    roundNumber: 1,
    cumulativeScores: [0, 0],
    ...overrides,
  };
}

/** Create an investment card for testing. */
function makeInvestment(
  color: ExpeditionColor,
  index: 1 | 2 | 3 = 1,
  id?: number,
): InvestmentCard {
  return {
    id: id ?? 1000 + EXPEDITION_COLORS.indexOf(color) * 10 + index,
    color,
    type: 'investment',
    investmentIndex: index,
    faceUp: true,
  };
}

/** Create a numbered card for testing. */
function makeNumbered(
  color: ExpeditionColor,
  rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
  id?: number,
): LostCitiesCard {
  return {
    id: id ?? rank * 10 + EXPEDITION_COLORS.indexOf(color),
    color,
    type: 'numbered',
    rank,
    faceUp: true,
  } as LostCitiesCard;
}

// ═══════════════════════════════════════════════════════════
// Random Strategy Tests
// ═══════════════════════════════════════════════════════════

describe('RandomStrategy', () => {
  it('should have name "Random"', () => {
    expect(RandomStrategy.name).toBe('Random');
  });

  it('should choose a legal Phase 1 action', () => {
    const hand = [
      makeNumbered('yellow', 3),
      makeNumbered('blue', 5),
      makeNumbered('red', 7),
    ];
    const state = makeTestVisibleState({ hand });
    const rng = createSeededRng(1);

    const action = RandomStrategy.choosePhase1(state, rng);

    // Must be a legal Phase 1 action
    expect(action.kind).toMatch(/^(play-to-expedition|discard)$/);
    // Card must be from hand
    expect(hand.some(c => c.id === action.card.id)).toBe(true);
  });

  it('should choose a legal Phase 2 action', () => {
    const state = makeTestVisibleState({
      turnPhase: 'Draw',
      drawPileSize: 30,
    });
    const rng = createSeededRng(1);

    const action = RandomStrategy.choosePhase2(state, rng);

    expect(action.kind).toBe('draw-from-pile');
  });

  it('should be able to draw from discard if available', () => {
    // Put a card on a discard pile
    const discardCard = makeNumbered('green', 4);
    const discardTops = new Map<ExpeditionColor, LostCitiesCard | null>(
      EXPEDITION_COLORS.map(c => [c, null]),
    );
    discardTops.set('green', discardCard);

    const state = makeTestVisibleState({
      turnPhase: 'Draw',
      drawPileSize: 30,
      discardTops,
    });

    // Run many times to verify randomness covers discard draws
    let drewFromDiscard = false;
    for (let seed = 1; seed <= 500; seed++) {
      const action = RandomStrategy.choosePhase2(state, createSeededRng(seed));
      if (action.kind === 'draw-from-discard') {
        drewFromDiscard = true;
        expect(action.color).toBe('green');
        break;
      }
    }
    expect(drewFromDiscard).toBe(true);
  });

  it('should select play-to-expedition sometimes and discard sometimes', () => {
    const hand = [
      makeNumbered('yellow', 3, 1),
      makeNumbered('blue', 5, 2),
      makeNumbered('red', 7, 3),
    ];
    const state = makeTestVisibleState({ hand });

    let playCount = 0;
    let discardCount = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const action = RandomStrategy.choosePhase1(state, createSeededRng(seed));
      if (action.kind === 'play-to-expedition') playCount++;
      else discardCount++;
    }

    // Both types should appear (random shouldn't always pick one)
    expect(playCount).toBeGreaterThan(0);
    expect(discardCount).toBeGreaterThan(0);
  });

  it('should throw when no Phase 1 actions available', () => {
    // Empty hand — no legal actions
    const state = makeTestVisibleState({ hand: [] });
    const rng = createSeededRng(1);

    expect(() => RandomStrategy.choosePhase1(state, rng)).toThrow(
      'No legal Phase 1 actions available',
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Greedy Strategy Tests
// ═══════════════════════════════════════════════════════════

describe('GreedyStrategy', () => {
  it('should have name "Greedy"', () => {
    expect(GreedyStrategy.name).toBe('Greedy');
  });

  it('should prefer playing to an existing expedition over starting a new one', () => {
    // Hand has a yellow 5 and a blue 3
    // Yellow expedition already started with yellow 3
    const hand = [
      makeNumbered('yellow', 5, 1),
      makeNumbered('blue', 3, 2),
    ];
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [makeNumbered('yellow', 3, 10)]);

    const state = makeTestVisibleState({ hand, myExpeditions });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // Should prefer extending yellow (existing) over blue (new)
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
  });

  it('should prefer playing to expedition over discarding', () => {
    const hand = [
      makeNumbered('red', 4, 1),
    ];
    const state = makeTestVisibleState({ hand });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    expect(action.kind).toBe('play-to-expedition');
  });

  it('should avoid discarding cards of colors the opponent has collected', () => {
    // Only option: discard (hand has card that can't be played)
    // Two cards in hand: one of a color opponent is collecting, one not
    const hand = [
      makeNumbered('yellow', 8, 1), // opponent is collecting yellow
      makeNumbered('green', 9, 2),  // opponent is not collecting green
    ];

    // Yellow expedition started by opponent
    const opponentExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    opponentExpeditions.set('yellow', [
      makeNumbered('yellow', 2, 10),
      makeNumbered('yellow', 4, 11),
      makeNumbered('yellow', 6, 12),
    ]);

    // Our expeditions: yellow started (so we'd want to keep yellow too),
    // but we have a 2 that can't be played after our 5
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [makeNumbered('yellow', 9, 20)]);
    // yellow 8 can't be played after 9, so only option is discard

    // green not started, so green 9 can be played to expedition
    // but let's make both only discardable to test the preference
    myExpeditions.set('green', [makeNumbered('green', 10, 21)]);
    // green 9 can't be played after 10 either

    const state = makeTestVisibleState({
      hand,
      myExpeditions,
      opponentExpeditions,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // Should discard green (not yellow, which opponent wants)
    expect(action.kind).toBe('discard');
    expect(action.color).toBe('green');
  });

  it('should prefer drawing from discard for a color we are committed to', () => {
    const discardTops = new Map<ExpeditionColor, LostCitiesCard | null>(
      EXPEDITION_COLORS.map(c => [c, null]),
    );
    // Yellow 6 on discard — we have yellow expedition at 4
    discardTops.set('yellow', makeNumbered('yellow', 6, 50));

    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [
      makeNumbered('yellow', 2, 60),
      makeNumbered('yellow', 4, 61),
    ]);

    const state = makeTestVisibleState({
      turnPhase: 'Draw',
      discardTops,
      myExpeditions,
      drawPileSize: 30,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase2(state, rng);

    expect(action.kind).toBe('draw-from-discard');
    if (action.kind === 'draw-from-discard') {
      expect(action.color).toBe('yellow');
    }
  });

  it('should prefer draw pile when no discard cards are useful', () => {
    const state = makeTestVisibleState({
      turnPhase: 'Draw',
      drawPileSize: 30,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase2(state, rng);

    expect(action.kind).toBe('draw-from-pile');
  });

  it('should throw when no Phase 1 actions available', () => {
    const state = makeTestVisibleState({ hand: [] });
    const rng = createSeededRng(1);

    expect(() => GreedyStrategy.choosePhase1(state, rng)).toThrow(
      'No legal Phase 1 actions available',
    );
  });
});

// ═══════════════════════════════════════════════════════════
// LostCitiesAiPlayer Tests
// ═══════════════════════════════════════════════════════════

describe('LostCitiesAiPlayer', () => {
  it('should default to greedy strategy', () => {
    const ai = new LostCitiesAiPlayer();
    expect(ai.strategyName).toBe('Greedy');
  });

  it('should use random strategy when specified', () => {
    const ai = new LostCitiesAiPlayer(RandomStrategy, createSeededRng(42));
    expect(ai.strategyName).toBe('Random');
  });

  it('should track opponent discard draws for greedy inference', () => {
    const ai = new LostCitiesAiPlayer(GreedyStrategy, createSeededRng(42));

    // Record that opponent drew from yellow discard twice
    ai.recordOpponentDiscardDraw('yellow');
    ai.recordOpponentDiscardDraw('yellow');

    // Now test that greedy avoids discarding yellow when possible
    const hand = [
      makeNumbered('yellow', 8, 1),
      makeNumbered('blue', 8, 2),
    ];
    // Both can only be discarded (our expeditions already have higher cards)
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [makeNumbered('yellow', 10, 10)]);
    myExpeditions.set('blue', [makeNumbered('blue', 10, 11)]);

    const state = makeTestVisibleState({ hand, myExpeditions });

    const action = ai.choosePhase1(state);

    // Should avoid yellow (opponent drew from yellow discard)
    expect(action.kind).toBe('discard');
    expect(action.color).toBe('blue');
  });

  it('should reset draw history between rounds', () => {
    const ai = new LostCitiesAiPlayer(GreedyStrategy, createSeededRng(42));

    ai.recordOpponentDiscardDraw('yellow');
    ai.recordOpponentDiscardDraw('yellow');
    ai.resetRoundHistory();

    // After reset, yellow should no longer have extra penalty
    // We test this by giving the same choice as above — without
    // history, both colors are equal, and the result depends on
    // other factors (opponent lane presence, etc.)
    const hand = [
      makeNumbered('yellow', 8, 1),
      makeNumbered('blue', 8, 2),
    ];
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [makeNumbered('yellow', 10, 10)]);
    myExpeditions.set('blue', [makeNumbered('blue', 10, 11)]);

    const state = makeTestVisibleState({ hand, myExpeditions });
    const action = ai.choosePhase1(state);

    // After reset, the choice should be based on other factors
    // (without opponent history, both are equally bad to discard)
    expect(action.kind).toBe('discard');
    // Either color is fine — the key test is that yellow isn't
    // penalized more than blue (no draw history after reset)
  });
});

// ═══════════════════════════════════════════════════════════
// Opponent draw history helper
// ═══════════════════════════════════════════════════════════

describe('createOpponentDrawHistory', () => {
  it('should initialize all colors to 0', () => {
    const history = createOpponentDrawHistory();
    for (const color of EXPEDITION_COLORS) {
      expect(history.get(color)).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Integration: AI-vs-AI full match
// ═══════════════════════════════════════════════════════════

describe('AI-vs-AI integration', () => {
  it('should complete a full 3-round match with Random vs Random', () => {
    const rng = createSeededRng(123);
    const session = setupLostCitiesGame({
      playerNames: ['AI-Random-1', 'AI-Random-2'],
      isAI: [true, true],
      rng,
    });

    const ai0 = new LostCitiesAiPlayer(RandomStrategy, createSeededRng(456));
    const ai1 = new LostCitiesAiPlayer(RandomStrategy, createSeededRng(789));

    let turnCount = 0;
    const maxTurns = 3000; // safety limit (RandomStrategy can take many turns)

    while (!isMatchOver(session) && turnCount < maxTurns) {
      const currentPlayer = session.round.currentPlayer;
      const ai = currentPlayer === 0 ? ai0 : ai1;
      const state = getVisibleState(session, currentPlayer);

      if (state.turnPhase === 'PlayOrDiscard') {
        const action = ai.choosePhase1(state);
        executeAction(session, action);
      } else {
        const action = ai.choosePhase2(state);
        const result = executeAction(session, action);
        if (result.roundEnded) {
          if (!result.matchEnded) {
            startNextRound(session);
          }
          ai0.resetRoundHistory();
          ai1.resetRoundHistory();
        }
      }
      turnCount++;
    }

    expect(isMatchOver(session)).toBe(true);
    expect(session.roundScores).toHaveLength(3);
    expect(session.roundNumber).toBe(3);
    expect(turnCount).toBeLessThan(maxTurns);
  });

  it('should complete a full 3-round match with Greedy vs Greedy', () => {
    const rng = createSeededRng(100);
    const session = setupLostCitiesGame({
      playerNames: ['AI-Greedy-1', 'AI-Greedy-2'],
      isAI: [true, true],
      rng,
    });

    const ai0 = new LostCitiesAiPlayer(GreedyStrategy, createSeededRng(200));
    const ai1 = new LostCitiesAiPlayer(GreedyStrategy, createSeededRng(300));

    let turnCount = 0;
    const maxTurns = 1000;

    while (!isMatchOver(session) && turnCount < maxTurns) {
      const currentPlayer = session.round.currentPlayer;
      const ai = currentPlayer === 0 ? ai0 : ai1;
      const state = getVisibleState(session, currentPlayer);

      if (state.turnPhase === 'PlayOrDiscard') {
        const action = ai.choosePhase1(state);
        executeAction(session, action);
      } else {
        const action = ai.choosePhase2(state);
        const result = executeAction(session, action);
        if (result.roundEnded) {
          if (!result.matchEnded) {
            startNextRound(session);
          }
          ai0.resetRoundHistory();
          ai1.resetRoundHistory();
        }
      }
      turnCount++;
    }

    expect(isMatchOver(session)).toBe(true);
    expect(session.roundScores).toHaveLength(3);
    expect(turnCount).toBeLessThan(maxTurns);
  });

  it('should complete a full 3-round match with Random vs Greedy', () => {
    const rng = createSeededRng(55);
    const session = setupLostCitiesGame({
      playerNames: ['AI-Random', 'AI-Greedy'],
      isAI: [true, true],
      rng,
    });

    const ai0 = new LostCitiesAiPlayer(RandomStrategy, createSeededRng(66));
    const ai1 = new LostCitiesAiPlayer(GreedyStrategy, createSeededRng(77));

    let turnCount = 0;
    const maxTurns = 1000;

    while (!isMatchOver(session) && turnCount < maxTurns) {
      const currentPlayer = session.round.currentPlayer;
      const ai = currentPlayer === 0 ? ai0 : ai1;
      const state = getVisibleState(session, currentPlayer);

      if (state.turnPhase === 'PlayOrDiscard') {
        const action = ai.choosePhase1(state);
        executeAction(session, action);
      } else {
        const action = ai.choosePhase2(state);
        const result = executeAction(session, action);
        if (result.roundEnded) {
          if (!result.matchEnded) {
            startNextRound(session);
          }
          ai0.resetRoundHistory();
          ai1.resetRoundHistory();
        }
      }
      turnCount++;
    }

    expect(isMatchOver(session)).toBe(true);
    expect(session.roundScores).toHaveLength(3);
    expect(turnCount).toBeLessThan(maxTurns);
  });

  it('greedy AI should discard opponent-collected colors less than random', () => {
    // Run multiple matches and compare discard patterns
    const trials = 20;
    let randomOpponentColorDiscards = 0;
    let greedyOpponentColorDiscards = 0;

    for (let trial = 0; trial < trials; trial++) {
      const seed = trial * 100 + 1;

      // Run a Random AI game and track its discards
      randomOpponentColorDiscards += countOpponentColorDiscards(
        seed, RandomStrategy,
      );

      // Run a Greedy AI game and track its discards
      greedyOpponentColorDiscards += countOpponentColorDiscards(
        seed, GreedyStrategy,
      );
    }

    // Greedy should discard opponent-useful cards less frequently
    expect(greedyOpponentColorDiscards).toBeLessThan(randomOpponentColorDiscards);
  });
});



/**
 * Play a single round and count how many times player 0 discards
 * a card of a color that player 1 has an expedition in.
 */
function countOpponentColorDiscards(
  seed: number,
  strategy: typeof RandomStrategy | typeof GreedyStrategy,
): number {
  const rng = createSeededRng(seed);
  const session = setupLostCitiesGame({
    playerNames: ['P0', 'P1'],
    isAI: [true, true],
    rng,
  });

  const ai0 = new LostCitiesAiPlayer(strategy, createSeededRng(seed + 1));
  const ai1 = new LostCitiesAiPlayer(RandomStrategy, createSeededRng(seed + 2));

  let opponentColorDiscards = 0;
  let turns = 0;
  const maxTurns = 500;

  // Play just one round
  while (session.matchPhase === 'playing' && turns < maxTurns) {
    const currentPlayer = session.round.currentPlayer;
    const ai = currentPlayer === 0 ? ai0 : ai1;
    const state = getVisibleState(session, currentPlayer);

    if (state.turnPhase === 'PlayOrDiscard') {
      const action = ai.choosePhase1(state);

      // Track player 0's discards that match player 1's expedition colors
      if (currentPlayer === 0 && action.kind === 'discard') {
        const oppLane = session.players[1].expeditions.get(action.color);
        if (oppLane && oppLane.length > 0) {
          opponentColorDiscards++;
        }
      }

      executeAction(session, action);
    } else {
      const action = ai.choosePhase2(state);
      executeAction(session, action);
    }
    turns++;

    // Stop after first round ends
    if (session.roundScores.length >= 1) break;
  }

  return opponentColorDiscards;
}

// ═══════════════════════════════════════════════════════════
// Improved AI Behavior Tests
// ═══════════════════════════════════════════════════════════

describe('Improved AI - Investment Card Placement', () => {
  it('should NOT place an investment card starting a new expedition without enough cards of that color in hand', () => {
    // Hand: yellow investment only (no other yellow cards)
    const hand = [
      makeInvestment('yellow', 1, 200),
      makeNumbered('blue', 7, 201),
      makeNumbered('red', 3, 202),
    ];
    const state = makeTestVisibleState({ hand });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should not play yellow investment to a new expedition
    // (only has 1 yellow card = the investment itself)
    // Better to play blue 7 or red 3, or discard
    if (action.kind === 'play-to-expedition') {
      expect(action.color).not.toBe('yellow');
    }
  });

  it('should place an investment card in an expedition when holding many cards of that color', () => {
    // Hand: yellow 2, yellow 5, yellow 8, yellow investment, plus filler
    const hand = [
      makeInvestment('yellow', 1, 300),
      makeNumbered('yellow', 2, 301),
      makeNumbered('yellow', 5, 302),
      makeNumbered('yellow', 8, 303),
      makeNumbered('blue', 3, 304),
    ];
    const state = makeTestVisibleState({ hand });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should consider playing the investment since it has 3 numbered cards
    // of the same color. At minimum it should play SOMETHING to yellow.
    // (might play the numbered card first, which is also fine)
    if (action.kind === 'play-to-expedition') {
      // Allowed: playing investment or numbered card to yellow
      expect(action.color).toBe('yellow');
    }
  });

  it('should NOT place multiple investment cards when starting a new expedition', () => {
    // Hand: yellow investment x2, plus a few non-yellow cards
    const hand = [
      makeInvestment('yellow', 1, 400),
      makeInvestment('yellow', 2, 401),
      makeNumbered('blue', 4, 402),
      makeNumbered('red', 5, 403),
    ];
    const state = makeTestVisibleState({ hand });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should not play yellow investment since it has zero numbered yellow cards
    // It should play a blue or red card, or discard
    if (action.kind === 'play-to-expedition') {
      expect(action.color).not.toBe('yellow');
    }
  });

  it('should place an investment card in an existing expedition with cards', () => {
    // Existing yellow expedition with [2, 5]
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [
      makeNumbered('yellow', 2, 500),
      makeNumbered('yellow', 5, 501),
    ]);

    // Hand: yellow investment, plus a numbered yellow card
    const hand = [
      makeInvestment('yellow', 1, 502),
      makeNumbered('yellow', 8, 503),
      makeNumbered('blue', 3, 504),
    ];

    const state = makeTestVisibleState({ hand, myExpeditions });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should play to yellow (either investment or 8)
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
  });
});

describe('Improved AI - Card Ordering', () => {
  it('should play a lower numbered card before a higher one when starting a new expedition', () => {
    // Hand: yellow 9 and yellow 4 — both playable on empty expedition
    const hand = [
      makeNumbered('yellow', 9, 600),
      makeNumbered('yellow', 4, 601),
      makeNumbered('blue', 3, 602),
    ];
    const state = makeTestVisibleState({ hand });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // Should play to yellow expedition (preferred over starting blue)
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
    // Should play the lower card (4) before the higher card (9)
    if (action.kind === 'play-to-expedition') {
      expect(action.card.type).toBe('numbered');
      if (action.card.type === 'numbered') {
        expect(action.card.rank).toBe(4);
      }
    }
  });

  it('should play a lower numbered card before a higher one in an existing expedition', () => {
    // Existing yellow expedition with [2]
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [
      makeNumbered('yellow', 2, 700),
    ]);

    // Hand: yellow 8 and yellow 5 — both playable after 2
    const hand = [
      makeNumbered('yellow', 8, 701),
      makeNumbered('yellow', 5, 702),
      makeNumbered('blue', 3, 703),
    ];

    const state = makeTestVisibleState({ hand, myExpeditions });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // Should play to yellow and prefer 5 over 8
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
    if (action.kind === 'play-to-expedition') {
      expect(action.card.type).toBe('numbered');
      if (action.card.type === 'numbered') {
        expect(action.card.rank).toBe(5);
      }
    }
  });

  it('should play a higher card when no lower one exists in hand', () => {
    // Existing yellow expedition with [6]
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [
      makeNumbered('yellow', 6, 800),
    ]);

    // Hand: yellow 8 only (4 is too low to play after 6)
    const hand = [
      makeNumbered('yellow', 8, 801),
      makeNumbered('blue', 3, 802),
    ];

    const state = makeTestVisibleState({ hand, myExpeditions });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // Should play yellow 8 (the only playable yellow card)
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
    if (action.kind === 'play-to-expedition') {
      expect(action.card.type).toBe('numbered');
      if (action.card.type === 'numbered') {
        expect(action.card.rank).toBe(8);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Probabilistic Positive Score Evaluation Tests
// ═══════════════════════════════════════════════════════════

describe('Improved AI - Probabilistic Positive Score Evaluation', () => {
  it('should NOT place a numbered card in a new expedition when opponent holds key blocking cards', () => {
    // Scenario from description: AI has yellow 7 and yellow 10 in hand
    // Opponent already placed yellow 4, 5, 6 — blocking those values
    // This means only 8, 9 (or 2, 3) can be played after 7
    // The column has little chance of becoming positive
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );

    // Hand: yellow 7, yellow 10, plus a few non-yellow cards
    const hand = [
      makeNumbered('yellow', 7, 900),
      makeNumbered('yellow', 10, 901),
      makeNumbered('blue', 4, 902),
      makeNumbered('blue', 5, 903),
      makeNumbered('green', 3, 904),
    ];

    // Opponent has yellow 4, 5, 6
    const opponentExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    opponentExpeditions.set('yellow', [
      makeNumbered('yellow', 4, 910),
      makeNumbered('yellow', 5, 911),
      makeNumbered('yellow', 6, 912),
    ]);

    const state = makeTestVisibleState({
      hand,
      myExpeditions,
      opponentExpeditions,
      drawPileSize: 20,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should not play yellow 7 to start a new expedition
    // (too many yellow cards already visible in opponent's expedition
    //  — not enough remaining to make the column positive)
    if (action.kind === 'play-to-expedition') {
      expect(action.color).not.toBe('yellow');
    }
  });

  it('should place a low card in a new expedition when many follow-up cards are available', () => {
    // Scenario from description: AI has yellow 2 and yellow 10 in hand
    // No other yellow cards on the table — many follow-up cards available
    // It may place the 2 since it's a low-risk investment
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );

    const hand = [
      makeNumbered('yellow', 2, 1000),
      makeNumbered('yellow', 10, 1001),
      makeNumbered('blue', 4, 1002),
      makeNumbered('blue', 5, 1003),
      makeNumbered('green', 3, 1004),
    ];

    // No opponent yellow cards
    const opponentExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );

    const state = makeTestVisibleState({
      hand,
      myExpeditions,
      opponentExpeditions,
      drawPileSize: 30, // Many cards left in pile
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should play yellow 2 (low card, many follow-ups available)
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
    if (action.kind === 'play-to-expedition') {
      expect(action.card.type).toBe('numbered');
      if (action.card.type === 'numbered') {
        expect(action.card.rank).toBe(2);
      }
    }
  });

  it('should avoid placing a high card when insufficient follow-up cards are likely', () => {
    // AI has yellow 10 only. Starting a yellow expedition with 10 means
    // no follow-up cards are possible (nothing > 10). The column will
    // only have 10 points value, so score = (10-20)*1 = -10, which is negative.
    // The AI should prefer another action.
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );

    const hand = [
      makeNumbered('yellow', 10, 1100),
      makeNumbered('blue', 4, 1101),
      makeNumbered('blue', 5, 1102),
    ];

    const state = makeTestVisibleState({
      hand,
      myExpeditions,
      drawPileSize: 25,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should not start with yellow 10 (can't follow up, negative score)
    // It should prefer blue (has two cards there) or another action
    if (action.kind === 'play-to-expedition') {
      expect(action.color).not.toBe('yellow');
    }
  });

  it('should place a high card in an existing expedition with enough existing value', () => {
    // Existing yellow expedition with [2, 5, 8] — valueSum = 15
    // Playing yellow 10 makes valueSum = 25 which is > 20, so positive!
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );
    myExpeditions.set('yellow', [
      makeNumbered('yellow', 2, 1200),
      makeNumbered('yellow', 5, 1201),
      makeNumbered('yellow', 8, 1202),
    ]);

    const hand = [
      makeNumbered('yellow', 10, 1203),
      makeNumbered('blue', 4, 1204),
    ];

    const state = makeTestVisibleState({
      hand,
      myExpeditions,
      drawPileSize: 20,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // AI should play yellow 10 to extend the already-strong expedition
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
    if (action.kind === 'play-to-expedition') {
      expect(action.card.type).toBe('numbered');
    }
  });

  it('should be more willing to start a risky expedition when the draw pile is large', () => {
    // Scenario: AI has yellow 7 only for yellow. With large pile, there's
    // still a good chance of drawing follow-up cards.
    // With small pile, the chance is lower.

    const smallPileChoosesYellow = (() => {
      const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
        EXPEDITION_COLORS.map(c => [c, []]),
      );
      const hand = [
        makeNumbered('yellow', 7, 1300),
        makeNumbered('blue', 4, 1301),
      ];
      const state = makeTestVisibleState({
        hand,
        myExpeditions,
        drawPileSize: 3, // Very few cards left
      });
      return GreedyStrategy.choosePhase1(state, createSeededRng(42));
    })();

    const largePileChoosesYellow = (() => {
      const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
        EXPEDITION_COLORS.map(c => [c, []]),
      );
      const hand = [
        makeNumbered('yellow', 7, 1302),
        makeNumbered('blue', 4, 1303),
      ];
      const state = makeTestVisibleState({
        hand,
        myExpeditions,
        drawPileSize: 35, // Many cards left
      });
      return GreedyStrategy.choosePhase1(state, createSeededRng(42));
    })();

    // With large pile, AI should be more willing to start yellow expedition
    const smallPileIsYellow = smallPileChoosesYellow.kind === 'play-to-expedition' && smallPileChoosesYellow.color === 'yellow';
    const largePileIsYellow = largePileChoosesYellow.kind === 'play-to-expedition' && largePileChoosesYellow.color === 'yellow';

    // Large pile should at least not be less likely to choose yellow
    // (it could be equally likely, but not less)
    expect(largePileIsYellow ? 1 : 0).toBeGreaterThanOrEqual(smallPileIsYellow ? 1 : 0);
  });

  it('should evaluate the deficit correctly when considering whether to place a card', () => {
    // Scenario: AI has yellow 2 and yellow 10 in hand, expedition empty.
    // Placing yellow 2 first gives valueSum = 2, deficit = 18
    // Placing yellow 10 first gives valueSum = 10, deficit = 10
    // BUT placing 10 first means no follow-ups > 10 are possible
    // The AI should prefer to place the 2 first
    const myExpeditions = new Map<ExpeditionColor, LostCitiesCard[]>(
      EXPEDITION_COLORS.map(c => [c, []]),
    );

    const hand = [
      makeNumbered('yellow', 2, 1400),
      makeNumbered('yellow', 10, 1401),
      makeNumbered('blue', 4, 1402),
    ];

    const state = makeTestVisibleState({
      hand,
      myExpeditions,
      drawPileSize: 30,
    });
    const rng = createSeededRng(1);

    const action = GreedyStrategy.choosePhase1(state, rng);

    // Should play to yellow
    expect(action.kind).toBe('play-to-expedition');
    expect(action.color).toBe('yellow');
    // Should play the lower card (2) before the higher card (10)
    // because 2 leaves room for follow-ups
    if (action.kind === 'play-to-expedition' && action.card.type === 'numbered') {
      expect(action.card.rank).toBe(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Probabilistic Evaluation Helper Tests (direct unit tests)
// ═══════════════════════════════════════════════════════════

describe('estimatePositiveScoreProbability', () => {
  it('should return 1.0 when the expedition is already positive', () => {
    // Existing expedition: cards with total value > 20
    const expedition = [
      makeNumbered('yellow', 6, 1500),
      makeNumbered('yellow', 8, 1501),
      makeNumbered('yellow', 9, 1502),
    ];
    // valueSum = 23, already > 20
    const prob = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 10, 1503), // proposed card
      [], // hand (additional cards of this color)
      [], // opponent expedition
      20, // draw pile size
    );
    expect(prob).toBe(1.0);
  });

  it('should return 0.0 when no follow-up cards exist', () => {
    // Starting with 10 — nothing can follow
    const expedition: LostCitiesCard[] = [];
    const prob = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 10, 1600), // proposed card (10)
      [], // hand
      [], // opponent expedition
      20,
    );
    expect(prob).toBe(0.0);
  });

  it('should return a higher probability for a low card than a high card when both available', () => {
    // Same state, same visible cards
    const expedition: LostCitiesCard[] = [];
    const hand: LostCitiesCard[] = [];
    const opponentExpedition: LostCitiesCard[] = [];
    const drawPileSize = 30;

    const probLow = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 2, 1700), // 2 — many can follow
      hand,
      opponentExpedition,
      drawPileSize,
    );

    const probHigh = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 9, 1701), // 9 — only 10 can follow
      hand,
      opponentExpedition,
      drawPileSize,
    );

    expect(probLow).toBeGreaterThan(probHigh);
  });

  it('should return a lower probability when opponent has many cards of this color', () => {
    const expedition: LostCitiesCard[] = [];
    const hand: LostCitiesCard[] = [];
    const drawPileSize = 25;

    // No opponent cards of this color
    const probNoOpponent = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 4, 1800),
      hand,
      [],
      drawPileSize,
    );

    // Opponent has yellow 4, 5, 6 — blocking those values
    const opponentWithCards = [
      makeNumbered('yellow', 4, 1801),
      makeNumbered('yellow', 5, 1802),
      makeNumbered('yellow', 6, 1803),
    ];
    const probWithOpponent = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 7, 1804),
      hand,
      opponentWithCards,
      drawPileSize,
    );

    expect(probWithOpponent).toBeLessThan(probNoOpponent);
  });

  it('should return a higher probability with more cards left in the draw pile', () => {
    const expedition: LostCitiesCard[] = [];
    const hand: LostCitiesCard[] = [];
    const opponentExpedition: LostCitiesCard[] = [];

    const probSmallPile = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 4, 1900),
      hand,
      opponentExpedition,
      3, // Very few cards left
    );

    const probLargePile = estimatePositiveScoreProbability(
      'yellow',
      expedition,
      makeNumbered('yellow', 4, 1901),
      hand,
      opponentExpedition,
      35, // Many cards left
    );

    expect(probLargePile).toBeGreaterThan(probSmallPile);
  });
});

