/**
 * illegalMoveToast -- framework-free text/timing model for the illegal-move
 * reason toast.
 *
 * The model owns the only state that matters for the reason toast: the text
 * currently displayed and how long it has been visible. It has no Phaser (or
 * DOM) dependency, so the text/timing contract — show, replace-on-show,
 * dismiss, auto-expiry — is unit-testable without a scene.
 *
 * The Phaser rendering half lives in
 * {@link module:ui/illegalMoveToastView} and is what `shakeIllegalMove`
 * composes, so every game that reuses the illegal-move feedback routine
 * explains a rejected move with the same transient toast
 * (CG-0MVPXFHBZ004LGEB).
 *
 * @module ui/illegalMoveToast
 */

import { ILLEGAL_MOVE_TOAST_DWELL_MS } from './constants';

/** Options for {@link IllegalMoveToastModel}. */
export interface IllegalMoveToastModelOptions {
  /**
   * How long (milliseconds) the toast stays visible after `show()`.
   *
   * Non-finite or non-positive values fall back to
   * {@link ILLEGAL_MOVE_TOAST_DWELL_MS}.
   */
  dwellMs?: number;
}

/**
 * Framework-free text/timing model for a single transient toast.
 *
 * Semantics:
 * - `show(text)` makes the toast visible and **restarts** the dwell timer.
 *   Calling it again inside the dwell window replaces the text instead of
 *   stacking a second toast (AC4).
 * - `tick(deltaMs)` advances the dwell clock; once the dwell has elapsed the
 *   model hides itself and `tick` reports `true` exactly once.
 * - `dismiss()` hides the toast early (AC2).
 * - `visible`, `text` and `remaining` describe the current state.
 *
 * The model never truncates, re-words or otherwise transforms the text: the
 * rules layer owns the player-facing copy (AC8).
 */
export class IllegalMoveToastModel {
  /** Effective dwell time in milliseconds. */
  readonly dwellMs: number;

  private currentText: string | null = null;
  private elapsedMs = 0;

  constructor(options: IllegalMoveToastModelOptions = {}) {
    const requested = options.dwellMs;
    this.dwellMs =
      typeof requested === 'number' && Number.isFinite(requested) && requested > 0
        ? requested
        : ILLEGAL_MOVE_TOAST_DWELL_MS;
  }

  /** The text currently shown, or `null` when the toast is hidden. */
  get text(): string | null {
    return this.currentText;
  }

  /** Whether the toast is currently visible. */
  get visible(): boolean {
    return this.currentText !== null;
  }

  /** Milliseconds left before auto-dismissal (`0` when hidden). */
  get remaining(): number {
    if (this.currentText === null) return 0;
    return Math.max(0, this.dwellMs - this.elapsedMs);
  }

  /**
   * Show `text` and restart the dwell timer.
   *
   * Empty or whitespace-only text is treated as "nothing to explain": any
   * visible toast is dismissed and no new one is created.
   *
   * @returns `true` when the toast is now showing `text`.
   */
  show(text: string): boolean {
    if (typeof text !== 'string' || text.trim() === '') {
      this.dismiss();
      return false;
    }
    this.currentText = text;
    this.elapsedMs = 0;
    return true;
  }

  /** Hide the toast immediately (early dismissal). */
  dismiss(): void {
    this.currentText = null;
    this.elapsedMs = 0;
  }

  /**
   * Advance the dwell clock.
   *
   * @param deltaMs Elapsed milliseconds since the previous tick. Non-positive
   *   or non-finite values are ignored (the clock only moves forward).
   * @returns `true` when this tick caused the toast to expire.
   */
  tick(deltaMs: number): boolean {
    if (this.currentText === null) return false;
    if (typeof deltaMs === 'number' && Number.isFinite(deltaMs) && deltaMs > 0) {
      this.elapsedMs += deltaMs;
    }
    if (this.elapsedMs >= this.dwellMs) {
      this.dismiss();
      return true;
    }
    return false;
  }
}
