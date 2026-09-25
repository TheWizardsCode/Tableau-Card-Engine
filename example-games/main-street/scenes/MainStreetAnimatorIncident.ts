/**
 * Main Street: Incident and Peek Animation
 *
 * Incident reveal, delta bubbles, and peek-deck reveal animations.
 *
 * Import graph: depends only on `MainStreetAnimatorContext` (type) + timing.
 *
 * @module
 */

import { moveGameObject } from '@ui';
import type { PendingEndOfTurnDeltas } from '../MainStreetEngine';
import { CARD_BACK_TEMPLATE, SFX_KEYS } from './MainStreetConstants';
import { mainStreetRenderCardSvg } from '@ui/Renderer/adapters/MainStreetAdapter';
import type { MainStreetAnimatorContext } from './MainStreetAnimatorContext';


export function animateIncidentReveal(animator: MainStreetAnimatorContext, params: {
    cardId: string;
    incidentName: string;
    /** Net coin delta from the incident (negative = loss). */
    coinChange: number;
    /** Net reputation delta from the incident (negative = loss). */
    repChange: number;
    /** Origin of the reveal: the front incident-queue card centre. */
    from: { x: number; y: number };
    /** Fired after the container is returned and destroyed. */
    onComplete?: () => void;
    /**
     * Deferred-mutation deltas (CG-0MTR72P14000VO6Q): applied in the reveal
     * cleanup (at most once via the scene guard) so the incident's coin/rep
     * deltas land only after the reveal completes. Absent for the legacy
     * immediate path where the engine already applied them.
     */
    pendingDeltas?: PendingEndOfTurnDeltas;
  }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes. The
    // completion callback still fires so the caller's turn-advance chain is
    // never left hanging (presentation is skipped; control flow is not).
    if (s.replayMode) {
      params.onComplete?.();
      return;
    }
    // No incident resolved: no-op — no rendering, audio, or scheduling. Fire
    // the completion callback so a defensive empty-id call never hangs the turn.
    if (!params.cardId) {
      params.onComplete?.();
      return;
    }
    const reducedMotion = s.settingsPanel?.reducedMotion === true;

    // Warning sting SFX — retained in both modes.
    try { s.soundManager?.play(SFX_KEYS.INCOME_NEGATIVE); } catch (_) { /* ignore */ }

    const w = s.layout.queueCardW ?? s.layout.marketCardW;
    const h = s.layout.queueCardH ?? s.layout.marketCardH;

    // Build the card-back-over-face container at the queue origin.
    const container = s.add.container(params.from.x, params.from.y);
    container.setDepth(10000);

    // Face first (bottom), then back overlay (top).
    mainStreetRenderCardSvg(s, container, params.cardId, w, h);
    const back = mainStreetRenderCardSvg(s, container, CARD_BACK_TEMPLATE, w, h);

    const cleanup = (): void => {
      // Deferred-mutation application (CG-0MTR72P14000VO6Q AC3): apply any
      // pending deltas when the incident reveal completes (this may be the
      // last animation of the end-of-turn cycle). Idempotent via the scene
      // guard — the income collection may have applied them already.
      animator.applyPendingDeltasOnce(params.pendingDeltas);
      // Close the deferred HUD window so refreshHud renders post-delta values.
      s.incidentRevealActive = false;
      container.destroy();
      params.onComplete?.();
    };

    if (reducedMotion) {
      // Reduced motion: the card appears instantly face-up at board centre —
      // no flight, no hinge flip, no bubble travel — but the 4-second hold
      // is preserved so the player still has time to read the incident.
      back.setVisible(false);
      container.setPosition(s.layout.gameW / 2, s.layout.gameH / 2);
      s.incidentRevealActive = true;
      s.time.delayedCall(4000, () => {
        cleanup();
      });
      return;
    }

    // ── Full motion choreography ──
    s.incidentRevealActive = true;

    // 2. Flight to board centre (~550ms).
    const boardCentre = { x: s.layout.gameW / 2, y: s.layout.gameH / 2 };
    s.tweens.add({
      targets: container,
      x: boardCentre.x,
      y: boardCentre.y,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 550,
      ease: 'Quad.easeOut',
      onComplete: () => {
        // 3. Hinge-flip: scaleX → 0 reveals the face.
        s.tweens.add({
          targets: back,
          scaleX: 0,
          duration: 260,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            back.setVisible(false);
            // 4. Delta bubbles during the 4-second hold.
            animator.animateIncidentDeltaBubbles({
              coinChange: params.coinChange,
              repChange: params.repChange,
              cardCenter: boardCentre,
              hudCoinX: s.layout.gameW * 0.25 + 70,
              hudRepX: s.layout.gameW * 0.5,
              hudY: s.layout.hudY,
            });
            // 4s hold, then return to queue.
            s.time.delayedCall(4000, () => {
              // Return animation: scale down slightly, move back.
              s.tweens.add({
                targets: container,
                x: params.from.x,
                y: params.from.y,
                scaleX: 1,
                scaleY: 1,
                duration: 400,
                ease: 'Quad.easeIn',
                onComplete: cleanup,
              });
            });
          },
        });
      },
    });
  
}

export function animateIncidentDeltaBubbles(animator: MainStreetAnimatorContext, params: {
    coinChange: number;
    repChange: number;
    cardCenter: { x: number; y: number };
    hudCoinX: number;
    hudRepX: number;
    hudY: number;
  }): void {

    const s = animator.scene;
    if (s.settingsPanel?.reducedMotion === true) return;

    const { coinChange, repChange, cardCenter, hudCoinX, hudRepX, hudY } = params;
    const flightMs = 600;

    // Coin bubbles.
    if (coinChange !== 0) {
      const iconCount = Math.min(Math.abs(coinChange), 5); // cap at 5 bubbles
      for (let i = 0; i < iconCount; i++) {
        s.time.delayedCall(i * 80, () => {
          const fromX = coinChange < 0 ? hudCoinX : cardCenter.x;
          const toX = coinChange < 0 ? cardCenter.x : hudCoinX;
          const bubble = s.add.circle(fromX, hudY, 5, 0xffcc44, 1).setDepth(3000);
          moveGameObject({
            scene: s,
            target: bubble,
            destX: toX,
            destY: cardCenter.y,
            duration: flightMs,
            ease: 'Quad.easeIn',
            soundManager: s.soundManager,
            sfx: { start: SFX_KEYS.COIN_POP },
            onComplete: () => {
              try { bubble.destroy(); } catch (_) { /* ignore */ }
            },
          });
        });
      }
    }

    // Reputation bubbles.
    if (repChange !== 0) {
      const iconCount = Math.min(Math.abs(repChange), 5); // cap at 5 bubbles
      for (let i = 0; i < iconCount; i++) {
        s.time.delayedCall(i * 80, () => {
          const fromX = repChange < 0 ? hudRepX : cardCenter.x;
          const toX = repChange < 0 ? cardCenter.x : hudRepX;
          const bubble = s.add.circle(fromX, hudY, 4, 0x88bbff, 1).setDepth(3000);
          moveGameObject({
            scene: s,
            target: bubble,
            destX: toX,
            destY: cardCenter.y,
            duration: flightMs,
            ease: 'Quad.easeIn',
            onComplete: () => {
              try { bubble.destroy(); } catch (_) { /* ignore */ }
            },
          });
        });
      }
    }
  
}

export function animatePeekReveal(animator: MainStreetAnimatorContext, params: {
    cardId: string;
    cardName: string;
    /** Origin of the reveal: the face-down incident-deck stack centre. */
    from: { x: number; y: number };
    /** Fired after the card is returned face-down (both modes). */
    onComplete?: () => void;
  }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const w = s.layout.queueCardW;
    const h = s.layout.queueCardH;

    const container = s.add.container(params.from.x, params.from.y);
    container.setDepth(10000);

    // The actual SVG face sits beneath the card back; the back flips open
    // to reveal it and flips closed to return the card face-down.
    mainStreetRenderCardSvg(s, container, params.cardId, w, h);
    const back = mainStreetRenderCardSvg(s, container, CARD_BACK_TEMPLATE, w, h);

    const cleanup = (): void => {
      container.destroy();
      params.onComplete?.();
    };

    // Deal SFX on reveal — retained under reduced motion (rule 8).
    try { s.soundManager?.play(SFX_KEYS.DEAL); } catch (_) { /* ignore */ }

    if (reducedMotion) {
      // Instant reveal: drop the back, hold the face briefly, restore.
      back.setVisible(false);
      s.time.delayedCall(900, () => {
        try { s.soundManager?.play(SFX_KEYS.CLICK); } catch (_) { /* ignore */ }
        cleanup();
      });
      return;
    }

    // Hinge open: scaleX 1 → 0 reveals the face beneath.
    s.tweens.add({
      targets: back,
      scaleX: 0,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        back.setVisible(false);
        try { s.soundManager?.play(SFX_KEYS.CLICK); } catch (_) { /* ignore */ }
        // Hold the face up, then flip back down.
        s.time.delayedCall(1600, () => {
          back.setVisible(true);
          back.scaleX = 0;
          s.tweens.add({
            targets: back,
            scaleX: 1,
            duration: 260,
            ease: 'Cubic.easeOut',
            onComplete: cleanup,
          });
        });
      },
    });
  
}
