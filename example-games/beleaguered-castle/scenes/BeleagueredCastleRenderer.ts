/**
 * BeleagueredCastleRenderer — UI creation, refresh, and deal animation.
 */
import Phaser from 'phaser';
import type { BeleagueredCastleState } from '../BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from '../BeleagueredCastleState';
import { cardTextureKey } from '../../../src/ui';
import { GAME_W, GAME_H, FONT_FAMILY, createSceneTitle, createSceneMenuButton } from '../../../src/ui';
import {
  BC_CARD_W, BC_CARD_H, CARD_GAP, CASCADE_OFFSET_Y,
  DRAG_DEPTH, DEAL_STAGGER, ANIM_DURATION, SNAP_BACK_DURATION,
  HIGHLIGHT_VALID, HIGHLIGHT_ALPHA, SELECTION_TINT,
} from './BeleagueredCastleConstants';
import {
  computeBeleagueredCastleLayout,
  type BeleagueredCastleLayout,
} from './BeleagueredCastleLayoutAdapter';

export interface CardSpriteData {
  colIndex: number;
  rowIndex: number;
  originX: number;
  originY: number;
  originDepth: number;
}

export class BeleagueredCastleRenderer {
  private scene: Phaser.Scene;
  private state: BeleagueredCastleState;

  /** SLL-derived layout resolved once at construction. */
  private layout: BeleagueredCastleLayout;

  // Display objects
  private _foundationSprites: Phaser.GameObjects.Image[] = [];
  private foundationDropZones: Phaser.GameObjects.Zone[] = [];
  private tableauSprites: Phaser.GameObjects.Image[][] = [];
  private tableauDropZones: Phaser.GameObjects.Zone[] = [];
  private highlightRects: Phaser.GameObjects.Rectangle[] = [];

  // HUD
  private moveCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;
  private undoButton!: Phaser.GameObjects.Text;
  private redoButton!: Phaser.GameObjects.Text;

  // Callbacks
  onUndoClick?: () => void;
  onRedoClick?: () => void;
  onDealCard?: (info: { cardIndex: number; totalCards: number }) => void;
  onDealComplete?: () => void;
  onCardClick?: (colIndex: number) => void;

  constructor(scene: Phaser.Scene, state: BeleagueredCastleState) {
    this.scene = scene;
    this.state = state;
    this.layout = computeBeleagueredCastleLayout();
  }

  // ── Getters ─────────────────────────────────────────────
  get foundationSprites(): Phaser.GameObjects.Image[] { return this._foundationSprites; }
  get foundationDZs(): Phaser.GameObjects.Zone[] { return this.foundationDropZones; }
  get tableauDZs(): Phaser.GameObjects.Zone[] { return this.tableauDropZones; }
  get tableauSprs(): Phaser.GameObjects.Image[][] { return this.tableauSprites; }
  get moveText(): Phaser.GameObjects.Text { return this.moveCountText; }
  get timer(): Phaser.GameObjects.Text { return this.timerText; }
  get seedDisplay(): Phaser.GameObjects.Text { return this.seedText; }
  get undoBtn(): Phaser.GameObjects.Text { return this.undoButton; }
  get redoBtn(): Phaser.GameObjects.Text { return this.redoButton; }

  // ── UI creation ─────────────────────────────────────────
  createTitle(): void {
    createSceneMenuButton(this.scene, { y: this.layout.headerY });
    createSceneTitle(this.scene, 'Beleaguered Castle', { y: this.layout.headerY });
  }

  createFoundationSlots(): void {
    const FOUNDATION_GAP = CARD_GAP + 30;
    const totalW = FOUNDATION_COUNT * BC_CARD_W + (FOUNDATION_COUNT - 1) * FOUNDATION_GAP;
    const startX = (GAME_W - totalW) / 2 + BC_CARD_W / 2;

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const x = startX + i * (BC_CARD_W + FOUNDATION_GAP);
      const slotGraphics = this.scene.add.graphics();
      slotGraphics.lineStyle(2, 0x448844, 0.6);
      slotGraphics.strokeRoundedRect(x - BC_CARD_W / 2, this.layout.foundationCenterY - BC_CARD_H / 2, BC_CARD_W, BC_CARD_H, 6);

      const sprite = this.scene.add.image(x, this.layout.foundationCenterY, 'card_back').setVisible(false);
      this._foundationSprites.push(sprite);

      const zone = this.scene.add.zone(x, this.layout.foundationCenterY, BC_CARD_W, BC_CARD_H)
        .setRectangleDropZone(BC_CARD_W, BC_CARD_H)
        .setData('type', 'foundation')
        .setData('index', i);
      this.foundationDropZones.push(zone);
    }
  }

  createTableauDropZones(): void {
    const zoneTop = this.layout.tableauTopY - BC_CARD_H / 2;
    const zoneBottom = this.layout.tableauBottomY + BC_CARD_H / 2;
    const maxColHeight = zoneBottom - zoneTop;
    const zoneCenterY = (zoneTop + zoneBottom) / 2;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const x = this.tableauColumnX(col);
      const zone = this.scene.add.zone(x, zoneCenterY, BC_CARD_W + 4, maxColHeight)
        .setRectangleDropZone(BC_CARD_W + 4, maxColHeight)
        .setData('type', 'tableau')
        .setData('index', col);
      this.tableauDropZones.push(zone);
    }
  }

  createHUD(seed: number): void {
    this.moveCountText = this.scene.add.text(20, GAME_H - 28, 'Moves: 0', {
      fontSize: '20px', color: '#aaccaa', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);

    this.timerText = this.scene.add.text(GAME_W / 2, GAME_H - 28, '00:00', {
      fontSize: '20px', color: '#aaccaa', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5);

    this.seedText = this.scene.add.text(GAME_W - 20, GAME_H - 28, `Seed: ${seed}`, {
      fontSize: '18px', color: '#668866', fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5);

    this.undoButton = this.scene.add.text(GAME_W - 220, this.layout.headerY, '[ Undo ]', {
      fontSize: '18px', color: '#557755', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.undoButton.on('pointerdown', () => this.onUndoClick?.());
    this.undoButton.on('pointerover', () => {
      if (this.onUndoClick) this.undoButton.setColor('#88ff88');
    });
    this.undoButton.on('pointerout', () => this.refreshUndoRedoButtons(false, false));

    this.redoButton = this.scene.add.text(GAME_W - 140, this.layout.headerY, '[ Redo ]', {
      fontSize: '18px', color: '#557755', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.redoButton.on('pointerdown', () => this.onRedoClick?.());
    this.redoButton.on('pointerover', () => {
      if (this.onRedoClick) this.redoButton.setColor('#88ff88');
    });
    this.redoButton.on('pointerout', () => this.refreshUndoRedoButtons(false, false));
  }

  refreshUndoRedoButtons(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.setColor(canUndo ? '#aaccaa' : '#557755');
    this.redoButton.setColor(canRedo ? '#aaccaa' : '#557755');
  }

  // ── Foundation rendering ────────────────────────────────
  refreshFoundations(): void {
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const foundation = this.state.foundations[i];
      const topCard = foundation.peek();
      if (topCard) {
        this._foundationSprites[i].setTexture(cardTextureKey(topCard.rank, topCard.suit)).setVisible(true);
      } else {
        this._foundationSprites[i].setVisible(false);
      }
    }
  }

  // ── Tableau layout ──────────────────────────────────────
  tableauColumnX(colIndex: number): number {
    const totalW = TABLEAU_COUNT * BC_CARD_W + (TABLEAU_COUNT - 1) * CARD_GAP;
    const startX = (GAME_W - totalW) / 2 + BC_CARD_W / 2;
    return startX + colIndex * (BC_CARD_W + CARD_GAP);
  }

  tableauCardY(rowIndex: number, columnSize: number): number {
    const maxOffsets = columnSize - 1;
    let offset = CASCADE_OFFSET_Y;
    if (maxOffsets > 0) {
      const maxTotalHeight = this.layout.tableauBottomY - this.layout.tableauTopY;
      const idealHeight = maxOffsets * CASCADE_OFFSET_Y;
      if (idealHeight > maxTotalHeight) {
        offset = maxTotalHeight / maxOffsets;
      }
    }
    return this.layout.tableauTopY + rowIndex * offset;
  }

  // ── Deal animation ──────────────────────────────────────
  dealTableauAnimated(): void {
    const centerX = GAME_W / 2;
    const centerY = GAME_H / 2;
    this.tableauSprites = [];
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      this.tableauSprites.push([]);
    }

    let dealIndex = 0;
    let totalCards = 0;
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      totalCards += this.state.tableau[col].size();
    }

    let completedCount = 0;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards = this.state.tableau[col].toArray();
      for (let row = 0; row < cards.length; row++) {
        const card = cards[row];
        const targetX = this.tableauColumnX(col);
        const targetY = this.tableauCardY(row, cards.length);
        const texture = cardTextureKey(card.rank, card.suit);

        const sprite = this.scene.add.image(centerX, centerY, texture)
          .setAlpha(0)
          .setDepth(dealIndex);
        this.tableauSprites[col].push(sprite);

        const delay = dealIndex * DEAL_STAGGER;
        const currentDealIndex = dealIndex;
        this.scene.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          alpha: 1,
          duration: ANIM_DURATION,
          delay,
          ease: 'Power2',
          onStart: () => {
            this.onDealCard?.({ cardIndex: currentDealIndex, totalCards });
          },
          onComplete: () => {
            sprite.setDepth(row);
            completedCount++;
            if (completedCount >= totalCards) {
              this.onDealComplete?.();
            }
          },
        });
        dealIndex++;
      }
    }

    if (totalCards === 0) {
      this.onDealComplete?.();
    }
  }

  // ── Make draggable ──────────────────────────────────────
  makeDraggable(interactionBlocked: boolean): void {
    for (const col of this.tableauSprites) {
      for (const sprite of col) {
        sprite.disableInteractive();
      }
    }

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const colSprites = this.tableauSprites[col];
      if (colSprites.length === 0) continue;

      const topSprite = colSprites[colSprites.length - 1];
      const rowIndex = colSprites.length - 1;

      topSprite.setInteractive({ useHandCursor: true, draggable: !interactionBlocked });
      topSprite.on('pointerdown', () => this.onCardClick?.(col));

      const cardData: CardSpriteData = {
        colIndex: col,
        rowIndex,
        originX: topSprite.x,
        originY: topSprite.y,
        originDepth: topSprite.depth,
      };
      topSprite.setData('cardData', cardData);
    }
  }

  // ── Highlights ──────────────────────────────────────────
  showValidDropHighlights(fromCol: number, getLegalMoves: () => Array<{ kind: string; fromCol: number; toFoundation?: number; toCol?: number }>): void {
    this.clearDropHighlights();
    const legalMoves = getLegalMoves();
    const relevantMoves = legalMoves.filter((m) => m.fromCol === fromCol);

    for (const move of relevantMoves) {
      if (move.kind === 'tableau-to-foundation' && move.toFoundation !== undefined) {
        const fSprite = this._foundationSprites[move.toFoundation];
        const rect = this.scene.add.rectangle(fSprite.x, fSprite.y, BC_CARD_W + 4, BC_CARD_H + 4, HIGHLIGHT_VALID, HIGHLIGHT_ALPHA)
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      } else if (move.kind === 'tableau-to-tableau' && move.toCol !== undefined) {
        const col = move.toCol;
        const cards = this.state.tableau[col].toArray();
        const dropY = cards.length > 0
          ? this.tableauCardY(cards.length - 1, cards.length)
          : this.tableauCardY(0, 1);
        const x = this.tableauColumnX(col);
        const rect = this.scene.add.rectangle(x, dropY, BC_CARD_W + 4, BC_CARD_H + 4, HIGHLIGHT_VALID, HIGHLIGHT_ALPHA)
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      }
    }
  }

  clearDropHighlights(): void {
    for (const rect of this.highlightRects) {
      rect.destroy();
    }
    this.highlightRects = [];
  }

  // ── Selection ───────────────────────────────────────────
  selectColumn(colIndex: number): void {
    const colSprites = this.tableauSprites[colIndex];
    if (colSprites.length > 0) {
      colSprites[colSprites.length - 1].setTint(SELECTION_TINT);
    }
  }

  deselectColumn(colIndex: number): void {
    const colSprites = this.tableauSprites[colIndex];
    if (colSprites.length > 0) {
      colSprites[colSprites.length - 1].clearTint();
    }
  }

  // ── Snap back ───────────────────────────────────────────
  snapBack(sprite: Phaser.GameObjects.Image): void {
    const data = sprite.getData('cardData') as CardSpriteData | undefined;
    if (!data) return;
    this.scene.tweens.add({
      targets: sprite,
      x: data.originX,
      y: data.originY,
      duration: SNAP_BACK_DURATION,
      ease: 'Power2',
      onComplete: () => {
        sprite.setDepth(data.originDepth);
      },
    });
  }

  // ── Refresh ─────────────────────────────────────────────
  refreshAll(makeDraggable: boolean, interactionBlocked: boolean): void {
    this.refreshFoundations();
    this.refreshTableau();
    this.refreshHUD();
    if (makeDraggable) this.makeDraggable(interactionBlocked);
  }

  refreshTableau(): void {
    for (const col of this.tableauSprites) {
      for (const sprite of col) {
        sprite.destroy();
      }
    }
    this.tableauSprites = [];

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const sprites: Phaser.GameObjects.Image[] = [];
      const cards = this.state.tableau[col].toArray();
      for (let row = 0; row < cards.length; row++) {
        const card = cards[row];
        const x = this.tableauColumnX(col);
        const y = this.tableauCardY(row, cards.length);
        const texture = cardTextureKey(card.rank, card.suit);
        const sprite = this.scene.add.image(x, y, texture).setDepth(row);
        sprites.push(sprite);
      }
      this.tableauSprites.push(sprites);
    }
  }

  refreshHUD(): void {
    this.moveCountText.setText(`Moves: ${this.state.moveCount}`);
    this.seedText.setText(`Seed: ${this.state.seed}`);
  }

  setTimerText(elapsedSeconds: number): void {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    this.timerText.setText(`${mm}:${ss}`);
  }
}
