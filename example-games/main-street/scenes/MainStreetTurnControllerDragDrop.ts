/**
 * Main Street: Drag-and-Drop Actions
 *
 * Drag-drop init, pick-up/drop validation, and business/upgrade drop handlers.
 *
 * @module
 */

import { playIllegalFeedback, matchesRequiredCard } from './MainStreetTurnControllerUtils';

import { DEFAULT_DRAG_DISTANCE_THRESHOLD, createDragDropManager } from '@ui/dragDrop';
import type { DragDropPayload } from '@ui/dragDrop';
import { computeSynergyPairs } from '../MainStreetAdjacency';
import { buyAndPlaceBusinessCommand, buyAndPlaceUpgradeCommand } from '../MainStreetCommands';
import { canBuyAndPlaceUpgrade, canPurchaseBusiness } from '../MainStreetMarket';
import { recordMainStreetEvent } from '../MainStreetTranscript';
import { getCurrentStep, isSynergyAdjacentPlacement } from '../TutorialFlow';
import type { TutorialActionType } from '../TutorialFlow';
import { computeDragTransferDuration } from './MainStreetConstants';
import type { MainStreetTurnControllerContext } from './MainStreetTurnControllerContext';

export function initDragDrop(tcCtx: MainStreetTurnControllerContext): void {

    const s = tcCtx.scene;
    if (s.dragDropManager) return;
    // Guard: in headless unit tests the scene may have no input plugin.
    if (!s.input || typeof s.input.on !== 'function') return;

    s.dragDropManager = createDragDropManager({
      scene: s,
      dragDistanceThreshold: DEFAULT_DRAG_DISTANCE_THRESHOLD,
      reducedMotion: !!s.settingsPanel?.reducedMotion,
      onDragStart: (payload) => {
        try { s.msRenderer?.showDragHighlights?.(payload?.data as string | undefined); } catch (_) { /* ignore */ }
      },
      onDragEnd: () => {
        try { s.msRenderer?.clearDragHighlights?.(); } catch (_) { /* ignore */ }
      },
    });
  
}

export function canPickUpBusinessCard(tcCtx: MainStreetTurnControllerContext, cardId: string): boolean {

    const s = tcCtx.scene;
    if (s.uiPhase !== 'market') return false;
    // Action economy (CG-0MSTOF1N5005PK2R): dragging is a buy-and-place
    // action — no pickup when the daily action budget is spent.
    if (s.state.actionsRemaining <= 0) return false;
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (!card) return false;
    // Drag support covers business AND community-space cards (general change,
    // operator decision A for the T13 Library bug). Events/upgrades stay
    // click-only (they are not part of the drag-drop module's dev-row model).
    if (card.family !== 'business' && card.family !== 'community-space') return false;
    // Composite-parity buy-and-place price (CG-0MT24X0SX007RLHN): on GM
    // 2-action days the drag charges the LISTED cost (consuming 2 actions);
    // on a 1-action day it charges the +50% premium (consuming 1 action).
    // Check affordability against the applicable price.
    const price = s.state.actionsRemaining >= 2 ? card.cost : Math.ceil(card.cost * 1.5 * 2) / 2;
    if (s.state.resourceBank.coins < price) return false;
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

export function canDropBusinessCard(tcCtx: MainStreetTurnControllerContext, cardId: string, slotIndex: number): boolean {

    const s = tcCtx.scene;
    // Action economy (CG-0MSTOF1N5005PK2R): buy-and-place consumes the
    // daily action — no drop when the budget is spent. On GM 2-action days
    // the drag consumes BOTH actions (composite parity), so 2 must remain.
    if (s.state.actionsRemaining <= 0) return false;
    const legality = canPurchaseBusiness(s.state, cardId, slotIndex);
    if (!legality.legal) return false;

    // Composite-parity buy-and-place price (CG-0MT24X0SX007RLHN): on GM
    // 2-action days the drag charges the LISTED cost (2 actions consumed);
    // on a 1-action day it charges the +50% premium. Verify affordability
    // against the applicable price (not just the listed cost).
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (card && (card.family === 'business' || card.family === 'community-space')) {
      const price = s.state.actionsRemaining >= 2 ? card.cost : Math.ceil(card.cost * 1.5 * 2) / 2;
      if (s.state.resourceBank.coins < price) return false;
    }

    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) return false;

    // Tutorial: synergy adjacency for composite buy-and-place steps (T13).
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

export function onDragDropBusiness(tcCtx: MainStreetTurnControllerContext, payload: DragDropPayload): void {

    const s = tcCtx.scene;
    const cardId = payload.data as string;
    const slotIndex = payload.zoneData as number;
    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === cardId);
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (!card || sourceIndex < 0 || slotIndex == null) return;

    // The dragged container follows the pointer, so its position at drop
    // time IS the drop location. Capture it BEFORE refreshAll() recreates
    // the market card at its slot origin, then start the transfer
    // animation from there (not from the market row).
    const dropSource = { x: payload.gameObject?.x ?? 0, y: payload.gameObject?.y ?? 0 };

    const cardName = card.name;

    // Composite-parity pricing for the drag's move+place accounting:
    // premium applies only when the drag's own action leaves no action for
    // the placement step (last action on a 1-action day); on GM 2-action
    // days the placement consumes the remaining action at listed cost.
    const premiumApplies = s.state.actionsRemaining <= 1;
    const priceOverride = premiumApplies ? undefined : card.cost;
    const extraActions = premiumApplies ? 0 : 1;

    const startTransfer = (): void => {
      s.tooltipManager?.hide();
      s.clearMarketSelection();
      s.hiddenTransferSourceCardIds.add(cardId);
      s.uiPhase = 'animating';
      s.instructionText.setText(`Moving "${cardName}" to hand...`);
      s.refreshAll();

      const afterTransfer = (): void => {
        // Capture synergy pairs before the placement mutates the grid so only
        // NEWLY formed pairs animate (pre-existing pairs never re-trigger).
        const beforePairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? [], tcCtx.streetPairDims());
        try {
          const cmd = buyAndPlaceBusinessCommand(s.state, cardId, slotIndex, priceOverride, extraActions);
          s.undoManager.execute(cmd);
          s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
          try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-and-place', cardId, slotIndex }, description: cmd.description }); } catch (_) {}
          try { s.gameEvents?.emit('card:placed', { cardId, slotIndex }); } catch (_) {}
          s.instructionText.setText(premiumApplies
            ? `Placed "${cardName}" on slot ${slotIndex} (50% premium)`
            : `Placed "${cardName}" on slot ${slotIndex}`);
        } catch (e) {
          console.error('[MS] DragBuyBusiness failed', e);
          const msg = (e as Error).message;
          const container = s.msRenderer?.getMarketRowCards?.()?.[sourceIndex] ?? s.actionContainer ?? null;
          playIllegalFeedback(container, s);
          s.instructionText.setText(`Error: ${msg}`);
        }

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

      if (sourceIndex >= 0) {
        // Transfer duration proportional to the drop-to-slot distance: a card
        // released next to its slot settles quickly instead of taking the
        // fixed 1500ms market→slot flight (click/AI flows keep 1500ms via the
        // shared default). See computeDragTransferDuration (CG-0MST2LS3E004BTPO).
        const destination = s.getStreetSlotCenter(slotIndex);
        const distancePx = Math.hypot(destination.x - dropSource.x, destination.y - dropSource.y);
        void s.animateTransferFromMarket({
          cardId,
          family: 'business',
          row: 'market',
          slotIndex: sourceIndex,
          source: dropSource,
          destination,
          duration: computeDragTransferDuration(distancePx),
        }).then(afterTransfer);
      } else {
        afterTransfer();
      }
    };

    if (premiumApplies) {
      // Explain dialog before confirming the premium drag (CG-0MT24X0SX007RLHN):
      // proceed → place at premium; cancel → the card returns to the market
      // row (no coins deducted, no action consumed).
      s.showBuyAndPlacePremiumDialog(cardName, startTransfer, () => {
        s.uiPhase = 'market';
        s.instructionText.setText(`"${cardName}" stays in the market — buy cancelled.`);
        try { s.msRenderer?.clearDragHighlights?.(); } catch (_) { /* ignore */ }
        s.refreshAll();
        s.refreshStreetGrid();
        s.refreshActionButtons();
      });
      return;
    }
    startTransfer();
  
}

export function canPickUpUpgradeCard(tcCtx: MainStreetTurnControllerContext, cardId: string): boolean {

    const s = tcCtx.scene;
    if (s.uiPhase !== 'market') return false;
    // Drag-drop is a buy-and-place action — no pickup when the budget is spent.
    if (s.state.actionsRemaining <= 0) return false;
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (!card || card.family !== 'upgrade') return false;

    // The premium is charged up front, and at least one eligible business must
    // exist to drop onto.
    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    if (s.state.resourceBank.coins < premiumCost) return false;
    const hasEligibleTarget = s.state.streetGrid.some((slot: any, index: number) =>
      slot !== null && canBuyAndPlaceUpgrade(s.state, cardId, index).legal);
    if (!hasEligibleTarget) return false;

    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('apply-upgrade' as TutorialActionType);
    if (check && !check.allowed) return false;

    return true;
  
}

export function canDropUpgradeCard(tcCtx: MainStreetTurnControllerContext, cardId: string, slotIndex: number): boolean {

    const s = tcCtx.scene;
    if (s.state.actionsRemaining <= 0) return false;
    if (!canBuyAndPlaceUpgrade(s.state, cardId, slotIndex).legal) return false;

    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('apply-upgrade' as TutorialActionType);
    if (check && !check.allowed) return false;

    return true;
  
}

export function onDragDropUpgrade(tcCtx: MainStreetTurnControllerContext, payload: DragDropPayload): void {

    const s = tcCtx.scene;
    const cardId = payload.data as string;
    const slotIndex = payload.zoneData as number;
    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === cardId);
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (!card || sourceIndex < 0 || slotIndex == null) return;

    // The dragged container follows the pointer, so its position at drop time
    // IS the drop location — capture it before refreshAll() rebuilds the row.
    const dropSource = { x: payload.gameObject?.x ?? 0, y: payload.gameObject?.y ?? 0 };
    const cardName = card.name;

    s.tooltipManager?.hide();
    s.clearMarketSelection();
    s.hiddenTransferSourceCardIds.add(cardId);
    s.uiPhase = 'animating';
    s.instructionText.setText(`Applying "${cardName}"...`);
    s.refreshAll();

    const afterTransfer = (): void => {
      try {
        const cmd = buyAndPlaceUpgradeCommand(s.state, cardId, slotIndex);
        s.undoManager.execute(cmd);
        s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-and-place-upgrade', cardId, slotIndex }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId, slotIndex }); } catch (_) {}
        s.instructionText.setText(`Applied "${cardName}" to slot ${slotIndex} (50% premium)`);
      } catch (e) {
        console.error('[MS] DragBuyAndPlaceUpgrade failed', e);
        const container = s.msRenderer?.getMarketRowCards?.()?.[sourceIndex] ?? s.actionContainer ?? null;
        playIllegalFeedback(container, s);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(cardId);
      s.uiPhase = 'market';
      s.refreshAll();
      s.refreshStreetGrid();
      s.refreshActionButtons();
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('apply-upgrade' as TutorialActionType);
      } catch (_) { /* ignore */ }
    };

    const destination = s.getStreetSlotCenter(slotIndex);
    const distancePx = Math.hypot(destination.x - dropSource.x, destination.y - dropSource.y);
    void s.animateTransferFromMarket({
      cardId,
      family: 'upgrade',
      row: 'market',
      slotIndex: sourceIndex,
      source: dropSource,
      destination,
      duration: computeDragTransferDuration(distancePx),
    }).then(afterTransfer);
  
}
