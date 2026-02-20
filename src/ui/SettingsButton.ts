/**
 * SettingsButton -- A reusable gear icon toggle button for the SettingsPanel.
 *
 * Renders a circular gear icon that can be placed in any game scene
 * to toggle the associated SettingsPanel open/closed. Modelled after
 * {@link HelpButton}.
 *
 * @module @ui/SettingsButton
 */
import Phaser from 'phaser';
import type { SettingsPanel } from './SettingsPanel';
import { DEPTH_SETTINGS_BUTTON } from './SettingsPanel';

// ── Style constants ─────────────────────────────────────────

const BUTTON_RADIUS = 16;
const BUTTON_BG_COLOR = 0x333355;
const BUTTON_BG_ALPHA = 0.9;
const BUTTON_HOVER_BG_COLOR = 0x4444aa;
const BUTTON_TEXT_COLOR = '#f0c040';
const BUTTON_HOVER_TEXT_COLOR = '#ffffff';
const BUTTON_BORDER_COLOR = 0xf0c040;
const BUTTON_FONT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '16px',
  color: BUTTON_TEXT_COLOR,
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
};
const MARGIN = 16;

/** Configuration for the SettingsButton constructor. */
export interface SettingsButtonConfig {
  /** X position override. Default: top-right corner, offset left from help button. */
  x?: number;
  /** Y position override. Default: top-right corner. */
  y?: number;
}

export class SettingsButton {
  private readonly settingsPanel: SettingsPanel;
  private circle: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private hitArea: Phaser.GameObjects.Zone;
  private destroyed = false;
  private readonly posX: number;
  private readonly posY: number;

  constructor(
    scene: Phaser.Scene,
    settingsPanel: SettingsPanel,
    config?: SettingsButtonConfig,
  ) {
    this.settingsPanel = settingsPanel;

    // Position to the left of where HelpButton typically sits
    this.posX = config?.x ?? scene.scale.width - MARGIN - BUTTON_RADIUS - (BUTTON_RADIUS * 2 + MARGIN);
    this.posY = config?.y ?? MARGIN + BUTTON_RADIUS;

    // Draw circular background
    this.circle = scene.add.graphics();
    this.drawCircle(BUTTON_BG_COLOR, BUTTON_BG_ALPHA);
    this.circle.setDepth(DEPTH_SETTINGS_BUTTON);

    // Gear icon (unicode gear character)
    this.label = scene.add.text(this.posX, this.posY, '\u2699', BUTTON_FONT);
    this.label.setOrigin(0.5);
    this.label.setDepth(DEPTH_SETTINGS_BUTTON);

    // Hit area (invisible interactive zone)
    this.hitArea = scene.add.zone(
      this.posX,
      this.posY,
      BUTTON_RADIUS * 2,
      BUTTON_RADIUS * 2,
    );
    this.hitArea.setDepth(DEPTH_SETTINGS_BUTTON);
    this.hitArea.setInteractive({ useHandCursor: true });

    this.hitArea.on('pointerdown', () => {
      if (!this.destroyed) {
        this.settingsPanel.toggle();
      }
    });

    this.hitArea.on('pointerover', () => {
      if (!this.destroyed) {
        this.drawCircle(BUTTON_HOVER_BG_COLOR, 1);
        this.label.setColor(BUTTON_HOVER_TEXT_COLOR);
      }
    });

    this.hitArea.on('pointerout', () => {
      if (!this.destroyed) {
        this.drawCircle(BUTTON_BG_COLOR, BUTTON_BG_ALPHA);
        this.label.setColor(BUTTON_TEXT_COLOR);
      }
    });
  }

  /** Clean up all game objects. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.circle.destroy();
    this.label.destroy();
    this.hitArea.destroy();
  }

  // ── Private helpers ───────────────────────────────────────

  private drawCircle(color: number, alpha: number): void {
    this.circle.clear();
    // Border
    this.circle.lineStyle(2, BUTTON_BORDER_COLOR, 1);
    this.circle.strokeCircle(this.posX, this.posY, BUTTON_RADIUS);
    // Fill
    this.circle.fillStyle(color, alpha);
    this.circle.fillCircle(this.posX, this.posY, BUTTON_RADIUS);
  }
}
