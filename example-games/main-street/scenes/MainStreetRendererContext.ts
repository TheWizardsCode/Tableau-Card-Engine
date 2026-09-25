/**
 * Main Street: Renderer Context Interface
 *
 * The public surface the renderer exposes to its helper modules. Helper
 * modules depend ONLY on this type (never on each other) — hub-and-spoke, no
 * cycles.
 *
 * @module
 */

import Phaser from 'phaser';
import type { HandView } from '@ui';
import type { BusinessCard, CommunitySpaceCard, EventCard, UpgradeCard, StaffCard } from '../MainStreetCards';
import type { MapSlotNode, RoadBand } from '../MainStreetMapView';
import type { SceneLayout } from './MainStreetConstants';

export interface MainStreetRendererContext {
  readonly scene: any;
  handView: HandView;
  dragDropRegistered: Set<Phaser.GameObjects.Container>;
  dragHighlightRects: Set<Phaser.GameObjects.Rectangle>;
  marketRowCards: Map<string, Phaser.GameObjects.Container[]>;
  drawnRoadBands: RoadBand[];
  createHeader(): void;
  computeLayout(): SceneLayout;
  createContainers(): void;
  createInstructions(): void;
  refreshAll(): void;
  refreshAllExceptStreet(): void;
  refreshHud(): void;
  refreshChallengeTracker(): void;
  refreshStreetGrid(): void;
  drawStreetRoads(): void;
  drawMapSlot(node: MapSlotNode): void;
  drawRevealedStreetSlot(x: number, y: number): void;
  createStreetPanZone(): void;
  applyStreetCamera(animate: boolean): void;
  installStreetMapMask(): void;
  updateStreetMapMask(): void;
  installStreetZoomControls(): void;
  createZoomButton(
    x: number,
    y: number,
    size: number,
    text: string,
    name: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container;
  updateStreetZoomControls(): void;
  setZoomButtonEnabled(button: Phaser.GameObjects.Container | null, enabled: boolean): void;
  refreshStreetZoomControls(): void;
  drawSynergyLines(): void;
  unregisterDragDraggables(): void;
  refreshDragDropZones(): void;
  mapNodes(): MapSlotNode[];
  getVisibleStreetNodes(): MapSlotNode[];
  getStreetRoadBands(): RoadBand[];
  showDragHighlights(cardId?: string): void;
  getDragHighlights(): Array<{ slotIndex: number; validity: 'valid' | 'invalid' }>;
  clearDragHighlights(): void;
  showTargetHighlights(cardId: string): void;
  clearTargetHighlights(): void;
  drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard | CommunitySpaceCard): void;
  applyUpgradeOverlays(
    container: Phaser.GameObjects.Container,
    biz: BusinessCard | CommunitySpaceCard,
    width: number,
    height: number,
  ): void;
  updateBusinessHandSelection(index: number | null): void;
  drawEmptySlot(x: number, y: number, index: number): void;
  refreshMarket(): void;
  drawMarketRow(
    y: number,
    rowLabel: string,
    rowKey: string,
    cards: readonly (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard) => void,
    alignmentStartX?: number,
  ): void;
  getMarketRowCards(rowKey: 'market'): Phaser.GameObjects.Container[];
  getMarketSlotCenter(
    _rowKey: 'market',
    slotIndex: number,
  ): { x: number; y: number };
  drawMarketCard(
    x: number,
    y: number,
    card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard) => void,
    _rowKey: string,
    _slotIndex: number,
  ): Phaser.GameObjects.Container;
  getFrontIncidentCardCenter(): { x: number; y: number };
  refreshIncidentQueue(): void;
  animateUpcomingEffectLine(
    effect: { sourceEventId: string; description: string },
    rowIndex: number,
  ): Phaser.GameObjects.Text[];
  refreshPlayerHand(): void;
  drawHeldEventCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container;
  refreshActionButtons(): void;
  refreshLog(): void;
  refreshApplicant(): boolean;
}
