/**
 * AiDecisionRecorder — Global singleton for capturing AI decision data.
 *
 * Game scenes push decision records after each AI turn. The overlay
 * displays the accumulated records. This design avoids modifying
 * existing AI strategy code — scenes call `record()` at integration
 * points without changing the strategy internals.
 *
 * @module @ui/debug/AiDecisionRecorder
 */

/** A single recorded AI decision with scoring breakdown. */
export interface AiDecisionRecord {
  /** Turn number (0-based). */
  turnNumber: number;
  /** Name of the AI player. */
  playerName: string;
  /** Name of the AI strategy (e.g., 'greedy', 'random'). */
  strategyName: string;
  /** Human-readable description of the chosen action. */
  chosenAction: string;
  /** Score values for the chosen action (key-value pairs). */
  scoringBreakdown?: Record<string, number>;
  /** Alternative actions considered with their scores. */
  alternatives?: Array<{ action: string; score: number }>;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

/**
 * Global singleton that accumulates AI decision records.
 *
 * Access via {@link AiDecisionRecorder.getInstance()}.
 */
export class AiDecisionRecorder {
  private static instance: AiDecisionRecorder | null = null;

  private _records: AiDecisionRecord[] = [];
  private _paused = false;

  private constructor() {
    // Singleton
  }

  /** Get or create the global recorder instance. */
  static getInstance(): AiDecisionRecorder {
    if (!AiDecisionRecorder.instance) {
      AiDecisionRecorder.instance = new AiDecisionRecorder();
    }
    return AiDecisionRecorder.instance;
  }

  /** Add a decision record. No-op when paused. */
  record(entry: AiDecisionRecord): void {
    if (this._paused) return;
    this._records.push(entry);
  }

  /** Get all accumulated records (read-only view). */
  getRecords(): readonly AiDecisionRecord[] {
    return this._records;
  }

  /** Remove all records. */
  clear(): void {
    this._records = [];
  }

  /** Whether new records are being accepted. */
  get paused(): boolean {
    return this._paused;
  }

  set paused(v: boolean) {
    this._paused = v;
  }
}
