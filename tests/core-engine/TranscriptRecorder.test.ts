/**
 * Unit tests for the shared TranscriptRecorderBase class and
 * BaseTranscript interface from src/core-engine/TranscriptRecorder.
 */

import { describe, it, expect } from 'vitest';
import {
  TranscriptRecorderBase,
  type BaseTranscript,
} from '../../src/core-engine/TranscriptRecorder';

// ── Test fixtures ──────────────────────────────────────────

/** Simple board state for tests. */
interface TestState {
  board: string[];
}

/** Simple event for tests. */
interface TestEvent {
  action: string;
  value: number;
}

/** Simple result for tests. */
interface TestResult {
  winner: string;
  score: number;
}

/** Concrete transcript type using BaseTranscript. */
type TestTranscript = BaseTranscript<TestState, TestEvent, TestResult>;

/** Concrete recorder subclass for tests. */
class TestRecorder extends TranscriptRecorderBase<TestTranscript> {
  constructor(gameType = 'test-game', initialState?: TestState) {
    super({
      version: 1,
      gameType,
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: initialState ?? { board: ['a', 'b', 'c'] },
      events: [],
      results: null,
    });
  }

  /** Expose addEvent for testing. */
  addEvent(event: TestEvent): void {
    this.transcript.events.push(event);
  }

  /** Expose finalize for testing. */
  finalize(winner: string, score: number): TestTranscript {
    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = { winner, score };
    return this.getTranscript();
  }
}

/**
 * A custom transcript type that does NOT extend BaseTranscript,
 * demonstrating that the base class works with any shape.
 */
interface CustomTranscript {
  version: 1;
  game: string;
  metadata: { startedAt: string; endedAt: string };
  turns: Array<{ move: string }>;
  result: { outcome: string } | null;
}

/** Recorder for the custom transcript shape. */
class CustomRecorder extends TranscriptRecorderBase<CustomTranscript> {
  constructor() {
    super({
      version: 1,
      game: 'custom-game',
      metadata: {
        startedAt: new Date().toISOString(),
        endedAt: '',
      },
      turns: [],
      result: null,
    });
  }

  recordTurn(move: string): void {
    this.transcript.turns.push({ move });
  }

  finalize(outcome: string): CustomTranscript {
    this.transcript.metadata.endedAt = new Date().toISOString();
    this.transcript.result = { outcome };
    return this.getTranscript();
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('TranscriptRecorderBase', () => {
  describe('constructor', () => {
    it('should store the provided transcript', () => {
      const recorder = new TestRecorder('my-game');
      const t = recorder.getTranscript();
      expect(t.version).toBe(1);
      expect(t.gameType).toBe('my-game');
    });

    it('should initialize with empty events and null results', () => {
      const recorder = new TestRecorder();
      const t = recorder.getTranscript();
      expect(t.events).toEqual([]);
      expect(t.results).toBeNull();
    });

    it('should capture the initial state', () => {
      const state: TestState = { board: ['x', 'y'] };
      const recorder = new TestRecorder('game', state);
      expect(recorder.getTranscript().initialState).toEqual({
        board: ['x', 'y'],
      });
    });

    it('should set startedAt to a valid ISO timestamp', () => {
      const recorder = new TestRecorder();
      const t = recorder.getTranscript();
      expect(t.startedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it('should set endedAt to empty string', () => {
      const recorder = new TestRecorder();
      expect(recorder.getTranscript().endedAt).toBe('');
    });
  });

  describe('getTranscript()', () => {
    it('should return the same object on repeated calls', () => {
      const recorder = new TestRecorder();
      const t1 = recorder.getTranscript();
      const t2 = recorder.getTranscript();
      expect(t1).toBe(t2);
    });

    it('should reflect events added after construction', () => {
      const recorder = new TestRecorder();
      recorder.addEvent({ action: 'move', value: 42 });
      const t = recorder.getTranscript();
      expect(t.events).toHaveLength(1);
      expect(t.events[0]).toEqual({ action: 'move', value: 42 });
    });
  });

  describe('finalize() pattern', () => {
    it('should set results and endedAt', () => {
      const recorder = new TestRecorder();
      recorder.addEvent({ action: 'play', value: 1 });
      const t = recorder.finalize('Alice', 100);

      expect(t.results).toEqual({ winner: 'Alice', score: 100 });
      expect(t.endedAt).not.toBe('');
    });

    it('should return the same transcript object', () => {
      const recorder = new TestRecorder();
      const finalized = recorder.finalize('Bob', 50);
      expect(finalized).toBe(recorder.getTranscript());
    });

    it('should preserve events recorded before finalization', () => {
      const recorder = new TestRecorder();
      recorder.addEvent({ action: 'a', value: 1 });
      recorder.addEvent({ action: 'b', value: 2 });
      recorder.addEvent({ action: 'c', value: 3 });
      const t = recorder.finalize('Charlie', 75);

      expect(t.events).toHaveLength(3);
      expect(t.events.map((e) => e.action)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('BaseTranscript type conformance', () => {
    it('should satisfy BaseTranscript shape', () => {
      const recorder = new TestRecorder('conformance-test');
      const t: BaseTranscript<TestState, TestEvent, TestResult> =
        recorder.getTranscript();

      expect(t.version).toBe(1);
      expect(t.gameType).toBe('conformance-test');
      expect(typeof t.startedAt).toBe('string');
      expect(t.endedAt).toBe('');
      expect(t.initialState).toBeDefined();
      expect(Array.isArray(t.events)).toBe(true);
      expect(t.results).toBeNull();
    });
  });

  describe('serialization round-trip', () => {
    it('should produce JSON-serializable transcripts', () => {
      const recorder = new TestRecorder();
      recorder.addEvent({ action: 'draw', value: 5 });
      recorder.finalize('Dana', 42);

      const json = JSON.stringify(recorder.getTranscript());
      const parsed = JSON.parse(json) as TestTranscript;

      expect(parsed.version).toBe(1);
      expect(parsed.gameType).toBe('test-game');
      expect(parsed.events).toHaveLength(1);
      expect(parsed.results).toEqual({ winner: 'Dana', score: 42 });
    });
  });
});

describe('custom transcript shape (non-BaseTranscript)', () => {
  it('should work with a transcript type that does not extend BaseTranscript', () => {
    const recorder = new CustomRecorder();
    const t = recorder.getTranscript();
    expect(t.version).toBe(1);
    expect(t.game).toBe('custom-game');
    expect(t.turns).toEqual([]);
    expect(t.result).toBeNull();
  });

  it('should record turns into the custom shape', () => {
    const recorder = new CustomRecorder();
    recorder.recordTurn('draw');
    recorder.recordTurn('play');
    const t = recorder.getTranscript();
    expect(t.turns).toHaveLength(2);
    expect(t.turns[0].move).toBe('draw');
    expect(t.turns[1].move).toBe('play');
  });

  it('should finalize with the custom shape', () => {
    const recorder = new CustomRecorder();
    recorder.recordTurn('draw');
    const t = recorder.finalize('win');
    expect(t.result).toEqual({ outcome: 'win' });
    expect(t.metadata.endedAt).not.toBe('');
  });
});

describe('barrel exports', () => {
  it('should export TranscriptRecorderBase from core-engine index', async () => {
    const mod = await import('../../src/core-engine/index');
    expect(mod.TranscriptRecorderBase).toBeDefined();
    expect(typeof mod.TranscriptRecorderBase).toBe('function');
  });
});
