/**
 * Main Street: Drag-and-Drop Rendering
 *
 * Draggable registration/unregistration and drag-zone highlight visuals.
 *
 * Import graph: depends only on `MainStreetRendererContext` (type).
 *
 * @module
 */

import type { MainStreetRendererContext } from './MainStreetRendererContext';
import { buildUpgradeOverlaySpec } from './UpgradeOverlaySpec';
import type { UpgradeOverlaySpec } from './UpgradeOverlaySpec';
import { isEligibleUpgradeTarget } from '../MainStreetMarketUtils';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec };


// markHudTransient and clearTransientHud are now imported from src/ui/Renderer

export function unregisterDragDraggables(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (!s.dragDropManager) return;
    for (const container of renderer.dragDropRegistered) {
      try { s.dragDropManager.unregisterDraggable(container); } catch (_) { /* ignore */ }
    }
    renderer.dragDropRegistered.clear();
  
}

export function refreshDragDropZones(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (!s.dragDropManager || s.replayMode) return;
    s.dragDropManager.clearDropZones();

    const { slotW, slotH } = s.layout;
    for (const node of renderer.mapNodes()) {
      if (node.gameplayIndex === null) continue;
      const i = node.gameplayIndex;
      const cx = node.localX + slotW / 2;
      const cy = node.localY + slotH / 2;
      const zone = s.add.zone(cx, cy, slotW, slotH).setOrigin(0.5);
      zone.setRectangleDropZone(slotW, slotH);
      s.dragDropManager.registerDropZone({
        zone,
        data: i,
        canAccept: (payload: any) => {
          const cardId = payload.data as string;
          const card = s.state.market.cards.find((c: any) => c.id === cardId);
          if (card?.family === 'upgrade') {
            return s.msTurnController.canDropUpgradeCard(cardId, i);
          }
          // Occupied slots are never valid business drop targets.
          return s.state.streetGrid[i] === null &&
            s.msTurnController.canDropBusinessCard(cardId, i);
        },
      });
      s.streetContainer.add(zone);
    }
  
}

export function showDragHighlights(renderer: MainStreetRendererContext, cardId?: string): void {

    const s = renderer.scene;
    renderer.clearDragHighlights();
    const card = cardId
      ? s.state.market.cards.find((c: any) => c.id === cardId)
      : undefined;
    const isUpgrade = card?.family === 'upgrade';

    const { slotW, slotH } = s.layout;
    for (const node of renderer.mapNodes()) {
      if (node.gameplayIndex === null) continue;
      const i = node.gameplayIndex;
      const occupied = !!s.state.streetGrid[i];
      let validity: 'valid' | 'invalid';
      if (isUpgrade) {
        if (!occupied) continue; // an upgrade can only land on a business
        validity = s.msTurnController.canDropUpgradeCard(card!.id, i) ? 'valid' : 'invalid';
      } else {
        if (occupied) continue; // a business can only land on an empty slot
        validity = 'valid';
      }

      const x = node.localX + slotW / 2;
      const y = node.localY + slotH / 2;
      const hl = s.add.rectangle(x, y, slotW, slotH);
      hl.setStrokeStyle(2, validity === 'valid' ? 0x44ff66 : 0xff4444, 0.8);
      hl.setFillStyle(0x000000, 0);
      hl.setData('slotIndex', i);
      hl.setData('validity', validity);
      s.streetContainer.add(hl);
      renderer.dragHighlightRects.add(hl);
    }
  
}

export function getDragHighlights(renderer: MainStreetRendererContext): Array<{ slotIndex: number; validity: 'valid' | 'invalid' }> {

    const highlights: Array<{ slotIndex: number; validity: 'valid' | 'invalid' }> = [];
    for (const rect of renderer.dragHighlightRects) {
      if (!rect?.active) continue;
      highlights.push({
        slotIndex: rect.getData('slotIndex'),
        validity: rect.getData('validity'),
      });
    }
    return highlights;
  
}

export function clearDragHighlights(renderer: MainStreetRendererContext): void {

    for (const rect of renderer.dragHighlightRects) {
      if (rect?.active) rect.destroy();
    }
    renderer.dragHighlightRects.clear();
  
}

/**
 * Click-targeting highlights for a hand-held upgrade (CG-0MUDA70FK003J8YL).
 *
 * Mirrors {@link showDragHighlights} for the click-to-place flow: it draws a
 * transparent border rectangle on every occupied street slot — green for a
 * business the pending upgrade can legally target, red for one it cannot —
 * and skips empty slots entirely (an upgrade can only land on a business).
 *
 * The eligibility check is business-level only (name + required level + below
 * max level), deliberately excluding affordability and the action budget:
 * those errors are surfaced in the instruction text after a click. It reuses
 * the drag-drop `dragHighlightRects` infrastructure so both targeting flows
 * render identically and are cleared together.
 *
 * @param renderer The renderer context.
 * @param cardId   Id of the pending hand card (must be an upgrade family).
 */
export function showTargetHighlights(renderer: MainStreetRendererContext, cardId: string): void {

    const s = renderer.scene;
    clearDragHighlights(renderer);
    const card = (s.state.hand ?? []).find((c: any) => c.id === cardId);
    if (!card || card.family !== 'upgrade') return;

    const { slotW, slotH } = s.layout;
    for (const node of renderer.mapNodes()) {
      if (node.gameplayIndex === null) continue;
      const i = node.gameplayIndex;
      const biz = s.state.streetGrid[i];
      if (!biz) continue; // an upgrade can only land on a business

      const validity: 'valid' | 'invalid' =
        isEligibleUpgradeTarget(biz, card) ? 'valid' : 'invalid';
      const x = node.localX + slotW / 2;
      const y = node.localY + slotH / 2;
      const hl = s.add.rectangle(x, y, slotW, slotH);
      hl.setStrokeStyle(2, validity === 'valid' ? 0x44ff66 : 0xff4444, 0.8);
      hl.setFillStyle(0x000000, 0);
      hl.setData('slotIndex', i);
      hl.setData('validity', validity);
      s.streetContainer.add(hl);
      renderer.dragHighlightRects.add(hl);
    }
  
}

/**
 * Clears the click-targeting highlight overlays (CG-0MUDA70FK003J8YL). A thin
 * alias of {@link clearDragHighlights} so callers express intent — both flows
 * share the `dragHighlightRects` pool.
 */
export function clearTargetHighlights(renderer: MainStreetRendererContext): void {

    clearDragHighlights(renderer);
  
}
