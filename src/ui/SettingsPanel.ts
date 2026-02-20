/**
 * SettingsPanel -- A reusable right-side settings panel for the Tableau Card Engine.
 *
 * Provides mute toggle and volume slider controls that integrate with
 * {@link SoundManager}. Modelled after {@link HelpPanel} with slide-in/out
 * animation and input blocking. Slides in from the right side of the screen.
 *
 * @module @ui/SettingsPanel
 */
import Phaser from 'phaser';
import type { SoundManager } from '../core-engine/SoundManager';

// ── Public types ────────────────────────────────────────────

/** Configuration for the SettingsPanel constructor. */
export interface SettingsPanelConfig {
  /** The SoundManager instance to control. */
  soundManager: SoundManager;
  /** Panel width as a percentage of canvas width (0-100). Default: 30. */
  widthPercent?: number;
  /** Slide animation duration in ms. Default: 300. */
  animationDuration?: number;
  /** Keyboard shortcut key to toggle the panel. Default: 'Escape'. */
  toggleKey?: string;
}

// ── Style constants ─────────────────────────────────────────

const PANEL_BG_COLOR = 0x1a1a2e;
const PANEL_BG_ALPHA = 0.95;
const HEADING_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '20px',
  color: '#f0c040',
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
};
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '16px',
  color: '#dddddd',
  fontFamily: 'Arial, sans-serif',
};
const VALUE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '14px',
  color: '#aaaaaa',
  fontFamily: 'Arial, sans-serif',
};
const CLOSE_BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '20px',
  color: '#aaaaaa',
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
};

const PADDING = 20;
const CLOSE_BUTTON_PADDING = 8;

// Mute toggle button
const TOGGLE_SIZE = 28;
const TOGGLE_ON_COLOR = 0x44aa44;
const TOGGLE_OFF_COLOR = 0x666666;

// Volume slider
const SLIDER_TRACK_HEIGHT = 6;
const SLIDER_TRACK_COLOR = 0x444444;
const SLIDER_FILL_COLOR = 0xf0c040;
const SLIDER_HANDLE_RADIUS = 10;
const SLIDER_HANDLE_COLOR = 0xffffff;

// Depth layers (high values so panel renders above game content)
const DEPTH_INPUT_BLOCKER = 900;
const DEPTH_PANEL_BG = 901;
const DEPTH_PANEL_CONTENT = 902;
const DEPTH_CLOSE_BUTTON = 903;

/** Depth for the SettingsButton -- exported so the button renders above the panel. */
export const DEPTH_SETTINGS_BUTTON = 904;

// ── SettingsPanel class ─────────────────────────────────────

export class SettingsPanel {
  private readonly scene: Phaser.Scene;
  private readonly config: Required<SettingsPanelConfig>;
  private readonly panelWidth: number;
  private readonly canvasWidth: number;
  private readonly canvasHeight: number;

  // Game objects
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private closeButton: Phaser.GameObjects.Text;
  private inputBlocker: Phaser.GameObjects.Rectangle | null = null;

  // Mute toggle
  private muteToggleBg: Phaser.GameObjects.Rectangle;
  private muteToggleKnob: Phaser.GameObjects.Graphics;
  private muteLabel: Phaser.GameObjects.Text;
  private muteStatusText: Phaser.GameObjects.Text;
  private muteHitArea: Phaser.GameObjects.Zone;

  // Volume slider
  private sliderTrack: Phaser.GameObjects.Rectangle;
  private sliderFill: Phaser.GameObjects.Rectangle;
  private sliderHandle: Phaser.GameObjects.Graphics;
  private sliderHitArea: Phaser.GameObjects.Zone;
  private volumeLabel: Phaser.GameObjects.Text;
  private volumeValueText: Phaser.GameObjects.Text;
  private sliderTrackX: number;
  private sliderTrackWidth: number;
  private isDraggingSlider = false;

  // State
  private _isOpen = false;
  private _isAnimating = false;
  private currentTween: Phaser.Tweens.Tween | null = null;
  private destroyed = false;

  // Keyboard
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;

  constructor(scene: Phaser.Scene, config: SettingsPanelConfig) {
    this.scene = scene;
    this.config = {
      soundManager: config.soundManager,
      widthPercent: config.widthPercent ?? 30,
      animationDuration: config.animationDuration ?? 300,
      toggleKey: config.toggleKey ?? 'Escape',
    };

    this.canvasWidth = scene.scale.width;
    this.canvasHeight = scene.scale.height;
    this.panelWidth = Math.floor(this.canvasWidth * (this.config.widthPercent / 100));

    // Build the panel (hidden off-screen to the right)
    this.container = scene.add.container(this.canvasWidth, 0);
    this.container.setDepth(DEPTH_PANEL_BG);

    // Background
    this.background = scene.add.rectangle(
      this.panelWidth / 2,
      this.canvasHeight / 2,
      this.panelWidth,
      this.canvasHeight,
      PANEL_BG_COLOR,
      PANEL_BG_ALPHA,
    );
    this.container.add(this.background);

    // Close button ("X") at top-left of panel
    this.closeButton = scene.add.text(
      CLOSE_BUTTON_PADDING,
      CLOSE_BUTTON_PADDING,
      'X',
      CLOSE_BUTTON_STYLE,
    );
    this.closeButton.setDepth(DEPTH_CLOSE_BUTTON);
    this.closeButton.setInteractive({ useHandCursor: true });
    this.closeButton.on('pointerdown', () => this.close());
    this.closeButton.on('pointerover', () => this.closeButton.setColor('#ffffff'));
    this.closeButton.on('pointerout', () => this.closeButton.setColor('#aaaaaa'));
    this.container.add(this.closeButton);

    // Title
    const title = scene.add.text(
      this.panelWidth / 2,
      PADDING + 30,
      'Settings',
      HEADING_STYLE,
    );
    title.setOrigin(0.5, 0);
    title.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(title);

    // ── Sound section ───────────────────────────────────

    const sectionStartY = PADDING + 70;

    const soundHeading = scene.add.text(
      PADDING,
      sectionStartY,
      'Sound',
      { ...HEADING_STYLE, fontSize: '16px' },
    );
    soundHeading.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(soundHeading);

    // ── Mute toggle ─────────────────────────────────────

    const muteY = sectionStartY + 40;

    this.muteLabel = scene.add.text(PADDING, muteY, 'Mute', LABEL_STYLE);
    this.muteLabel.setOrigin(0, 0.5);
    this.muteLabel.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.muteLabel);

    // Toggle background (pill shape simulated with rectangle)
    const toggleX = this.panelWidth - PADDING - TOGGLE_SIZE * 1.8;
    const isMuted = this.config.soundManager.muted;

    this.muteToggleBg = scene.add.rectangle(
      toggleX,
      muteY,
      TOGGLE_SIZE * 1.8,
      TOGGLE_SIZE,
      isMuted ? TOGGLE_ON_COLOR : TOGGLE_OFF_COLOR,
    );
    this.muteToggleBg.setOrigin(0, 0.5);
    this.muteToggleBg.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.muteToggleBg);

    // Toggle knob
    this.muteToggleKnob = scene.add.graphics();
    this.muteToggleKnob.setDepth(DEPTH_PANEL_CONTENT);
    this.drawMuteKnob(isMuted);
    this.container.add(this.muteToggleKnob);

    // Mute status text
    this.muteStatusText = scene.add.text(
      toggleX + TOGGLE_SIZE * 1.8 + 8,
      muteY,
      isMuted ? 'ON' : 'OFF',
      VALUE_STYLE,
    );
    this.muteStatusText.setOrigin(0, 0.5);
    this.muteStatusText.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.muteStatusText);

    // Mute hit area
    this.muteHitArea = scene.add.zone(
      toggleX + TOGGLE_SIZE * 0.9,
      muteY,
      TOGGLE_SIZE * 2.5,
      TOGGLE_SIZE + 10,
    );
    this.muteHitArea.setDepth(DEPTH_PANEL_CONTENT);
    this.muteHitArea.setInteractive({ useHandCursor: true });
    this.muteHitArea.on('pointerdown', () => this.handleMuteToggle());
    this.container.add(this.muteHitArea);

    // ── Volume slider ───────────────────────────────────

    const volumeY = muteY + 50;

    this.volumeLabel = scene.add.text(PADDING, volumeY, 'Volume', LABEL_STYLE);
    this.volumeLabel.setOrigin(0, 0.5);
    this.volumeLabel.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.volumeLabel);

    // Volume percentage text
    const currentVolume = this.config.soundManager.volume;
    this.volumeValueText = scene.add.text(
      this.panelWidth - PADDING,
      volumeY,
      `${Math.round(currentVolume * 100)}%`,
      VALUE_STYLE,
    );
    this.volumeValueText.setOrigin(1, 0.5);
    this.volumeValueText.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.volumeValueText);

    // Slider track
    const sliderY = volumeY + 30;
    this.sliderTrackX = PADDING;
    this.sliderTrackWidth = this.panelWidth - PADDING * 2;

    this.sliderTrack = scene.add.rectangle(
      this.sliderTrackX + this.sliderTrackWidth / 2,
      sliderY,
      this.sliderTrackWidth,
      SLIDER_TRACK_HEIGHT,
      SLIDER_TRACK_COLOR,
    );
    this.sliderTrack.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.sliderTrack);

    // Slider fill (left portion showing current volume)
    const fillWidth = this.sliderTrackWidth * currentVolume;
    this.sliderFill = scene.add.rectangle(
      this.sliderTrackX + fillWidth / 2,
      sliderY,
      fillWidth,
      SLIDER_TRACK_HEIGHT,
      SLIDER_FILL_COLOR,
    );
    this.sliderFill.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.sliderFill);

    // Slider handle
    this.sliderHandle = scene.add.graphics();
    this.sliderHandle.setDepth(DEPTH_CLOSE_BUTTON); // above other content
    this.drawSliderHandle(this.sliderTrackX + fillWidth, sliderY);
    this.container.add(this.sliderHandle);

    // Slider hit area (wider than the track for easier interaction)
    this.sliderHitArea = scene.add.zone(
      this.sliderTrackX + this.sliderTrackWidth / 2,
      sliderY,
      this.sliderTrackWidth + SLIDER_HANDLE_RADIUS * 2,
      SLIDER_HANDLE_RADIUS * 4,
    );
    this.sliderHitArea.setDepth(DEPTH_PANEL_CONTENT);
    this.sliderHitArea.setInteractive({ useHandCursor: true, draggable: false });
    this.sliderHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isDraggingSlider = true;
      this.handleSliderInteraction(pointer);
    });
    this.container.add(this.sliderHitArea);

    // Scene-level pointer events for slider dragging
    scene.input.on('pointermove', this.handlePointerMove, this);
    scene.input.on('pointerup', this.handlePointerUp, this);

    // Setup keyboard shortcut
    this.setupKeyboardShortcut();

    // Set entire container invisible initially
    this.container.setVisible(false);
  }

  /** Whether the panel is currently open. */
  get isOpen(): boolean {
    return this._isOpen;
  }

  /** Whether the panel is currently animating. */
  get isAnimating(): boolean {
    return this._isAnimating;
  }

  /** Open the settings panel with slide-in animation from the right. */
  open(): void {
    if (this.destroyed) return;
    if (this._isOpen && !this._isAnimating) return;

    this._isOpen = true;
    this.container.setVisible(true);
    this.syncControlsToSoundManager();
    this.createInputBlocker();

    // Stop any existing tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    this._isAnimating = true;
    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      x: this.canvasWidth - this.panelWidth,
      duration: this.config.animationDuration,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this._isAnimating = false;
        this.currentTween = null;
      },
    });
  }

  /** Close the settings panel with slide-out animation. */
  close(): void {
    if (this.destroyed) return;
    if (!this._isOpen && !this._isAnimating) return;

    this._isOpen = false;

    // Stop any existing tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    this._isAnimating = true;
    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      x: this.canvasWidth,
      duration: this.config.animationDuration,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this._isAnimating = false;
        this.currentTween = null;
        this.container.setVisible(false);
        this.removeInputBlocker();
      },
    });
  }

  /** Toggle the panel open/closed. */
  toggle(): void {
    if (this._isAnimating) return;
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Clean up all game objects. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Remove keyboard listener
    if (this.keyboardListener) {
      this.scene.input.keyboard?.off('keydown', this.keyboardListener);
      this.keyboardListener = null;
    }

    // Remove scene-level pointer listeners
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);

    // Stop any running tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    // Remove input blocker
    this.removeInputBlocker();

    // Destroy the main container (destroys all children)
    this.container.destroy();
  }

  // ── Private: Mute toggle ─────────────────────────────────

  private handleMuteToggle(): void {
    if (this.destroyed) return;
    const newMuted = this.config.soundManager.toggleMute();
    this.updateMuteVisuals(newMuted);
  }

  private updateMuteVisuals(muted: boolean): void {
    this.muteToggleBg.setFillStyle(muted ? TOGGLE_ON_COLOR : TOGGLE_OFF_COLOR);
    this.drawMuteKnob(muted);
    this.muteStatusText.setText(muted ? 'ON' : 'OFF');
  }

  private drawMuteKnob(muted: boolean): void {
    this.muteToggleKnob.clear();

    const toggleX = this.panelWidth - PADDING - TOGGLE_SIZE * 1.8;
    const knobRadius = TOGGLE_SIZE / 2 - 3;
    const knobX = muted
      ? toggleX + TOGGLE_SIZE * 1.8 - knobRadius - 3
      : toggleX + knobRadius + 3;
    // We need the muteLabel y for knob positioning
    const muteY = this.muteLabel.y;

    this.muteToggleKnob.fillStyle(0xffffff, 1);
    this.muteToggleKnob.fillCircle(knobX, muteY, knobRadius);
  }

  // ── Private: Volume slider ───────────────────────────────

  private handleSliderInteraction(pointer: Phaser.Input.Pointer): void {
    if (this.destroyed) return;

    // Convert world pointer position to container-local x
    const localX = pointer.x - this.container.x;
    const clampedX = Phaser.Math.Clamp(
      localX,
      this.sliderTrackX,
      this.sliderTrackX + this.sliderTrackWidth,
    );
    const ratio = (clampedX - this.sliderTrackX) / this.sliderTrackWidth;

    this.config.soundManager.setVolume(ratio);
    this.updateSliderVisuals(ratio);
  }

  private handlePointerMove = (_pointer: Phaser.Input.Pointer): void => {
    if (!this.isDraggingSlider || this.destroyed || !this._isOpen) return;
    this.handleSliderInteraction(_pointer);
  };

  private handlePointerUp = (): void => {
    this.isDraggingSlider = false;
  };

  private updateSliderVisuals(ratio: number): void {
    const fillWidth = Math.max(1, this.sliderTrackWidth * ratio);
    this.sliderFill.setSize(fillWidth, SLIDER_TRACK_HEIGHT);
    this.sliderFill.setX(this.sliderTrackX + fillWidth / 2);

    const handleX = this.sliderTrackX + this.sliderTrackWidth * ratio;
    this.drawSliderHandle(handleX, this.sliderTrack.y);

    this.volumeValueText.setText(`${Math.round(ratio * 100)}%`);
  }

  private drawSliderHandle(x: number, y: number): void {
    this.sliderHandle.clear();
    this.sliderHandle.fillStyle(SLIDER_HANDLE_COLOR, 1);
    this.sliderHandle.fillCircle(x, y, SLIDER_HANDLE_RADIUS);
    // Border
    this.sliderHandle.lineStyle(2, SLIDER_FILL_COLOR, 1);
    this.sliderHandle.strokeCircle(x, y, SLIDER_HANDLE_RADIUS);
  }

  // ── Private: Sync controls ───────────────────────────────

  /** Sync visual controls to the current SoundManager state (e.g. on open). */
  private syncControlsToSoundManager(): void {
    const sm = this.config.soundManager;
    this.updateMuteVisuals(sm.muted);
    this.updateSliderVisuals(sm.volume);
  }

  // ── Private: Input blocking ──────────────────────────────

  private createInputBlocker(): void {
    if (this.inputBlocker) return;

    this.inputBlocker = this.scene.add.rectangle(
      this.canvasWidth / 2,
      this.canvasHeight / 2,
      this.canvasWidth,
      this.canvasHeight,
      0x000000,
      0.01, // Nearly invisible but catches pointer events
    );
    this.inputBlocker.setDepth(DEPTH_INPUT_BLOCKER);
    this.inputBlocker.setInteractive();
    this.inputBlocker.on('pointerdown', () => this.close());
  }

  private removeInputBlocker(): void {
    if (this.inputBlocker) {
      this.inputBlocker.destroy();
      this.inputBlocker = null;
    }
  }

  // ── Private: Keyboard shortcut ───────────────────────────

  private setupKeyboardShortcut(): void {
    if (!this.scene.input.keyboard) return;

    this.keyboardListener = (event: KeyboardEvent) => {
      if (this.destroyed) return;

      if (event.key === this.config.toggleKey) {
        this.toggle();
      }
    };

    this.scene.input.keyboard.on('keydown', this.keyboardListener);
  }
}
