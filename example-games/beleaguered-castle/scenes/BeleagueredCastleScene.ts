/**
 * BeleagueredCastleScene -- the main Phaser scene for Beleaguered Castle.
 *
 * Implements the static card layout (F4):
 *   - 4 foundation piles across the top (aces pre-placed)
 *   - 8 tableau columns below with vertical cascade overlap
 *   - Deal animation on scene start
 *   - HUD: move counter, timer, seed display
 *   - No player interaction yet (static layout only)
 */

import Phaser from 'phaser';
import type { Rank, Suit } from '../../../src/card-system/Card';
import type { BeleagueredCastleState } from '../BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT, FOUNDATION_SUITS } from '../BeleagueredCastleState';
import { deal } from '../BeleagueredCastleRules';

// ── Constants ───────────────────────────────────────────────

const CARD_W = 48;
const CARD_H = 65;
const CARD_GAP = 6;

const GAME_W = 800;
const GAME_H = 600;

const ANIM_DURATION = 300; // ms per card deal animation
const DEAL_STAGGER = 40; // ms between successive card deal tweens

/** Vertical overlap offset between cascaded cards in a tableau column. */
const CASCADE_OFFSET_Y = 18;

/** Top area: title + foundations */
const TITLE_Y = 14;
const FOUNDATION_Y = 55;

/** Tableau starts below the foundations. */
const TABLEAU_TOP_Y = 135;

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

// ── Scene ───────────────────────────────────────────────────

export class BeleagueredCastleScene extends Phaser.Scene {
  // Game state
  private gameState!: BeleagueredCastleState;
  private seed: number = Date.now();

  // Display objects -- foundations
  private foundationSprites: Phaser.GameObjects.Image[] = [];
  private foundationLabels: Phaser.GameObjects.Text[] = [];

  // Display objects -- tableau (array of arrays, one per column)
  private tableauSprites: Phaser.GameObjects.Image[][] = [];

  // Display objects -- HUD
  private moveCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;

  // Timer tracking
  private elapsedSeconds: number = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

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

    // Create static UI elements
    this.createTitle();
    this.createFoundationSlots();
    this.createHUD();

    // Render foundations (aces already placed)
    this.refreshFoundations();

    // Deal cards to tableau with animation
    this.dealTableauAnimated();

    // Start the timer
    this.startTimer();
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
    }
  }

  /**
   * Create the HUD: move counter, timer, and seed display.
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
            // After deal animation, set depth based on row so
            // later cards in the cascade overlap correctly
            sprite.setDepth(row);
          },
        });

        dealIndex++;
      }
    }
  }

  // ── Refresh display (for future use by interaction features) ──

  /**
   * Refresh the entire tableau display to match the current game state.
   * Destroys and re-creates sprites. Used after moves are applied.
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
   * Refresh the HUD (move counter, timer, seed).
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

  // ── Accessors (for future interaction features and tests) ──

  /** Get the current game state. */
  getGameState(): BeleagueredCastleState {
    return this.gameState;
  }

  /** Get the seed used for this game. */
  getSeed(): number {
    return this.seed;
  }

  /** Get the elapsed time in seconds. */
  getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  // ── Cleanup ─────────────────────────────────────────────

  shutdown(): void {
    if (this.timerEvent) {
      this.timerEvent.destroy();
      this.timerEvent = null;
    }
  }
}
