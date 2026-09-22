/**
 * Main Street: Animator Shared Helpers
 *
 * Timing accessors, grid/geometry lookups, and small shared helpers used by
 * the other animator modules.
 *
 * Import graph: depends only on `MainStreetAnimatorContext` (type) + timing.
 *
 * @module
 */

import Phaser from 'phaser';
import { FONT_FAMILY, popTextOrIcon } from '../../../src/ui';
import type { SlotPhaseBreakdown } from '../MainStreetAdjacency';
import { computeSynergyPairs } from '../MainStreetAdjacency';
import { synergyLineEndpoints } from './synergyLineEndpoints';
import { playableIndexToMapCenter } from '../MainStreetMapView';
import { INCOME_BASE_CARD_DELAY_MS, INCOME_CARD_COIN_MIN_STAGGER_MS, INCOME_CARD_COIN_STAGGER_MS, INCOME_CARD_DELAY_DECREMENT_MS, INCOME_CARD_STAGGER_REDUCTION, INCOME_FLIGHT_BASE_MS, INCOME_FLIGHT_DECREMENT_MS, INCOME_FLIGHT_MIN_MS, INCOME_MIN_CARD_DELAY_MS } from './MainStreetAnimatorTiming';
import type { MainStreetAnimatorContext } from './MainStreetAnimatorContext';


export function resetCoinStaggerForTurn(animator: MainStreetAnimatorContext): void {

    animator.currentCoinStagger = INCOME_CARD_COIN_STAGGER_MS;
  
}

export function reduceCoinStaggerAfterCard(animator: MainStreetAnimatorContext): void {

    animator.currentCoinStagger = Math.max(
      INCOME_CARD_COIN_MIN_STAGGER_MS,
      Math.round(animator.currentCoinStagger * INCOME_CARD_STAGGER_REDUCTION),
    );
  
}

export function getCardDelay(_animator: MainStreetAnimatorContext, numSlots: number, si: number): number {

    if (numSlots <= 1) return INCOME_BASE_CARD_DELAY_MS;
    const raw = INCOME_BASE_CARD_DELAY_MS - si * INCOME_CARD_DELAY_DECREMENT_MS;
    return Math.max(INCOME_MIN_CARD_DELAY_MS, raw);
  
}

export function getFlightDuration(_animator: MainStreetAnimatorContext, numSlots: number, si: number): number {

    if (numSlots <= 1) return INCOME_FLIGHT_BASE_MS;
    const raw = INCOME_FLIGHT_BASE_MS - si * INCOME_FLIGHT_DECREMENT_MS;
    return Math.max(INCOME_FLIGHT_MIN_MS, raw);
  
}

export function getIconStagger(animator: MainStreetAnimatorContext, numIcons: number, i: number): number {

    if (numIcons <= 1) return animator.currentCoinStagger;
    const raw = animator.currentCoinStagger - i * 10;
    return Math.max(INCOME_CARD_COIN_MIN_STAGGER_MS, raw);
  
}

export function eventSourcePoint(animator: MainStreetAnimatorContext): { x: number; y: number } {

    const s = animator.scene;
    return { x: s.layout.logX + 40, y: s.layout.queueTop + 26 };
  
}

export function synergyPhaseSources(animator: MainStreetAnimatorContext): Map<number | 'fallback', { x: number; y: number }> {

    const s = animator.scene;
    const sources = new Map<number | 'fallback', { x: number; y: number }>();
    try {
      const pairs = computeSynergyPairs(s.state.streetGrid ?? [], s.state.soldSlots ?? [],
        s.streetPlayableLattice && (s.streetPlayableLattice.cols > 1 || s.streetPlayableLattice.rows > 1)
          ? s.streetPlayableLattice
          : undefined);
      for (const pair of pairs) {
        const { mid } = synergyLineEndpoints(pair, s.layout, {
          from: animator.localSlotCentre(pair.fromIndex),
          to: animator.localSlotCentre(pair.toIndex),
        });
        if (!sources.has(pair.fromIndex)) sources.set(pair.fromIndex, mid);
        if (!sources.has(pair.toIndex)) sources.set(pair.toIndex, mid);
      }
    } catch { /* ignore */ }
    sources.set('fallback', { x: s.layout.gameW * 0.5, y: Math.max(24, s.layout.streetTop + 6) });
    return sources;
  
}

export function popSynergyText(animator: MainStreetAnimatorContext, at: { x: number; y: number }, _color: number): void {

    const s = animator.scene;
    const text = s.add.text(at.x, at.y - 10, 'Synergy!', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(500);
    void popTextOrIcon({
      scene: s,
      target: text,
      duration: 1200,
      riseY: 26,
      scale: 1.3,
      reducedMotion: s.settingsPanel?.reducedMotion === true,
    });
  
}

export function findStreetCardContainer(animator: MainStreetAnimatorContext, slotIndex: number): Phaser.GameObjects.Container | null {

    const s = animator.scene;
    for (const obj of s.streetContainer?.list ?? []) {
      const candidate = obj as { getData?: (key: string) => unknown };
      if (candidate.getData?.('streetSlotIndex') === slotIndex) {
        return obj as Phaser.GameObjects.Container;
      }
    }
    return null;
  
}

export function localSlotCentre(animator: MainStreetAnimatorContext, slotIndex: number): { x: number; y: number } {

    const s = animator.scene;
    const lattice = s.streetViewLattice ?? { cols: 1, rows: 1 };
    const playable = s.streetPlayableLattice ?? { cols: 1, rows: 1 };
    return playableIndexToMapCenter(slotIndex, s.layout, lattice, playable);
  
}

export function getStreetSlotCenter(animator: MainStreetAnimatorContext, slotIndex: number): { x: number; y: number } {

    const s = animator.scene;
    // Camera-aware (CG-0MTH9OVMC001V44E) and world-index aware
    // (CG-0MTH9OW0H0005VKE): the playable board occupies the playable
    // sub-lattice of the displayed map, so a world slot index resolves to the
    // right cell even after the board is expanded. At 1× on a 1×1 board this
    // is identical to the legacy layout maths.
    if (typeof s.streetLocalToScreen === 'function' && s.layout) {
      const local = animator.localSlotCentre(slotIndex);
      return s.streetLocalToScreen(local);
    }
    const col = slotIndex % s.layout.streetCols;
    const row = Math.floor(slotIndex / s.layout.streetCols);
    const x = s.layout.streetX + col * (s.layout.slotW + s.layout.slotGap) + s.layout.slotW / 2;
    const y = s.layout.streetTop + row * (s.layout.slotH + s.layout.streetRowGap) + s.layout.slotH / 2;
    return { x, y };
  
}

export function getMarketCardCenter(animator: MainStreetAnimatorContext, _row: 'market', slotIndex: number): { x: number; y: number } | null {

    const s = animator.scene;
    if (slotIndex < 0) return null;
    const rowTop = s.layout.marketTop + 6;
    const cardX = s.layout.marketLabelW + 50 + slotIndex * (s.layout.marketCardW + s.layout.marketCardGap);
    return {
      x: cardX + s.layout.marketCardW / 2,
      y: rowTop + s.layout.marketCardH / 2,
    };
  
}

export function getHandCardCenter(animator: MainStreetAnimatorContext): { x: number; y: number } {

    const s = animator.scene;
    return {
      x: s.layout.handX + s.layout.handCardW / 2,
      y: s.layout.handY + s.layout.handCardH / 2,
    };
  
}

export function creditedIncomeTotal(_animator: MainStreetAnimatorContext, phaseData: SlotPhaseBreakdown[]): number {

    let sum = 0;
    for (const pd of phaseData) {
      sum += pd.baseIncome + pd.synergyBonus + pd.repBonus;
      for (const d of pd.eventDeltas ?? []) sum += d.delta;
      for (const d of pd.upcomingDeltas ?? []) sum += d.delta;
    }
    return Math.round(Math.max(0, sum));
  
}
