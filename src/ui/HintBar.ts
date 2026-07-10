/**
 * HintBar – shared hint/instruction text component for all games.
 *
 * Provides a standardised Phaser Text positioned at bottom-centre of the
 * game viewport by default.  Supports dynamic text updates, visibility
 * toggle, and configurable styling.
 *
 * ## Usage
 *
 * ```ts
 * import { HintBar } from '@ui/HintBar';
 *
 * // In your scene's create() method:
 * this.hintBar = new HintBar(this);
 * this.hintBar.setText('Buy a card from the market');
 *
 * // Later — show a hint:
 * this.hintBar.setText('Hint: buy the Grocery at slot 3 for +2 synergy');
 *
 * // Toggle visibility:
 * this.hintBar.hide();
 * this.hintBar.show();
 * ```
 *
 * @module @ui/HintBar
 */

import Phaser from 'phaser';
import { FONT_FAMILY } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Optional configuration for the HintBar component. */
export interface HintBarOptions {
  /** X position (default: game width / 2). */
  x?: number;
  /** Y position (default: game height - 20). */
  y?: number;
  /** Initial text content (default: empty string). */
  initialText?: string;
  /** Font size (default: '14px'). */
  fontSize?: string;
  /** Text colour (default: '#ccaa77'). */
  color?: string;
  /** Whether the hint bar starts visible (default: true). */
  startVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A managed Phaser Text object positioned at bottom-centre for displaying
 * hints, instructions, or any contextual information.
 */
export class HintBar {
  /** The underlying Phaser Text object. */
  readonly textObject: Phaser.GameObjects.Text;

  private _destroyed = false;

  /**
   * @param scene   The Phaser scene that owns this hint bar.
   * @param options Optional overrides for position, styling, and visibility.
   */
  constructor(private readonly scene: Phaser.Scene, options?: HintBarOptions) {
    const gameW: number =
      (this.scene.scale?.width ?? 1280);
    const gameH: number =
      (this.scene.scale?.height ?? 720);

    const x = options?.x ?? gameW / 2;
    const y = options?.y ?? gameH - 20;
    const initialText = options?.initialText ?? '';
    const fontSize = options?.fontSize ?? '14px';
    const color = options?.color ?? '#ccaa77';

    this.textObject = this.scene.add.text(x, y, initialText, {
      fontSize,
      fontFamily: FONT_FAMILY,
      color,
    });
    this.textObject.setOrigin(0.5, 1);

    if (options?.startVisible === false) {
      this.textObject.setVisible(false);
    }
  }

  // ── Public API ─────────────────────────────────────────────

  /** Whether the hint bar is currently visible. */
  get visible(): boolean {
    return this.textObject.visible;
  }

  /**
   * Update the displayed text.
   * @param text The new text string to display.
   */
  setText(text: string): void {
    if (!this._destroyed) {
      this.textObject.setText(text);
    }
  }

  /** Show the hint bar. */
  show(): void {
    if (!this._destroyed) {
      this.textObject.setVisible(true);
    }
  }

  /** Hide the hint bar. */
  hide(): void {
    if (!this._destroyed) {
      this.textObject.setVisible(false);
    }
  }

  /** Toggle the hint bar visibility. */
  toggle(): void {
    if (!this._destroyed) {
      this.textObject.setVisible(!this.textObject.visible);
    }
  }

  /**
   * Set the visibility explicitly.
   * @param visible Whether the hint bar should be visible.
   */
  setVisible(visible: boolean): void {
    if (!this._destroyed) {
      this.textObject.setVisible(visible);
    }
  }

  /** Destroy the hint bar and release resources. */
  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
      try {
        this.textObject.destroy();
      } catch {
        // Non-fatal — Phaser may throw if already destroyed in some edge cases.
      }
    }
  }
}
