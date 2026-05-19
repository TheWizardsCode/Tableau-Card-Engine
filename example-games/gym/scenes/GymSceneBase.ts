/**
 * GymSceneBase -- Shared base class for all Gym demo scenes.
 *
 * Provides the standard scene header (title + menu button) and
 * a consistent back-navigation pattern so every Gym scene has
 * the same look-and-feel.
 *
 * Subclasses extend this class and override `create()` to add
 * their demo-specific UI and logic.
 *
 * @module example-games/gym/scenes/GymSceneBase
 */

import Phaser from 'phaser';
import { GAME_W } from '../../../src/ui/constants';
import { createSceneHeader } from '../../../src/ui/SceneHeader';
import type { SceneHeaderResult } from '../../../src/ui/SceneHeader';
import { GYM_ROUTER_KEY } from '../GymRegistry';

/**
 * Abstract base class for Gym demo scenes.
 *
 * Call `initHeader()` early in your `create()` method to set up
 * the standard Gym scene header (title text + menu button).
 */
export abstract class GymSceneBase extends Phaser.Scene {
  /** Scene header elements (title + menu button). */
  protected header!: SceneHeaderResult;

  constructor(config: Phaser.Types.Scenes.SettingsConfig) {
    super(config);
  }

  /**
   * Create the standard Gym scene header with the given title.
   *
   * The header includes a centered title and a "[ Menu ]" button
   * that navigates back to the Gym Router scene.
   *
   * @param title  The display title for this demo scene.
   * @returns The header result containing the title and menu button.
   */
  protected initHeader(title: string): SceneHeaderResult {
    this.header = createSceneHeader(this, title);
    // Override menu button to navigate back to the Gym Router instead
    // of the global Game Selector, since the user navigated into the Gym.
    this.header.menuButton.off('pointerdown');
    this.header.menuButton.on('pointerdown', () => {
      this.scene.start(GYM_ROUTER_KEY);
    });
    return this.header;
  }

  /**
   * Utility: create a label text at (x, y) with standard Gym styling.
   */
  protected addLabel(
    x: number,
    y: number,
    text: string,
    opts?: Partial<{ fontSize: string; color: string }>,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontSize: opts?.fontSize ?? '14px',
      color: opts?.color ?? '#aaccaa',
      fontFamily: 'monospace',
    });
  }

  /**
   * Utility: create a clickable button text at (x, y).
   */
  protected addButton(
    x: number,
    y: number,
    label: string,
    callback: () => void,
    opts?: Partial<{ fontSize: string; color: string; hoverColor: string }>,
  ): Phaser.GameObjects.Text {
    const color = opts?.color ?? '#88ff88';
    const hoverColor = opts?.hoverColor ?? '#bbffbb';
    const btn = this.add
      .text(x, y, label, {
        fontSize: opts?.fontSize ?? '14px',
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', callback);
    btn.on('pointerover', () => btn.setColor(hoverColor));
    btn.on('pointerout', () => btn.setColor(color));
    return btn;
  }

  /**
   * Utility: add a horizontal divider line below the header.
   */
  protected addDivider(yOffset: number = 36): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x336633, 0.6);
    g.beginPath();
    g.moveTo(20, yOffset);
    g.lineTo(GAME_W - 20, yOffset);
    g.strokePath();
  }
}