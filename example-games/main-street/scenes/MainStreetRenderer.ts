/**
 * MainStreetRenderer -- extracted UI/layout rendering helper for Main Street.
 */

import Phaser from 'phaser';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
  REFRESH_INVESTMENTS_COST,
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
  createSceneTitle,
  createSceneMenuButton,
  attachSelection,
} from '../../../src/ui';
import {
  createActionButton,
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
import { computeMainStreetLayoutWithSll } from './MainStreetLayoutAdapter';

/** Tag a Phaser game object as transient so `refreshHud()` knows to destroy it on the next refresh. */
function markHudTransient<T extends Phaser.GameObjects.GameObject>(obj: T): T & { _hudTransient: true } {
  (obj as any)._hudTransient = true;
  return obj as T & { _hudTransient: true };
}

export class MainStreetRenderer {
  constructor(private readonly scene: any) {}

  public createHeader(): void {
    const s = this.scene;
    createSceneMenuButton(s);
    createSceneTitle(s, 'Main Street');
  }

  public computeLayout(): SceneLayout {
    return computeMainStreetLayoutWithSll();
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
    const hudList = [...s.hudContainer.list] as Array<Phaser.GameObjects.GameObject & { _hudTransient?: boolean }>;
    for (const child of hudList) {
      if (child._hudTransient) {
        s.hudContainer.remove(child, true);
      }
    }

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

    // Score - right side of strip
    const scoreText = markHudTransient(s.add.text(stripLeft + stripWidth * 0.85, hudY, `Score: ${score}`, {
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

  public drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard): void {
    const s = this.scene;
    const { slotW, slotH } = s.layout;
    const isHinted = s.hintedSlotIndex === _index;

    const renderW = Math.max(1, Math.round(slotW - 4));
    const renderH = Math.max(1, Math.round(slotH - 4));

    // Render card via shared adapter
    const cardContainer = s.add.container(Math.round(x + slotW / 2), Math.round(y + slotH / 2));
    mainStreetRenderCardSvg(s, cardContainer, biz.id, renderW, renderH);
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

    // Render card via shared adapter
    mainStreetRenderCardSvg(s, container, card.id, renderW, renderH);

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

  /**
   * Render held-event cards via the shared adapter using the same Phaser
   * texture pipeline used by market/street/incident cards.
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
      const smallW = s.layout.smallButtonW;

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

      // Undo / Redo buttons (to the left of Hint)
      const undoBaseX = rightX - btnW - 12 - hintBtnW - 12 - smallW - 12 - smallW;
      const undoBtn = createActionButton(s, undoBaseX, by + 4, smallW, 'Undo', () => s.performUndo());
      s.actionContainer.add(undoBtn);
      const redoBtn = createActionButton(s, undoBaseX + smallW + 12, by + 4, smallW, 'Redo', () => s.performRedo());
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
