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
import { getReducedMotion, setReducedMotion } from './SettingsStore';

// ── Public types ────────────────────────────────────────────

/** Configuration for the SettingsPanel constructor. */
export interface SettingsPanelConfig {
  /** The SoundManager instance to control. */
  soundManager: SoundManager;
  /** Optional ordered list of difficulty names to present in the panel (game-specific). */
  difficultyNames?: readonly string[];
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

const DIFFICULTY_STORAGE_KEY = 'tce-selected-difficulty';

// Depth layers (high values so panel renders above game content)
const DEPTH_INPUT_BLOCKER = 900;
const DEPTH_PANEL_BG = 901;
const DEPTH_PANEL_CONTENT = 902;
const DEPTH_CLOSE_BUTTON = 903;

/** Depth for the SettingsButton -- exported so the button renders above the panel. */
export const DEPTH_SETTINGS_BUTTON = 1102;

// ── SettingsPanel class ─────────────────────────────────────

export class SettingsPanel {
  private readonly scene: Phaser.Scene;
  private readonly config: {
    soundManager: SoundManager;
    widthPercent: number;
    animationDuration: number;
    toggleKey: string;
    difficultyNames?: readonly string[];
  };
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

  // Tooltip toggle
  private tooltipToggleBg: Phaser.GameObjects.Rectangle;
  private tooltipToggleKnob: Phaser.GameObjects.Graphics;
  private tooltipLabel: Phaser.GameObjects.Text;
  private tooltipStatusText: Phaser.GameObjects.Text;

  // Reduced-motion toggle
  private reducedMotionToggleBg: Phaser.GameObjects.Rectangle;
  private reducedMotionToggleKnob: Phaser.GameObjects.Graphics;
  private reducedMotionLabel: Phaser.GameObjects.Text;
  private reducedMotionStatusText: Phaser.GameObjects.Text;

  // Difficulty selector (optional; provided by scene via SettingsPanelConfig)
  private difficultyNames: readonly string[] | null = null;
  private difficultyLabel?: Phaser.GameObjects.Text;
  private difficultyTextObjects: Phaser.GameObjects.Text[] = [];
  private _selectedDifficulty?: string;

  // State
  private _isOpen = false;
  private _isAnimating = false;
  private _showTooltips = true;
  private _reducedMotion = false;
  private currentTween: Phaser.Tweens.Tween | null = null;
  private destroyed = false;

  // Keyboard
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;

  constructor(scene: Phaser.Scene, config: SettingsPanelConfig) {
    this.scene = scene;
    this.config = {
      soundManager: config.soundManager,
      difficultyNames: config.difficultyNames ?? [],
      widthPercent: config.widthPercent ?? 30,
      animationDuration: config.animationDuration ?? 300,
      toggleKey: config.toggleKey ?? 'Escape',
    };

    this.canvasWidth = scene.scale.width;
    this.canvasHeight = scene.scale.height;
    this.panelWidth = Math.floor(this.canvasWidth * (this.config.widthPercent / 100));

    this._reducedMotion = this.loadReducedMotionPreference();

    // Pull optional difficulty names from config
    if (config.difficultyNames && config.difficultyNames.length > 0) {
      this.difficultyNames = config.difficultyNames;
      // Load persisted selected difficulty (fall back to first provided name)
      this._selectedDifficulty = this.loadSelectedDifficulty() ?? String(this.difficultyNames[0]);
    }

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

    // ── Display section ─────────────────────────────────

    const displaySectionY = sliderY + 40;

    const displayHeading = scene.add.text(
      PADDING,
      displaySectionY,
      'Display',
      { ...HEADING_STYLE, fontSize: '16px' },
    );
    displayHeading.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(displayHeading);

    // ── Tooltip toggle ──────────────────────────────────

    const tooltipY = displaySectionY + 40;

    this.tooltipLabel = scene.add.text(PADDING, tooltipY, 'Tooltips', LABEL_STYLE);
    this.tooltipLabel.setOrigin(0, 0.5);
    this.tooltipLabel.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.tooltipLabel);

    // Toggle background (same pill style as mute toggle)
    const tooltipToggleX = this.panelWidth - PADDING - TOGGLE_SIZE * 1.8;

    this.tooltipToggleBg = scene.add.rectangle(
      tooltipToggleX,
      tooltipY,
      TOGGLE_SIZE * 1.8,
      TOGGLE_SIZE,
      this._showTooltips ? TOGGLE_ON_COLOR : TOGGLE_OFF_COLOR,
    );
    this.tooltipToggleBg.setOrigin(0, 0.5);
    this.tooltipToggleBg.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.tooltipToggleBg);

    // Toggle knob
    this.tooltipToggleKnob = scene.add.graphics();
    this.tooltipToggleKnob.setDepth(DEPTH_PANEL_CONTENT);
    this.drawTooltipKnob(this._showTooltips);
    this.container.add(this.tooltipToggleKnob);

    // Tooltip status text
    this.tooltipStatusText = scene.add.text(
      tooltipToggleX + TOGGLE_SIZE * 1.8 + 8,
      tooltipY,
      this._showTooltips ? 'ON' : 'OFF',
      VALUE_STYLE,
    );
    this.tooltipStatusText.setOrigin(0, 0.5);
    this.tooltipStatusText.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.tooltipStatusText);

    // Tooltip hit area
    const tooltipHitArea = scene.add.zone(
      tooltipToggleX + TOGGLE_SIZE * 0.9,
      tooltipY,
      TOGGLE_SIZE * 2.5,
      TOGGLE_SIZE + 10,
    );
    tooltipHitArea.setDepth(DEPTH_PANEL_CONTENT);
    tooltipHitArea.setInteractive({ useHandCursor: true });
    tooltipHitArea.on('pointerdown', () => this.handleTooltipToggle());
    this.container.add(tooltipHitArea);

    // ── Reduced Motion toggle ──────────────────────────

    const reducedMotionY = tooltipY + 46;
    this.reducedMotionLabel = scene.add.text(PADDING, reducedMotionY, 'Reduced Motion', LABEL_STYLE);
    this.reducedMotionLabel.setOrigin(0, 0.5);
    this.reducedMotionLabel.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.reducedMotionLabel);

    const reducedMotionToggleX = this.panelWidth - PADDING - TOGGLE_SIZE * 1.8;
    this.reducedMotionToggleBg = scene.add.rectangle(
      reducedMotionToggleX,
      reducedMotionY,
      TOGGLE_SIZE * 1.8,
      TOGGLE_SIZE,
      this._reducedMotion ? TOGGLE_ON_COLOR : TOGGLE_OFF_COLOR,
    );
    this.reducedMotionToggleBg.setOrigin(0, 0.5);
    this.reducedMotionToggleBg.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.reducedMotionToggleBg);

    this.reducedMotionToggleKnob = scene.add.graphics();
    this.reducedMotionToggleKnob.setDepth(DEPTH_PANEL_CONTENT);
    this.drawReducedMotionKnob(this._reducedMotion);
    this.container.add(this.reducedMotionToggleKnob);

    this.reducedMotionStatusText = scene.add.text(
      reducedMotionToggleX + TOGGLE_SIZE * 1.8 + 8,
      reducedMotionY,
      this._reducedMotion ? 'ON' : 'OFF',
      VALUE_STYLE,
    );
    this.reducedMotionStatusText.setOrigin(0, 0.5);
    this.reducedMotionStatusText.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.reducedMotionStatusText);

    const reducedMotionHitArea = scene.add.zone(
      reducedMotionToggleX + TOGGLE_SIZE * 0.9,
      reducedMotionY,
      TOGGLE_SIZE * 2.8,
      TOGGLE_SIZE + 10,
    );
    reducedMotionHitArea.setDepth(DEPTH_PANEL_CONTENT);
    reducedMotionHitArea.setInteractive({ useHandCursor: true });
    reducedMotionHitArea.on('pointerdown', () => this.handleReducedMotionToggle());
    this.container.add(reducedMotionHitArea);

    // If difficulty names were provided, render a horizontal selectable list here
    if (this.difficultyNames) {
      const difficultyY = reducedMotionY + 46; // place below reduced-motion toggle to avoid overlap
      this.difficultyLabel = scene.add.text(PADDING, difficultyY, 'Difficulty', LABEL_STYLE);
      this.difficultyLabel.setOrigin(0, 0.5);
      this.difficultyLabel.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(this.difficultyLabel);

      // layout names horizontally from left (after label) with spacing
      const startX = PADDING + 120;
      const gap = 8;
      let x = startX;
      this.difficultyTextObjects = [];
      for (const name of this.difficultyNames) {
        const isSelected = name === this._selectedDifficulty;
        const style = isSelected ? { ...VALUE_STYLE, color: (HEADING_STYLE.color as string) ?? '#f0c040' } : VALUE_STYLE;
        const txt = scene.add.text(x, difficultyY, name, style as Phaser.Types.GameObjects.Text.TextStyle);
        txt.setOrigin(0, 0.5);
        txt.setDepth(DEPTH_PANEL_CONTENT + 1);
        txt.setInteractive({ useHandCursor: true });
        // store name for later reference
        (txt as any).tceName = name;
        txt.on('pointerdown', () => this.setSelectedDifficulty(name));
        this.container.add(txt);
        this.difficultyTextObjects.push(txt);
        x += txt.width + gap;
      }

      // Tooltip about application scope (apply immediately)
      const tip = scene.add.text(PADDING, difficultyY + 26, 'Difficulty applies immediately', {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial, sans-serif',
      });
      tip.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(tip);
    }

    // Scene-level pointer events for slider dragging
    scene.input.on('pointermove', this.handlePointerMove, this);
    scene.input.on('pointerup', this.handlePointerUp, this);

    // After constructing child objects, parent into overlay root and apply
    // absolute depths so the settings panel renders above gameplay content.
    try {
      const overlayRoot: any = (scene as any).hudOverlayContainer ?? (scene as any).hudContainer;
      if (overlayRoot && typeof overlayRoot.add === 'function') {
        try {
          overlayRoot.add(this.container);
          const base = Number(overlayRoot.depth ?? 1000);
          try { this.inputBlocker && ((this.inputBlocker as any).setDepth(base)); } catch (_) {}
          try { this.container.setDepth(base + 10); } catch (_) {}
          try { this.background.setDepth(base + 11); } catch (_) {}
          try { this.closeButton.setDepth(base + 12); } catch (_) {}
          try { this.scene.children?.depthSort?.(); } catch (_) {}
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }

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

  /** Whether scoring-rule tooltips are enabled. Default: true. */
  get showTooltips(): boolean {
    return this._showTooltips;
  }

  /** Whether reduced motion is enabled. */
  get reducedMotion(): boolean {
    return this._reducedMotion;
  }

  /** Currently selected difficulty (if the panel was configured with difficultyNames). */
  get selectedDifficulty(): string | undefined {
    return this._selectedDifficulty;
  }

  /** Open the settings panel with slide-in animation from the right. */
  open(): void {
    if (this.destroyed) return;
    if (this._isOpen && !this._isAnimating) return;

    this._isOpen = true;
    this.container.setVisible(true);
    this.syncControlsToSoundManager();
    this.createInputBlocker();

    // Ensure settings panel sits at top of overlay root ordering when opened.
    try {
      const overlayRoot: any = (this.scene as any).hudOverlayContainer ?? (this.scene as any).hudContainer;
      if (overlayRoot && typeof overlayRoot.bringToTop === 'function') {
        try { overlayRoot.bringToTop(this.container); } catch (_) { /* ignore */ }
      }
      try { this.scene.children?.depthSort?.(); } catch (_) { /* ignore */ }
    } catch (_) { /* ignore */ }

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

  // ── Private: Tooltip toggle ─────────────────────────────

  private handleTooltipToggle(): void {
    if (this.destroyed) return;
    this._showTooltips = !this._showTooltips;
    this.updateTooltipVisuals(this._showTooltips);
  }

  private updateTooltipVisuals(enabled: boolean): void {
    this.tooltipToggleBg.setFillStyle(enabled ? TOGGLE_ON_COLOR : TOGGLE_OFF_COLOR);
    this.drawTooltipKnob(enabled);
    this.tooltipStatusText.setText(enabled ? 'ON' : 'OFF');
  }

  private drawTooltipKnob(enabled: boolean): void {
    this.tooltipToggleKnob.clear();

    const toggleX = this.panelWidth - PADDING - TOGGLE_SIZE * 1.8;
    const knobRadius = TOGGLE_SIZE / 2 - 3;
    const knobX = enabled
      ? toggleX + TOGGLE_SIZE * 1.8 - knobRadius - 3
      : toggleX + knobRadius + 3;
    const tooltipY = this.tooltipLabel.y;

    this.tooltipToggleKnob.fillStyle(0xffffff, 1);
    this.tooltipToggleKnob.fillCircle(knobX, tooltipY, knobRadius);
  }

  // ── Private: Reduced motion toggle ─────────────────────

  private handleReducedMotionToggle(): void {
    if (this.destroyed) return;
    this._reducedMotion = !this._reducedMotion;
    this.updateReducedMotionVisuals(this._reducedMotion);
    this.saveReducedMotionPreference(this._reducedMotion);
  }

  // ── Difficulty selector helpers ─────────────────────────

  /** Set the selected difficulty and update visuals. */
  private setSelectedDifficulty(name: string): void {
    if (!this.difficultyNames || this.destroyed) return;
    if (!this.difficultyNames.includes(name)) return;
    this._selectedDifficulty = name;
    this.saveSelectedDifficulty(name);

    // Update visual state of the name list
    for (const txt of this.difficultyTextObjects) {
      const txtName = (txt as any).tceName as string | undefined;
      if (!txtName) continue;
      if (txtName === name) {
        txt.setColor((HEADING_STYLE.color as string) ?? '#f0c040');
      } else {
        txt.setColor(VALUE_STYLE.color as string);
      }
    }

    // Emit a DOM event so scenes or other systems can react immediately if needed
    try {
      if (typeof window !== 'undefined' && (window as any).dispatchEvent) {
        const ev = new CustomEvent('tce:difficulty-changed', { detail: { difficulty: name } });
        (window as any).dispatchEvent(ev);
      }
    } catch {
      // ignore
    }
  }

  /** Load persisted selected difficulty from localStorage. */
  private loadSelectedDifficulty(): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const v = window.localStorage.getItem(DIFFICULTY_STORAGE_KEY);
      if (!v) return null;
      if (this.difficultyNames && !this.difficultyNames.includes(v)) return null;
      return v;
    } catch {
      return null;
    }
  }

  /** Save selected difficulty to localStorage. */
  private saveSelectedDifficulty(name: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, name);
    } catch {
      // ignore storage failures
    }
  }


  private updateReducedMotionVisuals(enabled: boolean): void {
    this.reducedMotionToggleBg.setFillStyle(enabled ? TOGGLE_ON_COLOR : TOGGLE_OFF_COLOR);
    this.drawReducedMotionKnob(enabled);
    this.reducedMotionStatusText.setText(enabled ? 'ON' : 'OFF');
  }

  private drawReducedMotionKnob(enabled: boolean): void {
    this.reducedMotionToggleKnob.clear();

    const toggleX = this.panelWidth - PADDING - TOGGLE_SIZE * 1.8;
    const knobRadius = TOGGLE_SIZE / 2 - 3;
    const knobX = enabled
      ? toggleX + TOGGLE_SIZE * 1.8 - knobRadius - 3
      : toggleX + knobRadius + 3;
    const reducedMotionY = this.reducedMotionLabel.y;

    this.reducedMotionToggleKnob.fillStyle(0xffffff, 1);
    this.reducedMotionToggleKnob.fillCircle(knobX, reducedMotionY, knobRadius);
  }

  private loadReducedMotionPreference(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    return getReducedMotion(window.localStorage);
  }

  private saveReducedMotionPreference(enabled: boolean): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    setReducedMotion(enabled, window.localStorage);
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
    if (!this.sliderFill) return;
    const fillWidth = Math.max(1, this.sliderTrackWidth * ratio);
    try {
      this.sliderFill.setSize(fillWidth, SLIDER_TRACK_HEIGHT);
      this.sliderFill.setX(this.sliderTrackX + fillWidth / 2);
    } catch (_) { /* ignore runtime layout failures in tests */ }

    const handleX = this.sliderTrackX + this.sliderTrackWidth * ratio;
    this.drawSliderHandle(handleX, this.sliderTrack ? this.sliderTrack.y : 0);

    try { this.volumeValueText.setText(`${Math.round(ratio * 100)}%`); } catch (_) { /* ignore */ }
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

    // Parent input blocker into overlay root if available so it is not
    // removed during HUD rebuilds.
    try {
      const overlayRoot: any = (this.scene as any).hudOverlayContainer ?? (this.scene as any).hudContainer;
      if (overlayRoot && typeof overlayRoot.add === 'function') {
        try { overlayRoot.add(this.inputBlocker); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
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
