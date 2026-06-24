import { addLog } from '../MainStreetState';
import { executeDayStart, processEndOfTurn, type TurnResult } from '../MainStreetEngine';
import {
  getEmptySlots,
  findTargetBusinessSlot,
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
  canRefreshInvestments,
} from '../MainStreetMarket';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import { buyBusinessCommand, buyUpgradeCommand, buyEventCommand, playEventCommand, refreshInvestmentsCommand } from '../MainStreetCommands';
import { recordMainStreetEvent, finalizeMainStreetTranscript } from '../MainStreetTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import { getCurrentStep, type TutorialActionType } from '../TutorialFlow';

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

  public startDayPhase(): void {
    const s = this.scene;
    // Execute DayStart (refills market, transitions to MarketPhase)
    executeDayStart(s.state);
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
      `Turn ${s.state.turn} / ${s.state.config.maxTurns} -- Buy cards from the market or End Turn`,
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
    }

    // Save checkpoint after each completed turn (fire-and-forget)
    try { this.onSaveCheckpoint?.(); } catch (e) { /* ignore */ }

    // Clear undo stack on end-of-turn (per acceptance criteria)
    try { s.undoManager.clear(); } catch (e) { /* ignore */ }

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

  public onPlayHeldEvent(): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;
    if (!s.state.heldEvent) return;

    console.debug('[MS] onPlayHeldEvent: attempting PlayEvent', { heldEventId: s.state.heldEvent?.id, coinsBefore: s.state.resourceBank.coins });
    try {
      const cmd = playEventCommand(s.state);
      s.undoManager.execute(cmd);
      // Record action event
      try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'play-event' }, description: cmd.description }); } catch (_) {}
      try { s.gameEvents?.emit('card:placed', { action: 'play-event', heldEventId: s.state.heldEvent?.id ?? null }); } catch (_) {}
      s.instructionText.setText('Played held Investment event!');
      addLog(s.state, 'Played held event (via UI)', 'neutral');
      console.debug('[MS] PlayEvent executed', { coinsAfter: s.state.resourceBank.coins, heldEventAfter: s.state.heldEvent?.id ?? null });
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

    const emptySlots = getEmptySlots(s.state);
    if (emptySlots.length === 0) {
      s.instructionText.setText('No empty slots available!');
      return;
    }

    // Check if can afford
    const firstSlot = emptySlots[0];
    const legality = canPurchaseBusiness(s.state, card.id, firstSlot);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot buy: ${legality.reason ?? 'unknown'}`);
      return;
    }

    // Enter placement mode
    s.pendingBusinessCard = card;
    s.pendingBusinessSourceIndex = s.state.market.development.findIndex((c: any) => c.id === card.id);
    s.uiPhase = 'placing-business';
    s.instructionText.setText(`Click an empty slot to place "${card.name}"`);
    s.refreshStreetGrid();
    s.refreshActionButtons();

    // Tutorial: mark select-business step complete if active
    try {
      (s.msLifecycleManager as any).onTutorialActionComplete?.('select-business' as TutorialActionType);
    } catch (_) { /* ignore */ }
  }

  public onSlotClick(slotIndex: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'placing-business') return;

    // Tutorial: if no card is pending (because it was rejected by requiredCardId check),
    // show a helpful message directing the player to buy a business card first
    if (!s.pendingBusinessCard) {
      const controller = (s as any).tutorialController as any;
      if (controller?.isActive) {
        const msg = 'You must first buy a business card. Click on a business card in the market.';
        s.instructionText.setText(msg);
        // Clear the error message after 2 seconds
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
      }
      return;
    }

    // Tutorial gating: only allow place-business if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is played.
    s.tooltipManager?.hide();

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
      console.debug('[MS] onSlotClick: attempting BuyBusiness', { cardId: pendingCardId, slotIndex, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.development.map((c: any)=>c.id) });
      try {
        const cmd = buyBusinessCommand(s.state, pendingCardId, slotIndex);
        s.undoManager.execute(cmd);
        // Record action event
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-business', cardId: pendingCardId, slotIndex }, description: cmd.description }); } catch (_) {}
        // Emit a game event for audio / integrations
        try { s.gameEvents?.emit('card:placed', { cardId: pendingCardId, slotIndex }); } catch (_) {}
        s.instructionText.setText(`Placed "${pendingCardName}" on slot ${slotIndex}`);
      } catch (e) {
        console.error('[MS] BuyBusiness failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(pendingCardId);
      s.uiPhase = 'market';
      s.refreshAll();
      // Tutorial: mark place-business step complete if active
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
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'event',
        row: 'investments',
        slotIndex: sourceIndex,
        destination: s.getHandCardCenter(),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
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
}
