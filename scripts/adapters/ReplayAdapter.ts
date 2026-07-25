/**
 * ReplayAdapter -- game-agnostic interface for the replay tool.
 *
 * Each game that supports visual replay implements this interface to
 * provide game-specific transcript parsing, state injection, and
 * scene management.  The replay tool (`scripts/replay.ts`) delegates
 * all game-specific logic to the adapter, keeping the core replay
 * loop generic.
 *
 * ## Lifecycle
 *
 * 1. **Detection** -- The adapter registry inspects the raw transcript
 *    JSON and selects the matching adapter (or the user overrides via
 *    `--game <type>`).
 * 2. **Validation** -- `validateTranscript()` checks that the JSON
 *    conforms to the game's expected schema.
 * 3. **Scene boot** -- `startScene()` and `waitForSceneReady()` launch
 *    the correct Phaser scene inside the Playwright page.
 * 4. **State injection** -- `injectStateAndWait()` is called once for
 *    the initial state and once per turn to load board state and wait
 *    for the `state-settled` event.
 * 5. **Interactive takeover** (optional) -- `describeTurn()`,
 *    `supportsInteractiveTakeover()`, and `showTakeoverOverlay()`
 *    support the `--stop-at` feature.
 *
 * @see GolfReplayAdapter  -- reference implementation
 * @see scripts/replay.ts  -- consumer
 *
 * Related work item: CG-0MLTFUL061DWDGA2
 */

import type { Page } from 'playwright';

// ── Supporting types ───────────────────────────────────────

/**
 * Result of transcript validation.
 *
 * When `valid` is `false`, `error` contains a human-readable
 * description of the validation failure.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Options passed to `showTakeoverOverlay()` when the replay
 * pauses for interactive debugging.
 */
export interface TakeoverOptions {
  /** The 0-based turn number where replay paused. */
  turnNumber: number;
  /** Human-readable description of the last replayed action. */
  lastAction: string;
}

// ── Adapter interface ──────────────────────────────────────

/**
 * Adapter interface that isolates game-specific replay logic from
 * the generic replay tool.
 *
 * Each method receives the raw transcript (typed as `unknown` at
 * the interface level) since the replay tool is game-agnostic.
 * Implementations cast internally to their game-specific types.
 */
export interface ReplayAdapter {
  // ── Identity ─────────────────────────────────────────────

  /**
   * Canonical game type identifier (e.g. `'golf'`, `'beleaguered-castle'`).
   *
   * Used for logging, output directory naming, and as the value
   * accepted by the `--game` CLI flag.
   */
  readonly gameType: string;

  /**
   * The Phaser scene key this game uses (e.g. `'GolfScene'`).
   *
   * Used by the replay tool to start and query the correct scene.
   */
  readonly sceneKey: string;

  // ── Detection ────────────────────────────────────────────

  /**
   * Inspect a raw (parsed but untyped) transcript JSON object and
   * return `true` if this adapter can handle it.
   *
   * The registry calls `canHandle()` on each registered adapter in
   * priority order.  The first adapter returning `true` is selected.
   *
   * Implementations should be lightweight (check a `game` or
   * `gameType` field, or inspect structural markers) and must not
   * throw.
   *
   * @param raw - The parsed transcript JSON (type unknown).
   * @returns `true` if this adapter recognises the transcript.
   */
  canHandle(raw: unknown): boolean;

  // ── Validation ───────────────────────────────────────────

  /**
   * Validate the transcript structure for this game.
   *
   * Called after `canHandle()` returns `true`.  Should check version
   * numbers, required fields, and structural constraints.
   *
   * @param raw - The parsed transcript JSON.
   * @returns Validation result with optional error message.
   */
  validateTranscript(raw: unknown): ValidationResult;

  // ── Transcript introspection ─────────────────────────────

  /**
   * Return the total number of replay steps (turns / moves / events).
   *
   * Does not include the initial state (step 0).  For example, a
   * Golf game with 14 turns returns 14.
   *
   * @param transcript - The validated transcript (cast internally).
   */
  getTurnCount(transcript: unknown): number;

  /**
   * Return the transcript version number.
   *
   * @param transcript - The validated transcript.
   */
  getVersion(transcript: unknown): number;

  /**
   * Return a human-readable summary line for logging after loading
   * the transcript (e.g. player names, turn count).
   *
   * @param transcript - The validated transcript.
   */
  getSummaryLine(transcript: unknown): string;

  /**
   * Return `true` if `--stop-at` (interactive takeover) is supported
   * for this transcript.
   *
   * Some versions or games may lack the state data needed for
   * interactive play (e.g. Golf v1 transcripts lack stock pile cards).
   *
   * @param transcript - The validated transcript.
   */
  supportsInteractiveTakeover(transcript: unknown): boolean;

  // ── Scene management (Playwright) ────────────────────────

  /**
   * Construct the URL (including any query parameters) the replay
   * tool should navigate to.
   *
   * @param baseUrl - The dev server URL (e.g. `http://localhost:3000`).
   * @returns Full URL with game-specific query parameters.
   */
  getReplayUrl(baseUrl: string): string;

  /**
   * Programmatically start the game scene from the game selector
   * landing page.
   *
   * The unified entry point boots `GameSelectorScene` by default.
   * This method transitions to the correct game scene.
   *
   * @param page - The Playwright page.
   */
  startScene(page: Page): Promise<void>;

  /**
   * Wait for the game scene to become active (assets loaded, scene
   * running).
   *
   * @param page - The Playwright page.
   * @param timeoutMs - Maximum time to wait in milliseconds.
   */
  waitForSceneReady(page: Page, timeoutMs: number): Promise<void>;

  // ── State injection ──────────────────────────────────────

  /**
   * Inject the initial board state (turn 0) into the running scene
   * and wait for the `state-settled` event.
   *
   * @param page - The Playwright page.
   * @param transcript - The validated transcript.
   * @param timeoutMs - Maximum time to wait for `state-settled`.
   */
  injectInitialState(
    page: Page,
    transcript: unknown,
    timeoutMs: number,
  ): Promise<void>;

  /**
   * Inject the board state for a specific turn and wait for
   * `state-settled`.
   *
   * @param page - The Playwright page.
   * @param transcript - The validated transcript.
   * @param turnIndex - 0-based turn index.
   * @param timeoutMs - Maximum time to wait for `state-settled`.
   */
  injectTurnState(
    page: Page,
    transcript: unknown,
    turnIndex: number,
    timeoutMs: number,
  ): Promise<void>;

  // ── Turn description ─────────────────────────────────────

  /**
   * Return a human-readable label for a replay step, suitable for
   * console output.
   *
   * For example: `"You (P0)"` for a Golf turn, or
   * `"Move: 3H from col 2 to foundation"` for BC.
   *
   * @param transcript - The validated transcript.
   * @param turnIndex - 0-based turn index.
   */
  describeTurn(transcript: unknown, turnIndex: number): string;

  /**
   * Return a detailed action description for the `--stop-at` overlay.
   *
   * Called when the replay pauses at a specific turn.  Should describe
   * what happened in the last replayed turn.
   *
   * @param transcript - The validated transcript.
   * @param turnIndex - 0-based turn index (the last turn replayed).
   *   A value of -1 means the initial state (no turns replayed yet).
   */
  describeLastAction(transcript: unknown, turnIndex: number): string;

  /**
   * Show the interactive takeover overlay in the browser.
   *
   * Called when `--stop-at` pauses the replay.  The overlay should
   * display turn information and instructions for the developer.
   *
   * @param page - The Playwright page.
   * @param options - Turn number and last action description.
   */
  showTakeoverOverlay(page: Page, options: TakeoverOptions): Promise<void>;
}
