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
import { SettingsButton } from './SettingsButton';
import { getReducedMotion, setReducedMotion, getEndTurnKeybind, setEndTurnKeybind, getTooltips, setTooltips, getCardDesign, setCardDesign, getAvailableCardDesigns } from './SettingsStore';
import { createVersionLabel } from './versionDisplay';
import { isDevMode, type DebugToolsEntry } from './debug/DebugToolsRegistry';

// ── Public types ────────────────────────────────────────────

/** Configuration for a game-specific AI skill rating slider. */
export interface SkillRatingConfig {
  /** Current skill rating value (min–max). */
  value: number;
  /** Minimum value (typically 1). */
  min: number;
  /** Maximum value (typically 100). */
  max: number;
  /** Called when the slider value changes. */
  onChange: (value: number) => void;
}

/** Optional position override for the integrated settings button. */
export interface SettingsButtonPosition {
  /** X position. Defaults to left of help button. */
  x?: number;
  /** Y position. Defaults to top of screen. */
  y?: number;
}

/** Configuration for the SettingsPanel constructor. */
export interface SettingsPanelConfig {
  /** The SoundManager instance to control. */
  soundManager: SoundManager;
  /** Optional ordered list of difficulty names to present in the panel (game-specific). */
  difficultyNames?: readonly string[];
  /** Default difficulty name when no localStorage preference exists. Falls back to difficultyNames[0] if omitted. */
  defaultDifficulty?: string;
  /** Panel width as a percentage of canvas width (0-100). Default: 30. */
  widthPercent?: number;
  /** Slide animation duration in ms. Default: 300. */
  animationDuration?: number;
  /** Keyboard shortcut key to toggle the panel. Default: 'Escape'. */
  toggleKey?: string;
  /**
   * When true (the default), automatically create a SettingsButton that
   * toggles this panel. Set to false to manage the button yourself.
   */
  showButton?: boolean;
  /**
   * Optional position override for the integrated settings button. When
   * provided, the button is placed at these coordinates instead of
   * the default position (left of the help button).
   */
  buttonPosition?: SettingsButtonPosition;

  /**
   * Optional list of debug tool entries for the Debug Tools section.
   * When provided (and `import.meta.env.DEV` is true), a "Debug Tools"
   * section is rendered at the bottom of the Settings panel.
   * In production builds, the entire Debug section is tree-shaken away.
   */
  debugTools?: DebugToolsEntry[];

  /**
   * Whether the current game has tooltips. When true (default), a
   * "Tooltips" toggle is displayed in the settings panel. Games
   * without any tooltips (e.g. Golf) should set this to false to
   * hide the toggle.
   */
  hasTooltips?: boolean;

  /**
   * Optional AI skill rating slider configuration.
   * When provided, a labeled slider (min–max) is shown in the
   * settings panel to control AI difficulty in real time.
   */
  skillRating?: SkillRatingConfig;

  /**
   * Optional debug tool entries for the "Debug Tools" section.
   * When provided and `import.meta.env.DEV` is true, a "Debug Tools"
   * section is rendered below all other sections in the settings panel.
   * Each entry provides a clickable label, description, and activate callback.
   * In production builds, the entire debug section is tree-shaken.
   */
  debugTools?: DebugToolsEntry[];
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

/** Depth used for the version label shown when settings panel is open. */
const DEPTH_VERSION_LABEL = 899;

// ── SettingsPanel class ─────────────────────────────────────

export class SettingsPanel {
  private readonly scene: Phaser.Scene;
  private readonly config: {
    soundManager: SoundManager;
    widthPercent: number;
    animationDuration: number;
    toggleKey: string;
    difficultyNames?: readonly string[];
    showButton: boolean;
    buttonPosition: SettingsPanelConfig['buttonPosition'];
    debugTools?: DebugToolsEntry[];
    hasTooltips: boolean;
    skillRating?: SkillRatingConfig;
    debugTools?: DebugToolsEntry[];
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

  // Tooltip toggle (only created when hasTooltips config is true)
  private tooltipToggleBg!: Phaser.GameObjects.Rectangle;
  private tooltipToggleKnob!: Phaser.GameObjects.Graphics;
  private tooltipLabel!: Phaser.GameObjects.Text;
  private tooltipStatusText!: Phaser.GameObjects.Text;

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

  // Skill rating slider (optional; provided by scene via SettingsPanelConfig)
  private skillLabel!: Phaser.GameObjects.Text;
  private skillSliderTrack!: Phaser.GameObjects.Rectangle;
  private skillSliderFill!: Phaser.GameObjects.Rectangle;
  private skillSliderHandle!: Phaser.GameObjects.Graphics;
  private skillSliderHitArea!: Phaser.GameObjects.Zone;
  private skillValueText!: Phaser.GameObjects.Text;
  private skillTrackX!: number;
  private skillTrackWidth!: number;
  private isDraggingSkillSlider = false;
  private _skillRatingValue: number = 80;

  // Card design selector
  private cardDesignLabel!: Phaser.GameObjects.Text;
  private cardDesignTextObjects: Phaser.GameObjects.Text[] = [];
  private _cardDesignKey: string;

  // State
  private _isOpen = false;
  private _isAnimating = false;
  private _showTooltips: boolean;
  private _reducedMotion = false;
  private currentTween: Phaser.Tweens.Tween | null = null;
  private destroyed = false;

  // Keyboard
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;
  private _settingsButton: SettingsButton | null = null;

  // Version label (shown when panel is open, on the game canvas)
  private _versionLabel: Phaser.GameObjects.Text;

  /**
   * The integrated settings button, or `null` when `showButton` is false.
   */
  get settingsButton(): SettingsButton | null {
    return this._settingsButton;
  }

  // End Turn keybind UI
  private _endTurnKeyText: Phaser.GameObjects.Text | null = null;
  private _endTurnHitArea: Phaser.GameObjects.Zone | null = null;
  private _endTurnInstruction: Phaser.GameObjects.Text | null = null;
  private _awaitingEndTurnKey = false;
  private _endTurnCaptureListener: ((event: KeyboardEvent) => void) | null = null;


  constructor(scene: Phaser.Scene, config: SettingsPanelConfig) {
    this.scene = scene;
    const showButton = config.showButton ?? true;
    this.config = {
      soundManager: config.soundManager,
      difficultyNames: config.difficultyNames ?? [],
      widthPercent: config.widthPercent ?? 30,
      animationDuration: config.animationDuration ?? 300,
      toggleKey: config.toggleKey ?? 'Escape',
      showButton,
      buttonPosition: config.buttonPosition,
      debugTools: config.debugTools,
      hasTooltips: config.hasTooltips ?? true,
      skillRating: config.skillRating,
      debugTools: config.debugTools,
    };

    this.canvasWidth = scene.scale.width;
    this.canvasHeight = scene.scale.height;
    this.panelWidth = Math.floor(this.canvasWidth * (this.config.widthPercent / 100));

    this._reducedMotion = this.loadReducedMotionPreference();
    this._showTooltips = this.loadTooltipPreference();
    this._cardDesignKey = this.loadCardDesignPreference();

    // Pull optional difficulty names from config
    if (config.difficultyNames && config.difficultyNames.length > 0) {
      this.difficultyNames = config.difficultyNames;
      // Load persisted selected difficulty (fall back to first provided name)
      this._selectedDifficulty = this.loadSelectedDifficulty() ?? config.defaultDifficulty ?? String(this.difficultyNames[0]);
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

    // ── Tooltip toggle (only shown when the game has tooltips) ──

    let nextDisplayY = displaySectionY + 40;

    if (this.config.hasTooltips) {
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

      nextDisplayY = tooltipY + 46;
    }

    // ── Reduced Motion toggle ──────────────────────────

    const reducedMotionY = nextDisplayY;
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

    // ── Card Design selector ─────────────────────────────
    const cardDesignY = reducedMotionY + 46;

    this.cardDesignLabel = scene.add.text(PADDING, cardDesignY, 'Card Design', LABEL_STYLE);
    this.cardDesignLabel.setOrigin(0, 0.5);
    this.cardDesignLabel.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.cardDesignLabel);

    // Layout design names horizontally
    const designs = getAvailableCardDesigns();
    const designStartX = PADDING + 120;
    const designGap = 8;
    this.cardDesignTextObjects = [];
    let designX = designStartX;
    for (const design of designs) {
      const isSelected = design.key === this._cardDesignKey;
      const style = isSelected
        ? { ...VALUE_STYLE, color: (HEADING_STYLE.color as string) ?? '#f0c040' }
        : VALUE_STYLE;
      const txt = scene.add.text(designX, cardDesignY, design.displayName, style as Phaser.Types.GameObjects.Text.TextStyle);
      txt.setOrigin(0, 0.5);
      txt.setDepth(DEPTH_PANEL_CONTENT + 1);
      txt.setInteractive({ useHandCursor: true });
      (txt as any).tceCardDesignKey = design.key;
      txt.on('pointerdown', () => this.handleCardDesignSelect(design.key));
      this.container.add(txt);
      this.cardDesignTextObjects.push(txt);
      designX += txt.width + designGap;
    }

    // Tooltip about scope
    const designTip = scene.add.text(PADDING, cardDesignY + 26, 'Takes effect immediately', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial, sans-serif',
    });
    designTip.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(designTip);

    // ── End Turn keybind control ──────────────────────────
    const endTurnY = cardDesignY + 46;
    const endTurnLabel = scene.add.text(PADDING, endTurnY, 'End Turn Key', LABEL_STYLE);
    endTurnLabel.setOrigin(0, 0.5);
    endTurnLabel.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(endTurnLabel);

    // Current key label
    const currentKey = getEndTurnKeybind();
    this._endTurnKeyText = scene.add.text(this.panelWidth - PADDING, endTurnY, currentKey, VALUE_STYLE);
    this._endTurnKeyText.setOrigin(1, 0.5);
    this._endTurnKeyText.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this._endTurnKeyText);

    // Hit area to change binding
    this._endTurnHitArea = scene.add.zone(
      this.panelWidth - PADDING - 120,
      endTurnY,
      120,
      28,
    );
    this._endTurnHitArea.setOrigin(1, 0.5);
    this._endTurnHitArea.setDepth(DEPTH_PANEL_CONTENT);
    this._endTurnHitArea.setInteractive({ useHandCursor: true });
    this._endTurnHitArea.on('pointerdown', () => this.beginEndTurnKeyCapture());
    this.container.add(this._endTurnHitArea as any);

    // Instruction when waiting for key
    this._endTurnInstruction = scene.add.text(this.panelWidth - PADDING - 130, endTurnY + 28, '', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial, sans-serif',
    });
    this._endTurnInstruction.setOrigin(1, 0.5);
    this._endTurnInstruction.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this._endTurnInstruction);

    // ── AI Skill Rating slider ──────────────────────────
    if (this.config.skillRating) {
      const srConfig = this.config.skillRating;
      this._skillRatingValue = srConfig.value;

      const skillY = endTurnY + 46;

      this.skillLabel = scene.add.text(PADDING, skillY, 'AI Skill', LABEL_STYLE);
      this.skillLabel.setOrigin(0, 0.5);
      this.skillLabel.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(this.skillLabel);

      // Value text (right-aligned)
      this.skillValueText = scene.add.text(
        this.panelWidth - PADDING,
        skillY,
        `${this._skillRatingValue}`,
        VALUE_STYLE,
      );
      this.skillValueText.setOrigin(1, 0.5);
      this.skillValueText.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(this.skillValueText);

      // Slider track
      const sliderY = skillY + 30;
      this.skillTrackX = PADDING;
      this.skillTrackWidth = this.panelWidth - PADDING * 2;

      this.skillSliderTrack = scene.add.rectangle(
        this.skillTrackX + this.skillTrackWidth / 2,
        sliderY,
        this.skillTrackWidth,
        SLIDER_TRACK_HEIGHT,
        SLIDER_TRACK_COLOR,
      );
      this.skillSliderTrack.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(this.skillSliderTrack);

      // Slider fill (proportional to current value)
      const ratio = (this._skillRatingValue - srConfig.min) / (srConfig.max - srConfig.min);
      const fillWidth = Math.max(1, this.skillTrackWidth * ratio);
      this.skillSliderFill = scene.add.rectangle(
        this.skillTrackX + fillWidth / 2,
        sliderY,
        fillWidth,
        SLIDER_TRACK_HEIGHT,
        SLIDER_FILL_COLOR,
      );
      this.skillSliderFill.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(this.skillSliderFill);

      // Slider handle
      this.skillSliderHandle = scene.add.graphics();
      this.skillSliderHandle.setDepth(DEPTH_CLOSE_BUTTON);
      this.drawSkillSliderHandle(this.skillTrackX + fillWidth, sliderY);
      this.container.add(this.skillSliderHandle);

      // Slider hit area
      this.skillSliderHitArea = scene.add.zone(
        this.skillTrackX + this.skillTrackWidth / 2,
        sliderY,
        this.skillTrackWidth + SLIDER_HANDLE_RADIUS * 2,
        SLIDER_HANDLE_RADIUS * 4,
      );
      this.skillSliderHitArea.setDepth(DEPTH_PANEL_CONTENT);
      this.skillSliderHitArea.setInteractive({ useHandCursor: true, draggable: false });
      this.skillSliderHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.isDraggingSkillSlider = true;
        this.handleSkillSliderInteraction(pointer);
      });
      this.container.add(this.skillSliderHitArea);
    }

    // If difficulty names were provided, render a horizontal selectable list here
    if (this.difficultyNames) {
      const difficultyY = (this.config.skillRating ? endTurnY + 46 + 46 : endTurnY + 46); // place below end-turn control or skill slider
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

    // ── Debug Tools section (dev mode only) ────────────────
    const debugTools = this.config.debugTools;
    if (isDevMode() && debugTools && debugTools.length > 0) {
      // Calculate Y position after all existing sections
      let debugSectionY = endTurnY + 28;
      if (this.config.skillRating) {
        // Skill rating adds ~76px (label + slider)
        debugSectionY += 76;
      }
      if (this.difficultyNames && this.difficultyNames.length > 0) {
        // Difficulty adds ~52px (label + tip text)
        debugSectionY += 52;
      }
      debugSectionY += 20; // gap after last section

      const debugHeading = scene.add.text(
        PADDING,
        debugSectionY,
        'Debug Tools',
        { ...HEADING_STYLE, fontSize: '16px' },
      );
      debugHeading.setDepth(DEPTH_PANEL_CONTENT);
      this.container.add(debugHeading);

      let toolY = debugSectionY + 36;
      for (const tool of debugTools) {
        // Label (clickable)
        const label = scene.add.text(PADDING, toolY, tool.label, {
          ...LABEL_STYLE,
          color: '#88ccff',
        });
        label.setOrigin(0, 0.5);
        label.setDepth(DEPTH_PANEL_CONTENT);
        label.setInteractive({ useHandCursor: true });
        label.on('pointerdown', () => {
          if (!this.destroyed) {
            tool.activate(this.scene);
          }
        });
        label.on('pointerover', () => label.setColor('#aaddff'));
        label.on('pointerout', () => label.setColor('#88ccff'));
        this.container.add(label);

        // Description (smaller, below label)
        const desc = scene.add.text(PADDING, toolY + 22, tool.description, {
          fontSize: '12px',
          color: '#aaaaaa',
          fontFamily: 'Arial, sans-serif',
          wordWrap: { width: this.panelWidth - PADDING * 2 },
        });
        desc.setOrigin(0, 0.5);
        desc.setDepth(DEPTH_PANEL_CONTENT);
        this.container.add(desc);

        toolY += 52; // spacing for next tool
      }
    }

    // Scene-level pointer events for slider dragging
    scene.input.on('pointermove', this.handlePointerMove, this);
    scene.input.on('pointerup', this.handlePointerUp, this);

    // After constructing child objects, parent into HUD container and apply
    // absolute depths so the settings panel renders above gameplay content.
    try {
      const overlayRoot: any = (scene as any).hudContainer;
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

    // Create integrated button when showButton is true
    if (showButton) {
      this._settingsButton = new SettingsButton(scene, this, {
        x: config.buttonPosition?.x,
        y: config.buttonPosition?.y,
      });
    }

    // Version label — created hidden, shown when the panel opens
    this._versionLabel = createVersionLabel(scene, DEPTH_VERSION_LABEL);
    this._versionLabel.setVisible(false);

    // Set entire container invisible initially
    this.container.setVisible(false);
  }

  // ── End Turn keybind capture ─────────────────────────

  private beginEndTurnKeyCapture(): void {
    if (this.destroyed || this._awaitingEndTurnKey) return;
    this._awaitingEndTurnKey = true;
    if (this._endTurnInstruction) this._endTurnInstruction.setText('Press a key...');

    this._endTurnCaptureListener = (ev: KeyboardEvent) => this.captureEndTurnKey(ev);
    if (this.scene.input && this.scene.input.keyboard && this._endTurnCaptureListener) {
      this.scene.input.keyboard.on('keydown', this._endTurnCaptureListener);
    } else if (typeof window !== 'undefined') {
      // Fallback for environments without Phaser keyboard wrapper
      window.addEventListener('keydown', this._endTurnCaptureListener as EventListener);
    }
  }

  private captureEndTurnKey(ev: KeyboardEvent): void {
    if (!this._awaitingEndTurnKey) return;
    const keyName = ev.key || 'Enter';
    // Persist
    try { setEndTurnKeybind(keyName, (window as any).localStorage); } catch (_) { setEndTurnKeybind(keyName); }
    if (this._endTurnKeyText) this._endTurnKeyText.setText(keyName);
    if (this._endTurnInstruction) this._endTurnInstruction.setText('');
    this._awaitingEndTurnKey = false;

    // Remove listener
    if (this._endTurnCaptureListener) {
      if (this.scene.input && this.scene.input.keyboard) {
        this.scene.input.keyboard.off('keydown', this._endTurnCaptureListener);
      } else if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this._endTurnCaptureListener as EventListener);
      }
      this._endTurnCaptureListener = null;
    }
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

    // Show version label on the canvas
    this._versionLabel.setVisible(true);
    this.syncControlsToSoundManager();
    this.createInputBlocker();

    // Ensure settings panel sits at top of overlay root ordering when opened.
    try {
      const overlayRoot: any = (this.scene as any).hudContainer;
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

    // Hide version label
    this._versionLabel.setVisible(false);

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

    // Remove any pending end-turn capture listener
    if (this._endTurnCaptureListener) {
      if (this.scene.input && this.scene.input.keyboard) {
        this.scene.input.keyboard.off('keydown', this._endTurnCaptureListener);
      } else if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this._endTurnCaptureListener as EventListener);
      }
      this._endTurnCaptureListener = null;
      this._awaitingEndTurnKey = false;
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

    // Destroy the integrated button
    if (this._settingsButton) {
      this._settingsButton.destroy();
      this._settingsButton = null;
    }

    // Destroy version label
    if (this._versionLabel) {
      this._versionLabel.destroy();
    }

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
    this.saveTooltipPreference(this._showTooltips);
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

  // ── Card Design selector helpers ────────────────────────

  /** Handle a card design selection click. */
  private handleCardDesignSelect(designKey: string): void {
    if (this.destroyed) return;
    this._cardDesignKey = designKey;
    this.saveCardDesignPreference(designKey);

    // Update visual state of the design name list
    for (const txt of this.cardDesignTextObjects) {
      const txtKey = (txt as any).tceCardDesignKey as string | undefined;
      if (!txtKey) continue;
      if (txtKey === designKey) {
        txt.setColor((HEADING_STYLE.color as string) ?? '#f0c040');
      } else {
        txt.setColor(VALUE_STYLE.color as string);
      }
    }

    // Dispatch a DOM event so that the current game scene can reload
    // card textures immediately.
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('tce:card-design-changed', {
          detail: { designKey },
        }));
      }
    } catch {
      // ignore dispatch failures
    }
  }

  /** Load persisted card design from localStorage. */
  private loadCardDesignPreference(): string {
    if (typeof window === 'undefined' || !window.localStorage) {
      return getCardDesign(null);
    }
    return getCardDesign(window.localStorage);
  }

  /** Save card design preference to localStorage. */
  private saveCardDesignPreference(designKey: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      setCardDesign(designKey, window.localStorage);
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

  private loadTooltipPreference(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return true;
    }
    return getTooltips(window.localStorage);
  }

  private saveTooltipPreference(enabled: boolean): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    setTooltips(enabled, window.localStorage);
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
    if (this.destroyed || !this._isOpen) return;
    if (this.isDraggingSlider) {
      this.handleSliderInteraction(_pointer);
      return;
    }
    if (this.isDraggingSkillSlider) {
      this.handleSkillSliderInteraction(_pointer);
      return;
    }
  };

  private handlePointerUp = (): void => {
    this.isDraggingSlider = false;
    this.isDraggingSkillSlider = false;
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

  // ── Private: Skill rating slider ───────────────────────────

  private handleSkillSliderInteraction(pointer: Phaser.Input.Pointer): void {
    if (this.destroyed || !this.config.skillRating) return;

    // Convert world pointer position to container-local x
    const localX = pointer.x - this.container.x;
    const clampedX = Phaser.Math.Clamp(
      localX,
      this.skillTrackX,
      this.skillTrackX + this.skillTrackWidth,
    );
    const ratio = (clampedX - this.skillTrackX) / this.skillTrackWidth;

    const srConfig = this.config.skillRating;
    const range = srConfig.max - srConfig.min;
    const value = Math.round(srConfig.min + ratio * range);
    const clampedValue = Phaser.Math.Clamp(value, srConfig.min, srConfig.max);

    this._skillRatingValue = clampedValue;
    this.updateSkillSliderVisuals(clampedValue, srConfig);
    srConfig.onChange(clampedValue);
  }

  private updateSkillSliderVisuals(
    value: number,
    config: { min: number; max: number },
  ): void {
    if (!this.skillSliderFill) return;
    const ratio = (value - config.min) / (config.max - config.min);
    const fillWidth = Math.max(1, this.skillTrackWidth * ratio);
    try {
      this.skillSliderFill.setSize(fillWidth, SLIDER_TRACK_HEIGHT);
      this.skillSliderFill.setX(this.skillTrackX + fillWidth / 2);
    } catch (_) { /* ignore runtime layout failures in tests */ }

    const handleX = this.skillTrackX + this.skillTrackWidth * ratio;
    this.drawSkillSliderHandle(handleX, this.skillSliderTrack ? this.skillSliderTrack.y : 0);

    try { this.skillValueText.setText(`${value}`); } catch (_) { /* ignore */ }
  }

  private drawSkillSliderHandle(x: number, y: number): void {
    this.skillSliderHandle.clear();
    this.skillSliderHandle.fillStyle(SLIDER_HANDLE_COLOR, 1);
    this.skillSliderHandle.fillCircle(x, y, SLIDER_HANDLE_RADIUS);
    // Border
    this.skillSliderHandle.lineStyle(2, SLIDER_FILL_COLOR, 1);
    this.skillSliderHandle.strokeCircle(x, y, SLIDER_HANDLE_RADIUS);
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

    // Parent input blocker into HUD container if available so it is not
    // removed during scene rebuilds.
    try {
      const overlayRoot: any = (this.scene as any).hudContainer;
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
