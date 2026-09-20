/**
 * Main Street: Calendar save/load + transcript persistence
 * (CG-0MTT0K9RX0004QTE / Feature 6)
 *
 * Covers the persistence acceptance criteria for the annual calendar:
 * - `week`/`year` round-trip through serialize/deserialize (AC1/AC3)
 * - legacy checkpoints without calendar fields migrate gracefully (AC2/AC3)
 * - transcript events are stamped with the in-game week/year (AC4), including
 *   the 52→1 wrap and year increment.
 *
 * @module tests/main-street/CalendarSaveLoad
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetSerializedState,
} from '../../example-games/main-street/MainStreetState';
import {
  MainStreetTranscriptRecorder,
  setMainStreetRecorder,
  recordMainStreetEvent,
} from '../../example-games/main-street/MainStreetTranscript';

describe('Calendar save/load round-trip (Feature 6 AC1/AC3)', () => {
  it('persists week/year through serialize/deserialize', () => {
    const state = setupMainStreetGame({ seed: 'cal-saveload-1' });
    state.week = 44;
    state.year = 7;

    const serialized = serializeMainStreetState(state);
    expect(serialized.week).toBe(44);
    expect(serialized.year).toBe(7);

    const restored = deserializeMainStreetState(serialized);
    expect(restored.week).toBe(44);
    expect(restored.year).toBe(7);
  });

  it('migrates a legacy save missing week/year to valid defaults', () => {
    const state = setupMainStreetGame({ seed: 'cal-saveload-legacy' });
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;

    // Simulate a pre-calendar checkpoint: strip the calendar fields.
    delete serialized.week;
    delete serialized.year;

    const restored = deserializeMainStreetState(serialized as unknown as MainStreetSerializedState);
    // Migration must produce a valid week (1–52) and year (>= 1) — never NaN/undefined.
    expect(Number.isInteger(restored.week)).toBe(true);
    expect(restored.week).toBeGreaterThanOrEqual(1);
    expect(restored.week).toBeLessThanOrEqual(52);
    expect(restored.year).toBeGreaterThanOrEqual(1);
  });
});

describe('Transcript week/year stamping (Feature 6 AC4)', () => {
  it('stamps recorded events with the week/year derived from the turn', () => {
    const initialSnapshot = { seed: 'cal-transcript', snapshotAtTurn: 1, week: 12, year: 3 };
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    recordMainStreetEvent({ type: 'info', turn: 1, message: 'a' });
    recordMainStreetEvent({ type: 'info', turn: 2, message: 'b' });
    recordMainStreetEvent({ type: 'info', turn: 3, message: 'c' });

    const events = recorder.getTranscript().events;
    expect(events.map((e: any) => e.week)).toEqual([12, 13, 14]);
    expect(events.map((e: any) => e.year)).toEqual([3, 3, 3]);
  });

  it('wraps week 52→1 and increments the year across the turn boundary', () => {
    const initialSnapshot = { seed: 'cal-transcript-wrap', snapshotAtTurn: 1, week: 51, year: 2 };
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    recordMainStreetEvent({ type: 'info', turn: 1, message: 'a' }); // week 51, year 2
    recordMainStreetEvent({ type: 'info', turn: 2, message: 'b' }); // week 52, year 2
    recordMainStreetEvent({ type: 'info', turn: 3, message: 'c' }); // week 1, year 3

    const events = recorder.getTranscript().events;
    expect(events.map((e: any) => e.week)).toEqual([51, 52, 1]);
    expect(events.map((e: any) => e.year)).toEqual([2, 2, 3]);
  });

  it('defaults to week 1 / year 1 when the snapshot omits calendar fields (legacy)', () => {
    const recorder = new MainStreetTranscriptRecorder({ seed: 'legacy', snapshotAtTurn: 1 });
    setMainStreetRecorder(recorder);

    recordMainStreetEvent({ type: 'info', turn: 1, message: 'a' });
    recordMainStreetEvent({ type: 'info', turn: 2, message: 'b' });

    const events = recorder.getTranscript().events;
    expect(events.map((e: any) => e.week)).toEqual([1, 2]);
    expect(events.map((e: any) => e.year)).toEqual([1, 1]);
  });
});
