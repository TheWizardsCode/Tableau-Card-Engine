/**
 * MainStreetTutorialScene -- "Scenario: Tutorial" entry for Main Street.
 *
 * A thin subclass of MainStreetScene that:
 *  - Registers under a distinct Phaser scene key so it can co-exist with
 *    the standard Main Street scene in the scene registry.
 *  - Forces Easy difficulty (more turns, lower score target, generous coins)
 *    so new players experience a forgiving introduction.
 *  - Attaches a MainStreetTutorialOverlayManager and adds a toggleable
 *    "Tutorial" button to the action bar so players can revisit hints.
 *
 * Tutorial overlays are non-interactive: they highlight UI regions and
 * display contextual text but never block gameplay.  Players can dismiss
 * individual hints or the whole overlay at any time.
 *
 * @module
 */

import { MainStreetScene } from './MainStreetScene';
import { MainStreetTutorialOverlayManager } from './MainStreetTutorialOverlayManager';
import { FONT_FAMILY } from '../../../src/ui';

export const TUTORIAL_SCENE_KEY = 'MainStreetTutorialScene';

export class MainStreetTutorialScene extends MainStreetScene {
  /** Tutorial overlay controller — initialised in create(). */
  public tutorialOverlay!: MainStreetTutorialOverlayManager;

  /** Whether to show tutorial hints automatically on first create. */
  private _autoShowTutorial = true;

  constructor() {
    // Pass distinct scene key to parent so this scene co-exists with MainStreetScene.
    super({ key: TUTORIAL_SCENE_KEY });
    // Force Easy difficulty for all tutorial runs.
    this.selectedDifficulty = 'Easy';
  }

  // ── Phaser lifecycle ───────────────────────────────────────

  override create(...args: any[]): any {
    // selectedDifficulty is already 'Easy' from the constructor; loadCampaignAndSetup
    // (called inside super.create) reads it when creating the game state.
    const result = super.create(...args);

    // Attach tutorial overlay manager after parent has built the scene layout.
    this.tutorialOverlay = new MainStreetTutorialOverlayManager(this);

    // Add the "[?] Tutorial" toggle button to the scene header area.
    this._addTutorialButton();

    // Auto-show tutorial on first load.
    if (this._autoShowTutorial) {
      this._autoShowTutorial = false;
      // Small delay so the initial layout/render settles first.
      this.time.delayedCall(300, () => {
        if (this.tutorialOverlay) {
          this.tutorialOverlay.start();
        }
      });
    }

    return result;
  }

  // ── Tutorial button ───────────────────────────────────────

  /**
   * Adds a small "[?] Tutorial" toggle button to the scene.
   * The button is positioned at the top-right of the HUD area.
   */
  private _addTutorialButton(): void {
    const gameW = this.layout?.gameW ?? 1280;
    const btnX = gameW - 120;
    const btnY = 18;

    const btn = this.add.text(btnX, btnY, '[?] Tutorial', {
      fontSize: '13px',
      color: '#88ff88',
      fontFamily: FONT_FAMILY,
      backgroundColor: '#1a2a1a',
      padding: { x: 6, y: 3 },
    }).setOrigin(0, 0.5).setDepth(150).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#aaffaa'));
    btn.on('pointerout', () => btn.setColor('#88ff88'));
    btn.on('pointerdown', () => {
      if (this.tutorialOverlay) {
        this.tutorialOverlay.toggle();
      }
    });

    // Keep the button visible in the HUD container if one exists.
    try {
      if (this.hudContainer) {
        this.hudContainer.add(btn);
      }
    } catch (_) { /* ignore */ }
  }
}
