/**
 * GymOverlayUiScene -- Demonstrates overlays, help/settings components,
 * and live UI configuration using core-engine UI APIs.
 *
 * Features:
 *   - Open and close help/settings overlays
 *   - Toggle feedback intensity settings
 *   - Verify overlay lifecycle (no state leaks)
 *
 * @module example-games/gym/scenes/GymOverlayUiScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_OVERLAY_UI_KEY } from '../GymRegistry';
import { GAME_W } from '../../../src/ui/constants';
import { createOverlayBackground, dismissOverlay } from '../../../src/ui/Overlay';

export class GymOverlayUiScene extends GymSceneBase {
  private overlayObjects: Phaser.GameObjects.GameObject[] | null = null;
  private overlayOpen = false;
  private feedbackIntensity = 1.0;
  private intensityText!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];
  private overlayIntensityText: Phaser.GameObjects.Text | null = null;

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

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 300, y, '[ Show Overlay ]', () => this.openOverlay());
    this.addButton(cx - 120, y, '[ Dismiss Overlay ]', () => this.closeOverlay());
    this.addButton(cx + 80, y, '[ Intensity - ]', () => this.adjustIntensity(-0.2));
    this.addButton(cx + 260, y, '[ Intensity + ]', () => this.adjustIntensity(0.2));

    y += 40;
    this.intensityText = this.addLabel(cx, y, 'Feedback Intensity: 1.0', { fontSize: '16px', color: '#88ff88' });
    this.intensityText.setOrigin(0.5);

    y += 30;
    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);
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

    // Make overlay background dismissible by clicking it directly, but guard against
    // immediate propagation when clicking overlay-local controls (small targets).
    try {
      result.background.on('pointerdown', (pointer?: any) => {
        if (this.overlayInteractionGuard) {
          // recent overlay-local interaction; ignore this background click
          return;
        }
        this.closeOverlay();
      });
    } catch (e) {
      // ignore - defensive in case background isn't interactive in some envs
    }

    // Apply current intensity to the overlay appearance
    this.updateOverlayAppearance();

    // Add central content text (ensure it's above the background)
    const info = this.add.text(
      GAME_W / 2,
      300,
      'Overlay Active\nClick anywhere to dismiss.',
      { fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', align: 'center' },
    ).setOrigin(0.5);
    info.setDepth(11);
    this.overlayObjects.push(info);

    // Add an explicit in-overlay dismiss link so overlay users can close it
    const dismiss = this.add.text(GAME_W / 2, 360, '[ Dismiss Overlay ]', {
      fontSize: '14px',
      color: '#88ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    dismiss.on('pointerdown', () => {
      this.markOverlayInteraction();
      this.closeOverlay();
    });
    dismiss.setDepth(11);
    this.overlayObjects.push(dismiss);

    // Add overlay-local intensity controls so users can tune brightness while overlay is shown
    const minus = this.add.text(GAME_W / 2 - 80, 420, '[-]', { fontSize: '14px', color: '#ff8877', fontFamily: 'monospace' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    minus.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(-0.2); });
    minus.setDepth(11);
    this.overlayObjects.push(minus);

    const intensityLabel = this.add.text(GAME_W / 2, 420, `Intensity: ${this.feedbackIntensity}`, { fontSize: '14px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);
    intensityLabel.setDepth(11);
    this.overlayObjects.push(intensityLabel);
    this.overlayIntensityText = intensityLabel;

    const plus = this.add.text(GAME_W / 2 + 80, 420, '[+]', { fontSize: '14px', color: '#77ff88', fontFamily: 'monospace' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    plus.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(0.2); });
    plus.setDepth(11);
    this.overlayObjects.push(plus);

    // Also add slightly larger invisible hit zones for the +/- controls to make tapping easier
    try {
      const minusZone = this.add.zone(GAME_W / 2 - 80, 420, 80, 42).setOrigin(0.5).setInteractive({ useHandCursor: true });
      minusZone.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(-0.2); });
      minusZone.setDepth(11);
      this.overlayObjects.push(minusZone);

      const plusZone = this.add.zone(GAME_W / 2 + 80, 420, 80, 42).setOrigin(0.5).setInteractive({ useHandCursor: true });
      plusZone.on('pointerdown', () => { this.markOverlayInteraction(); this.adjustIntensity(0.2); });
      plusZone.setDepth(11);
      this.overlayObjects.push(plusZone);
    } catch (_e) {
      // ignore if zones cannot be created in some environments
    }

    this.logEvent('Overlay opened');
  }

  private closeOverlay(): void {
    if (!this.overlayOpen || !this.overlayObjects) {
      this.logEvent('No overlay open; ignoring');
      return;
    }
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = null;
    this.overlayIntensityText = null;
    this.overlayOpen = false;
    this.logEvent('Overlay dismissed');
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
      // Use Phaser's time system if available so the delayed clear is tied to the scene
      if (this.time && typeof this.time.delayedCall === 'function') {
        this.time.delayedCall(this.OVERLAY_INTERACTION_GUARD_MS, () => {
          this.overlayInteractionGuard = false;
        });
      } else {
        setTimeout(() => { this.overlayInteractionGuard = false; }, this.OVERLAY_INTERACTION_GUARD_MS);
      }
    } catch (_e) {
      // fallback
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
      const txt = this.add.text(40, baseY + i * 17, this.eventLog[i], {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.logTexts.push(txt);
    }
  }
}