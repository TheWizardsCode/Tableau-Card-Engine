/**
 * HelpButton – A reusable "?" toggle button for the HelpPanel.
 *
 * Renders a circular help icon that can be placed in any game scene
 * to toggle the associated HelpPanel open/closed.
 *
 * @module @ui/HelpButton
 */
import Phaser from 'phaser';
import type { HelpPanel } from './HelpPanel';
import { DEPTH_HELP_BUTTON } from './HelpPanel';

// ── Style constants ─────────────────────────────────────────

const BUTTON_RADIUS = 16;
const BUTTON_BG_COLOR = 0x333355;
const BUTTON_BG_ALPHA = 0.9;
const BUTTON_HOVER_BG_COLOR = 0x4444aa;
const BUTTON_TEXT_COLOR = '#f0c040';
const BUTTON_HOVER_TEXT_COLOR = '#ffffff';
const BUTTON_BORDER_COLOR = 0xf0c040;
const BUTTON_FONT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '18px',
  color: BUTTON_TEXT_COLOR,
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
};
const MARGIN = 16;

/** Configuration for the HelpButton constructor. */
export interface HelpButtonConfig {
  /** X position override. Default: top-right corner of canvas. */
  x?: number;
  /** Y position override. Default: top-right corner of canvas. */
  y?: number;
}

export class HelpButton {
  private readonly helpPanel: HelpPanel;
  private circle: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private hitArea: Phaser.GameObjects.Zone;
  private destroyed = false;
  private readonly posX: number;
  private readonly posY: number;

  constructor(scene: Phaser.Scene, helpPanel: HelpPanel, config?: HelpButtonConfig) {
    this.helpPanel = helpPanel;

    this.posX = config?.x ?? scene.scale.width - MARGIN - BUTTON_RADIUS;
    this.posY = config?.y ?? MARGIN + BUTTON_RADIUS;

    // Draw circular background
    this.circle = scene.add.graphics();
    this.drawCircle(BUTTON_BG_COLOR, BUTTON_BG_ALPHA);
    this.circle.setDepth(DEPTH_HELP_BUTTON);

    // "?" label
    this.label = scene.add.text(this.posX, this.posY, '?', BUTTON_FONT);
    this.label.setOrigin(0.5);
    this.label.setDepth(DEPTH_HELP_BUTTON);

    // Hit area (invisible interactive zone)
    this.hitArea = scene.add.zone(
      this.posX,
      this.posY,
      BUTTON_RADIUS * 2,
      BUTTON_RADIUS * 2,
    );
    this.hitArea.setDepth(DEPTH_HELP_BUTTON);
    this.hitArea.setInteractive({ useHandCursor: true });

    this.hitArea.on('pointerdown', () => {
      if (!this.destroyed) {
        this.helpPanel.toggle();
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
