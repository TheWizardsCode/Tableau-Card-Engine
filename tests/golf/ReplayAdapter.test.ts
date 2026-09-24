/**
 * Golf replay adapter tests (moved from tests/replay/adapters.test.ts).
 *
 * Golf's adapter lives with the Golf game, so its coverage does too — the core
 * repo carries only the shared AdapterRegistry framework tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GolfReplayAdapter } from '../../example-games/golf/scripts/adapters/GolfReplayAdapter';

// ── Fixtures ────────────────────────────────────────────────
function makeBCTranscript(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    game: 'beleaguered-castle',
    seed: 42,
    startedAt: '2026-01-15T10:00:00.000Z',
    endedAt: '2026-01-15T10:30:00.000Z',
    initialState: {
      foundations: [
        { suit: 'spades', size: 0, topRank: null },
        { suit: 'hearts', size: 0, topRank: null },
        { suit: 'diamonds', size: 0, topRank: null },
        { suit: 'clubs', size: 0, topRank: null },
      ],
      tableau: [
        { cards: [{ rank: '3', suit: 'spades', faceUp: true }] },
        { cards: [{ rank: '5', suit: 'hearts', faceUp: true }] },
        { cards: [{ rank: 'A', suit: 'diamonds', faceUp: true }] },
        { cards: [] },
        { cards: [] },
        { cards: [] },
        { cards: [] },
        { cards: [] },
      ],
    },
    moves: [
      { kind: 'player-move', move: { kind: 'tableau-to-tableau', fromCol: 0, toCol: 3 }, moveCount: 1 },
      { kind: 'player-move', move: { kind: 'tableau-to-foundation', fromCol: 2, toFoundation: 2 }, moveCount: 2 },
    ],
    result: { outcome: 'win', moveCount: 2, elapsedSeconds: 120 },
    ...overrides,
  };
}

/** A transcript that doesn't match any adapter. */

function makeGolfTranscript(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    metadata: {
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:05:00.000Z',
      players: [
        { name: 'You', isAI: false },
        { name: 'AI', isAI: true, strategy: 'greedy' },
      ],
    },
    initialState: {
      boardStates: [
        { grid: [], faceUpCount: 0, visibleScore: 0, totalScore: 0 },
        { grid: [], faceUpCount: 0, visibleScore: 0, totalScore: 0 },
      ],
      discardTop: { rank: '3', suit: 'spades', faceUp: true },
      stockRemaining: 33,
      stockPileCards: [{ rank: '7', suit: 'diamonds', faceUp: false }],
    },
    turns: [
      {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'You',
        drawSource: 'stock',
        move: { kind: 'swap', row: 0, col: 0 },
        boardStates: [
          { grid: [], faceUpCount: 1, visibleScore: 7, totalScore: 47 },
          { grid: [], faceUpCount: 0, visibleScore: 0, totalScore: 54 },
        ],
        discardTop: { rank: '5', suit: 'hearts', faceUp: true },
        stockRemaining: 32,
        stockPileCards: [],
        roundEnded: false,
      },
      {
        turnNumber: 1,
        playerIndex: 1,
        playerName: 'AI',
        drawSource: 'discard',
        move: { kind: 'discard-and-flip', row: 1, col: 2 },
        boardStates: [
          { grid: [], faceUpCount: 1, visibleScore: 7, totalScore: 47 },
          { grid: [], faceUpCount: 1, visibleScore: 6, totalScore: 48 },
        ],
        discardTop: { rank: '6', suit: 'clubs', faceUp: true },
        stockRemaining: 32,
        stockPileCards: [],
        roundEnded: false,
      },
    ],
    results: null,
    ...overrides,
  };
}

/** Minimal valid Golf v1 transcript (no stockPileCards). */
function makeGolfV1Transcript(): Record<string, unknown> {
  const t = makeGolfTranscript({ version: 1 });
  const init = t.initialState as Record<string, unknown>;
  delete init.stockPileCards;
  const turns = t.turns as Array<Record<string, unknown>>;
  for (const turn of turns) {
    delete turn.stockPileCards;
  }
  return t;
}

/** Minimal valid Beleaguered Castle transcript. */


// ── GolfReplayAdapter Tests ─────────────────────────────────

describe('GolfReplayAdapter', () => {
  let adapter: GolfReplayAdapter;

  beforeEach(() => {
    adapter = new GolfReplayAdapter();
  });

  describe('identity', () => {
    it('should have gameType "golf"', () => {
      expect(adapter.gameType).toBe('golf');
    });

    it('should have sceneKey "GolfScene"', () => {
      expect(adapter.sceneKey).toBe('GolfScene');
    });
  });

  describe('canHandle', () => {
    it('should recognise a Golf v2 transcript (structural match)', () => {
      expect(adapter.canHandle(makeGolfTranscript())).toBe(true);
    });

    it('should recognise a Golf v1 transcript', () => {
      expect(adapter.canHandle(makeGolfV1Transcript())).toBe(true);
    });

    it('should recognise a transcript with explicit gameType: "golf"', () => {
      expect(adapter.canHandle({ gameType: 'golf', turns: [], initialState: { boardStates: [], discardTop: null } })).toBe(true);
    });

    it('should reject a BC transcript', () => {
      expect(adapter.canHandle(makeBCTranscript())).toBe(false);
    });

    it('should reject a transcript with a "game" field', () => {
      expect(adapter.canHandle({ ...makeGolfTranscript(), game: 'something' })).toBe(false);
    });

    it('should reject null', () => {
      expect(adapter.canHandle(null)).toBe(false);
    });

    it('should reject a non-object', () => {
      expect(adapter.canHandle('not an object')).toBe(false);
    });

    it('should reject an empty object', () => {
      expect(adapter.canHandle({})).toBe(false);
    });

    it('should reject a transcript without turns array', () => {
      const { turns: _turns, ...rest } = makeGolfTranscript();
      expect(adapter.canHandle(rest)).toBe(false);
    });

    it('should reject a transcript without initialState', () => {
      const { initialState: _init, ...rest } = makeGolfTranscript();
      expect(adapter.canHandle(rest)).toBe(false);
    });
  });

  describe('validateTranscript', () => {
    it('should validate a correct Golf v2 transcript', () => {
      const result = adapter.validateTranscript(makeGolfTranscript());
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a correct Golf v1 transcript', () => {
      const result = adapter.validateTranscript(makeGolfV1Transcript());
      expect(result.valid).toBe(true);
    });

    it('should reject unsupported version', () => {
      const result = adapter.validateTranscript(makeGolfTranscript({ version: 99 }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('version');
    });

    it('should reject missing turns array', () => {
      const t = makeGolfTranscript();
      delete (t as Record<string, unknown>).turns;
      // Force with --game golf, so use adapter directly
      const result = adapter.validateTranscript(t);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('turns');
    });

    it('should reject missing initialState', () => {
      const t = makeGolfTranscript();
      delete (t as Record<string, unknown>).initialState;
      const result = adapter.validateTranscript(t);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('initialState');
    });

    it('should reject non-object input', () => {
      const result = adapter.validateTranscript('string');
      expect(result.valid).toBe(false);
    });
  });

  describe('transcript introspection', () => {
    it('should return the correct turn count', () => {
      expect(adapter.getTurnCount(makeGolfTranscript())).toBe(2);
    });

    it('should return the transcript version', () => {
      expect(adapter.getVersion(makeGolfTranscript())).toBe(2);
      expect(adapter.getVersion(makeGolfV1Transcript())).toBe(1);
    });

    it('should return a summary line with player names', () => {
      const summary = adapter.getSummaryLine(makeGolfTranscript());
      expect(summary).toContain('You');
      expect(summary).toContain('AI');
    });

    it('should support interactive takeover for v2', () => {
      expect(adapter.supportsInteractiveTakeover(makeGolfTranscript())).toBe(true);
    });

    it('should not support interactive takeover for v1', () => {
      expect(adapter.supportsInteractiveTakeover(makeGolfV1Transcript())).toBe(false);
    });
  });

  describe('getReplayUrl', () => {
    it('should append ?mode=replay to the base URL', () => {
      expect(adapter.getReplayUrl('http://localhost:3000')).toBe('http://localhost:3000?mode=replay');
    });
  });

  describe('describeTurn', () => {
    it('should describe a turn with player name and index', () => {
      const desc = adapter.describeTurn(makeGolfTranscript(), 0);
      expect(desc).toContain('You');
      expect(desc).toContain('P0');
    });

    it('should describe the second turn correctly', () => {
      const desc = adapter.describeTurn(makeGolfTranscript(), 1);
      expect(desc).toContain('AI');
      expect(desc).toContain('P1');
    });
  });

  describe('describeLastAction', () => {
    it('should return initial state description for index -1', () => {
      const desc = adapter.describeLastAction(makeGolfTranscript(), -1);
      expect(desc).toContain('initial state');
    });

    it('should describe a swap move', () => {
      const desc = adapter.describeLastAction(makeGolfTranscript(), 0);
      expect(desc).toContain('You');
      expect(desc).toContain('swapped');
      expect(desc).toContain('stock');
    });

    it('should describe a discard-and-flip move', () => {
      const desc = adapter.describeLastAction(makeGolfTranscript(), 1);
      expect(desc).toContain('AI');
      expect(desc).toContain('discarded & flipped');
      expect(desc).toContain('discard');
    });
  });
});

