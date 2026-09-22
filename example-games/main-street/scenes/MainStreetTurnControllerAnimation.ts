/**
 * Main Street: Controller Animations
 *
 * Market deal-in, market swap, and new-synergy-pair animations.
 *
 * @module
 */

import { computeSynergyPairs, diffNewSynergyPairs } from '../MainStreetAdjacency';
import type { SynergyPair } from '../MainStreetAdjacency';
import type { MainStreetTurnControllerContext } from './MainStreetTurnControllerContext';

export function animateMarketDealIn(tcCtx: MainStreetTurnControllerContext, row: 'market'): void {

    const s = tcCtx.scene;
    try {
      s.msAnimator.animateMarketDealIn({
        row,
        cards: s.msRenderer.getMarketRowCards(row),
      });
    } catch (_) {
      // presentation-only — ignore
    }
  
}

export function animateMarketSwap(tcCtx: MainStreetTurnControllerContext, 
    row: 'market',
    outgoingRow: Array<{ id: string; family: 'business' | 'community-space' | 'event' | 'upgrade' }>,
  ): void {

    const s = tcCtx.scene;
    try {
      s.msAnimator.animateMarketDealIn({
        row,
        cards: s.msRenderer.getMarketRowCards(row),
        outgoing: outgoingRow.map((card, i) => ({
          cardId: card.id,
          family: card.family,
          ...s.msRenderer.getMarketSlotCenter(row, i),
        })),
      });
    } catch (_) {
      // presentation-only — ignore
    }
  
}

export function animateNewSynergyPairs(tcCtx: MainStreetTurnControllerContext, beforePairs: SynergyPair[]): void {

    const s = tcCtx.scene;
    try {
      const afterPairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? [], tcCtx.streetPairDims());
      for (const pair of diffNewSynergyPairs(beforePairs, afterPairs)) {
        s.msAnimator.animateSynergyFormation(pair);
      }
    } catch (_) {
      // presentation-only — ignore
    }
  
}
