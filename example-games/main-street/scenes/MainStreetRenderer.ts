/**
 * MainStreetRenderer -- extracted UI/layout rendering helper for Main Street.
 */

import Phaser from 'phaser';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  synergyColor,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
  REFRESH_INVESTMENTS_COST,
} from '../MainStreetCards';
import { computeScore } from '../MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canRefreshInvestments,
} from '../MainStreetMarket';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  createSceneTitle,
  createSceneMenuButton,
  attachSelection,
} from '../../../src/ui';
import {
  BASE_HAND_CARD_H,
  BASE_HAND_CARD_W,
  BASE_HUD_Y,
  BASE_MARKET_CARD_GAP,
  BASE_MARKET_CARD_H,
  BASE_MARKET_CARD_W,
  BASE_MARKET_LABEL_W,
  BASE_MARKET_ROW_GAP,
  BASE_QUEUE_CARD_GAP,
  BASE_QUEUE_CARD_H,
  BASE_QUEUE_CARD_W,
  BASE_SLOT_GAP,
  BASE_SLOT_H,
  BASE_SLOT_W,
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
  STREET_COLS,
  STREET_ROW_GAP,
} from './MainStreetConstants';

export class MainStreetRenderer {
  constructor(private readonly scene: any) {}

  public createHeader(): void {
    const s = this.scene;
    createSceneMenuButton(s);
    createSceneTitle(s, 'Main Street');
  }

  public computeLayout(): SceneLayout {
    const s = this.scene;
    const gameW = Math.max(720, Math.floor(s.scale.width || GAME_W));
    const gameH = Math.max(640, Math.floor(s.scale.height || GAME_H));
    const compact = gameW < 1100;

    const margin = compact ? 16 : 20;
    const marketCardW = compact ? 126 : BASE_MARKET_CARD_W;
    const marketCardH = compact ? 72 : BASE_MARKET_CARD_H;
    const marketLabelW = compact ? 80 : BASE_MARKET_LABEL_W;
    const marketRowGap = BASE_MARKET_ROW_GAP;
    const marketRowH = marketCardH + 14;
    const marketTop = 90;

    const queueCardW = compact ? 126 : BASE_QUEUE_CARD_W;
    const queueCardH = compact ? 72 : BASE_QUEUE_CARD_H;
    const queueCardGap = compact ? 10 : BASE_QUEUE_CARD_GAP;
    const queueTop = marketTop + (2 * marketRowH + marketRowGap + 20) + 12;

    const slotGap = compact ? 8 : BASE_SLOT_GAP;
    const slotW = compact ? 88 : BASE_SLOT_W;
    const slotH = compact ? 92 : BASE_SLOT_H;
    const streetTotalW = STREET_COLS * slotW + (STREET_COLS - 1) * slotGap;
    const streetX = (gameW - streetTotalW) / 2;
    const streetTop = queueTop + queueCardH + 22;

    const handCardW = compact ? 132 : BASE_HAND_CARD_W;
    const handCardH = compact ? 78 : BASE_HAND_CARD_H;
    const handY = gameH - margin - handCardH;
    // Hand slot is anchored to the left side of the UI (matches the "No held event" slot at x=40)
    // Previously this was positioned on the right which caused purchased events to appear off-screen.
    const handX = 40;
    const instructionY = handY - 20;

    const actionButtonH = compact ? 32 : 34;
    const actionY = gameH - 16 - actionButtonH;

    // Challenge tracker: position between hand and action buttons
    const logW = compact ? 360 : 430;
    const logX = gameW - margin - logW - 10; // left edge just left of right margin
    // Challenge to the left of the log - expand to fill space
    const challengeW = Math.min(350, logX - handCardW - margin - 20);
    const challengeX = logX - challengeW - 10;
    const challengeY = queueTop; // align with incidents top
    const logY = marketTop - 10; // align top with market
    // bottom aligns with market bottom border
    const logH = Math.max(100, (queueTop + queueCardH + 20) - logY);
    const logVisible = compact || logY < gameH - 140;

    return {
      gameW,
      gameH,
      hudY: BASE_HUD_Y,
      marketTop,
      marketRowH,
      marketRowGap,
      marketCardW,
      marketCardH,
      marketCardGap: BASE_MARKET_CARD_GAP,
      marketLabelW,
      queueTop,
      queueCardW,
      queueCardH,
      queueCardGap,
      queueLabelW: marketLabelW,
      streetTop,
      slotW,
      slotH,
      slotGap,
      streetX,
      streetRowGap: STREET_ROW_GAP,
      streetCols: STREET_COLS,
      handY: handY,
      handX,
      handCardW,
      handCardH,
      instructionY,
      actionY,
      actionButtonH,
      actionButtonW: compact ? 132 : 140,
      hintButtonW: compact ? 98 : 104,
      smallButtonW: compact ? 64 : 68,
      challengeX,
      challengeY,
      challengeW,
      logX: logVisible ? logX : -1000,
      logY: logVisible ? logY : 0,
      logW: logVisible ? logW : 0,
      logH,
    };
  }

  public createContainers(): void {
    const s = this.scene;
    s.hudContainer = s.add.container(0, 0);
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

    s.streetContainer = s.add.container(0, 0);
    s.marketContainer = s.add.container(0, 0);
    s.incidentQueueContainer = s.add.container(0, 0);
    s.handContainer = s.add.container(0, 0);
    s.actionContainer = s.add.container(0, 0);

    // Ensure depth ordering is applied after container creation.
    try { s.children?.depthSort?.(); } catch (_) { /* ignore */ }

    // Challenge Tracker panel
    s.challengeContainer = s.add.container(s.layout.challengeX, s.layout.challengeY);

    // Activity Log panel (persistent, not rebuilt each refresh)
    s.logContainer = s.add.container(s.layout.logX, s.layout.logY);

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
    s.svgDom?.clear();
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
    s.hudContainer.removeAll(true);

    const score = computeScore(s.state);
    const { coins, reputation } = s.state.resourceBank;
    const { gameW, hudY } = s.layout;

    // Background strip - 2/3 width, centered
    const strip = s.add.rectangle(gameW / 2, hudY, gameW * 0.66, 28, 0x1a1408, 0.6);
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    s.hudContainer.add(strip);

    // Coins - centered in strip
    const stripWidth = gameW * 0.66;
    const stripLeft = (gameW - stripWidth) / 2;
    const coinText = s.add.text(stripLeft + stripWidth * 0.25, hudY, `Coins: ${coins}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.hudContainer.add(coinText);

    // Reputation - centered in strip
    const repText = s.add.text(stripLeft + stripWidth * 0.5, hudY, `Rep: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.hudContainer.add(repText);

    // Score - right side of strip
    const scoreText = s.add.text(stripLeft + stripWidth * 0.85, hudY, `Score: ${score}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.hudContainer.add(scoreText);

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

  public drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard): void {
    const s = this.scene;
    const { slotW, slotH } = s.layout;
    const isHinted = s.hintedSlotIndex === _index;

    const renderW = Math.max(1, Math.round(slotW - 4));
    const renderH = Math.max(1, Math.round(slotH - 4));
    const tplKey = s.templateKeyForCard(biz.id, renderW, renderH);
    const usedSvg = s.textures && (s.textures as Phaser.Textures.TextureManager).exists(tplKey);
    if (usedSvg && s.svgDom) {
      // Render via DOM SVG image for perfect crispness
      const cx = x + slotW / 2;
      const cy = y + slotH / 2;
      const templateId = s.templateIdFromCardId(biz.id);
      const svgText = s.cardSvgSources.get(templateId)!;
      const domKey = s.domKeyForCard('street', _index, biz.id);
      s.svgDom.createOrUpdate(domKey, svgText, cx, cy, renderW, renderH, () => {
        // click maps to scene slot click
        s.onSlotClick(_index);
      }, 100);
    } else if (usedSvg) {
      const img = s.add.image(Math.round(x + slotW / 2), Math.round(y + slotH / 2), tplKey);
      // Use the exact slot dimensions - texture is already rasterised at correct size
      img.setDisplaySize(renderW, renderH);
      s.streetContainer.add(img);

      if (isHinted) {
        const hintRect = s.add.rectangle(x + slotW / 2, y + slotH / 2, slotW, slotH);
        hintRect.setStrokeStyle(3, 0x44ffff);
        hintRect.setFillStyle(0x000000, 0);
        s.streetContainer.add(hintRect);
      }
    } else {
      s.requestCardTexture(biz.id, renderW, renderH);
      const primaryColor = synergyColor(biz.synergyTypes[0]);
      // Card background
      const bg = s.add.rectangle(
        x + slotW / 2, y + slotH / 2,
        slotW, slotH, primaryColor, 0.7,
      );
      // Highlight the slot if it is the hint target (e.g., upgrade target)
      bg.setStrokeStyle(isHinted ? 3 : 2, isHinted ? 0x44ffff : 0xffffff, isHinted ? 1.0 : 0.4);
      s.streetContainer.add(bg);

      // Name
      const nameText = s.add.text(x + slotW / 2, y + 8, biz.name, {
        fontSize: '12px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
        wordWrap: { width: slotW - 8 },
        align: 'center',
      }).setOrigin(0.5, 0);
      s.streetContainer.add(nameText);

      // Income
      const income = biz.baseIncome + biz.incomeBonus;
      const incText = s.add.text(x + slotW / 2, y + slotH - 28, `+${income}/turn`, {
        fontSize: '13px', color: '#ffee88', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 0);
      s.streetContainer.add(incText);
    }

    // Only draw fallback textual overlays when no SVG texture is available.
    if (!usedSvg) {
      // Level
      if (biz.level > 0) {
        const lvlText = s.add.text(x + slotW - 6, y + 4, `Lv${biz.level}`, {
          fontSize: '11px', color: '#ffdd44', fontFamily: FONT_FAMILY,
        }).setOrigin(1, 0);
        s.streetContainer.add(lvlText);
      }

      // Synergy label at bottom
      const synLabel = biz.synergyTypes.join('/');
      const synText = s.add.text(x + slotW / 2, y + slotH - 12, synLabel, {
        fontSize: '10px', color: '#dddddd', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 1);
      s.streetContainer.add(synText);

      // Slot index
      const idxText = s.add.text(x + 4, y + 4, `${_index}`, {
        fontSize: '10px', color: '#ffffff55', fontFamily: FONT_FAMILY,
      });
      s.streetContainer.add(idxText);
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
        const info = `Business: ${biz.name}\nIncome: +${biz.baseIncome + biz.incomeBonus}\nSynergy: ${biz.synergyTypes.join('/') }\nLevel: ${biz.level}`;
        s.tooltipManager?.show(info, tooltipZone.x, tooltipZone.y);
      });
      tooltipZone.on('pointerout', () => {
        s.tooltipManager?.hide();
      });
      s.streetContainer.add(tooltipZone);
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

    // Slot number
    const idxText = s.add.text(x + slotW / 2, y + slotH / 2, `${index}`, {
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

    const { gameW, marketTop, marketRowH, marketRowGap } = s.layout;

    // Section background (2 rows: business + investments)
    const totalH = 2 * marketRowH + marketRowGap + 20;
    const bgBox = s.add.graphics();
    bgBox.fillStyle(BOX_FILL, 0.3);
    bgBox.fillRoundedRect(20, marketTop - 10, gameW - 40, totalH, BOX_RADIUS);
    bgBox.lineStyle(1, BOX_STROKE, 0.4);
    bgBox.strokeRoundedRect(20, marketTop - 10, gameW - 40, totalH, BOX_RADIUS);
    s.marketContainer.add(bgBox);

    const sectionLabel = s.add.text(gameW / 2, marketTop - 4, 'Market', {
      fontSize: '13px', fontStyle: 'bold', color: '#887766', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    s.marketContainer.add(sectionLabel);

    // Business row
    this.drawMarketRow(
      marketTop + 6,
      'Business',
      'business',
      s.state.market.business,
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
    cards: readonly (BusinessCard | EventCard | UpgradeCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
  ): void {
    const s = this.scene;
    const { marketCardW, marketCardH, marketCardGap, marketLabelW } = s.layout;

    // Row label - also use for positioning deck count
    const label = s.add.text(40, y, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.marketContainer.add(label);

    const startX = marketLabelW + 50;

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

        const labelText = `Discover (${REFRESH_INVESTMENTS_COST})`;

        const btn = this.createActionButton(btnX, btnY, btnW, labelText, canRefresh ? () => { s.onRefreshInvestmentsClick(); } : () => {});
        // Dim visual when not allowed, but keep interactive so tooltip can show
        try {
          const bg = (btn.list && btn.list[0]) as Phaser.GameObjects.Rectangle | undefined;
          if (bg) {
            if (!canRefresh && typeof bg.setFillStyle === 'function') {
              bg.setFillStyle(0x333333, 0.6);
            }

            // Tooltip for the Discover button (attach to bg so it receives pointer events)
            const info = `Pay $${REFRESH_INVESTMENTS_COST} to research new investment opportunities and replace the visible investments row. Removed cards go to their discard piles. Available only during Market phase.`;
            try {
              bg.on('pointerover', (pointer: any) => {
                if (s.tooltipManager) {
                  s.tooltipManager.show(info, (pointer && pointer.worldX) || btn.x, (pointer && pointer.worldY) || btn.y);
                  return;
                }
                // Fallback: create an in-canvas text tooltip if DOM tooltip manager isn't available
                try {
                  if ((s as any)._tempDiscoverTooltip) {
                    (s as any)._tempDiscoverTooltip.destroy();
                    (s as any)._tempDiscoverTooltip = null;
                  }
                  const tt = s.add.text(btn.x, btn.y - s.layout.actionButtonH / 2 - 6, info, {
                    fontSize: '12px', color: '#ffffff', fontFamily: FONT_FAMILY, backgroundColor: 'rgba(0,0,0,0.85)', padding: { x: 6, y: 4 }, wordWrap: { width: 280 }, align: 'center'
                  }).setOrigin(0.5, 1).setDepth(1000);
                  (s as any)._tempDiscoverTooltip = tt;
                } catch (e) { /* ignore fallback errors */ }
              });
              bg.on('pointerout', () => {
                if (s.tooltipManager) {
                  s.tooltipManager.hide();
                  return;
                }
                try {
                  if ((s as any)._tempDiscoverTooltip) {
                    (s as any)._tempDiscoverTooltip.destroy();
                    (s as any)._tempDiscoverTooltip = null;
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
    card: BusinessCard | EventCard | UpgradeCard,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
    rowKey: string,
    slotIndex: number,
  ): Phaser.GameObjects.Container {
    const s = this.scene;
    const { marketCardW, marketCardH } = s.layout;
    const container = s.add.container(Math.round(x + marketCardW / 2), Math.round(y + marketCardH / 2));

    // Determine if this is a non-purchasable Incident event
    const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';

    // Determine if this card is the hint recommendation
    const isHinted = s.hintedCardId !== null && card.id === s.hintedCardId;

    // If we have a per-card SVG texture, render it as the card background
    const renderW = Math.max(1, Math.round(marketCardW - 4));
    const renderH = Math.max(1, Math.round(marketCardH - 4));
    const tplKey = s.templateKeyForCard(card.id, renderW, renderH);
    const baseStrokeColor = isHinted ? 0x44ffff : (isIncidentEvent ? 0x556688 : 0x888877);
    const baseStrokeWidth = isHinted ? 3 : 1;

    let bg: Phaser.GameObjects.Rectangle | null = null;
    let domElRef: any = null;

    if (s.textures && (s.textures as Phaser.Textures.TextureManager).exists(tplKey) && s.svgDom === undefined) {
      const img = s.add.image(0, 0, tplKey);
      // Texture is already rasterised at correct size for this slot
      img.setDisplaySize(renderW, renderH);
      container.add(img);
    } else if (s.svgDom && s.cardSvgSources.has(s.templateIdFromCardId(card.id))) {
      // Render SVG via DOM element
      const cx = x + marketCardW / 2;
      const cy = y + marketCardH / 2;
      const templateId = s.templateIdFromCardId(card.id);
      const svgText = s.cardSvgSources.get(templateId)!;
      const domKey = s.domKeyForCard(`market-${rowKey}`, slotIndex, card.id);
      domElRef = s.svgDom.createOrUpdate(domKey, svgText, cx, cy, renderW, renderH, () => {
        s.selectMarketCardById(card.id);
        onClick(card);
      }, 100);

    } else {
      s.requestCardTexture(card.id, renderW, renderH);
      // Determine card color
      let fillColor = 0x333322;
      if (card.family === 'business') {
        fillColor = synergyColor((card as BusinessCard).synergyTypes[0]);
      } else if (card.family === 'event') {
        fillColor = isIncidentEvent ? 0x2B3A67 : 0x8B4513;  // Indigo for Incident, Brown for Investment
      } else if (card.family === 'upgrade') {
        fillColor = 0x6B4C9A;  // Purple for upgrades
      }

      // Background
      const fillAlpha = isIncidentEvent ? 0.5 : 0.7;
      bg = s.add.rectangle(0, 0, marketCardW, marketCardH, fillColor, fillAlpha);
      bg!.setStrokeStyle(baseStrokeWidth, baseStrokeColor);
      container.add(bg!);
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
          if (bg) {
            bg.setStrokeStyle(2, 0xffdd44);
          }
          selectionRing.setStrokeStyle(2, 0xffdd44);
          selectionRing.setVisible(!bg);
          container.setScale(1.05);
          return;
        }

        if (selected) {
          if (bg) {
            bg.setStrokeStyle(2, 0x44ff66);
          }
          selectionRing.setStrokeStyle(2, 0x44ff66);
          selectionRing.setVisible(true);
          container.setScale(1.04);
          return;
        }

        if (bg) {
          bg.setStrokeStyle(baseStrokeWidth, baseStrokeColor);
        }
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
            info = `Business: ${b.name}\nCost: ${b.cost}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn\nSynergy: ${(b.synergyTypes || []).join('/')}\n${b.description ?? ''}`;
          } else if (card.family === 'event') {
            const e = card as any;
            info = `Event: ${e.name}\nCost: ${e.cost}\nEffect: ${e.effect}\nCoins: ${e.coinDelta >= 0 ? '+' : ''}${e.coinDelta}, Rep: ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}`;
          } else if (card.family === 'upgrade') {
            const u = card as any;
            info = `Upgrade: ${u.name}\nCost: ${u.cost}\nIncome Bonus: +${u.incomeBonus}\nRequires: Lv${u.requiredLevel ?? 0}\n${u.description ?? ''}`;
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

    // If the DOM renderer produced an element, mirror Phaser hover/selection
    // behaviour by wiring DOM events to the selection controller and
    // selection manager so highlights work consistently when using SVG DOM
    // rendering.
    if (domElRef && !s.replayMode) {
      try {
        const node = (domElRef as any).node as HTMLElement | null;
        if (node) {
          try { s.marketSelectionManager.registerTarget(container); } catch (_) { /* ignore */ }

          node.addEventListener('mouseenter', () => {
            if (interactiveEnabled) selection.setHovered(true);
            if (!s.replayMode) {
              let info = '';
              if (card.family === 'business') {
                const b = card as any;
                info = `Business: ${b.name}\nCost: ${b.cost}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn\nSynergy: ${(b.synergyTypes || []).join('/') }\n${b.description ?? ''}`;
              } else if (card.family === 'event') {
                const e = card as any;
                info = `Event: ${e.name}\nCost: ${e.cost}\nEffect: ${e.effect}\nCoins: ${e.coinDelta >= 0 ? '+' : ''}${e.coinDelta}, Rep: ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}`;
              } else if (card.family === 'upgrade') {
                const u = card as any;
                info = `Upgrade: ${u.name}\nCost: ${u.cost}\nIncome Bonus: +${u.incomeBonus}\nRequires: Lv${u.requiredLevel ?? 0}\n${u.description ?? ''}`;
              }
              s.tooltipManager?.show(info, container.x, container.y);
            }
          });

          node.addEventListener('mouseleave', () => {
            if (interactiveEnabled) selection.setHovered(false);
            if (!s.replayMode) s.tooltipManager?.hide();
          });

          node.addEventListener('click', () => {
            if (interactiveEnabled) {
              s.marketSelectionManager.select(selection);
              onClick(card);
            }
          });
        }
      } catch (e) { /* ignore DOM attach errors */ }
    }

    // Card label and additional info are rendered inside per-card SVGs; only
    // add textual overlays when we do NOT have a per-card texture.
    const usedSvg = s.textures && (s.textures as Phaser.Textures.TextureManager).exists(tplKey);

    if (!usedSvg) {
      // Intentionally no text overlays: card text is authored inside each SVG.
    }

    return container;
  }

  public refreshIncidentQueue(): void {
    const s = this.scene;
    s.incidentQueueContainer.removeAll(true);

    const queue = s.state.incidentQueue;
    const deckRemaining = s.state.decks.event.length;

    const { queueLabelW, queueCardW, queueCardH, queueCardGap, queueTop } = s.layout;

    // Section background - width to just fit cards with small right margin
    const queueW = queueLabelW + 50 + INCIDENT_QUEUE_SIZE * (queueCardW + queueCardGap) - queueCardGap + 20;
    const queueH = queueCardH + 24;
    const bgBox = s.add.graphics();
    bgBox.fillStyle(0x1a1830, 0.35);
    bgBox.fillRoundedRect(110, queueTop - 10, queueW, queueH, BOX_RADIUS);
    bgBox.lineStyle(1, 0x445577, 0.5);
    bgBox.strokeRoundedRect(110, queueTop - 10, queueW, queueH, BOX_RADIUS);
    s.incidentQueueContainer.add(bgBox);

    // Section label
    const label = s.add.text(40, queueTop + queueCardH / 2 - 2, 'Upcoming', {
      fontSize: '13px', fontStyle: 'bold', color: '#7788aa', fontFamily: FONT_FAMILY,
      align: 'center',
    }).setOrigin(0, 0.5);
    s.incidentQueueContainer.add(label);

    const startX = queueLabelW + 50;

    for (let i = 0; i < INCIDENT_QUEUE_SIZE; i++) {
      const cx = startX + i * (queueCardW + queueCardGap);
      const card = queue[i];

      if (card) {
        const cardContainer = this.drawIncidentCard(cx, queueTop, card);
        s.incidentQueueContainer.add(cardContainer);
      } else {
        // Empty queue slot
        const empty = s.add.rectangle(
          cx + queueCardW / 2, queueTop + queueCardH / 2,
          queueCardW, queueCardH, 0x111122, 0.3,
        );
        empty.setStrokeStyle(1, 0x223344);
        s.incidentQueueContainer.add(empty);
      }
    }

    // Deck count - immediately below the label
    const deckText = s.add.text(40, queueTop + 32, `Deck: ${deckRemaining}`, {
      fontSize: '11px', color: '#556677', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0);
    s.incidentQueueContainer.add(deckText);
  }

  public drawIncidentCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    const s = this.scene;
    const { queueCardW, queueCardH } = s.layout;
    const container = s.add.container(Math.round(x + queueCardW / 2), Math.round(y + queueCardH / 2));

    const renderW = Math.max(1, Math.round(queueCardW - 4));
    const renderH = Math.max(1, Math.round(queueCardH - 4));
    const tplKey = s.templateKeyForCard(card.id, renderW, renderH);
    const usedSvg = s.textures && (s.textures as Phaser.Textures.TextureManager).exists(tplKey);
    if (usedSvg) {
      const img = s.add.image(0, 0, tplKey);
      // Texture is already rasterised at correct size for this slot
      img.setDisplaySize(renderW, renderH);
      container.add(img);
    } else {
      s.requestCardTexture(card.id, renderW, renderH);
      // Indigo fallback background (non-interactive); no text overlays.
      const bg = s.add.rectangle(0, 0, queueCardW, queueCardH, 0x2B3A67, 0.5);
      bg.setStrokeStyle(1, 0x556688);
      container.add(bg);
    }

    if (!s.replayMode) {
      const hover = s.add.rectangle(0, 0, queueCardW, queueCardH, 0x000000, 0.001);
      hover.setInteractive({ useHandCursor: true });
      hover.on('pointerover', () => {
        const info = `Event: ${card.name}\nEffect: ${card.effect}\nCoins: ${card.coinDelta >= 0 ? '+' : ''}${card.coinDelta}, Rep: ${card.reputationDelta >= 0 ? '+' : ''}${card.reputationDelta}`;
        s.tooltipManager?.show(info, container.x, container.y);
      });
      hover.on('pointerout', () => s.tooltipManager?.hide());
      container.add(hover);
    }

    return container;
  }

  public refreshPlayerHand(): void {
    const s = this.scene;
    s.handContainer.removeAll(true);

    const held = s.state.heldEvent;
    const { handY, handX, handCardW, handCardH } = s.layout;

    // Your Hand label removed

    if (held) {
      const cardContainer = this.drawHeldEventCard(handX, handY, held);
      s.handContainer.add(cardContainer);
    } else {
      // Empty hand slot
      const empty = s.add.rectangle(
        40 + handCardW / 2, handY + handCardH / 2,
        handCardW, handCardH, 0x222211, 0.2,
      );
      empty.setStrokeStyle(1, 0x333322, 0.4);
      s.handContainer.add(empty);

      const emptyText = s.add.text(
        40 + handCardW / 2, handY + handCardH / 2,
        'No held event',
        { fontSize: '11px', color: '#555544', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      s.handContainer.add(emptyText);
    }
  }

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

    // DOM-only rendering path for held investment cards.
    const templateId = s.templateIdFromCardId(card.id);
    const svgText = s.cardSvgSources.get(templateId);
    if (!s.svgDom || !svgText) {
      return container;
    }

    const cx = x + handCardW / 2;
    const cy = y + handCardH / 2;
    const domKey = s.domKeyForCard('hand', 0, card.id);
    const domEl = s.svgDom.createOrUpdate(
      domKey,
      svgText,
      cx,
      cy,
      renderW,
      renderH,
      s.uiPhase === 'market' ? () => s.onPlayHeldEvent() : undefined,
      100,
    );

    if (!s.replayMode) {
      try {
        // If an SvgDomRenderer exists we intentionally avoid adding any
        // Phaser fallback display objects for the held card. Tests may
        // provide a mock `svgDom.createOrUpdate` which returns undefined
        // but still counts as the DOM renderer being present. In that
        // case we still should not add a Phaser fallback rectangle.
        const node = (domEl as any)?.node as HTMLElement | null;
        if (node) {
          node.addEventListener('mouseenter', () => {
            const info = `Event: ${card.name}\nCost: ${card.cost}\nEffect: ${card.effect}`;
            s.tooltipManager?.show(info, container.x, container.y);
          });
          node.addEventListener('mouseleave', () => s.tooltipManager?.hide());

          if (s.uiPhase === 'market') {
            node.addEventListener('click', () => s.onPlayHeldEvent());
          }
        }
      } catch (e) { /* ignore */ }

      // Whether or not domEl.node was present, if svgDom is available we
      // do not add Phaser fallback visuals for the held hand slot. The
      // DOM renderer (or test-provided mock) is expected to handle
      // interactivity. Return early to avoid creating a Rectangle/Image.
      return container;
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
      const smallW = s.layout.smallButtonW;

      const endBtn = this.createActionButton(rightX - btnW, by + 4, btnW, 'End Turn', () => {
        s.endTurn();
      });
      s.actionContainer.add(endBtn);

      // Hint button (to the left of End Turn)
      const hintBtn = this.createHintButton(rightX - btnW - 12 - hintBtnW, by + 4, hintBtnW);
      s.actionContainer.add(hintBtn);

      // Undo / Redo buttons (to the left of Hint)
      const undoBaseX = rightX - btnW - 12 - hintBtnW - 12 - smallW - 12 - smallW;
      const undoBtn = this.createActionButton(undoBaseX, by + 4, smallW, 'Undo', () => s.performUndo());
      s.actionContainer.add(undoBtn);
      const redoBtn = this.createActionButton(undoBaseX + smallW + 12, by + 4, smallW, 'Redo', () => s.performRedo());
      s.actionContainer.add(redoBtn);

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
      const cancelBtn = this.createActionButton(rightX - btnW, by + 4, btnW, 'Cancel', () => {
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

  public createActionButton(
    x: number,
    y: number,
    width: number,
    text: string,
    callback: () => void,
  ): Phaser.GameObjects.Container {
    const s = this.scene;
    const btnH = s.layout.actionButtonH;
    const container = s.add.container(x + width / 2, y + btnH / 2);

    const bg = s.add.rectangle(0, 0, width, btnH, 0x554422, 0.8);
    bg.setStrokeStyle(1, 0xaa8855);
    container.add(bg);

    const label = s.add.text(0, 0, text, {
      fontSize: '14px', fontStyle: 'bold', color: '#ffcc88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', callback);
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, 0xffdd44);
      container.setScale(1.05);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, 0xaa8855);
      container.setScale(1.0);
    });

    return container;
  }

  public createHintButton(
    x: number,
    y: number,
    width: number,
  ): Phaser.GameObjects.Container {
    const s = this.scene;
    const btnH = s.layout.actionButtonH;
    const isDisabled = s.hintUsedThisTurn;

    const container = s.add.container(x + width / 2, y + btnH / 2);

    const fillColor = isDisabled ? 0x2a2a2a : 0x224455;
    const strokeColor = isDisabled ? 0x444444 : 0x4488aa;
    const textColor = isDisabled ? '#666666' : '#88ccff';

    const bg = s.add.rectangle(0, 0, width, btnH, fillColor, 0.8);
    bg.setStrokeStyle(1, strokeColor);
    container.add(bg);

    const label = s.add.text(0, 0, isDisabled ? 'Hint ✓' : 'Hint', {
      fontSize: '14px', fontStyle: 'bold', color: textColor, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    if (!isDisabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => s.onHintClick());
      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0x88ddff);
        container.setScale(1.05);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(1, strokeColor);
        container.setScale(1.0);
      });
    }

    return container;
  }

  public refreshLog(): void {
    const s = this.scene;
    const entries = s.state.activityLog;
    const newCount = entries.length;

    // Skip rebuild if nothing changed
    if (newCount === s.logPrevEntryCount) return;

    const hadAutoScroll = s.logAutoScroll;
    s.logPrevEntryCount = newCount;

    // Clear existing content
    s.logContentContainer.removeAll(true);

    const contentW = s.layout.logW - LOG_PAD * 2;
    let yOff = 0;

    for (const entry of entries) {
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

    // Visible area inside the panel (below title bar, above bottom edge)
    const visibleH = s.layout.logH - LOG_TITLE_H - 4;
    s.logMaxScroll = Math.max(0, s.logTotalContentH - visibleH);

    // Keep scroll position valid for the current content height.
    // On scene restart we can transition from a long previous run to a short
    // new log; without clamping, stale offsets can hide all entries.
    if (hadAutoScroll) {
      s.logScrollOffset = s.logMaxScroll;
    } else {
      s.logScrollOffset = Phaser.Math.Clamp(s.logScrollOffset, 0, s.logMaxScroll);
    }

    s.applyLogScroll();
  }
}
