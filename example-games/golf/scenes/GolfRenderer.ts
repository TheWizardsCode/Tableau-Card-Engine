/**
 * GolfRenderer -- creates and refreshes all visual game objects for 9-Card Golf.
 */

import { scoreVisibleCards, scoreGrid } from '../GolfScoring';
import type { GolfSession } from '../GolfGame';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  getCardTexture,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import {
  GOLF_CARD_W, GOLF_CARD_H, CARD_GAP,
  GRID_COLS, GRID_ROWS,
  GRID_CENTER_Y, HUMAN_GRID_X, AI_GRID_X,
  PILE_X, STOCK_Y, DISCARD_Y,
} from './GolfConstants';

export class GolfRenderer {
  // Display objects -- grids
  humanCardSprites: Phaser.GameObjects.Image[] = [];
  aiCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- piles
  stockSprite!: Phaser.GameObjects.Image;
  discardSprite!: Phaser.GameObjects.Image;
  drawnCardSprite: Phaser.GameObjects.Image | null = null;

  // Display objects -- UI
  turnText!: Phaser.GameObjects.Text;
  humanScoreText!: Phaser.GameObjects.Text;
  aiScoreText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;
  humanLabel!: Phaser.GameObjects.Text;
  aiLabel!: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private session: GolfSession,
    private replayMode: boolean,
  ) {}

  // ── UI creation ─────────────────────────────────────────

  createLabels(): void {
    // Menu button (top-left) -- returns to game selector
    if (!this.replayMode) {
      createSceneMenuButton(this.scene);
    }

    createSceneTitle(this.scene, '9-Card Golf');

    // Player labels above each grid
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    this.humanLabel = this.scene.add
      .text(HUMAN_GRID_X, GRID_CENTER_Y - gridH / 2 - 24, 'You', {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.aiLabel = this.scene.add
      .text(AI_GRID_X, GRID_CENTER_Y - gridH / 2 - 24, 'AI', {
        fontSize: '24px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  createPiles(
    onStockClick: () => void,
    onDiscardClick: () => void,
  ): void {
    // Stock pile (upper center)
    this.stockSprite = this.scene.add.image(PILE_X, STOCK_Y, 'card_back');
    if (!this.replayMode) {
      this.stockSprite.setInteractive({ useHandCursor: true });
      this.stockSprite.on('pointerdown', onStockClick);
    }

    this.scene.add
      .text(PILE_X, STOCK_Y + GOLF_CARD_H / 2 + 16, 'Stock', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Discard pile (lower center)
    this.discardSprite = this.scene.add.image(PILE_X, DISCARD_Y, 'card_back');
    if (!this.replayMode) {
      this.discardSprite.setInteractive({ useHandCursor: true });
      this.discardSprite.on('pointerdown', onDiscardClick);
    }

    this.scene.add
      .text(PILE_X, DISCARD_Y + GOLF_CARD_H / 2 + 16, 'Discard', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  createGrids(onHumanCardClick: (index: number) => void): void {
    // Human grid (bottom)
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.gridCellPosition(i, 'human');
      const sprite = this.scene.add.image(x, y, 'card_back');
      if (!this.replayMode) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => onHumanCardClick(i));
      }
      this.humanCardSprites.push(sprite);
    }

    // AI grid (top)
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.gridCellPosition(i, 'ai');
      const sprite = this.scene.add.image(x, y, 'card_back');
      this.aiCardSprites.push(sprite);
    }
  }

  createScoreDisplay(): void {
    // Scores below each grid
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    this.humanScoreText = this.scene.add
      .text(HUMAN_GRID_X, GRID_CENTER_Y + gridH / 2 + 24, 'Score: 0', {
        fontSize: '22px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.aiScoreText = this.scene.add
      .text(AI_GRID_X, GRID_CENTER_Y + gridH / 2 + 24, 'Score: 0', {
        fontSize: '22px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Turn indicator above the stock pile in center
    this.turnText = this.scene.add
      .text(PILE_X, STOCK_Y - GOLF_CARD_H / 2 - 24, '', {
        fontSize: '20px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  createInstructions(): void {
    this.instructionText = this.scene.add
      .text(GAME_W / 2, GAME_H - 18, '', {
        fontSize: '18px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  // ── Grid layout helpers ─────────────────────────────────

  gridCellPosition(
    index: number,
    player: 'human' | 'ai',
  ): { x: number; y: number } {
    const row = Math.floor(index / GRID_COLS);
    const col = index % GRID_COLS;

    const gridW = GRID_COLS * GOLF_CARD_W + (GRID_COLS - 1) * CARD_GAP;
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    const centerX = player === 'human' ? HUMAN_GRID_X : AI_GRID_X;
    const startX = centerX - gridW / 2 + GOLF_CARD_W / 2;
    const startY = GRID_CENTER_Y - gridH / 2 + GOLF_CARD_H / 2;

    return {
      x: startX + col * (GOLF_CARD_W + CARD_GAP),
      y: startY + row * (GOLF_CARD_H + CARD_GAP),
    };
  }

  // ── Refresh display ─────────────────────────────────────

  refreshAll(): void {
    this.refreshGrid('human');
    this.refreshGrid('ai');
    this.refreshPiles();
    this.refreshScores();
    this.refreshTurnIndicator();
  }

  refreshGrid(player: 'human' | 'ai'): void {
    const playerIdx = player === 'human' ? 0 : 1;
    const grid = this.session.gameState.playerStates[playerIdx].grid;
    const sprites = player === 'human' ? this.humanCardSprites : this.aiCardSprites;

    for (let i = 0; i < 9; i++) {
      sprites[i].setTexture(getCardTexture(grid[i]));
    }
  }

  refreshPiles(): void {
    // Stock: always shows card_back (or nothing if empty)
    if (this.session.shared.stockPile.length > 0) {
      this.stockSprite.setVisible(true);
      this.stockSprite.setTexture('card_back');
      this.stockSprite.setAlpha(1);
    } else {
      this.stockSprite.setVisible(false);
    }

    // Discard: shows top card face-up, or a dimmed placeholder when empty
    const top = this.session.shared.discardPile.peek();
    if (top) {
      this.discardSprite.setVisible(true);
      this.discardSprite.setTexture(getCardTexture(top));
      this.discardSprite.setAlpha(1);
    } else if (this.replayMode) {
      this.discardSprite.setVisible(false);
    } else {
      this.showDiscardPlaceholder();
    }
  }

  /** Show a dimmed card-back as an empty-pile placeholder so the discard
   *  area remains visible and clickable even when no cards are on it. */
  showDiscardPlaceholder(): void {
    this.discardSprite.setVisible(true);
    this.discardSprite.setTexture('card_back');
    this.discardSprite.setAlpha(0.25);
  }

  refreshScores(): void {
    const humanGrid = this.session.gameState.playerStates[0].grid;
    const aiGrid = this.session.gameState.playerStates[1].grid;

    const humanVisible = scoreVisibleCards(humanGrid);
    const aiVisible = scoreVisibleCards(aiGrid);

    if (this.session.gameState.phase === 'ended') {
      const humanFinal = scoreGrid(humanGrid);
      const aiFinal = scoreGrid(aiGrid);
      this.humanScoreText.setText(`Score: ${humanFinal}`);
      this.aiScoreText.setText(`Score: ${aiFinal}`);
    } else {
      this.humanScoreText.setText(`Score: ${humanVisible}`);
      this.aiScoreText.setText(`Score: ${aiVisible}`);
    }
  }

  refreshTurnIndicator(): void {
    if (this.session.gameState.phase === 'ended') {
      this.turnText.setText('Round Over!');
      return;
    }

    const currentIdx = this.session.gameState.currentPlayerIndex;
    const name = this.session.gameState.players[currentIdx].name;
    this.turnText.setText(`${name}'s turn`);

    // Highlight active player label
    if (currentIdx === 0) {
      this.humanLabel.setColor('#ffdd44');
      this.aiLabel.setColor('#cccccc');
    } else {
      this.humanLabel.setColor('#ffffff');
      this.aiLabel.setColor('#ffdd44');
    }
  }

  // ── Cleanup helpers ─────────────────────────────────────

  clearSprites(): void {
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.drawnCardSprite = null;
  }

  setDrawnCardSprite(sprite: Phaser.GameObjects.Image | null): void {
    this.drawnCardSprite = sprite;
  }

  hideDrawnCard(): void {
    if (this.drawnCardSprite) {
      this.drawnCardSprite.destroy();
      this.drawnCardSprite = null;
    }
  }

  get gridCellPos() {
    return this.gridCellPosition.bind(this);
  }
}
