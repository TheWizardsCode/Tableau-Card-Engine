/**
 * Tooltip manager – a lightweight UI component for displaying
 * contextual information (e.g., card details) when the player hovers
 * over a game object.
 *
 * The tooltip respects the global "Tooltips" toggle in the Settings
 * panel (`SettingsPanel.showTooltips`). If tooltips are disabled the
 * manager simply hides itself.
 *
 * Usage example (in a game scene):
 *
 * ```ts
 * const tooltip = new TooltipManager(this, this.settingsPanel);
 * // Assuming `cardSprite` is a Phaser.Image representing a card
 * cardSprite.setInteractive({ useHandCursor: true });
 * cardSprite.on('pointerover', () => {
 *   const info = `Rank: ${card.rank}\nSuit: ${card.suit}`;
 *   tooltip.show(info, cardSprite.x, cardSprite.y);
 * });
 * cardSprite.on('pointerout', () => tooltip.hide());
 * ```
 */

import { SettingsPanel } from './SettingsPanel';
import { FONT_FAMILY } from './constants';
import Phaser from 'phaser';

export class TooltipManager {
  private readonly settingsPanel?: SettingsPanel;
  private readonly node: HTMLElement | null;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, settingsPanel?: SettingsPanel) {
    this.settingsPanel = settingsPanel;
    this.scene = scene;

    if (typeof document === 'undefined') {
      this.node = null;
      return;
    }

    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.background = 'rgba(0,0,0,0.88)';
    div.style.color = '#ffffff';
    div.style.padding = '6px 8px';
    div.style.borderRadius = '6px';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'pre-wrap';
    div.style.fontFamily = FONT_FAMILY;
    div.style.fontSize = '12px';
    div.style.zIndex = '2147483647';
    div.style.maxWidth = '320px';
    div.style.display = 'none';

    document.body.appendChild(div);
    this.node = div;
  }

  show(content: string, x: number, y: number): void {
    if (this.settingsPanel && !this.settingsPanel.showTooltips) {
      this.hide();
      return;
    }
    if (!this.node) return;

    // Set text
    this.node.textContent = content;

    // Convert game/world coordinates to client coordinates relative to the canvas
    try {
      const canvas = (this.scene.game.canvas as HTMLCanvasElement | null);
      if (!canvas) {
        this.node.style.display = 'none';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const cam = this.scene.cameras.main;
      const scaleX = rect.width / this.scene.scale.width;
      const scaleY = rect.height / this.scene.scale.height;
      const screenX = rect.left + (x - cam.scrollX) * scaleX;
      const screenY = rect.top + (y - cam.scrollY) * scaleY;

      const offsetX = 10;
      const offsetY = 10;

      // Position the element and make it visible
      this.node.style.left = `${Math.round(screenX + offsetX)}px`;
      this.node.style.top = `${Math.round(screenY + offsetY)}px`;
      this.node.style.display = 'block';
    } catch (e) {
      // If anything fails, hide tooltip
      this.hide();
    }
  }

  hide(): void {
    if (!this.node) return;
    this.node.style.display = 'none';
  }

  destroy(): void {
    if (this.node) {
      try { this.node.remove(); } catch {}
    }
  }
}
