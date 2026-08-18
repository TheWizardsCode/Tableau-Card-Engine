/**
 * MainStreetRenderer -- extracted UI/layout rendering helper for Main Street.
 */

import Phaser from 'phaser';
import type { BusinessCard, CommunitySpaceCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  MARKET_TOTAL_SLOTS,
  synergyColor,
} from '../MainStreetCards';
import {
  computeSynergyPairs,
} from '../MainStreetAdjacency';
import { synergyLineEndpoints } from './synergyLineEndpoints';
import {
  formatSynergyRate,
  buildCardTooltipInfo,
  turnLabel,
} from '../MainStreetFormatting';
import { computeScore } from '../MainStreetEngine';
import {
  buildCoinsTooltip,
  buildReputationTooltip,
  buildScoreTooltip,
  buildActionTooltip,
  HUD_ARIA_LABELS,
} from './MainStreetHudTooltips';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canRefreshMarket,
  refreshMarketCost,
} from '../MainStreetMarket';
import {
  FONT_FAMILY,
  HandView,
  HintBar,
  attachSelection,
  markHudTransient,
  clearTransientHud,
  DEFAULT_DRAG_DISTANCE_THRESHOLD,
} from '../../../src/ui';
import {
  createSceneTitle,
  createGameZone,
} from '@ui/Renderer';
import { createActionButton } from '@ui/Renderer';
import {
  attachHudTooltipZone,
  mainStreetRenderCardSvg,
  createMainStreetHintButton,
} from '../../../src/ui/Renderer/adapters/MainStreetAdapter';
import {
  BOX_FILL,
  BOX_RADIUS,
  BOX_STROKE,
  CHALLENGE_LINE_H,
  CHALLENGE_PAD,
  CHALLENGE_TITLE_H,
  LOG_COLORS,
  LOG_FONT_SIZE,
  LOG_LINE_H,
  LOG_PAD,
  LOG_TITLE_H,
  type SceneLayout,
} from './MainStreetConstants';

import {
  buildUpgradeOverlaySpec,
  type UpgradeOverlaySpec,
} from './UpgradeOverlaySpec';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec };

import { computeMainStreetLayoutWithSll } from './MainStreetLayoutAdapter';

// markHudTransient and clearTransientHud are now imported from src/ui/Renderer

export class MainStreetRenderer {
  /**
   * Single HandView for the merged player hand — one horizontal row holding
   * any mix of business and event cards (up to `maxHandSize` total).
   * `renderCard` dispatches on `card.family` to render business or event
   * cards with their respective interactions.
   */
  handView!: HandView;
  /** Containers currently registered with the drag-drop manager (unregistered before refresh). */
  private dragDropRegistered = new Set<Phaser.GameObjects.Container>();
  /** Outline rectangles shown on empty street slots while a drag is active. */
  private dragHighlightRects = new Set<Phaser.GameObjects.Rectangle>();
  /**
   * Rendered market card containers per row ('development' | 'investments'),
   * in slot order. Rebuilt on every refreshMarket; consumed by the market
   * deal-in animation (`MainStreetAnimator.animateMarketDealIn`).
   */
  private marketRowCards = new Map<string, Phaser.GameObjects.Container[]>();

  constructor(private readonly scene: any) {}

  public createHeader(): void {
    const s = this.scene;
    createSceneTitle(s, 'Main Street');
  }

  public computeLayout(): SceneLayout {
    return computeMainStreetLayoutWithSll();
  }

  public createContainers(): void {
    const s = this.scene;
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
    this.handView = new HandView(s, {
      baseX: handX + handCardW / 2,
      baseY: handY,
      centerX: handCenterX,
      spacing: handCardW + 8,
      cardWidth: handCardW,
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

        // Render SVG card via shared adapter
        mainStreetRenderCardSvg(s, container, card.id, renderW, renderH);

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
            if (s.uiPhase === 'market') {
              hover.on('pointerdown', () => s.onPlayHeldEvent(cardIndex));
            }
            container.add(hover);
          }
        } else {
          // ── Business card path: upgrade overlays + placement click ──
          this.applyUpgradeOverlays(container, card, renderW, renderH);

          // Add interactive hit area so cards can be clicked during market phase
          // to start the placing-from-hand flow.
          if (!s.replayMode) {
            const hitArea = s.add.rectangle(0, 0, handCardW, handCardH, 0x000000, 0.001);
            hitArea.setInteractive({ useHandCursor: true });
            hitArea.on('pointerdown', () => {
              s.onHandBusinessCardClick(cardIndex);
            });
            container.add(hitArea);
          }
        }

        return container;
      },
      customClickFn: (cardIndex: number) => {
        const card = s.state.hand?.[cardIndex];
        // Event cards are played (via onPlayHeldEvent), never placed — ignore
        // HandView-level clicks on them here.
        if (card && card.family === 'event') return;
        // Allow selecting a different business card in the hand during placement
        if (s.uiPhase === 'placing-from-hand') {
          s.pendingHandIndex = cardIndex;
          this.updateBusinessHandSelection(cardIndex);
          const cardName = s.state.hand?.[cardIndex]?.name ?? 'card';
          s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
        }
      },
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

  public createInstructions(): void {
    const s = this.scene;
    // Shared HintBar for hint/instruction display at bottom-center
    s.hintBar = new HintBar(s);

    // Keep legacy instructionText for backward compatibility (tests),
    // referencing the HintBar's underlying text object.
    s.instructionText = s.hintBar.textObject;
  }

  public refreshAll(): void {
    const s = this.scene;
    this.refreshHud();
    this.refreshStreetGrid();
    this.refreshMarket();
    this.refreshIncidentQueue();
    this.refreshPlayerHand();
    this.refreshActionButtons();
    this.refreshChallengeTracker();
    this.refreshLog();
    s.updateSvgDebugOverlay();
  }

  public refreshHud(): void {
    const s = this.scene;

    // Remove only elements tagged as transient HUD items so that persistent overlay
    // objects (helpPanel, settingsPanel, buttons) that also reside in hudContainer are
    // not destroyed on each refresh.  Using removeAll(true) would destroy those persistent
    // children, breaking their parentContainer reference and causing the SidebarOverlay test
    // (and the live game) to lose the panels after the first refresh.
    clearTransientHud(s.hudContainer);

    const score = computeScore(s.state);
    const { coins, reputation } = s.state.resourceBank;
    const { gameW, hudY } = s.layout;

    // Background strip - 50% width, centered
    const strip = markHudTransient(s.add.rectangle(gameW / 2, hudY, gameW * 0.5, 28, 0x1a1408, 0.6));
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    s.hudContainer.add(strip);

    // Coins - left-aligned in strip
    const stripWidth = gameW * 0.5;
    const stripLeft = (gameW - stripWidth) / 2;
    const coinText = markHudTransient(s.add.text(stripLeft + 10, hudY, `Coins: ${Math.round(coins)}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(coinText);

    // Action counter - next to coins
    const actionText = markHudTransient(s.add.text(
      coinText.x + coinText.width + 16,
      hudY,
      `${s.state.actionsRemaining} action${s.state.actionsRemaining !== 1 ? 's' : ''} left`,
      {
        fontSize: '14px', fontStyle: 'bold',
        color: s.state.actionsRemaining > 0 ? '#aaffaa' : '#ff6666',
        fontFamily: FONT_FAMILY,
      }
    ).setOrigin(0, 0.5));
    s.hudContainer.add(actionText);

    // Reputation - centered in strip
    const repText = markHudTransient(s.add.text(stripLeft + stripWidth * 0.5, hudY, `Reputation: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5));
    s.hudContainer.add(repText);

    // Score - right-aligned in strip (shows x / y where y is the win threshold)
    const scoreText = markHudTransient(s.add.text(stripLeft + stripWidth - 10, hudY, `Score: ${Math.round(score)}/${s.state.config.winThreshold}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5));
    s.hudContainer.add(scoreText);

    // HUD tooltip zones (desktop: pointer hover, mobile: tap toggle)
    if (!s.replayMode) {
      attachHudTooltipZone(s, coinText, HUD_ARIA_LABELS.coins, () => buildCoinsTooltip(s.state));
      attachHudTooltipZone(s, repText, HUD_ARIA_LABELS.rep, () => buildReputationTooltip(s.state));
      attachHudTooltipZone(s, scoreText, HUD_ARIA_LABELS.score, () => buildScoreTooltip(s.state, s.campaign));
      attachHudTooltipZone(s, actionText, HUD_ARIA_LABELS.action, () => buildActionTooltip(s.state));
    }

    s.animateHudValueChanges({
      coins,
      reputation,
      coinX: stripLeft + 70,
      repX: stripLeft + stripWidth * 0.5,
      hudY,
    });
  }



  public refreshChallengeTracker(): void {
    const s = this.scene;
    s.challengeContainer.removeAll(true);

    const challenges = s.state.activeChallenges;
    if (challenges.length === 0) return;

    // Dynamic height based on number of challenges
    const panelH = CHALLENGE_TITLE_H + challenges.length * CHALLENGE_LINE_H + CHALLENGE_PAD * 2;
    const challengeW = s.layout.challengeW;

    // Panel background
    const bg = s.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, challengeW, panelH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, challengeW, panelH, 4);
    s.challengeContainer.add(bg);

    // Title bar
    const titleBg = s.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, challengeW, CHALLENGE_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    s.challengeContainer.add(titleBg);

    const completedCount = challenges.filter((ac: any) => ac.completed).length;
    const titleText = s.add.text(
      challengeW / 2, CHALLENGE_TITLE_H / 2,
      `Challenges (${completedCount}/${challenges.length})`,
      { fontSize: '11px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    s.challengeContainer.add(titleText);

    // Challenge list -- compact single-line rows: indicator + title + description
    let yOff = CHALLENGE_TITLE_H + CHALLENGE_PAD;
    for (const ac of challenges) {
      const isComplete = ac.completed;
      const indicator = isComplete ? '\u2713' : '\u2022';  // checkmark or bullet
      const color = isComplete ? '#44ff44' : '#ccbbaa';
      const nameColor = isComplete ? '#66aa66' : '#ddccbb';

      // Indicator
      const indicatorText = s.add.text(CHALLENGE_PAD, yOff, indicator, {
        fontSize: '13px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0);
      s.challengeContainer.add(indicatorText);

      // Challenge title
      const challengeText = s.add.text(
        CHALLENGE_PAD + 16, yOff,
        ac.challenge.title,
        {
          fontSize: '11px',
          fontStyle: isComplete ? 'italic' : 'normal',
          color: nameColor,
          fontFamily: FONT_FAMILY,
        },
      ).setOrigin(0, 0);
      s.challengeContainer.add(challengeText);

      // Description (right portion of the row)
      const descText = s.add.text(
        challengeW * 0.42, yOff,
        ac.challenge.description,
        {
          fontSize: '10px',
          color: isComplete ? '#558855' : '#998877',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: challengeW * 0.56 },
        },
      ).setOrigin(0, 0);
      s.challengeContainer.add(descText);

      yOff += CHALLENGE_LINE_H;
    }
  }

  public refreshStreetGrid(): void {
    const s = this.scene;
    s.streetContainer.removeAll(true);

    const { gameW, streetTop, streetX, slotW, slotGap, slotH, streetCols, streetRowGap } = s.layout;

    // Section label
    const label = s.add.text(gameW / 2, streetTop - 16, '', {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9966', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    s.streetContainer.add(label);

    // Register drag-drop drop zones BEFORE drawing slot rectangles. Phaser's
    // input system uses topOnly by default, meaning pointer events are delivered
    // only to the top-most hit object (the one with the highest render-list
    // index). By registering zones first, then drawing slot rects afterward,
    // the clickable slot rectangles end up on top and receive pointer events
    // (click-to-place), while drag-drop hit testing still works because the
    // drop zones are collected from all interactive objects regardless of
    // render order.
    this.refreshDragDropZones();

    for (let i = 0; i < GRID_SIZE; i++) {
      const col = i % streetCols;
      const row = Math.floor(i / streetCols);
      const x = streetX + col * (slotW + slotGap);
      const y = streetTop + row * (slotH + streetRowGap);
      const biz = s.state.streetGrid[i];

      if (biz) {
        this.drawBusinessSlot(x, y, i, biz);
      } else {
        this.drawEmptySlot(x, y, i);
      }
    }

    // Draw synergy lines between adjacent synergistic businesses
    this.drawSynergyLines();
  }

  /**
   * Draws visual lines between adjacent businesses that share a synergy type.
   * Each line uses the colour of the shared synergy type (from synergyColor).
   * Lines are drawn over the street grid but behind tooltip zones.
   *
   * Geometry (CG-0MSVM3WCD007BRQP): each line is the centre-to-centre
   * segment clipped to the two SLOT rects via the shared `synergyLineEndpoints`
   * helper — edge-to-edge for orthogonally adjacent slots, visually
   * corner-to-corner for diagonally adjacent slots, and clipped to the card
   * boundaries for extended-range pairs (the straight line still crosses
   * intermediate cells). Endpoints target the slot rect (the visual card is
   * inset 2px, `renderW/H = slotW − 4`) so the lines sit on the slot grid.
   * The main 3px stroke and the 6px/0.2-alpha glow share the SAME clipped
   * endpoints (drawn back-to-back on one Graphics object).
   */
  private drawSynergyLines(): void {
    const s = this.scene;
    const pairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? []);

    for (const pair of pairs) {
      const { p1, p2 } = synergyLineEndpoints(pair, s.layout);
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

  // ── Drag-to-buy/place helpers (business cards → street slots) ──

  /** Unregister all market-card draggables (called before refreshMarket clears containers). */
  private unregisterDragDraggables(): void {
    const s = this.scene;
    if (!s.dragDropManager) return;
    for (const container of this.dragDropRegistered) {
      try { s.dragDropManager.unregisterDraggable(container); } catch (_) { /* ignore */ }
    }
    this.dragDropRegistered.clear();
  }

  /** Register empty street slots as drag-drop zones for the market phase. */
  private refreshDragDropZones(): void {
    const s = this.scene;
    if (!s.dragDropManager || s.replayMode) return;
    s.dragDropManager.clearDropZones();

    const { streetX, streetTop, slotW, slotGap, slotH, streetCols, streetRowGap } = s.layout;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (s.state.streetGrid[i]) continue; // occupied slots are invalid drop targets
      const col = i % streetCols;
      const row = Math.floor(i / streetCols);
      const cx = streetX + col * (slotW + slotGap) + slotW / 2;
      const cy = streetTop + row * (slotH + streetRowGap) + slotH / 2;
      const zone = s.add.zone(cx, cy, slotW, slotH).setOrigin(0.5);
      zone.setRectangleDropZone(slotW, slotH);
      s.dragDropManager.registerDropZone({
        zone,
        data: i,
        canAccept: (payload: any) =>
          s.msTurnController.canDropBusinessCard(payload.data as string, i),
      });
      s.streetContainer.add(zone);
    }
  }

  /** Outline empty street slots while a drag is active (valid-drop hint). */
  public showDragHighlights(): void {
    const s = this.scene;
    this.clearDragHighlights();
    const { streetX, streetTop, slotW, slotGap, slotH, streetCols, streetRowGap } = s.layout;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (s.state.streetGrid[i]) continue;
      const col = i % streetCols;
      const row = Math.floor(i / streetCols);
      const x = streetX + col * (slotW + slotGap) + slotW / 2;
      const y = streetTop + row * (slotH + streetRowGap) + slotH / 2;
      const hl = s.add.rectangle(x, y, slotW, slotH);
      hl.setStrokeStyle(2, 0x44ff66, 0.8);
      hl.setFillStyle(0x000000, 0);
      s.streetContainer.add(hl);
      this.dragHighlightRects.add(hl);
    }
  }

  /** Remove drag highlights (called on dragend and defensively on refresh). */
  public clearDragHighlights(): void {
    for (const rect of this.dragHighlightRects) {
      if (rect?.active) rect.destroy();
    }
    this.dragHighlightRects.clear();
  }

  public drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard | CommunitySpaceCard): void {
    const s = this.scene;
    const { slotW, slotH } = s.layout;
    const isHinted = s.hintedSlotIndex === _index;

    const renderW = Math.max(1, Math.round(slotW - 4));
    const renderH = Math.max(1, Math.round(slotH - 4));

    // Render card via shared adapter
    const cardContainer = s.add.container(Math.round(x + slotW / 2), Math.round(y + slotH / 2));
    mainStreetRenderCardSvg(s, cardContainer, biz.id, renderW, renderH);

    // Tag the container with its slot index so the synergy-formation
    // animation (`MainStreetAnimator.animateSynergyFormation`) can find and
    // pulse the paired cards.
    cardContainer.setData('streetSlotIndex', _index);

    // Apply upgrade overlays (level badge, income, name, border)
    this.applyUpgradeOverlays(cardContainer, biz, renderW, renderH);

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
      tooltipZone.on('pointerover', () => {
        if (isSold) {
          const info = `Sold: ${biz.name}\nThis card no longer produces income or synergy.`;
          s.tooltipManager?.show(info, tooltipZone.x, tooltipZone.y);
          return;
        }
        const isCommunitySpace = (biz as any).family === 'community-space';
        const label = isCommunitySpace ? 'Community Space' : 'Business';
        const totalRep = (biz.reputationPerTurn ?? 0) + biz.reputationBonus;
        const repInfo = totalRep > 0 ? `\nReputation: +${totalRep}/turn` : '';
        const synergyRate = formatSynergyRate(biz, s.state.config);
        const synergyInfo = synergyRate !== null ? `\nSynergy bonus: ${synergyRate} of base income per adjacent matching business` : '';
        const info = `${label}: ${biz.name}\nIncome: +${biz.baseIncome + biz.incomeBonus}/turn${repInfo}\nSynergy: ${biz.synergyTypes.join('/')}${synergyInfo}\nLevel: ${biz.level}`;
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

      s.streetContainer.add(tooltipZone);
    }
  }

  /**
   * Apply upgrade overlay visuals to a business card container.
   *
   * Renders level badge, income text, name overlay, and upgrade border
   * based on the card's current upgrade state (level > 0).
   *
   * @param container - The Phaser container holding the card image.
   * @param biz - The BusinessCard with upgrade state.
   * @param width - Card display width.
   * @param height - Card display height.
   */
  private applyUpgradeOverlays(
    container: Phaser.GameObjects.Container,
    biz: BusinessCard | CommunitySpaceCard,
    width: number,
    height: number,
  ): void {
    const spec = buildUpgradeOverlaySpec(biz, width, height);

    // Upgrade border (drawn behind text overlays but on top of card image)
    if (spec.upgradeBorder) {
      const border = this.scene.add.rectangle(0, 0, width, height);
      border.setStrokeStyle(spec.upgradeBorder.strokeWidth, spec.upgradeBorder.color);
      border.setFillStyle(0x000000, 0);
      container.add(border);
    }

    // Level badge (top-right)
    if (spec.levelBadge) {
      const lvlText = this.scene.add.text(
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

    // Name overlay (top center) for upgraded cards
    if (spec.nameText) {
      const nameText = this.scene.add.text(
        spec.nameText.x,
        spec.nameText.y,
        spec.nameText.text,
        {
          fontSize: spec.nameText.fontSize ?? '10px',
          fontStyle: spec.nameText.fontStyle,
          color: spec.nameText.color,
          fontFamily: FONT_FAMILY,
        },
      );
      nameText.setOrigin(0.5, 0);
      // Add a subtle dark background for readability
      const bg = this.scene.add.graphics();
      const textWidth = nameText.width + 8;
      const textHeight = nameText.height + 2;
      bg.fillStyle(0x000000, 0.6);
      bg.fillRoundedRect(
        spec.nameText.x - textWidth / 2,
        spec.nameText.y - 1,
        textWidth,
        textHeight,
        2,
      );
      container.add(bg);
      container.add(nameText);
    }

    // Income text (centred on card)
    if (spec.incomeText) {
      const incomeText = this.scene.add.text(
        spec.incomeText.x,
        spec.incomeText.y,
        spec.incomeText.text,
        {
          fontSize: spec.incomeText.fontSize ?? '11px',
          fontStyle: spec.incomeText.fontStyle,
          color: spec.incomeText.color,
          fontFamily: FONT_FAMILY,
        },
      );
      incomeText.setOrigin(spec.incomeText.originX ?? 0, spec.incomeText.originY ?? 0);
      container.add(incomeText);
    }

    // Reputation text (centred below income)
    if (spec.reputationText) {
      const repText = this.scene.add.text(
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

  /**
   * Toggle the selection highlight on business hand cards.
   * Adds or removes a green border from the card at `index` in the merged hand.
   */
  public updateBusinessHandSelection(index: number | null): void {
    const s = this.scene;
    // Remove existing selection borders from all hand card sprites
    for (let i = 0; i < this.handView.getSprites().length; i++) {
      const sprite = this.handView.getSpriteAt(i);
      if (!sprite) continue;
      const container = sprite as Phaser.GameObjects.Container;
      const existing = container.getByName('hand-selection-border');
      if (existing) existing.destroy();
    }

    // Add selection border to the newly selected card (business cards only —
    // event cards are played, never placed, so they never carry a selection)
    if (index !== null && index >= 0 && index < this.handView.getSprites().length) {
      const card = s.state.hand?.[index];
      if (card && card.family === 'event') return;
      const sprite = this.handView.getSpriteAt(index);
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

  public drawEmptySlot(x: number, y: number, index: number): void {
    const s = this.scene;
    const { slotW, slotH } = s.layout;
    const isSelectable = s.uiPhase === 'placing-business' || s.uiPhase === 'placing-from-hand';
    const isHinted = s.hintedSlotIndex === index && !isSelectable;
    const fillAlpha = isSelectable ? 0.4 : isHinted ? 0.35 : 0.2;
    const strokeColor = isSelectable ? 0xffdd44 : isHinted ? 0x44ffff : 0x555544;
    const strokeWidth = (isSelectable || isHinted) ? 2 : 1;

    const bg = s.add.rectangle(
      x + slotW / 2, y + slotH / 2,
      slotW, slotH, 0x333322, fillAlpha,
    );
    bg.setStrokeStyle(strokeWidth, strokeColor);
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

  public refreshMarket(): void {
    const s = this.scene;
    // Rebuild the per-row card registry for the deal-in animation.
    this.marketRowCards.clear();
    // Unregister market-card draggables before the containers are destroyed
    // so the drag-drop manager never holds stale game-object references.
    this.unregisterDragDraggables();
    s.marketContainer.removeAll(true);
    s.marketSelectionManager.clear();
    s.marketSelectionManager.clearTargets();
    s.marketSelectionByCardId.clear();
    s.selectedMarketCardId = null;

    const { marketTop, marketRowH, logX } = s.layout;

    // Wider section background — extends from left edge to near the activity log (logX - 20px margin)
    const bgLeft = 20;
    const bgRight = logX - 20; // 820 - 20 = 800
    const totalH = marketRowH + 30;
    const bgBox = s.add.graphics();
    bgBox.fillStyle(BOX_FILL, 0.3);
    bgBox.fillRoundedRect(bgLeft, marketTop - 10, bgRight - bgLeft, totalH, BOX_RADIUS);
    bgBox.lineStyle(1, BOX_STROKE, 0.4);
    bgBox.strokeRoundedRect(bgLeft, marketTop - 10, bgRight - bgLeft, totalH, BOX_RADIUS);
    s.marketContainer.add(bgBox);

    // Section label centered over the wider box
    const sectionLabel = s.add.text((bgLeft + bgRight) / 2, marketTop - 4, 'Market', {
      fontSize: '13px', fontStyle: 'bold', color: '#887766', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    s.marketContainer.add(sectionLabel);

    // Single-row marketplace: exactly MARKET_TOTAL_SLOTS (3) cards, always
    // ≥1 business, random within 1–2B/0–1U/0–1E (CG-0MSTOATDT009BRX2).
    const { marketCardW, marketCardGap } = s.layout;
    const boxCenter = (bgLeft + bgRight) / 2;
    const totalCardsW = MARKET_TOTAL_SLOTS * marketCardW + (MARKET_TOTAL_SLOTS - 1) * marketCardGap;
    const startX = Math.round(boxCenter - totalCardsW / 2);

    this.drawMarketRow(
      marketTop + 6,
      'Market',
      'market',
      s.state.market.cards,
      MARKET_TOTAL_SLOTS,
      (card) => {
        if (card.family === 'business' || card.family === 'community-space') {
          s.onBusinessCardClick(card as BusinessCard);
        } else if (card.family === 'upgrade') {
          s.onUpgradeCardClick(card as UpgradeCard);
        } else {
          s.onEventCardClick(card as EventCard);
        }
      },
      startX,
    );
  }

  public drawMarketRow(
    y: number,
    rowLabel: string,
    rowKey: string,
    cards: readonly (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard) => void,
    alignmentStartX?: number,
  ): void {
    const s = this.scene;
    const { marketCardW, marketCardH, marketCardGap, logX } = s.layout;

    // Row label - also use for positioning deck count
    const label = s.add.text(40, y, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.marketContainer.add(label);

    // Determine card startX: an explicit alignmentStartX wins; otherwise
    // centre the row independently in the market box.
    const boxLeft = 20;
    const boxRight = logX - 20;
    const boxCenter = (boxLeft + boxRight) / 2;
    const totalCardsW = maxSlots * marketCardW + (maxSlots - 1) * marketCardGap;
    const startX = alignmentStartX ?? Math.round(boxCenter - totalCardsW / 2);

    for (let i = 0; i < maxSlots; i++) {
      const cx = startX + i * (marketCardW + marketCardGap);
      const card = cards[i];

      if (card && !s.hiddenTransferSourceCardIds.has(card.id)) {
        const cardObj = this.drawMarketCard(cx, y, card, onClick, rowKey, i);
        s.marketContainer.add(cardObj);
        const rowCards = this.marketRowCards.get(rowKey) ?? [];
        rowCards.push(cardObj);
        this.marketRowCards.set(rowKey, rowCards);
      } else {
        // Empty slot
        const empty = s.add.rectangle(
          cx + marketCardW / 2, y + marketCardH / 2,
          marketCardW, marketCardH, 0x222211, 0.3,
        );
        empty.setStrokeStyle(1, 0x333322);
        s.marketContainer.add(empty);
      }
    }

    // Deck info and re-roll button - immediately below the label.
    const deckY = y + 16;
    // Single row: show all deck counts + one Re-roll button.
    const bizCount = s.state.decks.business.length;
    const csCount = s.state.decks.communitySpace.length;
    const upgCount = s.state.decks.upgrade.length;
    const evtCount = s.state.decks.event.length;
    const deckText = s.add.text(40, deckY, `Biz: ${bizCount}  CS: ${csCount}  Upg: ${upgCount}  Evt: ${evtCount}`, {
      fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0);
    s.marketContainer.add(deckText);

    // Re-roll button (single market refresh, Accountant discount applies).
    try {
      const refreshResult = canRefreshMarket(s.state);
      const canRefresh = refreshResult.legal;
      const refreshCost = refreshMarketCost(s.state);
      const btnW = Math.max(s.layout.smallButtonW, 110);
      const labelCenter = 40 + s.layout.marketLabelW / 2;
      const btnX = Math.round(labelCenter - btnW / 2);
      const btnY = deckY + 22;

      const labelText = `Re-roll (${refreshCost})`;

      const btn = createActionButton(s, btnX, btnY, btnW, labelText, canRefresh ? () => { s.onRefreshMarketClick(); } : () => {}, {
        disabled: !canRefresh,
        ...(canRefresh ? {} : { fillColor: 0x333333, fillAlpha: 0.6 }),
      });
      // Dim visual when not allowed, but keep interactive so tooltip can show
      try {
        const bg = (btn.list && btn.list[0]) as Phaser.GameObjects.Rectangle | undefined;
        if (bg) {
          if (!canRefresh && typeof bg.setFillStyle === 'function') {
            bg.setFillStyle(0x333333, 0.6);
          }

          // Tooltip for the Re-roll button
          const reasonSuffix = !canRefresh && refreshResult.reason ? `\n\n${refreshResult.reason}` : '';
          const info = `Pay €${refreshCost} to re-roll the market and replace all visible cards. Removed cards go to their discard piles. Available only during Market phase.${reasonSuffix}`;
          try {
            bg.on('pointerover', (pointer: any) => {
              if (s.tooltipManager) {
                s.tooltipManager.show(info, (pointer && pointer.worldX) || btn.x, (pointer && pointer.worldY) || btn.y);
                return;
              }
              try {
                if ((s as any)._tempRefreshMarketTooltip) {
                  (s as any)._tempRefreshMarketTooltip.destroy();
                  (s as any)._tempRefreshMarketTooltip = null;
                }
                const tt = s.add.text(btn.x, btn.y - s.layout.actionButtonH / 2 - 6, info, {
                  fontSize: '12px', color: '#ffffff', fontFamily: FONT_FAMILY, backgroundColor: 'rgba(0,0,0,0.85)', padding: { x: 6, y: 4 }, wordWrap: { width: 280 }, align: 'center'
                }).setOrigin(0.5, 1).setDepth(1000);
                (s as any)._tempRefreshMarketTooltip = tt;
              } catch (e) { /* ignore fallback errors */ }
            });
            bg.on('pointerout', () => {
              if (s.tooltipManager) {
                s.tooltipManager.hide();
                return;
              }
              try {
                if ((s as any)._tempRefreshMarketTooltip) {
                  (s as any)._tempRefreshMarketTooltip.destroy();
                  (s as any)._tempRefreshMarketTooltip = null;
                }
              } catch (_) { /* ignore */ }
            });
          } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore tooltip attach errors in tests */ }

      s.marketContainer.add(btn);
    } catch (_) {
      // ignore UI errors in tests
    }
  }

  /**
   * Rendered market card containers for a row, in slot order.
   *
   * The containers are rebuilt by every `refreshMarket()`; call this AFTER
   * the final refresh of a deal-in flow so the animation targets the
   * currently-visible cards.
   */
  public getMarketRowCards(rowKey: 'market'): Phaser.GameObjects.Container[] {
    return this.marketRowCards.get(rowKey) ?? [];
  }

  /**
   * Centre of a single-market row slot, mirroring `drawMarketRow`'s layout
   * math (boxCenter centring, MARKET_TOTAL_SLOTS slots).
   *
   * Used by the market swap animation to place outgoing-card snapshot
   * visuals at the positions the leaving cards were rendered.
   * Keep in sync with `drawMarketRow` if the market layout changes.
   */
  public getMarketSlotCenter(
    _rowKey: 'market',
    slotIndex: number,
  ): { x: number; y: number } {
    const s = this.scene;
    const { marketTop, logX, marketCardW, marketCardGap } = s.layout;
    const boxCenter = (20 + logX - 20) / 2;
    const totalCardsW = MARKET_TOTAL_SLOTS * marketCardW + (MARKET_TOTAL_SLOTS - 1) * marketCardGap;
    const startX = Math.round(boxCenter - totalCardsW / 2);
    const rowTop = marketTop + 6;
    return {
      x: startX + slotIndex * (marketCardW + marketCardGap) + marketCardW / 2,
      y: rowTop + s.layout.marketCardH / 2,
    };
  }

  public drawMarketCard(
    x: number,
    y: number,
    card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard) => void,
    _rowKey: string,
    _slotIndex: number,
  ): Phaser.GameObjects.Container {
    const s = this.scene;
    const { marketCardW, marketCardH } = s.layout;
    const container = s.add.container(Math.round(x + marketCardW / 2), Math.round(y + marketCardH / 2));

    // Determine if this is a non-purchasable Incident event
    const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';

    // Determine if this card is the hint recommendation
    const isHinted = s.hintedCardId !== null && card.id === s.hintedCardId;

    const renderW = Math.max(1, Math.round(marketCardW - 4));
    const renderH = Math.max(1, Math.round(marketCardH - 4));
    const baseStrokeColor = isHinted ? 0x44ffff : (isIncidentEvent ? 0x556688 : 0x888877);

    // Render card via shared adapter
    mainStreetRenderCardSvg(s, container, card.id, renderW, renderH);

    // For upgrade cards, add a dynamic text overlay showing the target business
    if (card.family === 'upgrade') {
      const u = card as UpgradeCard;
      const targetLabel = `for ${u.targetBusiness}`;
      const targetText = s.add.text(0, Math.round(-renderH / 2 + 24), targetLabel, {
        fontSize: '9px',
        color: '#ddbb88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
      });
      targetText.setOrigin(0.5, 0);
      targetText.setName('upgradeTargetLabel');
      container.add(targetText);
    }

    // Apply income/reputation overlays for business and community-space cards
    if (card.family === 'business' || card.family === 'community-space') {
      this.applyUpgradeOverlays(container, card as BusinessCard | CommunitySpaceCard, renderW, renderH);

      // Buy-and-place premium indicator (CG-0MSTOF1N5005PK2R): direct
      // market→street placement costs +50% over the listed cost. Shown as a
      // small badge at the bottom of business/community-space cards.
      const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
      const premiumLabel = s.add.text(0, Math.round(renderH / 2 - 11), `B&P €${premiumCost} (listed €${card.cost})`, {
        fontSize: '9px',
        color: '#ffcc88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
        backgroundColor: '#000000aa',
      });
      premiumLabel.setOrigin(0.5, 0.5);
      premiumLabel.setName('buyAndPlacePremiumLabel');
      container.add(premiumLabel);
    }

    const selectionRing = s.add.rectangle(0, 0, marketCardW, marketCardH);
    selectionRing.setFillStyle(0x000000, 0);
    selectionRing.setStrokeStyle(2, 0x44ff66);
    selectionRing.setVisible(false);
    container.add(selectionRing);

    // Action economy gating (CG-0MSTOF1N5005PK2R): business/community-space
    // card purchases consume the daily action, so those cards are
    // non-interactive (dimmed) when the budget is spent. Events/upgrades are
    // free operations and stay interactive.
    const noActions = s.state.actionsRemaining <= 0;
    const isBusinessLike = card.family === 'business' || card.family === 'community-space';
    const interactiveEnabled =
      s.uiPhase === 'market' && !isIncidentEvent && !(isBusinessLike && noActions);
    const selection = attachSelection(container, {
      onStateChange: ({ selected, hovered }) => {
        if (selected) {
          s.selectedMarketCardId = card.id;
        } else if (s.selectedMarketCardId === card.id) {
          s.selectedMarketCardId = null;
        }

        if (hovered && interactiveEnabled) {
          selectionRing.setStrokeStyle(2, 0xffdd44);
          selectionRing.setVisible(true);
          container.setScale(1.05);
          return;
        }

        if (selected) {
          selectionRing.setStrokeStyle(2, 0x44ff66);
          selectionRing.setVisible(true);
          container.setScale(1.04);
          return;
        }

        selectionRing.setStrokeStyle(2, baseStrokeColor);
        selectionRing.setVisible(false);
        container.setScale(1.0);
      },
    });

    if (interactiveEnabled) {
      s.marketSelectionByCardId.set(card.id, selection);

      // Business AND community-space cards in the Development row are
      // draggable (drag-to-buy/place). Events and upgrades stay click-only:
      // they live in the market row but are not part of the drag-drop
      // module's dev-row model (CG-0MSKSAREE007AYSZ + operator decision A
      // for the T13 Library drag support).
      const isDraggableCard =
        (card.family === 'business' || card.family === 'community-space') &&
        !!s.dragDropManager && !s.replayMode;

      if (isDraggableCard) {
        // ── Draggable card (drag-to-buy/place) ────────────────
        // The container itself is the interactive object: the reusable
        // drag-drop module makes it draggable, and click-vs-drag
        // coexistence is preserved by firing the click path only when the
        // pointer did not move beyond the drag threshold (a pure click
        // still reaches onBusinessCardClick → buy-to-hand).
        const hitAreaRect = new Phaser.Geom.Rectangle(
          -marketCardW / 2, -marketCardH / 2, marketCardW, marketCardH,
        );
        s.dragDropManager.registerDraggable({
          gameObject: container,
          data: card.id,
          hitArea: hitAreaRect,
          canPickUp: () => s.msTurnController.canPickUpBusinessCard(card.id),
          onDrop: (payload: any) => s.msTurnController.onDragDropBusiness(payload),
        });
        this.dragDropRegistered.add(container);
        container.setName(`ms-market-card-${card.id}`);

        const dragClickDistance =
          s.input?.dragDistanceThreshold ?? DEFAULT_DRAG_DISTANCE_THRESHOLD;
        container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          const moved = Phaser.Math.Distance.Between(
            pointer.downX, pointer.downY, pointer.x, pointer.y,
          );
          if (moved > dragClickDistance) return; // was a drag, not a click
          s.marketSelectionManager.select(selection);
          onClick(card);
        });
        container.on('pointerover', () => {
          selection.setHovered(true);
          const info = buildCardTooltipInfo(card, s.state.config, { includeEventDetail: true });
          s.tooltipManager?.show(info, container.x, container.y);
        });
        container.on('pointerout', () => {
          selection.setHovered(false);
          s.tooltipManager?.hide();
        });
        s.marketSelectionManager.registerTarget(container);
      } else {
        // ── Click-only card (event, upgrade) ────────────────
        // Existing pointerdown-based path, unchanged.
        const hitArea = s.add.rectangle(0, 0, marketCardW, marketCardH, 0x000000, 0.001);
        hitArea.setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
          s.marketSelectionManager.select(selection);
          onClick(card);
        });
        hitArea.on('pointerover', () => {
          selection.setHovered(true);
          if (!s.replayMode) {
            const info = buildCardTooltipInfo(card, s.state.config, { includeEventDetail: true });
            s.tooltipManager?.show(info, container.x, container.y);
          }
        });
        hitArea.on('pointerout', () => {
          selection.setHovered(false);
          if (!s.replayMode) s.tooltipManager?.hide();
        });
        s.marketSelectionManager.registerTarget(hitArea);
        container.add(hitArea);
      }

      // Dim visual feedback + tooltip for business cards gated by the spent
      // action budget (CG-0MSTOF1N5005PK2R): still hoverable so the player
      // learns why the card is unavailable.
      if (isBusinessLike && noActions && !isIncidentEvent) {
        container.setAlpha(0.45);
        container.setInteractive({ useHandCursor: false });
        container.on('pointerover', () => {
          if (s.replayMode) return;
          s.tooltipManager?.show(
            'No actions remaining today. End your turn to start a new day.',
            container.x, container.y,
          );
        });
        container.on('pointerout', () => {
          s.tooltipManager?.hide();
        });
      }
    }

    return container;
  }

  /**
   * Centre of the front incident-queue card, mirroring `refreshIncidentQueue`
   * layout math (panel title 22px + 8px pad, card centred horizontally in
   * the panel). Used as the origin of the incident-reveal flight.
   * Keep in sync with `refreshIncidentQueue` if the queue layout changes.
   */
  public getFrontIncidentCardCenter(): { x: number; y: number } {
    const s = this.scene;
    const { logX, logW, queueTop, queueCardH } = s.layout;
    const titleH = 22; // mirrors refreshIncidentQueue
    const pad = 8;     // mirrors refreshIncidentQueue
    return {
      x: logX + logW / 2,
      y: queueTop + titleH + pad + queueCardH / 2,
    };
  }

  public refreshIncidentQueue(): void {
    const s = this.scene;
    s.incidentQueueContainer.removeAll(true);

    const queue = s.state.incidentDeck;
    const deckRemaining = s.state.decks.event.length;
    const activeEffects = s.state.activeEffects;

    const { logX, logW, queueTop } = s.layout;

    // Same panel width and left-edge as the activity log
    const panelX = logX;
    const panelW = logW;
    const pad = 8;
    const titleH = 22;
    const contentX = panelX + pad;

    // Calculate dynamic height
    const activeEffectLines = activeEffects.length;
    const extraH = activeEffectLines > 0 ? 16 + activeEffectLines * 16 : 0;
    const cardRenderW = s.layout.queueCardW;
    const cardRenderH = s.layout.queueCardH;
    const maxCards = Math.min(2, queue.length);
    const cardAreaH = maxCards * (cardRenderH + 6) - 6 + 12; // cards + deck count
    const panelH = titleH + pad + cardAreaH + extraH + pad;

    // Panel background — same warm-dark style as activity log
    const bg = s.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(panelX, queueTop, panelW, panelH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(panelX, queueTop, panelW, panelH, 4);
    s.incidentQueueContainer.add(bg);

    // Title bar — same style as activity log
    const titleBg = s.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(panelX, queueTop, panelW, titleH, { tl: 4, tr: 4, bl: 0, br: 0 });
    s.incidentQueueContainer.add(titleBg);

    const titleText = s.add.text(panelX + panelW / 2, queueTop + titleH / 2, 'Upcoming', {
      fontSize: '12px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    s.incidentQueueContainer.add(titleText);

    // Queue cards — stacked vertically, centred in the panel
    // Dimensions come from layout.queueCardW/queueCardH (currently 120×69)
    // to preserve the standard 7:4 SVG aspect ratio.
    let cardY = queueTop + titleH + pad;

    for (let i = 0; i < maxCards; i++) {
      const card = queue[i];
      const cx = panelX + (panelW - cardRenderW) / 2;

      if (card) {
        const container = s.add.container(Math.round(cx + cardRenderW / 2), Math.round(cardY + cardRenderH / 2));
        mainStreetRenderCardSvg(s, container, card.id, cardRenderW, cardRenderH);
        s.incidentQueueContainer.add(container);

        if (!s.replayMode) {
          const hover = s.add.rectangle(0, 0, cardRenderW, cardRenderH, 0x000000, 0.001);
          hover.setInteractive({ useHandCursor: true });
          hover.on('pointerover', () => {
            let info: string;
            const dCard = card as any;
            if (dCard.duration !== undefined) {
              info = 'Event: ' + card.name + '\nEffect: ' + card.effect + '\nDuration: ' + dCard.duration + ' turns\n' + Math.round(dCard.multiplier * 100) + '% income modifier';
            } else {
              const coinDelta = card.coinDelta >= 0 ? '+' : '';
              info = 'Event: ' + card.name + '\nEffect: ' + card.effect + '\nCoins: ' + coinDelta + card.coinDelta.toFixed(3) + ', Rep: ' + (card.reputationDelta >= 0 ? '+' : '') + card.reputationDelta;
            }
            s.tooltipManager?.show(info, container.x, container.y);
          });
          hover.on('pointerout', () => s.tooltipManager?.hide());
          container.add(hover);
        }
      } else {
        // Empty queue slot
        const empty = s.add.rectangle(
          cx + cardRenderW / 2, cardY + cardRenderH / 2,
          cardRenderW, cardRenderH, 0x111122, 0.3,
        );
        empty.setStrokeStyle(1, 0x223344);
        s.incidentQueueContainer.add(empty);
      }

      cardY += cardRenderH + 6;
    }

    // Deck count below cards
    const deckText = s.add.text(contentX, cardY, 'Deck: ' + deckRemaining, {
      fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0);
    s.incidentQueueContainer.add(deckText);
    cardY += 18;

    // Active Effects indicator
    if (activeEffectLines > 0) {
      for (let i = 0; i < activeEffects.length; i++) {
        const effect = activeEffects[i];
        const warnIcon = String.fromCodePoint(0x26A0);
        const dash = String.fromCodePoint(0x2014);
        const effectText = s.add.text(contentX, cardY, warnIcon + ' ' + effect.description + ' ' + dash + ' ' + effect.turnsRemaining + ' turn' + (effect.turnsRemaining !== 1 ? 's' : ''), {
          fontSize: '10px', color: '#ff6644', fontFamily: FONT_FAMILY,
        }).setOrigin(0, 0);
        s.incidentQueueContainer.add(effectText);

        if (!s.replayMode) {
          const hitArea = s.add.rectangle(
            panelX + panelW / 2, cardY + 8, panelW - 20, 14, 0x000000, 0.001,
          ).setInteractive({ useHandCursor: true });
          hitArea.on('pointerover', () => {
            s.tooltipManager?.show(
              'Active: ' + effect.description + '\n' + Math.round(effect.multiplier * 100) + '% modifier ' + dash + ' ' + effect.turnsRemaining + ' turn' + (effect.turnsRemaining !== 1 ? 's' : '') + ' remaining',
              hitArea.x, hitArea.y,
            );
          });
          hitArea.on('pointerout', () => s.tooltipManager?.hide());
          s.incidentQueueContainer.add(hitArea);
        }
        cardY += 16;
      }
    }
  }

  public refreshPlayerHand(): void {
    const s = this.scene;
    // handContainer zone kept for backward-compat (zone-metadata tests)
    s.handContainer.removeAll(true);

    // Render the merged hand (any mix of business and event cards) via the
    // single HandView — HandView gracefully handles an empty array.
    const hand = s.state.hand ?? [];
    this.handView.setCards(hand);

    // Transfer-animation hiding is handled in the hand renderCard callback
    // via hiddenTransferSourceCardIds (see above) — the old alpha=0 branch
    // here was dead code: pendingHandIndex is nulled before refreshAll() in
    // onSlotClick, so uiPhase==='animating' && pendingHandIndex!==null never
    // held (CG-0MSOKUOUE005LQFZ audit AC3).

    // Restore selection highlight when in placing-from-hand phase
    if (s.uiPhase === 'placing-from-hand' && s.pendingHandIndex !== null) {
      this.updateBusinessHandSelection(s.pendingHandIndex);
    }
  }

  /**
   * Render held-event cards via the shared adapter using the same Phaser
   * texture pipeline used by market/street/incident cards.
   */
  /**
   * Legacy single-event-card renderer — kept for backward compat.
   * New code should use the HandView renderCard callback instead.
   * @deprecated Use HandView with renderCard callback.
   */
  public drawHeldEventCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    const s = this.scene;
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

  public refreshActionButtons(): void {
    const s = this.scene;
    s.actionContainer.removeAll(true);

    if (s.uiPhase === 'market') {
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;

      // Affordable summary
      const affordable = getAffordableBusinessCards(s.state);
      const upgradeable = getAffordableUpgradeCards(s.state);
      const emptySlots = getEmptySlots(s.state);

      const summaryParts: string[] = [];
      if (affordable.length > 0 && emptySlots.length > 0) {
        summaryParts.push(`${affordable.length} businesses`);
      }
      if (upgradeable.length > 0) {
        summaryParts.push(`${upgradeable.length} upgrades`);
      }
      const summaryStr = summaryParts.length > 0
        ? `Can buy: ${summaryParts.join(', ')}`
        : 'No affordable cards';

      const summary = s.add.text(rightX, by - 4, summaryStr, {
        fontSize: '12px', color: '#887766', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      s.actionContainer.add(summary);

      // End Turn button (right-aligned)
      const btnW = s.layout.actionButtonW;
      const hintBtnW = s.layout.hintButtonW;

      const endBtn = createActionButton(s, rightX - btnW, by + 4, btnW, 'End Turn', () => {
        s.endTurn();
      });
      s.actionContainer.add(endBtn);

      // Hint button (to the left of End Turn)
      const hintBtn = createMainStreetHintButton(
        s, rightX - btnW - 12 - hintBtnW, by + 4, hintBtnW, s.layout.actionButtonH,
        s.hintUsedThisTurn, () => s.onHintClick(),
      );
      s.actionContainer.add(hintBtn);

    } else if (s.uiPhase === 'placing-from-hand') {
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;

      const hand = s.state.hand ?? [];
      const handCount = hand.length;
      const hint = s.add.text(rightX, by - 4, `Card in hand (${handCount}) — click an empty slot to place`, {
        fontSize: '14px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      s.actionContainer.add(hint);

      // Cancel button (right-aligned) — returns to market, card stays in hand
      const btnW = s.layout.actionButtonW;
      const cancelBtn = createActionButton(s, rightX - btnW, by + 4, btnW, 'Cancel', () => {
        s.pendingHandIndex = null;
        s.pendingHandJustMoved = false;
        s.clearMarketSelection();
        s.uiPhase = 'market';
        this.refreshAll();
        s.instructionText.setText(
          `${turnLabel(s.state.config, s.state.turn)} -- Buy cards from the market or End Turn`,
        );
      });
      s.actionContainer.add(cancelBtn);

    } else if (s.uiPhase === 'placing-business') {
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;

      const cardName = s.pendingBusinessCard?.name ?? '???';
      const hint = s.add.text(rightX, by - 4, `Place "${cardName}" -- click an empty slot`, {
        fontSize: '14px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      s.actionContainer.add(hint);

      // Cancel button (right-aligned)
      const btnW = s.layout.actionButtonW;
      const cancelBtn = createActionButton(s, rightX - btnW, by + 4, btnW, 'Cancel', () => {
        s.pendingBusinessCard = null;
        s.pendingBusinessSourceIndex = null;
        s.clearMarketSelection();
        s.uiPhase = 'market';
        this.refreshAll();
        s.instructionText.setText(
          `${turnLabel(s.state.config, s.state.turn)} -- Buy cards from the market or End Turn`,
        );
      });
      s.actionContainer.add(cancelBtn);
    }
  }


  public refreshLog(): void {
    const s = this.scene;
    const entries = s.state.activityLog;
    const newCount = entries.length;

    // Visible area inside the panel (below title bar, above bottom edge)
    const visibleH = Math.max(1, s.layout.logH - LOG_TITLE_H - 4);

    // ── Re-render only if the entry count changed ────────────────
    if (newCount !== s.logPrevEntryCount) {
      s.logPrevEntryCount = newCount;

      // Render ALL entries to compute the true total content height.
      // Per-entry visibility (applied below) hides off-screen entries.
      s.logContentContainer.removeAll(true);

      const contentW = s.layout.logW - LOG_PAD * 2;
      let yOff = 0;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;

        const color = LOG_COLORS[entry.type] ?? LOG_COLORS.neutral;
        const isTurnHeader = entry.type === 'turn-header';

        if (isTurnHeader) {
          // Subtle background bar for turn headers.
          // Use setPosition(0, yOff) so that barBg.y correctly reflects
          // the entry position, enabling per-entry visibility checks.
          const barBg = s.add.graphics();
          barBg.fillStyle(0x443311, 0.5);
          barBg.fillRect(0, 0, s.layout.logW, LOG_LINE_H);
          barBg.setPosition(0, yOff);
          s.logContentContainer.add(barBg);
        }

        const txt = s.add.text(LOG_PAD, yOff, entry.text, {
          fontSize: `${LOG_FONT_SIZE}px`,
          fontStyle: isTurnHeader ? 'bold' : 'normal',
          color,
          fontFamily: FONT_FAMILY,
          wordWrap: { width: contentW },
        });
        s.logContentContainer.add(txt);

        // Use actual rendered height to handle word-wrapped lines
        yOff += Math.max(LOG_LINE_H, txt.height + 2);
      }

      s.logTotalContentH = yOff;
    }

    // ── Compute scroll bounds using actual total content height ──
    if (s.logTotalContentH <= visibleH) {
      s.logMaxScroll = 0;
      s.logScrollOffset = 0;
    } else {
      s.logMaxScroll = s.logTotalContentH - visibleH;

      if (s.logAutoScroll) {
        s.logScrollOffset = s.logMaxScroll;
      } else {
        s.logScrollOffset = Phaser.Math.Clamp(s.logScrollOffset, 0, s.logMaxScroll);
      }

      const atBottom = s.logScrollOffset >= s.logMaxScroll - 4;
      s.logAutoScroll = atBottom;
    }

    // Apply scroll by shifting the content container upward.
    s.logContentContainer.setY(LOG_TITLE_H + 2 - s.logScrollOffset);

    // ── Per-entry visibility safety net ────────────────
    // Phaser 4 RC7's GeometryMask clip is unreliable. As a safety net,
    // explicitly hide any child whose local Y falls outside the visible
    // window [scrollOffset, scrollOffset + visibleH).
    // This ensures no content renders above the title bar or below the
    // panel bottom, regardless of whether the mask clips.
    const visibleStart = s.logScrollOffset;
    const visibleEnd = s.logScrollOffset + visibleH;
    for (const child of s.logContentContainer.list) {
      const localY = (child as any).y;
      if (localY >= visibleStart && localY < visibleEnd) {
        child.setVisible(true);
      } else {
        child.setVisible(false);
      }
    }

    s.updateLogMask();
  }
}
