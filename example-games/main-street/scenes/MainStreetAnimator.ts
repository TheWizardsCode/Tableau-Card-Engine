
// <!-- REFACTOR-CG-0MTP6KLQD001TBMH
// smell: god_class
// severity: medium
// description: MainStreet god modules: Engine 2452, Animator 1942, Renderer 1902, TurnController 1834, State 1599, Cards 1469, Adjacency 1354, Market 1307, LifecycleManager 1111 lines — decompose per-concern helpers; threshold 800; prior CG-0MM1OP07Q16TUTHI covered different scene files, not these modules.
// -->
import Phaser from 'phaser';
import { CARD_TEMPLATE_NAMES, synergyColor } from '../MainStreetCards';
import { FONT_FAMILY, popTextOrIcon, moveGameObject } from '../../../src/ui';
import type { SlotIncome, SlotPhaseBreakdown, SynergyPair } from '../MainStreetAdjacency';
import { computeSynergyPairs } from '../MainStreetAdjacency';
import {
  applyEndOfTurnDeltas,
  type PendingEndOfTurnDeltas,
} from '../MainStreetEngine';
import { SFX_KEYS, CARD_BACK_TEMPLATE } from './MainStreetConstants';
import { synergyLineEndpoints } from './synergyLineEndpoints';
import { mainStreetRenderCardSvg } from '../../../src/ui/Renderer/adapters/MainStreetAdapter';
import { createCoinGrid, iconsForAmount, roundHalf, type CoinGridHandle } from '../coin-grid';
import { playableIndexToMapCenter } from '../MainStreetMapView';

// ── Income phase animation timing (CG-0MT23O6W8003AXWJ) ────────────────
// Tune these constants to adjust the phased income choreography pacing.

/** Gap between income phase starts (~2-3s apart per AC1). */
const INCOME_PHASE_GAP_MS = 2200;
/** How long each phase's on-screen label stays visible. */
const INCOME_PHASE_LABEL_MS = 1400;
/** Duration of a coin flight tween (fallback when no per-card duration is passed). */
const INCOME_FLIGHT_MS = 600;
/** Stagger between grid-to-HUD collection flights within one card. */
const INCOME_COLLECT_STAGGER_MS = 80;

// ── Sequential card-processing timing (CG-0MTR766U6003RZ88) ────────────
// These constants govern the one-card-at-a-time animation model: each slot
// completes fully before the next begins, with decreasing delay and
// increasing speed between successive cards.

/** Starting delay before each card's animation (base/synergy/rep phases). */
const INCOME_BASE_CARD_DELAY_MS = 500;
/** How much the inter-card delay decreases per successive card. */
const INCOME_CARD_DELAY_DECREMENT_MS = 80;
/** Minimum inter-card delay (floor). */
const INCOME_MIN_CARD_DELAY_MS = 120;
/** Base flight duration for a coin icon. */
const INCOME_FLIGHT_BASE_MS = 550;
/** How much flight duration decreases per successive card. */
const INCOME_FLIGHT_DECREMENT_MS = 50;
/** Minimum flight duration (floor). */
const INCOME_FLIGHT_MIN_MS = 350;
/** Stagger between individual coin icons within one card's animation.
 * Audit (CG-0MTR766U6003RZ88): slowed by 50% from 100→150 for better pacing.
 * This value is dynamic per turn — it starts here and decreases by 20% after
 * each card completes, resetting to this base at the start of each turn. */
const INCOME_CARD_COIN_STAGGER_MS = 150;
/** Minimum stagger within a card's icon sequence. */
const INCOME_CARD_COIN_MIN_STAGGER_MS = 50;
/** Pause multiplier when a card's coin grid is full (5× current stagger). */
const INCOME_CARD_FULL_PAUSE_MULTIPLIER = 5;
/** Stagger reduction factor after each card (20% reduction = ×0.8). */
const INCOME_CARD_STAGGER_REDUCTION = 0.8;

/** Phase keys for the phased income animation (base → … → collect). */
export type IncomePhaseKey = 'base' | 'synergy' | 'reputation' | 'events' | 'upcoming' | 'collect';

/** Options for {@link MainStreetAnimator.animateIncomePhases}. */
export interface IncomePhaseOptions {
  /** Milliseconds between phase starts (default `INCOME_PHASE_GAP_MS`). */
  phaseGapMs?: number;
  /** Initial delay before the first phase (default 0). */
  startDelayMs?: number;
  /**
   * Lifecycle hook called at each phase start (including `collect`), in
   * both full and reduced-motion modes. Never throws into the choreography.
   */
  onPhase?: (phase: IncomePhaseKey, index: number) => void;
  /**
   * Deferred-mutation deltas (CG-0MTR72P14000VO6Q): when provided, the
   * collection finalize step applies them to `state.resourceBank` exactly
   * once (guarded by the scene's `endOfTurnDeltasApplied` flag) so the HUD
   * numbers update only after the coins land. Absent for the legacy
   * immediate path (reduced-motion / tutorial / headless) where the engine
   * already applied them.
   */
  pendingDeltas?: PendingEndOfTurnDeltas;
}

/** A producing slot resolved to its live card container + coin grid handle. */
interface IncomePhaseSlot {
  pd: SlotPhaseBreakdown;
  card: Phaser.GameObjects.Container;
  handle: CoinGridHandle;
  /** Coins currently shown in the on-card grid (integer). */
  displayed: number;
}

/** MainStreetAnimator -- animation and HUD-delta helper for Main Street scene. */
export class MainStreetAnimator {
  constructor(private readonly scene: any) {}

  // ── Sequential timing helpers (CG-0MTR766U6003RZ88) ────────────────

  /**
   * Per-turn dynamic coin stagger — starts at `INCOME_CARD_COIN_STAGGER_MS`
   * and is reduced by 20% after each card completes.
   * Reset to base at the start of each turn.
   */
  private currentCoinStagger = INCOME_CARD_COIN_STAGGER_MS;

  /**
   * Resets the dynamic coin stagger to its base value (called each turn).
   */
  public resetCoinStaggerForTurn(): void {
    this.currentCoinStagger = INCOME_CARD_COIN_STAGGER_MS;
  }

  /**
   * Reduces the dynamic coin stagger by 20% after each card completes.
   */
  private reduceCoinStaggerAfterCard(): void {
    this.currentCoinStagger = Math.max(
      INCOME_CARD_COIN_MIN_STAGGER_MS,
      Math.round(this.currentCoinStagger * INCOME_CARD_STAGGER_REDUCTION),
    );
  }

  /**
   * Computes the inter-card delay for card index `si` out of `numSlots`,
   * decreasing from BASE to MIN (floor).
   */
  private getCardDelay(numSlots: number, si: number): number {
    if (numSlots <= 1) return INCOME_BASE_CARD_DELAY_MS;
    const raw = INCOME_BASE_CARD_DELAY_MS - si * INCOME_CARD_DELAY_DECREMENT_MS;
    return Math.max(INCOME_MIN_CARD_DELAY_MS, raw);
  }

  /**
   * Computes the flight duration for card index `si` out of `numSlots`,
   * decreasing from BASE to MIN (floor).
   */
  private getFlightDuration(numSlots: number, si: number): number {
    if (numSlots <= 1) return INCOME_FLIGHT_BASE_MS;
    const raw = INCOME_FLIGHT_BASE_MS - si * INCOME_FLIGHT_DECREMENT_MS;
    return Math.max(INCOME_FLIGHT_MIN_MS, raw);
  }

  /**
   * Computes the per-icon stagger for icon index `i` within a card's
   * animation sequence, using the current dynamic stagger value.
   * The stagger decreases from BASE to MIN (floor).
   */
  private getIconStagger(numIcons: number, i: number): number {
    if (numIcons <= 1) return this.currentCoinStagger;
    const raw = this.currentCoinStagger - i * 10;
    return Math.max(INCOME_CARD_COIN_MIN_STAGGER_MS, raw);
  }

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

  // ── Phased income animation (CG-0MT23O6W8003AXWJ) ───────────────────

  /**
   * Orchestrates the full phased income choreography: base → synergy →
   * reputation → events → upcoming, then grid-to-HUD collection.
   *
   * **Sequential card processing (CG-0MTR766U6003RZ88):** within every
   * phase that touches card grids, cards are processed one at a time — card
   * 0's count-out or coin flight completes before card 1 begins, creating a
   * satisfying "coins rack up" moment per card. The delay between successive
   * cards decreases progressively and later cards animate faster (shorter
   * flight durations / icon staggers), so the sequence feels like it speeds
   * up (AC2–AC4). `collectIncomeGrids` uses the same per-card ordering.
   *
   * Phase semantics (each phase's coins land on the affected cards' on-card
   * coin grids from child 2):
   *
   * 1. **Base** — each producing slot's base coins "count out" of the card
   *    into its on-card grid, one coin at a time (`COIN_POP` SFX per coin).
   * 2. **Synergy** — board adjacency synergy (currently 0 — hand-card
   *    synergy was removed; see CG-0MTRDX0DN004EECN). When wired, coins
   *    would fly from the synergy line midpoints (`synergyLineEndpoints`) into
   *    the affected grids. Short-circuited when all `synergyBonus` values are 0.
   * 3. **Reputation** — reputation bonus coins fly from the reputation HUD
   *    counter into the affected grids.
   * 4. **Events** — duration-effect (income-multiplier) events show animated
   *    effect text lines in the Upcoming panel (one-letter grow/shrink
   *    reveal, added via `MainStreetRenderer.animateUpcomingEffectLine`);
   *    their coins fly in (positive delta) or out (negative delta) of the
   *    affected business grids.
   * 5. **Upcoming** — upcoming-card income deltas fly coins in/out
   *    (placeholder data is not yet wired upstream, so this phase normally
   *    only paces + labels).
   * 6. **Collect** — remaining grid coins fly to the HUD coins counter with
   *    the existing final `+<total>` pop and coin-pop SFX (AC7);
   *    `scene.incomeCollectionActive` runs true for the choreography and
   *    clears at the end, suppressing the immediate HUD delta pop.
   *
   * Accessibility (AC8, reduced motion): every phase still runs on the same
   * schedule and shows its phase label — text/phase progression only, no
   * coin flights or count-out tweens.
   *
   * Headless/replay exemption (AGENTS.md rule 8 / AC10): presentation-only
   * effect; returns immediately in replay/headless mode (`scene.replayMode`)
   * — no rendering, no audio. Documented exemption.
   *
   * Non-blocking (AC9): the choreography never mutates game state, the
   * transcript, or the turn flow; every step is defensive and failures are
   * swallowed so the turn always advances.
   *
   * @param phaseData  Per-slot phase contributions (from `IncomeResult.phaseBreakdown`).
   * @param options    Tuning + lifecycle hook (phaseGapMs/startDelayMs for
   *                   tests, onPhase for progress observation).
   */
  public animateIncomePhases(phaseData: SlotPhaseBreakdown[], options: IncomePhaseOptions = {}): void {
    const s = this.scene;

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
        const card = this.findStreetCardContainer(pd.slotIndex);
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
            this.showIncomePhaseLabel(meta.label, meta.color);
            this.runIncomePhase(meta.key, slots, { reducedMotion });
          } catch { /* ignore */ }
        });
        t += gap;
      });

      s.time.delayedCall(t, () => {
        try {
          emit('collect', phaseMeta.length);
          this.collectIncomeGrids(slots, {
            reducedMotion,
            creditedTotal: this.creditedIncomeTotal(phaseData),
            pendingDeltas: options.pendingDeltas,
          });
        } catch { /* ignore */ }
      });
    } catch {
      s.incomeCollectionActive = false;
    }
  }

  /**
   * Executes one income phase's visual work. Reduced motion runs the phases
   * on the same schedule with text progression only (AC8) — no flights.
   *
   * Sequential model (CG-0MTR766U6003RZ88): slots are processed one at a
   * time — each slot's animation is scheduled at an accumulated delay
   * offset, so slot 0 finishes before slot 1 starts. The inter-card delay
   * (`getCardDelay`) and per-card animation speed (`getFlightDuration` /
   * `getIconStagger`) both decrease for later cards (AC2–AC4). Unknown or
   * zero-contribution slots are skipped gracefully (non-blocking, AC7).
   */
  private runIncomePhase(phase: IncomePhaseKey, slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
  }): void {
    const s = this.scene;
    const numSlots = slots.length;

    switch (phase) {
      case 'base': {
        if (ctx.reducedMotion) return;
        let delayOffset = 0;
        for (let si = 0; si < numSlots; si++) {
          const slot = slots[si];
          const amount = Math.max(0, roundHalf(slot.pd.baseIncome));
          if (iconsForAmount(amount) === 0) {
            delayOffset += this.getCardDelay(numSlots, si);
            continue;
          }
          this.countOutCoins(slot, amount, delayOffset);
          // Audit (CG-0MTR766U6003RZ88): pause for 5× current stagger when
          // card's coin grid is full, then reduce stagger by 20% for next card.
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * this.currentCoinStagger;
          delayOffset += this.getCardDelay(numSlots, si) + pauseMs;
          this.reduceCoinStaggerAfterCard();
        }
        break;
      }
      case 'synergy': {
        if (ctx.reducedMotion) return;
        if (!slots.some((sl) => iconsForAmount(roundHalf(sl.pd.synergyBonus)) > 0)) return;
        const sources = this.synergyPhaseSources();
        let delayOffset = 0;
        for (let si = 0; si < numSlots; si++) {
          const slot = slots[si];
          const amount = Math.max(0, roundHalf(slot.pd.synergyBonus));
          if (iconsForAmount(amount) === 0) {
            delayOffset += this.getCardDelay(numSlots, si);
            continue;
          }
          const from = sources.get(slot.pd.slotIndex) ?? sources.get('fallback')!;
          const flightMs = this.getFlightDuration(numSlots, si);
          this.flyCoinsIn(slot, amount, from, delayOffset, flightMs);
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * this.currentCoinStagger;
          delayOffset += this.getCardDelay(numSlots, si) + pauseMs;
          this.reduceCoinStaggerAfterCard();
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
            delayOffset += this.getCardDelay(numSlots, si);
            continue;
          }
          const flightMs = this.getFlightDuration(numSlots, si);
          this.flyCoinsIn(slot, amount, from, delayOffset, flightMs);
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * this.currentCoinStagger;
          delayOffset += this.getCardDelay(numSlots, si) + pauseMs;
          this.reduceCoinStaggerAfterCard();
        }
        break;
      }
      case 'events': {
        if (ctx.reducedMotion) return;
        const deltaEffects = this.eventDeltaEffects(slots);
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
              effectDelayOffset += this.getCardDelay(numSlots, si);
              continue;
            }
            if (iconsForAmount(Math.abs(roundHalf(delta))) === 0) {
              effectDelayOffset += this.getCardDelay(numSlots, si);
              continue;
            }
            const amount = Math.abs(roundHalf(delta));
            const flightMs = this.getFlightDuration(numSlots, si);
            const at = effectDelayOffset;
            if (delta > 0) {
              this.flyCoinsIn(slot, amount, this.eventSourcePoint(), at, flightMs);
            } else {
              this.flyCoinsOut(slot, amount, this.eventSourcePoint(), at, flightMs);
            }
            const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * this.currentCoinStagger;
            effectDelayOffset += this.getCardDelay(numSlots, si) + pauseMs;
            this.reduceCoinStaggerAfterCard();
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
            const flightMs = this.getFlightDuration(numSlots, si);
            if (d.delta > 0) {
              this.flyCoinsIn(slot, amount, from, delayOffset, flightMs);
            } else {
              this.flyCoinsOut(slot, amount, from, delayOffset, flightMs);
            }
          }
          const pauseMs = INCOME_CARD_FULL_PAUSE_MULTIPLIER * this.currentCoinStagger;
          delayOffset += this.getCardDelay(numSlots, si) + pauseMs;
          this.reduceCoinStaggerAfterCard();
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Income-multiplier effects that produced event deltas this turn, keyed
   * by the phase data (authoritative). Active-effect descriptions are
   * preferred for the line text when the effect is still active.
   */
  private eventDeltaEffects(slots: IncomePhaseSlot[]): Array<{
    sourceEventId: string;
    description: string;
  }> {
    const s = this.scene;
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

  /** Source point for event-phase coin flights (near the Upcoming panel). */
  private eventSourcePoint(): { x: number; y: number } {
    const s = this.scene;
    return { x: s.layout.logX + 40, y: s.layout.queueTop + 26 };
  }

  /**
   * Synergy flight sources: midpoint of each synergy pair whose cards have
   * a synergy contribution; fallback is above the street. Hand cards never
   * produce synergy (CG-0MTRDX0DN004EECN), so a run only fires when placed
   * businesses share a synergy type.
   */
  private synergyPhaseSources(): Map<number | 'fallback', { x: number; y: number }> {
    const s = this.scene;
    const sources = new Map<number | 'fallback', { x: number; y: number }>();
    try {
      const pairs = computeSynergyPairs(s.state.streetGrid ?? [], s.state.soldSlots ?? [],
        s.streetPlayableLattice && (s.streetPlayableLattice.cols > 1 || s.streetPlayableLattice.rows > 1)
          ? s.streetPlayableLattice
          : undefined);
      for (const pair of pairs) {
        const { mid } = synergyLineEndpoints(pair, s.layout, {
          from: this.localSlotCentre(pair.fromIndex),
          to: this.localSlotCentre(pair.toIndex),
        });
        if (!sources.has(pair.fromIndex)) sources.set(pair.fromIndex, mid);
        if (!sources.has(pair.toIndex)) sources.set(pair.toIndex, mid);
      }
    } catch { /* ignore */ }
    sources.set('fallback', { x: s.layout.gameW * 0.5, y: Math.max(24, s.layout.streetTop + 6) });
    return sources;
  }

  /**
   * Base phase: count a slot's coins out of its card one at a time. Each
   * step re-packs the grid with the cumulative amount; the final fractional
   * amount renders the half coin last. Newly added coin pops in.
   *
   * Uses per-icon stagger (decreasing) for the count-out sequence so later
   * cards feel faster — the outer sequential delay is applied by the caller
   * via the `at` offset (CG-0MTR766U6003RZ88).
   */
  private countOutCoins(slot: IncomePhaseSlot, amount: number, at: number): void {
    const s = this.scene;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    for (let n = 1; n <= iconCount; n++) {
      s.time.delayedCall(at + this.getIconStagger(iconCount, n - 1), () => {
        try {
          // Incrementally add one coin at a time (half coin last) so the
          // grid accumulates across phases (AC: stay visible until collect).
          const increment = 1;
          this.revealInGrid(slot, Math.round(slot.displayed + increment));
        } catch { /* ignore */ }
      });
    }
  }

  /** Adds the cumulative amount to a slot's grid with a pop-in + coin SFX. */
  private revealInGrid(slot: IncomePhaseSlot, cumulativeAmount: number): void {
    const s = this.scene;
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

  /**
   * Flies `amount` coins from a source point into a slot's grid, landing on
   * the grid transform origin (left-anchored; see `createCoinGrid`).
   *
   * @param flightMs  Duration of each coin's flight tween (ms). Allows
   *                  per-card speed-up (CG-0MTR766U6003RZ88).
   */
  private flyCoinsIn(
    slot: IncomePhaseSlot,
    amount: number,
    from: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {
    const s = this.scene;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    const duration = flightMs ?? INCOME_FLIGHT_MS;
    const m = slot.handle.container.getWorldTransformMatrix();
    const to = { x: m.getX(0, 0), y: m.getY(0, 0) };
    for (let i = 0; i < iconCount; i++) {
      s.time.delayedCall(at + this.getIconStagger(iconCount, i), () => {
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
                this.revealInGrid(slot, Math.round(slot.displayed + increment));
              } catch { /* ignore */ }
            },
          });
        } catch { /* ignore */ }
      });
    }
  }

  /**
   * Removes `amount` coins from a slot's grid, flying each out toward a
   * target point where it fades. Used by negative event/upcoming deltas.
   * Clamps to the coins actually present in the grid. The half coin (when
   * present) is the last icon in the layout so it is removed first.
   *
   * @param flightMs  Duration of each coin's flight tween (ms). Allows
   *                  per-card speed-up (CG-0MTR766U6003RZ88).
   */
  private flyCoinsOut(
    slot: IncomePhaseSlot,
    amount: number,
    to: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {
    const s = this.scene;
    const grid = slot.handle.container;
    const iconCount = iconsForAmount(amount);
    if (iconCount === 0) return;
    const duration = flightMs ?? INCOME_FLIGHT_MS;
    // Decrement sequence: 1 icon per 100 coins (x100 economy presentation scaling).
    const decrements: number[] = [];
    for (let k = 0; k < iconCount; k++) decrements.push(1);
    for (let i = 0; i < iconCount; i++) {
      s.time.delayedCall(at + this.getIconStagger(iconCount, i), () => {
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

  /**
   * Grid-to-HUD collection (AC7): every remaining grid coin flies to the
   * HUD coins counter, one card at a time — card 0's icons are collected
   * before card 1 begins, etc. Inter-card delay decreases progressively
   * (CG-0MTR766U6003RZ88). When the last coin lands the final
   * `+<total>` pop plays and `incomeCollectionActive` clears.
   * Reduced motion: no flights — the final `+<total>` text pop only.
   */
  /**
   * Applies deferred-mutation deltas at most once (CG-0MTR72P14000VO6Q AC3):
   * income and incident animations both land at the end of the end-of-turn
   * cycle; whichever completes first applies the deltas, the other no-ops via
   * the scene's `endOfTurnDeltasApplied` guard. Never throws into a
   * choreography.
   */
  private applyPendingDeltasOnce(deltas: PendingEndOfTurnDeltas | undefined): void {
    if (!deltas) return;
    const s = this.scene;
    try {
      if (!s.endOfTurnDeltasApplied) {
        applyEndOfTurnDeltas(s.state, deltas);
        s.endOfTurnDeltasApplied = true;
      }
    } catch { /* presentation-only — never break the choreography */ }
  }

  private collectIncomeGrids(slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
    creditedTotal: number;
    /** Deferred-mutation deltas to apply when the collection finishes (CG-0MTR72P14000VO6Q). */
    pendingDeltas?: PendingEndOfTurnDeltas;
  }): void {
    const s = this.scene;
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
        this.applyPendingDeltasOnce(ctx.pendingDeltas);
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
      const flightMs = this.getFlightDuration(numSlots, si);
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
      delayOffset += this.getCardDelay(numSlots, si);
    }
    if (pending === 0) finalize();
  }

  /**
   * Exact credited total from the per-slot phase data, rounded to nearest
   * integer for the final `+<total>` display pop (integer economy).
   *
   * = Σ per slot (base + synergy + rep + event deltas + upcoming deltas)
   * — this equals the coins actually credited to the bank (`multiplied`).
   */
  private creditedIncomeTotal(phaseData: SlotPhaseBreakdown[]): number {
    let sum = 0;
    for (const pd of phaseData) {
      sum += pd.baseIncome + pd.synergyBonus + pd.repBonus;
      for (const d of pd.eventDeltas ?? []) sum += d.delta;
      for (const d of pd.upcomingDeltas ?? []) sum += d.delta;
    }
    return Math.round(Math.max(0, sum));
  }

  /**
   * Shows a small phase label above the street that fades in/out. Used by
   * both the full and reduced-motion paths (text progression per AC8).
   */
  private showIncomePhaseLabel(text: string, color: number): void {
    const s = this.scene;
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
   * Animates the end-of-turn incident reveal (new choreography, CG-0MTW18KFK000MM3I).
   *
   * The face-down card from the Upcoming panel flies to centre screen, flips
   * face-up with a hinge animation, stays visible for 4 seconds (player reads
   * the incident), then returns to the queue.
   *
   * Full effect (reduced-motion OFF):
   * 1. A container at the queue origin holds the incident card face under a
   *    card-back overlay (reusing `mainStreetRenderCardSvg` + `CARD_BACK_TEMPLATE`).
   * 2. The container flies to board centre (~550ms).
   * 3. The back hinges open (`scaleX → 0`) to reveal the face.
   * 4. The face stays visible for 4 seconds; delta bubbles animate during hold.
   * 5. Container returns to queue origin and is destroyed.
   * 6. `onComplete` callback fires after cleanup.
   *
   * Accessibility (reduced motion): flight, hinge flip and bubble travel are
   * skipped — the card appears instantly face-up — but the 4-second hold and
   * `onComplete` are preserved so the player still has time to read (parent AC3).
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns immediately in replay/headless mode (`scene.replayMode`) — no
   * rendering, no audio. Never mutates game state or the transcript.
   *
   * @param params  Resolved incident (card id/name), its resource deltas
   *                (negative = loss), the queue origin and an optional
   *                completion callback.
   */
  public animateIncidentReveal(params: {
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
    const s = this.scene;

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
      this.applyPendingDeltasOnce(params.pendingDeltas);
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
            this.animateIncidentDeltaBubbles({
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

  /**
   * Animates resource-delta bubbles between the HUD score bar and the
   * revealed incident card during the 4-second hold (CG-0MTW18KFK000MM3I).
   *
   * Coin loss: gold bubbles travel HUD coin counter → card.
   * Coin gain: card → HUD.
   * Reputation loss: blue bubbles travel HUD rep counter → card.
   * Reputation gain: card → HUD.
   * No bubbles when the corresponding delta is zero.
   *
   * Reduced motion: no bubble travel at all (parent AC3).
   *
   * @param params  Deltas, card centre position, and HUD geometry.
   */
  private animateIncidentDeltaBubbles(params: {
    coinChange: number;
    repChange: number;
    cardCenter: { x: number; y: number };
    hudCoinX: number;
    hudRepX: number;
    hudY: number;
  }): void {
    const s = this.scene;
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

  /**
   * Staff peek reveal (CG-0MSXOW6GN008ZSMN): briefly shows the top card of
   * the face-down incident deck face-up, then returns it face-down.
   *
   * Full effect (reduced-motion OFF):
   * 1. At the deck-stack position, a card-back sprite sits on top of the
   *    actual SVG card face (`mainStreetRenderCardSvg`).
   * 2. The back hinges open (scaleX → 0) with the deal SFX
   *    (`SFX_KEYS.DEAL`), holding the face up for ~1.6s.
   * 3. The back hinges closed (scaleX → 1) with a click SFX
   *    (`SFX_KEYS.CLICK`), returning the card face-down; the temporary
   *    visual is destroyed.
   *
   * Accessibility (reduced motion): the hinge tweens are skipped — the back
   * is dropped instantly and restored after a short hold — but the SFX is
   * retained (AGENTS.md rule 8 keeps sound under reduced motion). Mute and
   * volume are honoured because playback goes through `soundManager`.
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only; returns
   * immediately in replay/headless mode (`scene.replayMode`) — no rendering,
   * no audio. Never mutates game state or the transcript.
   *
   * @param params  Peeked card id/name and the face-down deck-stack origin.
   */
  public animatePeekReveal(params: {
    cardId: string;
    cardName: string;
    /** Origin of the reveal: the face-down incident-deck stack centre. */
    from: { x: number; y: number };
    /** Fired after the card is returned face-down (both modes). */
    onComplete?: () => void;
  }): void {
    const s = this.scene;

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

  /**

  /**
   * Animates a newly-formed synergy link: the line draws in, the two paired
   * cards pulse in the synergy colour, a "Synergy!" pop appears at the
   * midpoint, and a chime SFX plays.
   *
   * Geometry comes from the shared `synergyLineEndpoints` helper — the SAME
   * clipped edge/corner endpoints the static renderer
   * (`MainStreetRenderer.drawSynergyLines()`) uses, so the draw-in line can
   * never drift from the persistent line (the old "mirrors the renderer"
   * duplication is removed, CG-0MSVM3WCD007BRQP). The line uses
   * `synergyColor` for the shared synergy type. The overlay line sits at
   * depth 10, above the street container, matching where the static lines
   * render.
   *
   * Accessibility (reduced motion): the line draw-in, spark, and card pulse
   * are skipped; the chime SFX and a minimal "Synergy!" pop are retained
   * (spec AC5 — "skip pulse/pop or keep a minimal pop").
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns immediately in replay/headless mode (`scene.replayMode`) — no
   * rendering, no audio. Never mutates game state or the transcript.
   *
   * @param pair  The newly-formed synergy pair (slot indices + shared type).
   */
  public animateSynergyFormation(pair: SynergyPair): void {
    const s = this.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    // Shared clipped geometry: same endpoints as the static renderer uses
    // (edge-to-edge / corner-to-corner, CG-0MSVM3WCD007BRQP).
    const { p1: a, p2: b, mid } = synergyLineEndpoints(pair, s.layout, {
      from: this.localSlotCentre(pair.fromIndex),
      to: this.localSlotCentre(pair.toIndex),
    });
    const color = synergyColor(pair.sharedSynergy);

    // Chime SFX — plays in both modes (minimal feedback retained).
    try { s.soundManager?.play(SFX_KEYS.INCOME_POSITIVE); } catch (_) { /* ignore */ }

    if (reducedMotion) {
      // Minimal pop only.
      this.popSynergyText(mid, color);
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
      const card = this.findStreetCardContainer(idx);
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
    this.popSynergyText(mid, color);
  }

  /**
   * "Synergy!" pop text at a position (reused by the full and reduced-motion
   * paths). The pop itself respects reduced motion via `popTextOrIcon`.
   */
  private popSynergyText(at: { x: number; y: number }, _color: number): void {
    const s = this.scene;
    const text = s.add.text(at.x, at.y - 10, 'Synergy!', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(500);
    void popTextOrIcon({
      scene: s,
      target: text,
      duration: 1200,
      riseY: 26,
      scale: 1.3,
      reducedMotion: s.settingsPanel?.reducedMotion === true,
    });
  }

  /** Finds the rendered street card container tagged with a slot index. */
  private findStreetCardContainer(slotIndex: number): Phaser.GameObjects.Container | null {
    const s = this.scene;
    for (const obj of s.streetContainer?.list ?? []) {
      const candidate = obj as { getData?: (key: string) => unknown };
      if (candidate.getData?.('streetSlotIndex') === slotIndex) {
        return obj as Phaser.GameObjects.Container;
      }
    }
    return null;
  }

  public getMarketCardCenter(_row: 'market', slotIndex: number): { x: number; y: number } | null {
    const s = this.scene;
    if (slotIndex < 0) return null;
    const rowTop = s.layout.marketTop + 6;
    const cardX = s.layout.marketLabelW + 50 + slotIndex * (s.layout.marketCardW + s.layout.marketCardGap);
    return {
      x: cardX + s.layout.marketCardW / 2,
      y: rowTop + s.layout.marketCardH / 2,
    };
  }

  /**
   * Day transition banner: a "Week W · Year Y" banner animates in (scale/fade
   * from the board centre, ~800ms total) and fades out.
   *
   * The banner is a NON-interactive visual (no input handling) added to the
   * scene root at depth 600 — above the street/market cards, below the HUD
   * container (1000) and any modal overlay (>1000) — so it never intercepts
   * pointer events, never shifts layout, and is destroyed after the fade-out
   * (no persistent UI change). The tutorial flow is therefore never delayed
   * and its highlighted-card clicks still land (AC2).
   *
   * Day-chime SFX: reuses `SFX_KEYS.CLICK` (no new ToneForge key; the
   * sfx- prefix convention is untouched).
   *
   * Accessibility (reduced motion): skipped entirely — the current
   * behaviour (instruction text only) is preserved (spec AC3).
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns immediately in replay/headless mode (`scene.replayMode`) — no
   * rendering, no audio. Never mutates game state or the transcript.
   *
   * Non-blocking: tweens are fire-and-forget; the market is interactive the
   * whole time (the banner never blocks input).
   *
   * @param params  The turn/week information to display.
   */
  public animateDayBanner(params: { day: number; week: number; year: number }): void {
    const s = this.scene;

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

  /**
   * Game-over celebration / loss sting (AGENTS.md rule 8).
   *
   * Called from `MainStreetOverlayContent.showGameOverOverlay` after the
   * overlay backdrop is in place:
   *
   * - **Win:** a confetti burst falls across the whole board (24 deterministic
   *   coloured rectangles, staggered, spinning + fading) with the victory
   *   fanfare WAV (`SFX_KEYS.GAME_WIN`). Depth 100.5 — above the overlay
   *   backdrop/box (100), below the overlay text and buttons (101), so the
   *   confetti is bright against the dim but never covers the panel content.
   * - **Loss:** a brief full-board dark pulse (the "sting beat", depth 99.5 —
   *   under the backdrop so only the board dims, not the panel) plus the low
   *   sting WAV (`SFX_KEYS.GAME_LOST`). The overlay backdrop keeps the board
   *   dimmed afterwards.
   *
   * Reduced motion: plays only the fanfare/sting sound (sound is not motion).
   * Replay/headless: returns immediately — presentation-only, documented
   * exemption (AGENTS.md rule 8). Non-blocking: fire-and-forget tweens; the
   * game-over state is already committed.
   */
  public animateGameOver(params: { win: boolean; width: number; height: number }): void {
    const s = this.scene;
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

  /**
   * Undo/redo feedback notification (AGENTS.md rule 8).
   *
   * Called from `MainStreetTurnController.performUndo` / `performRedo` after
   * the command was reversed/reapplied. Shows a brief "Undid: <action>" /
   * "Redid: <action>" pop just above the hint bar (bottom-centre) with a UI
   * click SFX (`SFX_KEYS.CLICK`).
   *
   * Reduced motion: the pop helper's reduced-motion fallback is used (no
   * extra motion); the click SFX still plays (sound is not motion).
   * Replay/headless: returns immediately — presentation-only, documented
   * exemption (AGENTS.md rule 8). Non-blocking: fire-and-forget.
   */
  public animateUndoRedo(params: { action: 'undo' | 'redo'; description: string }): void {
    const s = this.scene;
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

  public getStreetSlotCenter(slotIndex: number): { x: number; y: number } {
    const s = this.scene;
    // Camera-aware (CG-0MTH9OVMC001V44E) and world-index aware
    // (CG-0MTH9OW0H0005VKE): the playable board occupies the playable
    // sub-lattice of the displayed map, so a world slot index resolves to the
    // right cell even after the board is expanded. At 1× on a 1×1 board this
    // is identical to the legacy layout maths.
    if (typeof s.streetLocalToScreen === 'function' && s.layout) {
      const local = this.localSlotCentre(slotIndex);
      return s.streetLocalToScreen(local);
    }
    const col = slotIndex % s.layout.streetCols;
    const row = Math.floor(slotIndex / s.layout.streetCols);
    const x = s.layout.streetX + col * (s.layout.slotW + s.layout.slotGap) + s.layout.slotW / 2;
    const y = s.layout.streetTop + row * (s.layout.slotH + s.layout.streetRowGap) + s.layout.slotH / 2;
    return { x, y };
  }

  /** Map-local centre of a playable world slot index (street-layer coordinates). */
  private localSlotCentre(slotIndex: number): { x: number; y: number } {
    const s = this.scene;
    const lattice = s.streetViewLattice ?? { cols: 1, rows: 1 };
    const playable = s.streetPlayableLattice ?? { cols: 1, rows: 1 };
    return playableIndexToMapCenter(slotIndex, s.layout, lattice, playable);
  }

  /**
   * Level-up feedback on the target business when an upgrade lands: a small
   * gold sparkle burst on the card plus a "Level N" pop text.
   *
   * The arrival chime is the upgrade transfer's existing end SFX
   * (`SFX_KEYS.UPGRADE_END`, played by `animateTransferFromMarket` on
   * landing) — this helper deliberately does NOT replay it, so no double
   * sound. Under reduced motion the transfer itself is skipped (no sound),
   * and only the "Level N" pop is kept.
   *
   * Accessibility (reduced motion): the sparkle burst is skipped; the
   * "Level N" pop text is retained (spec AC2 — "skip the burst, keep the
   * pop text").
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns immediately in replay/headless mode (`scene.replayMode`) — no
   * rendering, no audio. Never mutates game state or the transcript.
   *
   * @param params  Target street slot and the new upgrade level.
   */
  public animateLevelUp(params: { slotIndex: number; level: number }): void {
    const s = this.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return;

    if (params.slotIndex < 0) return;
    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const { x, y } = this.getStreetSlotCenter(params.slotIndex);

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

  /**
   * Sell feedback: a brief demolition on the sold card followed by a refund
   * coin flying from the sold slot to the HUD coins counter.
   *
   * The caller already rendered the dimmed SOLD state (synchronous
   * `refreshAll`); this helper draws a pre-sold card snapshot at the slot
   * (depth 10000, above the SOLD overlay) and shrinks/fades it over ~380ms
   * so the SOLD state is visually revealed only AFTER the demolition.
   * Then a gold coin flies from the slot to the HUD counter (the same
   * geometry as `animateIncomeCollection`: `coinX = gameW * 0.25 + 70`,
   * `hudY`) with `SFX_KEYS.COIN_POP`, and a "+€refund" pop lands at the
   * counter.
   *
   * Accessibility (reduced motion): the demolition and coin flight are
   * skipped; a single "+€refund" pop + coin SFX remain (spec AC2).
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * returns a resolved promise in replay/headless mode (`scene.replayMode`) —
   * no rendering, no audio. Never mutates game state or the transcript.
   *
   * Non-blocking: the returned promise is fire-and-forget for the caller;
   * the sold state and refund are already committed to game state.
   *
   * @param params  Sold street slot, refund amount, and the sold card's
   *                identity (for the demolition snapshot's family colour).
   * @returns Promise resolving when the presentation completes.
   */
  public animateSell(params: {
    slotIndex: number;
    refund: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void> {
    const s = this.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return Promise.resolve();

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const coinX = s.layout.gameW * 0.25 + 70;
    const hudY = s.layout.hudY;
    const { x, y } = this.getStreetSlotCenter(params.slotIndex);

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
      const demo = this.createTransferCardVisual(params.cardId, params.family, x, y) as unknown as {
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

  /**
   * Animates a Close (coins-free demolition): the pre-close card snapshot
   * shrinks and fades away and the discard SFX plays, then a brief "Closed"
   * pop marks the freed slot. Unlike `animateSell` there is no refund coin
   * fly and no "+€" pop — closing grants no coins.
   *
   * Accessibility (reduced motion): the demolition tween is skipped; a brief
   * "Closed" pop + discard SFX remain (sound is not motion).
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only effect;
   * resolves immediately in replay/headless mode (`scene.replayMode`) — no
   * rendering, no audio. Never mutates game state or the transcript.
   *
   * Non-blocking: fire-and-forget; the removal is already committed to state
   * by `closeBusinessCommand` when this runs.
   *
   * @param params  Closed street slot and the closed card's identity (for the
   *                demolition snapshot's family colour).
   * @returns Promise resolving when the presentation completes.
   */
  public animateClose(params: {
    slotIndex: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void> {
    const s = this.scene;

    // Headless/replay exemption: no rendering or audio in those modes.
    if (s.replayMode) return Promise.resolve();

    const reducedMotion = s.settingsPanel?.reducedMotion === true;
    const { x, y } = this.getStreetSlotCenter(params.slotIndex);

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
      const demo = this.createTransferCardVisual(params.cardId, params.family, x, y) as unknown as {
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

  /**
   * Hand-anchored slot centre (left edge of the hand zone + half a card).
   *
   * Kept for backward compatibility only — buy-transfer animations now use
   * the HandView-predicted resting positions via the scene's
   * `getBusinessHandInsertionPosition` / `getEventHandInsertionPosition`
   * helpers, which target the actual centred hand layout (`handCenterX`)
   * instead of this left-anchored estimate.
   */
  /**
   * Held-event play feedback: when a held event card is played from the
   * hand, a burst/pop plays at the card's position as it leaves the hand
   * (8 event-coloured sparks tween outward + fade) and the event name pops
   * with the cheer SFX (`SFX_KEYS.EVENT_CHEER` — already loaded via
   * `sfx-tf-mapping.ts`, reuse-first).
   *
   * The caller passes the played card's PRE-refresh hand position (the
   * card is gone from the hand by the time this helper runs).
   *
   * Accessibility (reduced motion): the spark burst is skipped; a brief
   * name pop + cheer SFX remain (spec AC2).
   *
   * Headless/replay exemption (AGENTS.md rule 8): presentation-only
   * effect; returns immediately in replay/headless mode
   * (`scene.replayMode`) — no rendering, no audio. Never mutates game
   * state or the transcript.
   *
   * Non-blocking: fire-and-forget; the event effect is already committed
   * to game state by the caller.
   *
   * @param params  World position of the played card in the hand, and its
   *                display name for the pop text.
   */
  public animateEventPlayed(params: { x: number; y: number; eventName: string }): void {
    const s = this.scene;

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

  public getHandCardCenter(): { x: number; y: number } {
    const s = this.scene;
    return {
      x: s.layout.handX + s.layout.handCardW / 2,
      y: s.layout.handY + s.layout.handCardH / 2,
    };
  }

  public createTransferCardVisual(
    cardId: string,
    family: 'business' | 'community-space' | 'event' | 'upgrade' | 'staff',
    atX: number,
    atY: number,
  ): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform {
    const s = this.scene;
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

  // ---------------------------------------------------------------------------
  // Applicant presentation animations (CG-0MSTOATDU006UGAX)
  // ---------------------------------------------------------------------------

  /**
   * Animate the applicant card walking in from the left edge of the screen.
   * Starts off-screen left and tweens to the target position. Respects
   * reduced-motion (instant appearance).
   */
  public animateApplicantWalkOn(
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
  ): void {
    const s = this.scene;
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

  /**
   * Animate the applicant card walking off to the right on decline.
   */
  public animateApplicantWalkOff(
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void {
    const s = this.scene;
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

  /**
   * Animate the applicant card into its target business slot on hire.
   */
  public animateApplicantWalkIn(
    container: Phaser.GameObjects.Container,
    targetSlotIndex: number,
    _cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void {
    const s = this.scene;
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
}
