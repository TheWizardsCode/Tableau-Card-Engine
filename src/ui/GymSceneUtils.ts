/**
 * GymSceneUtils – Shared rendering utilities for Gym demo scenes.
 *
 * Extracts common patterns (event log rendering, deck grid rendering,
 * slider setup) into reusable functions so Gym scenes stay focused on
 * their demo-specific logic.
 *
 * All functions accept an options object for customization and return
 * references to the created objects for testability.
 *
 * @module src/ui/GymSceneUtils
 */

import Phaser from 'phaser';
import type { Card } from '@card-system/Card';
import { createHudText } from './Renderer';
import { getCardTexture } from './CardTextureHelpers';
import { GAME_W, CARD_W, CARD_H } from './constants';

// ---------------------------------------------------------------------------
// Event Log
// ---------------------------------------------------------------------------

/** Options for {@link createEventLog}. */
export interface EventLogOptions {
  /** Header text displayed above the log lines. Defaults to "── Event Log ──". */
  headerText?: string;
  /** Vertical spacing between log lines in pixels. Defaults to 17. */
  lineHeight?: number;
  /** Color of log line text. Defaults to "#aaddaa". */
  textColor?: string;
  /** Maximum number of log lines displayed. Defaults to 14. */
  maxLines?: number;
  /** Font size for log lines. Defaults to "11px". */
  fontSize?: string;
  /** X position of the log header (centered). Defaults to GAME_W / 2. */
  headerX?: number;
  /** X position of the log lines. Defaults to 40. */
  lineX?: number;
  /** Font size for the header. Defaults to "12px". */
  headerFontSize?: string;
  /** Color for the header text. Defaults to "#669966". */
  headerColor?: string;
}

/** Result returned by {@link createEventLog}. */
export interface EventLogResult {
  /** The header text object. */
  header: Phaser.GameObjects.Text;
  /** Array of current line text objects (updated on each render). */
  lines: Phaser.GameObjects.Text[];
  /** The base Y position of the log area. */
  baseY: number;
  /**
   * Render the current set of lines. Call this after modifying the lines
   * array to update the display.
   *
   * @param lines  Array of log line strings to render.
   */
  render: (lines: string[]) => void;
  /** Destroy all created text objects. */
  destroy: () => void;
}

/**
 * Create an event log display area (header + scrollable log lines).
 *
 * Renders a centered header at the top of the log area, then each line
 * at `lineX` with `lineHeight` vertical spacing starting from `baseY + offset`.
 *
 * @param scene  The Phaser scene to add objects to.
 * @param baseY  The Y position of the first log line (header is placed above it).
 * @param options  Optional configuration overrides.
 * @returns An {@link EventLogResult} with references to the created objects.
 */
export function createEventLog(
  scene: Phaser.Scene,
  baseY: number,
  options?: EventLogOptions,
): EventLogResult {
  const {
    headerText = '── Event Log ──',
    lineHeight = 17,
    textColor = '#aaddaa',
    maxLines = 14,
    fontSize = '11px',
    headerX = GAME_W / 2,
    lineX = 40,
    headerFontSize = '12px',
    headerColor = '#669966',
  } = options ?? {};

  const header = createHudText(scene, headerX, baseY - lineHeight, headerText, headerColor, {
    fontSize: headerFontSize,
  }).setOrigin(0.5, 1);

  const lines: Phaser.GameObjects.Text[] = [];

  function render(newLines: string[]): void {
    // Destroy old line objects
    for (const t of lines) {
      try { t.destroy(); } catch (_) { /* ignore */ }
    }
    lines.splice(0, lines.length);

    // Render up to maxLines entries
    const startIdx = Math.max(0, newLines.length - maxLines);
    const visibleLines = newLines.slice(startIdx);

    for (let i = 0; i < visibleLines.length; i++) {
      const txt = createHudText(scene, lineX, baseY + i * lineHeight, visibleLines[i], textColor, {
        fontSize,
      });
      lines.push(txt);
    }
  }

  return {
    header,
    lines,
    baseY,
    render,
    destroy: () => {
      try { header.destroy(); } catch (_) { /* ignore */ }
      for (const t of lines) {
        try { t.destroy(); } catch (_) { /* ignore */ }
      }
      lines.splice(0, lines.length);
    },
  };
}

// ---------------------------------------------------------------------------
// Deck Grid
// ---------------------------------------------------------------------------

/** Options for {@link createDeckGrid}. */
export interface DeckGridOptions {
  /** Horizontal gap between cards in pixels. Defaults to 4. */
  gapX?: number;
  /** Vertical gap between cards in pixels. Defaults to 4. */
  gapY?: number;
  /** Number of columns in the grid. Defaults to 8. */
  cols?: number;
  /** Center X of the grid (falls back to GAME_W / 2). */
  centerX?: number;
  /** Center Y of the grid (falls back to cardDisplay zone or scene center + 100). */
  centerY?: number;
  /** Scale factor for each card sprite. Defaults to auto-computed from CARD_W. */
  cardScale?: number;
}

/** Result returned by {@link createDeckGrid}. */
export interface DeckGridResult {
  /** Array of card sprite Image objects in grid order (row-major). */
  sprites: Phaser.GameObjects.Image[];
  /** Destroy all sprites. */
  destroy: () => void;
}

/**
 * Render a deck of cards as a compact face-up grid.
 *
 * Cards are scaled down (or by {@link DeckGridOptions.cardScale}) and laid
 * out in a centered grid with configurable columns and spacing.
 *
 * @param scene  The Phaser scene to add objects to.
 * @param deck   Array of cards to render. Each card is set face-up.
 * @param options  Optional configuration overrides.
 * @returns A {@link DeckGridResult} with the sprite array and a destroy method.
 */
export function createDeckGrid(
  scene: Phaser.Scene,
  deck: Card[],
  options?: DeckGridOptions,
): DeckGridResult {
  const {
    gapX = 4,
    gapY = 4,
    cols = 8,
    centerX = GAME_W / 2,
    centerY = 370, // default gym position
    cardScale,
  } = options ?? {};

  // Compute card scale — preserve legacy 48px width appearance
  const LEGACY_CARD_W = 48;
  const SCALE_UP = 1.15;
  const computedScale = Math.min(1, (LEGACY_CARD_W / CARD_W) * SCALE_UP);
  const scale = cardScale ?? computedScale;

  const scaledCardW = CARD_W * scale;
  const scaledCardH = CARD_H * scale;
  const stepX = scaledCardW + gapX;
  const stepY = scaledCardH + gapY;
  const totalWidth = cols * stepX - gapX;
  const numRows = Math.ceil(deck.length / cols);
  const totalHeight = numRows * stepY - gapY;
  const gridStartX = centerX - totalWidth / 2 + scaledCardW / 2;
  const gridStartY = centerY - totalHeight / 2 + scaledCardH / 2;

  const sprites: Phaser.GameObjects.Image[] = [];

  for (let i = 0; i < deck.length; i++) {
    const card = deck[i];
    card.faceUp = true;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridStartX + col * stepX;
    const y = gridStartY + row * stepY;
    const texture = getCardTexture(card);
    const sprite = scene.add.image(x, y, texture);
    sprite.setScale(scale);
    sprites.push(sprite);
  }

  return {
    sprites,
    destroy: () => {
      for (const sprite of sprites) {
        try { sprite.destroy(); } catch (_) { /* ignore */ }
      }
      sprites.splice(0, sprites.length);
    },
  };
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

/** Options for {@link createSlider}. */
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

/** Result returned by {@link createSlider}. */
export interface SliderResult {
  /** Current slider value. */
  value: number;
  /** The track rectangle. */
  track: Phaser.GameObjects.Rectangle;
  /** The fill rectangle. */
  fill: Phaser.GameObjects.Rectangle;
  /** The handle graphics. */
  handle: Phaser.GameObjects.Graphics;
  /** The value/label text. */
  valueText: Phaser.GameObjects.Text;
  /** The interactive hit zone. */
  hitArea: Phaser.GameObjects.Zone;
  /**
   * Callback invoked when the slider value changes.
   * Set by the caller to wire up scene-specific logic.
   */
  onValueChange: ((value: number) => void) | null;
  /**
   * Programmatically set the slider value (clamped to min/max) and
   * update visuals. Does NOT fire `onValueChange`.
   */
  setValue: (value: number) => void;
  /**
   * Destroy all slider objects and clean up input handlers.
   */
  destroy: () => void;
  /**
   * Handle a pointer move event for this slider.
   * Called by the scene's pointermove handler.
   */
  handlePointerMove: (pointerX: number) => void;
  /**
   * Handle a pointer up event for this slider.
   * Called by the scene's pointerup handler.
   */
  handlePointerUp: () => void;
}

/**
 * Create a horizontal slider with track, fill bar, handle, and value text.
 *
 * Drag logic uses pointer events: call {@link SliderResult.handlePointerMove}
 * from your scene's `pointermove` handler, and
 * {@link SliderResult.handlePointerUp} from `pointerup`.
 *
 * @param scene  The Phaser scene.
 * @param x      X position of the slider track (left edge).
 * @param y      Y position (center of the track).
 * @param options  Optional configuration overrides.
 * @returns A {@link SliderResult} with controls and references.
 */
export function createSlider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options?: SliderOptions,
): SliderResult {
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

  let currentValue = initialValue;
  let isDragging = false;
  const _callbacks: { onChange: ((value: number) => void) | null } = { onChange: null };

  // --- Create visual elements ---

  const track = scene.add.rectangle(x, y, width, trackHeight, trackColor, 1)
    .setOrigin(0, 0.5);

  const fill = scene.add.rectangle(x, y, 1, trackHeight, fillColor, 1)
    .setOrigin(0, 0.5);

  const handle = scene.add.graphics();

  const valueText = createHudText(scene, x + width / 2, y - 20, '', textColor, {
    fontSize,
  }).setOrigin(0.5);

  // --- Hit zone ---

  const hitArea = scene.add.zone(x + width / 2, y, width + 24, 28)
    .setInteractive({ useHandCursor: true });

  hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    isDragging = true;
    setValueFromPointer(pointer.x);
  });

  // --- Internal helpers ---

  function setValueFromPointer(pointerX: number): void {
    const clampedX = Math.max(x, Math.min(x + width, pointerX));
    const ratio = (clampedX - x) / width;
    const nextValue = minValue + ratio * (maxValue - minValue);
    currentValue = Math.max(minValue, Math.min(maxValue, nextValue));
    updateVisuals();
    if (_callbacks.onChange) {
      _callbacks.onChange(currentValue);
    }
  }

  function updateVisuals(): void {
    const ratio = maxValue !== minValue
      ? (currentValue - minValue) / (maxValue - minValue)
      : 1;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const fillWidth = Math.max(1, width * clampedRatio);
    const handleX = track.x + fillWidth;
    const handleY = track.y;

    fill.setSize(fillWidth, trackHeight);
    fill.setPosition(track.x, handleY);

    handle.clear();
    handle.fillStyle(handleColor, 1);
    handle.fillCircle(handleX, handleY, 8);
    handle.lineStyle(2, fillColor, 1);
    handle.strokeCircle(handleX, handleY, 8);

    const displayLabel = label ? `${label}: ${currentValue.toFixed(currentValue >= 100 ? 0 : (currentValue >= 10 ? 1 : 2))}` : `${currentValue.toFixed(currentValue >= 100 ? 0 : (currentValue >= 10 ? 1 : 2))}`;
    valueText.setText(displayLabel);
  }

  // --- Initial render ---

  updateVisuals();

  // --- Input handler helpers for the scene ---

  function handlePointerMove(pointerX: number): void {
    if (!isDragging) return;
    setValueFromPointer(pointerX);
  }

  function handlePointerUp(): void {
    isDragging = false;
  }

  const destroy = (): void => {
    try { track.destroy(); } catch (_) { /* ignore */ }
    try { fill.destroy(); } catch (_) { /* ignore */ }
    try { handle.destroy(); } catch (_) { /* ignore */ }
    try { valueText.destroy(); } catch (_) { /* ignore */ }
    try { hitArea.destroy(); } catch (_) { /* ignore */ }
  };

  return {
    get value(): number { return currentValue; },
    track,
    fill,
    handle,
    valueText,
    hitArea,
    get onValueChange(): ((value: number) => void) | null {
      return _callbacks.onChange;
    },
    set onValueChange(fn: ((value: number) => void) | null) {
      _callbacks.onChange = fn;
    },
    setValue: (value: number) => {
      currentValue = Math.max(minValue, Math.min(maxValue, value));
      updateVisuals();
    },
    destroy,
    handlePointerMove,
    handlePointerUp,
  };
}
