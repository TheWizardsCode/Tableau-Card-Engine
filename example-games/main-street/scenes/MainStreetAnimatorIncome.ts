/**
 * Main Street: Income / HUD Animation
 *
 * Income collection and phased choreography, HUD value changes, celebration,
 * and coin-grid flight helpers.
 *
 * Import graph: depends only on `MainStreetAnimatorContext` (type) + timing.
 *
 * @module
 */

import Phaser from 'phaser';
import { FONT_FAMILY, moveGameObject, popTextOrIcon } from '@ui';
import type { SlotIncome, SlotPhaseBreakdown } from '../MainStreetAdjacency';
import { applyEndOfTurnDeltas } from '../MainStreetEngine';
import type { PendingEndOfTurnDeltas } from '../MainStreetEngine';
import { SFX_KEYS } from './MainStreetConstants';
import { createCoinGrid, iconsForAmount, roundHalf } from '../coin-grid';
import type { IncomePhaseKey, IncomePhaseOptions, IncomePhaseSlot, MainStreetAnimatorContext } from './MainStreetAnimatorContext';
import { INCOME_CARD_FULL_PAUSE_MULTIPLIER, INCOME_COLLECT_STAGGER_MS, INCOME_FLIGHT_MS, INCOME_FLIGHT_STAGGER_MS, INCOME_PHASE_GAP_MS, INCOME_PHASE_LABEL_MS } from './MainStreetAnimatorTiming';


export function animateHudValueChanges(animator: MainStreetAnimatorContext, params: {
    coins: number;
    reputation: number;
    coinX: number;
    repX: number;
    hudY: number;
  }): void {

    const s = animator.scene;
    const { coins, reputation, coinX, repX, hudY } = params;

    if (s.previousCoins === null || s.previousReputation === null) {
      s.previousCoins = coins;
      s.previousReputation = reputation;
      return;
    }

    const reducedMotion = s.settingsPanel?.reducedMotion;
    // While the end-of-turn income collection animation is running, the
    // immediate HUD delta pop is suppressed — the collection's final
    // "+total" pop (animateIncomeCollection) is the single landing
    // feedback. The income sound/event routing below is still performed.
    const suppressDeltaPop = s.incomeCollectionActive === true;

    if (coins !== s.previousCoins) {
      const delta = coins - s.previousCoins;
      if (!suppressDeltaPop) {
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
      }
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
      if (!suppressDeltaPop) {
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
    }

    s.previousCoins = coins;
    s.previousReputation = reputation;
  
}

export function animateCelebration(animator: MainStreetAnimatorContext, challengeTitle: string): Promise<void> {

    const s = animator.scene;
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

export function animateIncomeCollection(animator: MainStreetAnimatorContext, params: {

    /** Income result from `processEndOfTurn` (pre-multiplier totals). */
    income: {
      total: number;
      breakdown: SlotIncome[];
    };
    /** Per-slot reputation contributions (`currentReputationPerTurn > 0`). */
    repSources: Array<{ slotIndex: number; rep: number }>;
  }): void {

    const s = animator.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;

    // Reduced motion: skip flights; the HUD refresh path provides the
    // single final pop + income sound.
    if (s.settingsPanel?.reducedMotion) return;

    const coinSources = params.income.breakdown.filter((b) => b.total > 0);
    if (coinSources.length === 0 && params.repSources.length === 0) return;

    const { gameW, hudY } = s.layout;
    const coinX = gameW * 0.25 + 70;
    const repX = gameW * 0.5;
    const flightMs = 600;
    const staggerMs = 50;

    s.incomeCollectionActive = true;
    let remaining = coinSources.length + params.repSources.length;

    const completeOne = (): void => {
      remaining -= 1;
      if (remaining > 0) return;
      // All flights landed — final "+total" pop at the coin counter.
      const totalText = s.add.text(coinX, hudY - 8, `+${params.income.total}`, {
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: s,
        target: totalText,
        duration: 1000,
        riseY: 24,
        scale: 1.3,
        reducedMotion: false, // collection only runs when reduced motion is off
      });
      s.incomeCollectionActive = false;
    };

    const launch = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      kind: 'coin' | 'rep',
      delayMs: number,
    ): void => {
      s.time.delayedCall(delayMs, () => {
        const visual = s.add.circle(
          from.x,
          from.y,
          kind === 'coin' ? 6 : 5,
          kind === 'coin' ? 0xffcc44 : 0x88bbff,
          1,
        );
        visual.setDepth(3000);
        moveGameObject({
          scene: s,
          target: visual,
          destX: to.x,
          destY: to.y,
          duration: flightMs,
          ease: 'Quad.easeIn',
          soundManager: s.soundManager,
          // Coin flights pop; reputation pips are silent (no coin sound).
          sfx: kind === 'coin' ? { start: SFX_KEYS.COIN_POP } : undefined,
          onComplete: () => {
            visual.destroy();
            completeOne();
          },
        });
      });
    };

    coinSources.forEach((slot, i) => {
      launch(animator.getStreetSlotCenter(slot.slotIndex), { x: coinX, y: hudY }, 'coin', i * staggerMs);
    });
    params.repSources.forEach((slot, i) => {
      launch(animator.getStreetSlotCenter(slot.slotIndex), { x: repX, y: hudY }, 'rep', (coinSources.length + i) * staggerMs);
    });
  
}

export function animateIncomePhases(animator: MainStreetAnimatorContext, phaseData: SlotPhaseBreakdown[], options: IncomePhaseOptions = {}): void {

    const s = animator.scene;

    // Headless/replay exemption (AC10): no rendering or audio in those modes.
    if (s.replayMode) return;

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const gap = Math.max(1, options.phaseGapMs ?? INCOME_PHASE_GAP_MS);
    const startAt = Math.max(0, options.startDelayMs ?? 0);

    try {
      // Resolve producing slots to live card containers and create their
      // grids up front. Grids are parented to the card containers (child 2)
      // so coins move with the cards; later phases mutate them in place.
      const slots: IncomePhaseSlot[] = [];
      for (const pd of phaseData) {
        const card = animator.findStreetCardContainer(pd.slotIndex);
        if (!card) continue;
        slots.push({ pd, card, handle: createCoinGrid(s, card), displayed: 0 });
      }
      if (slots.length === 0) return;

      s.incomeCollectionActive = true;

      const emit = (phase: IncomePhaseKey, index: number): void => {
        try {
          options.onPhase?.(phase, index);
        } catch { /* ignore */ }
      };

      const phaseMeta: Array<{ key: IncomePhaseKey; label: string; color: number }> = [
        { key: 'base', label: 'Base income', color: 0xffdd66 },
        { key: 'synergy', label: 'Synergy', color: 0xb89bff },
        { key: 'reputation', label: 'Reputation', color: 0x88bbff },
        { key: 'events', label: 'Events', color: 0xff7744 },
        { key: 'upcoming', label: 'Upcoming', color: 0x55ddaa },
      ];

      let t = startAt;
      phaseMeta.forEach((meta, i) => {
        const at = t;
        s.time.delayedCall(at, () => {
          try {
            emit(meta.key, i);
            animator.showIncomePhaseLabel(meta.label, meta.color);
            animator.runIncomePhase(meta.key, slots, { reducedMotion });
          } catch { /* ignore */ }
        });
        t += gap;
      });

      s.time.delayedCall(t, () => {
        try {
          emit('collect', phaseMeta.length);
          animator.collectIncomeGrids(slots, {
            reducedMotion,
            creditedTotal: animator.creditedIncomeTotal(phaseData),
            pendingDeltas: options.pendingDeltas,
          });
        } catch { /* ignore */ }
      });
    } catch {
      s.incomeCollectionActive = false;
    }
  
}

export function runIncomePhase(animator: MainStreetAnimatorContext, phase: IncomePhaseKey, slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
  }): void {

    const s = animator.scene;
    const numSlots = slots.length;

    switch (phase) {
      case 'base': {
        if (ctx.reducedMotion) return;
        let delayOffset = 0;
        for (let si = 0; si < numSlots; si++) {
          const slot = slots[si];
          const amount = Math.max(0, roundHalf(slot.pd.baseIncome));
          if (iconsForAmount(amount) === 0) {
            delayOffset += animator.getCardDelay(numSlots, si);
            continue;
          }
          animator.countOutCoins(slot, amount, delayOffset);
          // Audit (CG-0MTR766U6003RZ88): pause for 5× current stagger when
          // card's coin grid is full, then reduce stagger by 20% for next card.
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * animator.currentCoinStagger;
          delayOffset += animator.getCardDelay(numSlots, si) + pauseMs;
          animator.reduceCoinStaggerAfterCard();
        }
        break;
      }
      case 'synergy': {
        if (ctx.reducedMotion) return;
        // Bidirectional line-to-grid flights (CG-0MTV6LZEA003YS3E): for every
        // synergy pair, one coin stream per direction travels along the shared
        // clipped line (synergyLineEndpoints) from the giver's edge to the
        // receiver's edge, then pops into the receiver's on-card coin grid.
        // The phase no longer short-circuits while any slot has a synergy
        // bonus; `synergyPhaseFlights` already filters slots without one.
        const flights = animator.synergyPhaseFlights(slots);
        if (flights.length === 0) return;
        let at = 0;
        for (const flight of flights) {
          animator.flyCoinsAlongLine(flight.slot, flight.amount, flight.start, flight.end, at);
          // Per-line stagger (parallel flights never drift further than this).
          at += INCOME_FLIGHT_STAGGER_MS;
        }
        break;
      }
      case 'reputation': {
        if (ctx.reducedMotion) return;
        if (!slots.some((sl) => iconsForAmount(roundHalf(sl.pd.repBonus)) > 0)) return;
        const from = { x: s.layout.gameW * 0.5, y: s.layout.hudY };
        let delayOffset = 0;
        for (let si = 0; si < numSlots; si++) {
          const slot = slots[si];
          const amount = Math.max(0, roundHalf(slot.pd.repBonus));
          if (iconsForAmount(amount) === 0) {
            delayOffset += animator.getCardDelay(numSlots, si);
            continue;
          }
          const flightMs = animator.getFlightDuration(numSlots, si);
          animator.flyCoinsIn(slot, amount, from, delayOffset, flightMs);
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * animator.currentCoinStagger;
          delayOffset += animator.getCardDelay(numSlots, si) + pauseMs;
          animator.reduceCoinStaggerAfterCard();
        }
        break;
      }
      case 'events': {
        if (ctx.reducedMotion) return;
        const deltaEffects = animator.eventDeltaEffects(slots);
        if (deltaEffects.length === 0) return;
        const lineStartRow = (s.state.activeEffects ?? []).length;
        deltaEffects.forEach((effect, ei) => {
          try {
            s.msRenderer?.animateUpcomingEffectLine?.(effect, lineStartRow + ei);
          } catch { /* ignore */ }
          // Coins in/out per affected slot for this effect.
          let effectDelayOffset = 0;
          for (let si = 0; si < numSlots; si++) {
            const slot = slots[si];
            const delta = slot.pd.eventDeltas.reduce(
              (acc, d) => (d.cardId === effect.sourceEventId ? acc + d.delta : acc),
              0,
            );
            if (delta === 0) {
              effectDelayOffset += animator.getCardDelay(numSlots, si);
              continue;
            }
            if (iconsForAmount(Math.abs(roundHalf(delta))) === 0) {
              effectDelayOffset += animator.getCardDelay(numSlots, si);
              continue;
            }
            const amount = Math.abs(roundHalf(delta));
            const flightMs = animator.getFlightDuration(numSlots, si);
            const at = effectDelayOffset;
            if (delta > 0) {
              animator.flyCoinsIn(slot, amount, animator.eventSourcePoint(), at, flightMs);
            } else {
              animator.flyCoinsOut(slot, amount, animator.eventSourcePoint(), at, flightMs);
            }
            const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * animator.currentCoinStagger;
            effectDelayOffset += animator.getCardDelay(numSlots, si) + pauseMs;
            animator.reduceCoinStaggerAfterCard();
          }
        });
        break;
      }
      case 'upcoming': {
        if (ctx.reducedMotion) return;
        const from = { x: s.layout.gameW * 0.5, y: s.layout.queueTop };
        let delayOffset = 0;
        for (let si = 0; si < numSlots; si++) {
          const slot = slots[si];
          for (const d of slot.pd.upcomingDeltas ?? []) {
            if (iconsForAmount(Math.abs(roundHalf(d.delta))) === 0) continue;
            const amount = Math.abs(roundHalf(d.delta));
            const flightMs = animator.getFlightDuration(numSlots, si);
            if (d.delta > 0) {
              animator.flyCoinsIn(slot, amount, from, delayOffset, flightMs);
            } else {
              animator.flyCoinsOut(slot, amount, from, delayOffset, flightMs);
            }
          }
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * animator.currentCoinStagger;
          delayOffset += animator.getCardDelay(numSlots, si) + pauseMs;
          animator.reduceCoinStaggerAfterCard();
        }
        break;
      }
      default:
        break;
    }
  
}

export function eventDeltaEffects(animator: MainStreetAnimatorContext, slots: IncomePhaseSlot[]): Array<{
    sourceEventId: string;
    description: string;
  }> {

    const s = animator.scene;
    const byId = new Map<string, string>();
    for (const slot of slots) {
      for (const d of slot.pd.eventDeltas ?? []) {
        if (!byId.has(d.cardId)) byId.set(d.cardId, d.name);
      }
    }
    for (const effect of s.state.activeEffects ?? []) {
      if (effect.effectType === 'income-multiplier' && byId.has(effect.sourceEventId)) {
        byId.set(effect.sourceEventId, effect.description);
      }
    }
    return [...byId.entries()].map(([sourceEventId, description]) => ({ sourceEventId, description }));
  
}

export function countOutCoins(animator: MainStreetAnimatorContext, slot: IncomePhaseSlot, amount: number, at: number): void {

    const s = animator.scene;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    for (let n = 1; n <= iconCount; n++) {
      s.time.delayedCall(at + animator.getIconStagger(iconCount, n - 1), () => {
        try {
          // Incrementally add one coin at a time (half coin last) so the
          // grid accumulates across phases (AC: stay visible until collect).
          const increment = 1;
          animator.revealInGrid(slot, Math.round(slot.displayed + increment));
        } catch { /* ignore */ }
      });
    }
  
}

export function revealInGrid(animator: MainStreetAnimatorContext, slot: IncomePhaseSlot, cumulativeAmount: number): void {

    const s = animator.scene;
    slot.displayed = cumulativeAmount;
    const layout = slot.handle.addCoins(cumulativeAmount);
    if (!layout) return;
    const icons = slot.handle.container.list;
    const last = icons[icons.length - 1] as Phaser.GameObjects.Image | undefined;
    if (last) {
      last.setScale(0);
      s.tweens.add({
        targets: last,
        scaleX: 1,
        scaleY: 1,
        duration: 220,
        ease: 'Back.easeOut',
      });
    }
    try { s.soundManager?.play(SFX_KEYS.COIN_POP); } catch { /* ignore */ }
  
}

export function flyCoinsIn(animator: MainStreetAnimatorContext, 
    slot: IncomePhaseSlot,
    amount: number,
    from: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {

    const s = animator.scene;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    const duration = flightMs ?? INCOME_FLIGHT_MS;
    const m = slot.handle.container.getWorldTransformMatrix();
    const to = { x: m.getX(0, 0), y: m.getY(0, 0) };
    for (let i = 0; i < iconCount; i++) {
      s.time.delayedCall(at + animator.getIconStagger(iconCount, i), () => {
        try {
          const visual = s.add.circle(from.x, from.y, 6, 0xffcc44, 1).setDepth(3000);
          moveGameObject({
            scene: s,
            target: visual,
            destX: to.x,
            destY: to.y,
            duration,
            ease: 'Quad.easeIn',
            soundManager: s.soundManager,
            sfx: { start: SFX_KEYS.COIN_POP, moveIntervalMs: 200 },
            onComplete: () => {
              try {
                visual.destroy();
                // Incrementally add one landed coin (half coin last) so
                // concurrent phases accumulate robustly.
                const increment = 1;
                animator.revealInGrid(slot, Math.round(slot.displayed + increment));
              } catch { /* ignore */ }
            },
          });
        } catch { /* ignore */ }
      });
    }
  
}

export function flyCoinsAlongLine(animator: MainStreetAnimatorContext, 
    slot: IncomePhaseSlot,
    amount: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {

    const s = animator.scene;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    const duration = flightMs ?? INCOME_FLIGHT_MS;
    for (let i = 0; i < iconCount; i++) {
      s.time.delayedCall(at + i * INCOME_FLIGHT_STAGGER_MS, () => {
        try {
          const visual = s.add.circle(from.x, from.y, 6, 0xffcc44, 1).setDepth(3000);
          moveGameObject({
            scene: s,
            target: visual,
            destX: to.x,
            destY: to.y,
            duration,
            ease: 'Quad.easeIn',
            soundManager: s.soundManager,
            sfx: { start: SFX_KEYS.COIN_POP, moveIntervalMs: 200 },
            onComplete: () => {
              try {
                visual.destroy();
                // Arrival increments the receiver's on-card grid (same
                // incremental accumulation as base/reputation phases).
                animator.revealInGrid(slot, Math.round(slot.displayed + 1));
              } catch { /* ignore */ }
            },
          });
        } catch { /* ignore */ }
      });
    }
  
}

export function flyCoinsOut(animator: MainStreetAnimatorContext, 
    slot: IncomePhaseSlot,
    amount: number,
    to: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {

    const s = animator.scene;
    const grid = slot.handle.container;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    const duration = flightMs ?? INCOME_FLIGHT_MS;
    // Decrement sequence: 1 icon per 100 coins (x100 economy presentation scaling).
    const decrements: number[] = [];
    for (let k = 0; k < iconCount; k++) decrements.push(1);
    for (let i = 0; i < iconCount; i++) {
      s.time.delayedCall(at + animator.getIconStagger(iconCount, i), () => {
        try {
          const icon = grid.list[grid.list.length - 1] as Phaser.GameObjects.Image | undefined;
          if (!icon) return; // no coins left in the grid to remove
          // Decrement incrementally from the live displayed total so
          // concurrent negative deltas accumulate correctly.
          slot.displayed = Math.round(Math.max(0, slot.displayed - decrements[i]));
          const m = icon.getWorldTransformMatrix();
          const from = { x: m.getX(0, 0), y: m.getY(0, 0) };
          grid.remove(icon);
          s.add.existing(icon);
          icon.setPosition(from.x, from.y).setDepth(3000);
          moveGameObject({
            scene: s,
            target: icon,
            destX: to.x,
            destY: to.y,
            duration,
            ease: 'Quad.easeIn',
            onComplete: () => {
              try { icon.destroy(); } catch { /* ignore */ }
            },
          });
          s.tweens.add({ targets: icon, alpha: 0, duration, delay: duration * 0.4 });
        } catch { /* ignore */ }
      });
    }
  
}

export function applyPendingDeltasOnce(animator: MainStreetAnimatorContext, deltas: PendingEndOfTurnDeltas | undefined): void {

    if (!deltas) return;
    const s = animator.scene;
    try {
      if (!s.endOfTurnDeltasApplied) {
        applyEndOfTurnDeltas(s.state, deltas);
        s.endOfTurnDeltasApplied = true;
      }
    } catch { /* presentation-only — never break the choreography */ }
  
}

export function collectIncomeGrids(animator: MainStreetAnimatorContext, slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
    creditedTotal: number;
    /** Deferred-mutation deltas to apply when the collection finishes (CG-0MTR72P14000VO6Q). */
    pendingDeltas?: PendingEndOfTurnDeltas;
  }): void {

    const s = animator.scene;
    const { gameW, hudY } = s.layout;
    const coinX = gameW * 0.25 + 70;
    const numSlots = slots.length;

    let pending = 0;
    const finalize = (): void => {
      try {
        // Deferred-mutation application (CG-0MTR72P14000VO6Q AC3): apply the
        // pending deltas in a single step once the coin-grid flight lands,
        // BEFORE the incomeCollectionActive flag clears — the final
        // refreshAll (in finishTurnPresentation) then shows the new values.
        // Idempotent: the scene guard ensures at-most-once across the income
        // and incident animations.
        animator.applyPendingDeltasOnce(ctx.pendingDeltas);
        if (!ctx.reducedMotion || pending === 0) {
          const totalText = s.add.text(coinX, hudY - 8, `+${ctx.creditedTotal}`, {
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffdd66',
            fontFamily: FONT_FAMILY,
          }).setOrigin(0.5).setDepth(500);
          void popTextOrIcon({
            scene: s,
            target: totalText,
            duration: 1000,
            riseY: 24,
            scale: 1.3,
            reducedMotion: false,
          });
          try { s.soundManager?.play(SFX_KEYS.INCOME_POSITIVE); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      for (const slot of slots) {
        try { slot.handle.container.destroy(); } catch { /* ignore */ }
      }
      s.incomeCollectionActive = false;
    };

    if (ctx.reducedMotion) {
      finalize();
      return;
    }

    // Collect one card's grid at a time (sequential per-slot).
    let delayOffset = 0;
    for (let si = 0; si < numSlots; si++) {
      const slot = slots[si];
      const grid = slot.handle.container;
      const icons = [...grid.list];
      const flightMs = animator.getFlightDuration(numSlots, si);
      for (let i = 0; i < icons.length; i++) {
        const icon = icons[i] as Phaser.GameObjects.Image;
        pending += 1;
        s.time.delayedCall(delayOffset + i * INCOME_COLLECT_STAGGER_MS, () => {
          try {
            const m = icon.getWorldTransformMatrix();
            const from = { x: m.getX(0, 0), y: m.getY(0, 0) };
            grid.remove(icon);
            s.add.existing(icon);
            icon.setPosition(from.x, from.y).setDepth(3000);
            moveGameObject({
              scene: s,
              target: icon,
              destX: coinX,
              destY: hudY,
              duration: flightMs,
              ease: 'Quad.easeIn',
              soundManager: s.soundManager,
              sfx: { start: SFX_KEYS.COIN_POP, moveIntervalMs: 200 },
              onComplete: () => {
                try { icon.destroy(); } catch { /* ignore */ }
                pending -= 1;
                if (pending <= 0) finalize();
              },
            });
          } catch {
            pending -= 1;
            if (pending <= 0) finalize();
          }
        });
      }
      delayOffset += animator.getCardDelay(numSlots, si);
    }
    if (pending === 0) finalize();
  
}

export function showIncomePhaseLabel(animator: MainStreetAnimatorContext, text: string, color: number): void {

    const s = animator.scene;
    try {
      const label = s.add.text(
        s.layout.gameW * 0.5,
        Math.max(24, s.layout.streetTop - 10),
        text,
        {
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#' + color.toString(16).padStart(6, '0'),
          fontFamily: FONT_FAMILY,
        },
      ).setOrigin(0.5).setDepth(510).setAlpha(0);
      s.tweens.add({ targets: label, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
      s.time.delayedCall(INCOME_PHASE_LABEL_MS, () => {
        try {
          s.tweens.add({
            targets: label,
            alpha: 0,
            duration: 220,
            onComplete: () => {
              try { label.destroy(); } catch { /* ignore */ }
            },
          });
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  
}
