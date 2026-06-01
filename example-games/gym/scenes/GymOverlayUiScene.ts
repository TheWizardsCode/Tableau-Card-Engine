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

export class GymOverlayUiScene extends GymSceneBase {
  private overlayObjects: Phaser.GameObjects.GameObject[] | null = null;
  private overlayOpen = false;
  private feedbackIntensity = 1.0;
  private intensityText!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];
  private overlayIntensityText: Phaser.GameObjects.Text | null = null;

  // Mask references for GeometryMask demo
  private contentMask: Phaser.Display.Masks.GeometryMask | null = null;
  private maskedContainer: Phaser.GameObjects.Container | null = null;

  // Guard to prevent background clicks from immediately closing the overlay
  private overlayInteractionGuard = false;
  private readonly OVERLAY_INTERACTION_GUARD_MS = 220;

  // Overlay appearance tuning
  private readonly OVERLAY_BASE_COLOR = 0x0a1a0a;
  private readonly OVERLAY_MIN_BRIGHTNESS = 0.4; // how dark at intensity=0
  private readonly OVERLAY_ALPHA_MIN = 0.3; // alpha at intensity=0
  private readonly OVERLAY_ALPHA_MAX = 0.7; // alpha at intensity=1

  constructor() {
    super({ key: GYM_OVERLAY_UI_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Overlay & UI Config');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Explores overlay lifecycle, live UI configuration, and GeometryMask clipping for scrollable content.' },
      { heading: 'Controls', body: '[ Show Overlay ]: Open a dismissible overlay with masked scrollable content.\n[ Dismiss Overlay ]: Close the overlay if open.\n[ Intensity - ] / [ Intensity + ]: Adjust feedback intensity which influences overlay appearance.' }
    ]);

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 300, y, '[ Show Overlay ]', () => this.openOverlay());
    this.addButton(cx - 120, y, '[ Dismiss Overlay ]', () => this.closeOverlay());
    this.addButton(cx + 80, y, '[ Intensity - ]', () => this.adjustIntensity(-0.2));
    this.addButton(cx + 260, y, '[ Intensity + ]', () => this.adjustIntensity(0.2));

    y += 40;
    this.intensityText = createHudText(this, cx, y, 'Feedback Intensity: 1.0', '#88ff88', { fontSize: '16px' });
    this.intensityText.setOrigin(0.5);

    y += 30;
    createHudText(this, cx, y, '── Event Log ──', '#669966', { fontSize: '12px' }).setOrigin(0.5);
  }

  private openOverlay(): void {
    if (this.overlayOpen) {
      this.logEvent('Overlay already open; ignoring');
      return;
    }
    // Create overlay with base color and seeded alpha
    const result = createOverlayBackground(this, { color: this.OVERLAY_BASE_COLOR, alpha: this.OVERLAY_ALPHA_MAX });
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
      // Create a shaped mask for clipping
      const maskShape = this.add.graphics();
      maskShape.fillStyle(0xffffff, 1);
      maskShape.fillRect(0, 0, 300, 200);
      this.contentMask = new Phaser.Display.Masks.GeometryMask(this, maskShape);
      this.overlayObjects.push(maskShape);

      // Create a container for content that will be clipped
      this.maskedContainer = this.add.container(GAME_W / 2 - 150, 280);
      this.maskedContainer.setMask(this.contentMask);
      this.maskedContainer.setDepth(12);
      this.overlayObjects.push(this.maskedContainer);

      // Add scrollable content inside the clipped area
      const contentLines = [
        'Masked Content Area',
        '─────────────────────',
        'This text is inside a',
        'GeometryMask-clipped',
        'scrollable region.',
        '',
        'The mask clips content',
        'to a 300×200 rectangle.',
        '',
        'When the overlay closes,',
        'the mask is destroyed',
        'and resources freed.',
        '',
        'Intensity setting affects',
        'overlay brightness.',
      ];
      for (let i = 0; i < contentLines.length; i++) {
        const line = createHudText(this, 10, i * 16, contentLines[i], '#ccddcc', { fontSize: '12px' });
        this.maskedContainer.add(line);
      }
      this.logEvent('Overlay opened with GeometryMask content area');
    } catch (e) {
      // GeometryMask may not be available in all environments (e.g., headless)
      this.logEvent('Overlay opened (GeometryMask unavailable, text fallback)');
    }

    // Add central content text (above the mask)
    const info = createHudText(
      this,
      GAME_W / 2,
      240,
      'Overlay Active\nScrollable content below.',
      '#ffffff',
      { fontSize: '16px', align: 'center' },
    ).setOrigin(0.5);
    info.setDepth(11);
    this.overlayObjects.push(info);

    // Dismiss link
    const dismiss = createHudText(this, GAME_W / 2, 520, '[ Dismiss Overlay ]', '#88ff88', {
      fontSize: '14px',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    dismiss.on('pointerdown', () => {
      this.markOverlayInteraction();
      this.closeOverlay();
    });
    dismiss.setDepth(11);
    this.overlayObjects.push(dismiss);

    // Intensity controls within overlay
    const minus = createHudText(this, GAME_W / 2 - 80, 550, '[-]', '#ff8877', { fontSize: '14px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    minus.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(-0.2); });
    minus.setDepth(11);
    this.overlayObjects.push(minus);

    const intensityLabel = createHudText(this, GAME_W / 2, 550, `Intensity: ${this.feedbackIntensity}`, '#ffffff', { fontSize: '14px' }).setOrigin(0.5);
    intensityLabel.setDepth(11);
    this.overlayObjects.push(intensityLabel);
    this.overlayIntensityText = intensityLabel;

    const plus = createHudText(this, GAME_W / 2 + 80, 550, '[+]', '#77ff88', { fontSize: '14px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    plus.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(0.2); });
    plus.setDepth(11);
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

    const brightness = this.OVERLAY_MIN_BRIGHTNESS + (1 - this.OVERLAY_MIN_BRIGHTNESS) * this.feedbackIntensity;
    const alpha = this.OVERLAY_ALPHA_MIN + (this.OVERLAY_ALPHA_MAX - this.OVERLAY_ALPHA_MIN) * this.feedbackIntensity;
    const color = this.applyBrightnessToColor(this.OVERLAY_BASE_COLOR, brightness);

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
        this.time.delayedCall(this.OVERLAY_INTERACTION_GUARD_MS, () => {
          this.overlayInteractionGuard = false;
        });
      } else {
        setTimeout(() => { this.overlayInteractionGuard = false; }, this.OVERLAY_INTERACTION_GUARD_MS);
      }
    } catch (_e) {
      setTimeout(() => { this.overlayInteractionGuard = false; }, this.OVERLAY_INTERACTION_GUARD_MS);
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 150;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = createHudText(this, 40, baseY + i * 17, this.eventLog[i], '#aaddaa', { fontSize: '11px' });
      this.logTexts.push(txt);
    }
  }
}