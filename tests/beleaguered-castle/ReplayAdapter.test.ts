/**
 * Beleaguered Castle replay adapter tests (moved from tests/replay/adapters.test.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BeleagueredCastleReplayAdapter } from '../../example-games/beleaguered-castle/scripts/adapters/BeleagueredCastleReplayAdapter';

// ── Fixtures ────────────────────────────────────────────────
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


// ── BeleagueredCastleReplayAdapter Tests ────────────────────

describe('BeleagueredCastleReplayAdapter', () => {
  let adapter: BeleagueredCastleReplayAdapter;

  beforeEach(() => {
    adapter = new BeleagueredCastleReplayAdapter();
  });

  describe('identity', () => {
    it('should have gameType "beleaguered-castle"', () => {
      expect(adapter.gameType).toBe('beleaguered-castle');
    });

    it('should have sceneKey "BeleagueredCastleScene"', () => {
      expect(adapter.sceneKey).toBe('BeleagueredCastleScene');
    });
  });

  describe('canHandle', () => {
    it('should recognise a BC transcript', () => {
      expect(adapter.canHandle(makeBCTranscript())).toBe(true);
    });

    it('should reject a Golf transcript', () => {
      expect(adapter.canHandle(makeGolfTranscript())).toBe(false);
    });

    it('should reject null', () => {
      expect(adapter.canHandle(null)).toBe(false);
    });

    it('should reject non-objects', () => {
      expect(adapter.canHandle(42)).toBe(false);
    });

    it('should reject an object with a different game field', () => {
      expect(adapter.canHandle({ game: 'other-game' })).toBe(false);
    });
  });

  describe('validateTranscript', () => {
    it('should validate a correct BC transcript', () => {
      const result = adapter.validateTranscript(makeBCTranscript());
      expect(result.valid).toBe(true);
    });

    it('should reject a non-BC transcript', () => {
      const result = adapter.validateTranscript(makeGolfTranscript());
      expect(result.valid).toBe(false);
    });

    it('should reject missing moves array', () => {
      const t = makeBCTranscript();
      (t as Record<string, unknown>).moves = 'not-array';
      const result = adapter.validateTranscript(t);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('moves');
    });
  });

  describe('transcript introspection', () => {
    it('should return the correct move count', () => {
      expect(adapter.getTurnCount(makeBCTranscript())).toBe(2);
    });

    it('should return version 1', () => {
      expect(adapter.getVersion(makeBCTranscript())).toBe(1);
    });

    it('should return a summary line with the seed', () => {
      const summary = adapter.getSummaryLine(makeBCTranscript());
      expect(summary).toContain('42');
    });

    it('should not support interactive takeover', () => {
      expect(adapter.supportsInteractiveTakeover(makeBCTranscript())).toBe(false);
    });
  });

  describe('getReplayUrl', () => {
    it('should include game=beleaguered-castle in the URL', () => {
      const url = adapter.getReplayUrl('http://localhost:3000');
      expect(url).toContain('game=beleaguered-castle');
      expect(url).toContain('mode=replay');
    });
  });

  describe('scene interaction methods', () => {
    it('startScene should call page.evaluate', async () => {
      let evaluatedScript = '';
      const fakePage = {
        evaluate: async (script: string) => { evaluatedScript = script; },
      } as unknown as import('playwright').Page;
      await adapter.startScene(fakePage);
      expect(evaluatedScript).toContain('BeleagueredCastleScene');
    });

    it('waitForSceneReady should call page.waitForFunction', async () => {
      let called = false;
      const fakePage = {
        waitForFunction: async () => { called = true; },
      } as unknown as import('playwright').Page;
      await adapter.waitForSceneReady(fakePage, 5000);
      expect(called).toBe(true);
    });

    it('injectInitialState should call page.evaluate with snapshot', async () => {
      let evaluatedScript = '';
      const fakePage = {
        evaluate: async (script: string) => { evaluatedScript = script; },
      } as unknown as import('playwright').Page;
      await adapter.injectInitialState(fakePage, makeBCTranscript(), 5000);
      expect(evaluatedScript).toContain('loadBoardState');
      expect(evaluatedScript).toContain('state-settled');
    });

    it('injectTurnState should call page.evaluate with reconstructed state', async () => {
      let evaluatedScript = '';
      const fakePage = {
        evaluate: async (script: string) => { evaluatedScript = script; },
      } as unknown as import('playwright').Page;
      await adapter.injectTurnState(fakePage, makeBCTranscript(), 0, 5000);
      expect(evaluatedScript).toContain('loadBoardState');
      expect(evaluatedScript).toContain('state-settled');
    });

    it('showTakeoverOverlay should throw (not supported)', async () => {
      await expect(adapter.showTakeoverOverlay({} as never, { turnNumber: 0, lastAction: 'test' })).rejects.toThrow('does not support');
    });
  });

  describe('describeTurn', () => {
    it('should describe a tableau-to-tableau move', () => {
      const desc = adapter.describeTurn(makeBCTranscript(), 0);
      expect(desc).toContain('Move 1');
      expect(desc).toContain('col 0');
      expect(desc).toContain('col 3');
    });

    it('should describe a tableau-to-foundation move', () => {
      const desc = adapter.describeTurn(makeBCTranscript(), 1);
      expect(desc).toContain('Move 2');
      expect(desc).toContain('col 2');
      expect(desc).toContain('foundation 2');
    });
  });

  describe('describeLastAction', () => {
    it('should return initial state description for index -1', () => {
      expect(adapter.describeLastAction(makeBCTranscript(), -1)).toContain('initial state');
    });

    it('should describe a specific move', () => {
      const desc = adapter.describeLastAction(makeBCTranscript(), 1);
      expect(desc).toContain('Move 2');
      expect(desc).toContain('col 2');
      expect(desc).toContain('foundation 2');
    });
  });
});

