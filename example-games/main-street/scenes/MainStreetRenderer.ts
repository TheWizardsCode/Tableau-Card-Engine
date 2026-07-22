/**
 * MainStreetRenderer -- extracted UI/layout rendering helper for Main Street.
 */

import Phaser from 'phaser';
import type { BusinessCard, CommunitySpaceCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  REFRESH_DEVELOPMENT_COST,
  REFRESH_INVESTMENTS_COST,
  synergyColor,
} from '../MainStreetCards';
import {
  computeSynergyBonus,
  computeSynergyPairs,
} from '../MainStreetAdjacency';
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
  canRefreshDevelopment,
  canRefreshInvestments,
} from '../MainStreetMarket';
import {
  FONT_FAMILY,
  HandView,
  HintBar,
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
    const coinText = markHudTransient(s.add.text(stripLeft + 10, hudY, `Coins: ${coins.toFixed(3)}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(coinText);

    // Reputation - centered in strip
    const repText = markHudTransient(s.add.text(stripLeft + stripWidth * 0.5, hudY, `Reputation: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5));
    s.hudContainer.add(repText);

    // Score - right-aligned in strip (shows x / y where y is the win threshold)
    const scoreText = markHudTransient(s.add.text(stripLeft + stripWidth - 10, hudY, `Score: ${score}/${s.state.config.winThreshold}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5));
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
   */
  private drawSynergyLines(): void {
    const s = this.scene;
    const { streetX, streetTop, slotW, slotGap, slotH, streetCols, streetRowGap } = s.layout;

    const soldSlots: boolean[] = s.state.soldSlots ?? [];
    const pairs = computeSynergyPairs(s.state.streetGrid, soldSlots);

    for (const pair of pairs) {
      const fromCol = pair.fromIndex % streetCols;
      const fromRow = Math.floor(pair.fromIndex / streetCols);
      const toCol = pair.toIndex % streetCols;
      const toRow = Math.floor(pair.toIndex / streetCols);

      const x1 = streetX + fromCol * (slotW + slotGap) + slotW / 2;
      const y1 = streetTop + fromRow * (slotH + streetRowGap) + slotH / 2;
      const x2 = streetX + toCol * (slotW + slotGap) + slotW / 2;
      const y2 = streetTop + toRow * (slotH + streetRowGap) + slotH / 2;

      const color = synergyColor(pair.sharedSynergy);

      const line = s.add.graphics();
      line.lineStyle(3, color, 0.7);
      line.beginPath();
      line.moveTo(x1, y1);
      line.lineTo(x2, y2);
      line.strokePath();

      // Add a subtle outer glow by drawing a thicker, more transparent line underneath
      line.lineStyle(6, color, 0.2);
      line.beginPath();
      line.moveTo(x1, y1);
      line.lineTo(x2, y2);
      line.strokePath();

      s.streetContainer.add(line);
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
        const synergyBonus = computeSynergyBonus(s.state.streetGrid, _index, s.state.config.synergyBonusPerNeighbor, soldSlots);
        const synergyInfo = `\nSynergy bonus: +${synergyBonus}/turn`;
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

    // Compute the development row's startX so the investments row can align
    // its card slots to the first 3 development columns instead of independently
    // centering (which would create a ~76px horizontal offset).
    const { marketCardW, marketCardGap } = s.layout;
    const boxCenter = (bgLeft + bgRight) / 2;
    const devTotalCardsW = MARKET_BUSINESS_SLOTS * marketCardW + (MARKET_BUSINESS_SLOTS - 1) * marketCardGap;
    const devStartX = Math.round(boxCenter - devTotalCardsW / 2);

    // Development row (business + community space cards)
    this.drawMarketRow(
      marketTop + 6,
      'Development',
      'development',
      s.state.market.development,
      MARKET_BUSINESS_SLOTS,
      (card) => s.onBusinessCardClick(card as BusinessCard),
      devStartX,
    );

    // Investments row (mixed upgrades + investment events)
    // Uses devStartX for alignment so investment cards sit directly below
    // the first 3 development cards.
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
      devStartX,
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

    // Determine card startX: when alignmentStartX is provided (investments row),
    // use it to align with the development row's slot grid. Otherwise,
    // independently centre the row in the market box.
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

    // Deck info and refresh button - immediately below the label
    const deckY = y + 16;
    if (rowKey === 'development') {
      // Development row: show deck count + Discover button
      const bizCount = s.state.decks.business.length;
      const csCount = s.state.decks.communitySpace.length;
      const deckText = s.add.text(40, deckY, `Biz: ${bizCount}  CS: ${csCount}`, {
        fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0);
      s.marketContainer.add(deckText);

      // Discover button for Development row
      try {
        const refreshDevResult = canRefreshDevelopment(s.state);
        const canRefresh = refreshDevResult.legal;
        const btnW = Math.max(s.layout.smallButtonW, 96);
        const labelCenter = 40 + s.layout.marketLabelW / 2;
        const btnX = Math.round(labelCenter - btnW / 2);
        const btnY = deckY + 22;

        const labelText = `Discover (${REFRESH_DEVELOPMENT_COST})`;

        const btn = createActionButton(s, btnX, btnY, btnW, labelText, canRefresh ? () => { s.onRefreshDevelopmentClick(); } : () => {}, {
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

            // Tooltip for the Discover button
            const reasonSuffix = !canRefresh && refreshDevResult.reason ? `\n\n${refreshDevResult.reason}` : '';
            const info = `Pay €${REFRESH_DEVELOPMENT_COST} to discover new development opportunities and replace the visible development row. Removed cards go to their discard piles. Available only during Market phase.${reasonSuffix}`;
            try {
              bg.on('pointerover', (pointer: any) => {
                if (s.tooltipManager) {
                  s.tooltipManager.show(info, (pointer && pointer.worldX) || btn.x, (pointer && pointer.worldY) || btn.y);
                  return;
                }
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
        const refreshInvResult = canRefreshInvestments(s.state);
        const canRefresh = refreshInvResult.legal;
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
            const reasonSuffix = !canRefresh && refreshInvResult.reason ? `\n\n${refreshInvResult.reason}` : '';
            const info = `Pay €${REFRESH_INVESTMENTS_COST} to research new investment opportunities and replace the visible investments row. Removed cards go to their discard piles. Available only during Market phase.${reasonSuffix}`;
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

    // Apply income/reputation overlays for business and community-space cards
    if (card.family === 'business' || card.family === 'community-space') {
      this.applyUpgradeOverlays(container, card as BusinessCard | CommunitySpaceCard, renderW, renderH);
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
            const bTotalRep = (b.reputationPerTurn ?? 0) + (b.reputationBonus ?? 0);
            const bRepInfo = bTotalRep > 0 ? `\nReputation: +${bTotalRep}/turn` : '';
            info = `Business: ${b.name}\nCost: ${b.cost}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn${bRepInfo}\nSynergy: ${(b.synergyTypes || []).join('/')}\n${b.description ?? ''}`;
          } else if (card.family === 'community-space') {
            const cs = card as any;
            const csTotalRep = (cs.reputationPerTurn ?? 0) + (cs.reputationBonus ?? 0);
            const csRepInfo = csTotalRep > 0 ? `\nReputation: +${csTotalRep}/turn` : '';
            info = `Community Space: ${cs.name}\nCost: ${cs.cost}\nIncome: +${cs.baseIncome + (cs.incomeBonus || 0)}/turn${csRepInfo}\nSynergy: ${(cs.synergyTypes || []).join('/')}\n${cs.description ?? ''}`;
          } else if (card.family === 'event') {
            const e = card as any;
            const coinDelta = e.coinDelta >= 0 ? '+' : '';
            info = `Event: ${e.name}\nCost: ${e.cost}\nEffect: ${e.effect}\nCoins: ${coinDelta}${e.coinDelta.toFixed(3)}, Rep: ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}`;
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

    // Show held event card if present (existing behavior)
    const held = s.state.heldEvent;

    if (held) {
      // Use HandView with renderCard callback — anticipates multi-card support
      this.handView.setCards([held] as any);
    } else {
      // Empty hand — HandView gracefully handles empty array (no sprites)
      this.handView.setCards([]);
    }

    // Render hand cards from state.hand (Multi-Use Card Economy)
    this.refreshBusinessHandCards();
  }

  /**
   * Renders business cards held in the player's hand.
   * Shows each card as a small card below the tableau with synergy indicator.
   */
  private refreshBusinessHandCards(): void {
    const s = this.scene;
    const hand = s.state.hand ?? [];

    // Remove previous hand card display
    if (s.handBusinessContainer) {
      s.handBusinessContainer.removeAll(true);
    } else {
      s.handBusinessContainer = s.add.container(0, 0);
    }

    if (hand.length === 0) {
      // Update hand size indicator
      this.updateHandSizeIndicator(0);
      return;
    }

    const { handCardW, handCardH, handY } = s.layout;
    const startX = 40;
    const y = handY;
    const spacing = handCardW + 8;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const x = startX + i * spacing;

      const container = s.add.container(x, y);

      // Render card via shared SVG pipeline for unified appearance
      const renderW = Math.max(1, Math.round(handCardW - 4));
      const renderH = Math.max(1, Math.round(handCardH - 4));
      mainStreetRenderCardSvg(s, container, card.id, renderW, renderH);

      // Apply income/reputation overlays (uses centered "Income: +X/turn" format)
      this.applyUpgradeOverlays(container, card, renderW, renderH);

      s.handBusinessContainer!.add(container);
    }

    // Update hand size indicator
    this.updateHandSizeIndicator(hand.length);
  }

  /**
   * Updates the hand size indicator text (e.g. "Hand: 2/5").
   */
  private updateHandSizeIndicator(current: number): void {
    const s = this.scene;
    const maxSize = s.state.maxHandSize ?? 2;

    if (s.handSizeText) {
      s.handSizeText.destroy();
    }

    s.handSizeText = s.add.text(10, s.layout.handY - 14, 
      `Hand: ${current}/${maxSize}`, {
      fontSize: '12px',
      color: current >= maxSize ? '#ff6666' : '#c8b88a',
      fontFamily: 'Arial',
    });
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
