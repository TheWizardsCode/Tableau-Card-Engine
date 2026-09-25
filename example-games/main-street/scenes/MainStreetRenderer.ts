/**
 * Main Street: Scene Renderer (thin orchestrator)
 *
 * Thin class: every public render method delegates to a free function in a
 * per-concern helper module (Street / Market / Hud / DragDrop / Layout). The
 * helper modules depend only on `MainStreetRendererContext`, so there are no
 * cycles. State fields and the scene reference live here.
 *
 * @module
 */

import Phaser from 'phaser';
import type { HandView } from '@ui';
import type { BusinessCard, CommunitySpaceCard, EventCard, UpgradeCard, StaffCard } from '../MainStreetCards';
import type { MapSlotNode, RoadBand } from '../MainStreetMapView';
import type { SceneLayout } from './MainStreetConstants';
import type { MainStreetRendererContext } from './MainStreetRendererContext';
import { createContainers, refreshStreetGrid, drawStreetRoads, drawMapSlot, drawRevealedStreetSlot, createStreetPanZone, applyStreetCamera, installStreetMapMask, updateStreetMapMask, installStreetZoomControls, createZoomButton, updateStreetZoomControls, setZoomButtonEnabled, refreshStreetZoomControls, drawSynergyLines, mapNodes, getVisibleStreetNodes, getStreetRoadBands, drawBusinessSlot, applyUpgradeOverlays, updateBusinessHandSelection, drawEmptySlot } from './MainStreetRendererStreet';
import { refreshMarket, drawMarketRow, getMarketRowCards, getMarketSlotCenter, drawMarketCard, getFrontIncidentCardCenter, refreshIncidentQueue } from './MainStreetRendererMarket';
import { createHeader, createInstructions, refreshAll, refreshAllExceptStreet, refreshHud, refreshChallengeTracker, refreshActionButtons, refreshLog, refreshApplicant, animateUpcomingEffectLine } from './MainStreetRendererHud';
import { unregisterDragDraggables, refreshDragDropZones, showDragHighlights, getDragHighlights, clearDragHighlights, showTargetHighlights, clearTargetHighlights } from './MainStreetRendererDragDrop';
import { computeLayout, refreshPlayerHand, drawHeldEventCard } from './MainStreetRendererLayout';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec } from './UpgradeOverlaySpec';
export type { MainStreetRendererContext } from './MainStreetRendererContext';

export class MainStreetRenderer implements MainStreetRendererContext {
  handView!: HandView;
  public dragDropRegistered = new Set<Phaser.GameObjects.Container>();
  public dragHighlightRects = new Set<Phaser.GameObjects.Rectangle>();
  public marketRowCards = new Map<string, Phaser.GameObjects.Container[]>();
  public drawnRoadBands: RoadBand[] = [];

  constructor(public readonly scene: any) {}

  public createHeader(): void {
    createHeader(this);
  }

  public computeLayout(): SceneLayout {
    return computeLayout(this);
  }

  public createContainers(): void {
    createContainers(this);
  }

  public createInstructions(): void {
    createInstructions(this);
  }

  public refreshAll(): void {
    refreshAll(this);
  }

  public refreshAllExceptStreet(): void {
    refreshAllExceptStreet(this);
  }

  public refreshHud(): void {
    refreshHud(this);
  }

  public refreshChallengeTracker(): void {
    refreshChallengeTracker(this);
  }

  public refreshStreetGrid(): void {
    refreshStreetGrid(this);
  }

  public drawStreetRoads(): void {
    drawStreetRoads(this);
  }

  public drawMapSlot(node: MapSlotNode): void {
    drawMapSlot(this, node);
  }

  public drawRevealedStreetSlot(x: number, y: number): void {
    drawRevealedStreetSlot(this, x, y);
  }

  public createStreetPanZone(): void {
    createStreetPanZone(this);
  }

  public applyStreetCamera(animate = false): void {
    applyStreetCamera(this, animate);
  }

  public installStreetMapMask(): void {
    installStreetMapMask(this);
  }

  public updateStreetMapMask(): void {
    updateStreetMapMask(this);
  }

  public installStreetZoomControls(): void {
    installStreetZoomControls(this);
  }

  public createZoomButton(
    x: number,
    y: number,
    size: number,
    text: string,
    name: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    return createZoomButton(this, x, y, size, text, name, onClick);
  }

  public updateStreetZoomControls(): void {
    updateStreetZoomControls(this);
  }

  public setZoomButtonEnabled(button: Phaser.GameObjects.Container | null, enabled: boolean): void {
    setZoomButtonEnabled(this, button, enabled);
  }

  public refreshStreetZoomControls(): void {
    refreshStreetZoomControls(this);
  }

  public drawSynergyLines(): void {
    drawSynergyLines(this);
  }

  public unregisterDragDraggables(): void {
    unregisterDragDraggables(this);
  }

  public refreshDragDropZones(): void {
    refreshDragDropZones(this);
  }

  public mapNodes(): MapSlotNode[] {
    return mapNodes(this);
  }

  public getVisibleStreetNodes(): MapSlotNode[] {
    return getVisibleStreetNodes(this);
  }

  public getStreetRoadBands(): RoadBand[] {
    return getStreetRoadBands(this);
  }

  public showDragHighlights(cardId?: string): void {
    showDragHighlights(this, cardId);
  }

  public getDragHighlights(): Array<{ slotIndex: number; validity: 'valid' | 'invalid' }> {
    return getDragHighlights(this);
  }

  public clearDragHighlights(): void {
    clearDragHighlights(this);
  }

  public showTargetHighlights(cardId: string): void {
    showTargetHighlights(this, cardId);
  }

  public clearTargetHighlights(): void {
    clearTargetHighlights(this);
  }

  public drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard | CommunitySpaceCard): void {
    drawBusinessSlot(this, x, y, _index, biz);
  }

  public applyUpgradeOverlays(
    container: Phaser.GameObjects.Container,
    biz: BusinessCard | CommunitySpaceCard,
    width: number,
    height: number,
  ): void {
    applyUpgradeOverlays(this, container, biz, width, height);
  }

  public updateBusinessHandSelection(index: number | null): void {
    updateBusinessHandSelection(this, index);
  }

  public drawEmptySlot(x: number, y: number, index: number): void {
    drawEmptySlot(this, x, y, index);
  }

  public refreshMarket(): void {
    refreshMarket(this);
  }

  public drawMarketRow(
    y: number,
    rowLabel: string,
    rowKey: string,
    cards: readonly (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard) => void,
    alignmentStartX?: number,
  ): void {
    drawMarketRow(this, y, rowLabel, rowKey, cards, maxSlots, onClick, alignmentStartX);
  }

  public getMarketRowCards(rowKey: 'market'): Phaser.GameObjects.Container[] {
    return getMarketRowCards(this, rowKey);
  }

  public getMarketSlotCenter(
    _rowKey: 'market',
    slotIndex: number,
  ): { x: number; y: number } {
    return getMarketSlotCenter(this, _rowKey, slotIndex);
  }

  public drawMarketCard(
    x: number,
    y: number,
    card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard) => void,
    _rowKey: string,
    _slotIndex: number,
  ): Phaser.GameObjects.Container {
    return drawMarketCard(this, x, y, card, onClick, _rowKey, _slotIndex);
  }

  public getFrontIncidentCardCenter(): { x: number; y: number } {
    return getFrontIncidentCardCenter(this);
  }

  public refreshIncidentQueue(): void {
    refreshIncidentQueue(this);
  }

  public animateUpcomingEffectLine(
    effect: { sourceEventId: string; description: string },
    rowIndex: number,
  ): Phaser.GameObjects.Text[] {
    return animateUpcomingEffectLine(this, effect, rowIndex);
  }

  public refreshPlayerHand(): void {
    refreshPlayerHand(this);
  }

  public drawHeldEventCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    return drawHeldEventCard(this, x, y, card);
  }

  public refreshActionButtons(): void {
    refreshActionButtons(this);
  }

  public refreshLog(): void {
    refreshLog(this);
  }

  public refreshApplicant(): boolean {
    return refreshApplicant(this);
  }
}
