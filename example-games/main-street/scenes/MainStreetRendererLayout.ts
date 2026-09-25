/**
 * Main Street: Layout and Hand Rendering
 *
 * Scene layout computation, player hand rendering, and held-event card.
 *
 * Import graph: depends only on `MainStreetRendererContext` (type).
 *
 * @module
 */

import { mainStreetRenderCardSvg } from '@ui/Renderer/adapters/MainStreetAdapter';
import type { EventCard } from '../MainStreetCards';
import { buildCardTooltipInfo } from '../MainStreetFormatting';
import type { SceneLayout } from './MainStreetConstants';
import { computeMainStreetLayoutWithSll } from './MainStreetLayoutAdapter';
import type { MainStreetRendererContext } from './MainStreetRendererContext';
import { buildUpgradeOverlaySpec } from './UpgradeOverlaySpec';
import type { UpgradeOverlaySpec } from './UpgradeOverlaySpec';
import Phaser from 'phaser';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec };


// markHudTransient and clearTransientHud are now imported from src/ui/Renderer

export function computeLayout(_renderer: MainStreetRendererContext): SceneLayout {

    return computeMainStreetLayoutWithSll();
  
}

export function refreshPlayerHand(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    // handContainer zone kept for backward-compat (zone-metadata tests)
    s.handContainer.removeAll(true);

    // Render the merged hand (any mix of business and event cards) via the
    // single HandView — HandView gracefully handles an empty array.
    const hand = s.state.hand ?? [];
    // Keep ghost capacity outlines in sync with current maxHandSize
    // (staff cards change it at runtime — outlines must track it).
    const maxSize = Math.max(0, s.state?.maxHandSize ?? hand.length);
    renderer.handView.setMaxSlots(maxSize);
    renderer.handView.setCards(hand);

    // Transfer-animation hiding is handled in the hand renderCard callback
    // via hiddenTransferSourceCardIds (see above) — the old alpha=0 branch
    // here was dead code: pendingHandIndex is nulled before refreshAll() in
    // onSlotClick, so uiPhase==='animating' && pendingHandIndex!==null never
    // held (CG-0MSOKUOUE005LQFZ audit AC3).

    // Restore selection highlight when in placing-from-hand phase
    if (s.uiPhase === 'placing-from-hand' && s.pendingHandIndex !== null) {
      renderer.updateBusinessHandSelection(s.pendingHandIndex);
    }
  
}

export function drawHeldEventCard(renderer: MainStreetRendererContext, 
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {

    const s = renderer.scene;
    const { handCardW, handCardH } = s.layout;
    const container = s.add.container(Math.round(x + handCardW / 2), Math.round(y + handCardH / 2));
    const renderW = Math.max(1, Math.round(handCardW - 4));
    const renderH = Math.max(1, Math.round(handCardH - 4));

    // Render card via shared adapter
    mainStreetRenderCardSvg(s, container, card.id, renderW, renderH);

    if (!s.replayMode) {
      const hover = s.add.rectangle(0, 0, handCardW, handCardH, 0x000000, 0.001);
      hover.setInteractive({ useHandCursor: s.uiPhase === 'market' });
      hover.on('pointerover', () => {
        const info = buildCardTooltipInfo(card, s.state.config);
        s.tooltipManager?.show(info, container.x, container.y);
      });
      hover.on('pointerout', () => s.tooltipManager?.hide());
      if (s.uiPhase === 'market') {
        hover.on('pointerdown', () => s.onPlayHeldEvent());
      }
      container.add(hover);
    }

    return container;
  
}
