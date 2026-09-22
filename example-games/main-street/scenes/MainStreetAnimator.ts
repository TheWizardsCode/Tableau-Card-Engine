/**
 * Main Street: Scene Animator (thin orchestrator)
 *
 * Thin class: every public animation method delegates to a free function in a
 * per-concern helper module (Income / Incident / Market / Board / Utils).
 * Helper modules depend only on `MainStreetAnimatorContext`, so there are no
 * cycles. Construction and shared state (scene, running coin stagger) live here.
 *
 * @module
 */

import { INCOME_CARD_COIN_STAGGER_MS } from './MainStreetAnimatorTiming';
import type { MainStreetAnimatorContext } from './MainStreetAnimatorContext';
import type { SlotIncome, SlotPhaseBreakdown, SynergyPair } from '../MainStreetAdjacency';
import type { PendingEndOfTurnDeltas } from '../MainStreetEngine';
import type { IncomePhaseKey, IncomePhaseOptions, IncomePhaseSlot } from './MainStreetAnimatorContext';
import { resetCoinStaggerForTurn, reduceCoinStaggerAfterCard, getCardDelay, getFlightDuration, getIconStagger, eventSourcePoint, synergyPhaseSources, popSynergyText, findStreetCardContainer, localSlotCentre, getStreetSlotCenter, getMarketCardCenter, getHandCardCenter, creditedIncomeTotal } from './MainStreetAnimatorUtils';
import { animateHudValueChanges, animateCelebration, animateIncomeCollection, animateIncomePhases, runIncomePhase, eventDeltaEffects, countOutCoins, revealInGrid, flyCoinsIn, flyCoinsOut, applyPendingDeltasOnce, collectIncomeGrids, showIncomePhaseLabel } from './MainStreetAnimatorIncome';
import { animateIncidentReveal, animateIncidentDeltaBubbles, animatePeekReveal } from './MainStreetAnimatorIncident';
import { animateMarketDealIn, createTransferCardVisual, cleanupTransferAnimations, animateTransferFromMarket, animateApplicantWalkOn, animateApplicantWalkOff, animateApplicantWalkIn } from './MainStreetAnimatorMarket';
import { animateSynergyFormation, animateDayBanner, animateGameOver, animateUndoRedo, animateLevelUp, animateSell, animateClose, animateEventPlayed } from './MainStreetAnimatorBoard';

export type { IncomePhaseKey, IncomePhaseOptions } from './MainStreetAnimatorContext';
export type { MainStreetAnimatorContext } from './MainStreetAnimatorContext';

export class MainStreetAnimator implements MainStreetAnimatorContext {
  /** Per-turn dynamic coin stagger (starts at base, reduced per card). */
  public currentCoinStagger = INCOME_CARD_COIN_STAGGER_MS;

  constructor(public readonly scene: any) {}

  public resetCoinStaggerForTurn(): void {
    resetCoinStaggerForTurn(this);
  }

  public reduceCoinStaggerAfterCard(): void {
    reduceCoinStaggerAfterCard(this);
  }

  public getCardDelay(numSlots: number, si: number): number {
    return getCardDelay(this, numSlots, si);
  }

  public getFlightDuration(numSlots: number, si: number): number {
    return getFlightDuration(this, numSlots, si);
  }

  public getIconStagger(numIcons: number, i: number): number {
    return getIconStagger(this, numIcons, i);
  }

  public animateHudValueChanges(params: {
    coins: number;
    reputation: number;
    coinX: number;
    repX: number;
    hudY: number;
  }): void {
    animateHudValueChanges(this, params);
  }

  public animateCelebration(challengeTitle: string): Promise<void> {
    return animateCelebration(this, challengeTitle);
  }

  public animateIncomeCollection(params: {

    /** Income result from `processEndOfTurn` (pre-multiplier totals). */
    income: {
      total: number;
      breakdown: SlotIncome[];
    };
    /** Per-slot reputation contributions (`currentReputationPerTurn > 0`). */
    repSources: Array<{ slotIndex: number; rep: number }>;
  }): void {
    animateIncomeCollection(this, params);
  }

  public animateIncomePhases(phaseData: SlotPhaseBreakdown[], options: IncomePhaseOptions = {}): void {
    animateIncomePhases(this, phaseData, options);
  }

  public runIncomePhase(phase: IncomePhaseKey, slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
  }): void {
    runIncomePhase(this, phase, slots, ctx);
  }

  public eventDeltaEffects(slots: IncomePhaseSlot[]): Array<{
    sourceEventId: string;
    description: string;
  }> {
    return eventDeltaEffects(this, slots);
  }

  public eventSourcePoint(): { x: number; y: number } {
    return eventSourcePoint(this);
  }

  public synergyPhaseSources(): Map<number | 'fallback', { x: number; y: number }> {
    return synergyPhaseSources(this);
  }

  public countOutCoins(slot: IncomePhaseSlot, amount: number, at: number): void {
    countOutCoins(this, slot, amount, at);
  }

  public revealInGrid(slot: IncomePhaseSlot, cumulativeAmount: number): void {
    revealInGrid(this, slot, cumulativeAmount);
  }

  public flyCoinsIn(
    slot: IncomePhaseSlot,
    amount: number,
    from: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {
    flyCoinsIn(this, slot, amount, from, at, flightMs);
  }

  public flyCoinsOut(
    slot: IncomePhaseSlot,
    amount: number,
    to: { x: number; y: number },
    at: number,
    flightMs?: number,
  ): void {
    flyCoinsOut(this, slot, amount, to, at, flightMs);
  }

  public applyPendingDeltasOnce(deltas: PendingEndOfTurnDeltas | undefined): void {
    applyPendingDeltasOnce(this, deltas);
  }

  public collectIncomeGrids(slots: IncomePhaseSlot[], ctx: {
    reducedMotion: boolean;
    creditedTotal: number;
    /** Deferred-mutation deltas to apply when the collection finishes (CG-0MTR72P14000VO6Q). */
    pendingDeltas?: PendingEndOfTurnDeltas;
  }): void {
    collectIncomeGrids(this, slots, ctx);
  }

  public creditedIncomeTotal(phaseData: SlotPhaseBreakdown[]): number {
    return creditedIncomeTotal(this, phaseData);
  }

  public showIncomePhaseLabel(text: string, color: number): void {
    showIncomePhaseLabel(this, text, color);
  }

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
    animateMarketDealIn(this, params);
  }

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
    animateIncidentReveal(this, params);
  }

  public animateIncidentDeltaBubbles(params: {
    coinChange: number;
    repChange: number;
    cardCenter: { x: number; y: number };
    hudCoinX: number;
    hudRepX: number;
    hudY: number;
  }): void {
    animateIncidentDeltaBubbles(this, params);
  }

  public animatePeekReveal(params: {
    cardId: string;
    cardName: string;
    /** Origin of the reveal: the face-down incident-deck stack centre. */
    from: { x: number; y: number };
    /** Fired after the card is returned face-down (both modes). */
    onComplete?: () => void;
  }): void {
    animatePeekReveal(this, params);
  }

  public animateSynergyFormation(pair: SynergyPair): void {
    animateSynergyFormation(this, pair);
  }

  public popSynergyText(at: { x: number; y: number }, _color: number): void {
    popSynergyText(this, at, _color);
  }

  public findStreetCardContainer(slotIndex: number): Phaser.GameObjects.Container | null {
    return findStreetCardContainer(this, slotIndex);
  }

  public getMarketCardCenter(_row: 'market', slotIndex: number): { x: number; y: number } | null {
    return getMarketCardCenter(this, _row, slotIndex);
  }

  public animateDayBanner(params: { day: number; week: number; year: number }): void {
    animateDayBanner(this, params);
  }

  public animateGameOver(params: { win: boolean; width: number; height: number }): void {
    animateGameOver(this, params);
  }

  public animateUndoRedo(params: { action: 'undo' | 'redo'; description: string }): void {
    animateUndoRedo(this, params);
  }

  public getStreetSlotCenter(slotIndex: number): { x: number; y: number } {
    return getStreetSlotCenter(this, slotIndex);
  }

  public localSlotCentre(slotIndex: number): { x: number; y: number } {
    return localSlotCentre(this, slotIndex);
  }

  public animateLevelUp(params: { slotIndex: number; level: number }): void {
    animateLevelUp(this, params);
  }

  public animateSell(params: {
    slotIndex: number;
    refund: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void> {
    return animateSell(this, params);
  }

  public animateClose(params: {
    slotIndex: number;
    cardId: string;
    family: 'business' | 'community-space';
  }): Promise<void> {
    return animateClose(this, params);
  }

  public animateEventPlayed(params: { x: number; y: number; eventName: string }): void {
    animateEventPlayed(this, params);
  }

  public getHandCardCenter(): { x: number; y: number } {
    return getHandCardCenter(this);
  }

  public createTransferCardVisual(
    cardId: string,
    family: 'business' | 'community-space' | 'event' | 'upgrade' | 'staff',
    atX: number,
    atY: number,
  ): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform {
    return createTransferCardVisual(this, cardId, family, atX, atY);
  }

  public cleanupTransferAnimations(): void {
    cleanupTransferAnimations(this);
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
    return animateTransferFromMarket(this, options);
  }

  public animateApplicantWalkOn(
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
  ): void {
    animateApplicantWalkOn(this, container, cardW, _cardH, reducedMotion);
  }

  public animateApplicantWalkOff(
    container: Phaser.GameObjects.Container,
    cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void {
    animateApplicantWalkOff(this, container, cardW, _cardH, reducedMotion, onComplete);
  }

  public animateApplicantWalkIn(
    container: Phaser.GameObjects.Container,
    targetSlotIndex: number,
    _cardW: number,
    _cardH: number,
    reducedMotion?: boolean,
    onComplete?: () => void,
  ): void {
    animateApplicantWalkIn(this, container, targetSlotIndex, _cardW, _cardH, reducedMotion, onComplete);
  }
}
