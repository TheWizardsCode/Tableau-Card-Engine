/**
 * Main Street: Animator Context Interface
 *
 * The public surface the animator exposes to its helper modules. Helper
 * modules depend ONLY on this type (never on each other), so the module graph
 * is a hub-and-spoke with no cycles. Also hosts the income-phase public types.
 *
 * @module
 */

import type { SlotIncome, SlotPhaseBreakdown, SynergyPair } from '../MainStreetAdjacency';
import type { PendingEndOfTurnDeltas } from '../MainStreetEngine';
import type { CoinGridHandle } from '../coin-grid';

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
export interface IncomePhaseSlot {
  pd: SlotPhaseBreakdown;
  card: Phaser.GameObjects.Container;
  handle: CoinGridHandle;
  /** Coins currently shown in the on-card grid (integer). */
  displayed: number;
}

/** MainStreetAnimator -- animation and HUD-delta helper for Main Street scene. */

export interface MainStreetAnimatorContext {
  readonly scene: any;
  currentCoinStagger: number;
  resetCoinStaggerForTurn(): void;
  reduceCoinStaggerAfterCard(): void;
  getCardDelay(numSlots: number, si: number): number;
  getFlightDuration(numSlots: number, si: number): number;
  getIconStagger(numIcons: number, i: number): number;
  animateHudValueChanges(params: {
    coins: number;
    reputation: number;
    coinX: number;
    repX: number;
    hudY: number;
  }): void;
  animateCelebration(challengeTitle: string): Promise<void>;
  animateIncomeCollection(params: {

    /** Income result from `processEndOfTurn` (pre-multiplier totals). */
    income: {
      total: number;
      breakdown: SlotIncome[];
    };
    /** Per-slot reputation contributions (`currentReputationPerTurn > 0`). */
    repSources: Array<{ slotIndex: number; rep: number }>;
  }): void;
  animateIncomePhases(phaseData: SlotPhaseBreakdown[], options: IncomePhaseOptions ): void;
  runIncomePhase(phase: IncomePhaseKey, slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
  }): void;
  eventDeltaEffects(slots: IncomePhaseSlot[]): Array<{
    sourceEventId: string;
    description: string;
  }>;
  eventSourcePoint(): { x: number; y: number };
  synergyPhaseSources(): Map<number | 'fallback', { x: number; y: number }>;
  countOutCoins(slot: IncomePhaseSlot, amount: number, at: number): void;
  revealInGrid(slot: IncomePhaseSlot, cumulativeAmount: number): void;
  flyCoinsIn(
    slot: IncomePhaseSlot,
    amount: number,
    from: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void;
  flyCoinsOut(
    slot: IncomePhaseSlot,
    amount: number,
    to: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void;
  applyPendingDeltasOnce(deltas: PendingEndOfTurnDeltas | undefined): void;
  collectIncomeGrids(slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
    creditedTotal: number;
    /** Deferred-mutation deltas to apply when the collection finishes (CG-0MTR72P14000VO6Q). */
    pendingDeltas?: PendingEndOfTurnDeltas;
  }): void;
  creditedIncomeTotal(phaseData: SlotPhaseBreakdown[]): number;
  showIncomePhaseLabel(text: string, color: number): void;
  animateMarketDealIn(params: {
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
  }): void;
  animateIncidentReveal(params: {
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
  }): void;
  animateIncidentDeltaBubbles(params: {
    coinChange: number;
    repChange: number;
    cardCenter: { x: number; y: number };
    hudCoinX: number;
    hudRepX: number;
    hudY: number;
  }): void;
  animatePeekReveal(params: {
    cardId: string;
    cardName: string;
    /** Origin of the reveal: the face-down incident-deck stack centre. */
    from: { x: number; y: number };
    /** Fired after the card is returned face-down (both modes). */
    onComplete?: () => void;
  }): void;
  animateSynergyFormation(pair: SynergyPair): void;
  popSynergyText(at: { x: number; y: number }, _color: number): void;
  findStreetCardContainer(slotIndex: number): Phaser.GameObjects.Container | null;
  getMarketCardCenter(_row: 'market', slotIndex: number): { x: number; y: number } | null;
  animateWeekBanner(params: { turn: number; week: number; year: number }): void;
  animateGameOver(params: { win: boolean; width: number; height: number }): void;
  animateUndoRedo(params: { action: 'undo' | 'redo'; description: string }): void;
  getStreetSlotCenter(slotIndex: number): { x: number; y: number };
  localSlotCentre(slotIndex: number): { x: number; y: number };
  animateLevelUp(params: { slotIndex: number; level: number }): void;
  animateSell(params: {
    slotIndex: number;
    refund: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void>;
  animateClose(params: {
    slotIndex: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void>;
  animateEventPlayed(params: { x: number; y: number; eventName: string }): void;
  getHandCardCenter(): { x: number; y: number };
  createTransferCardVisual(
    cardId: string,
    family: 'business' | 'community-space' | 'event' | 'upgrade' | 'staff',
    atX: number,
    atY: number,
  ): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
  cleanupTransferAnimations(): void;
  animateTransferFromMarket(options: {
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
  }): Promise<void>;
  animateApplicantWalkOn(
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
  ): void;
  animateApplicantWalkOff(
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void;
  animateApplicantWalkIn(
    container: Phaser.GameObjects.Container,
    targetSlotIndex: number,
    _cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void;
}
