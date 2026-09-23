/**
 * Main Street: Placement and Sale
 *
 * Slot clicks, sell, hand-upgrade application, and pending-targeting state.
 *
 * @module
 */

import { playIllegalFeedback } from './MainStreetTurnControllerUtils';

import { computeSynergyPairs } from '../MainStreetAdjacency';
import type { UpgradeCard } from '../MainStreetCards';
import { buyBusinessCommand, playBusinessFromHandCommand, playUpgradeFromHandCommand } from '../MainStreetCommands';
import { canSellBusiness, computeSellRefund } from '../MainStreetMarket';
import { isEligibleUpgradeTarget } from '../MainStreetMarketUtils';
import { recordMainStreetEvent } from '../MainStreetTranscript';
import { getCurrentStep, isSynergyAdjacentPlacement, resolveTutorialCardParams } from '../TutorialFlow';
import type { TutorialActionType } from '../TutorialFlow';
import type { MainStreetTurnControllerContext } from './MainStreetTurnControllerContext';

export function onSlotClick(tcCtx: MainStreetTurnControllerContext, slotIndex: number): void {

    const s = tcCtx.scene;
    if (s.uiPhase !== 'placing-from-hand' && s.uiPhase !== 'placing-business') return;

    // Upgrade targeting (CG-0MT3IYSRL001VVUP): when the pending hand card is
    // an upgrade, the street click chooses WHICH business to upgrade — a
    // different gating action (`apply-upgrade`) and eligibility model from
    // placing a business on an empty slot.
    const pendingTargetCard = s.pendingHandIndex !== null
      ? (s.state.hand ?? [])[s.pendingHandIndex]
      : undefined;
    if (pendingTargetCard && pendingTargetCard.family === 'upgrade') {
      const checkU = (s.msLifecycleManager as any).isTutorialActionAllowed?.('apply-upgrade' as TutorialActionType);
      if (checkU && !checkU.allowed) {
        s.instructionText.setText(checkU.reason ?? 'Complete the highlighted step first.');
        const handSpriteU = s.msRenderer?.handView?.getSpriteAt?.(s.pendingHandIndex ?? -1) as any;
        playIllegalFeedback(handSpriteU ?? s.actionContainer, s);
        return;
      }
      tcCtx.applyHandUpgradeToSlot(s.pendingHandIndex as number, slotIndex);
      return;
    }

    // Tutorial gating: only allow place-business if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const handSpriteGating = s.msRenderer?.handView?.getSpriteAt?.(s.pendingHandIndex ?? -1) as any;
      playIllegalFeedback(handSpriteGating ?? s.actionContainer, s);
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is placed.
    s.tooltipManager?.hide();

    // Tutorial: synergy adjacency for composite buy-and-place steps (T13 —
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
      const handSpriteSynergy = s.msRenderer?.handView?.getSpriteAt?.(s.pendingHandIndex ?? -1) as any;
      playIllegalFeedback(handSpriteSynergy ?? s.actionContainer, s);
      return;
    }

    // ── New flow: place from hand ──────────────────────────────
    if (s.pendingHandIndex !== null) {
      const handIndex = s.pendingHandIndex;
      const handCard = (s.state.hand ?? [])[handIndex];
      if (!handCard) {
        s.pendingHandIndex = null;
        s.pendingHandJustMoved = false;
        s.uiPhase = 'market';
        s.instructionText.setText('Card no longer in hand.');
        return;
      }

      const cardId = handCard.id;
      const cardName = handCard.name;

      // Capture the hand card's resting position (excludes selection-raise)
      const handPos = s.msRenderer?.handView?.getBasePosition(handIndex);
      const source = handPos
        ? { x: handPos.x, y: handPos.y }
        : { x: s.layout.handX + s.layout.handCardW / 2, y: s.layout.handY + s.layout.handCardH / 2 };

      s.pendingHandIndex = null;
      s.hiddenTransferSourceCardIds.add(cardId);
      s.uiPhase = 'animating';
      s.instructionText.setText(`Placing "${cardName}"...`);
      s.refreshAll();

      const afterTransfer = (): void => {
        // Capture synergy pairs before the placement mutates the grid so only
        // NEWLY formed pairs animate.
        const beforePairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? [], tcCtx.streetPairDims());

        // Composite pricing (CG-0MT24X0SX007RLHN): a same-week card (just
        // moved from the market this turn) is part of the move+place purchase
        // — the move already spent the daily action. When no action remains
        // for the placement step, the +50% premium replaces the missing
        // action; when an action DOES remain (Golden Mile 2-action days), the
        // placement consumes it at listed cost. Held cards (plan-ahead) always
        // consume an action at listed cost.
        const premiumApplies = s.pendingHandJustMoved && s.state.actionsRemaining <= 0;
        const premiumCost = premiumApplies
          ? Math.ceil(handCard.cost * 1.5 * 2) / 2
          : undefined;

        // Shared post-place cleanup (success, failure, or dialog cancel).
        const finish = (): void => {
          s.hiddenTransferSourceCardIds.delete(cardId);
          s.uiPhase = 'market';
          s.refreshAll();
          s.refreshStreetGrid();
          s.refreshActionButtons();
          // Synergy-formation animation for any new pairs (non-blocking).
          tcCtx.animateNewSynergyPairs(beforePairs);
          // Tutorial: mark place-business step complete if active
          try {
            (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
          } catch (_) { /* ignore */ }
        };

        const doPlace = (): void => {
          try {
            // Composite-premium command (CG-0MT24X0SX007RLHN): when
            // `premiumCost` is supplied the +50% premium replaces the action
            // (no action consumed); the held-card / GM-listed path (undefined)
            // consumes the action at listed cost. Executed through the undo
            // manager so the coin deduction is fully undoable/redoable.
            const cmd = playBusinessFromHandCommand(s.state, handIndex, slotIndex, premiumCost);
            s.undoManager.execute(cmd);
            s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
            // The just-moved card has now been placed; clear the tracker so a
            // later selection of any other hand card costs an action again.
            // (Cleared only on success — on failure the card stays in hand and
            // a retry must still place it free, CG-0MSXIQIPJ000NDTL.)
            if (s.justMovedHandCardId === cardId) {
              s.justMovedHandCardId = null;
            }
            try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'play-business-from-hand', handIndex, slotIndex }, description: premiumApplies ? `Placed from hand to slot ${slotIndex} (50% premium, no action left)` : `Placed from hand to slot ${slotIndex}` }); } catch (_) {}
            try { s.gameEvents?.emit('card:placed', { handIndex, slotIndex }); } catch (_) {}
            s.instructionText.setText(premiumApplies
              ? `Placed "${cardName}" on slot ${slotIndex} (50% premium)`
              : `Placed "${cardName}" on slot ${slotIndex}`);
          } catch (e) {
            const msg = (e as Error).message;
            console.error('[MS] playBusinessFromHandCommand failed', e);
            const handSprite = s.msRenderer?.handView?.getSpriteAt?.(handIndex) as any;
            playIllegalFeedback(handSprite ?? s.actionContainer, s);
            s.instructionText.setText(`Error: ${msg}`);
          }
          finish();
        };

        if (premiumApplies) {
          // Affordability pre-gate (CG-0MT24X0SX007RLHN): reject the premium
          // placement with illegal feedback BEFORE the explainer dialog when
          // the player cannot afford the premium price (dialog does not fire).
          const handSprite = s.msRenderer?.handView?.getSpriteAt?.(handIndex);
          if (s.state.resourceBank.coins < premiumCost!) {
            playIllegalFeedback(handSprite, s);
            s.instructionText.setText(`Error: Not enough coins to place ${cardName} at the premium price. Need ${premiumCost}, have ${s.state.resourceBank.coins}.`);
            finish();
            return;
          }
          // Explain dialog before confirming the premium placement
          // (CG-0MT24X0SX007RLHN): proceed → place at premium; cancel →
          // placement aborts and the card returns to hand (no cost, no
          // action consumed).
          s.showBuyAndPlacePremiumDialog(cardName, doPlace, () => {
            s.instructionText.setText(`"${cardName}" stays in hand — placement cancelled.`);
            finish();
          });
          return;
        }
        doPlace();
      };

      void s.animateTransferFromMarket({
        cardId,
        family: 'business',
        row: 'market',
        slotIndex: handIndex,
        source,
        destination: s.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
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
        playIllegalFeedback(s.actionContainer, s);
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
      // Capture synergy pairs before the placement mutates the grid so only
      // NEWLY formed pairs animate.
      const beforePairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? [], tcCtx.streetPairDims());
      try {
        const cmd = buyBusinessCommand(s.state, pendingCardId, slotIndex);
        s.undoManager.execute(cmd);
        s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
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
      // Synergy-formation animation for any new pairs (non-blocking).
      tcCtx.animateNewSynergyPairs(beforePairs);
      (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
    };

    if (typeof sourceIndex === 'number' && sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId: pendingCardId,
        family: 'business',
        row: 'market',
        slotIndex: sourceIndex,
        destination: s.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  
}

export function onSellCard(tcCtx: MainStreetTurnControllerContext, slotIndex: number): void {

    const s = tcCtx.scene;
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
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    // Calculate refund for display using the new formula (CG-0MT5XO7DI0066QCT)
    const breakdown = computeSellRefund(s.state, card, slotIndex);
    const refund = breakdown.totalRefund;

    // Build card info for the Manage Card dialog. Kept compact (6 lines) so
    // the refund highlight, the Close cost line, and the three buttons below
    // it never overlap the info block.
    const isCommunitySpace = card.family === 'community-space';
    const cardLabel = isCommunitySpace ? 'Community Space' : 'Business';
    const info = `${cardLabel}: ${card.name}\n` +
      `Purchase €${card.cost} · Upgrades €${(card as any).totalUpgradeCost ?? 0}\n` +
      `Sell refund €${refund} (base €${breakdown.baseRefund})\n` +
      `Synergy: +€${breakdown.synergyIncomeComponent} income, +€${breakdown.synergyRepComponent} rep\n\n` +
      `Sell: free, card stays on the grid (inert).`;

    // Show the Manage Card dialog (Sell / Close / Cancel) via overlay
    s.showSellConfirmation(slotIndex, card.name, refund, info);
  
}

export function applyHandUpgradeToSlot(tcCtx: MainStreetTurnControllerContext, handIndex: number, slotIndex: number): void {

    const s = tcCtx.scene;
    const handCard = (s.state.hand ?? [])[handIndex] as UpgradeCard | undefined;
    if (!handCard) {
      s.pendingHandIndex = null;
      s.pendingHandJustMoved = false;
      s.uiPhase = 'market';
      s.instructionText.setText('Card no longer in hand.');
      return;
    }

    const biz = s.state.streetGrid[slotIndex];
    const requiredLevel = handCard.requiredLevel ?? 0;
    const isEligible = isEligibleUpgradeTarget(biz, handCard);

    const handSprite = s.msRenderer?.handView?.getSpriteAt?.(handIndex) as any;

    if (!isEligible) {
      // Illegal target: no state mutation, upgrade stays selected for a retry.
      playIllegalFeedback(handSprite ?? s.actionContainer ?? null, s);
      s.instructionText.setText(
        `"${handCard.name}" can only upgrade ${handCard.targetBusiness} at level ${requiredLevel}. Click another business.`,
      );
      return;
    }

    const cardId = handCard.id;
    const cardName = handCard.name;
    const handPos = s.msRenderer?.handView?.getBasePosition(handIndex);
    const source = handPos
      ? { x: handPos.x, y: handPos.y }
      : { x: s.layout.handX + s.layout.handCardW / 2, y: s.layout.handY + s.layout.handCardH / 2 };

    s.pendingHandIndex = null;
    s.pendingHandJustMoved = false;
    s.hiddenTransferSourceCardIds.add(cardId);
    s.uiPhase = 'animating';
    s.instructionText.setText(`Applying "${cardName}"...`);
    s.refreshAll();

    const afterTransfer = (): void => {
      let applied = false;
      try {
        const cmd = playUpgradeFromHandCommand(s.state, handIndex, slotIndex);
        s.undoManager.execute(cmd);
        s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
        // Clear the same-week composite tracker once the upgrade has landed.
        if (s.state.justMovedUpgradeCardId === cardId) {
          s.state.justMovedUpgradeCardId = null;
        }
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'play-upgrade-from-hand', handIndex, targetSlot: slotIndex }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId, targetSlot: slotIndex }); } catch (_) {}
        s.instructionText.setText(`Applied upgrade: "${cardName}"`);
        applied = true;
      } catch (e) {
        console.error('[MS] playUpgradeFromHandCommand failed', e);
        playIllegalFeedback(handSprite ?? s.actionContainer, s);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(cardId);
      s.uiPhase = 'market';
      s.refreshAll();
      s.refreshStreetGrid();
      s.refreshActionButtons();

      // Level-up burst on the upgraded business when the upgrade actually
      // landed (non-blocking presentation; reduced-motion / replay handling
      // lives inside the animator).
      if (applied) {
        try {
          const target = s.state.streetGrid[slotIndex] as { level?: number } | null;
          if (target) {
            s.msAnimator.animateLevelUp({ slotIndex, level: target.level ?? 1 });
          }
        } catch (_) {
          // presentation-only — ignore
        }
      }

      // Tutorial: mark apply-upgrade step complete if active
      (s.msLifecycleManager as any).onTutorialActionComplete?.('apply-upgrade' as TutorialActionType);
    };

    void s.animateTransferFromMarket({
      cardId,
      family: 'upgrade',
      row: 'market',
      slotIndex: handIndex,
      source,
      destination: s.getStreetSlotCenter(slotIndex),
    }).then(afterTransfer);
  
}

export function hasPendingTargeting(tcCtx: MainStreetTurnControllerContext): boolean {

    const s = tcCtx.scene;
    return (
      (s.uiPhase === 'placing-from-hand' || s.uiPhase === 'placing-business') &&
      s.pendingHandIndex !== null
    );
  
}

export function cancelPendingPlacement(tcCtx: MainStreetTurnControllerContext): boolean {

    const s = tcCtx.scene;
    if (!tcCtx.hasPendingTargeting()) return false;

    s.pendingHandIndex = null;
    s.pendingHandJustMoved = false;
    s.uiPhase = 'market';
    s.instructionText.setText('Selection cleared — click a card to continue.');

    // Drop the hand selection highlight (null clears every border).
    if (s.msRenderer && typeof s.msRenderer.updateBusinessHandSelection === 'function') {
      s.msRenderer.updateBusinessHandSelection(null);
    }
    // Defensive explicit clear of upgrade click-target highlights
    // (CG-0MUDA70FK003J8YL); the refreshAll below already rebuilds the street
    // container, but this keeps the state clean for any future exit path.
    if (s.msRenderer && typeof s.msRenderer.clearTargetHighlights === 'function') {
      s.msRenderer.clearTargetHighlights();
    }
    s.refreshAll();
    return true;
  
}

export function streetPairDims(tcCtx: MainStreetTurnControllerContext): { cols: number; rows: number } | undefined {

    const p = (tcCtx.scene as any).streetPlayableLattice as { cols: number; rows: number } | undefined;
    return p && (p.cols > 1 || p.rows > 1) ? { cols: p.cols, rows: p.rows } : undefined;
  
}
