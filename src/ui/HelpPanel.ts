/**
 * HelpPanel – A reusable left-side help panel for the Tableau Card Engine.
 *
 * Accepts an array of { heading, body } content sections and renders them
 * in a configurable, scrollable, animated side panel with input blocking.
 *
 * @module @ui/HelpPanel
 */
import Phaser from 'phaser';

// ── Public types ────────────────────────────────────────────

/** A single content section displayed in the help panel. */
export interface HelpSection {
  heading: string;
  body: string;
}

/** Configuration for the HelpPanel constructor. */
export interface HelpPanelConfig {
  /** Content sections to display. */
  sections: HelpSection[];
  /** Panel width as a percentage of canvas width (0-100). Default: 35. */
  widthPercent?: number;
  /** Slide animation duration in ms. Default: 300. */
  animationDuration?: number;
  /** Keyboard shortcut key code to toggle the panel. Default: 'FORWARD_SLASH' (with shift = '?'). */
  toggleKey?: string;
}

// ── Style constants ─────────────────────────────────────────

const PANEL_BG_COLOR = 0x1a1a2e;
const PANEL_BG_ALPHA = 0.95;
const HEADING_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '18px',
  color: '#f0c040',
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
  wordWrap: { useAdvancedWrap: true },
};
const BODY_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '14px',
  color: '#dddddd',
  fontFamily: 'Arial, sans-serif',
  lineSpacing: 4,
  wordWrap: { useAdvancedWrap: true },
};
const CLOSE_BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '20px',
  color: '#aaaaaa',
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'bold',
};
const PADDING = 20;
const SECTION_GAP = 16;
const HEADING_BODY_GAP = 6;
const TRACK_BAR_WIDTH = 4;
const TRACK_BAR_COLOR = 0x888888;
const TRACK_BAR_ALPHA = 0.6;
const CLOSE_BUTTON_PADDING = 8;
const SCROLL_SPEED = 30;

// Depth layers (high values so panel renders above game content)
const DEPTH_INPUT_BLOCKER = 900;
const DEPTH_PANEL_BG = 901;
const DEPTH_PANEL_CONTENT = 902;
const DEPTH_CLOSE_BUTTON = 903;
const DEPTH_HELP_BUTTON = 904;

export { DEPTH_HELP_BUTTON };

// ── HelpPanel class ─────────────────────────────────────────

export class HelpPanel {
  private readonly scene: Phaser.Scene;
  private readonly config: Required<HelpPanelConfig>;
  private readonly panelWidth: number;
  private readonly canvasHeight: number;

  // Game objects
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private contentContainer: Phaser.GameObjects.Container;
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;
  private maskGraphics: Phaser.GameObjects.Graphics | null = null;
  private trackBar: Phaser.GameObjects.Rectangle | null = null;
  private closeButton: Phaser.GameObjects.Text;
  private inputBlocker: Phaser.GameObjects.Rectangle | null = null;

  // State
  private _isOpen = false;
  private _isAnimating = false;
  private currentTween: Phaser.Tweens.Tween | null = null;
  private totalContentHeight = 0;
  private scrollOffset = 0;
  private maxScroll = 0;
  private destroyed = false;

  // Keyboard
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;

  constructor(scene: Phaser.Scene, config: HelpPanelConfig) {
    this.scene = scene;
    this.config = {
      sections: config.sections,
      widthPercent: config.widthPercent ?? 35,
      animationDuration: config.animationDuration ?? 300,
      toggleKey: config.toggleKey ?? 'FORWARD_SLASH',
    };

    const canvasWidth = scene.scale.width;
    this.canvasHeight = scene.scale.height;
    this.panelWidth = Math.floor(canvasWidth * (this.config.widthPercent / 100));

    // Build the panel (hidden off-screen to the left)
    this.container = scene.add.container(-this.panelWidth, 0);
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

    // Close button ("X") at top-right of panel
    this.closeButton = scene.add.text(
      this.panelWidth - CLOSE_BUTTON_PADDING - 20,
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

    // Content container (will be masked for scrolling)
    const contentTopY = PADDING + 10; // leave room for close button
    this.contentContainer = scene.add.container(0, contentTopY);
    this.contentContainer.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.contentContainer);

    // Build content sections
    this.buildContent();

    // Setup scrolling mask and track bar
    this.setupScrollMask(contentTopY);

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

  /** Open the help panel with slide-in animation. */
  open(): void {
    if (this.destroyed) return;
    if (this._isOpen && !this._isAnimating) return;

    this._isOpen = true;
    this.container.setVisible(true);
    this.resetScroll();
    this.createInputBlocker();

    // Stop any existing tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    this._isAnimating = true;
    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      x: 0,
      duration: this.config.animationDuration,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.updateMask(),
      onComplete: () => {
        this._isAnimating = false;
        this.currentTween = null;
        this.updateMask();
      },
    });
  }

  /** Close the help panel with slide-out animation. */
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
      x: -this.panelWidth,
      duration: this.config.animationDuration,
      ease: 'Cubic.easeIn',
      onUpdate: () => this.updateMask(),
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

    // Remove wheel listener
    this.scene.input.off('wheel', this.handleWheel, this);

    // Stop any running tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    // Remove input blocker
    this.removeInputBlocker();

    // Destroy mask resources
    if (this.contentMask) {
      this.contentContainer.clearMask(true);
      this.contentMask = null;
    }
    if (this.maskGraphics) {
      this.maskGraphics.destroy();
      this.maskGraphics = null;
    }

    // Destroy the main container (destroys all children)
    this.container.destroy();
  }

  // ── Private: Content building ─────────────────────────────

  private buildContent(): void {
    const textWidth = this.panelWidth - PADDING * 2 - TRACK_BAR_WIDTH - 4;
    let yOffset = 0;

    for (const section of this.config.sections) {
      // Heading
      const heading = this.scene.add.text(PADDING, yOffset, section.heading, {
        ...HEADING_STYLE,
        wordWrap: { width: textWidth, useAdvancedWrap: true },
      });
      this.contentContainer.add(heading);
      yOffset += heading.height + HEADING_BODY_GAP;

      // Body
      const body = this.scene.add.text(PADDING, yOffset, section.body, {
        ...BODY_STYLE,
        wordWrap: { width: textWidth, useAdvancedWrap: true },
      });
      this.contentContainer.add(body);
      yOffset += body.height + SECTION_GAP;
    }

    this.totalContentHeight = yOffset;
  }

  // ── Private: Scroll mask and track bar ────────────────────

  private setupScrollMask(contentTopY: number): void {
    const visibleHeight = this.canvasHeight - contentTopY - PADDING;
    this.maxScroll = Math.max(0, this.totalContentHeight - visibleHeight);

    if (this.maxScroll <= 0) return; // No scrolling needed

    // Create a geometry mask to clip content
    this.maskGraphics = this.scene.add.graphics();
    this.maskGraphics.fillStyle(0xffffff);
    // The mask position needs to account for the container's transform.
    // We draw relative to world coordinates; we'll update on scroll.
    this.maskGraphics.fillRect(0, contentTopY, this.panelWidth, visibleHeight);
    this.maskGraphics.setVisible(false);

    this.contentMask = new Phaser.Display.Masks.GeometryMask(this.scene, this.maskGraphics);
    this.contentContainer.setMask(this.contentMask);

    // Track bar
    const trackBarHeight = Math.max(
      20,
      (visibleHeight / this.totalContentHeight) * visibleHeight,
    );
    this.trackBar = this.scene.add.rectangle(
      this.panelWidth - TRACK_BAR_WIDTH / 2 - 2,
      contentTopY,
      TRACK_BAR_WIDTH,
      trackBarHeight,
      TRACK_BAR_COLOR,
      TRACK_BAR_ALPHA,
    );
    this.trackBar.setOrigin(0.5, 0);
    this.container.add(this.trackBar);

    // Scroll listeners
    this.scene.input.on('wheel', this.handleWheel, this);

    // Store visible height for scroll calculations
    (this as unknown as Record<string, number>)._visibleHeight = visibleHeight;
    (this as unknown as Record<string, number>)._contentTopY = contentTopY;
  }

  private handleWheel = (
    _pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    if (!this._isOpen || this._isAnimating || this.destroyed) return;
    if (this.maxScroll <= 0) return;

    this.scrollOffset = Phaser.Math.Clamp(
      this.scrollOffset + (deltaY > 0 ? SCROLL_SPEED : -SCROLL_SPEED),
      0,
      this.maxScroll,
    );

    this.applyScroll();
  };

  private applyScroll(): void {
    const contentTopY = (this as unknown as Record<string, number>)._contentTopY ?? PADDING + 10;
    this.contentContainer.setY(contentTopY - this.scrollOffset);

    // Update mask position to follow container x (for slide animation)
    this.updateMask();

    // Update track bar position
    if (this.trackBar && this.maxScroll > 0) {
      const visibleHeight =
        (this as unknown as Record<string, number>)._visibleHeight ??
        this.canvasHeight - contentTopY - PADDING;
      const scrollRatio = this.scrollOffset / this.maxScroll;
      const trackBarRange = visibleHeight - this.trackBar.height;
      this.trackBar.setY(contentTopY + scrollRatio * trackBarRange);
    }
  }

  private resetScroll(): void {
    this.scrollOffset = 0;
    const contentTopY = (this as unknown as Record<string, number>)._contentTopY ?? PADDING + 10;
    this.contentContainer.setY(contentTopY);

    if (this.trackBar) {
      this.trackBar.setY(contentTopY);
    }

    this.updateMask();
  }

  /**
   * Redraw the geometry mask at the container's current world-x position.
   * Must be called on every frame during the slide animation so the mask
   * tracks the panel and content remains visible.
   */
  private updateMask(): void {
    if (!this.maskGraphics) return;

    const contentTopY = (this as unknown as Record<string, number>)._contentTopY ?? PADDING + 10;
    const visibleHeight =
      (this as unknown as Record<string, number>)._visibleHeight ??
      this.canvasHeight - contentTopY - PADDING;

    this.maskGraphics.clear();
    this.maskGraphics.fillStyle(0xffffff);
    this.maskGraphics.fillRect(this.container.x, contentTopY, this.panelWidth, visibleHeight);
  }

  // ── Private: Input blocking ───────────────────────────────

  private createInputBlocker(): void {
    if (this.inputBlocker) return;

    const canvasWidth = this.scene.scale.width;
    this.inputBlocker = this.scene.add.rectangle(
      canvasWidth / 2,
      this.canvasHeight / 2,
      canvasWidth,
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

  // ── Private: Keyboard shortcut ────────────────────────────

  private setupKeyboardShortcut(): void {
    if (!this.scene.input.keyboard) return;

    this.keyboardListener = (event: KeyboardEvent) => {
      if (this.destroyed) return;

      // Check for '?' key (Shift + /)
      if (this.config.toggleKey === 'FORWARD_SLASH') {
        if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
          this.toggle();
        }
      }
    };

    this.scene.input.keyboard.on('keydown', this.keyboardListener);
  }
}
