/**
 * GymButtonBar -- Reusable button layout bar with left/center/right zones
 * and automatic row wrapping.
 *
 * Provides a full-width container with three zones (left, center, right)
 * where buttons within each zone are evenly spaced. When buttons exceed
 * the available width in a zone, they automatically wrap to a new row below.
 *
 * This component is designed specifically for Gym demo scenes to replace
 * the manual `addButton(x, y, ...)` pattern with a declarative bar API
 * that handles positioning, spacing, and wrapping automatically.
 *
 * @module src/ui/GymButtonBar
 */

import { GAME_W, FONT_FAMILY } from './constants';

/**
 * Zone alignment for a button within the bar.
 *
 * - `'left'`:   Buttons align to the left edge of the left zone (1/3 width)
 * - `'center'`: Buttons are centered in the center zone (1/3 width)
 * - `'right'`:  Buttons align to the right edge of the right zone (1/3 width)
 */
export type ButtonZone = 'left' | 'center' | 'right';

/** Per-button configuration passed to addButton(). */
export interface GymButtonOpts {
  /** Zone to place the button in. Defaults to the bar's `zone` or `'center'`. */
  zone?: ButtonZone;
  /** Font size override (e.g. `'14px'`). Defaults to `'14px'`. */
  fontSize?: string;
  /** Text color override (e.g. `'#88ff88'`). Defaults to `'#88ff88'`. */
  color?: string;
  /** Hover color override (e.g. `'#bbffbb'`). Defaults to `'#bbffbb'`. */
  hoverColor?: string;
}

/** Internal button bookkeeping entry. */
interface ButtonEntry {
  zone: ButtonZone;
  text: Phaser.GameObjects.Text;
  callback: () => void;
  color: string;
  hoverColor: string;
  fontSize: string;
}

/** Configuration for the GymButtonBar constructor. */
export interface GymButtonBarConfig {
  /** Y position of the first row of buttons. */
  y: number;
  /** Default zone for buttons that don't specify one. Defaults to `'center'`. */
  zone?: ButtonZone;
  /** Horizontal padding from the screen edges (pixels). Defaults to 20. */
  padding?: number;
  /** Gap between buttons within the same zone (pixels). Defaults to 16. */
  buttonGap?: number;
  /** Vertical gap between wrapped rows (pixels). Defaults to 28. */
  rowSpacing?: number;
  /** The total width of the bar. Defaults to `GAME_W` (1280). */
  width?: number;
}

/**
 * A reusable button bar that arranges buttons into left/center/right zones
 * with even spacing and automatic row wrapping.
 *
 * Usage:
 * ```ts
 * const bar = new GymButtonBar(scene, { y: 60 });
 * bar.addButton('[ Draw ]', () => this.drawCard(), { zone: 'center' });
 * bar.addButton('[ Discard ]', () => this.discardCard(), { zone: 'right' });
 * ```
 */
export class GymButtonBar {
  private scene: Phaser.Scene;
  private config: Required<GymButtonBarConfig>;
  private buttons: ButtonEntry[] = [];

  constructor(scene: Phaser.Scene, config: GymButtonBarConfig) {
    this.scene = scene;
    this.config = {
      y: config.y,
      zone: config.zone ?? 'center',
      padding: config.padding ?? 20,
      buttonGap: config.buttonGap ?? 16,
      rowSpacing: config.rowSpacing ?? 28,
      width: config.width ?? GAME_W,
    };
  }

  /**
   * Add a button to the bar.
   *
   * The button is automatically positioned within its zone and the bar
   * is re-laid-out to accommodate the new button.
   *
   * @param label    Button label text (e.g. `'[ Draw ]'`).
   * @param callback Function called when the button is clicked.
   * @param opts     Optional per-button styling and zone overrides.
   * @returns The Phaser Text object for the button, which can be used
   *          for subsequent `setVisible()`, `setText()`, etc.
   */
  addButton(
    label: string,
    callback: () => void,
    opts?: GymButtonOpts,
  ): Phaser.GameObjects.Text {
    const zone = opts?.zone ?? this.config.zone;
    const color = opts?.color ?? '#88ff88';
    const hoverColor = opts?.hoverColor ?? '#bbffbb';
    const fontSize = opts?.fontSize ?? '14px';

    const btn = this.scene.add.text(0, 0, label, {
      fontSize,
      color,
      fontFamily: FONT_FAMILY,
    })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', callback);
    btn.on('pointerover', () => btn.setColor(hoverColor));
    btn.on('pointerout', () => btn.setColor(color));

    this.buttons.push({ zone, text: btn, callback, color, hoverColor, fontSize });
    this.layout();
    return btn;
  }

  /**
   * Re-layout all button positions.
   *
   * Call this after making modifications that could affect layout (e.g.,
   * changing a button's visibility or text, or after calling `refresh()`
   * on the bar's data).
   */
  refresh(): void {
    this.layout();
  }

  /**
   * Destroy all buttons and clean up the bar.
   *
   * Removes all button GameObjects from the scene and clears internal state.
   * After calling `destroy()`, the bar should not be used further.
   */
  destroy(): void {
    for (const entry of this.buttons) {
      try { entry.text.destroy(); } catch (_) { /* ignore */ }
    }
    this.buttons = [];
  }

  // ── Layout engine ─────────────────────────────────────

  /**
   * Compute and apply positions for all buttons.
   *
   * Divides the bar into three equal-width zones (left, center, right).
   * Within each zone, buttons are laid out with even spacing. If the
   * total width of buttons in a zone exceeds the zone width, they wrap
   * to subsequent rows.
   */
  private layout(): void {
    const { y, padding, buttonGap, rowSpacing, width } = this.config;
    const availableWidth = width - 2 * padding;
    const zoneWidth = availableWidth / 3;

    // Group buttons by zone
    const leftButtons = this.buttons.filter((b) => b.zone === 'left');
    const centerButtons = this.buttons.filter((b) => b.zone === 'center');
    const rightButtons = this.buttons.filter((b) => b.zone === 'right');

    // Layout each zone independently
    this.layoutZone(leftButtons, zoneWidth, padding, y, 'left', buttonGap, rowSpacing);
    this.layoutZone(centerButtons, zoneWidth, padding + zoneWidth, y, 'center', buttonGap, rowSpacing);
    this.layoutZone(rightButtons, zoneWidth, padding + 2 * zoneWidth, y, 'right', buttonGap, rowSpacing);
  }

  /**
   * Layout buttons in a single zone, with wrapping.
   *
   * @param entries       Buttons assigned to this zone.
   * @param zoneWidth     Width of the zone in pixels.
   * @param zoneOriginX   The left edge X of this zone.
   * @param baseY         The Y position for the first row.
   * @param align         Zone alignment (controls how buttons are placed).
   * @param buttonGap     Pixel gap between adjacent buttons.
   * @param rowSpacing    Pixel gap between rows.
   */
  private layoutZone(
    entries: ButtonEntry[],
    zoneWidth: number,
    zoneOriginX: number,
    baseY: number,
    align: ButtonZone,
    buttonGap: number,
    rowSpacing: number,
  ): void {
    if (entries.length === 0) return;

    // Group entries into rows based on width
    const rows: ButtonEntry[][] = [];
    let currentRow: ButtonEntry[] = [];
    let currentRowWidth = 0;

    for (const entry of entries) {
      const btnWidth = entry.text.width;

      if (currentRow.length > 0 && currentRowWidth + buttonGap + btnWidth > zoneWidth) {
        // Start a new row
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [entry];
        currentRowWidth = btnWidth;
      } else {
        currentRow.push(entry);
        currentRowWidth += currentRow.length > 1 ? buttonGap + btnWidth : btnWidth;
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    // Position each row
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rowY = baseY + rowIdx * rowSpacing;

      // Calculate total width of buttons in this row (without gaps)
      let totalButtonWidth = 0;
      for (const entry of row) {
        totalButtonWidth += entry.text.width;
      }

      // Calculate gap between buttons (space-evenly within the zone)
      const gapCount = row.length - 1;
      const gapsWidth = gapCount * buttonGap;

      if (align === 'left') {
        // Left-aligned: first button at zoneOriginX, then spaced evenly
        const startX = zoneOriginX;
        let x = startX;
        for (const entry of row) {
          entry.text.setPosition(x + entry.text.width / 2, rowY);
          x += entry.text.width + buttonGap;
        }
      } else if (align === 'right') {
        // Right-aligned: buttons extend leftward from the zone's right edge
        const endX = zoneOriginX + zoneWidth;
        let x = endX - totalButtonWidth - gapsWidth;
        for (const entry of row) {
          entry.text.setPosition(x + entry.text.width / 2, rowY);
          x += entry.text.width + buttonGap;
        }
      } else {
        // Center-aligned: center the group within the zone
        const groupWidth = totalButtonWidth + gapsWidth;
        const startX = zoneOriginX + (zoneWidth - groupWidth) / 2;
        let x = startX;
        for (const entry of row) {
          entry.text.setPosition(x + entry.text.width / 2, rowY);
          x += entry.text.width + buttonGap;
        }
      }
    }
  }
}
