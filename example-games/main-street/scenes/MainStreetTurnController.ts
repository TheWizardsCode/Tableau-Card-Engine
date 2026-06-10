import { addLog } from '../MainStreetState';
import { executeDayStart, processEndOfTurn, type TurnResult } from '../MainStreetEngine';
import {
  getEmptySlots,
  getUpgradeBranchesForBusiness,
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
import { FONT_FAMILY, createOverlayBackground, createOverlayButton, dismissOverlay } from '../../../src/ui';
import type { TutorialActionType } from '../TutorialFlow';

export class MainStreetTurnController {
  constructor(private readonly scene: any) {}

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
    s.pendingBusinessSourceIndex = s.state.market.business.findIndex((c: any) => c.id === card.id);
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
    if (s.uiPhase !== 'placing-business' || !s.pendingBusinessCard) return;
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
      console.debug('[MS] onSlotClick: attempting BuyBusiness', { cardId: pendingCardId, slotIndex, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.business.map((c: any)=>c.id) });
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
        row: 'business',
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

    // If there are multiple upgrade branches for that business, show a choice modal
    const branches = getUpgradeBranchesForBusiness(s.state, targetSlot);
    if (branches.length > 1) {
      this.showUpgradeChoiceModal(branches, targetSlot, sourceIndex);
      return;
    }

    // Single upgrade available — apply after transfer animation
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

  public showUpgradeChoiceModal(branches: UpgradeCard[], targetSlot: number, sourceIndex: number): void {
    const s = this.scene;
    const MODAL_DEPTH = 20;
    const MODAL_W = 500;
    const BTN_H = 60;
    const HEADER_H = 60;
    const FOOTER_H = 50;
    const MODAL_H = HEADER_H + branches.length * BTN_H + FOOTER_H;

    const overlay = createOverlayBackground(
      s,
      { depth: MODAL_DEPTH, alpha: 0.8 },
      { width: MODAL_W, height: MODAL_H, color: 0x1a1208, alpha: 0.95, depth: MODAL_DEPTH },
    );
    s.overlayObjects.push(...overlay.objects);

    const cx = s.layout.gameW / 2;
    const cy = s.layout.gameH / 2;
    const top = cy - MODAL_H / 2;

    // Title
    const title = s.add
      .text(cx, top + 24, 'Choose an Upgrade Path', {
        fontSize: '18px', fontStyle: 'bold', color: '#ffdd88', fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(MODAL_DEPTH + 1);
    s.overlayObjects.push(title);

    // Branch buttons
    branches.forEach((branch, idx) => {
      const btnY = top + HEADER_H + idx * BTN_H + BTN_H / 2;

      // Button background
      const btnBg = s.add.rectangle(cx, btnY, MODAL_W - 40, BTN_H - 8, 0x2a1f14, 0.9)
        .setDepth(MODAL_DEPTH + 1)
        .setStrokeStyle(1, 0x665544)
        .setInteractive({ useHandCursor: true });
      s.overlayObjects.push(btnBg);

      // Branch label
      const costLabel = `$${branch.cost}`;
      const bonusLabel = `+${branch.incomeBonus} income, +${branch.synergyRangeBonus} range`;
      const btnText = s.add
        .text(cx, btnY - 8, branch.name, {
          fontSize: '14px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(MODAL_DEPTH + 2);
      s.overlayObjects.push(btnText);

      const detailText = s.add
        .text(cx, btnY + 10, `${costLabel} — ${bonusLabel}`, {
          fontSize: '11px', color: '#aaaaaa', fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(MODAL_DEPTH + 2);
      s.overlayObjects.push(detailText);

      const onChoose = (): void => {
        // Dismiss modal first
        dismissOverlay(s.overlayObjects);
        s.overlayObjects = [];

        s.uiPhase = 'animating';
        s.instructionText.setText(`Applying upgrade "${branch.name}"...`);
        s.hiddenTransferSourceCardIds.add(branch.id);
        s.refreshAll();

        const afterTransfer = (): void => {
          try {
            s.undoManager.execute(buyUpgradeCommand(s.state, branch.id, targetSlot));
            s.instructionText.setText(`Applied upgrade: "${branch.name}"`);
          } catch (e) {
            s.instructionText.setText(`Error: ${(e as Error).message}`);
          }

          s.hiddenTransferSourceCardIds.delete(branch.id);
          s.uiPhase = 'market';
          s.refreshAll();
        };

        if (sourceIndex >= 0) {
          void s.animateTransferFromMarket({
            cardId: branch.id,
            family: 'upgrade',
            row: 'investments',
            slotIndex: sourceIndex,
            destination: s.getStreetSlotCenter(targetSlot),
          }).then(afterTransfer);
        } else {
          afterTransfer();
        }
      };

      btnBg.on('pointerdown', onChoose);
      btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a2f24, 0.95));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x2a1f14, 0.9));
    });

    // Cancel button
    const cancelBtn = createOverlayButton(
      s,
      cx,
      top + MODAL_H - FOOTER_H / 2,
      '[ Cancel ]',
      MODAL_DEPTH + 2,
      { color: '#ff8888', hoverColor: '#ffaaaa' },
    );
    s.overlayObjects.push(cancelBtn);
    cancelBtn.on('pointerdown', () => {
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
    });
  }
}
