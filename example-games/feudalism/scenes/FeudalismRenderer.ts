/**
 * FeudalismRenderer — UI creation and refresh logic for Feudalism.
 */
import Phaser from 'phaser';
import type { ResourceType, ResourceOrWild, DevelopmentCard, Tier } from '../FeudalismCards';
import {
  RESOURCE_TYPES,
  tokenCount,
  resourceAbbrev,
  resourceDisplayName,
  formatCost,
  tierShortName,
} from '../FeudalismCards';
import type { FeudalismSession } from '../FeudalismGame';
import { getInfluence, getBonuses } from '../FeudalismGame';
import { addCropIcon, cssColorToNumber } from './CropIconRenderer';
import { FONT_FAMILY, GAME_W, createOverlayBackground } from '../../../src/ui';
import type { SingleSelectionManager, SelectionController } from '../../../src/ui';
import { attachSelection, createSingleSelectionManager } from '../../../src/ui';
import {
  PATRON_W, PATRON_H, PATRON_X,
  SUPPLY_TOKEN_R, SUPPLY_GAP, SUPPLY_TOTAL_H, SUPPLY_X, SUPPLY_Y,
  MARKET_CARD_W, MARKET_CARD_H, MARKET_CARD_GAP, MARKET_TIER_GAP,
  MARKET_TOTAL_H, MARKET_Y, DECK_X, MARKET_X,
  SECTION_BOX_STROKE, SECTION_BOX_ALPHA, SECTION_BOX_FILL,
  SECTION_BOX_FILL_ALPHA, SECTION_BOX_RADIUS, SECTION_BOX_PAD,
  LOWER_TOP, LOWER_BOX_H, PLAYER_AREA_X, PLAYER_AREA_Y,
  AI_AREA_X, AI_AREA_Y, DIVIDER_X,
  ACTION_Y, INSTRUCTION_Y,
  RESOURCE_FILL, RESOURCE_TEXT_COLOR, RESOURCE_ICON_COLOR, RESOURCE_LABEL_COLOR,
} from './FeudalismConstants';
import {
  buildTokenEntries,
  getBonusRenderOrder,
  getTokenRenderOrder,
} from './FeudalismRenderHelpers';

export interface MarketCallbacks {
  onMarketCardClick: (card: DevelopmentCard) => void;
  onReserveDeck: (tier: Tier) => void;
}

export interface SupplyCallbacks {
  onSupplyTokenClick: (color: ResourceType) => void;
}

export interface ActionCallbacks {
  onTakeTokens: () => void;
  onTakeSame: (color: ResourceType) => void;
  onConfirmDifferent: () => void;
  onCancelSelection: () => void;
}

export interface ReservedCardCallbacks {
  onReservedCardClick: (card: DevelopmentCard) => void;
}

export class FeudalismRenderer {
  private scene: Phaser.Scene;
  private session: FeudalismSession;

  // Containers
  private sectionBoxContainer!: Phaser.GameObjects.Container;
  private marketContainer!: Phaser.GameObjects.Container;
  private patronContainer!: Phaser.GameObjects.Container;
  private supplyContainer!: Phaser.GameObjects.Container;
  private playerContainer!: Phaser.GameObjects.Container;
  private aiContainer!: Phaser.GameObjects.Container;
  private actionContainer!: Phaser.GameObjects.Container;
  private discardContainer!: Phaser.GameObjects.Container;

  // UI text
  private instructionText!: Phaser.GameObjects.Text;
  private playerInfluenceText!: Phaser.GameObjects.Text;
  private aiInfluenceText!: Phaser.GameObjects.Text;

  // Market selection
  private marketSelectionManager!: SingleSelectionManager;
  private marketSelectionByCardId = new Map<number, SelectionController>();
  private marketCardContainerById = new Map<number, Phaser.GameObjects.Container>();
  private selectedMarketCardId: number | null = null;

  // External state references (updated by scene)
  turnPhase: string = 'player-turn';
  selectedTokens: ResourceType[] = [];
  discardSelection: Partial<Record<ResourceOrWild, number>> = {};
  discardNeeded = 0;

  constructor(scene: Phaser.Scene, session: FeudalismSession) {
    this.scene = scene;
    this.session = session;
  }

  // ── Getters ─────────────────────────────────────────────
  get instruction(): Phaser.GameObjects.Text { return this.instructionText; }
  get selectedCardId(): number | null { return this.selectedMarketCardId; }
  get marketContainers(): Map<number, Phaser.GameObjects.Container> { return this.marketCardContainerById; }
  get marketSelections(): Map<number, SelectionController> { return this.marketSelectionByCardId; }
  get marketMgr(): SingleSelectionManager { return this.marketSelectionManager; }

  // ── Init ────────────────────────────────────────────────
  createContainers(): void {
    this.sectionBoxContainer = this.scene.add.container(0, 0);
    this.marketContainer = this.scene.add.container(0, 0);
    this.patronContainer = this.scene.add.container(0, 0);
    this.supplyContainer = this.scene.add.container(0, 0);
    this.playerContainer = this.scene.add.container(0, 0);
    this.aiContainer = this.scene.add.container(0, 0);
    this.actionContainer = this.scene.add.container(0, 0);
    this.discardContainer = this.scene.add.container(0, 0);
    this.marketSelectionManager = createSingleSelectionManager(this.scene);
  }

  createInstructions(): void {
    this.instructionText = this.scene.add
      .text(GAME_W / 2, INSTRUCTION_Y, '', {
        fontSize: '17px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  createInfluenceDisplay(): void {
    this.playerInfluenceText = this.scene.add
      .text(0, 0, '', {
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0)
      .setVisible(false);

    this.aiInfluenceText = this.scene.add
      .text(0, 0, '', {
        fontSize: '18px',
        color: '#aabbcc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0)
      .setVisible(false);
  }

  destroy(): void {
    this.marketSelectionManager?.destroy();
    this.marketSelectionByCardId.clear();
    this.marketCardContainerById.clear();
    this.selectedMarketCardId = null;
  }

  // ── Section boxes ───────────────────────────────────────
  refreshSectionBoxes(): void {
    this.sectionBoxContainer.removeAll(true);
    const p = SECTION_BOX_PAD;

    this.drawSectionBox(PATRON_X - p, MARKET_Y - p - 16, PATRON_W + p * 2, MARKET_TOTAL_H + p * 2 + 16, 'Patrons');

    const lastCardRight = MARKET_X + 4 * (MARKET_CARD_W + MARKET_CARD_GAP) - MARKET_CARD_GAP;
    const marketBoxX = DECK_X - 90 - p;
    this.drawSectionBox(marketBoxX, MARKET_Y - p - 16, lastCardRight - marketBoxX + p, MARKET_TOTAL_H + p * 2 + 16, 'Market');

    const supplyBoxX = SUPPLY_X - SUPPLY_TOKEN_R - 70 - p;
    const supplyBoxY = SUPPLY_Y - SUPPLY_TOKEN_R - p - 16;
    this.drawSectionBox(supplyBoxX, supplyBoxY, SUPPLY_TOKEN_R + 70 + SUPPLY_TOKEN_R + p * 2, SUPPLY_TOTAL_H + SUPPLY_TOKEN_R * 2 + p * 2 + 16, 'Supply');

    this.drawSectionBox(PLAYER_AREA_X - p, LOWER_TOP - p, DIVIDER_X - PLAYER_AREA_X, LOWER_BOX_H);
    this.drawSectionBox(DIVIDER_X + p, LOWER_TOP - p, AI_AREA_X - DIVIDER_X + p, LOWER_BOX_H);
  }

  private drawSectionBox(x: number, y: number, w: number, h: number, label?: string): void {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(SECTION_BOX_FILL, SECTION_BOX_FILL_ALPHA);
    gfx.fillRoundedRect(x, y, w, h, SECTION_BOX_RADIUS);
    gfx.lineStyle(1, SECTION_BOX_STROKE, SECTION_BOX_ALPHA);
    gfx.strokeRoundedRect(x, y, w, h, SECTION_BOX_RADIUS);
    this.sectionBoxContainer.add(gfx);

    if (label) {
      const txt = this.scene.add.text(x + w / 2, y + 2, label, {
        fontSize: '12px', fontStyle: 'bold', color: '#667766', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 0);
      this.sectionBoxContainer.add(txt);
    }
  }

  // ── Refresh all ─────────────────────────────────────────
  refreshAll(callbacks: MarketCallbacks & SupplyCallbacks & ActionCallbacks & ReservedCardCallbacks): void {
    this.refreshSectionBoxes();
    this.refreshMarket(callbacks);
    this.refreshPatrons();
    this.refreshSupply(callbacks);
    this.refreshPlayerArea(callbacks);
    this.refreshAiArea();
    this.refreshInfluence();
    this.refreshActionButtons(callbacks);
  }

  // ── Market ──────────────────────────────────────────────
  refreshMarket(callbacks: MarketCallbacks): void {
    this.marketContainer.removeAll(true);
    this.marketSelectionManager.clear();
    this.marketSelectionManager.clearTargets();
    this.marketSelectionByCardId.clear();
    this.marketCardContainerById.clear();
    this.selectedMarketCardId = null;

    const tiers: Tier[] = [3, 2, 1];
    for (let row = 0; row < tiers.length; row++) {
      const tier = tiers[row];
      const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP);
      const market = this.session.market[tier];

      const tierLabel = this.scene.add.text(DECK_X - 40, y + MARKET_CARD_H / 2, `${tierShortName(tier)}`, {
        fontSize: '18px', fontStyle: 'bold', color: '#888888', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      this.marketContainer.add(tierLabel);

      const deckCount = market.deck.length;
      const deckW = 100;
      const deckH = MARKET_CARD_H - 16;
      const deckBg = this.scene.add.rectangle(DECK_X, y + MARKET_CARD_H / 2, deckW, deckH, 0x334433, deckCount > 0 ? 0.8 : 0.3);
      deckBg.setStrokeStyle(1, 0x556655);
      this.marketContainer.add(deckBg);

      if (deckCount > 0) {
        const deckText = this.scene.add.text(DECK_X, y + MARKET_CARD_H / 2, `${deckCount}`, {
          fontSize: '20px', fontStyle: 'bold', color: '#aaddaa', fontFamily: FONT_FAMILY,
        }).setOrigin(0.5);
        this.marketContainer.add(deckText);

        if (this.turnPhase === 'player-turn') {
          deckBg.setInteractive({ useHandCursor: true });
          deckBg.on('pointerdown', () => callbacks.onReserveDeck(tier));
          deckBg.on('pointerover', () => deckBg.setStrokeStyle(2, 0xffdd44));
          deckBg.on('pointerout', () => deckBg.setStrokeStyle(1, 0x556655));
        }
      }

      for (let col = 0; col < 4; col++) {
        const card = market.visible[col];
        const x = MARKET_X + col * (MARKET_CARD_W + MARKET_CARD_GAP);
        if (card) {
          const cardObj = this.createMarketCard(x, y, card, callbacks);
          this.marketContainer.add(cardObj);
        } else {
          const empty = this.scene.add.rectangle(x + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2, MARKET_CARD_W, MARKET_CARD_H, 0x222222, 0.3);
          empty.setStrokeStyle(1, 0x333333);
          this.marketContainer.add(empty);
        }
      }
    }
  }

  private createMarketCard(
    x: number, y: number, card: DevelopmentCard, callbacks: MarketCallbacks,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2);
    const bonusFill = RESOURCE_FILL[card.bonus];

    const bg = this.scene.add.rectangle(0, 0, MARKET_CARD_W, MARKET_CARD_H, 0x1a1a1a);
    bg.setStrokeStyle(1, 0x444444);
    container.add(bg);

    const bonusBar = this.scene.add.rectangle(0, -MARKET_CARD_H / 2 + 12, MARKET_CARD_W - 4, 22, bonusFill);
    container.add(bonusBar);

    if (card.points > 0) {
      const pts = this.scene.add.text(-MARKET_CARD_W / 2 + 10, -MARKET_CARD_H / 2 + 26, `${card.points}`, {
        fontSize: '24px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      });
      container.add(pts);
    }

    const bonusLetter = this.scene.add.text(MARKET_CARD_W / 2 - 10, -MARKET_CARD_H / 2 + 26, resourceAbbrev(card.bonus), {
      fontSize: '16px', fontStyle: 'bold', color: RESOURCE_LABEL_COLOR[card.bonus], fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0);
    container.add(bonusLetter);

    const costEntries: { color: ResourceType; count: number }[] = [];
    for (const c of RESOURCE_TYPES) {
      const n = card.cost[c] ?? 0;
      if (n > 0) costEntries.push({ color: c, count: n });
    }
    const costStartX = -(costEntries.length - 1) * 15;
    for (let i = 0; i < costEntries.length; i++) {
      const cx = costStartX + i * 30;
      const cy = MARKET_CARD_H / 2 - 22;
      const chip = this.scene.add.circle(cx, cy, 13, RESOURCE_FILL[costEntries[i].color], 0.9);
      chip.setStrokeStyle(1, 0x888888);
      container.add(chip);
      const ct = this.scene.add.text(cx, cy, `${costEntries[i].count}`, {
        fontSize: '14px', fontStyle: 'bold',
        color: RESOURCE_LABEL_COLOR[costEntries[i].color], fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(ct);
    }

    if (this.turnPhase === 'player-turn') {
      const selection = attachSelection(container, {
        onStateChange: ({ selected, hovered }) => {
          if (selected) this.selectedMarketCardId = card.id;
          else if (this.selectedMarketCardId === card.id) this.selectedMarketCardId = null;

          if (hovered) { bg.setStrokeStyle(2, 0xffdd44); container.setScale(1.05); return; }
          if (selected) { bg.setStrokeStyle(2, 0x44ff66); container.setScale(1.04); return; }
          bg.setStrokeStyle(1, 0x444444); container.setScale(1.0);
        },
      });

      this.marketSelectionByCardId.set(card.id, selection);
      this.marketCardContainerById.set(card.id, container);

      bg.setInteractive({ useHandCursor: true });
      this.marketSelectionManager.registerTarget(bg);

      bg.on('pointerdown', () => {
        this.marketSelectionManager.select(selection);
        callbacks.onMarketCardClick(card);
      });
      bg.on('pointerover', () => selection.setHovered(true));
      bg.on('pointerout', () => selection.setHovered(false));
    }

    return container;
  }

  clearMarketSelection(): void {
    this.marketSelectionManager?.clear();
    this.selectedMarketCardId = null;
  }

  // ── Patrons ─────────────────────────────────────────────
  refreshPatrons(): void {
    this.patronContainer.removeAll(true);
    for (let i = 0; i < this.session.patrons.length; i++) {
      const patron = this.session.patrons[i];
      const y = MARKET_Y + i * (MARKET_CARD_H + MARKET_TIER_GAP);

      const bg = this.scene.add.rectangle(PATRON_X + PATRON_W / 2, y + PATRON_H / 2, PATRON_W, PATRON_H, 0x6633aa, 0.7);
      bg.setStrokeStyle(1, 0x9966cc);
      this.patronContainer.add(bg);

      const pts = this.scene.add.text(PATRON_X + PATRON_W / 2, y + 20, '3 pt', {
        fontSize: '20px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      this.patronContainer.add(pts);

      const patronLabel = this.scene.add.text(PATRON_X + PATRON_W / 2, y + 42, 'Patron', {
        fontSize: '13px', color: '#ccaaee', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      this.patronContainer.add(patronLabel);

      const reqs: { color: ResourceType; count: number }[] = [];
      for (const c of RESOURCE_TYPES) {
        const n = patron.requirements[c] ?? 0;
        if (n > 0) reqs.push({ color: c, count: n });
      }
      const chipSpacing = 30;
      const reqStartX = PATRON_X + PATRON_W / 2 - (reqs.length - 1) * chipSpacing / 2;
      for (let j = 0; j < reqs.length; j++) {
        const rx = reqStartX + j * chipSpacing;
        const ry = y + PATRON_H - 26;
        const chip = this.scene.add.circle(rx, ry, 13, RESOURCE_FILL[reqs[j].color], 0.9);
        chip.setStrokeStyle(1, 0x888888);
        this.patronContainer.add(chip);
        const ct = this.scene.add.text(rx, ry, `${reqs[j].count}`, {
          fontSize: '15px', fontStyle: 'bold',
          color: RESOURCE_LABEL_COLOR[reqs[j].color], fontFamily: FONT_FAMILY,
        }).setOrigin(0.5);
        this.patronContainer.add(ct);
      }
    }
  }

  // ── Supply ──────────────────────────────────────────────
  refreshSupply(callbacks: SupplyCallbacks): void {
    this.supplyContainer.removeAll(true);

    const label = this.scene.add.text(SUPPLY_X, SUPPLY_Y - SUPPLY_TOKEN_R - 8, 'Supply', {
      fontSize: '13px', fontStyle: 'bold', color: '#99bb99', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    this.supplyContainer.add(label);

    const allColors: ResourceOrWild[] = [...RESOURCE_TYPES, 'mead'];
    for (let i = 0; i < allColors.length; i++) {
      const color = allColors[i];
      const y = SUPPLY_Y + i * SUPPLY_GAP;
      const count = tokenCount(this.session.tokenSupply, color);

      const circle = this.scene.add.circle(SUPPLY_X, y, SUPPLY_TOKEN_R, RESOURCE_FILL[color]);
      circle.setStrokeStyle(2, 0xffffff);
      if (count === 0) circle.setAlpha(0.3);
      this.supplyContainer.add(circle);

      const supplyIcon = addCropIcon(this.scene as any, SUPPLY_X, y, color, SUPPLY_TOKEN_R, cssColorToNumber(RESOURCE_ICON_COLOR[color]));
      if (count === 0) supplyIcon.setAlpha(0.3);
      this.supplyContainer.add(supplyIcon);

      const countText = this.scene.add.text(SUPPLY_X, y, `${count}`, {
        fontSize: '20px', fontStyle: 'bold', color: RESOURCE_TEXT_COLOR[color], fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      this.supplyContainer.add(countText);

      const abbr = this.scene.add.text(SUPPLY_X - SUPPLY_TOKEN_R - 8, y, resourceDisplayName(color), {
        fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 0.5);
      this.supplyContainer.add(abbr);

      if (color !== 'mead' && count > 0 && this.turnPhase === 'selecting-tokens') {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => callbacks.onSupplyTokenClick(color as ResourceType));
        circle.on('pointerover', () => circle.setStrokeStyle(3, 0xffdd44));
        circle.on('pointerout', () => circle.setStrokeStyle(2, 0xffffff));
      }

      if (this.selectedTokens.includes(color as ResourceType)) {
        const check = this.scene.add.text(SUPPLY_X + SUPPLY_TOKEN_R + 10, y, '✓', {
          fontSize: '22px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY,
        }).setOrigin(0, 0.5);
        this.supplyContainer.add(check);
      }
    }
  }

  // ── Player area ─────────────────────────────────────────
  refreshPlayerArea(callbacks: ReservedCardCallbacks): void {
    this.playerContainer.removeAll(true);

    const player = this.session.players[0];
    const influence = getInfluence(player);
    const bonuses = getBonuses(player);
    const row0Y = PLAYER_AREA_Y;

    this.renderInfluenceHeader(this.playerContainer, PLAYER_AREA_X + 44, row0Y, influence);
    this.renderPatronCount(this.playerContainer, PLAYER_AREA_X + 100, row0Y + 2, player.patrons.length);
    this.renderTokenRow(this.playerContainer, player.tokens, {
      labelX: PLAYER_AREA_X + 200,
      tokenStartX: PLAYER_AREA_X + 280,
      y: row0Y + 14,
      reverse: false,
      emptyAlign: 'left',
    });

    const row1Y = row0Y + 32;
    this.renderBonusSlots(this.playerContainer, bonuses, {
      x: PLAYER_AREA_X,
      y: row1Y,
      reverse: false,
    });

    const row2Y = row1Y + 56;
    this.renderReservedCards(callbacks, row2Y, player.reservedCards);
  }

  private renderInfluenceHeader(
    container: Phaser.GameObjects.Container,
    x: number,
    rowY: number,
    influence: number,
  ): void {
    const influenceBg = this.scene.add.rectangle(x, rowY + 10, 90, 24, 0x443300, 0.6);
    influenceBg.setStrokeStyle(1, 0x887744);
    container.add(influenceBg);

    const influenceLabel = this.scene.add.text(x, rowY + 10, `★ ${influence} / 15`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(influenceLabel);
  }

  private renderPatronCount(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    patronCount: number,
    rightAlign: boolean = false,
  ): void {
    if (patronCount <= 0) {
      return;
    }

    const patronLabel = this.scene.add.text(x, y, `Patrons: ${patronCount}`, {
      fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY,
    });

    if (rightAlign) {
      patronLabel.setOrigin(1, 0);
    }

    container.add(patronLabel);
  }

  private renderTokenRow(
    container: Phaser.GameObjects.Container,
    tokens: Partial<Record<ResourceOrWild, number>>,
    options: {
      labelX: number;
      tokenStartX: number;
      y: number;
      reverse: boolean;
      emptyAlign: 'left' | 'right';
    },
  ): void {
    const label = this.scene.add.text(options.labelX, options.y - 10, 'Tokens:', {
      fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY,
    });
    if (options.emptyAlign === 'right') {
      label.setOrigin(1, 0);
    }
    container.add(label);

    const tokenEntries = buildTokenEntries(tokens, getTokenRenderOrder(options.reverse));
    let cursorX = options.tokenStartX;
    const delta = options.reverse ? -34 : 34;

    for (const entry of tokenEntries) {
      this.renderTokenBubble(container, cursorX, options.y, entry.color, entry.count);
      cursorX += delta;
    }

    if (tokenEntries.length === 0) {
      const noTok = this.scene.add.text(options.tokenStartX, options.y, '(none)', {
        fontSize: '14px', color: '#666666', fontFamily: FONT_FAMILY,
      }).setOrigin(options.emptyAlign === 'right' ? 1 : 0, 0.5);
      container.add(noTok);
    }
  }

  private renderTokenBubble(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    color: ResourceOrWild,
    count: number,
  ): void {
    const circle = this.scene.add.circle(x, y, 14, RESOURCE_FILL[color]);
    circle.setStrokeStyle(1, 0xffffff);
    container.add(circle);

    const icon = addCropIcon(this.scene as any, x, y, color, 14, cssColorToNumber(RESOURCE_ICON_COLOR[color]));
    container.add(icon);

    const countText = this.scene.add.text(x, y, `${count}`, {
      fontSize: '13px', fontStyle: 'bold', color: RESOURCE_TEXT_COLOR[color], fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(countText);
  }

  private renderBonusSlots(
    container: Phaser.GameObjects.Container,
    bonuses: Partial<Record<ResourceType, number>>,
    options: {
      x: number;
      y: number;
      reverse: boolean;
    },
  ): void {
    const SLOT_W = 38;
    const SLOT_H = 50;
    const SLOT_GAP = 8;
    const order = getBonusRenderOrder(options.reverse);
    let slotX = options.reverse ? options.x - SLOT_W : options.x;

    for (const color of order) {
      const count = bonuses[color] ?? 0;
      const hasCards = count > 0;
      const alpha = hasCards ? 0.7 : 0.15;
      const centerX = slotX + SLOT_W / 2;

      const slot = this.scene.add.rectangle(centerX, options.y + SLOT_H / 2, SLOT_W, SLOT_H, RESOURCE_FILL[color], alpha);
      slot.setStrokeStyle(1, hasCards ? 0xaaaaaa : 0x555555, hasCards ? 0.8 : 0.3);
      container.add(slot);

      const abbr = this.scene.add.text(centerX, options.y + 10, resourceAbbrev(color), {
        fontSize: '11px', fontStyle: 'bold', color: hasCards ? RESOURCE_LABEL_COLOR[color] : '#666666', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(abbr);

      const countText = this.scene.add.text(centerX, options.y + SLOT_H / 2 + 6, `${count}`, {
        fontSize: '18px', fontStyle: 'bold', color: hasCards ? '#ffffff' : '#444444', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(countText);

      slotX += options.reverse ? -(SLOT_W + SLOT_GAP) : (SLOT_W + SLOT_GAP);
    }
  }

  private renderReservedCards(
    callbacks: ReservedCardCallbacks,
    rowY: number,
    reservedCards: DevelopmentCard[],
  ): void {
    if (reservedCards.length === 0) {
      return;
    }

    const resLabel = this.scene.add.text(PLAYER_AREA_X, rowY + 4, `Reserved (${reservedCards.length}):`, {
      fontSize: '15px', color: '#ccaa66', fontFamily: FONT_FAMILY,
    });
    this.playerContainer.add(resLabel);

    let x = PLAYER_AREA_X + 150;
    for (const card of reservedCards) {
      const cardContainer = this.createSmallCard(x, rowY - 2, card, true, callbacks);
      this.playerContainer.add(cardContainer);
      x += 100;
    }
  }

  private createSmallCard(
    x: number, y: number, card: DevelopmentCard, interactive: boolean,
    callbacks: ReservedCardCallbacks,
  ): Phaser.GameObjects.Container {
    const w = 80;
    const h = 52;
    const container = this.scene.add.container(x + w / 2, y + h / 2);

    const bg = this.scene.add.rectangle(0, 0, w, h, 0x1a1a1a);
    bg.setStrokeStyle(1, 0x555555);
    container.add(bg);

    const dot = this.scene.add.circle(-w / 2 + 12, -h / 2 + 12, 7, RESOURCE_FILL[card.bonus]);
    container.add(dot);

    if (card.points > 0) {
      const pts = this.scene.add.text(-w / 2 + 24, -h / 2 + 4, `${card.points}`, {
        fontSize: '14px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      });
      container.add(pts);
    }

    const costStr = formatCost(card.cost);
    const costText = this.scene.add.text(0, 8, costStr, {
      fontSize: '12px', color: '#aaaaaa', fontFamily: FONT_FAMILY, align: 'center',
    }).setOrigin(0.5);
    container.add(costText);

    if (interactive && this.turnPhase === 'player-turn') {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => callbacks.onReservedCardClick(card));
      bg.on('pointerover', () => { bg.setStrokeStyle(2, 0xffdd44); container.setScale(1.1); });
      bg.on('pointerout', () => { bg.setStrokeStyle(1, 0x555555); container.setScale(1.0); });
    }

    return container;
  }

  // ── AI area ─────────────────────────────────────────────
  refreshAiArea(): void {
    this.aiContainer.removeAll(true);

    const ai = this.session.players[1];
    const bonuses = getBonuses(ai);
    const influence = getInfluence(ai);
    const row0Y = AI_AREA_Y;

    this.renderInfluenceHeader(this.aiContainer, AI_AREA_X - 44, row0Y, influence);
    this.renderPatronCount(this.aiContainer, AI_AREA_X - 100, row0Y + 2, ai.patrons.length, true);
    this.renderTokenRow(this.aiContainer, ai.tokens, {
      labelX: AI_AREA_X - 200,
      tokenStartX: AI_AREA_X - 220,
      y: row0Y + 14,
      reverse: true,
      emptyAlign: 'right',
    });

    const row1Y = row0Y + 32;
    this.renderBonusSlots(this.aiContainer, bonuses, {
      x: AI_AREA_X,
      y: row1Y,
      reverse: true,
    });

    this.renderAiSummary(ai.purchasedCards.length, ai.reservedCards.length, row1Y + 56);
  }

  private renderAiSummary(
    purchasedCards: number,
    reservedCards: number,
    rowY: number,
  ): void {
    const cardText = this.scene.add.text(AI_AREA_X, rowY + 4, `Cards: ${purchasedCards}`, {
      fontSize: '15px', color: '#888888', fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0);
    this.aiContainer.add(cardText);

    if (reservedCards > 0) {
      const resText = this.scene.add.text(AI_AREA_X - 110, rowY + 4, `Reserved: ${reservedCards}`, {
        fontSize: '15px', color: '#ccaa66', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 0);
      this.aiContainer.add(resText);
    }
  }

  refreshInfluence(): void {
    const playerInfluence = getInfluence(this.session.players[0]);
    const aiInfluence = getInfluence(this.session.players[1]);
    this.playerInfluenceText.setText(`Influence: ${playerInfluence}`);
    this.aiInfluenceText.setText(`AI Influence: ${aiInfluence}`);
  }

  // ── Action buttons ──────────────────────────────────────
  refreshActionButtons(callbacks: ActionCallbacks): void {
    this.actionContainer.removeAll(true);
    if (this.turnPhase !== 'player-turn' && this.turnPhase !== 'selecting-tokens') return;

    const by = ACTION_Y;
    const centerX = GAME_W / 2;

    if (this.turnPhase === 'player-turn') {
      const availSame = RESOURCE_TYPES.filter(c => tokenCount(this.session.tokenSupply, c) >= 4);
      let totalW = 155;
      if (availSame.length > 0) totalW += 30 + 80 + availSame.length * 54;
      let bx = centerX - totalW / 2;

      const takeBtn = this.createActionButton(bx, by, 'Take Tokens', () => callbacks.onTakeTokens());
      this.actionContainer.add(takeBtn);
      bx += 185;

      if (availSame.length > 0) {
        const take2Label = this.scene.add.text(bx, by - 2, 'Take 2:', {
          fontSize: '17px', color: '#aaaaaa', fontFamily: FONT_FAMILY,
        });
        this.actionContainer.add(take2Label);
        bx += 80;

        for (const c of availSame) {
          const circle = this.scene.add.circle(bx, by, 22, RESOURCE_FILL[c]);
          circle.setStrokeStyle(1, 0xffffff);
          circle.setInteractive({ useHandCursor: true });
          circle.on('pointerdown', () => callbacks.onTakeSame(c));
          circle.on('pointerover', () => circle.setStrokeStyle(2, 0xffdd44));
          circle.on('pointerout', () => circle.setStrokeStyle(1, 0xffffff));
          this.actionContainer.add(circle);

          const actIcon = addCropIcon(this.scene as any, bx, by, c, 22, cssColorToNumber(RESOURCE_ICON_COLOR[c]));
          this.actionContainer.add(actIcon);

          const abbr = this.scene.add.text(bx, by, resourceAbbrev(c), {
            fontSize: '15px', fontStyle: 'bold', color: RESOURCE_LABEL_COLOR[c], fontFamily: FONT_FAMILY,
          }).setOrigin(0.5);
          this.actionContainer.add(abbr);
          bx += 54;
        }
      }
    } else if (this.turnPhase === 'selecting-tokens') {
      const canConfirm = this.isValidTokenSelection();
      let totalW = 290 + (canConfirm ? 155 : 0) + 155;
      let bx = centerX - totalW / 2;

      const selLabel = this.scene.add.text(bx, by - 2, `Selected: ${this.selectedTokens.map(c => resourceAbbrev(c)).join(' ') || '(none)'}`, {
        fontSize: '19px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY,
      });
      this.actionContainer.add(selLabel);
      bx += 290;

      if (canConfirm) {
        const confirmBtn = this.createActionButton(bx, by, 'Confirm', () => callbacks.onConfirmDifferent());
        this.actionContainer.add(confirmBtn);
        bx += 155;
      }

      const cancelBtn = this.createActionButton(bx, by, 'Cancel', () => callbacks.onCancelSelection());
      this.actionContainer.add(cancelBtn);
    }
  }

  private createActionButton(x: number, y: number, text: string, callback: () => void): Phaser.GameObjects.Container {
    const btnW = 155;
    const btnH = 42;
    const container = this.scene.add.container(x + btnW / 2, y);
    const bg = this.scene.add.rectangle(0, 0, btnW, btnH, 0x335533, 0.8);
    bg.setStrokeStyle(1, 0x55aa55);
    container.add(bg);

    const label = this.scene.add.text(0, 0, text, {
      fontSize: '17px', fontStyle: 'bold', color: '#88ff88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', callback);
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffdd44));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0x55aa55));

    return container;
  }

  private isValidTokenSelection(): boolean {
    if (this.selectedTokens.length === 0) return false;
    if (new Set(this.selectedTokens).size !== this.selectedTokens.length) return false;
    for (const c of this.selectedTokens) {
      if (tokenCount(this.session.tokenSupply, c) <= 0) return false;
    }
    if (this.selectedTokens.length < 3) {
      const available = RESOURCE_TYPES.filter(c => tokenCount(this.session.tokenSupply, c) > 0);
      if (available.length >= 3) return false;
    }
    return true;
  }

  // ── Discard dialog ──────────────────────────────────────
  showDiscardDialog(excess: number, onChange: () => void): void {
    this.discardNeeded = excess;
    this.discardSelection = {};
    this.refreshDiscardDialog(onChange);
  }

  refreshDiscardDialog(onChange: () => void): void {
    this.discardContainer.removeAll(true);
    const player = this.session.players[0];
    const selectedCount = Object.values(this.discardSelection).reduce((sum, n) => sum + (n ?? 0), 0);

    const overlay = createOverlayBackground(this.scene as any, { depth: 10, alpha: 0.7 }, { width: 600, height: 300, alpha: 0.9 });
    this.discardContainer.add(overlay.objects);

    const title = this.scene.add.text(GAME_W / 2, (this.scene.game.config.height as number) / 2 - 110,
      `Discard ${this.discardNeeded} token${this.discardNeeded > 1 ? 's' : ''} (${selectedCount}/${this.discardNeeded})`,
      { fontSize: '20px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5).setDepth(11);
    this.discardContainer.add(title);

    // Bonus slots
    const bonuses = getBonuses(player);
    const DSLOT_W = 32;
    const DSLOT_H = 42;
    const DSLOT_GAP = 6;
    const totalSlotsW = RESOURCE_TYPES.length * DSLOT_W + (RESOURCE_TYPES.length - 1) * DSLOT_GAP;
    let dsx = GAME_W / 2 - totalSlotsW / 2;
    const dsY = (this.scene.game.config.height as number) / 2 - 76;

    const bonusLabel = this.scene.add.text(GAME_W / 2 - totalSlotsW / 2 - 60, dsY + DSLOT_H / 2, 'Bonuses:', {
      fontSize: '12px', color: '#888888', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5).setDepth(11);
    this.discardContainer.add(bonusLabel);

    for (const c of RESOURCE_TYPES) {
      const count = bonuses[c];
      const hasCards = count > 0;
      const alpha = hasCards ? 0.7 : 0.15;
      const slot = this.scene.add.rectangle(dsx + DSLOT_W / 2, dsY + DSLOT_H / 2, DSLOT_W, DSLOT_H, RESOURCE_FILL[c], alpha).setDepth(11);
      slot.setStrokeStyle(1, hasCards ? 0xaaaaaa : 0x555555, hasCards ? 0.8 : 0.3);
      this.discardContainer.add(slot);

      const abbr = this.scene.add.text(dsx + DSLOT_W / 2, dsY + 8, resourceAbbrev(c), {
        fontSize: '10px', fontStyle: 'bold', color: hasCards ? RESOURCE_LABEL_COLOR[c] : '#666666', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(abbr);

      const countText = this.scene.add.text(dsx + DSLOT_W / 2, dsY + DSLOT_H / 2 + 5, `${count}`, {
        fontSize: '15px', fontStyle: 'bold', color: hasCards ? '#ffffff' : '#444444', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(countText);
      dsx += DSLOT_W + DSLOT_GAP;
    }

    // Token buttons
    const allColors: ResourceOrWild[] = [...RESOURCE_TYPES, 'mead'];
    const activeColors = allColors.filter(c => tokenCount(player.tokens, c) > 0);
    const totalW = activeColors.length * 70;
    let tx = GAME_W / 2 - totalW / 2 + 35;
    const ty = (this.scene.game.config.height as number) / 2 - 25;

    for (const c of activeColors) {
      const have = tokenCount(player.tokens, c);
      const selected = this.discardSelection[c] ?? 0;
      const available = have - selected;

      const circle = this.scene.add.circle(tx, ty, 28, RESOURCE_FILL[c]);
      circle.setStrokeStyle(selected > 0 ? 2 : 1, selected > 0 ? 0xff4444 : 0xffffff);
      circle.setDepth(11);
      this.discardContainer.add(circle);

      const discIcon = addCropIcon(this.scene as any, tx, ty, c, 28, cssColorToNumber(RESOURCE_ICON_COLOR[c]));
      discIcon.setDepth(11);
      this.discardContainer.add(discIcon);

      const countText = this.scene.add.text(tx, ty, `${have - selected}`, {
        fontSize: '18px', fontStyle: 'bold', color: RESOURCE_TEXT_COLOR[c], fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(countText);

      const selText = this.scene.add.text(tx, ty + 36, selected > 0 ? `-${selected}` : '', {
        fontSize: '16px', color: '#ff6666', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(selText);

      if (available > 0 && selectedCount < this.discardNeeded) {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => {
          this.discardSelection[c] = (this.discardSelection[c] ?? 0) + 1;
          this.refreshDiscardDialog(onChange);
        });
      }
      tx += 70;
    }

    if (selectedCount > 0) {
      const undoBtn = this.scene.add.text(GAME_W / 2 - 70, (this.scene.game.config.height as number) / 2 + 70, '[ Undo ]', {
        fontSize: '18px', color: '#88aaff', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
      undoBtn.on('pointerdown', () => {
        this.discardSelection = {};
        this.refreshDiscardDialog(onChange);
      });
      this.discardContainer.add(undoBtn);
    }

    if (selectedCount === this.discardNeeded) {
      const confirmBtn = this.scene.add.text(GAME_W / 2 + 70, (this.scene.game.config.height as number) / 2 + 70, '[ Confirm ]', {
        fontSize: '18px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
      confirmBtn.on('pointerdown', () => onChange());
      this.discardContainer.add(confirmBtn);
    }
  }

  clearDiscardDialog(): void {
    this.discardContainer.removeAll(true);
  }

  // ── Toast ───────────────────────────────────────────────
  showToast(message: string): void {
    const toast = this.scene.add.text(GAME_W / 2, (this.scene.game.config.height as number) / 2 + 180, message, {
      fontSize: '18px', color: '#ffdd44', fontFamily: FONT_FAMILY,
      backgroundColor: '#333333',
      padding: { left: 14, right: 14, top: 8, bottom: 8 },
    }).setOrigin(0.5).setDepth(20);

    this.scene.time.delayedCall(2000, () => toast.destroy());
  }
}
