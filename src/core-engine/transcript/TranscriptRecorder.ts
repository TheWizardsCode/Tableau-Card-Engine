/**
 * Shared transcript recorder base types for the Tableau Card Engine.
 *
 * Provides a generic `BaseTranscript` interface (recommended shape for
 * new games) and an abstract `TranscriptRecorderBase<T>` class that all
 * game-specific transcript recorders extend.
 *
 * The base class eliminates the duplicated `getTranscript()` pattern
 * and provides a protected `transcript` field for subclass access.
 *
 * Game-specific recorders provide their own:
 *  - `recordTurn()` / `recordAction()` / `recordMove()` methods
 *  - `finalize()` implementation (sets end timestamp and results)
 *  - Board snapshot and card snapshot types
 *
 * @example
 * ```ts
 * interface MyTranscript extends BaseTranscript<MyState, MyEvent, MyResult> {
 *   // game-specific extras
 * }
 *
 * class MyRecorder extends TranscriptRecorderBase<MyTranscript> {
 *   constructor(session: MySession) {
 *     super({
 *       version: 1,
 *       gameType: 'my-game',
 *       startedAt: new Date().toISOString(),
 *       endedAt: '',
 *       initialState: snapshotBoard(session),
 *       events: [],
 *       results: null,
 *     });
 *   }
 *
 *   finalize(): MyTranscript {
 *     this.transcript.endedAt = new Date().toISOString();
 *     this.transcript.results = computeResults();
 *     return this.getTranscript();
 *   }
 * }
 * ```
 */

// ── Base transcript shape ──────────────────────────────────

/**
 * Recommended transcript shape for new games.
 *
 * Existing games may use slightly different field names or nesting
 * (e.g. `turns` instead of `events`, or `metadata.startedAt` instead
 * of flat `startedAt`).  This interface captures the canonical shape
 * that new games should follow.
 *
 * @typeParam TInitialState - Snapshot of the board before any moves
 * @typeParam TEvent - A single recorded event (turn, move, action, etc.)
 * @typeParam TResult - Final game/match results
 */
export interface BaseTranscript<TInitialState, TEvent, TResult> {
  /** Format version for future compatibility. */
  version: number;
  /** Game identifier string (e.g. 'golf', 'beleaguered-castle'). */
  gameType: string;
  /** ISO 8601 timestamp when the game started. */
  startedAt: string;
  /** ISO 8601 timestamp when the game ended (empty string until finalized). */
  endedAt: string;
  /** Board state snapshot before any moves/actions. */
  initialState: TInitialState;
  /** Ordered list of recorded events (turns, moves, actions). */
  events: TEvent[];
  /** Final results, or null while the game is in progress. */
  results: TResult | null;
}

// ── Abstract recorder base ─────────────────────────────────

/**
 * Abstract base class for game transcript recorders.
 *
 * Provides the common `getTranscript()` accessor and a protected
 * `transcript` field.  Subclasses must call `super()` with a fully
 * initialized transcript object.
 *
 * The class is deliberately minimal: it does not prescribe how
 * events are recorded, how timestamps are managed, or how results
 * are computed, since these vary across games.  It extracts only
 * the truly common pattern: holding a transcript object and
 * exposing it via `getTranscript()`.
 *
 * @typeParam T - The concrete transcript type for this game
 */
export abstract class TranscriptRecorderBase<T> {
  protected readonly transcript: T;

  /**
   * @param transcript - A fully initialized transcript object.
   *                     Typically has `endedAt` set to `''` and
   *                     `results` set to `null`.
   */
  constructor(transcript: T) {
    this.transcript = transcript;
  }

  /**
   * Get the transcript in its current state (may not be finalized).
   *
   * This is identical across all game recorders and is the primary
   * reason for the base class.
   */
  getTranscript(): T {
    return this.transcript;
  }
}
