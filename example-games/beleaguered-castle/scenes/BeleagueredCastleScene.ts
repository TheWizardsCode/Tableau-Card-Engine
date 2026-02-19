/**
 * BeleagueredCastleScene -- the main Phaser scene for Beleaguered Castle.
 *
 * Features:
 *   - 4 foundation piles across the top (aces pre-placed)
 *   - 8 tableau columns below with vertical cascade overlap
 *   - Deal animation on scene start
 *   - HUD: move counter, timer, seed display
 *   - Drag-and-drop card interaction with visual feedback
 *   - Undo/Redo via keyboard (Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z)
 *   - Each move recorded as a Command in UndoRedoManager
 */

import Phaser from 'phaser';
import type { Rank, Suit } from '../../../src/card-system/Card';
import type { BeleagueredCastleState, BCMove } from '../BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT, FOUNDATION_SUITS } from '../BeleagueredCastleState';
import {
  deal,
  applyMove,
  undoMove,
  isLegalFoundationMove,
  isLegalTableauMove,
  getLegalMoves,
} from '../BeleagueredCastleRules';
import type { Command } from '../../../src/core-engine/UndoRedoManager';
import { UndoRedoManager } from '../../../src/core-engine/UndoRedoManager';

// ── Constants ───────────────────────────────────────────────

const CARD_W = 48;
const CARD_H = 65;
const CARD_GAP = 6;

const GAME_W = 800;
const GAME_H = 600;

const ANIM_DURATION = 300; // ms per card deal animation
const DEAL_STAGGER = 40; // ms between successive card deal tweens
const SNAP_BACK_DURATION = 200; // ms to snap card back on invalid drop

/** Vertical overlap offset between cascaded cards in a tableau column. */
const CASCADE_OFFSET_Y = 18;

/** Top area: title + foundations */
const TITLE_Y = 14;
const FOUNDATION_Y = 55;

/** Tableau starts below the foundations. */
const TABLEAU_TOP_Y = 135;

/** Z-depth for a card being dragged. */
const DRAG_DEPTH = 1000;

const FONT_FAMILY = 'Arial, sans-serif';

// ── Suit symbol mapping for foundation labels ───────────────

const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '\u2663',    // ♣
  diamonds: '\u2666', // ♦
  hearts: '\u2665',   // ♥
  spades: '\u2660',   // ♠
};

const SUIT_COLOR: Record<Suit, string> = {
  clubs: '#ffffff',
  diamonds: '#ff4444',
  hearts: '#ff4444',
  spades: '#ffffff',
};

// ── Highlight colours ───────────────────────────────────────

const HIGHLIGHT_VALID = 0x44ff44;
const HIGHLIGHT_ALPHA = 0.3;

// ── MoveCommand ─────────────────────────────────────────────

/**
 * A reversible command that applies or undoes a single BCMove.
 * Used by the UndoRedoManager to support undo/redo.
 */
class MoveCommand implements Command {
  readonly description: string;

  constructor(
    private readonly state: BeleagueredCastleState,
    private readonly move: BCMove,
  ) {
    this.description =
      move.kind === 'tableau-to-foundation'
        ? `Move column ${move.fromCol} -> foundation ${move.toFoundation}`
        : `Move column ${move.fromCol} -> column ${move.toCol}`;
  }

  execute(): void {
    applyMove(this.state, this.move);
  }

  undo(): void {
    undoMove(this.state, this.move);
  }
}

// ── Custom data attached to draggable card sprites ──────────

interface CardSpriteData {
  /** Tableau column index this card belongs to. */
  colIndex: number;
  /** Row index within the column (0 = bottom). */
  rowIndex: number;
  /** Original x position before drag. */
  originX: number;
  /** Original y position before drag. */
  originY: number;
  /** Original depth before drag. */
  originDepth: number;
}

// ── Scene ───────────────────────────────────────────────────

export class BeleagueredCastleScene extends Phaser.Scene {
  // Game state
  private gameState!: BeleagueredCastleState;
  private seed: number = Date.now();
  private undoManager!: UndoRedoManager;

  // Whether the deal animation has finished (interactions blocked until then)
  private dealComplete: boolean = false;

  // Display objects -- foundations
  private foundationSprites: Phaser.GameObjects.Image[] = [];
  private foundationLabels: Phaser.GameObjects.Text[] = [];
  private foundationDropZones: Phaser.GameObjects.Zone[] = [];

  // Display objects -- tableau (array of arrays, one per column)
  private tableauSprites: Phaser.GameObjects.Image[][] = [];
  private tableauDropZones: Phaser.GameObjects.Zone[] = [];

  // Highlight rectangles for valid drop targets
  private highlightRects: Phaser.GameObjects.Rectangle[] = [];

  // Display objects -- HUD
  private moveCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;
  private undoButton!: Phaser.GameObjects.Text;
  private redoButton!: Phaser.GameObjects.Text;

  // Timer tracking
  private elapsedSeconds: number = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private timerStarted: boolean = false;

  constructor() {
    super({ key: 'BeleagueredCastleScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    // Load card back
    this.load.svg('card_back', 'assets/cards/card_back.svg', {
      width: CARD_W,
      height: CARD_H,
    });

    // Load all 52 card faces
    const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
    const ranks: Rank[] = [
      'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
    ];

    for (const suit of suits) {
      for (const rank of ranks) {
        const key = this.cardTextureKey(rank, suit);
        const fileName = this.cardFileName(rank, suit);
        this.load.svg(key, `assets/cards/${fileName}`, {
          width: CARD_W,
          height: CARD_H,
        });
      }
    }
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    // Parse seed from URL query parameter, or use current timestamp
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.seed = seedParam ? parseInt(seedParam, 10) : Date.now();

    // Deal the game
    this.gameState = deal(this.seed);
    this.undoManager = new UndoRedoManager();
    this.dealComplete = false;
    this.timerStarted = false;

    // Create static UI elements
    this.createTitle();
    this.createFoundationSlots();
    this.createTableauDropZones();
    this.createHUD();

    // Render foundations (aces already placed)
    this.refreshFoundations();

    // Deal cards to tableau with animation
    this.dealTableauAnimated();

    // Setup drag-and-drop event handlers
    this.setupDragAndDrop();

    // Setup keyboard shortcuts
    this.setupKeyboard();
  }

  // ── UI creation ─────────────────────────────────────────

  private createTitle(): void {
    this.add
      .text(GAME_W / 2, TITLE_Y, 'Beleaguered Castle', {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  /**
   * Create the 4 foundation slots across the top.
   * Each slot shows the suit symbol and the current top card (ace initially).
   * Also creates drop zones for drag-and-drop.
   */
  private createFoundationSlots(): void {
    const totalW =
      FOUNDATION_COUNT * CARD_W + (FOUNDATION_COUNT - 1) * (CARD_GAP + 12);
    const startX = (GAME_W - totalW) / 2 + CARD_W / 2;

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const x = startX + i * (CARD_W + CARD_GAP + 12);
      const suit = FOUNDATION_SUITS[i];

      // Empty slot background (rounded rect outline)
      const slotGraphics = this.add.graphics();
      slotGraphics.lineStyle(1, 0x448844, 0.6);
      slotGraphics.strokeRoundedRect(
        x - CARD_W / 2,
        FOUNDATION_Y - CARD_H / 2,
        CARD_W,
        CARD_H,
        4,
      );

      // Suit label beneath the slot
      const label = this.add
        .text(x, FOUNDATION_Y + CARD_H / 2 + 8, SUIT_SYMBOL[suit], {
          fontSize: '14px',
          color: SUIT_COLOR[suit],
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.foundationLabels.push(label);

      // Card sprite (will show ace on initial render)
      const sprite = this.add
        .image(x, FOUNDATION_Y, 'card_back')
        .setVisible(false);
      this.foundationSprites.push(sprite);

      // Drop zone for this foundation
      const zone = this.add
        .zone(x, FOUNDATION_Y, CARD_W, CARD_H)
        .setRectangleDropZone(CARD_W, CARD_H)
        .setData('type', 'foundation')
        .setData('index', i);
      this.foundationDropZones.push(zone);
    }
  }

  /**
   * Create drop zones for each tableau column.
   * The drop zone covers the full column area.
   */
  private createTableauDropZones(): void {
    // Maximum column height: 13 cards * CASCADE_OFFSET_Y + CARD_H
    const maxColHeight = 13 * CASCADE_OFFSET_Y + CARD_H;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const x = this.tableauColumnX(col);
      const zoneCenterY = TABLEAU_TOP_Y + maxColHeight / 2 - CARD_H / 2;

      const zone = this.add
        .zone(x, zoneCenterY, CARD_W + 4, maxColHeight)
        .setRectangleDropZone(CARD_W + 4, maxColHeight)
        .setData('type', 'tableau')
        .setData('index', col);
      this.tableauDropZones.push(zone);
    }
  }

  /**
   * Create the HUD: move counter, timer, seed display, undo/redo buttons.
   */
  private createHUD(): void {
    // Move counter (bottom-left)
    this.moveCountText = this.add
      .text(15, GAME_H - 20, 'Moves: 0', {
        fontSize: '12px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0.5);

    // Timer (bottom-center)
    this.timerText = this.add
      .text(GAME_W / 2, GAME_H - 20, '00:00', {
        fontSize: '12px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0.5);

    // Seed display (bottom-right)
    this.seedText = this.add
      .text(GAME_W - 15, GAME_H - 20, `Seed: ${this.seed}`, {
        fontSize: '12px',
        color: '#668866',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);

    // Undo button
    this.undoButton = this.add
      .text(GAME_W - 90, TITLE_Y, '[ Undo ]', {
        fontSize: '12px',
        color: '#557755',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.performUndo())
      .on('pointerover', () => {
        if (this.undoManager.canUndo()) this.undoButton.setColor('#88ff88');
      })
      .on('pointerout', () => this.refreshUndoRedoButtons());

    // Redo button
    this.redoButton = this.add
      .text(GAME_W - 30, TITLE_Y, '[ Redo ]', {
        fontSize: '12px',
        color: '#557755',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.performRedo())
      .on('pointerover', () => {
        if (this.undoManager.canRedo()) this.redoButton.setColor('#88ff88');
      })
      .on('pointerout', () => this.refreshUndoRedoButtons());
  }

  // ── Drag and Drop ───────────────────────────────────────

  /**
   * Setup scene-level drag-and-drop event handlers.
   */
  private setupDragAndDrop(): void {
    this.input.on(
      'dragstart',
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image) => {
        if (!this.dealComplete) return;
        const data = gameObject.getData('cardData') as CardSpriteData | undefined;
        if (!data) return;

        // Save origin position and depth
        data.originX = gameObject.x;
        data.originY = gameObject.y;
        data.originDepth = gameObject.depth;

        // Raise card above everything during drag
        gameObject.setDepth(DRAG_DEPTH);

        // Show valid drop target highlights
        this.showValidDropHighlights(data.colIndex);
      },
    );

    this.input.on(
      'drag',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.Image,
        dragX: number,
        dragY: number,
      ) => {
        if (!this.dealComplete) return;
        gameObject.x = dragX;
        gameObject.y = dragY;
      },
    );

    this.input.on(
      'dragend',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.Image,
        dropped: boolean,
      ) => {
        if (!this.dealComplete) return;

        // Clear highlights
        this.clearDropHighlights();

        if (!dropped) {
          // Snap back to origin
          this.snapBack(gameObject);
        }
      },
    );

    this.input.on(
      'drop',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.Image,
        dropZone: Phaser.GameObjects.Zone,
      ) => {
        if (!this.dealComplete) return;
        this.handleDrop(gameObject, dropZone);
      },
    );
  }

  /**
   * Handle a card drop on a drop zone.
   */
  private handleDrop(
    sprite: Phaser.GameObjects.Image,
    zone: Phaser.GameObjects.Zone,
  ): void {
    const data = sprite.getData('cardData') as CardSpriteData | undefined;
    if (!data) {
      this.snapBack(sprite);
      return;
    }

    const fromCol = data.colIndex;
    const zoneType = zone.getData('type') as string;
    const zoneIndex = zone.getData('index') as number;

    let move: BCMove | null = null;

    if (zoneType === 'foundation') {
      if (isLegalFoundationMove(this.gameState, fromCol, zoneIndex)) {
        move = {
          kind: 'tableau-to-foundation',
          fromCol,
          toFoundation: zoneIndex,
        };
      }
    } else if (zoneType === 'tableau') {
      if (zoneIndex !== fromCol && isLegalTableauMove(this.gameState, fromCol, zoneIndex)) {
        move = {
          kind: 'tableau-to-tableau',
          fromCol,
          toCol: zoneIndex,
        };
      }
    }

    if (move) {
      // Execute the move via undo manager
      const cmd = new MoveCommand(this.gameState, move);
      this.undoManager.execute(cmd);

      // Start timer on first move
      if (!this.timerStarted) {
        this.timerStarted = true;
        this.startTimer();
      }

      // Refresh everything
      this.refreshAll();
    } else {
      // Invalid drop: snap back
      this.snapBack(sprite);
    }
  }

  /**
   * Snap a card sprite back to its original position.
   */
  private snapBack(sprite: Phaser.GameObjects.Image): void {
    const data = sprite.getData('cardData') as CardSpriteData | undefined;
    if (!data) return;

    this.tweens.add({
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

  /**
   * Show green highlight rectangles on valid drop targets for the given source column.
   */
  private showValidDropHighlights(fromCol: number): void {
    this.clearDropHighlights();

    const legalMoves = getLegalMoves(this.gameState);

    // Filter to moves originating from the dragged column
    const relevantMoves = legalMoves.filter((m) => m.fromCol === fromCol);

    for (const move of relevantMoves) {
      if (move.kind === 'tableau-to-foundation') {
        // Highlight the foundation slot
        const fSprite = this.foundationSprites[move.toFoundation];
        const rect = this.add
          .rectangle(
            fSprite.x,
            fSprite.y,
            CARD_W + 4,
            CARD_H + 4,
            HIGHLIGHT_VALID,
            HIGHLIGHT_ALPHA,
          )
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      } else if (move.kind === 'tableau-to-tableau') {
        // Highlight the destination column (at the drop position)
        const col = move.toCol;
        const cards = this.gameState.tableau[col].toArray();
        const dropY = cards.length > 0
          ? this.tableauCardY(cards.length - 1)
          : this.tableauCardY(0);
        const x = this.tableauColumnX(col);

        const rect = this.add
          .rectangle(
            x,
            dropY,
            CARD_W + 4,
            CARD_H + 4,
            HIGHLIGHT_VALID,
            HIGHLIGHT_ALPHA,
          )
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      }
    }
  }

  /**
   * Remove all drop target highlight rectangles.
   */
  private clearDropHighlights(): void {
    for (const rect of this.highlightRects) {
      rect.destroy();
    }
    this.highlightRects = [];
  }

  // ── Undo / Redo ─────────────────────────────────────────

  private setupKeyboard(): void {
    if (!this.input.keyboard) return;

    this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
      // Ctrl+Z = undo, Ctrl+Shift+Z or Ctrl+Y = redo
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z' && !event.shiftKey) {
          event.preventDefault();
          this.performUndo();
        } else if (
          event.key === 'y' ||
          (event.key === 'z' && event.shiftKey) ||
          (event.key === 'Z' && event.shiftKey)
        ) {
          event.preventDefault();
          this.performRedo();
        }
      }
    });
  }

  private performUndo(): void {
    if (!this.dealComplete) return;
    if (!this.undoManager.canUndo()) return;

    this.undoManager.undo();
    this.refreshAll();
  }

  private performRedo(): void {
    if (!this.dealComplete) return;
    if (!this.undoManager.canRedo()) return;

    this.undoManager.redo();
    this.refreshAll();
  }

  private refreshUndoRedoButtons(): void {
    this.undoButton.setColor(this.undoManager.canUndo() ? '#aaccaa' : '#557755');
    this.redoButton.setColor(this.undoManager.canRedo() ? '#aaccaa' : '#557755');
  }

  // ── Foundation rendering ────────────────────────────────

  private refreshFoundations(): void {
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const foundation = this.gameState.foundations[i];
      const topCard = foundation.peek();

      if (topCard) {
        const texture = this.cardTextureKey(topCard.rank, topCard.suit);
        this.foundationSprites[i].setTexture(texture).setVisible(true);
      } else {
        this.foundationSprites[i].setVisible(false);
      }
    }
  }

  // ── Tableau layout ──────────────────────────────────────

  /**
   * Calculate the x position for a tableau column.
   * 8 columns are evenly distributed across the game width.
   */
  private tableauColumnX(colIndex: number): number {
    const totalW =
      TABLEAU_COUNT * CARD_W + (TABLEAU_COUNT - 1) * CARD_GAP;
    const startX = (GAME_W - totalW) / 2 + CARD_W / 2;
    return startX + colIndex * (CARD_W + CARD_GAP);
  }

  /**
   * Calculate the y position for a card at a given row within a tableau column.
   */
  private tableauCardY(rowIndex: number): number {
    return TABLEAU_TOP_Y + rowIndex * CASCADE_OFFSET_Y;
  }

  /**
   * Animate dealing cards to the 8 tableau columns.
   * Cards fly from the center of the screen to their final positions.
   * When the animation completes, cards are made interactive/draggable.
   */
  private dealTableauAnimated(): void {
    const centerX = GAME_W / 2;
    const centerY = GAME_H / 2;

    // Initialise the sprite arrays
    this.tableauSprites = [];
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      this.tableauSprites.push([]);
    }

    let dealIndex = 0;
    let totalCards = 0;

    // Count total cards first
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      totalCards += this.gameState.tableau[col].size();
    }

    let completedCount = 0;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards = this.gameState.tableau[col].toArray();

      for (let row = 0; row < cards.length; row++) {
        const card = cards[row];
        const targetX = this.tableauColumnX(col);
        const targetY = this.tableauCardY(row);
        const texture = this.cardTextureKey(card.rank, card.suit);

        // Create the sprite at the deal origin (center), invisible initially
        const sprite = this.add
          .image(centerX, centerY, texture)
          .setAlpha(0)
          .setDepth(dealIndex); // later cards on top during animation

        this.tableauSprites[col].push(sprite);

        // Stagger the animation for each card
        const delay = dealIndex * DEAL_STAGGER;
        this.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          alpha: 1,
          duration: ANIM_DURATION,
          delay,
          ease: 'Power2',
          onComplete: () => {
            // After deal animation, set depth based on row
            sprite.setDepth(row);
            completedCount++;

            // When all cards are dealt, enable interaction
            if (completedCount >= totalCards) {
              this.onDealComplete();
            }
          },
        });

        dealIndex++;
      }
    }

    // Handle edge case: if no cards to deal (shouldn't happen in normal play)
    if (totalCards === 0) {
      this.onDealComplete();
    }
  }

  /**
   * Called when the deal animation finishes.
   * Makes top cards draggable and enables interaction.
   */
  private onDealComplete(): void {
    this.dealComplete = true;
    this.makeDraggable();
    this.refreshUndoRedoButtons();
  }

  /**
   * Make the top card of each non-empty tableau column draggable.
   * Clears previous draggable state first.
   */
  private makeDraggable(): void {
    // Disable all existing interactive/draggable states
    for (const col of this.tableauSprites) {
      for (const sprite of col) {
        sprite.disableInteractive();
      }
    }

    // Enable drag only on top cards
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const colSprites = this.tableauSprites[col];
      if (colSprites.length === 0) continue;

      const topSprite = colSprites[colSprites.length - 1];
      const rowIndex = colSprites.length - 1;

      topSprite.setInteractive({ useHandCursor: true, draggable: true });

      // Attach metadata for drag handlers
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

  // ── Refresh display ─────────────────────────────────────

  /**
   * Refresh everything: foundations, tableau, HUD, draggable state.
   */
  private refreshAll(): void {
    this.refreshFoundations();
    this.refreshTableau();
    this.refreshHUD();
    this.refreshUndoRedoButtons();
    this.makeDraggable();
  }

  /**
   * Refresh the entire tableau display to match the current game state.
   * Destroys and re-creates sprites.
   */
  refreshTableau(): void {
    // Destroy existing sprites
    for (const col of this.tableauSprites) {
      for (const sprite of col) {
        sprite.destroy();
      }
    }
    this.tableauSprites = [];

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const sprites: Phaser.GameObjects.Image[] = [];
      const cards = this.gameState.tableau[col].toArray();

      for (let row = 0; row < cards.length; row++) {
        const card = cards[row];
        const x = this.tableauColumnX(col);
        const y = this.tableauCardY(row);
        const texture = this.cardTextureKey(card.rank, card.suit);

        const sprite = this.add
          .image(x, y, texture)
          .setDepth(row);
        sprites.push(sprite);
      }

      this.tableauSprites.push(sprites);
    }
  }

  /**
   * Refresh the HUD (move counter, timer, seed, undo/redo).
   */
  refreshHUD(): void {
    this.moveCountText.setText(`Moves: ${this.gameState.moveCount}`);
    this.seedText.setText(`Seed: ${this.gameState.seed}`);
  }

  // ── Timer ───────────────────────────────────────────────

  private startTimer(): void {
    this.elapsedSeconds = 0;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.updateTimer,
      callbackScope: this,
      loop: true,
    });
  }

  private updateTimer(): void {
    this.elapsedSeconds++;
    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = this.elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    this.timerText.setText(`${mm}:${ss}`);
  }

  // ── Texture helpers ─────────────────────────────────────

  private cardTextureKey(rank: Rank, suit: Suit): string {
    const rankName = this.rankFileName(rank);
    return `${rankName}_of_${suit}`;
  }

  private cardFileName(rank: Rank, suit: Suit): string {
    return `${this.rankFileName(rank)}_of_${suit}.svg`;
  }

  private rankFileName(rank: Rank): string {
    switch (rank) {
      case 'A': return 'ace';
      case 'J': return 'jack';
      case 'Q': return 'queen';
      case 'K': return 'king';
      default: return rank; // 2-10
    }
  }

  // ── Accessors (for tests and future features) ──────────

  /** Get the current game state. */
  getGameState(): BeleagueredCastleState {
    return this.gameState;
  }

  /** Get the UndoRedoManager. */
  getUndoManager(): UndoRedoManager {
    return this.undoManager;
  }

  /** Get the seed used for this game. */
  getSeed(): number {
    return this.seed;
  }

  /** Get the elapsed time in seconds. */
  getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  /** Whether the deal animation has completed. */
  isDealComplete(): boolean {
    return this.dealComplete;
  }

  // ── Cleanup ─────────────────────────────────────────────

  shutdown(): void {
    if (this.timerEvent) {
      this.timerEvent.destroy();
      this.timerEvent = null;
    }
    this.clearDropHighlights();
  }
}
