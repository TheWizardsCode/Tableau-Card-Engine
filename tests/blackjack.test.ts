/**
 * Blackjack Example Game Tests
 *
 * Tests for the core Blackjack game logic: scoring, dealing,
 * hit/stand, bust detection, blackjack detection, and dealer AI.
 *
 * @group blackjack
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Card } from '../src/card-system/Card';
import type { Rank } from '../src/card-system/Card';
import {
  createBlackjackGameState,
  getScore,
  isBust,
  isBlackjack,
  dealInitialHands,
  playerHit,
  playerStand,
  dealerPlay,
  determineWinner,
  type BlackjackGameState,
  type BlackjackHand,
} from '../example-games/blackjack/BlackjackGame';

// ── Test helpers ──────────────────────────────────────────

/** Create a hand from numeric values (for testing). */
/** Create a hand from numeric values (for testing). */
function makeHand(values: number[]): BlackjackHand {
  const rankNames = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  return {
    cards: values.map((v, i) => ({
      faceUp: false,
      rank: rankNames[v - 1] as Rank,
      suit: (['hearts', 'diamonds', 'clubs', 'spades'] as const)[i % 4],
    } as Card)),
  };
}

// ── Scoring Tests ─────────────────────────────────────────

describe('Blackjack scoring', () => {
  it('should return 0 for an empty hand', () => {
    const hand: BlackjackHand = { cards: [] };
    expect(getScore(hand)).toBe(0);
  });

  it('should score number cards at their face value', () => {
    // 5 + 3 = 8
    const hand = makeHand([5, 3]);
    expect(getScore(hand)).toBe(8);
  });

  it('should score face cards (J, Q, K) as 10', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'J', suit: 'hearts' },
        { faceUp: false, rank: 'K', suit: 'diamonds' },
      ],
    };
    expect(getScore(hand)).toBe(20);
  });

  it('should score an Ace as 11 when 11 does not bust', () => {
    // Ace (11) + 7 = 18
    const hand = makeHand([1, 7]);
    expect(getScore(hand)).toBe(18);
  });

  it('should score an Ace as 1 when 11 would bust', () => {
    // Ace (1) + 10 + 7 = 18, NOT 11+10+7=28
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: '10', suit: 'diamonds' },
        { faceUp: false, rank: '7', suit: 'clubs' },
      ],
    };
    expect(getScore(hand)).toBe(18);
  });

  it('should handle multiple Aces correctly', () => {
    // Ace (1) + Ace (1) + 9 = 21
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: 'A', suit: 'diamonds' },
        { faceUp: false, rank: '9', suit: 'clubs' },
      ],
    };
    expect(getScore(hand)).toBe(21);
  });

  it('should score Ace + 10 as blackjack (21)', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: '10', suit: 'diamonds' },
      ],
    };
    expect(getScore(hand)).toBe(21);
  });

  it('should score Ace + Jack as blackjack (21)', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: 'J', suit: 'diamonds' },
      ],
    };
    expect(getScore(hand)).toBe(21);
  });
});

// ── Bust Detection Tests ──────────────────────────────────

describe('Blackjack bust detection', () => {
  it('should not bust for score under 21', () => {
    const hand = makeHand([5, 3, 2]);
    expect(isBust(hand)).toBe(false);
  });

  it('should not bust for exactly 21', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: 'K', suit: 'diamonds' },
      ],
    };
    expect(isBust(hand)).toBe(false);
  });

  it('should bust for score over 21', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: '10', suit: 'hearts' },
        { faceUp: false, rank: 'K', suit: 'diamonds' },
        { faceUp: false, rank: '5', suit: 'clubs' },
      ],
    };
    expect(isBust(hand)).toBe(true);
  });

  it('should bust for empty hand (score 0)', () => {
    const hand: BlackjackHand = { cards: [] };
    expect(isBust(hand)).toBe(false);
  });
});

// ── Blackjack Detection Tests ─────────────────────────────

describe('Blackjack blackjack detection', () => {
  it('should detect blackjack (Ace + 10-value)', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: 'Q', suit: 'diamonds' },
      ],
    };
    expect(isBlackjack(hand)).toBe(true);
  });

  it('should not detect blackjack for 21 with 3+ cards', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: '7', suit: 'hearts' },
        { faceUp: false, rank: '7', suit: 'diamonds' },
        { faceUp: false, rank: '7', suit: 'clubs' },
      ],
    };
    expect(isBlackjack(hand)).toBe(false);
  });

  it('should not detect blackjack for non-21 hands', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: '5', suit: 'hearts' },
        { faceUp: false, rank: '6', suit: 'diamonds' },
      ],
    };
    expect(isBlackjack(hand)).toBe(false);
  });

  it('should only detect blackjack with exactly 2 cards', () => {
    const hand: BlackjackHand = {
      cards: [
        { faceUp: false, rank: 'A', suit: 'hearts' },
        { faceUp: false, rank: '2', suit: 'diamonds' },
        { faceUp: false, rank: '8', suit: 'clubs' },
      ],
    };
    expect(isBlackjack(hand)).toBe(false);
  });
});

// ── Game State Initialization ─────────────────────────────

describe('Blackjack game state initialization', () => {
  it('should create a game state in IDLE phase', () => {
    const state = createBlackjackGameState();
    expect(state.phase).toBe('IDLE');
    expect(state.playerHand.cards).toHaveLength(0);
    expect(state.dealerHand.cards).toHaveLength(0);
    expect(state.deck).toHaveLength(52);
    expect(state.message).toBe('');
  });
});

// ── Dealing Tests ─────────────────────────────────────────

describe('Blackjack dealing', () => {
  let state: BlackjackGameState;

  beforeEach(() => {
    state = createBlackjackGameState({ seed: 99 });
  });

  it('should deal 2 cards to player and 2 to dealer', () => {
    dealInitialHands(state);
    expect(state.playerHand.cards).toHaveLength(2);
    expect(state.dealerHand.cards).toHaveLength(2);
  });

  it('should set phase to PLAYER_TURN after dealing', () => {
    dealInitialHands(state);
    expect(state.phase).toBe('PLAYER_TURN');
  });

  it('should reduce deck by 4 cards after dealing', () => {
    dealInitialHands(state);
    expect(state.deck).toHaveLength(48);
  });

  it('should deal from the deck (not from thin air)', () => {
    // Track all unique card identities (rank+suit) from a full deck
    const state = createBlackjackGameState({ seed: 42 });
    const originalDeckRanks = state.deck.map(c => `${c.rank}${c.suit}`).sort();
    
    dealInitialHands(state);
    
    // Collect dealt cards
    const dealtCards = [
      ...state.playerHand.cards,
      ...state.dealerHand.cards,
    ].map(c => `${c.rank}${c.suit}`).sort();
    
    // Remaining deck + dealt cards should equal original deck
    const remainingRanks = state.deck.map(c => `${c.rank}${c.suit}`).sort();
    const combined = [...remainingRanks, ...dealtCards].sort();
    
    expect(combined).toEqual(originalDeckRanks);
  });
});

// ── Player Hit Tests ──────────────────────────────────────

describe('Blackjack player hit', () => {
  let state: BlackjackGameState;

  beforeEach(() => {
    state = createBlackjackGameState({ seed: 99 });
    dealInitialHands(state);
  });

  it('should add a card to player hand on hit', () => {
    const initialCount = state.playerHand.cards.length;
    playerHit(state);
    expect(state.playerHand.cards).toHaveLength(initialCount + 1);
  });

  it('should reduce deck by 1 on hit', () => {
    const initialDeckSize = state.deck.length;
    playerHit(state);
    expect(state.deck).toHaveLength(initialDeckSize - 1);
  });

  it('should remain in PLAYER_TURN if not bust', () => {
    // Set up a low hand and controlled deck so hittng won't bust
    state.playerHand.cards = [
      { faceUp: false, rank: '2', suit: 'hearts' },
      { faceUp: false, rank: '3', suit: 'diamonds' },
    ];
    state.deck = [
      { faceUp: false, rank: '4', suit: 'clubs' },
      { faceUp: false, rank: '5', suit: 'spades' },
    ];
    state.phase = 'PLAYER_TURN';
    
    const playerScore = getScore(state.playerHand);
    expect(playerScore).toBeLessThan(21);
    
    playerHit(state);
    expect(state.phase).toBe('PLAYER_TURN');  // 2+3+4=9, still under 21
  });

  it('should transition to ROUND_OVER if bust', () => {
    // Set up a hand worth 20, and replace deck with a 10-value card
    state.playerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: 'Q', suit: 'diamonds' },
    ];
    // Replace deck with a guaranteed-bust card
    state.deck = [{ faceUp: false, rank: 'J', suit: 'spades' }];
    state.phase = 'PLAYER_TURN';
    
    expect(getScore(state.playerHand)).toBe(20);
    expect(isBust(state.playerHand)).toBe(false);
    
    // Draw — hits 20+10=30, bust
    playerHit(state);
    
    expect(state.phase).toBe('ROUND_OVER');
    expect(state.message).toContain('Bust');
    expect(getScore(state.playerHand)).toBe(30);
  });

  it('should do nothing if not in PLAYER_TURN phase', () => {
    state.phase = 'ROUND_OVER';
    const deckBefore = state.deck.length;
    playerHit(state);
    expect(state.deck).toHaveLength(deckBefore);
  });
});

// ── Player Stand Tests ────────────────────────────────────

describe('Blackjack player stand', () => {
  let state: BlackjackGameState;

  beforeEach(() => {
    state = createBlackjackGameState({ seed: 99 });
    dealInitialHands(state);
  });

  it('should transition to DEALER_TURN on stand', () => {
    playerStand(state);
    expect(state.phase).toBe('DEALER_TURN');
  });

  it('should do nothing if not in PLAYER_TURN phase', () => {
    state.phase = 'ROUND_OVER';
    playerStand(state);
    expect(state.phase).toBe('ROUND_OVER');
  });
});

// ── Dealer AI Tests ───────────────────────────────────────

describe('Blackjack dealer AI', () => {
  let state: BlackjackGameState;

  it('should hit on 16 or below', () => {
    state = createBlackjackGameState();
    // Set up dealer with a known hand: 10 + 6 = 16
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: '6', suit: 'diamonds' },
    ];
    state.phase = 'DEALER_TURN';
    const initialCount = state.dealerHand.cards.length;
    dealerPlay(state);
    expect(state.dealerHand.cards.length).toBeGreaterThan(initialCount);
  });

  it('should stand on 17 or above', () => {
    state = createBlackjackGameState();
    // Set up dealer with a known hand: 10 + 7 = 17
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: '7', suit: 'diamonds' },
    ];
    state.phase = 'DEALER_TURN';
    const initialCount = state.dealerHand.cards.length;
    dealerPlay(state);
    expect(state.dealerHand.cards).toHaveLength(initialCount);
    expect(state.phase).toBe('ROUND_OVER');
  });

  it('should stand on soft 17 (Ace + 6 = 17)', () => {
    state = createBlackjackGameState();
    state.dealerHand.cards = [
      { faceUp: false, rank: 'A', suit: 'hearts' },
      { faceUp: false, rank: '6', suit: 'diamonds' },
    ];
    expect(getScore(state.dealerHand)).toBe(17);
    state.phase = 'DEALER_TURN';
    const initialCount = state.dealerHand.cards.length;
    dealerPlay(state);
    expect(state.dealerHand.cards).toHaveLength(initialCount);
    expect(state.phase).toBe('ROUND_OVER');
  });

  it('should keep hitting until reaching 17 or bust', () => {
    state = createBlackjackGameState();
    // Set up dealer with a low hand
    state.dealerHand.cards = [
      { faceUp: false, rank: '2', suit: 'hearts' },
      { faceUp: false, rank: '3', suit: 'diamonds' },
    ];
    state.phase = 'DEALER_TURN';
    dealerPlay(state);
    expect(state.phase).toBe('ROUND_OVER');
    const score = getScore(state.dealerHand);
    expect(score >= 17 || isBust(state.dealerHand)).toBe(true);
  });
});

// ── Winner Determination Tests ───────────────────────────

describe('Blackjack winner determination', () => {
  it('should return "dealer" if player busts', () => {
    const state = createBlackjackGameState();
    state.playerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: 'K', suit: 'diamonds' },
      { faceUp: false, rank: '5', suit: 'clubs' },
    ];
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'clubs' },
      { faceUp: false, rank: '6', suit: 'spades' },
    ];
    state.phase = 'ROUND_OVER';
    const result = determineWinner(state);
    expect(result.winner).toBe('dealer');
    expect(result.reason).toContain('Bust');
  });

  it('should return "player" if dealer busts', () => {
    const state = createBlackjackGameState();
    state.playerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: '7', suit: 'diamonds' },
    ];
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'clubs' },
      { faceUp: false, rank: 'K', suit: 'spades' },
      { faceUp: false, rank: '5', suit: 'hearts' },
    ];
    state.phase = 'ROUND_OVER';
    const result = determineWinner(state);
    expect(result.winner).toBe('player');
    expect(result.reason).toContain('Bust');
  });

  it('should return "player" if player has higher score', () => {
    const state = createBlackjackGameState();
    state.playerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: '9', suit: 'diamonds' },
    ];
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'clubs' },
      { faceUp: false, rank: '7', suit: 'spades' },
    ];
    state.phase = 'ROUND_OVER';
    const result = determineWinner(state);
    expect(result.winner).toBe('player');
    expect(result.reason).toContain('19');
  });

  it('should return "dealer" if dealer has higher score', () => {
    const state = createBlackjackGameState();
    state.playerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: '6', suit: 'diamonds' },
    ];
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'clubs' },
      { faceUp: false, rank: '9', suit: 'spades' },
    ];
    state.phase = 'ROUND_OVER';
    const result = determineWinner(state);
    expect(result.winner).toBe('dealer');
  });

  it('should return "push" if scores are equal', () => {
    const state = createBlackjackGameState();
    state.playerHand.cards = [
      { faceUp: false, rank: '10', suit: 'hearts' },
      { faceUp: false, rank: '8', suit: 'diamonds' },
    ];
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'clubs' },
      { faceUp: false, rank: '8', suit: 'spades' },
    ];
    state.phase = 'ROUND_OVER';
    const result = determineWinner(state);
    expect(result.winner).toBe('push');
  });

  it('should return "player" if player has blackjack and dealer does not', () => {
    const state = createBlackjackGameState();
    state.playerHand.cards = [
      { faceUp: false, rank: 'A', suit: 'hearts' },
      { faceUp: false, rank: 'K', suit: 'diamonds' },
    ];
    state.dealerHand.cards = [
      { faceUp: false, rank: '10', suit: 'clubs' },
      { faceUp: false, rank: '9', suit: 'spades' },
    ];
    state.phase = 'ROUND_OVER';
    const result = determineWinner(state);
    expect(result.winner).toBe('player');
    expect(result.reason).toContain('Blackjack');
  });
});

// ── End-to-End Game Flow Tests ────────────────────────────

describe('Blackjack end-to-end flow', () => {
  it('should play a full round from deal to conclusion', () => {
    const state = createBlackjackGameState();

    // Deal
    dealInitialHands(state);
    expect(state.phase).toBe('PLAYER_TURN');

    // Hit a few times
    while (state.phase === 'PLAYER_TURN') {
      const score = getScore(state.playerHand);
      if (score < 17) {
        playerHit(state);
      } else {
        playerStand(state);
      }
    }

    if (state.phase === 'DEALER_TURN') {
      dealerPlay(state);
    }

    expect(state.phase).toBe('ROUND_OVER');
    expect(state.message).toBeTruthy();

    // Verify decks are consistent
    const totalCards = state.playerHand.cards.length + state.dealerHand.cards.length + state.deck.length;
    expect(totalCards).toBe(52);
  });
});
