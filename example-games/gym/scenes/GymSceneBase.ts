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
import { getReducedMotion, setReducedMotion } from '../../../src/ui/SettingsStore';
import { runSceneTransition } from '../../../src/ui/sceneTransition';
import { getZoneRect, anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument, type ScreenLayoutDocument, type PixelPoint, type PixelRect } from '../../../src/ui/screen-layout-schema';
import gymScenesLayoutJson from '../layouts/gym-scenes.layout.json';

// Parse the shared Gym scenes layout once at module load.
const GYM_SCENES_LAYOUT: ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymScenesLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Abstract base class for Gym demo scenes.
 *
 * Call `initHeader()` early in your `create()` method to set up
 * the standard Gym scene header (title text + menu button).
 */
export abstract class GymSceneBase extends Phaser.Scene {
  /** Scene header elements (title + menu button). */
  protected header!: SceneHeaderResult;
  /** Divider line drawn below the header. */
  protected headerDivider?: Phaser.GameObjects.Graphics;

  /** Whether reduced motion is currently enabled. Scenes and helpers
   *  should consult this property to skip or shorten animations when true. */
  private _reducedMotion: boolean = false;

  constructor(config: Phaser.Types.Scenes.SettingsConfig) {
    super(config);
  }

  /**
   * Whether reduced motion is enabled.
   *
   * When true, scenes should skip tween animations and apply instant state
   * changes instead. Helpers like flipCard, dealCard, etc. that accept a
   * `reducedMotion` override should be passed this value.
   *
   * The value is initialised from the SettingsStore and the browser
   * prefers-reduced-motion media query on each scene create(). It can also
   * be toggled programmatically via `setReducedMotionProperty()`.
   */
  get reducedMotion(): boolean {
    return this._reducedMotion;
  }

  /**
   * Programmatically override the reduced-motion flag for this scene.
   *
   * Primarily useful in headless tests to force reduced-motion mode
   * without requiring a DOM or SettingsStore backend.
   */
  setReducedMotionProperty(value: boolean): void {
    this._reducedMotion = value;
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

  // ── Reduced-motion helper ─────────────────────────────────

  /**
   * Read the current reduced-motion preference from the SettingsStore
   * (and the DOM media query as a fallback) and cache it in
   * `this.reducedMotion`.
   *
   * Call this early in your scene's `create()` method (after
   * `initHeader()`).
   */
  protected initReducedMotion(): void {
    // Check SettingsStore first, then DOM media query
    const storedPreference = getReducedMotion();
    const domPreference = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    this._reducedMotion = storedPreference || domPreference;
  }

  /**
   * Toggle the reduced-motion setting and persist it to SettingsStore.
   *
   * This also updates `this.reducedMotion` so any subsequent animation
   * checks use the new value.
   */
  protected toggleReducedMotion(): void {
    this._reducedMotion = !this._reducedMotion;
    setReducedMotion(this._reducedMotion);
  }

  // ── Scene transition hook ─────────────────────────────────

  /**
   * Run an animated enter transition when the scene starts.
   *
   * Call this from your scene's create() to fade or slide in.
   * When reduced-motion is enabled, the transition is skipped
   * (returns a resolved Promise immediately).
   *
   * @param type  Transition type: 'fade' or 'slide'
   * @param duration  Duration in ms (default 300)
   * @returns Promise that resolves when the transition completes
   */
  protected runEnterTransition(
    type: 'fade' | 'slide' = 'fade',
    duration: number = 300,
  ): Promise<void> {
    return runSceneTransition({
      scene: this,
      mode: 'enter',
      type,
      duration,
      reducedMotion: this.reducedMotion,
    });
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
    this.headerDivider = this.add.graphics();
    this.headerDivider.lineStyle(1, 0x336633, 0.6);
    this.headerDivider.beginPath();
    this.headerDivider.moveTo(20, yOffset);
    this.headerDivider.lineTo(GAME_W - 20, yOffset);
    this.headerDivider.strokePath();
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

  /**
   * Show or hide the shared help chrome for scenes that reuse HelpPanel/HelpButton.
   */
  protected setHelpChromeVisible(visible: boolean): void {
    this.helpPanel?.setVisible(visible);
    this.helpButton?.setVisible(visible);
  }

  /**
   * Show or hide the standard Gym header chrome (title, menu button, divider).
   */
  protected setHeaderChromeVisible(visible: boolean): void {
    this.header.title.setVisible(visible);
    this.header.menuButton.setVisible(visible);
    this.headerDivider?.setVisible(visible);
  }

  // ── SLL layout helpers ────────────────────────────────────

  /**
   * Get the shared Gym scenes SLL layout document, or `null` if unavailable.
   *
   * Scenes can use this to access zone/anchor positions for SLL-driven layout.
   */
  protected getGymScenesLayout(): ScreenLayoutDocument | null {
    return GYM_SCENES_LAYOUT;
  }

  /**
   * Get a zone rectangle from the shared Gym scenes layout.
   *
   * Falls back to the default viewport (1280x720) if no custom viewport is provided.
   * Returns `undefined` if the SLL layout is unavailable.
   *
   * @param zoneName  Name of the zone (e.g. 'content', 'controls', 'cardDisplay')
   * @param viewport  Optional custom viewport dimensions
   * @returns PixelRect for the zone, or undefined
   */
  protected getGymZoneRect(zoneName: string, viewport = DEFAULT_VIEWPORT): PixelRect | undefined {
    if (!GYM_SCENES_LAYOUT) return undefined;
    return getZoneRect(GYM_SCENES_LAYOUT, zoneName, viewport, 1);
  }

  /**
   * Get an anchor point from a zone in the shared Gym scenes layout.
   *
   * Falls back to the default viewport (1280x720) if no custom viewport is provided.
   * Returns `undefined` if the SLL layout is unavailable.
   *
   * @param zoneName   Name of the zone
   * @param anchorName Name of the anchor within the zone
   * @param viewport   Optional custom viewport dimensions
   * @returns PixelPoint for the anchor, or undefined
   */
  protected getGymAnchor(zoneName: string, anchorName: string, viewport = DEFAULT_VIEWPORT): PixelPoint | undefined {
    if (!GYM_SCENES_LAYOUT) return undefined;
    return anchorPoint(GYM_SCENES_LAYOUT, zoneName, anchorName, viewport, 1);
  }

  /**
   * Create a label positioned at an SLL anchor point.
   *
   * If the SLL layout is unavailable, falls back to the provided fallback coordinates.
   *
   * @param zoneName   Zone to position within
   * @param anchorName Anchor within the zone
   * @param fallbackX  Fallback X if SLL is unavailable
   * @param fallbackY  Fallback Y if SLL is unavailable
   * @param text       Label text
   * @param opts       Optional text styling
   */
  protected addLabelAtAnchor(
    zoneName: string,
    anchorName: string,
    fallbackX: number,
    fallbackY: number,
    text: string,
    opts?: Partial<{ fontSize: string; color: string }>,
  ): Phaser.GameObjects.Text {
    const anchor = this.getGymAnchor(zoneName, anchorName);
    const x = anchor?.x ?? fallbackX;
    const y = anchor?.y ?? fallbackY;
    return this.addLabel(x, y, text, opts);
  }

  /**
   * Create a button positioned at an SLL anchor point.
   *
   * If the SLL layout is unavailable, falls back to the provided fallback coordinates.
   *
   * @param zoneName   Zone to position within
   * @param anchorName Anchor within the zone
   * @param fallbackX  Fallback X if SLL is unavailable
   * @param fallbackY  Fallback Y if SLL is unavailable
   * @param label      Button label
   * @param callback   Button click handler
   * @param opts       Optional button styling
   */
  protected addButtonAtAnchor(
    zoneName: string,
    anchorName: string,
    fallbackX: number,
    fallbackY: number,
    label: string,
    callback: () => void,
    opts?: Partial<{ fontSize: string; color: string; hoverColor: string }>,
  ): Phaser.GameObjects.Text {
    const anchor = this.getGymAnchor(zoneName, anchorName);
    const x = anchor?.x ?? fallbackX;
    const y = anchor?.y ?? fallbackY;
    return this.addButton(x, y, label, callback, opts);
  }
}
