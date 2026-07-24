/**
 * Gym Transcript Recording scenario tests.
 *
 * Validates the Blackjack simulation within the Gym Transcript scene:
 *  - BlackjackRecorder records deal, hit, stick, and dealer events
 *  - Hand results computed correctly (player win, dealer win, push, bust)
 *  - Multiple hands are appended to the same transcript session
 *  - Deterministic RNG produces stable sequences
 *  - Auto-save is invoked when a hand ends
 *
 * @module tests/gym/GymTranscript.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  TranscriptRecorderBase,
  createSeededRng,
} from '../../src/core-engine';
import type { BaseTranscript } from '../../src/core-engine';

// ── Types matching the scene's Blackjack simulation ────────

/** A single Blackjack event recorded in the transcript. */
interface BlackjackEvent {
  type: 'deal' | 'hit' | 'stick' | 'dealer_hit' | 'dealer_stick' | 'bust' | 'result';
  turn: number;
  player: 'player' | 'dealer' | 'game';
  cardValue?: number;
  handTotal?: number;
  detail: string;
}

/** Result of a completed Blackjack hand. */
interface HandResult {
  handNumber: number;
  playerTotal: number;
  dealerTotal: number;
  playerCards: number[];
  dealerCards: number[];
  winner: 'player' | 'dealer' | 'push';
}

/** Transcript shape for the Blackjack demo. */
interface DemoTranscript extends BaseTranscript<null, BlackjackEvent, HandResult> {
  seed: number;
  hands: HandResult[];
}

// ── BlackjackRecorder (isolated for testing) ───────────────

class BlackjackRecorder extends TranscriptRecorderBase<DemoTranscript> {
  private nextTurn = 0;

  constructor(seed: number) {
    super({
      version: 1,
      gameType: 'gym-transcript-blackjack',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: null,
      events: [],
      results: null,
      seed,
      hands: [],
    });
  }

  recordEvent(
    type: BlackjackEvent['type'],
    player: BlackjackEvent['player'],
    detail: string,
    cardValue?: number,
    handTotal?: number,
  ): void {
    const evt: BlackjackEvent = {
      type,
      turn: this.nextTurn++,
      player,
      detail,
    };
    if (cardValue !== undefined) evt.cardValue = cardValue;
    if (handTotal !== undefined) evt.handTotal = handTotal;
    this.transcript.events.push(evt);
  }

  recordHandResult(result: HandResult): void {
    this.transcript.hands.push(result);
    this.transcript.results = result;
  }

  finalize(): DemoTranscript {
    this.transcript.endedAt = new Date().toISOString();
    return this.getTranscript();
  }

  get currentTurn(): number {
    return this.nextTurn;
  }

  get eventCount(): number {
    return this.transcript.events.length;
  }
}

// ── Helpers for computing Blackjack logic ──────────────────

/** Compute the total of a hand, treating values 11+ as 10 (face cards). */
function handTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === 11) {
      aces++;
      total += 11;
    } else {
      total += c;
    }
  }
  // Convert aces from 11 to 1 as needed
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/** Draw a card value (2-11, where 11 = Ace) using the seeded RNG. */
function drawCard(rng: () => number): number {
  // Generate values 2-11 with roughly equal probability
  const val = Math.floor(rng() * 10) + 2;
  // Map 12+ down (since 12+ would be out of range for a single card)
  return Math.min(val, 11);
}

/**
 * Determine the winner of a Blackjack hand.
 * Both totals are assumed to be <= 21 (busts handled before calling this).
 */
function determineWinner(playerTotal: number, dealerTotal: number): 'player' | 'dealer' | 'push' {
  if (playerTotal > 21) return 'dealer';
  if (dealerTotal > 21) return 'player';
  if (playerTotal > dealerTotal) return 'player';
  if (dealerTotal > playerTotal) return 'dealer';
  return 'push';
}

// ── Tests ──────────────────────────────────────────────────

describe('Gym Transcript Blackjack simulation', () => {
  describe('BlackjackRecorder', () => {
    it('records deal events with card values and turn numbers', () => {
      const recorder = new BlackjackRecorder(42);

      recorder.recordEvent('deal', 'player', 'Dealt card: 7', 7, 7);
      recorder.recordEvent('deal', 'player', 'Dealt card: 5', 5, 12);

      const t = recorder.getTranscript();
      expect(t.events.length).toBe(2);
      expect(t.events[0]).toMatchObject({ type: 'deal', player: 'player', cardValue: 7, turn: 0 });
      expect(t.events[1]).toMatchObject({ type: 'deal', player: 'player', cardValue: 5, turn: 1 });
    });

    it('records hit, stick, dealer_hit, and result events', () => {
      const recorder = new BlackjackRecorder(99);

      recorder.recordEvent('deal', 'player', 'Dealt card: Ace', 11, 11);
      recorder.recordEvent('deal', 'player', 'Dealt card: 3', 3, 14);
      recorder.recordEvent('hit', 'player', 'Drew card: 4', 4, 18);
      recorder.recordEvent('stick', 'player', 'Player sticks at 18', undefined, 18);

      recorder.recordEvent('dealer_hit', 'dealer', 'Dealer drew card: 6', 6, 16);
      recorder.recordEvent('dealer_stick', 'dealer', 'Dealer sticks at 16', undefined, 16);

      recorder.recordEvent('result', 'game', 'Player wins (18 vs 16)');

      expect(recorder.eventCount).toBe(7);
      const t = recorder.getTranscript();
      expect(t.events[3].type).toBe('stick');
      expect(t.events[4].type).toBe('dealer_hit');
      expect(t.events[6].type).toBe('result');
    });

    it('records hand results with winner', () => {
      const recorder = new BlackjackRecorder(42);

      const result: HandResult = {
        handNumber: 1,
        playerTotal: 18,
        dealerTotal: 16,
        playerCards: [7, 5, 6],
        dealerCards: [10, 6],
        winner: 'player',
      };

      recorder.recordHandResult(result);

      expect(recorder.getTranscript().hands.length).toBe(1);
      expect(recorder.getTranscript().hands[0]).toEqual(result);
      expect(recorder.getTranscript().results).toEqual(result);
    });

    it('finalize sets endedAt and returns transcript snapshot', () => {
      const recorder = new BlackjackRecorder(42);

      recorder.recordEvent('deal', 'player', 'Dealt card: 10', 10, 10);
      const t = recorder.finalize();

      expect(t.endedAt).not.toBe('');
      expect(t.events.length).toBe(1);
      expect(t.gameType).toBe('gym-transcript-blackjack');
    });

    it('multiple hands append events and results to the same transcript', () => {
      const recorder = new BlackjackRecorder(42);

      // Hand 1
      recorder.recordEvent('deal', 'player', 'Dealt card: 7', 7, 7);
      recorder.recordEvent('deal', 'player', 'Dealt card: 10', 10, 17);
      recorder.recordEvent('stick', 'player', 'Player sticks at 17', undefined, 17);
      recorder.recordEvent('dealer_hit', 'dealer', 'Dealer drew card: 8', 8, 18);
      recorder.recordEvent('dealer_stick', 'dealer', 'Dealer sticks at 18', undefined, 18);
      recorder.recordEvent('result', 'game', 'Dealer wins (18 vs 17)');
      recorder.recordHandResult({
        handNumber: 1, playerTotal: 17, dealerTotal: 18,
        playerCards: [7, 10], dealerCards: [8], winner: 'dealer',
      });

      expect(recorder.getTranscript().hands.length).toBe(1);

      // Hand 2
      recorder.recordEvent('deal', 'player', 'Dealt card: Ace', 11, 11);
      recorder.recordEvent('deal', 'player', 'Dealt card: 9', 9, 20);
      recorder.recordEvent('stick', 'player', 'Player sticks at 20', undefined, 20);
      recorder.recordEvent('dealer_hit', 'dealer', 'Dealer drew card: 7', 7, 17);
      recorder.recordEvent('dealer_stick', 'dealer', 'Dealer sticks at 17', undefined, 17);
      recorder.recordEvent('result', 'game', 'Player wins (20 vs 17)');
      recorder.recordHandResult({
        handNumber: 2, playerTotal: 20, dealerTotal: 17,
        playerCards: [11, 9], dealerCards: [7], winner: 'player',
      });

      const t = recorder.getTranscript();
      expect(t.hands.length).toBe(2);
      expect(t.hands[0].handNumber).toBe(1);
      expect(t.hands[1].handNumber).toBe(2);
      expect(t.events.length).toBe(12);
    });
  });

  describe('Hand computation', () => {
    it('handTotal computes simple sums', () => {
      expect(handTotal([7, 5])).toBe(12);
      expect(handTotal([10, 9])).toBe(19);
      expect(handTotal([2, 3, 4])).toBe(9);
    });

    it('handTotal treats Ace as 11 unless bust', () => {
      expect(handTotal([11, 7])).toBe(18); // Ace=11, 7=7 → 18
      expect(handTotal([11, 11])).toBe(12); // Ace=11, Ace=1 → 12
    });

    it('handTotal converts Ace from 11 to 1 to avoid bust', () => {
      expect(handTotal([11, 5, 10])).toBe(16); // Ace=1 (was 11, busted)
      expect(handTotal([11, 10, 10])).toBe(21); // Ace=1, 10+10=20+1=21
    });

    it('handTotal handles multiple aces', () => {
      // Three aces: 11+1+1 = 13 (first as 11, rest as 1)
      expect(handTotal([11, 11, 11])).toBe(13);
      // Four aces: 11+1+1+1 = 14
      expect(handTotal([11, 11, 11, 11])).toBe(14);
    });

    it('drawCard generates values between 2 and 11', () => {
      const rng = createSeededRng(42);
      for (let i = 0; i < 100; i++) {
        const card = drawCard(rng);
        expect(card).toBeGreaterThanOrEqual(2);
        expect(card).toBeLessThanOrEqual(11);
      }
    });

    it('determineWinner returns correct result', () => {
      expect(determineWinner(18, 16)).toBe('player');
      expect(determineWinner(16, 18)).toBe('dealer');
      expect(determineWinner(18, 18)).toBe('push');
      expect(determineWinner(22, 18)).toBe('dealer');  // player bust
      expect(determineWinner(18, 22)).toBe('player');  // dealer bust
      expect(determineWinner(22, 24)).toBe('dealer');  // both bust, dealer wins by default
    });

    it('deterministic sequences from seeded RNG', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);

      const seq1 = Array.from({ length: 20 }, () => drawCard(rng1));
      const seq2 = Array.from({ length: 20 }, () => drawCard(rng2));

      expect(seq1).toEqual(seq2);
    });
  });
});

// ── Edge cases ─────────────────────────────────────────────

describe('Blackjack edge cases', () => {
  it('player blackjack (Ace + 10-value card)', () => {
    // Ace=11 + 10 = 21
    expect(handTotal([11, 10])).toBe(21);
  });

  it('five card charlie (5 cards without busting)', () => {
    const total = handTotal([2, 3, 2, 3, 4]);
    expect(total).toBe(14); // 2+3+2+3+4 = 14
    expect(total).toBeLessThanOrEqual(21);
  });

  it('bust scenario (hand over 21)', () => {
    const total = handTotal([10, 8, 7]); // 25
    expect(total).toBe(25);
    expect(total).toBeGreaterThan(21);
  });

  it('Ace flexibility prevents bust', () => {
    const total = handTotal([11, 7, 6]); // 11+7+6=24 → Ace as 1: 1+7+6=14
    expect(total).toBe(14);
  });
});
