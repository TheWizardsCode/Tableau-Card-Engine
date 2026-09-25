/**
 * Main Street: Street / Grid Rendering
 *
 * Containers, street grid, roads, map slots, camera/mask, zoom controls,
 * synergy lines, business slots, upgrade overlays, and empty slots.
 *
 * Import graph: depends only on `MainStreetRendererContext` (type).
 *
 * @module
 */

import { FONT_FAMILY, HandView } from '@ui';
import { mainStreetRenderCardSvg } from '@ui/Renderer/adapters/MainStreetAdapter';
import { computeSynergyPairs } from '../MainStreetAdjacency';
import type { BusinessCard, CommunitySpaceCard, StaffCard } from '../MainStreetCards';
import { synergyColor } from '../MainStreetCards';
import { buildCardTooltipInfo, formatEmployedStaffSummary, formatSynergyRate } from '../MainStreetFormatting';
import type { MapSlotNode, RoadBand } from '../MainStreetMapView';
import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, containerTransform, mapRoadBands, streetViewportRect, visibleMapSlots, zoomScale } from '../MainStreetMapView';
import { BOX_STROKE, LOG_TITLE_H, ROAD_COLOUR, ROAD_DASH_LENGTH, ROAD_DASH_PERIOD, ROAD_MARKING_COLOUR, ROAD_MARKING_WIDTH, ZOOM_ANIMATION_MS } from './MainStreetConstants';
import type { MainStreetRendererContext } from './MainStreetRendererContext';
import { buildUpgradeOverlaySpec } from './UpgradeOverlaySpec';
import type { UpgradeOverlaySpec } from './UpgradeOverlaySpec';
import { synergyLineEndpoints } from './synergyLineEndpoints';
import { createGameZone } from '@ui/Renderer';
import Phaser from 'phaser';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec };


// markHudTransient and clearTransientHud are now imported from src/ui/Renderer

export function createContainers(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    s.hudContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'hudContainer');
    // Ensure HUD container renders above gameplay containers by default.
    try { s.hudContainer.setDepth(1000); } catch (_) { /* ignore in tests */ }

    // Persistent overlay container that is not rebuilt each refresh. This
    // should hold help/settings buttons and panel input blockers so they
    // are not removed by hudContainer.removeAll(true).
    // Use the existing hudContainer as the overlay root so persistent overlay
    // elements are not removed during hudContainer.removeAll(true). This keeps
    // parenting stable and ensures tests that expect hudContainer as the
    // parent still pass.
    try {
      (s as any).hudOverlayContainer = s.hudContainer;
    } catch (_) { (s as any).hudOverlayContainer = undefined; }

    s.streetContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'streetContainer');
    s.marketContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'marketContainer');
    s.incidentQueueContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'incidentQueueContainer');
    s.handContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'handContainer');

    // Create the merged HandView for the player's hand. Both business and
    // event cards render in one horizontal row (centred on handCenterX).
    const { handX, handY, handCardW, handCardH, handCenterX } = s.layout;
    renderer.handView = new HandView(s, {
      baseX: handX + handCardW / 2,
      baseY: handY,
      centerX: handCenterX,
      spacing: handCardW + 8,
      cardWidth: handCardW - 4,
      cardHeight: handCardH - 4,
      showLabels: false,
      selectionEnabled: false,
      clickEnabled: true,
      renderCard: (_card, cardIndex) => {
        const card = _card as any;
        const container = s.add.container(0, 0);
        const renderW = Math.max(1, Math.round(handCardW - 4));
        const renderH = Math.max(1, Math.round(handCardH - 4));

        // Transfer-animation hiding (AC 3): while a card is flying from the
        // hand (hand → street placement), render an empty placeholder
        // instead of the card face so the player never sees a duplicate
        // card, and the hand layout doesn't shift. Mirrors the
        // market-renderer pattern (hiddenTransferSourceCardIds check).
        if (s.hiddenTransferSourceCardIds.has(card.id)) {
          const placeholder = s.add.rectangle(
            0, 0, renderW, renderH, 0x222211, 0.3,
          );
          placeholder.setStrokeStyle(1, 0x333322);
          container.add(placeholder);
          return container;
        }

        // Render SVG card via shared adapter. Hand business cards are never
        // upgraded (upgrades target street businesses), so displayName is
        // always undefined here; passing it keeps the street renderer the
        // single display-name-aware site (CG-0MT24MHGZ0025O20).
        mainStreetRenderCardSvg(s, container, card.id, renderW, renderH, card.displayName);

        if (card.family === 'event') {
          // ── Event card path: tooltip + play-event click (market phase only) ──
          if (!s.replayMode) {
            const hover = s.add.rectangle(0, 0, handCardW, handCardH, 0x000000, 0.001);
            hover.setInteractive({ useHandCursor: s.uiPhase === 'market' });
            hover.on('pointerover', () => {
              const info = buildCardTooltipInfo(card, s.state.config);
              s.tooltipManager?.show(info, container.x, container.y);
            });
            hover.on('pointerout', () => s.tooltipManager?.hide());
            if (s.uiPhase === 'market' || s.uiPhase === 'event-selected') {
              // Select-then-act (CG-0MUEQ1BF000770B3): clicking a held event
              // selects it and offers [Play] / [Discard] in the action bar,
              // rather than playing immediately. Preserves the one-click
              // play path via the [Play] button.
              hover.on('pointerdown', () => s.onHandEventCardClick(cardIndex));
            }
            container.add(hover);
          }
        } else if (card.family === 'upgrade') {
          // ── Upgrade card path (CG-0MT3IYSRL001VVUP): hand-first targeting.
          // Clicking the upgrade in hand starts 'placing-from-hand' — the
          // player then clicks the business to upgrade.
          if (!s.replayMode) {
            const hover = s.add.rectangle(0, 0, handCardW, handCardH, 0x000000, 0.001);
            hover.setInteractive({ useHandCursor: true });
            hover.on('pointerover', () => {
              const info = buildCardTooltipInfo(card, s.state.config);
              s.tooltipManager?.show(info, container.x, container.y);
            });
            hover.on('pointerout', () => s.tooltipManager?.hide());
            hover.on('pointerdown', () => {
              s.onHandUpgradeCardClick(cardIndex);
            });
            container.add(hover);
          }
        } else {
          // ── Business card path: upgrade overlays, tooltip, + placement click ──
          renderer.applyUpgradeOverlays(container, card, renderW, renderH);

          if (!s.replayMode) {
            // Single interactive rectangle (mirrors the event card path):
            // hover shows the full card tooltip, click-to-place starts the
            // placing-from-hand flow. Hand tooltips use the default
            // includeEventDetail: false (no coin/rep detail lines).
            const hover = s.add.rectangle(0, 0, handCardW, handCardH, 0x000000, 0.001);
            hover.setInteractive({ useHandCursor: true });
            hover.on('pointerover', () => {
              const info = buildCardTooltipInfo(card, s.state.config);
              s.tooltipManager?.show(info, container.x, container.y);
            });
            hover.on('pointerout', () => s.tooltipManager?.hide());
            hover.on('pointerdown', () => {
              s.onHandBusinessCardClick(cardIndex);
            });
            container.add(hover);
          }
        }

        return container;
      },
      customClickFn: (cardIndex: number) => {
        const card = s.state.hand?.[cardIndex];
        // Event cards are played (via onPlayHeldEvent) and upgrade cards are
        // applied to a business (onHandUpgradeCardClick) — neither is placed
        // on the street, so ignore HandView-level clicks on them here.
        if (card && (card.family === 'event' || card.family === 'upgrade')) return;
        // Allow selecting a different business card in the hand during placement
        if (s.uiPhase === 'placing-from-hand') {
          s.pendingHandIndex = cardIndex;
          renderer.updateBusinessHandSelection(cardIndex);
          const cardName = s.state.hand?.[cardIndex]?.name ?? 'card';
          s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
        }
      },
      // Ghost capacity outlines (CG-0MT6ER7YY003G680): show one slot per
      // maxHandSize so the player always sees remaining hand capacity.
      showPositionOutlines: true,
      maxSlots: s.state?.maxHandSize ?? 3,
    });

    s.actionContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'actionContainer');
    // Action buttons must render above hand cards for visibility.
    try { s.actionContainer.setDepth(100); } catch (_) { /* ignore in tests */ }

    // Ensure depth ordering is applied after container creation.
    try { s.children?.depthSort?.(); } catch (_) { /* ignore */ }

    // Challenge Tracker panel
    s.challengeContainer = createGameZone(
      s,
      s.layout.challengeX,
      s.layout.challengeY,
      s.layout.challengeW,
      0,
      'challengeContainer',
    );

    // Activity Log panel (persistent, not rebuilt each refresh)
    s.logContainer = createGameZone(
      s,
      s.layout.logX,
      s.layout.logY,
      s.layout.logW,
      s.layout.logH,
      'logContainer',
    );

    // Panel background
    const bg = s.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, s.layout.logW, s.layout.logH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, s.layout.logW, s.layout.logH, 4);
    s.logContainer.add(bg);

    // Title bar
    const titleBg = s.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, s.layout.logW, LOG_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    s.logContainer.add(titleBg);

    const titleText = s.add.text(s.layout.logW / 2, LOG_TITLE_H / 2, 'Activity Log', {
      fontSize: '12px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    s.logContainer.add(titleText);

    // Scrollable content container
    s.logContentContainer = s.add.container(0, LOG_TITLE_H + 2);
    s.logContainer.add(s.logContentContainer);

    // Geometry mask for clipping scrollable content
    // IMPORTANT: Do NOT call setVisible(false) on the mask graphics!
    // In Phaser 4 RC7, GeometryMask.preRenderCanvas calls
    // graphics.renderCanvas() directly to draw the clip path to the
    // canvas context. If the graphics is invisible, the Canvas Renderer's
    // SetTransform function may still process it (it checks alpha, not
    // visibility), but some internal paths skip invisible objects entirely.
    // To be safe, we keep the graphics visible and use alpha=0 instead,
    // so the mask shape is drawn to the context for clipping but has no
    // visible appearance on screen.
    s.logMaskGraphics = s.add.graphics();
    s.logMaskGraphics.fillStyle(0xffffff, 0);  // transparent fill
    s.logContentMask = new Phaser.Display.Masks.GeometryMask(s, s.logMaskGraphics);
    s.logContentContainer.setMask(s.logContentMask);
    s.updateLogMask();

    // Mouse-wheel scroll for the log panel
    s.input.off('wheel', s.handleLogWheel, s);
    s.input.on('wheel', s.handleLogWheel, s);
  
}

export function refreshStreetGrid(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    s.ensureStreetCamera?.();
    s.streetContainer.removeAll(true);

    const { gameW, streetTop } = s.layout;

    // ── Street-map camera (CG-0MTH9OVMC001V44E) ──
    // Render every slot of every street cell inside the viewport, de-duplicating
    // the streets (each street owns its own plots; roads are drawn between
    // them). At zoom level 1 on the default 1×1 lattice this yields exactly the
    // legacy 10 slots in legacy positions, so the pre-camera framing is
    // preserved bit-for-bit. Slots of the playable lattice carry a world
    // gameplay index (CG-0MTH9OW0H0005VKE), so expanded streets are placeable.
    const nodes = renderer.mapNodes();

    // Section label
    const label = s.add.text(gameW / 2, streetTop - 16, '', {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9966', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    s.streetContainer.add(label);

    // Roads first: the city-block grid reads as rows and columns of streets
    // separated by grey roads with a dashed white centre line
    // (CG-0MT5Y1X5T001M4S6). Drawn before the plots so slots stay on top.
    renderer.drawStreetRoads();

    // Idle backdrop: an interactive zone covering the street viewport. It is
    // added first (and is only interactive while zoomed out), so Phaser's
    // topOnly input delivers slot clicks to the slots themselves.
    renderer.createStreetPanZone();

    // Register drag-drop drop zones BEFORE drawing slot rectangles. Phaser's
    // input system uses topOnly by default, meaning pointer events are delivered
    // only to the top-most hit object (the one with the highest render-list
    // index). By registering zones first, then drawing slot rects afterward,
    // the clickable slot rectangles end up on top and receive pointer events
    // (click-to-place), while drag-drop hit testing still works because the
    // drop zones are collected from all interactive objects regardless of
    // render order.
    renderer.refreshDragDropZones();

    for (const node of nodes) {
      renderer.drawMapSlot(node);
    }

    // Draw synergy lines between adjacent synergistic businesses
    renderer.drawSynergyLines();

    // Re-clip the layer to the (possibly re-computed) street band, re-apply the
    // camera transform, and keep the always-available zoom controls in sync.
    renderer.updateStreetMapMask();
    renderer.applyStreetCamera(false);
    renderer.updateStreetZoomControls();

    // Upgrade click-targeting highlights (CG-0MUDA70FK003J8YL): the street
    // container was just rebuilt, destroying any prior overlays, so re-create
    // the eligible/ineligible business highlights whenever an upgrade is
    // pending from the hand. Hooking the rebuild (rather than the selection
    // handler) covers both the initial selection and every refreshAll().
    const pendingIdx = s.pendingHandIndex;
    const pendingCard = pendingIdx !== null ? s.state.hand?.[pendingIdx] : undefined;
    if (s.uiPhase === 'placing-from-hand' && pendingCard?.family === 'upgrade') {
      renderer.showTargetHighlights(pendingCard.id);
    }
  
}

export function drawStreetRoads(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    const lattice = s.getStreetViewLattice?.() ?? { cols: 1, rows: 1 };
    const bands: RoadBand[] = mapRoadBands(s.layout, lattice);
    renderer.drawnRoadBands = bands;
    if (bands.length === 0) return;

    const road = s.add.graphics();
    road.setName('ms-street-roads');

    // Grey road surface.
    road.fillStyle(ROAD_COLOUR, 1);
    for (const band of bands) {
      road.fillRect(band.x, band.y, band.w, band.h);
    }

    // Dashed white centre line down each road's middle.
    road.lineStyle(ROAD_MARKING_WIDTH, ROAD_MARKING_COLOUR, 1);
    for (const band of bands) {
      if (band.orientation === 'vertical') {
        const cx = band.x + band.w / 2;
        for (let y = band.y; y < band.y + band.h; y += ROAD_DASH_PERIOD) {
          road.lineBetween(cx, y, cx, Math.min(y + ROAD_DASH_LENGTH, band.y + band.h));
        }
      } else {
        const cy = band.y + band.h / 2;
        for (let x = band.x; x < band.x + band.w; x += ROAD_DASH_PERIOD) {
          road.lineBetween(x, cy, Math.min(x + ROAD_DASH_LENGTH, band.x + band.w), cy);
        }
      }
    }

    s.streetContainer.add(road);
  
}

export function drawMapSlot(renderer: MainStreetRendererContext, node: MapSlotNode): void {

    const s = renderer.scene;
    const { localX, localY, gameplayIndex } = node;

    if (gameplayIndex === null) {
      renderer.drawRevealedStreetSlot(localX, localY);
      return;
    }

    const biz = s.state.streetGrid[gameplayIndex];
    if (biz) {
      renderer.drawBusinessSlot(localX, localY, gameplayIndex, biz);
    } else {
      renderer.drawEmptySlot(localX, localY, gameplayIndex);
    }
  
}

export function drawRevealedStreetSlot(renderer: MainStreetRendererContext, x: number, y: number): void {

    const s = renderer.scene;
    const { slotW, slotH } = s.layout;
    const bg = s.add.rectangle(
      x + slotW / 2, y + slotH / 2,
      slotW, slotH, 0x2a2a1c, 0.12,
    );
    bg.setStrokeStyle(1, 0x444438, 0.5);
    s.streetContainer.add(bg);
  
}

export function createStreetPanZone(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (s.replayMode) return;
    const viewport = streetViewportRect(s.layout);
    const zone = s.add.zone(
      viewport.x + viewport.w / 2,
      viewport.y + viewport.h / 2,
      Math.max(1, viewport.w - 8),
      Math.max(1, viewport.h - 4),
    ).setOrigin(0.5);
    zone.setName('ms-street-pan-zone');
    s.streetContainer.add(zone);
    (s.msInputManager as any)?.attachStreetPanZone?.(zone);
  
}

export function applyStreetCamera(renderer: MainStreetRendererContext, animate = false): void {

    const s = renderer.scene;
    if (!s.streetContainer || !s.layout) return;

    renderer.installStreetMapMask();
    const target = containerTransform(s.streetCamera, s.layout);
    const reducedMotion = !!(s.settingsPanel?.reducedMotion);
    const container = s.streetContainer;

    try {
      const tweening = s.tweens?.isTweening?.(container) ?? false;
      if (animate && !reducedMotion) {
        // Restart the transition from the current framing toward the target.
        s.tweens?.killTweensOf(container);
        s.tweens.add({
          targets: container,
          scaleX: target.scale,
          scaleY: target.scale,
          x: target.x,
          y: target.y,
          duration: ZOOM_ANIMATION_MS,
          ease: 'Cubic.easeOut',
        });
      } else if (!tweening) {
        // Never interrupt an in-flight zoom tween: a re-render triggered by the
        // camera change must not snap the layer to the target mid-transition.
        container.setScale(target.scale);
        container.setPosition(target.x, target.y);
      }
    } catch (_) {
      // Presentation-only: a failed transform must never break the game loop.
    }

    renderer.updateStreetMapMask();
  
}

export function installStreetMapMask(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (s.streetMapMaskGraphics || !s.streetContainer) return;
    try {
      s.streetMapMaskGraphics = s.add.graphics();
      const mask = new Phaser.Display.Masks.GeometryMask(s, s.streetMapMaskGraphics);
      s.streetContainer.setMask(mask);
      renderer.updateStreetMapMask();
    } catch (_) {
      s.streetMapMaskGraphics = null;
    }
  
}

export function updateStreetMapMask(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (!s.streetMapMaskGraphics || !s.layout) return;
    const viewport = streetViewportRect(s.layout);
    try {
      s.streetMapMaskGraphics.clear();
      s.streetMapMaskGraphics.fillStyle(0xffffff, 0);
      s.streetMapMaskGraphics.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
    } catch (_) {
      // ignore in constrained test environments
    }
  
}

export function installStreetZoomControls(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (!s.hudContainer || s.replayMode) return;
    const viewport = streetViewportRect(s.layout);
    const { marketTop, marketRowH, logX } = s.layout;
    const size = 26;
    const gap = 4;
    // Position in the top-right of the map zone: right of street area,
    // left of the activity log, below the market row.
    const clusterW = size;
    const x = Math.min(viewport.x + viewport.w, logX) - 20 - clusterW;
    const y = marketTop + marketRowH + 4; // just below the market row

    const zoomOut = renderer.createZoomButton(x, y, size, '−', 'ms-zoom-out', () => s.zoomStreetOut());
    const zoomIn = renderer.createZoomButton(x, y + size + gap, size, '+', 'ms-zoom-in', () => s.zoomStreetIn());
    const zoomLabel = s.add.text(
      x + size / 2,
      y + 2 * size + gap + 4,
      '',
      { fontSize: '10px', color: '#998866', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5, 0).setName('ms-zoom-label');

    try {
      s.hudContainer.add(zoomOut);
      s.hudContainer.add(zoomIn);
      s.hudContainer.add(zoomLabel);
      s.streetZoomControls = [zoomOut, zoomIn, zoomLabel];
    } catch (_) {
      // ignore UI errors in constrained test environments
    }
  
}

export function createZoomButton(renderer: MainStreetRendererContext, 
    x: number,
    y: number,
    size: number,
    text: string,
    name: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {

    const s = renderer.scene;
    const container = s.add.container(x + size / 2, y + size / 2).setName(name);
    const bg = s.add.rectangle(0, 0, size, size, 0x554422, 0.85);
    bg.setStrokeStyle(1, 0xaa8855);
    const label = s.add.text(0, 0, text, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(bg);
    container.add(label);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffdd44));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0xaa8855));
    return container;
  
}

export function updateStreetZoomControls(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    if (!s.hudContainer || s.replayMode) return;
    if (!s.hudContainer.getByName?.('ms-zoom-out')) renderer.installStreetZoomControls();

    const zoomOut = s.hudContainer.getByName?.('ms-zoom-out') as Phaser.GameObjects.Container | null;
    const zoomIn = s.hudContainer.getByName?.('ms-zoom-in') as Phaser.GameObjects.Container | null;
    const zoomLabel = s.hudContainer.getByName?.('ms-zoom-label') as Phaser.GameObjects.Text | null;
    const level = s.streetCamera.zoomLevel;

    try {
      renderer.setZoomButtonEnabled(zoomOut, level < MAX_ZOOM_LEVEL);
      renderer.setZoomButtonEnabled(zoomIn, level > MIN_ZOOM_LEVEL);
      zoomLabel?.setText(`${Math.round(zoomScale(level) * 100)}%`);
    } catch (_) {
      // ignore UI errors in constrained test environments
    }
  
}

export function setZoomButtonEnabled(_renderer: MainStreetRendererContext, button: Phaser.GameObjects.Container | null, enabled: boolean): void {

    if (!button) return;
    const bg = button.list?.[0] as Phaser.GameObjects.Rectangle | undefined;
    const label = button.list?.[1] as Phaser.GameObjects.Text | undefined;
    bg?.setFillStyle(0x554422, enabled ? 0.85 : 0.4);
    label?.setColor(enabled ? '#ffcc88' : '#776655');
  
}

export function refreshStreetZoomControls(renderer: MainStreetRendererContext): void {

    renderer.updateStreetZoomControls();
  
}

export function drawSynergyLines(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    const playable = s.streetPlayableLattice ?? { cols: 1, rows: 1 };
    const gridDims = playable.cols === 1 && playable.rows === 1 ? undefined : playable;
    const pairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? [], gridDims);

    // Only draw links whose endpoints are inside the viewport (culling,
    // AC4), using the rendered world-slot centres so lines cross street
    // boundaries (and the road between them) correctly (AC2).
    const centreByIndex = new Map<number, { x: number; y: number }>();
    for (const node of renderer.mapNodes()) {
      if (node.gameplayIndex === null) continue;
      centreByIndex.set(node.gameplayIndex, {
        x: node.localX + s.layout.slotW / 2,
        y: node.localY + s.layout.slotH / 2,
      });
    }

    for (const pair of pairs) {
      const from = centreByIndex.get(pair.fromIndex);
      const to = centreByIndex.get(pair.toIndex);
      if (!from || !to) continue;
      const { p1, p2 } = synergyLineEndpoints(pair, s.layout, { from, to });
      const color = synergyColor(pair.sharedSynergy);

      const line = s.add.graphics();
      line.lineStyle(3, color, 0.7);
      line.beginPath();
      line.moveTo(p1.x, p1.y);
      line.lineTo(p2.x, p2.y);
      line.strokePath();

      // Subtle outer glow: thicker, more transparent line, same endpoints.
      line.lineStyle(6, color, 0.2);
      line.beginPath();
      line.moveTo(p1.x, p1.y);
      line.lineTo(p2.x, p2.y);
      line.strokePath();

      s.streetContainer.add(line);
    }
  
}

export function mapNodes(renderer: MainStreetRendererContext): MapSlotNode[] {

    const s = renderer.scene;
    const lattice = s.streetViewLattice ?? { cols: 1, rows: 1 };
    const playable = s.streetPlayableLattice ?? { cols: 1, rows: 1 };
    return visibleMapSlots(s.streetCamera, s.layout, lattice, playable);
  
}

export function getVisibleStreetNodes(renderer: MainStreetRendererContext): MapSlotNode[] {

    return renderer.mapNodes();
  
}

export function getStreetRoadBands(renderer: MainStreetRendererContext): RoadBand[] {

    return renderer.drawnRoadBands;
  
}

export function drawBusinessSlot(renderer: MainStreetRendererContext, x: number, y: number, _index: number, biz: BusinessCard | CommunitySpaceCard): void {

    const s = renderer.scene;
    const { slotW, slotH } = s.layout;
    const isHinted = s.hintedSlotIndex === _index;

    const renderW = Math.max(1, Math.round(slotW - 4));
    const renderH = Math.max(1, Math.round(slotH - 4));

    // Render card via shared adapter. Upgraded businesses (level > 0) get a
    // display-name variant texture so the upgraded name is baked into the card
    // image like the base name (CG-0MT24MHGZ0025O20).
    const cardContainer = s.add.container(Math.round(x + slotW / 2), Math.round(y + slotH / 2));
    mainStreetRenderCardSvg(s, cardContainer, biz.id, renderW, renderH, biz.displayName);

    // Tag the container with its slot index so the synergy-formation
    // animation (`MainStreetAnimator.animateSynergyFormation`) can find and
    // pulse the paired cards.
    cardContainer.setData('streetSlotIndex', _index);

    // Apply upgrade overlays (level badge, income, name, border)
    renderer.applyUpgradeOverlays(cardContainer, biz, renderW, renderH);

    // ── Employed-staff count badge (CG-0MU3BTTCH001E7ZD AC1) ────
    // A small corner badge on slots with employed staff; skipped on sold
    // slots so it never clashes with the SOLD overlay (AC4).
    const staff = Array.isArray((biz as { employedStaff?: unknown }).employedStaff)
      ? (biz as { employedStaff: StaffCard[] }).employedStaff
      : [];
    if (staff.length > 0 && (s.state.soldSlots ?? [])[_index] !== true) {
      const badge = s.add.rectangle(
        renderW / 2 - 12,
        renderH / 2 - 12,
        24,
        24,
        0x1a2f55,
        0.95,
      );
      badge.setStrokeStyle(1, 0xffffff, 0.8);
      cardContainer.add(badge);
      const countText = s.add.text(renderW / 2 - 12, renderH / 2 - 12, `${staff.length}`, {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      // Tag for tests/visual QA: find the count badge by data key.
      countText.setData('staffCountBadge', true);
      cardContainer.add(countText);
    }

    s.streetContainer.add(cardContainer);

    if (isHinted) {
      const hintRect = s.add.rectangle(x + slotW / 2, y + slotH / 2, slotW, slotH);
      hintRect.setStrokeStyle(3, 0x44ffff);
      hintRect.setFillStyle(0x000000, 0);
      s.streetContainer.add(hintRect);
    }

    // ── Sold card dimmed overlay ────────────────────────────────
    const soldSlots: boolean[] = s.state.soldSlots ?? [];
    const isSold = soldSlots[_index] === true;
    if (isSold) {
      // Semi-transparent dark overlay to indicate sold state
      const soldOverlay = s.add.rectangle(0, 0, renderW, renderH, 0x000000, 0.5);
      cardContainer.add(soldOverlay);

      // "SOLD" text on the overlay
      const soldText = s.add.text(0, 0, 'SOLD', {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ff4444',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      cardContainer.add(soldText);
    }

    if (!s.replayMode) {
      // Tooltip hit area for this business slot
      const tooltipZone = s.add.zone(
        x + slotW / 2,
        y + slotH / 2,
        slotW,
        slotH,
      );
      tooltipZone.setOrigin(0.5);
      tooltipZone.setInteractive({ useHandCursor: true });
      // Named so tests (and QA) can address the slot's interactive zone.
      tooltipZone.setName(`ms-business-slot-zone-${_index}`);
      tooltipZone.on('pointerover', () => {
        if (isSold) {
          const info = `Sold: ${biz.name}\nThis card no longer produces income, but still provides synergy to adjacent businesses.`;
          s.tooltipManager?.show(info, tooltipZone.x, tooltipZone.y);
          return;
        }
        const isCommunitySpace = (biz as any).family === 'community-space';
        const label = isCommunitySpace ? 'Community Space' : 'Business';
        const totalRep = (biz.reputationPerTurn ?? 0) + biz.reputationBonus;
        const repInfo = totalRep > 0 ? `\nReputation: +${totalRep}/turn` : '';
        const synergyRate = formatSynergyRate(biz, s.state.config);
        const synergyInfo = synergyRate !== null ? `\nSynergy bonus: ${synergyRate} of base income per adjacent matching business` : '';
        // Employed-staff enumeration appended to the business's own info
        // (CG-0MU3BTTCH001E7ZD AC2/AC3); null when none employed (AC5).
        const staffSummary = formatEmployedStaffSummary(
          (biz as { employedStaff?: StaffCard[] }).employedStaff ?? [],
        ) ?? '';
        const info = `${label}: ${biz.name}\nIncome: +${biz.baseIncome + biz.incomeBonus}/turn${repInfo}\nSynergy: ${biz.synergyTypes.join('/')}${synergyInfo}\nLevel: ${biz.level}\nClick to manage: sell (free) or close (1 action)${staffSummary}`;
        s.tooltipManager?.show(info, tooltipZone.x, tooltipZone.y);
      });
      tooltipZone.on('pointerout', () => {
        s.tooltipManager?.hide();
      });

      // Click handler for selling (only in MarketPhase, for non-sold cards)
      if (s.uiPhase === 'market' && !isSold) {
        tooltipZone.on('pointerdown', () => {
          s.onSellCard(_index);
        });
      }

      // Upgrade hand-targeting (CG-0MUDA70FK003J8YL): while an upgrade is
      // pending, clicking a business targets it — an eligible business is
      // upgraded, an ineligible one shows illegal-move feedback and keeps the
      // upgrade selected for a retry. Mirrors the empty-slot click-to-place
      // path; the routing/eligibility logic lives in onSlotClick.
      const pendingIdx = s.pendingHandIndex;
      const pendingHandCard = pendingIdx !== null ? s.state.hand?.[pendingIdx] : undefined;
      if (s.uiPhase === 'placing-from-hand' && pendingHandCard?.family === 'upgrade') {
        tooltipZone.on('pointerdown', () => s.onSlotClick(_index));
      }

      s.streetContainer.add(tooltipZone);
    }
  
}

export function applyUpgradeOverlays(renderer: MainStreetRendererContext, 
    container: Phaser.GameObjects.Container,
    biz: BusinessCard | CommunitySpaceCard,
    width: number,
    height: number,
  ): void {

    const spec = buildUpgradeOverlaySpec(biz, width, height);

    // Upgrade border (drawn behind text overlays but on top of card image)
    if (spec.upgradeBorder) {
      const border = renderer.scene.add.rectangle(0, 0, width, height);
      border.setStrokeStyle(spec.upgradeBorder.strokeWidth, spec.upgradeBorder.color);
      border.setFillStyle(0x000000, 0);
      container.add(border);
    }

    // Level badge (top-right)
    if (spec.levelBadge) {
      const lvlText = renderer.scene.add.text(
        spec.levelBadge.x,
        spec.levelBadge.y,
        spec.levelBadge.text,
        {
          fontSize: spec.levelBadge.fontSize ?? '10px',
          fontStyle: spec.levelBadge.fontStyle,
          color: spec.levelBadge.color,
          fontFamily: FONT_FAMILY,
        },
      );
      lvlText.setOrigin(1, 0);
      container.add(lvlText);
    }

    // Name overlay (top center) for upgraded cards — REMOVED per manual
    // review (CG-0MT24MHGZ0025O20): the upgraded name is now baked into the
    // card's SVG texture via a display-name variant, so it renders as part of
    // the card image exactly like the base name. No Phaser text overlay.

    // Combined cash line (centred on card, above reputation) — CG-0MTCP76MP0088TQW
    // Replaces the former separate income/cost overlays that visually overlapped.
    // Two-tone rendering (CG-0MTDMOYOL008IQVO): when `segments` is present each
    // segment is drawn as its own text object laid out left-to-right, so income
    // renders green and ongoing cost red within the same line. The group is
    // horizontally centred at spec x (originX 0.5 default).
    if (spec.cashLine) {
      const size = spec.cashLine.fontSize ?? '11px';
      const fontStyle = spec.cashLine.fontStyle;
      const fontFamily = FONT_FAMILY;
      const originY = spec.cashLine.originY ?? 0;
      const segs = spec.cashLine.segments;
      if (segs && segs.length > 0) {
        const texts = segs.map((seg) =>
          renderer.scene.add.text(0, 0, seg.text, {
            fontSize: size,
            fontStyle,
            color: seg.color ?? spec.cashLine!.color,
            fontFamily,
          }),
        );
        const totalWidth = texts.reduce((acc, t) => acc + t.width, 0);
        const originX = spec.cashLine.originX ?? 0;
        let cursorX = spec.cashLine.x - totalWidth * originX;
        for (const t of texts) {
          t.setPosition(cursorX, spec.cashLine.y);
          t.setOrigin(0, originY);
          container.add(t);
          cursorX += t.width;
        }
      } else {
        const cashText = renderer.scene.add.text(
          spec.cashLine.x,
          spec.cashLine.y,
          spec.cashLine.text,
          { fontSize: size, fontStyle, color: spec.cashLine.color, fontFamily },
        );
        cashText.setOrigin(spec.cashLine.originX ?? 0, originY);
        container.add(cashText);
      }
    }

    // Reputation text (centred below income)
    if (spec.reputationText) {
      const repText = renderer.scene.add.text(
        spec.reputationText.x,
        spec.reputationText.y,
        spec.reputationText.text,
        {
          fontSize: spec.reputationText.fontSize ?? '11px',
          fontStyle: spec.reputationText.fontStyle,
          color: spec.reputationText.color,
          fontFamily: FONT_FAMILY,
        },
      );
      repText.setOrigin(spec.reputationText.originX ?? 0, spec.reputationText.originY ?? 0);
      container.add(repText);
    }
  
}

export function updateBusinessHandSelection(renderer: MainStreetRendererContext, index: number | null): void {

    const s = renderer.scene;
    // Remove existing selection borders from all hand card sprites
    for (let i = 0; i < renderer.handView.getSprites().length; i++) {
      const sprite = renderer.handView.getSpriteAt(i);
      if (!sprite) continue;
      const container = sprite as Phaser.GameObjects.Container;
      const existing = container.getByName('hand-selection-border');
      if (existing) existing.destroy();
    }

    // Add selection border to the newly selected card (business cards only —
    // event cards are played, never placed, so they never carry a selection)
    if (index !== null && index >= 0 && index < renderer.handView.getSprites().length) {
      const card = s.state.hand?.[index];
      if (card && card.family === 'event') return;
      const sprite = renderer.handView.getSpriteAt(index);
      if (!sprite) return;
      const container = sprite as Phaser.GameObjects.Container;
      const renderW = Math.max(1, Math.round(s.layout.handCardW - 4));
      const renderH = Math.max(1, Math.round(s.layout.handCardH - 4));
      const sel = s.add.rectangle(0, 0, renderW + 4, renderH + 4, 0x88ff88, 0);
      sel.setStrokeStyle(3, 0x88ff88);
      sel.setName('hand-selection-border');
      container.add(sel);
    }
  
}

export function drawEmptySlot(renderer: MainStreetRendererContext, x: number, y: number, index: number): void {

    const s = renderer.scene;
    const { slotW, slotH } = s.layout;
    // Upgrade targeting from hand (CG-0MUDA70FK003J8YL): empty slots are NOT
    // placement targets for an upgrade (only existing businesses are), so they
    // must not render in the 'selectable' colour nor become interactive.
    const pendingIdx = s.pendingHandIndex;
    const pendingHandCard = pendingIdx !== null ? s.state.hand?.[pendingIdx] : undefined;
    const isUpgradeTargeting =
      s.uiPhase === 'placing-from-hand' && pendingHandCard?.family === 'upgrade';
    const isSelectable =
      !isUpgradeTargeting &&
      (s.uiPhase === 'placing-business' || s.uiPhase === 'placing-from-hand');
    const isHinted = s.hintedSlotIndex === index && !isSelectable;
    const fillAlpha = isSelectable ? 0.4 : isHinted ? 0.35 : 0.2;
    const strokeColor = isSelectable ? 0xffdd44 : isHinted ? 0x44ffff : 0x555544;
    const strokeWidth = (isSelectable || isHinted) ? 2 : 1;

    const bg = s.add.rectangle(
      x + slotW / 2, y + slotH / 2,
      slotW, slotH, 0x333322, fillAlpha,
    );
    bg.setStrokeStyle(strokeWidth, strokeColor);
    bg.setName(`ms-empty-slot-${index}`);
    s.streetContainer.add(bg);

    // Slot number (1-indexed for readability: 1-10)
    const idxText = s.add.text(x + slotW / 2, y + slotH / 2, `${index + 1}`, {
      fontSize: '18px', color: (isSelectable || isHinted) ? '#ffdd44' : '#666655',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    s.streetContainer.add(idxText);

    // Click to place
    if (isSelectable && (s.pendingBusinessCard || s.pendingHandIndex !== null)) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => s.onSlotClick(index));
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0x44ff44));
      bg.on('pointerout', () => bg.setStrokeStyle(2, 0xffdd44));
    }
  
}
