/**
 * Main Street: Market / Transfer / Applicant Animation
 *
 * Market deal-in, drag-transfer visuals, and applicant walk-on/off/in.
 *
 * Import graph: depends only on `MainStreetAnimatorContext` (type) + timing.
 *
 * @module
 */

import Phaser from 'phaser';
import { CARD_TEMPLATE_NAMES } from '../MainStreetCards';
import { FONT_FAMILY, moveGameObject } from '@ui';
import { SFX_KEYS } from './MainStreetConstants';
import type { MainStreetAnimatorContext } from './MainStreetAnimatorContext';


export function animateMarketDealIn(animator: MainStreetAnimatorContext, params: {
    row: 'market';
    /** Rendered card containers for the row, in slot order — these deal in. */
    cards: Phaser.GameObjects.Container[];
    /**
     * Cards leaving the row (Discover/Research): snapshot visuals at their
     * old slot positions fade/shrink out before the incoming cards deal in.
     */
    outgoing?: Array<{
      cardId: string;
      family: 'business' | 'community-space' | 'event' | 'upgrade';
      x: number;
      y: number;
    }>;
  }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;
    // Reduced motion: cards appear instantly (current behaviour).
    if (s.settingsPanel?.reducedMotion) return;

    const { cards, outgoing } = params;
    if (cards.length === 0 && (outgoing?.length ?? 0) === 0) return;

    const outgoingStaggerMs = 60;
    const incomingStaggerMs = 80;
    const outgoingLeadMs = (outgoing?.length ?? 0) * outgoingStaggerMs;

    // 1. Outgoing cards: snapshot visual fades/shrinks out (staggered).
    outgoing?.forEach((o, i) => {
      s.time.delayedCall(i * outgoingStaggerMs, () => {
        const visual = animator.createTransferCardVisual(o.cardId, o.family, o.x, o.y);
        s.tweens.add({
          targets: visual,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 300,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            visual.destroy();
          },
        });
      });
    });

    // 2. Incoming cards: dealt state now (same frame as the draw), then a
    // staggered deal-in tween with the shared deal SFX.
    cards.forEach((card, i) => {
      const baseY = card.y;
      card.setScale(0.6, 0.6);
      card.setAlpha(0.35);
      card.y = baseY - 24;
      s.time.delayedCall(outgoingLeadMs + i * incomingStaggerMs, () => {
        try { s.soundManager?.play(SFX_KEYS.DEAL); } catch (_) { /* ignore */ }
        s.tweens.add({
          targets: card,
          y: baseY,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          duration: 350,
          ease: 'Back.easeOut',
        });
      });
    });
  
}

export function createTransferCardVisual(animator: MainStreetAnimatorContext, 
    cardId: string,
    family: 'business' | 'community-space' | 'event' | 'upgrade' | 'staff',
    atX: number,
    atY: number,
  ): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform {

    const s = animator.scene;
    const templateId = s.templateIdFromCardId(cardId);
    const bgColor = family === 'business' ? 0x5a7f36 : family === 'community-space' ? 0x2E86C1 : family === 'upgrade' ? 0x6B4C9A : family === 'staff' ? 0x555555 : 0x8B4513;
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

export function cleanupTransferAnimations(animator: MainStreetAnimatorContext): void {

    const s = animator.scene;
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

export function animateTransferFromMarket(animator: MainStreetAnimatorContext, options: {
    cardId: string;
    family: 'business' | 'community-space' | 'event' | 'upgrade' | 'staff';
    row: 'market';
    slotIndex: number;
    /**
     * Optional start position for the transfer visual. When omitted the
     * visual originates at the market card's slot centre (click/AI flows,
     * where the card still sits in the market). Drag-and-drop flows pass
     * the drop location so the animation continues from where the card was
     * released instead of jumping back to the market row.
     */
    source?: { x: number; y: number };
    destination: { x: number; y: number };
    /**
     * Optional explicit animation duration (ms). When omitted the transfer
     * keeps the fixed 1500ms default used by click-to-buy / place-from-hand
     * / upgrade / event / AI flows. The drag-and-drop buy path passes a
     * distance-proportional duration (see `computeDragTransferDuration` in
     * MainStreetConstants.ts) so a card dropped near its slot settles
     * quickly. Reduced-motion behaviour is unchanged: the animation is
     * skipped entirely before this option is consulted.
     */
    duration?: number;
  }): Promise<void> {

    const s = animator.scene;
    if (s.settingsPanel?.reducedMotion) return Promise.resolve();

    const source = options.source ?? animator.getMarketCardCenter(options.row, options.slotIndex);
    if (!source) return Promise.resolve();

    const visual = animator.createTransferCardVisual(options.cardId, options.family, source.x, source.y);
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
        if (family === 'staff') {
          // Staff hires (CG-0MT3KZOUX007GQ44) reuse the deal/place sound
          // family — no new game-scoped SFX keys (docs/SFX_CONVENTION.md).
          return { start: SFX_KEYS.BUSINESS_START, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.PLACE, moveIntervalMs: 1500 };
        }
        return { start: SFX_KEYS.BUSINESS_START, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.BUSINESS_END, moveIntervalMs: 1500 };
      };

      const sfx = sfxForFamily(options.family);

      const tween = moveGameObject({
        scene: s,
        target: visual,
        destX: options.destination.x,
        destY: options.destination.y,
        duration: options.duration ?? 1500,
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

export function animateApplicantWalkOn(animator: MainStreetAnimatorContext, 
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
  ): void {

    const s = animator.scene;
    if (reducedMotion) {
      container.setVisible(true);
      try { s.soundManager?.play(SFX_KEYS.DEAL); } catch { /* ignore */ }
      return;
    }
    const startX = -(cardW + 40);
    const targetX = container.x;
    const duration = 1000;
    container.setPosition(startX, container.y);
    moveGameObject({
      scene: s,
      target: container,
      destX: targetX,
      destY: container.y,
      duration,
      ease: 'Cubic.easeOut',
      soundManager: s.soundManager,
      sfx: { start: SFX_KEYS.DEAL },
      reducedMotion,
    });
  
}

export function animateApplicantWalkOff(animator: MainStreetAnimatorContext, 
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void {

    const s = animator.scene;
    const endX = s.layout.gameW + cardW + 40;
    if (reducedMotion) {
      container.setVisible(false);
      try { s.soundManager?.play(SFX_KEYS.DISCARD); } catch { /* ignore */ }
      onComplete?.();
      return;
    }
    moveGameObject({
      scene: s,
      target: container,
      destX: endX,
      destY: container.y,
      duration: 800,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        container.setVisible(false);
        try { s.soundManager?.play(SFX_KEYS.DISCARD); } catch { /* ignore */ }
        onComplete?.();
      },
      soundManager: s.soundManager,
      sfx: { end: SFX_KEYS.DISCARD },
      reducedMotion,
    });
  
}

export function animateApplicantWalkIn(animator: MainStreetAnimatorContext, 
    container: Phaser.GameObjects.Container,
    targetSlotIndex: number,
    _cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void {

    const s = animator.scene;
    // Target the centre of the business slot (matches the street renderer's
    // slot geometry — streetX/streetTop/streetCols with slotW + slotGap).
    const col = targetSlotIndex % (s.layout.streetCols || 1);
    const row = Math.floor(targetSlotIndex / (s.layout.streetCols || 1));
    const targetX = s.layout.streetX + col * (s.layout.slotW + s.layout.slotGap) + s.layout.slotW / 2;
    const targetY = s.layout.streetTop + row * (s.layout.slotH + s.layout.streetRowGap) + s.layout.slotH / 2;
    if (reducedMotion) {
      container.setVisible(false);
      try { s.soundManager?.play(SFX_KEYS.PLACE); } catch { /* ignore */ }
      onComplete?.();
      return;
    }
    moveGameObject({
      scene: s,
      target: container,
      destX: targetX,
      destY: targetY,
      duration: 600,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        container.setVisible(false);
        try { s.soundManager?.play(SFX_KEYS.PLACE); } catch { /* ignore */ }
        onComplete?.();
      },
      soundManager: s.soundManager,
      sfx: { end: SFX_KEYS.PLACE },
      reducedMotion,
    });
  
}
