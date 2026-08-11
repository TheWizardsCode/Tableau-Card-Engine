import { addLog } from '../MainStreetState';
import { executeDayStart, processEndOfTurn, placeFromHand, type TurnResult } from '../MainStreetEngine';
import { turnLabel } from '../MainStreetFormatting';
import {
  findTargetBusinessSlot,
  canAddToHand,
  canPurchaseUpgrade,
  canPurchaseEvent,
  canPurchaseBusiness,
  canRefreshDevelopment,
  canRefreshInvestments,
  canSellBusiness,
} from '../MainStreetMarket';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import { buyBusinessCommand, buyBusinessToHandCommand, buyUpgradeCommand, buyEventCommand, playEventCommand, refreshDevelopmentCommand, refreshInvestmentsCommand } from '../MainStreetCommands';
import { recordMainStreetEvent, finalizeMainStreetTranscript } from '../MainStreetTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import {
  createDragDropManager,
  DEFAULT_DRAG_DISTANCE_THRESHOLD,
  type DragDropPayload,
} from '../../../src/ui/dragDrop';
import { getCurrentStep, isSynergyAdjacentPlacement, resolveTutorialCardParams, type TutorialActionType } from '../TutorialFlow';

/**
 * Match a card ID against a requiredCardId using prefix matching.
 *
 * Card IDs include a copy-number suffix (e.g. `biz-laundromat-2`). The
 * `requiredCardId` in tutorial steps is the template ID with a specific copy
 * number (e.g. `biz-laundromat-0`). This helper strips trailing `-<number>`
 * from both IDs and compares the template prefix, so any copy of the required
 * card template satisfies the requirement.
 */
function matchesRequiredCard(cardId: string, requiredCardId: string): boolean {
  const stripCopy = (id: string): string => id.replace(/-\d+$/, '');
  return stripCopy(cardId) === stripCopy(requiredCardId);
}

export class MainStreetTurnController {
  constructor(private readonly scene: any) {}

  /**
   * Callback invoked after each completed turn (when game is still playing).
   * Used by the lifecycle manager to save a checkpoint via CheckpointManager.
   */
  public onSaveCheckpoint: (() => void) | null = null;

  /**
   * Callback invoked on game end (win/loss/bankruptcy).
   * Used by the lifecycle manager to clear the checkpoint.
   */
  public onGameEnd: (() => void) | null = null;

  /**
   * Starts the DayPhase for a new turn.
   *
   * @param skipMarketRefill  When true (e.g., checkpoint resume), the market
   *                          is not refilled and the saved market state is preserved.
   */
  public startDayPhase(skipMarketRefill: boolean = false): void {
    const s = this.scene;
    // Execute DayStart (optionally refills market, transitions to MarketPhase)
    executeDayStart(s.state, skipMarketRefill);
    s.uiPhase = 'market';

    // Reset hint state for the new turn
    s.hintUsedThisTurn = false;
    s.hintedCardId = null;
    s.hintedSlotIndex = null;

    s.refreshAll();

    // Prewarm currently-visible cards after market/queue are populated.
    void s.cardSvgLoadPromise
      .then(() => s.prewarmVisibleCardTextures())
      .then(() => {
        try {
          s.refreshAll();
        } catch {
          // scene may be shutting down
        }
      });

    s.instructionText.setText(
      `${turnLabel(s.state.config, s.state.turn)} -- Buy cards from the market or End Turn`,
    );
  }

  public endTurn(): void {
    const s = this.scene;
    // Tutorial gating: only allow end-turn if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('end-turn' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Processing end of turn...');
    s.refreshActionButtons();

    // ── Tutorial guard: prevent market cycling before T7 ──────────
    // When the tutorial is active and the current step is action 'end-turn'
    // (T6), the upcoming processEndOfTurn would call cycleMarketCards(),
    // which discards all scenario-placed market cards and refills from the
    // random deck. This would lose the scenario's explicitly-placed
    // investment event card (Local Festival) before T7 can reference it.
    // Set skipMarketCycleOnEndTurn to preserve the market state until T7
    // completes. The flag is reset after processEndOfTurn.
    const tutController = (s as any).tutorialController as any;
    if (tutController?.isActive) {
      const step = getCurrentStep(tutController);
      if (step?.requiredAction === 'end-turn') {
        s.state.skipMarketCycleOnEndTurn = true;
      }
    }

    // Process end-of-turn phases (events, income, night, end check)
    let result: TurnResult;
    try {
      result = processEndOfTurn(s.state);
    } catch (e) {
      // Defensive: if processEndOfTurn throws (e.g. phase mismatch from
      // async state replacement), recover gracefully instead of hanging
      // with a permanent "Processing end of turn..." message.
      console.error('[MainStreet] endTurn failed:', e);
      s.uiPhase = 'market';
      s.instructionText.setText(`Error: ${(e as Error).message}`);
      s.refreshAll();
      return;
    } finally {
      // Reset the flag after processing so subsequent end-turns cycle normally
      s.state.skipMarketCycleOnEndTurn = false;
    }

    // Save checkpoint after each completed turn (fire-and-forget)
    try { this.onSaveCheckpoint?.(); } catch (e) { /* ignore */ }

    // Clear undo stack on end-of-turn (per acceptance criteria)
    try { s.undoManager.clear(); } catch (e) { /* ignore */ }

    // ── Challenge Celebration VFX & Sound ────────────────────────
    // If any challenges were newly completed this turn, trigger celebration
    // animations with staggered timing so they don't overlap.
    if (result.newlyCompletedChallenges.length > 0) {
      // Build a lookup from challenge ID to title
      const challengeTitleById = new Map<string, string>();
      for (const ac of s.state.activeChallenges) {
        challengeTitleById.set(ac.challenge.id, ac.challenge.title);
      }

      result.newlyCompletedChallenges.forEach((challengeId, index) => {
        const title = challengeTitleById.get(challengeId) ?? 'Challenge Complete!';
        s.time.delayedCall(index * 600, () => {
          void s.msAnimator.animateCelebration(title);
        });
      });

      // Refresh the challenge tracker after all celebrations
      s.time.delayedCall(
        result.newlyCompletedChallenges.length * 600 + 200,
        () => s.refreshAll(),
      );
    }

    // Brief delay then show result / advance
    s.time.delayedCall(400, () => {
      if (result.gameResult !== 'playing') {
        // Snapshot tiers before the campaign update mutates them
        const tiersBefore = s.campaign
          ? [...s.campaign.unlockedTiers]
          : [];

        // Update campaign progress (tier evaluation + persistence),
        // then compute newly unlocked tiers and show the overlay.
        // Auto-save transcript to browser storage (fire-and-forget)
        const transcript = finalizeMainStreetTranscript({
          gameResult: result.gameResult,
          finalScore: result.finalScore,
        });
        if (transcript) {
          const transcriptStore = new TranscriptStore();
          autoSaveTranscript(transcriptStore, 'main-street', transcript, '[MainStreet]');
        }

        // Update standalone player statistics (fire-and-forget, independent
        // of campaign progress update). Guarded against replay mode internally
        // by the lifecycle manager.
        s.updateStats(result.gameResult, result.finalScore);

        // Clear checkpoint on game end
        try { this.onGameEnd?.(); } catch (e) { /* ignore */ }
        s.updateCampaignProgress().then(() => {
          const tiersAfter = s.campaign
            ? s.campaign.unlockedTiers
            : [];
          const newlyUnlockedTiers = tiersAfter.filter(
            (t: any) => !tiersBefore.includes(t),
          );
          s.showGameOverOverlay(result, newlyUnlockedTiers);
        });
      } else {
        // Show income feedback briefly then start next turn
        if (result.income && result.income.total > 0) {
          s.instructionText.setText(
            `Income: +${result.income.total} coins` +
            (result.incident ? ` | Incident: ${result.incident.name}` : ''),
          );
        } else if (result.incident) {
          s.instructionText.setText(`Incident: ${result.incident.name}`);
        }
        s.refreshAll();
        // Tutorial: mark end-turn step complete if active
        (s.msLifecycleManager as any).onTutorialActionComplete?.('end-turn' as TutorialActionType);
        s.time.delayedCall(800, () => this.startDayPhase());
      }
    });
  }

  public onPlayHeldEvent(handIndex?: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    // Tutorial gating: only allow play-event if it's the required action or
    // the tutorial is inactive (T13 "Triggering Events" uses this gate).
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('play-event' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // Resolve the event card to play: an explicit hand index (from clicking a
    // specific event card in the merged hand) or the first event in the hand.
    const hand = s.state.hand ?? [];
    let index = handIndex;
    if (index === undefined) {
      index = hand.findIndex((c: any) => c.family === 'event');
    }
    if (index === undefined || index < 0 || index >= hand.length) return;
    const card = hand[index];
    if (card.family !== 'event') return;

    console.debug('[MS] onPlayHeldEvent: attempting PlayEvent', { eventId: card.id, coinsBefore: s.state.resourceBank.coins });
    try {
      const cmd = playEventCommand(s.state, index);
      s.undoManager.execute(cmd);
      // Record action event
      try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'play-event' }, description: cmd.description }); } catch (_) {}
      try { s.gameEvents?.emit('card:placed', { action: 'play-event', heldEventId: card.id }); } catch (_) {}
      s.instructionText.setText('Played held Investment event!');
      addLog(s.state, 'Played held event (via UI)', 'neutral');
      console.debug('[MS] PlayEvent executed', { coinsAfter: s.state.resourceBank.coins });
      // Tutorial: mark play-event step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('play-event' as TutorialActionType);
      } catch (_) { /* ignore */ }
    } catch (e) {
      console.error('[MS] PlayEvent failed', e);
      s.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    s.refreshAll();
  }

  public performUndo(): void {
    const s = this.scene;
    if (s.uiPhase === 'animating' || s.uiPhase === 'game-over') return;
    if (!s.undoManager || !s.undoManager.canUndo()) return;

    try {
      const cmd = s.undoManager.undo();
      addLog(s.state, 'Undo', 'neutral');
      try { if (cmd) recordMainStreetEvent({ type: 'undo', turn: s.state.turn, reversedAction: { description: cmd.description } }); } catch (_) {}
      s.refreshAll();
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }

  public performRedo(): void {
    const s = this.scene;
    if (s.uiPhase === 'animating' || s.uiPhase === 'game-over') return;
    if (!s.undoManager || !s.undoManager.canRedo()) return;

    try {
      const cmd = s.undoManager.redo();
      addLog(s.state, 'Redo', 'neutral');
      try { if (cmd) recordMainStreetEvent({ type: 'redo', turn: s.state.turn, reappliedAction: { description: cmd.description } }); } catch (_) {}
      s.refreshAll();
    } catch (e) {
      console.error('Redo failed:', e);
    }
  }

  public onBusinessCardClick(card: BusinessCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    // Tutorial gating: only allow select-business if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('select-business' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // Tutorial: enforce specific card purchase if requiredCardId is set on the current step.
    // Uses prefix matching (template ID without copy number suffix) so any copy of the
    // required card template satisfies the requirement.
    const controller = (s as any).tutorialController as any;
    if (controller?.isActive) {
      const step = controller.currentStepIndex >= 0
        ? getCurrentStep(controller)
        : null;
      if (step?.requiredCardId && !matchesRequiredCard(card.id, step.requiredCardId)) {
        // Find the card name from the market for the error message
        const requiredCard = s.state.market.development.find(
          (c: any) => matchesRequiredCard(c.id, step.requiredCardId!)
        );
        const requiredName = requiredCard?.name ?? 'the specified card';
        const msg = `This is not the card you should buy right now. Please buy ${requiredName} first.`;
        s.instructionText.setText(msg);
        // Clear the error message after 2 seconds so the overlay remains visible
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
        return;
      }
    }

    s.selectMarketCardById(card.id);

    // Check hand capacity
    const handCheck = canAddToHand(s.state);
    if (!handCheck.legal) {
      s.instructionText.setText(`Hand full: ${handCheck.reason ?? 'Place or sell a card first.'}`);
      return;
    }

    // ── Buy to hand (all purchases now go through hand) ─────
    const sourceIndex = s.state.market.development.findIndex((c: any) => c.id === card.id);
    const cardName = card.name;

    // Ensure stale hover tooltip is cleared
    s.tooltipManager?.hide();

    s.clearMarketSelection();
    s.uiPhase = 'animating';
    s.instructionText.setText(`Buying "${cardName}"...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = () => {
      try {
        const cmd = buyBusinessToHandCommand(s.state, card.id);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-business-to-hand', cardId: card.id }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id }); } catch (_) {}
        s.instructionText.setText(`"${cardName}" bought to hand!`);

        // Set pending hand index for placement (last card added to hand)
        const hand = s.state.hand ?? [];
        s.pendingHandIndex = hand.length - 1;
        s.uiPhase = 'placing-from-hand';
        s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
      } catch (e) {
        console.error('[MS] BuyBusinessToHand failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
        s.uiPhase = 'market';
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.refreshAll();
      s.refreshStreetGrid();
      s.refreshActionButtons();

      // Tutorial: mark select-business step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('select-business' as TutorialActionType);
      } catch (_) { /* ignore */ }
    };

    if (sourceIndex >= 0) {
      const handIndex = (s.state.hand ?? []).length;
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'business',
        row: 'development',
        slotIndex: sourceIndex,
        // Animate to the exact resting position in the merged hand — the
        // HandView-predicted insertion position (single source of truth),
        // not a left-edge slot estimate that would make the card snap
        // sideways when the hand re-renders centred on handCenterX.
        destination: s.getBusinessHandInsertionPosition(handIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  // ── Drag-and-drop buy-to-slot (business cards) ─────────────
  //
  // Wire the reusable core-engine drag-drop module (src/ui/dragDrop.ts)
  // to Main Street: business cards in the Development row become draggable
  // during the market phase and can be dropped straight onto an empty
  // street slot to buy + place in one undoable step.
  //
  // Hand-vs-direct-to-slot semantics: the click flow buys to hand (max
  // hand size 2) then places; the drag flow buys DIRECTLY to the slot,
  // bypassing the hand entirely. This matches the one-gesture request.

  /**
   * Initialise the reusable drag-drop manager for the market phase.
   *
   * Business cards in the Development row are registered as draggables by
   * the renderer; empty street slots are registered as drop zones. The
   * existing click-to-buy → click-to-place flow is preserved via
   * `dragDistanceThreshold` (a pointerup without a drag still reaches the
   * click path).
   */
  public initDragDrop(): void {
    const s = this.scene;
    if (s.dragDropManager) return;
    // Guard: in headless unit tests the scene may have no input plugin.
    if (!s.input || typeof s.input.on !== 'function') return;

    s.dragDropManager = createDragDropManager({
      scene: s,
      dragDistanceThreshold: DEFAULT_DRAG_DISTANCE_THRESHOLD,
      reducedMotion: !!s.settingsPanel?.reducedMotion,
      onDragStart: () => {
        try { s.msRenderer?.showDragHighlights?.(); } catch (_) { /* ignore */ }
      },
      onDragEnd: () => {
        try { s.msRenderer?.clearDragHighlights?.(); } catch (_) { /* ignore */ }
      },
    });
  }

  /**
   * Drag-pickup validation (dragstart veto → illegal-card feedback).
   *
   * A business or community-space card (both live in the Development row)
   * may only be picked up when the player can afford it, there is at least
   * one empty street slot to drop it on, and the tutorial allows the
   * `select-business` action (including requiredCardId matching for tutorial
   * steps that gate a specific card). Events and upgrades are NOT draggable
   * (click-only).
   */
  public canPickUpBusinessCard(cardId: string): boolean {
    const s = this.scene;
    if (s.uiPhase !== 'market') return false;
    const card = s.state.market.development.find((c: any) => c.id === cardId);
    if (!card) return false;
    // Drag support covers business AND community-space cards (general change,
    // operator decision A for the T12 Library bug). Events/upgrades stay
    // click-only (they are not part of the drag-drop module's dev-row model).
    if (card.family !== 'business' && card.family !== 'community-space') return false;
    if (s.state.resourceBank.coins < card.cost) return false;
    if (!s.state.streetGrid.some((slot: any) => slot === null)) return false;

    // Tutorial gating: only allow select-business if it is the required
    // action or the tutorial is inactive.
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('select-business' as TutorialActionType);
    if (check && !check.allowed) return false;

    // Tutorial: enforce specific card purchase if requiredCardId is set on
    // the current step (same prefix-matching rule as the click path).
    const controller = (s as any).tutorialController as any;
    if (controller?.isActive) {
      const step = controller.currentStepIndex >= 0
        ? getCurrentStep(controller)
        : null;
      if (step?.requiredCardId && !matchesRequiredCard(card.id, step.requiredCardId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Drop-zone acceptance validation.
   *
   * The target slot must pass `canPurchaseBusiness` (card still in the
   * Development row, enough coins, empty slot, in bounds) and the tutorial
   * must allow the `place-business` action. During a composite buy-and-place
   * step with a synergy partner (T12: Library next to the Bookshop), the
   * target must also pass `isSynergyAdjacentPlacement`. A rejected drop
   * snap-backs the card to the Development row with illegal-move feedback.
   */
  public canDropBusinessCard(cardId: string, slotIndex: number): boolean {
    const s = this.scene;
    const legality = canPurchaseBusiness(s.state, cardId, slotIndex);
    if (!legality.legal) return false;

    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) return false;

    // Tutorial: synergy adjacency for composite buy-and-place steps (T12).
    const controller = (s as any).tutorialController as any;
    if (controller?.isActive) {
      const step = controller.currentStepIndex >= 0
        ? getCurrentStep(controller)
        : null;
      if (step && !isSynergyAdjacentPlacement(step, s.state.streetGrid, slotIndex)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute a drag-drop buy-and-place.
   *
   * Buys the dragged business card directly to the drop slot in a single
   * undoable `buyBusinessCommand` (the same direct buy-to-slot path used by
   * the AI strategy), with the animated market→street transfer + SFX
   * matching the click flow's feedback. Note: unlike the click flow (which
   * buys to hand), the drag flow bypasses the hand entirely.
   */
  public onDragDropBusiness(payload: DragDropPayload): void {
    const s = this.scene;
    const cardId = payload.data as string;
    const slotIndex = payload.zoneData as number;
    const sourceIndex = s.state.market.development.findIndex((c: any) => c.id === cardId);
    const card = s.state.market.development.find((c: any) => c.id === cardId);
    if (!card || sourceIndex < 0 || slotIndex == null) return;

    // The dragged container follows the pointer, so its position at drop
    // time IS the drop location. Capture it BEFORE refreshAll() recreates
    // the market card at its slot origin, then start the transfer
    // animation from there (not from the market row).
    const dropSource = { x: payload.gameObject?.x ?? 0, y: payload.gameObject?.y ?? 0 };

    const cardName = card.name;
    s.tooltipManager?.hide();
    s.clearMarketSelection();
    s.hiddenTransferSourceCardIds.add(cardId);
    s.uiPhase = 'animating';
    s.instructionText.setText(`Buying "${cardName}"...`);
    s.refreshAll();

    const afterTransfer = (): void => {
      try {
        const cmd = buyBusinessCommand(s.state, cardId, slotIndex);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-business', cardId, slotIndex }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId, slotIndex }); } catch (_) {}
        s.instructionText.setText(`Placed "${cardName}" on slot ${slotIndex}`);
      } catch (e) {
        console.error('[MS] DragBuyBusiness failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(cardId);
      s.uiPhase = 'market';
      s.refreshAll();
      s.refreshStreetGrid();
      s.refreshActionButtons();
      // Tutorial: mark place-business step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
      } catch (_) { /* ignore */ }
    };

    if (sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId,
        family: 'business',
        row: 'development',
        slotIndex: sourceIndex,
        source: dropSource,
        destination: s.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onSlotClick(slotIndex: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'placing-from-hand' && s.uiPhase !== 'placing-business') return;

    // Tutorial gating: only allow place-business if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is placed.
    s.tooltipManager?.hide();

    // Tutorial: synergy adjacency for composite buy-and-place steps (T12 —
    // the Library must be built next to the Bookshop). A non-adjacent click
    // placement is rejected with a data-driven instruction message and the
    // phase stays 'placing-from-hand' so the player can retry.
    const tutController = (s as any).tutorialController as any;
    const step = tutController?.isActive && tutController.currentStepIndex >= 0
      ? getCurrentStep(tutController)
      : null;
    if (step && !isSynergyAdjacentPlacement(step, s.state.streetGrid, slotIndex)) {
      const params = resolveTutorialCardParams(step);
      const cardName = params?.cardName ?? 'this card';
      const synergyName = params?.synergyCardName ?? 'the partner card';
      s.instructionText.setText(`Place ${cardName} next to ${synergyName} for a Culture bonus.`);
      return;
    }

    // ── New flow: place from hand ──────────────────────────────
    if (s.pendingHandIndex !== null) {
      const handIndex = s.pendingHandIndex;
      s.pendingHandIndex = null;
      s.uiPhase = 'animating';
      s.refreshAll();

      try {
        placeFromHand(s.state, handIndex, slotIndex);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'place', handIndex, slotIndex }, description: `Placed from hand to slot ${slotIndex}` }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { handIndex, slotIndex }); } catch (_) {}
        s.instructionText.setText(`Placed on slot ${slotIndex}`);
      } catch (e) {
        console.error('[MS] placeFromHand failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.uiPhase = 'market';
      s.refreshAll();
      // Tutorial: mark place-business step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
      } catch (_) { /* ignore */ }
      return;
    }

    // ── Legacy flow: direct buy to grid (pendingBusinessCard) ──
    // This path is kept for backward compatibility but should not be
    // triggered in normal gameplay since all purchases go through hand.
    if (!s.pendingBusinessCard) {
      const tutController = (s as any).tutorialController as any;
      if (tutController?.isActive) {
        const msg = 'You must first buy a business card. Click on a business card in the market.';
        s.instructionText.setText(msg);
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
      }
      return;
    }

    const sourceIndex = s.pendingBusinessSourceIndex;
    const pendingCardId = s.pendingBusinessCard.id;
    const pendingCardName = s.pendingBusinessCard.name;

    s.pendingBusinessCard = null;
    s.pendingBusinessSourceIndex = null;
    s.clearMarketSelection();
    s.uiPhase = 'animating';
    s.instructionText.setText(`Placing "${pendingCardName}"...`);
    s.hiddenTransferSourceCardIds.add(pendingCardId);
    s.refreshAll();

    const afterTransfer = (): void => {
      try {
        const cmd = buyBusinessCommand(s.state, pendingCardId, slotIndex);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-business', cardId: pendingCardId, slotIndex }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: pendingCardId, slotIndex }); } catch (_) {}
        s.instructionText.setText(`Placed "${pendingCardName}" on slot ${slotIndex}`);
      } catch (e) {
        console.error('[MS] BuyBusiness failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(pendingCardId);
      s.uiPhase = 'market';
      s.refreshAll();
      (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
    };

    if (typeof sourceIndex === 'number' && sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId: pendingCardId,
        family: 'business',
        row: 'development',
        slotIndex: sourceIndex,
        destination: s.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onEventCardClick(card: EventCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;
    // Tutorial gating: only allow buy-event if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('buy-event' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // Tutorial: enforce specific event card purchase if requiredCardId is set.
    // Uses prefix matching (template ID without copy number suffix) so any copy of the
    // required card template satisfies the requirement.
    const evtController = (s as any).tutorialController as any;
    if (evtController?.isActive) {
      const step = evtController.currentStepIndex >= 0
        ? getCurrentStep(evtController)
        : null;
      if (step?.requiredCardId && !matchesRequiredCard(card.id, step.requiredCardId)) {
        const requiredCard = s.state.market.investments.find(
          (c: any) => matchesRequiredCard(c.id, step.requiredCardId!)
        );
        const requiredName = requiredCard?.name ?? 'the specified event card';
        const msg = `This is not the card you should buy right now. Please buy ${requiredName} first.`;
        s.instructionText.setText(msg);
        // Clear the error message after 2 seconds
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
        return;
      }
    }

    // Ensure stale hover tooltip is cleared when a card is played.
    s.tooltipManager?.hide();

    s.selectMarketCardById(card.id);

    const legality = canPurchaseEvent(s.state, card.id);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot buy event: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = s.state.market.investments.findIndex((c: any) => c.id === card.id);

    s.uiPhase = 'animating';
    s.instructionText.setText(`Buying event "${card.name}"...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onEventCardClick: attempting BuyEvent', { cardId: card.id, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.investments.map((c: any)=>c.id) });
      try {
        const cmd = buyEventCommand(s.state, card.id);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-event', cardId: card.id }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id }); } catch (_) {}
        s.instructionText.setText(`Bought event: "${card.name}"`);
      } catch (e) {
        console.error('[MS] BuyEvent failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.uiPhase = 'market';
      s.refreshAll();
      // Tutorial: mark buy-event step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('buy-event' as TutorialActionType);
      } catch (_) { /* ignore */ }
    };

    if (sourceIndex >= 0) {
      const handIndex = (s.state.hand ?? []).length;
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'event',
        row: 'investments',
        slotIndex: sourceIndex,
        // Animate to the exact resting position of the appended hand card — the
        // merged HandView-predicted position (single source of truth), centred
        // on handCenterX rather than the left-anchored slot estimate.
        destination: s.getEventHandInsertionPosition(handIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onRefreshDevelopmentClick(): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    const legality = canRefreshDevelopment(s.state);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot refresh: ${legality.reason ?? 'unknown'}`);
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Discovering new development opportunities...');
    s.refreshAll();

    try {
      const cmd = refreshDevelopmentCommand(s.state);
      s.undoManager.execute(cmd);
      try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'refresh-development' }, description: cmd.description }); } catch (_) {}
      s.instructionText.setText('Refreshed development');
      addLog(s.state, 'Refreshed development (via UI)', 'neutral');
    } catch (e) {
      console.error('[MS] RefreshDevelopment failed', e);
      s.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    s.uiPhase = 'market';
    s.refreshAll();
  }

  public onRefreshInvestmentsClick(): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    const legality = canRefreshInvestments(s.state);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot refresh: ${legality.reason ?? 'unknown'}`);
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Refreshing investments...');
    s.refreshAll();

    try {
      const cmd = refreshInvestmentsCommand(s.state);
      s.undoManager.execute(cmd);
      try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'refresh-investments' }, description: cmd.description }); } catch (_) {}
      s.instructionText.setText('Refreshed investments');
      addLog(s.state, 'Refreshed investments (via UI)', 'neutral');
    } catch (e) {
      console.error('[MS] RefreshInvestments failed', e);
      s.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    s.uiPhase = 'market';
    s.refreshAll();
  }

  public onUpgradeCardClick(card: UpgradeCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;
    // Tutorial gating: only allow apply-upgrade if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('apply-upgrade' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is played.
    s.tooltipManager?.hide();

    s.selectMarketCardById(card.id);

    const legality = canPurchaseUpgrade(s.state, card.id);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot buy upgrade: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = s.state.market.investments.findIndex((c: any) => c.id === card.id);

    // Determine which business slot this upgrade targets (first eligible match)
    const targetSlot = findTargetBusinessSlot(s.state, card);

    // Apply the upgrade directly — no intermediate choice modal.
    // The player clicked the upgrade card; that is the upgrade to apply.
    s.uiPhase = 'animating';
    s.instructionText.setText(`Applying upgrade "${card.name}"...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onUpgradeCardClick: attempting BuyUpgrade', { cardId: card.id, targetSlot, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.investments.map((c: any)=>c.id), streetBefore: s.state.streetGrid.map((slot: any)=>slot?.id ?? null) });
      try {
        const cmd = buyUpgradeCommand(s.state, card.id, targetSlot);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-upgrade', cardId: card.id, targetSlot }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id, targetSlot }); } catch (_) {}
        s.instructionText.setText(`Applied upgrade: "${card.name}"`);
      } catch (e) {
        console.error('[MS] BuyUpgrade failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.uiPhase = 'market';
      s.refreshAll();
      // Tutorial: mark apply-upgrade step complete if active
      (s.msLifecycleManager as any).onTutorialActionComplete?.('apply-upgrade' as TutorialActionType);
    };

    if (sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'upgrade',
        row: 'investments',
        slotIndex: sourceIndex,
        destination: s.getStreetSlotCenter(targetSlot),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  /**
   * Handles clicking on a placed business/community-space card during the
   * MarketPhase to open a sell confirmation dialog.
   *
   * @param slotIndex  Street grid slot index of the card to sell.
   */
  /**
   * Handles clicking on a business card in the player's hand during
   * the market phase. Sets pendingHandIndex and switches to
   * placing-from-hand phase so the card can be placed on the grid.
   *
   * When already in placing-from-hand phase, clicking a different
   * hand card switches the selection.
   *
   * @param index  Index into s.state.hand for the clicked card.
   */
  public onHandBusinessCardClick(index: number): void {
    const s = this.scene;
    const hand = s.state.hand ?? [];
    if (index < 0 || index >= hand.length) return;

    // Event cards are played (via onPlayHeldEvent), never placed on the street.
    if (hand[index].family === 'event') return;

    // Tutorial gating: only allow if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('select-hand-card' as any);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // When already in placing-from-hand, switching selection is allowed
    // (preserving existing customClickFn behavior)
    if (s.uiPhase === 'placing-from-hand' && s.pendingHandIndex !== null) {
      s.pendingHandIndex = index;
      const cardName = hand[index]?.name ?? 'card';
      s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
      s.refreshAll();
      // Update the selection highlight via the renderer
      if (s.msRenderer && typeof s.msRenderer.updateBusinessHandSelection === 'function') {
        s.msRenderer.updateBusinessHandSelection(index);
      }
      return;
    }

    // Only respond during market phase
    if (s.uiPhase !== 'market') return;

    // Ensure stale hover tooltip is cleared
    s.tooltipManager?.hide();

    s.pendingHandIndex = index;
    s.uiPhase = 'placing-from-hand';
    const cardName = hand[index]?.name ?? 'card';
    s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
    s.refreshAll();

    // Update the selection highlight
    if (s.msRenderer && typeof s.msRenderer.updateBusinessHandSelection === 'function') {
      s.msRenderer.updateBusinessHandSelection(index);
    }

    // Tutorial: mark select-hand-card step complete if active
    try {
      (s.msLifecycleManager as any).onTutorialActionComplete?.('select-hand-card' as any);
    } catch (_) { /* ignore */ }
  }

  public onSellCard(slotIndex: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    const card = s.state.streetGrid[slotIndex];
    if (!card) return;

    // Check if already sold
    const soldSlots: boolean[] = s.state.soldSlots ?? [];
    if (soldSlots[slotIndex]) return;

    // Check legality
    const legality = canSellBusiness(s.state, slotIndex, false);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot sell: ${legality.reason ?? 'unknown'}`);
      return;
    }

    // Calculate refund for display
    const upgradeCosts = (card as any).totalUpgradeCost ?? 0;
    const refund = Math.ceil((card.cost + upgradeCosts) / 2);

    // Build card info for dialog
    const isCommunitySpace = card.family === 'community-space';
    const cardLabel = isCommunitySpace ? 'Community Space' : 'Business';
    const info = `${cardLabel}: ${card.name}\n` +
      `Purchase: €${card.cost}\n` +
      `Upgrades: €${upgradeCosts}\n` +
      `Refund: €${refund} (50%)\n\n` +
      `Sell this card? It will remain on the grid but produce no further income.`;

    // Show sell confirmation via overlay
    s.showSellConfirmation(slotIndex, card.name, refund, info);
  }
}
