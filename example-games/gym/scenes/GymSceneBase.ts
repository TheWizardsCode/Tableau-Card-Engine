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
import { HelpPanel, type HelpSection } from '../../../src/ui/HelpPanel';
import { HelpButton } from '../../../src/ui/HelpButton';

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

  // ── Help slide-out integration ─────────────────────────

  /** Optional HelpPanel instance for the scene. */
  protected helpPanel?: HelpPanel;
  /** Optional HelpButton instance to toggle the help panel. */
  protected helpButton?: HelpButton;

  /**
   * Initialize the standard Gym help slide-out for this scene.
   *
   * Call this from your scene's create() after initHeader()/addDivider().
   *
   * @param sections  Array of HelpPanel sections describing the scene.
   * @param widthPercent Optional panel width percent (defaults to 35).
   */
  protected initHelp(sections: HelpSection[], widthPercent: number = 35): void {
    // Tear down any existing help UI first
    if (this.helpPanel) {
      try { this.helpPanel.destroy(); } catch (_) { /* ignore */ }
      this.helpPanel = undefined;
    }
    if (this.helpButton) {
      try { this.helpButton.destroy(); } catch (_) { /* ignore */ }
      this.helpButton = undefined;
    }

    // Create new help panel + help button
    this.helpPanel = new HelpPanel(this, { sections, widthPercent });
    this.helpButton = new HelpButton(this, this.helpPanel);

    // Ensure help resources are cleaned up when the scene shuts down/destroys
    const cleanup = () => {
      if (this.helpPanel) { try { this.helpPanel.destroy(); } catch (_) { /* ignore */ } this.helpPanel = undefined; }
      if (this.helpButton) { try { this.helpButton.destroy(); } catch (_) { /* ignore */ } this.helpButton = undefined; }
    };

    // Remove any previous listener stored on the instance, then register
    try {
      const key = '__helpCleanupListener';
      const prev = (this as any)[key] as (() => void) | undefined;
      if (prev) { this.events.off('shutdown', prev); this.events.off('destroy', prev); }
      (this as any)[key] = cleanup;
      this.events.on('shutdown', cleanup);
      this.events.on('destroy', cleanup);
    } catch (_) {
      // If event wiring fails for any reason, we still have the cleanup closure
    }
  }
}
