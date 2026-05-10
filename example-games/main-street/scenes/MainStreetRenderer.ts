import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  createSceneTitle,
  createSceneMenuButton,
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
  BOX_STROKE,
  LOG_TITLE_H,
  type SceneLayout,
  STREET_COLS,
  STREET_ROW_GAP,
} from './MainStreetConstants';

export class MainStreetRenderer {
  constructor(private readonly scene: any) {}

  createHeader(): void {
    createSceneMenuButton(this.scene);
    createSceneTitle(this.scene, 'Main Street');
  }

  computeLayout(): SceneLayout {
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
    const handX = 40;
    const instructionY = handY - 20;

    const actionButtonH = compact ? 32 : 34;
    const actionY = gameH - 16 - actionButtonH;

    const logW = compact ? 360 : 430;
    const logX = gameW - margin - logW - 10;
    const challengeW = Math.min(350, logX - handCardW - margin - 20);
    const challengeX = logX - challengeW - 10;
    const challengeY = queueTop;
    const logY = marketTop - 10;
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
      handY,
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

  createContainers(): void {
    const s = this.scene;
    s.hudContainer = s.add.container(0, 0);
    s.streetContainer = s.add.container(0, 0);
    s.marketContainer = s.add.container(0, 0);
    s.incidentQueueContainer = s.add.container(0, 0);
    s.handContainer = s.add.container(0, 0);
    s.actionContainer = s.add.container(0, 0);

    s.challengeContainer = s.add.container(s.layout.challengeX, s.layout.challengeY);
    s.logContainer = s.add.container(s.layout.logX, s.layout.logY);

    const bg = s.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, s.layout.logW, s.layout.logH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, s.layout.logW, s.layout.logH, 4);
    s.logContainer.add(bg);

    const titleBg = s.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, s.layout.logW, LOG_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    s.logContainer.add(titleBg);

    const titleText = s.add.text(s.layout.logW / 2, LOG_TITLE_H / 2, 'Activity Log', {
      fontSize: '12px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    s.logContainer.add(titleText);

    s.logContentContainer = s.add.container(0, LOG_TITLE_H + 2);
    s.logContainer.add(s.logContentContainer);

    s.logMaskGraphics = s.add.graphics();
    s.logMaskGraphics.setVisible(false);
    s.logContentMask = new Phaser.Display.Masks.GeometryMask(s, s.logMaskGraphics);
    s.logContentContainer.setMask(s.logContentMask);
    s.updateLogMask();

    s.input.off('wheel', s.handleLogWheel, s);
    s.input.on('wheel', s.handleLogWheel, s);
  }

  createInstructions(): void {
    const s = this.scene;
    s.instructionText = s.add
      .text(s.layout.gameW / 2, s.layout.gameH - 20, '', {
        fontSize: '14px',
        color: '#ccaa77',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 1);
  }

  refreshAll(): void {
    const s = this.scene;
    s.svgDom?.clear();
    s.refreshHud();
    s.refreshStreetGrid();
    s.refreshMarket();
    s.refreshIncidentQueue();
    s.refreshPlayerHand();
    s.refreshActionButtons();
    s.refreshChallengeTracker();
    s.refreshLog();
    s.updateSvgDebugOverlay();
  }
}
