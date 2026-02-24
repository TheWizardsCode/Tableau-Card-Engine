import { describe, it, expect, beforeEach } from 'vitest';
import {
  type MindTranscript,
  type MindInitialState,
  type MindCardPlayedEvent,
  type MindPenaltyEvent,
  type MindLevelCompleteEvent,
  type MindGameOverEvent,
  MindTranscriptRecorder,
} from '../../example-games/the-mind/GameTranscript';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a standard initial state for tests. */
function createTestInitialState(): MindInitialState {
  return {
    playerNames: ['Player', 'AI'],
    isAI: [false, true],
    startingLives: 2,
    startingLevel: 1,
    hands: [[15], [42]],
  };
}

// ---------------------------------------------------------------------------
// MindTranscriptRecorder
// ---------------------------------------------------------------------------

describe('MindTranscriptRecorder', () => {
  let recorder: MindTranscriptRecorder;
  let initialState: MindInitialState;

  beforeEach(() => {
    initialState = createTestInitialState();
    recorder = new MindTranscriptRecorder(initialState);
  });

  describe('construction', () => {
    it('creates a transcript with version 1', () => {
      const t = recorder.getTranscript();
      expect(t.version).toBe(1);
    });

    it('creates a transcript with gameType "the-mind"', () => {
      const t = recorder.getTranscript();
      expect(t.gameType).toBe('the-mind');
    });

    it('sets startedAt to a valid ISO 8601 timestamp', () => {
      const t = recorder.getTranscript();
      expect(t.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('sets endedAt to empty string initially', () => {
      const t = recorder.getTranscript();
      expect(t.endedAt).toBe('');
    });

    it('stores the initial state', () => {
      const t = recorder.getTranscript();
      expect(t.initialState).toBe(initialState);
      expect(t.initialState.playerNames).toEqual(['Player', 'AI']);
      expect(t.initialState.isAI).toEqual([false, true]);
      expect(t.initialState.startingLives).toBe(2);
      expect(t.initialState.startingLevel).toBe(1);
      expect(t.initialState.hands).toEqual([[15], [42]]);
    });

    it('starts with empty events array', () => {
      const t = recorder.getTranscript();
      expect(t.events).toEqual([]);
    });

    it('starts with null results', () => {
      const t = recorder.getTranscript();
      expect(t.results).toBeNull();
    });

    it('is not sealed initially', () => {
      expect(recorder.isSealed()).toBe(false);
    });
  });

  describe('recordCardPlay', () => {
    it('adds a card-played event', () => {
      recorder.recordCardPlay(100, 0, 15, 15, 1);
      const events = recorder.getTranscript().events;
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('card-played');
    });

    it('records all card play fields correctly', () => {
      recorder.recordCardPlay(250, 1, 42, 42, 2);
      const event = recorder.getTranscript().events[0] as MindCardPlayedEvent;
      expect(event.timestamp).toBe(250);
      expect(event.playerId).toBe(1);
      expect(event.cardValue).toBe(42);
      expect(event.pileTopAfter).toBe(42);
      expect(event.pileSizeAfter).toBe(2);
    });

    it('records multiple card plays in order', () => {
      recorder.recordCardPlay(100, 0, 15, 15, 1);
      recorder.recordCardPlay(200, 1, 42, 42, 2);
      recorder.recordCardPlay(350, 0, 55, 55, 3);

      const events = recorder.getTranscript().events;
      expect(events).toHaveLength(3);
      expect((events[0] as MindCardPlayedEvent).cardValue).toBe(15);
      expect((events[1] as MindCardPlayedEvent).cardValue).toBe(42);
      expect((events[2] as MindCardPlayedEvent).cardValue).toBe(55);
    });
  });

  describe('recordPenalty', () => {
    it('adds a penalty event', () => {
      recorder.recordPenalty(150, 1, [{ playerId: 0, cardValue: 10 }]);
      const events = recorder.getTranscript().events;
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('penalty');
    });

    it('records all penalty fields correctly', () => {
      const discarded = [
        { playerId: 0 as const, cardValue: 5 },
        { playerId: 1 as const, cardValue: 8 },
      ];
      recorder.recordPenalty(300, 1, discarded);

      const event = recorder.getTranscript().events[0] as MindPenaltyEvent;
      expect(event.timestamp).toBe(300);
      expect(event.livesRemaining).toBe(1);
      expect(event.discardedCards).toEqual(discarded);
    });

    it('records empty discarded cards array', () => {
      recorder.recordPenalty(100, 2, []);
      const event = recorder.getTranscript().events[0] as MindPenaltyEvent;
      expect(event.discardedCards).toEqual([]);
    });
  });

  describe('recordLevelComplete', () => {
    it('adds a level-complete event', () => {
      recorder.recordLevelComplete(500, 1, false, 2);
      const events = recorder.getTranscript().events;
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('level-complete');
    });

    it('records level completion without bonus life', () => {
      recorder.recordLevelComplete(800, 2, false, 2);
      const event = recorder.getTranscript()
        .events[0] as MindLevelCompleteEvent;
      expect(event.timestamp).toBe(800);
      expect(event.level).toBe(2);
      expect(event.bonusLifeAwarded).toBe(false);
      expect(event.livesAfter).toBe(2);
    });

    it('records level completion with bonus life', () => {
      recorder.recordLevelComplete(1200, 3, true, 3);
      const event = recorder.getTranscript()
        .events[0] as MindLevelCompleteEvent;
      expect(event.level).toBe(3);
      expect(event.bonusLifeAwarded).toBe(true);
      expect(event.livesAfter).toBe(3);
    });
  });

  describe('finalize', () => {
    it('adds a game-over event', () => {
      const t = recorder.finalize(1000, 'win', 8, 2);
      const lastEvent = t.events[t.events.length - 1];
      expect(lastEvent.type).toBe('game-over');
    });

    it('records win outcome correctly', () => {
      const t = recorder.finalize(5000, 'win', 8, 3);
      const event = t.events[t.events.length - 1] as MindGameOverEvent;
      expect(event.outcome).toBe('win');
      expect(event.finalLevel).toBe(8);
      expect(event.finalLives).toBe(3);
      expect(event.timestamp).toBe(5000);
    });

    it('records loss outcome correctly', () => {
      const t = recorder.finalize(2000, 'loss', 4, 0);
      const event = t.events[t.events.length - 1] as MindGameOverEvent;
      expect(event.outcome).toBe('loss');
      expect(event.finalLevel).toBe(4);
      expect(event.finalLives).toBe(0);
    });

    it('sets endedAt to a valid ISO 8601 timestamp', () => {
      const t = recorder.finalize(1000, 'win', 8, 2);
      expect(t.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(t.endedAt).not.toBe('');
    });

    it('sets results with correct totals', () => {
      recorder.recordCardPlay(100, 0, 15, 15, 1);
      recorder.recordCardPlay(200, 1, 42, 42, 2);
      recorder.recordPenalty(150, 1, [{ playerId: 0, cardValue: 10 }]);

      const t = recorder.finalize(1000, 'loss', 1, 0);

      expect(t.results).not.toBeNull();
      expect(t.results!.outcome).toBe('loss');
      expect(t.results!.finalLevel).toBe(1);
      expect(t.results!.finalLives).toBe(0);
      expect(t.results!.totalCardsPlayed).toBe(2);
      expect(t.results!.totalPenalties).toBe(1);
    });

    it('seals the transcript', () => {
      recorder.finalize(1000, 'win', 8, 2);
      expect(recorder.isSealed()).toBe(true);
    });

    it('returns the same transcript on repeated calls', () => {
      const t1 = recorder.finalize(1000, 'win', 8, 2);
      const t2 = recorder.finalize(9999, 'loss', 1, 0);
      expect(t1).toBe(t2);
      // The second finalize is a no-op — original values preserved
      expect(t1.results!.outcome).toBe('win');
    });
  });

  describe('sealed behavior', () => {
    it('recordCardPlay is a no-op after finalize', () => {
      recorder.finalize(1000, 'win', 8, 2);
      const eventsBefore = recorder.getTranscript().events.length;

      recorder.recordCardPlay(2000, 0, 50, 50, 1);
      expect(recorder.getTranscript().events.length).toBe(eventsBefore);
    });

    it('recordPenalty is a no-op after finalize', () => {
      recorder.finalize(1000, 'win', 8, 2);
      const eventsBefore = recorder.getTranscript().events.length;

      recorder.recordPenalty(2000, 1, []);
      expect(recorder.getTranscript().events.length).toBe(eventsBefore);
    });

    it('recordLevelComplete is a no-op after finalize', () => {
      recorder.finalize(1000, 'win', 8, 2);
      const eventsBefore = recorder.getTranscript().events.length;

      recorder.recordLevelComplete(2000, 5, false, 2);
      expect(recorder.getTranscript().events.length).toBe(eventsBefore);
    });
  });

  describe('JSON serialization', () => {
    it('transcript is serializable to JSON (no circular references)', () => {
      recorder.recordCardPlay(100, 0, 15, 15, 1);
      recorder.recordPenalty(150, 1, [{ playerId: 1, cardValue: 8 }]);
      recorder.recordLevelComplete(500, 1, false, 1);
      const t = recorder.finalize(600, 'loss', 2, 0);

      const json = JSON.stringify(t);
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json) as MindTranscript;
      expect(parsed.version).toBe(1);
      expect(parsed.gameType).toBe('the-mind');
      expect(parsed.events).toHaveLength(4); // play + penalty + level + game-over
      expect(parsed.results).not.toBeNull();
    });

    it('round-trips through JSON without data loss', () => {
      recorder.recordCardPlay(100, 0, 15, 15, 1);
      recorder.recordCardPlay(200, 1, 42, 42, 2);
      recorder.recordPenalty(150, 1, [
        { playerId: 0, cardValue: 5 },
        { playerId: 1, cardValue: 8 },
      ]);
      recorder.recordLevelComplete(500, 1, false, 1);
      const t = recorder.finalize(600, 'win', 8, 2);

      const parsed = JSON.parse(JSON.stringify(t)) as MindTranscript;

      expect(parsed.initialState.playerNames).toEqual(['Player', 'AI']);
      expect(parsed.events).toHaveLength(5);
      expect(parsed.results!.totalCardsPlayed).toBe(2);
      expect(parsed.results!.totalPenalties).toBe(1);
    });
  });

  // ── Complete multi-level game transcript ──

  describe('complete multi-level game transcript', () => {
    it('records a full 3-level game with penalties and bonus life', () => {
      // Level 1: Both players play successfully
      recorder.recordCardPlay(100, 0, 15, 15, 1);
      recorder.recordCardPlay(300, 1, 42, 42, 2);
      recorder.recordLevelComplete(300, 1, false, 2);

      // Level 2: AI plays out of order, penalty
      recorder.recordCardPlay(100, 1, 30, 30, 1);
      recorder.recordPenalty(100, 1, [{ playerId: 0, cardValue: 20 }]);
      recorder.recordCardPlay(200, 0, 55, 55, 2);
      recorder.recordCardPlay(400, 1, 60, 60, 3);
      recorder.recordCardPlay(500, 0, 80, 80, 4);
      recorder.recordLevelComplete(500, 2, false, 1);

      // Level 3: Clean play, bonus life
      recorder.recordCardPlay(200, 0, 10, 10, 1);
      recorder.recordCardPlay(300, 1, 25, 25, 2);
      recorder.recordCardPlay(500, 0, 45, 45, 3);
      recorder.recordCardPlay(600, 1, 70, 70, 4);
      recorder.recordCardPlay(800, 0, 88, 88, 5);
      recorder.recordCardPlay(900, 1, 95, 95, 6);
      recorder.recordLevelComplete(900, 3, true, 2);

      // Game continues but let's finalize as a loss at level 4
      recorder.recordCardPlay(100, 1, 50, 50, 1);
      recorder.recordPenalty(100, 0, [
        { playerId: 0, cardValue: 12 },
        { playerId: 0, cardValue: 35 },
      ]);

      const t = recorder.finalize(200, 'loss', 4, 0);

      // Verify structure
      expect(t.version).toBe(1);
      expect(t.gameType).toBe('the-mind');
      expect(t.events).toHaveLength(
        // Level 1: 2 plays + 1 level-complete = 3
        // Level 2: 4 plays + 1 penalty + 1 level-complete = 6
        // Level 3: 6 plays + 1 level-complete = 7
        // Level 4: 1 play + 1 penalty + 1 game-over = 3
        3 + 6 + 7 + 3,
      );

      // Verify event types in order
      const types = t.events.map((e) => e.type);
      expect(types[0]).toBe('card-played');
      expect(types[1]).toBe('card-played');
      expect(types[2]).toBe('level-complete');

      // Verify penalties
      const penalties = t.events.filter(
        (e): e is MindPenaltyEvent => e.type === 'penalty',
      );
      expect(penalties).toHaveLength(2);
      expect(penalties[0].livesRemaining).toBe(1);
      expect(penalties[0].discardedCards).toHaveLength(1);
      expect(penalties[1].livesRemaining).toBe(0);
      expect(penalties[1].discardedCards).toHaveLength(2);

      // Verify level completions
      const levelCompletes = t.events.filter(
        (e): e is MindLevelCompleteEvent => e.type === 'level-complete',
      );
      expect(levelCompletes).toHaveLength(3);
      expect(levelCompletes[0].level).toBe(1);
      expect(levelCompletes[0].bonusLifeAwarded).toBe(false);
      expect(levelCompletes[1].level).toBe(2);
      expect(levelCompletes[2].level).toBe(3);
      expect(levelCompletes[2].bonusLifeAwarded).toBe(true);
      expect(levelCompletes[2].livesAfter).toBe(2);

      // Verify game-over
      const gameOver = t.events[t.events.length - 1] as MindGameOverEvent;
      expect(gameOver.type).toBe('game-over');
      expect(gameOver.outcome).toBe('loss');
      expect(gameOver.finalLevel).toBe(4);
      expect(gameOver.finalLives).toBe(0);

      // Verify results
      expect(t.results!.outcome).toBe('loss');
      expect(t.results!.finalLevel).toBe(4);
      expect(t.results!.totalCardsPlayed).toBe(13);
      expect(t.results!.totalPenalties).toBe(2);

      // Verify JSON-serializable
      expect(() => JSON.stringify(t)).not.toThrow();
    });
  });

  describe('getTranscript', () => {
    it('returns the same object reference (no defensive copy)', () => {
      const t1 = recorder.getTranscript();
      const t2 = recorder.getTranscript();
      expect(t1).toBe(t2);
    });

    it('reflects events added after getTranscript was called', () => {
      const t = recorder.getTranscript();
      expect(t.events).toHaveLength(0);

      recorder.recordCardPlay(100, 0, 15, 15, 1);
      expect(t.events).toHaveLength(1);
    });
  });
});
