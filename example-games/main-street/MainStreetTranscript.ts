import { TranscriptRecorderBase } from '../../src/core-engine/transcript';

// Minimal transcript event types for Main Street
export type PlayerActionDescriptor = { type: string; [k: string]: any };

export type MainStreetTranscriptEvent =
  | { type: 'action'; turn: number; action: PlayerActionDescriptor; description?: string }
  | { type: 'ai-action'; turn: number; strategy: string; action: PlayerActionDescriptor }
  | { type: 'hint'; turn: number; recommendedAction: PlayerActionDescriptor; rationale: string }
  | { type: 'undo'; turn: number; reversedAction: { description?: string; [k: string]: any } }
  | { type: 'redo'; turn: number; reappliedAction: { description?: string; [k: string]: any } }
  | { type: 'turn-end'; turn: number }
  | { type: 'game-end'; turn: number; finalScore: number; result?: any }
  | { type: 'info'; turn: number; message: string };

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

  recordEvent(e: MainStreetTranscriptEvent): void {
    this.transcript.events.push(e as MainStreetTranscriptEvent);
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
