/**
 * Unit tests for the replay adapter pattern: ReplayAdapter implementations
 * and AdapterRegistry.
 *
 * Tests adapter detection (`canHandle`), validation, transcript introspection,
 * registry resolution, and edge cases for both GolfReplayAdapter and
 * BeleagueredCastleReplayAdapter.
 *
 * These are pure unit tests (no Playwright, no subprocess) and run fast.
 *
 * See CG-0MLTFUL061DWDGA2.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GolfReplayAdapter } from '../../scripts/adapters/GolfReplayAdapter';
import { BeleagueredCastleReplayAdapter } from '../../scripts/adapters/BeleagueredCastleReplayAdapter';
import { adapterRegistry } from '../../scripts/adapters/AdapterRegistry';
import type { ReplayAdapter } from '../../scripts/adapters/ReplayAdapter';

// ── Fixtures ────────────────────────────────────────────────

/** Minimal valid Golf v2 transcript (structural shape, no `gameType` field). */
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
function makeUnknownTranscript(): Record<string, unknown> {
  return { gameType: 'unknown-game', data: [] };
}

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

// ── AdapterRegistry Tests ───────────────────────────────────

describe('AdapterRegistry', () => {
  // Use a fresh registry for each test to avoid pollution
  // from the pre-registered adapters in index.ts
  beforeEach(() => {
    adapterRegistry.clear();
  });

  // Restore default registrations after all tests
  afterEach(() => {
    adapterRegistry.clear();
    adapterRegistry.register(new BeleagueredCastleReplayAdapter());
    adapterRegistry.register(new GolfReplayAdapter());
  });

  describe('register', () => {
    it('should register an adapter', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      expect(adapterRegistry.getRegisteredTypes()).toContain('golf');
    });

    it('should throw on duplicate gameType', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      expect(() => adapterRegistry.register(new GolfReplayAdapter())).toThrow('already registered');
    });
  });

  describe('getByType', () => {
    it('should return the adapter for a known type', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      const adapter = adapterRegistry.getByType('golf');
      expect(adapter).toBeDefined();
      expect(adapter!.gameType).toBe('golf');
    });

    it('should return undefined for an unknown type', () => {
      expect(adapterRegistry.getByType('nonexistent')).toBeUndefined();
    });
  });

  describe('detect', () => {
    it('should detect a Golf transcript', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      const adapter = adapterRegistry.detect(makeGolfTranscript());
      expect(adapter).toBeDefined();
      expect(adapter!.gameType).toBe('golf');
    });

    it('should detect a BC transcript', () => {
      adapterRegistry.register(new BeleagueredCastleReplayAdapter());
      const adapter = adapterRegistry.detect(makeBCTranscript());
      expect(adapter).toBeDefined();
      expect(adapter!.gameType).toBe('beleaguered-castle');
    });

    it('should return undefined when no adapter matches', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      expect(adapterRegistry.detect(makeUnknownTranscript())).toBeUndefined();
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      // Register both adapters in priority order
      adapterRegistry.register(new BeleagueredCastleReplayAdapter());
      adapterRegistry.register(new GolfReplayAdapter());
    });

    it('should auto-detect Golf from transcript shape', () => {
      const adapter = adapterRegistry.resolve(makeGolfTranscript());
      expect(adapter.gameType).toBe('golf');
    });

    it('should auto-detect BC from game field', () => {
      const adapter = adapterRegistry.resolve(makeBCTranscript());
      expect(adapter.gameType).toBe('beleaguered-castle');
    });

    it('should use explicit override when provided', () => {
      const adapter = adapterRegistry.resolve(makeGolfTranscript(), 'golf');
      expect(adapter.gameType).toBe('golf');
    });

    it('should throw for unknown explicit game type', () => {
      expect(() => adapterRegistry.resolve(makeGolfTranscript(), 'nonexistent')).toThrow('Unknown game type');
      expect(() => adapterRegistry.resolve(makeGolfTranscript(), 'nonexistent')).toThrow('nonexistent');
    });

    it('should throw when no adapter matches auto-detection', () => {
      expect(() => adapterRegistry.resolve(makeUnknownTranscript())).toThrow('Could not auto-detect');
      expect(() => adapterRegistry.resolve(makeUnknownTranscript())).toThrow('--game');
    });

    it('should list available adapters in error messages', () => {
      try {
        adapterRegistry.resolve(makeUnknownTranscript());
      } catch (err) {
        expect((err as Error).message).toContain('beleaguered-castle');
        expect((err as Error).message).toContain('golf');
      }
    });
  });

  describe('detection priority', () => {
    it('should detect BC before Golf when BC is registered first', () => {
      // BC has explicit `game` field; Golf uses structural match.
      // A transcript with both `game: 'beleaguered-castle'` AND Golf-like
      // structure should match BC because it's registered first.
      adapterRegistry.register(new BeleagueredCastleReplayAdapter());
      adapterRegistry.register(new GolfReplayAdapter());

      const hybrid = {
        ...makeGolfTranscript(),
        game: 'beleaguered-castle',
      };
      const adapter = adapterRegistry.detect(hybrid);
      expect(adapter).toBeDefined();
      expect(adapter!.gameType).toBe('beleaguered-castle');
    });

    it('should fall back to Golf for transcripts without game field', () => {
      adapterRegistry.register(new BeleagueredCastleReplayAdapter());
      adapterRegistry.register(new GolfReplayAdapter());

      const adapter = adapterRegistry.detect(makeGolfTranscript());
      expect(adapter).toBeDefined();
      expect(adapter!.gameType).toBe('golf');
    });
  });

  describe('getRegistered and getRegisteredTypes', () => {
    it('should return empty arrays when cleared', () => {
      expect(adapterRegistry.getRegistered()).toHaveLength(0);
      expect(adapterRegistry.getRegisteredTypes()).toHaveLength(0);
    });

    it('should return all registered adapters', () => {
      adapterRegistry.register(new BeleagueredCastleReplayAdapter());
      adapterRegistry.register(new GolfReplayAdapter());

      expect(adapterRegistry.getRegistered()).toHaveLength(2);
      expect(adapterRegistry.getRegisteredTypes()).toEqual(['beleaguered-castle', 'golf']);
    });

    it('should return a copy (not the internal array)', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      const registered = adapterRegistry.getRegistered();
      expect(registered).toHaveLength(1);

      // Mutating the returned array should not affect the registry
      (registered as ReplayAdapter[]).length = 0;
      expect(adapterRegistry.getRegistered()).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all adapters', () => {
      adapterRegistry.register(new GolfReplayAdapter());
      expect(adapterRegistry.getRegistered()).toHaveLength(1);

      adapterRegistry.clear();
      expect(adapterRegistry.getRegistered()).toHaveLength(0);
    });
  });
});
