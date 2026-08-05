/**
 * GymOverlayUiScene -- Demonstrates overlays, help/settings components,
 * live UI configuration, and GeometryMask clipping using core-engine UI APIs.
 *
 * Features:
 *   - Open and close help/settings overlays
 *   - Toggle feedback intensity settings
 *   - Verify overlay lifecycle (no state leaks)
 *   - Scrollable content area clipped with GeometryMask
 *   - Mask position updates during overlay animation
 *   - Mask is destroyed on overlay dismiss
 *
 * @module example-games/gym/scenes/GymOverlayUiScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_OVERLAY_UI_KEY } from '../GymRegistry';
import { GAME_W } from '../../../src/ui/constants';
import { createOverlayBackground, dismissOverlay } from '../../../src/ui/Overlay';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymOverlayUiLayoutJson from '../layouts/gym-overlay-ui.layout.json';
import {
  DEFAULT_VIEWPORT,
  SCENE_HEADER_Y,
  EVENT_LOG_Y_OFFSET,
  EVENT_LOG_MAX_LINES_DEFAULT,
  EVENT_LOG_LINE_HEIGHT_DEFAULT,
  EVENT_LOG_FONT_SIZE,
  EVENT_LOG_HEADER_FONT_SIZE,
  EVENT_LOG_HEADER_COLOR,
  EVENT_LOG_LINE_X,
  INTENSITY_STEP,
  INTENSITY_FONT_SIZE,
  INTENSITY_TEXT_COLOR,
  STATUS_FONT_SIZE,
  STATUS_TEXT_COLOR,
  DEFAULT_FONT_SIZE,
  OVERLAY_INTERACTION_GUARD_MS,
  OVERLAY_BASE_COLOR,
  OVERLAY_MIN_BRIGHTNESS,
  OVERLAY_ALPHA_MIN,
  OVERLAY_ALPHA_MAX,
  OVERLAY_MASK_WIDTH,
  OVERLAY_MASK_HEIGHT,
  OVERLAY_SCROLL_BASE_Y,
  OVERLAY_TEXT_LINE_HEIGHT,
  OVERLAY_TEXT_FONT_SIZE,
  OVERLAY_TEXT_X,
  OVERLAY_SCROLLBAR_OFFSET_X,
  OVERLAY_SCROLLBAR_WIDTH,
  OVERLAY_SCROLLBAR_TRACK_COLOR,
  OVERLAY_SCROLLBAR_TRACK_ALPHA,
  OVERLAY_SCROLLBAR_THUMB_COLOR,
  OVERLAY_SCROLLBAR_THUMB_ALPHA,
  OVERLAY_SCROLLBAR_MIN_THUMB,
  OVERLAY_SCROLL_FACTOR,
  OVERLAY_MASK_DEPTH,
  OVERLAY_SCROLLBAR_TRACK_DEPTH,
  OVERLAY_SCROLLBAR_THUMB_DEPTH,
  OVERLAY_INFO_Y,
  OVERLAY_DISMISS_Y,
  OVERLAY_INTENSITY_Y,
  OVERLAY_INTENSITY_BTN_X_OFFSET,
  OVERLAY_INTENSITY_BTN_FONT_SIZE,
  OVERLAY_LOG_MAX_LINES,
} from './GymConstants';

// ── Scrollable content generation ────────────────────────────

// Line of text repeated to pad content to desired length.
// Use descriptive content about the overlay/mask rather than lorem ipsum.
const CONTENT_PAD = [
  'The GeometryMask clips this',
  'content to a fixed rectangle.',
  '',
  'Scroll to see more details',
  'about how the engine works.',
  '',
  'Each line is added as a child',
  'of the masked container, which',
  'is positioned at the mask origin.',
  '',
  'When the overlay closes, all',
  'mask resources are freed.',
  '',
  'This creates a clean lifecycle',
  'with no memory leaks.',
];

/**
 * Generate enough text lines to require scrolling.
 * 14 header + 4 * 14 pad = 70 lines → 70 * 16 = 1120px >> 200px mask.
 */
function generateScrollableContent(): string[] {
  const lines: string[] = [];
  lines.push('Masked Content Area');
  lines.push('─────────────────────');
  lines.push('');
  lines.push('This overlay demonstrates a');
  lines.push('GeometryMask-clipped region');
  lines.push('that can be scrolled using');
  lines.push('the mouse wheel or touch drag.');
  lines.push('');
  lines.push('─ Mask Properties ─');
  lines.push('Size: 300 x 200 px');
  lines.push('Lines: uses 16px spacing');
  lines.push('Scroll: wheel + drag');
  lines.push('');
  lines.push('─ How Scrolling Works ─');
  lines.push('The masked container moves');
  lines.push('vertically inside the clip');
  lines.push('region, revealing different');
  lines.push('parts of the text content.');
  lines.push('');
  lines.push('The scrollbar on the right');
  lines.push('shows the current position');
  lines.push('relative to total content.');
  lines.push('');
  lines.push('─ Implementation ─');
  lines.push('1. A Graphics object defines');
  lines.push('   the clip region shape.');
  lines.push('2. A GeometryMask is created');
  lines.push('   from that graphics shape.');
  lines.push('3. A Container holds all the');
  lines.push('   scrollable child objects.');
  lines.push('4. The mask is applied to the');
  lines.push('   container via setMask().');
  lines.push('5. Adjusting the container Y');
  lines.push('   scrolls content within the');
  lines.push('   fixed clip region.');
  lines.push('');
  lines.push('─ Scroll Tips ─');
  lines.push('Use mouse wheel to scroll.');
  lines.push('Scrollbar shows position.');
  lines.push('Position resets on reopen.');
  lines.push('');
  // Add padding lines to ensure scrolling is necessary
  for (let pass = 0; pass < 4; pass++) {
    for (const pad of CONTENT_PAD) {
      lines.push(pad);
    }
  }
  return lines;
}

// Parse the shared Overlay UI scene layout once at module load.
const OVERLAY_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymOverlayUiLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

/**
 * Resolve an anchor from the Overlay UI SLL layout.
 * Falls back to the default viewport if no layout is available.
 */
function resolveOverlayAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!OVERLAY_LAYOUT) {
    return { x: GAME_W / 2, y: SCENE_HEADER_Y };
  }
  return anchorPoint(OVERLAY_LAYOUT, zone, anchor, viewport, 1);
}

export class GymOverlayUiScene extends GymSceneBase {
  private overlayObjects: Phaser.GameObjects.GameObject[] | null = null;
  private overlayOpen = false;
  private feedbackIntensity = 1.0;
  private intensityText!: Phaser.GameObjects.Text;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  private overlayIntensityText: Phaser.GameObjects.Text | null = null;

  // Mask references for GeometryMask demo
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;
  private maskedContainer: Phaser.GameObjects.Container | null = null;

  // Scroll state for the masked content area
  private _overlayScroller: {
    scrollY: number;
    maxScrollY: number;
    lineCount: number;
  } | null = null;
  private _wheelHandlerRef: ((pointer: any, gameObjects: any[], deltaX: number, deltaY: number, deltaZ: number) => void) | null = null;
  private _scrollAreaBaseY = OVERLAY_SCROLL_BASE_Y;
  private _maskW = OVERLAY_MASK_WIDTH;
  private _maskH = OVERLAY_MASK_HEIGHT;

  // Guard to prevent background clicks from immediately closing the overlay
  private overlayInteractionGuard = false;

  constructor() {
    super({ key: GYM_OVERLAY_UI_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Overlay & UI Config');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates overlay creation and dismissal using createOverlayBackground() and dismissOverlay(), along with live UI configuration via feedback intensity controls. Also showcases GeometryMask clipping for scrollable content regions within overlays. In a real card game, overlays are used for confirmation dialogs ("Are you sure you want to quit?"), rule reminders, or modal messages that temporarily block interaction with the game board.'
      },
      {
        heading: 'Controls',
        body: '[ Show Overlay ]: Open a dismissible overlay with masked scrollable content area. Click the overlay background to dismiss.\n[ Dismiss Overlay ]: Programmatically close the overlay if it is open.\n[ Intensity - ] / [ Intensity + ]: Decrease or increase feedback intensity by 0.2 steps (range 0-1). Affects overlay brightness and alpha in real time. Also adjustable from inside the overlay via [-] and [+] buttons.\nClose button inside overlay: Click the dismiss link or overlay background to close.'
      },
      {
        heading: 'Usage Example',
        body: 'In a game of Golf, after a player completes a round, an overlay appears showing the final score, statistics, and a confirmation to start a new game. The overlay uses a semi-transparent background to keep the game board visible underneath, and the intensity controls let the player dim or brighten the overlay for comfort. The GeometryMask clips a scrollable rules summary to a fixed-size region.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Show Overlay ] → overlay appears with semi-transparent background\n2. Verify overlay contains scrollable masked content area with clipped text\n3. Press [ Intensity - ] three times → intensity drops from 1.0 to 0.4, overlay dims\n4. Press [ Intensity + ] twice → intensity returns to 0.8\n5. Click the overlay background → overlay dismisses, event log confirms\n6. Open overlay again, click [ Dismiss Overlay ] button inside overlay → overlay closes\n7. Press outside overlay interaction guard → verify no accidental dismissal'
      }
    ]);

    const controlsAnchor = resolveOverlayAnchor('controls', 'center');
    const cx = controlsAnchor.x;
    const y = controlsAnchor.y;

    this.initButtonBar(y);
    this.buttonBar!.addButton('[ Show Overlay ]', () => this.openOverlay(), { zone: 'center' });
    this.buttonBar!.addButton('[ Dismiss Overlay ]', () => this.closeOverlay(), { zone: 'center' });
    this.buttonBar!.addButton('[ Intensity - ]', () => this.adjustIntensity(-INTENSITY_STEP), { zone: 'center' });
    this.buttonBar!.addButton('[ Intensity + ]', () => this.adjustIntensity(INTENSITY_STEP), { zone: 'center' });

    const intensityAnchor = resolveOverlayAnchor('intensity', 'center');
    this.intensityText = createHudText(this, cx, intensityAnchor.y, 'Feedback Intensity: 1.0', INTENSITY_TEXT_COLOR, { fontSize: INTENSITY_FONT_SIZE });
    this.intensityText.setOrigin(0.5);

    const logAnchor = resolveOverlayAnchor('log', 'center');
    this.eventLogResult = createEventLog(this, logAnchor.y + EVENT_LOG_Y_OFFSET, {
      headerText: '── Event Log ──',
      maxLines: EVENT_LOG_MAX_LINES_DEFAULT,
      lineHeight: EVENT_LOG_LINE_HEIGHT_DEFAULT,
      textColor: '#aaddaa',
      fontSize: EVENT_LOG_FONT_SIZE,
      headerFontSize: EVENT_LOG_HEADER_FONT_SIZE,
      headerColor: EVENT_LOG_HEADER_COLOR,
      lineX: EVENT_LOG_LINE_X,
    });
  }

  private openOverlay(): void {
    if (this.overlayOpen) {
      this.logEvent('Overlay already open; ignoring');
      return;
    }
    // Create overlay with base color and seeded alpha
    const result = createOverlayBackground(this, { color: OVERLAY_BASE_COLOR, alpha: OVERLAY_ALPHA_MAX });
    this.overlayObjects = result.objects;
    this.overlayOpen = true;

    // Make overlay background dismissible by clicking
    try {
      result.background.on('pointerdown', () => {
        if (this.overlayInteractionGuard) {
          return;
        }
        this.closeOverlay();
      });
    } catch (e) {
      // ignore
    }

    // Apply current intensity to the overlay appearance
    this.updateOverlayAppearance();

    // ── GeometryMask demo: scrollable content ─────────────
    try {
      const areaX = GAME_W / 2 - this._maskW / 2;
      const areaY = this._scrollAreaBaseY;
      const areaW = this._maskW;
      const areaH = this._maskH;
      const lineH = OVERLAY_TEXT_LINE_HEIGHT;

      // Create a shaped mask for clipping — positioned at the content area
      const maskShape = this.add.graphics();
      maskShape.setPosition(areaX, areaY);
      maskShape.fillStyle(0xffffff, 1);
      maskShape.fillRect(0, 0, areaW, areaH);
      this.contentMask = new Phaser.Display.Masks.GeometryMask(this, maskShape);
      // Hide the mask shape — it provides geometry data for the mask but
      // should not be rendered as a visible white rectangle at (0,0) behind
      // the semi-transparent overlay background.
      maskShape.setVisible(false);
      this.overlayObjects.push(maskShape);

      // Create a container for content that will be clipped.
      // Position at same origin as the mask shape so the clip region
      // aligns with the container's local coordinate space.
      this.maskedContainer = this.add.container(areaX, areaY);
      this.maskedContainer.setMask(this.contentMask);
      this.maskedContainer.setDepth(OVERLAY_MASK_DEPTH);
      this.overlayObjects.push(this.maskedContainer);

      // Generate scrollable content lines (enough to overflow the mask)
      const contentLines = generateScrollableContent();
      const contentH = contentLines.length * lineH;
      const maxScrollY = Math.max(0, contentH - areaH);

      for (let i = 0; i < contentLines.length; i++) {
        const line = createHudText(this, OVERLAY_TEXT_X, i * lineH, contentLines[i], '#ccddcc', { fontSize: OVERLAY_TEXT_FONT_SIZE });
        this.maskedContainer.add(line);
      }

      // Initialize scroll state (exposed for testing via public getter)
      this._overlayScroller = { scrollY: 0, maxScrollY, lineCount: contentLines.length };

      // ── Scrollbar ───────────────────────────────────────
      // Track: vertical bar at right edge of mask area
      const scrollbarTrack = this.add.rectangle(
        areaX + areaW - OVERLAY_SCROLLBAR_OFFSET_X,
        areaY + areaH / 2,
        OVERLAY_SCROLLBAR_WIDTH,
        areaH,
        OVERLAY_SCROLLBAR_TRACK_COLOR,
        OVERLAY_SCROLLBAR_TRACK_ALPHA,
      );
      scrollbarTrack.setDepth(OVERLAY_SCROLLBAR_TRACK_DEPTH);
      this.overlayObjects.push(scrollbarTrack);

      // Thumb: moves to indicate scroll position
      const thumbHeight = Math.max(OVERLAY_SCROLLBAR_MIN_THUMB, (areaH / contentH) * areaH);
      const scrollbarThumb = this.add.rectangle(
        areaX + areaW - OVERLAY_SCROLLBAR_OFFSET_X,
        areaY + thumbHeight / 2,
        OVERLAY_SCROLLBAR_WIDTH,
        thumbHeight,
        OVERLAY_SCROLLBAR_THUMB_COLOR,
        OVERLAY_SCROLLBAR_THUMB_ALPHA,
      );
      scrollbarThumb.setDepth(OVERLAY_SCROLLBAR_THUMB_DEPTH);
      this.overlayObjects.push(scrollbarThumb);

      // ── Wheel event handler ─────────────────────────────
      const wheelHandler = (
        _pointer: any,
        _gameObjects: any[],
        _deltaX: number,
        deltaY: number,
        _deltaZ: number,
      ) => {
        const scroller = this._overlayScroller;
        if (!scroller) return;

        // deltaY > 0 = scroll down
        scroller.scrollY = Math.max(
          0,
          Math.min(scroller.maxScrollY, scroller.scrollY + deltaY * OVERLAY_SCROLL_FACTOR),
        );

        // Move the container up (negative shift) to reveal later content
        if (this.maskedContainer) {
          this.maskedContainer.y = areaY - scroller.scrollY;
        }

        // Update scrollbar thumb position
        const scrollRatio =
          scroller.maxScrollY > 0 ? scroller.scrollY / scroller.maxScrollY : 0;
        const thumbRange = areaH - thumbHeight;
        scrollbarThumb.y = areaY + thumbHeight / 2 + scrollRatio * thumbRange;
      };

      this.input.on('wheel', wheelHandler);
      this._wheelHandlerRef = wheelHandler;

      this.logEvent(
        `Overlay opened with GeometryMask scrollable area (${contentLines.length} lines, maxScroll=${maxScrollY})`,
      );
    } catch (e) {
      // GeometryMask may not be available in all environments (e.g., headless)
      this.logEvent('Overlay opened (GeometryMask unavailable, text fallback)');
    }

    // Add central content text (above the mask)
    const info = createHudText(
      this,
      GAME_W / 2,
      OVERLAY_INFO_Y,
      'Overlay Active\nScrollable content below.',
      STATUS_TEXT_COLOR,
      { fontSize: STATUS_FONT_SIZE, align: 'center' },
    ).setOrigin(0.5);
    info.setDepth(OVERLAY_MASK_DEPTH);
    this.overlayObjects.push(info);

    // Dismiss link
    const dismiss = createHudText(this, GAME_W / 2, OVERLAY_DISMISS_Y, '[ Dismiss Overlay ]', '#88ff88', {
      fontSize: DEFAULT_FONT_SIZE,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    dismiss.on('pointerdown', () => {
      this.markOverlayInteraction();
      this.closeOverlay();
    });
    dismiss.setDepth(OVERLAY_MASK_DEPTH);
    this.overlayObjects.push(dismiss);

    // Intensity controls within overlay
    const minus = createHudText(this, GAME_W / 2 - OVERLAY_INTENSITY_BTN_X_OFFSET, OVERLAY_INTENSITY_Y, '[-]', '#ff8877', { fontSize: OVERLAY_INTENSITY_BTN_FONT_SIZE }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    minus.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(-INTENSITY_STEP); });
    minus.setDepth(OVERLAY_MASK_DEPTH);
    this.overlayObjects.push(minus);

    const intensityLabel = createHudText(this, GAME_W / 2, OVERLAY_INTENSITY_Y, `Intensity: ${this.feedbackIntensity}`, STATUS_TEXT_COLOR, { fontSize: OVERLAY_INTENSITY_BTN_FONT_SIZE }).setOrigin(0.5);
    intensityLabel.setDepth(OVERLAY_MASK_DEPTH);
    this.overlayObjects.push(intensityLabel);
    this.overlayIntensityText = intensityLabel;

    const plus = createHudText(this, GAME_W / 2 + OVERLAY_INTENSITY_BTN_X_OFFSET, OVERLAY_INTENSITY_Y, '[+]', '#77ff88', { fontSize: OVERLAY_INTENSITY_BTN_FONT_SIZE }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    plus.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(INTENSITY_STEP); });
    plus.setDepth(OVERLAY_MASK_DEPTH);
    this.overlayObjects.push(plus);

    if (!this.contentMask) {
      this.logEvent('Overlay opened');
    }
  }

  private closeOverlay(): void {
    if (!this.overlayOpen || !this.overlayObjects) {
      this.logEvent('No overlay open; ignoring');
      return;
    }

    // Remove wheel event handler before cleanup
    if (this._wheelHandlerRef) {
      try { this.input.off('wheel', this._wheelHandlerRef); } catch (_) { /* ignore */ }
      this._wheelHandlerRef = null;
    }

    // Reset scroll state
    this._overlayScroller = null;

    // Destroy GeometryMask references before dismissing overlay objects
    if (this.maskedContainer) {
      try { this.maskedContainer.clearMask(); } catch (_) { /* ignore */ }
      this.maskedContainer = null;
    }
    if (this.contentMask) {
      try { (this.contentMask as any).destroy?.(); } catch (_) { /* ignore */ }
      this.contentMask = null;
    }

    dismissOverlay(this.overlayObjects);
    this.overlayObjects = null;
    this.overlayIntensityText = null;
    this.overlayOpen = false;
    this.logEvent('Overlay dismissed (mask destroyed)');
  }

  private adjustIntensity(delta: number): void {
    this.feedbackIntensity = Math.round((this.feedbackIntensity + delta) * 10) / 10;
    this.feedbackIntensity = Math.max(0, Math.min(1, this.feedbackIntensity));
    this.intensityText.setText(`Feedback Intensity: ${this.feedbackIntensity}`);
    this.logEvent(`Intensity set to ${this.feedbackIntensity}`);

    if (this.overlayIntensityText) {
      try { this.overlayIntensityText.setText(`Intensity: ${this.feedbackIntensity}`); } catch (_) {}
    }

    // If overlay is open, update its appearance immediately
    if (this.overlayOpen) this.updateOverlayAppearance();
  }

  private updateOverlayAppearance(): void {
    if (!this.overlayObjects || this.overlayObjects.length === 0) return;

    const brightness = OVERLAY_MIN_BRIGHTNESS + (1 - OVERLAY_MIN_BRIGHTNESS) * this.feedbackIntensity;
    const alpha = OVERLAY_ALPHA_MIN + (OVERLAY_ALPHA_MAX - OVERLAY_ALPHA_MIN) * this.feedbackIntensity;
    const color = this.applyBrightnessToColor(OVERLAY_BASE_COLOR, brightness);

    for (const obj of this.overlayObjects) {
      try {
        if (typeof (obj as any).setFillStyle === 'function') {
          (obj as any).setFillStyle(color, alpha);
        } else if (typeof (obj as any).setAlpha === 'function') {
          (obj as any).setAlpha(alpha);
        }
      } catch (_e) {
        // ignore
      }
    }
  }

  private applyBrightnessToColor(color: number, factor: number): number {
    const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
  }

  /** Mark a recent overlay-local interaction to avoid accidental background dismissals. */
  private markOverlayInteraction(): void {
    this.overlayInteractionGuard = true;
    try {
      if (this.time && typeof this.time.delayedCall === 'function') {
        this.time.delayedCall(OVERLAY_INTERACTION_GUARD_MS, () => {
          this.overlayInteractionGuard = false;
        });
      } else {
        setTimeout(() => { this.overlayInteractionGuard = false; }, OVERLAY_INTERACTION_GUARD_MS);
      }
    } catch (_e) {
      setTimeout(() => { this.overlayInteractionGuard = false; }, OVERLAY_INTERACTION_GUARD_MS);
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > OVERLAY_LOG_MAX_LINES) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}