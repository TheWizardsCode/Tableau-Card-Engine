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
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  private readonly settingsPanel?: SettingsPanel;

  /**
   * Create a new tooltip manager.
   *
   * @param scene          The Phaser scene that will host the tooltip.
   * @param settingsPanel  Optional SettingsPanel instance. If provided the
   *                       manager will query `settingsPanel.showTooltips` to
   *                       decide whether to display the tooltip.
   */
  constructor(scene: Phaser.Scene, settingsPanel?: SettingsPanel) {
    this.scene = scene;
    this.settingsPanel = settingsPanel;
    // Container is placed at (0,0) and moved when showing.
    this.container = scene.add.container(0, 0);
    // Background rectangle – size will be adjusted dynamically.
    this.background = scene.add.rectangle(0, 0, 0, 0, 0x000000, 0.75);
    this.background.setOrigin(0, 0);
    // Text style – simple white text.
    this.text = scene.add.text(5, 3, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
      color: '#ffffff',
      align: 'left',
      wordWrap: { width: 200 },
    });
    // Add to container (background first so text is on top).
    this.container.add(this.background);
    this.container.add(this.text);
    // Hide initially.
    this.container.setVisible(false);
    // Ensure tooltip appears above most UI elements.
    this.container.setDepth(10000);
  }

  /** Show the tooltip with the given text at the specified world coordinates. */
  show(content: string, x: number, y: number): void {
    // Respect the user setting – hide if tooltips are disabled.
    if (this.settingsPanel && !this.settingsPanel.showTooltips) {
      this.hide();
      return;
    }
    this.text.setText(content);
    // Position container with a small offset so the cursor does not cover it.
    const offsetX = 10;
    const offsetY = 10;
    this.container.setPosition(x + offsetX, y + offsetY);
    // Adjust background size based on text dimensions.
    const padX = 10;
    const padY = 6;
    this.background.width = this.text.width + padX;
    this.background.height = this.text.height + padY;
    this.container.setVisible(true);
  }

  /** Hide the tooltip. */
  hide(): void {
    this.container.setVisible(false);
  }
}
