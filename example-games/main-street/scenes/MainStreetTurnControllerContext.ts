/**
 * Main Street: Turn Controller Context Interface
 *
 * The public surface the controller exposes to its helper modules. Helper
 * modules depend ONLY on this type (never on each other) — hub-and-spoke, no
 * cycles.
 *
 * @module
 */

import type { BusinessCard, EventCard, UpgradeCard, StaffCard } from '../MainStreetCards';
import type { SynergyPair } from '../MainStreetAdjacency';
import type { TurnResult } from '../MainStreetEngine';
import type { DragDropPayload } from '@ui/dragDrop';

export interface MainStreetTurnControllerContext {
  readonly scene: any;
  onSaveCheckpoint: (() => void) | null;
  onGameEnd: (() => void) | null;
  startTurnPhase(skipMarketRefill?: boolean, suppressWeekBanner?: boolean): void;
  endTurn(): void;
  finishTurnPresentation(result: TurnResult, pendingBankingHint: boolean, ): void;
  handleGameOver(result: TurnResult): void;
  presentEventChoiceDialog(): void;
  onEventChoice(option: 'accept' | 'reject'): void;
  onPlayHeldEvent(handIndex?: number): void;
  performUndo(): void;
  performRedo(): void;
  onBusinessCardClick(card: BusinessCard): void;
  initDragDrop(): void;
  canPickUpBusinessCard(cardId: string): boolean;
  canDropBusinessCard(cardId: string, slotIndex: number): boolean;
  onDragDropBusiness(payload: DragDropPayload): void;
  canPickUpUpgradeCard(cardId: string): boolean;
  canDropUpgradeCard(cardId: string, slotIndex: number): boolean;
  onDragDropUpgrade(payload: DragDropPayload): void;
  hasPendingTargeting(): boolean;
  cancelPendingPlacement(): boolean;
  streetPairDims(): { cols: number; rows: number } | undefined;
  onSlotClick(slotIndex: number): void;
  onEventCardClick(card: EventCard): void;
  onRefreshMarketClick(): void;
  onPeekClick(): void;
  onCommunityFavourClick(direction: 'coins-to-rep' | 'rep-to-coins'): void;
  animateMarketDealIn(row: 'market'): void;
  animateMarketSwap(row: 'market', outgoingRow: Array<{ id: string; family: 'business' | 'community-space' | 'event' | 'upgrade' }>, ): void;
  animateNewSynergyPairs(beforePairs: SynergyPair[]): void;
  onUpgradeCardClick(card: UpgradeCard): void;
  onHandUpgradeCardClick(index: number): void;
  applyHandUpgradeToSlot(handIndex: number, slotIndex: number): void;
  onStaffCardClick(card: StaffCard): void;
  onHandBusinessCardClick(index: number): void;
  onHandEventCardClick(index: number): void;
  onDiscardHandCard(handIndex: number | null): void;
  onSellCard(slotIndex: number): void;
}
