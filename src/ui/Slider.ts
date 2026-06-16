/**
 * Slider – A reusable horizontal slider UI component.
 *
 * Provides a track, fill bar, handle, and value label with drag interaction.
 * Each Slider self-manages its own pointermove/pointerup listeners,
 * registering them only while the slider is actively being dragged and
 * unregistering them on pointerup or destroy. This means that when no
 * slider is being dragged, zero active pointermove handlers are processing
 * per-frame.
 *
 * Usage:
 * ```ts
 * const slider = new Slider(scene, x, y, {
 *   initialValue: 0.5,
 *   minValue: 0,
 *   maxValue: 1,
 *   label: 'Volume',
 * });
 * slider.onValueChange = (value) => { console.log(value); };
 * slider.setValue(0.75);
 * const current = slider.getValue();
 * slider.destroy();
 * ```
 *
 * @module src/ui/Slider
 */

import Phaser from 'phaser';
import { createHudText } from './Renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the Slider constructor. */
export interface SliderOptions {
  /** Initial slider value. Defaults to 0.5. */
  initialValue?: number;
  /** Minimum value. Defaults to 0. */
  minValue?: number;
  /** Maximum value. Defaults to 1. */
  maxValue?: number;
  /** Label text displayed above the slider. Defaults to empty string. */
  label?: string;
  /** Width of the slider track in pixels. Defaults to 150. */
  width?: number;
  /** Height of the slider track in pixels. Defaults to 6. */
  trackHeight?: number;
  /** Color of the track (fill). Defaults to 0x334433. */
  trackColor?: number;
  /** Color of the fill bar. Defaults to 0x88ff88. */
  fillColor?: number;
  /** Color of the handle. Defaults to 0xffffff. */
  handleColor?: number;
  /** Font size for the value text. Defaults to "11px". */
  fontSize?: string;
  /** Text color for the value and label. Defaults to "#88ff88". */
  textColor?: string;
}

// ---------------------------------------------------------------------------
// Slider class
// ---------------------------------------------------------------------------

/**
 * A horizontal slider widget with track, fill bar, handle circle, and
 * value label. Drag the handle or click on the track to change the value.
 *
 * The slider self-manages its input listeners (only active during drag)
 * and cleans up all Phaser objects and listener registrations on destroy().
 */
export class Slider {
  // Visual components (public for direct inspection/mutation)
  /** The track background rectangle. */
  readonly track: Phaser.GameObjects.Rectangle;
  /** The fill rectangle indicating current value. */
  readonly fill: Phaser.GameObjects.Rectangle;
  /** The handle graphics (circle). */
  readonly handle: Phaser.GameObjects.Graphics;
  /** The value/label text. */
  readonly valueText: Phaser.GameObjects.Text;
  /** The interactive hit zone. */
  readonly hitArea: Phaser.GameObjects.Zone;

  /**
   * Callback invoked when the slider value changes via user interaction
   * (drag / pointerdown). NOT invoked on programmatic setValue() calls.
   * Set by the caller to wire up scene-specific logic.
   */
  onValueChange: ((value: number) => void) | null = null;

  // Internal state
  private _value: number;
  private readonly _minValue: number;
  private readonly _maxValue: number;
  private readonly _label: string;
  private readonly _width: number;
  private readonly _trackHeight: number;
  private readonly _fillColor: number;
  private readonly _handleColor: number;
  private readonly _scene: Phaser.Scene;
  private _isDragging = false;

  // References to self-contained listener functions (for cleanup)
  private _moveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private _upHandler: (() => void) | null = null;

  // Cached position of the track left edge
  private readonly _trackX: number;

  /**
   * @param scene  The Phaser scene to add objects to.
   * @param x      X position of the slider track (left edge).
   * @param y      Y position (center of the track).
   * @param options  Optional configuration overrides.
   */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    options?: SliderOptions,
  ) {
    this._scene = scene;
    this._trackX = x;

    const {
      initialValue = 0.5,
      minValue = 0,
      maxValue = 1,
      label = '',
      width = 150,
      trackHeight = 6,
      trackColor = 0x334433,
      fillColor = 0x88ff88,
      handleColor = 0xffffff,
      fontSize = '11px',
      textColor = '#88ff88',
    } = options ?? {};

    this._value = initialValue;
    this._minValue = minValue;
    this._maxValue = maxValue;
    this._label = label;
    this._width = width;
    this._trackHeight = trackHeight;
    this._fillColor = fillColor;
    this._handleColor = handleColor;

    // --- Create visual elements ---

    this.track = scene.add.rectangle(x, y, width, trackHeight, trackColor, 1)
      .setOrigin(0, 0.5);

    this.fill = scene.add.rectangle(x, y, 1, trackHeight, fillColor, 1)
      .setOrigin(0, 0.5);

    this.handle = scene.add.graphics();

    this.valueText = createHudText(scene, x + width / 2, y - 20, '', textColor, {
      fontSize,
    }).setOrigin(0.5);

    // --- Hit zone ---

    this.hitArea = scene.add.zone(x + width / 2, y, width + 24, 28)
      .setInteractive({ useHandCursor: true });

    this.hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this._isDragging = true;
      // Register self-contained listeners — only active during drag
      this._moveHandler = (p: Phaser.Input.Pointer) => { this._handlePointerMove(p.x); };
      this._upHandler = () => { this._handlePointerUp(); };
      scene.input.on('pointermove', this._moveHandler);
      scene.input.on('pointerup', this._upHandler);
      this._setValueFromPointer(pointer.x);
    });

    // --- Initial render ---

    this._updateVisuals();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Programmatically set the slider value (clamped to min/max) and
   * update visuals. Does NOT fire `onValueChange`.
   */
  setValue(value: number): void {
    this._value = Math.max(this._minValue, Math.min(this._maxValue, value));
    this._updateVisuals();
  }

  /** Get the current slider value. */
  getValue(): number {
    return this._value;
  }

  /**
   * Destroy all slider objects and clean up input handlers.
   * Safe to call multiple times.
   */
  destroy(): void {
    // Clean up any active self-contained listeners
    if (this._moveHandler) {
      try { this._scene.input.off('pointermove', this._moveHandler); } catch (_) { /* ignore */ }
      this._moveHandler = null;
    }
    if (this._upHandler) {
      try { this._scene.input.off('pointerup', this._upHandler); } catch (_) { /* ignore */ }
      this._upHandler = null;
    }
    try { this.track.destroy(); } catch (_) { /* ignore */ }
    try { this.fill.destroy(); } catch (_) { /* ignore */ }
    try { this.handle.destroy(); } catch (_) { /* ignore */ }
    try { this.valueText.destroy(); } catch (_) { /* ignore */ }
    try { this.hitArea.destroy(); } catch (_) { /* ignore */ }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private _setValueFromPointer(pointerX: number): void {
    const clampedX = Math.max(this._trackX, Math.min(this._trackX + this._width, pointerX));
    const ratio = (clampedX - this._trackX) / this._width;
    const nextValue = this._minValue + ratio * (this._maxValue - this._minValue);
    this._value = Math.max(this._minValue, Math.min(this._maxValue, nextValue));
    this._updateVisuals();
    if (this.onValueChange) {
      this.onValueChange(this._value);
    }
  }

  private _updateVisuals(): void {
    const ratio = this._maxValue !== this._minValue
      ? (this._value - this._minValue) / (this._maxValue - this._minValue)
      : 1;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const fillWidth = Math.max(1, this._width * clampedRatio);
    const handleX = this.track.x + fillWidth;
    const handleY = this.track.y;

    this.fill.setSize(fillWidth, this._trackHeight);
    this.fill.setPosition(this.track.x, handleY);

    this.handle.clear();
    this.handle.fillStyle(this._handleColor, 1);
    this.handle.fillCircle(handleX, handleY, 8);
    this.handle.lineStyle(2, this._fillColor, 1);
    this.handle.strokeCircle(handleX, handleY, 8);

    const displayLabel = this._label
      ? `${this._label}: ${this._value.toFixed(this._value >= 100 ? 0 : (this._value >= 10 ? 1 : 2))}`
      : `${this._value.toFixed(this._value >= 100 ? 0 : (this._value >= 10 ? 1 : 2))}`;
    this.valueText.setText(displayLabel);
  }

  private _handlePointerMove(pointerX: number): void {
    if (!this._isDragging) return;
    this._setValueFromPointer(pointerX);
  }

  private _handlePointerUp(): void {
    this._isDragging = false;
    // Unregister self-contained listeners
    if (this._moveHandler) {
      this._scene.input.off('pointermove', this._moveHandler);
      this._moveHandler = null;
    }
    if (this._upHandler) {
      this._scene.input.off('pointerup', this._upHandler);
      this._upHandler = null;
    }
  }
}
