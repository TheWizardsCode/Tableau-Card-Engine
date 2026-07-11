/**
 * PhaseManager<T> — a generic turn-phase state machine for Phaser scenes.
 *
 * Tracks the current phase (a string union), updates a Phaser text object
 * with phase-specific instruction text, and invokes an optional callback
 * on every phase transition for game-specific side effects.
 *
 * @example
 * ```ts
 * type TurnPhase = 'drawing' | 'playing' | 'ai-thinking' | 'game-over';
 *
 * const phases = new PhaseManager<TurnPhase>({
 *   initialPhase: 'drawing',
 *   phaseTextMap: {
 *     'drawing': 'Draw a card from the stock or discard pile',
 *     'playing': 'Click a card to play it',
 *     'ai-thinking': 'AI is thinking...',
 *     // 'game-over' not listed → defaults to ''
 *   },
 *   onPhaseChange: (phase) => {
 *     if (phase === 'game-over') showGameOverOverlay();
 *   },
 * });
 *
 * // Later, once the Phaser text object exists:
 * phases.setTextObject(this.instructionText);
 *
 * // Transition:
 * phases.set('playing');       // updates text + fires callback
 * phases.current;              // 'playing'
 * phases.previous;             // 'drawing'
 * ```
 */

// ── Types ───────────────────────────────────────────────────

/** Configuration for creating a PhaseManager. */
export interface PhaseManagerConfig<T extends string> {
  /** The phase to start in. */
  initialPhase: T;

  /**
   * Map from phase value to instruction text.
   *
   * Phases not listed in the map will set the text to `''` (empty string).
   */
  phaseTextMap: Partial<Record<T, string>>;

  /**
   * Optional Phaser text object to update on phase change.
   * Can also be set later via {@link PhaseManager.setTextObject}.
   */
  textObject?: Phaser.GameObjects.Text;

  /**
   * Optional callback fired after every phase transition.
   *
   * Receives the new phase and the previous phase. Useful for triggering
   * game-specific side effects (refreshing UI, showing overlays, etc.).
   */
  onPhaseChange?: (phase: T, previous: T) => void;
}

// ── Implementation ──────────────────────────────────────────

export class PhaseManager<T extends string> {
  private _current: T;
  private _previous: T;
  private _textObject: Phaser.GameObjects.Text | null;
  private readonly _phaseTextMap: Partial<Record<T, string>>;
  private readonly _onPhaseChange?: (phase: T, previous: T) => void;

  constructor(config: PhaseManagerConfig<T>) {
    this._current = config.initialPhase;
    this._previous = config.initialPhase;
    this._textObject = config.textObject ?? null;
    this._phaseTextMap = config.phaseTextMap;
    this._onPhaseChange = config.onPhaseChange;
  }

  /** The current phase. */
  get current(): T {
    return this._current;
  }

  /** The phase that was active before the last transition. */
  get previous(): T {
    return this._previous;
  }

  /**
   * Transition to a new phase.
   *
   * Updates the internal state, sets the instruction text (if a text object
   * is bound), and fires the `onPhaseChange` callback.
   */
  set(phase: T): void {
    const prev = this._current;
    this._previous = prev;
    this._current = phase;

    if (this._textObject) {
      const text = this._phaseTextMap[phase] ?? '';
      this._textObject.setText(text);
    }

    this._onPhaseChange?.(phase, prev);
  }

  /**
   * Bind (or re-bind) the Phaser text object that displays instruction text.
   *
   * Call this once the text object has been created in the Phaser scene's
   * `create()` method. Immediately updates the text to reflect the current
   * phase.
   */
  setTextObject(textObject: Phaser.GameObjects.Text): void {
    this._textObject = textObject;
    // Sync the text to the current phase immediately
    const text = this._phaseTextMap[this._current] ?? '';
    this._textObject.setText(text);
  }

  /**
   * Update the phase-to-text mapping for a specific phase at runtime.
   *
   * Useful when instruction text depends on dynamic state (e.g. mode flags).
   * If the updated phase is the current phase, the text object is refreshed
   * immediately.
   */
  setPhaseText(phase: T, text: string): void {
    (this._phaseTextMap as Record<string, string>)[phase] = text;
    if (phase === this._current && this._textObject) {
      this._textObject.setText(text);
    }
  }
}
