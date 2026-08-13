import Phaser from 'phaser';
import { CARD_TEMPLATE_NAMES } from '../MainStreetCards';
import { FONT_FAMILY, popTextOrIcon, moveGameObject } from '../../../src/ui';
import type { SlotIncome } from '../MainStreetAdjacency';
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

  /**
   * Animates end-of-turn income collection.
   *
   * Each producing street slot emits a coin icon that arcs to the HUD coins
   * counter with a staggered coin-pop SFX (`SFX_KEYS.COIN_POP`);
   * reputation-earning cards emit a reputation pip that flies to the
   * reputation HUD value. When every flight has landed a final "+total" pop
   * lands at the coin counter and `scene.incomeCollectionActive` clears.
   *
   * Accessibility (reduced motion): all flights are skipped and the method
   * returns immediately — the caller's HUD refresh path
   * (`refreshHud()` → `animateHudValueChanges()`) still provides the single
   * final "+total" pop + income sound, per the proposal's AC3.
   *
   * Headless/replay exemption (AGENTS.md rule 8): this is a
   * presentation-only effect — it never mutates game state, the transcript,
   * or the turn flow. In replay/headless mode (`scene.replayMode`) it
   * returns immediately (no rendering, no audio), which is the documented
   * exemption for those modes.
   *
   * HUD targets mirror `MainStreetRenderer.refreshHud()` strip geometry:
   * stripWidth = gameW * 0.5, stripLeft = gameW * 0.25; the coins label sits
   * at stripLeft + 70 and the reputation label at the strip centre. Keep the
   * two in sync if the HUD strip geometry changes.
   *
   * @param params  Income result (per-slot breakdown = coin flight sources)
   *                and per-slot reputation contributions (pip sources).
   */
  public animateIncomeCollection(params: {

    /** Income result from `processEndOfTurn` (pre-multiplier totals). */
    income: {
      total: number;
      breakdown: SlotIncome[];
    };
    /** Per-slot reputation contributions (`currentReputationPerTurn > 0`). */
    repSources: Array<{ slotIndex: number; rep: number }>;
  }): void {
    const s = this.scene;

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
      launch(this.getStreetSlotCenter(slot.slotIndex), { x: coinX, y: hudY }, 'coin', i * staggerMs);
    });
    params.repSources.forEach((slot, i) => {
      launch(this.getStreetSlotCenter(slot.slotIndex), { x: repX, y: hudY }, 'rep', (coinSources.length + i) * staggerMs);
    });
  }

  /**
   * Animates market cards dealing in after a refill (day start) or a
   * Discover/Research row swap.
   *
   * Incoming cards start in a "dealt" state (small, faint, raised) and
   * animate to full size/opacity with a staggered deal SFX
   * (`SFX_KEYS.DEAL`). For row swaps, outgoing cards first fade/shrink out
   * as lightweight snapshot visuals so the replacement feels like a swap
   * rather than an instant cut.
   *
   * Accessibility (reduced motion): cards appear instantly (the current
   * behaviour) — no transform is applied and nothing is scheduled.
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns immediately in replay/headless mode (`scene.replayMode`), no
   * rendering or audio. Never mutates game state or the transcript.
   *
   * Non-blocking: tweens are fire-and-forget; market interaction remains
   * available (the dealt state is applied synchronously in the same frame
   * as the draw, so no flicker).
   *
   * @param params  Row being animated, the rendered incoming card containers
   *                (slot order), and optional outgoing-card snapshots.
   */
  public animateMarketDealIn(params: {
    row: 'development' | 'investments';
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
    const s = this.scene;

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
        const visual = this.createTransferCardVisual(o.cardId, o.family, o.x, o.y);
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

  /**
   * Animates the end-of-turn incident reveal: a dramatic sting with damage
   * feedback so the most negative event in the game reads clearly.
   *
   * Full effect (reduced-motion OFF):
   * 1. A snapshot card visual flies from the front incident-queue slot to
   *    the centre of the board (`createTransferCardVisual`, event family).
   * 2. A brief, subtle red vignette flash pulses over the scene.
   * 3. The warning sting SFX (`SFX_KEYS.INCOME_NEGATIVE`) plays.
   * 4. The incident's coin/reputation loss pops on the HUD with
   *    negative-colour `popTextOrIcon` (explicit, so the deltas are visible
   *    even while the income-collection animation suppresses the generic
   *    HUD delta pop).
   * 5. The active-effects warning indicator (⚠ lines in the Upcoming panel)
   *    pulses once.
   *
   * Accessibility (reduced motion): the flight, flash, and indicator pulse
   * are skipped, but the warning SFX and the HUD loss pops are retained
   * (AC3 — "keep the pop text + sound").
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns immediately in replay/headless mode (`scene.replayMode`) — no
   * rendering, no audio. Never mutates game state or the transcript, and
   * never blocks the turn flow (fire-and-forget tweens).
   *
   * @param params  Resolved incident (card id/name), its resource deltas
   *                (negative = loss) and the queue origin for the flight.
   */
  public animateIncidentReveal(params: {
    cardId: string;
    incidentName: string;
    /** Net coin delta from the incident (negative = loss). */
    coinChange: number;
    /** Net reputation delta from the incident (negative = loss). */
    repChange: number;
    /** Origin of the flight: the front incident-queue card centre. */
    from: { x: number; y: number };
  }): void {
    const s = this.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;

    // 3. Warning sting — retained under reduced motion (AC3).
    try { s.soundManager?.play(SFX_KEYS.INCOME_NEGATIVE); } catch (_) { /* ignore */ }

    if (!reducedMotion) {
      // 1. Flight from the queue to the board centre.
      const to = { x: s.layout.gameW / 2, y: s.layout.gameH / 2 };
      const visual = this.createTransferCardVisual(params.cardId, 'event', params.from.x, params.from.y);
      s.tweens.add({
        targets: visual,
        x: to.x,
        y: to.y,
        scaleX: 1.12,
        scaleY: 1.12,
        duration: 550,
        ease: 'Quad.easeOut',
        onComplete: () => {
          visual.destroy();
        },
      });

      // 2. Red vignette flash pulse (subtle, brief). Sits above the
      // gameplay containers (depth 95) and below the HUD (1000+).
      const flash = s.add.rectangle(to.x, to.y, s.layout.gameW, s.layout.gameH, 0xff2222, 1)
        .setDepth(95)
        .setAlpha(0);
      s.tweens.add({
        targets: flash,
        alpha: 0.22,
        duration: 130,
        yoyo: true,
        hold: 80,
        onComplete: () => {
          flash.destroy();
        },
      });

      // 5. Active-effects warning indicator pulses once.
      this.pulseActiveEffectsIndicator();
    }

    // 4. Explicit HUD loss pops for the incident's resource deltas.
    const hudY = s.layout.hudY;
    const coinX = s.layout.gameW * 0.25 + 70;  // mirrors refreshHud strip geometry
    const repX = s.layout.gameW * 0.5;
    const popLoss = (x: number, delta: number): void => {
      if (delta === 0) return;
      const text = s.add.text(x, hudY - 6, `${delta > 0 ? '+' : ''}${delta}`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: delta < 0 ? '#ff7777' : '#ffdd66',
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
    };
    popLoss(coinX, params.coinChange);
    popLoss(repX, params.repChange);
  }

  /**
   * Pulses the ⚠ active-effects warning indicator texts in the Upcoming
   * panel once (quick scale yoyo) to draw the eye to ongoing modifiers.
   * No-op when no active effects are rendered. Presentation-only.
   */
  private pulseActiveEffectsIndicator(): void {
    const s = this.scene;
    const warnChar = String.fromCodePoint(0x26A0);
    const list = s.incidentQueueContainer?.list ?? [];
    for (const obj of list) {
      const textObj = obj as { type?: string; text?: string; scaleX?: number; scaleY?: number; setScale?: (x: number, y?: number) => void };
      if (textObj.type === 'Text' && typeof textObj.text === 'string' && textObj.text.startsWith(warnChar)) {
        const baseScaleX = textObj.scaleX ?? 1;
        const baseScaleY = textObj.scaleY ?? 1;
        s.tweens.add({
          targets: textObj,
          scaleX: 1.5,
          scaleY: 1.5,
          duration: 120,
          yoyo: true,
          hold: 60,
          onComplete: () => {
            textObj.setScale?.(baseScaleX, baseScaleY);
          },
        });
      }
    }
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
    /**
     * Optional start position for the transfer visual. When omitted the
     * visual originates at the market card's slot centre (click/AI flows,
     * where the card still sits in the market). Drag-and-drop flows pass
     * the drop location so the animation continues from where the card was
     * released instead of jumping back to the market row.
     */
    source?: { x: number; y: number };
    destination: { x: number; y: number };
  }): Promise<void> {
    const s = this.scene;
    if (s.settingsPanel?.reducedMotion) return Promise.resolve();

    const source = options.source ?? this.getMarketCardCenter(options.row, options.slotIndex);
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
