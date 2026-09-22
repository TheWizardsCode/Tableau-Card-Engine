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
