import Phaser from 'phaser';
import { CARD_TEMPLATE_NAMES } from '../MainStreetCards';
import { FONT_FAMILY, popTextOrIcon, moveGameObject } from '../../../src/ui';
import { SFX_KEYS } from './MainStreetConstants';

/** MainStreetAnimator -- animation and HUD-delta helper for Main Street scene. */
export class MainStreetAnimator {
  constructor(private readonly scene: any) {}

  public animateHudValueChanges(params: {
    coins: number;
    reputation: number;
    coinX: number;
    repX: number;
    hudY: number;
  }): void {
    const s = this.scene;
    const { coins, reputation, coinX, repX, hudY } = params;

    if (s.previousCoins === null || s.previousReputation === null) {
      s.previousCoins = coins;
      s.previousReputation = reputation;
      return;
    }

    const reducedMotion = s.settingsPanel?.reducedMotion;

    if (coins !== s.previousCoins) {
      const delta = coins - s.previousCoins;
      const text = s.add.text(coinX, hudY - 6, `${delta > 0 ? '+' : ''}${delta}`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: delta >= 0 ? '#ffdd66' : '#ff7777',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: s,
        target: text,
        duration: 1500,
        riseY: 22,
        scale: 1.2,
        reducedMotion,
      });
      try {
        if (delta > 0) {
          try { s.gameEvents?.emit('income-gained', { amount: delta }); } catch (_) {}
        } else if (delta < 0) {
          try { s.soundManager?.play(SFX_KEYS.INCOME_NEGATIVE); } catch (_) {}
        } else {
          try { s.soundManager?.play(SFX_KEYS.INCOME_NEUTRAL); } catch (_) {}
        }
      } catch (_) {}
    }

    if (reputation !== s.previousReputation) {
      const delta = reputation - s.previousReputation;
      const text = s.add.text(repX, hudY - 6, `${delta > 0 ? '+' : ''}${delta}`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: delta >= 0 ? '#99ccff' : '#ff8899',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: s,
        target: text,
        duration: 1500,
        riseY: 22,
        scale: 1.2,
        reducedMotion,
      });
    }

    s.previousCoins = coins;
    s.previousReputation = reputation;
  }

  /**
   * Plays a celebration VFX (particle burst + pop text) and sound for a
   * newly completed challenge.
   *
   * Centers the effect on the challenge tracker panel. Respects the
   * reduced-motion accessibility setting: when enabled, only a brief pop
   * text is shown (no particles). Falls back to pop text if the Phaser
   * particle system is unavailable.
   *
   * @param challengeTitle  The title of the completed challenge (for pop text).
   * @returns A promise that resolves when the celebration animation finishes.
   */
  public animateCelebration(challengeTitle: string): Promise<void> {
    const s = this.scene;
    const reducedMotion = s.settingsPanel?.reducedMotion;

    // Center of the challenge tracker panel
    const cx = s.layout.challengeX + s.layout.challengeW / 2;
    const cy = s.layout.challengeY + 30;

    // Play the celebration sound
    try {
      s.soundManager?.play(SFX_KEYS.CELEBRATE);
    } catch (_) { /* ignore */ }

    if (reducedMotion) {
      // Reduced-motion: pop text only (no particles)
      return popTextOrIcon({
        scene: s,
        label: `\uD83C\uDF89 ${challengeTitle}`,
        x: cx,
        y: cy,
        duration: 200,
        reducedMotion: true,
        scale: 1.5,
      });
    }

    // Try particle burst
    try {
      const particleKey = 'celebrate-particle';
      if (!s.textures.exists(particleKey)) {
        const g = s.add.graphics();
        g.fillStyle(0xffdd44, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture(particleKey, 8, 8);
        g.destroy();
      }

      const texture = s.textures.get(particleKey);
      if (texture && s.add.particles) {
        const emitter = s.add.particles(cx, cy, particleKey, {
          speed: { min: 60, max: 200 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.8, end: 0 },
          lifespan: 1000,
          quantity: 25,
          emitting: false,
          tint: [0xffdd44, 0x44ff44, 0x44aaff, 0xff6644, 0xdd88ff],
        });

        emitter.explode(25);

        // Show pop text alongside particles
        void popTextOrIcon({
          scene: s,
          label: `\uD83C\uDF89 ${challengeTitle}`,
          x: cx,
          y: cy - 30,
          duration: 1500,
          scale: 1.3,
          riseY: 40,
          style: { fontSize: '16px', fontStyle: 'bold', color: '#ffdd44' },
        });

        // Clean up after particles finish
        return new Promise<void>((resolve) => {
          s.time.delayedCall(1500, () => {
            try { emitter.destroy(); } catch (_) { /* ignore */ }
            resolve();
          });
        });
      }
    } catch (_) { /* ignore */ }

    // Fallback: pop text if particle system unavailable or errored
    return popTextOrIcon({
      scene: s,
      label: `\uD83C\uDF89 ${challengeTitle}`,
      x: cx,
      y: cy,
      duration: 600,
      scale: 2,
      riseY: 40,
      style: { fontSize: '18px', fontStyle: 'bold', color: '#ffdd44' },
    });
  }

  public getMarketCardCenter(row: 'development' | 'investments', slotIndex: number): { x: number; y: number } | null {
    const s = this.scene;
    if (slotIndex < 0) return null;
    const rowTop = row === 'development'
      ? s.layout.marketTop + 6
      : s.layout.marketTop + 6 + s.layout.marketRowH + s.layout.marketRowGap;
    const cardX = s.layout.marketLabelW + 50 + slotIndex * (s.layout.marketCardW + s.layout.marketCardGap);
    return {
      x: cardX + s.layout.marketCardW / 2,
      y: rowTop + s.layout.marketCardH / 2,
    };
  }

  public getStreetSlotCenter(slotIndex: number): { x: number; y: number } {
    const s = this.scene;
    const col = slotIndex % s.layout.streetCols;
    const row = Math.floor(slotIndex / s.layout.streetCols);
    const x = s.layout.streetX + col * (s.layout.slotW + s.layout.slotGap) + s.layout.slotW / 2;
    const y = s.layout.streetTop + row * (s.layout.slotH + s.layout.streetRowGap) + s.layout.slotH / 2;
    return { x, y };
  }

  /**
   * Hand-anchored slot centre (left edge of the hand zone + half a card).
   *
   * Kept for backward compatibility only — buy-transfer animations now use
   * the HandView-predicted resting positions via the scene's
   * `getBusinessHandInsertionPosition` / `getEventHandInsertionPosition`
   * helpers, which target the actual centred hand layout (`handCenterX`)
   * instead of this left-anchored estimate.
   */
  public getHandCardCenter(): { x: number; y: number } {
    const s = this.scene;
    return {
      x: s.layout.handX + s.layout.handCardW / 2,
      y: s.layout.handY + s.layout.handCardH / 2,
    };
  }

  public createTransferCardVisual(
    cardId: string,
    family: 'business' | 'community-space' | 'event' | 'upgrade',
    atX: number,
    atY: number,
  ): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform {
    const s = this.scene;
    const templateId = s.templateIdFromCardId(cardId);
    const bgColor = family === 'business' ? 0x5a7f36 : family === 'community-space' ? 0x2E86C1 : family === 'upgrade' ? 0x6B4C9A : 0x8B4513;
    const w = s.layout.marketCardW;
    const h = s.layout.marketCardH;
    const container = s.add.container(atX, atY);

    const cardBg = s.add.rectangle(0, 0, w, h, bgColor, 0.95);
    cardBg.setStrokeStyle(2, 0xffdd88, 0.9);
    container.add(cardBg);

    const title = CARD_TEMPLATE_NAMES.get(templateId) ?? cardId;
    const titleText = s.add.text(0, -h * 0.18, title, {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
      align: 'center',
      wordWrap: { width: w - 10 },
    }).setOrigin(0.5, 0.5);
    container.add(titleText);

    const subtitle = s.add.text(0, h * 0.22, family.toUpperCase(), {
      fontSize: '10px',
      color: '#ffeecc',
      fontFamily: FONT_FAMILY,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    container.add(subtitle);

    container.setDepth(10000);
    return container;
  }

  public cleanupTransferAnimations(): void {
    const s = this.scene;
    for (const tween of s.activeTransferTweens) {
      tween.stop();
    }
    s.activeTransferTweens.clear();

    for (const visual of s.activeTransferVisuals) {
      visual.destroy();
    }
    s.activeTransferVisuals.clear();
    s.hiddenTransferSourceCardIds.clear();
  }

  public animateTransferFromMarket(options: {
    cardId: string;
    family: 'business' | 'community-space' | 'event' | 'upgrade';
    row: 'development' | 'investments';
    slotIndex: number;
    destination: { x: number; y: number };
  }): Promise<void> {
    const s = this.scene;
    if (s.settingsPanel?.reducedMotion) return Promise.resolve();

    const source = this.getMarketCardCenter(options.row, options.slotIndex);
    if (!source) return Promise.resolve();

    const visual = this.createTransferCardVisual(options.cardId, options.family, source.x, source.y);
    s.activeTransferVisuals.add(visual);
    s.transferAnimationCount += 1;

    return new Promise((resolve) => {
      const sfxForFamily = (family: string) => {
        if (family === 'event') {
          return { start: SFX_KEYS.EVENT_CHEER, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.EVENT_CHEER, moveIntervalMs: 1500 };
        }
        if (family === 'upgrade') {
          return { start: SFX_KEYS.UPGRADE_START, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.UPGRADE_END, moveIntervalMs: 1500 };
        }
        return { start: SFX_KEYS.BUSINESS_START, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.BUSINESS_END, moveIntervalMs: 1500 };
      };

      const sfx = sfxForFamily(options.family);

      const tween = moveGameObject({
        scene: s,
        target: visual,
        destX: options.destination.x,
        destY: options.destination.y,
        duration: 1500,
        ease: 'Cubic.easeInOut',
        soundManager: s.soundManager,
        sfx,
        onComplete: () => {
          s.activeTransferTweens.delete(tween);
          s.activeTransferVisuals.delete(visual);
          visual.destroy();
          resolve();
        },
      });

      s.activeTransferTweens.add(tween);
    });
  }
}
