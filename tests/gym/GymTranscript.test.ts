/**
 * Gym Transcript Recording scenario tests.
 *
 * Validates that:
 *  - TranscriptRecorderBase records events and captures metadata
 *  - Fixed-seed runs produce stable transcript structure
 *  - Transcript output matches expected schema
 */
import { describe, expect, it } from 'vitest';
import { TranscriptRecorderBase, createSeededRng } from '../../src/core-engine';
import type { BaseTranscript } from '../../src/core-engine';

/** Simple event shape for testing. */
interface TestEvent {
  type: string;
  value: number;
}

/** Simplified transcript for the Gym transcript demo. */
interface TestTranscript extends BaseTranscript<null, TestEvent, null> {}

class TestRecorder extends TranscriptRecorderBase<TestTranscript> {
  finalize(): TestTranscript {
    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = null;
    return this.getTranscript();
  }

  recordEvent(type: string, value: number): void {
    this.transcript.events.push({ type, value });
  }
}

describe('Gym Transcript Recording scenarios', () => {
  it('records events and captures metadata', () => {
    const recorder = new TestRecorder({
      version: 1,
      gameType: 'gym-transcript-test',
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '',
      initialState: null,
      events: [],
      results: null,
    });

    recorder.recordEvent('draw', 1);
    recorder.recordEvent('discard', 2);
    recorder.recordEvent('draw', 3);

    const t = recorder.getTranscript();
    expect(t.version).toBe(1);
    expect(t.gameType).toBe('gym-transcript-test');
    expect(t.events.length).toBe(3);
    expect(t.events[0]).toEqual({ type: 'draw', value: 1 });
    expect(t.events[1]).toEqual({ type: 'discard', value: 2 });
    expect(t.events[2]).toEqual({ type: 'draw', value: 3 });
  });

  it('finalize sets endedAt and returns snapshot', () => {
    const recorder = new TestRecorder({
      version: 1,
      gameType: 'gym-transcript-test',
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '',
      initialState: null,
      events: [],
      results: null,
    });

    recorder.recordEvent('shuffle', 0);
    const t = recorder.finalize();

    expect(t.endedAt).not.toBe('');
    expect(t.events.length).toBe(1);
  });

  it('deterministic RNG produces stable sequences', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());

    // Same seed must produce identical sequences
    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different transcripts', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    const vals1 = Array.from({ length: 10 }, () => rng1());
    const vals2 = Array.from({ length: 10 }, () => rng2());

    expect(vals1).not.toEqual(vals2);
  });
});