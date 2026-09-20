import { TranscriptRecorderBase } from '../../src/core-engine/transcript';

// Minimal transcript event types for Main Street
export type PlayerActionDescriptor = { type: string; [k: string]: any };

export type MainStreetTranscriptEvent = (
  | { type: 'action'; turn: number; action: PlayerActionDescriptor; description?: string }
  | { type: 'ai-action'; turn: number; strategy: string; action: PlayerActionDescriptor }
  | { type: 'hint'; turn: number; recommendedAction: PlayerActionDescriptor; rationale: string }
  | { type: 'undo'; turn: number; reversedAction: { description?: string; [k: string]: any } }
  | { type: 'redo'; turn: number; reappliedAction: { description?: string; [k: string]: any } }
  | { type: 'turn-end'; turn: number }
  | { type: 'game-end'; turn: number; finalScore: number; result?: any }
  | { type: 'info'; turn: number; message: string }
  | { type: 'active-effect'; turn: number; effectType: string; sourceEventId: string; duration: number; description: string }
  | {
      type: 'event-choice';
      turn: number;
      eventId: string;
      cardName: string;
      option: 'accept' | 'reject';
      acceptNextCardId: string | null;
      rejectNextCardId: string | null;
    }
) & { week?: number; year?: number };

/**
 * Calendar stamp attached to every recorded transcript event by
 * `MainStreetTranscriptRecorder` (CG-0MTT0K9RX0004QTE, Feature 6 AC4).
 *
 * `week` is 1–52 and `year` is ≥1; both are derived deterministically from
 * the event's `turn` and the transcript's initial calendar, so a replay can
 * reconstruct the in-game week/year for any event without extra bookkeeping.
 */
export interface MainStreetCalendarStamp {
  week: number;
  year: number;
}

export interface MainStreetTranscript {
  version: number;
  gameType: string;
  startedAt: string;
  endedAt: string | null;
  initialState: any;
  events: MainStreetTranscriptEvent[];
  results: any | null;
}

/** Recorder implementation for Main Street transcripts. */
export class MainStreetTranscriptRecorder extends TranscriptRecorderBase<MainStreetTranscript> {
  constructor(initialState: any) {
    super({
      version: 1,
      gameType: 'main-street',
      startedAt: new Date().toISOString(),
      endedAt: null,
      initialState,
      events: [],
      results: null,
    });
  }

  /**
   * Derives the in-game calendar (week/year) for an event at `turn`.
   *
   * Each turn advances exactly one week (wrapping 52→1 and incrementing the
   * year), so the value is reconstructed from the transcript's initial
   * calendar plus the turn offset — no per-call-site bookkeeping required.
   */
  private deriveCalendar(turn: number): MainStreetCalendarStamp {
    const init = (this.transcript.initialState ?? {}) as {
      week?: number;
      year?: number;
      turn?: number;
    };
    const startWeek = typeof init.week === 'number' ? init.week : 1;
    const startYear = typeof init.year === 'number' ? init.year : 1;
    const startTurn = typeof init.turn === 'number' ? init.turn : 1;
    const delta = Math.max(0, (turn ?? startTurn) - startTurn);
    const week = ((startWeek - 1 + delta) % 52) + 1;
    const year = startYear + Math.floor((startWeek - 1 + delta) / 52);
    return { week, year };
  }

  recordEvent(e: MainStreetTranscriptEvent): void {
    const { week, year } = this.deriveCalendar(e.turn);
    this.transcript.events.push({ ...e, week, year });
  }

  finalize(result: any): MainStreetTranscript {
    this.transcript.endedAt = new Date().toISOString();
    this.transcript.results = result;
    return this.getTranscript();
  }
}

// Global recorder (optional) — used by other modules to emit events without
// requiring explicit wiring of a recorder instance everywhere.
let globalRecorder: MainStreetTranscriptRecorder | null = null;

export function setMainStreetRecorder(r: MainStreetTranscriptRecorder | null): void {
  globalRecorder = r;
}

export function recordMainStreetEvent(e: MainStreetTranscriptEvent): void {
  if (!globalRecorder) return;
  try {
    globalRecorder.recordEvent(e);
  } catch (_) {
    // defensive: do not throw from recorder in non-critical paths
  }
}

/**
 * Finalize the global transcript and return it.
 *
 * Returns null if no recorder has been set (e.g. in headless tests).
 * The `result` parameter should be the game-end result object containing
 * at least `gameResult` and `finalScore`.
 */
export function finalizeMainStreetTranscript(result: {
  gameResult: string;
  finalScore: number;
  [k: string]: unknown;
}): MainStreetTranscript | null {
  if (!globalRecorder) return null;
  return globalRecorder.finalize(result);
}

/**
 * Get the current (possibly un-finalized) transcript from the global recorder.
 *
 * Returns null if no recorder has been set.
 */
export function getMainStreetTranscript(): MainStreetTranscript | null {
  return globalRecorder?.getTranscript() ?? null;
}
