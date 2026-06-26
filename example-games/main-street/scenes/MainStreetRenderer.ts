/**
 * MainStreetRenderer -- extracted UI/layout rendering helper for Main Street.
 */

import Phaser from 'phaser';
import type { BusinessCard, CommunitySpaceCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
  REFRESH_INVESTMENTS_COST,
  isPawnShopCard,
} from '../MainStreetCards';
import { computeScore } from '../MainStreetEngine';
import {
  buildCoinsTooltip,
  buildReputationTooltip,
  buildScoreTooltip,
  HUD_ARIA_LABELS,
} from './MainStreetHudTooltips';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canRefreshInvestments,
} from '../MainStreetMarket';
import {
  FONT_FAMILY,
  HandView,
  attachSelection,
  markHudTransient,
  clearTransientHud,
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
  /** HandView for player hand — uses renderCard for SVG event card rendering. */
  handView!: HandView;

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

    // Create HandView for the player's hand (anticipates multi-event-card support)
    const { handX, handY, handCardW, handCardH } = s.layout;
    // HandView is created at the hand slot centre — renderCard positions cards via HandView layout
    this.handView = new HandView(s, {
      baseX: handX + handCardW / 2,
      baseY: handY + handCardH / 2,
      spacing: handCardW + 10,
      cardWidth: handCardW,
      showLabels: false,
      selectionEnabled: false,
      clickEnabled: false,
      renderCard: (_card, _index) => {
        // The callback returns a Container with SVG-rendered card + hover overlay
        const card = _card as any;
        const container = s.add.container(0, 0);
        const renderW = Math.max(1, Math.round(handCardW - 4));
        const renderH = Math.max(1, Math.round(handCardH - 4));

        // Render SVG card via shared adapter
        mainStreetRenderCardSvg(s, container, card.id, renderW, renderH);

        if (!s.replayMode) {
          const hover = s.add.rectangle(0, 0, handCardW, handCardH, 0x000000, 0.001);
          hover.setInteractive({ useHandCursor: s.uiPhase === 'market' });
          hover.on('pointerover', () => {
            const info = `Event: ${card.name}\nCost: ${card.cost}\nEffect: ${card.effect}`;
            s.tooltipManager?.show(info, container.x, container.y);
          });
          hover.on('pointerout', () => s.tooltipManager?.hide());
          if (s.uiPhase === 'market') {
            hover.on('pointerdown', () => s.onPlayHeldEvent());
          }
          container.add(hover);
        }

        return container;
      },
    });
    s.actionContainer = createGameZone(s, 0, 0, s.layout.gameW, s.layout.gameH, 'actionContainer');

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
    s.logMaskGraphics = s.add.graphics();
    s.logMaskGraphics.setVisible(false);
    s.logContentMask = new Phaser.Display.Masks.GeometryMask(s, s.logMaskGraphics);
    s.logContentContainer.setMask(s.logContentMask);
    s.updateLogMask();

    // Mouse-wheel scroll for the log panel
    s.input.off('wheel', s.handleLogWheel, s);
    s.input.on('wheel', s.handleLogWheel, s);
  }

  public createInstructions(): void {
    const s = this.scene;
    // Centered at bottom
    s.instructionText = s.add
      .text(s.layout.gameW / 2, s.layout.gameH - 20, '', {
        fontSize: '14px',
        color: '#ccaa77',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 1);
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

    // Background strip - 2/3 width, centered
    const strip = markHudTransient(s.add.rectangle(gameW / 2, hudY, gameW * 0.66, 28, 0x1a1408, 0.6));
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    s.hudContainer.add(strip);

    // Coins - centered in strip
    const stripWidth = gameW * 0.66;
    const stripLeft = (gameW - stripWidth) / 2;
    const coinText = markHudTransient(s.add.text(stripLeft + stripWidth * 0.25, hudY, `Coins: ${coins}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(coinText);

    // Reputation - centered in strip
    const repText = markHudTransient(s.add.text(stripLeft + stripWidth * 0.5, hudY, `Rep: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(repText);

    // Score - right side of strip (shows x / y where y is the win threshold)
    const scoreText = markHudTransient(s.add.text(stripLeft + stripWidth * 0.85, hudY, `Score: ${score}/${s.state.config.winThreshold}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(scoreText);

    // HUD tooltip zones (desktop: pointer hover, mobile: tap toggle)
    if (!s.replayMode) {
      attachHudTooltipZone(s, coinText, HUD_ARIA_LABELS.coins, () => buildCoinsTooltip(s.state));
      attachHudTooltipZone(s, repText, HUD_ARIA_LABELS.rep, () => buildReputationTooltip(s.state));
      attachHudTooltipZone(s, scoreText, HUD_ARIA_LABELS.score, () => buildScoreTooltip(s.state, s.campaign));
    }

    s.animateHudValueChanges({
      coins,
      reputation,
      coinX: stripLeft + stripWidth * 0.25 + 80,
      repX: stripLeft + stripWidth * 0.5 + 65,
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

    // Apply upgrade overlays (level badge, income, name, border)
    this.applyUpgradeOverlays(cardContainer, biz, renderW, renderH);

    s.streetContainer.add(cardContainer);

    if (isHinted) {
      const hintRect = s.add.rectangle(x + slotW / 2, y + slotH / 2, slotW, slotH);
      hintRect.setStrokeStyle(3, 0x44ffff);
      hintRect.setFillStyle(0x000000, 0);
      s.streetContainer.add(hintRect);
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
        const synergyNote = isPawnShopCard(biz) ? ' (excluded from synergy)' : '';
        const isCommunitySpace = (biz as any).family === 'community-space';
        const label = isCommunitySpace ? 'Community Space' : 'Business';
        const info = `${label}: ${biz.name}\nIncome: +${biz.baseIncome + biz.incomeBonus}\nSynergy: ${biz.synergyTypes.join('/')}${synergyNote}\nLevel: ${biz.level}`;
        s.tooltipManager?.show(info, tooltipZone.x, tooltipZone.y);
      });
      tooltipZone.on('pointerout', () => {
        s.tooltipManager?.hide();
      });
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

    // Income text (bottom center)
    if (spec.incomeText) {
      const incomeText = this.scene.add.text(
        spec.incomeText.x,
        spec.incomeText.y,
        spec.incomeText.text,
        {
          fontSize: spec.incomeText.fontSize ?? '12px',
          fontStyle: spec.incomeText.fontStyle,
          color: spec.incomeText.color,
          fontFamily: FONT_FAMILY,
        },
      );
      incomeText.setOrigin(0.5, 1);
      container.add(incomeText);
    }
  }

  public drawEmptySlot(x: number, y: number, index: number): void {
    const s = this.scene;
    const { slotW, slotH } = s.layout;
    const isSelectable = s.uiPhase === 'placing-business';
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
    if (isSelectable && s.pendingBusinessCard) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => s.onSlotClick(index));
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0x44ff44));
      bg.on('pointerout', () => bg.setStrokeStyle(2, 0xffdd44));
    }
  }

  public refreshMarket(): void {
    const s = this.scene;
    s.marketContainer.removeAll(true);
    s.marketSelectionManager.clear();
    s.marketSelectionManager.clearTargets();
    s.marketSelectionByCardId.clear();
    s.selectedMarketCardId = null;

    const { marketTop, marketRowH, marketRowGap, logX } = s.layout;

    // Wider section background — extends from left edge to near the activity log (logX - 20px margin)
    const bgLeft = 20;
    const bgRight = logX - 20; // 820 - 20 = 800
    const totalH = 2 * marketRowH + marketRowGap + 20;
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

    // Development row (business + community space cards)
    this.drawMarketRow(
      marketTop + 6,
      'Development',
      'development',
      s.state.market.development,
      MARKET_BUSINESS_SLOTS,
      (card) => s.onBusinessCardClick(card as BusinessCard),
    );

    // Investments row (mixed upgrades + investment events)
    this.drawMarketRow(
      marketTop + 6 + marketRowH + marketRowGap,
      'Investments',
      'investments',
      s.state.market.investments,
      MARKET_INVESTMENT_SLOTS,
      (card) => {
        if (card.family === 'upgrade') {
          s.onUpgradeCardClick(card as UpgradeCard);
        } else {
          s.onEventCardClick(card as EventCard);
        }
      },
    );
  }

  public drawMarketRow(
    y: number,
    rowLabel: string,
    rowKey: string,
    cards: readonly (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard) => void,
  ): void {
    const s = this.scene;
    const { marketCardW, marketCardH, marketCardGap, logX } = s.layout;

    // Row label - also use for positioning deck count
    const label = s.add.text(40, y, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.marketContainer.add(label);

    // Centre cards in the wider market box (20 to logX-20)
    const boxLeft = 20;
    const boxRight = logX - 20;
    const boxCenter = (boxLeft + boxRight) / 2;
    const totalCardsW = maxSlots * marketCardW + (maxSlots - 1) * marketCardGap;
    const startX = Math.round(boxCenter - totalCardsW / 2);

    for (let i = 0; i < maxSlots; i++) {
      const cx = startX + i * (marketCardW + marketCardGap);
      const card = cards[i];

      if (card && !s.hiddenTransferSourceCardIds.has(card.id)) {
        const cardObj = this.drawMarketCard(cx, y, card, onClick, rowKey, i);
        s.marketContainer.add(cardObj);
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

    // Deck count - immediately below the label
    const deckY = y + 16;
    if (rowLabel === 'Business') {
      const deckCount = s.state.decks.business.length;
      const deckText = s.add.text(40, deckY, `Deck: ${deckCount}`, {
        fontSize: '12px', color: '#776655', fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0);
      s.marketContainer.add(deckText);
    } else {
      // Investments row: show both upgrade and event deck counts - below label
      const upgCount = s.state.decks.upgrade.length;
      const evtCount = s.state.decks.event.length;
      const deckText = s.add.text(
        40, deckY,
        `Upg: ${upgCount}  Evt: ${evtCount}`,
        { fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0);
      s.marketContainer.add(deckText);

      // Refresh Investments button (centered under Investments label / deck count)
      try {
        const canRefresh = canRefreshInvestments(s.state).legal;
        // Make button wider so label fits, and move it lower to avoid overlapping deck text
        const btnW = Math.max(s.layout.smallButtonW, 96);
        // center under the label area: label left (40) + half label width
        const labelCenter = 40 + s.layout.marketLabelW / 2;
        const btnX = Math.round(labelCenter - btnW / 2);
        const btnY = deckY + 22; // further below deck text to avoid overlap

        const labelText = `Research (${REFRESH_INVESTMENTS_COST})`;

        const btn = createActionButton(s, btnX, btnY, btnW, labelText, canRefresh ? () => { s.onRefreshInvestmentsClick(); } : () => {}, {
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

            // Tooltip for the Research button (attach to bg so it receives pointer events)
            const info = `Pay $${REFRESH_INVESTMENTS_COST} to research new investment opportunities and replace the visible investments row. Removed cards go to their discard piles. Available only during Market phase.`;
            try {
              bg.on('pointerover', (pointer: any) => {
                if (s.tooltipManager) {
                  s.tooltipManager.show(info, (pointer && pointer.worldX) || btn.x, (pointer && pointer.worldY) || btn.y);
                  return;
                }
                // Fallback: create an in-canvas text tooltip if DOM tooltip manager isn't available
                try {
                  if ((s as any)._tempResearchTooltip) {
                    (s as any)._tempResearchTooltip.destroy();
                    (s as any)._tempResearchTooltip = null;
                  }
                  const tt = s.add.text(btn.x, btn.y - s.layout.actionButtonH / 2 - 6, info, {
                    fontSize: '12px', color: '#ffffff', fontFamily: FONT_FAMILY, backgroundColor: 'rgba(0,0,0,0.85)', padding: { x: 6, y: 4 }, wordWrap: { width: 280 }, align: 'center'
                  }).setOrigin(0.5, 1).setDepth(1000);
                  (s as any)._tempResearchTooltip = tt;
                } catch (e) { /* ignore fallback errors */ }
              });
              bg.on('pointerout', () => {
                if (s.tooltipManager) {
                  s.tooltipManager.hide();
                  return;
                }
                try {
                  if ((s as any)._tempResearchTooltip) {
                    (s as any)._tempResearchTooltip.destroy();
                    (s as any)._tempResearchTooltip = null;
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

    const selectionRing = s.add.rectangle(0, 0, marketCardW, marketCardH);
    selectionRing.setFillStyle(0x000000, 0);
    selectionRing.setStrokeStyle(2, 0x44ff66);
    selectionRing.setVisible(false);
    container.add(selectionRing);

    const interactiveEnabled = s.uiPhase === 'market' && !isIncidentEvent;
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

      const hitArea = s.add.rectangle(0, 0, marketCardW, marketCardH, 0x000000, 0.001);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => {
        s.marketSelectionManager.select(selection);
        onClick(card);
      });
      hitArea.on('pointerover', () => {
        selection.setHovered(true);
        if (!s.replayMode) {
          let info = '';
          if (card.family === 'business') {
            const b = card as any;
            const bSynergyNote = isPawnShopCard(b) ? ' (excluded from synergy)' : '';
            info = `Business: ${b.name}\nCost: ${b.cost}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn\nSynergy: ${(b.synergyTypes || []).join('/')}${bSynergyNote}\n${b.description ?? ''}`;
          } else if (card.family === 'community-space') {
            const cs = card as any;
            const csSynergyNote = isPawnShopCard(cs) ? ' (excluded from synergy)' : '';
            info = `Community Space: ${cs.name}\nCost: ${cs.cost}\nIncome: +${cs.baseIncome + (cs.incomeBonus || 0)}/turn\nSynergy: ${(cs.synergyTypes || []).join('/')}${csSynergyNote}\n${cs.description ?? ''}`;
          } else if (card.family === 'event') {
            const e = card as any;
            info = `Event: ${e.name}\nCost: ${e.cost}\nEffect: ${e.effect}\nCoins: ${e.coinDelta >= 0 ? '+' : ''}${e.coinDelta}, Rep: ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}`;
          } else if (card.family === 'upgrade') {
            const u = card as any;
            info = `Upgrade: ${u.name}\nCost: ${u.cost}\nApplies to: ${u.targetBusiness}\nIncome Bonus: +${u.incomeBonus}\nRequires: Lv${u.requiredLevel ?? 0}\n${u.description ?? ''}`;
          }
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

    return container;
  }

  public refreshIncidentQueue(): void {
    const s = this.scene;
    s.incidentQueueContainer.removeAll(true);

    const queue = s.state.incidentQueue;
    const deckRemaining = s.state.decks.event.length;
    const activeEffects = s.state.activeEffects;

    const { logX, logW, queueTop, queueCardH } = s.layout;

    // Same panel width and left-edge as the activity log
    const panelX = logX;
    const panelW = logW;
    const pad = 8;
    const titleH = 22;
    const contentX = panelX + pad;

    // Calculate dynamic height
    const activeEffectLines = activeEffects.length;
    const extraH = activeEffectLines > 0 ? 16 + activeEffectLines * 16 : 0;
    const maxCards = Math.min(INCIDENT_QUEUE_SIZE, queue.length);
    const cardAreaH = maxCards * (queueCardH + 6) - 6 + 12; // cards + deck count
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
    let cardY = queueTop + titleH + pad;
    const cardRenderW = Math.max(1, Math.round(panelW - pad * 2 - 8));
    const cardRenderH = Math.max(1, Math.round(queueCardH));

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
              info = 'Event: ' + card.name + '\nEffect: ' + card.effect + '\nCoins: ' + (card.coinDelta >= 0 ? '+' : '') + card.coinDelta + ', Rep: ' + (card.reputationDelta >= 0 ? '+' : '') + card.reputationDelta;
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

    const held = s.state.heldEvent;

    if (held) {
      // Use HandView with renderCard callback — anticipates multi-card support
      this.handView.setCards([held] as any);
    } else {
      // Empty hand — HandView gracefully handles empty array (no sprites)
      this.handView.setCards([]);
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
        const info = `Event: ${card.name}\nCost: ${card.cost}\nEffect: ${card.effect}`;
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
          `Turn ${s.state.turn} / ${s.state.config.maxTurns} -- Buy cards from the market or End Turn`,
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
    const maxDisplayEntries = Math.max(1, Math.ceil(visibleH / LOG_LINE_H));

    // Compute scroll bounds and start index
    let startIdx: number;
    if (entries.length <= maxDisplayEntries) {
      // All entries fit — no scrolling needed
      startIdx = 0;
      s.logMaxScroll = 0;
      if (s.logAutoScroll) s.logScrollOffset = 0;
    } else {
      const hiddenCount = entries.length - maxDisplayEntries;
      const newMaxScroll = hiddenCount * LOG_LINE_H;
      s.logMaxScroll = newMaxScroll;

      if (s.logAutoScroll) {
        s.logScrollOffset = newMaxScroll;
      }
      s.logScrollOffset = Phaser.Math.Clamp(s.logScrollOffset, 0, s.logMaxScroll);

      startIdx = Math.round(s.logScrollOffset / LOG_LINE_H);
      // Clamp to valid range
      startIdx = Math.max(0, Math.min(startIdx, entries.length - maxDisplayEntries));
    }

    // Track whether the scroll position counts as 'at the bottom' for auto-scroll
    const atBottom = s.logScrollOffset >= s.logMaxScroll - 4;
    s.logAutoScroll = atBottom;

    // Skip rebuild if neither entry count nor visible window changed
    if (newCount === s.logPrevEntryCount && startIdx === s.logRenderedStartIdx) return;

    s.logPrevEntryCount = newCount;
    s.logRenderedStartIdx = startIdx;

    // Clear existing content
    s.logContentContainer.removeAll(true);

    const contentW = s.layout.logW - LOG_PAD * 2;
    let yOff = 0;

    // Render only the visible window (plus one extra for partial visibility)
    const endIdx = Math.min(entries.length, startIdx + maxDisplayEntries + 1);
    for (let i = startIdx; i < endIdx; i++) {
      const entry = entries[i];
      if (!entry) continue;

      const color = LOG_COLORS[entry.type] ?? LOG_COLORS.neutral;
      const isTurnHeader = entry.type === 'turn-header';

      if (isTurnHeader) {
        // Subtle background bar for turn headers
        const barBg = s.add.graphics();
        barBg.fillStyle(0x443311, 0.5);
        barBg.fillRect(0, yOff, s.layout.logW, LOG_LINE_H);
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

    // Reset container to its default position — entries are rendered at correct y
    s.logContentContainer.setY(LOG_TITLE_H + 2);
    s.updateLogMask();
  }
}
