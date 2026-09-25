/**
 * Main Street: Board Animation
 *
 * Synergy formation, day banner, game over, undo/redo, level-up, sell, close,
 * and event-played animations.
 *
 * Import graph: depends only on `MainStreetAnimatorContext` (type) + timing.
 *
 * @module
 */

import { synergyColor } from '../MainStreetCards';
import { FONT_FAMILY, moveGameObject, popTextOrIcon } from '@ui';
import type { SynergyPair } from '../MainStreetAdjacency';
import { SFX_KEYS } from './MainStreetConstants';
import { synergyLineEndpoints } from './synergyLineEndpoints';
import type { MainStreetAnimatorContext } from './MainStreetAnimatorContext';


export function animateSynergyFormation(animator: MainStreetAnimatorContext, pair: SynergyPair): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    // Shared clipped geometry: same endpoints as the static renderer uses
    // (edge-to-edge / corner-to-corner, CG-0MSVM3WCD007BRQP).
    const { p1: a, p2: b, mid } = synergyLineEndpoints(pair, s.layout, {
      from: animator.localSlotCentre(pair.fromIndex),
      to: animator.localSlotCentre(pair.toIndex),
    });
    const color = synergyColor(pair.sharedSynergy);

    // Chime SFX — plays in both modes (minimal feedback retained).
    try { s.soundManager?.play(SFX_KEYS.INCOME_POSITIVE); } catch (_) { /* ignore */ }

    if (reducedMotion) {
      // Minimal pop only.
      animator.popSynergyText(mid, color);
      return;
    }

    // 1. Line draws in: fade in the same geometry drawSynergyLines uses.
    const line = s.add.graphics();
    line.lineStyle(3, color, 0.7);
    line.beginPath();
    line.moveTo(a.x, a.y);
    line.lineTo(b.x, b.y);
    line.strokePath();
    line.setDepth(10);
    line.setAlpha(0);
    s.tweens.add({
      targets: line,
      alpha: 0.7,
      duration: 250,
      ease: 'Quad.easeOut',
    });

    // Draw-in accent: a spark that expands and fades at the midpoint.
    const spark = s.add.circle(mid.x, mid.y, 6, color, 0.9).setDepth(11);
    s.tweens.add({
      targets: spark,
      radius: 14,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => {
        spark.destroy();
      },
    });

    // 2. The two paired cards pulse (brief scale bounce).
    for (const idx of [pair.fromIndex, pair.toIndex]) {
      const card = animator.findStreetCardContainer(idx);
      if (!card) continue;
      const baseX = card.scaleX;
      const baseY = card.scaleY;
      s.tweens.add({
        targets: card,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 120,
        yoyo: true,
        hold: 80,
        onComplete: () => {
          card.setScale(baseX, baseY);
        },
      });
    }

    // 3. "Synergy!" pop at the pair midpoint.
    animator.popSynergyText(mid, color);
  
}

export function animateWeekBanner(animator: MainStreetAnimatorContext, params: { turn: number; week: number; year: number }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;

    // Reduced motion: keep the current behaviour (instruction text only).
    if (s.settingsPanel?.reducedMotion) return;

    const cx = s.layout.gameW / 2;
    const cy = s.layout.gameH / 2;
    const banner = s.add.container(cx, cy);
    const bg = s.add.rectangle(0, 0, 280, 76, 0x000000, 0.85);
    bg.setStrokeStyle(3, 0xffdd88, 0.9);
    banner.add(bg);
    const weekText = s.add.text(0, 0, `Week ${params.week} · Year ${params.year}`, {
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#ffdd88',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    banner.add(weekText);
    banner.setDepth(600);
    banner.setAlpha(0);
    banner.setScale(0.6);

    try { s.soundManager?.play(SFX_KEYS.CLICK); } catch (_) { /* ignore */ }

    // Fade in (~250ms), hold (~300ms), fade out (~250ms).
    s.tweens.add({
      targets: banner,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () => {
        s.time.delayedCall(300, () => {
          s.tweens.add({
            targets: banner,
            alpha: 0,
            scaleX: 0.85,
            scaleY: 0.85,
            duration: 250,
            ease: 'Quad.easeIn',
            onComplete: () => {
              banner.destroy();
            },
          });
        });
      },
    });
  
}

export function animateGameOver(animator: MainStreetAnimatorContext, params: { win: boolean; width: number; height: number }): void {

    const s = animator.scene;
    if (s.replayMode) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;

    try {
      s.soundManager?.play(params.win ? SFX_KEYS.GAME_WIN : SFX_KEYS.GAME_LOST);
    } catch (_) { /* ignore */ }

    if (reducedMotion) return;

    if (params.win) {
      // Confetti: fixed count (24) with bounded random scatter — stable in
      // tests (count/depth/tween contract is deterministic) while looking
      // organic on screen.
      const confettiColors = [0xffdd44, 0x44ff44, 0x44aaff, 0xff6644, 0xdd88ff];
      for (let i = 0; i < 24; i++) {
        const color = confettiColors[i % confettiColors.length];
        const x = 40 + Math.random() * Math.max(1, params.width - 80);
        const conf = s.add.rectangle(x, -20, 8, 14, color, 1).setDepth(100.5);
        s.tweens.add({
          targets: conf,
          y: params.height + 30,
          rotation: (Math.random() - 0.5) * 4 * Math.PI,
          alpha: 0,
          duration: 1200 + Math.random() * 800,
          delay: i * 60,
          ease: 'Quad.easeIn',
          onComplete: () => {
            try { conf.destroy(); } catch (_) { /* ignore */ }
          },
        });
      }
      return;
    }

    // Loss: brief dark pulse over the board only (depth 99.5, below the
    // backdrop at 100). The overlay backdrop then keeps the board dimmed.
    const dim = s.add.rectangle(
      params.width / 2,
      params.height / 2,
      params.width,
      params.height,
      0x000000,
      0,
    ).setDepth(99.5);
    s.tweens.add({
      targets: dim,
      alpha: 0.35,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        try { dim.destroy(); } catch (_) { /* ignore */ }
      },
    });
  
}

export function animateUndoRedo(animator: MainStreetAnimatorContext, params: { action: 'undo' | 'redo'; description: string }): void {

    const s = animator.scene;
    if (s.replayMode) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;

    try {
      s.soundManager?.play(SFX_KEYS.CLICK);
    } catch (_) { /* ignore */ }

    void popTextOrIcon({
      scene: s,
      label: `${params.action === 'undo' ? 'Undid' : 'Redid'}: ${params.description}`,
      x: s.layout.gameW / 2,
      y: s.layout.gameH - 60,
      duration: 1200,
      riseY: -16,
      scale: 1.1,
      reducedMotion,
      style: { fontSize: '14px', fontStyle: 'bold', color: '#ffdd88', fontFamily: FONT_FAMILY },
    });
  
}

export function animateLevelUp(animator: MainStreetAnimatorContext, params: { slotIndex: number; level: number }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;

    if (params.slotIndex < 0) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const { x, y } = animator.getStreetSlotCenter(params.slotIndex);

    if (!reducedMotion) {
      // Gold sparkle burst: small sparks tween outward and fade. Fixed
      // directions (deterministic — no RNG) so tests and replays are stable.
      const directions = [
        { dx: -22, dy: -14 }, { dx: 22, dy: -14 }, { dx: 0, dy: -26 },
        { dx: -18, dy: 16 }, { dx: 18, dy: 16 }, { dx: 0, dy: 26 },
      ];
      for (const dir of directions) {
        const spark = s.add.circle(x, y, 3, 0xffd700, 0.95).setDepth(400);
        s.tweens.add({
          targets: spark,
          x: x + dir.dx,
          y: y + dir.dy,
          alpha: 0,
          scale: 0.4,
          duration: 420,
          ease: 'Quad.easeOut',
          onComplete: () => {
            spark.destroy();
          },
        });
      }
    }

    // "Level N" pop text over the card (kept under reduced motion).
    const text = s.add.text(x, y - 18, `Level ${params.level}`, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffd700',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(500);
    void popTextOrIcon({
      scene: s,
      target: text,
      duration: 1200,
      riseY: 24,
      scale: 1.25,
      reducedMotion,
    });
  
}

export function animateSell(animator: MainStreetAnimatorContext, params: {
    slotIndex: number;
    refund: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void> {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return Promise.resolve();

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const coinX = s.layout.gameW * 0.25 + 70;
    const hudY = s.layout.hudY;
    const { x, y } = animator.getStreetSlotCenter(params.slotIndex);

    // Refund-delivered feedback: "+€refund" pop at the HUD counter + coin
    // SFX. Sound is kept in both modes (sound is not motion).
    const playRefundFeedback = (): void => {
      const text = s.add.text(coinX, hudY - 8, `+€${params.refund}`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#44ff88',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: s,
        target: text,
        duration: 1100,
        riseY: 20,
        scale: 1.2,
        reducedMotion,
      });
      try { s.soundManager?.play(SFX_KEYS.COIN_POP); } catch (_) { /* ignore */ }
    };

    if (reducedMotion) {
      playRefundFeedback();
      return Promise.resolve();
    }

    // 1. Demolition: pre-sold card snapshot shrinks and fades (~380ms).
    //    `createTransferCardVisual` already sets the snapshot depth above
    //    the street/SOLD overlay.
    return new Promise<void>((resolveDemolition) => {
      const demo = animator.createTransferCardVisual(params.cardId, params.family, x, y) as unknown as {
        destroy: () => void;
      };
      s.tweens.add({
        targets: demo,
        scaleX: 0.25,
        scaleY: 0.25,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          demo.destroy();
          resolveDemolition();
        },
      });
    }).then(() => {
      // 2. Refund coin flies from the sold slot to the HUD counter.
      return new Promise<void>((resolveFlight) => {
        const coin = s.add.circle(x, y, 6, 0xffcc44, 1).setDepth(3000);
        moveGameObject({
          scene: s,
          target: coin,
          destX: coinX,
          destY: hudY,
          duration: 600,
          ease: 'Quad.easeIn',
          soundManager: s.soundManager,
          sfx: { start: SFX_KEYS.COIN_POP },
          onComplete: () => {
            coin.destroy();
            playRefundFeedback();
            resolveFlight();
          },
        });
      });
    });
  
}

export function animateClose(animator: MainStreetAnimatorContext, params: {
    slotIndex: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void> {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return Promise.resolve();

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const { x, y } = animator.getStreetSlotCenter(params.slotIndex);

    const playCloseFeedback = (): void => {
      const text = s.add.text(x, y - 10, 'Closed', {
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffcc88',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: s,
        target: text,
        duration: 900,
        riseY: 16,
        scale: 1.1,
        reducedMotion,
      });
      // The closed card goes to the discard pile — reuse the discard SFX.
      try { s.soundManager?.play(SFX_KEYS.DISCARD); } catch (_) { /* ignore */ }
    };

    if (reducedMotion) {
      playCloseFeedback();
      return Promise.resolve();
    }

    // Demolition: pre-close card snapshot shrinks and fades (~380ms), then the
    // discard SFX + "Closed" pop replay the outcome. No refund coin fly.
    return new Promise<void>((resolveDemolition) => {
      const demo = animator.createTransferCardVisual(params.cardId, params.family, x, y) as unknown as {
        destroy: () => void;
      };
      s.tweens.add({
        targets: demo,
        scaleX: 0.25,
        scaleY: 0.25,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          demo.destroy();
          resolveDemolition();
        },
      });
    }).then(() => {
      playCloseFeedback();
    });
  
}

export function animateEventPlayed(animator: MainStreetAnimatorContext, params: { x: number; y: number; eventName: string }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;

    // Cheer SFX — retained under reduced motion (spec AC2).
    try { s.soundManager?.play(SFX_KEYS.EVENT_CHEER); } catch (_) { /* ignore */ }

    if (!reducedMotion) {
      // Event burst: 8 event-coloured sparks tween outward and fade.
      // Fixed directions (deterministic — no RNG) so tests and replays
      // are stable. Sits above the hand containers (per-index depths) and
      // below the HUD (1000).
      const directions = [
        { dx: -24, dy: -16 }, { dx: 24, dy: -16 }, { dx: 0, dy: -28 },
        { dx: -20, dy: 18 }, { dx: 20, dy: 18 }, { dx: 0, dy: 28 },
        { dx: -12, dy: -30 }, { dx: 12, dy: -30 },
      ];
      for (const dir of directions) {
        const spark = s.add.circle(params.x, params.y, 3, 0xffdd88, 0.95).setDepth(400);
        s.tweens.add({
          targets: spark,
          x: params.x + dir.dx,
          y: params.y + dir.dy,
          alpha: 0,
          scale: 0.4,
          duration: 400,
          ease: 'Quad.easeOut',
          onComplete: () => {
            spark.destroy();
          },
        });
      }
    }

    // Event name pop at the played card's position (kept under reduced
    // motion).
    const text = s.add.text(params.x, params.y - 20, params.eventName, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffdd88',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(500);
    void popTextOrIcon({
      scene: s,
      target: text,
      duration: 1400,
      riseY: 28,
      scale: 1.3,
      reducedMotion,
    });
  
}
