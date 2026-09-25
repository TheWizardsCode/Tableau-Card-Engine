/**
 * ColorettoInputHandler — human input handling for Coloretto.
 *
 * Responsible for:
 *  - Wiring row click zones (created by ColorettoRenderer) to the scene
 *  - ESC key toggle for Place/Take mode switching
 *  - Mode button lifecycle (create, destroy, refresh) + mode notifications
 *
 * Module map (scene → helper):
 *   ColorettoRenderer      → rows, deck, collections, card faces, layout
 *   ColorettoInputHandler  → row click zones, mode buttons, ESC toggle
 */

import Phaser from 'phaser';
import { GAME_W, FONT_FAMILY } from '@ui';

// ── Public types ───────────────────────────────────────────

/** The current human action mode. */
export type ActionMode = 'place' | 'take';

/** Callback for row click delegation. */
export type OnRowClickHandler = (rowIndex: number) => void;

/**
 * Handles human input for the Coloretto scene: wires row-click zones to
 * the scene's click handler, manages ESC mode toggling and the Place/Take
 * mode buttons, and notifies the scene when the mode changes.
 */
export class ColorettoInputHandler {
  private scene: Phaser.Scene;
  private onRowClick: OnRowClickHandler;
  private getCurrentPhase: () => string;
  private getHumanPlayerIndex: () => number;
  private playSound: (key: string) => void;
  private getModeButtonY: () => number;
  private onModeChangeCallback: ((mode: ActionMode) => void) | null = null;
  private mode: ActionMode = 'place';
  private escHandler: (() => void) | null = null;
  private placeButton: Phaser.GameObjects.Text | null = null;
  private takeButton: Phaser.GameObjects.Text | null = null;

  /**
   * @param scene            — The Phaser scene.
   * @param onRowClick       — Delegation target for validated row clicks.
   * @param getCurrentPhase  — Returns the current phase string.
   * @param getHumanPlayerIndex — Returns 0 when it's the human's turn.
   * @param playSound        — Plays a named sound effect.
   * @param getModeButtonY   — Vertical position for the mode buttons.
   */
  constructor(
    scene: Phaser.Scene,
    onRowClick: OnRowClickHandler,
    getCurrentPhase: () => string,
    getHumanPlayerIndex: () => number,
    playSound: (key: string) => void,
    getModeButtonY: () => number,
  ) {
    this.scene = scene;
    this.onRowClick = onRowClick;
    this.getCurrentPhase = getCurrentPhase;
    this.getHumanPlayerIndex = getHumanPlayerIndex;
    this.playSound = playSound;
    this.getModeButtonY = getModeButtonY;

    // ESC toggles Place ↔ Take during the human turn.
    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      this.escHandler = () => {
        if (this.getCurrentPhase() === 'human-turn') {
          this.toggleMode();
        }
      };
      keyboard.on('keydown-ESC', this.escHandler);
    }
  }

  // ── Mode management ──────────────────────────────────────

  /** Current action mode. */
  getMode(): ActionMode {
    return this.mode;
  }

  /** The Place card button (null when hidden). */
  getPlaceButton(): Phaser.GameObjects.Text | null {
    return this.placeButton;
  }

  /** The Take a row button (null when hidden). */
  getTakeButton(): Phaser.GameObjects.Text | null {
    return this.takeButton;
  }

  /** Set the action mode and notify the scene. */
  setMode(mode: ActionMode): void {
    this.mode = mode;
    this.refreshModeButtons();
    this.onModeChangeCallback?.(mode);
  }

  /** Toggle Place ↔ Take. */
  toggleMode(): void {
    this.mode = this.mode === 'place' ? 'take' : 'place';
    this.playSound('ui');
    this.refreshModeButtons();
    this.onModeChangeCallback?.(this.mode);
  }

  /** Register a callback invoked whenever the mode changes. */
  onModeChange(callback: (mode: ActionMode) => void): void {
    this.onModeChangeCallback = callback;
  }

  // ── Mode buttons ─────────────────────────────────────────

  /** Re-create the mode buttons (clears old, creates new). */
  refreshModeButtons(): void {
    this.destroyModeButtons();
    if (this.getCurrentPhase() !== 'human-turn') return;

    const y = this.getModeButtonY();
    const placeX = GAME_W / 2 - 90;
    const takeX = GAME_W / 2 + 90;

    this.placeButton = createModeButton(
      this.scene,
      placeX,
      y,
      'Place card',
      this.mode === 'place',
      () => {
        this.playSound('ui');
        this.setMode('place');
      },
    );
    this.takeButton = createModeButton(
      this.scene,
      takeX,
      y,
      'Take a row',
      this.mode === 'take',
      () => {
        this.playSound('ui');
        this.setMode('take');
      },
    );
  }

  /** Destroy the mode buttons. */
  destroyModeButtons(): void {
    if (this.placeButton) {
      this.placeButton.destroy();
      this.placeButton = null;
    }
    if (this.takeButton) {
      this.takeButton.destroy();
      this.takeButton = null;
    }
  }

  // ── Row clicks ───────────────────────────────────────────

  /**
   * Attach row-click listeners to the given zones. Zones are recreated on
   * every board refresh, so this must be called after each refreshRows().
   */
  attachRowZones(zones: Phaser.GameObjects.Rectangle[]): void {
    zones.forEach((zone, index) => {
      zone.off('pointerdown');
      zone.on('pointerdown', () => {
        if (this.getCurrentPhase() !== 'human-turn') return;
        if (this.getHumanPlayerIndex() !== 0) return;
        this.onRowClick(index);
      });
    });
  }

  // ── Cleanup ──────────────────────────────────────────────

  /** Remove the ESC listener, buttons, and state. */
  destroy(): void {
    this.destroyModeButtons();
    const keyboard = this.scene.input.keyboard;
    if (keyboard && this.escHandler) {
      keyboard.off('keydown-ESC', this.escHandler);
    }
    this.escHandler = null;
    this.onModeChangeCallback = null;
  }
}

/** Create a mode toggle button (highlighted when active). */
function createModeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  active: boolean,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const btn = scene.add
    .text(x, y, label, {
      fontSize: '16px',
      color: active ? '#15242b' : '#ffffff',
      backgroundColor: active ? '#ffdd66' : '#22343c',
      padding: { x: 14, y: 8 },
      fontFamily: FONT_FAMILY,
    })
    .setOrigin(0.5)
    .setDepth(5)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', onClick)
    .on('pointerover', () => {
      if (!active) (btn as Phaser.GameObjects.Text).setStyle({ color: '#ffdd66' });
    })
    .on('pointerout', () => {
      if (!active) (btn as Phaser.GameObjects.Text).setStyle({ color: '#ffffff' });
    });
  return btn;
}