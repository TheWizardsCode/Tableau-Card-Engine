import { describe, it, expect } from 'vitest';
import type {
  LostCitiesCard,
  ExpeditionColor,
} from '../../example-games/lost-cities/LostCitiesCards';
import {
  EXPEDITION_COLORS,
  HAND_SIZE,
  ROUND_COUNT,
  DECK_SIZE,
} from '../../example-games/lost-cities/LostCitiesCards';
import {
  setupLostCitiesGame,
  executeAction,
  startNextRound,
  getCurrentPlayer,
  getOpponent,
  getVisibleState,
  getLegalActions,
  isCurrentRoundOver,
  isMatchOver,
  getMatchWinner,
  buildRulesGameView,
  type LostCitiesSession,
  type TurnResult,
} from '../../example-games/lost-cities/LostCitiesGame';
import type {
  Phase1Action,
  Phase2Action,
} from '../../example-games/lost-cities/LostCitiesRules';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Setup tests ────────────────────────────────────────────

describe('setupLostCitiesGame', () => {
  it('should create a valid initial session', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    expect(session.roundNumber).toBe(1);
    expect(session.matchPhase).toBe('playing');
    expect(session.cumulativeScores).toEqual([0, 0]);
    expect(session.roundScores).toHaveLength(0);
    expect(session.players).toHaveLength(2);
  });

  it('should deal HAND_SIZE cards to each player', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    expect(session.players[0].hand).toHaveLength(HAND_SIZE);
    expect(session.players[1].hand).toHaveLength(HAND_SIZE);
  });

  it('should leave the correct number of cards in the draw pile', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const expectedDrawPile = DECK_SIZE - HAND_SIZE * 2;

    expect(session.round.drawPile).toHaveLength(expectedDrawPile);
  });

  it('should start with empty expedition lanes for both players', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    for (const player of session.players) {
      for (const color of EXPEDITION_COLORS) {
        expect(player.expeditions.get(color)).toHaveLength(0);
      }
    }
  });

  it('should start with empty discard piles', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    for (const color of EXPEDITION_COLORS) {
      expect(session.round.discardPiles.get(color)).toHaveLength(0);
    }
  });

  it('should set player names and AI flags from options', () => {
    const session = setupLostCitiesGame({
      playerNames: ['Alice', 'Bob'],
      isAI: [false, false],
      rng: createSeededRng(),
    });

    expect(session.players[0].name).toBe('Alice');
    expect(session.players[1].name).toBe('Bob');
    expect(session.players[0].isAI).toBe(false);
    expect(session.players[1].isAI).toBe(false);
  });

  it('should use default names and AI flags', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    expect(session.players[0].name).toBe('Player 1');
    expect(session.players[1].name).toBe('Player 2');
    expect(session.players[0].isAI).toBe(false);
    expect(session.players[1].isAI).toBe(true);
  });

  it('should start in PlayOrDiscard phase with player 0', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    expect(session.round.turnPhase).toBe('PlayOrDiscard');
    expect(session.round.currentPlayer).toBe(0);
  });

  it('should have all cards face-up in hands', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    for (const player of session.players) {
      for (const card of player.hand) {
        expect(card.faceUp).toBe(true);
      }
    }
  });

  it('should have unique card IDs across all locations', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const allIds = new Set<number>();

    // Hands
    for (const player of session.players) {
      for (const card of player.hand) {
        allIds.add(card.id);
      }
    }
    // Draw pile
    for (const card of session.round.drawPile) {
      allIds.add(card.id);
    }

    expect(allIds.size).toBe(DECK_SIZE);
  });
});

// ── Turn execution tests ───────────────────────────────────

describe('executeAction', () => {
  function setupForDiscard(session: LostCitiesSession): Phase1Action {
    // Find any card in hand and discard it
    const player = getCurrentPlayer(session);
    const card = player.hand[0];
    return { kind: 'discard', card, color: card.color };
  }

  it('should execute a discard action in Phase 1', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const action = setupForDiscard(session);
    const cardId = action.card.id;

    const result = executeAction(session, action);

    expect(result.roundEnded).toBe(false);
    expect(result.matchEnded).toBe(false);
    expect(session.round.turnPhase).toBe('Draw');

    // Card should be removed from hand
    const player = session.players[0];
    expect(player.hand.find((c) => c.id === cardId)).toBeUndefined();

    // Card should be in discard pile
    const pile = session.round.discardPiles.get(action.color)!;
    expect(pile[pile.length - 1].id).toBe(cardId);
  });

  it('should execute a draw-from-pile action in Phase 2', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const discardAction = setupForDiscard(session);
    executeAction(session, discardAction);

    const drawPileBefore = session.round.drawPile.length;

    const drawAction: Phase2Action = { kind: 'draw-from-pile' };
    const result = executeAction(session, drawAction);

    expect(result.roundEnded).toBe(false);
    expect(session.round.drawPile).toHaveLength(drawPileBefore - 1);

    // After draw, it should be player 1's turn in PlayOrDiscard
    expect(session.round.currentPlayer).toBe(1);
    expect(session.round.turnPhase).toBe('PlayOrDiscard');
  });

  it('should play to expedition when legal', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const player = getCurrentPlayer(session);

    // Find a card that can start an expedition (any card works on empty lane)
    const card = player.hand[0];
    const playAction: Phase1Action = {
      kind: 'play-to-expedition',
      card,
      color: card.color,
    };

    const result = executeAction(session, playAction);

    expect(result.roundEnded).toBe(false);
    expect(session.round.turnPhase).toBe('Draw');

    // Card should be in expedition
    const lane = player.expeditions.get(card.color)!;
    expect(lane).toHaveLength(1);
    expect(lane[0].id).toBe(card.id);

    // Card should not be in hand
    expect(player.hand.find((c) => c.id === card.id)).toBeUndefined();
  });

  it('should throw when executing Phase 2 action during Phase 1', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const drawAction: Phase2Action = { kind: 'draw-from-pile' };

    expect(() => executeAction(session, drawAction)).toThrow(
      'Expected Phase 1 action',
    );
  });

  it('should throw when executing Phase 1 action during Phase 2', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const discardAction = setupForDiscard(session);
    executeAction(session, discardAction);

    const anotherCard = getCurrentPlayer(session).hand[0];
    const phase1InPhase2: Phase1Action = {
      kind: 'discard',
      card: anotherCard,
      color: anotherCard.color,
    };

    expect(() => executeAction(session, phase1InPhase2)).toThrow(
      'Expected Phase 2 action',
    );
  });

  it('should prevent drawing from just-discarded color', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const player = getCurrentPlayer(session);
    const card = player.hand[0];

    // Discard to a color
    executeAction(session, { kind: 'discard', card, color: card.color });

    // Now try to draw from that same color's discard pile
    const drawFromDiscard: Phase2Action = {
      kind: 'draw-from-discard',
      color: card.color,
    };

    expect(() => executeAction(session, drawFromDiscard)).toThrow(
      'Illegal action',
    );
  });

  it('should allow drawing from a discard pile of different color', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const player = getCurrentPlayer(session);

    // First, seed a discard pile by playing a full turn
    const card1 = player.hand[0];
    executeAction(session, { kind: 'discard', card: card1, color: card1.color });
    executeAction(session, { kind: 'draw-from-pile' });

    // Now player 1's turn — discard to a DIFFERENT color
    const player1 = getCurrentPlayer(session);
    // Find a card of a different color than card1
    const differentCard = player1.hand.find((c) => c.color !== card1.color);
    if (!differentCard) {
      // All cards same color — skip this test case
      return;
    }
    executeAction(session, {
      kind: 'discard',
      card: differentCard,
      color: differentCard.color,
    });

    // Player 1 should be able to draw from card1's discard pile
    const drawAction: Phase2Action = {
      kind: 'draw-from-discard',
      color: card1.color,
    };
    // This should not throw since it's a different color
    const result = executeAction(session, drawAction);
    expect(result.roundEnded).toBe(false);
  });

  it('should throw if match is not in playing phase', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    session.matchPhase = 'match-over';

    const card = session.players[0].hand[0];
    expect(() =>
      executeAction(session, { kind: 'discard', card, color: card.color }),
    ).toThrow('Match is not in playing phase');
  });
});

// ── Query helper tests ─────────────────────────────────────

describe('getCurrentPlayer / getOpponent', () => {
  it('should return the correct current player', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    expect(getCurrentPlayer(session)).toBe(session.players[0]);
    expect(getOpponent(session)).toBe(session.players[1]);
  });

  it('should update after turn ends', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const card = session.players[0].hand[0];

    executeAction(session, { kind: 'discard', card, color: card.color });
    executeAction(session, { kind: 'draw-from-pile' });

    expect(getCurrentPlayer(session)).toBe(session.players[1]);
    expect(getOpponent(session)).toBe(session.players[0]);
  });
});

describe('getVisibleState', () => {
  it('should return the correct visible state for player 0', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const visible = getVisibleState(session, 0);

    expect(visible.hand).toBe(session.players[0].hand);
    expect(visible.myExpeditions).toBe(session.players[0].expeditions);
    expect(visible.opponentExpeditions).toBe(session.players[1].expeditions);
    expect(visible.drawPileSize).toBe(session.round.drawPile.length);
    expect(visible.turnPhase).toBe('PlayOrDiscard');
    expect(visible.roundNumber).toBe(1);
    expect(visible.cumulativeScores).toEqual([0, 0]);
  });

  it('should show discard tops correctly', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    // Initially all discard tops should be null
    const visible = getVisibleState(session, 0);
    for (const color of EXPEDITION_COLORS) {
      expect(visible.discardTops.get(color)).toBeNull();
    }

    // After discarding, the discarded card should be visible
    const card = session.players[0].hand[0];
    executeAction(session, { kind: 'discard', card, color: card.color });

    const visibleAfter = getVisibleState(session, 0);
    expect(visibleAfter.discardTops.get(card.color)?.id).toBe(card.id);
  });

  it('should not expose opponent hand or draw pile order', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const visible = getVisibleState(session, 0);

    // visible state should only have hand (own), not opponent hand
    expect(visible.hand).toBe(session.players[0].hand);
    // drawPileSize is a number, not the actual cards
    expect(typeof visible.drawPileSize).toBe('number');
  });

  it('should not alias cumulative scores (should be a copy)', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const visible = getVisibleState(session, 0);

    visible.cumulativeScores[0] = 9999;
    expect(session.cumulativeScores[0]).toBe(0);
  });
});

describe('getLegalActions', () => {
  it('should return Phase 1 actions in PlayOrDiscard phase', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const actions = getLegalActions(session);

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(['play-to-expedition', 'discard']).toContain(action.kind);
    }
  });

  it('should return Phase 2 actions in Draw phase', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const card = session.players[0].hand[0];
    executeAction(session, { kind: 'discard', card, color: card.color });

    const actions = getLegalActions(session);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(['draw-from-pile', 'draw-from-discard']).toContain(action.kind);
    }
  });
});

describe('buildRulesGameView', () => {
  it('should build a valid RulesGameView for the current player', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    const view = buildRulesGameView(session);

    expect(view.playerExpeditions).toBe(session.players[0].expeditions);
    expect(view.discardPiles).toBe(session.round.discardPiles);
    expect(view.drawPileSize).toBe(session.round.drawPile.length);
    expect(view.justDiscardedColor).toBeNull();
  });
});

// ── Round and match progression tests ──────────────────────

describe('round progression', () => {
  /** Play one full turn (discard + draw from pile). */
  function playTurn(session: LostCitiesSession): TurnResult {
    const player = getCurrentPlayer(session);
    const card = player.hand[0];
    executeAction(session, { kind: 'discard', card, color: card.color });
    return executeAction(session, { kind: 'draw-from-pile' });
  }

  /**
   * Play until the round ends and advance to the next round.
   * Returns the TurnResult from the round-ending action.
   */
  function playThroughRound(session: LostCitiesSession): TurnResult {
    let lastResult: TurnResult | null = null;
    while (session.matchPhase === 'playing') {
      lastResult = playTurn(session);
      if (lastResult.roundEnded) break;
    }
    // Advance to next round (now that executeAction sets 'round-over'/
    // 'match-over' instead of calling advanceMatch automatically)
    if (lastResult!.roundEnded && !lastResult!.matchEnded) {
      startNextRound(session);
    }
    return lastResult!;
  }

  it('should detect when a round ends (draw pile exhausted)', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    // Drain the draw pile by playing discard+draw turns
    let lastResult: TurnResult | null = null;
    while (!isCurrentRoundOver(session) && session.matchPhase === 'playing') {
      lastResult = playTurn(session);
      if (lastResult.roundEnded) break;
    }

    expect(lastResult).not.toBeNull();
    expect(lastResult!.roundEnded).toBe(true);
    expect(lastResult!.roundScore).not.toBeNull();
  });

  it('should score the round correctly when it ends', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    let lastResult: TurnResult | null = null;
    while (session.matchPhase === 'playing' && session.roundNumber === 1) {
      lastResult = playTurn(session);
      if (lastResult.roundEnded) break;
    }

    expect(lastResult!.roundScore).not.toBeNull();
    const roundScore = lastResult!.roundScore!;

    // Both players should have score totals
    expect(typeof roundScore.totals[0]).toBe('number');
    expect(typeof roundScore.totals[1]).toBe('number');

    // Details should have expedition breakdowns
    expect(roundScore.details[0].length).toBe(EXPEDITION_COLORS.length);
    expect(roundScore.details[1].length).toBe(EXPEDITION_COLORS.length);
  });

  it('should advance to round 2 after round 1 ends', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    const result = playThroughRound(session);

    expect(result.roundEnded).toBe(true);
    expect(result.matchEnded).toBe(false);
    expect(session.roundNumber).toBe(2);
    expect(session.matchPhase).toBe('playing');
    expect(session.roundScores).toHaveLength(1);
  });

  it('should alternate starting player each round', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    expect(session.startingPlayer).toBe(0);

    playThroughRound(session);

    expect(session.startingPlayer).toBe(1);
    expect(session.round.currentPlayer).toBe(1);
  });

  it('should reset hands and expeditions for new round', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    playThroughRound(session);

    // New round should have fresh hands and empty expeditions
    for (const player of session.players) {
      expect(player.hand).toHaveLength(HAND_SIZE);
      for (const color of EXPEDITION_COLORS) {
        expect(player.expeditions.get(color)).toHaveLength(0);
      }
    }

    // Draw pile should be replenished
    expect(session.round.drawPile.length).toBe(DECK_SIZE - HAND_SIZE * 2);

    // Discard piles should be empty
    for (const color of EXPEDITION_COLORS) {
      expect(session.round.discardPiles.get(color)).toHaveLength(0);
    }
  });

  it('should update cumulative scores after each round', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    // Play through round 1
    playThroughRound(session);

    const r1 = session.roundScores[0];
    expect(session.cumulativeScores[0]).toBe(r1.totals[0]);
    expect(session.cumulativeScores[1]).toBe(r1.totals[1]);

    // Play through round 2
    playThroughRound(session);

    const r2 = session.roundScores[1];
    expect(session.cumulativeScores[0]).toBe(r1.totals[0] + r2.totals[0]);
    expect(session.cumulativeScores[1]).toBe(r1.totals[1] + r2.totals[1]);
  });
});

describe('full match', () => {
  function playTurn(session: LostCitiesSession): TurnResult {
    const player = getCurrentPlayer(session);
    const card = player.hand[0];
    executeAction(session, { kind: 'discard', card, color: card.color });
    return executeAction(session, { kind: 'draw-from-pile' });
  }

  it('should complete a 3-round match', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    let turnCount = 0;
    while (session.matchPhase !== 'match-over') {
      const result = playTurn(session);
      if (result.roundEnded && !result.matchEnded) {
        startNextRound(session);
      }
      turnCount++;
      if (turnCount > 500) throw new Error('infinite loop guard');
    }

    expect(session.matchPhase).toBe('match-over');
    expect(session.roundScores).toHaveLength(ROUND_COUNT);
    expect(isMatchOver(session)).toBe(true);
  });

  it('should determine a winner based on cumulative scores', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    while (session.matchPhase !== 'match-over') {
      const result = playTurn(session);
      if (result.roundEnded && !result.matchEnded) {
        startNextRound(session);
      }
    }

    const winner = getMatchWinner(session);
    const [s0, s1] = session.cumulativeScores;

    if (s0 > s1) {
      expect(winner).toBe(0);
    } else if (s1 > s0) {
      expect(winner).toBe(1);
    } else {
      expect(winner).toBeNull(); // Tie
    }
  });

  it('should not allow actions after match ends', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    while (session.matchPhase !== 'match-over') {
      const result = playTurn(session);
      if (result.roundEnded && !result.matchEnded) {
        startNextRound(session);
      }
    }

    const card = session.players[0].hand[0];
    expect(() =>
      executeAction(session, { kind: 'discard', card, color: card.color }),
    ).toThrow('Match is not in playing phase');
  });

  it('getMatchWinner returns null if match not over', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    expect(getMatchWinner(session)).toBeNull();
  });
});

// ── Play-to-expedition integration ─────────────────────────

describe('expedition play integration', () => {
  it('should enforce ascending order across multiple plays', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });

    // Manually set up a controlled hand for player 0
    const color: ExpeditionColor = 'yellow';
    session.players[0].hand = [
      { id: 900, color, type: 'numbered', rank: 5, faceUp: true },
      { id: 901, color, type: 'numbered', rank: 3, faceUp: true },
      { id: 902, color, type: 'numbered', rank: 7, faceUp: true },
      { id: 903, color: 'blue', type: 'numbered', rank: 2, faceUp: true },
      { id: 904, color: 'blue', type: 'numbered', rank: 4, faceUp: true },
      { id: 905, color: 'red', type: 'numbered', rank: 6, faceUp: true },
      { id: 906, color: 'green', type: 'numbered', rank: 8, faceUp: true },
      { id: 907, color: 'white', type: 'numbered', rank: 9, faceUp: true },
    ] as LostCitiesCard[];

    // Play yellow 5
    const card5 = session.players[0].hand.find(
      (c) => c.type === 'numbered' && c.color === 'yellow' && (c as any).rank === 5,
    )!;
    executeAction(session, {
      kind: 'play-to-expedition',
      card: card5,
      color: 'yellow',
    });
    executeAction(session, { kind: 'draw-from-pile' });

    // Opponent's turn — discard + draw
    const oppCard = getCurrentPlayer(session).hand[0];
    executeAction(session, { kind: 'discard', card: oppCard, color: oppCard.color });
    executeAction(session, { kind: 'draw-from-pile' });

    // Player 0's turn again — try to play yellow 3 (should fail, 3 < 5)
    const card3 = session.players[0].hand.find(
      (c) => c.type === 'numbered' && c.color === 'yellow' && (c as any).rank === 3,
    );
    if (card3) {
      expect(() =>
        executeAction(session, {
          kind: 'play-to-expedition',
          card: card3,
          color: 'yellow',
        }),
      ).toThrow('Illegal action');
    }

    // Play yellow 7 (should succeed, 7 > 5)
    const card7 = session.players[0].hand.find(
      (c) => c.type === 'numbered' && c.color === 'yellow' && (c as any).rank === 7,
    );
    if (card7) {
      executeAction(session, {
        kind: 'play-to-expedition',
        card: card7,
        color: 'yellow',
      });

      const lane = session.players[0].expeditions.get('yellow')!;
      expect(lane).toHaveLength(2);
      expect((lane[0] as any).rank).toBe(5);
      expect((lane[1] as any).rank).toBe(7);
    }
  });
});

// ── isCurrentRoundOver ─────────────────────────────────────

describe('isCurrentRoundOver', () => {
  it('should return false at start of game', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    expect(isCurrentRoundOver(session)).toBe(false);
  });

  it('should return true when draw pile is empty', () => {
    const session = setupLostCitiesGame({ rng: createSeededRng() });
    session.round.drawPile = [];
    expect(isCurrentRoundOver(session)).toBe(true);
  });
});
