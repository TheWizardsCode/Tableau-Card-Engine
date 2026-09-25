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
import { FONT_FAMILY, popTextOrIcon } from '@ui';
import type { SlotPhaseBreakdown } from '../MainStreetAdjacency';
import { computeSynergyPairs } from '../MainStreetAdjacency';
import { synergyLineEndpoints } from './synergyLineEndpoints';
import { playableIndexToMapCenter } from '../MainStreetMapView';
import { INCOME_BASE_CARD_DELAY_MS, INCOME_CARD_COIN_MIN_STAGGER_MS, INCOME_CARD_COIN_STAGGER_MS, INCOME_CARD_DELAY_DECREMENT_MS, INCOME_CARD_STAGGER_REDUCTION, INCOME_FLIGHT_BASE_MS, INCOME_FLIGHT_DECREMENT_MS, INCOME_FLIGHT_MIN_MS, INCOME_MIN_CARD_DELAY_MS } from './MainStreetAnimatorTiming';
import type { IncomePhaseSlot, MainStreetAnimatorContext, SynergyPhaseFlight } from './MainStreetAnimatorContext';


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

/**
 * Distributes a receiver slot's synergy coin bonus across its matching
 * (different-type, shared-synergy) neighbours so the shares sum EXACTLY to the
 * rounded total (CG-0MTV6LZEA003YS3E).
 *
 * `computeSynergyBonus` rounds once over `N` neighbours (`roundInt(unit * N)`),
 * so splitting the already-rounded slot total evenly and assigning the
 * remainder to the lowest slot indices keeps the sum preserved — the
 * attribution risk mitigation from the work item.
 *
 * Pure and exported for unit testing.
 */
export function attributeSynergyShares(
  synergyBonus: number,
  giverIndices: number[],
): Map<number, number> {
  const shares = new Map<number, number>();
  const unique = [...new Set(giverIndices)].sort((a, b) => a - b);
  const n = unique.length;
  if (n === 0) return shares;
  const amount = Math.max(0, Math.round(synergyBonus));
  if (amount <= 0) {
    for (const giver of unique) shares.set(giver, 0);
    return shares;
  }
  const base = Math.floor(amount / n);
  const remainder = amount % n;
  unique.forEach((giver, i) => shares.set(giver, base + (i < remainder ? 1 : 0)));
  return shares;
}

/**
 * Builds the bidirectional synergy-line coin flights for the `synergy` income
 * phase (CG-0MTV6LZEA003YS3E).
 *
 * For every synergy pair (`computeSynergyPairs`, 8-way Chebyshev incl.
 * extended range) BOTH directions are emitted — `fromIndex` -> `toIndex` and
 * `toIndex` -> `fromIndex` — using the SAME clipped `p1`/`p2` geometry as the
 * static synergy lines (`synergyLineEndpoints`), so animated lines never drift
 * from the rendered ones.
 *
 * Each direction carries the RECEIVER's synergy amount attributable to the
 * giver: the receiver's `SlotPhaseBreakdown.synergyBonus` is split across its
 * matching neighbours (`attributeSynergyShares`), so a receiver with two
 * synergistic neighbours shows one stream per line and the streams sum to the
 * credited bonus.
 */
export function synergyPhaseFlights(animator: MainStreetAnimatorContext, slots: IncomePhaseSlot[]): SynergyPhaseFlight[] {

    const s = animator.scene;
    const flights: SynergyPhaseFlight[] = [];
    try {
      const playable = s.streetPlayableLattice ?? { cols: 1, rows: 1 };
      const gridDims = playable.cols === 1 && playable.rows === 1 ? undefined : playable;
      const pairs = computeSynergyPairs(s.state.streetGrid ?? [], s.state.soldSlots ?? [], gridDims);

      const slotByIndex = new Map<number, IncomePhaseSlot>();
      for (const slot of slots) slotByIndex.set(slot.pd.slotIndex, slot);

      // Incident matching neighbours per receiver (one pair per neighbour).
      const giversByReceiver = new Map<number, number[]>();
      for (const pair of pairs) {
        const toGivers = giversByReceiver.get(pair.toIndex) ?? [];
        toGivers.push(pair.fromIndex);
        giversByReceiver.set(pair.toIndex, toGivers);

        const fromGivers = giversByReceiver.get(pair.fromIndex) ?? [];
        fromGivers.push(pair.toIndex);
        giversByReceiver.set(pair.fromIndex, fromGivers);
      }

      for (const pair of pairs) {
        const { p1, p2 } = synergyLineEndpoints(pair, s.layout, {
          from: animator.localSlotCentre(pair.fromIndex),
          to: animator.localSlotCentre(pair.toIndex),
        });

        // Direction pair.fromIndex (giver) -> pair.toIndex (receiver).
        const toSlot = slotByIndex.get(pair.toIndex);
        if (toSlot) {
          const share = attributeSynergyShares(
            toSlot.pd.synergyBonus,
            giversByReceiver.get(pair.toIndex) ?? [],
          ).get(pair.fromIndex) ?? 0;
          if (share > 0) {
            flights.push({
              fromSlotIndex: pair.fromIndex,
              toSlotIndex: pair.toIndex,
              slot: toSlot,
              start: p1,
              end: p2,
              amount: share,
            });
          }
        }

        // Direction pair.toIndex (giver) -> pair.fromIndex (receiver).
        const fromSlot = slotByIndex.get(pair.fromIndex);
        if (fromSlot) {
          const share = attributeSynergyShares(
            fromSlot.pd.synergyBonus,
            giversByReceiver.get(pair.fromIndex) ?? [],
          ).get(pair.toIndex) ?? 0;
          if (share > 0) {
            flights.push({
              fromSlotIndex: pair.toIndex,
              toSlotIndex: pair.fromIndex,
              slot: fromSlot,
              start: p2,
              end: p1,
              amount: share,
            });
          }
        }
      }
    } catch { /* presentation-only — never break the choreography */ }
    return flights;
  
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
