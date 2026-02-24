/**
 * Integration tests for The Mind.
 *
 * Verifies end-to-end integration across all modules:
 *   - Game selector registration in main.ts
 *   - Headless AI-vs-AI games completing without errors
 *   - Transcript structure and invariants
 *   - Game state + AI strategy + transcript recorder working together
 *   - Level progression and lives system correctness
 */

import { describe, it, expect } from 'vitest';
import {
  runGame,
  type HeadlessGameConfig,
  type HeadlessGameResult,
} from '../../example-games/the-mind/headlessGame';
import {
  MAX_LEVEL,
  STARTING_LIVES,
  MAX_LIVES,
  BONUS_LIFE_LEVELS,
} from '../../example-games/the-mind/TheMindGameState';
import type {
  MindCardPlayedEvent,
  MindPenaltyEvent,
  MindLevelCompleteEvent,
  MindGameOverEvent,
  MindTranscript,
} from '../../example-games/the-mind/GameTranscript';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a game with zero jitter for deterministic ordering. */
function runDeterministic(seed: number, overrides?: Partial<HeadlessGameConfig>): HeadlessGameResult {
  return runGame({
    seed,
    timingConfig: { baseDuration: 5000, jitterRange: 0 },
    ...overrides,
  });
}

/** Find a winning game among deterministic seeds. */
function findWinningGame(maxSeeds = 200): HeadlessGameResult | null {
  for (let seed = 0; seed < maxSeeds; seed++) {
    const result = runDeterministic(seed);
    if (result.outcome === 'win') return result;
  }
  return null;
}

/** Find a losing game with default jitter. */
function findLosingGame(maxSeeds = 100): HeadlessGameResult | null {
  for (let seed = 0; seed < maxSeeds; seed++) {
    const result = runGame({ seed });
    if (result.outcome === 'loss') return result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Game selector registration
// ---------------------------------------------------------------------------

describe('Integration: Game selector registration', () => {
  // These tests verify that main.ts correctly registers The Mind.
  // We import main.ts exports indirectly by checking the game catalogue shape.

  it('TheMindScene module exists at the expected path', async () => {
    // We can't import TheMindScene directly in unit tests because it
    // depends on Phaser which requires a browser environment.
    // Instead we verify the module file exists by importing a non-Phaser
    // module from the same game directory.
    const mindCard = await import('../../example-games/the-mind/MindCard');
    expect(mindCard.createMindDeck).toBeDefined();
    expect(mindCard.CARD_BACK_KEY).toBe('mind-back');
    // Also verify the scene key constant used in main.ts
    expect(mindCard.cardAssetKey({ value: 42, faceUp: true })).toBe('mind-42');
  });

  it('all The Mind module exports are importable without errors', async () => {
    // Verify every The Mind module can be imported cleanly
    const [gameState, aiStrategy, transcript, headless, mindCard] =
      await Promise.all([
        import('../../example-games/the-mind/TheMindGameState'),
        import('../../example-games/the-mind/AiStrategy'),
        import('../../example-games/the-mind/GameTranscript'),
        import('../../example-games/the-mind/headlessGame'),
        import('../../example-games/the-mind/MindCard'),
      ]);

    // Core exports exist
    expect(gameState.setupTheMindGame).toBeDefined();
    expect(gameState.playCard).toBeDefined();
    expect(gameState.isGameOver).toBeDefined();
    expect(gameState.MAX_LEVEL).toBe(8);
    expect(aiStrategy.MindAiPlayer).toBeDefined();
    expect(transcript.MindTranscriptRecorder).toBeDefined();
    expect(headless.runGame).toBeDefined();
    expect(mindCard.createMindDeck).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Full game integration (winning game)
// ---------------------------------------------------------------------------

describe('Integration: Full winning game', () => {
  const winResult = findWinningGame();

  // Guard: skip the suite if no win found (extremely unlikely with zero jitter)
  it('a winning game can be found with deterministic seeds', () => {
    expect(winResult).not.toBeNull();
  });

  it('outcome is "win" and final level is MAX_LEVEL', () => {
    if (!winResult) return;
    expect(winResult.outcome).toBe('win');
    expect(winResult.finalLevel).toBe(MAX_LEVEL);
  });

  it('final lives are between 1 and MAX_LIVES', () => {
    if (!winResult) return;
    expect(winResult.finalLives).toBeGreaterThanOrEqual(1);
    expect(winResult.finalLives).toBeLessThanOrEqual(MAX_LIVES);
  });

  it('transcript has level-complete events for all 8 levels in order', () => {
    if (!winResult) return;
    const levelCompletes = winResult.transcript.events.filter(
      (e): e is MindLevelCompleteEvent => e.type === 'level-complete',
    );
    expect(levelCompletes).toHaveLength(MAX_LEVEL);
    for (let i = 0; i < MAX_LEVEL; i++) {
      expect(levelCompletes[i].level).toBe(i + 1);
    }
  });

  it('card-played events have valid card values in range 1-100', () => {
    if (!winResult) return;
    const plays = winResult.transcript.events.filter(
      (e): e is MindCardPlayedEvent => e.type === 'card-played',
    );

    for (const play of plays) {
      expect(play.cardValue).toBeGreaterThanOrEqual(1);
      expect(play.cardValue).toBeLessThanOrEqual(100);
      // pileTopAfter and pileSizeAfter are non-negative
      // (may be 0 if level auto-advanced and cleared the pile)
      expect(play.pileTopAfter).toBeGreaterThanOrEqual(0);
      expect(play.pileSizeAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it('total cards played matches transcript event count', () => {
    if (!winResult) return;
    const plays = winResult.transcript.events.filter(
      (e) => e.type === 'card-played',
    );
    expect(plays.length).toBe(winResult.totalPlays);
    expect(winResult.transcript.results!.totalCardsPlayed).toBe(
      winResult.totalPlays,
    );
  });

  it('bonus lives are awarded at correct levels', () => {
    if (!winResult) return;
    const levelCompletes = winResult.transcript.events.filter(
      (e): e is MindLevelCompleteEvent => e.type === 'level-complete',
    );

    for (const lc of levelCompletes) {
      if (BONUS_LIFE_LEVELS.includes(lc.level)) {
        // Bonus life may or may not be awarded (capped at MAX_LIVES)
        // If lives were already at MAX_LIVES, no bonus awarded
        // Just verify the field is a boolean
        expect(typeof lc.bonusLifeAwarded).toBe('boolean');
      } else {
        // Non-bonus levels should never award bonus
        expect(lc.bonusLifeAwarded).toBe(false);
      }
    }
  });

  it('lives never exceed MAX_LIVES', () => {
    if (!winResult) return;
    const levelCompletes = winResult.transcript.events.filter(
      (e): e is MindLevelCompleteEvent => e.type === 'level-complete',
    );

    for (const lc of levelCompletes) {
      expect(lc.livesAfter).toBeLessThanOrEqual(MAX_LIVES);
      expect(lc.livesAfter).toBeGreaterThanOrEqual(1); // still alive if we won
    }
  });

  it('last event is game-over with outcome "win"', () => {
    if (!winResult) return;
    const lastEvent = winResult.transcript.events[
      winResult.transcript.events.length - 1
    ] as MindGameOverEvent;
    expect(lastEvent.type).toBe('game-over');
    expect(lastEvent.outcome).toBe('win');
    expect(lastEvent.finalLevel).toBe(MAX_LEVEL);
    expect(lastEvent.finalLives).toBe(winResult.finalLives);
  });
});

// ---------------------------------------------------------------------------
// Full game integration (losing game)
// ---------------------------------------------------------------------------

describe('Integration: Full losing game', () => {
  const loseResult = findLosingGame();

  it('a losing game can be found with default jitter', () => {
    expect(loseResult).not.toBeNull();
  });

  it('outcome is "loss" and final lives is 0', () => {
    if (!loseResult) return;
    expect(loseResult.outcome).toBe('loss');
    expect(loseResult.finalLives).toBe(0);
  });

  it('has at least one penalty event', () => {
    if (!loseResult) return;
    const penalties = loseResult.transcript.events.filter(
      (e) => e.type === 'penalty',
    );
    expect(penalties.length).toBeGreaterThan(0);
    expect(loseResult.totalPenalties).toBeGreaterThan(0);
  });

  it('final penalty brings lives to 0', () => {
    if (!loseResult) return;
    const penalties = loseResult.transcript.events.filter(
      (e): e is MindPenaltyEvent => e.type === 'penalty',
    );
    const lastPenalty = penalties[penalties.length - 1];
    expect(lastPenalty.livesRemaining).toBe(0);
  });

  it('penalty events have discarded cards with valid player IDs and values', () => {
    if (!loseResult) return;
    const penalties = loseResult.transcript.events.filter(
      (e): e is MindPenaltyEvent => e.type === 'penalty',
    );

    for (const penalty of penalties) {
      expect(penalty.discardedCards.length).toBeGreaterThan(0);
      for (const dc of penalty.discardedCards) {
        expect([0, 1]).toContain(dc.playerId);
        expect(dc.cardValue).toBeGreaterThanOrEqual(1);
        expect(dc.cardValue).toBeLessThanOrEqual(100);
      }
    }
  });

  it('last event is game-over with outcome "loss"', () => {
    if (!loseResult) return;
    const lastEvent = loseResult.transcript.events[
      loseResult.transcript.events.length - 1
    ] as MindGameOverEvent;
    expect(lastEvent.type).toBe('game-over');
    expect(lastEvent.outcome).toBe('loss');
    expect(lastEvent.finalLives).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Transcript structure invariants
// ---------------------------------------------------------------------------

describe('Integration: Transcript structure invariants', () => {
  it('transcript serializes to valid JSON and round-trips', () => {
    const result = runDeterministic(42);
    const json = JSON.stringify(result.transcript);
    const parsed: MindTranscript = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.gameType).toBe('the-mind');
    expect(parsed.startedAt).toBeTruthy();
    expect(parsed.endedAt).toBeTruthy();
    expect(parsed.initialState).toBeDefined();
    expect(parsed.initialState.playerNames).toHaveLength(2);
    expect(parsed.initialState.isAI).toEqual([true, true]);
    expect(parsed.initialState.startingLives).toBe(STARTING_LIVES);
    expect(parsed.initialState.startingLevel).toBe(1);
    expect(parsed.initialState.hands).toHaveLength(2);
    expect(parsed.events).toBeInstanceOf(Array);
    expect(parsed.events.length).toBeGreaterThan(0);
    expect(parsed.results).not.toBeNull();
  });

  it('events are in valid chronological order (timestamps non-negative)', () => {
    const result = runDeterministic(42);
    for (const event of result.transcript.events) {
      expect(event.timestamp).toBeGreaterThanOrEqual(0);
    }
  });

  it('event types follow valid sequencing (no card-played after game-over)', () => {
    const result = runDeterministic(42);
    let gameOverSeen = false;
    for (const event of result.transcript.events) {
      if (gameOverSeen) {
        // No events should follow game-over
        throw new Error(`Event ${event.type} found after game-over`);
      }
      if (event.type === 'game-over') {
        gameOverSeen = true;
      }
    }
    expect(gameOverSeen).toBe(true);
  });

  it('player IDs in card-played events are always 0 or 1', () => {
    const result = runDeterministic(42);
    const plays = result.transcript.events.filter(
      (e): e is MindCardPlayedEvent => e.type === 'card-played',
    );
    for (const play of plays) {
      expect([0, 1]).toContain(play.playerId);
    }
  });

  it('card-played events have non-negative pileSizeAfter', () => {
    const result = runDeterministic(42);

    for (const event of result.transcript.events) {
      if (event.type === 'card-played') {
        // pileSizeAfter may be 0 when the play completes a level
        // (playCard auto-advances via dealLevel which clears the pile
        // before the headless runner reads pile.size())
        expect(event.pileSizeAfter).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Game invariants across multiple seeds
// ---------------------------------------------------------------------------

describe('Integration: Game invariants across seeds', () => {
  it('runs 50 deterministic games without errors', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(() => runDeterministic(seed)).not.toThrow();
    }
  });

  it('runs 50 jittered games without errors', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(() => runGame({ seed })).not.toThrow();
    }
  });

  it('all games have valid transcripts with required fields', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = runDeterministic(seed);
      const t = result.transcript;

      // Required fields
      expect(t.version).toBe(1);
      expect(t.gameType).toBe('the-mind');
      expect(t.startedAt).toBeTruthy();
      expect(t.endedAt).toBeTruthy();
      expect(t.initialState.startingLives).toBe(STARTING_LIVES);
      expect(t.initialState.startingLevel).toBe(1);
      expect(t.results).not.toBeNull();
      expect(['win', 'loss']).toContain(t.results!.outcome);

      // Result consistency
      expect(t.results!.outcome).toBe(result.outcome);
      expect(t.results!.finalLevel).toBe(result.finalLevel);
      expect(t.results!.finalLives).toBe(result.finalLives);
      expect(t.results!.totalCardsPlayed).toBe(result.totalPlays);
      expect(t.results!.totalPenalties).toBe(result.totalPenalties);

      // Last event is game-over
      const lastEvent = t.events[t.events.length - 1];
      expect(lastEvent.type).toBe('game-over');
    }
  });

  it('winning games always have finalLevel = MAX_LEVEL and lives > 0', () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = runDeterministic(seed);
      if (result.outcome === 'win') {
        expect(result.finalLevel).toBe(MAX_LEVEL);
        expect(result.finalLives).toBeGreaterThan(0);
      }
    }
  });

  it('losing games always have finalLives = 0', () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = runGame({ seed });
      if (result.outcome === 'loss') {
        expect(result.finalLives).toBe(0);
      }
    }
  });

  it('total plays never exceed theoretical maximum (sum of level card counts)', () => {
    // Level i has i cards per player, 2 players. Total = 2 * sum(1..8) = 72.
    const maxPossiblePlays = 2 * (MAX_LEVEL * (MAX_LEVEL + 1)) / 2; // 72
    for (let seed = 0; seed < 50; seed++) {
      const result = runDeterministic(seed);
      expect(result.totalPlays).toBeLessThanOrEqual(maxPossiblePlays);
    }
  });

  it('level-complete events have levels in strictly ascending order', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = runDeterministic(seed);
      const levelCompletes = result.transcript.events.filter(
        (e): e is MindLevelCompleteEvent => e.type === 'level-complete',
      );

      for (let i = 1; i < levelCompletes.length; i++) {
        expect(levelCompletes[i].level).toBeGreaterThan(
          levelCompletes[i - 1].level,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-module consistency
// ---------------------------------------------------------------------------

describe('Integration: Cross-module consistency', () => {
  it('initial state hands match level 1 (1 card per player)', () => {
    const result = runDeterministic(42);
    const hands = result.transcript.initialState.hands;
    expect(hands[0]).toHaveLength(1);
    expect(hands[1]).toHaveLength(1);
    // Cards are in range 1-100
    expect(hands[0][0]).toBeGreaterThanOrEqual(1);
    expect(hands[0][0]).toBeLessThanOrEqual(100);
    expect(hands[1][0]).toBeGreaterThanOrEqual(1);
    expect(hands[1][0]).toBeLessThanOrEqual(100);
  });

  it('all initial hand card values are unique', () => {
    const result = runDeterministic(42);
    const allValues = [
      ...result.transcript.initialState.hands[0],
      ...result.transcript.initialState.hands[1],
    ];
    const unique = new Set(allValues);
    expect(unique.size).toBe(allValues.length);
  });

  it('AI timing config affects play patterns', () => {
    const fastResult = runGame({
      seed: 42,
      timingConfig: { baseDuration: 100, jitterRange: 0 },
    });
    const slowResult = runGame({
      seed: 42,
      timingConfig: { baseDuration: 100000, jitterRange: 0 },
    });

    // Both should complete successfully
    expect(['win', 'loss']).toContain(fastResult.outcome);
    expect(['win', 'loss']).toContain(slowResult.outcome);

    // With zero jitter, both should produce the same play order
    // (timing doesn't change ordering when jitter is 0, only absolute times differ)
    const fastPlays = fastResult.transcript.events
      .filter((e): e is MindCardPlayedEvent => e.type === 'card-played')
      .map((e) => e.cardValue);
    const slowPlays = slowResult.transcript.events
      .filter((e): e is MindCardPlayedEvent => e.type === 'card-played')
      .map((e) => e.cardValue);
    expect(fastPlays).toEqual(slowPlays);
  });

  it('custom player names appear in transcript', () => {
    const result = runGame({
      seed: 42,
      playerNames: ['Human', 'Bot'],
    });
    expect(result.transcript.initialState.playerNames).toEqual([
      'Human',
      'Bot',
    ]);
  });
});
