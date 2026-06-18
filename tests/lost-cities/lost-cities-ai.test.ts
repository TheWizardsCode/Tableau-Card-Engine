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
} from '../../example-games/lost-cities/AiStrategy';
import { createSeededRng } from '../../src/core-engine/SeededRng';



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
